---
name: quizmate-website
description: QuizMate official website deployment and validation conventions.
alwaysApply: false
---

# QuizMate Official Website

- Canonical public website: `https://www.quizmate.cn`
- Canonical recharge page: `https://www.quizmate.cn/recharge.html`
- Admin console: `https://www.quizmate.vip/admin-web`
- Admin console deployment bucket: `quizmate-vip`
- Production OSS bucket: `quizmate-cn`
- OSS endpoint: `oss-cn-beijing.aliyuncs.com`
- Website source directory: `官网模块/正式官网-quizmate.vip`
- Use `其他/部署工具/deploy-website-cn.cjs` for a full website publish.
- Use `其他/部署工具/deploy-single-file.cjs <file>` for a scoped static-file update.
- Do not use the `quizmate-vip` / `www.quizmate.vip` deployment scripts for the public user website; that domain is reserved for the admin console and other explicitly requested legacy surfaces.
- After deployment, validate the canonical `quizmate.cn` URL in a browser and check the relevant console logs.
