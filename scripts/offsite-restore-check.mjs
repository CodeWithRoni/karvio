// Restore test for a .karvio.gz backup: restores it into a fresh, empty Karvio database (in memory,
// every migration applied) through the same restore path the app uses, then checks every table's row
// count against the backup header. Nothing is sent anywhere; the live shop is not touched.
//
//   node scripts/offsite-restore-check.mjs <backup.karvio.gz>
import fs from 'node:fs';
import path from 'node:path';
import {freshDatabase, apiClient} from '../backend/test/pg-harness.mjs';
import {restoreStreamBackup, inspectStreamingBackup, backupLines} from '../frontend/src/lib/backupStream.js';

const keyOf = (table, record) => table === 'Settings' ? record.key : record.id;
const strip = ({_position, ...rest}) => rest;
const sorted = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a < b ? -1 : 1));
const restoreTrace = (table, r) => (table === 'Settings' && r.key === 'last_restore_at') || (table === 'AuditLog' && r.action === 'database_restore');
const expected = t => t.restored + t.changed + t.missing;

export async function checkRestore(filePath) {
  const file = new File([fs.readFileSync(filePath)], path.basename(filePath));
  const manifest = await inspectStreamingBackup(file);
  const db = await freshDatabase();
  const password = 'restore-check-' + crypto.randomUUID();
  const client = await apiClient(db, {password});
  const store = new Map();
  const storage = {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k)};
  await restoreStreamBackup(file, {call: (a, p) => client.q(a, p), credentials: {password, confirm: 'RESTORE'}, storage, key: 'offsite-check', pace: 0,
    // pg_cron runs the restore worker on Supabase; here it is run directly.
    wait: async () => { await db.query('select karvio_private.transfer_restore_worker()'); }});
  // Every row of the backup must come back unchanged (row positions are renumbered by the restore).
  // The restore itself adds only its own trace: Settings.last_restore_at and a database_restore audit row.
  const backupRows = new Map(manifest.tables.map(t => [t.name, new Map()]));
  for await (const line of backupLines(file)) {
    const part = JSON.parse(line);
    if (part.kind !== 'rows') continue;
    for (const record of JSON.parse(part.payload)) backupRows.get(part.table).set(keyOf(part.table, record), strip(record));
  }
  const tables = [];
  for (const t of manifest.tables) {
    const restored = (await db.query(`select to_jsonb(x) as r from public."${t.name.replace(/"/g, '')}" x`)).rows.map(r => r.r);
    const expected = backupRows.get(t.name);
    let same = 0, changed = 0, added = 0;
    for (const record of restored) {
      const key = keyOf(t.name, record), want = expected.get(key);
      if (want === undefined) { if (!restoreTrace(t.name, record)) added++; continue; }
      if (JSON.stringify(sorted(strip(record))) === JSON.stringify(sorted(want))) same++;
      else if (!(t.name === 'Settings' && key === 'last_restore_at')) changed++;
      else same++;
    }
    const missing = expected.size - same - changed;
    tables.push({name: t.name, backup: t.rows, restored: same, changed, missing, added});
  }
  await db.close();
  const wrong = tables.filter(t => t.backup !== expected(t) || t.changed || t.missing || t.added);
  return {ok: wrong.length === 0, manifest, tables, wrong};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2];
  if (!target) { console.error('Usage: node scripts/offsite-restore-check.mjs <backup.karvio.gz>'); process.exit(2); }
  const {ok, manifest, tables, wrong} = await checkRestore(target);
  for (const t of tables) console.log(`${wrong.includes(t) ? 'FAIL' : 'ok  '} ${t.name.padEnd(20)} ${t.restored}/${t.backup} identical` + (t.changed || t.missing || t.added ? ` (changed ${t.changed}, missing ${t.missing}, unexpected ${t.added})` : ''));
  if (!ok) { console.error(`Restore check FAILED for ${wrong.map(t => t.name).join(', ')}`); process.exit(1); }
  console.log(`Restore check passed: ${manifest.total_rows} rows restored into an empty database (backup made ${manifest.created_at}, app ${manifest.app_version || '?'}).`);
}
