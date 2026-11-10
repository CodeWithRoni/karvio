const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const FORMAT = 'Karvio Offline';
// Data files and backups made before the rename to Karvio carry the old name; they are still read and restored.
const LEGACY_FORMATS = ['ShopERP Offline'];
const LEGACY_FILE = 'shop-erp.json', LEGACY_PREVIOUS = 'shop-erp.previous.json';
const clone = (value) => JSON.parse(JSON.stringify(value));
const DAILY_BACKUPS = 30;
function formatDate(date, timezone = 'Asia/Dhaka', format = 'yyyy-MM-dd') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((p) => [p.type, p.value]));
  const day = `${p.year}-${p.month}-${p.day}`;
  return format === 'yyyy-MM-dd' ? day : `${day}T${p.hour}:${p.minute}:${p.second}`;
}

// The existing Apps Script business rules run against local disk tables.
// All operations are synchronous and a failed write restores the prior state.
class OfflineRuntime {
  constructor({ dataDir, codePath, seedSheets } = {}) {
    if (!dataDir || !codePath) throw new Error('Offline data and application paths are required');
    this.dataDir = path.resolve(dataDir);
    this.file = path.join(this.dataDir, 'karvio.json');
    this.backupDir = path.join(this.dataDir, 'backups');
    this.previousFile = path.join(this.dataDir, 'karvio.previous.json');
    this.cache = new Map(); this.dirty = false;
    fs.mkdirSync(this.backupDir, { recursive: true });
    // Same folder, so a rename is atomic: the old data file simply takes its new name.
    if (!fs.existsSync(this.file) && fs.existsSync(path.join(this.dataDir, LEGACY_FILE))) fs.renameSync(path.join(this.dataDir, LEGACY_FILE), this.file);
    if (!fs.existsSync(this.previousFile) && fs.existsSync(path.join(this.dataDir, LEGACY_PREVIOUS))) fs.renameSync(path.join(this.dataDir, LEGACY_PREVIOUS), this.previousFile);
    this.state = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { format: FORMAT, schemaVersion: 1, savedAt: '', properties: {}, sheets: seedSheets ? clone(seedSheets) : {} };
    this.validateShape(this.state);
    this.state.format = FORMAT; // a legacy file is written back under the new name on the next save
    this.initialSetup = !(this.state.sheets.Users?.rows.length > 1);
    const owner = this;
    class Range {
      constructor(sheet, row, column, height = 1, width = 1) {
        if (![row, column, height, width].every((n) => Number.isInteger(n) && n > 0)) throw new Error('Invalid local data range');
        Object.assign(this, { sheet, row, column, height, width });
      }
      getValues() { return Array.from({ length: this.height }, (_, r) => Array.from({ length: this.width }, (_, c) => this.sheet.data.rows[this.row - 1 + r]?.[this.column - 1 + c] ?? '')); }
      setValues(values) {
        if (values.length !== this.height || values.some((r) => r.length !== this.width)) throw new Error('Local data size mismatch');
        values.forEach((cells, r) => {
          const index = this.row - 1 + r;
          while (this.sheet.data.rows.length <= index) this.sheet.data.rows.push([]);
          cells.forEach((value, c) => { this.sheet.data.rows[index][this.column - 1 + c] = value; });
        });
        this.sheet.data.columns = Math.max(this.sheet.data.columns || 0, this.column - 1 + this.width);
        owner.dirty = true; return this;
      }
      setValue(value) { return this.setValues([[value]]); }
      clearContent() { return this.setValues(Array.from({ length: this.height }, () => Array(this.width).fill(''))); }
      setFontWeight() { return this; }
      setBackground() { return this; }
      setNumberFormat() { return this; }
    }
    class Sheet {
      constructor(name) { this.name = name; }
      get data() { return owner.state.sheets[this.name]; }
      getName() { return this.name; }
      getRange(...args) { return new Range(this, ...args); }
      getLastRow() { let last = this.data.rows.length; while (last && !this.data.rows[last - 1].some((v) => v !== '' && v !== null && v !== undefined)) last--; return last; }
      getMaxRows() { return Math.max(1000, this.data.rows.length); }
      getMaxColumns() { return this.data.rows.reduce((max, row) => Math.max(max, row.length), Math.max(this.data.columns || 0, 1)); }
      insertColumnsAfter(after, count) { this.data.rows.forEach((r) => { while (r.length < after) r.push(''); r.splice(after, 0, ...Array(count).fill('')); }); this.data.columns = after + count; owner.dirty = true; return this; }
      setFrozenRows() {}
      hideSheet() { return this; }
      clearContents() { this.data.rows = []; owner.dirty = true; return this; }
      getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), this.getMaxColumns()); }
      appendRow(cells) { this.getRange(this.getLastRow() + 1, 1, 1, cells.length).setValues([cells]); }
      deleteRow(row) { this.data.rows.splice(row - 1, 1); owner.dirty = true; }
      deleteRows(row, count = 1) { this.data.rows.splice(row - 1, count); owner.dirty = true; return this; }
    }
    const book = {
      getId: () => 'LOCAL_OFFLINE_DATABASE',
      getSheetByName: (name) => Object.hasOwn(this.state.sheets, name) ? new Sheet(name) : null,
      insertSheet: (name) => {
        if (Object.hasOwn(this.state.sheets, name) || ['__proto__', 'constructor', 'prototype'].includes(name)) throw new Error('Invalid local table');
        this.state.sheets[name] = { rows: [], columns: 1 }; this.dirty = true; return new Sheet(name);
      },
      getSheets: () => Object.keys(this.state.sheets).map((name) => new Sheet(name)),
      deleteSheet: (sheet) => { delete this.state.sheets[sheet.name]; this.dirty = true; },
      setSpreadsheetTimeZone() {}
    };
    this.context = vm.createContext({
      console,
      SpreadsheetApp: { getActiveSpreadsheet: () => book, openById: () => book, flush() {} },
      PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => this.state.properties[key] ?? null, setProperty: (key, value) => { this.state.properties[key] = value; this.dirty = true; } }) },
      CacheService: { getScriptCache: () => ({
        get: (key) => { const value = this.cache.get(key); if (!value || value.until <= Date.now()) { this.cache.delete(key); return null; } return value.text; },
        put: (key, text, seconds) => this.cache.set(key, { text, until: Date.now() + seconds * 1000 }),
        remove: (key) => this.cache.delete(key)
      }) },
      LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
      Session: { getScriptTimeZone: () => 'Asia/Dhaka' },
      ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => ({ setMimeType() { return this; }, getContent: () => text }) },
      UrlFetchApp: { fetch() { throw new Error('SMS is unavailable in offline mode. No message was sent.'); } },
      Utilities: { getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_, text) => Array.from(crypto.createHash('sha256').update(String(text)).digest()).map((b) => b > 127 ? b - 256 : b), formatDate }
    });
    vm.runInContext(fs.readFileSync(codePath, 'utf8'), this.context, { filename: 'Code.gs', timeout: 10000 });
    this.context.setupDatabase(); this.context.setSetting_('sms_enabled', 'false'); this.persist();
    if (this.savedText === undefined) this.savedText = JSON.stringify(this.state);
  }

  validateShape(data) {
    if (!(data?.format === FORMAT || LEGACY_FORMATS.includes(data?.format)) || data.schemaVersion !== 1 || !data.sheets || !data.properties || typeof data.sheets !== 'object' || Array.isArray(data.sheets) || typeof data.properties !== 'object' || Array.isArray(data.properties)) throw new Error('This is not a valid Karvio offline database');
    for (const [name, table] of Object.entries(data.sheets)) {
      if (['__proto__', 'constructor', 'prototype'].includes(name) || !table || !Array.isArray(table.rows) || table.rows.some((row) => !Array.isArray(row) || row.some((v) => v !== null && !['string', 'number', 'boolean'].includes(typeof v)))) throw new Error('The saved database contains an invalid table');
    }
  }

  persist() {
    if (!this.dirty && fs.existsSync(this.file)) return;
    const temp = path.join(this.dataDir, `karvio.${process.pid}.tmp`);
    if (fs.existsSync(this.file)) {
      fs.copyFileSync(this.file, this.previousFile);
      const daily = path.join(this.backupDir, `${formatDate(new Date())}.json`);
      if (!fs.existsSync(daily)) fs.copyFileSync(this.file, daily);
    }
    this.state.savedAt = new Date().toISOString();
    const text = JSON.stringify(this.state);
    const fd = fs.openSync(temp, 'w', 0o600);
    try { fs.writeFileSync(fd, text, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, this.file); this.dirty = false;
    // The saved text is the rollback point, so a request no longer has to copy the whole database first.
    this.savedText = text;
    this.pruneBackups();
  }

  /** Keep the newest DAILY_BACKUPS daily copies (YYYY-MM-DD.json); safety copies made before a restore are kept. */
  pruneBackups() {
    try {
      const daily = fs.readdirSync(this.backupDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
      daily.slice(0, Math.max(0, daily.length - DAILY_BACKUPS)).forEach((f) => fs.rmSync(path.join(this.backupDir, f), { force: true }));
    } catch { /* a backup that cannot be removed now is removed next time */ }
  }

  rollback() { this.state = JSON.parse(this.savedText); this.context._mem = {}; this.dirty = false; }

  execute(request) {
    this.dirty = false;
    try {
      this.context._mem = {};
      const response = JSON.parse(this.context.doPost({ postData: { contents: JSON.stringify(request) } }).getContent());
      if (!response.ok) { if (this.dirty) this.rollback(); else this.context._mem = {}; return response; }
      this.persist(); return response;
    } catch (error) {
      this.rollback();
      return { ok: false, error: `Changes were not saved: ${error.message}` };
    }
  }

  requireAdmin(token) { this.context._mem = {}; const user = this.context.authUser_(token); if (user.role !== 'admin') throw new Error('Only an administrator can manage offline backups'); }
  info(token) { this.requireAdmin(token); return { dataFile: this.file, backupDir: this.backupDir, savedAt: this.state.savedAt, tables: Object.keys(this.state.sheets).length, offline: true }; }
  exportBackup(token, destination) { this.requireAdmin(token); this.persist(); fs.copyFileSync(this.file, destination); return { path: destination }; }
  restoreBackup(token, source) {
    this.requireAdmin(token);
    if (fs.statSync(source).size > 128 * 1024 * 1024) throw new Error('Backup file is too large');
    const next = JSON.parse(fs.readFileSync(source, 'utf8')); this.validateShape(next);
    for (const [name, schema] of Object.entries(this.context.SCHEMA)) {
      const table = next.sheets[name], expected = schema.split(',').map((s) => s.split(':')[0]);
      // InvoiceLinks did not exist in the first offline release; append-only
      // migrations add it and the later valuation columns after restoration.
      if (!table && ['InvoiceLinks', 'Units', 'Repairs'].includes(name)) continue;
      const oldMinimum = { Users: 8, Products: 19, Customers: 8, Suppliers: 8, Purchases: 16,
        Sales: 20, PurchaseItems: 9, SalesReturnItems: 10, PurchaseReturnItems: 9 }[name] || expected.length;
      if (!table?.rows[0] || table.rows[0].length < oldMinimum || table.rows[0].length > expected.length || table.rows[0].some((key, i) => key !== expected[i])) throw new Error(`Invalid backup table: ${name}`);
    }
    const users = next.sheets.Users.rows, headers = users[0];
    if (!users.slice(1).some((u) => u[headers.indexOf('role')] === 'admin' && [true, 'true', 'TRUE'].includes(u[headers.indexOf('active')]))) throw new Error('Backup must contain an active administrator');
    const safety = path.join(this.backupDir, `before-restore-${Date.now()}.json`);
    fs.copyFileSync(this.file, safety);
    const previous = this.state;
    try { this.state = clone(next); this.state.format = FORMAT; this.context._mem = {}; this.context.setupDatabase(); this.context.setSetting_('sms_enabled', 'false'); this.dirty = true; this.persist(); this.cache.clear(); }
    catch (error) { this.state = previous; this.context._mem = {}; this.dirty = false; throw error; }
    return { safetyBackup: safety };
  }
}
module.exports = { OfflineRuntime, FORMAT, LEGACY_FORMATS };
