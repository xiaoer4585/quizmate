# 技术设计：双机协作笔试屏幕透明区截图

## 设计原则

屏幕透明区窗口只负责鼠标命中和发送一个 IPC 事件；截图、压缩、AI 分析、积分和第二机同步继续由 `CompanionController` 和现有后端链路负责。答案悬浮框仍保持鼠标穿透，避免把可点击行为混入答案展示窗口。

## 组件边界

```text
Companion.tsx
  ├─ 选择快捷键/屏幕透明区截图模式
  ├─ 显示/隐藏、进入配置和半遮蔽等待面板
  └─ 读取 CompanionState

main.ts
  ├─ createTransparentCaptureWindow()
  ├─ show/hide/configure/moveBy/resizeBy
  ├─ Windows 防捕获和看门狗
  ├─ 截图前隐藏透明窗口并等待 DWM 清理
  └─ 将一次点击转为 CompanionController.captureAndSearchOnce()

TransparentCaptureOverlay.tsx
  ├─ 运行态：短按发送截图 IPC，拖动发送移动 IPC
  └─ 配置态：显示边框和四角调整柄，主体移动、四角等比例缩放

CompanionController.ts
  ├─ captureMode 状态
  ├─ transparentClick() 一次截图+搜题
  └─ 复用原有 publishRelayResult、积分和错误流程
```

## 窗口策略

- 新窗口使用 `transparent`、无边框、无阴影、置顶、跳过任务栏、不可聚焦。
- 运行态使用独立窗口接收鼠标事件，答案悬浮框继续 `setIgnoreMouseEvents(true, { forward: true })`。
- Windows 应用 `WDA_EXCLUDEFROMCAPTURE` 并读回验证；保护失败时 fail-closed 隐藏窗口。
- 配置态只在用户主动调整时显示半透明边框；配置态同样应用防捕获保护。
- 不使用比例滑块。配置态通过四角调整柄改变边长，主进程始终强制宽高相等；正式态不显示调整柄，但仍允许拖动位置。
- 鼠标手势以 6px 移动阈值区分点击与拖动：阈值以内释放为单击，超过阈值只移动窗口；移动事件逐帧合并，窗口边界延迟写盘，避免拖动期间堆积 IPC 和状态广播。
- 截图开始前隐藏透明窗口，等待隐藏确认和至少 500ms 的 DWM 合成清理，完成后按模式和可见状态恢复。

## 状态与持久化

客户端设置增加：

- `companionExamTriggerMode`: `shortcut` 或 `transparent-click`，默认 `shortcut`。
- `transparentCaptureEnabled`: 是否启用屏幕透明区，默认 `true`。
- `transparentCaptureBounds`: `{ x, y, width, height }`，默认主显示器右侧安全位置。

`CompanionState` 增加当前触发模式、透明窗口是否可见、是否处于配置态和边界。窗口仅在 `workspace=mobile`、触发模式为 `transparent-click`、启用且手机已连接时显示。

## 一次点击事务

1. 渲染层点击调用 `companion:transparentClick`。
2. 主进程校验当前工作区、连接状态、触发模式和请求锁。
3. 隐藏透明窗口，等待窗口隐藏和 DWM 清理。
4. 调用 `CompanionController.captureAndSearchOnce()`，内部先截图，再立即分析，不进入三图队列。
5. 分析结果沿用现有 `CompanionCard` 和 relay 同步，第二机显示答案。
6. 清理 `pendingShots` 和本地截图临时数据，释放请求锁。
7. 如果仍处于屏幕透明区截图模式且连接有效，恢复透明窗口。

请求锁同时防止双击和窗口恢复期间重复扣费。失败时不保留上一轮图片，客户端显示可重试错误。

## 模式隔离

- `shortcut`：现有 Alt+Q/Alt+E 路由和最多三张截图逻辑不变，透明窗口销毁或隐藏。
- `transparent-click`：忽略双机笔试截图/搜题快捷键，复制答案快捷键保留。
- 离开双机工作区、断开手机、进入 PC 助手或面试模式：销毁或隐藏透明窗口，取消屏幕透明区截图请求。

## 测试与回滚

自动化覆盖状态、模式路由、一次点击事务和正方形边界；Windows 实机覆盖 DPI、多显示器、截图/录屏/投屏、防捕获、鼠标命中和安装包启动。回滚点为 `cb5a663`，删除本分支测试包和证据目录即可，不触碰数据库或线上对象。
