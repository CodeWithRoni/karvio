// Repair jobs: job card, advance (customer payment), technician, parts from stock, Ready SMS,
// delivery as a normal sale invoice (parts + "Repair service" charge), cancel with or without refund.
const fs = require('fs');
const path = require('path');
const harness = fs.readFileSync(path.join(__dirname, 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0];
const scenario = `
sandbox.setupDatabase();
const assert = require('assert/strict');
let checks = 0;
const same = (a, b, msg) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg); checks++; };
const truthy = (v, msg) => { assert.ok(v, msg); checks++; };
const login = (u, p) => { const r = call('login', { username: u, password: p }); if (!r.ok) throw new Error('login ' + u + ': ' + r.error); return r.data; };
const token = login('admin', 'admin123').token;
const Q = (a, p, t) => { const r = call(a, p, t || token); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
const QF = (a, p, t) => { const r = call(a, p, t || token); assert.equal(r.ok, false, a + ' should fail'); checks++; return r.error; };
const run = (code) => vm.runInContext(code, sandbox);

const cash = Q('bootstrap', {}).accounts[0];
const bkash = Q('account.save', { name: 'bKash', type: 'mfs' });
const sup = Q('supplier.save', { name: 'Supplier' });
const ram = Q('product.save', { name: 'DDR4 8GB RAM', has_warranty: true, warranty_type: 'serial', warranty_days: 365, sale_price: 2600 });
const paste = Q('product.save', { name: 'Thermal paste', sale_price: 150 });
Q('purchase.create', { supplier_id: sup.id, items: [{ product_id: ram.id, qty: 2, cost: 2000, serials: ['R1', 'R2'] }, { product_id: paste.id, qty: 10, cost: 80 }], payments: [] });
const accBal = (id) => Q('accounts.list', {}).find((a) => a.id === id).balance;
const custBal = (id) => Q('customers.list', {}).find((c) => c.id === id).balance;
const stockOf = (id) => Q('products.list', {}).find((p) => p.id === id).stock;

/* ---------- permission ---------- */
same(Object.keys(Q('bootstrap', {}).permLabels).includes('repairs'), true, 'Repairs is a permission');
Q('user.save', { name: 'Tanvir', username: 'tanvir', password: 'tanvir1', role: 'sales' });
const tanvir = login('tanvir', 'tanvir1');
truthy(/Permission denied/.test(QF('repairs.list', {}, tanvir.token)), 'sales staff need the repairs permission');
Q('rolePerms.save', { manager: ['repairs'], sales: ['pos', 'repairs'] });
const meta = Q('repairs.meta', {}, tanvir.token);
truthy(meta.technicians.some((u) => u.name === 'Tanvir') && meta.accounts.length === 2, 'technicians and accounts for the page');
same(meta.statuses, ['Received', 'Ready', 'Delivered', 'Cancelled'], 'simple statuses');

/* ---------- 1. job card with a new customer and an advance ---------- */
truthy(/Device is required/.test(QF('repair.save', { customer_name: 'Rafi', phone: '01811000001', problem: 'No display' })), 'device required');
truthy(/Problem is required/.test(QF('repair.save', { customer_name: 'Rafi', phone: '01811000001', device: 'HP laptop' })), 'problem required');
truthy(/phone is required/.test(QF('repair.save', { customer_name: 'Rafi', device: 'HP laptop', problem: 'No display' })), 'phone required');
truthy(/Technician not found/.test(QF('repair.save', { customer_name: 'Rafi', phone: '01811000001', device: 'HP laptop', problem: 'x', technician_id: 'nope' })), 'technician must be a user');
const cash0 = accBal(cash.id);
const tech = Q('users.list', {}).find((u) => u.username === 'tanvir');
const j1 = Q('repair.save', { customer_name: 'Rafi', phone: '01811000001', device: 'HP laptop', serial: 'CND123', problem: 'No display', accessories: 'Charger', estimate: 3000, advance: 500, account_id: cash.id, technician_id: tech.id }, tanvir.token);
same([j1.job_no, j1.status, j1.advance, j1.technician_name, j1.accessories], ['JOB-000001', 'Received', 500, 'Tanvir', 'Charger'], 'job card created');
const rafi = Q('customers.list', {}).find((c) => c.name === 'Rafi');
same([rafi.phones, custBal(rafi.id), accBal(cash.id) - cash0], ['01811000001', -500, 500], 'new customer; the advance is in Cash and on his account as credit');
same(Q('customer.statement', { customer_id: rafi.id }).rows.map((r) => [r.type, r.credit]), [['payment', 500]], 'advance in the customer statement');

/* the same phone in another format is the same customer */
const j2 = Q('repair.save', { customer_name: 'Rafi Ahmed', phone: '+880 1811-000001', device: 'Printer', problem: 'Paper jam' });
same([j2.customer_id, j2.job_no], [rafi.id, 'JOB-000002'], 'same customer by phone');

/* ---------- 2. parts from stock, charge, technician change, more advance ---------- */
truthy(/not in stock/.test(QF('repair.save', { ...j1, parts: [{ product_id: ram.id, qty: 1, price: 2600, serials: 'R9' }] })), 'serial part must be in stock');
truthy(/Select 1 serial/.test(QF('repair.save', { ...j1, parts: [{ product_id: ram.id, qty: 1, price: 2600 }] })), 'serial part needs its serial');
truthy(/Only 10 pcs/.test(QF('repair.save', { ...j1, parts: [{ product_id: paste.id, qty: 11, price: 150 }] })), 'not more than in stock');
const admin = Q('users.list', {}).find((u) => u.username === 'admin');
const j1b = Q('repair.save', { ...j1, technician_id: admin.id, charge: 1000, parts: [{ product_id: ram.id, qty: 1, price: 2600, serials: 'R1' }, { product_id: paste.id, qty: 1, price: 150 }], advance: 200, account_id: bkash.id });
same([j1b.charge, j1b.parts_total, j1b.total, j1b.advance, j1b.due, j1b.technician_name], [1000, 2750, 3750, 700, 3050, 'Administrator'], 'parts, charge and advance add up');
truthy(j1b.log.some((l) => /Technician: Administrator/.test(l.note) && /Advance \\+200/.test(l.note)), 'changes are logged');
same([stockOf(ram.id), stockOf(paste.id)], [2, 10], 'parts leave stock only on delivery');
same(Q('repairs.list', { technician_id: admin.id }).map((r) => r.job_no), ['JOB-000001'], 'filter by technician');
same(Q('repairs.list', { q: 'printer' }).map((r) => r.job_no), ['JOB-000002'], 'search');

/* ---------- 3. Ready sends the SMS ---------- */
Q('settings.save', { values: { shop_name: 'Computer Plus', sms_enabled: 'true', sms_method: 'GET', sms_url: 'https://gw.example/send?to={number}&msg={message}' } });
const sent = []; const realFetch = sandbox.UrlFetchApp.fetch;
sandbox.UrlFetchApp.fetch = (url) => { sent.push(decodeURIComponent(url)); return { getResponseCode: () => 200, getContentText: () => 'SMS SUBMITTED: ID - 1' }; };
const ready = Q('repair.status', { id: j1.id, status: 'Ready' });
same([ready.status, ready.ready_date === sandbox.today_(), ready.sms && ready.sms.ok], ['Ready', true, true], 'Ready with SMS');
truthy(sent.length === 1 && sent[0].includes('8801811000001') && sent[0].includes('HP laptop (Job JOB-000001) is ready at Computer Plus. Charge 3750, Advance 700, Due 3050'), 'the SMS text');
same(Q('repair.status', { id: j1.id, status: 'Received', note: 'Fan noise' }).status, 'Received', 'back to work');
Q('repair.status', { id: j1.id, status: 'Ready', send_sms: false });
same(sent.length, 1, 'no SMS when switched off for this job');
sandbox.UrlFetchApp.fetch = realFetch;
Q('settings.save', { values: { sms_enabled: 'false' } });
truthy(/Deliver or Cancel/.test(QF('repair.status', { id: j1.id, status: 'Delivered' })), 'delivery has its own step');

/* ---------- 4. delivery: one invoice, advance used, the rest paid ---------- */
const c1 = accBal(cash.id), profit0 = Q('profit.report', {}).summary.gross;
truthy(/exceeds/.test(QF('repair.deliver', { id: j1.id, payments: [{ account_id: cash.id, amount: 3100 }] })), 'cannot take more than is due');
const d1 = Q('repair.deliver', { id: j1.id, payments: [{ account_id: cash.id, amount: 3050 }] });
same([d1.status, d1.sale.invoice_no === d1.invoice_no, d1.sale.total, d1.sale.credit_used, d1.sale.paid, d1.sale.due], ['Delivered', true, 3750, 700, 3750, 0], 'invoice for the job');
const inv = Q('sale.detail', { id: d1.sale_id });
same(inv.items.map((i) => [i.name, i.qty, i.price, i.serials]), [['DDR4 8GB RAM', 1, 2600, 'R1'], ['Thermal paste', 1, 150, ''], ['Repair service', 1, 1000, '']], 'parts and the repair charge on the invoice');
same(inv.items[0].warranty_days, 365, 'the RAM keeps its warranty');
same([stockOf(ram.id), stockOf(paste.id), accBal(cash.id) - c1, custBal(rafi.id)], [1, 9, 3050, 0], 'stock, cash and the customer account');
same(Math.round((Q('profit.report', {}).summary.gross - profit0) * 100) / 100, 1000 + 600 + 70, 'profit: charge + RAM margin + paste margin');
same(Q('products.list', {}).filter((p) => p.name === 'Repair service').map((p) => [p.service, p.stock]), [[true, 0]], 'one service product, never stocked');
truthy(/Delivered and can no longer/.test(QF('repair.save', { ...d1 })), 'a delivered job is closed');
truthy(/Delivered/.test(QF('repair.cancel', { id: j1.id, reason: 'x' })), 'cannot cancel after delivery');
same(Q('repairs.list', { status: 'Delivered' })[0].sale_status, 'active', 'list shows the invoice status');

/* ---------- 5. delivery with a balance left as due ---------- */
const j3 = Q('repair.save', { customer_id: rafi.id, device: 'Desktop PC', problem: 'Windows', charge: 800 });
const d3 = Q('repair.deliver', { id: j3.id, payments: [{ account_id: cash.id, amount: 300 }], next_payment_date: sandbox.addDays_(sandbox.today_(), 3) });
same([d3.sale.paid, d3.sale.due, custBal(rafi.id)], [300, 500, 500], 'unpaid part is the customer due');

/* ---------- 6. cancel: refund the advance, or keep it as credit ---------- */
const j4 = Q('repair.save', { customer_name: 'Mitu', phone: '01911000002', device: 'Phone', problem: 'Battery', advance: 400, account_id: bkash.id });
const mitu = j4.customer_id, b0 = accBal(bkash.id);
truthy(/Write why/.test(QF('repair.cancel', { id: j4.id })), 'a reason is needed');
const k4 = Q('repair.cancel', { id: j4.id, reason: 'Customer took it back', refund_account_id: bkash.id });
same([k4.status, b0 - accBal(bkash.id), custBal(mitu)], ['Cancelled', 400, 0], 'advance paid back from bKash');
const j5 = Q('repair.save', { customer_id: mitu, device: 'Tablet', problem: 'Screen', advance: 250, account_id: cash.id });
Q('repair.cancel', { id: j5.id, reason: 'Part not available' });
same(custBal(mitu), -250, 'or kept on the customer account as credit');
truthy(/Cancelled/.test(QF('repair.deliver', { id: j5.id })), 'a cancelled job cannot be delivered');

/* ---------- 7. free job: no invoice ---------- */
const j6 = Q('repair.save', { customer_id: mitu, device: 'Mouse', problem: 'Check only' });
const d6 = Q('repair.deliver', { id: j6.id });
same([d6.status, d6.invoice_no, d6.sale], ['Delivered', '', null], 'nothing to charge, no invoice');

/* ---------- 8. the second job reuses the service product; idempotent retry ---------- */
const j7 = Q('repair.save', { customer_id: rafi.id, device: 'UPS', problem: 'Battery', charge: 500 });
Q('repair.deliver', { id: j7.id, payments: [{ account_id: cash.id, amount: 500 }] });
same(Q('products.list', {}).filter((p) => p.name === 'Repair service').length, 1, 'still one service product');
const raw = (action, payload, id) => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify({ action, payload, token, request_id: id }) } }).getContent());
const a1 = raw('repair.save', { customer_id: rafi.id, device: 'Router', problem: 'Reset' }, 'repair-retry-0001');
const a2 = raw('repair.save', { customer_id: rafi.id, device: 'Router', problem: 'Reset' }, 'repair-retry-0001');
same([a1.ok, a2.ok, a1.data.job_no === a2.data.job_no, Q('repairs.list', { q: 'router' }).length], [true, true, true, 1], 'a retried save makes one job');
same(run("all_('AuditLog').filter(function(a){return /^repair_/.test(a.action)}).length") >= 10, true, 'repair actions are audited');

console.log('Repair jobs: ' + checks + ' checks passed');
`;
eval(harness + scenario);
