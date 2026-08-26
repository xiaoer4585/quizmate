// 构建壳与 desktop-core 的依赖桥接：
// desktop-core 位于仓库共享层，其源码 import 的依赖（electron/uuid/axios 等）
// 安装在各构建壳的 node_modules 中。由于 Node/Vite/Rollup 的模块解析只向上查找
// 祖先目录的 node_modules，这里在 desktop-core 下创建指向本壳 node_modules 的
// junction（Windows）/符号链接（macOS/Linux），使共享层在本地与 CI 均可解析。
//
// 说明：个别文件系统（如 exFAT）不支持符号链接，此时仅告警退出，
// 由 tsconfig 的 paths 兜底（typecheck 可用），vite 构建交给 GitHub CI。
const fs = require('node:fs');
const path = require('node:path');

const coreDir = path.resolve(__dirname, '..', '..', '..', 'desktop-core');
const linkPath = path.join(coreDir, 'node_modules');
const targetPath = path.resolve(__dirname, '..', 'node_modules');

if (!fs.existsSync(targetPath)) {
  console.error(`[link-core] node_modules not found at ${targetPath}; run npm install first.`);
  process.exit(1);
}

try {
  if (fs.existsSync(linkPath)) {
    const st = fs.lstatSync(linkPath);
    if (st.isSymbolicLink()) {
      fs.rmSync(linkPath, { recursive: true, force: true });
    } else {
      // 真实目录（例如手动误装依赖），直接报错避免覆盖
      console.error(`[link-core] ${linkPath} exists and is not a symlink; refusing to overwrite.`);
      process.exit(1);
    }
  }
  fs.symlinkSync(targetPath, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
  console.log(`[link-core] linked ${linkPath} -> ${targetPath}`);
} catch (error) {
  const code = error && error.code;
  // EPERM/EISDIR/EINVAL/ENOSYS: 文件系统或权限不支持符号链接（exFAT 等）
  const unsupported = ['EPERM', 'EISDIR', 'EINVAL', 'ENOSYS', 'EACCES', 'EWOULDBLOCK'].includes(code);
  if (unsupported) {
    console.warn(`[link-core] filesystem does not support symlinks (${code}); ` +
      'typecheck falls back to tsconfig paths, vite build must run on CI.');
    process.exit(0);
  }
  console.error(`[link-core] failed to link node_modules: ${error && error.message}`);
  process.exit(1);
}
