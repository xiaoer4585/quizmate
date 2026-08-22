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

- First attempted GitHub Actions run `32562804716` on `wangxiaoer4585/quizmate` failed before jobs started. The user clarified the official repository is `xiaoer4585/quizmate`, so this run is not the release source.
- Apple Silicon DMG install, first-run screen/microphone prompts, screenshot shortcut, real AI answer flow, in-client recharge QR scan, and invite stats refresh require a physical Apple Silicon Mac and production account.
- Intel DMG install, first-run screen/microphone prompts, screenshot shortcut, real AI answer flow, in-client recharge QR scan, and invite stats refresh require an Intel Mac and production account.
- Physical Apple Silicon / Intel install and real payment QR scanning still require device/account validation. GitHub Actions DMG verify, executable architecture, and ad-hoc codesign verification passed.

## Release Status

- Commit prepared for release: `3b7d84e2e4c877d1d7dfb8c1b4ada4e32f93113a`.
- Tag pushed to official GitHub repo `xiaoer4585/quizmate`: `mac-build-20268222-1787387871082`.
- GitHub Actions run `32562933195` completed successfully on `xiaoer4585/quizmate`: https://github.com/xiaoer4585/quizmate/actions/runs/32562933195
- Published to `quizmate-cn` only:
  - `downloads/QuizMate-Mac-Apple-Silicon-2026.8.22.2.dmg` size `126907488`
  - `downloads/QuizMate-Mac-Intel-2026.8.22.2.dmg` size `130567223`
  - `mac/QuizMate-Mac-arm64-2026.8.22.2.zip` size `126885046`
  - `mac/QuizMate-Mac-x64-2026.8.22.2.zip` size `128991162`
  - `mac/latest-mac.yml`
  - `download.html`
- Public HTTP verification passed:
  - `https://www.quizmate.cn/download.html` returned 200 and contains `2026.8.22.2`, `升级版本开发中...敬请期待`, and `标准（适用学习通）`.
  - `https://quizmate.cn/mac/latest-mac.yml` returned 200 and contains `version: 2026.8.22.2`.
  - Both DMGs and both ZIPs returned 200 with expected content lengths.
