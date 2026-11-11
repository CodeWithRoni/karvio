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
// B10: stock cannot be stranded by enabling serial tracking.
let p=product('Nonserial');buy(p,2);denied('product.save',{...p,has_warranty:true,warranty_type:'serial',warranty_days:365},token,/nonserial stock/i);assert.equal(stock(p),2);
sell(p,2);denied('product.save',{...p,has_warranty:true,warranty_type:'serial',warranty_days:365},token,/history/i);
let unused=product('Unused serial transition');assert.equal(q('product.save',{...unused,has_warranty:true,warranty_type:'serial',warranty_days:365}).warranty_type,'serial');
// B12: cumulative allocations and past partial returns are supplied to the UI.
reset();let products=[1,2,3].map(i=>product('Rounding '+i));let pur=q('purchase.create',{discount:100,items:products.map(p=>({product_id:p.id,qty:1,cost:100})),payments:[{account_id:cash,amount:200}]});
let detail=q('purchase.detail',{id:pur.purchase.id});assert.deepEqual(detail.items.map(i=>i.net_total),[66.67,66.66,66.67]);
q('preturn.create',{purchase_id:pur.purchase.id,items:[{purchase_item_id:pur.items[1].id,qty:1}],refund:{account_id:cash,amount:66.66}});
detail=q('purchase.detail',{id:pur.purchase.id});assert.equal(detail.items[1].returned_qty,1);assert.equal(detail.items[1].returned_value,66.66);
// B13: 501 matching invoices all reach the client, and oversized detail requests fail explicitly.
reset();state.tables.Sales=Array.from({length:501},(_,i)=>({_position:i+2,id:'sale-'+i,invoice_no:'TEST-'+i,date:'2026-11-11',status:'active',total:100,paid:100,due:0,user_id:state.tables.Users[0].id}));
assert.equal(q('sales.list').length,501);assert.equal(q('sales.list',{limit:10}).length,10);
denied('sales.details',{ids:state.tables.Sales.slice(0,201).map(s=>s.id)},token,/200/);
assert.equal(q('sales.details',{ids:state.tables.Sales.slice(0,200).map(s=>s.id)}).length,200);
// B14: live supplier invoice debt clears with payments and reopens on payment reversal.
reset();let supplier=q('supplier.save',{name:'Supplier'});p=product('Supplier product');
pur=q('purchase.create',{supplier_id:supplier.id,items:[{product_id:p.id,qty:1,cost:100}],payments:[]});
assert.equal(q('purchase.detail',{id:pur.purchase.id}).purchase.due_now,100);
let payment=q('supplier.payment',{supplier_id:supplier.id,account_id:cash,amount:100});
detail=q('purchase.detail',{id:pur.purchase.id});assert.equal(detail.purchase.due,100);assert.equal(detail.purchase.due_now,0);
q('reverse',{type:'spay',id:payment.entry.id,password:'regression-owner-password',reason:'Wrong supplier payment'});assert.equal(q('purchase.detail',{id:pur.purchase.id}).purchase.due_now,100);
q('supplier.payment',{supplier_id:supplier.id,account_id:cash,amount:40});assert.equal(q('purchase.detail',{id:pur.purchase.id}).purchase.due_now,60);
q('preturn.create',{purchase_id:pur.purchase.id,items:[{purchase_item_id:pur.items[0].id,qty:1}],refund:{mode:'adjust'}});assert.equal(q('purchase.detail',{id:pur.purchase.id}).purchase.due_now,0);
// B19: keep manual spaces, including those intentionally entered after #.
reset();p=product('MSI  Board #  Description  ',{description:'  Description  '});assert.equal(p.name,'MSI  Board #  Description  ');assert.equal(q('products.list').find(x=>x.id===p.id).name,p.name);
denied('product.save',{name:'   '},token,/required/);
// B17: an actual >8 MiB backup travels in small, authenticated, repeatable chunks.
reset();product('Before restore');let backup=q('database.export');
backup.tables.Settings.rows.push(['large_backup_test','x'.repeat(8*1024*1024+1024)]);backup.checksum=hash('karvio-backup-v1|'+JSON.stringify(backup.tables));
let text=JSON.stringify(backup),digest=hash('restore-upload-v1|'+text),parts=[];
for(let i=0;i<text.length;i+=128*1024)parts.push(text.slice(i,i+128*1024));
assert(Buffer.byteLength(text)>8*1024*1024);
denied('database.restore.begin',{password:'wrong',confirm:'RESTORE',size:Buffer.byteLength(text),parts:parts.length,digest},token,/password/i);
denied('database.restore.begin',{password:'regression-owner-password',confirm:'RESTORE',size:17*1024*1024,parts:100,digest},token,/16 MiB/);
let {upload_id}=q('database.restore.begin',{password:'regression-owner-password',confirm:'RESTORE',size:Buffer.byteLength(text),parts:parts.length,digest});
denied('database.restore.finish',{upload_id,password:'regression-owner-password',confirm:'RESTORE'},token,/incomplete/i);
const original=structuredClone(state.tables);
for(let index=0;index<parts.length;index++){
 q('database.restore.chunk',{upload_id,index,text:parts[index]});
 if(index===0){q('database.restore.chunk',{upload_id,index,text:parts[index]});denied('database.restore.chunk',{upload_id,index,text:'conflicting'},token,/conflict/i);}
}
assert.deepEqual(state.tables,original,'Upload must not change business rows');
let restored=q('database.restore.finish',{upload_id,password:'regression-owner-password',confirm:'RESTORE'});assert.equal(restored.counts.Products,1);assert.equal(q('database.restore.status',{upload_id}).done.counts.Products,1);assert.equal(state.tables.Settings.find(s=>s.key==='large_backup_test').value.length,8*1024*1024+1024);
const after=structuredClone(state.tables);q('database.restore.finish',{upload_id,password:'regression-owner-password',confirm:'RESTORE'});assert.deepEqual(state.tables,after,'Lost final reply retry must not restore twice');
reset();q('rolePerms.save',{sales:['settings']});q('user.save',{name:'Settings staff',username:'settingsstaff',role:'sales',password:'settings-staff-password',active:true});let staff=call('login',{username:'settingsstaff',password:'settings-staff-password'}).data.token;denied('database.restore.begin',{password:'settings-staff-password',confirm:'RESTORE',size:1,parts:1,digest:hash('restore-upload-v1|x')},staff,/Administrator/i);
reset();({upload_id}=q('database.restore.begin',{password:'regression-owner-password',confirm:'RESTORE',size:1,parts:1,digest:hash('restore-upload-v1|y')}));q('database.restore.chunk',{upload_id,index:0,text:'x'});denied('database.restore.finish',{upload_id,password:'regression-owner-password',confirm:'RESTORE'},token,/checksum/i);q('database.restore.abort',{upload_id});denied('database.restore.chunk',{upload_id,index:0,text:'x'},token,/expired/i);
console.log('Remaining audit backend regressions passed: serial transition, cumulative returns, complete sales, supplier due, naming spaces and >8 MiB chunked restore with rollback/retry checks.');
