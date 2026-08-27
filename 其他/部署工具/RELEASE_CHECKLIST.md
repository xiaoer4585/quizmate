# Windows 客户端发布 Checklist

每次打 Windows 包、走 [deploy-windows-release.cjs](./deploy-windows-release.cjs) 之前，必须勾完下面所有项。

> 核心原则：**所有版本号必须由 `windows客户端/QuizMate-Windows/releases/VERSION` 这一个文件决定**。任何脚本或配置文件里出现手写版本号都是 bug。

---

## 1. 版本号单一来源（最关键）

- [ ] 确认 `windows客户端/QuizMate-Windows/releases/VERSION` 已经更新为本版本（例如 `2026.8.23`）
- [ ] 该文件**不进入** git 历史（用 `.gitignore` 过滤，或用 git 钩子校验）

## 2. 本地产物对齐

- [ ] `npm run package:win` 通过，本地产物落在 `releases/<YYYY-MM-DD>/`
- [ ] 该目录里的 `latest.yml` 的 `version`、`sha512`、exe 路径与本目录 exe 文件一致
- [ ] 该目录里的 `win-unpacked/resources/app-update.yml` 的 `url` 指向目标更新域名（默认 `https://quizmate.cn/suite/`）

## 3. 源码四件套对齐

- [ ] `package.json` 的 `version` === VERSION
- [ ] `resources/config.json` 的 `version` === VERSION
- [ ] `releases/<dir>/latest.yml` 的 `version` === VERSION
- [ ] exe 文件名 === `QuizMate-Windows-<VERSION>.exe`

> 部署脚本会在推送前自动校验这 4 个值。如果脚本抛出 `[precheck]`，**不要** `--force` 绕过，回去修源头。

## 4. 官网 / 域名对齐

- [ ] `download.html` / `index.html` / `blog/article-exam-skills.html` 三处的下载链接使用 `https://quizmate.cn/downloads/QuizMate-Windows-<VERSION>.exe`
- [ ] 三处没有再出现 `2026.8.22` / `2026.8.21` / `2026.8.20` / `8.22.1` 任何旧版本字符串
- [ ] `electron-builder.yml` 的 `publish.url` 与目标更新域名一致（默认 `https://quizmate.cn/suite/`）

## 5. 发布命令

```bash
# 预演（不推 OSS，只跑 precheck）
QUIZMATE_SKIP_OSS=1 node 其他/部署工具/deploy-windows-release.cjs --version 2026.8.23

# 正式发布
node 其他/部署工具/deploy-windows-release.cjs --version 2026.8.23
```

可选覆盖：
- `QUIZMATE_UPDATE_BASE_URL`：自动更新 yml 的域名（默认 `https://quizmate.cn`）
- `QUIZMATE_PUBLIC_BASE_URL`：download.html 链接校验的域名（默认 `https://quizmate.cn`）
- `QUIZMATE_RELEASE_DIR`：覆盖发布目录（默认 `releases/<YYYY-MM-DD>/`）

## 6. 发布后验证（脚本会自动跑）

- [ ] 脚本末尾打印 `DEPLOY_WINDOWS_RELEASE_OK version=...`
- [ ] 手测：
  - `curl -I https://quizmate.cn/suite/latest.yml` → 200，本版本号
  - `curl -I https://quizmate.cn/downloads/QuizMate-Windows-<VERSION>.exe` → 200，size 与本地一致
  - `curl -I https://quizmate.cn/downloads/QuizMate-Windows-2026.8.<旧>.exe` → 404（不再保留旧安装包）

## 7. Git / Tag

- [ ] 代码 + 配置文件改动已 `git commit`
- [ ] 打 tag：`git tag v20260823`（tag 与发布日期一一对应，不与版本号混用）
- [ ] `git push origin main --tags`

---

## 红线

- **不要**同时改 `package.json` 的 version 又用 `--version` 传不一样的值。
- **不要**手动编辑 `latest.yml`（electron-builder 会重写）。要改 yml，重打。
- **不要**把 suite 和 downloads 推到两个不同的 bucket（历史教训：曾同时推 `quizmate-vip` 和 `quizmate-cn`，导致客户端按 publish.url 拉到一个、过期的官网 HTML 拉到另一个）。
- **不要**把 `releases/VERSION` 删掉后用 `--version` 临时传值。