# CHG-20260917-01 automated results
Date: 2026-09-18 Asia/Shanghai
WorkTree: C:/Users/Administrator/.codex/tmp/quizmate-dual-transparent-click-20260916
Branch: codex/windows-dual-transparent-click-20260916

## Passed
- 
pm run typecheck:node — PASS
- 
pm run typecheck:web — PASS
- 
pm run test:shared — PASS, 11 files / 78 tests
- 
pm run package:win — PASS, Windows ia32 NSIS, version 2026.9.18001
- 
ode scripts/verify-packaged-app.cjs release/win-ia32-unpacked — PASS, PACKAGED_APP_OK version=2026.9.18001 arch=i386 asar=46529647
- Installer SHA-256: see installer-sha256.txt

## Automated coverage
- Pointer release under 6px is treated as a click.
- Pointer drag at or above 6px is not treated as a click.
- Non-finite pointer deltas are rejected.
- Existing companion, workspace, shortcut, screenshot privacy and reliability regressions remain green.

## Manual acceptance still required
- Real Windows pointer hit testing, click once -> one capture/search, drag -> move only, four-corner square resize, semi-opaque configuration panel and completion flow.
- Windows screenshot, screen recording, casting and mouse penetration checks in configuring and formal states.
- Real phone relay answer display, credit settlement, DPI/multi-monitor, install/uninstall and restart persistence.
- No macOS build was performed.
