const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('官网模块/正式官网-quizmate.vip/admin-web/index.html', 'utf8');
const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const inline = matches.map((m) => m[1]);
const last = inline[inline.length - 1];
try {
  new vm.Script(last, { filename: 'admin-web-inline.js' });
  console.log('OK ' + last.length + ' chars, ' + inline.length + ' inline scripts');
} catch (e) {
  console.error('SYNTAX ERROR:', e.message);
  process.exit(1);
}
