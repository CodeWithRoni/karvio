// Isolated regressions for interrupted maintenance, data visibility and complete reports.
const fs = require('node:fs');
const path = require('node:path');
const harness = fs.readFileSync(path.join(__dirname, 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0];
const scenario = String.raw`
sandbox.setupDatabase();
const assert = require('node:assert/strict');
let checks = 0;
const same = (a,b,message) => { assert.deepEqual(a === undefined ? undefined : JSON.parse(JSON.stringify(a)),b,message); checks++; };
const token = call('login',{username:'admin',password:'admin123'}).data.token;
const Q = (a,p={},t=token) => { const r=call(a,p,t); assert.equal(r.ok,true,a+': '+r.error); return r.data; };
const cash=Q('bootstrap').accounts[0];
book.copy=()=>({getName:()=> 'Isolated safety copy'});
const service=Q('product.save',{name:'Audit service',service:true,sale_price:100});
const backup=Q('database.export');
const later=Q('product.save',{name:'Product made after backup',sale_price:100});
const raw=(action,payload,request_id)=>{sandbox._mem={};return JSON.parse(sandbox.doPost({postData:{contents:JSON.stringify({action,payload,token,request_id})}}).getContent());};
const keyed=raw('sale.create',{items:[{product_id:service.id,qty:1,price:100}],payments:[{account_id:cash.id,amount:100}]},'maintenance-keep-receipt-01');
assert.ok(keyed.ok); checks++;
const dump=()=>JSON.stringify(Object.keys(sandbox.SCHEMA).concat([sandbox.RECEIPT_SHEET]).map(name=>{
 const sh=book.getSheetByName(name), width=sandbox.SCHEMA[name]?sandbox.cols_(name).length:3;
 return [name,sh&&sh.getLastRow()?sh.getRange(1,1,sh.getLastRow(),width).getValues():[]];
}));
const before=dump(), real=Range.prototype.setValues;
const restorePayload={password:'admin123',confirm:'RESTORE',backup_text:JSON.stringify(backup)};

// A failed valid restore rolls back every business table AND old request receipts.
let once=true;
Range.prototype.setValues=function(v){if(once&&this.sh.name==='Products'&&this.r>1&&v.some(r=>r[0])){once=false;throw Error('Interrupted restore');}return real.call(this,v);};
same(call('database.restore',restorePayload,token).ok,false,'restore write error reported');
Range.prototype.setValues=real;
same(dump(),before,'all data and retry receipts restored after failure');
same(Q('bootstrap').products.length,2,'no partial restored database exposed');

// Recovery also removes rows appended by a larger backup before its write failed.
const bigger=JSON.parse(JSON.stringify(backup));
for(let i=0;i<3;i++){const row=bigger.tables.Products.rows[0].slice();row[0]='extra-restored-'+i;row[3]='Extra restored '+i;bigger.tables.Products.rows.push(row);}
bigger.checksum=sandbox.backupDigest_(bigger.tables);
once=true;
Range.prototype.setValues=function(v){const r=real.call(this,v);if(once&&this.sh.name==='Products'&&this.r>1&&v.some(row=>row[0])){once=false;throw Error('Outage after append');}return r;};
same(call('database.restore',{...restorePayload,backup_text:JSON.stringify(bigger)},token).ok,false,'larger partial restore rejected');
Range.prototype.setValues=real;
same(dump(),before,'rollback removes appended restored rows as well as restoring old rows');

// If rollback also cannot write, reads fail closed. A fresh execution recovers it.
Range.prototype.setValues=function(v){if(this.sh.name==='Products')throw Error('Persistent storage outage');return real.call(this,v);};
same(call('database.restore',restorePayload,token).uncertain,true,'unfinished rollback marked uncertain');
same(call('bootstrap',{},token).ok,false,'pending recovery blocks reads');
Range.prototype.setValues=real;
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','Code.gs'),'utf8'),sandbox);
same(Q('bootstrap').products.length,2,'next execution recovers before authentication/read');
same(dump(),before,'restart recovery preserves exact prior database');

// Reset has the same interruption protection, including re-created default accounts.
once=true;
Range.prototype.setValues=function(v){if(once&&this.sh.name==='Accounts'&&this.r>1&&v.some(r=>r[0])){once=false;throw Error('Interrupted reset');}return real.call(this,v);};
same(call('database.reset',{password:'admin123',confirm:'RESET'},token).ok,false,'reset interruption reported');
Range.prototype.setValues=real;
same(dump(),before,'reset interruption restores all prior records');

// A lost COMMITTED acknowledgement must preserve the complete new database.
once=true;
Range.prototype.setValues=function(v){const r=real.call(this,v);if(once&&this.sh.name===sandbox.JOURNAL_SHEET&&this.r===1&&String(v[0][0]).includes('COMMITTED')){once=false;throw Error('Lost commit acknowledgement');}return r;};
same(call('database.restore',restorePayload,token).ok,true,'durable commit acknowledgement loss is successful');
Range.prototype.setValues=real;
same(Q('bootstrap').products.map(p=>p.id),[service.id],'committed restored database kept');
same(book.getSheetByName(sandbox.JOURNAL_SHEET).getLastRow(),0,'finished maintenance snapshot discarded');

// Existing linked suppliers need both directory permissions BEFORE any row changes.
const party=Q('customer.save',{name:'Original combined party',combined:true});
Q('rolePerms.save',{sales:['suppliers']});
Q('user.save',{name:'Restricted supplier clerk',username:'clerk',password:'secret123',role:'sales'});
const clerk=Q('login',{username:'clerk',password:'secret123'}).token;
same(call('supplier.save',{id:party.link_id,name:'Unauthorized edit'},clerk).ok,false,'linked edit denied');
same(Q('customers.list').find(p=>p.id===party.id).name,'Original combined party','customer unchanged');
same(Q('suppliers.list').find(p=>p.id===party.link_id).name,'Original combined party','supplier unchanged');

// The reminder must agree with the current invoice due after paying opening debt first.
const customer=Q('customer.save',{name:'Opening debt customer',opening_balance:100});
const sale=Q('sale.create',{customer_id:customer.id,items:[{product_id:service.id,qty:1,price:100}],next_payment_date:sandbox.today_(),send_sms:false});
Q('customer.payment',{customer_id:customer.id,account_id:cash.id,amount:100});
same(Q('sale.detail',{id:sale.sale.id}).sale.due_now,100,'opening debt paid before invoice');
same(Q('dashboard').reminders.find(r=>r.sale_id===sale.sale.id).remaining,100,'still-unpaid invoice remains a reminder');
Q('customer.payment',{customer_id:customer.id,account_id:cash.id,amount:100});
same(Q('dashboard').reminders.length,0,'settled invoice has no reminder');

// A stock-price lookup must not disclose another staff member or invoice.
Q('rolePerms.save',{sales:['pos','warranty','reports']});
same(Q('product.history',{product_id:service.id},clerk).last_sales,[],'other staff invoice metadata hidden');
const own=Q('sale.create',{items:[{product_id:service.id,qty:1,price:100}],payments:[{account_id:cash.id,amount:100}]},clerk);
same(Q('product.history',{product_id:service.id},clerk).last_sales.map(s=>s.invoice_no),[own.sale.invoice_no],'own invoice still visible');

// Replacement bookkeeping remains private at every response boundary, not just the UI.
const product=Q('product.save',{name:'Audit serial product',has_warranty:true,warranty_type:'serial',warranty_days:365,sale_price:100});
Q('purchase.create',{items:[{product_id:product.id,qty:2,cost:40,serials:['AUDIT-A','AUDIT-B']}],payments:[{account_id:cash.id,amount:80}]});
const sold=Q('sale.create',{items:[{product_id:product.id,qty:1,price:100,serials:['AUDIT-A']}],payments:[{account_id:cash.id,amount:100}]});
const claim=Q('claim.create',{sale_id:sold.sale.id,sale_item_id:sold.items[0].id,serial:'AUDIT-A'});
const replaced=Q('claim.update',{id:claim.id,status:'Replaced',replacement_serial:'AUDIT-B'},clerk);
same(Object.hasOwn(JSON.parse(replaced.replacement),'cost'),false,'update result strips replacement cost');
same(JSON.parse(Q('claims.list',{},clerk)[0].replacement).cost,undefined,'claim list strips cost');
same(JSON.parse(Q('history.doc',{type:'claim',id:claim.id},clerk).detail.replacement).cost,undefined,'history claim strips cost');
same(JSON.parse(Q('reports',{type:'warranty'},clerk).rows[0].replacement).cost,undefined,'warranty report strips nested cost');
same(JSON.parse(Q('claims.list')[0].replacement).cost,40,'authorized cost and underlying bookkeeping preserved');
same(JSON.parse(Q('claim.restock',{id:claim.id,serial:'AUDIT-C'},clerk).replacement).cost,undefined,'restock response strips cost');

// Report totals include rows beyond UI list limits; list endpoints keep their existing limits.
sandbox._mem={};
sandbox.insertMany_('Expenses',Array.from({length:1001},()=>({date:sandbox.today_(),category:'Audit',amount:1,account_id:cash.id,status:'active'})));
same(Q('expenses.list').length,1001,'expense UI list includes every matching record');
same(Q('reports',{type:'expenses',group:'category'}).totals.amount,1001,'expense aggregation includes every matching row');
sandbox._mem={};
sandbox.insertMany_('SalesReturns',Array.from({length:501},()=>({date:sandbox.today_(),total:1,status:'active'})));
sandbox.insertMany_('PurchaseReturns',Array.from({length:501},()=>({date:sandbox.today_(),total:1,status:'active'})));
sandbox.insertMany_('WarrantyClaims',Array.from({length:501},()=>({date:sandbox.today_(),status:'Pending'})));
same(Q('reports',{type:'sales_returns'}).totals.total,501,'sales return report not truncated');
same(Q('reports',{type:'purchase_returns'}).totals.total,501,'purchase return report not truncated');
same(Q('reports',{type:'warranty'}).rows.length,502,'warranty report includes all claims');
console.log('Audit backend fixes: '+checks+' checks passed');
`;
eval(harness + scenario);

// Native offline restore accepts backups made before Repairs was introduced.
const assert = require('node:assert/strict');
const os = require('node:os');
const { OfflineRuntime } = require('../../frontend/desktop/offline-runtime.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'karvio-audit-legacy-'));
try {
  const options = { dataDir: dir, codePath: path.join(__dirname, '..', 'Code.gs') };
  const app = new OfflineRuntime(options);
  const token = app.execute({ action: 'login', payload: { username: 'admin', password: 'admin123' } }).data.token;
  app.execute({ action: 'product.save', payload: { name: 'Preserved legacy product' }, token });
  const file = path.join(dir, 'pre-repairs.json');
  app.exportBackup(token, file);
  const legacy = JSON.parse(fs.readFileSync(file));
  ['Repairs', 'Units', 'InvoiceLinks'].forEach(name => delete legacy.sheets[name]);
  fs.writeFileSync(file, JSON.stringify(legacy));
  app.restoreBackup(token, file);
  const again = new OfflineRuntime(options);
  const login = again.execute({ action: 'login', payload: { username: 'admin', password: 'admin123' } });
  const boot = again.execute({ action: 'bootstrap', token: login.data.token });
  assert.equal(boot.data.products[0].name, 'Preserved legacy product');
  assert.ok(again.state.sheets.Repairs);
  assert.equal(again.state.sheets.Repairs.rows.length, 1);
  console.log('Audit legacy offline restore: 3 checks passed');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
