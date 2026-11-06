/**
 * ============================================================================
 *  Karvio — Code.gs  (Google Apps Script backend)
 *  Google Sheets = database  |  This Web App = REST / JSON API
 * ============================================================================
 *  FIRST-TIME SETUP
 *   1. Run  setupDatabase()  once from the Apps Script editor (authorize it).
 *   2. Deploy > New deployment > Web app
 *        Execute as: Me      Who has access: Anyone
 *   3. Paste the Web App URL into the React app (Settings > API connection).
 *   4. Default login:  admin / admin123   (change it immediately!)
 *
 *  Every request is:  POST  { action, token, payload }   (Content-Type: text/plain)
 *  Every response is: { ok:true, data } | { ok:false, error }
 * ============================================================================
 */

var APP_VERSION = '1.0.2';
// Your Karvio database spreadsheet. Lets this script also run as a standalone project.
var DEFAULT_SHEET_ID = '1r7WI5GNHtppUCtCu_rZUmvfum92i0HZdK298Z4uZH7w';
var SESSION_TTL = 21600; // 6 hours (CacheService maximum)

/* ---------------------------------------------------------------------------
 *  SHEET SCHEMA  —  "column" or "column:type"   (types: s=text, n=number, b=boolean)
 * ------------------------------------------------------------------------- */
var SCHEMA = {
  Users:               'id,name,username,password_hash,salt,role,active:b,created_at',
  Settings:            'key,value',
  Accounts:            'id,name,type,number,opening_balance:n,active:b,created_at',
  AccountTxns:         'id,date,account_id,direction,amount:n,ref_type,ref_id,note,user,voided:b',
  Categories:          'id,name,parent_id',
  Brands:              'id,name',
  WarrantyPeriods:     'id,label,days:n',
  Units:               'id,name,label,decimal:b',
  Products:            'id,sku,barcode,name,category_id,subcategory_id,brand_id,unit,roll_length:n,cost_price:n,sale_price:n,wholesale_price:n,stock:n,low_stock:n,has_warranty:b,warranty_type,warranty_days:n,active:b,created_at,service:b,description',
  SerialItems:         'id,product_id,serial,purchase_id,sale_id,status,cost:n,created_at',
  Customers:           'id,name,phones,addresses,opening_balance:n,note,active:b,created_at,link_id',
  Suppliers:           'id,name,phones,address,opening_balance:n,note,active:b,created_at,link_id',
  Purchases:           'id,invoice_no,date,supplier_id,supplier_name,subtotal:n,discount:n,total:n,paid:n,due:n,note,status,user,created_at,payments,cancel_reason',
  PurchaseItems:       'id,purchase_id,product_id,name,unit,qty:n,cost:n,total:n,serials,valuation',
  Sales:               'id,invoice_no,date,customer_id,customer_name,subtotal:n,discount:n,total:n,paid:n,credit_used:n,due:n,cost:n,profit:n,note,status,user_id,user_name,created_at,payments,cancel_reason,next_payment_date',
  SaleItems:           'id,sale_id,product_id,name,unit,qty:n,price:n,cost:n,total:n,serials,warranty_type,warranty_days:n,warranty_expiry',
  SalesReturns:        'id,return_no,date,sale_id,invoice_no,customer_id,customer_name,type,total:n,cost:n,refund:n,refund_account_id,note,status,user,created_at,cancel_reason',
  SalesReturnItems:    'id,return_id,sale_item_id,product_id,name,qty:n,price:n,cost:n,total:n,serials,valuation',
  PurchaseReturns:     'id,return_no,date,purchase_id,invoice_no,supplier_id,supplier_name,total:n,received:n,account_id,note,status,user,created_at,cancel_reason',
  PurchaseReturnItems: 'id,return_id,purchase_item_id,product_id,name,qty:n,cost:n,total:n,serials',
  Expenses:            'id,date,category,amount:n,account_id,note,user,status,created_at,cancel_reason',
  CustomerLedger:      'id,date,customer_id,type,ref_id,ref_no,debit:n,credit:n,note,voided:b',
  SupplierLedger:      'id,date,supplier_id,type,ref_id,ref_no,debit:n,credit:n,note,voided:b',
  WarrantyClaims:      'id,claim_no,date,serial,sale_id,invoice_no,product_id,product_name,customer_id,customer_name,phone,issue,expiry,in_warranty:b,status,vendor,log,delivered_date,updated_at',
  ItemEvents:          'id,ts,serial,product_id,product_name,event,ref_type,ref_id,ref_no,party,qty:n,amount:n,note,user',
  SmsLog:              'id,ts,phone,message,status,response',
  AuditLog:            'id,ts,user,action,detail'
};

/* ---------------------------------------------------------------------------
 *  PERMISSIONS  (Admin = everything. Manager / Sales are editable in the UI.)
 * ------------------------------------------------------------------------- */
var PERMS = {
  'pos':          'POS — create sales, quick-add customers',
  'sales.all':    'View sales made by other staff',
  'sales.return': 'Sales return & exchange',
  'purchase':     'Purchases & purchase returns',
  'products':     'Create / edit products',
  'cost':         'See cost price & profit margins',
  'customers':    'Customer directory, ledger & due collection',
  'suppliers':    'Supplier directory, ledger & payments',
  'accounts':     'Bank / MFS / cash accounts',
  'expenses':     'Daily expenses',
  'warranty':     'Warranty claims',
  'reports':      'Reports hub & full dashboard',
  'cancel':       'Cancel / reverse transactions',
  'users':        'User management',
  'settings':     'System settings'
};
var DEFAULT_ROLE_PERMS = {
  manager: ['pos','sales.all','sales.return','purchase','products','cost','customers','suppliers','accounts','expenses','warranty','reports'],
  sales:   ['pos','warranty']
};

/* ============================================================================
 *  1. DATABASE LAYER
 * ========================================================================== */
var _mem = {}; // per-execution cache

function TZ_()    { return Session.getScriptTimeZone() || 'Asia/Dhaka'; }
function uid_()   { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function now_()   { return Utilities.formatDate(new Date(), TZ_(), "yyyy-MM-dd'T'HH:mm:ss"); }
function today_() { return Utilities.formatDate(new Date(), TZ_(), 'yyyy-MM-dd'); }
function fail_(m) { throw new Error(m); }
function num_(v)  { var n = Number(v); return isFinite(n) ? n : 0; }
function round_(n, d) { var f = Math.pow(10, d == null ? 2 : d); return Math.round((Number(n) || 0) * f) / f; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function indexBy_(arr, key) { var m = {}; arr.forEach(function (x) { m[x[key || 'id']] = x; }); return m; }
function parseList_(s) { return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
function inRange_(d, from, to) { d = String(d || '').slice(0, 10); return (!from || d >= from) && (!to || d <= to); }

function cols_(name) {
  if (!SCHEMA[name]) fail_('Unknown sheet: ' + name);
  return SCHEMA[name].split(',').map(function (s) { var p = s.split(':'); return { k: p[0], t: p[1] || 's' }; });
}

function ss_() {
  if (_mem.__ss) return _mem.__ss;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID') || DEFAULT_SHEET_ID;
  _mem.__ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!_mem.__ss) fail_('Spreadsheet not found. Run setupDatabase() first.');
  return _mem.__ss;
}

function createSheet_(ss, name) {
  var cs = cols_(name);
  var sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, cs.length).setValues([cs.map(function (c) { return c.k; })])
    .setFontWeight('bold').setBackground('#e8eefc');
  sh.setFrozenRows(1);
  var rows = sh.getMaxRows();
  cs.forEach(function (c, i) { if (c.t === 's') sh.getRange(1, i + 1, rows, 1).setNumberFormat('@'); });
  return sh;
}

function sheet_(name) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) return createSheet_(ss, name);
  // Append new schema columns without overwriting existing rows or changing their order.
  if (!_mem['__schema_' + name]) {
    var cs = cols_(name);
    if (sh.getMaxColumns && sh.getMaxColumns() < cs.length)
      sh.insertColumnsAfter(sh.getMaxColumns(), cs.length - sh.getMaxColumns());
    var headers = sh.getRange(1, 1, 1, cs.length).getValues()[0];
    cs.forEach(function (c, i) {
      if (!headers[i]) sh.getRange(1, i + 1).setValue(c.k).setFontWeight('bold');
      else if (headers[i] !== c.k) fail_('Unexpected column in ' + name + ': ' + headers[i]);
    });
    _mem['__schema_' + name] = true;
  }
  return sh;
}

function cast_(v, t) {
  if (t === 'n') { var n = Number(v); return isFinite(n) ? n : 0; }
  if (t === 'b') return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1';
  if (v instanceof Date) {
    var full = v.getHours() || v.getMinutes() || v.getSeconds();
    return Utilities.formatDate(v, TZ_(), full ? "yyyy-MM-dd'T'HH:mm:ss" : 'yyyy-MM-dd');
  }
  return v === null || v === undefined ? '' : String(v);
}
function ser_(v, t) {
  if (t === 'n') return round_(v, 4);
  if (t === 'b') return v === true || v === 'TRUE' || v === 'true';
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** Read a whole sheet as an array of objects (cached per execution). */
function all_(name) {
  if (_mem[name]) return _mem[name];
  var cs = cols_(name), sh = sheet_(name), last = sh.getLastRow(), rows = [];
  if (last > 1) {
    var vals = sh.getRange(2, 1, last - 1, cs.length).getValues();
    vals.forEach(function (r, i) {
      if (r[0] === '' || r[0] === null) return;
      var o = { _row: i + 2 };
      cs.forEach(function (c, j) { o[c.k] = cast_(r[j], c.t); });
      rows.push(o);
    });
  }
  _mem[name] = rows;
  return rows;
}

function insertMany_(name, objs) {
  if (!objs.length) return [];
  var cs = cols_(name), sh = sheet_(name);
  var start = Math.max(sh.getLastRow(), 1) + 1;
  objs.forEach(function (o) { if (!o.id) o.id = uid_(); });
  sh.getRange(start, 1, objs.length, cs.length)
    .setValues(objs.map(function (o) { return cs.map(function (c) { return ser_(o[c.k], c.t); }); }));
  var out = objs.map(function (o, i) {
    var full = { _row: start + i };
    cs.forEach(function (c) { full[c.k] = cast_(ser_(o[c.k], c.t), c.t); });
    return full;
  });
  if (_mem[name]) out.forEach(function (f) { _mem[name].push(f); });
  return out;
}
function insert_(name, obj) { return insertMany_(name, [obj])[0]; }

function update_(name, id, patch) {
  var r = all_(name).filter(function (x) { return x.id === id; })[0];
  if (!r) fail_(name + ' record not found');
  var cs = cols_(name);
  cs.forEach(function (c) { if (patch.hasOwnProperty(c.k)) r[c.k] = cast_(ser_(patch[c.k], c.t), c.t); });
  sheet_(name).getRange(r._row, 1, 1, cs.length)
    .setValues([cs.map(function (c) { return ser_(r[c.k], c.t); })]);
  return r;
}

function remove_(name, id) {
  var r = all_(name).filter(function (x) { return x.id === id; })[0];
  if (!r) fail_(name + ' record not found');
  sheet_(name).deleteRow(r._row);
  delete _mem[name];
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---- Settings (key / value sheet) ---- */
function settingsMap_() {
  if (_mem.__settings) return _mem.__settings;
  var sh = sheet_('Settings'), last = sh.getLastRow(), m = {};
  if (last > 1) sh.getRange(2, 1, last - 1, 2).getValues().forEach(function (r) {
    if (r[0] !== '') m[String(r[0])] = r[1] === undefined || r[1] === null ? '' : String(r[1]);
  });
  _mem.__settings = m;
  return m;
}
function getSetting_(k, def) {
  var m = settingsMap_();
  return (m.hasOwnProperty(k) && m[k] !== '') ? m[k] : (def === undefined ? '' : def);
}
function setSetting_(k, v) {
  var sh = sheet_('Settings'), last = sh.getLastRow(), row = -1;
  if (last > 1) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r, i) { if (String(r[0]) === k) row = i + 2; });
  if (row < 0) sh.appendRow([k, String(v)]); else sh.getRange(row, 2).setValue(String(v));
  settingsMap_()[k] = String(v);
}
function nextNo_(key, prefix) {
  var n = Number(getSetting_(key, '0')) + 1;
  setSetting_(key, n);
  return prefix + String(n).padStart(6, '0');
}

/* ============================================================================
 *  2. SETUP  (run once)
 * ========================================================================== */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Karvio')
      .addItem('1. Setup / repair database', 'setupDatabase')
      .addItem('2. Reset admin password to admin123', 'resetAdminPassword')
      .addToUi();
  } catch (e) { /* not bound to a sheet */ }
}

function setupDatabase() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  ss = ss || ss_();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  _mem.__ss = ss;
  try { if (Session.getScriptTimeZone() !== 'Asia/Dhaka') ss.setSpreadsheetTimeZone('Asia/Dhaka'); } catch (e) {}

  Object.keys(SCHEMA).forEach(function (name) { sheet_(name); });
  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);

  var defaults = {
    shop_name: 'My Computer Shop', shop_phone: '', shop_address: '', shop_footer: 'Thank you for your business!',
    currency: 'Tk', invoice_prefix: 'INV-', receipt_width: '80', low_stock_default: '5',
    expense_categories: JSON.stringify(['Electricity', 'Internet', 'Food', 'Transport', 'Rent', 'Salary', 'Maintenance', 'Other']),
    sms_enabled: 'false', sms_method: 'GET',
    sms_url: 'https://bulksmsbd.net/api/smsapi?api_key={api_key}&type=text&number={number}&senderid={sender_id}&message={message}',
    sms_body: '', sms_body_type: 'form', sms_api_key: '', sms_sender_id: '', sms_number_format: 'intl',
    sms_template: 'Dear {name}, thank you for shopping at {shop}. Items: {items}. Invoice {invoice}, Total {total}, Paid {paid}, Due {due}.'
  };
  Object.keys(defaults).forEach(function (k) { if (getSetting_(k, null) === null) setSetting_(k, defaults[k]); });
  // getSetting_ returns '' for blanks; make sure all keys exist
  Object.keys(defaults).forEach(function (k) { if (!settingsMap_().hasOwnProperty(k)) setSetting_(k, defaults[k]); });

  if (!all_('Users').length) {
    var salt = uid_();
    insert_('Users', { name: 'Administrator', username: 'admin', salt: salt, password_hash: hash_(salt, 'admin123'), role: 'admin', active: true, created_at: now_() });
  }
  if (!all_('Accounts').length) {
    insert_('Accounts', { name: 'Cash', type: 'cash', number: '', opening_balance: 0, active: true, created_at: now_() });
  }
  if (!all_('WarrantyPeriods').length) {
    insertMany_('WarrantyPeriods', [7, 30, 90, 180, 300, 900, 1500].map(function (d) { return { label: d + ' days', days: d }; }));
  }
  units_();
  if (!all_('Categories').length) seedCategories_();
  return 'Karvio database is ready. Login: admin / admin123';
}

/* Selling units. name = short code stored on products (pcs, meter, box); decimal = allow 1.5 qty. */
var DEFAULT_UNITS = [{ name: 'pcs', label: 'Pieces', decimal: false }, { name: 'meter', label: 'Meter', decimal: true }, { name: 'feet', label: 'Feet', decimal: true }];
function units_() {
  var list = all_('Units');
  if (!list.length) { insertMany_('Units', DEFAULT_UNITS); list = all_('Units'); } // older databases: create the defaults once
  return list;
}
function unitOf_(code) { return units_().filter(function (u) { return u.name === code; })[0]; }
function isDecimalUnit_(code) { var u = unitOf_(code); return u ? u.decimal : code !== 'pcs'; }

function seedCategories_() {
  var tree = {
    'Core PC Components': ['CPU', 'Motherboard', 'RAM', 'SSD / HDD', 'GPU', 'Power Supply', 'Casing', 'Cooling Fan'],
    'Peripherals & Accessories': ['Keyboard', 'Mouse', 'Monitor', 'Pendrive', 'Type-C / USB Hub', 'Adapter', 'Convertor', 'Power / SATA / HDMI Cable'],
    'Networking & Fiber': ['Router', 'Access Point', 'Cat6 Cable', 'Fiber Cable', 'Patch Cord', 'Splitter', 'Connector', 'Mini UPS', 'Media Converter']
  };
  Object.keys(tree).forEach(function (cat) {
    var parent = insert_('Categories', { name: cat, parent_id: '' });
    insertMany_('Categories', tree[cat].map(function (s) { return { name: s, parent_id: parent.id }; }));
  });
}

function resetAdminPassword() {
  var u = all_('Users').filter(function (x) { return x.username === 'admin'; })[0];
  if (!u) fail_('No admin user found');
  var salt = uid_();
  update_('Users', u.id, { salt: salt, password_hash: hash_(salt, 'admin123'), active: true });
  return 'Admin password reset to admin123';
}

/* ============================================================================
 *  3. AUTH & PERMISSIONS
 * ========================================================================== */
function hash_(salt, pw) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pw, Utilities.Charset.UTF_8);
  return d.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function pubUser_(u) { return { id: u.id, name: u.name, username: u.username, role: u.role, active: u.active }; }

function rolePerms_() {
  var cfg = null;
  try { cfg = JSON.parse(getSetting_('role_perms', 'null')); } catch (e) {}
  return cfg || DEFAULT_ROLE_PERMS;
}
function permsFor_(role) { return role === 'admin' ? ['*'] : (rolePerms_()[role] || []); }
function can_(user, perm) {
  if (!perm) return true;
  var ps = permsFor_(user.role);
  return ps.indexOf('*') >= 0 || ps.indexOf(perm) >= 0;
}
function need_(user, perm) { if (!can_(user, perm)) fail_('Permission denied: ' + (PERMS[perm] || perm)); }

function authUser_(token) {
  if (!token) fail_('AUTH: Please sign in');
  var cache = CacheService.getScriptCache();
  var raw = cache.get('tok_' + token);
  if (!raw) fail_('AUTH: Session expired, please sign in again');
  var s = JSON.parse(raw);
  var u = all_('Users').filter(function (x) { return x.id === s.id; })[0];
  if (!u || !u.active) fail_('AUTH: Account disabled');
  cache.put('tok_' + token, raw, SESSION_TTL); // sliding session
  return u;
}

function login_(p) {
  var name = String(p.username || '').trim().toLowerCase();
  var u = all_('Users').filter(function (x) { return x.username.toLowerCase() === name; })[0];
  if (!u || !u.active || hash_(u.salt, String(p.password || '')) !== u.password_hash) fail_('Invalid username or password');
  var token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('tok_' + token, JSON.stringify({ id: u.id }), SESSION_TTL);
  return { token: token, user: pubUser_(u), perms: permsFor_(u.role) };
}
function logout_(p, user, token) { try { CacheService.getScriptCache().remove('tok_' + token); } catch (e) {} return true; }

function changePassword_(p, user) {
  if (hash_(user.salt, String(p.old_password || '')) !== user.password_hash) fail_('Current password is incorrect');
  if (String(p.new_password || '').length < 6) fail_('New password must be at least 6 characters');
  var salt = uid_();
  update_('Users', user.id, { salt: salt, password_hash: hash_(salt, p.new_password) });
  return true;
}

/** Re-confirm an admin password for sensitive actions (cancel / reverse). */
function confirmAdmin_(user, password) {
  if (user.role !== 'admin') {
    var admins = all_('Users').filter(function (u) { return u.role === 'admin' && u.active; });
    var ok = admins.some(function (a) { return hash_(a.salt, String(password || '')) === a.password_hash; });
    if (!ok) fail_('Admin authorization failed — enter a valid admin password');
  } else if (hash_(user.salt, String(password || '')) !== user.password_hash) {
    fail_('Admin authorization failed — incorrect password');
  }
}

function audit_(user, action, detail) {
  try { insert_('AuditLog', { ts: now_(), user: user ? user.name : '', action: action, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }); } catch (e) {}
}

function stripCost_(obj, user) {
  if (can_(user, 'cost')) return obj;
  // always work on copies — rows come from the shared per-request cache
  var strip = function (o) {
    if (!o || typeof o !== 'object') return o;
    var c = Object.assign({}, o);
    ['cost', 'profit', 'cost_price', 'wholesale_price'].forEach(function (k) { delete c[k]; });
    return c;
  };
  return Array.isArray(obj) ? obj.map(strip) : strip(obj);
}
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
  group: { table: 'Categories', fields: ['name', 'parent_id'], usedBy: function (id) { return MASTER.category.usedBy(id); } },
  category: { table: 'Categories', fields: ['name', 'parent_id'], usedBy: function (id) { return all_('Products').some(function (p) { return p.category_id === id || p.subcategory_id === id; }) || all_('Categories').some(function (c) { return c.parent_id === id; }); } },
  brand: { table: 'Brands', fields: ['name'], usedBy: function (id) { return all_('Products').some(function (p) { return p.brand_id === id; }); } },
  warranty_period: { table: 'WarrantyPeriods', fields: ['label', 'days'], usedBy: function () { return false; } },
  unit: { table: 'Units', fields: ['name', 'label', 'decimal'], usedBy: function (id) { var u = indexBy_(units_())[id]; return !u || u.name === 'pcs' || all_('Products').some(function (p) { return p.unit === u.name; }); } }
};
function masterSave_(p, user) {
  var m = MASTER[p.kind]; if (!m) fail_('Unknown master type');
  var row = {}; m.fields.forEach(function (f) { row[f] = p[f] === undefined ? '' : p[f]; });
  if (p.kind === 'warranty_period') {
    row.days = Math.round(num_(row.days));
    if (row.days <= 0) fail_('Warranty days must be greater than 0');
    row.label = String(row.label || '').trim() || (row.days + ' days');
  } else if (p.kind === 'unit') {
    var units = units_(), curU = p.id ? indexBy_(units)[p.id] : null;
    if (p.id && !curU) fail_('Selling unit not found');
    row.name = String(row.name || '').trim().toLowerCase();
    if (curU) row.name = curU.name; // the short code is stored on products, so it never changes
    if (!row.name) fail_('Unit short name is required');
    if (!/^[a-z][a-z0-9 .-]{0,11}$/.test(row.name)) fail_('Short name: up to 12 letters or numbers, e.g. box, set, kg');
    row.label = String(row.label || '').trim() || row.name;
    row.decimal = row.decimal === true || row.decimal === 'true';
    if (curU && curU.decimal && !row.decimal && all_('Products').some(function (pr) { return pr.unit === curU.name && pr.stock % 1 !== 0; }))
      fail_('Some products in ' + curU.name + ' have fractional stock, so decimal quantity must stay on');
    if (units.some(function (u) { return u.id !== p.id && (u.name === row.name || u.label.trim().toLowerCase() === row.label.toLowerCase()); })) fail_('This selling unit already exists');
  } else if (!String(row.name || '').trim()) fail_('Name is required');
  if (p.kind === 'warranty_period' && all_(m.table).some(function (w) { return w.id !== p.id && num_(w.days) === row.days; }))
    fail_('A ' + row.days + '-day warranty period already exists');
  if (p.kind === 'brand') {
    row.name = String(row.name).trim();
    if (all_(m.table).some(function (b) { return b.id !== p.id && String(b.name).trim().toLowerCase() === row.name.toLowerCase(); })) fail_('This brand already exists');
  }
  if (p.kind === 'group' || p.kind === 'category') {
    row.name = String(row.name).trim();
    var categories = all_('Categories'), current = p.id ? indexBy_(categories)[p.id] : null;
    if (p.id && !current) fail_('Product group or category not found');
    if (p.kind === 'group') {
      if (current && current.parent_id) fail_('This item is a category, not a product group');
      row.parent_id = '';
    } else {
      var parent = indexBy_(categories)[row.parent_id];
      if (!parent || parent.parent_id) fail_('Select a valid product group for this category');
      if (current && !current.parent_id) fail_('Edit this item as a product group');
      if (current && current.parent_id !== row.parent_id && all_('Products').some(function (pr) { return pr.subcategory_id === p.id; }))
        fail_('A category used by products cannot be moved to another group');
    }
    if (categories.some(function (c) { return c.id !== p.id && c.parent_id === row.parent_id && c.name.trim().toLowerCase() === row.name.toLowerCase(); }))
      fail_((p.kind === 'group' ? 'Product group' : 'Category in this group') + ' already exists');
  }
  if (p.id) return update_(m.table, p.id, row);
  return insert_(m.table, row);
}
/** Bulk import from an Excel / CSV file. rows = [{name, label, days, decimal, group}]; bad rows are skipped and reported. */
function masterImport_(p, user) {
  var kind = p.kind; if (!MASTER[kind]) fail_('Unknown master type');
  var rows = Array.isArray(p.rows) ? p.rows : [];
  if (!rows.length) fail_('The file has no rows to import');
  if (rows.length > 2000) fail_('Import up to 2000 rows at a time');
  var added = 0, skipped = [];
  rows.forEach(function (r, i) {
    try {
      var x = { kind: kind };
      if (kind === 'warranty_period') { x.days = r.days; x.label = r.label; }
      else if (kind === 'unit') { x.name = r.name; x.label = r.label; x.decimal = /^(y|yes|true|1|decimal)$/i.test(String(r.decimal || '').trim()); }
      else x.name = r.name;
      if (kind === 'category') {
        var gname = String(r.group || '').trim(); if (!gname) fail_('Product group is empty');
        var g = all_('Categories').filter(function (c) { return !c.parent_id && nameKey_(c.name) === nameKey_(gname); })[0];
        if (!g) g = masterSave_({ kind: 'group', name: gname }, user); // a new group is created on the fly
        x.parent_id = g.id;
      }
      masterSave_(x, user); added++;
    } catch (e) { skipped.push({ row: i + 2, value: String(r.name || r.label || r.days || ''), reason: e && e.message ? e.message : String(e) }); }
  });
  audit_(user, 'master_import', { kind: kind, added: added, skipped: skipped.length });
  return { added: added, skipped: skipped };
}
function masterDelete_(p, user) {
  var m = MASTER[p.kind]; if (!m) fail_('Unknown master type');
  if (p.kind === 'group' || p.kind === 'category') {
    var item = indexBy_(all_('Categories'))[p.id];
    if (!item) fail_('Product group or category not found');
    if ((p.kind === 'group') !== !item.parent_id) fail_('Choose the correct product group or category');
  }
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
  var name = String(p.name || '').trim().replace(/\s+/g, ' '); if (!name) fail_('Product name is required');
  var service = p.service === true || p.service === 'true';
  var unit = service || !p.unit ? 'pcs' : String(p.unit);
  if (!unitOf_(unit)) fail_('Unknown selling unit: ' + unit);
  var hasW = p.has_warranty === true || p.has_warranty === 'true';
  // A service has no serial numbers, so its warranty is always proven by the invoice.
  var wType = hasW ? (service || p.warranty_type === 'invoice' ? 'invoice' : 'serial') : '';
  if (hasW && wType === 'serial' && isDecimalUnit_(unit)) fail_('Serial-based warranty needs a unit sold in whole numbers (like pcs)');
  var barcode = String(p.barcode || '').trim(), sku = String(p.sku || '').trim();
  all_('Products').forEach(function (x) {
    if (x.id === p.id) return;
    if (nameKey_(x.name) === nameKey_(name)) fail_('A product named "' + x.name + '" already exists');
    if (barcode && x.barcode === barcode) fail_('Barcode already used by: ' + x.name);
    if (sku && x.sku === sku) fail_('SKU already used by: ' + x.name);
  });
  var classifications = indexBy_(all_('Categories'));
  if (p.category_id && (!classifications[p.category_id] || classifications[p.category_id].parent_id)) fail_('Select a valid product group');
  if (p.subcategory_id && (!classifications[p.subcategory_id] || classifications[p.subcategory_id].parent_id !== p.category_id)) fail_('Category must belong to the selected product group');
  var row = {
    sku: sku, barcode: barcode, name: name, category_id: p.category_id || '', subcategory_id: p.subcategory_id || '', brand_id: p.brand_id || '',
    unit: unit, roll_length: isDecimalUnit_(unit) ? num_(p.roll_length) : 0, cost_price: service ? 0 : num_(p.cost_price), sale_price: num_(p.sale_price), wholesale_price: num_(p.wholesale_price),
    low_stock: service ? 0 : num_(p.low_stock), service: service, description: String(p.description || '').trim().slice(0, 500), has_warranty: hasW, warranty_type: wType, warranty_days: hasW ? Math.round(num_(p.warranty_days)) : 0,
    active: p.active === undefined ? true : (p.active === true || p.active === 'true')
  };
  if (p.id) {
    // Prices are set in the Price manager and on purchases, never from the product form.
    delete row.cost_price; delete row.sale_price; delete row.wholesale_price;
    var cur = all_('Products').filter(function (x) { return x.id === p.id; })[0];
    if (cur && service && !isService_(cur) && cur.stock > 0) fail_('This product still has ' + cur.stock + ' in stock. Sell, return or adjust it to 0 before turning Inventory off');
    if (cur && service) row.cost_price = 0;
    if (cur && cur.has_warranty && cur.warranty_type === 'serial' && (!hasW || wType !== 'serial') && cur.stock > 0)
      fail_('Cannot change warranty type while serial-tracked stock exists');
    return update_('Products', p.id, row);
  }
  row.stock = 0; row.created_at = now_();
  return insert_('Products', row);
}
/** Price manager: bulk update retail / wholesale prices. items = [{id, sale_price, wholesale_price}] */
function priceUpdate_(p, user) {
  var items = Array.isArray(p.items) ? p.items : [];
  if (!items.length) fail_('No price changes to save');
  var pmap = indexBy_(all_('Products')), changed = [];
  items.forEach(function (it) {
    var pr = pmap[it.id]; if (!pr) fail_('Product not found');
    var sale = num_(it.sale_price), whole = it.wholesale_price === '' || it.wholesale_price == null ? 0 : num_(it.wholesale_price);
    if (sale <= 0) fail_('Retail price for ' + pr.name + ' must be more than 0');
    if (whole < 0) fail_('Wholesale price for ' + pr.name + ' cannot be negative');
    if (sale === pr.sale_price && whole === pr.wholesale_price) return;
    changed.push({ name: pr.name, from: [pr.sale_price, pr.wholesale_price], to: [sale, whole] });
    update_('Products', pr.id, { sale_price: sale, wholesale_price: whole });
  });
  if (changed.length) audit_(user, 'price_update', { count: changed.length, items: changed.slice(0, 50) });
  return { updated: changed.length };
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
/** Find which product a scanned serial number belongs to (case-insensitive). In-stock units win over sold ones. */
function serialFind_(p) {
  var code = String(p.serial || '').trim().toLowerCase(); if (!code) return null;
  var hits = all_('SerialItems').filter(function (s) { return String(s.serial).trim().toLowerCase() === code; });
  if (!hits.length) return null;
  var h = hits.filter(function (s) { return s.status === 'in_stock'; })[0] || hits[0];
  return { product_id: h.product_id, serial: h.serial, status: h.status };
}
function stockAdjust_(p, user) {
  var pr = all_('Products').filter(function (x) { return x.id === p.product_id; })[0]; if (!pr) fail_('Product not found');
  if (isService_(pr)) fail_(pr.name + ' is a service (no inventory), so it has no stock to adjust');
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
  var bal = customerBalances_(), sb = null;
  return all_('Customers').map(function (c) {
    var o = Object.assign({}, c); delete o._row; o.balance = bal[c.id] || 0; o.combined = !!c.link_id;
    if (c.link_id) { sb = sb || supplierBalances_(); o.link_balance = sb[c.link_id] || 0; }
    return o;
  });
}
function customerSave_(p, user) {
  var name = String(p.name || '').trim(); if (!name) fail_('Customer name is required');
  var phones = joinList_(p.phones, ',');
  var row = { name: name, phones: phones, addresses: joinList_(p.addresses, '|'), note: p.note || '' };
  if (p.id) {
    need_(user, 'customers');
    row.opening_balance = num_(p.opening_balance);
    if (p.active !== undefined) row.active = p.active === true || p.active === 'true';
    var upd = update_('Customers', p.id, row);
    var comb = p.combined === undefined ? undefined : (p.combined === true || p.combined === 'true');
    if (comb && !upd.link_id) need_(user, 'suppliers');
    if (comb !== undefined || upd.link_id) return syncCombined_('customer', upd, comb === undefined ? !!upd.link_id : comb);
    return upd;
  }
  row.opening_balance = can_(user, 'customers') ? num_(p.opening_balance) : 0;
  row.active = true; row.created_at = now_();
  var ins = insert_('Customers', row);
  if (p.combined === true || p.combined === 'true') { need_(user, 'suppliers'); return syncCombined_('customer', ins, true); }
  return ins;
}
function customerQuickAdd_(p, user) {
  if (!String(p.name || '').trim()) fail_('Customer name is required');
  if (!String(p.phone || '').trim()) fail_('Phone is required');
  var c = insert_('Customers', { name: String(p.name).trim(), phones: String(p.phone).trim(), addresses: String(p.address || '').trim(), opening_balance: 0, note: '', active: true, created_at: now_() });
  var o = Object.assign({}, c); delete o._row; o.balance = 0; return o;
}
function suppliersList_() {
  var bal = supplierBalances_(), cb = null;
  return all_('Suppliers').map(function (c) {
    var o = Object.assign({}, c); delete o._row; o.balance = bal[c.id] || 0; o.combined = !!c.link_id;
    if (c.link_id) { cb = cb || customerBalances_(); o.link_balance = cb[c.link_id] || 0; }
    return o;
  });
}
/* Combined party: one person who is both a customer and a supplier (e.g. CASH SALE / CASH PURCHASE, or a
 * dealer you buy from and sell to). Each side keeps its own ledger; the twin record is created and kept in sync. */
function syncCombined_(kind, rec, combined) {
  var other = kind === 'customer' ? 'Suppliers' : 'Customers', self = kind === 'customer' ? 'Customers' : 'Suppliers';
  var twin = rec.link_id ? all_(other).filter(function (x) { return x.id === rec.link_id; })[0] : null;
  if (!combined) {
    if (twin) { update_(other, twin.id, { link_id: '' }); update_(self, rec.id, { link_id: '' }); }
    return update_(self, rec.id, {});
  }
  var shared = kind === 'customer'
    ? { name: rec.name, phones: rec.phones, address: String(rec.addresses || '').split('|').filter(Boolean).join(', '), note: rec.note, active: rec.active }
    : { name: rec.name, phones: rec.phones, addresses: rec.address || '', note: rec.note, active: rec.active };
  if (!twin) { // reuse an unlinked record with the same name, otherwise create one
    twin = all_(other).filter(function (x) { return !x.link_id && nameKey_(x.name) === nameKey_(rec.name); })[0];
    if (!twin) twin = insert_(other, Object.assign({ opening_balance: 0, created_at: now_() }, shared));
  }
  shared.link_id = rec.id;
  update_(other, twin.id, shared);
  return update_(self, rec.id, { link_id: twin.id });
}
function supplierSave_(p, user) {
  var name = String(p.name || '').trim(); if (!name) fail_('Supplier name is required');
  var row = { name: name, phones: joinList_(p.phones, ','), address: p.address || '', opening_balance: num_(p.opening_balance), note: p.note || '' };
  var combined = p.combined === undefined ? undefined : (p.combined === true || p.combined === 'true');
  if (combined) need_(user, 'customers');
  if (p.id) {
    if (p.active !== undefined) row.active = p.active === true || p.active === 'true';
    var upd = update_('Suppliers', p.id, row);
    if (combined !== undefined || upd.link_id) return syncCombined_('supplier', upd, combined === undefined ? !!upd.link_id : combined);
    return upd;
  }
  row.active = true; row.created_at = now_();
  var ins = insert_('Suppliers', row);
  return combined ? syncCombined_('supplier', ins, true) : ins;
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
/** Expense categories live in the Expenses module (staff with the expenses permission manage them). */
function expenseCategoriesSave_(p, user) {
  var seen = {}, list = (Array.isArray(p.categories) ? p.categories : []).map(function (c) { return String(c || '').trim().replace(/\s+/g, ' '); })
    .filter(function (c) { var k = c.toLowerCase(); if (!c || seen[k]) return false; seen[k] = 1; return true; }).slice(0, 200);
  if (!list.length) fail_('Keep at least one expense category');
  setSetting_('expense_categories', JSON.stringify(list));
  audit_(user, 'expense_categories', { count: list.length });
  return list;
}
function settingsSave_(p, user) {
  var allowed = ['shop_name', 'shop_phone', 'shop_tel', 'shop_email', 'shop_web', 'shop_social', 'shop_address', 'shop_footer', 'currency', 'invoice_prefix', 'receipt_width', 'low_stock_default', 'expense_categories',
    'sms_enabled', 'sms_method', 'sms_url', 'sms_body', 'sms_body_type', 'sms_api_key', 'sms_sender_id', 'sms_number_format', 'sms_template',
    'dashboard_hidden', 'invoice_template', 'invoice_paper', 'invoice_custom_width', 'invoice_custom_height', 'invoice_note'];
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
    if (res.getResponseCode() >= 400 || smsReplyFailed_(text)) status = 'failed';
  } catch (e) { status = 'failed'; text = String(e.message || e); }
  insert_('SmsLog', { ts: now_(), phone: number, message: message, status: status, response: text });
  return { ok: status === 'sent', status: status, response: text };
}
/**
 * Bangladeshi gateways (MRAM, BulkSMSBD and similar panels) answer HTTP 200 even when nothing was sent,
 * with an error code in the body: a bare number such as "1003", or JSON like {"response_code":1007}.
 * 202 / "SMS SUBMITTED" means accepted. Anything else is treated as sent.
 */
function smsReplyFailed_(text) {
  var t = String(text || '').trim();
  if (/^\d{4}$/.test(t) && t !== '0000') return true;                 // bare error code, e.g. 1003
  var m = t.match(/"(?:response_code|code|status_code)"\s*:\s*"?(\d+)"?/i);
  if (m && m[1] !== '202' && m[1] !== '200' && /^1\d{3}$/.test(m[1])) return true;
  return /\b(invalid|insufficient|not found|error|failed|unauthori[sz]ed)\b/i.test(t) && !/submitted|success/i.test(t);
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
  var r = sendSms_(p.phone, 'Test SMS from ' + getSetting_('shop_name') + ' - Karvio');
  if (!r.ok) fail_('SMS failed — gateway replied: ' + (r.response || 'nothing') + '. Check the API key, Sender ID, balance and the API URL.');
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
    units: units_().map(function (u) { return { id: u.id, name: u.name, label: u.label, decimal: u.decimal }; }),
    products: productsList_(user),
    customers: customersList_().filter(function (c) { return c.active; }),
    suppliers: can_(user, 'purchase') || can_(user, 'suppliers') ? suppliersList_().filter(function (s) { return s.active; }) : [],
    serverTime: now_(), serverToday: today_()
  };
}
/* ============================================================================
 *  12. PURCHASES
 * ========================================================================== */
function splitSerials_(v) {
  return (Array.isArray(v) ? v : String(v || '').split(/[\n,]+/)).map(function (s) { return String(s).trim(); }).filter(Boolean);
}
function isSerialProduct_(pr) { return !pr.service && pr.has_warranty && pr.warranty_type === 'serial'; }
/**
 * Serial-tracked products: the product's cost is the average of the purchase costs of the units now in stock.
 * Each unit still sells at its own cost (profit stays exact); this keeps the shown cost and stock value right
 * when units were bought at different prices. With nothing in stock the last cost is kept.
 */
function syncSerialCost_(ids) {
  var want = ids ? {} : null; (ids || []).forEach(function (id) { want[id] = 1; });
  var acc = {};
  all_('SerialItems').forEach(function (s) {
    if (s.status !== 'in_stock' || (want && !want[s.product_id])) return;
    var a = acc[s.product_id] = acc[s.product_id] || { n: 0, sum: 0 }; a.n++; a.sum += num_(s.cost);
  });
  all_('Products').forEach(function (pr) {
    if (!isSerialProduct_(pr) || (want && !want[pr.id]) || !acc[pr.id]) return;
    var avg = round_(acc[pr.id].sum / acc[pr.id].n, 4);
    if (Math.abs(avg - num_(pr.cost_price)) > 0.00005) update_('Products', pr.id, { cost_price: avg });
  });
}
function serialIds_(lines) { return lines.filter(function (l) { return l.pr && isSerialProduct_(l.pr); }).map(function (l) { return l.pr.id; }); }
// Service items (Inventory unticked: software install, Windows setup, repair charge) have no stock and no cost.
function isService_(pr) { return !!pr && (pr.service === true || pr.service === 'true'); }
function nameKey_(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }

function purchaseCreate_(p, user) {
  var pmap = indexBy_(all_('Products')), items = p.items || [];
  if (!items.length) fail_('Add at least one item');
  var supplier = p.supplier_id ? all_('Suppliers').filter(function (s) { return s.id === p.supplier_id; })[0] : null;
  if (p.supplier_id && !supplier) fail_('Supplier not found');
  var date = p.date || today_(), sidx = serialIndex_(), seen = {}, lines = [], subtotal = 0;

  items.forEach(function (it) {
    var pr = pmap[it.product_id]; if (!pr) fail_('Product not found');
    if (isService_(pr)) fail_(pr.name + ' is a service (no inventory) and does not need to be purchased');
    var qty = num_(it.qty); if (qty <= 0) fail_('Invalid quantity for ' + pr.name);
    var cost = num_(it.cost); if (cost <= 0) fail_('Enter the unit cost for ' + pr.name);
    var newSale = it.sale_price === '' || it.sale_price == null ? 0 : num_(it.sale_price);
    var newWhole = it.wholesale_price === '' || it.wholesale_price == null ? null : num_(it.wholesale_price);
    if (newSale < 0 || (newWhole !== null && newWhole < 0)) fail_('Invalid selling price for ' + pr.name);
    if (newSale <= 0 && !(pr.sale_price > 0)) fail_('Set the retail price for ' + pr.name + ' — it has no selling price yet');
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
    } else if (!isDecimalUnit_(pr.unit) && qty % 1 !== 0) fail_('Quantity for ' + pr.name + ' must be a whole number');
    var total = round_(qty * cost);
    lines.push({ pr: pr, qty: qty, cost: cost, total: total, serials: sers, sale: newSale, whole: newWhole });
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
  lines.forEach(function (l, index) {
    var pr = l.pr, oldStock = pr.stock;
    // weighted-average cost for non-serial items; latest cost otherwise
    // Weighted average of what is in stock and what arrives now. Serial items: average of the in-stock units' own costs.
    var newCost = l.cost;
    if (isSerialProduct_(pr)) {
      var held = all_('SerialItems').filter(function (s) { return s.product_id === pr.id && s.status === 'in_stock'; });
      newCost = round_((sum_(held, function (s) { return num_(s.cost); }) + l.cost * l.qty) / (held.length + l.qty), 4);
    } else if (oldStock > 0) newCost = round_((oldStock * pr.cost_price + l.total) / (oldStock + l.qty), 4);
    update_('PurchaseItems', rows[index].id, { valuation: { stock: oldStock, cost: pr.cost_price, after_stock: round_(oldStock + l.qty, 4), after_cost: newCost } });
    var patch = { stock: round_(oldStock + l.qty, 4), cost_price: newCost };
    if (l.sale > 0) patch.sale_price = l.sale;
    if (l.whole !== null) patch.wholesale_price = l.whole;
    update_('Products', pr.id, patch);
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
  syncSerialCost_(serialIds_(lines));
  audit_(user, 'purchase_create', inv);
  return purchaseDetail_({ id: pur.id });
}

function purchaseDetail_(p) {
  var pur = all_('Purchases').filter(function (x) { return x.id === p.id || x.invoice_no === p.id; })[0];
  if (!pur) fail_('Purchase not found');
  var returns = all_('PurchaseReturns').filter(function (r) { return r.purchase_id === pur.id; });
  var prods = indexBy_(all_('Products'));
  return {
    purchase: pur,
    items: all_('PurchaseItems').filter(function (i) { return i.purchase_id === pur.id; }).map(function (i) {
      var o = Object.assign({}, i), pr = prods[i.product_id]; delete o._row;
      o.description = pr ? pr.description || '' : ''; o.sku = pr ? pr.sku || '' : '';
      return o;
    }),
    supplier: pur.supplier_id ? all_('Suppliers').filter(function (s) { return s.id === pur.supplier_id; })[0] || null : null,
    returns: returns
  };
}
/** Full details of several purchases at once (for exporting / printing the selected invoices). */
function purchasesDetails_(p) {
  var ids = Array.isArray(p.ids) ? p.ids.slice(0, 200) : [];
  if (!ids.length) fail_('Select at least one purchase');
  return ids.map(function (id) { return purchaseDetail_({ id: id }); });
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
  }).sort(function (a, b) { return b._row - a._row; });
  var clean = function (x) { var o = Object.assign({}, x); delete o._row; o.items_text = (items[x.id] || []).join(', '); return o; };
  if (p.page) { // paged: newest first, `per` rows per page, with grand totals of everything that matches
    var per = Math.min(Math.max(num_(p.per) || 10, 1), 100), page = Math.max(Math.round(num_(p.page)), 1);
    var active = rows.filter(function (x) { return x.status === 'active'; });
    return {
      rows: rows.slice((page - 1) * per, page * per).map(clean), total: rows.length, page: page, per: per,
      sums: { total: round_(sum_(active, function (x) { return x.total; })), paid: round_(sum_(active, function (x) { return x.paid; })), due: round_(sum_(active, function (x) { return x.due; })) }
    };
  }
  return rows.slice(0, num_(p.limit) || 500).map(clean);
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
    if (!isDecimalUnit_(pr.unit) && qty % 1 !== 0) fail_('Quantity for ' + pr.name + ' must be a whole number');
    need[pr.id] = (need[pr.id] || 0) + qty;
  });
  Object.keys(need).forEach(function (id) {
    if (!isService_(pmap[id]) && pmap[id].stock < need[id] - 1e-9) fail_('Insufficient stock for ' + pmap[id].name + ' (available ' + pmap[id].stock + ' ' + pmap[id].unit + ')');
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
    } else cost = isService_(pr) ? 0 : pr.cost_price * qty;
    var wDays = 0, wExp = '';
    if (pr.has_warranty) {
      wDays = (it.warranty_days !== undefined && it.warranty_days !== null && it.warranty_days !== '') ? Math.min(Math.max(Math.round(num_(it.warranty_days)), 0), 36500) : pr.warranty_days;
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
  var nextPay = due > 0.005 ? promiseDate_(p.next_payment_date, date) : '';

  var inv = nextNo_('seq_sale', getSetting_('invoice_prefix', 'INV-'));
  var profit = round_(total - costTotal);
  var sale = insert_('Sales', {
    invoice_no: inv, date: date, customer_id: customer ? customer.id : '', customer_name: customer ? customer.name : 'Walk-in',
    subtotal: subtotal, discount: discount, total: total, paid: paid, credit_used: creditUsed, due: due, cost: round_(costTotal), profit: profit,
    note: p.note || '', status: 'active', user_id: user.id, user_name: user.name, created_at: now_(), payments: pays, next_payment_date: nextPay
  });
  var rows = insertMany_('SaleItems', lines.map(function (l) {
    return { sale_id: sale.id, product_id: l.pr.id, name: l.pr.name, unit: l.pr.unit, qty: l.qty, price: l.price, cost: l.cost, total: l.total, serials: l.serials.join(','), warranty_type: l.wType, warranty_days: l.wDays, warranty_expiry: l.wExp };
  }));
  var events = [];
  lines.forEach(function (l) {
    if (!isService_(l.pr)) update_('Products', l.pr.id, { stock: round_(l.pr.stock - l.qty, 4) });
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
  syncSerialCost_(serialIds_(lines));
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
  var events = [], retRows = all_('SalesReturnItems').filter(function (x) { return x.return_id === ret.id; });
  lines.forEach(function (l, li) {
    if (!isService_(l.pr)) {
      // Returned goods go back at what they cost when they were sold (the supplier's purchase price),
      // never at the selling price. Non-serial items blend that cost into the weighted average.
      var cur = pmap[l.pr.id], oldStock = cur.stock, oldCost = cur.cost_price, newStock = round_(oldStock + l.qty, 4), newCost = oldCost;
      if (!isSerialProduct_(cur)) newCost = newStock > 0 ? round_((Math.max(oldStock, 0) * oldCost + l.cost) / (Math.max(oldStock, 0) + l.qty), 4) : oldCost;
      update_('Products', cur.id, { stock: newStock, cost_price: newCost });
      cur.stock = newStock; cur.cost_price = newCost;
      if (retRows[li]) update_('SalesReturnItems', retRows[li].id, { valuation: { stock: oldStock, cost: oldCost, after_stock: newStock, after_cost: newCost } });
    }
    l.serials.forEach(function (s) {
      update_('SerialItems', sidx[l.pr.id + '|' + s].id, { status: 'in_stock', sale_id: '' });
      events.push({ serial: s, product_id: l.pr.id, product_name: l.pr.name, event: 'sale_return', ref_type: 'sreturn', ref_id: ret.id, ref_no: no, party: sale.customer_name, qty: 1, amount: l.si.price, note: 'Returned from ' + sale.invoice_no });
    });
    if (!l.serials.length) events.push({ serial: '', product_id: l.pr.id, product_name: l.pr.name, event: 'sale_return', ref_type: 'sreturn', ref_id: ret.id, ref_no: no, party: sale.customer_name, qty: l.qty, amount: l.value, note: 'Returned from ' + sale.invoice_no });
  });
  if (refund > 0) acctTxn_(accId, 'out', refund, 'sreturn', ret.id, 'Refund ' + no, user, date);
  if (sale.customer_id) insert_('CustomerLedger', { date: date, customer_id: sale.customer_id, type: 'sreturn', ref_id: ret.id, ref_no: no, debit: refund, credit: total, note: (ret.type === 'exchange' ? 'Exchange ' : 'Return ') + no + ' (' + sale.invoice_no + ')', voided: false });
  evBatch_(user, events);
  syncSerialCost_(serialIds_(lines));
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
  syncSerialCost_(serialIds_(lines));
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
/** Statements of several customers / suppliers at once, for exporting the selected parties. */
function partyStatements_(kind, p) {
  var ids = Array.isArray(p.ids) ? p.ids.slice(0, 300) : [];
  if (!ids.length) fail_('Select at least one ' + kind);
  var parties = kind === 'customer' ? customersList_() : suppliersList_(), map = indexBy_(parties);
  return ids.filter(function (id) { return map[id]; }).map(function (id) {
    var st = kind === 'customer' ? customerStatement_({ customer_id: id }) : supplierStatement_({ supplier_id: id });
    st.info = map[id]; return st;
  });
}
/** A customer / supplier can be deleted only when their ledger balance is exactly 0. Old invoices keep the name. */
function partyDelete_(kind, p, user) {
  var table = kind === 'customer' ? 'Customers' : 'Suppliers';
  var party = all_(table).filter(function (x) { return x.id === p.id; })[0]; if (!party) fail_((kind === 'customer' ? 'Customer' : 'Supplier') + ' not found');
  var bal = round_((kind === 'customer' ? customerBalances_() : supplierBalances_())[party.id] || 0);
  if (Math.abs(bal) > 0.004) fail_(party.name + ' still has a balance of ' + bal + '. Settle it to 0 before deleting');
  if (party.link_id) { var twinT = kind === 'customer' ? 'Suppliers' : 'Customers'; if (all_(twinT).some(function (x) { return x.id === party.link_id; })) update_(twinT, party.link_id, { link_id: '' }); }
  remove_(table, party.id);
  audit_(user, kind + '_delete', { name: party.name, phones: party.phones });
  return true;
}

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
  syncSerialCost_(null);
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
    var pr = pmap[i.product_id]; if (pr && !isService_(pr)) update_('Products', pr.id, { stock: round_(pr.stock + i.qty, 4) });
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
  var purchaseEvent = 0;
  all_('ItemEvents').forEach(function (e) { if (e.ref_type === 'purchase' && e.ref_id === pur.id && e.event === 'purchase') purchaseEvent = Math.max(purchaseEvent, e._row); });
  var activeSales = indexBy_(all_('Sales').filter(function (s) { return s.status === 'active'; }));
  var activeReturns = indexBy_(all_('PurchaseReturns').filter(function (r) { return r.status === 'active'; }));
  var affected = {}; items.forEach(function (i) { affected[i.product_id] = true; });
  // Removing an earlier cost layer after a sale would also change recorded profit.
  // Require those dependent operations to be reversed before changing that layer.
  if (purchaseEvent && all_('ItemEvents').some(function (e) {
    return affected[e.product_id] && e._row > purchaseEvent &&
      ((e.event === 'sale' && activeSales[e.ref_id]) ||
       (e.event === 'purchase_return' && activeReturns[e.ref_id]) || e.event === 'stock_adjust');
  })) fail_('Cannot cancel: stock has already been sold, returned or adjusted. Reverse those later operations first');
  var planned = {};
  items.slice().reverse().forEach(function (i) {
    var pr = planned[i.product_id] || Object.assign({}, pmap[i.product_id]);
    if (!pr.id || pr.stock < i.qty - 1e-9) fail_('Cannot cancel: insufficient stock for ' + i.name);
    var before = null; try { before = JSON.parse(i.valuation || 'null'); } catch (e) {}
    var remaining = round_(pr.stock - i.qty, 4), cost = pr.cost_price;
    if (before && Math.abs(pr.stock - before.after_stock) < 1e-9 && Math.abs(cost - before.after_cost) < 0.00005) cost = before.cost;
    else if (!i.serials) {
      cost = remaining > 0 ? round_((pr.stock * cost - i.qty * i.cost) / remaining, 4) : 0;
      if (cost < -0.0001) fail_('Cannot cancel: later inventory changes must be reversed first');
      cost = Math.max(0, cost);
    }
    pr.stock = remaining; pr.cost_price = cost; planned[i.product_id] = pr;
  });
  items.forEach(function (i) {
    var pr = pmap[i.product_id];
    if (pr && pr.stock < i.qty - 1e-9) fail_('Cannot cancel: ' + i.name + ' has already been sold (only ' + pr.stock + ' in stock)');
    parseList_(i.serials).forEach(function (sn) {
      var rec = sidx[i.product_id + '|' + sn];
      if (!rec || rec.status !== 'in_stock' || rec.purchase_id !== pur.id) fail_('Cannot cancel: serial ' + sn + ' is no longer in stock');
    });
  });
  var events = [];
  Object.keys(planned).forEach(function (id) { update_('Products', id, { stock: planned[id].stock, cost_price: planned[id].cost_price }); });
  items.forEach(function (i) {
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
    if (!isService_(pr) && pr.stock < i.qty - 1e-9) fail_('Cannot cancel: ' + i.name + ' returned stock has already been sold again');
    parseList_(i.serials).forEach(function (sn) { var rec = sidx[i.product_id + '|' + sn]; if (!rec || rec.status !== 'in_stock') fail_('Cannot cancel: serial ' + sn + ' is no longer in stock'); });
  });
  var events = [];
  items.slice().reverse().forEach(function (i) {
    var pr = pmap[i.product_id]; if (isService_(pr)) return;
    var remaining = round_(pr.stock - i.qty, 4), cost = pr.cost_price, before = null;
    try { before = typeof i.valuation === 'string' ? JSON.parse(i.valuation || 'null') : i.valuation; } catch (e) {}
    if (before && Math.abs(pr.stock - before.after_stock) < 1e-9 && Math.abs(cost - before.after_cost) < 0.00005) cost = before.cost;
    else if (before && !i.serials && remaining > 0) cost = Math.max(0, round_((pr.stock * cost - i.cost) / remaining, 4));
    update_('Products', pr.id, { stock: remaining, cost_price: cost });
    pr.stock = remaining; pr.cost_price = cost;
  });
  items.forEach(function (i) {
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
/* ============================================================================
 *  20. DASHBOARD
 * ========================================================================== */
/** Next payment date promised on a due sale: '' (none) or yyyy-MM-dd, not before the sale date. */
function promiseDate_(v, saleDate) {
  var d = String(v || '').trim().slice(0, 10);
  if (!d) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(new Date(d + 'T12:00:00').getTime())) fail_('Next payment date is not a valid date');
  if (d < saleDate) fail_('Next payment date cannot be before ' + saleDate);
  return d;
}
/** Set / change / clear the promised payment date of a due invoice (from the dashboard reminder). */
function salePromise_(p, user) {
  var s = all_('Sales').filter(function (x) { return x.id === p.id; })[0];
  if (!s || s.status !== 'active') fail_('Invoice not found');
  if (!s.customer_id) fail_('Only customer invoices have a payment date');
  if (!can_(user, 'sales.all') && !can_(user, 'customers') && s.user_id !== user.id) fail_('You can only change your own invoices');
  var t = today_(), d = p.next_payment_date ? promiseDate_(p.next_payment_date, t > s.date ? t : s.date) : '';
  update_('Sales', s.id, { next_payment_date: d });
  audit_(user, 'sale_promise', s.invoice_no + ' -> ' + (d || 'cleared'));
  return { id: s.id, next_payment_date: d };
}
/**
 * Collection reminders: due invoices whose promised payment date is today or already passed.
 * Customer payments (and returns credited to the account) made after an invoice are applied to the
 * oldest promised invoices first, so a reminder switches itself off once that invoice is paid,
 * including when the customer paid before the promised date.
 */
function collectionReminders_(sales, today) {
  var promised = sales.filter(function (s) { return s.customer_id && s.next_payment_date && s.due > 0.005; });
  if (!promised.length) return [];
  var bal = customerBalances_(), custs = indexBy_(all_('Customers')), out = [];
  var byCust = {}; promised.forEach(function (s) { (byCust[s.customer_id] = byCust[s.customer_id] || []).push(s); });
  var ledger = all_('CustomerLedger').filter(function (l) { return !l.voided && byCust[l.customer_id]; });
  var saleRow = {}; ledger.forEach(function (l) { if (l.type === 'sale') saleRow[l.ref_id] = l._row; });
  Object.keys(byCust).forEach(function (cid) {
    var open = byCust[cid].map(function (s) { return { s: s, row: saleRow[s.id] || 0, left: s.due }; }).sort(function (a, b) { return a.row - b.row; });
    ledger.filter(function (l) { return l.customer_id === cid && (l.type === 'payment' || l.type === 'sreturn'); }).forEach(function (l) {
      var amt = round_(l.credit - l.debit); if (amt <= 0) return;
      open.forEach(function (o) { if (amt <= 0 || o.left <= 0 || o.row > l._row) return; var take = Math.min(o.left, amt); o.left = round_(o.left - take); amt = round_(amt - take); });
    });
    var cap = Math.max(bal[cid] || 0, 0), c = custs[cid] || {};
    open.forEach(function (o) {
      var left = Math.min(o.left, cap); if (left <= 0.005 || o.s.next_payment_date > today) return;
      var days = Math.round((new Date(today + 'T12:00:00') - new Date(o.s.next_payment_date + 'T12:00:00')) / 864e5);
      out.push({ sale_id: o.s.id, invoice_no: o.s.invoice_no, customer_id: cid, customer_name: c.name || o.s.customer_name, phone: parseList_(c.phones || '')[0] || '',
        date: o.s.date, next_payment_date: o.s.next_payment_date, overdue_days: days, invoice_due: o.s.due, remaining: round_(left), customer_balance: round_(bal[cid] || 0) });
    });
  });
  return out.sort(function (a, b) { return b.overdue_days - a.overdue_days || b.remaining - a.remaining; });
}
/** Best sellers by product for today / this month / all time, net of returns, with the product group. */
function topProducts_(sales, today) {
  var month = today.slice(0, 7), byId = indexBy_(sales), prods = indexBy_(all_('Products')), cats = indexBy_(all_('Categories'));
  var retQty = {}, actRet = {};
  all_('SalesReturns').forEach(function (r) { if (r.status === 'active') actRet[r.id] = 1; });
  all_('SalesReturnItems').forEach(function (x) { if (actRet[x.return_id]) retQty[x.sale_item_id] = (retQty[x.sale_item_id] || 0) + x.qty; });
  var per = { today: {}, month: {}, total: {} };
  all_('SaleItems').forEach(function (i) {
    var s = byId[i.sale_id]; if (!s) return;
    var q = i.qty - (retQty[i.id] || 0); if (q <= 1e-9) return;
    var amt = i.qty ? i.total * q / i.qty : 0, cost = i.qty ? i.cost * q / i.qty : 0, d = String(s.date).slice(0, 10), pr = prods[i.product_id] || {};
    [['total', true], ['month', d.slice(0, 7) === month], ['today', d === today]].forEach(function (k) {
      if (!k[1]) return;
      var g = per[k[0]];
      var r = g[i.product_id] = g[i.product_id] || { product_id: i.product_id, name: pr.name || i.name, unit: i.unit || pr.unit || 'pcs', group_id: pr.category_id || '', group: (cats[pr.category_id] || {}).name || 'No group', category: (cats[pr.subcategory_id] || {}).name || '', qty: 0, amount: 0, profit: 0, inv: {} };
      r.qty += q; r.amount += amt; r.profit += amt - cost; r.inv[i.sale_id] = 1;
    });
  });
  var out = {};
  Object.keys(per).forEach(function (k) {
    out[k] = Object.keys(per[k]).map(function (id) { var r = per[k][id]; return { product_id: r.product_id, name: r.name, unit: r.unit, group_id: r.group_id, group: r.group, category: r.category, qty: round_(r.qty, 4), amount: round_(r.amount), profit: round_(r.profit), invoices: Object.keys(r.inv).length }; })
      .sort(function (a, b) { return b.amount - a.amount || b.qty - a.qty; }).slice(0, 300);
  });
  return out;
}
/** POS price history for one product: last purchase (cost permission only) and the last 3 selling prices. */
function productHistory_(p, user) {
  var pr = all_('Products').filter(function (x) { return x.id === p.product_id; })[0]; if (!pr) fail_('Product not found');
  var out = { product_id: pr.id, stock: pr.stock, last_sales: [] };
  var actSale = indexBy_(all_('Sales').filter(function (s) { return s.status === 'active'; }));
  var si = all_('SaleItems').filter(function (i) { return i.product_id === pr.id && actSale[i.sale_id]; });
  out.last_sales = si.slice(-3).reverse().map(function (i) { var s = actSale[i.sale_id]; return { price: i.price, qty: i.qty, date: s.date, invoice_no: s.invoice_no, customer: s.customer_name }; });
  if (can_(user, 'cost') || can_(user, 'purchase')) {
    var actPur = indexBy_(all_('Purchases').filter(function (x) { return x.status === 'active'; }));
    var pi = all_('PurchaseItems').filter(function (i) { return i.product_id === pr.id && actPur[i.purchase_id]; });
    var last = pi[pi.length - 1];
    if (can_(user, 'cost')) out.avg_cost = pr.cost_price;
    out.last_purchase = last ? { cost: last.cost, qty: last.qty, date: actPur[last.purchase_id].date, invoice_no: actPur[last.purchase_id].invoice_no, supplier: actPur[last.purchase_id].supplier_name } : null;
  }
  return out;
}

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

  // Sales history cards: this week (Sat–Fri), this / last month, last 6 months, this / last year.
  var y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  var ym = function (yy, mm) { while (mm < 1) { mm += 12; yy--; } return yy + '-' + ('0' + mm).slice(-2); };
  var lastDay = function (s) { var d = new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)), 0); return s + '-' + ('0' + d.getDate()).slice(-2); };
  var dow = new Date(today + 'T12:00:00').getDay(); // 0 = Sunday … 6 = Saturday
  var lm = ym(y, m - 1);
  var ranges = [
    ['week', 'This week', addDays_(today, -((dow + 1) % 7)), today],
    ['month', 'This month', month + '-01', today],
    ['last_month', 'Last month', lm + '-01', lastDay(lm)],
    ['six_months', 'Last 6 months', ym(y, m - 5) + '-01', today],
    ['year', 'This year', y + '-01-01', today],
    ['last_year', 'Last year', (y - 1) + '-01-01', (y - 1) + '-12-31']
  ];
  var act = function (t) { return full ? all_(t).filter(function (x) { return x.status === 'active'; }) : []; };
  var srAll = act('SalesReturns'), puAll = act('Purchases'), prAll = act('PurchaseReturns'), exAll = act('Expenses');
  out.periods = ranges.map(function (r) {
    var inR = function (x) { var d = String(x.date).slice(0, 10); return d >= r[2] && d <= r[3]; };
    var s = sales.filter(inR), ret = round_(sum_(srAll.filter(inR), function (x) { return x.total; }));
    var tot = round_(sum_(s, function (x) { return x.total; }));
    var row = { key: r[0], label: r[1], from: r[2], to: r[3], sales: tot, invoices: s.length, returns: ret, net: round_(tot - ret) };
    if (showCost && full) row.profit = round_(sum_(s, function (x) { return x.profit; }) - sum_(srAll.filter(inR), function (x) { return x.total - x.cost; }));
    if (full) {
      var sr = srAll.filter(inR), pu = puAll.filter(inR), pr = prAll.filter(inR), ex = exAll.filter(inR);
      row.sales_returns = { amount: ret, count: sr.length };
      row.purchases = { amount: round_(sum_(pu, function (x) { return x.total; })), count: pu.length };
      row.purchase_returns = { amount: round_(sum_(pr, function (x) { return x.total; })), count: pr.length };
      row.expenses = { amount: round_(sum_(ex, function (x) { return x.amount; })), count: ex.length };
      if (row.profit !== undefined) {
        row.gross_profit = { amount: row.profit, count: s.length };
        row.net_profit = { amount: round_(row.profit - row.expenses.amount), count: ex.length };
      }
      var sd = s.filter(function (x) { return x.due > 0; }), pd = pu.filter(function (x) { return x.due > 0; });
      row.receivable = { amount: round_(sum_(sd, function (x) { return x.due; })), count: sd.length };
      row.payable = { amount: round_(sum_(pd, function (x) { return x.due; })), count: pd.length };
    }
    return row;
  });

  var series = [];
  for (var i = 13; i >= 0; i--) {
    var d = addDays_(today, -i), ds = sales.filter(function (x) { return x.date === d; });
    var row = { date: d, sales: round_(sum_(ds, function (x) { return x.total; })), invoices: ds.length };
    if (showCost) row.profit = round_(sum_(ds, function (x) { return x.profit; }));
    series.push(row);
  }
  out.series = series;
  out.reminders = collectionReminders_(sales, today);
  out.top_products = topProducts_(sales, today);
  out.recent = sales.slice(-8).reverse().map(function (s) { return { id: s.id, invoice_no: s.invoice_no, customer_name: s.customer_name, total: s.total, due: s.due, date: s.date }; });

  var thDef = num_(getSetting_('low_stock_default', '5'));
  out.low_stock = all_('Products').filter(function (x) { return x.active && !isService_(x) && x.stock <= (x.low_stock > 0 ? x.low_stock : thDef); })
    .sort(function (a, b) { return a.stock - b.stock; }).slice(0, 40)
    .map(function (x) { return { id: x.id, name: x.name, stock: x.stock, unit: x.unit, threshold: x.low_stock > 0 ? x.low_stock : thDef }; });
  if (!full) return out;

  var accs = accountsList_().filter(function (a) { return a.active; });
  out.accounts = accs.map(function (a) { return { id: a.id, name: a.name, type: a.type, number: a.number, balance: a.balance }; });
  out.receivable = round_(sum_(customersList_(), function (c) { return c.balance > 0 ? c.balance : 0; }));
  out.payable = round_(sum_(suppliersList_(), function (c) { return c.balance > 0 ? c.balance : 0; }));
  out.stock_value = showCost ? round_(sum_(all_('Products'), function (x) { return x.stock * x.cost_price; })) : undefined;
  var goods = all_('Products').filter(function (x) { return x.active && !isService_(x); }), held = goods.filter(function (x) { return x.stock > 0; });
  out.stock_summary = {
    products: goods.length, in_stock: held.length, out_of_stock: goods.length - held.length,
    sale_value: round_(sum_(held, function (x) { return x.stock * x.sale_price; })),
    unpriced: held.filter(function (x) { return !(x.sale_price > 0); }).length
  };
  if (showCost) {
    out.stock_summary.cost_value = round_(sum_(held, function (x) { return x.stock * x.cost_price; }));
    out.stock_summary.expected_profit = round_(out.stock_summary.sale_value - out.stock_summary.cost_value);
  }
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
/* ============================================================================
 *  22. API ROUTER
 *      r(perm, handler, isWrite)   perm = null → any signed-in user
 * ========================================================================== */
function r_(perm, fn, write) { return { perm: perm, fn: fn, write: !!write }; }

var ROUTES = {
  ping:               { public: true, fn: function () { return { app: 'Karvio', version: APP_VERSION, time: now_() }; } },
  login:              { public: true, fn: login_, write: false },
  logout:             r_(null, logout_),
  'password.change':  r_(null, changePassword_, true),
  bootstrap:          r_(null, bootstrap_),

  'products.list':    r_(null, function (p, u) { return productsList_(u); }),
  'product.save':     r_('products', productSave_, true),
  'product.delete':   r_('products', productDelete_, true),
  'serials.list':     r_(null, serialsList_),
  'serials.find':     r_(null, serialFind_),
  'product.history':  r_(null, function (p, u) { if (!can_(u, 'pos') && !can_(u, 'purchase')) fail_('Permission denied'); return productHistory_(p, u); }),
  'sale.promise':     r_('pos', salePromise_, true),
  'stock.adjust':     r_('products', stockAdjust_, true),
  'master.save':      r_('products', masterSave_, true),
  'master.delete':    r_('products', masterDelete_, true),
  'master.import':    r_('products', masterImport_, true),
  'price.update':     r_('products', priceUpdate_, true),

  'customers.list':   r_(null, function () { return customersList_(); }),
  'customer.save':    r_(null, function (p, u) { if (!p.id && !can_(u, 'customers') && !can_(u, 'pos')) fail_('Permission denied'); return customerSave_(p, u); }, true),
  'customer.quickAdd':r_('pos', customerQuickAdd_, true),
  'customer.statement': r_('customers', customerStatement_),
  'customer.statements': r_('customers', function (p) { return partyStatements_('customer', p); }),
  'customer.delete':  r_('customers', function (p, u) { return partyDelete_('customer', p, u); }, true),
  'supplier.statements': r_('suppliers', function (p) { return partyStatements_('supplier', p); }),
  'supplier.delete':  r_('suppliers', function (p, u) { return partyDelete_('supplier', p, u); }, true),
  'customer.payment': r_('customers', customerPayment_, true),
  'suppliers.list':   r_('suppliers', function () { return suppliersList_(); }),
  'supplier.save':    r_('suppliers', supplierSave_, true),
  'supplier.statement': r_('suppliers', supplierStatement_),
  'supplier.payment': r_('suppliers', supplierPayment_, true),

  'accounts.list':    r_('accounts', function () { return accountsList_(); }),
  'account.save':     r_('accounts', accountSave_, true),
  'account.entry':    r_('accounts', accountEntry_, true),
  'account.ledger':   r_('accounts', accountLedger_),

  'purchase.create':  r_('purchase', purchaseCreate_, true),
  'purchase.detail':  r_('purchase', purchaseDetail_),
  'purchases.list':   r_('purchase', purchasesList_),
  'purchases.details': r_('purchase', purchasesDetails_),
  'preturn.create':   r_('purchase', preturnCreate_, true),
  'preturns.list':    r_('purchase', preturnsList_),

  'sale.create':      r_('pos', saleCreate_, true),
  'sale.detail':      r_('pos', saleDetail_),
  'sales.details':    r_('pos', function (p, u) { var ids = Array.isArray(p.ids) ? p.ids.slice(0, 200) : []; if (!ids.length) fail_('Select at least one invoice'); return ids.map(function (id) { return saleDetail_({ id: id }, u); }); }),
  'sales.list':       r_('pos', salesList_),
  'sreturn.create':   r_('sales.return', sreturnCreate_, true),
  'sreturns.list':    r_('sales.return', sreturnsList_),

  'expense.create':   r_('expenses', expenseCreate_, true),
  'expense.categories': r_('expenses', expenseCategoriesSave_, true),
  'expenses.list':    r_('expenses', expensesList_),

  'reverse':          r_('cancel', reverse_, true),

  'warranty.lookup':  r_('warranty', warrantyLookup_),
  'claim.create':     r_('warranty', claimCreate_, true),
  'claim.update':     r_('warranty', claimUpdate_, true),
  'claims.list':      r_('warranty', claimsList_),

  'history':          r_(null, itemHistory_),
  'dashboard':        r_(null, dashboard_),
  'reports':          r_('reports', reports_),

  'users.list':       r_('users', usersList_),
  'user.save':        r_('users', userSave_, true),
  'rolePerms.save':   r_('users', rolePermsSave_, true),
  'settings.get':     r_(null, settingsGet_),
  'settings.save':    r_('settings', settingsSave_, true),
  'sms.test':         r_('settings', smsTest_),
  'sms.log':          r_('settings', smsLog_)
};

function doGet() {
  return json_({ ok: true, data: { app: 'Karvio', version: APP_VERSION, message: 'Karvio API is running. Send POST requests (text/plain JSON body).' } });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Invalid JSON body' }); }
  try {
    var route = ROUTES[req.action];
    if (!route) fail_('Unknown action: ' + req.action);
    var user = null;
    if (!route.public) {
      user = authUser_(req.token);
      need_(user, route.perm);
    }
    var run = function () { return route.fn(req.payload || {}, user, req.token); };
    var data = route.write ? withLock_(run) : run();
    return json_({ ok: true, data: data });
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    return json_({ ok: false, error: msg.replace(/^Error:\s*/, ''), auth: msg.indexOf('AUTH:') === 0 });
  }
}
