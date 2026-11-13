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

var APP_VERSION = '1.2.2';
// Your Karvio database spreadsheet. Lets this script also run as a standalone project.
var DEFAULT_SHEET_ID = '1r7WI5GNHtppUCtCu_rZUmvfum92i0HZdK298Z4uZH7w';
var SESSION_TTL = 21600; // 6 hours (CacheService maximum)
var CASH_SALE_NAME = 'Cash'; // sales without a customer profile (older data says "Walk-in")
var SESSION_REFRESH_MS = 15 * 60 * 1000; // extend an active session at most once per 15 minutes
var API_CAPABILITIES = { idempotency: true, durableRecovery: true, credentialSessions: true, purchaseDuePayment: true, saleDuePayment: true };

/* ---------------------------------------------------------------------------
 *  SHEET SCHEMA  —  "column" or "column:type"   (types: s=text, n=number, b=boolean)
 * ------------------------------------------------------------------------- */
var SCHEMA = {
  Users:               'id,name,username,password_hash,salt,role,active:b,created_at,access_limit:b,access_from,access_to,access_days,phone',
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
  Purchases:           'id,invoice_no,date,supplier_id,supplier_name,subtotal:n,discount:n,total:n,paid:n,due:n,note,status,user,created_at,payments,cancel_reason,supplier_invoice',
  PurchaseItems:       'id,purchase_id,product_id,name,unit,qty:n,cost:n,total:n,serials,valuation',
  Sales:               'id,invoice_no,date,customer_id,customer_name,subtotal:n,discount:n,total:n,paid:n,credit_used:n,due:n,cost:n,profit:n,note,status,user_id,user_name,created_at,payments,cancel_reason,next_payment_date,balance_snapshot',
  SaleItems:           'id,sale_id,product_id,name,unit,qty:n,price:n,cost:n,total:n,serials,warranty_type,warranty_days:n,warranty_expiry',
  SalesReturns:        'id,return_no,date,sale_id,invoice_no,customer_id,customer_name,type,total:n,cost:n,refund:n,refund_account_id,note,status,user,created_at,cancel_reason',
  SalesReturnItems:    'id,return_id,sale_item_id,product_id,name,qty:n,price:n,cost:n,total:n,serials,valuation',
  PurchaseReturns:     'id,return_no,date,purchase_id,invoice_no,supplier_id,supplier_name,total:n,received:n,account_id,note,status,user,created_at,cancel_reason',
  PurchaseReturnItems: 'id,return_id,purchase_item_id,product_id,name,qty:n,cost:n,total:n,serials,valuation',
  Expenses:            'id,date,category,amount:n,account_id,note,user,status,created_at,cancel_reason',
  CustomerLedger:      'id,date,customer_id,type,ref_id,ref_no,debit:n,credit:n,note,voided:b',
  SupplierLedger:      'id,date,supplier_id,type,ref_id,ref_no,debit:n,credit:n,note,voided:b',
  WarrantyClaims:      'id,claim_no,date,serial,sale_id,invoice_no,product_id,product_name,customer_id,customer_name,phone,issue,expiry,in_warranty:b,status,vendor,log,delivered_date,updated_at,replacement',
  ItemEvents:          'id,ts,serial,product_id,product_name,event,ref_type,ref_id,ref_no,party,qty:n,amount:n,note,user',
  SmsLog:              'id,ts,phone,message,status,response',
  InvoiceLinks:        'id,token_hash,sale_id,created_at,expires_at',
  AuditLog:            'id,ts,user,action,detail',
  Repairs:             'id,job_no,date,customer_id,customer_name,phone,device,serial,problem,accessories,technician_id,technician_name,estimate:n,charge:n,advance:n,parts,status,note,sale_id,invoice_no,ready_date,delivered_date,cancel_reason,log,user,created_at,updated_at,result_note,result_by,result_at,alert_seen:b,alert_seen_by'
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
  'repairs':      'Repair jobs (job cards, parts, delivery)',
  'reports':      'Reports hub & full dashboard',
  'cancel':       'Cancel / reverse transactions',
  'users':        'User management',
  'settings':     'System settings'
};
var DEFAULT_ROLE_PERMS = {
  manager: ['pos','sales.all','sales.return','purchase','products','cost','customers','suppliers','accounts','expenses','warranty','repairs','reports'],
  sales:   ['pos','warranty'],
  technician: ['repairs']
};
var STAFF_ROLES = ['manager', 'sales', 'technician'];

/* ============================================================================
 *  1. DATABASE LAYER
 * ========================================================================== */
var _mem = {}; // per-execution cache
var _txn = null; // staged business rows; the durable journal is written before any data row
var _maintenance = false; // a full-table reset/restore has its own durable before-images
var JOURNAL_SHEET = '__KarvioTxnJournal';
var RECEIPT_SHEET = '__KarvioRequestReceipts';

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
      if (!headers[i]) {
        sh.getRange(1, i + 1).setValue(c.k).setFontWeight('bold');
        // text columns stay plain text, so "09:30" or "00123" are not turned into a time or a number
        if (c.t === 's' && sh.getMaxRows) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
      }
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
  var cs = cols_(name), sh = sheet_(name), last = dataLastRow_(name), rows = [];
  if (last > 1) {
    var vals = dataValues_(name, 2, last - 1, cs.length);
    vals.forEach(function (r, i) {
      if (r[0] === '' || r[0] === null) return;
      var o = { _row: i + 2 };
      cs.forEach(function (c, j) { o[c.k] = cast_(r[j], c.t); });
      cashSaleName_(name, o);
      rows.push(o);
    });
  }
  _mem[name] = rows;
  return rows;
}

/** Older cash sales were saved as "Walk-in"; every screen, report and print shows them as "Cash". */
function cashSaleName_(table, o) {
  if ((table === 'Sales' || table === 'SalesReturns' || table === 'WarrantyClaims') && !o.customer_id && o.customer_name === 'Walk-in') o.customer_name = CASH_SALE_NAME;
  else if (table === 'ItemEvents' && o.party === 'Walk-in' && (o.ref_type === 'sale' || o.ref_type === 'sreturn' || o.ref_type === 'claim')) o.party = CASH_SALE_NAME;
}
/** The real sheet is untouched until the complete row plan has been durably prepared. */
function flush_() { if (SpreadsheetApp.flush) SpreadsheetApp.flush(); }
function dataLastRow_(name) {
  var last = sheet_(name).getLastRow();
  if (_txn) Object.keys(_txn.rows).forEach(function (k) { var r = _txn.rows[k]; if (r.table === name) last = Math.max(last, r.row); });
  return last;
}
function dataValues_(name, start, height, width) {
  var sh = sheet_(name), actual = Math.max(0, Math.min(height, sh.getLastRow() - start + 1));
  var rows = actual ? sh.getRange(start, 1, actual, width).getValues() : [];
  while (rows.length < height) rows.push(Array(width).fill(''));
  if (_txn) rows = rows.map(function (row, i) { var r = _txn.rows[name + '|' + (start + i)]; return r ? r.after.slice(0, width) : row; });
  return rows;
}
function ensureRows_(sh, last) {
  if (sh.getMaxRows && sh.insertRowsAfter && last > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), last - sh.getMaxRows());
}
function writeRows_(name, start, column, values) {
  var sh = sheet_(name), width = cols_(name).length;
  if (!_txn) { ensureRows_(sh, start + values.length - 1); sh.getRange(start, column, values.length, values[0].length).setValues(values); return; }
  values.forEach(function (cells, i) {
    var row = start + i, key = name + '|' + row, op = _txn.rows[key];
    if (!op) {
      var old = row <= sh.getLastRow() ? sh.getRange(row, 1, 1, width).getValues()[0] : Array(width).fill('');
      op = _txn.rows[key] = { table: name, row: row, before: old.slice(), after: old.slice() };
    }
    cells.forEach(function (v, j) { op.after[column - 1 + j] = v; });
  });
}
function privateSheet_(name) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); if (sh.hideSheet) sh.hideSheet(); }
  return sh;
}
function journalCell_(value) { return value instanceof Date ? { __karvioDate: value.toISOString() } : value; }
function restoreCell_(value) { return value && typeof value === 'object' && value.__karvioDate ? new Date(value.__karvioDate) : value; }
function planText_(plan) {
  var copy = Object.assign({}, plan, { rows: plan.rows.map(function (r) {
    return { table: r.table, row: r.row, before: r.before.map(journalCell_), after: r.after.map(journalCell_) };
  }) });
  if (plan.tables) copy.tables = plan.tables.map(function (t) {
    return { name: t.name, width: t.width, values: t.values.map(function (row) { return row.map(journalCell_); }) };
  });
  return JSON.stringify(copy);
}
function textDigest_(text) { return hash_('karvio-journal-v1', text); }
function chunks_(text) { var out = []; for (var i = 0; i < text.length; i += 30000) out.push(text.slice(i, i + 30000)); return out.length ? out : ['']; }
function readJournal_() {
  var sh = privateSheet_(JOURNAL_SHEET), raw = sh.getRange(1, 1).getValues()[0][0];
  if (!raw) return null;
  var meta; try { meta = JSON.parse(raw); } catch (e) { fail_('Recovery required: transaction journal header is invalid'); }
  if (meta.state === 'EMPTY' || meta.state === 'BUILDING') return { sh: sh, meta: meta, plan: null };
  if (!meta.parts || meta.parts > 100000) fail_('Recovery required: transaction journal is incomplete');
  var text = sh.getRange(2, 1, meta.parts, 1).getValues().map(function (r) { return String(r[0]).slice(2); }).join('');
  if (textDigest_(text) !== meta.digest) fail_('Recovery required: transaction journal checksum mismatch');
  return { sh: sh, meta: meta, plan: JSON.parse(text) };
}
/** True when no transaction is in progress or waiting for recovery (read without the lock). */
function journalClean_() {
  try { var raw = privateSheet_(JOURNAL_SHEET).getRange(1, 1).getValues()[0][0]; return !raw || JSON.parse(raw).state === 'EMPTY'; }
  catch (e) { return false; }
}
function journalState_(sh, meta) { sh.getRange(1, 1).setValue(JSON.stringify(meta)); flush_(); }
function applyPlan_(plan, side) {
  // Row plans are independent (deletions are tombstones), so contiguous rows can be batched.
  var rows = plan.rows.slice().sort(function (a, b) { return a.table < b.table ? -1 : a.table > b.table ? 1 : a.row - b.row; });
  for (var i = 0; i < rows.length;) {
    var first = rows[i], values = [first[side].map(restoreCell_)], next = i + 1;
    while (next < rows.length && values.length < 100 && rows[next].table === first.table && rows[next].row === first.row + values.length && rows[next][side].length === values[0].length) {
      values.push(rows[next][side].map(restoreCell_)); next++;
    }
    var sh = sheet_(first.table); ensureRows_(sh, first.row + values.length - 1);
    sh.getRange(first.row, 1, values.length, values[0].length).setValues(values); i = next;
  }
  flush_();
}
/** Receipts are append-only; a footer is committed only after all response chunks flush. */
function findReceipt_(key) {
  if (!key) return null;
  var sh = privateSheet_(RECEIPT_SHEET), last = sh.getLastRow();
  if (!last) return null;
  var keys = sh.getRange(1, 1, last, 2).getValues();
  for (var i = keys.length - 1; i >= 0; i--) if (keys[i][0] === key && keys[i][1] === 'complete') {
    var meta = JSON.parse(sh.getRange(i + 1, 3).getValues()[0][0]);
    // The parts sit right above their footer; old receipts are pruned from the top, so never trust meta.start.
    var text = sh.getRange(i + 1 - meta.parts, 3, meta.parts, 1).getValues().map(function (r) { return String(r[0]).slice(2); }).join('');
    if (textDigest_(text) !== meta.digest) fail_('Recovery required: saved request receipt is incomplete');
    return { meta: meta, data: JSON.parse(text) };
  }
  return null;
}
function saveReceipt_(plan, result, replace) {
  if (!plan.request || !plan.request.key) return;
  var prior = findReceipt_(plan.request.key);
  if (prior && !replace) return;
  var text = JSON.stringify(result), parts = chunks_(text), sh = privateSheet_(RECEIPT_SHEET), start = sh.getLastRow() + 1;
  ensureRows_(sh, start + parts.length);
  sh.getRange(start, 1, parts.length, 3).setValues(parts.map(function (part) { return [plan.request.key, 'part', 'J:' + part]; })); flush_();
  var meta = Object.assign({}, plan.request, { start: start, parts: parts.length, digest: textDigest_(text), transaction: plan.id, saved_at: Date.now() });
  sh.getRange(start + parts.length, 1, 1, 3).setValues([[plan.request.key, 'complete', JSON.stringify(meta)]]); flush_();
}
/**
 * Request receipts only protect retries of a request that was just sent, so keep RECEIPT_KEEP_DAYS of them.
 * Receipts are appended in time order: the old ones are one block at the top of the sheet.
 * Receipts from before saved_at existed are removed RECEIPT_KEEP_DAYS after the first prune.
 */
var RECEIPT_KEEP_DAYS = 7;
function pruneReceipts_() {
  var props = PropertiesService.getScriptProperties(), nowMs = Date.now(), cutoff = nowMs - RECEIPT_KEEP_DAYS * 864e5;
  var legacySince = Number(props.getProperty('receipts_legacy_since') || 0);
  if (!legacySince) { props.setProperty('receipts_legacy_since', String(nowMs)); legacySince = nowMs; }
  var sh = privateSheet_(RECEIPT_SHEET), last = sh.getLastRow();
  if (!last) return 0;
  var rows = sh.getRange(1, 1, last, 3).getValues(), cut = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][1] !== 'complete') continue;
    var meta = null; try { meta = JSON.parse(rows[i][2]); } catch (e) {}
    var at = meta && meta.saved_at ? Number(meta.saved_at) : legacySince;
    if (at >= cutoff) break;
    cut = i + 1;
  }
  if (!cut) return 0;
  if (sh.deleteRows) sh.deleteRows(1, cut); else for (var k = 0; k < cut; k++) sh.deleteRow(1);
  flush_();
  return cut;
}
function recoverJournal_() {
  var j = readJournal_();
  if (!j || j.meta.state === 'EMPTY') return;
  if (j.meta.state === 'PREPARED') {
    if (j.plan.tables) restoreTables_(j.plan.tables);
    else applyPlan_(j.plan, 'before'); // repeatable even if a prior recovery was interrupted
  }
  else if (j.meta.state === 'COMMITTED') saveReceipt_(j.plan, j.plan.result, false);
  else if (j.meta.state !== 'BUILDING') fail_('Recovery required: unknown transaction state');
  journalState_(j.sh, { state: 'EMPTY' });
  _mem = {};
}
function preparePlan_(plan) {
  var sh = privateSheet_(JOURNAL_SHEET), text = planText_(plan), parts = chunks_(text);
  // BUILDING is safe to discard: no business row is applied before PREPARED flushes.
  journalState_(sh, { state: 'BUILDING', id: plan.id });
  ensureRows_(sh, parts.length + 1);
  sh.getRange(2, 1, parts.length, 1).setValues(parts.map(function (part) { return ['J:' + part]; })); flush_();
  var meta = { state: 'PREPARED', id: plan.id, parts: parts.length, digest: textDigest_(text) };
  journalState_(sh, meta);
  return { sh: sh, meta: meta };
}
function commitPlan_(plan) {
  var prepared = preparePlan_(plan), sh = prepared.sh, meta = prepared.meta;
  applyPlan_(plan, 'after');
  meta.state = 'COMMITTED'; journalState_(sh, meta);
}
function requestInfo_(req, user) {
  var id = req.request_id || (req.payload && req.payload.request_id);
  if (!id) return null; // old clients still work; current clients always send a request key
  if (!/^[A-Za-z0-9_-]{12,160}$/.test(String(id))) fail_('Invalid request ID');
  return { key: 'r_' + textDigest_((user ? user.id : 'public') + '|' + req.action + '|' + id), payload: textDigest_(JSON.stringify(req.payload || {})), action: req.action, user: user ? user.id : 'public' };
}
function retryError_(message) { var e = new Error(message); e.retryable = true; e.uncertain = true; return e; }

function insertMany_(name, objs) {
  if (!objs.length) return [];
  var cs = cols_(name), sh = sheet_(name);
  var start = Math.max(dataLastRow_(name), 1) + 1;
  objs.forEach(function (o) { if (!o.id) o.id = uid_(); });
  writeRows_(name, start, 1, objs.map(function (o) { return cs.map(function (c) { return ser_(o[c.k], c.t); }); }));
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
  if (name === 'Products' && patch.stock !== undefined && num_(patch.stock) < num_(r.stock)) {
    var held = repairReservations_(_mem.__repairDelivery).qty[id] || 0;
    if (num_(patch.stock) < held - 1e-9) fail_('Stock is reserved for open repair jobs: ' + r.name + ' (' + held + ')');
  }
  if (name === 'SerialItems' && r.status === 'in_stock' && patch.status && patch.status !== 'in_stock' && repairReservations_(_mem.__repairDelivery).serial[id])
    fail_('Serial is reserved for an open repair job: ' + r.serial);
  var cs = cols_(name);
  cs.forEach(function (c) { if (patch.hasOwnProperty(c.k)) r[c.k] = cast_(ser_(patch[c.k], c.t), c.t); });
  writeRows_(name, r._row, 1, [cs.map(function (c) { return ser_(r[c.k], c.t); })]);
  return r;
}

function remove_(name, id) {
  var r = all_(name).filter(function (x) { return x.id === id; })[0];
  if (!r) fail_(name + ' record not found');
  // Tombstones keep physical row addresses stable for interrupted transaction recovery.
  writeRows_(name, r._row, 1, [cols_(name).map(function () { return ''; })]);
  delete _mem[name];
}

function withLock_(fn, write, request, waitMs) {
  var lock = LockService.getScriptLock();
  // Public requests wait only briefly, so a flood of them cannot keep the shop's own saves waiting.
  if (waitMs && lock.tryLock) { if (!lock.tryLock(waitMs)) { var busy = new Error('Karvio is busy right now. Please try again in a moment.'); busy.retryable = true; throw busy; } }
  else lock.waitLock(28000);
  var plan = null, staged = null, result, committed = false;
  try {
    try { recoverJournal_(); } catch (e) { throw retryError_('Recovery required before continuing: ' + e.message); }
    _mem = {};
    if (!write) return fn();
    _txn = staged = { rows: {}, sms: [] };
    result = fn();
    var info = request && request();
    // A replay is resolved by the router before running any business function.
    dailyLinkCleanup_();
    plan = { version: 1, id: Utilities.getUuid(), rows: Object.keys(staged.rows).map(function (key) { return staged.rows[key]; }), result: result, request: info };
    _txn = null;
    try { commitPlan_(plan); committed = true; }
    catch (error) {
      // If the final write succeeded but its acknowledgement was lost, never undo a committed sale.
      try { var j = readJournal_(); committed = !!j && j.meta.state === 'COMMITTED' && j.meta.id === plan.id; }
      catch (readError) { throw retryError_('Save outcome is not yet confirmed. Retry the same request: ' + error.message); }
      if (!committed) {
        try { recoverJournal_(); } catch (recoveryError) { throw retryError_('Recovery is pending. Retry the same request: ' + recoveryError.message); }
        throw error;
      }
    }
    // A committed journal itself is a durable receipt until its append-only copy succeeds.
    try { saveReceipt_(plan, result, false); } catch (receiptError) { return result; }
    try { journalState_(privateSheet_(JOURNAL_SHEET), { state: 'EMPTY' }); } catch (clearError) { return result; }
    dailyReceiptPrune_();
    staged.sms.forEach(function (job) {
      try {
        var delivered = sendSms_(job.phone, job.message, job.logMessage);
        Object.keys(job.result).forEach(function (k) { delete job.result[k]; });
        Object.assign(job.result, delivered);
        if (job.linkId && (delivered.status === 'failed' || delivered.status === 'skipped')) removeLink_(job.linkId);
      } catch (smsError) { Object.assign(job.result, { ok: false, status: 'unknown', response: 'Sale saved; SMS delivery could not be confirmed. Check SMS log before resending.' }); }
    });
    if (staged.sms.length) try { saveReceipt_(plan, result, true); } catch (smsReceiptError) {}
    return result;
  } finally { _txn = null; if (!committed) _mem = {}; lock.releaseLock(); }
}

/* ---- Settings (key / value sheet) ---- */
function settingsMap_() {
  if (_mem.__settings) return _mem.__settings;
  var sh = sheet_('Settings'), last = dataLastRow_('Settings'), m = {};
  if (last > 1) dataValues_('Settings', 2, last - 1, 2).forEach(function (r) {
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
  var sh = sheet_('Settings'), last = dataLastRow_('Settings'), row = -1;
  if (last > 1) dataValues_('Settings', 2, last - 1, 2).forEach(function (r, i) { if (String(r[0]) === k) row = i + 2; });
  if (row < 0) writeRows_('Settings', Math.max(last, 1) + 1, 1, [[k, String(v)]]); else writeRows_('Settings', row, 2, [[String(v)]]);
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
    sms_body: '', sms_body_type: 'form', sms_api_key: '', sms_sender_id: '', sms_number_format: 'intl', sms_headers: '',
    sms_template: 'Dear {name}, thank you for shopping at {shop}. Items: {items}. Invoice {invoice}, Total {total}, Paid {paid}, Due {due}. View: {link}',
    sms_invoice_link: 'true', invoice_link_base: DEFAULT_LINK_BASE,
    sms_repair_template: 'Dear {name}, your {device} (Job {job}) is ready at {shop}. Charge {total}, Advance {advance}, Due {due}.',
    sms_technician_template: '{technician}, new repair job {job} for you: {device} - {problem}. Customer {name} {phone}. {shop}',
    sms_quote_template: DEFAULT_QUOTE_SMS
  };
  Object.keys(defaults).forEach(function (k) { if (getSetting_(k, null) === null) setSetting_(k, defaults[k]); });
  // getSetting_ returns '' for blanks; make sure all keys exist
  Object.keys(defaults).forEach(function (k) { if (!settingsMap_().hasOwnProperty(k)) setSetting_(k, defaults[k]); });

  if (!all_('Users').length) {
    var salt = uid_();
    insert_('Users', { name: 'Administrator', username: 'admin', salt: salt, password_hash: pwHash_(salt, 'admin123'), role: 'admin', active: true, created_at: now_() });
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
  return withLock_(function () {
    var u = all_('Users').filter(function (x) { return x.username === 'admin'; })[0];
    if (!u) fail_('No admin user found');
    var salt = uid_();
    update_('Users', u.id, { salt: salt, password_hash: pwHash_(salt, 'admin123'), active: true });
    clearLoginFails_('admin');
    return 'Admin password reset to admin123';
  }, true);
}

/* ============================================================================
 *  3. AUTH & PERMISSIONS
 * ========================================================================== */
function hash_(salt, pw) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pw, Utilities.Charset.UTF_8);
  return d.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
/** Passwords: salted SHA-256 repeated PW_ROUNDS times, stored as v2$rounds$hex. Old single-round hashes still verify. */
var PW_ROUNDS = 2000;
function pwHash_(salt, pw, rounds) {
  rounds = rounds || PW_ROUNDS;
  var h = hash_(salt, String(pw == null ? '' : pw));
  for (var i = 1; i < rounds; i++) h = hash_(salt, h);
  return 'v2$' + rounds + '$' + h;
}
function pwCheck_(u, pw) {
  if (!u || !u.password_hash) return false;
  var stored = String(u.password_hash), m = stored.match(/^v2\$(\d+)\$/);
  var calc = m ? pwHash_(u.salt, pw, Number(m[1])) : hash_(u.salt, String(pw == null ? '' : pw));
  if (calc.length !== stored.length) return false;
  var diff = 0; for (var i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}
/** Failed sign-ins: after LOGIN_MAX_FAILS wrong passwords for one username, it is locked for LOGIN_LOCK_SECONDS. */
var LOGIN_MAX_FAILS = 5, LOGIN_LOCK_SECONDS = 900;
function loginKey_(name) { return 'login_fail_' + hash_('karvio-login', String(name || '').toLowerCase()).slice(0, 32); }
function loginAllowed_(name) {
  try {
    var r = JSON.parse(CacheService.getScriptCache().get(loginKey_(name)) || 'null');
    if (r && r.n >= LOGIN_MAX_FAILS) fail_('Too many wrong passwords. Try again in ' + Math.max(1, Math.ceil((r.until - Date.now()) / 60000)) + ' minute(s).');
  } catch (e) { if (/Too many/.test(e.message)) throw e; }
}
function loginFailed_(name) {
  try {
    var cache = CacheService.getScriptCache(), key = loginKey_(name), r = JSON.parse(cache.get(key) || 'null') || { n: 0 };
    r.n++; r.until = Date.now() + LOGIN_LOCK_SECONDS * 1000;
    cache.put(key, JSON.stringify(r), LOGIN_LOCK_SECONDS);
  } catch (e) {}
}
function clearLoginFails_(name) { try { CacheService.getScriptCache().remove(loginKey_(name)); } catch (e) {} }
function pubUser_(u) {
  return { id: u.id, name: u.name, username: u.username, role: u.role, active: u.active, owner: isOwner_(u), phone: u.phone || '',
    access_limit: !!u.access_limit, access_from: u.access_from || '', access_to: u.access_to || '', access_days: u.access_days || '' };
}
/** The built-in Administrator account (username "admin", made by setup). Only this account may reset the database;
 *  other admins cannot change it, so they cannot take it over. */
var OWNER_USERNAME = 'admin';
function isOwner_(u) { return !!u && String(u.username || '').toLowerCase() === OWNER_USERNAME && u.role === 'admin'; }

/* ---- Staff working hours: outside them a staff member cannot sign in or use the app. Admins are never limited. ---- */
var DAYS_ = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
var DAY_NAMES_ = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
var WEEK_BD_ = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']; // Bangladesh week order, for saving and showing
var CLOCK_OVERRIDE_ = null; // tests only: { hm: 'HH:mm', dow: 0-6 }
/** Shop clock (Asia/Dhaka): time as HH:mm and day of week (0 = Sunday). */
function clock_() {
  if (CLOCK_OVERRIDE_) return CLOCK_OVERRIDE_;
  var d = today_();
  return { hm: now_().slice(11, 16), dow: new Date(d + 'T12:00:00Z').getUTCDay() };
}
function hmMin_(hm) {
  // "09:30", or a time the sheet stored as a date-time ("1899-12-30T09:30:00")
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '').trim()) || /T(\d{2}):(\d{2})/.exec(String(hm || ''));
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}
function hm12_(hm) {
  var t = hmMin_(hm); if (isNaN(t)) return hm;
  var h = Math.floor(t / 60), m = t % 60, ap = h < 12 ? 'AM' : 'PM', h12 = h % 12 || 12;
  return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
}
function accessDays_(u) {
  var d = String(u.access_days || '').toLowerCase().split(',').map(function (x) { return x.trim(); }).filter(function (x) { return DAYS_.indexOf(x) >= 0; });
  return d.length ? d : DAYS_.slice();
}
/** Human description, e.g. "10:00 AM – 8:00 PM, Sat–Thu". */
function accessText_(u) {
  var days = WEEK_BD_.filter(function (d) { return accessDays_(u).indexOf(d) >= 0; }), txt = hm12_(u.access_from) + ' – ' + hm12_(u.access_to);
  return days.length === 7 ? txt + ', every day' : txt + ', ' + days.map(function (x) { return DAY_NAMES_[x]; }).join(', ');
}
/** True when the user may work right now. A window that ends before it starts runs past midnight
 *  (e.g. 10:00 PM – 6:00 AM); its early-morning part belongs to the day the shift started. */
function accessAllowed_(u, clk) {
  if (!u.access_limit || u.role === 'admin') return true;
  var from = hmMin_(u.access_from), to = hmMin_(u.access_to);
  if (isNaN(from) || isNaN(to) || from === to) return false;
  var c = clk || clock_(), now = hmMin_(c.hm), days = accessDays_(u);
  var dayOk = function (dow) { return days.indexOf(DAYS_[(dow + 7) % 7]) >= 0; };
  if (from < to) return now >= from && now < to && dayOk(c.dow);
  if (now >= from) return dayOk(c.dow);
  if (now < to) return dayOk(c.dow - 1);
  return false;
}
function accessDenied_(u) {
  return 'Your working hours are ' + accessText_(u) + '. You cannot use Karvio outside this time — please try again during your working hours or ask an admin.';
}

function rolePerms_() {
  var cfg = null;
  try { cfg = JSON.parse(getSetting_('role_perms', 'null')); } catch (e) {}
  if (!cfg) return DEFAULT_ROLE_PERMS;
  // A role added after the permissions were saved (e.g. technician) starts with its defaults.
  STAFF_ROLES.forEach(function (r) { if (!Array.isArray(cfg[r])) cfg[r] = DEFAULT_ROLE_PERMS[r] || []; });
  return cfg;
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
  // A reset/change invalidates every previously issued token, including tokens from older releases.
  if (!s.credential || s.credential !== hash_('karvio-session', u.salt + '|' + u.password_hash)) { cache.remove('tok_' + token); fail_('AUTH: Password changed; please sign in again'); }
  if (!accessAllowed_(u)) { cache.remove('tok_' + token); fail_('AUTH: ' + accessDenied_(u)); } // working hours ended: signed out
  // Sliding session, refreshed at most every SESSION_REFRESH_MS so ordinary reads stay read-only.
  var nowMs = Date.now(), last = num_(s.refreshed);
  if (!last || nowMs - last > SESSION_REFRESH_MS || nowMs < last) { s.refreshed = nowMs; cache.put('tok_' + token, JSON.stringify(s), SESSION_TTL); }
  return u;
}

function login_(p) {
  var name = String(p.username || '').trim().toLowerCase();
  var u = all_('Users').filter(function (x) { return x.username.toLowerCase() === name; })[0];
  loginAllowed_(name);
  if (!u || !u.active || !pwCheck_(u, p.password)) { loginFailed_(name); fail_('Invalid username or password'); }
  clearLoginFails_(name);
  // Older accounts used a single SHA-256; upgrade them on the first correct sign-in.
  if (!/^v2\$/.test(String(u.password_hash))) update_('Users', u.id, { password_hash: pwHash_(u.salt, String(p.password || '')) });
  if (!accessAllowed_(u)) fail_(accessDenied_(u)); // checked after the password, so the hours are only shown to the right person
  var token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('tok_' + token, JSON.stringify({ id: u.id, credential: hash_('karvio-session', u.salt + '|' + u.password_hash), refreshed: Date.now() }), SESSION_TTL);
  return { token: token, user: pubUser_(u), perms: permsFor_(u.role) };
}
function logout_(p, user, token) { try { CacheService.getScriptCache().remove('tok_' + token); } catch (e) {} return true; }

function changePassword_(p, user) {
  if (!pwCheck_(user, p.old_password)) fail_('Current password is incorrect');
  if (String(p.new_password || '').length < 6) fail_('New password must be at least 6 characters');
  var salt = uid_();
  update_('Users', user.id, { salt: salt, password_hash: pwHash_(salt, p.new_password) });
  return true;
}

/** Re-confirm an admin password for sensitive actions (cancel / reverse). */
function confirmAdmin_(user, password) {
  if (user.role !== 'admin') {
    var admins = all_('Users').filter(function (u) { return u.role === 'admin' && u.active; });
    var ok = admins.some(function (a) { return pwCheck_(a, password); });
    if (!ok) fail_('Admin authorization failed — enter a valid admin password');
  } else if (!pwCheck_(user, password)) {
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
    if (Array.isArray(o)) return o.map(strip);
    var c = {};
    Object.keys(o).forEach(function (k) {
      if (['cost', 'profit', 'cost_price', 'wholesale_price', 'inventory_cost', 'after_cost', 'valuation'].indexOf(k) >= 0) return;
      var v = o[k];
      if (k === 'replacement' && typeof v === 'string') {
        try { v = JSON.stringify(strip(JSON.parse(v))); } catch (e) { v = ''; }
      } else v = strip(v);
      c[k] = v;
    });
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
/** Business dates: YYYY-MM-DD, not in the future, and not inside the closed books period. */
function lockedUntil_() { var v = String(getSetting_('books_locked_until', '') || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }
function isDate_(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + 'T12:00:00Z').getTime()) && new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d; }
function lockCheck_(d, what) {
  var l = lockedUntil_();
  if (l && String(d || '').slice(0, 10) <= l) fail_('The books are closed up to ' + l + ', so ' + what + ' dated ' + String(d).slice(0, 10) + ' cannot be entered or changed. An admin can reopen them in Settings.');
}
function bookDate_(v, what) {
  var t = today_(), d = v === undefined || v === null || String(v).trim() === '' ? t : String(v).trim().slice(0, 10);
  if (!isDate_(d)) fail_('The ' + what + ' date is not a valid date (use YYYY-MM-DD)');
  if (d > t) fail_('The ' + what + ' date cannot be in the future');
  lockCheck_(d, what);
  return d;
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
    if (curU && curU.decimal && !row.decimal && unitHasFractionalHistory_(curU.name))
      fail_('Some sales, purchases, returns, repairs or adjustments in ' + curU.name + ' use fractional quantities, so decimal quantity must stay on');
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
/** True when any recorded quantity in this selling unit is fractional (turning decimal off would block its returns). */
function unitHasFractionalHistory_(unitName) {
  var frac = function (q) { var n = Math.abs(num_(q)); return Math.abs(n - Math.round(n)) > 1e-9; };
  var products = {}; all_('Products').forEach(function (pr) { if (pr.unit === unitName) products[pr.id] = true; });
  var inUnit = function (row) { return row.unit === unitName || (!row.unit && products[row.product_id]); };
  var saleLines = {}, purchaseLines = {};
  all_('SaleItems').forEach(function (i) { saleLines[i.id] = i; });
  all_('PurchaseItems').forEach(function (i) { purchaseLines[i.id] = i; });
  if (Object.keys(saleLines).some(function (id) { return inUnit(saleLines[id]) && frac(saleLines[id].qty); })) return true;
  if (Object.keys(purchaseLines).some(function (id) { return inUnit(purchaseLines[id]) && frac(purchaseLines[id].qty); })) return true;
  if (all_('SalesReturnItems').some(function (i) { var line = saleLines[i.sale_item_id]; return (line ? inUnit(line) : products[i.product_id]) && frac(i.qty); })) return true;
  if (all_('PurchaseReturnItems').some(function (i) { var line = purchaseLines[i.purchase_item_id]; return (line ? inUnit(line) : products[i.product_id]) && frac(i.qty); })) return true;
  if (all_('ItemEvents').some(function (e) { return products[e.product_id] && frac(e.qty); })) return true;
  return all_('Repairs').some(function (job) { return repairParts_(job).some(function (part) { return products[part.product_id] && frac(part.qty); }); });
}
/** Any product history, including cancelled records, prevents deletion. */
function productUsageIndex_() {
  if (!_txn && _mem.__productUsageIndex) return _mem.__productUsageIndex;
  var used = {};
  ['SaleItems','PurchaseItems','SalesReturnItems','PurchaseReturnItems','SerialItems','ItemEvents','WarrantyClaims'].forEach(function(name) {
    all_(name).forEach(function(row) { if (row.product_id) used[row.product_id] = true; });
  });
  all_('Repairs').forEach(function(job) { repairParts_(job).forEach(function(part) { used[part.product_id] = true; }); });
  if (!_txn) _mem.__productUsageIndex = used;
  return used;
}
function productsList_(user) {
  var reservations = repairReservations_().qty, history = productUsageIndex_();
  var list = all_('Products').map(function (p) { var c = Object.assign({}, p); delete c._row; c.has_history = !!history[p.id]; c.reserved = reservations[p.id] || 0; c.available = Math.max(0, round_(p.stock - c.reserved, 4)); return c; });
  return stripCost_(list, user);
}
function productSave_(p, user) {
  var name = String(p.name || ''); if (!name.trim()) fail_('Product name is required');
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
    low_stock: service ? 0 : num_(p.low_stock), service: service, description: String(p.description || '').slice(0, 500), has_warranty: hasW, warranty_type: wType, warranty_days: hasW ? Math.round(num_(p.warranty_days)) : 0,
    active: p.active === undefined ? true : (p.active === true || p.active === 'true')
  };
  if (p.id) {
    // Prices are set in the Price manager and on purchases, never from the product form.
    delete row.cost_price; delete row.sale_price; delete row.wholesale_price;
    var cur = all_('Products').filter(function (x) { return x.id === p.id; })[0];
    // Stored quantities, invoice lines and repair parts are measured in the old unit.
    if (cur && unit !== cur.unit && (Math.abs(num_(cur.stock)) > 1e-9 || productUsageIndex_()[cur.id]))
      fail_('The selling unit of ' + cur.name + ' cannot change after it has stock or history. Create a separate product for the new unit');
    if (cur && service && !isService_(cur) && cur.stock > 0) fail_('This product still has ' + cur.stock + ' in stock. Sell, return or adjust it to 0 before turning Inventory off');
    if (cur && service !== isService_(cur) && ['SaleItems', 'PurchaseItems'].some(function (table) {
      return all_(table).some(function (i) { return i.product_id === cur.id; });
    })) fail_('Products with sales or purchases cannot switch Inventory on or off. Create a separate product for the new type');
    if (cur && hasW && wType === 'serial' && !isSerialProduct_(cur) && (num_(cur.stock) > 0 || ['SaleItems', 'PurchaseItems'].some(function(table) {
      return all_(table).some(function(i) { return i.product_id === cur.id && !String(i.serials || '').trim(); });
    }))) fail_('Cannot enable serial tracking on a product with nonserial stock or inventory history. Create a separate serial-tracked product');
    if (cur && service) row.cost_price = 0;
    if (cur && isSerialProduct_(cur) && (!hasW || wType !== 'serial') && (num_(cur.stock) > 0 || all_('SerialItems').some(function(i) { return i.product_id === cur.id; })))
      fail_('Cannot change warranty type after serial-tracked stock or serial history exists. Create a separate product');
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
/** EAN-13 check digit for the first 12 digits. */
function ean13Check_(d12) {
  var s = 0; for (var i = 0; i < 12; i++) s += Number(d12.charAt(i)) * (i % 2 ? 3 : 1);
  return String((10 - s % 10) % 10);
}
/** Give the selected products that have no barcode a unique shop barcode.
 *  Codes are EAN-13 starting with 20 — the GS1 range reserved for in-store use, so they never clash with
 *  manufacturer barcodes — numbered on from the highest one already issued. Products that already have a
 *  barcode are left untouched. */
function productBarcodes_(p, user) {
  var ids = Array.isArray(p.ids) ? p.ids.slice(0, 500) : [];
  if (!ids.length) fail_('Select at least one product');
  var prods = all_('Products'), pm = indexBy_(prods), used = {}, next = 0, out = [];
  prods.forEach(function (x) {
    var b = String(x.barcode || '').trim(), k = String(x.sku || '').trim();
    if (b) used[b.toLowerCase()] = 1;
    if (k) used[k.toLowerCase()] = 1;
    if (/^20\d{11}$/.test(b)) next = Math.max(next, Number(b.slice(2, 12)));
  });
  all_('SerialItems').forEach(function (x) { var sn = String(x.serial || '').trim(); if (sn) used[sn.toLowerCase()] = 1; });
  ids.forEach(function (id) {
    var x = pm[id]; if (!x) fail_('Product not found');
    if (String(x.barcode || '').trim()) return;
    var code;
    do { next++; if (next > 9999999999) fail_('No more shop barcodes available'); var d12 = '20' + ('0000000000' + next).slice(-10); code = d12 + ean13Check_(d12); } while (used[code]);
    used[code] = 1;
    update_('Products', id, { barcode: code });
    out.push({ id: id, name: x.name, barcode: code });
  });
  if (out.length) audit_(user, 'barcode_assign', { count: out.length, items: out.slice(0, 50) });
  return { assigned: out };
}
function productDelete_(p, user) {
  var product = all_('Products').filter(function(x) { return x.id === p.id; })[0];
  if (!product) fail_('Product not found');
  if (Math.abs(num_(product.stock)) > 1e-9) fail_('This product still has stock. Return or write off the stock before deleting it');
  if (productUsageIndex_()[p.id]) fail_('This product has purchase, sale or stock/job history and cannot be deleted. Turn Active off instead');
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
  // The same serial can exist on different products; never guess which one is being sold.
  var live = hits.filter(function (s) { return s.status === 'in_stock'; }), pool = live.length ? live : hits, products = {};
  pool.forEach(function (s) { products[s.product_id] = true; });
  if (Object.keys(products).length > 1) {
    var names = indexBy_(all_('Products'));
    return { ambiguous: true, serial: pool[0].serial, products: Object.keys(products).map(function (id) { return { product_id: id, name: names[id] ? names[id].name : '' }; }) };
  }
  var h = pool[0];
  return { product_id: h.product_id, serial: h.serial, status: h.status };
}
/** Numeric inventory columns retain four decimals; reject quantities that would be lost. */
function inventoryQuantity_(value, label, allowZero) {
  var n = Number(value), stored = round_(n, 4);
  if (!isFinite(n) || n < 0 || (!allowZero && n <= 0)) fail_('Invalid quantity for ' + label);
  if ((n > 0 && stored <= 0) || Math.abs(n - stored) > Number.EPSILON * Math.max(1, Math.abs(n)) * 4)
    fail_('Quantity for ' + label + ' supports at most 4 decimal places (minimum 0.0001)');
  return stored;
}
function stockAdjust_(p, user) {
  if (p.new_stock === null || p.new_stock === undefined || String(p.new_stock).trim() === '' || !isFinite(Number(p.new_stock))) fail_('Enter the counted stock quantity (use 0 explicitly for zero stock)');
  var pr = all_('Products').filter(function (x) { return x.id === p.product_id; })[0]; if (!pr) fail_('Product not found');
  if (isService_(pr)) fail_(pr.name + ' is a service (no inventory), so it has no stock to adjust');
  if (pr.has_warranty && pr.warranty_type === 'serial') fail_('Serial-tracked items must be adjusted through purchases / returns');
  var newStock = inventoryQuantity_(p.new_stock, pr.name, true); if (newStock < 0) fail_('Stock cannot be negative');
  if (!isDecimalUnit_(pr.unit) && newStock % 1 !== 0) fail_('Stock of ' + pr.name + ' must be a whole number');
  var diff = round_(newStock - pr.stock, 4), oldStock = pr.stock;
  if (Math.abs(diff) < 1e-9) fail_('The stock is already ' + newStock);
  // The value at average cost: a shortage (lost, damaged) is a loss, a surplus a gain; both count in net profit.
  var value = round_(diff * num_(pr.cost_price));
  update_('Products', pr.id, { stock: newStock });
  evBatch_(user, [{ product_id: pr.id, product_name: pr.name, event: 'stock_adjust', ref_type: 'adjust', qty: diff, amount: value, note: p.note || 'Manual stock adjustment' }]);
  audit_(user, 'stock_adjust', { product: pr.name, from: oldStock, to: newStock, value: value, note: p.note || '' });
  return true;
}

/* ============================================================================
 *  7. CUSTOMERS & SUPPLIERS
 * ========================================================================== */
/** Changing an opening balance rewrites every later balance, so each change is written to the audit log. */
function auditOpening_(user, kind, rec, from, to) {
  if (lockedUntil_() && num_(from) !== num_(to)) fail_('Opening balances cannot change while books are closed. Reopen the books first, or enter a dated payment instead');
  if (Math.abs(num_(from) - num_(to)) < 0.005) return;
  audit_(user, kind + '_opening_balance', { id: rec.id, name: rec.name, from: round_(num_(from)), to: round_(num_(to)) });
}
function joinList_(v, sep) { return (Array.isArray(v) ? v : String(v || '').split(sep)).map(function (x) { return String(x).trim(); }).filter(Boolean).join(sep); }

/** References survive cancellation: only a completely unused party may be deleted. */
function partyHistory_() {
  if (!_txn && _mem.__partyHistory) return _mem.__partyHistory;
  var history = { customer: {}, supplier: {} };
  var tables = { customer: ['Sales','SalesReturns','CustomerLedger','Repairs','WarrantyClaims'], supplier: ['Purchases','PurchaseReturns','SupplierLedger'] };
  Object.keys(tables).forEach(function(kind) {
    tables[kind].forEach(function(name) {
      all_(name).forEach(function(row) { var id = row[kind + '_id']; if (id) history[kind][id] = true; });
    });
  });
  // Combined customer/supplier profiles represent the same party on both sides.
  all_('Customers').forEach(function(c) { if (c.link_id && history.supplier[c.link_id]) history.customer[c.id] = true; });
  all_('Suppliers').forEach(function(c) { if (c.link_id && history.customer[c.link_id]) history.supplier[c.id] = true; });
  if (!_txn) _mem.__partyHistory = history;
  return history;
}
function customersList_() {
  var bal = customerBalances_(), sb = null, history = partyHistory_().customer;
  return all_('Customers').map(function (c) {
    var o = Object.assign({}, c); delete o._row; o.balance = bal[c.id] || 0; o.has_history = !!history[c.id]; o.combined = !!c.link_id;
    if (c.link_id) { sb = sb || supplierBalances_(); o.link_balance = sb[c.link_id] || 0; }
    return o;
  });
}
function customerSave_(p, user) {
  var name = String(p.name || '').trim(); if (!name) fail_('Customer name is required');
  var combined = p.combined === undefined ? undefined : (p.combined === true || p.combined === 'true');
  var current = p.id ? all_('Customers').filter(function (c) { return c.id === p.id; })[0] : null;
  if (p.id) { need_(user, 'customers'); if (!current) fail_('Customer record not found'); }
  if (combined || (current && current.link_id)) need_(user, 'suppliers'); // all permissions before the first write
  var phones = joinList_(p.phones, ',');
  if (p.id && !p.allow_duplicate_phone) {
    var duplicate = customerByPhone_(phones, p.id);
    if (duplicate) fail_('DUPLICATE_PHONE: this phone number already belongs to customer ' + duplicate.name);
  }
  var row = { name: name, phones: phones, addresses: joinList_(p.addresses, '|'), note: p.note || '' };
  if (p.id) {
    need_(user, 'customers');
    row.opening_balance = num_(p.opening_balance);
    if (p.active !== undefined) row.active = p.active === true || p.active === 'true';
    var oldOpening = current.opening_balance;
    var upd = update_('Customers', p.id, row);
    auditOpening_(user, 'customer', upd, oldOpening, row.opening_balance);
    var comb = combined;
    if (comb && !upd.link_id) need_(user, 'suppliers');
    if (comb !== undefined || upd.link_id) return syncCombined_('customer', upd, comb === undefined ? !!upd.link_id : comb);
    return upd;
  }
  row.opening_balance = can_(user, 'customers') ? num_(p.opening_balance) : 0;
  var dupC = !p.allow_duplicate_phone && customerByPhone_(phones);
  if (dupC) fail_('DUPLICATE_PHONE: this phone number already belongs to customer ' + dupC.name);
  row.active = true; row.created_at = now_();
  var ins = insert_('Customers', row);
  auditOpening_(user, 'customer', ins, 0, row.opening_balance);
  if (combined) return syncCombined_('customer', ins, true);
  return ins;
}
/** Phone numbers compare by their last 10 digits, so 01712…, +8801712… and 8801712… are the same number. */
function phoneKey_(ph) { var d = String(ph || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : d; }
function customerByPhone_(phones, exceptId) {
  var want = {}; parseList_(phones).forEach(function (ph) { var k = phoneKey_(ph); if (k.length >= 6) want[k] = 1; });
  if (!Object.keys(want).length) return null;
  return all_('Customers').filter(function (c) { return c.id !== exceptId && c.active && parseList_(c.phones).some(function (ph) { return want[phoneKey_(ph)]; }); })[0] || null;
}
function customerQuickAdd_(p, user) {
  if (!String(p.name || '').trim()) fail_('Customer name is required');
  if (!String(p.phone || '').trim()) fail_('Phone is required');
  var same = customerByPhone_(p.phone);
  if (same) fail_('DUPLICATE_PHONE: ' + String(p.phone).trim() + ' already belongs to customer ' + same.name + '. Select that customer instead.');
  var c = insert_('Customers', { name: String(p.name).trim(), phones: String(p.phone).trim(), addresses: String(p.address || '').trim(), opening_balance: 0, note: '', active: true, created_at: now_() });
  var o = Object.assign({}, c); delete o._row; o.balance = 0; return o;
}
function suppliersList_() {
  var bal = supplierBalances_(), cb = null, history = partyHistory_().supplier;
  return all_('Suppliers').map(function (c) {
    var o = Object.assign({}, c); delete o._row; o.balance = bal[c.id] || 0; o.has_history = !!history[c.id]; o.combined = !!c.link_id;
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
    var curS = all_('Suppliers').filter(function (x) { return x.id === p.id; })[0]; if (!curS) fail_('Supplier record not found');
    if (curS.link_id) need_(user, 'customers');
    var oldS = curS.opening_balance;
    var upd = update_('Suppliers', p.id, row);
    auditOpening_(user, 'supplier', upd, oldS, row.opening_balance);
    if (combined !== undefined || upd.link_id) return syncCombined_('supplier', upd, combined === undefined ? !!upd.link_id : combined);
    return upd;
  }
  row.active = true; row.created_at = now_();
  var ins = insert_('Suppliers', row);
  auditOpening_(user, 'supplier', ins, 0, row.opening_balance);
  return combined ? syncCombined_('supplier', ins, true) : ins;
}

/* ============================================================================
 *  8. ACCOUNTS (cash / bank / MFS)
 * ========================================================================== */
function accountsList_() {
  var bal = accountBalances_(), history = {};
  all_('AccountTxns').forEach(function(t) { history[t.account_id] = true; });
  all_('Expenses').forEach(function(t) { history[t.account_id] = true; });
  return all_('Accounts').map(function (a) { var o = Object.assign({}, a); delete o._row; o.balance = bal[a.id] || 0; o.has_history = !!history[a.id]; return o; });
}
function accountSave_(p, user) {
  var name = String(p.name || '').trim(); if (!name) fail_('Account name is required');
  var type = ['cash', 'bank', 'mfs'].indexOf(p.type) >= 0 ? p.type : 'bank';
  var row = { name: name, type: type, number: p.number || '', opening_balance: num_(p.opening_balance) };
  if (p.id) {
    if (p.active !== undefined) row.active = p.active === true || p.active === 'true';
    var curA = all_('Accounts').filter(function (x) { return x.id === p.id; })[0]; if (!curA) fail_('Account not found');
    var oldA = curA.opening_balance, updA = update_('Accounts', p.id, row);
    auditOpening_(user, 'account', updA, oldA, row.opening_balance);
    return updA;
  }
  row.active = true; row.created_at = now_();
  var insA = insert_('Accounts', row);
  auditOpening_(user, 'account', insA, 0, row.opening_balance);
  return insA;
}
function accountEntry_(p, user) { // owner deposit / withdrawal / transfer
  var amt = round_(p.amount); if (amt <= 0) fail_('Amount must be greater than 0');
  var accs = indexBy_(all_('Accounts'));
  var date = bookDate_(p.date, 'account entry');
  audit_(user, 'account_' + (p.kind || 'deposit'), { amount: amt, from: p.account_id, to: p.to_account_id || '', note: p.note || '' });
  if (p.kind === 'transfer') {
    if (!accs[p.account_id] || !accs[p.account_id].active || !accs[p.to_account_id] || !accs[p.to_account_id].active) fail_('Select two active accounts');
    if (p.account_id === p.to_account_id) fail_('Choose two different accounts');
    var ref = uid_();
    acctTxn_(p.account_id, 'out', amt, 'transfer', ref, 'Transfer to ' + accs[p.to_account_id].name + (p.note ? ' — ' + p.note : ''), user, date);
    acctTxn_(p.to_account_id, 'in', amt, 'transfer', ref, 'Transfer from ' + accs[p.account_id].name + (p.note ? ' — ' + p.note : ''), user, date);
  } else {
    if (!accs[p.account_id] || !accs[p.account_id].active) fail_('Select an active account');
    var dir = p.kind === 'withdraw' ? 'out' : 'in';
    acctTxn_(p.account_id, dir, amt, 'manual', uid_(), (dir === 'in' ? 'Deposit' : 'Withdrawal') + (p.note ? ' — ' + p.note : ''), user, date);
  }
  return true;
}
function accountLedger_(p) {
  var acc = all_('Accounts').filter(function (a) { return a.id === p.account_id; })[0]; if (!acc) fail_('Account not found');
  var rows = all_('AccountTxns').filter(function (t) { return t.account_id === acc.id && !t.voided; });
  if (p.from && p.to && p.from > p.to) fail_('From date must not be after To date');
  var run = num_(acc.opening_balance), opening = run, closing = run, out = [];
  rows.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)) || a._row - b._row; }).forEach(function (t) {
    run = round_(run + (t.direction === 'in' ? num_(t.amount) : -num_(t.amount)));
    if (p.from && t.date < p.from) opening = run;
    if (!p.to || t.date <= p.to) closing = run;
    if (inRange_(t.date, p.from, p.to)) out.push({ id: t.id, date: t.date, direction: t.direction, in: t.direction === 'in' ? t.amount : 0, out: t.direction === 'out' ? t.amount : 0, balance: round_(run), ref_type: t.ref_type, note: t.note, user: t.user });
  });
  return { account: acc.name, opening: round_(opening), closing: round_(closing), current_balance: round_(run), rows: out };
}

/* ============================================================================
 *  9. USERS & SETTINGS
 * ========================================================================== */
function usersList_() { return all_('Users').map(pubUser_); }
function userSave_(p, user) {
  var username = String(p.username || '').trim().toLowerCase();
  if (!username || !String(p.name || '').trim()) fail_('Name and username are required');
  if (['admin'].concat(STAFF_ROLES).indexOf(p.role) < 0) fail_('Invalid role');
  all_('Users').forEach(function (u) { if (u.id !== p.id && u.username.toLowerCase() === username) fail_('Username already taken'); });
  var target = p.id ? all_('Users').filter(function (u) { return u.id === p.id; })[0] : null;
  if (p.id && !target) fail_('User not found');
  // Only an admin can make, edit or promote admins; staff with the users permission manage staff accounts only.
  if (user.role !== 'admin') {
    if (p.role === 'admin') fail_('Only an admin can give the admin role');
    if (target && target.role === 'admin') fail_('Only an admin can change an admin account');
    if (target && target.id === user.id && p.role !== target.role) fail_('You cannot change your own role');
  }
  if (target && isOwner_(target)) {
    if (!isOwner_(user)) fail_('Only the Administrator can change the Administrator account');
    if (username !== OWNER_USERNAME) fail_('The Administrator account keeps the username "admin"');
  } else if (username === OWNER_USERNAME) fail_('The username "admin" is reserved for the Administrator account');
  var row = { name: String(p.name).trim(), username: username, role: p.role, active: p.active === undefined ? true : (p.active === true || p.active === 'true'), phone: String(p.phone || '').trim() };
  // A technician gets repair jobs by SMS, so the number is needed.
  if (row.role === 'technician' && phoneKey_(row.phone).length < 10) fail_('Enter the technician\'s mobile number (it gets the repair job SMS)');
  // working hours (staff only; admins are never limited)
  var lim = p.access_limit === true || p.access_limit === 'true';
  if (lim && row.role !== 'admin') {
    var from = String(p.access_from || '').trim(), to = String(p.access_to || '').trim();
    if (isNaN(hmMin_(from)) || isNaN(hmMin_(to)) || hmMin_(from) >= 1440 || hmMin_(to) >= 1440) fail_('Enter the working hours (start and end time)');
    if (hmMin_(from) === hmMin_(to)) fail_('Start and end time cannot be the same');
    var days = (Array.isArray(p.access_days) ? p.access_days : String(p.access_days || '').split(',')).map(function (x) { return String(x).trim().toLowerCase(); });
    days = WEEK_BD_.filter(function (d) { return days.indexOf(d) >= 0; });
    if (!days.length) fail_('Choose at least one working day');
    row.access_limit = true; row.access_from = from.length === 4 ? '0' + from : from; row.access_to = to.length === 4 ? '0' + to : to; row.access_days = days.join(',');
  } else { row.access_limit = false; row.access_from = ''; row.access_to = ''; row.access_days = ''; }
  if (p.id) {
    if (p.id === user.id && !row.active) fail_('You cannot disable your own account');
    if (p.id === user.id && user.role === 'admin' && row.role !== 'admin') fail_('You cannot demote your own account');
    if (p.password) { if (String(p.password).length < 6) fail_('Password must be at least 6 characters'); row.salt = uid_(); row.password_hash = pwHash_(row.salt, p.password); }
    return pubUser_(update_('Users', p.id, row));
  }
  if (String(p.password || '').length < 6) fail_('Password must be at least 6 characters');
  row.salt = uid_(); row.password_hash = pwHash_(row.salt, p.password); row.created_at = now_();
  return pubUser_(insert_('Users', row));
}
function rolePermsSave_(p, user) {
  if (user.role !== 'admin') fail_('Only an admin can change what each role may do');
  var cfg = {};
  STAFF_ROLES.forEach(function (r) { cfg[r] = (Array.isArray(p[r]) ? p[r] : (DEFAULT_ROLE_PERMS[r] || [])).filter(function (x) { return PERMS[x]; }); });
  setSetting_('role_perms', JSON.stringify(cfg));
  return cfg;
}

/* ---- Full database reset: Administrator account only. A copy of the whole spreadsheet is made first;
 *      if the copy cannot be made, nothing is deleted. ---- */
var RESET_WORD = 'RESET';
function blankRows_(h, w) { var out = []; for (var i = 0; i < h; i++) out.push(Array(w).fill('')); return out; }
/** A full copy of the spreadsheet in the owner's Google Drive. Throws if it cannot be made (callers then change nothing).
 *  The offline desktop app has no copy(); it keeps its previous data file instead. */
function driveCopy_(ss, name) {
  if (typeof ss.copy !== 'function') return null;
  var copy = ss.copy(name);
  return { name: copy.getName(), url: copy.getUrl ? copy.getUrl() : '' };
}
/** Full-table operations use the same PREPARED/COMMITTED journal as ordinary saves.
 * The snapshot includes receipts; recovery clears appended rows as well as restoring old ones.
 * OfflineRuntime already commits the entire local file atomically, so it needs no second snapshot. */
function withMaintenance_(fn) {
  var ss = ss_();
  if (typeof ss.copy !== 'function') return fn();
  var names = Object.keys(SCHEMA).concat([RECEIPT_SHEET]);
  var plan = { version: 1, id: Utilities.getUuid(), rows: [], request: null, result: null, tables: names.map(function (name) {
    var sh = SCHEMA[name] ? sheet_(name) : privateSheet_(name), width = SCHEMA[name] ? cols_(name).length : 3;
    var last = sh.getLastRow();
    return { name: name, width: width, values: last ? sh.getRange(1, 1, last, width).getValues() : [] };
  }) };
  var result, prepared;
  try {
    prepared = preparePlan_(plan);
    _maintenance = true;
    result = fn();
    flush_();
    prepared.meta.state = 'COMMITTED'; journalState_(prepared.sh, prepared.meta);
  } catch (error) {
    try {
      var j = readJournal_();
      if (!j || j.meta.id !== plan.id || j.meta.state !== 'COMMITTED') {
        recoverJournal_();
        throw error;
      }
      // A COMMITTED acknowledgement may have been lost; the new database is complete.
    } catch (recoveryError) {
      if (recoveryError === error) throw error;
      throw retryError_('Database recovery is pending. Try again after recovery: ' + recoveryError.message);
    }
  } finally { _maintenance = false; _mem = { __ss: ss }; }
  try {
    var journal = privateSheet_(JOURNAL_SHEET);
    journalState_(journal, { state: 'EMPTY' });
    // Only discard before-images after the complete new database is durably committed.
    var last = journal.getLastRow();
    if (last) journal.getRange(1, 1, last, 1).setValues(blankRows_(last, 1));
    flush_();
  } catch (clearError) { /* COMMITTED or EMPTY is safe to recover */ }
  return result;
}
function restoreTables_(tables) {
  var ss = ss_();
  tables.forEach(function (t) {
    if (!SCHEMA[t.name] && t.name !== RECEIPT_SHEET) fail_('Recovery required: unknown snapshot table');
    var sh = ss.getSheetByName(t.name) || ss.insertSheet(t.name);
    var height = Math.max(sh.getLastRow(), t.values.length);
    ensureRows_(sh, height);
    for (var i = 0; i < height; i += 5000) {
      var rows = blankRows_(Math.min(5000, height - i), t.width);
      rows.forEach(function (row, n) { if (i + n < t.values.length) rows[n] = t.values[i + n].map(restoreCell_); });
      sh.getRange(i + 1, 1, rows.length, t.width).setValues(rows);
    }
  });
  flush_();
}
/** Empty every business table (headers stay) and the private transaction journal / request receipts. */
function wipeAll_(ss) {
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = sheet_(name), last = sh.getLastRow(), w = cols_(name).length;
    if (last > 1) sh.getRange(2, 1, last - 1, w).setValues(blankRows_(last - 1, w));
  });
  [[JOURNAL_SHEET, 1], [RECEIPT_SHEET, 3], [QUOTE_SHEET, 3]].forEach(function (x) {
    if (_maintenance && x[0] === JOURNAL_SHEET) return;
    var sh = ss.getSheetByName(x[0]), last = sh ? sh.getLastRow() : 0;
    if (last) sh.getRange(1, 1, last, x[1]).setValues(blankRows_(last, x[1]));
  });
  flush_();
  _mem = { __ss: ss };
}

/* ---- Full database backup (export) and restore (import): Administrator account only ----
 * The file holds every business table (not the private journal / receipts) and a checksum,
 * so a damaged or hand-edited file is refused before anything is changed. */
var BACKUP_FORMAT = 'Karvio database backup', BACKUP_VERSION = 1, RESTORE_WORD = 'RESTORE';
function backupDigest_(tables) { return hash_('karvio-backup-v1', JSON.stringify(tables)); }
function tableRows_(name) {
  if (name === 'Settings') {
    var last = dataLastRow_('Settings');
    return last > 1 ? dataValues_('Settings', 2, last - 1, 2).filter(function (r) { return r[0] !== '' && r[0] !== null; })
      .map(function (r) { return [String(r[0]), r[1] === null || r[1] === undefined ? '' : String(r[1])]; }) : [];
  }
  var cs = cols_(name);
  return all_(name).map(function (o) { return cs.map(function (c) { return ser_(o[c.k], c.t); }); });
}
function databaseInfo_(p, user) {
  if (!isOwner_(user)) fail_('Only the Administrator account can see this');
  var tables = Object.keys(SCHEMA).map(function (name) { return { name: name, rows: name === 'Settings' ? tableRows_(name).length : all_(name).length }; });
  return {
    tables: tables, total: sum_(tables, function (t) { return t.rows; }),
    last_backup: getSetting_('last_backup_at', ''), last_restore: getSetting_('last_restore_at', ''),
    daily_backup: getSetting_('backup_daily', 'false') === 'true', backup_keep_days: Number(getSetting_('backup_keep_days', '30')) || 30, last_daily_backup: getSetting_('last_daily_backup_at', ''), backup_folder: BACKUP_FOLDER,
    offline: typeof ss_().copy !== 'function'
  };
}
function databaseExport_(p, user) {
  if (!isOwner_(user)) fail_('Only the Administrator account can back up the database');
  var tables = {}, counts = {};
  Object.keys(SCHEMA).forEach(function (name) {
    var rows = tableRows_(name);
    tables[name] = { columns: name === 'Settings' ? ['key', 'value'] : cols_(name).map(function (c) { return c.k; }), rows: rows };
    counts[name] = rows.length;
  });
  var created = now_();
  var out = { format: BACKUP_FORMAT, version: BACKUP_VERSION, app_version: APP_VERSION, created_at: created,
    shop_name: getSetting_('shop_name', ''), created_by: user.name, counts: counts, tables: tables, checksum: backupDigest_(tables) };
  setSetting_('last_backup_at', created); // straight to the sheet: this route is not journaled
  audit_(user, 'database_backup', { rows: sum_(Object.keys(counts), function (k) { return counts[k]; }) });
  flush_();
  return out;
}
/** Checks a backup completely and returns the rows to write. Throws (changing nothing) on any problem. */
function checkBackup_(b) {
  if (!b || typeof b !== 'object' || b.format !== BACKUP_FORMAT) fail_('This is not a Karvio database backup file');
  if (b.version !== BACKUP_VERSION) fail_('This backup was made by a newer Karvio. Update Karvio first');
  if (!b.tables || typeof b.tables !== 'object' || Array.isArray(b.tables)) fail_('The backup file has no tables');
  if (backupDigest_(b.tables) !== b.checksum) fail_('The backup file is damaged or was edited — nothing was restored');
  var plan = {};
  Object.keys(b.tables).forEach(function (name) { if (!SCHEMA.hasOwnProperty(name)) fail_('Unknown table in the backup: ' + name); });
  Object.keys(SCHEMA).forEach(function (name) {
    var t = b.tables[name];
    if (!t) { if (name === 'Users' || name === 'Settings') fail_('The backup has no ' + name + ' table'); plan[name] = []; return; }
    var want = name === 'Settings' ? ['key', 'value'] : cols_(name).map(function (c) { return c.k; });
    if (!Array.isArray(t.columns) || !t.columns.length || t.columns.length > want.length) fail_('The ' + name + ' table in the backup does not match this Karvio');
    t.columns.forEach(function (c, i) { if (c !== want[i]) fail_('The ' + name + ' table in the backup does not match this Karvio (' + c + ')'); });
    if (!Array.isArray(t.rows)) fail_('The ' + name + ' table in the backup is damaged');
    var seen = {};
    plan[name] = t.rows.map(function (r) {
      if (!Array.isArray(r) || r.length !== t.columns.length) fail_('A row in ' + name + ' is damaged');
      r.forEach(function (v) { if (v !== null && ['string', 'number', 'boolean'].indexOf(typeof v) < 0) fail_('A row in ' + name + ' is damaged'); });
      var id = String(r[0] === null ? '' : r[0]);
      if (!id) fail_('A row in ' + name + ' has no ID');
      if (seen[id]) fail_('Duplicate ID in ' + name + ': ' + id);
      seen[id] = 1;
      var full = r.map(function (v) { return v === null ? '' : v; });
      while (full.length < want.length) full.push('');
      return full;
    });
  });
  var uc = cols_('Users').map(function (c) { return c.k; }), iu = uc.indexOf('username'), ir = uc.indexOf('role'), ia = uc.indexOf('active');
  var owner = plan.Users.some(function (r) { return String(r[iu]).toLowerCase() === OWNER_USERNAME && r[ir] === 'admin' && (r[ia] === true || r[ia] === 'TRUE' || r[ia] === 'true'); });
  if (!owner) fail_('The backup has no active Administrator account (username admin) — nothing was restored');
  return plan;
}
function databaseRestore_(p, user) {
  if (!isOwner_(user)) fail_('Only the Administrator account can restore the database');
  if (!pwCheck_(user, p.password)) fail_('Incorrect password — nothing was restored');
  if (String(p.confirm || '').trim() !== RESTORE_WORD) fail_('Type RESTORE to confirm — nothing was restored');
  var b; try { b = JSON.parse(String(p.backup_text || '')); } catch (e) { fail_('This is not a Karvio database backup file'); }
  var plan = checkBackup_(b);
  var ss = ss_(), stamp = now_().replace('T', ' ');
  var safety = driveCopy_(ss, 'Karvio backup before restore ' + stamp);
  return withMaintenance_(function () {
  wipeAll_(ss);
  Object.keys(plan).forEach(function (name) {
    var rows = plan[name], sh = sheet_(name);
    for (var i = 0; i < rows.length; i += 5000) {
      var part = rows.slice(i, i + 5000);
      ensureRows_(sh, 1 + i + part.length);
      sh.getRange(2 + i, 1, part.length, part[0].length).setValues(part);
    }
  });
  flush_();
  _mem = { __ss: ss };
  setupDatabase(); // only fills what is missing (settings added after this backup was made)
  _mem = { __ss: ss };
  var restoredAt = now_();
  setSetting_('last_restore_at', restoredAt);
  audit_(user, 'database_restore', { from: b.created_at, shop: b.shop_name, safety_copy: safety ? safety.name : '' });
  flush_();
  var me = all_('Users').filter(function (u) { return u.id === user.id; })[0];
  var stillSignedIn = !!me && me.active && me.salt === user.salt && me.password_hash === user.password_hash && isOwner_(me);
  var counts = {}; Object.keys(plan).forEach(function (k) { counts[k] = plan[k].length; });
  return { safety: safety, backup_created_at: b.created_at, shop_name: b.shop_name, counts: counts, signed_out: !stillSignedIn, restored_at: restoredAt };
  });
}
/* ---- Automatic daily Google Drive backup (online only). A time trigger runs dailyBackup() every night;
 *      copies go to the Drive folder "Karvio backups" and copies older than backup_keep_days are moved to the trash. ---- */
var BACKUP_FOLDER = 'Karvio backups', BACKUP_PREFIX = 'Karvio daily backup ';
function backupFolder_() {
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
}
function backupTriggers_() { return ScriptApp.getProjectTriggers().filter(function (tr) { return tr.getHandlerFunction() === 'dailyBackup'; }); }
/** Run by the nightly trigger (or from the Apps Script editor). Takes the lock and finishes any interrupted save first. */
function dailyBackup() {
  return withLock_(function () {
    var ss = ss_(), stamp = now_().replace('T', ' ');
    var copy = ss.copy(BACKUP_PREFIX + stamp);
    var file = DriveApp.getFileById(copy.getId()), folder = backupFolder_();
    if (file.moveTo) file.moveTo(folder); else { folder.addFile(file); DriveApp.getRootFolder().removeFile(file); }
    var keep = Math.max(1, Math.round(num_(getSetting_('backup_keep_days', '30')) || 30)), cutoff = Date.now() - keep * 864e5, removed = 0;
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      if (f.getName().indexOf(BACKUP_PREFIX) === 0 && f.getDateCreated().getTime() < cutoff) { f.setTrashed(true); removed++; }
    }
    setSetting_('last_daily_backup_at', now_());
    return { name: copy.getName(), removed: removed };
  }, false);
}
/** Administrator: turn the nightly Drive backup on or off and choose how many days of copies to keep. */
function backupSchedule_(p, user) {
  if (!isOwner_(user)) fail_('Only the Administrator account can change automatic backups');
  if (typeof ss_().copy !== 'function') fail_('Automatic Drive backups are for the online (Google Sheets) version. The offline app keeps its own daily copies in the backups folder.');
  var keep = Math.round(num_(p.keep_days || 30));
  if (keep < 1 || keep > 365) fail_('Keep backups for 1 to 365 days');
  var on = p.enabled === true || p.enabled === 'true';
  backupTriggers_().forEach(function (tr) { ScriptApp.deleteTrigger(tr); });
  if (on) ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(Math.min(Math.max(Math.round(num_(p.hour === undefined ? 2 : p.hour)), 0), 23)).create();
  setSetting_('backup_daily', on ? 'true' : 'false');
  setSetting_('backup_keep_days', String(keep));
  audit_(user, 'backup_schedule', { enabled: on, keep_days: keep });
  flush_();
  return { enabled: on, keep_days: keep, folder: BACKUP_FOLDER, last: getSetting_('last_daily_backup_at', '') };
}
function databaseReset_(p, user) {
  if (!isOwner_(user)) fail_('Only the Administrator account can reset the database');
  if (!pwCheck_(user, p.password)) fail_('Incorrect password — nothing was reset');
  if (String(p.confirm || '').trim() !== RESET_WORD) fail_('Type RESET to confirm — nothing was reset');
  var keepUsers = p.keep_users === true, keepSettings = p.keep_settings === true;
  var ss = ss_(), stamp = now_().replace('T', ' ');

  var backup = driveCopy_(ss, 'Karvio backup before reset ' + stamp);
  return withMaintenance_(function () {

  // What stays: this Administrator account (same password), and on request the other users / the shop settings.
  var users = all_('Users').filter(function (u) { return u.id === user.id || keepUsers; })
    .map(function (u) { var o = {}; cols_('Users').forEach(function (c) { o[c.k] = u[c.k]; }); return o; });
  var sm = settingsMap_();
  var settings = keepSettings ? Object.keys(sm).filter(function (k) { return k.indexOf('seq_') !== 0; }).map(function (k) { return [k, sm[k]]; }) : [];

  wipeAll_(ss);

  insertMany_('Users', users);
  if (settings.length) writeRows_('Settings', 2, 1, settings);
  _mem = { __ss: ss };
  setupDatabase(); // default settings, Cash account, warranty periods, units and categories, as on day one
  _mem = { __ss: ss };
  audit_(user, 'database_reset', { backup: backup ? backup.name : '', kept_users: keepUsers, kept_settings: keepSettings });
  flush_();
  return { backup: backup, users: users.length, kept_settings: keepSettings };
  });
}

var SECRET_KEYS = ['sms_api_key'];
function settingsGet_(p, user) {
  var m = Object.assign({}, settingsMap_());
  Object.keys(m).forEach(function (k) { if (k.indexOf('seq_') === 0) delete m[k]; });
  if (!can_(user, 'settings')) SECRET_KEYS.concat(['sms_url', 'sms_body', 'sms_sender_id', 'sms_headers']).forEach(function (k) { delete m[k]; });
  return m;
}
/** Expense categories live in the Expenses module (staff with the expenses permission manage them). */
function expenseCategoryUsage_() {
  var used = {};
  all_('Expenses').forEach(function(e) { var key = nameKey_(e.category); if (key) used[key] = (used[key] || 0) + 1; });
  return used;
}
function checkedExpenseCategories_(values) {
  if (!Array.isArray(values)) fail_('Expense categories must be a list');
  var seen = {}, list = values.map(function(c) { return String(c || '').trim().replace(/\s+/g, ' '); }).filter(function(c) {
    var key = nameKey_(c); if (!key || seen[key]) return false; seen[key] = true; return true;
  });
  if (!list.length || list.length > 200) fail_('Keep between 1 and 200 expense categories');
  var old = []; try { old = JSON.parse(getSetting_('expense_categories','[]')); } catch(e) {}
  var used = expenseCategoryUsage_();
  old.forEach(function(c) { if (used[nameKey_(c)] && !seen[nameKey_(c)]) fail_('Expense category "' + c + '" has history and cannot be deleted or renamed, including after cancellation'); });
  return list;
}
function expenseCategoriesSave_(p, user) {
  var list = checkedExpenseCategories_(p.categories);
  setSetting_('expense_categories', JSON.stringify(list));
  audit_(user, 'expense_categories', { count: list.length });
  return list;
}
function settingsSave_(p, user) {
  var allowed = ['shop_name', 'shop_phone', 'shop_tel', 'shop_email', 'shop_web', 'shop_social', 'shop_address', 'shop_footer', 'currency', 'invoice_prefix', 'receipt_width', 'low_stock_default', 'expense_categories',
    'sms_enabled', 'sms_method', 'sms_url', 'sms_body', 'sms_body_type', 'sms_api_key', 'sms_sender_id', 'sms_number_format', 'sms_template', 'sms_repair_template', 'sms_technician_template', 'sms_quote_template', 'sms_headers',
    'dashboard_hidden', 'invoice_template', 'invoice_paper', 'invoice_custom_width', 'invoice_custom_height', 'invoice_note',
    'sms_invoice_link', 'invoice_link_base', 'books_locked_until'];
  var vals = Object.assign({}, p.values || {});
  if (vals.expense_categories !== undefined) {
    var cats = vals.expense_categories;
    if (typeof cats === 'string') { try { cats = JSON.parse(cats); } catch(e) { fail_('Expense categories must be a valid list'); } }
    vals.expense_categories = checkedExpenseCategories_(cats);
  }
  if (vals.books_locked_until !== undefined && String(vals.books_locked_until || '') !== lockedUntil_()) {
    if (user.role !== 'admin') fail_('Only an admin can close or reopen the books');
    var lk = String(vals.books_locked_until || '').trim().slice(0, 10);
    if (lk && !isDate_(lk)) fail_('Books closed up to: not a valid date (use YYYY-MM-DD)');
    if (lk && lk >= today_()) fail_('The books can only be closed up to yesterday');
    vals.books_locked_until = lk;
    audit_(user, 'books_lock', { from: lockedUntil_(), to: lk });
  }
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
function sendSms_(phone, message, logMessage) {
  if (_txn) {
    var queued = { ok: false, status: 'queued', response: 'Financial changes saved; SMS delivery is not confirmed. Check SMS log before resending.' };
    _txn.sms.push({ phone: phone, message: message, logMessage: logMessage, result: queued });
    return queued;
  }
  var number = smsNumber_(phone);
  if (!number) return { ok: false, status: 'skipped', response: 'No phone number' };
  var vars = { api_key: getSetting_('sms_api_key'), sender_id: getSetting_('sms_sender_id'), number: number, message: message };
  var method = getSetting_('sms_method', 'GET').toUpperCase(), res, status = 'sent', text = '';
  // Extra request headers, one "Name: value" per line (e.g. "Authorization: Bearer {api_key}" for OneCodeSoft v3).
  var headers = {};
  String(getSetting_('sms_headers', '') || '').split(/\r?\n/).forEach(function (line) {
    var i = line.indexOf(':'); if (i < 1) return;
    var k = line.slice(0, i).trim(), v = fillTpl_(line.slice(i + 1).trim(), vars, 'raw');
    if (k && !/^content-type$/i.test(k)) headers[k] = v;
  });
  try {
    if (method === 'POST') {
      var type = getSetting_('sms_body_type', 'form');
      var body = fillTpl_(getSetting_('sms_body'), vars, type === 'json' ? 'json' : 'form');
      if (type === 'json') {
        // leave out optional fields that are empty (e.g. no Sender ID set)
        try { var o = JSON.parse(body); Object.keys(o).forEach(function (k) { if (o[k] === '') delete o[k]; }); body = JSON.stringify(o); } catch (e) {}
      }
      res = UrlFetchApp.fetch(fillTpl_(getSetting_('sms_url'), vars, 'url'), {
        method: 'post', contentType: type === 'json' ? 'application/json' : 'application/x-www-form-urlencoded', payload: body, headers: headers, muteHttpExceptions: true
      });
    } else {
      res = UrlFetchApp.fetch(fillTpl_(getSetting_('sms_url'), vars, 'url'), { method: 'get', headers: headers, muteHttpExceptions: true });
    }
    text = res.getContentText().slice(0, 300);
    if (res.getResponseCode() >= 400 || smsReplyFailed_(text)) status = 'failed';
  } catch (e) { status = 'unknown'; text = 'Delivery could not be confirmed. Check gateway before resending: ' + String(e.message || e); }
  // A log write failure must never turn an already committed sale into a reported failure.
  try { insert_('SmsLog', { ts: now_(), phone: number, message: logMessage || message, status: status, response: text }); } catch (logError) { return { ok: false, status: 'unknown', response: 'SMS response received but log could not be saved. Check gateway before resending.' }; }
  return { ok: status === 'sent', status: status, response: text };
}
/**
 * Bangladeshi gateways (MRAM, BulkSMSBD and similar panels) answer HTTP 200 even when nothing was sent,
 * with an error code in the body: a bare number such as "1003", or JSON like {"response_code":1007}.
 * 202 / "SMS SUBMITTED" means accepted. Anything else is treated as sent.
 */
function smsReplyFailed_(text) {
  var t = String(text || '').trim();
  // JSON gateways (OneCodeSoft v3 and similar): {"status":"error"} or a recipient result failed / blocked / spam
  if (t.charAt(0) === '{') {
    try {
      var j = JSON.parse(t);
      if (String(j.status).toLowerCase() === 'error' || j.success === false) return true;
      var rs = (j.data && j.data.results) || j.results;
      if (Array.isArray(rs) && rs.length && rs.every(function (r) { return /^(failed|blocked|spam|error|rejected)$/i.test(String(r.status)); })) return true;
      if (String(j.status).toLowerCase() === 'success') return false;
    } catch (e) {}
  }
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
  // a private link to this invoice, valid for LINK_DAYS days (deleted afterwards)
  var link = getSetting_('sms_invoice_link', 'true') === 'true' ? invoiceLinkCreate_(sale.id) : null;
  var tpl = getSetting_('sms_template');
  var msg = fillTpl_(tpl, {
    name: customer.name, shop: getSetting_('shop_name'), items: itemsSummary_(lines), invoice: sale.invoice_no,
    total: sale.total, paid: sale.paid, due: sale.due, date: sale.date, link: link ? link.url : ''
  }, 'raw');
  if (link && String(tpl).indexOf('{link}') < 0) msg += ' Invoice: ' + link.url; // older templates without {link}
  if (!link) msg = msg.replace(/\s*(View|Invoice|Link):?\s*$/i, ''); // template ends with "View: {link}" but links are off
  // the SMS log keeps the message without the working link
  var r = sendSms_(phone, msg, link ? msg.split(link.url).join(maskLink_(link.url)) : null);
  if (_txn && link) _txn.sms[_txn.sms.length - 1].linkId = link.id;
  if (link && (r.status === 'failed' || r.status === 'skipped')) removeLink_(link.id); // retain valid links when delivery is merely unconfirmed
  return r;
}

/* ============================================================================
 *  10b. CUSTOMER INVOICE LINKS — a private, read-only view of one invoice.
 *  Only a SHA-256 hash of the link's key is stored; links stop working after LINK_DAYS days and
 *  their rows are deleted (when opened, when a new link is made, and once a day on any save).
 * ========================================================================== */
var LINK_DAYS = 15;
var DEFAULT_LINK_BASE = 'https://codewithroni.github.io/karvio/';
function linkHash_(token) { return hash_('karvio-invoice-link', token); }
function linkBase_() {
  var b = String(getSetting_('invoice_link_base', '') || DEFAULT_LINK_BASE).trim();
  if (!/^https?:\/\//i.test(b)) b = DEFAULT_LINK_BASE;
  return b.replace(/[#?].*$/, '').replace(/\/*$/, '/');
}
/** 22 random letters and digits (about 130 bits). */
function newLinkToken_() {
  var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', out = '';
  while (out.length < 22) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random(), Utilities.Charset.UTF_8);
    for (var i = 0; i < bytes.length && out.length < 22; i++) { var b = bytes[i] & 0xff; if (b < 248) out += abc.charAt(b % 62); } // 248 = 4 × 62: no bias
  }
  return out;
}
function maskLink_(url) { return String(url).replace(/(#\/i\/)([A-Za-z0-9]{4})[A-Za-z0-9]+/, '$1$2…'); }
function linkExpiry_(fromIso) {
  var d = new Date(fromIso.slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + LINK_DAYS);
  return d.toISOString().slice(0, 10) + fromIso.slice(10); // same time of day, LINK_DAYS later
}
function invoiceLinkCreate_(saleId) {
  cleanupLinks_();
  var token = newLinkToken_(), created = now_();
  var row = insert_('InvoiceLinks', { token_hash: linkHash_(token), sale_id: saleId, created_at: created, expires_at: linkExpiry_(created) });
  return { id: row.id, url: linkBase_() + '#/i/' + token, expires_at: row.expires_at };
}
function removeLink_(id) { try { remove_('InvoiceLinks', id); } catch (e) {} }
/** Delete every expired link row (bottom-up, so row numbers stay valid). */
function cleanupLinks_() {
  var now = now_(), dead = all_('InvoiceLinks').filter(function (l) { return !l.expires_at || l.expires_at <= now; });
  if (!dead.length) return 0;
  dead.forEach(function (l) { remove_('InvoiceLinks', l.id); });
  delete _mem.InvoiceLinks;
  return dead.length;
}
/** Once a day, on the first save, clear out expired links even if nobody opens them. */
function dailyLinkCleanup_() {
  try {
    var props = PropertiesService.getScriptProperties(), day = today_();
    if (props.getProperty('links_cleaned') === day) return;
    cleanupLinks_();
    cleanupQuoteLinks_();
    props.setProperty('links_cleaned', day);
  } catch (e) {}
}
/** Once a day, after a save has fully committed: remove old request receipts. */
function dailyReceiptPrune_() {
  try {
    var props = PropertiesService.getScriptProperties(), day = today_();
    if (props.getProperty('receipts_pruned') === day) return;
    pruneReceipts_();
    props.setProperty('receipts_pruned', day);
  } catch (e) {}
}
/** Staff: make (or re-make) a customer link for an invoice, e.g. to share on WhatsApp. */
function saleLink_(p, user) {
  var s = all_('Sales').filter(function (x) { return x.id === p.id; })[0];
  if (!s) fail_('Invoice not found');
  if (!s.customer_id) fail_('Cash sales have no customer, so no customer link is made');
  if (!can_(user, 'sales.all') && s.user_id !== user.id) fail_('Permission denied: this invoice belongs to another user');
  var l = invoiceLinkCreate_(s.id);
  audit_(user, 'invoice_link', s.invoice_no);
  return { url: l.url, expires_at: l.expires_at, days: LINK_DAYS };
}
/** Public (no sign-in): the invoice behind a link, with only what is printed on the invoice. */
function invoicePublic_(p) {
  var token = String(p.token || '');
  var bad = 'This invoice link has expired or is not valid. Please contact the shop for a new one.';
  if (!/^[A-Za-z0-9]{20,40}$/.test(token)) fail_(bad);
  cleanupLinks_();
  var h = linkHash_(token), link = all_('InvoiceLinks').filter(function (l) { return l.token_hash === h; })[0];
  if (!link) fail_(bad);
  var s = all_('Sales').filter(function (x) { return x.id === link.sale_id; })[0];
  if (!s) { removeLink_(link.id); fail_(bad); }
  var d = saleDetail_({ id: s.id }, null);
  var pick = function (o, keys) { var r = {}; keys.forEach(function (k) { if (o && o[k] !== undefined) r[k] = o[k]; }); return r; };
  var st = settingsMap_(), shop = {};
  ['shop_name', 'shop_address', 'shop_phone', 'shop_tel', 'shop_email', 'shop_web', 'shop_social', 'shop_footer', 'currency', 'invoice_template', 'invoice_note']
    .forEach(function (k) { shop[k] = st[k] || ''; });
  var pays = []; try { pays = (typeof s.payments === 'string' ? JSON.parse(s.payments || '[]') : s.payments) || []; } catch (e) {}
  var returnedTotal = round_(sum_(d.returns.filter(function(r) { return r.status === 'active'; }), function(r) { return num_(r.total); }));
  var netTotal = s.status === 'active' ? round_(Math.max(num_(s.total) - returnedTotal, 0)) : 0;
  var paidNow = round_(Math.max(netTotal - num_(d.sale.due_now), 0));
  return {
    sale: Object.assign(pick(s, ['invoice_no', 'date', 'customer_id', 'customer_name', 'subtotal', 'discount', 'total', 'paid', 'credit_used', 'due', 'note', 'status', 'user_name', 'created_at', 'cancel_reason', 'next_payment_date', 'balance_snapshot']),
      { original_due: s.due, paid_at_sale: s.paid, paid_now: paidNow, net_total: netTotal, returned_total: returnedTotal, live_invoice: true, due: d.sale.due_now, due_now: d.sale.due_now, payments: pays.map(function (x) { return { account_name: x.account_name || '', amount: x.amount }; }) }),
    items: d.items.map(function (i) { return pick(i, ['id', 'name', 'unit', 'qty', 'price', 'total', 'serials', 'warranty_type', 'warranty_days', 'warranty_expiry', 'returned_qty']); }),
    customer: d.customer ? pick(d.customer, ['name', 'phones', 'addresses', 'balance']) : null,
    returns: d.returns.map(function (r) { return pick(r, ['return_no', 'date', 'total', 'status']); }),
    shop: shop,
    expires_at: link.expires_at
  };
}
/* ============================================================================
 *  10c. QUOTATION LINKS — a PC-builder quote sent to the customer by SMS.
 *  The customer opens it without signing in for QUOTE_LINK_DAYS days; then it is deleted.
 *  Quotes live in a private table (not a business table), and only a SHA-256 hash of the link key is kept.
 *  Rows: [key hash, expiry (ms), quote JSON]. Expired rows are removed when a quote is sent or opened, and
 *  once a day on any save.
 * ========================================================================== */
var QUOTE_LINK_DAYS = 3, QUOTE_SHEET = '__KarvioQuoteLinks', QUOTE_LINK_MAX = 300;
var DEFAULT_QUOTE_SMS = 'Dear {name}, your quotation from {shop}: {title}, total {total}. View it here (valid {days} days): {link}';
function quoteLinkHash_(token) { return hash_('karvio-quote-link', token); }
function quoteLinkRows_() {
  var sh = privateSheet_(QUOTE_SHEET), last = sh.getLastRow();
  return { sh: sh, rows: last ? sh.getRange(1, 1, last, 3).getValues().filter(function (r) { return r[0]; }) : [] };
}
function cleanupQuoteLinks_() {
  var q = quoteLinkRows_(), now = Date.now(), live = q.rows.filter(function (r) { return num_(r[1]) > now; });
  if (live.length !== q.rows.length) {
    q.sh.clearContents();
    if (live.length) q.sh.getRange(1, 1, live.length, 3).setValues(live);
    flush_();
  }
  return live;
}
function quoteText_(v, max) { return String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }
function quoteSend_(p, user) {
  if (getSetting_('sms_enabled', 'false') !== 'true') fail_('SMS is turned off. Turn it on in Settings → SMS before sending a quotation');
  var digits = String(p.phone || '').replace(/\D/g, '');
  if (!/^(?:01\d{9}|8801\d{9})$/.test(digits)) fail_('Enter the customer\'s mobile number (01XXXXXXXXX) to send the quotation');
  var lines = Array.isArray(p.lines) ? p.lines : [];
  if (!lines.length || lines.length > 60) fail_('A quotation needs 1 to 60 parts');
  var clean = lines.map(function (l) {
    var name = quoteText_(l && l.name, 200), qty = Number(l && l.qty), price = Number(l && l.price);
    if (!name) fail_('Every part on the quotation needs a name');
    if (!isFinite(qty) || qty <= 0 || qty > 100000) fail_('Invalid quantity for ' + name);
    if (!isFinite(price) || price < 0 || price > 1e9) fail_('Invalid price for ' + name);
    return { group: quoteText_(l.group, 60), name: name, warranty: quoteText_(l.warranty, 40), qty: round_(qty, 4), price: round_(price), total: round_(qty * price) };
  });
  var subtotal = round_(sum_(clean, function (l) { return l.total; }));
  var discount = round_(Math.max(num_(p.discount), 0));
  if (discount > subtotal + 0.005) fail_('Discount cannot be more than the subtotal');
  var validDays = Math.round(num_(p.valid_days)); if (validDays < 1 || validDays > 365) validDays = 7;
  var live = cleanupQuoteLinks_();
  if (live.length >= QUOTE_LINK_MAX) fail_('Too many quotation links are open right now. Try again after some expire');
  var token = newLinkToken_(), created = Date.now(), expires = created + QUOTE_LINK_DAYS * 864e5;
  var quote = {
    no: 'Q-' + String(created).slice(-7), date: today_(), customer: quoteText_(p.customer, 100), phone: digits.length === 13 ? '0' + digits.slice(3) : digits,
    title: quoteText_(p.title, 120) || 'Custom PC build', valid_days: validDays, lines: clean, subtotal: subtotal, discount: discount,
    total: round_(subtotal - discount), note: String(p.note || '').trim().slice(0, 1000), sent_by: user.name,
    expires_at: Utilities.formatDate(new Date(expires), TZ_(), "yyyy-MM-dd'T'HH:mm:ss")
  };
  var json = JSON.stringify(quote);
  if (json.length > 40000) fail_('This quotation is too long to send by link');
  var sh = privateSheet_(QUOTE_SHEET), row = sh.getLastRow() + 1;
  ensureRows_(sh, row);
  sh.getRange(row, 1, 1, 3).setValues([[quoteLinkHash_(token), expires, json]]);
  flush_();
  var url = linkBase_() + '#/q/' + token;
  var tpl = getSetting_('sms_quote_template', DEFAULT_QUOTE_SMS);
  var msg = fillTpl_(tpl, { name: quote.customer || 'customer', shop: getSetting_('shop_name'), title: quote.title, total: quote.total, days: QUOTE_LINK_DAYS, link: url }, 'raw');
  if (String(tpl).indexOf('{link}') < 0) msg += ' View: ' + url;
  var masked = msg.split(url).join(url.replace(/(#\/q\/[A-Za-z0-9]{4})[A-Za-z0-9]+/, '$1…'));
  var sms = sendSms_(quote.phone, msg, masked);
  if (sms && (sms.status === 'failed' || sms.status === 'skipped')) fail_('SMS could not be sent: ' + (sms.response || sms.status) + '. The quotation link was not kept');
  audit_(user, 'quote_send', { no: quote.no, phone: quote.phone, total: quote.total, parts: clean.length });
  // The working link goes only to the customer's phone; it is not returned, so request receipts never hold it.
  return { no: quote.no, phone: quote.phone, expires_at: quote.expires_at, days: QUOTE_LINK_DAYS, sms: sms };
}
/** Public (no sign-in): the quotation behind a link, while it is valid. */
function quotePublic_(p) {
  var token = String(p.token || '');
  var bad = 'This quotation link has expired or is not valid. Please contact the shop for a new quotation.';
  if (!/^[A-Za-z0-9]{20,40}$/.test(token)) fail_(bad);
  var h = quoteLinkHash_(token), row = cleanupQuoteLinks_().filter(function (r) { return r[0] === h; })[0];
  // Answer (not throw) so the clean-up of expired quotes above is kept.
  if (!row) return { expired: true, message: bad };
  var quote; try { quote = JSON.parse(row[2]); } catch (e) { return { expired: true, message: bad }; }
  var st = settingsMap_(), shop = {};
  ['shop_name', 'shop_address', 'shop_phone', 'shop_tel', 'shop_email', 'shop_web', 'shop_social', 'shop_footer', 'currency'].forEach(function (k) { shop[k] = st[k] || ''; });
  return { quote: quote, shop: shop, expires_at: quote.expires_at };
}
function smsTest_(p, user) {
  var r = sendSms_(p.phone, 'Test SMS from ' + getSetting_('shop_name') + ' - Karvio');
  if (!r.ok) fail_('SMS failed — gateway replied: ' + (r.response || 'nothing') + '. Check the API key, Sender ID, balance and the API URL.');
  return r;
}
function smsLog_() { return all_('SmsLog').slice(-100).reverse().map(function (x) { var o = Object.assign({}, x); delete o._row; return o; }); }

/* ============================================================================
 *  10b. REPAIR JOBS
 *  A job card for a device left at the shop: Received → Completed or Failed → Delivered (or Cancelled).
 *  The technician (a user with the Technician role) gets an SMS when given a job; Completed / Failed
 *  shows an alert on every admin's dashboard until one of them presses Seen.
 *  Money goes through the existing books, so stock, serials, accounts, profit and dues stay right:
 *    · an advance is a customer payment (it waits on the customer's account as credit);
 *    · delivery creates a normal sale invoice: the parts used (from stock) plus the repair charge
 *      as the service product "Repair service"; the advance is used on it as customer credit;
 *    · cancelling can pay the advance back, or leave it on the customer's account.
 * ========================================================================== */
var REPAIR_STATUSES = ['Received', 'Completed', 'Failed', 'Delivered', 'Cancelled'];
var REPAIR_OPEN = ['Received', 'Completed', 'Failed'];
var REPAIR_SERVICE_NAME = 'Repair service';
/** Jobs saved before "Ready" was renamed read as "Completed". */
function repairStatusOf_(r) { return r.status === 'Ready' ? 'Completed' : r.status; }
function repairOpen_(r) { return REPAIR_OPEN.indexOf(repairStatusOf_(r)) >= 0; }
function repairRow_(id) {
  var r = all_('Repairs').filter(function (x) { return x.id === id; })[0];
  if (!r) fail_('Repair job not found');
  return r;
}
function repairParts_(r) { try { var a = typeof r.parts === 'string' ? JSON.parse(r.parts || '[]') : r.parts; return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function repairLog_(r) { try { var a = typeof r.log === 'string' ? JSON.parse(r.log || '[]') : r.log; return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function repairOut_(r, sales) {
  var o = Object.assign({}, r); delete o._row;
  o.status = repairStatusOf_(r);
  o.parts = repairParts_(r); o.log = repairLog_(r).map(function (l) { return l.status === 'Ready' ? Object.assign({}, l, { status: 'Completed' }) : l; });
  o.parts_total = round_(sum_(o.parts, function (x) { return num_(x.qty) * num_(x.price); }));
  o.total = round_(o.parts_total + num_(r.charge));
  var balances = _txn ? customerBalances_() : (_mem.__repairCreditBalances || (_mem.__repairCreditBalances = customerBalances_()));
  o.available_advance = round_(Math.min(num_(r.advance), Math.max(-(balances[r.customer_id] || 0), 0)));
  o.due = round_(Math.max(o.total - (repairOpen_(r) ? o.available_advance : num_(r.advance)), 0));
  if (r.sale_id && sales) { var s = sales[r.sale_id]; o.sale_status = s ? s.status : ''; }
  return o;
}
/** The parts list as stored on the job: real products in stock, the price typed, serials for serial items. */
function repairReservations_(exceptId) {
  var qty = {}, serial = {}, idx = serialIndex_();
  all_('Repairs').forEach(function (job) {
    if (job.id === exceptId || !repairOpen_(job)) return;
    repairParts_(job).forEach(function (part) {
      qty[part.product_id] = (qty[part.product_id] || 0) + num_(part.qty);
      splitSerials_(part.serials).forEach(function (sn) { var rec = idx[part.product_id + '|' + sn]; if (rec) serial[rec.id] = job.id; });
    });
  });
  return { qty: qty, serial: serial };
}
function repairPartsClean_(list, exceptId) {
  var pmap = indexBy_(all_('Products')), sidx = serialIndex_(), seen = {}, quantities = {}, reserved = repairReservations_(exceptId);
  return (list || []).map(function (it) {
    var pr = pmap[it.product_id]; if (!pr || !pr.active) fail_('Part not found or inactive');
    var qty = inventoryQuantity_(it.qty, pr.name); if (qty <= 0) fail_('Invalid quantity for ' + pr.name);
    if (!isDecimalUnit_(pr.unit) && qty % 1 !== 0) fail_('Quantity for ' + pr.name + ' must be a whole number');
    var price = round_(it.price); if (price < 0) fail_('Invalid price for ' + pr.name);
    quantities[pr.id] = (quantities[pr.id] || 0) + qty;
    if (!isService_(pr) && quantities[pr.id] > pr.stock - (reserved.qty[pr.id] || 0) + 1e-9) fail_('Only ' + Math.max(0, pr.stock - (reserved.qty[pr.id] || 0)) + ' ' + pr.unit + ' of ' + pr.name + ' available; other parts are reserved for repairs');
    var sers = [];
    if (isSerialProduct_(pr)) {
      sers = splitSerials_(it.serials);
      if (sers.length !== qty) fail_('Select ' + qty + ' serial number(s) for ' + pr.name);
      sers.forEach(function (s) {
        var k = pr.id + '|' + s;
        if (!sidx[k] || sidx[k].status !== 'in_stock') fail_('Serial ' + s + ' is not in stock for ' + pr.name);
        if (reserved.serial[sidx[k].id]) fail_('Serial ' + s + ' is reserved for another repair');
        if (seen[k]) fail_('Duplicate serial ' + s); seen[k] = 1;
      });
    } else if (!isService_(pr) && pr.stock < qty - 1e-9) fail_('Only ' + pr.stock + ' ' + pr.unit + ' of ' + pr.name + ' in stock');
    return { product_id: pr.id, name: pr.name, unit: pr.unit, qty: qty, price: price, serials: sers.join(',') };
  });
}
function repairCustomer_(p, user) {
  if (p.customer_id) {
    var c = all_('Customers').filter(function (x) { return x.id === p.customer_id && x.active; })[0];
    if (!c) fail_('Customer not found');
    return c;
  }
  var name = String(p.customer_name || '').trim(), phone = String(p.phone || '').trim();
  if (!name) fail_('Customer name is required');
  if (!phone) fail_('Customer phone is required');
  var same = customerByPhone_(phone);
  if (same) return same; // the same phone number is the same customer
  return insert_('Customers', { name: name, phones: phone, addresses: '', opening_balance: 0, note: '', active: true, created_at: now_() });
}
function repairTechnician_(id, keepId) {
  if (!id) return null;
  var u = all_('Users').filter(function (x) { return x.id === id && x.active; })[0];
  if (!u) fail_('Technician not found');
  // A newly chosen technician must have the Technician role (an already assigned person may stay).
  if (u.role !== 'technician' && u.id !== keepId) fail_(u.name + ' is not a Technician — add technicians in Users & Roles');
  return u;
}
/** SMS to the technician who was just given the job (if SMS is on and the technician has a number). */
function repairTechSms_(r, tech) {
  if (!tech || getSetting_('sms_enabled', 'false') !== 'true') return null;
  if (!tech.phone) return { ok: false, status: 'skipped', response: tech.name + ' has no phone number (Users & Roles)' };
  var msg = smsMessage_('sms_technician_template', { technician: tech.name, job: r.job_no, device: r.device, problem: r.problem, name: r.customer_name, phone: r.phone, shop: getSetting_('shop_name') });
  if (!String(msg).trim()) return null;
  try { return sendSms_(tech.phone, msg); } catch (e) { return { ok: false, status: 'failed', response: String(e.message || e) }; }
}
function repairAdvance_(r, amount, accountId, user, customer) {
  var amt = round_(amount); if (amt <= 0) return 0;
  customerPayment_({ customer_id: customer.id, amount: amt, account_id: accountId, note: 'Repair advance ' + r.job_no }, user);
  return amt;
}
/** Staff and accounts the repair page needs (also for staff without the users or accounts permissions). */
function repairsMeta_() {
  return {
    today: today_(),
    technicians: all_('Users').filter(function (u) { return u.active && u.role === 'technician'; }).map(function (u) { return { id: u.id, name: u.name, phone: u.phone || '' }; }),
    accounts: all_('Accounts').filter(function (a) { return a.active; }).map(function (a) { return { id: a.id, name: a.name, type: a.type }; }),
    statuses: REPAIR_STATUSES
  };
}
function repairsList_(p) {
  var q = String(p.q || '').toLowerCase(), sales = indexBy_(all_('Sales'));
  return all_('Repairs').filter(function (r) {
    if (p.status && repairStatusOf_(r) !== p.status) return false;
    if (p.technician_id && r.technician_id !== p.technician_id) return false;
    if (!inRange_(r.date, p.from, p.to)) return false;
    if (q && [r.job_no, r.customer_name, r.phone, r.device, r.serial, r.problem, r.invoice_no].join(' ').toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).sort(function (a, b) { return b._row - a._row; }).map(function (r) { return repairOut_(r, sales); });
}
function repairGet_(p) { return repairOut_(repairRow_(p.id), indexBy_(all_('Sales'))); }
/** New job card, or changes to an open one (customer is fixed once the job exists). */
function repairSave_(p, user) {
  var open = p.id ? repairRow_(p.id) : null;
  if (open && !repairOpen_(open)) fail_('Job ' + open.job_no + ' is ' + repairStatusOf_(open) + ' and can no longer be changed');
  var device = String(p.device || '').trim(), problem = String(p.problem || '').trim();
  if (!device) fail_('Device is required');
  if (!problem) fail_('Problem is required');
  var tech = repairTechnician_(p.technician_id, open ? open.technician_id : '');
  var charge = round_(p.charge); if (charge < 0) fail_('Repair charge cannot be negative');
  var estimate = round_(p.estimate); if (estimate < 0) fail_('Estimate cannot be negative');
  var parts = repairPartsClean_(p.parts, p.id);
  if (!can_(user, 'pos')) {
    var oldParts = open ? repairParts_(open) : [], products = indexBy_(all_('Products'));
    parts.forEach(function (part) {
      var previous = oldParts.filter(function (x) { return x.product_id === part.product_id; })[0];
      var allowed = previous ? num_(previous.price) : num_(products[part.product_id].sale_price);
      if (round_(part.price) !== round_(allowed)) fail_('Permission denied: POS permission is required to change a part price');
    });
  }
  var fields = {
    device: device, serial: String(p.serial || '').trim(), problem: problem, accessories: String(p.accessories || '').trim(),
    technician_id: tech ? tech.id : '', technician_name: tech ? tech.name : '', estimate: estimate, charge: charge,
    parts: parts, note: String(p.note || '').trim(), updated_at: now_()
  };
  var addAmt = round_(p.advance), log;
  if (p.id) {
    var r = open;
    var cust = all_('Customers').filter(function (c) { return c.id === r.customer_id; })[0]; if (!cust) fail_('Customer of this job not found');
    log = repairLog_(r);
    var note = [];
    if (r.technician_id !== fields.technician_id) note.push('Technician: ' + (fields.technician_name || 'none'));
    var got = repairAdvance_(r, addAmt, p.account_id, user, cust);
    if (got) { fields.advance = round_(num_(r.advance) + got); note.push('Advance +' + got); }
    var newTech = tech && r.technician_id !== tech.id;
    log.push({ ts: now_(), status: repairStatusOf_(r), note: note.join(' · ') || 'Job updated', user: user.name });
    fields.log = log;
    var upd = update_('Repairs', r.id, fields);
    audit_(user, 'repair_update', r.job_no);
    var outU = repairOut_(upd);
    outU.tech_sms = newTech && p.send_tech_sms !== false ? repairTechSms_(upd, tech) : null;
    return outU;
  }
  var customer = repairCustomer_(p, user);
  var row = Object.assign({
    job_no: nextNo_('seq_repair', 'JOB-'), date: today_(), customer_id: customer.id, customer_name: customer.name,
    phone: parseList_(customer.phones)[0] || String(p.phone || '').trim(), advance: 0, status: 'Received',
    sale_id: '', invoice_no: '', ready_date: '', delivered_date: '', cancel_reason: '', user: user.name, created_at: now_()
  }, fields);
  row.log = [{ ts: now_(), status: 'Received', note: 'Device received' + (row.technician_name ? ' · Technician: ' + row.technician_name : ''), user: user.name }];
  var ins = insert_('Repairs', row);
  var adv = repairAdvance_(ins, addAmt, p.account_id, user, customer);
  if (adv) {
    var lg = repairLog_(ins); lg.push({ ts: now_(), status: 'Received', note: 'Advance ' + adv, user: user.name });
    ins = update_('Repairs', ins.id, { advance: adv, log: lg });
  }
  audit_(user, 'repair_create', ins.job_no);
  var outN = repairOut_(ins);
  outN.tech_sms = tech && p.send_tech_sms !== false ? repairTechSms_(ins, tech) : null;
  return outN;
}
/**
 * The technician's result: Completed (the customer may get an SMS) or Failed (a report is required),
 * or back to Received. Completed and Failed put an alert on the admins' dashboard until one of them presses Seen.
 */
function repairStatus_(p, user) {
  var r = repairRow_(p.id), to = p.status === 'Ready' ? 'Completed' : p.status, from = repairStatusOf_(r);
  if (['Received', 'Completed', 'Failed'].indexOf(to) < 0) fail_('Use Deliver or Cancel for that');
  if (!repairOpen_(r)) fail_('Job ' + r.job_no + ' is ' + from);
  if (from === to) fail_('Job ' + r.job_no + ' is already ' + from);
  var note = String(p.note || '').trim();
  if (to === 'Failed' && !note) fail_('Write why the repair failed (the report the admin will see)');
  var log = repairLog_(r);
  log.push({ ts: now_(), status: to, note: note || (to === 'Completed' ? 'Repair completed' : 'Back to work'), user: user.name });
  var patch = { status: to, log: log, updated_at: now_() };
  if (to === 'Received') { patch.ready_date = ''; patch.result_note = ''; patch.result_by = ''; patch.result_at = ''; patch.alert_seen = false; patch.alert_seen_by = ''; }
  else { patch.ready_date = today_(); patch.result_note = note; patch.result_by = user.name; patch.result_at = now_(); patch.alert_seen = false; patch.alert_seen_by = ''; }
  var upd = update_('Repairs', r.id, patch);
  audit_(user, 'repair_' + to.toLowerCase(), r.job_no);
  var out = repairOut_(upd), sms = null;
  if (to === 'Completed' && p.send_sms !== false && getSetting_('sms_enabled', 'false') === 'true' && r.phone) {
    var msg = smsMessage_('sms_repair_template', { name: r.customer_name, device: r.device, job: r.job_no, shop: getSetting_('shop_name'), total: out.total, advance: num_(r.advance), due: out.due });
    if (String(msg).trim()) { try { sms = sendSms_(r.phone, msg); } catch (e) { sms = { ok: false, status: 'failed', response: String(e.message || e) }; } }
  }
  out.sms = sms;
  return out;
}
/** Admins: the dashboard alert for a Completed / Failed job was read. */
function repairSeen_(p, user) {
  if (user.role !== 'admin') fail_('Only an admin can mark a repair alert as seen');
  var r = repairRow_(p.id);
  var upd = update_('Repairs', r.id, { alert_seen: true, alert_seen_by: user.name });
  return repairOut_(upd);
}
/** Dashboard alerts for admins: jobs the technician marked Completed or Failed that no admin has marked Seen. */
function repairAlerts_() {
  return all_('Repairs').filter(function (r) { var s = repairStatusOf_(r); return (s === 'Completed' || s === 'Failed') && !r.alert_seen; })
    .sort(function (a, b) { return String(b.result_at || b.updated_at).localeCompare(String(a.result_at || a.updated_at)) || String(b.job_no).localeCompare(String(a.job_no)); })
    .map(function (r) {
      var o = repairOut_(r);
      return { id: o.id, job_no: o.job_no, status: o.status, device: o.device, problem: o.problem, customer_name: o.customer_name, phone: o.phone,
        technician_name: o.technician_name, result_note: o.result_note || '', result_by: o.result_by || '', result_at: o.result_at || o.updated_at, total: o.total, due: o.due };
    });
}
/** The one service product that carries repair charges on invoices (made the first time it is needed). */
function repairServiceProduct_() {
  var pr = all_('Products').filter(function (x) { return isService_(x) && x.name === REPAIR_SERVICE_NAME; })[0];
  if (pr) { if (!pr.active) pr = update_('Products', pr.id, { active: true }); return pr; }
  return insert_('Products', { sku: '', barcode: '', name: REPAIR_SERVICE_NAME, category_id: '', subcategory_id: '', brand_id: '', unit: 'pcs', roll_length: 0, cost_price: 0, sale_price: 0, wholesale_price: 0, stock: 0, low_stock: 0, has_warranty: false, warranty_type: '', warranty_days: 0, active: true, created_at: now_(), service: true, description: 'Charges for repair jobs' });
}
/** Hand the device back: a sale invoice for the parts and the charge; the advance is used as credit. */
function repairDeliver_(p, user) {
  need_(user, 'pos'); // Handover creates a sale and can collect money or discount stock.
  var r = repairRow_(p.id);
  if (!repairOpen_(r)) fail_('Job ' + r.job_no + ' is ' + repairStatusOf_(r));
  var cust = all_('Customers').filter(function (c) { return c.id === r.customer_id; })[0]; if (!cust) fail_('Customer of this job not found');
  var parts = repairParts_(r), items = parts.map(function (x) { return { product_id: x.product_id, qty: x.qty, price: x.price, serials: x.serials }; });
  if (num_(r.charge) > 0) items.push({ product_id: repairServiceProduct_().id, qty: 1, price: num_(r.charge) });
  var sale = null, log = repairLog_(r);
  if (items.length) {
    var total = round_(sum_(items, function (x) { return num_(x.qty) * num_(x.price); }));
    var discount = Math.min(Math.max(round_(p.discount), 0), total);
    var avail = Math.max(-(customerBalances_()[cust.id] || 0), 0);
    var credit = round_(Math.min(num_(r.advance), avail, total - discount));
    if (p.expected_credit !== undefined) {
      if (!isFinite(Number(p.expected_credit)) || Number(p.expected_credit) < 0 || Math.abs(Number(p.expected_credit) - credit) > 0.005)
        fail_('Customer advance changed. Reopen delivery to check the available advance and payment');
    } else if (credit + 0.005 < Math.min(num_(r.advance), total - discount)) {
      fail_('Customer advance is no longer fully available. Reopen delivery to check the payment');
    }
    _mem.__repairDelivery = r.id;
    try { sale = saleCreate_({
      customer_id: cust.id, items: items, discount: discount, payments: p.payments || [], credit_used: credit,
      next_payment_date: p.next_payment_date, note: 'Repair ' + r.job_no + ' · ' + r.device, send_sms: false
    }, user); } finally { delete _mem.__repairDelivery; }
  }
  log.push({ ts: now_(), status: 'Delivered', note: sale ? 'Invoice ' + sale.sale.invoice_no : 'Delivered without charge', user: user.name });
  var upd = update_('Repairs', r.id, { status: 'Delivered', delivered_date: today_(), sale_id: sale ? sale.sale.id : '', invoice_no: sale ? sale.sale.invoice_no : '', log: log, updated_at: now_() });
  audit_(user, 'repair_deliver', r.job_no);
  var out = repairOut_(upd, indexBy_(all_('Sales')));
  out.sale = sale ? sale.sale : null;
  out.invoice = sale; // the full invoice (items, customer) for printing, also for staff without the POS permission
  return out;
}
/** Cancel an open job. The advance is paid back from an account, or stays on the customer's account as credit. */
function repairCancel_(p, user) {
  var r = repairRow_(p.id);
  if (!repairOpen_(r)) fail_('Job ' + r.job_no + ' is ' + repairStatusOf_(r));
  var reason = String(p.reason || '').trim(); if (!reason) fail_('Write why the job is cancelled');
  var log = repairLog_(r), note = reason;
  if (num_(r.advance) > 0 && p.refund_account_id) {
    need_(user, 'customers'); // Cash refunds require customer-account permission.
    var available = round_(Math.max(-(customerBalances_()[r.customer_id] || 0), 0));
    if (num_(r.advance) > available + 0.005) fail_('Repair advance is no longer fully available. Keep it on the customer account; available credit is ' + available);
    customerPayment_({ customer_id: r.customer_id, amount: num_(r.advance), account_id: p.refund_account_id, direction: 'pay', note: 'Repair advance returned ' + r.job_no }, user);
    note += ' · Advance ' + num_(r.advance) + ' returned';
  } else if (num_(r.advance) > 0) note += ' · Advance ' + num_(r.advance) + ' kept on the customer account';
  log.push({ ts: now_(), status: 'Cancelled', note: note, user: user.name });
  var upd = update_('Repairs', r.id, { status: 'Cancelled', cancel_reason: reason, log: log, updated_at: now_() });
  audit_(user, 'repair_cancel', { job: r.job_no, reason: reason });
  return repairOut_(upd);
}

/* ============================================================================
 *  11. BOOTSTRAP  (one call loads everything the UI needs)
 * ========================================================================== */
function bootstrap_(p, user) {
  var settings = settingsGet_({}, user);
  var accounts = (can_(user, 'accounts') || can_(user, 'pos')) ? accountsList_().filter(function (a) { return a.active; }) : [];
  if (!can_(user, 'accounts')) accounts = accounts.map(function (a) { return { id: a.id, name: a.name, type: a.type, active: a.active }; });
  var cats = all_('Categories').map(function (c) { return { id: c.id, name: c.name, parent_id: c.parent_id }; });
  return {
    user: pubUser_(user), perms: permsFor_(user.role), permLabels: PERMS, apiCapabilities: API_CAPABILITIES,
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
function serialCaseMatch_(productId, serial) {
  var key = String(serial).trim().toLowerCase();
  var hits = all_('SerialItems').filter(function (s) { return s.product_id === productId && s.status !== 'cancelled' && String(s.serial).toLowerCase() === key; });
  // An old supplier return must not hide a later live copy of the same serial.
  return hits.filter(function (s) { return s.status !== 'returned_supplier'; }).pop() || hits.pop() || null;
}
/** Name of another product that already holds this serial (live, sold or faulty), so a scan can never mean two products. */
function serialOnOtherProduct_(productId, serial) {
  var key = String(serial).trim().toLowerCase();
  var hit = all_('SerialItems').filter(function (s) { return s.product_id !== productId && s.status !== 'cancelled' && s.status !== 'returned_supplier' && String(s.serial).trim().toLowerCase() === key; })[0];
  if (!hit) return '';
  var pr = indexBy_(all_('Products'))[hit.product_id];
  return pr ? pr.name : 'another product';
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

function valuation_(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || 'null') || null; } catch (e) { return null; }
}
/** Older purchases booked gross cost. Never silently revalue existing stock after an upgrade. */
function purchaseInventoryCost_(item) {
  var v = valuation_(item.valuation);
  return v && v.cost_version === 1 ? num_(v.inventory_cost) : round_(item.qty * item.cost, 4);
}
/** Rounded line allocations sum exactly to the invoice total, including old invoices. */
function invoiceLineNet_(item, items, invoice) {
  var gross = 0, allocated = 0, answer = 0;
  items.forEach(function (line) {
    gross += num_(line.total);
    var through = invoice.subtotal > 0 ? round_(invoice.total * gross / invoice.subtotal) : 0;
    if (line.id === item.id) answer = round_(through - allocated);
    allocated = through;
  });
  return answer;
}
function returnLineValue_(lineTotal, originalQty, returnedQty, returnedValue, qty) {
  if (returnedValue > lineTotal + 0.005) fail_('Earlier returns exceed the invoice value; reconcile them before another return');
  return Math.max(0, round_(Math.min(lineTotal - returnedValue, round_(lineTotal * (returnedQty + qty) / originalQty) - returnedValue)));
}
function addInventoryValue_(pr, qty, value) {
  var stock = round_(pr.stock + qty, 4);
  if (pr.stock < -1e-9) fail_('Repair the negative stock of ' + pr.name + ' before changing its valuation');
  return { stock: stock, cost_price: stock > 0 ? round_((pr.stock * pr.cost_price + value) / stock, 4) : pr.cost_price };
}
/** Removing a historical layer must not leave negative value or value with no units. */
function removeInventoryValue_(pr, qty, value) {
  var stock = round_(pr.stock - qty, 4), left = round_(pr.stock * pr.cost_price - value, 4);
  // A four-decimal unit cost can accumulate a few fractional cents on long cable rolls.
  var tolerance = Math.max(0.005, Math.abs(pr.stock) * 0.000051);
  if (stock < -1e-9) fail_('Insufficient stock for ' + pr.name);
  if (left < -tolerance || (stock <= 1e-9 && Math.abs(left) > tolerance))
    fail_('Cannot change the cost layer of ' + pr.name + ': reverse later inventory changes first');
  return { stock: Math.max(0, stock), cost_price: stock > 1e-9 ? round_(Math.max(0, left) / stock, 4) : pr.cost_price };
}
function laterInventoryChange_(productId, refType, refId, serial) {
  var events = all_('ItemEvents'), marker = 0;
  events.forEach(function (e) { if (e.product_id === productId && e.ref_type === refType && e.ref_id === refId) marker = Math.max(marker, e._row); });
  if (!marker) return true; // Cannot safely infer the cost of a legacy return without its history.
  var active = { purchase: indexBy_(all_('Purchases')), sale: indexBy_(all_('Sales')), sreturn: indexBy_(all_('SalesReturns')), preturn: indexBy_(all_('PurchaseReturns')) };
  return events.some(function (e) {
    if (e.product_id !== productId || e._row <= marker || (serial && e.serial !== serial)) return false;
    if (e.event === 'stock_adjust') return true;
    var row = active[e.ref_type] && active[e.ref_type][e.ref_id];
    return row && row.status === 'active' && ['purchase', 'sale', 'sale_return', 'purchase_return'].indexOf(e.event) >= 0;
  });
}

function purchaseCreate_(p, user) {
  var pmap = indexBy_(all_('Products')), items = p.items || [];
  if (!items.length) fail_('Add at least one item');
  var supplier = p.supplier_id ? all_('Suppliers').filter(function (s) { return s.id === p.supplier_id; })[0] : null;
  if (p.supplier_id && !supplier) fail_('Supplier not found');
  var date = bookDate_(p.date, 'purchase'), sidx = serialIndex_(), seen = {}, lines = [], subtotal = 0;

  items.forEach(function (it) {
    var pr = pmap[it.product_id]; if (!pr) fail_('Product not found');
    if (isService_(pr)) fail_(pr.name + ' is a service (no inventory) and does not need to be purchased');
    var qty = inventoryQuantity_(it.qty, pr.name); if (qty <= 0) fail_('Invalid quantity for ' + pr.name);
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
        var existing = serialCaseMatch_(pr.id, s), folded = k.toLowerCase();
        if (existing && (existing.status !== 'returned_supplier' || existing.serial !== s)) fail_('Serial already exists: ' + s);
        if (seen[folded]) fail_('Duplicate serial in list: ' + s);
        seen[folded] = 1;
        var other = serialOnOtherProduct_(pr.id, s), anyKey = 'any|' + s.toLowerCase();
        if (other) fail_('Serial ' + s + ' already belongs to ' + other + '. A serial number can belong to only one product');
        if (seen[anyKey] && seen[anyKey] !== pr.id) fail_('Serial ' + s + ' is entered for two different products in this purchase');
        seen[anyKey] = pr.id;
      });
    } else if (!isDecimalUnit_(pr.unit) && qty % 1 !== 0) fail_('Quantity for ' + pr.name + ' must be a whole number');
    var total = round_(qty * cost);
    lines.push({ pr: pr, qty: qty, cost: cost, total: total, serials: sers, sale: newSale, whole: newWhole });
    subtotal += total;
  });

  subtotal = round_(subtotal);
  var discount = Math.min(Math.max(num_(p.discount), 0), subtotal), total = round_(subtotal - discount);
  // Allocate the invoice discount cumulatively, so line values add to the exact payable.
  var grossAllocated = 0, netAllocated = 0;
  lines.forEach(function (l) {
    grossAllocated += l.total;
    var through = subtotal > 0 ? round_(total * grossAllocated / subtotal) : 0;
    l.inventoryCost = round_(through - netAllocated); netAllocated = through;
  });
  var pays = payList_(p.payments), paid = round_(sum_(pays, function (x) { return x.amount; }));
  if (paid > total + 0.005) fail_('Paid amount (' + paid + ') exceeds the purchase total (' + total + ')');
  var due = round_(total - paid);
  if (due > 0.005 && !supplier) fail_('Select a supplier to buy on credit');
  // the supplier's own invoice / bill number (separate from the note)
  var supInv = String(p.supplier_invoice == null ? '' : p.supplier_invoice).replace(/\s+/g, ' ').trim();
  if (supInv.length > 60) fail_('Supplier invoice number is too long (60 characters at most)');
  if (supInv && !p.allow_duplicate_invoice) {
    var dup = all_('Purchases').filter(function (x) {
      return x.status === 'active' && x.supplier_invoice && x.supplier_invoice.toLowerCase() === supInv.toLowerCase() && x.supplier_id === (supplier ? supplier.id : '');
    })[0];
    if (dup) fail_('DUPLICATE_SUPPLIER_INVOICE: Supplier invoice ' + supInv + ' is already entered on purchase ' + dup.invoice_no + ' (' + dup.date + ')' + (dup.supplier_name ? ' from ' + dup.supplier_name : '') + '.');
  }

  // Settle old debt separately from this invoice, in the same atomic request.
  var previousPays = p.previous_due_payments === undefined ? [] : p.previous_due_payments;
  if (!Array.isArray(previousPays) || previousPays.length > 20) fail_('Invalid previous due payments');
  previousPays.forEach(function(x) {
    if (!x || !isFinite(Number(x.amount)) || Number(x.amount) < 0) fail_('Previous due payment must be a valid non-negative amount');
  });
  previousPays = payList_(previousPays);
  var previousPaid = round_(sum_(previousPays, function(x) { return x.amount; }));
  var previousBalance = supplier ? round_(supplierBalances_()[supplier.id] || 0) : 0;
  if (previousPaid > 0) {
    need_(user, 'suppliers');
    if (!supplier) fail_('Select a supplier for previous due payment');
    if (!isFinite(Number(p.expected_previous_due)) || Math.abs(Number(p.expected_previous_due) - previousBalance) > 0.005)
      fail_('Supplier balance changed. Refresh the supplier balance and check the previous due payment before saving');
    if (previousBalance <= 0 || previousPaid > previousBalance + 0.005) fail_('Previous due payment cannot exceed the current previous due (' + Math.max(previousBalance, 0) + ')');
  }
  var inv = nextNo_('seq_purchase', 'PUR-');
  var pur = insert_('Purchases', {
    invoice_no: inv, date: date, supplier_id: supplier ? supplier.id : '', supplier_name: supplier ? supplier.name : '',
    subtotal: subtotal, discount: discount, total: total, paid: paid, due: due, note: p.note || '', status: 'active',
    user: user.name, created_at: now_(), payments: pays, supplier_invoice: supInv
  });
  var rows = insertMany_('PurchaseItems', lines.map(function (l) {
    return { purchase_id: pur.id, product_id: l.pr.id, name: l.pr.name, unit: l.pr.unit, qty: l.qty, cost: l.cost, total: l.total, serials: l.serials.join(',') };
  }));
  var events = [], newSerials = [];
  lines.forEach(function (l, index) {
    var pr = l.pr, oldStock = pr.stock;
    // weighted-average cost for non-serial items; latest cost otherwise
    // Weighted average of what is in stock and what arrives now. Serial items: average of the in-stock units' own costs.
    var unitCost = l.inventoryCost / l.qty, newCost = round_(unitCost, 4);
    if (isSerialProduct_(pr)) {
      var held = all_('SerialItems').filter(function (s) { return s.product_id === pr.id && s.status === 'in_stock'; });
      var arriving = newSerials.filter(function (s) { return s.product_id === pr.id; });
      newCost = round_((sum_(held.concat(arriving), function (s) { return num_(s.cost); }) + l.inventoryCost) / (held.length + arriving.length + l.qty), 4);
    } else if (oldStock > 0) newCost = round_((oldStock * pr.cost_price + l.inventoryCost) / (oldStock + l.qty), 4);
    update_('PurchaseItems', rows[index].id, { valuation: { stock: oldStock, cost: pr.cost_price, after_stock: round_(oldStock + l.qty, 4), after_cost: newCost, cost_version: 1, inventory_cost: l.inventoryCost } });
    var patch = { stock: round_(oldStock + l.qty, 4), cost_price: newCost };
    if (l.sale > 0) patch.sale_price = l.sale;
    if (l.whole !== null) patch.wholesale_price = l.whole;
    update_('Products', pr.id, patch);
    l.serials.forEach(function (s, serialNo) {
      var serialCost = round_(l.inventoryCost * (serialNo + 1) / l.qty, 4) - round_(l.inventoryCost * serialNo / l.qty, 4);
      newSerials.push({ product_id: pr.id, serial: s, purchase_id: pur.id, sale_id: '', status: 'in_stock', cost: round_(serialCost, 4), created_at: now_() });
      events.push({ serial: s, product_id: pr.id, product_name: pr.name, event: 'purchase', ref_type: 'purchase', ref_id: pur.id, ref_no: inv, party: pur.supplier_name, qty: 1, amount: l.cost, note: 'Stock received' });
    });
    if (!l.serials.length) events.push({ serial: '', product_id: pr.id, product_name: pr.name, event: 'purchase', ref_type: 'purchase', ref_id: pur.id, ref_no: inv, party: pur.supplier_name, qty: l.qty, amount: l.total, note: 'Stock received' });
  });
  insertMany_('SerialItems', newSerials).forEach(function (s) { serialIndex_()[s.product_id + '|' + s.serial] = s; });
  pays.forEach(function (x) { acctTxn_(x.account_id, 'out', x.amount, 'purchase', pur.id, 'Purchase ' + inv, user, date); });
  if (supplier) insert_('SupplierLedger', { date: date, supplier_id: supplier.id, type: 'purchase', ref_id: pur.id, ref_no: inv, debit: paid, credit: total, note: 'Purchase ' + inv + (supInv ? ' · Supplier invoice ' + supInv : ''), voided: false });
  evBatch_(user, events);
  syncSerialCost_(serialIds_(lines));
  var previousReceipts = previousPays.map(function(x) {
    return supplierPayment_({supplier_id:supplier.id,account_id:x.account_id,amount:x.amount,date:date,note:'Previous due paid while entering purchase ' + inv},user);
  });
  audit_(user, 'purchase_create', inv);
  var detail = purchaseDetail_({ id: pur.id });
  if (previousPaid > 0) detail.previous_due_payment = {amount:previousPaid,previous_balance:previousBalance,receipts:previousReceipts};
  return detail;
}

function purchaseDetail_(p) {
  var pur = all_('Purchases').filter(function (x) { return x.id === p.id || x.invoice_no === p.id; })[0];
  if (!pur) fail_('Purchase not found');
  var returns = all_('PurchaseReturns').filter(function (r) { return r.purchase_id === pur.id; });
  var prods = indexBy_(all_('Products')), retIds = {}, retQty = {}, retValue = {};
  returns.forEach(function(r) { if (r.status === 'active') retIds[r.id] = true; });
  all_('PurchaseReturnItems').forEach(function(i) { if (retIds[i.return_id]) { retQty[i.purchase_item_id] = (retQty[i.purchase_item_id] || 0) + num_(i.qty); retValue[i.purchase_item_id] = (retValue[i.purchase_item_id] || 0) + num_(i.total); } });
  var items = all_('PurchaseItems').filter(function(i) { return i.purchase_id === pur.id; });
  return {
    purchase: Object.assign({}, pur, { due_now: purchaseOpenDues_()[pur.id] || 0 }),
    items: items.map(function (i) {
      var o = Object.assign({}, i), pr = prods[i.product_id]; delete o._row;
      o.description = pr ? pr.description || '' : ''; o.sku = pr ? pr.sku || '' : '';
      o.returned_qty = retQty[i.id] || 0; o.returned_value = retValue[i.id] || 0; o.net_total = invoiceLineNet_(i, items, pur);
      return o;
    }),
    supplier: pur.supplier_id ? all_('Suppliers').filter(function (s) { return s.id === pur.supplier_id; })[0] || null : null,
    returns: returns
  };
}
/** Full details of several purchases at once (for exporting / printing the selected invoices). */
function purchasesDetails_(p) {
  var ids = Array.isArray(p.ids) ? p.ids : [];
  if (ids.length > 200) fail_('Export at most 200 purchases per request; use batched export');
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
    if (q && (x.invoice_no + ' ' + (x.supplier_invoice || '') + ' ' + x.supplier_name + ' ' + (x.note || '') + ' ' + (items[x.id] || []).join(' ')).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).sort(function (a, b) { return b._row - a._row; });
  var dueNow = purchaseOpenDues_();
  var clean = function (x) { var o = Object.assign({}, x); delete o._row; o.items_text = (items[x.id] || []).join(', '); o.due_now = dueNow[x.id] || 0; return o; };
  if (p.page) { // paged: newest first, `per` rows per page, with grand totals of everything that matches
    var per = Math.min(Math.max(Math.round(num_(p.per)) || 20, 1), 1000), page = Math.max(Math.round(num_(p.page)), 1);
    var active = rows.filter(function (x) { return x.status === 'active'; });
    return {
      rows: rows.slice((page - 1) * per, page * per).map(clean), total: rows.length, page: page, per: per,
      sums: { total: round_(sum_(active, function (x) { return x.total; })), paid: round_(sum_(active, function (x) { return x.paid; })), due: round_(sum_(active, function (x) { return x.due; })), due_now: round_(sum_(active, function(x) { return dueNow[x.id] || 0; })) }
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
    var qty = inventoryQuantity_(it.qty, pr.name); if (qty <= 0) fail_('Invalid quantity for ' + pr.name);
    if (!isDecimalUnit_(pr.unit) && qty % 1 !== 0) fail_('Quantity for ' + pr.name + ' must be a whole number');
    need[pr.id] = (need[pr.id] || 0) + qty;
  });
  Object.keys(need).forEach(function (id) {
    if (!isService_(pmap[id]) && pmap[id].stock < need[id] - 1e-9) fail_('Insufficient stock for ' + pmap[id].name + ' (available ' + pmap[id].stock + ' ' + pmap[id].unit + ')');
  });

  items.forEach(function (it) {
    var pr = pmap[it.product_id], qty = inventoryQuantity_(it.qty, pr.name), price = num_(it.price), sers = [], cost = 0;
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
    if (pr.has_warranty || num_(it.warranty_days) > 0) {
      wDays = (it.warranty_days !== undefined && it.warranty_days !== null && it.warranty_days !== '') ? Math.min(Math.max(Math.round(num_(it.warranty_days)), 0), 36500) : pr.warranty_days;
      if (wDays > 0) wExp = addDays_(date, wDays);
    }
    var total = round_(qty * price);
    lines.push({ pr: pr, qty: qty, price: price, cost: round_(cost, 4), total: total, serials: sers, wType: pr.has_warranty ? pr.warranty_type : wDays > 0 ? 'invoice' : '', wDays: wDays, wExp: wExp });
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
  if (due > 0.005 && !customer) fail_('Attach a customer profile to sell on credit (cash sales must be fully paid)');
  var nextPay = due > 0.005 ? promiseDate_(p.next_payment_date, date) : '';

  var oldPays = p.previous_due_payments === undefined ? [] : p.previous_due_payments;
  if (!Array.isArray(oldPays) || oldPays.length > 20) fail_('Invalid previous due payments');
  oldPays.forEach(function(x) { if (!x || !isFinite(Number(x.amount)) || Number(x.amount) < 0) fail_('Previous due payment must be a valid non-negative amount'); });
  oldPays = payList_(oldPays);
  var oldPaid = round_(sum_(oldPays, function(x) { return x.amount; }));
  var oldBalance = customer ? round_(customerBalances_()[customer.id] || 0) : 0;
  if (oldPaid > 0) {
    need_(user, 'customers');
    if (!customer) fail_('Select a customer for previous due payment');
    if (!isFinite(Number(p.expected_previous_due)) || Math.abs(Number(p.expected_previous_due) - oldBalance) > 0.005) fail_('Customer balance changed. Refresh the customer balance and check the previous due payment before saving');
    if (oldBalance <= 0 || oldPaid > oldBalance + 0.005) fail_('Previous due payment cannot exceed the current previous due (' + Math.max(oldBalance, 0) + ')');
  }
  var inv = nextNo_('seq_sale', getSetting_('invoice_prefix', 'INV-'));
  // Separate CP receipts precede the sale: cancellation/return of the sale never voids them.
  var oldReceipts = oldPays.map(function(x) { return customerPayment_({customer_id:customer.id,account_id:x.account_id,amount:x.amount,date:date,note:'Previous due collected while entering sale ' + inv},user); });
  var previousBalance = customer ? (customerBalances_()[customer.id] || 0) : 0;
  var profit = round_(total - costTotal);
  var sale = insert_('Sales', {
    invoice_no: inv, date: date, customer_id: customer ? customer.id : '', customer_name: customer ? customer.name : CASH_SALE_NAME,
    subtotal: subtotal, discount: discount, total: total, paid: paid, credit_used: creditUsed, due: due, cost: round_(costTotal), profit: profit,
    note: p.note || '', status: 'active', user_id: user.id, user_name: user.name, created_at: now_(), payments: pays, next_payment_date: nextPay,
    balance_snapshot: { previous: round_(previousBalance), outstanding: round_(previousBalance + total - cashPaid) }
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
  if (oldPaid > 0) detail.previous_due_payment = {amount:oldPaid,previous_balance:oldBalance,receipts:oldReceipts};
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
  var retQty = {}, retValue = {};
  var retIds = {}; returns.forEach(function (r) { if (r.status === 'active') retIds[r.id] = 1; });
  all_('SalesReturnItems').forEach(function (x) { if (retIds[x.return_id]) { retQty[x.sale_item_id] = (retQty[x.sale_item_id] || 0) + x.qty; retValue[x.sale_item_id] = (retValue[x.sale_item_id] || 0) + x.total; } });
  var itemsOut = items.map(function (i) { var o = Object.assign({}, i); delete o._row; o.returned_qty = retQty[i.id] || 0; o.returned_value = round_(retValue[i.id] || 0); o.net_total = invoiceLineNet_(i, items, s); return o; });
  s = Object.assign({}, s, { due_now: saleOpenDues_()[s.id] || 0 }); // copy: rows come from the shared per-request cache
  var out = { sale: s, items: itemsOut, customer: customer, returns: returns };
  if (customer) { out.customer = Object.assign({}, customer); out.customer.balance = customerBalances_()[customer.id] || 0; }
  if (!user || !can_(user, 'cost')) { out.sale = stripCost_(s, user || { role: 'sales' }); out.items = stripCost_(itemsOut, user || { role: 'sales' }); }
  return out;
}

function salesList_(p, user) {
  var q = String(p.q || '').toLowerCase(), items = {};
  all_('SaleItems').forEach(function (i) { (items[i.sale_id] = items[i.sale_id] || []).push(i.name + ' x' + i.qty + (i.serials ? ' [' + i.serials + ']' : '')); });
  var own = !can_(user, 'sales.all'), dueNow = saleOpenDues_();
  var rows = all_('Sales').filter(function (x) {
    if (own && x.user_id !== user.id) return false;
    if (!inRange_(x.date, p.from, p.to)) return false;
    if (p.status && x.status !== p.status) return false;
    if (p.customer_id && x.customer_id !== p.customer_id) return false;
    if (p.user_id && x.user_id !== p.user_id) return false;
    if (p.only_due && !(dueNow[x.id] > 0.005)) return false;
    if (q && (x.invoice_no + ' ' + x.customer_name + ' ' + x.user_name + ' ' + (items[x.id] || []).join(' ')).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).sort(function (a, b) { return b._row - a._row; });
  if (p.limit !== undefined) { if (!Number.isInteger(Number(p.limit)) || Number(p.limit) < 1) fail_('Invalid invoice limit'); rows = rows.slice(0, Number(p.limit)); }
  var out = rows.map(function (x) { var o = Object.assign({}, x); delete o._row; o.items_text = (items[x.id] || []).join(', '); o.due_now = dueNow[x.id] || 0; return o; });
  return stripCost_(out, user);
}

/* ============================================================================
 *  14. SALES RETURN / EXCHANGE
 * ========================================================================== */
/** Replay customer-held nonserial value, including replacements and return reversals. */
function customerHeldReturnCost_(si, quantity) {
  var claims = {}, lineItems = all_('SaleItems').filter(function(i) { return i.sale_id === si.sale_id && i.product_id === si.product_id; });
  all_('WarrantyClaims').forEach(function(c) {
    var replacement = valuation_(c.replacement);
    if (c.sale_id !== si.sale_id || c.product_id !== si.product_id || !replacement || replacement.kind !== 'unit') return;
    var log = repairLog_(c), lineId = replacement.sale_item_id || (log[0] && log[0].sale_item_id);
    if (!lineId) { if (lineItems.length !== 1) fail_('Legacy replacement invoice line is ambiguous; review it before returning stock'); lineId = lineItems[0].id; }
    if (lineId === si.id) claims[c.id] = replacement;
  });
  if (!Object.keys(claims).length) return null;
  var returns = {}, returnItems = {};
  all_('SalesReturns').forEach(function(r) { if (r.sale_id === si.sale_id) returns[r.id] = r; });
  all_('SalesReturnItems').forEach(function(i) { if (returns[i.return_id] && i.sale_item_id === si.id) returnItems[i.return_id] = i; });
  var heldQty = num_(si.qty), heldCost = num_(si.cost), seen = {}, replaced = {};
  all_('ItemEvents').forEach(function(e) {
    if (e.product_id !== si.product_id) return;
    if (e.event === 'warranty_replacement_out' && e.ref_type === 'claim' && claims[e.ref_id] && !replaced[e.ref_id]) {
      if (heldQty < 1 - 1e-9) fail_('Replacement/return history is inconsistent; review this invoice before returning stock');
      heldCost = round_(heldCost - heldCost / heldQty + num_(claims[e.ref_id].cost), 4); replaced[e.ref_id] = true;
    }
    var item = returnItems[e.ref_id], kind = e.event;
    if (e.ref_type !== 'sreturn' || !item || (kind !== 'sale_return' && kind !== 'return_cancelled') || seen[kind + '|' + e.ref_id]) return;
    seen[kind + '|' + e.ref_id] = true;
    var direction = kind === 'sale_return' ? -1 : 1;
    heldQty = round_(heldQty + direction * num_(item.qty), 4); heldCost = round_(heldCost + direction * num_(item.cost), 4);
  });
  var remaining = num_(si.qty);
  Object.keys(returnItems).forEach(function(id) { if (returns[id].status === 'active') remaining -= num_(returnItems[id].qty); });
  if (Object.keys(claims).some(function(id) { return !replaced[id]; }) || Math.abs(heldQty - remaining) > 0.00001 || heldQty <= 0 || heldCost < -0.0001)
    fail_('Replacement cost history is incomplete; review this invoice before returning stock');
  return round_(Math.max(heldCost, 0) * quantity / heldQty, 4);
}
function sreturnCreate_(p, user) {
  var sale = all_('Sales').filter(function (s) { return s.id === p.sale_id; })[0];
  if (!sale || sale.status !== 'active') fail_('Invoice not found or already cancelled');
  if (!can_(user, 'sales.all') && sale.user_id !== user.id) fail_('Permission denied: this invoice belongs to another user');
  var pmap = indexBy_(all_('Products')), sidx = serialIndex_();
  var sitems = all_('SaleItems').filter(function (i) { return i.sale_id === sale.id; });
  var retIds = {}; all_('SalesReturns').forEach(function (r) { if (r.sale_id === sale.id && r.status === 'active') retIds[r.id] = 1; });
  var retQty = {}, retValue = {}; all_('SalesReturnItems').forEach(function (x) { if (retIds[x.return_id]) { retQty[x.sale_item_id] = (retQty[x.sale_item_id] || 0) + x.qty; retValue[x.sale_item_id] = (retValue[x.sale_item_id] || 0) + x.total; } });
  var ratio = sale.subtotal > 0 ? sale.total / sale.subtotal : 1, lines = [], total = 0, costTotal = 0, seenLines = {}, seenSerials = {};

  (p.items || []).forEach(function (it) {
    var qty = num_(it.qty); if (qty <= 0) return;
    qty = inventoryQuantity_(it.qty, 'return');
    var si = sitems.filter(function (x) { return x.id === it.sale_item_id; })[0]; if (!si) fail_('Invoice line not found');
    if (seenLines[si.id]) fail_('Duplicate return line for ' + si.name);
    seenLines[si.id] = true;
    if ((!isDecimalUnit_(si.unit) || si.serials) && qty % 1 !== 0) fail_('Return quantity for ' + si.name + ' must be a whole number');
    var remaining = si.qty - (retQty[si.id] || 0);
    if (qty > remaining + 1e-9) fail_('Return quantity for ' + si.name + ' exceeds what is returnable (' + remaining + ')');
    var sers = [], cost = 0;
    if (si.serials) {
      var sold = parseList_(si.serials); sers = splitSerials_(it.serials);
      if (sers.length !== qty) fail_('Select ' + qty + ' serial number(s) being returned for ' + si.name);
      sers.forEach(function (s) {
        var key = si.product_id + '|' + s, rec = sidx[key];
        if (seenSerials[key]) fail_('Duplicate serial ' + s + ' in return');
        seenSerials[key] = true;
        if (sold.indexOf(s) < 0 || !rec || rec.status !== 'sold' || rec.sale_id !== sale.id) fail_('Serial ' + s + ' cannot be returned on this invoice');
        cost += rec.cost;
      });
    } else {
      var replacementCost = customerHeldReturnCost_(si, qty);
      cost = replacementCost === null ? round_(si.cost * ((retQty[si.id] || 0) + qty) / si.qty, 4) - round_(si.cost * (retQty[si.id] || 0) / si.qty, 4) : replacementCost;
    }
    var value = returnLineValue_(invoiceLineNet_(si, sitems, sale), si.qty, retQty[si.id] || 0, retValue[si.id] || 0, qty);
    lines.push({ si: si, pr: pmap[si.product_id], qty: qty, value: value, cost: round_(cost, 4), serials: sers });
    total += value; costTotal += cost;
  });
  if (!lines.length) fail_('Select at least one item to return');
  total = round_(total);

  // The returned value first clears what is still owed on this invoice; only the rest can go back as cash.
  var maxCash = sale.customer_id ? round_(Math.max(total - (saleOpenDues_()[sale.id] || 0), 0)) : total;
  var rf = p.refund || {}, refund = 0, accId = '';
  if (rf.mode === 'adjust') {
    if (!sale.customer_id) fail_('Cash-sale invoices must be refunded from an account');
  } else {
    accId = rf.account_id; refund = round_(rf.amount === undefined ? maxCash : rf.amount);
    if (refund > 0.005 && !all_('Accounts').some(function (a) { return a.id === accId && a.active; })) fail_('Select the account used for the refund');
    if (refund < 0 || refund > total + 0.005) fail_('Refund must be between 0 and ' + total);
    if (refund > maxCash + 0.005) fail_('Cash refund can be at most ' + maxCash + ': ' + round_(total - maxCash) + ' of this return only clears the unpaid due on invoice ' + sale.invoice_no);
    if (!sale.customer_id && Math.abs(refund - total) > 0.005) fail_('Cash-sale returns must be refunded in full');
    if (refund <= 0.005) accId = '';
  }

  var no = nextNo_('seq_sreturn', 'SR-'), date = today_();
  var ret = insert_('SalesReturns', {
    return_no: no, date: date, sale_id: sale.id, invoice_no: sale.invoice_no, customer_id: sale.customer_id, customer_name: sale.customer_name,
    type: p.type === 'exchange' ? 'exchange' : 'return', total: total, cost: round_(costTotal, 4), refund: refund, refund_account_id: accId,
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
      if (retRows[li]) update_('SalesReturnItems', retRows[li].id, { valuation: { stock: oldStock, cost: oldCost, after_stock: newStock, after_cost: newCost, serial_ids: l.serials.map(function (s) { return sidx[l.pr.id + '|' + s].id; }) } });
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

/**
 * Exchange in one atomic request: the returned items go back to stock at their original cost (an
 * ordinary exchange return), and the replacement is sold on a new invoice at its own cost, so profit,
 * stock and serials follow both products. The return value pays for the replacement first:
 *  - customer profile: the return is credited to the customer and used on the new invoice; the
 *    difference is paid now (or left due), and any surplus stays as credit or is refunded now;
 *  - walk-in: the return is refunded through one account and the new invoice is paid through the same
 *    account, so only the difference actually changes hands; walk-ins must settle in full.
 */
function saleExchange_(p, user) {
  need_(user, 'pos'); // the replacement is a new sale
  var sale = all_('Sales').filter(function (s) { return s.id === p.sale_id; })[0];
  if (!sale || sale.status !== 'active') fail_('Invoice not found or already cancelled');
  var repl = Array.isArray(p.replacement) ? p.replacement.filter(function (x) { return x && num_(x.qty) > 0; }) : [];
  if (!repl.length) fail_('Add the replacement product(s). To take items back without a replacement, use Return');
  var replTotal = round_(sum_(repl, function (x) { return round_(num_(x.qty) * num_(x.price)); }));
  var diffPays = Array.isArray(p.payments) ? p.payments : [];
  var refundIn = p.refund || {}, refundWanted = round_(Math.max(num_(refundIn.amount), 0));
  var ret, detail, refundReceipt = null, creditUsed = 0, returnTotal;
  if (sale.customer_id) {
    ret = sreturnCreate_({ sale_id: sale.id, items: p.items, type: 'exchange', refund: { mode: 'adjust' }, note: p.note || '' }, user).return;
    returnTotal = round_(ret.total);
    if (p.expected_return_value !== undefined && Math.abs(num_(p.expected_return_value) - returnTotal) > 0.005) fail_('The return value changed. Reopen the exchange and check it again');
    var avail = Math.max(-(customerBalances_()[sale.customer_id] || 0), 0);
    creditUsed = round_(Math.min(returnTotal, replTotal, avail));
    detail = saleCreate_({ customer_id: sale.customer_id, items: repl, payments: diffPays, credit_used: creditUsed, next_payment_date: p.next_payment_date,
      note: 'Exchange ' + ret.return_no + ' for ' + sale.invoice_no + (p.note ? ' · ' + p.note : ''), send_sms: false }, user);
    if (refundWanted > 0) {
      need_(user, 'customers'); // money handed back to the customer
      var surplus = round_(Math.max(returnTotal - replTotal, 0));
      var holding = round_(Math.max(-(customerBalances_()[sale.customer_id] || 0), 0));
      if (refundWanted > surplus + 0.005) fail_('Refund can be at most the exchange surplus of ' + surplus);
      if (refundWanted > holding + 0.005) fail_('Refund can be at most ' + holding + ': the rest of the surplus clears what the customer still owes');
      refundReceipt = customerPayment_({ customer_id: sale.customer_id, amount: refundWanted, account_id: refundIn.account_id, direction: 'pay', note: 'Exchange refund ' + ret.return_no }, user);
    }
  } else {
    var acc = all_('Accounts').filter(function (a) { return a.id === p.account_id && a.active; })[0];
    if (!acc) fail_('Select the account used for the exchange money');
    if (refundWanted > 0) fail_('Cash-sale exchanges settle through the selected account; leave the refund empty');
    ret = sreturnCreate_({ sale_id: sale.id, items: p.items, type: 'exchange', refund: { mode: 'cash', account_id: acc.id }, note: p.note || '' }, user).return;
    returnTotal = round_(ret.total);
    if (p.expected_return_value !== undefined && Math.abs(num_(p.expected_return_value) - returnTotal) > 0.005) fail_('The return value changed. Reopen the exchange and check it again');
    var covered = round_(Math.min(returnTotal, replTotal));
    var pays = (covered > 0 ? [{ account_id: acc.id, amount: covered }] : []).concat(diffPays);
    detail = saleCreate_({ items: repl, payments: pays, note: 'Exchange ' + ret.return_no + ' for ' + sale.invoice_no + (p.note ? ' · ' + p.note : ''), send_sms: false }, user);
  }
  if (Math.abs(num_(detail.sale.total) - replTotal) > 0.005) fail_('Replacement total mismatch; nothing was saved');
  if (p.expected_total !== undefined && Math.abs(num_(p.expected_total) - replTotal) > 0.005) fail_('The replacement total changed. Reopen the exchange and check it again');
  update_('SalesReturns', ret.id, { note: 'Exchanged for ' + detail.sale.invoice_no + (p.note ? ' · ' + p.note : '') });
  audit_(user, 'sale_exchange', { from_invoice: sale.invoice_no, return_no: ret.return_no, new_invoice: detail.sale.invoice_no, return_value: returnTotal, replacement_total: replTotal, refund: refundWanted });
  return {
    return: { id: ret.id, return_no: ret.return_no, total: returnTotal },
    sale: detail,
    refund: refundReceipt ? { amount: refundReceipt.amount, account: refundReceipt.account, receipt_no: refundReceipt.receipt_no } : null,
    summary: { return_value: returnTotal, replacement_total: replTotal, difference: round_(replTotal - returnTotal), credit_used: creditUsed,
      paid_now: round_(num_(detail.sale.paid) - creditUsed - (sale.customer_id ? 0 : Math.min(returnTotal, replTotal))), refund: refundWanted, due: round_(num_(detail.sale.due)) }
  };
}
function sreturnsList_(p, user, allRows) {
  var q = String(p.q || '').toLowerCase(), items = {}, sales = indexBy_(all_('Sales'));
  all_('SalesReturnItems').forEach(function (i) { (items[i.return_id] = items[i.return_id] || []).push(i.name + ' x' + i.qty); });
  return all_('SalesReturns').filter(function (r) {
    if (!can_(user, 'sales.all') && (!sales[r.sale_id] || sales[r.sale_id].user_id !== user.id)) return false;
    return inRange_(r.date, p.from, p.to) && (!p.status || r.status === p.status) && (!q || (r.return_no + ' ' + r.invoice_no + ' ' + r.customer_name).toLowerCase().indexOf(q) >= 0);
  }).sort(function (a, b) { return b._row - a._row; }).map(function (r) {
    var o = Object.assign({}, r); delete o._row;
    o.items_text = (items[r.id] || []).join(', ');
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
  var retQty = {}, retValue = {}; all_('PurchaseReturnItems').forEach(function (x) { if (retIds[x.return_id]) { retQty[x.purchase_item_id] = (retQty[x.purchase_item_id] || 0) + x.qty; retValue[x.purchase_item_id] = (retValue[x.purchase_item_id] || 0) + x.total; } });
  var ratio = pur.subtotal > 0 ? pur.total / pur.subtotal : 1, lines = [], total = 0, seenLines = {}, seenSerials = {}, planned = {};

  (p.items || []).forEach(function (it) {
    var qty = num_(it.qty); if (qty <= 0) return;
    qty = inventoryQuantity_(it.qty, 'return');
    var pi = pitems.filter(function (x) { return x.id === it.purchase_item_id; })[0]; if (!pi) fail_('Purchase line not found');
    if (seenLines[pi.id]) fail_('Duplicate return line for ' + pi.name);
    seenLines[pi.id] = true;
    if ((!isDecimalUnit_(pi.unit) || pi.serials) && qty % 1 !== 0) fail_('Return quantity for ' + pi.name + ' must be a whole number');
    var remaining = pi.qty - (retQty[pi.id] || 0);
    if (qty > remaining + 1e-9) fail_('Return quantity for ' + pi.name + ' exceeds what is returnable (' + remaining + ')');
    var pr = pmap[pi.product_id]; if (!pr || isService_(pr)) fail_('Inventory product not found for ' + pi.name);
    var cur = planned[pr.id] || Object.assign({}, pr);
    if (cur.stock < qty - 1e-9) fail_('Only ' + cur.stock + ' of ' + pr.name + ' left in stock — cannot return ' + qty);
    var sers = [], inventoryCost = 0;
    if (pi.serials) {
      var bought = parseList_(pi.serials); sers = splitSerials_(it.serials);
      if (sers.length !== qty) fail_('Select ' + qty + ' serial number(s) to return for ' + pi.name);
      sers.forEach(function (s) {
        var key = pi.product_id + '|' + s, rec = sidx[key];
        if (seenSerials[key]) fail_('Duplicate serial ' + s + ' in return');
        seenSerials[key] = true;
        if (bought.indexOf(s) < 0 || !rec || rec.status !== 'in_stock' || rec.purchase_id !== pur.id) fail_('Serial ' + s + ' is not in stock from this purchase — it cannot be returned to the supplier');
        inventoryCost += rec.cost;
      });
    } else inventoryCost = round_(purchaseInventoryCost_(pi) * ((retQty[pi.id] || 0) + qty) / pi.qty, 4) - round_(purchaseInventoryCost_(pi) * (retQty[pi.id] || 0) / pi.qty, 4);
    inventoryCost = round_(inventoryCost, 4);
    var after = pi.serials ? { stock: round_(cur.stock - qty, 4), cost_price: cur.cost_price } : removeInventoryValue_(cur, qty, inventoryCost);
    var snapshot = { stock: cur.stock, cost: cur.cost_price, after_stock: after.stock, after_cost: after.cost_price, inventory_cost: inventoryCost, serial_ids: sers.map(function (s) { return sidx[pr.id + '|' + s].id; }) };
    cur.stock = after.stock; cur.cost_price = after.cost_price; planned[pr.id] = cur;
    var value = returnLineValue_(invoiceLineNet_(pi, pitems, pur), pi.qty, retQty[pi.id] || 0, retValue[pi.id] || 0, qty);
    lines.push({ pi: pi, pr: pr, qty: qty, value: value, serials: sers, valuation: snapshot }); total += value;
  });
  if (!lines.length) fail_('Select at least one item to return');
  total = round_(total);

  var rf = p.refund || {}, received = 0, accId = '';
  if (rf.mode !== 'adjust') {
    accId = rf.account_id; received = round_(rf.amount === undefined ? total : rf.amount);
    if (!all_('Accounts').some(function (a) { return a.id === accId && a.active; })) fail_('Select the account that received the refund');
    if (received < 0 || received > total + 0.005) fail_('Refund must be between 0 and ' + total);
  } else if (!pur.supplier_id) fail_('This purchase has no supplier — record the refund against an account');

  var no = nextNo_('seq_preturn', 'PR-'), date = today_();
  var ret = insert_('PurchaseReturns', {
    return_no: no, date: date, purchase_id: pur.id, invoice_no: pur.invoice_no, supplier_id: pur.supplier_id, supplier_name: pur.supplier_name,
    total: total, received: received, account_id: accId, note: p.note || '', status: 'active', user: user.name, created_at: now_()
  });
  insertMany_('PurchaseReturnItems', lines.map(function (l) {
    return { return_id: ret.id, purchase_item_id: l.pi.id, product_id: l.pi.product_id, name: l.pi.name, qty: l.qty, cost: l.pi.cost, total: l.value, serials: l.serials.join(','), valuation: l.valuation };
  }));
  var events = [];
  lines.forEach(function (l) {
    update_('Products', l.pr.id, { stock: l.valuation.after_stock, cost_price: l.valuation.after_cost });
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
function preturnsList_(p, user, allRows) {
  var q = String(p.q || '').toLowerCase(), items = {};
  all_('PurchaseReturnItems').forEach(function (i) { (items[i.return_id] = items[i.return_id] || []).push(i.name + ' x' + i.qty); });
  return all_('PurchaseReturns').filter(function (r) {
    return inRange_(r.date, p.from, p.to) && (!p.status || r.status === p.status) && (!q || (r.return_no + ' ' + r.invoice_no + ' ' + r.supplier_name).toLowerCase().indexOf(q) >= 0);
  }).sort(function (a, b) { return b._row - a._row; }).map(function (r) {
    var o = Object.assign({}, r); delete o._row;
    o.items_text = (items[r.id] || []).join(', ');
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
  var ref = uid_(), date = bookDate_(p.date, 'payment'), no = nextNo_('seq_cpay', 'CP-');
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
  var ref = uid_(), date = bookDate_(p.date, 'payment'), no = nextNo_('seq_spay', 'SP-');
  acctTxn_(acc.id, recv ? 'in' : 'out', amt, 'spay', ref, (recv ? 'Received from ' : 'Paid to ') + s.name, user, date);
  var row = insert_('SupplierLedger', { date: date, supplier_id: s.id, type: recv ? 'refund' : 'payment', ref_id: ref, ref_no: no, debit: recv ? 0 : amt, credit: recv ? amt : 0, note: (p.note || '') + ' [' + acc.name + ']', voided: false });
  audit_(user, 'supplier_payment', { supplier: s.name, amount: amt });
  return { entry: row, balance: supplierBalances_()[s.id], receipt_no: no };
}
function statement_(table, key, parties, sign, p) {
  var party = parties.filter(function (x) { return x.id === p[key]; })[0]; if (!party) fail_('Not found');
  var rows = all_(table).filter(function (l) { return l[key] === party.id && !l.voided; }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)) || a._row - b._row; });
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
  var ids = Array.isArray(p.ids) ? p.ids : [];
  if (ids.length > 300) fail_('Export at most 300 statements per request; use batched export');
  if (ids.some(function(id, i) { return typeof id !== 'string' || !id || ids.indexOf(id) !== i; })) fail_('Invalid or duplicate statement selection');
  if (!ids.length) fail_('Select at least one ' + kind);
  var parties = kind === 'customer' ? customersList_() : suppliersList_(), map = indexBy_(parties);
  if (ids.some(function(id) { return !map[id]; })) fail_('A selected party no longer exists. Refresh the list before exporting');
  return ids.map(function (id) {
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
  if (kind === 'customer' && all_('Repairs').some(function(job) { return job.customer_id === party.id && repairOpen_(job); }))
    fail_('This customer has open repair jobs. Finish or cancel the jobs before deleting');
  if (partyHistory_()[kind][party.id])
    fail_('This ' + kind + ' has transaction or job history. Mark it inactive in Edit details instead of deleting');
  if (party.link_id) { var twinT = kind === 'customer' ? 'Suppliers' : 'Customers'; if (all_(twinT).some(function (x) { return x.id === party.link_id; })) update_(twinT, party.link_id, { link_id: '' }); }
  remove_(table, party.id);
  audit_(user, kind + '_delete', { name: party.name, phones: party.phones });
  return true;
}

function expenseCreate_(p, user) {
  var amt = round_(p.amount); if (amt <= 0) fail_('Amount must be greater than 0');
  var cat = String(p.category || '').trim(); if (!cat) fail_('Select an expense category');
  var acc = all_('Accounts').filter(function (a) { return a.id === p.account_id && a.active; })[0]; if (!acc) fail_('Select the account used for payment');
  var date = bookDate_(p.date, 'expense');
  var e = insert_('Expenses', { date: date, category: cat, amount: amt, account_id: acc.id, note: p.note || '', user: user.name, status: 'active', created_at: now_() });
  acctTxn_(acc.id, 'out', amt, 'expense', e.id, 'Expense: ' + cat + (p.note ? ' — ' + p.note : ''), user, date);
  return e;
}
/**
 * Edit an active expense and its account entry together. Category and note are ordinary edits;
 * a change of amount, account or date moves money, so it needs an admin password like a cancellation.
 */
function expenseUpdate_(p, user) {
  var e = all_('Expenses').filter(function (x) { return x.id === p.id; })[0];
  if (!e) fail_('Expense not found');
  if (e.status !== 'active') fail_('A cancelled expense cannot be edited');
  lockCheck_(e.date, 'an expense');
  var amt = round_(p.amount); if (!(amt > 0)) fail_('Amount must be greater than 0');
  var cat = String(p.category || '').trim().replace(/\s+/g, ' '); if (!cat) fail_('Select an expense category');
  var cats = []; try { cats = JSON.parse(getSetting_('expense_categories', '[]')); } catch (err) {}
  if (cat !== e.category && !cats.some(function (c) { return nameKey_(c) === nameKey_(cat); })) fail_('Select a category from the expense category list');
  var accs = indexBy_(all_('Accounts')), acc = accs[p.account_id];
  if (!acc) fail_('Select the account used for payment');
  if (acc.id !== e.account_id && !acc.active) fail_('Select an active account');
  var date = bookDate_(p.date, 'expense');
  var note = String(p.note === undefined || p.note === null ? '' : p.note).trim().slice(0, 500);
  var moneyChanged = Math.abs(amt - num_(e.amount)) > 0.004 || acc.id !== e.account_id || date !== e.date;
  if (!moneyChanged && cat === e.category && note === String(e.note || '')) fail_('No changes to save');
  if (moneyChanged) confirmAdmin_(user, p.password);
  var txns = all_('AccountTxns').filter(function (t) { return t.ref_type === 'expense' && t.ref_id === e.id && !t.voided; });
  if (txns.length !== 1) fail_('The account entry of this expense is missing or duplicated. Review it before editing');
  var before = { date: e.date, category: e.category, amount: e.amount, account: accs[e.account_id] ? accs[e.account_id].name : e.account_id, note: e.note || '' };
  update_('AccountTxns', txns[0].id, { account_id: acc.id, amount: amt, date: date, note: 'Expense: ' + cat + (note ? ' — ' + note : '') });
  var upd = update_('Expenses', e.id, { date: date, category: cat, amount: amt, account_id: acc.id, note: note });
  audit_(user, 'expense_update', { id: e.id, before: before, after: { date: date, category: cat, amount: amt, account: acc.name, note: note } });
  var o = Object.assign({}, upd); delete o._row; o.account_name = acc.name;
  return o;
}
function expensesList_(p, user, allRows) {
  var accs = indexBy_(all_('Accounts'));
  return all_('Expenses').filter(function (e) { return inRange_(e.date, p.from, p.to) && (!p.category || e.category === p.category) && (!p.status || e.status === p.status); })
    .sort(function (a, b) { return b._row - a._row; })
    .map(function (e) { var o = Object.assign({}, e); delete o._row; o.account_name = accs[e.account_id] ? accs[e.account_id].name : ''; return o; });
}

/* ============================================================================
 *  17. REVERSAL / CANCELLATION  (admin authorised)
 * ========================================================================== */
function reverse_(p, user) {
  need_(user, 'cancel');
  confirmAdmin_(user, p.password);
  var reason = String(p.reason || '').trim(); if (!reason) fail_('Enter a reason for the cancellation');
  var fn = { sale: reverseSale_, purchase: reversePurchase_, sreturn: reverseSreturn_, preturn: reversePreturn_, cpay: reversePayment_, spay: reversePayment_, expense: reverseExpense_, account: reverseAccountEntry_ }[p.type];
  if (!fn) fail_('Unknown transaction type');
  var docTable = { sale: 'Sales', purchase: 'Purchases', sreturn: 'SalesReturns', preturn: 'PurchaseReturns', cpay: 'CustomerLedger', spay: 'SupplierLedger', expense: 'Expenses', account: 'AccountTxns' }[p.type];
  var doc = all_(docTable).filter(function (x) { return x.id === p.id; })[0];
  if (doc && doc.date) lockCheck_(doc.date, 'a transaction');
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
  if (all_('WarrantyClaims').some(function(c) { var rep = valuation_(c.replacement); return c.sale_id === s.id && rep && (rep.kind === 'unit' || rep.kind === 'serial'); }))
    fail_('Cannot cancel an invoice with stock warranty replacement history. The replacement and vendor recovery must remain in the accounting history');
  var pmap = indexBy_(all_('Products')), sidx = serialIndex_(), events = [];
  var items = all_('SaleItems').filter(function (i) { return i.sale_id === s.id; });
  items.forEach(function (i) {
    parseList_(i.serials).forEach(function (sn) {
      var rec = sidx[i.product_id + '|' + sn];
      if (!rec || rec.status !== 'sold' || rec.sale_id !== s.id) fail_('Cannot cancel: serial ' + sn + ' is no longer sold on this invoice');
    });
  });
  items.forEach(function (i) {
    var pr = pmap[i.product_id];
    if (pr && !isService_(pr)) update_('Products', pr.id, i.serials ? { stock: round_(pr.stock + i.qty, 4) } : addInventoryValue_(pr, i.qty, i.cost));
    parseList_(i.serials).forEach(function (sn) {
      var rec = sidx[i.product_id + '|' + sn]; if (rec && rec.sale_id === s.id) update_('SerialItems', rec.id, { status: 'in_stock', sale_id: '' });
      events.push({ serial: sn, product_id: i.product_id, product_name: i.name, event: 'sale_cancelled', ref_type: 'sale', ref_id: s.id, ref_no: s.invoice_no, party: s.customer_name, qty: 1, amount: 0, note: 'Invoice cancelled: ' + reason });
    });
    if (!i.serials) events.push({ serial: '', product_id: i.product_id, product_name: i.name, event: 'sale_cancelled', ref_type: 'sale', ref_id: s.id, ref_no: s.invoice_no, party: s.customer_name, qty: i.qty, amount: 0, note: 'Invoice cancelled: ' + reason });
  });
  voidRefs_('AccountTxns', s.id, 'sale'); voidRefs_('CustomerLedger', s.id);
  update_('Sales', s.id, { status: 'cancelled', cancel_reason: reason });
  all_('Repairs').filter(function (job) { return job.sale_id === s.id && job.status === 'Delivered'; }).forEach(function (job) {
    var log = repairLog_(job); log.push({ ts: now_(), status: 'Completed', user: user.name, note: 'Delivery invoice cancelled: ' + reason });
    update_('Repairs', job.id, { status: 'Completed', sale_id: '', invoice_no: '', delivered_date: '', log: log, updated_at: now_() });
  });
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
    var before = valuation_(i.valuation);
    var remaining = round_(pr.stock - i.qty, 4), cost = pr.cost_price;
    if (before && Math.abs(pr.stock - before.after_stock) < 1e-9 && Math.abs(cost - before.after_cost) < 0.00005) cost = before.cost;
    else if (!i.serials) {
      cost = remaining > 0 ? round_((pr.stock * cost - purchaseInventoryCost_(i)) / remaining, 4) : 0;
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
  var pmap = indexBy_(all_('Products')), sidx = serialIndex_(), items = all_('SalesReturnItems').filter(function (i) { return i.return_id === r.id; }), planned = {};
  items.slice().reverse().forEach(function (i) {
    var original = pmap[i.product_id]; if (!original) fail_('Product not found: ' + i.name); if (isService_(original)) return;
    var pr = planned[original.id] || Object.assign({}, original), before = valuation_(i.valuation);
    if (pr.stock < i.qty - 1e-9) fail_('Cannot cancel: ' + i.name + ' returned stock has already been sold again');
    var serials = parseList_(i.serials);
    serials.forEach(function (sn, n) {
      var rec = sidx[i.product_id + '|' + sn];
      if (!rec || rec.status !== 'in_stock' || (before && before.serial_ids && rec.id !== before.serial_ids[n]) || laterInventoryChange_(i.product_id, 'sreturn', r.id, sn))
        fail_('Cannot cancel: serial ' + sn + ' has later inventory changes; reverse them first');
    });
    var after;
    if (before && Math.abs(pr.stock - before.after_stock) < 1e-9 && Math.abs(pr.cost_price - before.after_cost) < 0.00005)
      after = { stock: round_(pr.stock - i.qty, 4), cost_price: before.cost };
    else after = serials.length ? { stock: round_(pr.stock - i.qty, 4), cost_price: pr.cost_price } : removeInventoryValue_(pr, i.qty, i.cost);
    pr.stock = after.stock; pr.cost_price = after.cost_price; planned[pr.id] = pr;
  });
  Object.keys(planned).forEach(function (id) { update_('Products', id, { stock: planned[id].stock, cost_price: planned[id].cost_price }); });
  var events = [];
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
  var pmap = indexBy_(all_('Products')), sidx = serialIndex_(), events = [], planned = {}, items = all_('PurchaseReturnItems').filter(function (i) { return i.return_id === r.id; });
  items.slice().reverse().forEach(function (i) {
    var original = pmap[i.product_id]; if (!original || isService_(original)) fail_('Inventory product not found: ' + i.name);
    var pr = planned[original.id] || Object.assign({}, original), before = valuation_(i.valuation), serials = parseList_(i.serials);
    serials.forEach(function (sn, n) {
      var rec = sidx[i.product_id + '|' + sn];
      if (!rec || rec.status !== 'returned_supplier' || rec.purchase_id !== r.purchase_id || (before && before.serial_ids && rec.id !== before.serial_ids[n]))
        fail_('Cannot cancel: serial ' + sn + ' has been purchased or moved again; reverse those later operations first');
    });
    var after;
    if (before && Math.abs(pr.stock - before.after_stock) < 1e-9 && Math.abs(pr.cost_price - before.after_cost) < 0.00005)
      after = { stock: round_(pr.stock + i.qty, 4), cost_price: before.cost };
    else if (serials.length) after = { stock: round_(pr.stock + i.qty, 4), cost_price: pr.cost_price };
    else if (before && Object.prototype.hasOwnProperty.call(before, 'inventory_cost')) after = addInventoryValue_(pr, i.qty, num_(before.inventory_cost));
    else {
      if (laterInventoryChange_(pr.id, 'preturn', r.id)) fail_('Cannot cancel this legacy return: reverse later inventory changes first');
      // Pre-1.0.6 purchase returns changed quantity only. Restore their actual old bookkeeping.
      after = { stock: round_(pr.stock + i.qty, 4), cost_price: pr.cost_price };
    }
    pr.stock = after.stock; pr.cost_price = after.cost_price; planned[pr.id] = pr;
  });
  Object.keys(planned).forEach(function (id) { update_('Products', id, { stock: planned[id].stock, cost_price: planned[id].cost_price }); });
  items.forEach(function (i) {
    parseList_(i.serials).forEach(function (sn) {
      var rec = sidx[i.product_id + '|' + sn]; update_('SerialItems', rec.id, { status: 'in_stock', sale_id: '' });
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
  var parties = p.type === 'cpay' ? 'Customers' : 'Suppliers', key = p.type === 'cpay' ? 'customer_id' : 'supplier_id';
  if (!all_(parties).some(function(party) { return party.id === row[key]; })) fail_('The customer or supplier record is missing. Restore that party before cancelling this payment');
  voidRefs_('AccountTxns', row.ref_id, refType); voidRefs_(table, row.ref_id);
  return true;
}
/** Owner deposit / withdrawal / transfer between accounts (a transfer is cancelled on both sides). */
function reverseAccountEntry_(p, user, reason) {
  var t = all_('AccountTxns').filter(function (x) { return x.id === p.id; })[0];
  if (!t || t.voided) fail_('Account entry not found or already cancelled');
  if (t.ref_type !== 'manual' && t.ref_type !== 'transfer') fail_('Only deposits, withdrawals and transfers can be cancelled here; cancel the sale, purchase, payment or expense itself');
  voidRefs_('AccountTxns', t.ref_id, t.ref_type);
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
  if (sale.status !== 'active') fail_('Invoice ' + sale.invoice_no + ' is cancelled, so its items have no warranty');
  var serial = String(p.serial || '').trim();
  if (parseList_(si.serials).length && parseList_(si.serials).indexOf(serial) < 0) fail_('Select the serial number being claimed');
  if (serial) {
    var unit = serialIndex_()[si.product_id + '|' + serial];
    if (!unit || unit.status !== 'sold' || unit.sale_id !== sale.id) fail_('Serial ' + serial + ' was returned or is no longer sold on this invoice');
  } else {
    var actRet = {}; all_('SalesReturns').forEach(function (r) { if (r.sale_id === sale.id && r.status === 'active') actRet[r.id] = 1; });
    var back = sum_(all_('SalesReturnItems').filter(function (x) { return actRet[x.return_id] && x.sale_item_id === si.id; }), function (x) { return x.qty; });
    if (back >= si.qty - 1e-9) fail_(si.name + ' on invoice ' + sale.invoice_no + ' was returned, so it has no warranty');
  }
  if (all_('WarrantyClaims').some(function (c) { return c.sale_id === sale.id && c.product_id === si.product_id && c.serial === serial && c.status !== 'Delivered' && c.status !== 'Rejected'; }))
    fail_('An open claim already exists for this item');
  var cust = sale.customer_id ? all_('Customers').filter(function (c) { return c.id === sale.customer_id; })[0] : null;
  var inW = !!si.warranty_expiry && si.warranty_expiry >= today_();
  var no = nextNo_('seq_claim', 'WC-');
  var log = [{ ts: now_(), status: 'Pending', sale_item_id: si.id, note: (p.issue || 'Item received for warranty') + (inW ? '' : ' (OUT OF WARRANTY)'), user: user.name }];
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
  if ((c.status === 'Delivered' || c.status === 'Rejected') && p.status !== c.status) fail_('This claim is already ' + c.status + ' and closed');
  if (c.status === 'Replaced' && p.status !== 'Replaced' && p.status !== 'Delivered') fail_('The item was already replaced; the claim can only be delivered now');
  var log = []; try { log = JSON.parse(c.log || '[]'); } catch (e) {}
  var patch = { status: p.status, updated_at: now_() }, note = p.note || '', events = [];
  if (p.status === 'Replaced' && c.status !== 'Replaced') {
    var rep = claimReplace_(c, p, user);
    patch.replacement = rep.record; events = rep.events;
    note = (note ? note + ' · ' : '') + rep.text;
  }
  log.push({ ts: now_(), status: p.status, note: note, user: user.name });
  patch.log = log;
  if (p.vendor !== undefined && p.vendor !== null) patch.vendor = p.vendor;
  // Only the move to Delivered sets the date; a later note keeps the original delivery date.
  if (p.status === 'Delivered' && (c.status !== 'Delivered' || !c.delivered_date)) patch.delivered_date = today_();
  var r = update_('WarrantyClaims', c.id, patch);
  evBatch_(user, [{ serial: c.serial, product_id: c.product_id, product_name: c.product_name, event: 'warranty_' + p.status.toLowerCase().replace(/\s+/g, '_'), ref_type: 'claim', ref_id: c.id, ref_no: c.claim_no, party: p.vendor || c.vendor || c.customer_name, qty: 1, amount: 0, note: note || p.status }].concat(events));
  return r;
}
/**
 * The customer gets a new unit from stock. Serial items: the chosen in-stock serial is sold on the original
 * invoice in place of the faulty one (which is kept as "faulty" for the vendor). Other items: one unit leaves stock.
 * The stock value goes down by the new unit's cost until the vendor's unit is put back with claim.restock.
 */
function claimReplace_(c, p, user) {
  if (!c.in_warranty || !c.expiry || c.expiry < c.date) fail_('Warranty had expired when this claim was received; a free stock replacement is not allowed');
  var pr = all_('Products').filter(function (x) { return x.id === c.product_id; })[0]; if (!pr) fail_('Product not found');
  var sale = all_('Sales').filter(function (s) { return s.id === c.sale_id; })[0];
  if (!sale || sale.status !== 'active') fail_('The invoice of this claim is cancelled');
  var invoiceItems = all_('SaleItems').filter(function(i) { return i.sale_id === sale.id && i.product_id === pr.id; });
  var claimLog = []; try { claimLog = typeof c.log === 'string' ? JSON.parse(c.log || '[]') : c.log || []; } catch(e) {}
  var lineId = claimLog.length && claimLog[0].sale_item_id;
  var candidates = invoiceItems.filter(function(i) {
    if (lineId) return i.id === lineId;
    return c.serial ? parseList_(i.serials).indexOf(c.serial) >= 0 : i.warranty_expiry === c.expiry;
  });
  if (candidates.length !== 1) fail_('The original warranty invoice line cannot be identified uniquely. Review this legacy claim before giving a replacement');
  var claimedLine = candidates[0], returns = {}, returned = 0;
  all_('SalesReturns').forEach(function(r) { if (r.sale_id === sale.id && r.status === 'active') returns[r.id] = true; });
  all_('SalesReturnItems').forEach(function(i) { if (returns[i.return_id] && i.sale_item_id === claimedLine.id) returned += num_(i.qty); });
  if (!c.serial && num_(claimedLine.qty) - returned < 1 - 1e-9) fail_('This invoice line was returned; a warranty replacement is no longer allowed');
  if (isService_(pr)) return { record: { kind: 'service' }, events: [], text: 'Service repeated (no stock)' };
  if (isSerialProduct_(pr) && c.serial) {
    var sidx = serialIndex_(), want = String(p.replacement_serial || '').trim();
    if (!want) fail_('Choose the serial number of the replacement unit given to the customer');
    var nu = sidx[pr.id + '|' + want], old = sidx[pr.id + '|' + c.serial];
    if (!nu || nu.status !== 'in_stock') fail_('Serial ' + want + ' is not in stock for ' + pr.name);
    if (!old || old.status !== 'sold' || old.sale_id !== sale.id) fail_('The claimed serial ' + c.serial + ' is no longer sold on invoice ' + sale.invoice_no);
    var si = all_('SaleItems').filter(function (i) { return i.sale_id === sale.id && i.product_id === pr.id && parseList_(i.serials).indexOf(c.serial) >= 0; })[0];
    if (!si) fail_('Invoice line of serial ' + c.serial + ' not found');
    update_('SaleItems', si.id, { serials: parseList_(si.serials).map(function (s) { return s === c.serial ? want : s; }).join(',') });
    update_('SerialItems', nu.id, { status: 'sold', sale_id: sale.id });
    update_('SerialItems', old.id, { status: 'faulty', sale_id: sale.id });
    update_('Products', pr.id, { stock: round_(pr.stock - 1, 4) });
    syncSerialCost_([pr.id]);
    return {
      record: { kind: 'serial', given: want, faulty: c.serial, cost: num_(nu.cost), restocked: false },
      events: [{ serial: want, product_id: pr.id, product_name: pr.name, event: 'warranty_replacement_out', ref_type: 'claim', ref_id: c.id, ref_no: c.claim_no, party: c.customer_name, qty: 1, amount: 0, note: 'Given in place of ' + c.serial + ' (' + sale.invoice_no + ')' }],
      text: 'Replacement ' + want + ' given; faulty ' + c.serial + ' kept for the vendor'
    };
  }
  if (pr.stock < 1 - 1e-9) fail_('No ' + pr.name + ' in stock to give as a replacement');
  var cost = num_(pr.cost_price);
  update_('Products', pr.id, { stock: round_(pr.stock - 1, 4) });
  return {
    record: { kind: 'unit', cost: cost, sale_item_id: claimedLine.id, restocked: false },
    events: [{ serial: '', product_id: pr.id, product_name: pr.name, event: 'warranty_replacement_out', ref_type: 'claim', ref_id: c.id, ref_no: c.claim_no, party: c.customer_name, qty: -1, amount: 0, note: 'Replacement unit given from stock' }],
    text: 'Replacement unit given from stock'
  };
}
/** The vendor sent a working unit for a replaced claim: it goes back into stock at the cost of the unit given away. */
function claimRestock_(p, user) {
  var c = all_('WarrantyClaims').filter(function (x) { return x.id === p.id; })[0]; if (!c) fail_('Claim not found');
  var rep = valuation_(c.replacement);
  if (!rep || (rep.kind !== 'serial' && rep.kind !== 'unit')) fail_('This claim has no replacement given from stock');
  if (rep.restocked) fail_('The vendor unit for this claim is already back in stock');
  var pr = all_('Products').filter(function (x) { return x.id === c.product_id; })[0]; if (!pr) fail_('Product not found');
  var serial = '';
  if (rep.kind === 'serial') {
    serial = String(p.serial || '').trim(); if (!serial) fail_('Enter the serial number of the unit the vendor sent');
    var sidx = serialIndex_(), ex = serialCaseMatch_(pr.id, serial);
    if (ex && ex.serial !== serial) fail_('Serial already exists with different capitalization: ' + ex.serial);
    if (ex && ex.id && serial !== rep.faulty && ex.status !== 'returned_supplier') fail_('Serial already exists: ' + serial);
    var otherProduct = serialOnOtherProduct_(pr.id, serial);
    if (otherProduct) fail_('Serial ' + serial + ' already belongs to ' + otherProduct + '. A serial number can belong to only one product');
    if (serial === rep.faulty) update_('SerialItems', ex.id, { status: 'in_stock', sale_id: '', cost: rep.cost }); // repaired and returned
    else insert_('SerialItems', { product_id: pr.id, serial: serial, purchase_id: '', sale_id: '', status: 'in_stock', cost: rep.cost, created_at: now_() });
    delete _mem.__serialIdx;
  }
  var stock = round_(pr.stock + 1, 4);
  update_('Products', pr.id, { stock: stock, cost_price: rep.kind === 'unit' && stock > 0 ? round_((Math.max(pr.stock, 0) * num_(pr.cost_price) + rep.cost) / (Math.max(pr.stock, 0) + 1), 4) : pr.cost_price });
  if (rep.kind === 'serial') syncSerialCost_([pr.id]);
  rep.restocked = true; rep.restock_serial = serial; rep.restocked_at = now_();
  var log = []; try { log = JSON.parse(c.log || '[]'); } catch (e) {}
  log.push({ ts: now_(), status: c.status, note: 'Vendor unit back in stock' + (serial ? ' (' + serial + ')' : ''), user: user.name });
  var r = update_('WarrantyClaims', c.id, { replacement: rep, log: log, updated_at: now_() });
  evBatch_(user, [{ serial: serial, product_id: pr.id, product_name: pr.name, event: 'warranty_restock', ref_type: 'claim', ref_id: c.id, ref_no: c.claim_no, party: c.vendor || '', qty: 1, amount: 0, note: 'Unit from vendor put back in stock' }]);
  audit_(user, 'claim_restock', c.claim_no);
  return r;
}
function claimsList_(p, user, allRows) {
  var q = String(p.q || '').toLowerCase();
  return all_('WarrantyClaims').filter(function (c) {
    if (!inRange_(c.date, p.from, p.to)) return false;
    if (p.status === 'open') { if (c.status === 'Delivered' || c.status === 'Rejected') return false; }
    else if (p.status && c.status !== p.status) return false;
    return !q || (c.claim_no + ' ' + c.serial + ' ' + c.invoice_no + ' ' + c.product_name + ' ' + c.customer_name + ' ' + c.phone).toLowerCase().indexOf(q) >= 0;
  }).sort(function (a, b) { return b._row - a._row; }).map(function (c) { var o = Object.assign({}, c); delete o._row; try { o.log = JSON.parse(c.log || '[]'); } catch (e) { o.log = []; } return o; });
}

/* ============================================================================
 *  19. ITEM HISTORY EXPLORER (serial / barcode / invoice life-cycle)
 * ========================================================================== */
function itemHistory_(p, user) {
  // a product picked from the "which product?" list
  if (p.product_id) {
    var picked = all_('Products').filter(function (x) { return x.id === p.product_id; })[0];
    if (!picked) fail_('Product not found');
    p = { q: picked.name, exact_product: picked.id };
  }
  var q = String(p.q || '').trim(); if (!q) fail_('Enter a serial number, barcode or invoice number');
  var ql = q.toLowerCase(), events = all_('ItemEvents'), res = { query: q, kind: 'none', summary: null, items: [], timeline: [], claims: [], returns: [], cards: null };
  var pmap = indexBy_(all_('Products')), sales = indexBy_(all_('Sales')), purs = indexBy_(all_('Purchases'));
  var returnsById = indexBy_(all_('SalesReturns'));
  function ownSale(s) { return !s || can_(user, 'sales.all') || s.user_id === user.id; }
  function visibleEv(e) {
    var sale = e.ref_type === 'sale' ? sales[e.ref_id] : (e.ref_type === 'sreturn' && returnsById[e.ref_id] ? sales[returnsById[e.ref_id].sale_id] : null);
    return ownSale(sale);
  }
  function cleanEv(e) {
    var costEvent = e.ref_type === 'purchase' || e.ref_type === 'preturn' || e.event === 'purchase' || e.event === 'purchase_return' || e.event === 'stock_adjust';
    return { id: e.id, ts: e.ts, event: e.event, serial: e.serial, product_name: e.product_name, ref_no: e.ref_no, ref_type: e.ref_type, ref_id: e.ref_id, party: e.party, qty: e.qty, amount: !costEvent || can_(user, 'cost') ? e.amount : undefined, note: e.note, user: e.user };
  }
  function sortEv(list) { return list.filter(visibleEv).sort(function (a, b) { return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0; }); }

  // 1) Serial number
  var serialRecs = p.exact_product ? [] : all_('SerialItems').filter(function (s) { return s.serial.toLowerCase() === ql && s.status !== 'cancelled'; });
  if (serialRecs.length) {
    res.kind = 'serial';
    var rec = serialRecs[serialRecs.length - 1], pr = pmap[rec.product_id] || {};
    var pur = purs[rec.purchase_id], sale = rec.sale_id ? sales[rec.sale_id] : null, si = null;
    if (sale) si = all_('SaleItems').filter(function (i) { return i.sale_id === sale.id && i.product_id === rec.product_id && parseList_(i.serials).indexOf(rec.serial) >= 0; })[0];
    var inDate = pur ? pur.date : String(rec.created_at).slice(0, 10), outDate = sale ? sale.date : today_();
    var exp = si ? si.warranty_expiry : '';
    var visibleSale = ownSale(sale) ? sale : null;
    res.summary = {
      serial: rec.serial, product: pr.name || '', status: rec.status, purchase_invoice: pur ? pur.invoice_no : '', supplier: pur ? pur.supplier_name : '',
      purchase_date: inDate, cost: can_(user, 'cost') ? rec.cost : undefined, sale_invoice: visibleSale ? visibleSale.invoice_no : '', customer: visibleSale ? visibleSale.customer_name : '',
      sale_date: visibleSale ? visibleSale.date : '', sale_price: visibleSale && si ? si.price : undefined, warranty_expiry: exp, in_warranty: !!exp && exp >= today_(), days_left: exp ? daysBetween_(today_(), exp) : null,
      days_in_inventory: daysBetween_(inDate, outDate)
    };
    var ids = {}; serialRecs.forEach(function (s) { ids[s.product_id] = 1; });
    res.timeline = sortEv(events.filter(function (e) { return e.serial.toLowerCase() === ql; }).map(cleanEv));
    res.claims = all_('WarrantyClaims').filter(function (c) { return c.serial.toLowerCase() === ql && ownSale(sales[c.sale_id]); }).map(function (c) { var o = Object.assign({}, c); delete o._row; try { o.log = JSON.parse(c.log || '[]'); } catch (e) { o.log = []; } return o; });
    res.cards = historyCards_('serial', { serial: ql, product: pr, summary: res.summary }, user);
    return res;
  }

  // 2) Invoice (sale or purchase)
  var sl = p.exact_product ? null : all_('Sales').filter(function (s) { return s.invoice_no.toLowerCase() === ql; })[0];
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
    res.cards = historyCards_('sale', { sale: sl, items: its }, user);
    return res;
  }
  // our purchase number, or the supplier's own invoice number (newest match)
  var pu = p.exact_product ? null : all_('Purchases').filter(function (s) { return s.invoice_no.toLowerCase() === ql; })[0]
    || all_('Purchases').filter(function (s) { return s.supplier_invoice && s.supplier_invoice.toLowerCase() === ql; }).sort(function (a, b) { return (b.status === 'active') - (a.status === 'active') || b._row - a._row; })[0];
  if (pu) {
    if (!can_(user, 'purchase')) fail_('Permission denied: purchase invoice history');
    res.kind = 'purchase_invoice';
    var pits = all_('PurchaseItems').filter(function (i) { return i.purchase_id === pu.id; });
    res.summary = { invoice: pu.invoice_no, supplier_invoice: pu.supplier_invoice || '', date: pu.date, supplier: pu.supplier_name, total: pu.total, paid: pu.paid, due: pu.due, status: pu.status };
    res.items = pits.map(function (i) { return { name: i.name, qty: i.qty, cost: can_(user, 'cost') ? i.cost : undefined, serials: i.serials }; });
    var ps = {}; pits.forEach(function (i) { parseList_(i.serials).forEach(function (s) { ps[s] = 1; }); });
    res.timeline = sortEv(events.filter(function (e) { return e.ref_id === pu.id || (e.serial && ps[e.serial]); }).map(cleanEv));
    res.cards = historyCards_('purchase', { purchase: pu, items: pits }, user);
    return res;
  }

  // 3) Product barcode / SKU / exact name
  var prod = p.exact_product ? all_('Products').filter(function (x) { return x.id === p.exact_product; })[0]
    : all_('Products').filter(function (x) { return (x.barcode && x.barcode.toLowerCase() === ql) || (x.sku && x.sku.toLowerCase() === ql) || x.name.toLowerCase() === ql; })[0];
  // 4) part of a product name / model / barcode: one match opens it, several ask "which product?"
  if (!prod) {
    var like = all_('Products').filter(function (x) { return [x.name, x.sku, x.barcode].join(' ').toLowerCase().indexOf(ql) >= 0; })
      .sort(function (a, b) { return (b.active === true) - (a.active === true) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
    if (like.length === 1) prod = like[0];
    else if (like.length > 1) {
      res.kind = 'choose';
      res.total = like.length;
      res.items = like.slice(0, 40).map(function (x) { return { id: x.id, name: x.name, sku: x.sku || '', barcode: x.barcode || '', stock: x.stock, unit: x.unit, service: isService_(x), active: x.active !== false }; });
      return res;
    }
  }
  if (prod) {
    res.kind = 'product';
    var srs = all_('SerialItems').filter(function (s) { return s.product_id === prod.id && s.status !== 'cancelled'; });
    var counts = {}; srs.forEach(function (s) { counts[s.status] = (counts[s.status] || 0) + 1; });
    res.summary = { product: prod.name, barcode: prod.barcode, sku: prod.sku, stock: prod.stock, unit: prod.unit, serials_in_stock: counts.in_stock || 0, serials_sold: counts.sold || 0, serials_returned_supplier: counts.returned_supplier || 0 };
    res.items = srs.slice(-300).map(function (s) { return { serial: s.serial, status: s.status, sale_invoice: s.sale_id && ownSale(sales[s.sale_id]) && sales[s.sale_id] ? sales[s.sale_id].invoice_no : '', purchase_invoice: purs[s.purchase_id] ? purs[s.purchase_id].invoice_no : '' }; });
    res.timeline = sortEv(events.filter(function (e) { return e.product_id === prod.id; }).slice(-300).map(cleanEv));
    res.cards = historyCards_('product', { product: prod }, user);
    return res;
  }
  return res;
}

/* ---- Advance Search cards: the product, where it was bought, who bought it, sales returns, purchase returns and
 *      warranty claims — each a list of documents (newest first) the user may open. Same privacy as the timeline:
 *      other staff's sales stay hidden without "View sales made by other staff", and purchase money needs the
 *      Purchases or Cost permission. ---- */
var HISTORY_CARD_MAX = 100;
function historyCards_(kind, x, user) {
  var cx = {
    money: can_(user, 'cost') || can_(user, 'purchase'),
    cost: can_(user, 'cost'),
    sales: indexBy_(all_('Sales')), purs: indexBy_(all_('Purchases')), pmap: indexBy_(all_('Products')),
    cats: indexBy_(all_('Categories')), brands: indexBy_(all_('Brands')),
    own: function (s) { return !s || can_(user, 'sales.all') || s.user_id === user.id; }
  };
  var lower = function (list) { return parseList_(list).map(function (v) { return v.toLowerCase(); }); };
  var serialProduct = function (pr) { return !!pr && !isService_(pr) && pr.has_warranty && pr.warranty_type === 'serial'; };
  // which lines of a document belong to what was searched
  var match;
  var cards = { products: [], purchases: null, sales: null, sreturns: null, preturns: null, claims: null, notes: {} };

  if (kind === 'serial') {
    match = function (i) { return lower(i.serials).indexOf(x.serial) >= 0; };
    cards.products = [historyProduct_(x.product, cx, x.summary)];
  } else if (kind === 'product') {
    match = function (i) { return i.product_id === x.product.id; };
    cards.products = [historyProduct_(x.product, cx)];
  } else if (kind === 'sale' || kind === 'purchase') {
    var sers = {}, plain = {}, doc = kind === 'sale' ? x.sale : x.purchase;
    x.items.forEach(function (i) {
      var ls = lower(i.serials);
      if (ls.length) ls.forEach(function (v) { sers[v] = 1; }); else plain[i.product_id] = 1;
    });
    cards.products = x.items.map(function (i) {
      var pr = cx.pmap[i.product_id], o = historyProduct_(pr || { id: i.product_id, name: i.name, unit: i.unit }, cx);
      o.line = { name: i.name, qty: i.qty, unit: i.unit, serials: i.serials || '' };
      if (kind === 'sale') { o.line.price = i.price; o.line.total = i.total; o.line.warranty_expiry = i.warranty_expiry || ''; o.line.warranty_days = i.warranty_days || 0; }
      else if (cx.money) { o.line.cost = i.cost; o.line.total = i.total; }
      return o;
    });
    // a serial is followed exactly; other products only by date (after the purchase / before the sale)
    match = function (i, date) {
      var ls = lower(i.serials);
      if (ls.length) return ls.some(function (v) { return sers[v]; });
      return !!plain[i.product_id] && (kind === 'purchase' ? date >= doc.date : date <= doc.date);
    };
    cards.plain = Object.keys(plain).length > 0;
  }
  // a line with serial numbers counts only the serials that belong here (1 router of a line of 3), at its unit price
  var sel = kind === 'serial' ? function (v) { return v === x.serial; } : kind === 'product' ? null : function (v) { return !!sers[v]; };
  var part = function (i) {
    var ls = lower(i.serials); if (!sel || !ls.length) return i;
    var n = ls.filter(sel).length; if (n === ls.length) return i;
    var o = Object.assign({}, i); o.qty = n; o.total = i.qty ? round_(i.total / i.qty * n) : 0; return o;
  };

  /* ---- purchases ---- */
  var purRows = {};
  if (kind === 'purchase') purRows[x.purchase.id] = historyDoc_('purchase', x.purchase, x.items, cx, true);
  else if (kind === 'sale') {
    // serials: the purchase they came from; other products: the last purchase on or before the sale date
    var lastBuy = {};
    all_('PurchaseItems').forEach(function (i) {
      var pu = cx.purs[i.purchase_id]; if (!pu || pu.status !== 'active') return;
      var ls = lower(i.serials);
      if (ls.length) {
        if (ls.some(function (v) { return sers[v]; })) (purRows[pu.id] = purRows[pu.id] || { pu: pu, items: [] }).items.push(part(i));
      } else if (plain[i.product_id] && pu.date <= x.sale.date) {
        var cur = lastBuy[i.product_id];
        if (!cur || pu.date > cur.pu.date || (pu.date === cur.pu.date && pu._row > cur.pu._row)) lastBuy[i.product_id] = { pu: pu, item: i };
      }
    });
    // counted as what this invoice sold (not what that purchase bought), at that purchase's price
    var soldQty = {}; x.items.forEach(function (i) { if (!lower(i.serials).length) soldQty[i.product_id] = (soldQty[i.product_id] || 0) + i.qty; });
    Object.keys(lastBuy).forEach(function (pid) {
      var b = lastBuy[pid], it = Object.assign({}, b.item); it.qty = soldQty[pid]; it.total = round_(b.item.cost * soldQty[pid]);
      (purRows[b.pu.id] = purRows[b.pu.id] || { pu: b.pu, items: [] }).items.push(it); purRows[b.pu.id].last = true;
    });
    Object.keys(purRows).forEach(function (id) { var r = purRows[id]; var o = historyDoc_('purchase', r.pu, r.items, cx, false); if (r.last) o.last = true; purRows[id] = o; });
  } else {
    var pi = {};
    all_('PurchaseItems').forEach(function (i) { var pu = cx.purs[i.purchase_id]; if (pu && match(i, pu.date)) (pi[pu.id] = pi[pu.id] || []).push(part(i)); });
    Object.keys(pi).forEach(function (id) { purRows[id] = historyDoc_('purchase', cx.purs[id], pi[id], cx, false); });
  }
  cards.purchases = historyList_(Object.keys(purRows).map(function (k) { return purRows[k]; }));

  /* ---- sales ---- */
  var saleRows = [];
  if (kind === 'sale') saleRows.push(historyDoc_('sale', x.sale, x.items, cx, true));
  else {
    var si = {};
    all_('SaleItems').forEach(function (i) { var sa = cx.sales[i.sale_id]; if (sa && cx.own(sa) && match(i, sa.date)) (si[sa.id] = si[sa.id] || []).push(part(i)); });
    Object.keys(si).forEach(function (id) { saleRows.push(historyDoc_('sale', cx.sales[id], si[id], cx, false)); });
  }
  cards.sales = historyList_(saleRows);

  /* ---- sales returns ---- */
  var srets = indexBy_(all_('SalesReturns')), sr = {};
  all_('SalesReturnItems').forEach(function (i) {
    var r = srets[i.return_id]; if (!r || !cx.own(cx.sales[r.sale_id])) return;
    if (kind === 'sale' ? r.sale_id === x.sale.id : match(i, r.date)) (sr[r.id] = sr[r.id] || []).push(kind === 'sale' ? i : part(i));
  });
  cards.sreturns = historyList_(Object.keys(sr).map(function (id) { return historyDoc_('sreturn', srets[id], sr[id], cx, kind === 'sale'); }));

  /* ---- purchase returns ---- */
  var prets = indexBy_(all_('PurchaseReturns')), pr2 = {};
  all_('PurchaseReturnItems').forEach(function (i) {
    var r = prets[i.return_id]; if (!r) return;
    if (kind === 'purchase' ? r.purchase_id === x.purchase.id : kind === 'sale' ? lower(i.serials).some(function (v) { return sers[v]; }) : match(i, r.date)) (pr2[r.id] = pr2[r.id] || []).push(kind === 'purchase' ? i : part(i));
  });
  cards.preturns = historyList_(Object.keys(pr2).map(function (id) { return historyDoc_('preturn', prets[id], pr2[id], cx, kind === 'purchase'); }));

  /* ---- warranty claims ---- */
  cards.claims = historyList_(all_('WarrantyClaims').filter(function (c) {
    if (!cx.own(cx.sales[c.sale_id])) return false;
    if (kind === 'serial') return String(c.serial || '').toLowerCase() === x.serial;
    if (kind === 'product') return c.product_id === x.product.id;
    if (kind === 'sale') return c.sale_id === x.sale.id;
    var cs = String(c.serial || '').toLowerCase();
    return cs ? !!sers[cs] : !!plain[c.product_id] && c.date >= x.purchase.date;
  }).map(function (c) {
    return { type: 'claim', id: c.id, no: c.claim_no, date: c.date, party: c.customer_name, product: c.product_name, serial: c.serial, status: c.status, in_warranty: c.in_warranty === true, invoice_no: c.invoice_no, _r: c._row };
  }));

  // what the date-based lists mean, shown on the card
  if (cards.plain && kind === 'purchase') cards.notes.sales = cards.notes.sreturns = 'Products without serial numbers: sales since this purchase';
  if (cards.plain && kind === 'sale') cards.notes.purchases = 'Products without serial numbers: the last purchase before this sale';
  delete cards.plain;
  return cards;
}
/** One product for the Product card. */
function historyProduct_(pr, cx, serialInfo) {
  var o = { id: pr.id, name: pr.name, sku: pr.sku || '', barcode: pr.barcode || '', unit: pr.unit || 'pcs', stock: pr.stock, service: isService_(pr),
    brand: cx.brands[pr.brand_id] ? cx.brands[pr.brand_id].name : '', group: cx.cats[pr.category_id] ? cx.cats[pr.category_id].name : '',
    category: cx.cats[pr.subcategory_id] ? cx.cats[pr.subcategory_id].name : '', sale_price: pr.sale_price, active: pr.active !== false,
    has_warranty: !!pr.has_warranty, warranty_type: pr.warranty_type || '', warranty_days: pr.warranty_days || 0, description: pr.description || '' };
  if (cx.cost) { o.cost_price = pr.cost_price; o.wholesale_price = pr.wholesale_price; }
  if (pr.has_warranty && pr.warranty_type === 'serial' && pr.created_at !== undefined) {
    var c = { in_stock: 0, sold: 0, returned_supplier: 0 };
    all_('SerialItems').forEach(function (x) { if (x.product_id === pr.id && c.hasOwnProperty(x.status)) c[x.status]++; });
    o.serials = c;
  }
  if (serialInfo) o.serial = serialInfo;
  return o;
}
/** One document row: a sale, purchase, sales return or purchase return, with only the lines that matter here. */
function historyDoc_(type, d, lines, cx, whole) {
  var q = round_(sum_(lines, function (i) { return i.qty; }), 3), amt = round_(sum_(lines, function (i) { return i.total; }));
  var names = []; lines.forEach(function (i) { if (names.indexOf(i.name) < 0) names.push(i.name); });
  var o = { type: type, id: d.id, date: d.date, status: d.status, qty: q, items: names.slice(0, 3).join(', ') + (names.length > 3 ? ' +' + (names.length - 3) + ' more' : ''), whole: !!whole, _r: d._row };
  if (type === 'sale') { o.no = d.invoice_no; o.party = d.customer_name || CASH_SALE_NAME; o.amount = whole ? d.total : amt; if (whole) { o.paid = d.paid; o.due = d.due; o.due_now = saleOpenDues_()[d.id] || 0; } o.staff = d.user_name || ''; }
  if (type === 'purchase') { o.no = d.invoice_no; o.party = d.supplier_name || '—'; o.supplier_invoice = d.supplier_invoice || ''; if (cx.money) { o.amount = whole ? d.total : amt; if (whole) { o.paid = d.paid; o.due = d.due; } } }
  if (type === 'sreturn') { o.no = d.return_no; o.party = d.customer_name || CASH_SALE_NAME; o.invoice_no = d.invoice_no; o.kind = d.type; o.amount = whole ? d.total : amt; o.refund = d.refund; }
  if (type === 'preturn') { o.no = d.return_no; o.party = d.supplier_name || '—'; o.invoice_no = d.invoice_no; if (cx.money) { o.amount = whole ? d.total : amt; o.received = d.received; } }
  return o;
}
function historyList_(rows) {
  rows.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b._r || 0) - (a._r || 0); });
  return { total: rows.length, rows: rows.slice(0, HISTORY_CARD_MAX).map(function (r) { var o = Object.assign({}, r); delete o._r; return o; }) };
}

/** A full document from Advance Search: sale / purchase invoice, sales / purchase return or warranty claim. */
function historyDoc_route_(p, user) {
  var t = p.type, id = String(p.id || '');
  if (t === 'sale') { need_(user, 'pos'); return { type: t, detail: saleDetail_({ id: id }, user) }; }
  if (t === 'purchase') { need_(user, 'purchase'); return { type: t, detail: purchaseDetail_({ id: id }) }; }
  if (t === 'sreturn') {
    need_(user, 'sales.return');
    var r = all_('SalesReturns').filter(function (x) { return x.id === id || x.return_no === id; })[0]; if (!r) fail_('Sales return not found');
    var sale = all_('Sales').filter(function (x) { return x.id === r.sale_id; })[0];
    if (sale && !can_(user, 'sales.all') && sale.user_id !== user.id) fail_('Permission denied: this return belongs to another user');
    var acc = r.refund_account_id ? all_('Accounts').filter(function (a) { return a.id === r.refund_account_id; })[0] : null;
    var cust = r.customer_id ? all_('Customers').filter(function (c) { return c.id === r.customer_id; })[0] : null;
    var ro = Object.assign({}, r); delete ro._row; ro.refund_account = acc ? acc.name : '';
    return { type: t, detail: { ret: stripCost_(ro, user), items: stripCost_(all_('SalesReturnItems').filter(function (i) { return i.return_id === r.id; }).map(function (i) { var o = Object.assign({}, i); delete o._row; delete o.valuation; return o; }), user),
      customer: cust ? { name: cust.name, phones: cust.phones, addresses: cust.addresses } : null } };
  }
  if (t === 'preturn') {
    need_(user, 'purchase');
    var pr = all_('PurchaseReturns').filter(function (x) { return x.id === id || x.return_no === id; })[0]; if (!pr) fail_('Purchase return not found');
    var acc2 = pr.account_id ? all_('Accounts').filter(function (a) { return a.id === pr.account_id; })[0] : null;
    var sup = pr.supplier_id ? all_('Suppliers').filter(function (x) { return x.id === pr.supplier_id; })[0] : null;
    var po = Object.assign({}, pr); delete po._row; po.account = acc2 ? acc2.name : '';
    return { type: t, detail: { ret: po, items: all_('PurchaseReturnItems').filter(function (i) { return i.return_id === pr.id; }).map(function (i) { var o = Object.assign({}, i); delete o._row; delete o.valuation; return o; }),
      supplier: sup ? { name: sup.name, phones: sup.phones, address: sup.address } : null } };
  }
  if (t === 'claim') {
    need_(user, 'warranty');
    var c = all_('WarrantyClaims').filter(function (x) { return x.id === id || x.claim_no === id; })[0]; if (!c) fail_('Warranty claim not found');
    var co = Object.assign({}, c); delete co._row; try { co.log = JSON.parse(c.log || '[]'); } catch (e) { co.log = []; }
    return { type: t, detail: co };
  }
  fail_('Unknown document type');
}
/* ============================================================================
 *  20. DASHBOARD
 * ========================================================================== */
/** Next payment date promised on a due sale: '' (none) or yyyy-MM-dd, not before the sale date. */
function promiseDate_(v, saleDate) {
  var d = String(v || '').trim().slice(0, 10);
  if (!d) return '';
  if (!isDate_(d)) fail_('Next payment date is not a valid date');
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
 * Use the same opening-debt/advance/return allocation as the invoice's current due.
 */
function collectionReminders_(sales, today) {
  var promised = sales.filter(function (s) { return s.customer_id && s.next_payment_date && s.due > 0.005; });
  if (!promised.length) return [];
  var bal = customerBalances_(), custs = indexBy_(all_('Customers')), due = saleOpenDues_(), out = [];
  promised.forEach(function (s) {
    var left = due[s.id] || 0;
    if (left <= 0.005 || s.next_payment_date > today) return;
    var c = custs[s.customer_id] || {};
    var days = Math.round((new Date(today + 'T12:00:00') - new Date(s.next_payment_date + 'T12:00:00')) / 864e5);
    out.push({ sale_id: s.id, invoice_no: s.invoice_no, customer_id: s.customer_id, customer_name: c.name || s.customer_name, phone: parseList_(c.phones || '')[0] || '',
      date: s.date, next_payment_date: s.next_payment_date, overdue_days: days, invoice_due: s.due, remaining: round_(left), customer_balance: round_(bal[s.customer_id] || 0) });
  });
  return out.sort(function (a, b) { return b.overdue_days - a.overdue_days || b.remaining - a.remaining; });
}
/**
 * What is still owed on each invoice now (Sales.due is the due at the time of sale and never changes).
 * Each customer's ledger is replayed in order: a sales return credits its own invoice first; payments,
 * returns and advances then settle the oldest debt first (opening balance, then invoices by date of entry).
 * The open amounts minus any unapplied advance always equal the customer's ledger balance.
 * Returns { sale_id: amount still due } for every invoice; cancelled invoices are 0.
 */
function saleOpenDues_() {
  if (!_txn && _mem.__openDues) return _mem.__openDues;
  var out = {}, active = {}, returnSale = {}, state = {}, custs = indexBy_(all_('Customers'));
  all_('Sales').forEach(function (s) {
    if (s.status !== 'active') { out[s.id] = 0; return; }
    active[s.id] = s;
    out[s.id] = s.customer_id ? 0 : round_(Math.max(num_(s.due), 0)); // walk-in invoices have no ledger
  });
  all_('SalesReturns').forEach(function (r) { returnSale[r.id] = r.sale_id; });
  var st = function (cid) {
    if (state[cid]) return state[cid];
    var opening = num_((custs[cid] || {}).opening_balance);
    return state[cid] = { pool: Math.max(-opening, 0), open: opening > 0 ? [{ id: '', left: round_(opening) }] : [] };
  };
  var settle = function (x) {
    x.open.forEach(function (o) {
      if (x.pool <= 0.0001 || o.left <= 0) return;
      var take = Math.min(o.left, x.pool); o.left = round_(o.left - take); x.pool = round_(x.pool - take);
    });
  };
  all_('CustomerLedger').filter(function (l) { return !l.voided; }).sort(function (a, b) { return a._row - b._row; }).forEach(function (l) {
    var x = st(l.customer_id);
    if (l.type === 'sale') {
      var s = active[l.ref_id]; if (!s) return;
      // Allocate live ledger credit only; a voided advance must reopen the debt.
      x.open.push({ id: s.id, left: round_(Math.max(num_(l.debit) - num_(l.credit), 0)) });
      settle(x);
      return;
    }
    var amt = round_(num_(l.credit) - num_(l.debit));
    if (amt > 0) {
      if (l.type === 'sreturn') {
        var own = x.open.filter(function (o) { return o.id && o.id === returnSale[l.ref_id]; })[0];
        if (own) { var take = Math.min(own.left, amt); own.left = round_(own.left - take); amt = round_(amt - take); }
      }
      x.pool = round_(x.pool + amt);
      settle(x);
    } else if (amt < 0) { // money paid out to the customer: first from their advance, otherwise new debt
      var fromPool = Math.min(x.pool, -amt);
      x.pool = round_(x.pool - fromPool);
      if (-amt - fromPool > 0.0001) x.open.push({ id: '', left: round_(-amt - fromPool) });
    }
  });
  var seen = {};
  Object.keys(state).forEach(function (cid) { state[cid].open.forEach(function (o) { if (o.id) { out[o.id] = round_(o.left); seen[o.id] = 1; } }); });
  // An invoice with no ledger entry (e.g. its customer row was deleted) keeps its recorded due.
  Object.keys(active).forEach(function (id) { if (active[id].customer_id && !seen[id]) out[id] = round_(Math.max(num_(active[id].due), 0)); });
  if (!_txn) _mem.__openDues = out;
  return out;
}
function purchaseOpenDues_() {
  if (!_txn && _mem.__purchaseOpenDues) return _mem.__purchaseOpenDues;
  var out = {}, active = {}, returnSale = {}, state = {}, custs = indexBy_(all_('Suppliers'));
  all_('Purchases').forEach(function (s) {
    if (s.status !== 'active') { out[s.id] = 0; return; }
    active[s.id] = s;
    out[s.id] = s.supplier_id ? 0 : round_(Math.max(num_(s.due), 0)); // walk-in invoices have no ledger
  });
  all_('PurchaseReturns').forEach(function (r) { returnSale[r.id] = r.purchase_id; });
  var st = function (cid) {
    if (state[cid]) return state[cid];
    var opening = num_((custs[cid] || {}).opening_balance);
    return state[cid] = { pool: Math.max(-opening, 0), open: opening > 0 ? [{ id: '', left: round_(opening) }] : [] };
  };
  var settle = function (x) {
    x.open.forEach(function (o) {
      if (x.pool <= 0.0001 || o.left <= 0) return;
      var take = Math.min(o.left, x.pool); o.left = round_(o.left - take); x.pool = round_(x.pool - take);
    });
  };
  all_('SupplierLedger').filter(function (l) { return !l.voided; }).sort(function (a, b) { return a._row - b._row; }).forEach(function (l) {
    var x = st(l.supplier_id);
    if (l.type === 'purchase') {
      var s = active[l.ref_id]; if (!s) return;
      // Allocate live ledger credit only; a voided advance must reopen the debt.
      x.open.push({ id: s.id, left: round_(Math.max(num_(l.credit) - num_(l.debit), 0)) });
      settle(x);
      return;
    }
    var amt = round_(num_(l.debit) - num_(l.credit));
    if (amt > 0) {
      if (l.type === 'preturn') {
        var own = x.open.filter(function (o) { return o.id && o.id === returnSale[l.ref_id]; })[0];
        if (own) { var take = Math.min(own.left, amt); own.left = round_(own.left - take); amt = round_(amt - take); }
      }
      x.pool = round_(x.pool + amt);
      settle(x);
    } else if (amt < 0) { // money paid out to the customer: first from their advance, otherwise new debt
      var fromPool = Math.min(x.pool, -amt);
      x.pool = round_(x.pool - fromPool);
      if (-amt - fromPool > 0.0001) x.open.push({ id: '', left: round_(-amt - fromPool) });
    }
  });
  var seen = {};
  Object.keys(state).forEach(function (cid) { state[cid].open.forEach(function (o) { if (o.id) { out[o.id] = round_(o.left); seen[o.id] = 1; } }); });
  // An invoice with no ledger entry (e.g. its customer row was deleted) keeps its recorded due.
  Object.keys(active).forEach(function (id) { if (active[id].supplier_id && !seen[id]) out[id] = round_(Math.max(num_(active[id].due), 0)); });
  if (!_txn) _mem.__purchaseOpenDues = out;
  return out;
}
/** Best sellers by product for today / this month / all time, net of returns, with the product group. */
function topProducts_(sales, today, showCost) {
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
      .sort(function (a, b) { return b.amount - a.amount || b.qty - a.qty; }).slice(0, 300)
      .map(function (r) { if (!showCost) delete r.profit; return r; });
  });
  return out;
}
/** POS price history for one product: last purchase (cost permission only) and the last 3 selling prices. */
function productHistory_(p, user) {
  var pr = all_('Products').filter(function (x) { return x.id === p.product_id; })[0]; if (!pr) fail_('Product not found');
  var out = { product_id: pr.id, stock: pr.stock, last_sales: [] };
  var actSale = indexBy_(all_('Sales').filter(function (s) { return s.status === 'active' && (can_(user, 'sales.all') || s.user_id === user.id); }));
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

/** Value of manual stock adjustments in the date range (negative = stock lost). Keyed by day or month if `key` is given. */
function stockAdjustValue_(from, to, key) {
  var by = {}, total = 0;
  var add = function (d, value) { d = String(d || '').slice(0, 10); if (!d || !inRange_(d, from, to)) return; total += value; if (key) by[key(d)] = (by[key(d)] || 0) + value; };
  all_('ItemEvents').forEach(function (e) {
    if (e.event !== 'stock_adjust') return;
    var d = String(e.ts || '').slice(0, 10); if (!inRange_(d, from, to)) return;
    var v = num_(e.amount); total += v;
    if (key) by[key(d)] = (by[key(d)] || 0) + v;
  });
  all_('WarrantyClaims').forEach(function (claim) {
    var rep = valuation_(claim.replacement);
    if (!rep || (rep.kind !== 'unit' && rep.kind !== 'serial')) return;
    var log = []; try { log = JSON.parse(claim.log || '[]'); } catch (e) {}
    var replaced = log.filter(function (entry) { return entry.status === 'Replaced'; })[0];
    add(replaced ? replaced.ts : claim.date, -num_(rep.cost));
    if (rep.restocked) add(rep.restocked_at, num_(rep.cost));
  });
  return key ? by : round_(total);
}
/* ---- Profit: gross = sales − cost of goods − profit on returned goods; net = gross − expenses ---- */
function profitSummary_(from, to) {
  var inR = function (x) { return x.status === 'active' && inRange_(x.date, from, to); };
  var s = all_('Sales').filter(inR), r = all_('SalesReturns').filter(inR), e = all_('Expenses').filter(inR);
  var sales = round_(sum_(s, function (x) { return x.total; })), returns = round_(sum_(r, function (x) { return x.total; }));
  var o = {
    invoices: s.length, sales: sales, discount: round_(sum_(s, function (x) { return x.discount; })),
    cost: round_(sum_(s, function (x) { return x.cost; })), sales_profit: round_(sum_(s, function (x) { return x.profit; })),
    return_count: r.length, returns: returns, returns_cost: round_(sum_(r, function (x) { return x.cost; })),
    returns_profit: round_(sum_(r, function (x) { return x.total - x.cost; })),
    expense_count: e.length, expenses: round_(sum_(e, function (x) { return x.amount; }))
  };
  o.net_sales = round_(sales - returns);
  o.gross = round_(o.sales_profit - o.returns_profit);
  o.stock_adjust = stockAdjustValue_(from, to); // negative = stock written off
  o.net = round_(o.gross - o.expenses + o.stock_adjust);
  o.margin = o.net_sales > 0 ? round_(o.gross / o.net_sales * 100, 1) : 0;
  o.net_margin = o.net_sales > 0 ? round_(o.net / o.net_sales * 100, 1) : 0;
  return o;
}
function profitReport_(p, user) {
  if (!can_(user, 'cost')) fail_('Permission denied');
  var today = today_(), from = String(p.from || today.slice(0, 8) + '01').slice(0, 10), to = String(p.to || today).slice(0, 10);
  if (from > to) fail_('The start date is after the end date');
  var days = Math.round((new Date(to + 'T12:00:00Z') - new Date(from + 'T12:00:00Z')) / 864e5) + 1;
  var group = p.group === 'month' || p.group === 'day' ? p.group : days > 62 ? 'month' : 'day';
  var key = function (d) { return group === 'month' ? String(d).slice(0, 7) : String(d).slice(0, 10); };
  var inR = function (x) { return x.status === 'active' && inRange_(x.date, from, to); };
  var sales = all_('Sales').filter(inR), rets = all_('SalesReturns').filter(inR), exps = all_('Expenses').filter(inR);

  var tl = {}, row = function (k) { return tl[k] = tl[k] || { period: k, invoices: 0, sales: 0, cost: 0, returns: 0, returns_profit: 0, gross: 0, expenses: 0, net: 0 }; };
  sales.forEach(function (s) { var r = row(key(s.date)); r.invoices++; r.sales += s.total; r.cost += s.cost; r.gross += s.profit; });
  rets.forEach(function (x) { var r = row(key(x.date)); r.returns += x.total; r.returns_profit += x.total - x.cost; r.gross -= x.total - x.cost; });
  exps.forEach(function (x) { row(key(x.date)).expenses += x.amount; });
  var adj = stockAdjustValue_(from, to, key);
  Object.keys(adj).forEach(function (k) { row(k); });
  var timeline = Object.keys(tl).sort().map(function (k) {
    var r = tl[k]; ['sales', 'cost', 'returns', 'returns_profit', 'gross', 'expenses'].forEach(function (f) { r[f] = round_(r[f]); });
    r.stock_adjust = round_(adj[k] || 0);
    r.net = round_(r.gross - r.expenses + r.stock_adjust); return r;
  });

  // Per product: item profit before invoice discounts, less profit on returned units.
  var sIds = indexBy_(sales), rIds = indexBy_(rets), pg = {};
  var prow = function (id, name, unit) { return pg[id] = pg[id] || { product_id: id, name: name, unit: unit || 'pcs', qty: 0, revenue: 0, cost: 0, returned_qty: 0, returns: 0, returns_profit: 0, profit: 0 }; };
  all_('SaleItems').forEach(function (i) { if (!sIds[i.sale_id]) return; var r = prow(i.product_id, i.name, i.unit); r.qty += i.qty; r.revenue += i.total; r.cost += i.cost; r.profit += i.total - i.cost; });
  all_('SalesReturnItems').forEach(function (i) { if (!rIds[i.return_id]) return; var r = prow(i.product_id, i.name, ''); r.returned_qty += i.qty; r.returns += i.total; r.returns_profit += i.total - i.cost; r.profit -= i.total - i.cost; });
  var products = Object.keys(pg).map(function (k) {
    var r = pg[k]; ['revenue', 'cost', 'returns', 'returns_profit', 'profit'].forEach(function (f) { r[f] = round_(r[f]); });
    r.qty = round_(r.qty, 4); r.returned_qty = round_(r.returned_qty, 4);
    r.margin = r.revenue - r.returns > 0 ? round_(r.profit / (r.revenue - r.returns) * 100, 1) : 0; return r;
  }).sort(function (a, b) { return b.profit - a.profit; });

  // Per staff member (returns count against the person who made the original sale).
  var allSales = indexBy_(all_('Sales')), st = {};
  var srow = function (n) { n = n || '—'; return st[n] = st[n] || { name: n, invoices: 0, sales: 0, returns: 0, gross: 0 }; };
  sales.forEach(function (s) { var r = srow(s.user_name); r.invoices++; r.sales += s.total; r.gross += s.profit; });
  rets.forEach(function (x) { var r = srow((allSales[x.sale_id] || {}).user_name || x.user); r.returns += x.total; r.gross -= x.total - x.cost; });
  var staff = Object.keys(st).map(function (k) { var r = st[k]; r.sales = round_(r.sales); r.returns = round_(r.returns); r.gross = round_(r.gross); return r; })
    .sort(function (a, b) { return b.gross - a.gross; });

  var ec = {};
  exps.forEach(function (x) { var c = x.category || 'Other', r = ec[c] = ec[c] || { category: c, count: 0, amount: 0 }; r.count++; r.amount += x.amount; });
  var expenses = Object.keys(ec).map(function (k) { ec[k].amount = round_(ec[k].amount); return ec[k]; }).sort(function (a, b) { return b.amount - a.amount; });

  var summary = profitSummary_(from, to);
  summary.items_profit = round_(sum_(products, function (r) { return r.profit + r.returns_profit; }));
  return { from: from, to: to, group: group, summary: summary, timeline: timeline, products: products, staff: staff, expenses: expenses };
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
      c.stock_adjust = period === 'total' ? stockAdjustValue_('', '') : period === 'today' ? stockAdjustValue_(today, today) : stockAdjustValue_(month + '-01', today);
      c.net_profit = round_(c.gross_profit - c.expenses + c.stock_adjust);
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
        row.net_profit = { amount: round_(row.profit - row.expenses.amount + stockAdjustValue_(r[2], r[3])), count: ex.length };
      }
      var sd = s.filter(function (x) { return x.due > 0; }), pd = pu.filter(function (x) { return x.due > 0; });
      row.receivable = { amount: round_(sum_(sd, function (x) { return x.due; })), count: sd.length };
      row.payable = { amount: round_(sum_(pd, function (x) { return x.due; })), count: pd.length };
    }
    return row;
  });
  // Profit card: today, this week, this month, last 6 months — gross and net (admins / staff who see cost).
  if (full && showCost) {
    out.profit = [['today', 'Today', today, today]].concat(ranges.filter(function (r) { return ['week', 'month', 'six_months'].indexOf(r[0]) >= 0; }))
      .map(function (r) {
        var x = profitSummary_(r[2], r[3]);
        return { key: r[0], label: r[1], from: r[2], to: r[3], gross: x.gross, net: x.net, sales: x.net_sales, expenses: x.expenses, invoices: x.invoices };
      });
  }

  var series = [];
  for (var i = 13; i >= 0; i--) {
    var d = addDays_(today, -i), ds = sales.filter(function (x) { return x.date === d; });
    var row = { date: d, sales: round_(sum_(ds, function (x) { return x.total; })), invoices: ds.length };
    if (showCost) row.profit = round_(sum_(ds, function (x) { return x.profit; }));
    series.push(row);
  }
  out.series = series;
  out.reminders = collectionReminders_(sales, today);
  if (user.role === 'admin') out.repair_alerts = repairAlerts_();
  out.top_products = topProducts_(sales, today, showCost);
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
/** Reports for staff without the cost permission never carry cost or profit, not even in hidden fields. */
function reports_(p, user) {
  var rep = reportsRaw_(p, user);
  if (can_(user, 'cost')) return rep;
  var hidden = ['cost', 'profit', 'cost_price', 'wholesale_price', 'returns_cost', 'stock_adjust'];
  var clean = function (o) { if (!o || typeof o !== 'object') return o; var c = Object.assign({}, o); hidden.forEach(function (k) { delete c[k]; }); return c; };
  rep.columns = (rep.columns || []).filter(function (c) { return hidden.indexOf(c.key) < 0; });
  rep.rows = (rep.rows || []).map(clean);
  if (rep.totals) rep.totals = clean(rep.totals);
  return rep;
}
function activeReportTotals_(report) {
  if (report.totals) Object.keys(report.totals).forEach(function(key) {
    report.totals[key] = round_(sum_(report.rows.filter(function(row) { return row.status === 'active'; }), function(row) { return num_(row[key]); }));
  });
  return report;
}
function reportsRaw_(p, user) {
  var from = p.from || '', to = p.to || '', group = p.group || 'invoice', cost = can_(user, 'cost');
  var status = p.status || 'active', okStatus = function (s) { return status === 'all' || s === status; };
  var period = (from || to) ? ' (' + (from || '…') + ' → ' + (to || '…') + ')' : '';
  var T = p.type;

  if (T === 'sales') {
    var sl = all_('Sales').filter(function (s) { return (can_(user, 'sales.all') || s.user_id === user.id) && inRange_(s.date, from, to) && okStatus(s.status) && (!p.customer_id || s.customer_id === p.customer_id) && (!p.user_id || s.user_id === p.user_id); });
    if (group === 'invoice') {
      var items = {}; all_('SaleItems').forEach(function (i) { (items[i.sale_id] = items[i.sale_id] || []).push(i.name + ' x' + i.qty); });
      var cols = [col_('date', 'Date', 'date'), col_('invoice_no', 'Invoice'), col_('customer_name', 'Customer'), col_('items', 'Items'), col_('subtotal', 'Subtotal', 'money', 1), col_('discount', 'Discount', 'money', 1), col_('total', 'Total', 'money', 1), col_('paid', 'Paid', 'money', 1), col_('due', 'Due at sale', 'money', 1), col_('due_now', 'Due now', 'money', 1)];
      if (cost) cols.push(col_('profit', 'Profit', 'money', 1));
      cols.push(col_('user_name', 'Staff'), col_('status', 'Status'));
      var dn = saleOpenDues_();
      var rows = sl.sort(function (a, b) { return a._row - b._row; }).map(function (s) { var o = Object.assign({}, s); o.items = (items[s.id] || []).join(', '); o.due_now = dn[s.id] || 0; return o; });
      var rep = finishReport_('Sales Report — Invoice-wise' + period, cols, rows);
      if (rep.totals) { var act = rows.filter(function (r) { return r.status === 'active'; }); Object.keys(rep.totals).forEach(function (k) { rep.totals[k] = round_(sum_(act, function (r) { return r[k]; })); }); }
      return rep;
    }
    var g = {}, dn2 = saleOpenDues_();
    sl.filter(function (s) { return s.status === 'active'; }).forEach(function (s) {
      var k = bucket_(s.date, group), r = g[k] = g[k] || { period: k, invoices: 0, subtotal: 0, discount: 0, total: 0, paid: 0, due: 0, due_now: 0, profit: 0 };
      r.invoices++; r.subtotal += s.subtotal; r.discount += s.discount; r.total += s.total; r.paid += s.paid; r.due += s.due; r.due_now += dn2[s.id] || 0; r.profit += s.profit;
    });
    var cols2 = [col_('period', group === 'daily' ? 'Date' : group === 'monthly' ? 'Month' : 'Year'), col_('invoices', 'Invoices', 'num', 1), col_('subtotal', 'Subtotal', 'money', 1), col_('discount', 'Discount', 'money', 1), col_('total', 'Total Sales', 'money', 1), col_('paid', 'Collected', 'money', 1), col_('due', 'Due at sale', 'money', 1), col_('due_now', 'Due now', 'money', 1)];
    if (cost) cols2.push(col_('profit', 'Profit', 'money', 1));
    return finishReport_('Sales Report — ' + group + period, cols2, Object.keys(g).sort().map(function (k) { return g[k]; }));
  }

  if (T === 'purchases') {
    var purchaseDues = purchaseOpenDues_();
    var pu = all_('Purchases').filter(function (s) { return inRange_(s.date, from, to) && okStatus(s.status) && (!p.supplier_id || s.supplier_id === p.supplier_id); });
    if (group === 'invoice') {
      var pit = {}; all_('PurchaseItems').forEach(function (i) { (pit[i.purchase_id] = pit[i.purchase_id] || []).push(i.name + ' x' + i.qty); });
      var pc = [col_('date', 'Date', 'date'), col_('invoice_no', 'Invoice'), col_('supplier_name', 'Supplier'), col_('items', 'Items'), col_('subtotal', 'Subtotal', 'money', 1), col_('discount', 'Discount', 'money', 1), col_('total', 'Total', 'money', 1), col_('paid', 'Paid', 'money', 1), col_('due', 'Due at purchase', 'money', 1), col_('due_now', 'Due now', 'money', 1), col_('user', 'Staff'), col_('status', 'Status')];
      var prow = pu.sort(function (a, b) { return a._row - b._row; }).map(function (s) { var o = Object.assign({}, s); o.items = (pit[s.id] || []).join(', '); o.due_now = purchaseDues[s.id] || 0; return o; });
      var prep = finishReport_('Purchase Report — Invoice-wise' + period, pc, prow);
      if (prep.totals) { var pact = prow.filter(function (r) { return r.status === 'active'; }); Object.keys(prep.totals).forEach(function (k) { prep.totals[k] = round_(sum_(pact, function (r) { return r[k]; })); }); }
      return prep;
    }
    var pg = {};
    pu.filter(function (s) { return s.status === 'active'; }).forEach(function (s) {
      var k = bucket_(s.date, group), r = pg[k] = pg[k] || { period: k, invoices: 0, total: 0, paid: 0, due: 0, due_now: 0 };
      r.invoices++; r.total += s.total; r.paid += s.paid; r.due += s.due; r.due_now += purchaseDues[s.id] || 0;
    });
    return finishReport_('Purchase Report — ' + group + period, [col_('period', 'Period'), col_('invoices', 'Invoices', 'num', 1), col_('total', 'Total', 'money', 1), col_('paid', 'Paid', 'money', 1), col_('due', 'Due at purchase', 'money', 1), col_('due_now', 'Due now', 'money', 1)], Object.keys(pg).sort().map(function (k) { return pg[k]; }));
  }

  if (T === 'sales_returns') {
    var sr = sreturnsList_({ from: from, to: to, status: status === 'all' ? '' : status }, user, true).reverse();
    return activeReportTotals_(finishReport_('Sales Returns' + period, [col_('date', 'Date', 'date'), col_('return_no', 'Return #'), col_('invoice_no', 'Invoice'), col_('customer_name', 'Customer'), col_('type', 'Type'), col_('items_text', 'Items'), col_('total', 'Value', 'money', 1), col_('refund', 'Cash Refund', 'money', 1), col_('user', 'Staff'), col_('status', 'Status')], sr));
  }
  if (T === 'purchase_returns') {
    var pr = preturnsList_({ from: from, to: to, status: status === 'all' ? '' : status }, user, true).reverse();
    return activeReportTotals_(finishReport_('Purchase Returns' + period, [col_('date', 'Date', 'date'), col_('return_no', 'Return #'), col_('invoice_no', 'Purchase'), col_('supplier_name', 'Supplier'), col_('items_text', 'Items'), col_('total', 'Value', 'money', 1), col_('received', 'Cash Received', 'money', 1), col_('user', 'Staff'), col_('status', 'Status')], pr));
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
    var adjD = stockAdjustValue_(from, to, function (d) { return d; });
    Object.keys(adjD).forEach(function (k) { var r = d_(k); r.stock_adjust = round_(adjD[k]); r.profit += adjD[k]; });
    var dc = [col_('date', 'Date', 'date'), col_('invoices', 'Invoices', 'num', 1), col_('items', 'Items Sold', 'num', 1), col_('sales', 'Sales', 'money', 1), col_('returns', 'Sales Returns', 'money', 1), col_('purchases', 'Purchases', 'money', 1), col_('purchase_returns', 'Purchase Returns', 'money', 1), col_('expenses', 'Expenses', 'money', 1)];
    if (cost) dc.push(col_('stock_adjust', 'Stock adjust', 'money', 1), col_('profit', 'Net Profit', 'money', 1));
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
    var cl = claimsList_({ from: from, to: to, status: p.status === 'all' || !p.status ? '' : p.status }, user, true).reverse();
    var counts = {}; cl.forEach(function (c) { counts[c.status] = (counts[c.status] || 0) + 1; });
    return finishReport_('Warranty Report' + period, [col_('claim_no', 'Claim #'), col_('date', 'Received', 'date'), col_('invoice_no', 'Invoice'), col_('customer_name', 'Customer'), col_('phone', 'Phone'), col_('product_name', 'Product'), col_('serial', 'Serial'), col_('issue', 'Issue'), col_('vendor', 'Vendor'), col_('status', 'Status'), col_('delivered_date', 'Delivered', 'date')],
      cl.map(function (c) { var o = Object.assign({}, c); delete o.log; return stripCost_(o, user); }), { summary: counts });
  }

  if (T === 'expenses') {
    var ex = expensesList_({ from: from, to: to, status: status === 'all' ? '' : status }, user, true);
    if (group === 'category') {
      var eg = {}; ex.forEach(function (e) { if (e.status !== 'active') return; var r = eg[e.category] = eg[e.category] || { category: e.category, count: 0, amount: 0 }; r.count++; r.amount += e.amount; });
      return finishReport_('Expenses by Category' + period, [col_('category', 'Category'), col_('count', 'Entries', 'num', 1), col_('amount', 'Amount', 'money', 1)], Object.keys(eg).map(function (k) { return eg[k]; }));
    }
    return finishReport_('Expenses' + period, [col_('date', 'Date', 'date'), col_('category', 'Category'), col_('note', 'Note'), col_('account_name', 'Paid From'), col_('amount', 'Amount', 'money', 1), col_('user', 'Staff'), col_('status', 'Status')], ex.reverse());
  }

  if (T === 'product_sales') {
    var sm = indexBy_(all_('Sales').filter(function (s) { return s.status === 'active' && inRange_(s.date, from, to); })), pg2 = {};
    var reportItems = all_('SaleItems'), invoiceItems = {};
    reportItems.forEach(function(i) { (invoiceItems[i.sale_id] = invoiceItems[i.sale_id] || []).push(i); });
    reportItems.forEach(function (i) {
      if (!sm[i.sale_id]) return;
      var r = pg2[i.product_id] = pg2[i.product_id] || { name: i.name, unit: i.unit, qty: 0, revenue: 0, cost: 0, profit: 0 };
      var net = invoiceLineNet_(i, invoiceItems[i.sale_id], sm[i.sale_id]);
      r.qty += i.qty; r.revenue += net; r.cost += i.cost; r.profit += net - i.cost;
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
  ping:               { public: true, noLock: true, fn: function () { return { app: 'Karvio', version: APP_VERSION, time: now_(), apiCapabilities: API_CAPABILITIES }; } },
  // Expiry cleanup is idempotent housekeeping; a rejected public link must still stay deleted.
  'invoice.public':   { public: true, fn: invoicePublic_, write: false },
  'quote.public':     { public: true, fn: quotePublic_, write: false },
  'quote.send':       r_('pos', quoteSend_, true),
  login:              { public: true, lockIfDirty: true, fn: login_, write: false },
  logout:             r_(null, logout_),
  'password.change':  r_(null, changePassword_, true),
  bootstrap:          r_(null, bootstrap_),

  'products.list':    r_(null, function (p, u) { return productsList_(u); }),
  'product.save':     r_('products', productSave_, true),
  'product.delete':   r_('products', productDelete_, true),
  'product.barcodes': r_('products', productBarcodes_, true),
  'serials.list':     r_(null, serialsList_),
  'serials.find':     r_(null, serialFind_),
  'product.history':  r_(null, function (p, u) { if (!can_(u, 'pos') && !can_(u, 'purchase')) fail_('Permission denied'); return productHistory_(p, u); }),
  'sale.promise':     r_('pos', salePromise_, true),
  'stock.adjust':     r_('products', stockAdjust_, true),
  'master.save':      r_('products', masterSave_, true),
  'master.delete':    r_('products', masterDelete_, true),
  'master.deleteMany':r_('products', function(p,u) {
    if (!MASTER[p.kind]) fail_('Unknown master type');
    if (!Array.isArray(p.ids) || !p.ids.length || p.ids.length > 200) fail_('Select 1 to 200 items');
    var seen = {};
    p.ids.forEach(function(id) { if (typeof id !== 'string' || !id || seen[id]) fail_('Invalid or duplicate selection'); seen[id] = true; });
    p.ids.forEach(function(id) { masterDelete_({kind:p.kind,id:id},u); });
    return {deleted:p.ids.length};
  }, true),
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
  'sales.details':    r_('pos', function (p, u) { var ids = Array.isArray(p.ids) ? p.ids : []; if (ids.length > 200) fail_('Export at most 200 invoices per request; use batched export'); if (!ids.length) fail_('Select at least one invoice'); return ids.map(function (id) { return saleDetail_({ id: id }, u); }); }),
  'sales.list':       r_('pos', salesList_),
  'sreturn.create':   r_('sales.return', sreturnCreate_, true),
  'sale.exchange':    r_('sales.return', saleExchange_, true),
  'sreturns.list':    r_('sales.return', function (p, u) { return stripCost_(sreturnsList_(p, u), u); }),

  'expense.create':   r_('expenses', expenseCreate_, true),
  'expense.update':   r_('expenses', expenseUpdate_, true),
  'expense.categories': r_('expenses', expenseCategoriesSave_, true),
  'expense.categories.usage': r_('expenses', expenseCategoryUsage_),
  'expenses.list':    r_('expenses', expensesList_),

  'reverse':          r_('cancel', reverse_, true),

  'warranty.lookup':  r_('warranty', warrantyLookup_),
  'claim.create':     r_('warranty', function (p, u) { return stripCost_(claimCreate_(p, u), u); }, true),
  'claim.update':     r_('warranty', function (p, u) { return stripCost_(claimUpdate_(p, u), u); }, true),
  'claims.list':      r_('warranty', function (p, u) { return stripCost_(claimsList_(p), u); }),
  'claim.restock':    r_('warranty', function (p, u) { return stripCost_(claimRestock_(p, u), u); }, true),
  'repairs.meta':     r_('repairs', repairsMeta_),
  'repairs.list':     r_('repairs', repairsList_),
  'repair.get':       r_('repairs', repairGet_),
  'repair.save':      r_('repairs', repairSave_, true),
  'repair.status':    r_('repairs', repairStatus_, true),
  'repair.deliver':   r_('repairs', repairDeliver_, true),
  'repair.cancel':    r_('repairs', repairCancel_, true),
  'repair.seen':      r_('repairs', repairSeen_, true),

  'history':          r_(null, function (p, u) { return stripCost_(itemHistory_(p, u), u); }),
  'history.doc':      r_(null, function (p, u) { return stripCost_(historyDoc_route_(p, u), u); }),
  'dashboard':        r_(null, dashboard_),
  'reports':          r_('reports', reports_),
  'profit.report':    r_('reports', profitReport_),

  'users.list':       r_('users', usersList_),
  'user.save':        r_('users', userSave_, true),
  'rolePerms.save':   r_('users', rolePermsSave_, true),
  'settings.get':     r_(null, settingsGet_),
  'settings.save':    r_('settings', settingsSave_, true),
  // Not journaled (it empties every table); runs under the script lock after recovery. Administrator account only.
  'database.reset':   r_('settings', databaseReset_, false),
  'database.info':    r_('settings', databaseInfo_, false),
  'database.export':  r_('settings', databaseExport_, false),
  'database.restore': r_('settings', databaseRestore_, false),
  'backup.schedule':  r_('settings', backupSchedule_, false),
  'sale.link':        r_('pos', saleLink_, true),
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
    var user = null, info = null;
    var run = function () {
      if (!route.public) { user = authUser_(req.token); need_(user, route.perm); }
      if (route.write) {
        info = requestInfo_(req, user);
        var saved = info && findReceipt_(info.key);
        if (saved) {
          if (saved.meta.payload !== info.payload) fail_('This request ID was already used with different data. Start a new operation.');
          return saved.data;
        }
      }
      return route.fn(req.payload || {}, user, req.token);
    };
    var data;
    if (route.noLock) data = run();
    // Sign-in only reads Users; without an unfinished transaction it needs no lock.
    else if (route.lockIfDirty && journalClean_()) { _mem = {}; data = run(); }
    // Reads acquire the same lock and recover unfinished commits before exposing business data.
    else data = withLock_(run, route.write, function () { return info; }, route.public ? 5000 : 0);
    return json_({ ok: true, data: data });
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    return json_({ ok: false, error: msg.replace(/^Error:\s*/, ''), auth: msg.indexOf('AUTH:') === 0, retryable: !!err.retryable, uncertain: !!err.uncertain });
  }
}

