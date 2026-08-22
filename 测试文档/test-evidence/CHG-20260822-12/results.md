# CHG-20260822-12 Results

## Local Automated Checks

- 2026-08-22 Windows local, `mac客户端/QuizMate-Mac`: `npm run typecheck:node` passed.
- 2026-08-22 Windows local, `mac客户端/QuizMate-Mac`: `npm run typecheck:web` passed.
- 2026-08-22 Windows local, `mac客户端/QuizMate-Mac`: `npm run build` passed.
- 2026-08-22 Windows local: `git diff --check -- mac客户端\QuizMate-Mac 官网模块\正式官网-quizmate.vip\download.html 测试文档\多个版本的客户端的测试文档.md` passed. Output only contained Git line-ending warnings.

## Static Verification

- Version fields are aligned to `2026.8.22.2` in Mac `package.json`, `package-lock.json`, and `resources/config.json`.
- Official download page Mac card shows `2026.8.22.2` and links to:
  - `downloads/QuizMate-Mac-Apple-Silicon-2026.8.22.2.dmg`
  - `downloads/QuizMate-Mac-Intel-2026.8.22.2.dmg`
- Windows download card remains `2026.8.22.1`; Android remains `标准（适用学习通）`; job plugin download remains disabled with `升级版本开发中...敬请期待`.
- Update UI now only surfaces real update availability. Latest/same-version and update-check failures are silent.
- Screenshot queue is cleared only after AI analysis success; failed analysis preserves the queued screenshot and shows the actual error text in the overlay.
- Recharge IPC opens the in-client `RechargeModal`; payment order creation/query is handled through Mac IPC and the unified backend payment actions.
- Invite panel stays in-client and displays invite code/link/share text/stats; uncharged users see the reward gating copy plus an in-client `立即邀请` action.
- Global quit shortcut action is disabled, and `before-quit` blocks non-explicit quits. The tray quit path remains the explicit quit path.

## Blocked Manual / Platform Checks

- Apple Silicon DMG install, first-run screen/microphone prompts, screenshot shortcut, real AI answer flow, in-client recharge QR scan, and invite stats refresh require a physical Apple Silicon Mac and production account.
- Intel DMG install, first-run screen/microphone prompts, screenshot shortcut, real AI answer flow, in-client recharge QR scan, and invite stats refresh require an Intel Mac and production account.
- macOS signing/notarization/DMG mount validation must be verified by the GitHub Actions macOS runner and/or physical Mac.

