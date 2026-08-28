# CHG-20260828-04 Mac CI and OSS Test Delivery

- Executed: 2026-08-28 15:02–15:10 +08:00
- Canonical Gitee branch: `codex/mac-capture-interview-20260828`
- Canonical Gitee commit: `1f50065036b33a01dc2abb508246a7c6925997c5`
- Mac internal version: `2026.8.28001`
- Mac business version: `2026.8.28.1`
- Windows package/version/update channel changed: no
- Website, `mac/latest-mac.yml`, formal downloads and user update channel changed: no

## GitHub build-only synchronization

- Repository visibility during build: public (pre-existing state confirmed).
- Normal source branch pushed to GitHub: no.
- Delivery tag: `mac-delivery-20260828-reliability-1` (temporary; removed after delivery).
- Smart Git HTTPS was unavailable from the Windows host. The GitHub Git Data API created an unbranched build-only commit whose final tree SHA-1 `ac095e7bce7d8fd43ff6b79011837e74ac9b6295` exactly matched canonical Gitee commit `1f50065036b33a01dc2abb508246a7c6925997c5`.
- GitHub build commit: `a759d9c5b4e20b7922f8c82ad262384dbce673b7` (content-equivalent build transport object, not the code-management baseline).
- Actions run: `33149992223` / workflow run number `47`.
- Intel job `98779517066`: success in 4m04s.
- Apple Silicon job `98779517191`: success in 6m01s.

Both jobs passed dependency install, shared-core bridge verification, Node/Web TypeScript validation, production build, DMG build, ad-hoc re-sign, strict code-sign verification, DMG verification and executable architecture verification.

## Architecture and signing

- Intel executable: `Mach-O 64-bit executable x86_64`.
- Apple Silicon executable: `Mach-O 64-bit executable arm64`.
- Bundle identifier: `vip.quizmate.mac`.
- Signature: ad-hoc for isolated local testing; `codesign --verify --deep --strict` passed in both jobs.
- Not notarized and no Developer ID team identifier. Gatekeeper/user override behavior remains a physical-Mac acceptance item.

## OSS isolated delivery verification

Bucket: `quizmate-cn`

Prefix: `temp/mac-capture-interview-2026.8.28.1/`

| Artifact | Bytes | SHA-256 | MD5 / OSS ETag |
|---|---:|---|---|
| `QuizMate-Mac-Intel-2026.8.28.1.dmg` | 117814809 | `342f818a321814d97cbad3fb40c2cedba5b46845d27a3e3eb430f652bd9722c0` | `247d9c0c9f53f060f2586b233923b8c3` |
| `QuizMate-Mac-x64-2026.8.28.1.zip` | 112304941 | `fdd43dfdbbe5c5e978c3beb26621b750135d73a715246fc7bbc70dd9d8bf6909` | `d2897795d2a89443171d876f816c5103` |
| `QuizMate-Mac-Apple-Silicon-2026.8.28.1.dmg` | 110419046 | `599ecdfeec31b58c0a47ddd13b28b7cf6d282d6bb880ba6ba1cc04c8f60308e4` | `c531b2ec338b78f77401ffe94d1da840` |
| `QuizMate-Mac-arm64-2026.8.28.1.zip` | 106267500 | `ad3c8bcede9b81d1e771f86592ac50f8544b66fa04d561f53637eae864ae765a` | `8cbd33956cb2bc4bbdf23648bf25103c` |

Verification downloaded every OSS object as a stream and recomputed SHA-256 and MD5. All four SHA-256 values match the corresponding GitHub CI `sha256-x64.txt` / `sha256-arm64.txt`; every computed MD5 equals the OSS ETag. Content types are correct.

## Warnings and remaining blockers

- `npm audit` reported existing dependency advisories and was non-blocking by workflow policy; no destructive `npm audit fix --force` was run.
- GitHub runner warned that Node 20-based Actions are being forced onto Node 24. The jobs nevertheless completed successfully; workflow action upgrades should be handled separately.
- Physical Mac permissions, system speaker audio, screenshot/AI success, 30-minute continuity, sleep/wake, Gatekeeper behavior and 20-sample production P50/P95 remain blocked pending user installation testing.
- This is an isolated test delivery, not a production release.

## Rollback

- Remove `temp/mac-capture-interview-2026.8.28.1/` to withdraw the test package.
- No production manifest/page/object rollback is needed because none was changed.
- Code rollback is a normal revert of the Gitee commits; no database or backend state changed.
