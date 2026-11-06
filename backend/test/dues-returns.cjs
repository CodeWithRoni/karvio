// Regression checks for: promised payment dates + collection reminders, sales-return costing,
// dashboard stock summary / best sellers, and the POS price history.
// Runs the real Code.gs on the in-memory spreadsheet harness from simulate.js.
const fs = require('fs');
const path = require('path');
const harness = fs.readFileSync(path.join(__dirname, 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0];
const scenario = `
sandbox.setupDatabase();
const assert = require('assert/strict');
let checks = 0;
const same = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };
const truthy = (v, msg) => { assert.ok(v, msg); checks++; };
const token = call('login', {username:'admin', password:'admin123'}).data.token;
const Q = (a, p) => { const r = call(a, p, token); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
const QF = (a, p) => { const r = call(a, p, token); assert.equal(r.ok, false, a + ' should fail'); checks++; return r.error; };
const cash = Q('bootstrap', {}).accounts[0];
const sup = Q('supplier.save', {name:'Supplier'});
const today = sandbox.today_();
const prod = (id) => Q('products.list', {}).find((x) => x.id === id);
const round4 = (n) => Math.round(n * 10000) / 10000;

/* ---------- sales return keeps the purchase cost ---------- */
const mouse = Q('product.save', {name:'Mouse', unit:'pcs'});
Q('purchase.create', {supplier_id:sup.id, items:[{product_id:mouse.id, qty:5, cost:400, sale_price:550}], payments:[]});
const s1 = Q('sale.create', {items:[{product_id:mouse.id, qty:5, price:550}], payments:[{account_id:cash.id, amount:2750}]});
same(s1.items[0].cost, 2000, 'sold at the 400 average');
Q('purchase.create', {supplier_id:sup.id, items:[{product_id:mouse.id, qty:5, cost:500}], payments:[]});
same([prod(mouse.id).stock, prod(mouse.id).cost_price], [5, 500]);
const r1 = Q('sreturn.create', {sale_id:s1.sale.id, items:[{sale_item_id:s1.items[0].id, qty:2}], refund:{account_id:cash.id}});
// 5 @ 500 + 2 returned @ their original 400 (never the 550 selling price)
same([prod(mouse.id).stock, prod(mouse.id).cost_price], [7, round4((5 * 500 + 2 * 400) / 7)]);
const s2 = Q('sale.create', {items:[{product_id:mouse.id, qty:1, price:600}], payments:[{account_id:cash.id, amount:600}]});
same(s2.items[0].cost, round4((5 * 500 + 2 * 400) / 7), 'next sale uses the blended purchase cost');
Q('reverse', {type:'sale', id:s2.sale.id, reason:'test', password:'admin123'});
Q('reverse', {type:'sreturn', id:r1.return.id, reason:'test', password:'admin123'});
same([prod(mouse.id).stock, prod(mouse.id).cost_price], [5, 500], 'cancelling the return restores stock and cost');

// return into an empty stock keeps the product cost as it was bought
const cable = Q('product.save', {name:'Cable', unit:'pcs'});
Q('purchase.create', {supplier_id:sup.id, items:[{product_id:cable.id, qty:2, cost:100, sale_price:150}], payments:[]});
const s3 = Q('sale.create', {items:[{product_id:cable.id, qty:2, price:150}], payments:[{account_id:cash.id, amount:300}]});
Q('sreturn.create', {sale_id:s3.sale.id, items:[{sale_item_id:s3.items[0].id, qty:1}], refund:{account_id:cash.id}});
same([prod(cable.id).stock, prod(cable.id).cost_price], [1, 100]);

// serial item: the unit keeps its own purchase cost
const router = Q('product.save', {name:'Router', unit:'pcs', has_warranty:true, warranty_type:'serial', warranty_days:365});
Q('purchase.create', {supplier_id:sup.id, items:[{product_id:router.id, qty:1, cost:2000, sale_price:2500, serials:['R-1']}], payments:[]});
const s4 = Q('sale.create', {items:[{product_id:router.id, qty:1, price:2500, serials:['R-1']}], payments:[{account_id:cash.id, amount:2500}]});
Q('sreturn.create', {sale_id:s4.sale.id, items:[{sale_item_id:s4.items[0].id, qty:1, serials:['R-1']}], refund:{account_id:cash.id}});
same(sandbox.all_('SerialItems').find((x) => x.serial === 'R-1').cost, 2000);
same(prod(router.id).cost_price, 2000);
const s5 = Q('sale.create', {items:[{product_id:router.id, qty:1, price:2600, serials:['R-1']}], payments:[{account_id:cash.id, amount:2600}]});
same(s5.sale.profit, 600, 'resold serial keeps its 2000 cost');

/* ---------- purchase price differs: the product cost is averaged ---------- */
const ssd = Q('product.save', {name:'SSD', unit:'pcs'});
Q('purchase.create', {supplier_id:sup.id, items:[{product_id:ssd.id, qty:5, cost:400, sale_price:600}], payments:[]});
Q('purchase.create', {supplier_id:sup.id, items:[{product_id:ssd.id, qty:5, cost:500}], payments:[]});
same([prod(ssd.id).stock, prod(ssd.id).cost_price], [10, 450], 'non-serial: (5x400 + 5x500) / 10');
Q('purchase.create', {supplier_id:sup.id, items:[{product_id:ssd.id, qty:10, cost:300}], payments:[]});
same(prod(ssd.id).cost_price, 375, '(10x450 + 10x300) / 20');

// serial items: average of the units in stock; every unit still sells at its own cost
const ups = Q('product.save', {name:'UPS', unit:'pcs', has_warranty:true, warranty_type:'serial', warranty_days:365});
Q('purchase.create', {supplier_id:sup.id, items:[{product_id:ups.id, qty:1, cost:2000, sale_price:3000, serials:['U-1']}], payments:[]});
same(prod(ups.id).cost_price, 2000);
const upsBuy2 = Q('purchase.create', {supplier_id:sup.id, items:[{product_id:ups.id, qty:1, cost:2400, serials:['U-2']}], payments:[]});
same(prod(ups.id).cost_price, 2200, 'serial: (2000 + 2400) / 2');
const upsSale = Q('sale.create', {items:[{product_id:ups.id, qty:1, price:3000, serials:['U-2']}], payments:[{account_id:cash.id, amount:3000}]});
same(upsSale.sale.profit, 600, 'U-2 sells at its own 2400 cost');
same(prod(ups.id).cost_price, 2000, 'only U-1 (2000) left in stock');
const upsRet = Q('sreturn.create', {sale_id:upsSale.sale.id, items:[{sale_item_id:upsSale.items[0].id, qty:1, serials:['U-2']}], refund:{account_id:cash.id}});
same(prod(ups.id).cost_price, 2200, 'U-2 back in stock at 2400');
Q('reverse', {type:'sreturn', id:upsRet.return.id, reason:'test', password:'admin123'});
same(prod(ups.id).cost_price, 2000, 'return cancelled');
Q('sreturn.create', {sale_id:upsSale.sale.id, items:[{sale_item_id:upsSale.items[0].id, qty:1, serials:['U-2']}], refund:{account_id:cash.id}});
const upsPr = Q('preturn.create', {purchase_id:upsBuy2.purchase.id, items:[{purchase_item_id:upsBuy2.items[0].id, qty:1, serials:['U-2']}], refund:{mode:'adjust'}});
same([prod(ups.id).stock, prod(ups.id).cost_price], [1, 2000], 'U-2 sent back to the supplier');
const hist0 = Q('product.history', {product_id:ups.id});
same(hist0.last_purchase.cost, 2400, 'last purchase price = the most recent purchase invoice');

/* ---------- promised payment date + collection reminders ---------- */
const cus = Q('customer.save', {name:'Rahim', phones:'01711111111'});
Q('purchase.create', {supplier_id:sup.id, items:[{product_id:cable.id, qty:20, cost:100}], payments:[]});
QF('sale.create', {customer_id:cus.id, items:[{product_id:cable.id, qty:1, price:1000}], payments:[], next_payment_date:'2020-01-01'});
const d1 = Q('sale.create', {customer_id:cus.id, items:[{product_id:cable.id, qty:1, price:1000}], payments:[], next_payment_date:today});
same(d1.sale.next_payment_date, today);
// fully paid sale: the date is not kept
const paidSale = Q('sale.create', {customer_id:cus.id, items:[{product_id:cable.id, qty:1, price:200}], payments:[{account_id:cash.id, amount:200}], next_payment_date:today});
same(paidSale.sale.next_payment_date, '');
let rem = Q('dashboard', {}).reminders;
same(rem.map((r) => [r.invoice_no, r.remaining, r.overdue_days, r.phone]), [[d1.sale.invoice_no, 1000, 0, '01711111111']]);
Q('customer.payment', {customer_id:cus.id, account_id:cash.id, amount:400});
rem = Q('dashboard', {}).reminders;
same(rem.map((r) => r.remaining), [600], 'part payment lowers the reminder');
Q('customer.payment', {customer_id:cus.id, account_id:cash.id, amount:600});
same(Q('dashboard', {}).reminders, [], 'paid in full: reminder switches off');

// paid BEFORE the promised date: no reminder when the date arrives
const d2 = Q('sale.create', {customer_id:cus.id, items:[{product_id:cable.id, qty:1, price:700}], payments:[], next_payment_date:sandbox.addDays_(today, 5)});
same(Q('dashboard', {}).reminders, [], 'future date: not shown yet');
Q('customer.payment', {customer_id:cus.id, account_id:cash.id, amount:700});
sandbox.update_('Sales', d2.sale.id, { next_payment_date: today }); // the date arrives
same(Q('dashboard', {}).reminders, [], 'paid before the date: no reminder');

// overdue reminder, then moved to a new date from the dashboard
const d3 = Q('sale.create', {customer_id:cus.id, items:[{product_id:cable.id, qty:1, price:900}], payments:[], next_payment_date:today});
sandbox.update_('Sales', d3.sale.id, { next_payment_date: sandbox.addDays_(today, -3) });
rem = Q('dashboard', {}).reminders;
same(rem.map((r) => [r.invoice_no, r.overdue_days, r.remaining]), [[d3.sale.invoice_no, 3, 900]]);
QF('sale.promise', {id:d3.sale.id, next_payment_date:sandbox.addDays_(today, -1)});
Q('sale.promise', {id:d3.sale.id, next_payment_date:sandbox.addDays_(today, 2)});
same(Q('dashboard', {}).reminders, [], 'postponed');
Q('sale.promise', {id:d3.sale.id, next_payment_date:today});
same(Q('dashboard', {}).reminders.length, 1);
Q('sale.promise', {id:d3.sale.id, next_payment_date:''});
same(Q('dashboard', {}).reminders, [], 'cleared');
// a payment made before a later invoice is not counted against it
Q('sale.promise', {id:d3.sale.id, next_payment_date:today});
Q('customer.payment', {customer_id:cus.id, account_id:cash.id, amount:900});
const d4 = Q('sale.create', {customer_id:cus.id, items:[{product_id:cable.id, qty:1, price:300}], payments:[], next_payment_date:today});
rem = Q('dashboard', {}).reminders;
same(rem.map((r) => [r.invoice_no, r.remaining]), [[d4.sale.invoice_no, 300]]);
// cancelled invoice: no reminder
Q('reverse', {type:'sale', id:d4.sale.id, reason:'test', password:'admin123'});
same(Q('dashboard', {}).reminders, []);

/* ---------- dashboard: stock summary and best sellers ---------- */
const dash = Q('dashboard', {});
const goods = Q('products.list', {}).filter((x) => x.active && !x.service);
const held = goods.filter((x) => x.stock > 0);
same(dash.stock_summary.products, goods.length);
same(dash.stock_summary.in_stock, held.length);
same(dash.stock_summary.cost_value, Math.round(held.reduce((a, x) => a + x.stock * x.cost_price, 0) * 100) / 100);
same(dash.stock_summary.sale_value, Math.round(held.reduce((a, x) => a + x.stock * x.sale_price, 0) * 100) / 100);
same(dash.stock_summary.expected_profit, Math.round((dash.stock_summary.sale_value - dash.stock_summary.cost_value) * 100) / 100);
const tp = dash.top_products.today;
const tpMouse = tp.find((x) => x.product_id === mouse.id);
same(tpMouse.qty, 5, 'mouse: 5 sold; the return and the second sale were cancelled');
truthy(tp.every((x, i) => i === 0 || tp[i - 1].amount >= x.amount), 'sorted by amount');
const tpRouter = tp.find((x) => x.product_id === router.id);
same([tpRouter.qty, tpRouter.amount], [1, 2600], 'returned router sale is netted out, resale counts');
truthy(tp.every((x) => typeof x.group === 'string'), 'group name present');

/* ---------- POS price history ---------- */
const hist = Q('product.history', {product_id:cable.id});
same(hist.last_sales.length, 3);
same(hist.last_sales.map((x) => x.price), [900, 700, 200], 'newest first, cancelled invoices skipped');
same(hist.last_purchase.cost, 100);
const sales = Q('user.save', {name:'Seller', username:'seller1', password:'seller123', role:'sales'});
const t2 = call('login', {username:'seller1', password:'seller123'}).data.token;
const h2 = call('product.history', {product_id:cable.id}, t2).data;
same(h2.last_purchase, undefined, 'no purchase cost for users without the cost permission');
same(h2.last_sales.length, 3);
console.log('Dues, reminders, return costing, dashboard and price history: ' + checks + ' checks passed');
`;
eval(harness + scenario);
