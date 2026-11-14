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





const products=[];for(let i=0;i<3;i++){const p=product('AUDIT fractional COGS '+i,{sale_price:1});products.push(p);q('purchase.create',{items:[{product_id:p.id,qty:2,cost:0.005}],payments:[{account_id:cash,amount:0.01}]});}
const sale=q('sale.create',{items:products.map(p=>({product_id:p.id,qty:1,price:1})),payments:[{account_id:cash,amount:3}]});
const day=q('bootstrap').serverToday;const profit=q('profit.report',{from:day,to:day});const report=q('reports',{type:'product_sales'});
const actual={saleCost:sale.sale.cost,saleProfit:sale.sale.profit,summaryProfit:profit.summary.gross,productCosts:profit.products.map(x=>x.cost),productProfits:profit.products.map(x=>x.profit),productCostTotal:profit.products.reduce((n,x)=>n+x.cost,0),productProfitTotal:profit.products.reduce((n,x)=>n+x.profit,0),productSalesProfit:report.totals.profit};
assert.equal(actual.saleCost,0.02);assert.equal(actual.saleProfit,2.98);assert.equal(actual.productProfitTotal,2.98);assert.equal(actual.productCostTotal,0.02);assert.equal(actual.productSalesProfit,2.98);
const returned=q('sreturn.create',{sale_id:sale.sale.id,items:sale.items.map(i=>({sale_item_id:i.id,qty:1})),refund:{mode:'cash',account_id:cash}});
const after=q('profit.report',{from:day,to:day});assert.equal(after.summary.gross,0);assert.equal(Math.round(after.products.reduce((n,r)=>n+r.profit,0)*100)/100,0);
reset();q('master.save',{kind:'unit',name:'meter',label:'Meter',decimal:true});const pcs=product('Pieces',{service:true}),meters=product('Meters',{unit:'meter'});q('purchase.create',{items:[{product_id:meters.id,qty:3,cost:5}],payments:[{account_id:cash,amount:15}]});q('sale.create',{items:[{product_id:pcs.id,qty:2,price:100},{product_id:meters.id,qty:3,price:10}],payments:[{account_id:cash,amount:230}]});const daily=q('reports',{type:'daily_summary'});assert.equal(daily.totals.items,'3 meter · 2 pcs');assert.equal(daily.rows[0].items,'3 meter · 2 pcs');assert.deepEqual(daily.rows[0].item_quantities,{pcs:2,meter:3});
// A return-only period must inherit the sold line's real unit.
const meterSale=state.tables.Sales.find(s=>s.status==='active');const old='2026-01-01';state.tables.Sales.find(s=>s.id===meterSale.id).date=old;
const meterLine=state.tables.SaleItems.find(i=>i.sale_id===meterSale.id && i.product_id===meters.id);
q('sreturn.create',{sale_id:meterSale.id,items:[{sale_item_id:meterLine.id,qty:1.5}],refund:{mode:'cash',account_id:cash}});
const returnOnly=q('profit.report',{from:day,to:day});assert.equal(returnOnly.products.find(x=>x.product_id===meters.id).unit,'meter');assert.equal(returnOnly.products.find(x=>x.product_id===meters.id).returned_qty,1.5);
console.log('Report follow-up passed: invoice currency COGS reconciles across product reports and full return; daily quantities stay separated by unit.');
