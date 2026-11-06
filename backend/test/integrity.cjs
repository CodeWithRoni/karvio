// All tables, SMS and Google services are isolated in the in-memory harness.
const fs = require('fs');
const path = require('path');
const harness = fs.readFileSync(path.join(__dirname, 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0];
const scenario = `
sandbox.setupDatabase();
const assert = require('node:assert/strict');
let checks=0;
const same=(a,b,m)=>{assert.deepEqual(a===undefined?undefined:JSON.parse(JSON.stringify(a)),b,m);checks++;};
const yes=(v,m)=>{assert.ok(v,m);checks++;};
let admin=call('login',{username:'admin',password:'admin123'}).data;
const T=admin.token;
const Q=(a,p={},t=T)=>{const r=call(a,p,t);assert.equal(r.ok,true,a+': '+r.error);return r.data;};
const raw=(action,payload={},request_id,token=T)=>JSON.parse(sandbox.doPost({postData:{contents:JSON.stringify({action,payload,request_id,token})}}).getContent());
const denied=(r,m)=>{same(r.ok,false,m);return r;};
const R=Range.prototype.setValues;
const fresh=()=>{sandbox._mem={};sandbox._txn=null;};
const table=(name)=>{fresh();return sandbox.all_(name);};
const cash=Q('bootstrap').accounts[0];
same(Q('ping').apiCapabilities.idempotency,true,'ping advertises duplicate-request protocol');
same(Q('bootstrap').apiCapabilities.durableRecovery,true,'bootstrap advertises recovery');
const supplier=Q('supplier.save',{name:'Isolated Integrity Supplier'});
const p=Q('product.save',{name:'Integrity cable',barcode:'INTEGRITY-COST',unit:'pcs',sale_price:1500});
Q('purchase.create',{supplier_id:supplier.id,items:[{product_id:p.id,qty:50,cost:1000}],payments:[]});
const payload={items:[{product_id:p.id,qty:1,price:1500}],payments:[{account_id:cash.id,amount:1500}]};
const saleCount=()=>table('Sales').length;
const stock=()=>Q('products.list').find(x=>x.id===p.id).stock;
const money=()=>Q('accounts.list').find(x=>x.id===cash.id).balance;
const before={sales:saleCount(),stock:stock(),money:money()};

// Same request, including a later manual retry, produces one financial transaction.
const first=raw('sale.create',payload,'integrity-idempotent-0001');
yes(first.ok,'first keyed sale succeeds');
const replay=raw('sale.create',payload,'integrity-idempotent-0001');
same(replay.data.sale.id,first.data.sale.id,'retry returns the original invoice');
same(saleCount(),before.sales+1,'exactly one sale persisted');
same(stock(),before.stock-1,'exactly one stock deduction');
same(money(),before.money+1500,'exactly one account credit');
denied(raw('sale.create',{...payload,note:'changed'},'integrity-idempotent-0001'),'key reuse with changed payload refused');
same(saleCount(),before.sales+1,'changed payload does not create invoice');
denied(raw('sale.create',payload,'short'),'malformed request ID refused');

// Fail halfway through real sheet writes, then assert every affected table/sequence rolls back.
const snapshot=JSON.stringify({sales:table('Sales'),items:table('SaleItems'),products:table('Products'),accounts:table('AccountTxns'),events:table('ItemEvents'),settings:sandbox.settingsMap_()});
let failOnce=true;
Range.prototype.setValues=function(values){if(failOnce&&this.sh.name==='AccountTxns'&&this.r>1){failOnce=false;throw Error('Injected account write failure');}return R.call(this,values);};
const failed=raw('sale.create',payload,'integrity-failed-write-0002');
Range.prototype.setValues=R;
denied(failed,'mid-commit failure reported');
fresh();
same(JSON.stringify({sales:table('Sales'),items:table('SaleItems'),products:table('Products'),accounts:table('AccountTxns'),events:table('ItemEvents'),settings:sandbox.settingsMap_()}),snapshot,'all financial rows and invoice sequence restored');
yes(raw('sale.create',payload,'integrity-failed-write-0002').ok,'same request can safely retry after rollback');

// Emulate a process ending after some writes, with no catch/finally or memory rollback.
const crashBefore={sales:saleCount(),stock:stock(),money:money()};
fresh();sandbox._txn={rows:{},sms:[]};
const crashResult=sandbox.saleCreate_(payload,sandbox.authUser_(T));
const crashPlan={version:1,id:'crash-plan-0003',rows:Object.values(sandbox._txn.rows),result:crashResult,request:sandbox.requestInfo_({action:'sale.create',payload,request_id:'integrity-process-crash-0003'},sandbox.authUser_(T))};
sandbox._txn=null;
const apply=sandbox.applyPlan_;
sandbox.applyPlan_=function(plan,side){
 if(side==='after') {const end=plan.rows.findIndex(x=>x.table==='Products')+1;apply({...plan,rows:plan.rows.slice(0,end)},side);throw Error('Simulated terminated execution');}
 return apply(plan,side);
};
assert.throws(()=>sandbox.commitPlan_(crashPlan),/terminated/);checks++;
sandbox.applyPlan_=apply;fresh();
same(JSON.parse(book.sheets[sandbox.JOURNAL_SHEET].rows[0][0]).state,'PREPARED','durable unfinished journal survives process memory reset');
yes(table('Sales').length===crashBefore.sales+1,'fault really left an invoice before recovery');
// Interrupt the first recovery too; the next request must continue safely.
let stopRecovery=true;
Range.prototype.setValues=function(values){if(stopRecovery&&this.sh.name==='Products'&&this.r>1){stopRecovery=false;throw Error('Recovery interrupted');}return R.call(this,values);};
const interrupted=raw('bootstrap');
Range.prototype.setValues=R;
denied(interrupted,'read does not expose partial state while recovery cannot finish');
same([interrupted.retryable,interrupted.uncertain],[true,true],'unfinished recovery asks client to preserve its request ID');
Q('bootstrap');
same([saleCount(),stock(),money()],[crashBefore.sales,crashBefore.stock,crashBefore.money],'fresh request recovers all prior values');
yes(raw('sale.create',payload,'integrity-process-crash-0003').ok,'rolled-back interrupted request can be resubmitted once');

// A lost acknowledgement of the COMMITTED marker must not undo a committed invoice.
let loseCommitAck=true;
Range.prototype.setValues=function(values){
 const result=R.call(this,values);
 if(loseCommitAck&&this.sh.name===sandbox.JOURNAL_SHEET&&this.r===1&&JSON.parse(values[0][0]).state==='COMMITTED'){loseCommitAck=false;throw Error('Commit acknowledgement lost');}
 return result;
};
const ackBefore=saleCount();
const ack=raw('sale.create',payload,'integrity-commit-ack-0004');
Range.prototype.setValues=R;
yes(ack.ok,'committed result returned after lost marker acknowledgement');
same(raw('sale.create',payload,'integrity-commit-ack-0004').data.sale.id,ack.data.sale.id,'ack retry resolves original result');
same(saleCount(),ackBefore+1,'lost ack produces only one invoice');

// Receipt storage interruption leaves COMMITTED journal authoritative until recovery archives it.
let failReceipt=true;
Range.prototype.setValues=function(values){if(failReceipt&&this.sh.name===sandbox.RECEIPT_SHEET){failReceipt=false;throw Error('Receipt write interrupted');}return R.call(this,values);};
const receiptBefore=saleCount();
const saved=raw('sale.create',payload,'integrity-receipt-crash-0005');
Range.prototype.setValues=R;
yes(saved.ok,'financial success retained if receipt archival fails');
same(JSON.parse(book.sheets[sandbox.JOURNAL_SHEET].rows[0][0]).state,'COMMITTED','committed source of truth retained');
fresh();
same(raw('sale.create',payload,'integrity-receipt-crash-0005').data.sale.id,saved.data.sale.id,'next execution archives and replays committed result');
same(saleCount(),receiptBefore+1,'receipt failure cannot duplicate invoice');

// Journal/receipt chunks stay below Sheets cell limits even for a large valid text field.
const maxWrite=Range.prototype.setValues;
let chunks=0;
Range.prototype.setValues=function(values){values.flat().forEach(v=>{if(typeof v==='string')assert.ok(v.length<=50000);});if(this.sh.name===sandbox.JOURNAL_SHEET&&this.r===2)chunks=values.length;return maxWrite.call(this,values);};
yes(raw('customer.save',{name:'Large isolated text',note:'a'.repeat(44000)},'integrity-large-journal-0006').ok,'large response saved safely');
Range.prototype.setValues=maxWrite;
yes(chunks>1,'large journal split into multiple safe cells');

// A gateway call is made only after business rows and a successful replay receipt exist.
const customer=Q('customer.save',{name:'SMS isolated',phones:'01700000000'});
Q('settings.save',{values:{sms_enabled:'true',sms_url:'https://mock.invalid/send?to={number}&message={message}',sms_headers:'Authorization: Bearer SYNTHETIC_HEADER_SECRET',sms_api_key:'SYNTHETIC_KEY'}});
const fetchOriginal=sandbox.UrlFetchApp.fetch;
let observedCommitted=false;
sandbox.UrlFetchApp.fetch=(url,opt)=>{observedCommitted=book.sheets.Sales.rows.some(r=>r[0]&&r.includes('SMS isolated'))&&!!sandbox.findReceipt_(sandbox.requestInfo_({action:'sale.create',payload:{...payload,customer_id:customer.id},request_id:'integrity-sms-commit-0007'},sandbox.authUser_(T)).key);return fetchOriginal(url,opt);};
const sms=raw('sale.create',{...payload,customer_id:customer.id},'integrity-sms-commit-0007');
sandbox.UrlFetchApp.fetch=fetchOriginal;
yes(sms.ok&&sms.data.sms.ok&&observedCommitted,'SMS observed only after successful durable money commit');
const sent=fetchLog.length;
same(raw('sale.create',{...payload,customer_id:customer.id},'integrity-sms-commit-0007').data.sale.id,sms.data.sale.id,'SMS sale retries replay invoice');
same(fetchLog.length,sent,'money retry never sends SMS again');

// An accepted SMS remains useful even if saving its log fails; unknown delivery is not a refusal.
const linksBefore=table('InvoiceLinks').length;
let loseSmsLog=true;
Range.prototype.setValues=function(values){if(loseSmsLog&&this.sh.name==='SmsLog'){loseSmsLog=false;throw Error('SMS log failure');}return R.call(this,values);};
const logFailure=raw('sale.create',{...payload,customer_id:customer.id},'integrity-sms-log-failure-0008');
Range.prototype.setValues=R;
yes(logFailure.ok,'SMS log failure cannot fail an already saved sale');
same(logFailure.data.sms.status,'unknown','log failure clearly reports unconfirmed delivery');
same(table('InvoiceLinks').length,linksBefore+1,'accepted SMS link is retained despite unknown log status');
const sentAfterLogFailure=fetchLog.length;
same(raw('sale.create',{...payload,customer_id:customer.id},'integrity-sms-log-failure-0008').data.sale.id,logFailure.data.sale.id,'log failure receipt replays original sale');
same(fetchLog.length,sentAfterLogFailure,'log failure replay never resends a potentially accepted SMS');
const linksBeforeTimeout=table('InvoiceLinks').length;
sandbox.UrlFetchApp.fetch=()=>{throw Error('Synthetic gateway timeout');};
const timeout=raw('sale.create',{...payload,customer_id:customer.id},'integrity-sms-timeout-0009');
sandbox.UrlFetchApp.fetch=fetchOriginal;
same(timeout.data.sms.status,'unknown','gateway timeout is treated as ambiguous delivery');
same(table('InvoiceLinks').length,linksBeforeTimeout+1,'unknown transport delivery retains its invoice link');

// Secrets and every history branch respect the caller's permissions.
const staff=Q('user.save',{name:'Isolated staff',username:'integrity-staff',password:'staff123',role:'sales'});
let st=Q('login',{username:'integrity-staff',password:'staff123'}).token;
const staffBoot=Q('bootstrap',{},st);
same(staffBoot.settings.sms_headers,undefined,'literal header credentials omitted');
same(staffBoot.settings.sms_api_key,undefined,'API secret omitted');
const hist=Q('history',{q:p.barcode},st);
yes(hist.timeline.filter(e=>e.event==='purchase').every(e=>!('amount' in e)),'purchase timeline costs omitted');
yes(hist.timeline.every(e=>e.ref_type!=='sale'),'other users sale events filtered');
yes(Q('history',{q:p.barcode}).timeline.some(e=>e.event==='purchase'&&e.amount===50000),'admin retains purchase values');
const purchase=Q('purchases.list')[0];
denied(raw('history',{q:purchase.invoice_no},undefined,st),'purchase invoice total inaccessible without purchase permission');
const serialProduct=Q('product.save',{name:'Serial privacy',barcode:'INTEGRITY-SERIAL',sale_price:2000,has_warranty:true,warranty_type:'serial',warranty_days:90});
Q('purchase.create',{supplier_id:supplier.id,items:[{product_id:serialProduct.id,qty:1,cost:1000,serials:['PRIVATE-SERIAL']}],payments:[]});
Q('sale.create',{items:[{product_id:serialProduct.id,qty:1,price:2000,serials:['PRIVATE-SERIAL']}],payments:[{account_id:cash.id,amount:2000}]});
const serialHist=Q('history',{q:'PRIVATE-SERIAL'},st);
same([serialHist.summary.cost,serialHist.summary.sale_price,serialHist.summary.sale_invoice],[null,null,''],'serial summary hides cost and foreign invoice');
yes(serialHist.timeline.every(e=>e.ref_type!=='sale'&&e.amount===undefined),'serial timeline no hidden cost/foreign sale');

// All permissions are checked before a combined party is inserted/edited.
const customerCount=Q('customers.list').length;
denied(raw('customer.save',{name:'Must not exist',combined:true},undefined,st),'combined POS creation refused');
same(Q('customers.list').length,customerCount,'rejected combined customer leaves no insert');
yes(raw('customer.save',{name:'Plain POS Customer',combined:false},undefined,st).ok,'unlinked POS customer is still allowed');
Q('rolePerms.save',{sales:['pos','customers'],manager:[]});
const linked=Q('customer.save',{name:'Protected linked',combined:true});
denied(raw('customer.save',{id:linked.id,name:'Must not edit linked',combined:false},undefined,st),'unlink requires supplier permission before edit');
same(Q('customers.list').find(x=>x.id===linked.id).name,'Protected linked','forbidden edit leaves customer unchanged');

// Administrator resets and self-service changes revoke every old token immediately.
Q('user.save',{...staff,password:'staff456'});
same(raw('bootstrap',{},undefined,st).auth,true,'reset invalidates existing staff token');
st=Q('login',{username:'integrity-staff',password:'staff456'}).token;
Q('password.change',{old_password:'staff456',new_password:'staff789'},st);
same(raw('bootstrap',{},undefined,st).auth,true,'self change invalidates prior session');
yes(Q('login',{username:'integrity-staff',password:'staff789'}).token,'new password signs in');
cacheStore.set('tok_legacy-session',JSON.stringify({id:staff.id}));
same(raw('bootstrap',{},undefined,'legacy-session').auth,true,'legacy tokens force sign-in after upgrade');
console.log('Integrity, recovery, idempotency and access: '+checks+' checks passed');
`;
eval(harness+'\n{\n'+scenario+'\n}');
