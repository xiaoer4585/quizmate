# CHG-20260916-02 基线与回滚

- 基线提交：`cb5a663`（`codex/windows-signing-capture-hide-20260913`）。
- 实施分支：`codex/windows-dual-transparent-click-20260916`。
- WorkTree：`C:/Users/Administrator/.codex/tmp/quizmate-dual-transparent-click-20260916`。
- 原工作区：`E:/ai项目/考试插件`，保持用户未提交改动，不在本变更中修改。
- 回滚：删除本测试 WorkTree/测试包，或将代码恢复到 `cb5a663`；不触碰数据库、官网和线上更新对象。
- 构建边界：Windows ia32 NSIS；macOS 不构建；未上传、未发布、未上线。
- 依赖：使用 `windows客户端/QuizMate-Windows/package-lock.json`，测试 WorkTree 通过 `npm ci --ignore-scripts` 安装依赖，未改变锁文件。
