/* ============================================================================
 *  12. PURCHASES
 * ========================================================================== */
function splitSerials_(v) {
  return (Array.isArray(v) ? v : String(v || '').split(/[\n,]+/)).map(function (s) { return String(s).trim(); }).filter(Boolean);
}
function isSerialProduct_(pr) { return pr.has_warranty && pr.warranty_type === 'serial'; }

function purchaseCreate_(p, user) {
  var pmap = indexBy_(all_('Products')), items = p.items || [];
  if (!items.length) fail_('Add at least one item');
  var supplier = p.supplier_id ? all_('Suppliers').filter(function (s) { return s.id === p.supplier_id; })[0] : null;
  if (p.supplier_id && !supplier) fail_('Supplier not found');
  var date = p.date || today_(), sidx = serialIndex_(), seen = {}, lines = [], subtotal = 0;

  items.forEach(function (it) {
    var pr = pmap[it.product_id]; if (!pr) fail_('Product not found');
    var qty = num_(it.qty); if (qty <= 0) fail_('Invalid quantity for ' + pr.name);
    var cost = num_(it.cost); if (cost < 0) fail_('Invalid cost for ' + pr.name);
    var sers = [];
    if (isSerialProduct_(pr)) {
      if (qty % 1 !== 0) fail_('Quantity for ' + pr.name + ' must be a whole number');
      sers = splitSerials_(it.serials);
      if (sers.length !== qty) fail_('Enter exactly ' + qty + ' serial number(s) for ' + pr.name + ' (got ' + sers.length + ')');
      sers.forEach(function (s) {
        var k = pr.id + '|' + s;
        if (sidx[k] && sidx[k].status !== 'returned_supplier') fail_('Serial already exists: ' + s);
        if (seen[k]) fail_('Duplicate serial in list: ' + s);
        seen[k] = 1;
      });
    } else if (pr.unit === 'pcs' && qty % 1 !== 0) fail_('Quantity for ' + pr.name + ' must be a whole number');
    var total = round_(qty * cost);
    lines.push({ pr: pr, qty: qty, cost: cost, total: total, serials: sers });
    subtotal += total;
  });

  subtotal = round_(subtotal);
  var discount = Math.min(Math.max(num_(p.discount), 0), subtotal), total = round_(subtotal - discount);
  var pays = payList_(p.payments), paid = round_(sum_(pays, function (x) { return x.amount; }));
  if (paid > total + 0.005) fail_('Paid amount (' + paid + ') exceeds the purchase total (' + total + ')');
  var due = round_(total - paid);
  if (due > 0.005 && !supplier) fail_('Select a supplier to buy on credit');

  var inv = nextNo_('seq_purchase', 'PUR-');
  var pur = insert_('Purchases', {
    invoice_no: inv, date: date, supplier_id: supplier ? supplier.id : '', supplier_name: supplier ? supplier.name : '',
    subtotal: subtotal, discount: discount, total: total, paid: paid, due: due, note: p.note || '', status: 'active',
    user: user.name, created_at: now_(), payments: pays
  });
  var rows = insertMany_('PurchaseItems', lines.map(function (l) {
    return { purchase_id: pur.id, product_id: l.pr.id, name: l.pr.name, unit: l.pr.unit, qty: l.qty, cost: l.cost, total: l.total, serials: l.serials.join(',') };
  }));
  var events = [], newSerials = [];
  lines.forEach(function (l) {
    var pr = l.pr, oldStock = pr.stock;
    // weighted-average cost for non-serial items; latest cost otherwise
    var newCost = (oldStock > 0 && !isSerialProduct_(pr)) ? round_((oldStock * pr.cost_price + l.total) / (oldStock + l.qty), 4) : l.cost;
    update_('Products', pr.id, { stock: round_(oldStock + l.qty, 4), cost_price: newCost });
    l.serials.forEach(function (s) {
      newSerials.push({ product_id: pr.id, serial: s, purchase_id: pur.id, sale_id: '', status: 'in_stock', cost: l.cost, created_at: now_() });
      events.push({ serial: s, product_id: pr.id, product_name: pr.name, event: 'purchase', ref_type: 'purchase', ref_id: pur.id, ref_no: inv, party: pur.supplier_name, qty: 1, amount: l.cost, note: 'Stock received' });
    });
    if (!l.serials.length) events.push({ serial: '', product_id: pr.id, product_name: pr.name, event: 'purchase', ref_type: 'purchase', ref_id: pur.id, ref_no: inv, party: pur.supplier_name, qty: l.qty, amount: l.total, note: 'Stock received' });
  });
  insertMany_('SerialItems', newSerials).forEach(function (s) { serialIndex_()[s.product_id + '|' + s.serial] = s; });
  pays.forEach(function (x) { acctTxn_(x.account_id, 'out', x.amount, 'purchase', pur.id, 'Purchase ' + inv, user, date); });
  if (supplier) insert_('SupplierLedger', { date: date, supplier_id: supplier.id, type: 'purchase', ref_id: pur.id, ref_no: inv, debit: paid, credit: total, note: 'Purchase ' + inv, voided: false });
  evBatch_(user, events);
  audit_(user, 'purchase_create', inv);
  return purchaseDetail_({ id: pur.id });
}

function purchaseDetail_(p) {
  var pur = all_('Purchases').filter(function (x) { return x.id === p.id || x.invoice_no === p.id; })[0];
  if (!pur) fail_('Purchase not found');
  var returns = all_('PurchaseReturns').filter(function (r) { return r.purchase_id === pur.id; });
  return {
    purchase: pur, items: all_('PurchaseItems').filter(function (i) { return i.purchase_id === pur.id; }),
    supplier: pur.supplier_id ? all_('Suppliers').filter(function (s) { return s.id === pur.supplier_id; })[0] || null : null,
    returns: returns
  };
}
function purchasesList_(p) {
  var q = String(p.q || '').toLowerCase(), items = {};
  all_('PurchaseItems').forEach(function (i) { (items[i.purchase_id] = items[i.purchase_id] || []).push(i.name + ' x' + i.qty); });
  var rows = all_('Purchases').filter(function (x) {
    if (!inRange_(x.date, p.from, p.to)) return false;
    if (p.status && x.status !== p.status) return false;
    if (p.supplier_id && x.supplier_id !== p.supplier_id) return false;
    if (q && (x.invoice_no + ' ' + x.supplier_name + ' ' + (items[x.id] || []).join(' ')).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).sort(function (a, b) { return b._row - a._row; }).slice(0, num_(p.limit) || 500);
  return rows.map(function (x) { var o = Object.assign({}, x); delete o._row; o.items_text = (items[x.id] || []).join(', '); return o; });
}

/* ============================================================================
 *  13. SALES
 * ========================================================================== */
function saleCreate_(p, user) {
  var pmap = indexBy_(all_('Products')), items = p.items || [];
  if (!items.length) fail_('Cart is empty');
  var customer = p.customer_id ? all_('Customers').filter(function (c) { return c.id === p.customer_id; })[0] : null;
  if (p.customer_id && !customer) fail_('Customer not found');
  var date = today_(), sidx = serialIndex_(), used = {}, need = {}, lines = [], subtotal = 0, costTotal = 0;

  items.forEach(function (it) {
    var pr = pmap[it.product_id]; if (!pr || !pr.active) fail_('Product is not available');
    var qty = num_(it.qty); if (qty <= 0) fail_('Invalid quantity for ' + pr.name);
    if (pr.unit === 'pcs' && qty % 1 !== 0) fail_('Quantity for ' + pr.name + ' must be a whole number');
    need[pr.id] = (need[pr.id] || 0) + qty;
  });
  Object.keys(need).forEach(function (id) {
    if (pmap[id].stock < need[id] - 1e-9) fail_('Insufficient stock for ' + pmap[id].name + ' (available ' + pmap[id].stock + ' ' + pmap[id].unit + ')');
  });

  items.forEach(function (it) {
    var pr = pmap[it.product_id], qty = num_(it.qty), price = num_(it.price), sers = [], cost = 0;
    if (price < 0) fail_('Invalid price for ' + pr.name);
    if (isSerialProduct_(pr)) {
      sers = splitSerials_(it.serials);
      if (sers.length !== qty) fail_('Select ' + qty + ' serial number(s) for ' + pr.name);
      sers.forEach(function (s) {
        var k = pr.id + '|' + s, rec = sidx[k];
        if (!rec || rec.status !== 'in_stock') fail_('Serial ' + s + ' is not in stock for ' + pr.name);
        if (used[k]) fail_('Duplicate serial ' + s);
        used[k] = 1; cost += rec.cost;
      });
    } else cost = pr.cost_price * qty;
    var wDays = 0, wExp = '';
    if (pr.has_warranty) {
      wDays = (it.warranty_days !== undefined && it.warranty_days !== null && it.warranty_days !== '') ? Math.round(num_(it.warranty_days)) : pr.warranty_days;
      if (wDays > 0) wExp = addDays_(date, wDays);
    }
    var total = round_(qty * price);
    lines.push({ pr: pr, qty: qty, price: price, cost: round_(cost, 4), total: total, serials: sers, wType: pr.has_warranty ? pr.warranty_type : '', wDays: wDays, wExp: wExp });
    subtotal += total; costTotal += cost;
  });

  subtotal = round_(subtotal);
  var discount = Math.min(Math.max(num_(p.discount), 0), subtotal), total = round_(subtotal - discount);
  var pays = payList_(p.payments), cashPaid = round_(sum_(pays, function (x) { return x.amount; }));
  var creditUsed = round_(Math.max(num_(p.credit_used), 0));
  if (creditUsed > 0) {
    if (!customer) fail_('Select a customer to use credit');
    var avail = Math.max(-(customerBalances_()[customer.id] || 0), 0);
    if (creditUsed > avail + 0.005) fail_('Customer credit available is only ' + avail);
  }
  var paid = round_(cashPaid + creditUsed);
  if (paid > total + 0.005) fail_('Paid amount (' + paid + ') exceeds the invoice total (' + total + ')');
  var due = round_(total - paid);
  if (due > 0.005 && !customer) fail_('Attach a customer profile to sell on credit (walk-in sales must be fully paid)');

  var inv = nextNo_('seq_sale', getSetting_('invoice_prefix', 'INV-'));
  var profit = round_(total - costTotal);
  var sale = insert_('Sales', {
    invoice_no: inv, date: date, customer_id: customer ? customer.id : '', customer_name: customer ? customer.name : 'Walk-in',
    subtotal: subtotal, discount: discount, total: total, paid: paid, credit_used: creditUsed, due: due, cost: round_(costTotal), profit: profit,
    note: p.note || '', status: 'active', user_id: user.id, user_name: user.name, created_at: now_(), payments: pays
  });
  var rows = insertMany_('SaleItems', lines.map(function (l) {
    return { sale_id: sale.id, product_id: l.pr.id, name: l.pr.name, unit: l.pr.unit, qty: l.qty, price: l.price, cost: l.cost, total: l.total, serials: l.serials.join(','), warranty_type: l.wType, warranty_days: l.wDays, warranty_expiry: l.wExp };
  }));
  var events = [];
  lines.forEach(function (l) {
    update_('Products', l.pr.id, { stock: round_(l.pr.stock - l.qty, 4) });
    l.serials.forEach(function (s) {
      var rec = sidx[l.pr.id + '|' + s];
      update_('SerialItems', rec.id, { status: 'sold', sale_id: sale.id });
      events.push({ serial: s, product_id: l.pr.id, product_name: l.pr.name, event: 'sale', ref_type: 'sale', ref_id: sale.id, ref_no: inv, party: sale.customer_name, qty: 1, amount: l.price, note: l.wExp ? 'Warranty until ' + l.wExp : '' });
    });
    if (!l.serials.length) events.push({ serial: '', product_id: l.pr.id, product_name: l.pr.name, event: 'sale', ref_type: 'sale', ref_id: sale.id, ref_no: inv, party: sale.customer_name, qty: l.qty, amount: l.total, note: l.wExp ? 'Warranty until ' + l.wExp : '' });
  });
  pays.forEach(function (x) { acctTxn_(x.account_id, 'in', x.amount, 'sale', sale.id, 'Sale ' + inv, user, date); });
  if (customer) insert_('CustomerLedger', { date: date, customer_id: customer.id, type: 'sale', ref_id: sale.id, ref_no: inv, debit: total, credit: cashPaid, note: 'Invoice ' + inv, voided: false });
  evBatch_(user, events);
  audit_(user, 'sale_create', inv);

  var detail = saleDetail_({ id: sale.id }, user), sms = null;
  if (customer && p.send_sms !== false) {
    try { sms = sendSaleSms_(sale, lines.map(function (l) { return { name: l.pr.name, qty: l.qty }; }), customer); } catch (e) { sms = { ok: false, status: 'failed', response: String(e.message || e) }; }
  }
  detail.sms = sms;
  return detail;
}
function addDays_(dateStr, days) {
  var d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + days);
  return Utilities.formatDate(d, TZ_(), 'yyyy-MM-dd');
}

function saleDetail_(p, user) {
  var s = all_('Sales').filter(function (x) { return x.id === p.id || x.invoice_no === p.id; })[0];
  if (!s) fail_('Invoice not found');
  if (user && !can_(user, 'sales.all') && s.user_id !== user.id) fail_('Permission denied: this invoice belongs to another user');
  var items = all_('SaleItems').filter(function (i) { return i.sale_id === s.id; });
  var customer = s.customer_id ? all_('Customers').filter(function (c) { return c.id === s.customer_id; })[0] || null : null;
  var returns = all_('SalesReturns').filter(function (r) { return r.sale_id === s.id; });
  var retQty = {};
  var retIds = {}; returns.forEach(function (r) { if (r.status === 'active') retIds[r.id] = 1; });
  all_('SalesReturnItems').forEach(function (x) { if (retIds[x.return_id]) retQty[x.sale_item_id] = (retQty[x.sale_item_id] || 0) + x.qty; });
  var itemsOut = items.map(function (i) { var o = Object.assign({}, i); delete o._row; o.returned_qty = retQty[i.id] || 0; return o; });
  var out = { sale: s, items: itemsOut, customer: customer, returns: returns };
  if (customer) { out.customer = Object.assign({}, customer); out.customer.balance = customerBalances_()[customer.id] || 0; }
  if (!user || !can_(user, 'cost')) { out.sale = stripCost_(s, user || { role: 'sales' }); out.items = stripCost_(itemsOut, user || { role: 'sales' }); }
  return out;
}

function salesList_(p, user) {
  var q = String(p.q || '').toLowerCase(), items = {};
  all_('SaleItems').forEach(function (i) { (items[i.sale_id] = items[i.sale_id] || []).push(i.name + ' x' + i.qty + (i.serials ? ' [' + i.serials + ']' : '')); });
  var own = !can_(user, 'sales.all');
  var rows = all_('Sales').filter(function (x) {
    if (own && x.user_id !== user.id) return false;
    if (!inRange_(x.date, p.from, p.to)) return false;
    if (p.status && x.status !== p.status) return false;
    if (p.customer_id && x.customer_id !== p.customer_id) return false;
    if (p.user_id && x.user_id !== p.user_id) return false;
    if (p.only_due && !(x.due > 0.005)) return false;
    if (q && (x.invoice_no + ' ' + x.customer_name + ' ' + x.user_name + ' ' + (items[x.id] || []).join(' ')).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).sort(function (a, b) { return b._row - a._row; }).slice(0, num_(p.limit) || 500);
  var out = rows.map(function (x) { var o = Object.assign({}, x); delete o._row; o.items_text = (items[x.id] || []).join(', '); return o; });
  return stripCost_(out, user);
}

/* ============================================================================
 *  14. SALES RETURN / EXCHANGE
 * ========================================================================== */
function sreturnCreate_(p, user) {
  var sale = all_('Sales').filter(function (s) { return s.id === p.sale_id; })[0];
  if (!sale || sale.status !== 'active') fail_('Invoice not found or already cancelled');
  var pmap = indexBy_(all_('Products')), sidx = serialIndex_();
  var sitems = all_('SaleItems').filter(function (i) { return i.sale_id === sale.id; });
  var retIds = {}; all_('SalesReturns').forEach(function (r) { if (r.sale_id === sale.id && r.status === 'active') retIds[r.id] = 1; });
  var retQty = {}; all_('SalesReturnItems').forEach(function (x) { if (retIds[x.return_id]) retQty[x.sale_item_id] = (retQty[x.sale_item_id] || 0) + x.qty; });
  var ratio = sale.subtotal > 0 ? sale.total / sale.subtotal : 1, lines = [], total = 0, costTotal = 0;

  (p.items || []).forEach(function (it) {
    var qty = num_(it.qty); if (qty <= 0) return;
    var si = sitems.filter(function (x) { return x.id === it.sale_item_id; })[0]; if (!si) fail_('Invoice line not found');
    var remaining = si.qty - (retQty[si.id] || 0);
    if (qty > remaining + 1e-9) fail_('Return quantity for ' + si.name + ' exceeds what is returnable (' + remaining + ')');
    var sers = [], cost = 0;
    if (si.serials) {
      var sold = parseList_(si.serials); sers = splitSerials_(it.serials);
      if (sers.length !== qty) fail_('Select ' + qty + ' serial number(s) being returned for ' + si.name);
      sers.forEach(function (s) {
        var rec = sidx[si.product_id + '|' + s];
        if (sold.indexOf(s) < 0 || !rec || rec.status !== 'sold' || rec.sale_id !== sale.id) fail_('Serial ' + s + ' cannot be returned on this invoice');
        cost += rec.cost;
      });
    } else cost = si.cost * qty / si.qty;
    var value = round_(qty * si.price * ratio);
    lines.push({ si: si, pr: pmap[si.product_id], qty: qty, value: value, cost: round_(cost, 4), serials: sers });
    total += value; costTotal += cost;
  });
  if (!lines.length) fail_('Select at least one item to return');
  total = round_(total);

  var rf = p.refund || {}, refund = 0, accId = '';
  if (rf.mode === 'adjust') {
    if (!sale.customer_id) fail_('Walk-in invoices must be refunded from an account');
  } else {
    accId = rf.account_id; refund = round_(rf.amount === undefined ? total : rf.amount);
    if (!all_('Accounts').some(function (a) { return a.id === accId && a.active; })) fail_('Select the account used for the refund');
    if (refund <= 0 || refund > total + 0.005) fail_('Refund must be between 0 and ' + total);
    if (!sale.customer_id && Math.abs(refund - total) > 0.005) fail_('Walk-in returns must be refunded in full');
  }

  var no = nextNo_('seq_sreturn', 'SR-'), date = today_();
  var ret = insert_('SalesReturns', {
    return_no: no, date: date, sale_id: sale.id, invoice_no: sale.invoice_no, customer_id: sale.customer_id, customer_name: sale.customer_name,
    type: p.type === 'exchange' ? 'exchange' : 'return', total: total, cost: round_(costTotal), refund: refund, refund_account_id: accId,
    note: p.note || '', status: 'active', user: user.name, created_at: now_()
  });
  insertMany_('SalesReturnItems', lines.map(function (l) {
    return { return_id: ret.id, sale_item_id: l.si.id, product_id: l.si.product_id, name: l.si.name, qty: l.qty, price: l.si.price, cost: l.cost, total: l.value, serials: l.serials.join(',') };
  }));
  var events = [];
  lines.forEach(function (l) {
    update_('Products', l.pr.id, { stock: round_(l.pr.stock + l.qty, 4) });
    l.serials.forEach(function (s) {
      update_('SerialItems', sidx[l.pr.id + '|' + s].id, { status: 'in_stock', sale_id: '' });
      events.push({ serial: s, product_id: l.pr.id, product_name: l.pr.name, event: 'sale_return', ref_type: 'sreturn', ref_id: ret.id, ref_no: no, party: sale.customer_name, qty: 1, amount: l.si.price, note: 'Returned from ' + sale.invoice_no });
    });
    if (!l.serials.length) events.push({ serial: '', product_id: l.pr.id, product_name: l.pr.name, event: 'sale_return', ref_type: 'sreturn', ref_id: ret.id, ref_no: no, party: sale.customer_name, qty: l.qty, amount: l.value, note: 'Returned from ' + sale.invoice_no });
  });
  if (refund > 0) acctTxn_(accId, 'out', refund, 'sreturn', ret.id, 'Refund ' + no, user, date);
  if (sale.customer_id) insert_('CustomerLedger', { date: date, customer_id: sale.customer_id, type: 'sreturn', ref_id: ret.id, ref_no: no, debit: refund, credit: total, note: (ret.type === 'exchange' ? 'Exchange ' : 'Return ') + no + ' (' + sale.invoice_no + ')', voided: false });
  evBatch_(user, events);
  audit_(user, 'sreturn_create', no);
  return { return: ret, items: lines.map(function (l) { return { name: l.si.name, qty: l.qty, total: l.value }; }) };
}

function sreturnsList_(p) {
  var q = String(p.q || '').toLowerCase();
  return all_('SalesReturns').filter(function (r) {
    return inRange_(r.date, p.from, p.to) && (!p.status || r.status === p.status) && (!q || (r.return_no + ' ' + r.invoice_no + ' ' + r.customer_name).toLowerCase().indexOf(q) >= 0);
  }).sort(function (a, b) { return b._row - a._row; }).slice(0, 500).map(function (r) {
    var o = Object.assign({}, r); delete o._row;
    o.items_text = all_('SalesReturnItems').filter(function (i) { return i.return_id === r.id; }).map(function (i) { return i.name + ' x' + i.qty; }).join(', ');
    return o;
  });
}

/* ============================================================================
 *  15. PURCHASE RETURN
 * ========================================================================== */
function preturnCreate_(p, user) {
  var pur = all_('Purchases').filter(function (x) { return x.id === p.purchase_id; })[0];
  if (!pur || pur.status !== 'active') fail_('Purchase not found or cancelled');
  var pmap = indexBy_(all_('Products')), sidx = serialIndex_();
  var pitems = all_('PurchaseItems').filter(function (i) { return i.purchase_id === pur.id; });
  var retIds = {}; all_('PurchaseReturns').forEach(function (r) { if (r.purchase_id === pur.id && r.status === 'active') retIds[r.id] = 1; });
  var retQty = {}; all_('PurchaseReturnItems').forEach(function (x) { if (retIds[x.return_id]) retQty[x.purchase_item_id] = (retQty[x.purchase_item_id] || 0) + x.qty; });
  var ratio = pur.subtotal > 0 ? pur.total / pur.subtotal : 1, lines = [], total = 0;

  (p.items || []).forEach(function (it) {
    var qty = num_(it.qty); if (qty <= 0) return;
    var pi = pitems.filter(function (x) { return x.id === it.purchase_item_id; })[0]; if (!pi) fail_('Purchase line not found');
    var remaining = pi.qty - (retQty[pi.id] || 0);
    if (qty > remaining + 1e-9) fail_('Return quantity for ' + pi.name + ' exceeds what is returnable (' + remaining + ')');
    var pr = pmap[pi.product_id];
    if (pr.stock < qty - 1e-9) fail_('Only ' + pr.stock + ' of ' + pr.name + ' left in stock — cannot return ' + qty);
    var sers = [];
    if (pi.serials) {
      var bought = parseList_(pi.serials); sers = splitSerials_(it.serials);
      if (sers.length !== qty) fail_('Select ' + qty + ' serial number(s) to return for ' + pi.name);
      sers.forEach(function (s) {
        var rec = sidx[pi.product_id + '|' + s];
        if (bought.indexOf(s) < 0 || !rec || rec.status !== 'in_stock') fail_('Serial ' + s + ' is not in stock — it cannot be returned to the supplier');
      });
    }
    var value = round_(qty * pi.cost * ratio);
    lines.push({ pi: pi, pr: pr, qty: qty, value: value, serials: sers }); total += value;
  });
  if (!lines.length) fail_('Select at least one item to return');
  total = round_(total);

  var rf = p.refund || {}, received = 0, accId = '';
  if (rf.mode !== 'adjust') {
    accId = rf.account_id; received = round_(rf.amount === undefined ? total : rf.amount);
    if (!all_('Accounts').some(function (a) { return a.id === accId && a.active; })) fail_('Select the account that received the refund');
    if (received <= 0 || received > total + 0.005) fail_('Refund must be between 0 and ' + total);
  } else if (!pur.supplier_id) fail_('This purchase has no supplier — record the refund against an account');

  var no = nextNo_('seq_preturn', 'PR-'), date = today_();
  var ret = insert_('PurchaseReturns', {
    return_no: no, date: date, purchase_id: pur.id, invoice_no: pur.invoice_no, supplier_id: pur.supplier_id, supplier_name: pur.supplier_name,
    total: total, received: received, account_id: accId, note: p.note || '', status: 'active', user: user.name, created_at: now_()
  });
  insertMany_('PurchaseReturnItems', lines.map(function (l) {
    return { return_id: ret.id, purchase_item_id: l.pi.id, product_id: l.pi.product_id, name: l.pi.name, qty: l.qty, cost: l.pi.cost, total: l.value, serials: l.serials.join(',') };
  }));
  var events = [];
  lines.forEach(function (l) {
    update_('Products', l.pr.id, { stock: round_(l.pr.stock - l.qty, 4) });
    l.serials.forEach(function (s) {
      update_('SerialItems', sidx[l.pr.id + '|' + s].id, { status: 'returned_supplier' });
      events.push({ serial: s, product_id: l.pr.id, product_name: l.pr.name, event: 'purchase_return', ref_type: 'preturn', ref_id: ret.id, ref_no: no, party: pur.supplier_name, qty: 1, amount: l.pi.cost, note: 'Returned to supplier from ' + pur.invoice_no });
    });
    if (!l.serials.length) events.push({ serial: '', product_id: l.pr.id, product_name: l.pr.name, event: 'purchase_return', ref_type: 'preturn', ref_id: ret.id, ref_no: no, party: pur.supplier_name, qty: l.qty, amount: l.value, note: 'Returned to supplier from ' + pur.invoice_no });
  });
  if (received > 0) acctTxn_(accId, 'in', received, 'preturn', ret.id, 'Supplier refund ' + no, user, date);
  if (pur.supplier_id) insert_('SupplierLedger', { date: date, supplier_id: pur.supplier_id, type: 'preturn', ref_id: ret.id, ref_no: no, debit: total, credit: received, note: 'Purchase return ' + no + ' (' + pur.invoice_no + ')', voided: false });
  evBatch_(user, events);
  audit_(user, 'preturn_create', no);
  return { return: ret };
}
function preturnsList_(p) {
  var q = String(p.q || '').toLowerCase();
  return all_('PurchaseReturns').filter(function (r) {
    return inRange_(r.date, p.from, p.to) && (!p.status || r.status === p.status) && (!q || (r.return_no + ' ' + r.invoice_no + ' ' + r.supplier_name).toLowerCase().indexOf(q) >= 0);
  }).sort(function (a, b) { return b._row - a._row; }).slice(0, 500).map(function (r) {
    var o = Object.assign({}, r); delete o._row;
    o.items_text = all_('PurchaseReturnItems').filter(function (i) { return i.return_id === r.id; }).map(function (i) { return i.name + ' x' + i.qty; }).join(', ');
    return o;
  });
}

/* ============================================================================
 *  16. PAYMENTS (customer due collection / supplier payments) & EXPENSES
 * ========================================================================== */
function customerPayment_(p, user) {
  var c = all_('Customers').filter(function (x) { return x.id === p.customer_id; })[0]; if (!c) fail_('Customer not found');
  var amt = round_(p.amount); if (amt <= 0) fail_('Amount must be greater than 0');
  var acc = all_('Accounts').filter(function (a) { return a.id === p.account_id && a.active; })[0]; if (!acc) fail_('Select an account');
  var pay = p.direction === 'pay'; // pay = we hand money to the customer (refund of advance)
  var ref = uid_(), date = p.date || today_(), no = nextNo_('seq_cpay', 'CP-');
  acctTxn_(acc.id, pay ? 'out' : 'in', amt, 'cpay', ref, (pay ? 'Paid to ' : 'Collection from ') + c.name, user, date);
  var row = insert_('CustomerLedger', { date: date, customer_id: c.id, type: pay ? 'refund' : 'payment', ref_id: ref, ref_no: no, debit: pay ? amt : 0, credit: pay ? 0 : amt, note: (p.note || '') + ' [' + acc.name + ']', voided: false });
  audit_(user, 'customer_payment', { customer: c.name, amount: amt });
  var bal = customerBalances_()[c.id];
  return { entry: row, balance: bal, receipt_no: no, customer: c.name, account: acc.name, amount: amt };
}
function supplierPayment_(p, user) {
  var s = all_('Suppliers').filter(function (x) { return x.id === p.supplier_id; })[0]; if (!s) fail_('Supplier not found');
  var amt = round_(p.amount); if (amt <= 0) fail_('Amount must be greater than 0');
  var acc = all_('Accounts').filter(function (a) { return a.id === p.account_id && a.active; })[0]; if (!acc) fail_('Select an account');
  var recv = p.direction === 'receive';
  var ref = uid_(), date = p.date || today_(), no = nextNo_('seq_spay', 'SP-');
  acctTxn_(acc.id, recv ? 'in' : 'out', amt, 'spay', ref, (recv ? 'Received from ' : 'Paid to ') + s.name, user, date);
  var row = insert_('SupplierLedger', { date: date, supplier_id: s.id, type: recv ? 'refund' : 'payment', ref_id: ref, ref_no: no, debit: recv ? 0 : amt, credit: recv ? amt : 0, note: (p.note || '') + ' [' + acc.name + ']', voided: false });
  audit_(user, 'supplier_payment', { supplier: s.name, amount: amt });
  return { entry: row, balance: supplierBalances_()[s.id], receipt_no: no };
}
function statement_(table, key, parties, sign, p) {
  var party = parties.filter(function (x) { return x.id === p[key]; })[0]; if (!party) fail_('Not found');
  var rows = all_(table).filter(function (l) { return l[key] === party.id && !l.voided; }).sort(function (a, b) { return a._row - b._row; });
  var run = party.opening_balance, opening = party.opening_balance, out = [];
  rows.forEach(function (l) {
    if (p.from && l.date < p.from) { run += sign * (l.debit - l.credit); opening = run; return; }
    if (p.to && l.date > p.to) return;
    run += sign * (l.debit - l.credit);
    out.push({ id: l.id, date: l.date, type: l.type, ref_no: l.ref_no, note: l.note, debit: l.debit, credit: l.credit, balance: round_(run) });
  });
  return { party: party.name, phones: party.phones, address: party.addresses || party.address || '', opening: round_(opening), closing: round_(run), rows: out };
}
function customerStatement_(p) { return statement_('CustomerLedger', 'customer_id', all_('Customers'), 1, p); }
function supplierStatement_(p) { return statement_('SupplierLedger', 'supplier_id', all_('Suppliers'), -1, p); }

function expenseCreate_(p, user) {
  var amt = round_(p.amount); if (amt <= 0) fail_('Amount must be greater than 0');
  var cat = String(p.category || '').trim(); if (!cat) fail_('Select an expense category');
  var acc = all_('Accounts').filter(function (a) { return a.id === p.account_id && a.active; })[0]; if (!acc) fail_('Select the account used for payment');
  var date = p.date || today_();
  var e = insert_('Expenses', { date: date, category: cat, amount: amt, account_id: acc.id, note: p.note || '', user: user.name, status: 'active', created_at: now_() });
  acctTxn_(acc.id, 'out', amt, 'expense', e.id, 'Expense: ' + cat + (p.note ? ' — ' + p.note : ''), user, date);
  return e;
}
function expensesList_(p) {
  var accs = indexBy_(all_('Accounts'));
  return all_('Expenses').filter(function (e) { return inRange_(e.date, p.from, p.to) && (!p.category || e.category === p.category) && (!p.status || e.status === p.status); })
    .sort(function (a, b) { return b._row - a._row; }).slice(0, 1000)
    .map(function (e) { var o = Object.assign({}, e); delete o._row; o.account_name = accs[e.account_id] ? accs[e.account_id].name : ''; return o; });
}

/* ============================================================================
 *  17. REVERSAL / CANCELLATION  (admin authorised)
 * ========================================================================== */
function reverse_(p, user) {
  need_(user, 'cancel');
  confirmAdmin_(user, p.password);
  var reason = String(p.reason || '').trim(); if (!reason) fail_('Enter a reason for the cancellation');
  var fn = { sale: reverseSale_, purchase: reversePurchase_, sreturn: reverseSreturn_, preturn: reversePreturn_, cpay: reversePayment_, spay: reversePayment_, expense: reverseExpense_ }[p.type];
  if (!fn) fail_('Unknown transaction type');
  var r = fn(p, user, reason);
  audit_(user, 'reverse_' + p.type, { id: p.id, reason: reason });
  return r;
}
function evFor_(rows, event, refType, refId, refNo, party, note, sers) {
  return rows.map(function (x) { return { serial: x.serial || '', product_id: x.product_id, product_name: x.name, event: event, ref_type: refType, ref_id: refId, ref_no: refNo, party: party, qty: x.qty || 1, amount: 0, note: note }; });
}

function reverseSale_(p, user, reason) {
  var s = all_('Sales').filter(function (x) { return x.id === p.id; })[0];
  if (!s) fail_('Invoice not found'); if (s.status !== 'active') fail_('Invoice is already cancelled');
  if (all_('SalesReturns').some(function (r) { return r.sale_id === s.id && r.status === 'active'; })) fail_('Cancel the return(s) of this invoice first');
  if (all_('WarrantyClaims').some(function (c) { return c.sale_id === s.id && c.status !== 'Delivered' && c.status !== 'Rejected'; })) fail_('This invoice has open warranty claims');
  var pmap = indexBy_(all_('Products')), sidx = serialIndex_(), events = [];
  all_('SaleItems').filter(function (i) { return i.sale_id === s.id; }).forEach(function (i) {
    var pr = pmap[i.product_id]; if (pr) update_('Products', pr.id, { stock: round_(pr.stock + i.qty, 4) });
    parseList_(i.serials).forEach(function (sn) {
      var rec = sidx[i.product_id + '|' + sn]; if (rec && rec.sale_id === s.id) update_('SerialItems', rec.id, { status: 'in_stock', sale_id: '' });
      events.push({ serial: sn, product_id: i.product_id, product_name: i.name, event: 'sale_cancelled', ref_type: 'sale', ref_id: s.id, ref_no: s.invoice_no, party: s.customer_name, qty: 1, amount: 0, note: 'Invoice cancelled: ' + reason });
    });
    if (!i.serials) events.push({ serial: '', product_id: i.product_id, product_name: i.name, event: 'sale_cancelled', ref_type: 'sale', ref_id: s.id, ref_no: s.invoice_no, party: s.customer_name, qty: i.qty, amount: 0, note: 'Invoice cancelled: ' + reason });
  });
  voidRefs_('AccountTxns', s.id, 'sale'); voidRefs_('CustomerLedger', s.id);
  update_('Sales', s.id, { status: 'cancelled', cancel_reason: reason });
  evBatch_(user, events);
  return true;
}
function reversePurchase_(p, user, reason) {
  var pur = all_('Purchases').filter(function (x) { return x.id === p.id; })[0];
  if (!pur) fail_('Purchase not found'); if (pur.status !== 'active') fail_('Purchase is already cancelled');
  if (all_('PurchaseReturns').some(function (r) { return r.purchase_id === pur.id && r.status === 'active'; })) fail_('Cancel the return(s) of this purchase first');
  var pmap = indexBy_(all_('Products')), sidx = serialIndex_(), items = all_('PurchaseItems').filter(function (i) { return i.purchase_id === pur.id; });
  items.forEach(function (i) {
    var pr = pmap[i.product_id];
    if (pr && pr.stock < i.qty - 1e-9) fail_('Cannot cancel: ' + i.name + ' has already been sold (only ' + pr.stock + ' in stock)');
    parseList_(i.serials).forEach(function (sn) {
      var rec = sidx[i.product_id + '|' + sn];
      if (!rec || rec.status !== 'in_stock' || rec.purchase_id !== pur.id) fail_('Cannot cancel: serial ' + sn + ' is no longer in stock');
    });
  });
  var events = [];
  items.forEach(function (i) {
    var pr = pmap[i.product_id]; if (pr) update_('Products', pr.id, { stock: round_(pr.stock - i.qty, 4) });
    parseList_(i.serials).forEach(function (sn) {
      update_('SerialItems', sidx[i.product_id + '|' + sn].id, { status: 'cancelled' });
      events.push({ serial: sn, product_id: i.product_id, product_name: i.name, event: 'purchase_cancelled', ref_type: 'purchase', ref_id: pur.id, ref_no: pur.invoice_no, party: pur.supplier_name, qty: 1, amount: 0, note: 'Purchase cancelled: ' + reason });
    });
    if (!i.serials) events.push({ serial: '', product_id: i.product_id, product_name: i.name, event: 'purchase_cancelled', ref_type: 'purchase', ref_id: pur.id, ref_no: pur.invoice_no, party: pur.supplier_name, qty: i.qty, amount: 0, note: 'Purchase cancelled: ' + reason });
  });
  delete _mem.__serialIdx;
  voidRefs_('AccountTxns', pur.id, 'purchase'); voidRefs_('SupplierLedger', pur.id);
  update_('Purchases', pur.id, { status: 'cancelled', cancel_reason: reason });
  evBatch_(user, events);
  return true;
}
function reverseSreturn_(p, user, reason) {
  var r = all_('SalesReturns').filter(function (x) { return x.id === p.id; })[0];
  if (!r) fail_('Return not found'); if (r.status !== 'active') fail_('Return is already cancelled');
  var pmap = indexBy_(all_('Products')), sidx = serialIndex_(), items = all_('SalesReturnItems').filter(function (i) { return i.return_id === r.id; });
  items.forEach(function (i) {
    var pr = pmap[i.product_id];
    if (pr.stock < i.qty - 1e-9) fail_('Cannot cancel: ' + i.name + ' returned stock has already been sold again');
    parseList_(i.serials).forEach(function (sn) { var rec = sidx[i.product_id + '|' + sn]; if (!rec || rec.status !== 'in_stock') fail_('Cannot cancel: serial ' + sn + ' is no longer in stock'); });
  });
  var events = [];
  items.forEach(function (i) {
    var pr = pmap[i.product_id]; update_('Products', pr.id, { stock: round_(pr.stock - i.qty, 4) });
    parseList_(i.serials).forEach(function (sn) {
      update_('SerialItems', sidx[i.product_id + '|' + sn].id, { status: 'sold', sale_id: r.sale_id });
      events.push({ serial: sn, product_id: i.product_id, product_name: i.name, event: 'return_cancelled', ref_type: 'sreturn', ref_id: r.id, ref_no: r.return_no, party: r.customer_name, qty: 1, amount: 0, note: 'Sales return cancelled: ' + reason });
    });
    if (!i.serials) events.push({ serial: '', product_id: i.product_id, product_name: i.name, event: 'return_cancelled', ref_type: 'sreturn', ref_id: r.id, ref_no: r.return_no, party: r.customer_name, qty: i.qty, amount: 0, note: 'Sales return cancelled: ' + reason });
  });
  voidRefs_('AccountTxns', r.id, 'sreturn'); voidRefs_('CustomerLedger', r.id);
  update_('SalesReturns', r.id, { status: 'cancelled', cancel_reason: reason });
  evBatch_(user, events);
  return true;
}
function reversePreturn_(p, user, reason) {
  var r = all_('PurchaseReturns').filter(function (x) { return x.id === p.id; })[0];
  if (!r) fail_('Return not found'); if (r.status !== 'active') fail_('Return is already cancelled');
  var pmap = indexBy_(all_('Products')), sidx = serialIndex_(), events = [];
  all_('PurchaseReturnItems').filter(function (i) { return i.return_id === r.id; }).forEach(function (i) {
    var pr = pmap[i.product_id]; update_('Products', pr.id, { stock: round_(pr.stock + i.qty, 4) });
    parseList_(i.serials).forEach(function (sn) {
      var rec = sidx[i.product_id + '|' + sn]; if (rec) update_('SerialItems', rec.id, { status: 'in_stock' });
      events.push({ serial: sn, product_id: i.product_id, product_name: i.name, event: 'return_cancelled', ref_type: 'preturn', ref_id: r.id, ref_no: r.return_no, party: r.supplier_name, qty: 1, amount: 0, note: 'Purchase return cancelled: ' + reason });
    });
    if (!i.serials) events.push({ serial: '', product_id: i.product_id, product_name: i.name, event: 'return_cancelled', ref_type: 'preturn', ref_id: r.id, ref_no: r.return_no, party: r.supplier_name, qty: i.qty, amount: 0, note: 'Purchase return cancelled: ' + reason });
  });
  voidRefs_('AccountTxns', r.id, 'preturn'); voidRefs_('SupplierLedger', r.id);
  update_('PurchaseReturns', r.id, { status: 'cancelled', cancel_reason: reason });
  evBatch_(user, events);
  return true;
}
function reversePayment_(p, user, reason) {
  var table = p.type === 'cpay' ? 'CustomerLedger' : 'SupplierLedger', refType = p.type;
  var row = all_(table).filter(function (x) { return x.id === p.id; })[0];
  if (!row || row.voided) fail_('Payment not found or already cancelled');
  if (row.type !== 'payment' && row.type !== 'refund') fail_('Only payment entries can be cancelled here');
  voidRefs_('AccountTxns', row.ref_id, refType); voidRefs_(table, row.ref_id);
  return true;
}
function reverseExpense_(p, user, reason) {
  var e = all_('Expenses').filter(function (x) { return x.id === p.id; })[0];
  if (!e) fail_('Expense not found'); if (e.status !== 'active') fail_('Expense already cancelled');
  voidRefs_('AccountTxns', e.id, 'expense');
  update_('Expenses', e.id, { status: 'cancelled', cancel_reason: reason });
  return true;
}

/* ============================================================================
 *  18. WARRANTY CLAIMS & LOOKUP
 * ========================================================================== */
var CLAIM_STATUSES = ['Pending', 'Sent to Vendor', 'Repaired', 'Replaced', 'Delivered', 'Rejected'];

function daysBetween_(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }

/** Find sold items (with warranty info) by serial / invoice / product barcode. */
function warrantyLookup_(p) {
  var q = String(p.q || '').trim(); if (!q) fail_('Enter a serial number or invoice number');
  var today = today_(), sales = indexBy_(all_('Sales')), out = [];
  var claims = all_('WarrantyClaims');
  function build(si, sale, serial) {
    var exp = si.warranty_expiry, left = exp ? daysBetween_(today, exp) : null;
    out.push({
      sale_id: sale.id, sale_item_id: si.id, invoice_no: sale.invoice_no, sale_date: sale.date, customer_id: sale.customer_id, customer_name: sale.customer_name,
      product_id: si.product_id, product_name: si.name, serial: serial || '', warranty_type: si.warranty_type, warranty_days: si.warranty_days,
      expiry: exp, in_warranty: !!exp && left >= 0, days_left: left, sale_status: sale.status,
      claims: claims.filter(function (c) { return c.sale_id === sale.id && c.product_id === si.product_id && (!serial || c.serial === serial); }).map(function (c) { return { id: c.id, claim_no: c.claim_no, status: c.status, date: c.date }; })
    });
  }
  var sidx = all_('SerialItems').filter(function (s) { return s.serial.toLowerCase() === q.toLowerCase() && s.status === 'sold'; });
  if (sidx.length) {
    sidx.forEach(function (s) {
      var sale = sales[s.sale_id]; if (!sale) return;
      all_('SaleItems').filter(function (i) { return i.sale_id === sale.id && i.product_id === s.product_id && parseList_(i.serials).indexOf(s.serial) >= 0; }).forEach(function (si) { build(si, sale, s.serial); });
    });
    return out;
  }
  var sale = all_('Sales').filter(function (s) { return s.invoice_no.toLowerCase() === q.toLowerCase() || s.id === q; })[0];
  if (sale) {
    all_('SaleItems').filter(function (i) { return i.sale_id === sale.id && i.warranty_type; }).forEach(function (si) {
      var sers = parseList_(si.serials);
      if (sers.length) sers.forEach(function (sn) { build(si, sale, sn); }); else build(si, sale, '');
    });
  }
  return out;
}

function claimCreate_(p, user) {
  var sale = all_('Sales').filter(function (s) { return s.id === p.sale_id; })[0]; if (!sale) fail_('Invoice not found');
  var si = all_('SaleItems').filter(function (i) { return i.id === p.sale_item_id && i.sale_id === sale.id; })[0]; if (!si) fail_('Invoice line not found');
  var serial = String(p.serial || '').trim();
  if (parseList_(si.serials).length && parseList_(si.serials).indexOf(serial) < 0) fail_('Select the serial number being claimed');
  if (all_('WarrantyClaims').some(function (c) { return c.sale_id === sale.id && c.product_id === si.product_id && c.serial === serial && c.status !== 'Delivered' && c.status !== 'Rejected'; }))
    fail_('An open claim already exists for this item');
  var cust = sale.customer_id ? all_('Customers').filter(function (c) { return c.id === sale.customer_id; })[0] : null;
  var inW = !!si.warranty_expiry && si.warranty_expiry >= today_();
  var no = nextNo_('seq_claim', 'WC-');
  var log = [{ ts: now_(), status: 'Pending', note: (p.issue || 'Item received for warranty') + (inW ? '' : ' (OUT OF WARRANTY)'), user: user.name }];
  var c = insert_('WarrantyClaims', {
    claim_no: no, date: today_(), serial: serial, sale_id: sale.id, invoice_no: sale.invoice_no, product_id: si.product_id, product_name: si.name,
    customer_id: sale.customer_id, customer_name: sale.customer_name, phone: p.phone || (cust ? parseList_(cust.phones)[0] || '' : ''),
    issue: p.issue || '', expiry: si.warranty_expiry, in_warranty: inW, status: 'Pending', vendor: '', log: log, delivered_date: '', updated_at: now_()
  });
  evBatch_(user, [{ serial: serial, product_id: si.product_id, product_name: si.name, event: 'warranty_in', ref_type: 'claim', ref_id: c.id, ref_no: no, party: sale.customer_name, qty: 1, amount: 0, note: p.issue || 'Warranty claim received' }]);
  return c;
}
function claimUpdate_(p, user) {
  var c = all_('WarrantyClaims').filter(function (x) { return x.id === p.id; })[0]; if (!c) fail_('Claim not found');
  if (CLAIM_STATUSES.indexOf(p.status) < 0) fail_('Invalid status');
  var log = []; try { log = JSON.parse(c.log || '[]'); } catch (e) {}
  log.push({ ts: now_(), status: p.status, note: p.note || '', user: user.name });
  var patch = { status: p.status, log: log, updated_at: now_() };
  if (p.vendor !== undefined && p.vendor !== null) patch.vendor = p.vendor;
  if (p.status === 'Delivered') patch.delivered_date = today_();
  var r = update_('WarrantyClaims', c.id, patch);
  evBatch_(user, [{ serial: c.serial, product_id: c.product_id, product_name: c.product_name, event: 'warranty_' + p.status.toLowerCase().replace(/\s+/g, '_'), ref_type: 'claim', ref_id: c.id, ref_no: c.claim_no, party: p.vendor || c.vendor || c.customer_name, qty: 1, amount: 0, note: p.note || p.status }]);
  return r;
}
function claimsList_(p) {
  var q = String(p.q || '').toLowerCase();
  return all_('WarrantyClaims').filter(function (c) {
    if (!inRange_(c.date, p.from, p.to)) return false;
    if (p.status === 'open') { if (c.status === 'Delivered' || c.status === 'Rejected') return false; }
    else if (p.status && c.status !== p.status) return false;
    return !q || (c.claim_no + ' ' + c.serial + ' ' + c.invoice_no + ' ' + c.product_name + ' ' + c.customer_name + ' ' + c.phone).toLowerCase().indexOf(q) >= 0;
  }).sort(function (a, b) { return b._row - a._row; }).slice(0, 500).map(function (c) { var o = Object.assign({}, c); delete o._row; try { o.log = JSON.parse(c.log || '[]'); } catch (e) { o.log = []; } return o; });
}

/* ============================================================================
 *  19. ITEM HISTORY EXPLORER (serial / barcode / invoice life-cycle)
 * ========================================================================== */
function itemHistory_(p, user) {
  var q = String(p.q || '').trim(); if (!q) fail_('Enter a serial number, barcode or invoice number');
  var ql = q.toLowerCase(), events = all_('ItemEvents'), res = { query: q, kind: 'none', summary: null, items: [], timeline: [], claims: [], returns: [] };
  var pmap = indexBy_(all_('Products')), sales = indexBy_(all_('Sales')), purs = indexBy_(all_('Purchases'));
  function cleanEv(e) { return { id: e.id, ts: e.ts, event: e.event, serial: e.serial, product_name: e.product_name, ref_no: e.ref_no, ref_type: e.ref_type, ref_id: e.ref_id, party: e.party, qty: e.qty, amount: e.amount, note: e.note, user: e.user }; }
  function sortEv(list) { return list.sort(function (a, b) { return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0; }); }

  // 1) Serial number
  var serialRecs = all_('SerialItems').filter(function (s) { return s.serial.toLowerCase() === ql && s.status !== 'cancelled'; });
  if (serialRecs.length) {
    res.kind = 'serial';
    var rec = serialRecs[serialRecs.length - 1], pr = pmap[rec.product_id] || {};
    var pur = purs[rec.purchase_id], sale = rec.sale_id ? sales[rec.sale_id] : null, si = null;
    if (sale) si = all_('SaleItems').filter(function (i) { return i.sale_id === sale.id && i.product_id === rec.product_id && parseList_(i.serials).indexOf(rec.serial) >= 0; })[0];
    var inDate = pur ? pur.date : String(rec.created_at).slice(0, 10), outDate = sale ? sale.date : today_();
    var exp = si ? si.warranty_expiry : '';
    res.summary = {
      serial: rec.serial, product: pr.name || '', status: rec.status, purchase_invoice: pur ? pur.invoice_no : '', supplier: pur ? pur.supplier_name : '',
      purchase_date: inDate, cost: can_(user, 'cost') ? rec.cost : undefined, sale_invoice: sale ? sale.invoice_no : '', customer: sale ? sale.customer_name : '',
      sale_date: sale ? sale.date : '', sale_price: si ? si.price : undefined, warranty_expiry: exp, in_warranty: !!exp && exp >= today_(), days_left: exp ? daysBetween_(today_(), exp) : null,
      days_in_inventory: daysBetween_(inDate, outDate)
    };
    var ids = {}; serialRecs.forEach(function (s) { ids[s.product_id] = 1; });
    res.timeline = sortEv(events.filter(function (e) { return e.serial.toLowerCase() === ql; }).map(cleanEv));
    res.claims = all_('WarrantyClaims').filter(function (c) { return c.serial.toLowerCase() === ql; }).map(function (c) { var o = Object.assign({}, c); delete o._row; try { o.log = JSON.parse(c.log || '[]'); } catch (e) { o.log = []; } return o; });
    return res;
  }

  // 2) Invoice (sale or purchase)
  var sl = all_('Sales').filter(function (s) { return s.invoice_no.toLowerCase() === ql; })[0];
  if (sl) {
    if (!can_(user, 'sales.all') && sl.user_id !== user.id) fail_('Permission denied: this invoice belongs to another user');
    res.kind = 'sale_invoice';
    var its = all_('SaleItems').filter(function (i) { return i.sale_id === sl.id; });
    res.summary = { invoice: sl.invoice_no, date: sl.date, customer: sl.customer_name, total: sl.total, paid: sl.paid, due: sl.due, status: sl.status, staff: sl.user_name };
    res.items = its.map(function (i) { return { name: i.name, qty: i.qty, price: i.price, serials: i.serials, warranty_expiry: i.warranty_expiry, warranty_type: i.warranty_type }; });
    var sers = {}; its.forEach(function (i) { parseList_(i.serials).forEach(function (s) { sers[s] = 1; }); });
    res.timeline = sortEv(events.filter(function (e) { return e.ref_id === sl.id || (e.serial && sers[e.serial]); }).map(cleanEv));
    res.returns = all_('SalesReturns').filter(function (r) { return r.sale_id === sl.id; }).map(function (r) { return { return_no: r.return_no, date: r.date, total: r.total, status: r.status }; });
    res.claims = all_('WarrantyClaims').filter(function (c) { return c.sale_id === sl.id; }).map(function (c) { return { claim_no: c.claim_no, serial: c.serial, product_name: c.product_name, status: c.status, date: c.date, log: (function () { try { return JSON.parse(c.log || '[]'); } catch (e) { return []; } })() }; });
    return res;
  }
  var pu = all_('Purchases').filter(function (s) { return s.invoice_no.toLowerCase() === ql; })[0];
  if (pu) {
    res.kind = 'purchase_invoice';
    var pits = all_('PurchaseItems').filter(function (i) { return i.purchase_id === pu.id; });
    res.summary = { invoice: pu.invoice_no, date: pu.date, supplier: pu.supplier_name, total: pu.total, paid: pu.paid, due: pu.due, status: pu.status };
    res.items = pits.map(function (i) { return { name: i.name, qty: i.qty, cost: can_(user, 'cost') ? i.cost : undefined, serials: i.serials }; });
    var ps = {}; pits.forEach(function (i) { parseList_(i.serials).forEach(function (s) { ps[s] = 1; }); });
    res.timeline = sortEv(events.filter(function (e) { return e.ref_id === pu.id || (e.serial && ps[e.serial]); }).map(cleanEv));
    return res;
  }

  // 3) Product barcode / SKU / exact name
  var prod = all_('Products').filter(function (x) { return (x.barcode && x.barcode.toLowerCase() === ql) || (x.sku && x.sku.toLowerCase() === ql) || x.name.toLowerCase() === ql; })[0];
  if (prod) {
    res.kind = 'product';
    var srs = all_('SerialItems').filter(function (s) { return s.product_id === prod.id && s.status !== 'cancelled'; });
    var counts = {}; srs.forEach(function (s) { counts[s.status] = (counts[s.status] || 0) + 1; });
    res.summary = { product: prod.name, barcode: prod.barcode, sku: prod.sku, stock: prod.stock, unit: prod.unit, serials_in_stock: counts.in_stock || 0, serials_sold: counts.sold || 0, serials_returned_supplier: counts.returned_supplier || 0 };
    res.items = srs.slice(-300).map(function (s) { return { serial: s.serial, status: s.status, sale_invoice: s.sale_id && sales[s.sale_id] ? sales[s.sale_id].invoice_no : '', purchase_invoice: purs[s.purchase_id] ? purs[s.purchase_id].invoice_no : '' }; });
    res.timeline = sortEv(events.filter(function (e) { return e.product_id === prod.id; }).slice(-300).map(cleanEv));
    return res;
  }
  return res;
}
