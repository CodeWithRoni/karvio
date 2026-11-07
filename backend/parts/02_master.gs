/* ============================================================================
 *  4. BALANCES & SHARED HELPERS
 * ========================================================================== */
function accountBalances_() {
  var bal = {};
  all_('Accounts').forEach(function (a) { bal[a.id] = a.opening_balance; });
  all_('AccountTxns').forEach(function (t) {
    if (t.voided || bal[t.account_id] === undefined) return;
    bal[t.account_id] += t.direction === 'in' ? t.amount : -t.amount;
  });
  Object.keys(bal).forEach(function (k) { bal[k] = round_(bal[k]); });
  return bal;
}
/** Customer: + means customer owes us. Supplier: + means we owe supplier. */
function partyBalances_(ledger, key, parties, sign) {
  var bal = {};
  parties.forEach(function (p) { bal[p.id] = p.opening_balance; });
  all_(ledger).forEach(function (l) {
    if (l.voided || bal[l[key]] === undefined) return;
    bal[l[key]] += sign * (l.debit - l.credit);
  });
  Object.keys(bal).forEach(function (k) { bal[k] = round_(bal[k]); });
  return bal;
}
function customerBalances_() { return partyBalances_('CustomerLedger', 'customer_id', all_('Customers'), 1); }
function supplierBalances_() { return partyBalances_('SupplierLedger', 'supplier_id', all_('Suppliers'), -1); }

function acctTxn_(accId, dir, amount, refType, refId, note, user, date) {
  return insert_('AccountTxns', { date: date || today_(), account_id: accId, direction: dir, amount: round_(amount), ref_type: refType, ref_id: refId, note: note || '', user: user.name, voided: false });
}
function voidRefs_(table, refId, refType) {
  all_(table).forEach(function (r) {
    if (r.ref_id === refId && !r.voided && (!refType || r.ref_type === refType)) update_(table, r.id, { voided: true });
  });
}
function evBatch_(user, list) {
  var ts = now_();
  insertMany_('ItemEvents', list.map(function (e) { return Object.assign({ ts: ts, user: user.name }, e); }));
}
function serialIndex_() {
  if (_mem.__serialIdx) return _mem.__serialIdx;
  var m = {};
  all_('SerialItems').forEach(function (s) { if (s.status !== 'cancelled') m[s.product_id + '|' + s.serial] = s; });
  _mem.__serialIdx = m;
  return m;
}
function payList_(arr) {
  var accs = indexBy_(all_('Accounts')), out = [];
  (arr || []).forEach(function (p) {
    var amt = round_(p.amount);
    if (amt <= 0) return;
    var a = accs[p.account_id];
    if (!a || !a.active) fail_('Payment account not found or inactive');
    out.push({ account_id: a.id, account_name: a.name, amount: amt });
  });
  return out;
}
function sum_(arr, f) { return arr.reduce(function (s, x) { return s + f(x); }, 0); }

/* ============================================================================
 *  5. MASTER DATA  (categories, brands, warranty periods)
 * ========================================================================== */
var MASTER = {
  category: { table: 'Categories', fields: ['name', 'parent_id'], usedBy: function (id) { return all_('Products').some(function (p) { return p.category_id === id || p.subcategory_id === id; }) || all_('Categories').some(function (c) { return c.parent_id === id; }); } },
  brand: { table: 'Brands', fields: ['name'], usedBy: function (id) { return all_('Products').some(function (p) { return p.brand_id === id; }); } },
  warranty_period: { table: 'WarrantyPeriods', fields: ['label', 'days'], usedBy: function () { return false; } }
};
function masterSave_(p, user) {
  var m = MASTER[p.kind]; if (!m) fail_('Unknown master type');
  var row = {}; m.fields.forEach(function (f) { row[f] = p[f] === undefined ? '' : p[f]; });
  if (p.kind === 'warranty_period') {
    row.days = Math.round(num_(row.days));
    if (row.days <= 0) fail_('Warranty days must be greater than 0');
    row.label = String(row.label || '').trim() || (row.days + ' days');
  } else if (!String(row.name || '').trim()) fail_('Name is required');
  if (p.id) return update_(m.table, p.id, row);
  return insert_(m.table, row);
}
function masterDelete_(p, user) {
  var m = MASTER[p.kind]; if (!m) fail_('Unknown master type');
  if (m.usedBy(p.id)) fail_('This item is in use and cannot be deleted');
  remove_(m.table, p.id); return true;
}

/* ============================================================================
 *  6. PRODUCTS
 * ========================================================================== */
function productsList_(user) {
  var list = all_('Products').map(function (p) { var c = Object.assign({}, p); delete c._row; return c; });
  return stripCost_(list, user);
}
function productSave_(p, user) {
  var name = String(p.name || '').trim(); if (!name) fail_('Product name is required');
  var unit = ['pcs', 'meter', 'feet'].indexOf(p.unit) >= 0 ? p.unit : 'pcs';
  var hasW = p.has_warranty === true || p.has_warranty === 'true';
  var wType = hasW ? (p.warranty_type === 'invoice' ? 'invoice' : 'serial') : '';
  if (hasW && wType === 'serial' && unit !== 'pcs') fail_('Serial-based warranty is only for items sold in pcs');
  var barcode = String(p.barcode || '').trim(), sku = String(p.sku || '').trim();
  all_('Products').forEach(function (x) {
    if (x.id === p.id) return;
    if (barcode && x.barcode === barcode) fail_('Barcode already used by: ' + x.name);
    if (sku && x.sku === sku) fail_('SKU already used by: ' + x.name);
  });
  var row = {
    sku: sku, barcode: barcode, name: name, category_id: p.category_id || '', subcategory_id: p.subcategory_id || '', brand_id: p.brand_id || '',
    unit: unit, roll_length: unit === 'pcs' ? 0 : num_(p.roll_length), cost_price: num_(p.cost_price), sale_price: num_(p.sale_price), wholesale_price: num_(p.wholesale_price),
    low_stock: num_(p.low_stock), has_warranty: hasW, warranty_type: wType, warranty_days: hasW ? Math.round(num_(p.warranty_days)) : 0,
    active: p.active === undefined ? true : (p.active === true || p.active === 'true')
  };
  if (p.id) {
    if (!can_(user, 'cost')) { delete row.cost_price; delete row.wholesale_price; }
    var cur = all_('Products').filter(function (x) { return x.id === p.id; })[0];
    if (cur && cur.has_warranty && cur.warranty_type === 'serial' && (!hasW || wType !== 'serial') && cur.stock > 0)
      fail_('Cannot change warranty type while serial-tracked stock exists');
    return update_('Products', p.id, row);
  }
  row.stock = 0; row.created_at = now_();
  return insert_('Products', row);
}
function productDelete_(p, user) {
  var used = all_('SaleItems').some(function (i) { return i.product_id === p.id; }) || all_('PurchaseItems').some(function (i) { return i.product_id === p.id; });
  if (used) { update_('Products', p.id, { active: false }); return { deactivated: true }; }
  remove_('Products', p.id); return { deleted: true };
}
function serialsList_(p) {
  return all_('SerialItems').filter(function (s) { return s.product_id === p.product_id && (!p.status || s.status === p.status); })
    .map(function (s) { return { serial: s.serial, status: s.status }; });
}
function stockAdjust_(p, user) {
  var pr = all_('Products').filter(function (x) { return x.id === p.product_id; })[0]; if (!pr) fail_('Product not found');
  if (pr.has_warranty && pr.warranty_type === 'serial') fail_('Serial-tracked items must be adjusted through purchases / returns');
  var newStock = num_(p.new_stock); if (newStock < 0) fail_('Stock cannot be negative');
  var diff = round_(newStock - pr.stock, 4);
  update_('Products', pr.id, { stock: newStock });
  evBatch_(user, [{ product_id: pr.id, product_name: pr.name, event: 'stock_adjust', ref_type: 'adjust', qty: diff, note: p.note || 'Manual stock adjustment' }]);
  audit_(user, 'stock_adjust', { product: pr.name, from: pr.stock, to: newStock });
  return true;
}

/* ============================================================================
 *  7. CUSTOMERS & SUPPLIERS
 * ========================================================================== */
function joinList_(v, sep) { return (Array.isArray(v) ? v : String(v || '').split(sep)).map(function (x) { return String(x).trim(); }).filter(Boolean).join(sep); }

function customersList_() {
  var bal = customerBalances_();
  return all_('Customers').map(function (c) { var o = Object.assign({}, c); delete o._row; o.balance = bal[c.id] || 0; return o; });
}
function customerSave_(p, user) {
  var name = String(p.name || '').trim(); if (!name) fail_('Customer name is required');
  var phones = joinList_(p.phones, ',');
  var row = { name: name, phones: phones, addresses: joinList_(p.addresses, '|'), note: p.note || '' };
  if (p.id) {
    need_(user, 'customers');
    row.opening_balance = num_(p.opening_balance);
    if (p.active !== undefined) row.active = p.active === true || p.active === 'true';
    return update_('Customers', p.id, row);
  }
  row.opening_balance = can_(user, 'customers') ? num_(p.opening_balance) : 0;
  row.active = true; row.created_at = now_();
  return insert_('Customers', row);
}
function customerQuickAdd_(p, user) {
  if (!String(p.name || '').trim()) fail_('Customer name is required');
  if (!String(p.phone || '').trim()) fail_('Phone is required');
  var c = insert_('Customers', { name: String(p.name).trim(), phones: String(p.phone).trim(), addresses: String(p.address || '').trim(), opening_balance: 0, note: '', active: true, created_at: now_() });
  var o = Object.assign({}, c); delete o._row; o.balance = 0; return o;
}
function suppliersList_() {
  var bal = supplierBalances_();
  return all_('Suppliers').map(function (c) { var o = Object.assign({}, c); delete o._row; o.balance = bal[c.id] || 0; return o; });
}
function supplierSave_(p, user) {
  var name = String(p.name || '').trim(); if (!name) fail_('Supplier name is required');
  var row = { name: name, phones: joinList_(p.phones, ','), address: p.address || '', opening_balance: num_(p.opening_balance), note: p.note || '' };
  if (p.id) { if (p.active !== undefined) row.active = p.active === true || p.active === 'true'; return update_('Suppliers', p.id, row); }
  row.active = true; row.created_at = now_();
  return insert_('Suppliers', row);
}

/* ============================================================================
 *  8. ACCOUNTS (cash / bank / MFS)
 * ========================================================================== */
function accountsList_() {
  var bal = accountBalances_();
  return all_('Accounts').map(function (a) { var o = Object.assign({}, a); delete o._row; o.balance = bal[a.id] || 0; return o; });
}
function accountSave_(p, user) {
  var name = String(p.name || '').trim(); if (!name) fail_('Account name is required');
  var type = ['cash', 'bank', 'mfs'].indexOf(p.type) >= 0 ? p.type : 'bank';
  var row = { name: name, type: type, number: p.number || '', opening_balance: num_(p.opening_balance) };
  if (p.id) { if (p.active !== undefined) row.active = p.active === true || p.active === 'true'; return update_('Accounts', p.id, row); }
  row.active = true; row.created_at = now_();
  return insert_('Accounts', row);
}
function accountEntry_(p, user) { // owner deposit / withdrawal / transfer
  var amt = round_(p.amount); if (amt <= 0) fail_('Amount must be greater than 0');
  var accs = indexBy_(all_('Accounts'));
  var date = p.date || today_();
  if (p.kind === 'transfer') {
    if (!accs[p.account_id] || !accs[p.to_account_id]) fail_('Select both accounts');
    if (p.account_id === p.to_account_id) fail_('Choose two different accounts');
    var ref = uid_();
    acctTxn_(p.account_id, 'out', amt, 'transfer', ref, 'Transfer to ' + accs[p.to_account_id].name + (p.note ? ' — ' + p.note : ''), user, date);
    acctTxn_(p.to_account_id, 'in', amt, 'transfer', ref, 'Transfer from ' + accs[p.account_id].name + (p.note ? ' — ' + p.note : ''), user, date);
  } else {
    if (!accs[p.account_id]) fail_('Select an account');
    var dir = p.kind === 'withdraw' ? 'out' : 'in';
    acctTxn_(p.account_id, dir, amt, 'manual', uid_(), (dir === 'in' ? 'Deposit' : 'Withdrawal') + (p.note ? ' — ' + p.note : ''), user, date);
  }
  return true;
}
function accountLedger_(p) {
  var acc = all_('Accounts').filter(function (a) { return a.id === p.account_id; })[0]; if (!acc) fail_('Account not found');
  var rows = all_('AccountTxns').filter(function (t) { return t.account_id === acc.id && !t.voided; });
  var run = acc.opening_balance, out = [];
  rows.sort(function (a, b) { return a._row - b._row; }).forEach(function (t) {
    run += t.direction === 'in' ? t.amount : -t.amount;
    if (inRange_(t.date, p.from, p.to)) out.push({ id: t.id, date: t.date, direction: t.direction, in: t.direction === 'in' ? t.amount : 0, out: t.direction === 'out' ? t.amount : 0, balance: round_(run), ref_type: t.ref_type, note: t.note, user: t.user });
  });
  return { account: acc.name, opening: acc.opening_balance, closing: round_(run), rows: out };
}

/* ============================================================================
 *  9. USERS & SETTINGS
 * ========================================================================== */
function usersList_() { return all_('Users').map(pubUser_); }
function userSave_(p, user) {
  var username = String(p.username || '').trim().toLowerCase();
  if (!username || !String(p.name || '').trim()) fail_('Name and username are required');
  if (['admin', 'manager', 'sales'].indexOf(p.role) < 0) fail_('Invalid role');
  all_('Users').forEach(function (u) { if (u.id !== p.id && u.username.toLowerCase() === username) fail_('Username already taken'); });
  var row = { name: String(p.name).trim(), username: username, role: p.role, active: p.active === undefined ? true : (p.active === true || p.active === 'true') };
  if (p.id) {
    if (p.id === user.id && (!row.active || row.role !== 'admin')) fail_('You cannot disable or demote your own account');
    if (p.password) { if (String(p.password).length < 6) fail_('Password must be at least 6 characters'); row.salt = uid_(); row.password_hash = hash_(row.salt, p.password); }
    return pubUser_(update_('Users', p.id, row));
  }
  if (String(p.password || '').length < 6) fail_('Password must be at least 6 characters');
  row.salt = uid_(); row.password_hash = hash_(row.salt, p.password); row.created_at = now_();
  return pubUser_(insert_('Users', row));
}
function rolePermsSave_(p, user) {
  var cfg = {};
  ['manager', 'sales'].forEach(function (r) { cfg[r] = (p[r] || []).filter(function (x) { return PERMS[x]; }); });
  setSetting_('role_perms', JSON.stringify(cfg));
  return cfg;
}

var SECRET_KEYS = ['sms_api_key'];
function settingsGet_(p, user) {
  var m = Object.assign({}, settingsMap_());
  Object.keys(m).forEach(function (k) { if (k.indexOf('seq_') === 0) delete m[k]; });
  if (!can_(user, 'settings')) SECRET_KEYS.concat(['sms_url', 'sms_body', 'sms_sender_id']).forEach(function (k) { delete m[k]; });
  return m;
}
function settingsSave_(p, user) {
  var allowed = ['shop_name', 'shop_phone', 'shop_address', 'shop_footer', 'currency', 'invoice_prefix', 'receipt_width', 'low_stock_default', 'expense_categories',
    'sms_enabled', 'sms_method', 'sms_url', 'sms_body', 'sms_body_type', 'sms_api_key', 'sms_sender_id', 'sms_number_format', 'sms_template'];
  var vals = p.values || {};
  Object.keys(vals).forEach(function (k) {
    if (allowed.indexOf(k) < 0) return;
    var v = vals[k];
    if (typeof v === 'object') v = JSON.stringify(v);
    setSetting_(k, v === undefined || v === null ? '' : v);
  });
  audit_(user, 'settings_save', Object.keys(vals));
  return settingsGet_(p, user);
}

/* ============================================================================
 *  10. SMS GATEWAY
 * ========================================================================== */
function fillTpl_(tpl, vars, mode) {
  return String(tpl || '').replace(/\{(\w+)\}/g, function (m, k) {
    if (!vars.hasOwnProperty(k)) return m;
    var v = String(vars[k]);
    if (mode === 'json') return JSON.stringify(v).slice(1, -1);
    if (mode === 'raw') return v;
    return encodeURIComponent(v);
  });
}
function smsNumber_(phone) {
  var d = String(phone || '').replace(/\D/g, '');
  if (getSetting_('sms_number_format', 'intl') === 'intl') {
    if (d.length === 11 && d.indexOf('01') === 0) return '88' + d;
    if (d.length === 10 && d.indexOf('1') === 0) return '880' + d;
  } else if (d.indexOf('8801') === 0 && d.length === 13) return d.slice(2);
  return d;
}
function sendSms_(phone, message) {
  var number = smsNumber_(phone);
  if (!number) return { ok: false, status: 'skipped', response: 'No phone number' };
  var vars = { api_key: getSetting_('sms_api_key'), sender_id: getSetting_('sms_sender_id'), number: number, message: message };
  var method = getSetting_('sms_method', 'GET').toUpperCase(), res, status = 'sent', text = '';
  try {
    if (method === 'POST') {
      var type = getSetting_('sms_body_type', 'form');
      var body = fillTpl_(getSetting_('sms_body'), vars, type === 'json' ? 'json' : 'form');
      res = UrlFetchApp.fetch(fillTpl_(getSetting_('sms_url'), vars, 'url'), {
        method: 'post', contentType: type === 'json' ? 'application/json' : 'application/x-www-form-urlencoded', payload: body, muteHttpExceptions: true
      });
    } else {
      res = UrlFetchApp.fetch(fillTpl_(getSetting_('sms_url'), vars, 'url'), { method: 'get', muteHttpExceptions: true });
    }
    text = res.getContentText().slice(0, 300);
    if (res.getResponseCode() >= 400) status = 'failed';
  } catch (e) { status = 'failed'; text = String(e.message || e); }
  insert_('SmsLog', { ts: now_(), phone: number, message: message, status: status, response: text });
  return { ok: status === 'sent', status: status, response: text };
}
function itemsSummary_(lines) {
  var s = lines.map(function (l) { return l.name + ' x' + l.qty; }).join(', ');
  return s.length > 110 ? s.slice(0, 107) + '...' : s;
}
function smsMessage_(tplKey, vars) { return fillTpl_(getSetting_(tplKey), vars, 'raw'); }
function sendSaleSms_(sale, lines, customer) {
  if (getSetting_('sms_enabled', 'false') !== 'true' || !customer) return null;
  var phone = parseList_(customer.phones)[0]; if (!phone) return null;
  var msg = smsMessage_('sms_template', {
    name: customer.name, shop: getSetting_('shop_name'), items: itemsSummary_(lines), invoice: sale.invoice_no,
    total: sale.total, paid: sale.paid, due: sale.due, date: sale.date
  });
  return sendSms_(phone, msg);
}
function smsTest_(p, user) {
  var r = sendSms_(p.phone, 'Test SMS from ' + getSetting_('shop_name') + ' — Karvio');
  if (!r.ok) fail_('SMS failed: ' + r.response);
  return r;
}
function smsLog_() { return all_('SmsLog').slice(-100).reverse().map(function (x) { var o = Object.assign({}, x); delete o._row; return o; }); }

/* ============================================================================
 *  11. BOOTSTRAP  (one call loads everything the UI needs)
 * ========================================================================== */
function bootstrap_(p, user) {
  var settings = settingsGet_({}, user);
  var accounts = (can_(user, 'accounts') || can_(user, 'pos')) ? accountsList_().filter(function (a) { return a.active; }) : [];
  if (!can_(user, 'accounts')) accounts = accounts.map(function (a) { return { id: a.id, name: a.name, type: a.type, active: a.active }; });
  var cats = all_('Categories').map(function (c) { return { id: c.id, name: c.name, parent_id: c.parent_id }; });
  return {
    user: pubUser_(user), perms: permsFor_(user.role), permLabels: PERMS,
    settings: settings,
    accounts: accounts, categories: cats,
    brands: all_('Brands').map(function (b) { return { id: b.id, name: b.name }; }),
    warrantyPeriods: all_('WarrantyPeriods').map(function (w) { return { id: w.id, label: w.label, days: w.days }; }),
    products: productsList_(user),
    customers: customersList_().filter(function (c) { return c.active; }),
    suppliers: can_(user, 'purchase') || can_(user, 'suppliers') ? suppliersList_().filter(function (s) { return s.active; }) : [],
    serverTime: now_()
  };
}
