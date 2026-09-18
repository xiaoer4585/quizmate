# CHG-20260918-02 automated results

Date: 2026-09-18 Asia/Shanghai
WorkTree: C:/Users/Administrator/.codex/tmp/quizmate-dual-transparent-click-20260916
Branch: codex/windows-dual-transparent-click-20260916

## Passed

- `npm run typecheck:node` — PASS
- `npm run typecheck:web` — PASS
- `npm run test:shared` — PASS, 11 files / 83 tests
- `npm run package:win` — PASS, Windows ia32 NSIS, version `2026.9.18003`
- `node scripts/verify-packaged-app.cjs release/win-ia32-unpacked` — PASS, `PACKAGED_APP_OK version=2026.9.18003 arch=i386 asar=46532770`
- Installer SHA-256: see `installer-sha256.txt`

## Automated and static coverage

- User-facing mode label is `屏幕透明区截图`; the persistent show/hide control was removed.
- Pointer movement is coalesced to one IPC operation per animation frame.
- Bounds persistence and main-window state notification are debounced during adjustment and flushed when adjustment finishes.
- All four resize corners grow from the expected fixed corner and preserve square bounds within 32–320 pixels.
- Click/drag threshold, companion routing, screenshot privacy guards and existing regressions remain green.

## Manual acceptance still required

- Keep the adjustment session open for at least 30 seconds while repeatedly moving and resizing; confirm no crash or unexpected exit.
- Confirm only the explicit `完成调整` action exits configuration mode.
- Confirm one click captures/searches and dragging only moves the invisible region.
- Verify configuration and formal states with Windows screenshot, screen recording and casting; no border, handle, shadow or position may be captured.
- Verify the real second device receives the answer and install/restart/uninstall behavior.
- No macOS build was performed.
