/**
 * ============================================================================
 *  ShopERP — Code.gs  (Google Apps Script backend)
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

var APP_VERSION = '1.0.0';
// Your ShopERP Database spreadsheet. Lets this script also run as a standalone project.
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
  Products:            'id,sku,barcode,name,category_id,subcategory_id,brand_id,unit,roll_length:n,cost_price:n,sale_price:n,wholesale_price:n,stock:n,low_stock:n,has_warranty:b,warranty_type,warranty_days:n,active:b,created_at',
  SerialItems:         'id,product_id,serial,purchase_id,sale_id,status,cost:n,created_at',
  Customers:           'id,name,phones,addresses,opening_balance:n,note,active:b,created_at',
  Suppliers:           'id,name,phones,address,opening_balance:n,note,active:b,created_at',
  Purchases:           'id,invoice_no,date,supplier_id,supplier_name,subtotal:n,discount:n,total:n,paid:n,due:n,note,status,user,created_at,payments,cancel_reason',
  PurchaseItems:       'id,purchase_id,product_id,name,unit,qty:n,cost:n,total:n,serials',
  Sales:               'id,invoice_no,date,customer_id,customer_name,subtotal:n,discount:n,total:n,paid:n,credit_used:n,due:n,cost:n,profit:n,note,status,user_id,user_name,created_at,payments,cancel_reason',
  SaleItems:           'id,sale_id,product_id,name,unit,qty:n,price:n,cost:n,total:n,serials,warranty_type,warranty_days:n,warranty_expiry',
  SalesReturns:        'id,return_no,date,sale_id,invoice_no,customer_id,customer_name,type,total:n,cost:n,refund:n,refund_account_id,note,status,user,created_at,cancel_reason',
  SalesReturnItems:    'id,return_id,sale_item_id,product_id,name,qty:n,price:n,cost:n,total:n,serials',
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
  return sh || createSheet_(ss, name);
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
    SpreadsheetApp.getUi().createMenu('ShopERP')
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
  if (!all_('Categories').length) seedCategories_();
  return 'ShopERP database is ready. Login: admin / admin123';
}

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
