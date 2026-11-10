// Fail packaging if the built entry or one of its local JS/CSS imports is missing.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const entry = resolve(dist, 'index.html');
if (!existsSync(entry)) throw new Error('Build index.html is missing. Run npm run build first.');
const missing = new Set();
const check = (file, ref) => {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(ref)) return;
  const clean = ref.split(/[?#]/)[0];
  const target = clean.startsWith('/') ? resolve(dist, '.' + clean) : resolve(dirname(file), clean);
  if (!existsSync(target)) missing.add(`${file}: ${ref}`);
};
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)]);
for (const file of walk(dist)) {
  const ext = extname(file);
  if (!['.html', '.js', '.css', '.webmanifest'].includes(ext)) continue;
  const text = readFileSync(file, 'utf8');
  if (ext === '.html') for (const m of text.matchAll(/(?:src|href)=["']([^"']+)["']/g)) check(file, m[1]);
  if (ext === '.js') for (const m of text.matchAll(/(?:from\s*|import\(\s*)["'](\.[^"']+)["']/g)) check(file, m[1]);
  if (ext === '.css') for (const m of text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) check(file, m[1]);
  if (ext === '.webmanifest') for (const icon of JSON.parse(text).icons || []) check(file, icon.src);
}
if (missing.size) throw new Error('Incomplete build:\n' + [...missing].join('\n'));
console.log('Built entry, JS/CSS imports, fonts and manifest icons are present.');
