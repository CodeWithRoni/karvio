// Pure local client regressions: requests are stubs; icon projects are temporary fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');
const React = require('react');
const root = path.join(__dirname, '..');
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };

function client(capability = true) {
  const values = new Map([['erp_token', 'test-session']]);
  const requests = [];
  const probes = [];
  let nextId = 0, responder = () => ({ ok: true, data: { saved: true } });
  const context = {
    module: { exports: {} }, exports: {}, console, Uint8Array,
    crypto: { randomUUID: () => `client-request-${++nextId}` },
    localStorage: { getItem: (k) => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) },
    window: {},
    fetch: async (url, options) => {
      const parsed = JSON.parse(options.body);
      if (parsed.action === 'ping') {
        probes.push({ url, request: parsed });
        if (capability === null) throw Error('Capability discovery unavailable');
        return { json: async () => ({ ok: true, data: capability ? { apiCapabilities: { idempotency: true } } : { version: '1.0.5' } }) };
      }
      requests.push({ url, request: parsed });
      const result = await responder(requests.length);
      return { json: async () => typeof result === 'function' ? result() : result };
    },
    require: () => ({ DEFAULT_API_URL: 'http://local-test.invalid/api' })
  };
  context.exports = context.module.exports;
  const code = esbuild.transformSync(fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8'), { format: 'cjs', loader: 'js' }).code;
  vm.runInNewContext(code, context);
  return { api: context.module.exports, values, requests, probes, context, respond(fn) { responder = fn; } };
}

async function clientChecks() {
  let c = client();
  c.respond((n) => { if (n === 1) throw Error('Reply lost after server commit'); return { ok: true, data: { id: 'saved-once' } }; });
  eq(await c.api.api('purchase.create', { items: [{ qty: 1 }] }), { id: 'saved-once' });
  eq(c.requests.length, 2);
  eq(c.requests[0].request.request_id, c.requests[1].request.request_id);
  eq(c.requests[0].request.payload, c.requests[1].request.payload);

  c = client();
  c.respond(() => { throw Error('Disconnected'); });
  await assert.rejects(c.api.api('sale.create', { amount: 30 }), (e) => e.uncertain === true); checks++;
  const lostId = c.requests[0].request.request_id;
  c.respond(() => ({ ok: true, data: 'replayed' }));
  eq(await c.api.api('sale.create', { amount: 30 }), 'replayed');
  eq(c.requests[2].request.request_id, lostId);
  await c.api.api('sale.create', { amount: 30 });
  assert.notEqual(c.requests[3].request.request_id, lostId); checks++;

  c = client();
  c.respond(() => ({ ok: false, error: 'Recovery must finish', uncertain: true, retryable: true }));
  await assert.rejects(c.api.api('expense.create', { amount: 1 }), (e) => e.uncertain === true); checks++;
  c.respond(() => ({ ok: true, data: true }));
  await c.api.api('expense.create', { amount: 1 });
  eq(c.requests[0].request.request_id, c.requests[1].request.request_id);

  c = client();
  c.respond(() => ({ ok: false, error: 'Invalid quantity' }));
  await assert.rejects(c.api.api('purchase.create', {}), /Invalid quantity/); checks++;
  c.respond(() => ({ ok: true, data: true }));
  await c.api.api('purchase.create', {});
  assert.notEqual(c.requests[0].request.request_id, c.requests[1].request.request_id); checks++;

  c = client();
  c.respond((n) => n === 1 ? () => { throw Error('Truncated JSON'); } : { ok: true, data: 'recovered' });
  eq(await c.api.api('customer.payment', { amount: 9 }, { requestId: 'explicit-request-1' }), 'recovered');
  eq(c.requests.map((r) => r.request.request_id), ['explicit-request-1', 'explicit-request-1']);

  for (const action of ['products.list', 'sms.test']) {
    c = client(); c.respond(() => { throw Error('Disconnected'); });
    await assert.rejects(c.api.api(action)); checks++;
    eq(c.requests.length, 1);
  }

  c = client();
  let reason;
  c.api.onAuthExpired((r) => { reason = r; });
  c.respond(() => ({ ok: false, error: 'AUTH: Password changed, sign in again', auth: true }));
  await assert.rejects(c.api.api('bootstrap'), (e) => e.auth === true); checks++;
  eq(reason, 'Password changed, sign in again');
  eq(c.values.has('erp_token'), false);

  c = client();
  const localCalls = [];
  c.context.window.shopERP = { offline: true, request: async (request) => {
    localCalls.push(request);
    if (localCalls.length === 1) throw Error('IPC reply lost');
    return { ok: true, data: 'local-replay' };
  } };
  eq(await c.api.api('sale.create', { amount: 7 }, { url: 'https://must-not-be-used.invalid' }), 'local-replay');
  eq(localCalls.length, 2);
  eq(localCalls[0].request_id, localCalls[1].request_id);
  eq(c.requests.length, 0);
  eq(c.api.endpoint(), 'offline://local');

  c = client();
  await Promise.all([c.api.api('purchase.create', { qty: 1 }), c.api.api('purchase.create', { qty: 1 })]);
  eq(c.requests[0].request.request_id, c.requests[1].request.request_id);
  eq(c.probes.length, 1);

  for (const capability of [false, null]) {
    c = client(capability);
    c.respond(() => { throw Error('Response lost on old or unknown backend'); });
    await assert.rejects(c.api.api('purchase.create', { qty: 1 }), /Check the invoice or ledger/); checks++;
    eq(c.probes.length, 1);
    eq(c.requests.length, 1); // Never automatically double-post to a backend that ignores IDs.
  }
}

async function componentChecks() {
  let refs = [], refIndex = 0, states = [], stateIndex = 0, effects = [];
  const hooks = {
    ...React,
    useRef(initial) { const i = refIndex++; return refs[i] || (refs[i] = { current: initial }); },
    useState(initial) { const i = stateIndex++; return [i < states.length ? states[i] : (typeof initial === 'function' ? initial() : initial), () => {}]; },
    useEffect(fn) { effects.push(fn); },
    useMemo(fn) { return fn(); },
    useCallback(fn) { return fn; }
  };
  let keyHandler;
  const stub = new Proxy({}, { get: () => () => null });
  function load(relative) {
    const module = { exports: {} };
    const source = esbuild.transformSync(fs.readFileSync(path.join(root, 'src', relative), 'utf8'), { loader: 'jsx', format: 'cjs' }).code;
    vm.runInNewContext(source, { module, exports: module.exports, React, Promise, console,
      window: { addEventListener: (_event, fn) => { keyHandler = fn; }, removeEventListener() {} },
      require: (name) => name === 'react' ? hooks : name.includes('store') ? { useStore: (select) => select({ toast() {} }) } : stub });
    return module.exports;
  }
  const ui = load('components/ui.jsx');
  eq(ui.Btn({ busy: true, disabled: false }).props.disabled, true);
  eq(ui.Btn({ busy: false, disabled: true }).props.disabled, true);
  eq(ui.Btn({ busy: false, disabled: false }).props.disabled, false);
  refs = []; refIndex = 0; stateIndex = 0;
  const [, run] = ui.useAction();
  let release, calls = 0;
  const first = run(() => { calls++; return new Promise((done) => { release = done; }); });
  const second = run(() => { calls++; return Promise.resolve('must not execute'); });
  await Promise.resolve();
  eq(calls, 1);
  release('saved');
  eq(await first, 'saved'); eq(await second, 'saved');
  await run(() => { calls++; }); eq(calls, 2);
  await assert.rejects(run(() => { throw Error('validation'); }), /validation/); checks++;
  await run(() => { calls++; }); eq(calls, 3);

  refs = []; refIndex = 0; effects = [];
  let selectedDate;
  ui.useHotkeys({ F9: () => { selectedDate = 'old'; } }, []);
  effects[0]();
  refIndex = 0;
  ui.useHotkeys({ F9: () => { selectedDate = 'new'; } }, []);
  keyHandler({ key: 'F9', preventDefault() {} });
  eq(selectedDate, 'new');

  refs = []; refIndex = 0; stateIndex = 0;
  states = ['', new Set(), { key: 'invoice_no', dir: 1 }, 0, false];
  const table = load('components/DataTable.jsx').default;
  assert.doesNotThrow(() => table({ columns: [{ key: 'period', label: 'Day' }], rows: [{ period: '2026-11-06' }] })); checks++;
}

function iconChecks() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'karvio-icon-path-'));
  // A space and Bengali path reproduce encoded-URL and Windows-drive failures.
  const project = path.join(temp, 'space বাংলা', 'frontend');
  try {
    fs.mkdirSync(path.join(project, 'scripts'), { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts/native-icons.mjs'), path.join(project, 'scripts/native-icons.mjs'));
    const values = path.join(project, 'android/app/src/main/res/values');
    fs.mkdirSync(values, { recursive: true });
    fs.writeFileSync(path.join(values, 'strings.xml'), '<resources><string name="app_name">Old</string><string name="title_activity_main">Old</string></resources>');
    fs.mkdirSync(path.join(project, 'branding/android/res/mipmap-mdpi'), { recursive: true });
    fs.writeFileSync(path.join(project, 'branding/android/res/mipmap-mdpi/ic_launcher.png'), 'test-icon');
    execFileSync(process.execPath, [path.join(project, 'scripts/native-icons.mjs'), 'android'], { stdio: 'pipe' });
    eq(fs.readFileSync(path.join(project, 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png'), 'utf8'), 'test-icon');
    assert.match(fs.readFileSync(path.join(values, 'strings.xml'), 'utf8'), /<string name="app_name">Karvio<\/string>/); checks++;
    const set = path.join(project, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
    fs.mkdirSync(set, { recursive: true }); fs.writeFileSync(path.join(set, 'old.png'), 'old');
    fs.mkdirSync(path.join(project, 'branding/ios/AppIcon.appiconset'), { recursive: true });
    fs.writeFileSync(path.join(project, 'branding/ios/AppIcon.appiconset/Contents.json'), '{"images":[]}');
    execFileSync(process.execPath, [path.join(project, 'scripts/native-icons.mjs'), 'ios'], { stdio: 'pipe' });
    eq(fs.existsSync(path.join(set, 'old.png')), false);
    eq(fs.readFileSync(path.join(set, 'Contents.json'), 'utf8'), '{"images":[]}');
  } finally {
    const resolved = path.resolve(temp);
    assert(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('karvio-icon-path-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

(async () => { await clientChecks(); await componentChecks(); iconChecks(); console.log(`Frontend reliability: ${checks} checks passed`); })().catch((e) => { console.error(e); process.exitCode = 1; });
