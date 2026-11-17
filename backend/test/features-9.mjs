// Saved quotations on the server: every user sees them, they stay until deleted, opened ones are updated in place.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const api = await apiClient(db), {q, raw} = api;
const admin = api.token;
const today = (await q('bootstrap')).serverToday;
const lines = [{group: 'Dome Camera', name: 'Dahua 2MP Dome', qty: '4', price: '2200', warranty: '365 days'}, {group: 'DVR / NVR', name: '', qty: '1', price: ''}];

ok(/customer name/.test((await raw('quote.save', {kind: 'cctv', meta: {phone: '01819556677'}, lines})).error), 'the customer name is required');
ok(/mobile number/.test((await raw('quote.save', {kind: 'cctv', meta: {customer: 'Karim', phone: '123'}, lines})).error), 'a mobile number is required');
ok(/at least one part/.test((await raw('quote.save', {kind: 'cctv', meta: {customer: 'Karim', phone: '01819556677'}, lines: [{name: '', qty: 1}]})).error), 'a part is required');
const a = await q('quote.save', {kind: 'cctv', meta: {customer: 'Karim Traders', phone: '01819556677', discount: '200', note: 'Cable extra'}, lines});
eq([a.kind, a.meta.title, a.date, a.created_by, a.lines.length], ['cctv', 'CC Camera setup', today, 'Harness owner', 2], 'saved with the shop day and who saved it');
const b = await q('quote.save', {kind: 'pc', meta: {customer: 'Nipa', phone: '01611121212', title: 'Office PC'}, lines: [{group: 'Processor', name: 'Ryzen 5', qty: 1, price: 21500}]});

// another user, another device: sees both, can update and delete
await q('user.save', {name: 'Cashier', username: 'cash9', role: 'sales', password: 'cash-password-1'});
api.setToken((await q('login', {username: 'cash9', password: 'cash-password-1'})).token);
let list = await q('quotes.list');
eq(list.map((x) => x.meta.customer), ['Nipa', 'Karim Traders'], 'every user sees every saved quotation, newest first');
const upd = await q('quote.save', {id: a.id, kind: 'cctv', meta: {...a.meta, discount: '300'}, lines: a.lines});
eq([upd.id, upd.meta.discount, upd.created_by, upd.updated_by, upd.date], [a.id, '300', 'Harness owner', 'Cashier', today], 'opened and saved again: the same quotation is updated');
list = await q('quotes.list');
eq([list.length, list[0].id], [2, a.id], 'still two, the updated one first');
await q('quote.delete', {id: b.id});
ok(/already deleted/.test((await raw('quote.delete', {id: b.id})).error), 'deleted once');
ok(/was deleted/.test((await raw('quote.save', {id: b.id, kind: 'pc', meta: {customer: 'Nipa', phone: '01611121212'}, lines: b.lines})).error), 'a deleted quotation is not brought back by Save changes');
api.setToken(admin);
eq((await q('quotes.list')).map((x) => x.meta.customer), ['Karim Traders'], 'the admin sees the deletion too');

// quotations kept in a browser before: moved over without the new rules
const old = await q('quote.save', {imported: true, kind: 'pc', meta: {customer: '', phone: ''}, lines: [{name: 'Old part', qty: 1, price: 100}], date: '2026-10-01'});
eq([old.date, old.meta.title], ['2026-10-01', 'Custom PC build'], 'an old device quotation keeps its date');
const audit = await q('audit.list', {}); ok((audit.rows || audit).some((x) => x.action === 'quote_delete'), 'deleting is in the activity log');

console.log(`Features 9: ${checks} checks passed (saved quotations on the server).`);
