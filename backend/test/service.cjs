// Service (non-inventory) products and duplicate product names.
const fs = require('fs');
const path = require('path');
const harness = fs.readFileSync(path.join(__dirname, 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0];
const scenario = `
sandbox.setupDatabase();
const assert = require('node:assert/strict');
const token = call('login',{username:'admin',password:'admin123'}).data.token;
const A = (action,payload={}) => {const r=call(action,payload,token);assert.equal(r.ok,true,r.error);return r.data;};
let checks=0;
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
const denied=(action,payload,pattern)=>{const r=call(action,payload,token);assert.equal(r.ok,false,'expected failure for '+action);assert.match(r.error,pattern);checks++;};
const cash=A('accounts.list').find(a=>a.type==='cash');
const before=A('accounts.list').find(a=>a.id===cash.id).balance;

// Duplicate names (case / spacing insensitive)
const router=A('product.save',{name:'Networking Router TP-Link Archer C6',unit:'pcs',cost_price:2000,sale_price:2500});
denied('product.save',{name:'  networking router  tp-link archer c6 '},/already exists/i);
equal(A('product.save',{...router,sale_price:2600}).sale_price,2500); // the product form never changes prices
equal(A('price.update',{items:[{id:router.id,sale_price:2600,wholesale_price:2450}]}).updated,1);
equal([A('products.list').find(p=>p.id===router.id).sale_price,A('products.list').find(p=>p.id===router.id).wholesale_price],[2600,2450]);
denied('price.update',{items:[{id:router.id,sale_price:0}]},/more than 0/i);
// Purchases need a cost, and a retail price when the product has none yet; they can update selling prices
const sw=A('product.save',{name:'Switch 8 Port',unit:'pcs'});
denied('purchase.create',{items:[{product_id:sw.id,qty:1,cost:0,sale_price:900}],payments:[]},/unit cost/i);
denied('purchase.create',{items:[{product_id:sw.id,qty:1,cost:700}],payments:[]},/retail price/i);
A('purchase.create',{items:[{product_id:sw.id,qty:2,cost:700,sale_price:950,wholesale_price:850}],payments:[{account_id:cash.id,amount:1400}]});
const swNow=A('products.list').find(p=>p.id===sw.id);
equal([swNow.stock,swNow.cost_price,swNow.sale_price,swNow.wholesale_price],[2,700,950,850]);

// Service item: no cost, no stock, no purchase
const win=A('product.save',{name:'Windows Installation',service:true,unit:'meter',cost_price:500,sale_price:800,low_stock:3,has_warranty:true,warranty_type:'serial',warranty_days:7});
equal([win.service,win.unit,win.cost_price,win.stock,win.low_stock,win.warranty_type],[true,'pcs',0,0,0,'invoice']);
denied('purchase.create',{items:[{product_id:win.id,qty:1,cost:100}],payments:[]},/service/i);
denied('stock.adjust',{product_id:win.id,new_stock:5},/service/i);

const cashBeforeSale=A('accounts.list').find(a=>a.id===cash.id).balance;
const sale=A('sale.create',{items:[{product_id:win.id,qty:2,price:800}],payments:[{account_id:cash.id,amount:1600}]});
equal([sale.sale.total,sale.sale.cost,sale.sale.profit],[1600,0,1600]);
equal(A('products.list').find(p=>p.id===win.id).stock,0);
equal(A('accounts.list').find(a=>a.id===cash.id).balance,cashBeforeSale+1600);

const ret=A('sreturn.create',{sale_id:sale.sale.id,items:[{sale_item_id:sale.items[0].id,qty:1}],refund:{mode:'cash',account_id:cash.id,amount:800}});
equal(A('products.list').find(p=>p.id===win.id).stock,0);
A('reverse',{type:'sreturn',id:ret.return.id,reason:'test',password:'admin123'});
A('reverse',{type:'sale',id:sale.sale.id,reason:'test',password:'admin123'});
equal(A('products.list').find(p=>p.id===win.id).stock,0);
equal(A('dashboard').low_stock.some(x=>x.id===win.id),false);

// A stocked product cannot silently become a service
const cable=A('product.save',{name:'Patch Cable',unit:'pcs',cost_price:50,sale_price:100});
A('purchase.create',{items:[{product_id:cable.id,qty:3,cost:50,sale_price:100}],payments:[{account_id:cash.id,amount:150}]});
denied('product.save',{...A('products.list').find(p=>p.id===cable.id),service:true},/in stock/i);
// Existing products without the new column stay inventory products
equal(!!A('products.list').find(p=>p.id===router.id).service,false);
// Selling units
const units=A('bootstrap').units;
equal(units.map(u=>u.name).sort(),['feet','meter','pcs']);
const box=A('master.save',{kind:'unit',name:' Box ',label:'Box',decimal:false});
equal([box.name,box.label,box.decimal],['box','Box',false]);
denied('master.save',{kind:'unit',name:'BOX'},/already exists/i);
denied('master.save',{kind:'unit',name:'bad unit name too long'},/12 letters/i);
const ram=A('product.save',{name:'RAM Box Pack',unit:'box',cost_price:10,sale_price:20});
equal(ram.unit,'box');
denied('purchase.create',{items:[{product_id:ram.id,qty:1.5,cost:10}],payments:[]},/whole number/i);
denied('product.save',{name:'Odd unit thing',unit:'crate'},/unknown selling unit/i);
denied('master.delete',{kind:'unit',id:box.id},/in use/i);
equal(A('master.save',{kind:'unit',id:box.id,name:'changed',label:'Carton Box',decimal:false}).name,'box'); // code is fixed
const kg=A('master.save',{kind:'unit',name:'kg',label:'Kilogram',decimal:true});
const rice=A('product.save',{name:'Thermal Paste Tub',unit:'kg',cost_price:100,sale_price:150});
A('purchase.create',{items:[{product_id:rice.id,qty:1.25,cost:100,sale_price:150}],payments:[{account_id:cash.id,amount:125}]});
denied('product.save',{name:'Serial kg',unit:'kg',has_warranty:true,warranty_type:'serial',warranty_days:30},/whole numbers/i);
denied('master.delete',{kind:'unit',id:units.find(u=>u.name==='pcs').id},/in use/i);
A('master.delete',{kind:'unit',id:A('master.save',{kind:'unit',name:'set',label:'Set'}).id});
// Bulk import
const imp=A('master.import',{kind:'category',rows:[{group:'Printer',name:'Laser'},{group:'printer',name:'Inkjet'},{group:'Printer',name:'laser'},{group:'',name:'X'}]});
equal([imp.added,imp.skipped.map(x=>x.row)],[2,[4,5]]);
equal(A('bootstrap').categories.filter(c=>!c.parent_id&&c.name==='Printer').length,1);
equal(A('master.import',{kind:'unit',rows:[{name:'Roll',label:'Roll',decimal:'Yes'},{name:'pcs',label:'Pieces'}]}).added,1);
equal(A('bootstrap').units.find(u=>u.name==='roll').decimal,true);
equal(A('master.import',{kind:'warranty_period',rows:[{days:730,label:'2 years'},{days:'abc'}]}).added,1);
equal(A('master.import',{kind:'brand',rows:[{name:'Asus'},{name:'ASUS'},{name:'Dell'}]}).added,2);
// Delete customers / suppliers only at zero balance
const zc=A('customer.save',{name:'Zero Khata',phones:['01700000001']});
const dc=A('customer.save',{name:'Due Khata',phones:['01700000002'],opening_balance:500});
denied('customer.delete',{id:dc.id},/balance/i);
equal(A('customer.statements',{ids:[zc.id,dc.id]}).map(s=>[s.party,s.closing]),[['Zero Khata',0],['Due Khata',500]]);
A('customer.delete',{id:zc.id});
equal(A('customers.list').some(c=>c.id===zc.id),false);
const zs=A('supplier.save',{name:'Zero Supplier'});
A('supplier.delete',{id:zs.id});
equal(A('suppliers.list').some(c=>c.id===zs.id),false);
// Combined customer + supplier
const cc=A('customer.save',{name:'CASH SALE / PURCHASE',phones:['01800000000'],addresses:['Bera'],combined:true});
const twin=A('suppliers.list').find(x=>x.id===cc.link_id);
equal([twin.name,twin.link_id,twin.combined,twin.phones],['CASH SALE / PURCHASE',cc.id,true,'01800000000']);
A('customer.save',{...cc,name:'CASH PARTY',phones:['01800000000'],addresses:['Bera'],combined:true});
equal(A('suppliers.list').find(x=>x.id===cc.link_id).name,'CASH PARTY');
const sp=A('supplier.save',{name:'Dealer X',combined:true});
equal(A('customers.list').find(x=>x.id===sp.link_id).name,'Dealer X');
A('supplier.save',{...sp,combined:false});
equal([!!A('customers.list').find(x=>x.name==='Dealer X').link_id,A('suppliers.list').find(x=>x.id===sp.id).combined],[false,false]);
console.log('Service item regression: '+checks+' checks passed');
`;
new Function('require','__dirname',harness+scenario)(require,__dirname);
