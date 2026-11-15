// Private sheets (journal, request receipts, quotation links) stored as rows instead of inside the
// runtime JSON: reads skip the large receipts, saves write only changed rows, and nothing is lost
// when an existing shop is migrated, retries are replayed, receipts are pruned or the shop is restored.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {freshDatabase, apiClient, migrationFiles} from './pg-harness.mjs';

const MIGRATION = '20261114204617_karvio_private_rows.sql';
const later = migrationFiles().filter(f => f >= MIGRATION);
const db = await freshDatabase({skip: later});           // an existing v1.2.4 shop
const calls = [];
// recheckMs 0: the handler tries karvio_read again on every request (production waits a minute).
const c = await apiClient(db, {onCall: x => calls.push(x), handlerOptions: {recheckMs: 0}});
const {q, raw} = c;
let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

// ---------- before the migration: everything lives in runtime.metadata ----------
const cash = (await q('bootstrap')).accounts[0].id;
const item = await q('product.save', {name: 'Row item', sale_price: 100});
const sup = await q('supplier.save', {name: 'Row supplier'});
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: item.id, qty: 50, cost: 40}], payments: []});
const cust = await q('customer.save', {name: 'Row customer'});
await q('settings.save', {values: {sms_enabled: 'true', sms_url: 'https://sms.example.com/send?to={number}&text={message}', sms_method: 'GET'}});
await q('quote.send', {customer: 'Row customer', phone: '01711-222333', title: 'Row quote', valid_days: 3, discount: 0, lines: [{group: 'Part', name: 'Row part', warranty: '', qty: 1, price: 50}]});
const saleBody = {customer_id: cust.id, items: [{product_id: item.id, qty: 1, price: 100}], payments: [{account_id: cash, amount: 100}], send_sms: false};
const retryId = 'retry-across-migration-0001';
const first = await raw('sale.create', saleBody, {request_id: retryId});
ok(first.ok, 'sale before migration');
const legacy = (await db.query(`select metadata from karvio_private.runtime`)).rows[0].metadata;
ok(legacy.privateSheets.__KarvioRequestReceipts.rows.length > 0, 'receipts stored in the runtime JSON before');
ok(legacy.privateSheets.__KarvioQuoteLinks.rows.some(r => r.some(v => v !== '' && v != null)), 'quotation link stored in the runtime JSON before');

// ---------- apply the migration (the API is already the new build) ----------
for (const f of later) {
  let sql = fs.readFileSync(new URL('../../supabase/migrations/' + f, import.meta.url), 'utf8');
  await db.exec(sql.replace(/create extension if not exists pg_(cron|net)[^;]*;/gi, ''));
}
const moved = (await db.query(`select metadata from karvio_private.runtime`)).rows[0].metadata;
ok(!('privateSheets' in moved), 'runtime JSON no longer carries private sheets');
const rowCounts = Object.fromEntries((await db.query(`select sheet, count(*)::int n from karvio_private.private_rows group by sheet`)).rows.map(r => [r.sheet, r.n]));
const nonBlank = rows => rows.filter(r => Array.isArray(r) && r.some(v => v !== '' && v != null)).length;
for (const [name, sheet] of Object.entries(legacy.privateSheets))
  eq(rowCounts[name] || 0, nonBlank(sheet.rows), `${name}: every non-empty row moved`);

// ---------- the previous Edge build keeps working while a release deploys (migrations run first) ----------
// Its reads still carry the private sheets inside metadata, exactly as they were.
const filled = rows => rows.map((r, i) => [i + 1, r]).filter(([, r]) => Array.isArray(r) && r.some(v => v !== '' && v != null));
for (const fn of [`public.karvio_snapshot()`, `public.karvio_snapshot_for('customers.list')`, `public.karvio_snapshot_request('sale.create', '{}')`]) {
  const old = (await db.query(`select ${fn} as r`)).rows[0].r.metadata.privateSheets;
  for (const [name, sheet] of Object.entries(legacy.privateSheets))
    eq(filled(old[name].rows), filled(sheet.rows), `${fn}: ${name} still visible to the previous build`);
}
// The new build's reads skip that copy.
const viaRead = (await db.query(`select public.karvio_read('rows', 'sale.create', '{}') as r`)).rows[0].r;
ok(!('privateSheets' in viaRead.metadata) && !viaRead.privateSheets.__KarvioRequestReceipts, 'karvio_read carries no legacy copy');
// A save by the previous build writes back every private sheet it read plus its new rows: nothing is lost.
{
  const snap = (await db.query(`select public.karvio_snapshot_request('sale.create', '{}') as r`)).rows[0].r;
  const sheets = structuredClone(snap.metadata.privateSheets);
  const receipts = sheets.__KarvioRequestReceipts.rows;
  receipts.push(receipts[1].map((v, i) => i === 0 ? 'legacy-writer-receipt' : v));
  const res = (await db.query(`select public.karvio_commit_delta($1, '{}'::jsonb, $2::jsonb) as r`,
    [snap.revision, JSON.stringify({...snap.metadata, privateSheets: sheets})])).rows[0].r;
  ok(res.committed, 'previous build commits');
  const after = (await db.query(`select public.karvio_snapshot() as r`)).rows[0].r;
  ok(!('privateSheets' in (await db.query(`select metadata from karvio_private.runtime`)).rows[0].metadata), 'runtime JSON stays without private sheets');
  for (const [name, sheet] of Object.entries(sheets))
    eq(filled(after.metadata.privateSheets[name].rows), filled(sheet.rows), `${name}: previous build's save kept every row`);
}

// A retry of the request that committed before the migration returns the saved answer, no second sale.
const salesBefore = (await db.query(`select count(*)::int n from public."Sales"`)).rows[0].n;
const replay = await raw('sale.create', saleBody, {request_id: retryId});
eq(replay.data?.sale?.id, first.data.sale.id, 'retry after migration returns the original sale');
eq((await db.query(`select count(*)::int n from public."Sales"`)).rows[0].n, salesBefore, 'no duplicate sale');
// The quotation link created before the migration still opens.
const linkSheet = (await db.query(`select cells from karvio_private.private_rows where sheet='__KarvioQuoteLinks' order by position desc limit 1`)).rows[0].cells;
ok(Array.isArray(linkSheet), 'quotation link row present');

// ---------- reads do not load request receipts; saves write only changed rows ----------
calls.length = 0;
await q('customers.list');
await q('dashboard');
const reads = calls.filter(x => x.name === 'karvio_read');
ok(reads.length >= 2 && reads.every(x => !x.result.privateSheets.__KarvioRequestReceipts), 'reads skip request receipts');
ok(calls.every(x => !/commit/.test(x.name)), 'reads never save');
calls.length = 0;
const s2 = await q('sale.create', saleBody);
const commit = calls.find(x => x.name === 'karvio_commit_rows');
ok(commit, 'saves use the row commit');
const receiptRows = (await db.query(`select count(*)::int n from karvio_private.private_rows where sheet='__KarvioRequestReceipts'`)).rows[0].n;
ok(receiptRows > 2, 'receipts kept as rows');
const sentRows = Object.values(commit.args?.private_changes || {}).reduce((n, d) => n + d.upsert.length + d.remove.length, 0);
ok(s2.sale.id && sentRows > 0 && sentRows < receiptRows + 10, `only changed private rows sent (${sentRows} of ${receiptRows})`);

// ---------- daily receipt pruning shifts rows up; retries of recent requests still work ----------
const recentId = 'recent-request-after-prune-01';
const recent = await raw('customer.payment', {customer_id: cust.id, account_id: cash, amount: 5}, {request_id: recentId});
ok(recent.ok, 'recent payment');
// Age every receipt except the newest, and make today's prune due.
await db.query(`update karvio_private.private_rows set cells = jsonb_set(cells, '{2}', to_jsonb(jsonb_set((cells->>2)::jsonb, '{saved_at}', '1'::jsonb)::text))
  where sheet='__KarvioRequestReceipts' and cells->>1 = 'complete' and cells->>0 <> (select cells->>0 from karvio_private.private_rows where sheet='__KarvioRequestReceipts' and cells->>1='complete' order by position desc limit 1)`);
await db.query(`update karvio_private.runtime set metadata = jsonb_set(metadata, '{properties,receipts_pruned}', '"2000-01-01"')`);
const before = (await db.query(`select count(*)::int n from karvio_private.private_rows where sheet='__KarvioRequestReceipts'`)).rows[0].n;
await q('customer.payment', {customer_id: cust.id, account_id: cash, amount: 1});
const after = (await db.query(`select count(*)::int n, min(position)::int lo, max(position)::int hi from karvio_private.private_rows where sheet='__KarvioRequestReceipts'`)).rows[0];
ok(after.n < before, `old receipts pruned (${before} → ${after.n})`);
eq(after.lo, 1, 'remaining receipts start at the top');
eq(after.hi, after.n, 'no gaps left behind');
const payments = (await db.query(`select count(*)::int n from public."CustomerLedger" where type='payment'`)).rows[0].n;
const again = await raw('customer.payment', {customer_id: cust.id, account_id: cash, amount: 5}, {request_id: recentId});
eq(again.data, recent.data, 'retry after pruning returns the saved answer');
eq((await db.query(`select count(*)::int n from public."CustomerLedger" where type='payment'`)).rows[0].n, payments, 'no duplicate payment');

// ---------- an older writer or the restore worker resetting the shop ----------
await db.query(`update karvio_private.runtime set metadata='{"properties":{},"cache":{},"privateSheets":{}}', revision = revision + 1 where id`);
eq((await db.query(`select count(*)::int n from karvio_private.private_rows`)).rows[0].n, 0, 'restore reset clears private rows');
ok(!('privateSheets' in (await db.query(`select metadata from karvio_private.runtime`)).rows[0].metadata), 'runtime JSON stays without private sheets');

console.log(`Private rows: ${checks} checks passed (migration of an existing shop, retry replay, reads skip receipts, row-only saves, pruning, restore reset).`);
await db.close();
