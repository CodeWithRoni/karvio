/**
 * Offline simulation of the Apps Script backend.
 * Mocks SpreadsheetApp / CacheService / LockService / UrlFetchApp etc. in memory and
 * runs a full business scenario against Code.gs.
 *
 *   node backend/test/server.js  (local dev server)
 */
process.env.TZ = 'Asia/Dhaka';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

/* ---------------- in-memory Google mocks ---------------- */
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const v = (this.sh.rows[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; }
  setValues(vals) { vals.forEach((rowVals, i) => { const ri = this.r - 1 + i; while (this.sh.rows.length <= ri) this.sh.rows.push([]); rowVals.forEach((v, j) => { this.sh.rows[ri][this.c - 1 + j] = v; }); }); return this; }
  setValue(v) { return this.setValues([[v]]); }
}
const rangeProxy = (rg) => new Proxy(rg, { get: (t, k) => (k in t ? t[k] : () => rangeProxy(t)) });
class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  getRange(r, c, nr = 1, nc = 1) { return rangeProxy(new Range(this, r, c, nr, nc)); }
  getLastRow() { let last = 0; this.rows.forEach((row, i) => { if (row.some((v) => v !== '' && v !== undefined)) last = i + 1; }); return last; }
  getMaxRows() { return 1000; }
  setFrozenRows() {}
  appendRow(arr) { this.rows[this.getLastRow()] = arr.slice(); }
  deleteRow(n) { this.rows.splice(n - 1, 1); }
}
const book = { sheets: {}, copies: [], copy(name) { this.copies.push(name); return { getName: () => name, getUrl: () => 'https://docs.google.com/spreadsheets/d/LOCAL-COPY' }; }, getId: () => 'SHEET1', getSheetByName(n) { return this.sheets[n] || null; }, insertSheet(n) { return (this.sheets[n] = new Sheet(n)); }, getSheets() { return Object.values(this.sheets); }, deleteSheet() {}, setSpreadsheetTimeZone() {} };
const props = {}, cacheStore = new Map(), fetchLog = [];
const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, isFinite, parseInt, parseFloat, encodeURIComponent, RegExp, Error, Boolean,
  SpreadsheetApp: { getActiveSpreadsheet: () => book, openById: () => book, getUi: () => { throw new Error('no ui'); } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cacheStore.get(k) || null, put: (k, v) => cacheStore.set(k, v), remove: (k) => cacheStore.delete(k) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Session: { getScriptTimeZone: () => 'Asia/Dhaka' },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; }, getContent() { return this.s; } }) },
  UrlFetchApp: { fetch: (url, opt) => { fetchLog.push({ url, opt }); return { getResponseCode: () => 200, getContentText: () => '{"response_code":202}' }; } },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(String(s)).digest()).map((b) => (b > 127 ? b - 256 : b)),
    formatDate: (d, tz, fmt) => {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
      const day = `${p.year}-${p.month}-${p.day}`;
      return fmt === 'yyyy-MM-dd' ? day : `${day}T${p.hour}:${p.minute}:${p.second}`;
    }
  }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), sandbox, { filename: 'Code.gs' });

/* ---------------- local HTTP server: POST / behaves like the deployed Web App ---------------- */
sandbox.setupDatabase();
const http = require('http');
const PORT = Number(process.env.PORT || 8787);
http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  // test helper: what the mock SMS gateway was asked to send
  if (req.method === 'GET' && req.url === '/__fetchlog') { res.writeHead(200, cors); return res.end(JSON.stringify(fetchLog.slice(-20))); }
  if (req.method !== 'POST') { res.writeHead(200, cors); return res.end(sandbox.doGet().getContent()); }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    vm.runInContext('_mem = {}', sandbox);
    const out = sandbox.doPost({ postData: { contents: body } });
    res.writeHead(200, cors); res.end(out.getContent());
  });
}).listen(PORT, () => console.log(`Mock ShopERP API on http://localhost:${PORT}  (admin / admin123, data kept in memory)`));
