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

## 本地 / GitHub / 阿里云 三者关系

```
本地代码 ──提交──> GitHub（代码云盘+版本备份）
    │
    └──打包部署──> 阿里云（生产环境，实际运行）
```

- **GitHub**: 只存源码与历史版本，不运行服务。每次改动都提交。
- **阿里云**: 只运行打包产物，不存源码历史。只在需要上线时部署。
- **两者不自动同步**，需手动触发部署。

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

### 步骤 8：部署到阿里云（仅当需要上线时）
- 读取 `.env` 获取阿里云 AccessKey
- 使用 `scripts/` 下的部署脚本打包上传
- 部署脚本命名规律：`deploy-ecs-backend-*.cjs` / `deploy-oss-*.cjs`

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
```

## 用户指令模板

用户只需这样说明改动需求，AI 自动执行上述 10 步：

```
改动需求：修复 XXX 的 YYY 问题
涉及模块：windows客户端 / 安卓端 / 官网 / 后端 / 扩展插件版
预期效果：ZZZ
是否需要上线：是 / 否
```
