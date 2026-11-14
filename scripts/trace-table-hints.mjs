// Regenerates TABLE_HINTS in supabase/functions/karvio-api/scope.mjs.
// Runs every Supabase backend test with a tracer, then keeps, per action, the union of the
// business tables it opened. Actions with their own SQL row filters are left to those filters.
//   node scripts/trace-table-hints.mjs
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'frontend/package.json'), 'utf8'));
// read-cache.mjs checks reused answers, which tracing turns off (every request must run the engine).
const files = [...new Set(['test:supabase', 'test:performance'].flatMap(k => [...pkg.scripts[k].matchAll(/node (\.\.\/backend\/test\/[\w.-]+\.m?js)/g)].map(m => m[1])))]
  .filter(f => !f.endsWith('/read-cache.mjs'));
const out = path.join(root, '.trace-tables.jsonl');
fs.rmSync(out, {force: true});
const env = {...process.env, KARVIO_TRACE_OUT: out, NODE_OPTIONS: `--import ${path.join(root, 'scripts/trace-table-preload.mjs')}`};
for (const f of files) {
  try { execFileSync(process.execPath, [f], {cwd: path.join(root, 'frontend'), env, stdio: 'pipe'}); }
  catch (e) { throw new Error(`${f} failed while tracing:\n${String(e.stderr || e.stdout || e.message).slice(-2000)}`); }
}
execFileSync(process.execPath, ['../backend/test/load-test.mjs'], {cwd: path.join(root, 'frontend'), stdio: 'ignore',
  env: {...env, KARVIO_LOAD_SALES: '200', KARVIO_LOAD_CUSTOMERS: '40', KARVIO_LOAD_PRODUCTS: '40', KARVIO_LOAD_ROUNDS: '1', KARVIO_LOAD_REPEAT: '1'}});
const merged = {};
for (const line of fs.readFileSync(out, 'utf8').split('\n').filter(Boolean))
  for (const [action, tables] of Object.entries(JSON.parse(line))) tables.forEach(t => (merged[action] ||= new Set()).add(t));
fs.rmSync(out, {force: true});
const scopePath = path.join(root, 'supabase/functions/karvio-api/scope.mjs');
const {ROW_SCOPED_ACTIONS, ALWAYS_TABLES, DEFAULT_PRIVATE} = await import(scopePath);
const sorted = Object.entries(merged).sort(([a], [b]) => a.localeCompare(b));
const hints = Object.fromEntries(sorted
  .filter(([a, s]) => !ROW_SCOPED_ACTIONS.has(a) && a !== 'owner.initialize' && a !== 'ping' && a !== 'reports' && [...s].some(t => !t.startsWith('#')))
  .map(([a, s]) => [a, [...s].filter(t => !t.startsWith('#') && !ALWAYS_TABLES.includes(t)).sort()]));
const privateHints = Object.fromEntries(sorted
  .map(([a, s]) => [a, [...s].filter(t => t.startsWith('#')).map(t => t.slice(1)).filter(t => /^__Karvio[A-Za-z]+$/.test(t) && !DEFAULT_PRIVATE.includes(t)).sort()])
  .filter(([, t]) => t.length));
const render = (name, map) => `export const ${name} = {\n` + Object.entries(map).map(([a, t]) => `  '${a}': [${t.map(x => `'${x}'`).join(', ')}],`).join('\n') + '\n};\n';
let src = fs.readFileSync(scopePath, 'utf8');
for (const [name, map] of [['TABLE_HINTS', hints], ['PRIVATE_HINTS', privateHints]])
  src = src.replace(new RegExp(`export const ${name} = \\{(?:\\};|\\n[\\s\\S]*?\\n\\};)\\n`), render(name, map));
fs.writeFileSync(scopePath, src);
console.log(`Traced ${files.length} test files: ${Object.keys(hints).length} actions have table hints, ${Object.keys(privateHints).length} read request receipts.`);
