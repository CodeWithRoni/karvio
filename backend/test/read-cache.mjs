// Reused answers for heavy read screens: identical to a fresh answer, and never reused after a save,
// sign-out, for a user with working hours, across days, or for a session that needs renewing.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient, rpcFor} from './pg-harness.mjs';
import {createHandler} from '../../supabase/functions/karvio-api/handler.mjs';

const db = await freshDatabase();
const c = await apiClient(db);
const {q} = c;
let checks = 0;
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };
const fresh = createHandler({rpc: rpcFor(db), readCache: false, log: () => {}});
const freshAsk = async (action, payload, token = c.token) => (await fresh(new Request('http://karvio.test', {method: 'POST',
  body: JSON.stringify({action, payload, token, request_id: crypto.randomUUID()})}))).json();
const scopeOf = async (action, payload) => { const n = c.metrics.length; const r = await c.raw(action, payload); return {r, scope: c.metrics.slice(n).at(-1).scope}; };

const cash = (await q('bootstrap')).accounts[0].id;
const item = await q('product.save', {name: 'Cache item', sale_price: 100});
const sup = await q('supplier.save', {name: 'Cache supplier'});
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: item.id, qty: 10, cost: 40}], payments: []});
await q('sale.create', {items: [{product_id: item.id, qty: 1, price: 100}], payments: [{account_id: cash, amount: 100}], send_sms: false});

// First ask computes, second ask reuses — and both equal a fresh computation.
const day = new Date().toISOString().slice(0, 10);
for (const [action, payload] of [['dashboard', {}], ['reports', {type: 'sales', from: '2020-01-01', to: day}], ['profit.report', {from: '2020-01-01', to: day}]]) {
  const a = await scopeOf(action, payload);
  const b = await scopeOf(action, payload);
  eq(b.scope, 'cache', `${action}: second ask reuses the answer`);
  eq(b.r, a.r, `${action}: reused answer is the same`);
  eq(b.r, await freshAsk(action, payload), `${action}: reused answer equals a fresh one`);
}
// A different payload is a different answer.
eq((await scopeOf('reports', {type: 'sales', from: '2021-01-01', to: day})).scope !== 'cache', true, 'other filters are not reused');

// Any save makes the old answer unusable.
const before = (await c.raw('dashboard', {})).data;
await q('sale.create', {items: [{product_id: item.id, qty: 2, price: 100}], payments: [{account_id: cash, amount: 200}], send_sms: false});
const after = await scopeOf('dashboard', {});
eq(after.scope !== 'cache', true, 'not reused after a sale');
eq(after.r.data.today.sales, before.today.sales + 200, 'new answer includes the sale');
eq(after.r, await freshAsk('dashboard', {}), 'new answer equals a fresh one');

// Another user never gets someone else's answer; a user with working hours is never served from cache.
await q('user.save', {name: 'Limited staff', username: 'limited', password: 'limited-pass-123', role: 'manager', access_limit: true, access_from: '00:00', access_to: '23:59', access_days: 'sun,mon,tue,wed,thu,fri,sat'});
await q('user.save', {name: 'Second manager', username: 'second', password: 'second-pass-1234', role: 'manager'});
const ownerToken = c.token;
const second = await q('login', {username: 'second', password: 'second-pass-1234'});
c.setToken(second.token);
const s1 = await scopeOf('dashboard', {});
eq(s1.scope !== 'cache', true, 'another user computes their own answer');
eq(s1.r, await freshAsk('dashboard', {}, second.token), "second user's answer equals a fresh one");
eq((await scopeOf('dashboard', {})).scope, 'cache', "second user's own answer is reused");
const limited = await q('login', {username: 'limited', password: 'limited-pass-123'});
c.setToken(limited.token);
await scopeOf('dashboard', {});
eq((await scopeOf('dashboard', {})).scope !== 'cache', true, 'working-hours user is checked every time');

// A session that needs renewing takes the normal path (which renews it).
c.setToken(ownerToken);
await scopeOf('dashboard', {});
await db.query(`update karvio_private.runtime set metadata = jsonb_set(metadata, array['cache','tok_${ownerToken}','text'],
  to_jsonb(jsonb_set((metadata->'cache'->'tok_${ownerToken}'->>'text')::jsonb, '{refreshed}', to_jsonb((extract(epoch from now())*1000 - 20*60*1000)::bigint))::text))`);
eq((await scopeOf('dashboard', {})).scope !== 'cache', true, 'stale session is renewed, not served from cache');

// Yesterday's answer is never used today.
await scopeOf('dashboard', {});
await db.query(`update karvio_private.read_cache set day = '2000-01-01'`);
eq((await scopeOf('dashboard', {})).scope !== 'cache', true, "an earlier day's answer is not reused");

// Signing out ends reuse for that token.
await scopeOf('dashboard', {});
await q('logout');
const out = await c.raw('dashboard', {});
eq(out.ok, false, 'signed-out token gets no answer');

// Unknown or broken tokens never read the cache.
for (const token of ['', 'short', 'x'.repeat(600)]) eq((await freshAsk('dashboard', {}, token)).ok, false, 'bad token refused');

console.log(`Read cache: ${checks} checks passed (reuse equals fresh, saves/sign-out/day/session renewal/working hours/other users invalidate).`);
await db.close();
