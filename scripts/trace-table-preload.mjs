// Loaded with node --import by scripts/trace-table-hints.mjs: records which business tables
// each API action opened when it ran against the whole shop.
import fs from 'node:fs';
const out = process.env.KARVIO_TRACE_OUT;
const seen = new Map();
// Read the whole shop while tracing, so every table an action uses is seen (not just the hinted ones).
globalThis.__karvioTraceWholeShop = true;
globalThis.__karvioTrace = (action, touched, loadedTables, missing = []) => {
  if (!out || !Array.isArray(touched) || missing.length) return; // only runs that completed
  const set = seen.get(action) || new Set();
  // Business tables only from whole-shop runs (a narrow run cannot show what it did not load);
  // private sheets ('#name') from any completed run.
  touched.forEach(t => { if (t.startsWith('#') || !loadedTables) set.add(t); });
  seen.set(action, set);
};
process.on('exit', () => {
  if (!out || !seen.size) return;
  fs.appendFileSync(out, JSON.stringify(Object.fromEntries([...seen].map(([a, s]) => [a, [...s]]))) + '\n');
});
