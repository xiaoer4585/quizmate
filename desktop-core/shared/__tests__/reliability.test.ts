import { describe, expect, it } from 'vitest';
import {
  createIdleVoiceSnapshot,
  detectSupportedImageMime,
  isVoiceHealthSnapshot,
  isVoiceSessionActive,
  mergeVoiceHealthSnapshot,
  nextReconnectDelay,
  shortDiagnosticId,
  shouldRunMacPermissionMigration,
  isPermissionTrackUsable,
  getMacTccResetArguments,
} from '../reliability';
import { ASR_FINAL_COMMIT_MS, ASR_SILENCE_COMMIT_MS } from '../../interviewTranscript';

describe('voice reliability state', () => {
  it('does not let a stale renderer generation overwrite the current session', () => {
    const current = { ...createIdleVoiceSnapshot(), generation: 4, sessionId: 'current', phase: 'listening' as const, desiredRunning: true };
    const stale = { ...current, generation: 3, sessionId: 'stale', phase: 'action-required' as const };
    expect(mergeVoiceHealthSnapshot(current, stale, 4)).toBe(current);
  });

  it('keeps reconnecting sessions active until the user stops', () => {
    const snapshot = { ...createIdleVoiceSnapshot(), desiredRunning: true, phase: 'reconnecting' as const };
    expect(isVoiceSessionActive(snapshot)).toBe(true);
    expect(isVoiceSessionActive({ ...snapshot, desiredRunning: false, phase: 'idle' })).toBe(false);
  });

  it('caps reconnect backoff and validates boundary payloads', () => {
    expect([0, 1, 2, 3, 4, 9].map(nextReconnectDelay)).toEqual([500, 1000, 2000, 4000, 5000, 5000]);
    expect(isVoiceHealthSnapshot(createIdleVoiceSnapshot())).toBe(true);
    expect(isVoiceHealthSnapshot({ phase: 'listening' })).toBe(false);
  });

  it('shortens diagnostics without exposing arbitrary punctuation', () => {
    expect(shortDiagnosticId('desktop-1234567890-secret')).toMatch(/^deskto…cret$/);
  });

  it('dispatches finalized interview questions within the client latency budget', () => {
    expect(ASR_FINAL_COMMIT_MS).toBeLessThanOrEqual(300);
    expect(ASR_SILENCE_COMMIT_MS).toBeGreaterThan(ASR_FINAL_COMMIT_MS);
  });

  it('rejects corrupt screenshot payloads before an AI request', () => {
    expect(detectSupportedImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(detectSupportedImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectSupportedImageMime(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });

  it('runs the Mac TCC migration exactly once from an installed packaged app', () => {
    expect(getMacTccResetArguments()).toEqual(['reset', 'All', 'vip.quizmate.mac']);
    expect(shouldRunMacPermissionMigration({ platform: 'win32', packaged: true, inApplicationsFolder: true })).toBe('not-required');
    expect(shouldRunMacPermissionMigration({ platform: 'darwin', packaged: false, inApplicationsFolder: false })).toBe('not-required');
    expect(shouldRunMacPermissionMigration({ platform: 'darwin', packaged: true, inApplicationsFolder: false })).toBe('install-required');
    expect(shouldRunMacPermissionMigration({ platform: 'darwin', packaged: true, inApplicationsFolder: true, currentSigningIdentity: 'team:ABC' })).toBe('required');
    expect(shouldRunMacPermissionMigration({ platform: 'darwin', packaged: true, inApplicationsFolder: true, completedVersion: 1, completedSigningIdentity: 'team:ABC', currentSigningIdentity: 'team:ABC' })).toBe('completed');
    expect(shouldRunMacPermissionMigration({ platform: 'darwin', packaged: true, inApplicationsFolder: true, completedVersion: 1, completedSigningIdentity: 'adhoc:OLD', currentSigningIdentity: 'team:ABC' })).toBe('required');
    expect(shouldRunMacPermissionMigration({ platform: 'darwin', packaged: true, inApplicationsFolder: true, completedVersion: 1, completedSigningIdentity: 'adhoc:OLD', currentSigningIdentity: 'adhoc:NEW' })).toBe('required');
  });

  it('does not treat a quiet live audio track as a permission failure', () => {
    expect(isPermissionTrackUsable('track-ready')).toBe(true);
    expect(isPermissionTrackUsable('verified')).toBe(true);
    expect(isPermissionTrackUsable('denied')).toBe(false);
    expect(isPermissionTrackUsable('unavailable')).toBe(false);
  });
});
