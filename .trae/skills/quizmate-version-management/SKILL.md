---
name: "quizmate-version-management"
description: "Manages QuizMate project version control with date-based tags, feature branch workflow, and Aliyun deployment. Invoke when user asks to modify code, fix bugs, release versions, or deploy to Aliyun."
---

# QuizMate 项目版本管理技能

## 项目概况

- **项目名**: quizmate（考试插件）
- **GitHub 仓库**: 私有仓库 `quizmate`，使用 SSH 认证
- **版本号规则**: `v + 日期`，如 `v20260725`（每天最多一个版本号）
- **分支策略**: main（稳定）+ feature/描述（改动分支）

## 项目模块结构

| 模块 | 路径 | 说明 |
|------|------|------|
| 安卓端 | `安卓端/QuizMate-Android/` | Android 客户端 |
| Windows 客户端 | `windows客户端/QuizMate-Windows/` | Electron 桌面端 |
| Mac 客户端 | `mac客户端/QuizMate-Mac/` | Electron Mac 端 |
| 浏览器插件 | `扩展插件版/QuizMate-网申助手/` | Chrome/Edge 扩展 |
| 官网 | `官网模块/正式官网-quizmate.vip/` | 营销与下载页 |
| 后端 | `注册登陆模块/阿里云后端-quizmate-api/` | Node.js API |
| 管理后台 | `运营管理/QuizMate管理后台/` | 运营管理界面 |
| 测试文档 | `测试文档/` | 测试用例与证据 |

## Windows 客户端构建硬性要求（2026.8.25 起生效，不可遗忘）

1. **单一安装包必须同时兼容 x64 与 32 位(x86) Windows 系统**：
   - 构建架构固定为 **ia32**（`electron-builder --win --ia32`，见 `package.json` 的 `package:win` 脚本）
   - 32 位程序在 x64 与 x86 系统上均可运行，实现"一个安装包兼容两种系统"
   - 禁止改回 `--x64`（会导致 32 位系统无法安装）；如需拆分双包必须用户明确要求
2. **兼容 Win10 及以上系统**（Electron 31+ 本身不支持 Win7/8）：
   - Win10 2004+（build 19041+）使用 `WDA_EXCLUDEFROMCAPTURE` 防捕获
   - 更老的 Win10 自动降级 `WDA_MONITOR`（`electron/helpers/Win32Protection.ts` 内置版本检测，勿删）
3. **安装包一律在 GitHub Actions 构建，本地只保留代码**：
   - 工作流：`.github/workflows/windows-client-build.yml`（手动触发 `workflow_dispatch`）
   - 触发命令：`gh workflow run windows-client-build.yml --repo wangxiaoer4585/quizmate --ref main`
   - 监控构建：`gh run watch` 或 `gh run list --workflow=windows-client-build.yml`
   - 下载产物：`gh run download <run-id> -n QuizMate-Windows-ia32-<run-number> -D <目标目录>`
   - 产物已含 PE 架构自检（ia32=0x14c），下载后放入 `releases/<日期>/` 再走部署脚本
   - 本地不再执行 `npm run package:win`（仅作兜底，沙箱/文件锁问题多）
4. **产物归档**：构建产物（exe/blockmap/latest.yml/app-update.yml）放入 `windows客户端/QuizMate-Windows/releases/<YYYY-MM-DD>*/`，同日已有目录时用 `-fix` 等后缀新开目录，部署脚本用 `QUIZMATE_RELEASE_DIR` 指定

## 官网域名规则（更新官网时必看）

- **旧域名**：`www.quizmate.vip` 和 `quizmate.vip`（**不是官网**，仅作引流跳转）
- **新官网域名**：`www.quizmate.cn` 和 `quizmate.cn`（唯一正式官网）
- **跳转保留**：`www.quizmate.vip` 和 `quizmate.vip` 的首页**保留跳转引流**到新官网 `www.quizmate.cn` / `quizmate.cn`
- **其他二级域名**：后续更新官网时**不需要再改动**，无需同步更新
- **更新官网时的参考规范**：
  - 只维护 `www.quizmate.cn` / `quizmate.cn` 的内容
  - `quizmate.vip` 域名下的非首页内容停止更新，保留旧版即可
  - 任何官网改动都先在新官网验证，确认无误后再同步跳转逻辑

## 本地 / GitHub / 阿里云 三者关系

```
本地代码 ──提交──> GitHub（代码云盘+版本备份，唯一事实来源）
    │
    └──打包部署──> 阿里云（生产环境，实际运行）
```

- **GitHub**: 只存源码与历史版本，不运行服务。每次改动都提交。
- **阿里云**: 只运行打包产物，不存源码历史。线上模块改动后必须立即部署。
- **两者不自动同步**：由 AI 在每次线上模块改动后按「先 Git 后阿里云」顺序手动触发，确保两者完全一致。

## 先 Git 后阿里云一致性规则（2026.8.27 起生效，强制）

**核心原则：线上模块的每一次改动，必须先提交并推送 GitHub，随后立即部署阿里云并验证生效，确保 git 与阿里云完全一致。禁止只部署不提交，也禁止只提交不部署。**

### 线上模块清单（改动后必须部署阿里云）

| 线上模块 | 路径 | 部署目标 |
|------|------|------|
| 后端 API | `注册登陆模块/阿里云后端-quizmate-api/` | 阿里云 ECS |
| 统一入口 API | `注册登陆模块/阿里云统一入口-study-auth-api/` | 阿里云 |
| 官网 | `官网模块/正式官网-quizmate.vip/` | 阿里云 OSS（quizmate.cn） |
| 管理后台 | 官网 `admin-web/` 及 `运营管理/QuizMate管理后台/` | 阿里云 OSS |
| 域名售卖页 | `域名售卖页/` | 阿里云 OSS |

### 非线上模块（只提交 git，不触发部署）

- Windows 客户端 / Mac 客户端 / 安卓端 / 浏览器插件：客户端发版走独立流程（GitHub Actions 构建 + 产物上传 OSS），仅在用户明确要求发新版时执行
- 测试文档 / 运营文档 / README 等纯文档改动：只提交 git

### 强制顺序（不可颠倒、不可跳过）

1. `git add` + `git commit`（feature 分支）
2. 合并回 main + 打日期 tag
3. `git push origin main` + push tag —— **GitHub 是唯一事实来源，必须先推送成功**
4. 立即执行阿里云部署（ECS 后端 / OSS 静态资源）
5. 部署后线上验证（curl 健康检查或抓取页面，确认新内容已生效）
6. 验证通过后任务才算完成

### 禁止事项

- 禁止沿用「仅当需要上线时再部署」的旧习惯——线上模块改动即上线
- 禁止跳过 git push 直接部署（会导致阿里云版本超前于 git）
- 禁止部署后不做验证就结束任务
- 部署失败时不得结束任务：必须修复重试或回滚，最终保证 git 与阿里云一致

## 标准工作流（每次改动必须遵循）

当用户要求修改代码时，执行以下 10 步：

### 步骤 1：拉取最新代码
```bash
git checkout main
git pull origin main
```

### 步骤 2：创建 feature 分支
```bash
# 分支命名规则：feature/模块-简短描述
git checkout -b feature/修复登录白屏
```

### 步骤 3：修改代码并测试
- 只改动的相关模块，不碰其他模块
- 本地测试通过后再提交

### 步骤 4：提交改动
```bash
git add <具体文件>
git commit -m "fix: 修复登录白屏问题"
```

提交信息规范：
- `feat: 新增XXX功能`
- `fix: 修复XXX问题`
- `refactor: 重构XXX`
- `docs: 文档更新`
- `chore: 杂项维护`

### 步骤 5：合并回 main
```bash
git checkout main
git merge feature/修复登录白屏
```

### 步骤 6：打日期版本标签
```bash
# 版本号 = v + 今天日期，如 v20260726
git tag v20260726
```

### 步骤 7：推送到 GitHub
```bash
git push origin main
git push origin v20260726
```

### 步骤 8：部署到阿里云（线上模块改动后强制执行，必须在步骤 7 推送成功后进行）
- **触发条件**：本次改动涉及线上模块（后端 / 统一入口 / 官网 / 管理后台 / 售卖页），详见「先 Git 后阿里云一致性规则」
- 顺序硬性要求：先 `git push` 成功，再部署；禁止颠倒或跳过
- 读取 `.env` 获取阿里云 AccessKey
- 使用 `其他/部署工具/` 下的部署脚本打包上传（命名规律：`deploy-*.cjs`，按改动日期/模块选用或新建）
- 部署完成后必须线上验证（健康检查 / 抓取页面），确认阿里云运行内容与刚推送的 git 版本一致，任务才算完成
- 纯客户端 / 文档改动：跳过本步骤，直接进入步骤 9

### 步骤 9：删除 feature 分支
```bash
git branch -d feature/修复登录白屏
```

### 步骤 10：确认状态
```bash
git status
git log --oneline -5
git tag
```

## 版本号规则

### 客户端/产品版本号（各端安装包，如 Windows exe / Mac dmg / 安卓 apk）

- 格式：`YYYY.M.D`，按发布日期定义，月、日不补零，如 `2026.8.22`
- 当天发布多个版本：在日期后追加 `.01`、`.02` 递增，如 `2026.8.24.01`、`2026.8.24.02`
- 官网页面展示的版本号必须与实际下载安装包文件名中的版本号一致；发现对不上时，以实际安装包版本为准更新官网

### git tag 版本号

- 格式：`v` + `YYYYMMDD`，如 `v20260725`
- 同一天多次改动：用 `v20260725-2`、`v20260725-3` 递增
- 发布到阿里云时必须打 tag

## 安全规则

- `.env` 文件存阿里云密钥，**已被 .gitignore 排除，绝不进 GitHub**
- 绝不把 AccessKey、密码写进代码或提交信息
- `.pem`、`.key` 证书文件不进版本库
- 归档历史代码目录 `归档l历史代码正常不需要引用/` 不进版本库

## 应急操作

### 回退到上个版本
```bash
git log --oneline              # 找到要回退的版本
git revert <提交ID>            # 安全回退，保留历史
git tag v20260726-rollback     # 打回退标签
git push origin main
```

### 改错了还没提交
```bash
git checkout -- <文件名>       # 撤销单个文件
git checkout -- .              # 撤销所有改动
```

### 紧急修复线上 bug
```bash
git checkout v20260725         # 切到上个稳定版本
git checkout -b hotfix/紧急修复XXX
# 改代码、测试、提交
git checkout main
git merge hotfix/紧急修复XXX
git tag v20260726
git push origin main && git push origin v20260726
# 推送成功后立即部署阿里云并线上验证（hotfix 更要确保 git 与阿里云一致）
```

## 用户指令模板

用户只需这样说明改动需求，AI 自动执行上述 10 步：

```
改动需求：修复 XXX 的 YYY 问题
涉及模块：windows客户端 / 安卓端 / 官网 / 后端 / 扩展插件版
预期效果：ZZZ
是否需要上线：线上模块（后端/官网/管理后台/售卖页）默认必上线，git 推送后自动部署阿里云；仅客户端/文档改动可填否
```
