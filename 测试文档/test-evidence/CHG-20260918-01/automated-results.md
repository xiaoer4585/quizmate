# CHG-20260918-01 automated results

Date: 2026-09-18 Asia/Shanghai
WorkTree: C:/Users/Administrator/.codex/tmp/quizmate-dual-transparent-click-20260916
Branch: codex/windows-dual-transparent-click-20260916

## Passed

- `npm run typecheck:node` — PASS
- `npm run typecheck:web` — PASS
- `npm run test:shared` — PASS, 11 files / 78 tests
- `npm run package:win` — PASS, Windows ia32 NSIS, version `2026.9.18002`
- `node scripts/verify-packaged-app.cjs release/win-ia32-unpacked` — PASS, `PACKAGED_APP_OK version=2026.9.18002 arch=i386 asar=46532200`
- Installer SHA-256: see `installer-sha256.txt`

## UI scope

- PC interview overlay only; no changes to companion overlay, interview recognition, question assembly, AI request, credit or shortcut logic.
- Answer region is the primary 70% column with independent scrolling for long answers.
- Interim recognition remains a preview state and does not replace the committed question.
- Existing capture protection, watchdog, no-shadow and mouse-through paths remain in the main process and passed package audit.

## Manual acceptance still required

- Real Windows PC interview: short, long and related questions; timeline selection; long-answer scrolling; demo/formal mode labels.
- Screenshot, recording, casting and mouse penetration checks; protection failure must keep the overlay hidden.
- Position/size stability while interim text and AI answer updates arrive.
- Install, restart and uninstall behavior on the target Windows machine.
- No macOS build was performed.
