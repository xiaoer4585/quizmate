// 2026-08-25-fix Windows 发布入口（悬浮框防捕获修复版 2026.8.25）
// 发布目录固定使用 releases/2026-08-25-fix（releases/2026-08-25 已被 8.23 归档占用）。
// 注意：运行前需先把官网 3 个页面的 Windows 下载链接更新为 QuizMate-Windows-2026.8.25.exe，
// 否则预检会失败（详见 releases/2026-08-25-fix/README.md）。
const path = require('path');

process.env.QUIZMATE_RELEASE_DIR = path.join(
  __dirname,
  '../../windows客户端/QuizMate-Windows/releases/2026-08-25-fix',
);
process.env.QUIZMATE_UPDATE_BASE_URL = process.env.QUIZMATE_UPDATE_BASE_URL || 'https://www.quizmate.cn';
process.env.QUIZMATE_PUBLIC_BASE_URL = process.env.QUIZMATE_PUBLIC_BASE_URL || 'https://www.quizmate.cn';

if (!process.argv.includes('--version')) {
  process.argv.push('--version', '2026.8.25');
}

require('./deploy-windows-release.cjs');
