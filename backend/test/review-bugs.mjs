// Regressions for the November 2026 review list: unit/decimal guards, shared serials, promise dates,
// delivered warranty dates and read-only session checks. Runs on an in-memory Supabase stack only.
import assert from 'node:assert/strict';
import schema from '../../supabase/functions/karvio-api/schema.json' with {type:'json'};
import {hash} from '../../supabase/functions/karvio-api/runtime.mjs';
import {createHandler} from '../../supabase/functions/karvio-api/handler.mjs';

const setupKey = 'review-bugs-key';
const snapshot = {revision:0, metadata:{properties:{},cache:{},privateSheets:{}}, tables:Object.fromEntries(Object.keys(schema).map(n => [n, []])), requiresSetup:true};
let commits = 0;
const rpc = async (name, args) => {
  if (name === 'karvio_snapshot') return structuredClone(snapshot);
  if (name !== 'karvio_commit') throw new Error('Unexpected RPC ' + name);
  if (args.expected_revision !== snapshot.revision) return {committed:false};
  if (args.initialize_owner && (!snapshot.requiresSetup || args.setup_token_hash !== hash(setupKey))) throw new Error('Invalid setup key');
  if (args.initialize_owner) snapshot.requiresSetup = false;
  Object.assign(snapshot.tables, structuredClone(args.changes)); snapshot.metadata = structuredClone(args.next_metadata); snapshot.revision++; commits++;
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
const rejects = async (action, payload, pattern, message) => { const r = await R(action, payload); ok(!r.ok && pattern.test(r.error), message + ' (got: ' + (r.ok ? 'ok' : r.error) + ')'); };

const cash = (await Q('bootstrap')).accounts[0];
const supplier = await Q('supplier.save', {name:'Review supplier'});
const customer = await Q('customer.save', {name:'Review customer', phones:['01711000009']});
await Q('master.save', {kind:'unit', name:'meter', label:'Meter', decimal:true});
const meter = (await Q('bootstrap')).units.find(u => u.name === 'meter');

// 1. A product with stock or history keeps its selling unit.
const cable = await Q('product.save', {name:'Review cable', unit:'meter', sale_price:50});
await Q('purchase.create', {supplier_id:supplier.id, items:[{product_id:cable.id, qty:10.5, cost:20}], payments:[]});
await rejects('product.save', {id:cable.id, name:'Review cable', unit:'pcs'}, /cannot change after it has stock or history/, 'unit change blocked with stock');
eq(snapshot.tables.Products.find(p => p.id === cable.id).unit, 'meter', 'unit unchanged');
ok((await R('sale.create', {items:[{product_id:cable.id, qty:0.5, price:50}], payments:[{account_id:cash.id, amount:25}]})).ok, 'fractional sale still works');
const fresh = await Q('product.save', {name:'Review unused', unit:'meter', sale_price:5});
ok((await R('product.save', {id:fresh.id, name:'Review unused', unit:'pcs'})).ok, 'unused product may change unit');

// 2. Decimal stays on while fractional history exists, so fractional returns keep working.
const wire = await Q('product.save', {name:'Review wire', unit:'meter', sale_price:10});
await Q('purchase.create', {supplier_id:supplier.id, items:[{product_id:wire.id, qty:10, cost:5}], payments:[]});
const wireSale = await Q('sale.create', {customer_id:customer.id, items:[{product_id:wire.id, qty:2.5, price:10}], payments:[{account_id:cash.id, amount:25}]});
await Q('purchase.create', {supplier_id:supplier.id, items:[{product_id:wire.id, qty:0.5, cost:5}], payments:[]});
eq(snapshot.tables.Products.filter(p => p.unit === 'meter').every(p => p.stock % 1 === 0), true, 'all meter stock is whole');
await rejects('master.save', {kind:'unit', id:meter.id, name:'meter', label:'Meter', decimal:false}, /use fractional quantities/, 'decimal off blocked by fractional history');
ok((await R('sreturn.create', {sale_id:wireSale.sale.id, items:[{sale_item_id:wireSale.items[0].id, qty:0.5}], refund:{mode:'cash', account_id:cash.id, amount:5}})).ok, 'fractional return still works');
await Q('master.save', {kind:'unit', name:'box', label:'Box', decimal:true});
const box = (await Q('bootstrap')).units.find(u => u.name === 'box');
ok((await R('master.save', {kind:'unit', id:box.id, name:'box', label:'Box', decimal:false})).ok, 'unused unit may turn decimal off');

// 3. One serial belongs to one product; legacy duplicates make the scan ask instead of guessing.
const ssdA = await Q('product.save', {name:'Review SSD A', has_warranty:true, warranty_type:'serial', warranty_days:30, sale_price:10});
const ssdB = await Q('product.save', {name:'Review SSD B', has_warranty:true, warranty_type:'serial', warranty_days:30, sale_price:10});
await Q('purchase.create', {supplier_id:supplier.id, items:[{product_id:ssdA.id, qty:1, cost:5, serials:['SN-1']}], payments:[]});
await rejects('purchase.create', {supplier_id:supplier.id, items:[{product_id:ssdB.id, qty:1, cost:5, serials:['sn-1']}], payments:[]}, /already belongs to Review SSD A/, 'serial on another product blocked');
await rejects('purchase.create', {supplier_id:supplier.id, items:[{product_id:ssdA.id, qty:1, cost:5, serials:['SN-2']}, {product_id:ssdB.id, qty:1, cost:5, serials:['SN-2']}], payments:[]}, /two different products/, 'same serial twice in one purchase blocked');
eq((await Q('serials.find', {serial:'sn-1'})).product_id, ssdA.id, 'unique serial scans to its product');
const legacy = structuredClone(snapshot.tables.SerialItems.find(s => s.serial === 'SN-1'));
snapshot.tables.SerialItems.push({...legacy, id:'legacy-dup', product_id:ssdB.id, _position:Math.max(...snapshot.tables.SerialItems.map(s => s._position)) + 1}); snapshot.revision++;
const ambiguous = await Q('serials.find', {serial:'SN-1'});
eq(ambiguous.ambiguous, true, 'legacy duplicate scan is ambiguous');
eq(ambiguous.products.map(p => p.name).sort(), ['Review SSD A', 'Review SSD B'], 'both products are named');
snapshot.tables.SerialItems = snapshot.tables.SerialItems.filter(s => s.id !== 'legacy-dup'); snapshot.revision++;

// 5. Impossible promised payment dates are rejected everywhere.
const item = await Q('product.save', {name:'Review item', sale_price:100});
await Q('purchase.create', {supplier_id:supplier.id, items:[{product_id:item.id, qty:5, cost:50}], payments:[]});
await rejects('sale.create', {customer_id:customer.id, items:[{product_id:item.id, qty:1, price:100}], payments:[], next_payment_date:'2027-02-31'}, /not a valid date/, 'sale with 31 Feb rejected');
const credit = await Q('sale.create', {customer_id:customer.id, items:[{product_id:item.id, qty:1, price:100}], payments:[], next_payment_date:'2027-02-28'});
eq(credit.sale.next_payment_date, '2027-02-28', 'real date accepted');
await rejects('sale.promise', {id:credit.sale.id, next_payment_date:'2027-04-31'}, /not a valid date/, 'promise 31 Apr rejected');

// 6. A note on a delivered claim keeps the original delivery date.
const mouse = await Q('product.save', {name:'Review mouse', has_warranty:true, warranty_type:'invoice', warranty_days:365, sale_price:500});
await Q('purchase.create', {supplier_id:supplier.id, items:[{product_id:mouse.id, qty:1, cost:300}], payments:[]});
const mouseSale = await Q('sale.create', {customer_id:customer.id, items:[{product_id:mouse.id, qty:1, price:500}], payments:[{account_id:cash.id, amount:500}]});
const claim = await Q('claim.create', {sale_id:mouseSale.sale.id, sale_item_id:mouseSale.items[0].id, issue:'Click fails'});
await Q('claim.update', {id:claim.id, status:'Delivered'});
snapshot.tables.WarrantyClaims.find(c => c.id === claim.id).delivered_date = '2026-01-05'; snapshot.revision++;
await Q('claim.update', {id:claim.id, status:'Delivered', note:'Customer called'});
eq(snapshot.tables.WarrantyClaims.find(c => c.id === claim.id).delivered_date, '2026-01-05', 'delivery date kept');

// Reads do not commit just to slide the session.
const before = commits;
await Q('products.list'); await Q('dashboard'); await Q('customers.list'); await Q('bootstrap');
eq(commits - before, 0, 'read-only requests do not write');
const session = Object.entries(snapshot.metadata.cache).find(([k]) => k.startsWith('tok_'));
const stored = JSON.parse(session[1].text); stored.refreshed = Date.now() - 16 * 60 * 1000;
snapshot.metadata.cache[session[0]].text = JSON.stringify(stored); snapshot.revision++;
await Q('products.list');
eq(commits - before, 1, 'an active session is still extended after 15 minutes');

console.log(`Review bug regressions: ${checks} checks passed (units, decimals, serials, promise dates, warranty delivery date, read-only sessions).`);
