// Loaded with node --import by scripts/trace-table-hints.mjs: records which business tables
// each API action opened when it ran against the whole shop.
import fs from 'node:fs';
const out = process.env.KARVIO_TRACE_OUT;
const seen = new Map();
globalThis.__karvioTrace = (action, touched, loadedTables) => {
  if (!out || loadedTables || !Array.isArray(touched)) return; // only complete (whole-shop) runs
  const set = seen.get(action) || new Set();
  touched.forEach(t => set.add(t));
  seen.set(action, set);
};
process.on('exit', () => {
  if (!out || !seen.size) return;
  fs.appendFileSync(out, JSON.stringify(Object.fromEntries([...seen].map(([a, s]) => [a, [...s]]))) + '\n');
});
