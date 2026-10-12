const fs = require('fs');
const path = require('path');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== 'dist') walk(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function unquote(s) {
  if (!s) return '';
  const q = s[0];
  let inner = s.slice(1, -1);
  if (q === "'" || q === '"') {
    return inner.replace(/\\([\\'"nrt])/g, (_, c) => {
      if (c === 'n') return '\n';
      if (c === 't') return '\t';
      return c;
    });
  }
  // template without ${
  return inner.replace(/\\`/g, '`').replace(/\\\$/g, '$');
}

const files = walk('src');
const re =
  /showToast\(\s*('(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`)\s*,\s*('(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`)/g;
const pairs = new Map();

for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  let m;
  const r = new RegExp(re.source, 'g');
  while ((m = r.exec(t))) {
    const rawTitle = m[1];
    const rawMsg = m[2];
    if (rawTitle.includes('${') || rawMsg.includes('${')) continue;
    const title = unquote(rawTitle);
    const message = unquote(rawMsg);
    const key = title + '|||' + message;
    if (!pairs.has(key)) pairs.set(key, { title, message, file: f.replace(/\\/g, '/') });
  }
}

const arr = [...pairs.values()].sort((a, b) => a.title.localeCompare(b.title));
fs.writeFileSync('scripts/toast-inventory.json', JSON.stringify(arr, null, 2));
console.log('static_pairs', arr.length);
console.log('wrote scripts/toast-inventory.json');
