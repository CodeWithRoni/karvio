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
// Purchased/sold products remain protected after full sale-out and cancellation.
let p=product('Retained purchased product');let purchase=buy(p),sale=sell(p);assert.equal(stock(p),0);assert.equal(q('products.list').find(r=>r.id===p.id).has_history,true);denied('product.delete',{id:p.id},token,/history/i);
q('reverse',{type:'sale',id:sale.sale.id,password:'regression-owner-password',reason:'Cancel sale'});q('reverse',{type:'purchase',id:purchase.purchase.id,password:'regression-owner-password',reason:'Cancel purchase'});assert.equal(stock(p),0);denied('product.delete',{id:p.id},token,/history/i);
let service=product('Retained sold service',{service:true});sell(service);denied('product.delete',{id:service.id},token,/history/i);
let unused=product('Never used');assert.equal(q('products.list').find(r=>r.id===unused.id).has_history,false);assert.equal(q('product.delete',{id:unused.id}).deleted,true);
// Cash, bank and MFS accounts retain their rows and cancelled transaction history.
for(const type of ['cash','bank','mfs']){
 const account=q('account.save',{name:'Retained '+type,type,opening_balance:0});q('account.entry',{account_id:account.id,kind:'deposit',amount:100});const entry=q('account.ledger',{account_id:account.id}).rows[0];q('reverse',{type:'account',id:entry.id,password:'regression-owner-password',reason:'Cancel deposit'});
 const row=q('accounts.list').find(r=>r.id===account.id);assert.equal(row.balance,0);assert.equal(row.has_history,true);denied('account.delete',{id:account.id},token,/Unknown action/);
 q('account.save',{...row,active:false});assert.equal(q('accounts.list').find(r=>r.id===account.id).active,false);assert(state.tables.AccountTxns.some(r=>r.account_id===account.id&&r.voided));
}
// Used expense names cannot be removed or renamed through either settings route.
q('expense.categories',{categories:['Other','Used retention category','Unused category']});const expense=q('expense.create',{category:'Used retention category',amount:25,account_id:cash});assert.equal(q('expense.categories.usage')['used retention category'],1);
denied('expense.categories',{categories:['Other','Unused category']},token,/history/i);denied('settings.save',{values:{expense_categories:JSON.stringify(['Other','Unused category']),shop_name:'Must roll back'}},token,/history/i);
q('reverse',{type:'expense',id:expense.id,password:'regression-owner-password',reason:'Cancel expense'});assert.equal(state.tables.Expenses.find(r=>r.id===expense.id).status,'cancelled');assert.equal(q('expense.categories.usage')['used retention category'],1);denied('expense.categories',{categories:['Other','Renamed used category','Unused category']},token,/history/i);denied('expense.delete',{id:expense.id},token,/Unknown action/);
q('expense.categories',{categories:['Other','Used retention category']});
// Only explicit owner reset clears the business history; run solely in this local fixture.
const oldAccountIds=state.tables.Accounts.map(a=>a.id);q('database.reset',{password:'regression-owner-password',confirm:'RESET',keep_settings:false,keep_users:false});
for(const table of ['Products','Sales','SaleItems','Purchases','PurchaseItems','Expenses','AccountTxns','CustomerLedger','SupplierLedger','SalesReturns','PurchaseReturns','Repairs','WarrantyClaims'])assert.equal(state.tables[table].length,0,table+' reset');
const accounts=q('accounts.list');assert.equal(accounts.length,1);assert.equal(accounts[0].name,'Cash');assert.equal(accounts[0].balance,0);assert.equal(accounts[0].has_history,false);assert(!oldAccountIds.includes(accounts[0].id));assert.equal(state.tables.Users.length,1);
assert(!JSON.parse(q('settings.get').expense_categories).includes('Used retention category'));q('expense.categories',{categories:['Other']});
console.log('History retention passed: used/cancelled products, cash/bank/MFS accounts, expenses/categories, settings bypass protection, and explicit local owner reset to fresh state.');
