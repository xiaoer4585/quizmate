---
name: client-test-regression
description: Maintain mandatory test cases, regression evidence, and rollback validation for changes to this project's Android, Windows, macOS, Electron, CloudBase account/credit backend, installers, platform permissions, or browser-extension compatibility. Use whenever implementing, fixing, refactoring, packaging, releasing, migrating, or rolling back any client-facing or shared-backend behavior.
---

# Client Test Regression

Treat testing and rollback work as part of the change, not as optional close-out.

## Official website and legacy domain publishing boundary

Use the following domain policy for every website, client-download, installer-update, or OSS publishing task:

- The official website is `https://www.quizmate.cn/` and `https://quizmate.cn/`. New website pages, download pages, installer links, release metadata, and public website assets must be published and verified there.
- `https://www.quizmate.vip/` and `https://quizmate.vip/` are legacy entry domains only. Their root/home pages may remain as redirects to `https://www.quizmate.cn/` / `https://www.quizmate.cn/` for traffic migration.
- Do not treat `www.quizmate.vip` as the official website. Do not publish new website pages, download cards, installer packages, client update manifests, or general website assets to the legacy VIP domain.
- Do not update or synchronize any other `*.quizmate.vip` subdomain as part of a website release. Existing service subdomains are out of scope unless the user explicitly requests that specific service change.
- Preserve the explicitly retained admin entry `https://www.quizmate.vip/admin-web/index.html` only when an admin-web task is requested. It is not a public website or client-download target.
- Before publishing, assert the target bucket/domain list explicitly. A website/client release must target `quizmate-cn` and the `quizmate.cn` public URLs; never include `quizmate-vip` merely because an older deployment script still lists it.
- For legacy-domain changes, limit the operation to redirect verification and rollback checks. Never overwrite legacy download/update objects accidentally. Record any skipped legacy objects in the release evidence.

### Release version naming

- Use the calendar date as the base version: `YYYY.M.DD` (for example, `2026.8.22`).
- When multiple releases are published on the same calendar day, append an incrementing suffix: `YYYY.M.DD.1`, `YYYY.M.DD.2` (zero-padded forms such as `.01` are accepted only when an existing platform convention requires them).
- The suffix must be reflected consistently in the public download-page text, installer filename/object key, update manifest, release evidence, and rollback record. Never point a page at an object that has not been uploaded and HTTP-verified.

## Canonical test plan

Locate and read `考试插件/多个版本的客户端的测试文档.md` completely before changing code. Also read the active requirement/design/task documents under `考试插件/specs/` when the change belongs to a spec.

Use that Chinese test document as the single source of truth. Do not create a second competing master test plan.

## Before editing code

1. Add a new `CHG-YYYYMMDD-NN` entry to the canonical test document.
2. Record scope, affected modules, risk, affected case IDs, required regression sets, rollback point, rollback procedure, environments, and evidence directory.
3. Compare the requested behavior with existing cases. Add or revise cases before implementation when any new state, error, permission, platform difference, migration, or compatibility branch appears.
4. Capture the pre-change state needed for rollback: relevant file list/diff, config and schema versions, package version, feature flags, and data migration boundary. Never put secrets in evidence.
5. Do not begin implementation when a high-risk change has no testable acceptance criterion or rollback path.

## During implementation

- Keep backend authorization and credit assertions independent from client UI assertions.
- Prefer automated unit/integration tests for account, session, permission, idempotency, credit, migration, and compatibility logic.
- Use real platform/manual tests for OS permissions, secure storage, screenshot privacy behavior, installers, upgrades, signing, notarization, and hardware/architecture coverage.
- Keep database migrations additive, versioned, idempotent, and compatible with the immediately previous client during the defined compatibility period.
- Preserve the browser-extension freeze unless the user explicitly opens its code scope. Still run its compatibility cases when shared backend behavior changes.
- Protect only credentials, payment data, tokens, and personal data. Do not implement or validate hidden answers, capture evasion, proctoring bypass, or anti-detection behavior.

## After every change

1. Run all directly affected cases.
2. Run the corresponding module regression set from the canonical document.
3. Run the P0 smoke set, compatibility set, and applicable rollback cases.
4. Run static checks, unit tests, builds, and runtime flows appropriate to every changed platform.
5. Store sanitized output under `考试插件/test-evidence/<change-id>/` or record the external evidence location.
6. Update the case status and the change record with exact command/result, platform, version, time, evidence, failures, fixes, reruns, and release conclusion.
7. Mark unavailable platform work as `阻塞`, never `通过`. macOS signing/notarization and physical Mac results cannot be inferred from a Windows build.
8. Do not claim completion while a P0/P1 case fails, a required regression is unexecuted, or rollback validation is missing.

## Failure and rerun policy

- On failure, preserve the first failure evidence, diagnose, fix, and rerun the failed case plus its surrounding regression set.
- Do not delete or weaken a failing test merely to make the suite pass.
- Treat flaky tests as failures until the instability is explained and removed.
- If production-like external resources prevent safe testing, use an isolated test environment and record the gap.

## Rollback gate

For every medium/high-risk change, verify both code rollback and state rollback:

- previous client against the new backend compatibility layer;
- new data read safely after application rollback;
- account balances and credit logs reconcile before and after rollback;
- session revocation and secure-storage cleanup remain correct;
- installers can downgrade or uninstall/reinstall according to the documented policy;
- P0 smoke and compatibility tests pass after rollback.

Declare rollback complete only after evidence is recorded in the canonical test document.
