// Run the real Apps Script code against the existing in-memory spreadsheet harness.
const fs = require('fs');
const path = require('path');
const harness = fs.readFileSync(path.join(__dirname, 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0];
const scenario = `
sandbox.setupDatabase();
const token = call('login', {username:'admin', password:'admin123'}).data.token;
const A = (action, payload) => {
  const r = call(action, payload, token);
  if (!r.ok) throw new Error(action + ': ' + r.error);
  return r.data;
};
const supplier = A('supplier.save', {name:'Valuation supplier'});
const cash = A('bootstrap', {}).accounts[0];
const product = (name, extra = {}) => A('product.save', {name, unit:'meter', cost_price:50, sale_price:300, ...extra});
const buy = (pr, qty, cost, extra = {}) => A('purchase.create', {supplier_id:supplier.id, items:[{product_id:pr.id, qty, cost, ...extra}], payments:[]});
const stock = (pr) => A('products.list', {}).find(x=>x.id===pr.id);
const reverse = (pur) => A('reverse', {type:'purchase', id:pur.purchase.id, reason:'Regression check', password:'admin123'});
const assert = require('assert/strict');
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual,expected); checks++; };
const state = (pr) => { const p = stock(pr); return [p.stock,p.cost_price]; };

const cable = product('Weighted cable');
const first = buy(cable,10,100);
const snapshot = state(cable);
const supplierBalance = A('suppliers.list',{}).find(s=>s.id===supplier.id).balance;
const second = buy(cable,10,200);
equal(state(cable),[20,150]);
reverse(second);
equal(state(cable),snapshot);
equal(A('purchase.detail',{id:second.purchase.id}).purchase.status,'cancelled');
equal(A('suppliers.list',{}).find(s=>s.id===supplier.id).balance,supplierBalance);

const paidProduct = product('Paid purchase');
const cashBefore = A('accounts.list',{}).find(a=>a.id===cash.id).balance;
const paidPurchase = A('purchase.create',{supplier_id:supplier.id,items:[{product_id:paidProduct.id,qty:5,cost:90}],payments:[{account_id:cash.id,amount:450}]});
reverse(paidPurchase);
equal(A('accounts.list',{}).find(a=>a.id===cash.id).balance,cashBefore);
equal(state(paidProduct),[0,50]);

const empty = product('Empty stock');
const emptyBuy = buy(empty,5,120);
reverse(emptyBuy);
equal(state(empty),[0,50]);

const duplicate = product('Repeated product lines');
buy(duplicate,10,100);
const multi = A('purchase.create',{supplier_id:supplier.id,items:[{product_id:duplicate.id,qty:2,cost:160},{product_id:duplicate.id,qty:3,cost:240}],payments:[]});
reverse(multi);
equal(state(duplicate),[10,100]);

const later = product('Later purchase retained');
buy(later,10,100);
const middle = buy(later,10,200);
buy(later,10,300);
reverse(middle);
equal(state(later),[20,200]);

const legacy = product('Legacy purchase');
buy(legacy,10,100);
const legacyBuy = buy(legacy,10,200);
vm.runInContext('_mem = {}',sandbox);
sandbox.all_('PurchaseItems').filter(i=>i.purchase_id===legacyBuy.purchase.id).forEach(i=>sandbox.update_('PurchaseItems',i.id,{valuation:''}));
reverse(legacyBuy);
equal(state(legacy),[10,100]);

const sold = product('Dependent sale');
buy(sold,10,100);
const soldBuy = buy(sold,10,200);
const sale = A('sale.create',{items:[{product_id:sold.id,qty:1,price:300}],payments:[{account_id:cash.id,amount:300}]});
const beforeFailure = state(sold);
const rejected = call('reverse',{type:'purchase',id:soldBuy.purchase.id,reason:'Blocked dependency',password:'admin123'},token);
equal(rejected.ok,false);
equal(state(sold),beforeFailure);
equal(A('purchase.detail',{id:soldBuy.purchase.id}).purchase.status,'active');
A('reverse',{type:'sale',id:sale.sale.id,reason:'Undo dependency',password:'admin123'});
reverse(soldBuy);
equal(state(sold),[10,100]);

const serial = product('Serial product',{unit:'pcs',has_warranty:true,warranty_type:'serial',warranty_days:90});
buy(serial,1,100,{serials:['VAL-1']});
const serialBuy = buy(serial,1,200,{serials:['VAL-2']});
reverse(serialBuy);
equal(state(serial),[1,100]);

const decimal = product('Fractional cable');
buy(decimal,12.5,18.4321);
const decimalState = state(decimal);
const decimalBuy = buy(decimal,8.75,29.1234);
reverse(decimalBuy);
equal(state(decimal),decimalState);

// A pre-existing sheet gains the appended header and preserves its existing cells.
book.getSheetByName('PurchaseItems').rows[0].pop();
A('purchase.detail',{id:first.purchase.id});
equal(book.getSheetByName('PurchaseItems').rows[0][9],'valuation');
equal(book.getSheetByName('PurchaseItems').rows[1][1],first.purchase.id);
console.log('Valuation regression: ' + checks + ' checks passed');
`;
new Function('require', '__dirname', harness + scenario)(require, __dirname);
