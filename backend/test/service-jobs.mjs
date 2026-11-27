// Service jobs (field work): service list, new job with reserved products, technician Work done, Complete with
// what was used (the rest back to stock) and an invoice, cancelling, and who may do what.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const api = await apiClient(db), {q, raw} = api;
const adminToken = api.token;
const as = async (username, password) => { api.setToken((await q('login', {username, password})).token); };
const asAdmin = () => api.setToken(adminToken);
const cash = (await q('bootstrap')).accounts[0].id;

// ---- Service list (admin only)
let types = await q('service.type.save', {name: 'CC Camera Installation', charge: 1500});
types = await q('service.type.save', {name: 'New Internet Connection', charge: 1000});
eq(types.map((t) => [t.name, t.charge, t.active]), [['CC Camera Installation', 1500, true], ['New Internet Connection', 1000, true]], 'two services in the list');
ok(/already in the list/.test((await raw('service.type.save', {name: 'cc camera installation'})).error), 'no duplicate names');
const cam = types[0], net = types[1];

// ---- Stock: 5 serial cameras and 50 connectors
const camera = await q('product.save', {name: 'Dahua 2MP camera', sale_price: 2200, has_warranty: true, warranty_type: 'serial', warranty_days: 365});
const rj = await q('product.save', {name: 'RJ45 connector', sale_price: 10});
const sup = await q('supplier.save', {name: 'Camera supplier'});
const sn = ['CAM-1', 'CAM-2', 'CAM-3', 'CAM-4', 'CAM-5'];
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: camera.id, qty: 5, cost: 1800, sale_price: 2200, serials: sn}, {product_id: rj.id, qty: 50, cost: 5, sale_price: 10}], payments: []});

// ---- Staff
await q('user.save', {name: 'Rakib', username: 'rakib', role: 'technician', password: 'tech-password-1', phone: '01711000001'});
await q('user.save', {name: 'Sumon', username: 'sumon', role: 'technician', password: 'tech-password-2', phone: '01711000002'});
await q('user.save', {name: 'Mgr', username: 'mgr8', role: 'manager', password: 'mgr-password-1'});
const meta = await q('services.meta');
const rakib = meta.technicians.find((t) => t.name === 'Rakib'), sumon = meta.technicians.find((t) => t.name === 'Sumon');
eq([meta.manage, meta.admin, meta.types.length], [true, true, 2], 'meta for the admin');

// ---- New service with a new customer and the products the technician takes
ok(/address/.test((await raw('service.save', {customer_name: 'Karim', phone: '01819000001', type_id: cam.id, details: '4 cameras', technician_id: rakib.id})).error), 'the work address is needed');
const job = await q('service.save', {customer_name: 'Karim', phone: '01819000001', address: 'Mirpur 10, Dhaka', type_id: cam.id, details: '4 cameras at the shop front, DVR in the office',
  technician_id: rakib.id, charge: 1500, parts: [{product_id: camera.id, qty: 5, price: 2200, serials: sn.join(',')}, {product_id: rj.id, qty: 20, price: 10}]});
eq([job.job_no, job.status, job.service, job.address, job.technician_name, job.total], ['SRV-000001', 'Pending', 'CC Camera Installation', 'Mirpur 10, Dhaka', 'Rakib', 1500 + 11000 + 200], 'service created, Pending');
const karim = (await q('customers.list')).find((c) => c.name === 'Karim');
eq(karim.addresses, 'Mirpur 10, Dhaka', 'the new customer keeps the address');
// reserved: the cameras cannot be sold and only 30 connectors are free
const walk = await raw('sale.create', {items: [{product_id: camera.id, qty: 1, price: 2200, serials: 'CAM-1'}], payments: [{account_id: cash, amount: 2200}]});
ok(/reserved/i.test(walk.error), 'a reserved camera cannot be sold');
ok(/reserved/i.test((await raw('sale.create', {items: [{product_id: rj.id, qty: 31, price: 10}], payments: [{account_id: cash, amount: 310}]})).error), 'reserved connectors cannot be sold');
ok((await raw('service.save', {customer_id: karim.id, address: 'x', type_id: net.id, details: 'y', parts: [{product_id: camera.id, qty: 1, price: 1, serials: 'CAM-2'}]})).error.match(/reserved/), 'nor taken by another service');
eq((await q('repairs.list')).length, 0, 'service jobs are not repair jobs');

// ---- The technician sees only their own jobs and marks Work done
await as('sumon', 'tech-password-2');
eq((await q('services.list')).length, 0, 'another technician does not see it');
ok(/not yours/.test((await raw('service.status', {id: job.id, status: 'Work done'})).error), 'nor change it');
await as('rakib', 'tech-password-1');
eq((await q('services.list')).map((r) => r.job_no), ['SRV-000001'], 'the technician sees their job');
eq((await q('services.meta')).manage, false, 'technicians do not manage');
ok(/admin or manager/.test((await raw('service.save', {customer_id: karim.id, address: 'x', type_id: net.id, details: 'y'})).error), 'technicians cannot create jobs');
ok(/admin or manager/.test((await raw('service.complete', {id: job.id})).error), 'nor complete them');
const wd = await q('service.status', {id: job.id, status: 'Work done', note: '3 cameras fitted, 2 came back'});
eq([wd.status, wd.result_note, wd.result_by], ['Work done', '3 cameras fitted, 2 came back', 'Rakib'], 'work done by the technician');
asAdmin();
eq((await q('dashboard')).services_done, 1, 'the dashboard shows one job to complete');

// ---- Complete: 3 cameras and 15 connectors used, the rest back to stock, partly paid
ok(/between 0 and 20/.test((await raw('service.complete', {id: job.id, used: [{product_id: rj.id, qty: 25}]})).error), 'cannot use more than was taken');
ok(/was not taken/.test((await raw('service.complete', {id: job.id, used: [{product_id: camera.id, serials: 'CAM-9'}]})).error), 'only the serials that were taken');
await as('mgr8', 'mgr-password-1');
const done = await q('service.complete', {id: job.id, charge: 1500, discount: 100, used: [{product_id: camera.id, serials: 'CAM-1,CAM-2,CAM-3'}, {product_id: rj.id, qty: 15}], payments: [{account_id: cash, amount: 5000}]});
asAdmin();
eq([done.status, done.invoice_no.length > 0, done.returned], ['Completed', true, ['2 pcs Dahua 2MP camera', '5 pcs RJ45 connector']], 'completed with an invoice; what came back is listed');
const inv = await q('sale.detail', {id: done.sale_id});
eq(inv.items.map((i) => [i.name, i.qty, i.total]), [['Dahua 2MP camera', 3, 6600], ['RJ45 connector', 15, 150], ['CC Camera Installation', 1, 1500]], 'invoice: products used and the service charge');
eq([inv.sale.total, inv.sale.paid, inv.sale.due], [8150, 5000, 3150], 'discount, paid and due');
eq((await q('customers.list')).find((c) => c.id === karim.id).balance, 3150, 'the due is on the customer');
const sold = await q('sale.create', {items: [{product_id: camera.id, qty: 1, price: 2200, serials: 'CAM-4'}, {product_id: rj.id, qty: 35, price: 10}], payments: [{account_id: cash, amount: 2550}]});
ok(sold.sale.invoice_no, 'returned cameras and connectors can be sold again');
eq((await q('dashboard')).services_done, 0, 'nothing left to complete');

// ---- Cancelling the invoice sends the job back to Work done; cancelling the job frees the products
await q('reverse', {type: 'sale', id: done.sale_id, reason: 'Wrong price', password: 'harness-password-1'});
const back = await q('service.get', {id: job.id});
eq([back.status, back.invoice_no, back.parts.map((p) => [p.name, p.qty])], ['Work done', '', [['Dahua 2MP camera', 3], ['RJ45 connector', 15]]], 'invoice cancelled: Work done again with what was used');
ok(/reserved/i.test((await raw('sale.create', {items: [{product_id: camera.id, qty: 1, price: 2200, serials: 'CAM-1'}], payments: [{account_id: cash, amount: 2200}]})).error), 'the used cameras are reserved again');
await q('service.cancel', {id: job.id, reason: 'Customer changed the plan'});
eq((await q('service.get', {id: job.id})).status, 'Cancelled', 'cancelled');
ok((await q('sale.create', {items: [{product_id: camera.id, qty: 1, price: 2200, serials: 'CAM-1'}], payments: [{account_id: cash, amount: 2200}]})).sale, 'cancelled job: the products are free');

// ---- A job with no products and no technician; given later
const j2 = await q('service.save', {customer_id: karim.id, type_id: net.id, details: 'New 20 Mbps line', charge: 1000});
eq([j2.job_no, j2.address, j2.technician_name, j2.charge], ['SRV-000002', 'Mirpur 10, Dhaka', '', 1000], 'address from the customer, no technician yet');
const j2b = await q('service.save', {id: j2.id, type_id: net.id, details: 'New 20 Mbps line', address: 'Mirpur 10, Dhaka', technician_id: sumon.id, charge: 1200});
eq([j2b.technician_name, j2b.charge, j2b.log.at(-1).note], ['Sumon', 1200, 'Given to Sumon'], 'given to a technician later');
await q('customer.payment', { customer_id: karim.id, amount: 500, account_id: cash });
const eligibleAdvance = (await q('service.get', { id: j2.id })).available_advance;
ok(eligibleAdvance >= 200, 'completion can see existing customer advance');
ok(/discount/i.test((await raw('service.complete', { id: j2.id, discount: 1201 })).error), 'discount larger than the service is rejected');
const fin = await q('service.complete', {id: j2.id, credit_used: 200, payments: [{account_id: cash, amount: 1000}]});
eq([fin.sale.credit_used, fin.sale.paid, fin.sale.due], [200, 1200, 0], 'advance and new payment settle the invoice once');
eq([(await q('sale.detail', {id: fin.sale_id})).items.map((i) => i.name), fin.status], [['New Internet Connection'], 'Completed'], 'service charge only');
ok(/can no longer be changed/.test((await raw('service.save', {id: j2.id, type_id: net.id, details: 'x', address: 'y'})).error), 'a completed job is closed');

// ---- Service list: in use cannot be deleted; switched off is hidden from staff
ok(/Switch it off/.test((await raw('service.type.delete', {id: net.id})).error), 'a service with jobs is not deleted');
await q('service.type.save', {id: net.id, name: net.name, charge: 1000, active: false});
await as('mgr8', 'mgr-password-1');
eq((await q('services.meta')).types.map((t) => t.name), ['CC Camera Installation'], 'switched-off services are hidden from staff');
ok(/Only an admin/.test((await raw('service.type.save', {name: 'Router setup'})).error), 'only the admin edits the list');
asAdmin();

// ---- Shops that saved role permissions before Service existed: managers and technicians get it
await db.query(`update "Settings" set value = $1 where key = 'role_perms'`, [JSON.stringify({manager: ['pos', 'repairs'], sales: ['pos'], technician: ['repairs']})]);
await as('mgr8', 'mgr-password-1');
ok(Array.isArray(await q('services.list')), 'roles saved before Service existed: the manager gets Service');
asAdmin();
const saved = await q('rolePerms.save', {manager: ['pos'], sales: ['pos'], technician: ['repairs']});
eq(saved.known.includes('service'), true, 'saving the roles records the known permissions');
await as('mgr8', 'mgr-password-1');
ok(/Permission denied|not allowed|permission/i.test((await raw('services.list')).error || ''), 'after the admin takes it away, the manager has no Service');
asAdmin();

console.log(`Features 8: ${checks} checks passed (service jobs).`);
