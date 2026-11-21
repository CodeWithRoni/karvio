import assert from 'node:assert/strict';
import {createRuntime,hash} from '../../supabase/functions/karvio-api/runtime.mjs';
import schema from '../../supabase/functions/karvio-api/schema.json' with {type:'json'};
let state={revision:0,metadata:{properties:{},cache:{},privateSheets:{}},tables:Object.fromEntries(Object.keys(schema).map(n=>[n,[]])),requiresSetup:true};
function apply(r){if(r.response.ok){Object.assign(state.tables,structuredClone(r.changes));state.requiresSetup=false;}state.metadata=structuredClone(r.metadata);state.revision++;return r.response;}
apply(createRuntime(state).initialize({name:'Regression owner',password:'regression-owner-password'}));
function call(action,payload={},t=''){return apply(createRuntime(structuredClone(state)).execute({action,payload,token:t,request_id:crypto.randomUUID()}));}
const token=call('login',{username:'admin',password:'regression-owner-password'}).data.token;
function q(a,p={},t=token){const r=call(a,p,t);assert.equal(r.ok,true,`${a}: ${r.error}`);return r.data;}
const cash=q('bootstrap').accounts[0].id, base=structuredClone(state);
const reset=()=>{state=structuredClone(base);};
function denied(a,p,t=token,pattern){const before=structuredClone(state.tables),r=call(a,p,t);assert.equal(r.ok,false,`${a} must fail`);if(pattern)assert.match(r.error,pattern);assert.deepEqual(state.tables,before,'Failed action must not change business rows');return r;}
const product=(name,extra={})=>q('product.save',{name,unit:'pcs',sale_price:200,...extra});
const buy=(p,qty=1,extra={})=>q('purchase.create',{items:[{product_id:p.id,qty,cost:100,...extra}],payments:[{account_id:cash,amount:qty*100}]});
const sell=(p,qty=1,extra={},t=token)=>q('sale.create',{items:[{product_id:p.id,qty,price:200}],payments:[{account_id:cash,amount:qty*200}],...extra},t);
const ret=(sale,qty=1,t=token)=>q('sreturn.create',{sale_id:sale.sale.id,items:[{sale_item_id:sale.items[0].id,qty}],refund:{account_id:cash}},t);
const stock=p=>q('products.list').find(x=>x.id===p.id).stock;
// B01: one supplier return permits one repurchase, never multiple live serials.
let p=product('Serial',{has_warranty:true,warranty_type:'serial',warranty_days:365});let purchase=buy(p,1,{serials:'SN-ABC'});
q('preturn.create',{purchase_id:purchase.purchase.id,items:[{purchase_item_id:purchase.items[0].id,qty:1,serials:'SN-ABC'}],refund:{account_id:cash}});
buy(p,1,{serials:'SN-ABC'});
for(const serials of ['SN-ABC','sn-abc'])denied('purchase.create',{items:[{product_id:p.id,qty:1,cost:100,serials}],payments:[{account_id:cash,amount:100}]});
assert.equal(stock(p),1);assert.equal(q('serials.list',{product_id:p.id,status:'in_stock'}).length,1);
// B02: reversing a spent receipt reopens the actual invoice; public view agrees.
reset();let c=q('customer.save',{name:'Credit customer'});p=product('Service',{service:true,sale_price:500});
let payment=q('customer.payment',{customer_id:c.id,account_id:cash,amount:500});
let sale=sell(p,1,{customer_id:c.id,items:[{product_id:p.id,qty:1,price:500}],credit_used:500,payments:[]});
const linkToken=q('sale.link',{id:sale.sale.id}).url.split('/i/')[1];
assert.equal(q('sale.detail',{id:sale.sale.id}).sale.due_now,0);
assert.equal(q('invoice.public',{token:linkToken},'').sale.due_now,0);
q('reverse',{type:'cpay',id:payment.entry.id,password:'regression-owner-password',reason:'Receipt correction'});
assert.equal(q('sale.detail',{id:sale.sale.id}).sale.due_now,500);
assert.equal(q('invoice.public',{token:linkToken},'').sale.due_now,500);
assert.equal(q('customers.list').find(x=>x.id===c.id).balance,500);
q('customer.payment',{customer_id:c.id,account_id:cash,amount:200});assert.equal(q('sale.detail',{id:sale.sale.id}).sale.due_now,300);
// B03: a repairs-only role may keep credit, but cannot refund money.
reset();c=q('customer.save',{name:'Repair customer'});let job=q('repair.save',{customer_id:c.id,device:'Laptop',problem:'Fault',advance:500,account_id:cash,parts:[]});
q('rolePerms.save',{technician:['repairs'],sales:['pos','sales.return']});
q('user.save',{name:'Technician',username:'tech',password:'technician-password',role:'technician',phone:'01700000111',active:true});
let tech=call('login',{username:'tech',password:'technician-password'}).data.token;
denied('repair.cancel',{id:job.id,reason:'Customer request',refund_account_id:cash},tech,/permission/i);
assert.equal(q('repair.get',{id:job.id}).status,'Received');
assert.equal(q('repair.cancel',{id:job.id,reason:'Keep credit'},tech).status,'Cancelled');
assert.equal(q('customers.list').find(x=>x.id===c.id).balance,-500);
let job2=q('repair.save',{customer_id:c.id,device:'Phone',problem:'Fault',advance:200,account_id:cash,parts:[]});
assert.equal(q('repair.cancel',{id:job2.id,reason:'Authorized refund',refund_account_id:cash}).status,'Cancelled');
assert.equal(q('customers.list').find(x=>x.id===c.id).balance,-500);
// B04: both returns creation and list enforce invoice ownership.
reset();q('rolePerms.save',{sales:['pos','sales.return'],technician:['repairs']});q('user.save',{name:'Cashier',username:'cashier',role:'sales',password:'cashier-password',active:true});
let cashier=call('login',{username:'cashier',password:'cashier-password'}).data.token;p=product('Private service',{service:true});sale=sell(p);
denied('sreturn.create',{sale_id:sale.sale.id,items:[{sale_item_id:sale.items[0].id,qty:1}],refund:{account_id:cash}},cashier,/permission/i);
ret(sale);assert.equal(q('sreturns.list',{},cashier).length,0);
let own=sell(p,1,{},cashier);ret(own,1,cashier);assert.equal(q('sreturns.list',{},cashier).length,1);assert.equal(q('sreturns.list').length,2);
// B05: full refunds invalidate stock/service replacement; partial refunds retain warranty.
for(const service of [false,true]){
 reset();p=product('Warranty',{service,has_warranty:true,warranty_type:'invoice',warranty_days:365});if(!service)buy(p,3);
 sale=sell(p);let claim=q('claim.create',{sale_id:sale.sale.id,sale_item_id:sale.items[0].id,issue:'Fault'});ret(sale);
 denied('claim.update',{id:claim.id,status:'Replaced'},token,/returned/i);assert.equal(stock(p),service?0:3);
}
reset();p=product('Partial warranty',{has_warranty:true,warranty_type:'invoice',warranty_days:365});buy(p,4);sale=sell(p,2);
let claim=q('claim.create',{sale_id:sale.sale.id,sale_item_id:sale.items[0].id,issue:'Fault'});ret(sale,1);q('claim.update',{id:claim.id,status:'Replaced'});assert.equal(stock(p),2);
// B06: type changes cannot rewrite history, but unused products remain editable.
reset();p=product('Inventory');buy(p);sale=sell(p);denied('product.save',{...p,service:true},token,/sales or purchases/i);ret(sale);assert.equal(stock(p),1);
let unused=product('Unused');assert.equal(q('product.save',{...unused,service:true}).service,true);assert.equal(q('product.save',{...unused,service:false}).service,false);
let service=product('Historical service',{service:true});sell(service);denied('product.save',{...service,service:false},token,/sales or purchases/i);
// B07: reject legacy/malformed credentials before replacing any data; compatible restores work.
reset();p=product('Preserve this');let backup=q('database.export'),columns=backup.tables.Users.columns;
for(const invalid of ['v2$2000$'+hash('legacy'),'pbkdf2$600000$bad']){
 let broken=structuredClone(backup);broken.tables.Users.rows[0][columns.indexOf('password_hash')]=invalid;broken.checksum=hash('karvio-backup-v1|'+JSON.stringify(broken.tables));
 denied('database.restore',{password:'regression-owner-password',confirm:'RESTORE',backup_text:JSON.stringify(broken)},token,/credentials/i);
 assert.equal(q('products.list').length,1);assert.equal(call('login',{username:'admin',password:'regression-owner-password'}).ok,true);
}
q('database.restore',{password:'regression-owner-password',confirm:'RESTORE',backup_text:JSON.stringify(backup)});assert.equal(call('login',{username:'admin',password:'regression-owner-password'}).ok,true);
// B08: insertion order cannot change chronological opening/running/closing balances.
reset();q('account.entry',{kind:'deposit',account_id:cash,amount:1000,date:'2026-11-10'});q('account.entry',{kind:'deposit',account_id:cash,amount:400,date:'2026-11-05'});
let ledger=q('account.ledger',{account_id:cash,from:'2026-11-06',to:'2026-11-10'});assert.equal(ledger.opening,400);assert.equal(ledger.closing,1400);assert.equal(ledger.rows[0].balance,1400);
ledger=q('account.ledger',{account_id:cash,to:'2026-11-05'});assert.equal(ledger.closing,400);assert.equal(ledger.current_balance,1400);
ledger=q('account.ledger',{account_id:cash,from:'2026-11-20',to:'2026-11-30'});assert.equal(ledger.opening,1400);assert.equal(ledger.closing,1400);assert.equal(ledger.rows.length,0);
denied('account.ledger',{account_id:cash,from:'2026-11-10',to:'2026-11-05'},token,/From date/i);
// B09: spent advance is visible and must be acknowledged; stale credit cannot silently create debt.
reset();c=q('customer.save',{name:'Spent advance'});job=q('repair.save',{customer_id:c.id,device:'Laptop',problem:'Fault',charge:500,advance:500,account_id:cash,parts:[]});p=product('Other service',{service:true});
assert.equal(q('repair.get',{id:job.id}).available_advance,500);
sell(p,1,{customer_id:c.id,items:[{product_id:p.id,qty:1,price:500}],credit_used:500,payments:[]});
let fresh=q('repair.get',{id:job.id});assert.equal(fresh.available_advance,0);assert.equal(fresh.due,500);
denied('repair.deliver',{id:job.id,payments:[]},token,/advance/i);denied('repair.deliver',{id:job.id,expected_credit:500,payments:[]},token,/advance/i);
let delivered=q('repair.deliver',{id:job.id,expected_credit:0,payments:[{account_id:cash,amount:500}]});assert.equal(delivered.status,'Delivered');assert.equal(delivered.sale.due,0);assert.equal(delivered.sale.credit_used,0);
reset();c=q('customer.save',{name:'Available advance'});job=q('repair.save',{customer_id:c.id,device:'Phone',problem:'Fault',charge:500,advance:300,account_id:cash,parts:[]});
delivered=q('repair.deliver',{id:job.id,expected_credit:300,payments:[{account_id:cash,amount:100}],next_payment_date:'2026-12-01'});assert.equal(delivered.sale.due,100);assert.equal(delivered.sale.credit_used,300);
console.log('All 9 urgent bug regressions passed, including denied-write rollback and valid operations (local hosted runtime only).');

