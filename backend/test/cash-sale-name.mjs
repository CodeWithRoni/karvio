// Cash sales (no customer profile) are named "Cash" everywhere, older "Walk-in" rows are shown as "Cash",
// and cash sales get no customer link. In-memory only.
import assert from 'node:assert/strict';
import schema from '../../supabase/functions/karvio-api/schema.json' with {type:'json'};
import {hash} from '../../supabase/functions/karvio-api/runtime.mjs';
import {createHandler} from '../../supabase/functions/karvio-api/handler.mjs';

const setupKey = 'cash-name-key';
const snapshot = {revision:0, metadata:{properties:{},cache:{},privateSheets:{}}, tables:Object.fromEntries(Object.keys(schema).map(n => [n, []])), requiresSetup:true};
const rpc = async (name, args) => {
  if (name === 'karvio_snapshot') return structuredClone(snapshot);
  if (args.expected_revision !== snapshot.revision) return {committed:false};
  if (args.initialize_owner && (!snapshot.requiresSetup || args.setup_token_hash !== hash(setupKey))) throw new Error('Invalid setup key');
  if (args.initialize_owner) snapshot.requiresSetup = false;
  Object.assign(snapshot.tables, structuredClone(args.changes)); snapshot.metadata = structuredClone(args.next_metadata); snapshot.revision++;
  return {committed:true};
};
const handler = createHandler({rpc});
const call = async (action, payload = {}, token = '') => (await handler(new Request('http://localhost', {method:'POST', body:JSON.stringify({action, payload, token, request_id:crypto.randomUUID()})}))).json();
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };

ok((await call('owner.initialize', {name:'Owner', password:'test-password-12345', setup_key:setupKey})).ok, 'owner initialized');
const token = (await call('login', {username:'admin', password:'test-password-12345'})).data.token;
const Q = async (action, payload = {}) => { const r = await call(action, payload, token); assert.ok(r.ok, action + ': ' + r.error); return r.data; };
const R = (action, payload = {}) => call(action, payload, token);

const cash = (await Q('bootstrap')).accounts[0];
const supplier = await Q('supplier.save', {name:'S'});
const mouse = await Q('product.save', {name:'Mouse', sale_price:550});
await Q('purchase.create', {supplier_id:supplier.id, items:[{product_id:mouse.id, qty:10, cost:400}], payments:[]});

// New cash sales are saved and shown as "Cash".
const sale = await Q('sale.create', {items:[{product_id:mouse.id, qty:1, price:550}], payments:[{account_id:cash.id, amount:550}], send_sms:false});
eq(sale.sale.customer_name, 'Cash', 'new cash sale is named Cash');
eq(snapshot.tables.Sales.find(s => s.id === sale.sale.id).customer_name, 'Cash', 'stored as Cash');

// No customer link for a cash sale; a customer sale still gets one.
const link = await R('sale.link', {id:sale.sale.id});
ok(!link.ok && /no customer link/.test(link.error), 'cash sale link refused');
eq(snapshot.tables.InvoiceLinks.length, 0, 'no link row was made');
const customer = await Q('customer.save', {name:'Rahim', phones:['01711000999']});
const custSale = await Q('sale.create', {customer_id:customer.id, items:[{product_id:mouse.id, qty:1, price:550}], payments:[{account_id:cash.id, amount:550}], send_sms:false});
ok((await R('sale.link', {id:custSale.sale.id})).ok, 'customer sale still gets a link');

// Older rows saved as "Walk-in" read as "Cash" in lists, details, returns, history and reports.
const legacy = snapshot.tables.Sales.find(s => s.id === sale.sale.id);
legacy.customer_name = 'Walk-in';
snapshot.tables.ItemEvents.filter(e => e.ref_id === sale.sale.id).forEach(e => { e.party = 'Walk-in'; });
snapshot.revision++;
eq((await Q('sales.list', {})).find(s => s.id === sale.sale.id).customer_name, 'Cash', 'list shows Cash');
eq((await Q('sale.detail', {id:sale.sale.id})).sale.customer_name, 'Cash', 'invoice shows Cash');
const ret = await Q('sreturn.create', {sale_id:sale.sale.id, items:[{sale_item_id:sale.items[0].id, qty:1}], refund:{account_id:cash.id}});
eq(ret.return.customer_name, 'Cash', 'return copies Cash');
const report = await Q('reports', {type:'sales', group:'invoice', status:'all'});
ok(report.rows.filter(r => !r.customer_id).every(r => r.customer_name === 'Cash'), 'sales report shows Cash');
const history = await Q('history', {q:'Mouse'});
ok(JSON.stringify(history).includes('"Cash"') && !JSON.stringify(history).includes('Walk-in'), 'item history shows Cash');

// A real customer who happens to be called "Walk-in" keeps their name.
const named = await Q('customer.save', {name:'Walk-in', phones:['01711000888']});
const namedSale = await Q('sale.create', {customer_id:named.id, items:[{product_id:mouse.id, qty:1, price:550}], payments:[{account_id:cash.id, amount:550}], send_sms:false});
eq((await Q('sale.detail', {id:namedSale.sale.id})).sale.customer_name, 'Walk-in', 'customer profile name untouched');

console.log(`Cash sale name: ${checks} checks passed (new and older cash sales show Cash, no customer link for cash sales).`);
