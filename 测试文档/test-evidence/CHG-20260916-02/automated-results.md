# CHG-20260916-02 自动化结果

执行目录：`windows客户端/QuizMate-Windows`。

| 检查 | 结果 |
|---|---|
| `npm run typecheck:node` | 通过 |
| `npm run typecheck:web` | 通过 |
| `npm run test:shared` | 通过，10 个测试文件、76 个测试 |
| `npm run package:win` | 通过，Windows ia32 NSIS，版本 `2026.9.16001` |
| `node scripts/verify-packaged-app.cjs release/win-ia32-unpacked` | 通过：`PACKAGED_APP_OK version=2026.9.16001 arch=i386 asar=46527257` |
| `git diff --check` | 通过 |

## 测试包

- 路径：`windows客户端/QuizMate-Windows/release/QuizMate-Windows-2026.9.16001.exe`
- SHA-256：`7E84785DEF8CDD3230282D5713290A86AE9E0E4B5636AC1D524F41D730F30EF6`
- 体积：`82,817,085` bytes
- 更新元数据：`release/latest.yml` 仅作为本地构建产物存在，未上传。

## 待用户实机验收

`COMPANION-CAPTURE-MODE-002/003/004/006/007/008/009`、`WIN-011/012/014` 需要 Windows 实机、双机手机、屏幕录制/投屏和多显示器环境；当前不将这些项目标记为通过。签名、安装卸载和生产更新仍未执行。
