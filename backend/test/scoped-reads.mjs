// Narrow reads must give exactly the whole-shop answer.
// Builds a realistic shop (opening balances, partial payments, returns, cancellations, walk-in cash,
// advances, several staff and dates), then asks every list/statement/report twice: once through
// the normal gateway (row- or table-scoped reads) and once reading the whole shop. Answers must match.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient, rpcFor} from './pg-harness.mjs';
import {createHandler} from '../../supabase/functions/karvio-api/handler.mjs';

const db = await freshDatabase();
const c = await apiClient(db);
const {q} = c;
const metrics = c.metrics;
const whole = createHandler({rpc: rpcFor(db), scopedReads: false, readCache: false, log: () => {}});
const wholeAsk = async (action, payload) => (await whole(new Request('http://karvio.test', {method: 'POST',
  body: JSON.stringify({action, payload, token: c.token, request_id: crypto.randomUUID()})}))).json();

// ---------- a shop with history ----------
const boot = await q('bootstrap');
const cash = boot.accounts[0].id;
const bank = await q('account.save', {name: 'Scope bank', type: 'bank', opening_balance: 1000});
const supplier = await q('supplier.save', {name: 'Scope supplier', opening_balance: 250});
const supplier2 = await q('supplier.save', {name: 'Second supplier', opening_balance: -40});
const items = [];
for (let i = 0; i < 6; i++) items.push(await q('product.save', {name: `Scope item ${i}`, sale_price: 100 + i * 25, cost_price: 60 + i * 10}));
const serialItem = await q('product.save', {name: 'Scope serial', sale_price: 900, has_warranty: true, warranty_type: 'serial', warranty_days: 365});
await q('purchase.create', {supplier_id: supplier.id, items: [...items.map(p => ({product_id: p.id, qty: 500, cost: 50, sale_price: 120})),
  {product_id: serialItem.id, qty: 4, cost: 700, sale_price: 900, serials: ['SR-1', 'SR-2', 'SR-3', 'SR-4']}], payments: [{account_id: bank.id, amount: 300}]});
await q('purchase.create', {supplier_id: supplier2.id, items: [{product_id: items[0].id, qty: 20, cost: 55}], payments: []});
const customers = [];
for (const [name, opening] of [['Advance customer', -200], ['Owing customer', 350], ['Plain customer', 0], ['Busy customer', 0], ['Quiet customer', 75]])
  customers.push(await q('customer.save', {name, opening_balance: opening, phones: '0171' + String(customers.length).padStart(7, '0')}));
const sales = [];
const sell = async (customer, lines, paid, extra = {}) => {
  const s = await q('sale.create', {customer_id: customer?.id || '', items: lines, payments: paid ? [{account_id: cash, amount: paid}] : [], send_sms: false, ...extra});
  sales.push(s);
  return s;
};
for (let round = 0; round < 4; round++) {
  for (const [k, cu] of customers.entries()) {
    const total = (100 + k * 25) * (1 + round % 2);
    await sell(cu, [{product_id: items[k].id, qty: 1 + round % 2, price: 100 + k * 25}], round % 3 === 0 ? total : Math.floor(total / 3));
  }
  await sell(null, [{product_id: items[5].id, qty: 1, price: 225}], 225); // cash sale
}
const serialSale = await sell(customers[3], [{product_id: serialItem.id, qty: 2, price: 900, serials: ['SR-1', 'SR-2']}], 500);
await q('customer.payment', {customer_id: customers[1].id, account_id: cash, amount: 120});
await q('customer.payment', {customer_id: customers[3].id, account_id: bank.id, amount: 400});
await q('customer.payment', {customer_id: customers[0].id, account_id: cash, amount: 60});
await q('supplier.payment', {supplier_id: supplier.id, account_id: bank.id, amount: 90});
const ret = await q('sreturn.create', {sale_id: serialSale.sale.id, items: [{sale_item_id: serialSale.items[0].id, qty: 1, serials: ['SR-1']}], refund: {account_id: cash, amount: 0}});
const ret2 = await q('sreturn.create', {sale_id: sales[6].sale.id, items: [{sale_item_id: sales[6].items[0].id, qty: 1}], refund: {account_id: cash, amount: 0}});
await q('reverse', {type: 'sale', id: sales[2].sale.id, reason: 'scope test cancel', password: 'harness-password-1'});
await q('reverse', {type: 'sreturn', id: ret2.id || ret2.return?.id || ret2.sreturn?.id, reason: 'scope test', password: 'harness-password-1'}).catch(() => {});
// A staff member who may only see their own invoices.
await q('user.save', {name: 'Counter two', username: 'counter2', password: 'counter-two-pass-1', role: 'sales'});

// Spread history over two years (dates are only labels to the engine; keep every document's lines in step).
const spread = [
  ['Sales', 'date'], ['SalesReturns', 'date'], ['CustomerLedger', 'date'], ['SupplierLedger', 'date'], ['Purchases', 'date'], ['AccountTxns', 'date'],
];
await db.query(`update public."Sales" set date = to_char(current_date - ((_position * 47) % 700)::int, 'YYYY-MM-DD') where _position % 4 <> 0`);
await db.query(`update public."CustomerLedger" l set date = s.date from public."Sales" s where l.ref_id = s.id`);
await db.query(`update public."AccountTxns" a set date = s.date from public."Sales" s where a.ref_id = s.id`);
await db.query(`update public."SalesReturns" r set date = to_char(current_date - ((_position * 13) % 90)::int, 'YYYY-MM-DD')`);
await db.query(`update public."CustomerLedger" l set date = r.date from public."SalesReturns" r where l.ref_id = r.id`);
// Odd stored dates must still be treated exactly like the engine treats them.
await db.query(`update public."Sales" set date = date || 'T10:15:00' where _position % 9 = 0`);
assert.ok(spread.length);

// ---------- ask twice, compare ----------
const strip = v => Array.isArray(v) ? v.map(strip) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).filter(([k]) => !['serverTime', 'serverToday', 'time'].includes(k)).map(([k, x]) => [k, strip(x)])) : v;
let checks = 0;
const scopes = {};
async function same(action, payload, wantScope) {
  const before = metrics.length;
  const narrow = await c.raw(action, payload);
  const full = await wholeAsk(action, payload);
  assert.deepEqual(strip(narrow), strip(full), `${action} ${JSON.stringify(payload)} differs from the whole-shop answer`);
  const used = metrics.slice(before).map(m => m.scope).at(-1);
  (scopes[action] ||= new Set()).add(used);
  if (wantScope && !globalThis.__karvioTraceWholeShop) assert.equal(used, wantScope, `${action} ${JSON.stringify(payload)} used ${used}`);
  checks++;
  return narrow;
}
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const ranges = [[day(30), day(0)], [day(400), day(200)], [day(700), day(0)], [day(0), day(0)], ['', day(100)], [day(100), ''], [day(5000), day(4000)]];

for (const [from, to] of ranges) {
  for (const status of ['', 'active', 'cancelled']) {
    const r = await same('sales.list', {from, to, status}, 'scoped');
    assert.ok(Array.isArray(r.data));
  }
  await same('sales.list', {from, to, only_due: true}, 'scoped');
  await same('sales.list', {from, to, q: 'scope item 3'}, 'scoped');
  await same('sales.list', {from, to, customer_id: customers[1].id}, 'scoped');
  await same('sales.list', {from, to, limit: 3}, 'scoped');
  await same('sreturns.list', {from, to}, 'scoped');
  await same('sreturns.list', {from, to, status: 'active'}, 'scoped');
}
// Not narrow: whole tables (still the same answer).
await same('sales.list', {}, 'tables');
await same('sales.list', {from: '2026-1-5', to: ''}, 'tables');
await same('sreturns.list', {});
for (const cu of customers) {
  await same('customer.statement', {customer_id: cu.id}, 'scoped');
  await same('customer.statement', {customer_id: cu.id, from: day(300), to: day(10)}, 'scoped');
}
await same('customer.statement', {customer_id: 'no-such-customer'}, 'scoped');
await same('customer.statement', {}, 'tables');
for (const s of [supplier, supplier2]) {
  await same('supplier.statement', {supplier_id: s.id}, 'scoped');
  await same('supplier.statement', {supplier_id: s.id, from: day(30), to: day(0)}, 'scoped');
}
// Table-scoped reads (whole tables, fewer of them).
await same('dashboard', {});
for (const type of ['sales', 'purchases', 'sales_returns', 'purchase_returns', 'daily_summary', 'payment_methods', 'product_sales', 'expenses', 'warranty', 'stock_summary'])
  for (const [from, to] of [[day(400), day(0)], ['', '']])
    for (const group of ['invoice', 'daily', 'monthly', 'product', 'group'])
      await same('reports', {type, from, to, group});
await same('profit.report', {from: day(400), to: day(0)});
await same('customer.statements', {ids: customers.map(x => x.id)});
await same('supplier.statements', {ids: [supplier.id, supplier2.id]});
await same('purchases.list', {page: 1, per: 10});
await same('purchases.list', {from: day(30), to: day(0)});
await same('preturns.list', {});
await same('claims.list', {});
await same('repairs.list', {});
await same('serials.list', {product_id: serialItem.id});
await same('product.history', {product_id: items[1].id});
await same('history.doc', {type: 'sale', id: sales[0].sale.id});
await same('database.info', {});
await same('history', {q: 'SR-1'});
await same('history', {q: sales[0].sale.invoice_no});
await same('sale.link', {id: sales[1].sale.id}).catch(() => {});

// The restricted staff member sees only their own invoices, also through narrow reads.
const staff = await q('login', {username: 'counter2', password: 'counter-two-pass-1'});
const ownerToken = c.token;
c.setToken(staff.token);
await same('sales.list', {from: day(700), to: day(0)}, 'scoped');
await same('sreturns.list', {from: day(700), to: day(0)});
c.setToken(ownerToken);

// Edge deployed before its migration: narrow reads fall back to the v1.2.4 path instead of failing.
const older = await freshDatabase({skip: ['20261114202706_karvio_table_scoped_reads.sql', '20261114204617_karvio_private_rows.sql', '20261115034825_karvio_private_table_grants.sql']});
const o = await apiClient(older);
const party = await o.q('customer.save', {name: 'Fallback customer'});
assert.equal((await o.q('customer.statement', {customer_id: party.id})).party, 'Fallback customer');
assert.ok(Array.isArray(await o.q('sales.list', {from: day(30), to: day(0)})));
assert.ok(o.metrics.every(m => m.outcome === 'ok'));
await older.close();

console.log(`Scoped reads: ${checks} answers identical to whole-shop reads (${Object.entries(scopes).map(([a, s]) => `${a}: ${[...s].join('/')}`).join(', ')}).`);
await db.close();
