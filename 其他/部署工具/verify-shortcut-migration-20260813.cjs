const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const targets = [
  {
    platform: 'windows',
    shortcuts: 'windows客户端/QuizMate-Windows/shared/shortcuts.ts',
    helper: 'windows客户端/QuizMate-Windows/electron/ShortcutsHelper.ts',
    defaults: ["screenshot: 'Alt+Q'", "search: 'Alt+E'"],
    migrations: ["=== 'ctrl+w'", "=== 'ctrl+e'"]
  },
  {
    platform: 'mac',
    shortcuts: 'mac客户端/QuizMate-Mac/shared/shortcuts.ts',
    helper: 'mac客户端/QuizMate-Mac/electron/ShortcutsHelper.ts',
    defaults: ["screenshot: 'Alt+Q'", "search: 'Alt+E'"],
    migrations: ["=== 'command+w'", "=== 'command+e'"]
  }
];

for (const target of targets) {
  const shortcuts = fs.readFileSync(path.join(root, target.shortcuts), 'utf8');
  const helper = fs.readFileSync(path.join(root, target.helper), 'utf8');
  for (const expected of target.defaults) {
    if (!shortcuts.includes(expected)) throw new Error(`${target.platform} missing default: ${expected}`);
  }
  for (const expected of target.migrations) {
    if (!helper.includes(expected)) throw new Error(`${target.platform} missing migration: ${expected}`);
  }
  if (!helper.includes('replacement') && target.platform === 'mac') throw new Error('mac migration must preserve custom values');
  if (!helper.includes('const migrated = { ...stored }') && target.platform === 'windows') throw new Error('windows migration must preserve custom values');
}

process.stdout.write('SHORTCUT_MIGRATION_OK\n');
