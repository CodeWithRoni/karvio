// Due reminder SMS to ticked customers, and Taka amounts in SMS with lakh commas.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const {q, raw} = await apiClient(db);
const boot = await q('bootstrap'), cash = boot.accounts[0].id;
await q('settings.save', {values: {shop_name: 'Computer Plus', shop_phone: '01711-000000, 01811-000000'}});

const svc = await q('product.save', {name: 'Laptop service', service: true, sale_price: 1000});
const big = await q('customer.save', {name: 'Tanvir', phones: '01812345678'});
const small = await q('customer.save', {name: 'Rafiq', phones: '01911223344'});
const nophone = await q('customer.save', {name: 'No phone'});
const clear = await q('customer.save', {name: 'Paid up', phones: '01715667788'});
await q('sale.create', {customer_id: big.id, items: [{product_id: svc.id, qty: 1, price: 125000}], payments: [{account_id: cash, amount: 500}]});
await q('sale.create', {customer_id: small.id, items: [{product_id: svc.id, qty: 1, price: 4500.5}], payments: []});
await q('sale.create', {customer_id: nophone.id, items: [{product_id: svc.id, qty: 1, price: 900}], payments: []});
const ids = [big.id, small.id, nophone.id, clear.id];

ok(/SMS gateway/.test((await raw('customer.remind', {ids})).error), 'needs the SMS gateway');
await q('settings.save', {values: {sms_enabled: 'true', sms_url: 'https://sms.example.com/send?to={number}&text={message}', sms_method: 'GET'}});
ok(/Tick the customers/.test((await raw('customer.remind', {ids: []})).error), 'needs customers');
ok(/at most 200/.test((await raw('customer.remind', {ids: Array.from({length: 201}, (_, i) => 'x' + i)})).error), 'at most 200 at a time');
ok(/Write the message/.test((await raw('customer.remind', {ids, template: '   '})).error), 'needs a message');

const r = await q('customer.remind', {ids});
eq([r.sent, r.failed, r.skipped], [2, 0, 2], 'two sent, no phone and nothing due skipped');
eq(r.results.filter((x) => x.status === 'skipped').map((x) => x.reason).sort(), ['no phone number', 'nothing due'], 'skip reasons');
const logs = await q('sms.log');
const texts = (logs.rows || logs).map((x) => x.message).filter((m) => /your due at/.test(m));
ok(texts.some((t) => t === 'Dear Tanvir, your due at Computer Plus is Tk 1,24,500. Please pay at your earliest convenience. Thank you. 01711-000000'), 'standard message, lakh commas, first shop phone: ' + texts.join(' | '));
ok(texts.some((t) => t.includes('Rafiq') && t.includes('Tk 4,500.5')), 'paisa kept');

const own = 'Hi {name}, please clear Tk {due} at {shop}.';
await q('customer.remind', {ids: [small.id], template: own});
const after = await q('bootstrap');
eq(after.settings.sms_due_template, own, 'the wording used is kept for next time');
const audit = await q('audit.list', {});
ok((audit.rows || audit).some((a) => a.action === 'due_reminder'), 'written to the activity log');

// Sale SMS amounts use the same grouping.
await q('settings.save', {values: {sms_template: 'Total {total}, Paid {paid}, Due {due}'}});
await q('sale.create', {customer_id: big.id, items: [{product_id: svc.id, qty: 1, price: 250000}], payments: [{account_id: cash, amount: 100000}]});
const last = ((await q('sms.log')).rows || (await q('sms.log'))).map((x) => x.message).find((m) => /^Total/.test(m));
ok(last.startsWith('Total 2,50,000, Paid 1,00,000, Due 1,50,000'), 'sale SMS with lakh commas: ' + last);

// Monthly expenses: a month that was never recorded stays listed as missed (up to 12 months back).
await q('settings.save', {values: {expense_categories: JSON.stringify(['Rent', 'Other'])}});
const today = boot.serverToday, month = today.slice(0, 7);
const addM = (ym, n) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const list = await q('expense.recurring.save', {templates: [{name: 'Shop rent', category: 'Rent', amount: 3500, account_id: cash, day: 5}]});
eq(list.templates[0].since, month, 'a new line starts this month');
eq(list.templates[0].missed, [], 'nothing missed yet');
const back = addM(month, -3);
const tpl = JSON.parse((await db.query(`select value from public."Settings" where key='recurring_expenses'`)).rows[0].value);
tpl[0].since = back;
await db.query(`update public."Settings" set value=$1 where key='recurring_expenses'`, [JSON.stringify(tpl)]);
let st = (await q('expense.recurring')).templates[0];
eq(st.missed.map((m) => m.month), [back, addM(month, -2), addM(month, -1)], 'three earlier months missed');
eq(st.missed[0].due_date, back + '-05', 'due on its day');
const dueNow = (await q('expense.recurring')).due;
eq(dueNow, 3 + (st.due ? 1 : 0), 'every missed month counts as due');
eq((await q('dashboard')).recurring_due, dueNow, 'dashboard counts them too');
ok(/a date in .* or later/.test((await raw('expense.recurring.record', {id: st.id, month: back, date: addM(back, -1) + '-10'})).error), 'not before that month');
ok(/not waiting/.test((await raw('expense.recurring.record', {id: st.id, month: addM(month, -20)})).error), 'only missed months');
const late = await q('expense.recurring.record', {id: st.id, month: back, date: back + '-07', amount: 3600});
eq([late.expense.date, late.expense.amount, /\(/.test(late.expense.note)], [back + '-07', 3600, true], 'recorded in its own month');
st = late.list.templates[0];
eq(st.missed.map((m) => m.month), [addM(month, -2), addM(month, -1)], 'that month is no longer missed');
const paused = await q('expense.recurring.save', {templates: [{...st, active: false}]});
eq(paused.templates[0].missed, [], 'paused: nothing missed');
const resumed = await q('expense.recurring.save', {templates: [{...paused.templates[0], active: true}]});
eq([resumed.templates[0].since, resumed.templates[0].missed], [month, []], 'switched back on: counts from this month');

console.log(`Features 3: ${checks} checks passed (due reminder SMS, lakh commas in SMS, missed monthly expenses).`);
