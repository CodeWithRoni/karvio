// Append-only log reads: a save that only adds an AuditLog / ItemEvents / SmsLog row reads the log's
// last row position instead of every row. Appends land exactly where a whole-table read would put
// them, and any read of a log row that was not loaded re-runs the request with the rows.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';
import {APPEND_HINTS, TABLE_HINTS} from '../../supabase/functions/karvio-api/scope.mjs';
import {createRuntime} from '../../supabase/functions/karvio-api/runtime.mjs';

let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

// ---------- runtime: placeholders behave like the stored rows until one is touched ----------
{
  const snap = pos => ({revision: 1, metadata: {properties: {}, cache: {}}, tables: {Users: []}, loadedTables: ['Users'], appendPositions: {AuditLog: pos}});
  const rt = createRuntime(snap(7), {deltaOnly: true});
  const sheet = rt.book.getSheetByName('AuditLog');
  eq(sheet.getLastRow(), 7, 'getLastRow = last stored position');
  eq(sheet.getRange(1, 1, 1, 5).getValues()[0], ['id', 'ts', 'user', 'action', 'detail'], 'header readable');
  sheet.appendRow(['new-id', '2026-11-15T10:00:00', 'Owner', 'test', '{}']);
  eq(sheet.getLastRow(), 8, 'append after the last stored row');
  eq(sheet.getRange(8, 1, 1, 5).getValues()[0][0], 'new-id', 'own new row readable');
  const attempts = {
    read: s => s.getRange(3, 1, 1, 5).getValues(), 'data range': s => s.getDataRange().getValues(),
    overwrite: s => s.getRange(4, 1, 1, 1).setValues([['x']]), delete: s => s.deleteRow(2), clear: s => s.clearContents()};
  for (const [what, fn] of Object.entries(attempts)) {
    const r = createRuntime(snap(7), {deltaOnly: true});
    assert.throws(() => fn(r.book.getSheetByName('AuditLog')), /unloaded table: AuditLog/, what); checks++;
  }
  const empty = createRuntime(snap(1), {deltaOnly: true}).book.getSheetByName('AuditLog');
  eq(empty.getLastRow(), 1, 'empty log: header only');
}

// ---------- through the API ----------
const db = await freshDatabase();
const calls = [];
const c = await apiClient(db, {onCall: x => calls.push(x)});
const {q, metrics} = c;
for (let i = 0; i < 40; i++) await q('customer.save', {name: `Log customer ${i}`});
// Older shops have gaps in row positions (deleted rows); appends must still go after the last one.
await db.exec(`insert into public."AuditLog"(_position,id,ts,"user",action,detail)
  select 5000 + g * 3, 'gap-' || g, '2026-01-01T00:00:00', 'Old', 'old', repeat('x', 400) from generate_series(1, 400) g`);
const before = (await db.query(`select _position, id, ts, "user", action, detail from public."AuditLog" order by _position`)).rows;
const maxBefore = Number(before.at(-1)._position);

ok(APPEND_HINTS['customer.save']?.includes('AuditLog') && TABLE_HINTS['customer.save'].includes('AuditLog'), 'customer.save appends to AuditLog only');
calls.length = 0; metrics.length = 0;
await q('customer.save', {name: 'Appended customer', opening_balance: 250}); // audited (opening balance)
const read = calls.find(x => x.name === 'karvio_read');
eq(read.args.append_names, ['AuditLog'], 'read asks only for the AuditLog position');
ok(!read.args.table_names.includes('AuditLog'), 'AuditLog rows not read');
eq(read.result.appendPositions, {AuditLog: maxBefore}, 'last position returned');
const logBytes = Number((await db.query(`select sum(octet_length(to_jsonb(x)::text)) n from public."AuditLog" x`)).rows[0].n);
ok(read.bytes < logBytes, `read (${read.bytes} B) smaller than the log alone (${logBytes} B)`);
eq(metrics.at(-1).attempts, 1, 'one run, no re-run');
const after = (await db.query(`select _position, id, ts, "user", action, detail from public."AuditLog" order by _position`)).rows;
eq(after.slice(0, before.length), before, 'existing log rows unchanged');
eq(after.length, before.length + 1, "one row added");
eq(Number(after.at(-1)._position), maxBefore + 1, 'added after the last stored position');
eq(after.at(-1).action, 'customer_opening_balance', 'the new audit entry');

// A wrong hint (an action that reads the log) is caught: the request re-runs with the rows and
// answers exactly like a whole-table read.
const plain = await q('database.info');
const saved = APPEND_HINTS['database.info'];
APPEND_HINTS['database.info'] = ['AuditLog', 'ItemEvents', 'SmsLog'];
try {
  const c2 = await apiClient(db, {onCall: x => calls.push(x)});
  calls.length = 0;
  const forced = await c2.q('database.info');
  eq(forced, plain, 'same answer when the log had to be loaded');
  ok(c2.metrics.at(-1).attempts >= 2 && c2.metrics.at(-1).widened >= 1, 'request re-ran with the rows');
  const reads = calls.filter(x => x.name === 'karvio_read');
  ok(reads.length >= 2 && reads.at(-1).args.table_names.includes('AuditLog'), 'second read loaded AuditLog');
  // The gateway remembers it for this action.
  calls.length = 0;
  await c2.q('database.info');
  ok(calls.filter(x => x.name === 'karvio_read').length === 1, 'learned: one read next time');
} finally {
  if (saved) APPEND_HINTS['database.info'] = saved; else delete APPEND_HINTS['database.info'];
}

// The database refuses append positions for anything but the three logs.
await assert.rejects(db.query(`select public.karvio_read('tables', 'x', '{}', array['Users'], '{}', array['Sales'])`), /Invalid append table/); checks++;

console.log(`Append-only logs: ${checks} checks passed (positions, gaps, untouched rows, re-run on a wrong hint, small reads).`);
