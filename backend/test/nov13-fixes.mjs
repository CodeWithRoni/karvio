import assert from 'node:assert/strict';
import {createRuntime} from '../../supabase/functions/karvio-api/runtime.mjs';
import schema from '../../supabase/functions/karvio-api/schema.json' with {type:'json'};
let state={revision:0,metadata:{properties:{},cache:{},privateSheets:{}},tables:Object.fromEntries(Object.keys(schema).map(n=>[n,[]])),requiresSetup:true};
function apply(r){if(r.response.ok){Object.assign(state.tables,structuredClone(r.changes));state.requiresSetup=false;}state.metadata=structuredClone(r.metadata);state.revision++;return r.response;}
apply(createRuntime(state).initialize({name:'Audit regression',password:'audit-password-12345'}));
function call(action,payload={},t=''){return apply(createRuntime(structuredClone(state)).execute({action,payload,token:t,request_id:crypto.randomUUID()}));}
const token=call('login',{username:'admin',password:'audit-password-12345'}).data.token;
function q(a,p={},t=token){const r=call(a,p,t);assert.equal(r.ok,true,a+': '+r.error);return r.data;}
const cash=q('bootstrap').accounts[0].id;
const product=(name,extra={})=>q('product.save',{name,sale_price:100,...extra});
q('rolePerms.save',{sales:['pos','sales.return']});
q('user.save',{name:'Restricted salesperson',username:'auditstaff',password:'audit-staff-password',role:'sales'});
const staff=q('login',{username:'auditstaff',password:'audit-staff-password'}).token;
const p=product('Private cost');q('purchase.create',{items:[{product_id:p.id,qty:5,cost:60}],payments:[{account_id:cash,amount:300}]});
const sell=(t=staff)=>q('sale.create',{items:[{product_id:p.id,qty:1,price:100}],payments:[{account_id:cash,amount:100}]},t);
const s=sell();
const rp={sale_id:s.sale.id,items:[{sale_item_id:s.items[0].id,qty:1}],refund:{account_id:cash}};
const ret=q('sreturn.create',rp,staff);
assert.equal(ret.return.cost,undefined);
assert.equal(q('sale.detail',{id:s.sale.id},staff).returns[0].cost,undefined);
assert.equal(q('sales.details',{ids:[s.sale.id]},staff)[0].returns[0].cost,undefined);
assert.equal(q('sale.detail',{id:s.sale.id}).returns[0].cost,60);
const ss=sell();const x=q('sale.exchange',{sale_id:ss.sale.id,items:[{sale_item_id:ss.items[0].id,qty:1}],replacement:[{product_id:p.id,qty:1,price:100}],account_id:cash},staff);
assert.equal(x.sale.sale.cost,undefined);assert.equal(x.sale.items[0].cost,undefined);
q('master.save',{kind:'unit',name:'meter',label:'Meter',decimal:true});
const parts=[];for(let i=0;i<3;i++){const pr=product('Repair fractional '+i,{unit:'meter',sale_price:0.01});q('purchase.create',{items:[{product_id:pr.id,qty:1,cost:0.01}],payments:[{account_id:cash,amount:0.01}]});parts.push({product_id:pr.id,qty:0.5,price:0.01});}
for(const advance of [0,0.03]){
const job=q('repair.save',{customer_name:'Repair rounding '+advance,phone:advance?'01811000002':'01811000001',device:'PC',problem:'Test',parts,charge:0,advance,account_id:cash});
assert.equal(job.total,0.03);const done=q('repair.deliver',{id:job.id,expected_credit:advance,payments:advance?[]:[{account_id:cash,amount:0.03}]});assert.equal(done.invoice.sale.total,0.03);assert.equal(done.invoice.sale.due,0);
}
const c=q('customer.save',{name:'Unpaid exchange'}),a=product('Old service',{service:true,sale_price:550}),b=product('New service',{service:true,sale_price:700});
const orig=q('sale.create',{customer_id:c.id,items:[{product_id:a.id,qty:1,price:550}],payments:[]});
const payload={sale_id:orig.sale.id,items:[{sale_item_id:orig.items[0].id,qty:1}],replacement:[{product_id:b.id,qty:1,price:700}],payments:[{account_id:cash,amount:700}],expected_credit:0};
const before=JSON.stringify(state.tables);const stale=call('sale.exchange',{...payload,expected_credit:550},token);assert.equal(stale.ok,false);assert.match(stale.error,/Customer balance changed/);assert.equal(JSON.stringify(state.tables),before);
assert.equal(q('sale.exchange',payload).sale.sale.due,0);
q('rolePerms.save',{sales:['expenses','purchase','suppliers','customers']});
const boot=q('bootstrap',{},staff);assert.equal(boot.accounts.length,1);assert.equal(boot.accounts[0].id,cash);assert.equal(boot.accounts[0].balance,undefined);assert.equal(call('accounts.list',{},staff).ok,false);
assert.equal(q('expense.create',{category:'Other',amount:1,account_id:cash},staff).amount,1);
console.log('November 13 fixes passed: return cost privacy, repair line rounding/advance, exchange stale-credit rollback and restricted payment accounts.');
