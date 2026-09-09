const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../out');
const main = fs.readFileSync(path.join(root, 'main/index.js'), 'utf8');
for (const value of ['isLikelyInterviewQuestion', 'isLikelyIncompleteInterviewFragment', 'ASR_FRAGMENT_SETTLE_MS', 'getAsrConfig', 'X-Api-Key', 'CONTEXT_OMISSION_MARKER']) {
  if (main.includes(value)) throw new Error(`Private/legacy implementation leaked into Windows bundle: ${value}`);
}
for (const value of ['openInterviewSession', 'ingestInterviewTranscript', 'createVoiceProxyTicket']) {
  if (!main.includes(value)) throw new Error(`Protected transport missing: ${value}`);
}
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(p);
    else if (/\.(map|ts|tsx)$/.test(entry.name)) throw new Error(`Source artifact included: ${p}`);
  }
}
scan(root);
console.log('PROTECTED_BUILD_OK: no legacy question policy, provider key API, or source maps in Windows output');
