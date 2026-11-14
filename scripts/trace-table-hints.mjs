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
const files = [...new Set(['test:supabase', 'test:performance'].flatMap(k => [...pkg.scripts[k].matchAll(/node (\.\.\/backend\/test\/[\w.-]+\.m?js)/g)].map(m => m[1])))];
const out = path.join(root, '.trace-tables.jsonl');
fs.rmSync(out, {force: true});
const env = {...process.env, KARVIO_TRACE_OUT: out, NODE_OPTIONS: `--import ${path.join(root, 'scripts/trace-table-preload.mjs')}`};
for (const f of files) execFileSync(process.execPath, [f], {cwd: path.join(root, 'frontend'), env, stdio: 'ignore'});
execFileSync(process.execPath, ['../backend/test/load-test.mjs'], {cwd: path.join(root, 'frontend'), stdio: 'ignore',
  env: {...env, KARVIO_LOAD_SALES: '200', KARVIO_LOAD_CUSTOMERS: '40', KARVIO_LOAD_PRODUCTS: '40', KARVIO_LOAD_ROUNDS: '1', KARVIO_LOAD_REPEAT: '1'}});
const merged = {};
for (const line of fs.readFileSync(out, 'utf8').split('\n').filter(Boolean))
  for (const [action, tables] of Object.entries(JSON.parse(line))) tables.forEach(t => (merged[action] ||= new Set()).add(t));
fs.rmSync(out, {force: true});
const scopePath = path.join(root, 'supabase/functions/karvio-api/scope.mjs');
const {ROW_SCOPED_ACTIONS, ALWAYS_TABLES} = await import(scopePath);
const hints = Object.fromEntries(Object.entries(merged)
  .filter(([a]) => !ROW_SCOPED_ACTIONS.has(a) && a !== 'owner.initialize' && a !== 'ping' && a !== 'reports')
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([a, s]) => [a, [...s].filter(t => !ALWAYS_TABLES.includes(t)).sort()]));
const body = 'export const TABLE_HINTS = {\n' + Object.entries(hints).map(([a, t]) => `  '${a}': [${t.map(x => `'${x}'`).join(', ')}],`).join('\n') + '\n};\n';
const src = fs.readFileSync(scopePath, 'utf8').replace(/export const TABLE_HINTS = \{[\s\S]*?\n\};\n|export const TABLE_HINTS = \{\};\n/, body);
fs.writeFileSync(scopePath, src);
console.log(`Traced ${files.length} test files: ${Object.keys(hints).length} actions now have table hints.`);
