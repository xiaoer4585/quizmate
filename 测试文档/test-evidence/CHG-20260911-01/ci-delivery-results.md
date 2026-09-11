# CHG-20260911-01 Mac 双架构 CI 与交付结果

- 构建提交：`6b28c63162e44703e8d3dcee89febc04bebe0f65`
- 隔离分支：`codex/mac-companion-test-20260911`
- 测试标签：`mac-delivery-20260911-companion-1`
- GitHub Actions：[运行 34606435578](https://github.com/xiaoer4585/quizmate/actions/runs/34606435578)
- 结果：Apple Silicon 3m54s、Intel 9m55s，两个 job 全部成功。
- 临时对象前缀：`quizmate-cn/temp/mac-delivery-20260911-companion-1/`；不属于正式下载或自动更新路径。

## CI 门禁

| 检查 | Apple Silicon | Intel |
|---|---|---|
| 共享测试 | 69/69 通过 | 69/69 通过 |
| MacProtection | 4/4 通过 | 4/4 通过 |
| Node/Web 类型检查 | 通过 | 通过 |
| Electron production build | 通过 | 通过 |
| Mach-O | arm64 | x86_64 |
| 签名 | ad-hoc，TeamIdentifier 未设置 | ad-hoc，TeamIdentifier 未设置 |
| 可执行宿主 entitlement | 5/5 含测试签名所需 library-validation 例外 | 5/5 含测试签名所需 library-validation 例外 |
| 启动冒烟 | macOS 26 保持运行 10 秒 | macOS 26 保持运行 10 秒 |

工作流明确给出测试签名警告：Gatekeeper、稳定 TCC 身份、自动更新资格和 Apple 公证均未声明。`npm audit` 对当前锁定依赖返回既有非零结果，但工作流按既定策略记录警告而不阻断；本变更未新增或升级依赖。

## 本地交付文件与完整性

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `QuizMate-Mac-Apple-Silicon-2026.09.11.dmg` | 109,495,559 | `505ae3f7beb0b2f499efe158e57b69259e86b0efad75ec1f4a1688f3bf27e497` |
| `QuizMate-Mac-arm64-2026.09.11.zip` | 105,328,630 | `cc25b5d6e551db9e03702d7fba53eb04cb749818150206a5acd586c3a4be69ce` |
| `QuizMate-Mac-Intel-2026.09.11.dmg` | 117,906,264 | `9046a87add3879fe9951cc2f2491d4ffbccff3833dc7fb226f9c409f171fade7` |
| `QuizMate-Mac-x64-2026.09.11.zip` | 112,324,251 | `fc500aefe018c5295687e7bfbe7b210d5cdeab3585bca09bacecce91f3bd69a9` |

- 四个本地文件重新计算的 SHA-256 均与各架构 CI `build.log` 完全一致。
- 四个隔离对象以 `Range: bytes=0-1023` 回读均得到 HTTP 206 和 1024 字节。
- 本地交付目录：`E:/ai项目/考试插件/交付包/CHG-20260911-01-Mac双机协作/`。
- 交付后只读检查 `https://quizmate.cn/mac/latest-mac.yml` 仍为 `2026.9.6000`，生产自动更新清单未切换。

## 未执行/阻塞

- 实体 Mac 安装、覆盖升级、卸载/重装、Gatekeeper 交互和旧版降级。
- 屏幕录制、麦克风、电脑声音权限的允许/拒绝/恢复；真实三张截图搜题与真实面试音频。
- 实体手机扫码、连接码、断线重连、关闭阅读器和长答案交互。
- 真实账号 AI、积分扣减/流水、账号切换和端到端回滚对账。

以上项目必须由用户在对应芯片实体 Mac 上验收，状态保持“阻塞”，不能由 CI 替代。
