const fs = require('fs');
const path = require('path');
const R = 'D:\\DISCORD BOT\\AA HOST\\Peace\u2718 \u1D3E\u1D3F\u1D3C hosting';
const cwd = path.join(R, 'src', 'commands');

function walk(d, acc) {
  for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(js|cjs)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}
const files = walk(cwd, []);
let count = 0;
const names = new Set();
const byFile = [];
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const locals = [];
  let m;
  const rx =
    /(?:setName|name|data\.name)\s*\(?\s*['"](\w+)['"]\s*\)?/g;
  while ((m = rx.exec(s))) {
    const v = m[1];
    if (!['data', 'name', 'value'].includes(v)) locals.push(v);
  }
  const un = [...new Set(locals)];
  let added = 0;
  for (const v of un) {
    // keep only values that look like slash command names (lowercase, known dir context)
    if (/^[a-z][a-z0-9_-]*$/.test(v) && v !== 'options') {
      if (!names.has(v)) { names.add(v); added++; }
    }
  }
  if (added) { count += added; byFile.push([added, f]); }
}
byFile.sort((a, b) => b[0] - a[0]);
console.log('FILES WITH COMMANDS:', byFile.length, 'of', files.length);
console.log('TOTAL SLASH-COMMAND NAMES (unique):', count);
console.log('── by file ──');
for (const [k, f] of byFile) {
  console.log('  ' + String(k).padStart(3) + '  ' + f.replace(cwd + '\\', '').replace(/\\/g, ' > '));
}
