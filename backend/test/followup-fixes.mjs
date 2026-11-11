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
// F01/F06: only unused parties may be deleted; references and financial reversals stay visible.
for (const supplier of [false,true]) {
 reset();const kind=supplier?'supplier':'customer',c=q(kind+'.save',{name:'History party'});let p=product('Party service',{service:!supplier});
 let doc=supplier?q('purchase.create',{supplier_id:c.id,items:[{product_id:p.id,qty:1,cost:100}],payments:[]}):sell(p,1,{customer_id:c.id,items:[{product_id:p.id,qty:1,price:100}],payments:[]});
 let payment=q(kind+'.payment',{[kind+'_id']:c.id,amount:100,account_id:cash});
 denied(kind+'.delete',{id:c.id},token,/history/i);
 q('reverse',{type:supplier?'spay':'cpay',id:payment.entry.id,password:'regression-owner-password',reason:'Correction'});
 assert.equal(q('dashboard')[supplier?'payable':'receivable'],100);
 assert.equal(q(kind==='customer'?'customers.list':'suppliers.list').find(x=>x.id===c.id).balance,100);
 let unused=q(kind+'.save',{name:'Unused'});q(kind+'.delete',{id:unused.id});assert(!q(supplier?'suppliers.list':'customers.list').some(x=>x.id===unused.id));
 // A pre-existing missing party must not produce new invisible debt on cancellation.
 reset();const old=q(kind+'.save',{name:'Legacy missing party'});payment=q(kind+'.payment',{[kind+'_id']:old.id,amount:100,account_id:cash});state.tables[supplier?'Suppliers':'Customers']=[];
 denied('reverse',{type:supplier?'spay':'cpay',id:payment.entry.id,password:'regression-owner-password',reason:'Correction'},token,/record is missing/i);
}
reset();let c=q('customer.save',{name:'Open repair party'});let job=q('repair.save',{customer_id:c.id,device:'Laptop',problem:'Fault',charge:100,parts:[]});denied('customer.delete',{id:c.id},token,/open repair/i);assert.equal(q('repair.deliver',{id:job.id,expected_credit:0,payments:[{account_id:cash,amount:100}]}).status,'Delivered');
// F02: tracking cannot be disabled after selling all stock; old returns remain serialized.
reset();let p=product('Serial history',{has_warranty:true,warranty_type:'serial',warranty_days:365});buy(p,1,{serials:'FOLLOW-1'});let sale=sell(p,1,{items:[{product_id:p.id,qty:1,price:200,serials:'FOLLOW-1'}]});
denied('product.save',{...p,has_warranty:false},token,/serial history/i);
q('sreturn.create',{sale_id:sale.sale.id,items:[{sale_item_id:sale.items[0].id,qty:1,serials:'FOLLOW-1'}],refund:{account_id:cash}});
denied('sale.create',{items:[{product_id:p.id,qty:1,price:200}],payments:[{account_id:cash,amount:200}]},token,/serial number/i);
sell(p,1,{items:[{product_id:p.id,qty:1,price:200,serials:'FOLLOW-1'}]});assert.equal(stock(p),0);assert.equal(q('serials.list',{product_id:p.id})[0].status,'sold');
let unused=product('Unused serial',{has_warranty:true,warranty_type:'serial',warranty_days:365});assert.equal(q('product.save',{...unused,has_warranty:false}).has_warranty,false);
// F03: the claimed invoice line, not aggregate product quantity, determines warranty eligibility.
function warrantySale(sameWarranty=false) {p=product('Mixed warranty',{has_warranty:true,warranty_type:'invoice',warranty_days:365});buy(p,4);return sell(p,1,{items:[{product_id:p.id,qty:1,price:200,warranty_days:365},{product_id:p.id,qty:1,price:200,warranty_days:sameWarranty?365:0}],payments:[{account_id:cash,amount:400}]});}
reset();sale=warrantySale();let claim=q('claim.create',{sale_id:sale.sale.id,sale_item_id:sale.items[0].id,issue:'Fault'});assert.equal(JSON.parse(claim.log)[0].sale_item_id,sale.items[0].id);ret(sale);denied('claim.update',{id:claim.id,status:'Replaced'},token,/line was returned/i);assert.equal(stock(p),3);
reset();sale=warrantySale(true);claim=q('claim.create',{sale_id:sale.sale.id,sale_item_id:sale.items[0].id,issue:'Fault'});
// Legacy ambiguous claims are refused conservatively, not guessed onto an eligible line.
let stored=state.tables.WarrantyClaims.find(c=>c.id===claim.id),log=JSON.parse(stored.log);delete log[0].sale_item_id;stored.log=JSON.stringify(log);denied('claim.update',{id:claim.id,status:'Replaced'},token,/identified uniquely/i);
// A single identifiable legacy line remains supported.
reset();p=product('Unique legacy warranty',{has_warranty:true,warranty_type:'invoice',warranty_days:365});buy(p,3);sale=sell(p);claim=q('claim.create',{sale_id:sale.sale.id,sale_item_id:sale.items[0].id,issue:'Fault'});stored=state.tables.WarrantyClaims.find(c=>c.id===claim.id);log=JSON.parse(stored.log);delete log[0].sale_item_id;stored.log=JSON.stringify(log);q('claim.update',{id:claim.id,status:'Replaced'});assert.equal(stock(p),1);
// F04: public current payment/debt fields reconcile with returns; saved staff snapshots remain historical.
reset();c=q('customer.save',{name:'Public settled'});p=product('Public paid service',{service:true});sale=sell(p,5,{customer_id:c.id,items:[{product_id:p.id,qty:5,price:100}],payments:[{account_id:cash,amount:100}]});const link=q('sale.link',{id:sale.sale.id}).url.split('/i/')[1];q('customer.payment',{customer_id:c.id,account_id:cash,amount:400});let pub=q('invoice.public',{token:link},'');assert.equal(pub.sale.paid_now,500);assert.equal(pub.sale.paid_at_sale,100);assert.equal(pub.sale.paid,100);assert.equal(pub.sale.due_now,0);assert.equal(pub.sale.live_invoice,true);
let historical=q('sale.detail',{id:sale.sale.id}).sale;assert.equal(historical.paid,100);assert.equal(historical.due,400);assert.equal(JSON.parse(historical.balance_snapshot).outstanding,400);
ret(sale,1);pub=q('invoice.public',{token:link},'');assert.equal(pub.sale.returned_total,100);assert.equal(pub.sale.net_total,400);assert.equal(pub.sale.paid_now,400);assert.equal(pub.sale.due_now,0);
// F05: stocked products cannot disappear; explicit write-offs carry their loss.
reset();p=product('Counted stock',{cost_price:100});q('stock.adjust',{product_id:p.id,new_stock:2});denied('product.delete',{id:p.id},token,/still has stock/i);assert.equal(q('dashboard').stock_value,200);q('stock.adjust',{product_id:p.id,new_stock:0,note:'Write off damaged stock'});assert.equal(q('profit.report',{}).summary.net,0);assert.equal(q('product.delete',{id:p.id}).deactivated,true);assert.equal(q('products.list').find(x=>x.id===p.id).active,false);
// F07: cancelled returns remain inspectable but contribute zero to financial totals.
for(const purchase of [false,true]) {
 reset();p=product('Returns report');let a,b;
 if(purchase){a=buy(p);b=buy(p);}else{buy(p,4);a=sell(p);b=sell(p);}
 const create=d=>purchase?q('preturn.create',{purchase_id:d.purchase.id,items:[{purchase_item_id:d.items[0].id,qty:1}],refund:{account_id:cash}}):ret(d);
 create(a);const reversed=create(b);q('reverse',{type:purchase?'preturn':'sreturn',id:reversed.return.id,password:'regression-owner-password',reason:'Wrong return'});
 const report=q('reports',{type:purchase?'purchase_returns':'sales_returns',status:'all'});assert.equal(report.rows.length,2);assert.equal(report.totals.total,purchase?100:200);assert.equal(report.totals[purchase?'received':'refund'],purchase?100:200);
 assert.equal(q('reports',{type:purchase?'purchase_returns':'sales_returns',status:'cancelled'}).totals.total,0);
}
// F08: an oversized request fails explicitly instead of exporting only 200 purchases.
reset();state.tables.Purchases=Array.from({length:201},(_,i)=>({_position:i+2,id:'purchase-'+i,invoice_no:'PUR-'+i,date:'2026-11-11',status:'active',total:100,paid:100,due:0,supplier_id:''}));denied('purchases.details',{ids:state.tables.Purchases.map(p=>p.id)},token,/200 purchases/i);assert.equal(q('purchases.details',{ids:state.tables.Purchases.slice(0,200).map(p=>p.id)}).length,200);
// F09: current supplier debt is available in invoice and grouped report columns/totals.
reset();let supplier=q('supplier.save',{name:'Paid supplier'});p=product('Purchase report');q('purchase.create',{supplier_id:supplier.id,items:[{product_id:p.id,qty:1,cost:100}],payments:[]});q('supplier.payment',{supplier_id:supplier.id,account_id:cash,amount:100});
for(const group of ['invoice','daily','monthly','yearly']){const report=q('reports',{type:'purchases',group});assert.equal(report.rows[0].due,100);assert.equal(report.rows[0].due_now,0);assert.equal(report.totals.due_now,0);assert.equal(report.columns.find(c=>c.key==='due').label,'Due at purchase');assert(report.columns.some(c=>c.key==='due_now'));}
// Permission consistency: Sales reports honor the same own-sale restriction as invoices.
reset();q('rolePerms.save',{sales:['pos','reports']});q('user.save',{name:'Own reporter',username:'reporter',role:'sales',password:'restricted-report-password',active:true});const staff=call('login',{username:'reporter',password:'restricted-report-password'}).data.token;p=product('Report permission',{service:true});let ownerSale=sell(p),own=sell(p,1,{},staff);
for(const group of ['invoice','daily','monthly','yearly']){let report=q('reports',{type:'sales',group},staff);assert.equal(report.rows.length,1);assert.equal(report.totals.total,200);}assert.equal(q('reports',{type:'sales'},staff).rows[0].invoice_no,own.sale.invoice_no);assert.equal(q('reports',{type:'sales'}).rows.length,2);assert.equal(q('reports',{type:'sales',user_id:state.tables.Users[0].id},staff).rows.length,0);

// Any history blocks deletion, including voided payments and cancelled invoices.
for (const supplierSide of [false,true]) {
 reset();const kind=supplierSide?'supplier':'customer',list=supplierSide?'suppliers.list':'customers.list';
 const party=q(kind+'.save',{name:'Voided payment profile',combined:true});
 assert.equal(q(list).find(x=>x.id===party.id).has_history,false);
 const paid=q(kind+'.payment',{[kind+'_id']:party.id,amount:100,account_id:cash});
 q('reverse',{type:supplierSide?'spay':'cpay',id:paid.entry.id,password:'regression-owner-password',reason:'Void payment'});
 const profile=q(list).find(x=>x.id===party.id);assert.equal(profile.balance,0);assert.equal(profile.has_history,true);
 denied(kind+'.delete',{id:party.id},token,/history/i);
 const other=supplierSide?'customer':'supplier',otherList=supplierSide?'customers.list':'suppliers.list';
 assert.equal(q(otherList).find(x=>x.id===profile.link_id).has_history,true);
 denied(other+'.delete',{id:profile.link_id},token,/history/i);
 reset();const fresh=q(kind+'.save',{name:'Cancelled invoice profile'}),pr=product('Cancelled invoice product',{service:!supplierSide});
 const invoice=supplierSide?q('purchase.create',{supplier_id:fresh.id,items:[{product_id:pr.id,qty:1,cost:100}],payments:[{account_id:cash,amount:100}]}):sell(pr,1,{customer_id:fresh.id});
 q('reverse',{type:supplierSide?'purchase':'sale',id:supplierSide?invoice.purchase.id:invoice.sale.id,password:'regression-owner-password',reason:'Cancel invoice'});
 assert.equal(q(list).find(x=>x.id===fresh.id).balance,0);assert.equal(q(list).find(x=>x.id===fresh.id).has_history,true);denied(kind+'.delete',{id:fresh.id},token,/history/i);
}

console.log('Follow-up accounting and stock regressions passed: deletion, serial history, exact/legacy warranty lines, current public payments, return totals, purchase exports/reports and sales report ownership.');
