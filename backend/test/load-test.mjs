// Karvio load test: a realistic, large shop database and several counters saving at once.
// Runs the real Edge API handler against PostgreSQL (PGlite) with every migration applied.
//
//   cd frontend && npm run test:load                  (default: about 2 years of a busy shop)
//   KARVIO_LOAD_SALES=60000 npm run test:load          (bigger shop)
//   KARVIO_LOAD_JSON=report.json npm run test:load     (also save the numbers)
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {freshDatabase, apiClient, rpcFor} from './pg-harness.mjs';
import {createHandler} from '../../supabase/functions/karvio-api/handler.mjs';

const SALES = Number(process.env.KARVIO_LOAD_SALES || 20000);
const CUSTOMERS = Number(process.env.KARVIO_LOAD_CUSTOMERS || 3000);
const PRODUCTS = Number(process.env.KARVIO_LOAD_PRODUCTS || 2000);
const COUNTERS = Number(process.env.KARVIO_LOAD_COUNTERS || 3);
const ROUNDS = Number(process.env.KARVIO_LOAD_ROUNDS || 8);
const REPEAT = Number(process.env.KARVIO_LOAD_REPEAT || 3);

const db = await freshDatabase();
const rpcLog = [];
const c = await apiClient(db, {onCall: x => rpcLog.push(x)});
const {q} = c;

// ---------- 1. A small, real history made through the API (valid templates) ----------
const t0 = performance.now();
const cash = (await q('bootstrap')).accounts[0].id;
const bank = await q('account.save', {name: 'Load bank', type: 'bank', opening_balance: 50000});
const supplier = await q('supplier.save', {name: 'Load supplier', phones: '01700000000'});
const products = [];
for (let i = 0; i < 20; i++) products.push(await q('product.save', {name: `Load product ${i}`, sale_price: 100 + i * 10, cost_price: 70 + i * 7}));
await q('purchase.create', {supplier_id: supplier.id, items: products.map(p => ({product_id: p.id, qty: 100000, cost: 50, sale_price: 120})), payments: [{account_id: bank.id, amount: 1000}]});
const customers = [];
for (let i = 0; i < 20; i++) customers.push(await q('customer.save', {name: `Load customer ${i}`, phones: `0171${String(1000000 + i)}`}));
const templateSales = [];
for (let i = 0; i < 20; i++) {
  const s = await q('sale.create', {customer_id: customers[i].id,
    items: [{product_id: products[i].id, qty: 1, price: 150}, {product_id: products[(i + 7) % 20].id, qty: 2, price: 140}],
    payments: [{account_id: i % 2 ? cash : bank.id, amount: 300}], send_sms: false});
  templateSales.push(s.sale.id);
}
for (let i = 0; i < 10; i++) await q('customer.payment', {customer_id: customers[i].id, account_id: cash, amount: 50});
for (let i = 0; i < 10; i++) await q('expense.create', {date: '2026-01-0' + (1 + (i % 9)), category: 'Rent', amount: 100 + i, account_id: cash, note: 'load'});

// ---------- 2. Grow it to a big shop by cloning the real rows (shape stays valid) ----------
async function clone(table, copies, {where = 'true', remap = {}, spreadDate = null} = {}) {
  const extra = Object.entries(remap).map(([col, expr]) => `,'${col}',${expr}`).join('');
  const date = spreadDate ? `,'${spreadDate}',to_char(current_date - ((g*37 + x._position) % 730)::int,'YYYY-MM-DD')` : '';
  await db.query(`insert into public."${table}" select r.* from (
    select jsonb_populate_record(null::public."${table}", to_jsonb(x) || jsonb_build_object(
      '_position',(select coalesce(max(_position),1) from public."${table}") + row_number() over (),
      'id', x.id || '~' || g ${extra} ${date})) r0
    from public."${table}" x cross join generate_series(1,$1) g where ${where}) s, lateral (select (s.r0).*) r`, [copies]);
}
const salesCopies = Math.max(1, Math.round(SALES / templateSales.length));
const tpl = `'{${templateSales.join(',')}}'::text[]`;
const custCopies = Math.max(1, Math.round(CUSTOMERS / 20));
await clone('Customers', custCopies, {where: `x.name like 'Load customer%'`});
// Each copied invoice belongs to one of the copied customers, so customers have realistic, separate histories.
const owner = col => `case when x.${col} = '' then '' else x.${col} || '~' || (((g - 1) % ${custCopies}) + 1) end`;
await clone('Products', Math.max(1, Math.round(PRODUCTS / 20)), {where: `x.name like 'Load product%'`, remap: {barcode: `''`, sku: `''`}});
await clone('Sales', salesCopies, {where: `x.id = any(${tpl})`, remap: {invoice_no: `x.invoice_no || '-' || g`, customer_id: owner('customer_id')}, spreadDate: 'date'});
await clone('SaleItems', salesCopies, {where: `x.sale_id = any(${tpl})`, remap: {sale_id: `x.sale_id || '~' || g`}});
await clone('CustomerLedger', salesCopies, {where: `x.ref_id = any(${tpl})`, remap: {ref_id: `x.ref_id || '~' || g`, customer_id: owner('customer_id')}, spreadDate: 'date'});
await clone('AccountTxns', salesCopies, {where: `x.ref_id = any(${tpl})`, remap: {ref_id: `x.ref_id || '~' || g`}, spreadDate: 'date'});
await clone('ItemEvents', salesCopies, {where: `x.ref_id = any(${tpl})`, remap: {ref_id: `x.ref_id || '~' || g`}});
await clone('AuditLog', Math.max(1, Math.round(SALES * 1.5 / Math.max(1, (await db.query('select count(*)::int n from public."AuditLog"')).rows[0].n))));
await clone('Expenses', Math.max(1, Math.round(SALES / 40)), {spreadDate: 'date'});
await db.query('analyze');
const counts = Object.fromEntries((await db.query(`select relname t, n_live_tup::int n from pg_stat_user_tables where schemaname='public' order by n_live_tup desc`)).rows.map(r => [r.t, r.n]));
const dbBytes = (await db.query('select pg_database_size(current_database())::bigint b')).rows[0].b;
const seedMs = performance.now() - t0;

// ---------- 3. One request at a time: how long, how much data read ----------
const sale1 = templateSales[0], cust1 = customers[0].id;
const today = new Date().toISOString().slice(0, 10), monthStart = today.slice(0, 8) + '01';
const actions = [
  ['ping', {}], ['bootstrap', {}], ['dashboard', {}], ['reports', {type: 'sales', from: monthStart, to: today}],
  ['reports', {type: 'expenses', from: monthStart, to: today}], ['profit.report', {from: monthStart, to: today}],
  ['sales.list', {from: monthStart, to: today}], ['customers.list', {}], ['products.list', {}],
  ['sale.detail', {id: sale1}], ['customer.statement', {customer_id: cust1}], ['account.ledger', {account_id: cash}],
  ['sale.create', () => ({customer_id: cust1, items: [{product_id: products[3].id, qty: 1, price: 150}], payments: [{account_id: cash, amount: 150}], send_sms: false})],
  ['customer.payment', () => ({customer_id: customers[2].id, account_id: cash, amount: 10})],
  ['expense.create', () => ({date: today, category: 'Load', amount: 5, account_id: cash})],
];
// The same requests through the v1.2.4 read path (for comparison), then through the current one.
const oldMetrics = [];
const oldHandler = createHandler({rpc: rpcFor(db), narrowReads: false, log: m => oldMetrics.push(m)});
const askOld = async (action, payload) => (await oldHandler(new Request('http://karvio.test', {method: 'POST',
  body: JSON.stringify({action, payload, token: c.token, request_id: crypto.randomUUID()})}))).json();
const single = [];
for (const [action, payload] of actions) {
  const runs = [], oldRuns = [];
  for (let i = 0; i < REPEAT; i++) {
    const p = typeof payload === 'function' ? payload() : payload;
    if (typeof payload !== 'function') { const n = oldMetrics.length; assert.equal((await askOld(action, p)).ok, true); oldRuns.push(oldMetrics[n]); }
    const before = c.metrics.length;
    const r = await c.raw(action, typeof payload === 'function' ? payload() : payload);
    assert.equal(r.ok, true, `${action}: ${r.error}`);
    runs.push(c.metrics[before]);
  }
  const med = list => { const ms = list.map(m => m.ms).sort((a, b) => a - b); return ms[Math.floor(ms.length / 2)]; };
  single.push({action: action + (payload?.type ? ':' + payload.type : ''),
    beforeMs: oldRuns.length ? med(oldRuns) : '', beforeKB: oldRuns.length ? Math.round(oldRuns.at(-1).readBytes / 1024) : '',
    nowMs: med(runs), nowKB: Math.round(runs.at(-1).readBytes / 1024), engineMs: runs.at(-1).engineMs, read: runs.at(-1).scope || ''});
}

// ---------- 4. Several counters saving at the same moment ----------
const busy = [];
const counterRuns = [];
for (let round = 0; round < ROUNDS; round++) {
  const batch = await Promise.all(Array.from({length: COUNTERS}, async (_, k) => {
    const before = performance.now();
    const r = await c.raw('sale.create', {customer_id: customers[(round * COUNTERS + k) % 20].id,
      items: [{product_id: products[(round + k) % 20].id, qty: 1, price: 150}], payments: [{account_id: cash, amount: 150}], send_sms: false});
    return {ok: r.ok, error: r.error, ms: performance.now() - before};
  }));
  counterRuns.push(...batch);
  busy.push(...batch.filter(x => !x.ok));
}
const saleMetrics = c.metrics.filter(m => m.action === 'sale.create').slice(-COUNTERS * ROUNDS);
const retries = saleMetrics.reduce((n, m) => n + (m.attempts - 1), 0);
const lat = counterRuns.map(x => x.ms).sort((a, b) => a - b);
const concurrent = {counters: COUNTERS, saves: counterRuns.length, saved: counterRuns.filter(x => x.ok).length,
  failedBusy: busy.length, retries, p50Ms: Math.round(lat[Math.floor(lat.length / 2)]), p95Ms: Math.round(lat[Math.floor(lat.length * 0.95)])};

// Every concurrent sale must be recorded exactly once and money must still balance.
const savedSales = (await db.query(`select count(*)::int n from public."Sales" where id not like '%~%'`)).rows[0].n;
assert.equal(savedSales, 20 + REPEAT + concurrent.saved, 'each successful sale saved exactly once');

const report = {database: {sales: counts.Sales, saleItems: counts.SaleItems, customers: counts.Customers, products: counts.Products,
  ledgerRows: counts.CustomerLedger, accountTxns: counts.AccountTxns, auditLog: counts.AuditLog, sizeMB: Math.round(Number(dbBytes) / 1048576)},
  seedSeconds: Math.round(seedMs / 1000), single, concurrent};
console.log('\nKarvio load test');
console.log(`Database: ${report.database.sales} sales, ${report.database.saleItems} sale lines, ${report.database.customers} customers, ${report.database.products} products, ${report.database.auditLog} audit rows (${report.database.sizeMB} MB)`);
console.table(single);
console.log(`${COUNTERS} counters x ${ROUNDS} rounds of sale.create: ${concurrent.saved}/${concurrent.saves} saved, ${concurrent.retries} automatic retries, ${concurrent.failedBusy} "busy" failures, p50 ${concurrent.p50Ms} ms, p95 ${concurrent.p95Ms} ms`);
if (process.env.KARVIO_LOAD_JSON) fs.writeFileSync(process.env.KARVIO_LOAD_JSON, JSON.stringify(report, null, 2));
if (process.env.KARVIO_LOAD_TABLES) {
  const sizes = (await db.query(`select c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`)).rows;
  const out = [];
  for (const {t} of sizes) out.push({table: t, jsonKB: Math.round((await db.query(`select coalesce(sum(length(to_jsonb(x)::text)),0)::bigint b from public."${t}" x`)).rows[0].b / 1024)});
  console.table(out.sort((a, b) => b.jsonKB - a.jsonKB).slice(0, 12));
}
await db.close();
