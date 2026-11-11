// Google Apps Script and the local desktop IPC transport share one envelope.
// Keep a write's ID until a definitive response so a lost reply cannot charge twice.
import { DEFAULT_API_URL } from '../config';

const CFG_KEY = 'erp_api_config';
const TOKEN_KEY = 'erp_token';
export const isOffline = () => Boolean(globalThis.window?.karvio?.offline);
const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

export function getApiConfig() {
  return safe(() => JSON.parse(localStorage.getItem(CFG_KEY)) || {}, {});
}
export function setApiConfig(cfg) { safe(() => localStorage.setItem(CFG_KEY, JSON.stringify(cfg))); }
export function getToken() { return safe(() => localStorage.getItem(TOKEN_KEY), null); }
export function setToken(t) { safe(() => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))); }
export function endpoint(cfg = getApiConfig()) {
  if (isOffline()) return 'offline://local';
  return (cfg.proxyUrl || cfg.scriptUrl || DEFAULT_API_URL || '').trim();
}

let onAuthLost = () => {};
export function onAuthExpired(fn) { onAuthLost = fn; }
export class ApiError extends Error {
  constructor(msg, auth, uncertain = false) { super(msg); this.auth = auth; this.uncertain = uncertain; }
}

const WRITES = new Set([
  'password.change', 'product.save', 'product.delete', 'product.barcodes', 'sale.promise',
  'stock.adjust', 'master.save', 'master.delete', 'master.deleteMany', 'master.import', 'price.update',
  'customer.save', 'customer.quickAdd', 'customer.delete', 'customer.payment',
  'supplier.save', 'supplier.delete', 'supplier.payment', 'account.save', 'account.entry',
  'purchase.create', 'preturn.create', 'sale.create', 'sreturn.create', 'expense.create',
  'expense.categories', 'reverse', 'claim.create', 'claim.update', 'claim.restock', 'repair.save', 'repair.status', 'repair.deliver', 'repair.cancel', 'user.save',
  'rolePerms.save', 'settings.save', 'sale.link'
]);
const pendingWrites = new Map();
const PENDING_KEY = 'erp_pending_writes_v1';
const PRINCIPALS_KEY = 'erp_replay_users_v1';
// Server receipts live for seven days. Stop before that boundary rather than risk a new charge.
const REPLAY_MAX_AGE = 6 * 864e5;
const stored = (key) => safe(() => { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }, {});
function fingerprint(text) {
  // An opaque lookup key, not a password hash. Never persist the payload or session token.
  let a = 2166136261, b = 3339675911;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 2246822519);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
function savePending(key, record) {
  const all = stored(PENDING_KEY);
  if (record) all[key] = record; else delete all[key];
  // A write must not be sent if its retry identity cannot survive a reload.
  localStorage.setItem(PENDING_KEY, JSON.stringify(all));
}
const endpointCapabilities = new Map();
const capabilityProbes = new Map();
let fallbackCounter = 0;
export function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `req-${Date.now().toString(36)}-${(++fallbackCounter).toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function api(action, payload = {}, { url, requestId } = {}) {
  const offline = isOffline(), target = offline ? endpoint() : (url || endpoint());
  if (!target) throw new ApiError('API URL is not configured. Open Settings → API connection.');
  const token = getToken(), write = WRITES.has(action);
  if (write && !offline && !endpointCapabilities.has(target)) {
    // A user may upload the frontend before the backend. Old backends ignore IDs,
    // so discover support with a read-only ping before allowing automatic retries.
    let probe = capabilityProbes.get(target);
    if (!probe) {
      probe = api('ping', {}, { url: target }).catch(() => {}).finally(() => capabilityProbes.delete(target));
      capabilityProbes.set(target, probe);
    }
    await probe;
  }
  const canReplay = offline || endpointCapabilities.get(target) === true;
  const principal = stored(PRINCIPALS_KEY)[fingerprint(target)] || token;
  const key = write ? fingerprint(JSON.stringify([target, principal, action, payload])) : '';
  const prior = write && (pendingWrites.get(key) || stored(PENDING_KEY)[key]);
  if (prior && !requestId && !canReplay) {
    throw new ApiError('Could not confirm the earlier server result. Check the invoice or ledger before trying again; this backend has not confirmed safe retry support.', false, true);
  }
  if (prior && !requestId && (!prior.at || Date.now() - prior.at >= REPLAY_MAX_AGE)) {
    throw new ApiError('An earlier save is still unconfirmed and is too old to retry safely. Check the invoice or ledger with an administrator before starting a new operation.', false, true);
  }
  const id = requestId || (prior && prior.id) || newRequestId();
  if (write) {
    const record = { id, at: prior && prior.id === id ? prior.at : Date.now() };
    try { savePending(key, record); } catch { throw new ApiError('Allow storage on this device before saving, so an interrupted save can be retried safely.'); }
    pendingWrites.set(key, record);
  }
  const request = { action, payload, token, request_id: id };
  const encoded = JSON.stringify(request);
  let body, uncertainError;
  // Only idempotent writes get one transport retry. SMS test sends are never retried.
  for (let attempt = 0; attempt < (write && canReplay ? 2 : 1); attempt++) {
    try {
      if (offline) body = await window.karvio.request(request);
      else {
        const res = await fetch(target, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: encoded, redirect: 'follow'
        });
        body = await res.json();
      }
      if (!body || typeof body.ok !== 'boolean') throw new Error('Invalid API response');
      uncertainError = null;
      break;
    } catch {
      uncertainError = new ApiError(offline
        ? 'Could not confirm the local result. Retry the same action or reopen Karvio.'
        : write && !canReplay
          ? 'Could not confirm the server result. Check the invoice or ledger before trying again; this backend has not confirmed safe retry support.'
          : 'Could not confirm the server result. Check your connection, then retry the same action.', false, write);
    }
  }
  if (uncertainError) throw uncertainError;
  if (write && !body.auth && !body.uncertain && !body.retryable && pendingWrites.get(key)?.id === id) {
    try { savePending(key, null); pendingWrites.delete(key); }
    catch {
      // Keep the cart/operation unresolved instead of silently reusing its ID for a later sale.
      if (body.ok) throw new ApiError('Save confirmed, but this device could not record the confirmation. Allow storage, then retry the same action to finish safely.', false, true);
    }
  }
  if (!body.ok) {
    const message = String(body.error || 'Unknown error').replace(/^AUTH:\s*/, '');
    if (body.auth) { setToken(null); onAuthLost(message); }
    throw new ApiError(message, body.auth, Boolean(body.uncertain || body.retryable));
  }
  if (!offline && (action === 'ping' || action === 'bootstrap')) endpointCapabilities.set(target, body.data?.apiCapabilities?.idempotency === true);
  if ((action === 'login' || action === 'bootstrap') && body.data?.user?.id) {
    const users = stored(PRINCIPALS_KEY);
    users[fingerprint(target)] = body.data.user.id;
    safe(() => localStorage.setItem(PRINCIPALS_KEY, JSON.stringify(users)));
  }
  return body.data;
}

export async function testConnection(url) { return api('ping', {}, { url }); }
