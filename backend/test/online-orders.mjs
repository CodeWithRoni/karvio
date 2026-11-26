// Online orders: take, confirm into an invoice, ship by hand or through a courier API (mocked), settle the
// cash on delivery with the courier charge, or take the parcel back; courier keys stay on the server.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const calls = [];
let next = null; // what the mocked courier answers
const courierFetch = async (url, init) => {
  calls.push({url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null});
  const r = typeof next === 'function' ? next(url, init) : next;
  return {status: r.status ?? 200, text: async () => JSON.stringify(r.body)};
};
const db = await freshDatabase();
const api = await apiClient(db, {handlerOptions: {courierFetch}}), {q, raw} = api;
const boot = await q('bootstrap');
const cash = boot.accounts.find((a) => a.type === 'cash').id;
const bkash = (await q('account.save', {name: 'bKash', type: 'mfs', opening_balance: 0})).id;
const shirt = await q('product.save', {name: 'Polo shirt', sale_price: 650});
const sup = await q('supplier.save', {name: 'Garments'});
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: shirt.id, qty: 30, cost: 400, sale_price: 650}], payments: []});
const stock = async () => (await q('products.list')).find((p) => p.id === shirt.id).stock;
const balance = async (id) => (await q('accounts.list')).find((a) => a.id === id).balance;

// ---- Take an order
const form = {source: 'Facebook', customer: {name: 'Rina Akter', phone: '01712-345678', address: 'House 4, Road 2, Mirpur 10, Dhaka'}, items: [{product_id: shirt.id, qty: 2, price: 650}], delivery_charge: 80, discount: 30, advance: 200, advance_account_id: bkash, note: 'Size L'};
ok(/mobile number/.test((await raw('order.save', {...form, customer: {...form.customer, phone: '123'}})).error), 'a mobile number is required');
ok(/delivery address/.test((await raw('order.save', {...form, customer: {...form.customer, address: ''}})).error), 'an address is required');
ok(/more than the order total/.test((await raw('order.save', {...form, advance: 5000})).error), 'the advance cannot pass the total');
let o = await q('order.save', form);
eq([o.no, o.status, o.subtotal, o.total, o.cod, o.customer.phone], ['OO-000001', 'new', 1300, 1350, 1150, '01712345678'], 'order: 1300 + 80 delivery − 30 = 1350, COD 1150');
eq(await stock(), 30, 'a new order does not touch stock');
o = await q('order.save', {...form, id: o.id, items: [{product_id: shirt.id, qty: 3, price: 650}]});
eq([o.total, o.cod], [2000, 1800], 'a new order can be changed');

// ---- Confirm: invoice, stock out, customer made from the phone, advance into bKash
o = await q('order.confirm', {id: o.id});
eq([o.status, o.invoice_no.length > 0, await stock()], ['confirmed', true, 27], 'confirmed: invoice made, 3 shirts left the shelf');
eq(await balance(bkash), 200, 'the advance is in bKash');
const cust = (await q('customers.list')).find((c) => c.name === 'Rina Akter');
eq(cust.balance, 1800, 'the customer owes the cash-on-delivery amount');
ok(/already confirmed/.test((await raw('order.confirm', {id: o.id})).error), 'no second invoice');
ok(/Only a new order/.test((await raw('order.save', {...form, id: o.id})).error), 'a confirmed order cannot be edited');

// ---- Ship by hand, deliver, settle: COD collected, courier charge as an expense
o = await q('order.ship', {id: o.id, courier: 'other', courier_name: 'Sundarban', tracking: 'SB-99'});
eq([o.status, o.courier.label, o.courier.tracking, o.courier.by_api], ['shipped', 'Sundarban', 'SB-99', false], 'shipped by hand with a tracking number');
o = await q('order.deliver', {id: o.id});
const cashBefore = await balance(cash);
o = await q('order.settle', {id: o.id, account_id: cash, charge: 130});
eq([o.status, o.settlement.collected, o.settlement.received], ['settled', 1800, 1670], 'settled: 1800 COD − 130 charge = 1670 received');
eq(await balance(cash), cashBefore + 1670, 'cash grows by what the courier paid');
eq((await q('customers.list')).find((c) => c.name === 'Rina Akter').balance, 0, 'the customer owes nothing');
ok((await q('expenses.list', {})).some((e) => e.category === 'Courier charge' && e.amount === 130), 'the courier charge is an expense');

// ---- A second order comes back
let o2 = await q('order.save', {...form, advance: 0, advance_account_id: ''});
o2 = await q('order.confirm', {id: o2.id});
eq(await stock(), 25, 'two more shirts out');
o2 = await q('order.ship', {id: o2.id, courier: 'other', tracking: 'X-1'});
o2 = await q('order.return', {id: o2.id, charge: 60, account_id: cash, note: 'Customer refused'});
eq([o2.status, await stock()], ['returned', 27], 'returned: the shirts are back on the shelf');
eq((await q('customers.list')).find((c) => c.name === 'Rina Akter').balance, 0, 'the returned order is not owed');

// ---- A new order can be cancelled; a confirmed one cannot here
const o3 = await q('order.save', {...form, advance: 0});
eq((await q('order.cancel', {id: o3.id, reason: 'Duplicate'})).status, 'cancelled', 'a new order is cancelled');
const list = await q('orders.list');
eq([list.counts.settled, list.counts.returned, list.counts.cancelled, list.orders.length], [1, 1, 1, 3], 'counts by status');

// ---- Courier API: keys, booking, tracking (mocked courier)
ok(/not set up/.test((await raw('courier.call', {op: 'test', courier: 'steadfast'})).error), 'a courier without keys is refused');
await q('settings.save', {values: {courier_steadfast_key: 'sf-key', courier_steadfast_secret: 'sf-secret', courier_pathao_client_id: 'pc', courier_pathao_client_secret: 'ps', courier_pathao_username: 'pu@x.com', courier_pathao_password: 'pp', courier_pathao_store_id: '12345', courier_redx_token: 'rx-token'}});
next = {body: {status: 200, current_balance: 4500}};
eq((await q('courier.call', {op: 'test', courier: 'steadfast'})).balance, 4500, 'Steadfast keys work');
eq([calls.at(-1).url, calls.at(-1).headers['Api-Key'], calls.at(-1).headers['Secret-Key']], ['https://portal.packzy.com/api/v1/get_balance', 'sf-key', 'sf-secret'], 'the keys travel only from the server');
ok(/Unknown action/.test((await raw('courier.prepare', {op: 'test', courier: 'steadfast'})).error), 'a browser cannot ask for the courier request (with keys)');
ok(/Unknown action/.test((await raw('courier.finish', {op: 'book', id: 'x', __response: {code: 200, text: '{}'}})).error), 'a browser cannot fake a courier answer');

let o4 = await q('order.confirm', {id: (await q('order.save', {...form, advance: 0})).id});
ok(/Confirm the order first|already/.test((await raw('courier.call', {op: 'book', courier: 'steadfast', id: o3.id})).error), 'only a confirmed order is booked');
next = {body: {status: 200, message: 'Consignment has been created successfully.', consignment: {consignment_id: 1424107, invoice: o4.no, tracking_code: '15BAEB8A', status: 'in_review'}}};
o4 = await q('courier.call', {op: 'book', courier: 'steadfast', id: o4.id});
eq([o4.status, o4.courier.label, o4.courier.consignment_id, o4.courier.tracking, o4.courier.by_api], ['shipped', 'Steadfast', '1424107', '15BAEB8A', true], 'booked with Steadfast');
eq([calls.at(-1).url, calls.at(-1).body.invoice, calls.at(-1).body.cod_amount, calls.at(-1).body.recipient_phone], ['https://portal.packzy.com/api/v1/create_order', o4.no, 1350, '01712345678'], 'the parcel: invoice no, COD and phone');
ok(/already booked|already shipped/.test((await raw('courier.call', {op: 'book', courier: 'steadfast', id: o4.id})).error), 'never booked twice');
next = {body: {status: 200, delivery_status: 'delivered'}};
o4 = await q('courier.call', {op: 'track', id: o4.id});
eq([o4.status, o4.courier.status, calls.at(-1).url], ['delivered', 'delivered', 'https://portal.packzy.com/api/v1/status_by_cid/1424107'], 'tracking: delivered');

// Pathao: token first, then the order with city and zone
let o5 = await q('order.confirm', {id: (await q('order.save', {...form, advance: 0})).id});
next = (url) => (/issue-token/.test(url) ? {body: {access_token: 'tok-1', token_type: 'Bearer'}} : {body: {code: 200, data: {consignment_id: 'DL121224VS8TTJ', merchant_order_id: o5.no, order_status: 'Pending', delivery_fee: 80}}});
ok(/city and zone/.test((await raw('courier.call', {op: 'book', courier: 'pathao', id: o5.id})).error), 'Pathao needs city and zone');
o5 = await q('courier.call', {op: 'book', courier: 'pathao', id: o5.id, city_id: 1, zone_id: 298});
eq([o5.courier.consignment_id, o5.courier.charge, calls.at(-2).body.grant_type, calls.at(-1).headers.Authorization, calls.at(-1).body.recipient_zone, calls.at(-1).body.store_id], ['DL121224VS8TTJ', 80, 'password', 'Bearer tok-1', 298, 12345], 'booked with Pathao using its token');
next = (url) => (/issue-token/.test(url) ? {body: {access_token: 'tok-1'}} : {body: {code: 200, data: {data: [{zone_id: 298, zone_name: 'Mirpur'}]}}});
eq(await q('courier.call', {op: 'zones', courier: 'pathao', city_id: 1}), [{id: 298, name: 'Mirpur'}], 'Pathao zones for a city');

// RedX: area list and booking
next = {body: {areas: [{id: 1, name: 'Mohammadpur', post_code: 1207}]}};
eq((await q('courier.call', {op: 'areas', courier: 'redx'}))[0], {id: 1, name: 'Mohammadpur (1207)', raw: 'Mohammadpur'}, 'RedX areas');
let o6 = await q('order.confirm', {id: (await q('order.save', {...form, advance: 0})).id});
next = {body: {tracking_id: '21A427TU4BN3R'}};
o6 = await q('courier.call', {op: 'book', courier: 'redx', id: o6.id, area_id: 1, area_name: 'Mohammadpur'});
eq([o6.courier.tracking, calls.at(-1).headers['API-ACCESS-TOKEN'], calls.at(-1).body.delivery_area_id, calls.at(-1).body.cash_collection_amount], ['21A427TU4BN3R', 'Bearer rx-token', 1, '1350'], 'booked with RedX');
// A courier error is shown and nothing is stored
let o7 = await q('order.confirm', {id: (await q('order.save', {...form, advance: 0})).id});
next = {status: 422, body: {message: 'Invalid phone number'}};
ok(/Invalid phone number/.test((await raw('courier.call', {op: 'book', courier: 'steadfast', id: o7.id})).error), 'the courier\'s error is shown');
eq((await q('orders.list')).orders.find((x) => x.id === o7.id).status, 'confirmed', 'a failed booking changes nothing');

// the backup file carries the online orders
const backup = await q('database.export');
eq([backup.counts.OnlineOrders, backup.online_orders.length], [list.orders.length + 4, list.orders.length + 4], 'the backup holds every online order');

// keys are hidden from staff without the settings permission
await q('user.save', {name: 'Seller', username: 'seller11', role: 'sales', password: 'seller-password-1'});
api.setToken((await q('login', {username: 'seller11', password: 'seller-password-1'})).token);
const st = await q('settings.get');
ok(!('courier_steadfast_secret' in st) && !('courier_redx_token' in st), 'staff never receive the courier keys');
ok((await q('orders.list')).couriers.find((c) => c.id === 'steadfast').api, 'staff see that Steadfast is ready');

const manualForm = { customer: form.customer, courier: { label: 'Local Parcel' }, items: [{ name: 'Polo shirt', qty: 2 }] };
ok(!(await raw('courier.manual.paid', { ...manualForm, amount: 120, account_id: cash })).ok, 'staff without expenses permission cannot record paid bookings');
api.setToken((await q('login', { username: 'admin', password: 'harness-password-1' })).token);
const beforeManualCash = await balance(cash);
const manualStock = await stock();
const dueBooking = await q('courier.manual.save', manualForm);
eq([dueBooking.booking, await balance(cash)], ['due', beforeManualCash], 'due booking does not move money');
const paidPayload = { ...manualForm, amount: 120, account_id: cash };
const request_id = crypto.randomUUID();
const paidBooking = await q('courier.manual.paid', paidPayload, { request_id });
const replay = await q('courier.manual.paid', paidPayload, { request_id });
eq(replay.id, paidBooking.id, 'replaying a paid booking returns the same challan');
eq(await balance(cash), beforeManualCash - 120, 'exactly one account debit');
eq(await stock(), manualStock, 'booking does not adjust inventory');
const paidExpense = (await q('expenses.list')).find((e) => e.id === paidBooking.expense_id);
eq([paidExpense.category, paidExpense.amount], ['Transport', 120], 'courier charge is a Transport expense');
const report = await q('orders.list', { include_manual: true, delivery_report: true, from: paidBooking.date, to: paidBooking.date });
eq(report.manual.map((o) => o.id).sort(), [dueBooking.id, paidBooking.id].sort(), 'report includes the saved manual bookings for their booking date');
ok(report.orders.every((o) => !o.manual && o.courier), 'online report includes booked online shipments only');
ok(!(await raw('order.deliver', { id: paidBooking.id })).ok, 'online workflow cannot change a manual challan');
await q('rolePerms.save', { manager: ['pos', 'expenses'] });
await q('user.save', { name: 'Booking staff', username: 'bookingstaff', role: 'manager', password: 'booking-password-1', approvals: ['expense'] });
const ownerToken = (await q('login', { username: 'admin', password: 'harness-password-1' })).token;
api.setToken((await q('login', { username: 'bookingstaff', password: 'booking-password-1' })).token);
const held = await q('courier.manual.paid', { ...paidPayload, amount: 90 });
ok(held.pending_approval, 'paid bookings follow expense approval settings');
api.setToken(ownerToken);
eq(await balance(cash), beforeManualCash - 120, 'pending booking does not debit the account');
eq((await q('orders.list', { include_manual: true })).manual.length, 2, 'pending booking is absent from the report');
await q('approval.decide', { id: held.approval.id, decision: 'approve' });
eq(await balance(cash), beforeManualCash - 210, 'approval posts the Transport expense');
eq((await q('orders.list', { include_manual: true })).manual.length, 3, 'approval saves the booking');
// Courier overview reuses the same activity predicate as the linked report.
const overview = await q('orders.list', { courier_overview: true });
eq(overview.orders, [], 'overview does not download order rows');
const deliveredToday = await q('orders.list', { delivery_report: true, activity_day: overview.activity_day, activity_status: 'delivered' });
eq(deliveredToday.orders.length, overview.activity_counts.delivered, 'delivery metric matches its report');
ok(deliveredToday.orders.some((o) => o.id === o4.id), 'tracking marks the delivery activity');
const lookup = await q('orders.list', { tracking_query: '15baeb8a', tracking_courier: 'steadfast', include_manual: true });
eq(lookup.orders.map((o) => o.id), [o4.id], 'tracking lookup is case insensitive and scoped to the selected courier');
eq((await q('orders.list', { tracking_query: '15BAEB8A', tracking_courier: 'redx' })).tracking_total, 0, 'wrong courier does not match');
eq((await q('orders.list', { courier_id: 'steadfast' })).orders.every((o) => (o.courier?.name || o.courier_choice) === 'steadfast'), true, 'orders filtered by provider');
await q('settings.save', { values: { courier_rates_steadfast: { inside: '0', outside: '120.50', cod: '1.25', terms: 'Up to 1 kg' } } });
const steadfast = (await q('orders.list', { courier_overview: true })).couriers.find((c) => c.id === 'steadfast');
eq(steadfast.rates, { inside: 0, outside: 120.5, cod: 1.25, return_fee: null, terms: 'Up to 1 kg' }, 'rates retain zero and unknown separately');
ok(Boolean(steadfast.checked_at), 'successful API check timestamp persisted');
ok(!(await raw('settings.save', { values: { courier_rates_steadfast: { cod: 101 } } })).ok, 'invalid COD rate rejected');
console.log(`Features 11: ${checks} checks passed (online orders and couriers).`);
