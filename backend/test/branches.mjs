// Branches: the first branch takes today's stock; each branch sells only its own stock and serials; transfers
// move stock through "in transit"; staff fixed to a branch see their branch only; one report for all branches.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const api = await apiClient(db), {q, raw} = api;
const admin = api.token;
const boot = await q('bootstrap');
const cash = boot.accounts.find((a) => a.type === 'cash').id;
const tea = await q('product.save', {name: 'Tea pack', sale_price: 100});
const phone = await q('product.save', {name: 'Phone A1', sale_price: 9000, has_warranty: true, warranty_type: 'serial', warranty_days: 365});
const sup = await q('supplier.save', {name: 'Wholesaler'});
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: tea.id, qty: 50, cost: 60, sale_price: 100}, {product_id: phone.id, qty: 3, cost: 7000, sale_price: 9000, serials: ['P-1', 'P-2', 'P-3']}], payments: []});
eq(boot.branches.on, false, 'branches are off until the first one is added');

// ---- Turn on: the first branch (the Main Branch) takes everything; here it is renamed Mirpur
let b = await q('branch.save', {name: 'Main Branch'});
b = await q('branch.save', {...b.list[0], name: 'Mirpur'});
const mirpur = b.list[0].id;
b = await q('branch.save', {name: 'Uttara', address: 'Sector 7'});
const uttara = b.list.find((x) => x.name === 'Uttara').id;
eq([b.on, b.list.length, b.stock_units[mirpur], b.stock_units[uttara]], [true, 2, 53, undefined], 'Mirpur holds all 53 units; Uttara none');
ok(/already exists/.test((await raw('branch.save', {name: 'mirpur'})).error), 'no duplicate branch names');
const prods = (branch) => q('products.list', {}, {branch});
eq((await prods(mirpur)).find((p) => p.id === tea.id).stock, 50, 'Mirpur sees 50 tea');
const tu = (await prods(uttara)).find((p) => p.id === tea.id);
eq([tu.stock, tu.stock_total, tu.available], [0, 50, 0], 'Uttara sees 0 here, 50 in the shop');

// ---- Selling follows the branch
const sell = (n, branch) => raw('sale.create', {items: [{product_id: tea.id, qty: n, price: 100}], payments: [{account_id: cash, amount: n * 100}]}, {branch});
ok(/Only 0 of Tea pack in Uttara/.test((await sell(1, uttara)).error), 'Uttara cannot sell what it does not have');
ok((await sell(5, mirpur)).ok, 'Mirpur sells 5');
{ const e = (await raw('sale.create', {items: [{product_id: phone.id, qty: 1, price: 9000, serials: 'P-1'}], payments: [{account_id: cash, amount: 9000}]}, {branch: uttara})).error; ok(/of Phone A1 in Uttara|is in Mirpur/.test(e), 'a phone sells only in the branch that holds it'); }

// ---- Transfer Mirpur → Uttara: 10 tea and phone P-2
ok(/Only 45 of Tea pack/.test((await raw('branch.transfer.send', {to: uttara, items: [{product_id: tea.id, qty: 46}]}, {branch: mirpur})).error), 'cannot send more than the branch has');
let t = await q('branch.transfer.send', {to: uttara, items: [{product_id: tea.id, qty: 10}, {product_id: phone.id, serials: 'P-2'}], note: 'Weekly'}, {branch: mirpur});
eq([t.no, t.status, t.from_name, t.to_name], ['BT-000001', 'in_transit', 'Mirpur', 'Uttara'], 'sent: on the way');
eq([(await prods(mirpur)).find((p) => p.id === tea.id).stock, (await prods(uttara)).find((p) => p.id === tea.id).stock], [35, 0], 'left Mirpur, not yet in Uttara');
t = await q('branch.transfer.receive', {id: t.id}, {branch: uttara});
eq([t.status, (await prods(uttara)).find((p) => p.id === tea.id).stock, (await prods(uttara)).find((p) => p.id === phone.id).stock], ['received', 10, 1], 'Uttara took in 10 tea and 1 phone');
ok((await raw('sale.create', {items: [{product_id: phone.id, qty: 1, price: 9000, serials: 'P-2'}], payments: [{account_id: cash, amount: 9000}]}, {branch: uttara})).ok, 'Uttara sells the phone it received');
ok(/not in stock/.test((await raw('branch.transfer.send', {to: mirpur, items: [{product_id: phone.id, serials: 'P-2'}]}, {branch: uttara})).error), 'a sold serial cannot move');
// a cancelled transfer goes back
let t2 = await q('branch.transfer.send', {to: uttara, items: [{product_id: tea.id, qty: 5}]}, {branch: mirpur});
t2 = await q('branch.transfer.cancel', {id: t2.id}, {branch: mirpur});
eq([t2.status, (await prods(mirpur)).find((p) => p.id === tea.id).stock], ['cancelled', 35], 'cancelled: back in Mirpur');
eq((await q('products.list')).find((p) => p.id === tea.id).stock_total, 45, 'the shop total is 45 (50 − 5 sold)');

// ---- Stock adjust and purchase land in the branch
await q('stock.adjust', {product_id: tea.id, new_stock: 8, note: 'Count'}, {branch: uttara});
eq([(await prods(uttara)).find((p) => p.id === tea.id).stock, (await q('products.list')).find((p) => p.id === tea.id).stock_total], [8, 43], 'Uttara counted 8: the shop total drops by 2');
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: tea.id, qty: 20, cost: 60, sale_price: 100}], payments: []}, {branch: uttara});
eq((await prods(uttara)).find((p) => p.id === tea.id).stock, 28, 'a purchase made in Uttara stocks Uttara');

// ---- Staff fixed to a branch
await q('user.save', {name: 'Uttara cashier', username: 'uttara1', role: 'sales', password: 'uttara-password-1'});
const users = await q('users.list');
const cashier = users.find((u) => u.username === 'uttara1');
const uttaraCash = (await q('account.save', {name: 'Uttara drawer', type: 'cash', opening_balance: 0})).id;
await q('branch.assign', {users: {[cashier.id]: uttara}, accounts: {[cash]: mirpur, [uttaraCash]: uttara}});
api.setToken((await q('login', {username: 'uttara1', password: 'uttara-password-1'})).token);
const cb = await q('bootstrap', {}, {branch: mirpur});
eq([cb.branches.mine, cb.branches.current, cb.branches.can_switch], [uttara, uttara, false], 'the cashier works in Uttara whatever the app asks');
eq(cb.accounts.map((a) => a.name), ['Uttara drawer'], 'only the Uttara drawer (and shared accounts) are offered');
ok(/belongs to Mirpur/.test((await raw('sale.create', {items: [{product_id: tea.id, qty: 1, price: 100}], payments: [{account_id: cash, amount: 100}]})).error), 'cannot take money into the Mirpur drawer');
ok((await raw('sale.create', {items: [{product_id: tea.id, qty: 1, price: 100}], payments: [{account_id: uttaraCash, amount: 100}]})).ok, 'sells into the Uttara drawer');
api.setToken(admin);

// ---- One report for all branches
const r = await q('branch.report', {});
const m = r.branches.find((x) => x.id === mirpur), u = r.branches.find((x) => x.id === uttara);
eq([m.sales_count, m.sales, u.sales_count, u.sales, r.all.sales], [1, 500, 2, 9100, 9600], 'sales per branch and in total');
eq([m.stock_qty, u.stock_qty, r.all.stock_qty], [37, 27, 64], 'stock per branch: Mirpur 35 tea + 2 phones, Uttara 27 tea');
eq([u.purchases, u.cash, r.transit.qty], [1200, 100, 0], 'Uttara purchases, Uttara drawer, nothing on the way');
ok(/still has stock/.test((await raw('branch.save', {id: uttara, name: 'Uttara', active: false})).error), 'a branch with stock cannot close');

// a serial in another branch is refused even when this branch has the product
const t3 = await q('branch.transfer.send', {to: uttara, items: [{product_id: phone.id, serials: 'P-3'}]}, {branch: mirpur});
await q('branch.transfer.receive', {id: t3.id}, {branch: uttara});
ok(/Serial P-1 is in Mirpur/.test((await raw('sale.create', {items: [{product_id: phone.id, qty: 1, price: 9000, serials: 'P-1'}], payments: [{account_id: uttaraCash, amount: 9000}]}, {branch: uttara})).error), 'Uttara cannot sell Mirpur\'s serial');

// the backup file carries the branch data; restoring brings the branches back as they were
const backup = await q('database.export');
ok(backup.branch_rows.length > 5 && backup.counts.BranchRows === backup.branch_rows.length, 'the backup holds the branch rows');
const before = (await q('products.list', {}, {branch: uttara})).find((p) => p.id === tea.id).stock;
await q('branch.transfer.send', {to: mirpur, items: [{product_id: tea.id, qty: 3}]}, {branch: uttara});
const rr = await raw('database.restore', {password: 'harness-password-1', confirm: 'RESTORE', backup_text: JSON.stringify(backup)});
ok(rr.ok, rr.error);
api.setToken((await q('login', {username: 'admin', password: 'harness-password-1'})).token);
eq((await q('products.list', {}, {branch: uttara})).find((p) => p.id === tea.id).stock, before, 'restored: Uttara has its stock back');

console.log(`Features 12: ${checks} checks passed (branches).`);

// A fixed-branch staff member with reporting privileges sees branch-specific statistics.
await q('rolePerms.save', {sales: ['reports', 'pos', 'cost', 'sales.all', 'accounts', 'warranty', 'purchase', 'repairs', 'service', 'suppliers']});
await q('account.entry', {kind:'deposit',account_id:cash,amount:500,note:'Main cash'}, {branch:mirpur});
await q('account.entry', {kind:'deposit',account_id:uttaraCash,amount:100,note:'Local cash'}, {branch:uttara});
const localSale = (await q('sales.list', {}, {branch:uttara})).find(s=>s.total===9000);
const localLine = (await q('sale.detail', {id:localSale.id})).items[0];
const localPurchase = (await q('purchases.list', {}, {branch:uttara})).find(p=>p.total===1200);
const localPurchaseLine = (await q('purchase.detail', {id:localPurchase.id})).items[0];
const customer = await q('customer.save', {name:'Branch invoice customer'});
const customerInvoice = await q('sale.create', {
  customer_id: customer.id,
  items: [{product_id:tea.id,qty:1,price:100}],
  payments: []
}, {branch:uttara});
api.setToken((await q('login', {username: 'uttara1', password: 'uttara-password-1'})).token);
const reportOptions = {from: boot.serverToday, to: boot.serverToday};
const branchDashboard = await q('dashboard');
const branchProfit = await q('profit.report', reportOptions);
const branchInvoices = await q('reports', {type: 'sales', ...reportOptions});
eq(branchDashboard.today.sales, branchInvoices.totals.total, 'dashboard sales match the assigned branch sales report');
eq(branchProfit.summary.sales, branchInvoices.totals.total, 'Profit only includes the assigned branch sales');
eq((await q('accounts.list')).map(a=>a.id), [uttaraCash], 'cash list carries only authorised branch accounts');
eq((await q('account.ledger',{account_id:uttaraCash})).account, 'Uttara drawer', 'local account ledger remains available');
eq((await q('dayclose.get')).accounts.map(a=>a.id), [uttaraCash], 'day close offers local accounts');
eq((await q('daybook')).business.sales.total, branchInvoices.totals.total, 'day book business totals are branch-scoped');
eq((await q('owner.money')).rows.map(r=>r.note), ['Local cash'], 'owner money shows local deposits');
const limitedReport = await q('branch.report');
eq([limitedReport.branches.map(r=>r.id),limitedReport.all,limitedReport.transit], [[uttara],null,null], 'branch report excludes consolidated figures');
const localClaim = await q('claim.create',{sale_id:localSale.id,sale_item_id:localLine.id,serial:'P-2'});
eq((await q('claim.update',{id:localClaim.id,status:'Sent to Vendor'})).status,'Sent to Vendor','local claims can still be processed');
const slow = await q('reports',{type:'slow_stock'});
eq(slow.slow.stock_value, limitedReport.branches[0].stock_value, 'slow stock denominator matches the local stock value');
ok(!(await raw('branches.get')).ok,'staff cannot load the administrative directory');
const localLink = await q('sale.link', {id:customerInvoice.sale.id});
ok(localLink.url.includes('/i/'), 'staff can share a customer invoice from their branch');
const dueDate = boot.serverToday;
eq((await q('sale.promise',{id:customerInvoice.sale.id,next_payment_date:dueDate})).next_payment_date, dueDate, 'staff can set a promise on a local invoice');
eq((await q('purchase.warranty',{item_id:localPurchaseLine.id,expiry:dueDate})).expiry, dueDate, 'staff can set warranty on a local purchase');
const supplierFilter = {product_id:tea.id};
const localPrices = await q('supplier.prices', supplierFilter);
const localPriceReport = await q('reports', {type:'supplier_prices', ...supplierFilter});
eq(localPrices.map(p=>[p.qty,p.spent]), [[20,1200]], 'supplier price API totals only local purchases');
eq(localPriceReport.rows.map(p=>[p.qty,p.spent]), [[20,1200]], 'supplier price report totals only local purchases');
const stock = await q('reports', {type:'stock_summary', product_id:tea.id});
const localTea = (await q('products.list')).find(p=>p.id===tea.id);
eq(stock.rows[0].stock, localTea.stock, 'stock summary reconciles to stock in the assigned branch');
const lots = await q('reports', {type:'stock_summary', product_id:tea.id, group:'lots'});
eq(lots.rows.reduce((sum,row)=>sum+row.stock,0), localTea.stock, 'the branch lot quantities reconcile to the branch inventory');
const priceHistory = await q('product.history', {product_id:tea.id});
eq(priceHistory.last_purchase.invoice_no, localPurchase.invoice_no, 'price card finds purchases in the assigned branch');
eq((await q('repairs.meta')).accounts.map(a=>a.id), [uttaraCash], 'repair form offers branch accounts');
eq((await q('services.meta')).accounts.map(a=>a.id), [uttaraCash], 'service form offers branch accounts');
const supplied = await q('reports', {type:'party_items',party:'supplier',party_id:sup.id});
eq(supplied.rows.map(r=>[r.product_id,r.amount]), [[tea.id,1200]], 'supplier products agree with the local purchase');

api.setToken(admin);

eq((await q('supplier.prices', {product_id:tea.id})).map(p=>[p.qty,p.spent]), [[70,4200]], 'the consolidated supplier price totals are available to the administrator');

const discountedPurchase = await q('purchase.create', {
  supplier_id:sup.id, items:[{product_id:tea.id,qty:2,cost:60}], discount:20, payments:[]
}, {branch:uttara});
await q('supplier.rebate', {supplier_id:sup.id,purchase_id:discountedPurchase.purchase.id,amount:10,note:'Branch purchase rebate'});
api.setToken((await q('login', {username:'uttara1',password:'uttara-password-1'})).token);
const discountedSupplied = await q('reports', {type:'party_items',party:'supplier',party_id:sup.id});
eq(discountedSupplied.rows.find(r=>r.product_id===tea.id).amount, 1300, 'supplier product amounts include the purchase discount');
const branchRebates = await q('reports', {type:'supplier_rebates',supplier_id:sup.id});
eq(branchRebates.rebates.received,10,'supplier rebate follows its linked purchase branch');
api.setToken(admin);
