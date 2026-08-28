# CHG-20260828-04 Implementation and Automated Evidence

- Executed: 2026-08-28 13:43–14:50 +08:00
- Host: Windows 11 x64
- Branch: `codex/mac-capture-interview-20260828`
- Baseline commit: `6b6cf928176ee3963a1f7ecc53de6aaa0d719b90`
- Mac internal package version: `2026.8.28001` (business version `2026.8.28.1`)
- Windows release version remains unchanged: internal `2026.8.27002`, business `2026.8.27.2`; Windows was only used for shared-core regression and is not packaged or published by this change.
- Production website/update manifests changed: no
- Gitee/GitHub/OSS changed: no

## Implemented reliability boundaries

- Screenshot capture, validation, queue save, compression and analysis reuse an `operationId`; timeout/network outcome-unknown retries reuse the request ID, while explicit failures use a new request ID under the same operation and increment `attempt`.
- Image decode now runs inside the structured `validate-image` error boundary. Failed analysis keeps the screenshot queue; success clears it.
- QuizMate's own capture path always temporarily hides a visible QuizMate overlay and restores it after capture. No new system/third-party capture-evasion behavior was added.
- First-launch macOS onboarding has a versioned per-account state and real microphone level, non-empty/non-black screen, and system-audio track/level probes. macOS TCC is never reported as installer-granted.
- The display carrier video track remains alive for the whole system-audio session. Track lifecycle, AudioContext state, ASR socket generation/reconnect, renderer loss and polling failure feed one `VoiceHealthSnapshot`.
- ASR reconnect is bounded to six consecutive attempts and is reset only after a valid server response, not merely after a socket opens. A dead hidden renderer is rebuilt automatically once; failure becomes `action-required`.
- The main Interview page derives its state from the backend snapshot and shows four component nodes. Manual questions no longer start audio capture.
- Final ASR transcript commit changed from 900 ms to 180 ms; interim silence commit remains longer at 900 ms.
- Screenshot/interview JSONL diagnostics rotate at 2 MiB with three history files. Copy/open-folder IPC is available from main pages.

## Automated checks

All commands below completed with exit code 0 unless a noted baseline/recovery event says otherwise.

```text
mac客户端/QuizMate-Mac:
  npm.cmd run typecheck:node  PASS (0 TypeScript errors)
  npm.cmd run typecheck:web   PASS (0 TypeScript errors)
  npm.cmd run test:shared     PASS (2 files, 7 tests)
  npm.cmd run build           PASS (30 main modules, 1 preload module, 1723 renderer modules)

windows客户端/QuizMate-Windows:
  npm.cmd run typecheck:node  PASS (0 TypeScript errors)
  npm.cmd run typecheck:web   PASS (0 TypeScript errors)
  npm.cmd run test:shared     PASS (2 files, 7 tests)
  npm.cmd run build           PASS (30 main modules, 1 preload module, 1723 renderer modules)

repository:
  git diff --check            PASS (line-ending notices only; no whitespace errors)
  credential-pattern scan    PASS (no match in changed source/config, package locks and outputs excluded)
```

Shared tests cover:

1. stale renderer generation cannot replace a newer voice session;
2. reconnecting/recovering sessions remain active until user stop;
3. reconnect delay is capped;
4. health boundary payload validation;
5. diagnostic ID shortening;
6. final transcript dispatch budget (`ASR_FINAL_COMMIT_MS <= 300`);
7. corrupt screenshot payload rejection before an AI request;
8. removal of token/API key/screenshot/transcript/resume/path/signed-URL fields from diagnostics.

## Build output evidence

```text
A55677A3C583A62689D872516FAC7A6137022D55A90E623FD73702D9CD2D5C47  mac客户端/QuizMate-Mac/out/main/index.js
E5FC4E2689AF1D9216EFC72C96577508E42552A22C7CE247B10C02DB161A661A  mac客户端/QuizMate-Mac/out/preload/index.cjs
5647D36495E22EE3D71C350517F8BA51FF102AFC52FC3EEBE74416D22BF82D32  mac客户端/QuizMate-Mac/out/renderer/index.html
```

These are Windows-host production bundles, not signed/notarized macOS DMGs and not evidence of macOS TCC or speaker-loopback behavior.

## Runtime smoke

- Launched the newly built Windows Electron shell beside the installed stable client using an isolated user-data directory and an unpackaged-only multi-instance test flag.
- Observed: QuizMate login route rendered fully; preload loaded; no white screen, startup crash or missing-module error.
- Not executed: authenticated Interview route interactions, because the isolated profile intentionally contains no user credentials and no real credential was automated.
- Test processes were stopped. Windows-only test `node_modules`, Windows `out`, and isolated smoke data were moved to the Windows Recycle Bin. Mac `node_modules` and Mac `out` were preserved.

## First failures preserved and fixes

1. Initial Mac `npm ci` stalled while Electron downloaded from the default source. The process remained alive but made no progress. It was stopped and rerun with `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`; install completed in 2 minutes.
2. Web typecheck/build could not resolve renderer packages because the E: filesystem rejects the `desktop-core/node_modules` junction. Both shells now have explicit TypeScript and Vite dependency fallbacks. Typechecks and builds then passed.
3. First Vitest run found no files because its root was the Mac shell. Scripts now run Vitest with repository root; 6/6 tests pass on both shells.

## Known gaps / release blockers

- macOS Intel and Apple Silicon package jobs have not run for this worktree.
- No physical Mac has executed first-launch allow/deny/skip/restart, real speaker audio, screenshot/AI success, track end, AudioContext interruption, network reconnect, sleep/wake or 30-minute continuity tests.
- No 20-sample production AI P50/P95 dataset exists; backend/model latency targets remain unverified.
- Signing, notarization, Gatekeeper and architecture checks remain unverified.
- `npm audit` reports dependency-tree vulnerabilities (Mac: 18; Windows: 19). They were not auto-fixed because `npm audit fix --force` may introduce breaking upgrades; this requires a separate dependency review.
- Therefore the production release conclusion remains **blocked**. Only isolated OSS `temp/` test packages may be produced after CI succeeds.

## Rollback check

- No database, backend schema, website, update manifest or production object changed.
- New permission state is optional and stored in a new key; the baseline client ignores it.
- New logs are optional files under the app log directory; deleting or retaining them does not affect the baseline client.
- Code rollback remains a single revert to baseline plus rebuild. Full installer downgrade/physical-Mac rollback remains blocked until a Mac package exists.
