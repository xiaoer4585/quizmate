---
name: quizmate-release
description: 'Publish QuizMate changes when the user says "上线", "发布", or asks to update production. By default, a production release includes both GitHub synchronization and the matching Aliyun deployment; use this skill for release completion and verification, not for local-only development or test builds.'
---

# QuizMate Release

In this project, an unqualified request to "上线" means both source release and production deployment. Do not report the release complete until both sides have been verified.

## Default Release Contract

- Synchronize the production commit and release tag to both configured GitHub repositories:
  - `origin`: `wangxiaoer4585/quizmate`
  - `newgithub`: `xiaoer4585/quizmate`
- Deploy the affected surface to Aliyun production.
- Run checks appropriate to the changed surface before deployment and online checks afterward.
- If either GitHub or Aliyun fails, report the release as incomplete and preserve the successful side. Do not force-push or silently roll back unrelated work.
- An explicit narrower request such as "only push GitHub" or "only deploy Aliyun" overrides this default.

## GitHub Release

1. Work from the task's isolated branch/worktree and keep unrelated user changes out of the commit.
2. Fetch both remotes and inspect divergence before integrating. Preserve both histories; never use a destructive reset or force push.
3. Commit the tested change, merge it into the local `main` worktree, and create the next unused date tag: `vYYYYMMDD`, then `vYYYYMMDD-2`, `vYYYYMMDD-3`, and so on.
4. Push `main` and the same release tag to both `origin` and `newgithub` unless the user explicitly changes repository scope.
5. Verify with remote refs that both `main` tips and both tags resolve to the intended local release commit.

Client installers are built by the repository's GitHub Actions workflows. Do not replace required CI builds with local packaging.

## Aliyun Target

Choose the deployment target from the changed module and use the repository's scoped deployment script when available:

- Backend API: deploy compiled artifacts to `/opt/quizmate-api-shadow`, back up replaced files, restart the service, then verify service and database health.
- Admin console: publish `admin-web` to the `quizmate-vip` bucket. Back up the previous object and verify uploaded markers and content hash.
- Public website: publish only to the `quizmate-cn` bucket and validate `https://www.quizmate.cn`. Do not publish the public site through legacy `quizmate.vip` scripts.
- Windows, Mac, Android, or extension releases: use the platform's existing build/release workflow and verify the published artifact, update metadata, and download path.

Do not expose or commit `.env`, Aliyun profiles, tokens, private keys, signed URLs, or credentials.

## Completion Evidence

Before declaring "上线完成", record:

- release branch, commit, and tag;
- verified `main` and tag refs for both GitHub remotes;
- Aliyun target and deployed content hash or artifact version;
- backup or rollback location;
- local test results and production smoke-check results;
- any blocked or skipped platform verification.
