/* ============================================================================
 *  20. DASHBOARD
 * ========================================================================== */
function dashboard_(p, user) {
  var full = can_(user, 'reports'), showCost = can_(user, 'cost'), today = today_(), month = today.slice(0, 7);
  var inP = { today: function (d) { return d === today; }, month: function (d) { return d.slice(0, 7) === month; }, total: function () { return true; } };
  var sales = all_('Sales').filter(function (s) { return s.status === 'active' && (full || s.user_id === user.id); });
  var out = { limited: !full, user: user.name, date: today };

  function cards(period) {
    var f = inP[period];
    var s = sales.filter(function (x) { return f(x.date); });
    var c = { sales: round_(sum_(s, function (x) { return x.total; })), invoices: s.length, due: round_(sum_(s, function (x) { return x.due; })) };
    if (!full) return c;
    var sr = all_('SalesReturns').filter(function (x) { return x.status === 'active' && f(x.date); });
    var pu = all_('Purchases').filter(function (x) { return x.status === 'active' && f(x.date); });
    var pr = all_('PurchaseReturns').filter(function (x) { return x.status === 'active' && f(x.date); });
    var ex = all_('Expenses').filter(function (x) { return x.status === 'active' && f(x.date); });
    c.sales_returns = round_(sum_(sr, function (x) { return x.total; }));
    c.purchases = round_(sum_(pu, function (x) { return x.total; }));
    c.purchase_returns = round_(sum_(pr, function (x) { return x.total; }));
    c.expenses = round_(sum_(ex, function (x) { return x.amount; }));
    if (showCost) {
      c.gross_profit = round_(sum_(s, function (x) { return x.profit; }) - sum_(sr, function (x) { return x.total - x.cost; }));
      c.net_profit = round_(c.gross_profit - c.expenses);
    }
    return c;
  }
  out.today = cards('today'); out.month = cards('month'); out.total = cards('total');

  var series = [];
  for (var i = 13; i >= 0; i--) {
    var d = addDays_(today, -i), ds = sales.filter(function (x) { return x.date === d; });
    var row = { date: d, sales: round_(sum_(ds, function (x) { return x.total; })), invoices: ds.length };
    if (showCost) row.profit = round_(sum_(ds, function (x) { return x.profit; }));
    series.push(row);
  }
  out.series = series;
  out.recent = sales.slice(-8).reverse().map(function (s) { return { id: s.id, invoice_no: s.invoice_no, customer_name: s.customer_name, total: s.total, due: s.due, date: s.date }; });

  var thDef = num_(getSetting_('low_stock_default', '5'));
  out.low_stock = all_('Products').filter(function (x) { return x.active && x.stock <= (x.low_stock > 0 ? x.low_stock : thDef); })
    .sort(function (a, b) { return a.stock - b.stock; }).slice(0, 40)
    .map(function (x) { return { id: x.id, name: x.name, stock: x.stock, unit: x.unit, threshold: x.low_stock > 0 ? x.low_stock : thDef }; });
  if (!full) return out;

  var accs = accountsList_().filter(function (a) { return a.active; });
  out.accounts = accs.map(function (a) { return { id: a.id, name: a.name, type: a.type, number: a.number, balance: a.balance }; });
  out.receivable = round_(sum_(customersList_(), function (c) { return c.balance > 0 ? c.balance : 0; }));
  out.payable = round_(sum_(suppliersList_(), function (c) { return c.balance > 0 ? c.balance : 0; }));
  out.stock_value = showCost ? round_(sum_(all_('Products'), function (x) { return x.stock * x.cost_price; })) : undefined;
  var claims = all_('WarrantyClaims');
  out.claims = {
    pending: claims.filter(function (c) { return c.status === 'Pending'; }).length,
    vendor: claims.filter(function (c) { return c.status === 'Sent to Vendor'; }).length,
    ready: claims.filter(function (c) { return c.status === 'Repaired' || c.status === 'Replaced'; }).length
  };
  out.leaderboard = {};
  ['today', 'month', 'total'].forEach(function (per) {
    var g = {};
    sales.filter(function (x) { return inP[per](x.date); }).forEach(function (x) {
      var r = g[x.user_name] = g[x.user_name] || { name: x.user_name, invoices: 0, total: 0, profit: 0 };
      r.invoices++; r.total += x.total; r.profit += x.profit;
    });
    out.leaderboard[per] = Object.keys(g).map(function (k) { var r = g[k]; return { name: r.name, invoices: r.invoices, total: round_(r.total), profit: showCost ? round_(r.profit) : undefined }; })
      .sort(function (a, b) { return b.total - a.total; });
  });
  return out;
}

/* ============================================================================
 *  21. REPORTS HUB
 * ========================================================================== */
function bucket_(d, group) { d = String(d || ''); return group === 'yearly' ? d.slice(0, 4) : group === 'monthly' ? d.slice(0, 7) : d.slice(0, 10); }
function col_(key, label, type, sum) { return { key: key, label: label, type: type || 'text', sum: !!sum }; }
function finishReport_(title, columns, rows, extra) {
  var totals = null;
  if (columns.some(function (c) { return c.sum; })) {
    totals = {};
    columns.forEach(function (c) { if (c.sum) totals[c.key] = round_(sum_(rows, function (r) { return num_(r[c.key]); })); });
  }
  return Object.assign({ title: title, columns: columns, rows: rows, totals: totals }, extra || {});
}
function reports_(p, user) {
  var from = p.from || '', to = p.to || '', group = p.group || 'invoice', cost = can_(user, 'cost');
  var status = p.status || 'active', okStatus = function (s) { return status === 'all' || s === status; };
  var period = (from || to) ? ' (' + (from || '…') + ' → ' + (to || '…') + ')' : '';
  var T = p.type;

  if (T === 'sales') {
    var sl = all_('Sales').filter(function (s) { return inRange_(s.date, from, to) && okStatus(s.status) && (!p.customer_id || s.customer_id === p.customer_id) && (!p.user_id || s.user_id === p.user_id); });
    if (group === 'invoice') {
      var items = {}; all_('SaleItems').forEach(function (i) { (items[i.sale_id] = items[i.sale_id] || []).push(i.name + ' x' + i.qty); });
      var cols = [col_('date', 'Date', 'date'), col_('invoice_no', 'Invoice'), col_('customer_name', 'Customer'), col_('items', 'Items'), col_('subtotal', 'Subtotal', 'money', 1), col_('discount', 'Discount', 'money', 1), col_('total', 'Total', 'money', 1), col_('paid', 'Paid', 'money', 1), col_('due', 'Due', 'money', 1)];
      if (cost) cols.push(col_('profit', 'Profit', 'money', 1));
      cols.push(col_('user_name', 'Staff'), col_('status', 'Status'));
      var rows = sl.sort(function (a, b) { return a._row - b._row; }).map(function (s) { var o = Object.assign({}, s); o.items = (items[s.id] || []).join(', '); return o; });
      var rep = finishReport_('Sales Report — Invoice-wise' + period, cols, rows);
      if (rep.totals) { var act = rows.filter(function (r) { return r.status === 'active'; }); Object.keys(rep.totals).forEach(function (k) { rep.totals[k] = round_(sum_(act, function (r) { return r[k]; })); }); }
      return rep;
    }
    var g = {};
    sl.filter(function (s) { return s.status === 'active'; }).forEach(function (s) {
      var k = bucket_(s.date, group), r = g[k] = g[k] || { period: k, invoices: 0, subtotal: 0, discount: 0, total: 0, paid: 0, due: 0, profit: 0 };
      r.invoices++; r.subtotal += s.subtotal; r.discount += s.discount; r.total += s.total; r.paid += s.paid; r.due += s.due; r.profit += s.profit;
    });
    var cols2 = [col_('period', group === 'daily' ? 'Date' : group === 'monthly' ? 'Month' : 'Year'), col_('invoices', 'Invoices', 'num', 1), col_('subtotal', 'Subtotal', 'money', 1), col_('discount', 'Discount', 'money', 1), col_('total', 'Total Sales', 'money', 1), col_('paid', 'Collected', 'money', 1), col_('due', 'Due', 'money', 1)];
    if (cost) cols2.push(col_('profit', 'Profit', 'money', 1));
    return finishReport_('Sales Report — ' + group + period, cols2, Object.keys(g).sort().map(function (k) { return g[k]; }));
  }

  if (T === 'purchases') {
    var pu = all_('Purchases').filter(function (s) { return inRange_(s.date, from, to) && okStatus(s.status) && (!p.supplier_id || s.supplier_id === p.supplier_id); });
    if (group === 'invoice') {
      var pit = {}; all_('PurchaseItems').forEach(function (i) { (pit[i.purchase_id] = pit[i.purchase_id] || []).push(i.name + ' x' + i.qty); });
      var pc = [col_('date', 'Date', 'date'), col_('invoice_no', 'Invoice'), col_('supplier_name', 'Supplier'), col_('items', 'Items'), col_('subtotal', 'Subtotal', 'money', 1), col_('discount', 'Discount', 'money', 1), col_('total', 'Total', 'money', 1), col_('paid', 'Paid', 'money', 1), col_('due', 'Due', 'money', 1), col_('user', 'Staff'), col_('status', 'Status')];
      var prow = pu.sort(function (a, b) { return a._row - b._row; }).map(function (s) { var o = Object.assign({}, s); o.items = (pit[s.id] || []).join(', '); return o; });
      var prep = finishReport_('Purchase Report — Invoice-wise' + period, pc, prow);
      if (prep.totals) { var pact = prow.filter(function (r) { return r.status === 'active'; }); Object.keys(prep.totals).forEach(function (k) { prep.totals[k] = round_(sum_(pact, function (r) { return r[k]; })); }); }
      return prep;
    }
    var pg = {};
    pu.filter(function (s) { return s.status === 'active'; }).forEach(function (s) {
      var k = bucket_(s.date, group), r = pg[k] = pg[k] || { period: k, invoices: 0, total: 0, paid: 0, due: 0 };
      r.invoices++; r.total += s.total; r.paid += s.paid; r.due += s.due;
    });
    return finishReport_('Purchase Report — ' + group + period, [col_('period', 'Period'), col_('invoices', 'Invoices', 'num', 1), col_('total', 'Total', 'money', 1), col_('paid', 'Paid', 'money', 1), col_('due', 'Due', 'money', 1)], Object.keys(pg).sort().map(function (k) { return pg[k]; }));
  }

  if (T === 'sales_returns') {
    var sr = sreturnsList_({ from: from, to: to, status: status === 'all' ? '' : status }).reverse();
    return finishReport_('Sales Returns' + period, [col_('date', 'Date', 'date'), col_('return_no', 'Return #'), col_('invoice_no', 'Invoice'), col_('customer_name', 'Customer'), col_('type', 'Type'), col_('items_text', 'Items'), col_('total', 'Value', 'money', 1), col_('refund', 'Cash Refund', 'money', 1), col_('user', 'Staff'), col_('status', 'Status')], sr);
  }
  if (T === 'purchase_returns') {
    var pr = preturnsList_({ from: from, to: to, status: status === 'all' ? '' : status }).reverse();
    return finishReport_('Purchase Returns' + period, [col_('date', 'Date', 'date'), col_('return_no', 'Return #'), col_('invoice_no', 'Purchase'), col_('supplier_name', 'Supplier'), col_('items_text', 'Items'), col_('total', 'Value', 'money', 1), col_('received', 'Cash Received', 'money', 1), col_('user', 'Staff'), col_('status', 'Status')], pr);
  }

  if (T === 'daily_summary') {
    var days = {};
    function d_(k) { return days[k] = days[k] || { date: k, invoices: 0, items: 0, sales: 0, returns: 0, purchases: 0, purchase_returns: 0, expenses: 0, profit: 0 }; }
    var sIt = {}; all_('SaleItems').forEach(function (i) { sIt[i.sale_id] = (sIt[i.sale_id] || 0) + i.qty; });
    all_('Sales').forEach(function (s) { if (s.status === 'active' && inRange_(s.date, from, to)) { var r = d_(s.date); r.invoices++; r.items += sIt[s.id] || 0; r.sales += s.total; r.profit += s.profit; } });
    all_('SalesReturns').forEach(function (s) { if (s.status === 'active' && inRange_(s.date, from, to)) { var r = d_(s.date); r.returns += s.total; r.profit -= (s.total - s.cost); } });
    all_('Purchases').forEach(function (s) { if (s.status === 'active' && inRange_(s.date, from, to)) d_(s.date).purchases += s.total; });
    all_('PurchaseReturns').forEach(function (s) { if (s.status === 'active' && inRange_(s.date, from, to)) d_(s.date).purchase_returns += s.total; });
    all_('Expenses').forEach(function (s) { if (s.status === 'active' && inRange_(s.date, from, to)) { var r = d_(s.date); r.expenses += s.amount; r.profit -= s.amount; } });
    var dc = [col_('date', 'Date', 'date'), col_('invoices', 'Invoices', 'num', 1), col_('items', 'Items Sold', 'num', 1), col_('sales', 'Sales', 'money', 1), col_('returns', 'Sales Returns', 'money', 1), col_('purchases', 'Purchases', 'money', 1), col_('purchase_returns', 'Purchase Returns', 'money', 1), col_('expenses', 'Expenses', 'money', 1)];
    if (cost) dc.push(col_('profit', 'Net Profit', 'money', 1));
    return finishReport_('Daily Counts' + period, dc, Object.keys(days).sort().map(function (k) { return days[k]; }));
  }

  if (T === 'payment_methods') {
    var accs = indexBy_(all_('Accounts')), pm = {};
    all_('AccountTxns').forEach(function (t) {
      if (t.voided || !inRange_(t.date, from, to) || (p.account_id && t.account_id !== p.account_id)) return;
      if (t.ref_type === 'transfer' || t.ref_type === 'manual') return;
      var k = bucket_(t.date, group === 'invoice' ? 'daily' : group) + '|' + t.account_id;
      var r = pm[k] = pm[k] || { period: bucket_(t.date, group === 'invoice' ? 'daily' : group), account: accs[t.account_id] ? accs[t.account_id].name : '?', received: 0, paid: 0, net: 0 };
      if (t.direction === 'in') r.received += t.amount; else r.paid += t.amount;
      r.net = r.received - r.paid;
    });
    return finishReport_('Payment Method Summary' + period, [col_('period', 'Date'), col_('account', 'Account / Method'), col_('received', 'Received', 'money', 1), col_('paid', 'Paid Out', 'money', 1), col_('net', 'Net', 'money', 1)], Object.keys(pm).sort().map(function (k) { return pm[k]; }));
  }

  if (T === 'warranty') {
    var cl = claimsList_({ from: from, to: to, status: p.status === 'all' || !p.status ? '' : p.status }).reverse();
    var counts = {}; cl.forEach(function (c) { counts[c.status] = (counts[c.status] || 0) + 1; });
    return finishReport_('Warranty Report' + period, [col_('claim_no', 'Claim #'), col_('date', 'Received', 'date'), col_('invoice_no', 'Invoice'), col_('customer_name', 'Customer'), col_('phone', 'Phone'), col_('product_name', 'Product'), col_('serial', 'Serial'), col_('issue', 'Issue'), col_('vendor', 'Vendor'), col_('status', 'Status'), col_('delivered_date', 'Delivered', 'date')],
      cl.map(function (c) { var o = Object.assign({}, c); delete o.log; return o; }), { summary: counts });
  }

  if (T === 'expenses') {
    var ex = expensesList_({ from: from, to: to, status: status === 'all' ? '' : status });
    if (group === 'category') {
      var eg = {}; ex.forEach(function (e) { if (e.status !== 'active') return; var r = eg[e.category] = eg[e.category] || { category: e.category, count: 0, amount: 0 }; r.count++; r.amount += e.amount; });
      return finishReport_('Expenses by Category' + period, [col_('category', 'Category'), col_('count', 'Entries', 'num', 1), col_('amount', 'Amount', 'money', 1)], Object.keys(eg).map(function (k) { return eg[k]; }));
    }
    return finishReport_('Expenses' + period, [col_('date', 'Date', 'date'), col_('category', 'Category'), col_('note', 'Note'), col_('account_name', 'Paid From'), col_('amount', 'Amount', 'money', 1), col_('user', 'Staff'), col_('status', 'Status')], ex.reverse());
  }

  if (T === 'product_sales') {
    var sm = indexBy_(all_('Sales').filter(function (s) { return s.status === 'active' && inRange_(s.date, from, to); })), pg2 = {};
    all_('SaleItems').forEach(function (i) {
      if (!sm[i.sale_id]) return;
      var r = pg2[i.product_id] = pg2[i.product_id] || { name: i.name, unit: i.unit, qty: 0, revenue: 0, cost: 0, profit: 0 };
      r.qty += i.qty; r.revenue += i.total; r.cost += i.cost; r.profit += i.total - i.cost;
    });
    var pcol = [col_('name', 'Product'), col_('unit', 'Unit'), col_('qty', 'Qty Sold', 'num', 1), col_('revenue', 'Revenue', 'money', 1)];
    if (cost) pcol.push(col_('profit', 'Profit', 'money', 1));
    return finishReport_('Product-wise Sales' + period, pcol, Object.keys(pg2).map(function (k) { return pg2[k]; }).sort(function (a, b) { return b.revenue - a.revenue; }));
  }
  fail_('Unknown report type');
}
