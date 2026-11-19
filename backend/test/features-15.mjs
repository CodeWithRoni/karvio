// 19 Nov: purchase edit, the product form's required name parts, and formatted notes.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';
const db = await freshDatabase(); const api = await apiClient(db), {q, raw} = api;
let checks = 0; const note = (name, ok, detail) => { assert.ok(ok, name + (detail ? ' — ' + detail : '')); checks++; };
const cash = (await q('bootstrap')).accounts[0].id;
const pw = 'harness-password-1';
const sup = await q('supplier.save', {name: 'City Computer'});
const sup2 = await q('supplier.save', {name: 'Other supplier'});
const cable = await q('product.save', {name: 'Cable', sale_price: 100});
const router = await q('product.save', {name: 'Router', sale_price: 3000, has_warranty: true, warranty_type: 'serial', warranty_days: 365});
const supBal = async (id) => { const s = (await q('suppliers.list')).find((x) => x.id === id); return Number(s.balance ?? s.due ?? 0); };
const stock = async (id) => (await q('products.list', {})).find((p) => p.id === id).stock;

// ---- Purchase edit
const pur = await q('purchase.create', {supplier_id: sup.id, supplier_invoice: 'INV-1', items: [{product_id: cable.id, qty: 10, cost: 50}, {product_id: router.id, qty: 2, cost: 2000, serials: 'R1,R2', supplier_warranty_expiry: '2027-11-16'}], payments: [{account_id: cash, amount: 1000}]});
const no = pur.purchase.invoice_no, balBefore = await supBal(sup.id);
const ed = await q('purchase.edit', {id: pur.purchase.id, password: pw, reason: 'wrong cost', supplier_id: sup.id, supplier_invoice: 'INV-1', discount: 0,
  items: [{product_id: cable.id, qty: 8, cost: 55}, {product_id: router.id, qty: 3, cost: 2100, serials: 'R1,R2,R3', supplier_warranty_expiry: '2027-11-16'}], payments: [{account_id: cash, amount: 500}]});
note('Purchase edit: keeps the number', ed.purchase.invoice_no === no && ed.purchase.date === pur.purchase.date, `${ed.purchase.invoice_no} ${ed.purchase.date}`);
note('Purchase edit: new total', ed.purchase.total === 8 * 55 + 3 * 2100, String(ed.purchase.total));
note('Purchase edit: stock follows', (await stock(cable.id)) === 8 && (await stock(router.id)) === 3, `cable ${await stock(cable.id)}, router ${await stock(router.id)}`);
const pl = await q('purchases.list', {q: no + '-E1', include_edited: true});
const plHidden = await q('purchases.list', {q: no});
note('Purchase edit: the old copy is hidden from the purchase list', !(plHidden.rows || plHidden).some((r) => r.invoice_no === no + '-E1')); const old = (Array.isArray(pl) ? pl : pl.rows || pl.purchases || []).find((r) => r.invoice_no === no + '-E1');
note('Purchase edit: old copy kept as -E1, cancelled', old && old.status === 'cancelled', JSON.stringify(old && {no: old.invoice_no, st: old.status}));
const balAfter = await supBal(sup.id);
note('Purchase edit: supplier due corrected', Math.abs((balAfter - balBefore) - ((8 * 55 + 3 * 2100 - 500) - (10 * 50 + 2 * 2000 - 1000))) < 0.01, `before ${balBefore}, after ${balAfter}`);
note('Purchase edit: supplier warranty kept', ed.items.find((i) => i.product_id === router.id).supplier_warranty_expiry === '2027-11-16');
// a router sold from it: the purchase can no longer be edited
await q('sale.create', {items: [{product_id: router.id, qty: 1, price: 3000, serials: 'R1'}], payments: [{account_id: cash, amount: 3000}]});
const blocked = await raw('purchase.edit', {id: ed.purchase.id, password: pw, supplier_id: sup.id, items: [{product_id: cable.id, qty: 8, cost: 55}], payments: []});
note('Purchase edit: refused after its stock was sold', !blocked.ok && /Cannot edit|sold/.test(blocked.error), blocked.error);
const wrongPw = await raw('purchase.edit', {id: ed.purchase.id, password: 'nope', items: [{product_id: cable.id, qty: 1, cost: 5}], payments: []});
note('Purchase edit: needs the admin password', !wrongPw.ok);
// a purchase with a new supplier
const p2 = await q('purchase.create', {supplier_id: sup.id, items: [{product_id: cable.id, qty: 4, cost: 50}], payments: []});
const p2e = await q('purchase.edit', {id: p2.purchase.id, password: pw, supplier_id: sup2.id, items: [{product_id: cable.id, qty: 4, cost: 50}], payments: []});
note('Purchase edit: supplier changed', p2e.purchase.supplier_id === sup2.id && (await supBal(sup2.id)) === 200, `${p2e.purchase.supplier_name} ${await supBal(sup2.id)}`);

// ---- Product form: a new stock product needs group, category, brand, model and unit
const g = await q('master.save', {kind: 'group', name: 'ACCESSORIES'});
const c = await q('master.save', {kind: 'category', name: 'MOUSE', parent_id: g.id});
const b = await q('master.save', {kind: 'brand', name: 'A4 TECH'});
const half = await raw('product.save', {name: 'ACCESSORIES', category_id: g.id, unit: 'pcs', full_name_check: true});
note('Product form: group only is refused', !half.ok && /Category, Brand, SKU/.test(half.error), half.error);
const full = await raw('product.save', {name: 'A4 TECH ACCESSORIES MOUSE OP-620D', category_id: g.id, subcategory_id: c.id, brand_id: b.id, sku: 'OP-620D', unit: 'pcs', full_name_check: true});
note('Product form: full product is added', full.ok, full.error);
const svc = await raw('product.save', {name: 'Windows setup', service: true, full_name_check: true});
note('Product form: a service needs none of them', svc.ok, svc.error);

// ---- Notes: title, formatted body, date, priority; unsafe parts are removed
const n1 = await q('note.save', {title: 'Call supplier', body: '<b onclick="x()">Ask</b> about <script>alert(1)</script><ul><li>router</li></ul><a href="javascript:alert(1)">bad</a><a href="https://example.com">ok</a>', date: '2026-11-18', priority: 'urgent', status: 'open'});
const x = n1.find((n) => n.title === 'Call supplier');
note('Notes: saved with title, date and priority', x && x.date === '2026-11-18' && x.priority === 'urgent', JSON.stringify(x));
note('Notes: unsafe html removed', x && !/script|onclick|javascript/i.test(x.body) && /<b>Ask<\/b>/.test(x.body) && /href="https:\/\/example.com"/.test(x.body), x && x.body);
note('Notes: plain text kept for the reminder', x && /Ask about/.test(x.text) && /router/.test(x.text), x && x.text);
const n2 = await q('note.save', {...x, title: 'Call supplier today'});
note('Notes: edit', n2.some((n) => n.id === x.id && n.title === 'Call supplier today') && n2.length === n1.length);
const n3 = await q('note.delete', {id: x.id});
note('Notes: delete', !n3.some((n) => n.id === x.id));
const old1 = await q('note.save', {text: 'Old style note'});
note('Notes: older plain notes still work', old1.some((n) => n.text === 'Old style note' && /Old style note/.test(n.body)));
const emptyN = await raw('note.save', {title: '', body: '<p> </p>'});
note('Notes: an empty note is refused', !emptyN.ok);

// ---- Users: a branch chosen when creating / editing a user, the same as Settings → Branches
const br = await q('branch.save', {name: 'Mirpur'});
const brId = br.list.find((b) => b.name === 'Mirpur').id;
// the first branch added: the shop as it is today becomes the Main Branch with all the stock
const mainB = br.list[0];
note('Branches: the first branch makes a Main Branch first', mainB.name === 'Main Branch' && mainB.main === true && br.list.length === 2 && br.list[1].name === 'Mirpur', JSON.stringify(br.list.map((b) => [b.name, b.main])));
note('Branches: the Main Branch holds the existing stock', (br.stock_units[mainB.id] || 0) > 0 && !(br.stock_units[brId] > 0), JSON.stringify(br.stock_units));
const closeMain = await raw('branch.save', {...mainB, active: false});
note('Branches: the Main Branch cannot be closed', !closeMain.ok && /Main Branch cannot be closed/.test(closeMain.error), closeMain.error);
const ren = await q('branch.save', {...mainB, name: 'Head Office'});
note('Branches: the Main Branch can be renamed and stays main', ren.list[0].name === 'Head Office' && ren.list[0].main);
await q('branch.save', {...ren.list[0], name: 'Main Branch'});
const u1 = await q('user.save', {name: 'Rafi', username: 'rafi', password: 'long-password-123', role: 'sales', branch_id: brId});
let ub = (await q('branches.get')).user_branches;
note('Users: branch given when the user is created', ub[u1.id] === brId, JSON.stringify(ub));
note('Users: list shows the branch', (await q('users.list')).find((u) => u.id === u1.id).branch_id === brId);
await q('user.save', {...u1, password: '', branch_id: ''});
ub = (await q('branches.get')).user_branches;
note('Users: set back to Any branch from the user form', !ub[u1.id]);
await q('branch.assign', {users: {[u1.id]: brId}});
note('Users: Settings → Branches still assigns, and the user list sees it', (await q('users.list')).find((u) => u.id === u1.id).branch_id === brId);
await q('user.save', {...u1, password: '', name: 'Rafi Ahmed'});
note('Users: saving without a branch field keeps the branch', (await q('branches.get')).user_branches[u1.id] === brId);
const badBr = await raw('user.save', {...u1, password: '', branch_id: 'nope'});
note('Users: an unknown branch is refused', !badBr.ok);

// ---- Names start with a capital; sign-in ignores capital letters in the username
const lu = await q('user.save', {name: 'karim', username: 'Karim', password: 'long-password-123', role: 'sales'});
note('Users: name saved with a capital first letter', lu.name === 'Karim' && lu.username === 'karim', JSON.stringify(lu));
for (const un of ['karim', 'KARIM', 'Karim']) { const r = await raw('login', {username: un, password: 'long-password-123'}); note('Login with username ' + un, r.ok, r.error); }

// ---- Sign in to a branch
const lb = await raw('login.branches', {});
note('Sign-in screen lists the open branches, Main first', lb.ok && lb.data.on && lb.data.list[0].name === 'Main Branch' && lb.data.list.some((b) => b.id === brId), JSON.stringify(lb));
const second = await q('branch.save', {name: 'Showroom - 2'});
const s2id = second.id || (await q('branches.get')).list.find((b) => b.name === 'Showroom - 2').id;
const anyU = await q('user.save', {name: 'Any', username: 'anyone', password: 'long-password-123', role: 'sales', branch_id: ''});
const la = await raw('login', {username: 'anyone', password: 'long-password-123', branch: s2id});
note('Sign in: an any-branch user works in the branch chosen', la.ok && la.data.branch === s2id, JSON.stringify(la.data && la.data.branch));
const lf = await raw('login', {username: 'rafi', password: 'long-password-123', branch: s2id});
note('Sign in: a user fixed to another branch is refused', !lf.ok && /You work in Mirpur/.test(lf.error), lf.error);
const lf2 = await raw('login', {username: 'rafi', password: 'long-password-123', branch: brId});
note('Sign in: a fixed user in their own branch', lf2.ok && lf2.data.branch === brId);
const lbad = await raw('login', {username: 'anyone', password: 'long-password-123', branch: 'nope'});
note('Sign in: an unknown branch is refused', !lbad.ok);

// ---- Exchange: 3 serial routers back, a cheaper product out, the rest kept as customer credit
{
  const cust = await q('customer.save', {name: 'Exchange customer', phones: '01799999999'});
  const rt = await q('product.save', {name: 'Router AX15 exch', sale_price: 5500, has_warranty: true, warranty_type: 'serial', warranty_days: 365});
  const ms = await q('product.save', {name: 'Mouse exch', sale_price: 550});
  await q('purchase.create', {items: [{product_id: rt.id, qty: 3, cost: 5000, serials: 'EX-1,EX-2,EX-3'}, {product_id: ms.id, qty: 20, cost: 425}], payments: [{account_id: cash, amount: 23500}]});
  const sold = await q('sale.create', {customer_id: cust.id, items: [{product_id: rt.id, qty: 3, price: 5500, serials: 'EX-1,EX-2,EX-3'}], payments: [{account_id: cash, amount: 16500}]});
  const det = await q('sale.detail', {id: sold.sale.id});
  note('Sale detail lists the serials still returnable', JSON.stringify(det.items[0].serials_left) === JSON.stringify(['EX-1', 'EX-2', 'EX-3']), JSON.stringify(det.items[0].serials_left));
  const bal = async () => Number((await q('customers.list')).find((c) => c.id === cust.id).balance);
  const ex = await raw('sale.exchange', {sale_id: sold.sale.id, note: 'Not Need', expected_return_value: 16500, expected_total: 5500, expected_credit: 5500,
    items: [{sale_item_id: det.items[0].id, qty: 3, serials: ['EX-1', 'EX-2', 'EX-3']}], replacement: [{product_id: ms.id, qty: 10, price: 550, serials: []}], payments: [], next_payment_date: ''});
  note('Exchange with surplus: recorded', ex.ok, ex.error);
  note('Exchange with surplus: 11,000 kept as customer credit', (await bal()) === -11000, String(await bal()));
  const det2 = await q('sale.detail', {id: sold.sale.id});
  note('Returned serials are no longer returnable', det2.items[0].serials_left.length === 0, JSON.stringify(det2.items[0].serials_left));
}

console.log(`features-15: ${checks} checks passed`);
