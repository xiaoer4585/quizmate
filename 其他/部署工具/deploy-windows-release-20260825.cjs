// 2026-08-25 Windows 发布入口
// 固定使用 releases/2026-08-25 目录中的 2026.8.23 线上安装包。
const path = require('path');

process.env.QUIZMATE_RELEASE_DIR = path.join(
  __dirname,
  '../../windows客户端/QuizMate-Windows/releases/2026-08-25',
);
process.env.QUIZMATE_UPDATE_BASE_URL = process.env.QUIZMATE_UPDATE_BASE_URL || 'https://quizmate.cn';
process.env.QUIZMATE_PUBLIC_BASE_URL = process.env.QUIZMATE_PUBLIC_BASE_URL || 'https://quizmate.cn';

if (!process.argv.includes('--version')) {
  process.argv.push('--version', '2026.8.23');
}

require('./deploy-windows-release.cjs');
