// Loaded with node --import by scripts/trace-table-hints.mjs: records which business tables
// each API action opened when it ran against the whole shop.
import fs from 'node:fs';
const out = process.env.KARVIO_TRACE_OUT;
const seen = new Map();
// Read the whole shop while tracing, so every table an action uses is seen (not just the hinted ones).
globalThis.__karvioTraceWholeShop = true;
globalThis.__karvioTrace = (action, touched, loadedTables, missing = [], read = [], unread = []) => {
  if (!out || !Array.isArray(touched) || missing.length) return; // only runs that completed
  const set = seen.get(action) || new Set();
  // Business tables only from whole-shop runs (a narrow run cannot show what it did not load);
  // private sheets ('#name') from any completed run.
  touched.forEach(t => { if (t.startsWith('#') || !loadedTables) set.add(t); });
  // '!name': the action read stored rows of that table (so it is not append-only).
  // '?name': it had stored rows there and did not read them (evidence that it only appends).
  if (!loadedTables) { read.forEach(t => set.add('!' + t)); unread.forEach(t => set.add('?' + t)); }
  seen.set(action, set);
};
process.on('exit', () => {
  if (!out || !seen.size) return;
  fs.appendFileSync(out, JSON.stringify(Object.fromEntries([...seen].map(([a, s]) => [a, [...s]]))) + '\n');
});
