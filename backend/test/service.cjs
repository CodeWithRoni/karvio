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
equal(A('product.save',{...router,sale_price:2600}).sale_price,2600); // editing itself is fine

// Service item: no cost, no stock, no purchase
const win=A('product.save',{name:'Windows Installation',service:true,unit:'meter',cost_price:500,sale_price:800,low_stock:3,has_warranty:true,warranty_type:'serial',warranty_days:7});
equal([win.service,win.unit,win.cost_price,win.stock,win.low_stock,win.warranty_type],[true,'pcs',0,0,0,'invoice']);
denied('purchase.create',{items:[{product_id:win.id,qty:1,cost:100}],payments:[]},/service/i);
denied('stock.adjust',{product_id:win.id,new_stock:5},/service/i);

const sale=A('sale.create',{items:[{product_id:win.id,qty:2,price:800}],payments:[{account_id:cash.id,amount:1600}]});
equal([sale.sale.total,sale.sale.cost,sale.sale.profit],[1600,0,1600]);
equal(A('products.list').find(p=>p.id===win.id).stock,0);
equal(A('accounts.list').find(a=>a.id===cash.id).balance,before+1600);

const ret=A('sreturn.create',{sale_id:sale.sale.id,items:[{sale_item_id:sale.items[0].id,qty:1}],refund:{mode:'cash',account_id:cash.id,amount:800}});
equal(A('products.list').find(p=>p.id===win.id).stock,0);
A('reverse',{type:'sreturn',id:ret.return.id,reason:'test',password:'admin123'});
A('reverse',{type:'sale',id:sale.sale.id,reason:'test',password:'admin123'});
equal(A('products.list').find(p=>p.id===win.id).stock,0);
equal(A('dashboard').low_stock.some(x=>x.id===win.id),false);

// A stocked product cannot silently become a service
const cable=A('product.save',{name:'Patch Cable',unit:'pcs',cost_price:50,sale_price:100});
A('purchase.create',{items:[{product_id:cable.id,qty:3,cost:50}],payments:[{account_id:cash.id,amount:150}]});
denied('product.save',{...A('products.list').find(p=>p.id===cable.id),service:true},/in stock/i);
// Existing products without the new column stay inventory products
equal(!!A('products.list').find(p=>p.id===router.id).service,false);
console.log('Service item regression: '+checks+' checks passed');
`;
new Function('require','__dirname',harness+scenario)(require,__dirname);
