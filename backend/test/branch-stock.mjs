// Stock → Branch stock: each product with what every branch holds, what is on the way, and the shop total;
// the POS price card shows the same numbers for one product.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const api = await apiClient(db), {q, raw} = api, admin = api.token;

ok(/Add branches first/.test((await raw('branch.stock', {})).error), 'branches off: no branch stock');
const tea = await q('product.save', {name: 'Tea pack', sale_price: 100});
const phone = await q('product.save', {name: 'Phone A1', sale_price: 9000, has_warranty: true, warranty_type: 'serial', warranty_days: 365});
const fix = await q('product.save', {name: 'Fitting', sale_price: 300, service: true});
const sup = await q('supplier.save', {name: 'W'});
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: tea.id, qty: 50, cost: 60, sale_price: 100}, {product_id: phone.id, qty: 3, cost: 7000, sale_price: 9000, serials: ['P-1', 'P-2', 'P-3']}], payments: []});
eq((await q('product.history', {product_id: tea.id})).branch_stock, undefined, 'no branch line on the card while branches are off');

let b = await q('branch.save', {name: 'Main Branch'}); const A = b.list[0].id;
b = await q('branch.save', {name: 'Uttara'}); const B = b.list.find((x) => x.name === 'Uttara').id;
let r = await q('branch.stock', {});
const row = (id) => r.rows.find((x) => x.product_id === id);
eq(r.branches.map((x) => [x.name, x.main]), [['Main Branch', true], ['Uttara', false]], 'branches, Main first');
eq([row(tea.id).by, row(tea.id).transit, row(tea.id).total], [{[A]: 50, [B]: 0}, 0, 50], 'all tea in the Main Branch');
ok(!row(fix.id), 'services are not stock');

// Send 10 tea and phone P-2 to Uttara: on the way until received
const sent = await q('branch.transfer.send', {to: B, items: [{product_id: tea.id, qty: 10}, {product_id: phone.id, serials: 'P-2'}]}, {branch: A});
r = await q('branch.stock', {});
eq([row(tea.id).by, row(tea.id).transit, row(tea.id).total], [{[A]: 40, [B]: 0}, 10, 50], 'tea: 40 here, 10 on the way');
eq(row(phone.id).serials, {[A]: ['P-1', 'P-3'], __transit: ['P-2']}, 'phone serials by branch and on the way');
eq([r.totals.by[A], r.totals.by[B], r.totals.transit, r.totals.total], [42, 0, 11, 53], 'totals per branch');
eq([row(tea.id).value, row(phone.id).value, r.totals.value], [3000, 21000, 24000], 'value at cost (admin)');
await q('branch.transfer.receive', {id: sent.id}, {branch: B});
r = await q('branch.stock', {});
eq([row(tea.id).by, row(tea.id).transit], [{[A]: 40, [B]: 10}, 0], 'received: 10 tea in Uttara');
eq(row(phone.id).serials, {[A]: ['P-1', 'P-3'], [B]: ['P-2']}, 'P-2 is now in Uttara');
// The numbers match what each branch sells from
const pl = async (br) => (await q('products.list', {}, {branch: br})).find((p) => p.id === tea.id).stock;
eq([await pl(A), await pl(B)], [row(tea.id).by[A], row(tea.id).by[B]], 'same as the stock each branch sees');

// Price card
let h = await q('product.history', {product_id: tea.id}, {branch: B});
eq([h.branch_stock.here, h.branch_stock.total, h.branch_stock.branches.map((x) => [x.name, x.qty])], [B, 50, [['Main Branch', 40], ['Uttara', 10]]], 'price card: stock per branch, this branch marked');
eq((await q('product.history', {product_id: fix.id})).branch_stock, undefined, 'no branch stock for a service');

// A staff member with Reports but no Cost: quantities, no money; without Reports: refused
await q('rolePerms.save', {manager: [], sales: ['pos', 'warranty', 'reports'], technician: ['repairs', 'service']});
await q('user.save', {name: 'Seller', username: 'seller', role: 'sales', password: 'seller-password-1'});
await q('user.save', {name: 'Tech', username: 'tech', role: 'technician', password: 'tech-password-1', phone: '01711000555'});
api.setToken((await q('login', {username: 'seller', password: 'seller-password-1'})).token);
const s = await raw('branch.stock', {});
ok(s.ok, 'Reports without Cost may open it: ' + s.error);
ok(s.data.cost === false && s.data.totals.value === undefined && s.data.rows.every((x) => x.value === undefined), 'no cost value without the Cost permission');
eq(s.data.totals.total, 53, 'but every quantity');
api.setToken((await q('login', {username: 'tech', password: 'tech-password-1'})).token);
ok(/Permission denied/.test((await raw('branch.stock', {})).error), 'refused without the Reports permission');
api.setToken(admin);
console.log(`Branch stock: ${checks} checks passed`);
