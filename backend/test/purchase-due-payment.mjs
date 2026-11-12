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

function scenario(){reset();const s=q('supplier.save',{name:'Previous due supplier'}),p=product('Previous due stock');const old=q('purchase.create',{supplier_id:s.id,items:[{product_id:p.id,qty:5,cost:100}],payments:[]});return {s,p,old};}
let {s,p,old}=scenario();const bank=q('account.save',{name:'Due bank',type:'bank',opening_balance:1000});
const payload={supplier_id:s.id,items:[{product_id:p.id,qty:1,cost:100}],payments:[{account_id:cash,amount:20}],previous_due_payments:[{account_id:cash,amount:100},{account_id:bank.id,amount:50}],expected_previous_due:500};
const id=crypto.randomUUID();function retry(){return apply(createRuntime(structuredClone(state)).execute({action:'purchase.create',payload,token,request_id:id}));}
let result=retry();assert.equal(result.ok,true,result.error);const detail=result.data;assert.equal(detail.purchase.paid,20);assert.equal(detail.purchase.due,80);assert.equal(detail.previous_due_payment.amount,150);assert.equal(detail.previous_due_payment.receipts.length,2);assert.equal(q('suppliers.list').find(x=>x.id===s.id).balance,430);assert.equal(q('purchase.detail',{id:old.purchase.id}).purchase.due_now,350);assert.equal(q('purchase.detail',{id:detail.purchase.id}).purchase.due_now,80);assert.equal(q('accounts.list').find(x=>x.id===cash).balance,-120);assert.equal(q('accounts.list').find(x=>x.id===bank.id).balance,950);let before=structuredClone(state.tables);assert.deepEqual(retry(),result);assert.deepEqual(state.tables,before,'Retry cannot purchase/pay twice');
// Cancelling the new purchase preserves the separate old-debt payment and its receipts.
q('reverse',{type:'purchase',id:detail.purchase.id,password:'regression-owner-password',reason:'Cancel only the new invoice'});assert.equal(q('suppliers.list').find(x=>x.id===s.id).balance,350);assert.equal(state.tables.SupplierLedger.filter(x=>x.type==='payment'&&!x.voided).length,2);
// Blank optional section and ordinary legacy requests never create a previous-due payment.
for(const extra of [{},{previous_due_payments:[{account_id:cash,amount:''}]}]){({s,p}=scenario());q('purchase.create',{supplier_id:s.id,items:[{product_id:p.id,qty:1,cost:100}],payments:[],...extra});assert.equal(q('suppliers.list').find(x=>x.id===s.id).balance,600);assert.equal(state.tables.SupplierLedger.filter(x=>x.type==='payment').length,0);}
// Reject stale balance, overpayment, invalid amount/account and missing supplier without any stock/money write.
for(const extra of [{expected_previous_due:400},{previous_due_payments:[{account_id:cash,amount:501}]},{previous_due_payments:[{account_id:'missing',amount:100}]},{previous_due_payments:[{account_id:cash,amount:-10}]},{previous_due_payments:[{account_id:cash,amount:'bad'}]},{supplier_id:''}]){({s,p}=scenario());denied('purchase.create',{supplier_id:s.id,items:[{product_id:p.id,qty:1,cost:100}],payments:[],previous_due_payments:[{account_id:cash,amount:100}],expected_previous_due:500,...extra},token);}
({s,p}=scenario());q('supplier.payment',{supplier_id:s.id,account_id:cash,amount:50});denied('purchase.create',{supplier_id:s.id,items:[{product_id:p.id,qty:1,cost:100}],previous_due_payments:[{account_id:cash,amount:100}],expected_previous_due:500},token,/balance changed/);
// Supplier-account permission is required in addition to Purchase permission.
({s,p}=scenario());q('rolePerms.save',{sales:['purchase']});q('user.save',{name:'Purchase only',username:'purchaseonly',role:'sales',password:'purchase-only-password',active:true});let staff=call('login',{username:'purchaseonly',password:'purchase-only-password'}).data.token;denied('purchase.create',{supplier_id:s.id,items:[{product_id:p.id,qty:1,cost:100}],previous_due_payments:[{account_id:cash,amount:100}],expected_previous_due:500},staff,/Permission/);q('purchase.create',{supplier_id:s.id,items:[{product_id:p.id,qty:1,cost:100}],payments:[]},staff);
assert.equal(q('bootstrap').apiCapabilities.purchaseDuePayment,true);
console.log('Purchase previous-due payment passed: atomic split payment, invoice allocation, unchanged blank option, replay safety, stale/overpayment/invalid rollback, permissions and independent cancellation.');
