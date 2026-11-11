// Real API-client reloads against the isolated Apps Script harness, plus invoice HTML regressions.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const fixtureFile = path.join(root, '../backend/test/__audit_harness.cjs');
const harness = new Module(fixtureFile, module);
harness.filename = fixtureFile; harness.paths = Module._nodeModulePaths(path.dirname(fixtureFile));
harness._compile(fs.readFileSync(path.join(root, '../backend/test/simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0] + '\nmodule.exports={sandbox,call};', fixtureFile);
const { sandbox, call } = harness.exports;
sandbox.setupDatabase();
let checks = 0;
const equal = (a, b, note) => { assert.deepEqual(a, b, note); checks++; };
const values = new Map();
const storage = { getItem: key => values.get(key) || null, setItem: (key, v) => values.set(key, v), removeItem: key => values.delete(key) };
let lose = false, posts = [], capability = true;
const compiled = esbuild.transformSync(fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8'), { format: 'cjs' }).code;
function client() {
  const c = { module: { exports: {} }, console, crypto: crypto.webcrypto, localStorage: storage, window: {},
    require: () => ({ DEFAULT_API_URL: 'https://isolated-fixture.invalid' }),
    fetch: async (_, options) => {
      const request = JSON.parse(options.body); sandbox._mem = {};
      if (request.action === 'sale.create') posts.push(request);
      const result = JSON.parse(sandbox.doPost({ postData: { contents: options.body } }).getContent());
      if (request.action === 'ping' && !capability) result.data.apiCapabilities = {};
      if (request.action === 'sale.create' && lose) throw Error('Response lost after commit');
      return { json: async () => result };
    } };
  c.exports = c.module.exports; vm.runInNewContext(compiled, c); return c.module.exports;
}
async function retryChecks() {
  let api = client();
  const login = await api.api('login', { username: 'admin', password: 'admin123' }); api.setToken(login.token);
  const boot = await api.api('bootstrap');
  const product = await api.api('product.save', { name: 'Reload service', service: true, sale_price: 100 });
  const payload = { items: [{ product_id: product.id, qty: 1, price: 100 }], payments: [{ account_id: boot.accounts[0].id, amount: 100 }] };
  const count = () => call('sales.list', {}, api.getToken()).data.length;
  lose = true;
  await assert.rejects(api.api('sale.create', payload), e => e.uncertain); checks++;
  equal(count(), 1, 'ambiguous response still commits only once');
  equal(posts[0].request_id, posts[1].request_id, 'automatic retry uses original ID');
  const retained = values.get('erp_pending_writes_v1');
  equal(retained.includes(login.token), false, 'pending state does not store session tokens');
  equal(retained.includes(product.id), false, 'pending state does not store customer/product payload');
  lose = false; api = client(); await api.api('bootstrap');
  await api.api('sale.create', payload);
  equal(count(), 1, 'page reload replay does not create another sale');
  equal(posts[2].request_id, posts[0].request_id, 'reload keeps request identity');
  await api.api('sale.create', payload);
  equal(count(), 2, 'a new confirmed operation can have identical contents');
  assert.notEqual(posts[3].request_id, posts[0].request_id); checks++;

  const next = { ...payload, note: 'Session expires after an uncertain save' };
  lose = true; await assert.rejects(api.api('sale.create', next)); checks++;
  const nextId = posts.at(-1).request_id;
  sandbox.CacheService.getScriptCache().remove('tok_' + api.getToken());
  lose = false; api = client();
  await assert.rejects(api.api('sale.create', next), e => e.auth); checks++;
  const renewed = await api.api('login', { username: 'admin', password: 'admin123' }); api.setToken(renewed.token);
  await api.api('sale.create', next);
  equal(count(), 3, 're-login as the same user replays the original commit');
  equal(posts.at(-1).request_id, nextId, 'retry identity survives session renewal');

  const expiredPayload = { ...payload, note: 'Too old to replay automatically' };
  lose = true; await assert.rejects(api.api('sale.create', expiredPayload)); checks++;
  const saved = JSON.parse(values.get('erp_pending_writes_v1'));
  Object.values(saved).forEach(record => { record.at = Date.now() - 7 * 864e5; });
  storage.setItem('erp_pending_writes_v1', JSON.stringify(saved));
  const before = posts.length; api = client(); lose = false;
  await assert.rejects(api.api('sale.create', expiredPayload), /too old to retry safely/); checks++;
  equal(posts.length, before, 'expired server receipt cannot cause a new charge');

  const oldBackendPayload = { ...payload, note: 'Backend does not support receipts' };
  capability = false; api = client(); lose = true;
  await assert.rejects(api.api('sale.create', oldBackendPayload)); checks++;
  const oldPosts = posts.length; api = client(); lose = false;
  await assert.rejects(api.api('sale.create', oldBackendPayload), /Check the invoice or ledger/); checks++;
  equal(posts.length, oldPosts, 'reload never reposts an uncertain write to an unsupported backend');

  capability = true; api = client();
  const realSet = storage.setItem;
  storage.setItem = (key, v) => { if (key === 'erp_pending_writes_v1') throw Error('Storage unavailable'); realSet(key, v); };
  const storagePosts = posts.length;
  await assert.rejects(api.api('sale.create', { ...payload, note: 'Storage failure' }), /Allow storage/); checks++;
  equal(posts.length, storagePosts, 'cannot send a write whose retry identity cannot be stored');
  storage.setItem = realSet;

  const confirmedPayload = { ...payload, note: 'Cannot persist confirmation' };
  storage.setItem = (key, v) => {
    if (key === 'erp_pending_writes_v1' && Object.keys(JSON.parse(v)).length < Object.keys(JSON.parse(values.get(key) || '{}')).length) throw Error('Confirmation storage failed');
    realSet(key, v);
  };
  await assert.rejects(api.api('sale.create', confirmedPayload), /Save confirmed/); checks++;
  const committed = count();
  storage.setItem = realSet;
  await api.api('sale.create', confirmedPayload);
  equal(count(), committed, 'failed local acknowledgement is safely finished with the original request');
}

function invoiceChecks() {
  const fixture = { sale: { invoice_no: 'TEST', customer_id: 'C', customer_name: 'Customer', total: 100, subtotal: 100, paid: 100, credit_used: 20, due: 0, status: 'active', payments: [{ account_name: 'Cash', amount: 80 }] }, shop: { shop_name: 'Test' }, customer: { phones: '01700000000' }, items: [], returns: [], expires_at: '2026-11-26' };
  const format = { money: n => 'Tk ' + n, splitList: x => String(x).split(','), fdate: x => x, fdatetime: x => x, qty: x => x, today: () => '2026-11-11' };
  let state = 0;
  const hooks = { ...React, useState: () => [state++ === 0 ? fixture : '', () => {}], useEffect: () => {} };
  function load(file, modules) {
    const c = { module: { exports: {} }, React, require: name => { assert.ok(modules[name], name); return modules[name]; } };
    c.exports = c.module.exports;
    vm.runInNewContext(esbuild.transformSync(fs.readFileSync(path.join(root, file), 'utf8'), { format: 'cjs', loader: 'jsx' }).code, c);
    return c.module.exports;
  }
  const publicInvoice = load('src/pages/PublicInvoice.jsx', { react: hooks, '../lib/api': {}, '../lib/store': {}, '../lib/format': { ...format, qty: x => x } });
  const html = renderToStaticMarkup(publicInvoice.default({ token: 'fixture' }));
  equal((/<span>Paid<\/span><span>([^<]+)/.exec(html) || [])[1], 'Tk 100', 'public invoice does not add advance twice');
  const docs = load('src/lib/salesDocs.js', {
    './store': { useStore: { getState: () => ({ settings: { invoice_template: 'business' } }) } },
    './format': format, './export': { esc: x => String(x ?? ''), shopContacts: () => '', printHtml: () => {} }, './purchaseDocs': { pdfPages: () => {} }
  });
  const business = docs.saleDocHtml(fixture);
  equal((/Collected Amount<\/td><td>:<\/td><td class="r">([^<]+)/.exec(business) || [])[1], '100.00', 'business invoice does not add advance twice');
}
retryChecks().then(() => { invoiceChecks(); console.log('Audit client recovery and invoice display: ' + checks + ' checks passed'); }).catch(error => { console.error(error); process.exitCode = 1; });
