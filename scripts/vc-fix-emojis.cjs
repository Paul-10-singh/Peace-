const fs = require('fs');
const path = require('path');
const ROOT = 'D:\\DISCORD BOT\\AA HOST\\Peace\u2718 \u1D3E\u1D3F\u1D3C hosting';
const EMOJI_JS = path.join(ROOT, 'src', 'utils', 'vc', 'emojis.js');
const TRACKER = path.join(ROOT, 'src', 'utils', 'vcTracker.js');
const MOCKFILE = path.join(ROOT, 'mockup.txt');
const EMOJIS_MKDIR = path.join(ROOT, 'src', 'utils', 'vc');
const EMOJI_JS_ABS = path.join(EMOJIS_MKDIR, 'emojis.js');

const src = fs.readFileSync(TRACKER, 'utf8');
const block = src.match(/const E = \{([\s\S]*?)\n\};/);
if (!block) throw new Error('Cannot locate E registry in vcTracker.js');
const stored = {};
for (const line of block[1].split('\n')) {
  const m = line.match(/^\s*(\w+)\s*:\s*('(<a?:\w+:\d+>)')\s*,?\s*$/);
  if (m) stored[m[1]] = m[2];
}
if (Object.keys(stored).length !== 11) {
  throw new Error('Expected 11 stored customs, got ' + Object.keys(stored).length);
}
const lines = Object.keys(stored).map((k) => `  ${k}: ${JSON.stringify(stored[k])},`);
const body = `const E = {\n${lines.join('\n')}\n};\n\nmodule.exports = { E };\n`;
fs.writeFileSync(EMOJI_JS_ABS, body, 'utf8');

const ok = (() => {
  try {
    const m = require(EMOJI_JS_ABS);
    return Object.keys(m.E).length === 11;
  } catch (e) {
    return 'ERR: ' + e.message;
  }
})();
console.log('emojis.js rewrote · require-check:', ok);
console.log('values sample:', require(EMOJI_JS_ABS).E.correct);
const mock = fs.readFileSync(MOCKFILE, 'utf8');
console.log('mockup.txt bytes:', mock.length, '· v3 marker:', mock.includes('v3 (EMOJI-READY)'));
console.log('stored-custom occurrences in mockup:', (mock.match(/<a?:\w+:\d+>/g) || []).length);