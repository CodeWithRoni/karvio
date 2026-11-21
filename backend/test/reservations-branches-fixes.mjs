// Regression cases from the 20 November audit. Local PostgreSQL, no real courier traffic.
import assert from 'node:assert/strict';
import {freshDatabase,apiClient} from './pg-harness.mjs';
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};const ok=(v,m)=>{assert.ok(v,m);checks++;};
const db=await freshDatabase();let sent=0,mode='ok',failFinishRead=false;
const api=await apiClient(db,{onCall:call=>{if(failFinishRead&&call.name==='karvio_read'&&call.args.action_name==='courier.finish'){failFinishRead=false;throw Error('Temporary finish read failure');}},handlerOptions:{courierFetch:async()=>{sent++;if(mode==='lost')throw Error('remote accepted but reply lost');return {status:200,text:async()=>JSON.stringify({status:200,consignment:{consignment_id:'BOOK-'+sent,tracking_code:'TRACK-'+sent,status:'in_review'}})};}}});const {q,raw}=api;const admin=api.token,pw='harness-password-1';
const boot=await q('bootstrap'),cash=boot.accounts[0].id;
const supplier=await q('supplier.save',{name:'Audit supplier'}),customer=await q('customer.save',{name:'Audit customer',phones:'01711112222',addresses:'Test road'});
const part=await q('product.save',{name:'Audit part',sale_price:100});const purchase=await q('purchase.create',{supplier_id:supplier.id,items:[{product_id:part.id,qty:30,cost:50}],payments:[]});
// 1: SQL summary lifecycle matches actual reservations.
const type=(await q('service.type.save',{name:'Audit install',charge:0}))[0];
const j=await q('service.save',{customer_id:customer.id,type_id:type.id,details:'Install',address:'Test road',charge:0,parts:[{product_id:part.id,qty:3,price:100}]});
const product=async(id=part.id,branch)=> (await q('products.list',{},branch?{branch}:{})).find(x=>x.id===id);
eq([(await product()).reserved,(await product()).available],[3,27],'Pending service reserves three in SQL list');
await q('service.status',{id:j.id,status:'Work done'});eq((await product()).reserved,3,'Work done remains reserved');
await q('service.complete',{id:j.id,charge:0,payments:[]});eq([(await product()).stock,(await product()).reserved,(await product()).available],[27,0,27],'Completed service no longer reserved');
await q('reverse',{type:'sale',id:(await q('service.get',{id:j.id})).sale_id,password:pw,reason:'Reopen job'});eq((await product()).reserved,3,'Cancelled invoice reserves service parts again');await q('service.cancel',{id:j.id,reason:'Test done'});
// 2: one sold/returned invoice must contribute zero gross profit.
const br=await q('branch.save',{name:'Second Branch'}),A=br.list[0].id,B=br.list[1].id;
const before=(await q('branch.report')).all.profit;
const sale=await q('sale.create',{customer_id:customer.id,items:[{product_id:part.id,qty:1,price:100}],payments:[]},{branch:A});
eq((await q('branch.report')).all.profit,before+50,'branch report gets sale profit');
await q('sreturn.create',{sale_id:sale.sale.id,items:[{sale_item_id:sale.items[0].id,qty:1}],refund:{mode:'adjust'}},{branch:B});
eq((await q('branch.report')).all.profit,before,'full return removes profit even when received by another branch');
// 3: serial and unit reservations cannot cross branches or leave via transfers.
const serial=await q('product.save',{name:'Audit serial',sale_price:500,has_warranty:true,warranty_type:'serial',warranty_days:365});
await q('purchase.create',{supplier_id:supplier.id,items:[{product_id:serial.id,qty:1,cost:100,serials:'AT-A'}],payments:[]},{branch:A});
await q('purchase.create',{supplier_id:supplier.id,items:[{product_id:serial.id,qty:1,cost:300,serials:'AT-B'}],payments:[]},{branch:B});
const bad=await raw('repair.save',{customer_id:customer.id,device:'Wrong branch',problem:'Test',parts:[{product_id:serial.id,qty:1,price:500,serials:'AT-A'}]},{branch:B});ok(!bad.ok&&/branch/i.test(bad.error),'cannot reserve serial from another branch');
const job=await q('repair.save',{customer_id:customer.id,device:'Repair',problem:'Test',parts:[{product_id:serial.id,qty:1,price:500,serials:'AT-A'}]},{branch:A});
const blocked=await raw('branch.transfer.send',{to:B,items:[{product_id:serial.id,serials:'AT-A'}]},{branch:A});ok(!blocked.ok&&/reserved/i.test(blocked.error),'reserved serial cannot transfer');eq((await product(serial.id,A)).stock,1,'failed transfer leaves stock intact');
eq([(await product(serial.id,A)).reserved,(await product(serial.id,B)).reserved],[1,0],'branch reservations are local');
// Jobs saved by older releases have no branch tag; keep their stock held until explicitly edited.
await db.query('delete from karvio_private.private_rows where sheet=$1 and cells->>0=$2',['__KarvioBranchRows','d|Repairs|'+job.id]);
eq([(await product(serial.id,A)).reserved,(await product(serial.id,B)).reserved],[1,1],'untagged old job is held conservatively');
await q('repair.save',{id:job.id,device:'Repair',problem:'Test',parts:[{product_id:serial.id,qty:1,price:500,serials:'AT-A'}]},{branch:A});
eq((await product(serial.id,B)).reserved,0,'editing assigns the legacy job to its verified branch');
const unitJob=await q('repair.save',{customer_id:customer.id,device:'Unit job',problem:'Test',parts:[{product_id:part.id,qty:2,price:100}]},{branch:A});
const available=(await product(part.id,A)).available;
const tooMany=await raw('branch.transfer.send',{to:B,items:[{product_id:part.id,qty:available+1}]},{branch:A});ok(!tooMany.ok&&/reserved/i.test(tooMany.error),'nonserial reserved units cannot transfer');
await q('repair.cancel',{id:unitJob.id,reason:'Done',refund_advance:false});
// 4: hidden branch documents remain hidden by ID and invoice number.
await q('user.save',{name:'Audit manager',username:'auditmanager',password:pw,role:'manager',branch_id:B});api.setToken((await q('login',{username:'auditmanager',password:pw,branch:B})).token);
for(const id of [purchase.purchase.id,purchase.purchase.invoice_no]){const r=await raw('purchase.detail',{id});ok(!r.ok&&/branch/i.test(r.error),'foreign purchase detail denied');}
const sr=await raw('sale.detail',{id:sale.sale.id});ok(!sr.ok&&/branch/i.test(sr.error),'foreign sale detail denied');
const pr=await raw('preturn.create',{purchase_id:purchase.purchase.id,items:[{purchase_item_id:purchase.items[0].id,qty:1}]});ok(!pr.ok&&/branch/i.test(pr.error),'foreign purchase return denied');api.setToken(admin);
// 5: local serial costs, exact stock values, transit values.
eq([(await product(serial.id,A)).cost_price,(await product(serial.id,B)).cost_price],[100,300],'serial branch unit costs reflect their own lots');
let report=await q('branch.report');eq([report.branches.find(x=>x.id===A).stock_value,report.branches.find(x=>x.id===B).stock_value],[1550,350],'branch values use the exact local serial costs');
await q('repair.cancel',{id:job.id,reason:'Done',refund_advance:false});const transfer=await q('branch.transfer.send',{to:A,items:[{product_id:serial.id,serials:'AT-B'}]},{branch:B});eq((await q('branch.report')).transit.value,300,'transit keeps exact serial cost');await q('branch.transfer.receive',{id:transfer.id},{branch:A});
eq((await product(serial.id,A)).inventory_cost,400,'receiving retains both serial costs');
// Count scope is checked on the server as well as in the browser.
const count=await q('stockcount.start',{}, {branch:A});eq(count.branch_id,A,'count binds to its starting branch');
const wrongCount=await raw('stockcount.apply',{branch_id:A,lines:[{product_id:part.id,expected:1,counted:2}]},{branch:B});ok(!wrongCount.ok&&/branch/i.test(wrongCount.error),'count cannot apply in another branch');
// 6: parcel return chooses only serials not returned earlier.
const three=await q('product.save',{name:'Three serials',sale_price:200,has_warranty:true,warranty_type:'serial',warranty_days:365});await q('purchase.create',{supplier_id:supplier.id,items:[{product_id:three.id,qty:3,cost:100,serials:'RET1,RET2,RET3'}],payments:[]},{branch:A});
const order=await q('order.save',{source:'Facebook',customer:{name:'Online audit',phone:'01733334444',address:'Test road'},items:[{product_id:three.id,qty:3,price:200}]});
const confirmed=await q('order.confirm',{id:order.id,serials:{[three.id]:'RET1,RET2,RET3'}},{branch:A});const det=await q('sale.detail',{id:confirmed.sale_id});
await q('sreturn.create',{sale_id:det.sale.id,items:[{sale_item_id:det.items[0].id,qty:1,serials:['RET1']}],refund:{mode:'adjust'}},{branch:A});eq((await q('order.return',{id:order.id},{branch:A})).status,'returned','parcel return after partial serial return succeeds');eq((await product(three.id,A)).stock,3,'all three returned exactly once');
// 7: decimal half cents, negative ties and SQL summary parity.
await q('master.save',{kind:'unit',name:'met',label:'Meter',decimal:true});const cable=await q('product.save',{name:'Audit decimal cable',unit:'met',sale_price:2.01});await q('purchase.create',{supplier_id:supplier.id,items:[{product_id:cable.id,qty:10,cost:1.255}],payments:[]},{branch:A});
const rounded=await q('sale.create',{customer_id:customer.id,items:[{product_id:cable.id,qty:0.5,price:2.01}],payments:[]},{branch:A});eq(rounded.sale.total,1.01,'half cent rounds consistently to 1.01');
const cs=await q('customer.statement',{customer_id:customer.id}),cl=(await q('customers.list')).find(x=>x.id===customer.id);eq(cl.balance,cs.closing,'SQL and engine balances agree');
// 8: courier retries, concurrent attempts and persisted responses.
await q('settings.save',{values:{courier_steadfast_key:'fixture',courier_steadfast_secret:'fixture'}});
const makeOrder=async()=>{const o=await q('order.save',{source:'Facebook',customer:{name:'Courier audit',phone:'01733334444',address:'Test road'},items:[{product_id:part.id,qty:1,price:100}]});return q('order.confirm',{id:o.id},{branch:A});};
const lost=await makeOrder(),id=crypto.randomUUID();mode='lost';const n0=sent;
let r=await raw('courier.call',{op:'book',courier:'steadfast',id:lost.id},{request_id:id,branch:A});ok(!r.ok&&r.uncertain,'lost courier response is explicitly uncertain');mode='ok';r=await raw('courier.call',{op:'book',courier:'steadfast',id:lost.id},{request_id:id,branch:A});ok(!r.ok&&r.uncertain,'same ID cannot resend an unresolved booking');
await raw('courier.call',{op:'book',courier:'steadfast',id:lost.id},{branch:A});eq(sent,n0+1,'new ID cannot resend either');ok((await q('orders.list')).orders.find(x=>x.id===lost.id).booking_pending,'pending status survives reload');
ok(!(await raw('courier.reset',{id:lost.id,password:pw,reason:'Portal confirmed absent',confirm:'wrong'})).ok,'reset requires explicit confirmation');
await q('courier.reset',{id:lost.id,password:pw,reason:'Portal confirms no booking exists',confirm:'NOT BOOKED'});const booked=await q('courier.call',{op:'book',courier:'steadfast',id:lost.id},{branch:A});eq(booked.status,'shipped','explicit admin reset permits a new attempt');
const concurrent=await makeOrder(),n1=sent;const concurrentId=crypto.randomUUID();const pair=await Promise.all([raw('courier.call',{op:'book',courier:'steadfast',id:concurrent.id},{branch:A,request_id:concurrentId}),raw('courier.call',{op:'book',courier:'steadfast',id:concurrent.id},{branch:A,request_id:concurrentId})]);ok(pair.some(x=>x.ok),'one concurrent booking succeeds');eq(sent,n1+1,'concurrent booking sends only one POST');
const replay=await raw('courier.call',{op:'book',courier:'steadfast',id:concurrent.id},{branch:A,request_id:concurrentId});ok(replay.ok,'completed booking can be replayed after a lost client reply');eq(sent,n1+1,'completed replay does not send again');
// A stored courier response survives a database failure while applying it.
const deferred=await makeOrder(),n2=sent;failFinishRead=true;const deferredId=crypto.randomUUID();
const failedFinish=await raw('courier.call',{op:'book',courier:'steadfast',id:deferred.id},{branch:A,request_id:deferredId});ok(!failedFinish.ok&&failedFinish.uncertain,'finish failure preserves uncertainty');
const retriedFinish=await raw('courier.call',{op:'book',courier:'steadfast',id:deferred.id},{branch:A,request_id:deferredId});ok(retriedFinish.ok,'stored response is applied on retry');eq(sent,n2+1,'retry applies saved response without another POST');
ok(!(await raw('courier.record',{id:lost.id,__response:{code:200,text:'{}'}})).ok,'browser cannot forge stored courier responses');
await db.close();console.log(`November 20 audit: ${checks} checks passed`);
