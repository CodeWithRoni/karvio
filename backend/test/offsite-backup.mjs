// Off-site backup: the workflow's file is byte-for-byte the app's backup format, restores into an empty
// database, leaves nothing staged behind, and its database functions are closed to every API role.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';
import {exportBackupLines} from '../../frontend/src/lib/backupStream.js';
import {writeOffsiteBackup, managementSql} from '../../scripts/offsite-backup.mjs';
import {checkRestore} from '../../scripts/offsite-restore-check.mjs';

let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

const db = await freshDatabase();
const {q} = await apiClient(db);
const cash = (await q('bootstrap')).accounts[0].id;
const sup = await q('supplier.save', {name: 'Offsite supplier'});
const items = [];
for (let i = 0; i < 30; i++) items.push(await q('product.save', {name: `Offsite item ${i} ${'x'.repeat(i * 40)}`, sale_price: 100 + i}));
await q('purchase.create', {supplier_id: sup.id, items: items.map(p => ({product_id: p.id, qty: 20, cost: 50})), payments: []});
const cust = await q('customer.save', {name: 'Offsite customer — বাংলা নাম'});
for (let i = 0; i < 12; i++)
  await q('sale.create', {customer_id: cust.id, items: [{product_id: items[i].id, qty: 1, price: 120}], payments: [{account_id: cash, amount: i % 2 ? 120 : 50}], send_sms: false});

const sqlCalls = [];
const sql = async text => { sqlCalls.push(text); return (await db.query(text)).rows; };
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'karvio-offsite-'));
const {file, manifest} = await writeOffsiteBackup({sql, folder, pace: 0, now: new Date('2026-11-15T10:00:00Z')});
ok(file.endsWith('Karvio-backup-2026-11-15.karvio.gz'), 'file named like the app download (Dhaka date)');
ok(manifest.app_version && manifest.format === 'Karvio streaming backup', 'header carries format and app version');
eq((await db.query(`select count(*)::int n from karvio_private.transfer_jobs where owner_id = 'offsite'`)).rows[0].n, 0, 'staged copy removed after the backup');
ok(sqlCalls.some(s => s.includes('offsite_export_close')), 'export closed');

// Same content as the app's own download: identical pages in identical order.
const appLines = [];
for await (const line of exportBackupLines({call: (a, p) => q(a, p), pace: 0})) appLines.push(line.trim());
const offLines = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').trim().split('\n');
const pages = lines => lines.slice(1).map(l => JSON.parse(l)).filter(p => p.kind === 'rows').map(p => [p.table, p.payload]);
eq(pages(offLines), pages(appLines), 'pages identical to the app export');
const header = l => { const h = JSON.parse(l); delete h.created_at; return h; };
eq(header(offLines[0]), header(appLines[0]), 'header identical to the app export (except its time)');
ok(manifest.tables.find(t => t.name === 'Sales').rows === 12 && manifest.tables.find(t => t.name === 'Products').rows >= 30, 'counts in header');
ok(offLines.length > 3, 'several pages');

// Restore test: an empty database ends up with every row.
const check = await checkRestore(file);
ok(check.ok, 'restore check passes: ' + JSON.stringify(check.wrong));
eq(check.tables.reduce((s, t) => s + t.restored, 0), manifest.total_rows, 'every row restored unchanged');

// A damaged file fails the restore check instead of passing silently.
const bad = path.join(folder, 'Karvio-backup-bad.karvio.gz');
const lines = offLines.slice();
const at = lines.findIndex(l => l.includes('Offsite item'));
const page = JSON.parse(lines[at]); page.payload = page.payload.replace('Offsite item', 'Changed item'); lines[at] = JSON.stringify(page);
fs.writeFileSync(bad, zlib.gzipSync(lines.join('\n') + '\n'));
await assert.rejects(checkRestore(bad), /damaged|out of order/); checks++;

// The functions are for the database owner only (the Management API), not for any API role.
for (const role of ['anon', 'authenticated', 'service_role']) {
  for (const fn of [`karvio_private.offsite_export_begin()`, `karvio_private.offsite_export_page('x','Sales',0)`, `karvio_private.offsite_export_close('x')`]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query(`select ${fn}`), /permission denied/, `${role} cannot call ${fn}`); checks++;
    await db.exec('reset role');
  }
}
// Page requests for a job that is not an off-site job are refused.
await assert.rejects(db.query(`select karvio_private.offsite_export_page('not-a-job', 'Sales', 0)`), /Invalid off-site export page/); checks++;

// Management API transport: retries temporary errors, stops on a bad token.
{
  let n = 0;
  const flaky = managementSql({token: 't', project: 'p', wait: async () => {}, fetchImpl: async () => (++n < 3
    ? new Response('busy', {status: 503}) : new Response(JSON.stringify([{r: {ok: 1}}]), {status: 200}))});
  eq(await flaky('select 1'), [{r: {ok: 1}}], 'retries 503 then succeeds'); eq(n, 3, 'three attempts');
  let m = 0;
  const denied = managementSql({token: 't', project: 'p', wait: async () => {}, fetchImpl: async () => { m++; return new Response('{"message":"Unauthorized"}', {status: 401}); }});
  await assert.rejects(denied('select 1'), /401/); eq(m, 1, 'no retry on 401');
}

fs.rmSync(folder, {recursive: true, force: true});
console.log(`Off-site backup: ${checks} checks passed (app-identical file, restore into empty database, damaged file rejected, owner-only functions, API retries).`);
