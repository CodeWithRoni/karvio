import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRuntime} from '../../supabase/functions/karvio-api/runtime.mjs';
import schema from '../../supabase/functions/karvio-api/schema.json' with {type:'json'};
let state={revision:0,metadata:{properties:{},cache:{},privateSheets:{}},tables:Object.fromEntries(Object.keys(schema).map(n=>[n,[]])),requiresSetup:true};
function apply(r){if(r.response.ok){Object.assign(state.tables,structuredClone(r.changes));state.requiresSetup=false;}state.metadata=structuredClone(r.metadata);state.revision++;return r.response;}
apply(createRuntime(state).initialize({name:'Audit owner',password:'audit-owner-password-123'}));
function call(action,payload={},t=''){return apply(createRuntime(structuredClone(state)).execute({action,payload,token:t,request_id:crypto.randomUUID()}));}
const token=call('login',{username:'admin',password:'audit-owner-password-123'}).data.token;
function q(a,p={},t=token){const r=call(a,p,t);assert.equal(r.ok,true,a+': '+r.error);return r.data;}
const cash=q('bootstrap').accounts[0].id,base=structuredClone(state);
const reset=()=>state=structuredClone(base);
const product=(name,extra={})=>q('product.save',{name,sale_price:100,unit:'pcs',...extra});






const supplier=q('supplier.save',{name:'Scoped combined party',opening_balance:700,combined:true});
q('customer.save',{id:supplier.link_id,name:'Scoped combined party',opening_balance:600});
const customer=q('customer.save',{name:'Scoped customer',opening_balance:500});
for(const [role,username] of [['technician','scope-tech'],['sales','scope-sales'],['manager','scope-manager']])q('user.save',{name:username,username,password:'scope-password-123',role,phone:role==='technician'?'01712345678':'',active:true});
const login=username=>q('login',{username,password:'scope-password-123'}).token;
const tech=login('scope-tech');for(const list of [q('bootstrap',{},tech).customers,q('customers.list',{},tech)])for(const c of list)for(const k of ['balance','opening_balance','link_balance'])assert.equal(Object.hasOwn(c,k),false);
assert.equal(call('suppliers.list',{},tech).ok,false);
const sales=login('scope-sales');const salesCustomers=q('bootstrap',{},sales).customers;assert.equal(salesCustomers.find(c=>c.id===customer.id).balance,500);assert.equal(Object.hasOwn(salesCustomers.find(c=>c.id===supplier.link_id),'link_balance'),false);
const admin=q('bootstrap');assert.equal(admin.customers.find(c=>c.id===supplier.link_id).link_balance,700);assert.equal(admin.suppliers.find(c=>c.id===supplier.id).link_balance,600);
q('rolePerms.save',{manager:['customers'],sales:['suppliers'],technician:['repairs']});const manager=login('scope-manager'),supplierStaff=login('scope-sales');assert.equal(Object.hasOwn(q('customer.statements',{ids:[supplier.link_id]},manager)[0].info,'link_balance'),false);assert.equal(Object.hasOwn(q('supplier.statements',{ids:[supplier.id]},supplierStaff)[0].info,'link_balance'),false);assert.equal(Object.hasOwn(q('suppliers.list',{},supplierStaff)[0],'link_balance'),false);
reset();const p=product('Discount boundary item',{sale_price:150});for(const discount of [-10,200,'not-a-number','Infinity']){const before=structuredClone(state.tables);const result=call('purchase.create',{items:[{product_id:p.id,qty:1,cost:100}],discount},token);assert.equal(result.ok,false);assert.match(result.error,/discount must be between/);assert.deepEqual(state.tables,before);}
const free=q('purchase.create',{items:[{product_id:p.id,qty:1,cost:100}],discount:100});assert.equal(free.purchase.total,0);assert.equal(q('products.list').find(x=>x.id===p.id).cost_price,0);
reset();const ids=[];for(let i=0;i<501;i++)ids.push(product('Batch barcode '+i).id);const before=structuredClone(state.tables);const rejected=call('product.barcodes',{ids},token);assert.equal(rejected.ok,false);assert.match(rejected.error,/at most 500/);assert.deepEqual(state.tables,before);q('product.barcodes',{ids:ids.slice(0,500)});q('product.barcodes',{ids:ids.slice(500)});const rows=q('products.list');assert.equal(rows.filter(x=>x.barcode).length,501);assert.equal(new Set(rows.map(x=>x.barcode)).size,501);assert.equal(call('product.barcodes',{ids:[ids[0],ids[0]]},token).ok,false);

reset();const serialProduct=product('Exact serial preview',{has_warranty:true,warranty_type:'serial',warranty_days:365,sale_price:1});const serials=Array.from({length:101},(_,i)=>'EXACT-'+i);q('purchase.create',{items:[{product_id:serialProduct.id,qty:101,cost:0.005,serials}],discount:0.01,payments:[{account_id:cash,amount:0.5}]});q('sale.create',{items:[{product_id:serialProduct.id,qty:1,price:1,serials:[serials[0]]}],payments:[{account_id:cash,amount:1}]});const held=q('products.list').find(x=>x.id===serialProduct.id);assert.equal(held.inventory_cost,0.495);assert.equal(held.cost_price,0.005);q('user.save',{name:'No cost reader',username:'no-cost-reader',role:'sales',password:'no-cost-password'});const noCost=q('login',{username:'no-cost-reader',password:'no-cost-password'}).token;assert.equal(Object.hasOwn(q('products.list',{},noCost).find(x=>x.id===serialProduct.id),'inventory_cost'),false);q('purchase.create',{items:[{product_id:serialProduct.id,qty:1,cost:0.01,serials:['EXACT-NEW']}],discount:0.01});assert.equal(q('products.list').find(x=>x.id===serialProduct.id).cost_price,0.0049);
console.log('Access/purchase/barcode fixes passed: scoped picker/export balances, POS due retained, atomic discount bounds, explicit 100% discount, bounded complete 501-product assignment.');
