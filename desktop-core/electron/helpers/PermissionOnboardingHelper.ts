import { BrowserWindow, desktopCapturer, session, shell, systemPreferences } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ConfigHelper } from '../ConfigHelper';
import type { PermissionCapabilityStatus, PermissionOnboardingState } from '../../shared/reliability';

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

export class PermissionOnboardingHelper {
  private static readonly FLOW_VERSION = 1;
  constructor(private configHelper: ConfigHelper) {}

  getState(): PermissionOnboardingState {
    if (process.platform !== 'darwin') {
      return {
        flowVersion: PermissionOnboardingHelper.FLOW_VERSION,
        completed: true,
        skipped: false,
        platform: process.platform,
        microphone: 'granted',
        screen: 'granted',
        systemAudio: 'unavailable',
      };
    }
    const stored = this.configHelper.getPermissionOnboardingState();
    const microphone = macStatus(systemPreferences.getMediaAccessStatus('microphone'));
    const screen = macStatus(systemPreferences.getMediaAccessStatus('screen'));
    const permissionsStillGranted = microphone === 'granted' && screen === 'granted';
    return {
      flowVersion: PermissionOnboardingHelper.FLOW_VERSION,
      completed: stored?.flowVersion === PermissionOnboardingHelper.FLOW_VERSION
        && stored.completed === true
        && permissionsStillGranted,
      skipped: stored?.skipped === true,
      platform: process.platform,
      microphone: microphone === 'granted' ? (stored?.microphone === 'verified' ? 'verified' : 'granted') : microphone,
      screen: screen === 'granted' ? (stored?.screen === 'verified' ? 'verified' : 'granted') : screen,
      systemAudio: stored?.systemAudio ?? 'not-determined',
      microphoneLevel: stored?.microphoneLevel,
      systemAudioLevel: stored?.systemAudioLevel,
      updatedAt: stored?.updatedAt,
    };
  }

  async requestMicrophone(): Promise<PermissionOnboardingState> {
    if (process.platform !== 'darwin') return this.getState();
    try {
      await systemPreferences.askForMediaAccess('microphone');
    } catch {
      // The verified status below remains authoritative.
    }
    const state = this.getState();
    if (state.microphone !== 'granted' && state.microphone !== 'verified') return state;
    const probe = await this.runMediaProbe('microphone');
    return this.persist({
      ...state,
      microphone: probe.trackReady ? (probe.level > 0.003 ? 'verified' : 'track-ready') : 'denied',
      microphoneLevel: probe.level,
    });
  }

  async requestScreen(): Promise<PermissionOnboardingState> {
    if (process.platform !== 'darwin') return this.getState();
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
      return this.persist({ ...state, screen: valid ? 'verified' : state.screen });
    } catch {
      return this.getState();
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
    });
  }

  complete(skipped = false): PermissionOnboardingState {
    return this.persist({ ...this.getState(), completed: true, skipped });
  }

  async openSettings(kind: 'microphone' | 'screen'): Promise<boolean> {
    if (process.platform !== 'darwin') return false;
    const pane = kind === 'microphone'
      ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
      : 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
    await shell.openExternal(pane);
    return true;
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
          for (let sample = 0; sample < 30; sample += 1) {
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
