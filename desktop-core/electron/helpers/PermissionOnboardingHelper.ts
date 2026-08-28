import { app, BrowserWindow, desktopCapturer, session, shell, systemPreferences } from 'electron';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { ConfigHelper } from '../ConfigHelper';
import { requestScreenCaptureAccess } from './MacCapturePermissions';
import {
  isPermissionTrackUsable,
  getMacTccResetArguments,
  MAC_PERMISSION_FLOW_VERSION,
  MAC_PERMISSION_MIGRATION_VERSION,
  shouldRunMacPermissionMigration,
  type PermissionAuthorizationPhase,
  type PermissionCapabilityStatus,
  type PermissionMigrationStatus,
  type PermissionOnboardingState,
} from '../../shared/reliability';

const execFileAsync = promisify(execFile);

interface MediaProbeResult {
  trackReady: boolean;
  level: number;
  error?: string;
}

function macStatus(value: string): PermissionCapabilityStatus {
  if (value === 'granted') return 'granted';
  if (value === 'denied') return 'denied';
  if (value === 'restricted') return 'restricted';
  return 'not-determined';
}

function isProbeResult(value: unknown): value is MediaProbeResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.trackReady === 'boolean' && typeof record.level === 'number';
}

function safeErrorCode(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const code = 'code' in error ? String(error.code) : '';
  return code && /^[A-Z0-9_-]{1,40}$/i.test(code) ? `${fallback}_${code.toUpperCase()}` : fallback;
}

export class PermissionOnboardingHelper {
  private migrationStatus: PermissionMigrationStatus | null = null;
  private authorizationPhase: PermissionAuthorizationPhase = 'idle';
  private requiresRestart = false;
  private errorCode: string | undefined;
  private currentSigningIdentity: string | undefined;
  private authorizationInFlight: Promise<PermissionOnboardingState> | null = null;

  constructor(private configHelper: ConfigHelper) {}

  async prepareLegacyMigration(): Promise<PermissionOnboardingState> {
    if (process.platform !== 'darwin') return this.getState();
    await this.loadCurrentSigningIdentity();
    const status = this.resolveMigrationStatus();
    if (status !== 'required' && status !== 'failed') return this.getState();

    this.migrationStatus = 'running';
    this.authorizationPhase = 'migrating';
    this.errorCode = undefined;
    try {
      // Reset only QuizMate. Never fall back to `tccutil reset All` without a
      // bundle id because that would destroy permissions belonging to others.
      await execFileAsync('/usr/bin/tccutil', getMacTccResetArguments(), {
        timeout: 15_000,
        windowsHide: true,
      });
      this.configHelper.resetPermissionOnboardingStates();
      this.configHelper.setMacPermissionMigration({
        version: MAC_PERMISSION_MIGRATION_VERSION,
        status: 'completed',
        appVersion: app.getVersion(),
        updatedAt: Date.now(),
        signingIdentity: this.currentSigningIdentity,
      });
      this.migrationStatus = 'completed';
      this.authorizationPhase = 'idle';
      return this.getState();
    } catch (error) {
      this.errorCode = safeErrorCode(error, 'TCC_RESET_FAILED');
      this.configHelper.setMacPermissionMigration({
        version: MAC_PERMISSION_MIGRATION_VERSION,
        status: 'failed',
        appVersion: app.getVersion(),
        updatedAt: Date.now(),
        signingIdentity: this.currentSigningIdentity,
        errorCode: this.errorCode,
      });
      this.migrationStatus = 'failed';
      this.authorizationPhase = 'failed';
      console.warn('[PermissionOnboarding] QuizMate-only TCC migration failed:', this.errorCode);
      return this.getState();
    }
  }

  getState(): PermissionOnboardingState {
    if (process.platform !== 'darwin') {
      return {
        flowVersion: MAC_PERMISSION_FLOW_VERSION,
        completed: true,
        skipped: false,
        platform: process.platform,
        microphone: 'granted',
        screen: 'granted',
        systemAudio: 'unavailable',
        migrationStatus: 'not-required',
        authorizationPhase: 'complete',
      };
    }
    const stored = this.configHelper.getPermissionOnboardingState();
    const microphone = macStatus(systemPreferences.getMediaAccessStatus('microphone'));
    const screen = macStatus(systemPreferences.getMediaAccessStatus('screen'));
    const migrationStatus = this.resolveMigrationStatus();
    const microphoneStatus = microphone === 'granted' && isPermissionTrackUsable(stored?.microphone ?? 'not-determined')
      ? stored!.microphone
      : microphone;
    const screenStatus = screen === 'granted' && stored?.screen === 'verified' ? 'verified' : screen;
    const systemAudioStatus = stored?.systemAudio ?? 'not-determined';
    const migrationReady = migrationStatus === 'completed' || migrationStatus === 'not-required';
    const storedRestartStillRequired = stored?.requiresRestart === true && screen !== 'granted';
    const effectiveRequiresRestart = this.requiresRestart || storedRestartStillRequired;
    const storedAuthorizationPhase = stored?.authorizationPhase === 'restart-required' && !effectiveRequiresRestart
      ? 'waiting-settings'
      : (stored?.authorizationPhase ?? 'idle');
    const permissionsReady = isPermissionTrackUsable(microphoneStatus)
      && screenStatus === 'verified'
      && isPermissionTrackUsable(systemAudioStatus);
    return {
      flowVersion: MAC_PERMISSION_FLOW_VERSION,
      completed: stored?.flowVersion === MAC_PERMISSION_FLOW_VERSION
        && stored.completed === true
        && migrationReady
        && permissionsReady,
      skipped: stored?.skipped === true,
      platform: process.platform,
      microphone: microphoneStatus,
      screen: screenStatus,
      systemAudio: systemAudioStatus,
      migrationStatus,
      authorizationPhase: this.authorizationPhase === 'idle'
        ? storedAuthorizationPhase
        : this.authorizationPhase,
      requiresRestart: effectiveRequiresRestart,
      errorCode: this.errorCode ?? stored?.errorCode,
      microphoneLevel: stored?.microphoneLevel,
      systemAudioLevel: stored?.systemAudioLevel,
      updatedAt: stored?.updatedAt,
    };
  }

  async authorizeAll(): Promise<PermissionOnboardingState> {
    if (this.authorizationInFlight) return this.authorizationInFlight;
    this.authorizationInFlight = this.runUnifiedAuthorization().finally(() => {
      this.authorizationInFlight = null;
    });
    return this.authorizationInFlight;
  }

  async requestMicrophone(): Promise<PermissionOnboardingState> {
    if (process.platform !== 'darwin') return this.getState();
    try {
      await systemPreferences.askForMediaAccess('microphone');
    } catch {
      // The OS query and real track probe below remain authoritative.
    }
    const state = this.getState();
    if (state.microphone !== 'granted' && state.microphone !== 'verified' && state.microphone !== 'track-ready') return state;
    const probe = await this.runMediaProbe('microphone');
    return this.persist({
      ...state,
      microphone: probe.trackReady ? (probe.level > 0.003 ? 'verified' : 'track-ready') : 'denied',
      microphoneLevel: probe.level,
      errorCode: probe.trackReady ? undefined : 'MICROPHONE_TRACK_UNAVAILABLE',
    });
  }

  async requestScreen(): Promise<PermissionOnboardingState> {
    if (process.platform !== 'darwin') return this.getState();
    requestScreenCaptureAccess();
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 96, height: 96 } });
      const state = this.getState();
      const valid = sources.some((source) => {
        if (source.thumbnail.isEmpty() || source.thumbnail.getSize().width <= 1) return false;
        const bitmap = source.thumbnail.toBitmap();
        for (let index = 0; index < bitmap.length; index += 16) {
          if (bitmap[index] !== 0 || bitmap[index + 1] !== 0 || bitmap[index + 2] !== 0) return true;
        }
        return false;
      });
      return this.persist({
        ...state,
        screen: valid ? 'verified' : state.screen,
        errorCode: valid ? undefined : 'SCREEN_CAPTURE_NOT_VERIFIED',
      });
    } catch {
      return this.persist({ ...this.getState(), errorCode: 'SCREEN_CAPTURE_REQUEST_FAILED' });
    }
  }

  async testSystemAudio(): Promise<PermissionOnboardingState> {
    if (process.platform !== 'darwin') return this.getState();
    const state = this.getState();
    const probe = await this.runMediaProbe('system');
    return this.persist({
      ...state,
      systemAudio: probe.trackReady ? (probe.level > 0.003 ? 'verified' : 'track-ready') : 'unavailable',
      systemAudioLevel: probe.level,
      errorCode: probe.trackReady ? undefined : 'SYSTEM_AUDIO_TRACK_UNAVAILABLE',
    });
  }

  complete(skipped = false): PermissionOnboardingState {
    return this.persist({ ...this.getState(), completed: true, skipped, authorizationPhase: skipped ? 'idle' : 'complete' });
  }

  async openSettings(kind: 'microphone' | 'screen'): Promise<boolean> {
    if (process.platform !== 'darwin') return false;
    const pane = kind === 'microphone'
      ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
      : 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
    await shell.openExternal(pane);
    return true;
  }

  installToApplications(): boolean {
    if (process.platform !== 'darwin' || !app.isPackaged || app.isInApplicationsFolder()) return false;
    return app.moveToApplicationsFolder();
  }

  relaunchAfterPermissionGrant(): boolean {
    if (process.platform !== 'darwin') return false;
    app.relaunch();
    setTimeout(() => app.exit(0), 100);
    return true;
  }

  private resolveMigrationStatus(): PermissionMigrationStatus {
    if (this.migrationStatus === 'running' || this.migrationStatus === 'failed') return this.migrationStatus;
    const record = this.configHelper.getMacPermissionMigration();
    const completedVersion = record?.status === 'completed' ? record.version : undefined;
    const status = shouldRunMacPermissionMigration({
      platform: process.platform,
      packaged: app.isPackaged,
      inApplicationsFolder: process.platform !== 'darwin' || !app.isPackaged || app.isInApplicationsFolder(),
      completedVersion,
      completedSigningIdentity: record?.signingIdentity,
      currentSigningIdentity: this.currentSigningIdentity,
    });
    this.migrationStatus = status;
    if (record?.status === 'failed' && status === 'required') {
      this.migrationStatus = 'failed';
      this.errorCode = record.errorCode ?? 'TCC_RESET_FAILED';
    }
    return this.migrationStatus;
  }

  private async loadCurrentSigningIdentity(): Promise<void> {
    if (this.currentSigningIdentity || process.platform !== 'darwin' || !app.isPackaged) return;
    try {
      const result = await execFileAsync('/usr/bin/codesign', ['-dv', '--verbose=4', process.execPath], {
        timeout: 10_000,
        windowsHide: true,
      });
      const details = `${String(result.stdout ?? '')}\n${String(result.stderr ?? '')}`;
      const teamId = details.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim();
      const cdHash = details.match(/^CDHash=(.+)$/m)?.[1]?.trim();
      this.currentSigningIdentity = teamId && teamId !== 'not set'
        ? `team:${teamId}`
        : `adhoc:${cdHash || app.getVersion()}`;
    } catch (error) {
      this.currentSigningIdentity = `unknown:${app.getVersion()}`;
      console.warn('[PermissionOnboarding] unable to read signing identity:', safeErrorCode(error, 'CODESIGN_IDENTITY_READ_FAILED'));
    }
  }

  private async runUnifiedAuthorization(): Promise<PermissionOnboardingState> {
    let state = await this.prepareLegacyMigration();
    if (state.migrationStatus === 'install-required') {
      this.authorizationPhase = 'failed';
      this.errorCode = 'INSTALL_TO_APPLICATIONS_REQUIRED';
      return this.persist({ ...state, authorizationPhase: 'failed', errorCode: this.errorCode });
    }
    if (state.migrationStatus === 'failed') return state;

    this.authorizationPhase = 'microphone';
    this.requiresRestart = false;
    this.errorCode = undefined;
    state = await this.requestMicrophone();
    if (!isPermissionTrackUsable(state.microphone)) {
      this.authorizationPhase = 'waiting-settings';
      this.errorCode = 'MICROPHONE_PERMISSION_REQUIRED';
      await this.openSettings('microphone').catch(() => {});
      return this.persist({ ...state, authorizationPhase: 'waiting-settings', errorCode: this.errorCode });
    }

    this.authorizationPhase = 'screen';
    state = await this.requestScreen();
    if (state.screen !== 'verified') {
      this.authorizationPhase = 'restart-required';
      this.requiresRestart = true;
      this.errorCode = 'SCREEN_PERMISSION_RESTART_REQUIRED';
      await this.openSettings('screen').catch(() => {});
      return this.persist({ ...state, authorizationPhase: 'restart-required', requiresRestart: true, errorCode: this.errorCode });
    }

    this.authorizationPhase = 'system-audio';
    state = await this.testSystemAudio();
    if (!isPermissionTrackUsable(state.systemAudio)) {
      this.authorizationPhase = 'waiting-settings';
      this.errorCode = 'SYSTEM_AUDIO_PERMISSION_REQUIRED';
      await this.openSettings('screen').catch(() => {});
      return this.persist({ ...state, authorizationPhase: 'waiting-settings', errorCode: this.errorCode });
    }

    this.authorizationPhase = 'complete';
    this.requiresRestart = false;
    this.errorCode = undefined;
    return this.persist({
      ...state,
      completed: true,
      skipped: false,
      authorizationPhase: 'complete',
      requiresRestart: false,
      errorCode: undefined,
    });
  }

  private persist(state: PermissionOnboardingState): PermissionOnboardingState {
    return this.configHelper.setPermissionOnboardingState(state);
  }

  private async runMediaProbe(kind: 'microphone' | 'system'): Promise<MediaProbeResult> {
    const partition = session.fromPartition('permission-probe');
    partition.setPermissionRequestHandler((_contents, permission, callback, details) => {
      if (permission !== 'media') return callback(false);
      const mediaTypes = 'mediaTypes' in details && Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
      callback(mediaTypes.length === 0 || (mediaTypes.includes('audio') && !mediaTypes.includes('video')));
    });
    partition.setPermissionCheckHandler((_contents, permission) => permission === 'media');
    partition.setDisplayMediaRequestHandler((_request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] })
        .then((sources) => callback(sources[0] ? { video: sources[0], audio: 'loopback' } : {}))
        .catch(() => callback({}));
    });

    const probeWindow = new BrowserWindow({
      width: 1,
      height: 1,
      show: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        session: partition,
      },
    });
    const htmlPath = path.join(os.tmpdir(), 'quizmate-permission-probe.html');
    fs.writeFileSync(htmlPath, '<!doctype html><meta charset="utf-8"><title>QuizMate permission probe</title>', 'utf8');
    try {
      await probeWindow.loadURL(`file://${htmlPath}`);
      const expression = kind === 'system'
        ? `navigator.mediaDevices.getDisplayMedia({video:true,audio:true})`
        : `navigator.mediaDevices.getUserMedia({audio:true})`;
      const value = await probeWindow.webContents.executeJavaScript(`(async () => {
        let stream = null;
        let context = null;
        try {
          stream = await ${expression};
          const audioTrack = stream.getAudioTracks()[0];
          if (!audioTrack || audioTrack.readyState !== 'live') return { trackReady: false, level: 0, error: 'NO_AUDIO_TRACK' };
          context = new AudioContext();
          const source = context.createMediaStreamSource(new MediaStream([audioTrack]));
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          let peak = 0;
          const bins = new Uint8Array(analyser.fftSize);
          for (let sample = 0; sample < 10; sample += 1) {
            analyser.getByteTimeDomainData(bins);
            let sum = 0;
            for (const value of bins) { const normalized = (value - 128) / 128; sum += normalized * normalized; }
            peak = Math.max(peak, Math.sqrt(sum / bins.length));
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          return { trackReady: true, level: peak };
        } catch (error) {
          return { trackReady: false, level: 0, error: error && error.message ? error.message : String(error) };
        } finally {
          if (stream) stream.getTracks().forEach(track => track.stop());
          if (context) await context.close().catch(() => {});
        }
      })()`, true);
      return isProbeResult(value) ? value : { trackReady: false, level: 0, error: 'INVALID_PROBE_RESULT' };
    } finally {
      if (!probeWindow.isDestroyed()) probeWindow.destroy();
    }
  }
}
