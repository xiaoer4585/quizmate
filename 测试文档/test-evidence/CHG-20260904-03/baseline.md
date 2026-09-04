# CHG-20260904-03 修改前基线

- 时间：2026-09-04 +08:00
- Git HEAD：`4d34c9e401811f63f869fc8b5056bd49f52b1329`
- 当前 Windows 内部版本：`2026.9.4000`
- 工作区边界：保留 CHG-20260904-02 和其他既有未提交修改；本轮不回退、不覆盖、不发布这些内容。

## 修改前文件 SHA-256

| 文件 | SHA-256 |
|---|---|
| `desktop-core/electron/main.ts` | `AA7B1F542A853D94E790BBD196B249363B8A9194DAE876F0FF99B591B330C4DF` |
| `desktop-core/shared/shortcuts.ts` | `49A0CEA9B43A8DD8B589DD9EBF6B7EE68E7B5E8EDB2FCC048C454165B4BC30A1` |
| `desktop-core/electron/ShortcutsHelper.ts` | `F650A43C5E8AC448D6C23B88B49BA3EDB96BE315FA2406B952E9663AD0DA1034` |
| `desktop-core/src/components/ShortcutSettings.tsx` | `002F4DBE54D2422513D0A878F64262BF8F4F860929C6A47C92EA8EEF9C7668D0` |
| `desktop-core/electron/ipcHandlers.ts` | `5B8BBF20D3D23FCBC55D3FBD78C7D1C1CE9C18C3E91B499A8FECEE4F701330FA` |
| `desktop-core/shared/overlay-state.ts` | `F48DEEA366719884B8E81616956B9409108EC33B4E2018C00B3D0CD88F6EFB70` |
| `desktop-core/shared/__tests__/assistant-overlays.test.ts` | `9F606FCCAC83A3C3029F5AC9D348EAFC37ADAC4EA3EE8730111C6FA66EAA1A10` |

## 已知问题与回滚边界

- `handleShortcutAction('search')` 无条件调用 `launchExamClient()`，因此语音播报模式按 Alt+E 会创建笔试悬浮框。
- 语音模式仅在截图队列为空时自动截图；失败重试或旧截图残留时可能继续分析旧图，不符合“每次 Alt+E 都是新截图搜题”。
- 当前冲突检查只比较 QuizMate 已绑定组合并返回冲突 action；不区分系统/笔试/面试来源，也不检查 Windows/macOS 常用系统快捷键。
- 回滚仅恢复客户端纯代码和测试文档；无外部状态、数据库或线上对象需要处理。
