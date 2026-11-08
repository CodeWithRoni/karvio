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
  'stock.adjust', 'master.save', 'master.delete', 'master.import', 'price.update',
  'customer.save', 'customer.quickAdd', 'customer.delete', 'customer.payment',
  'supplier.save', 'supplier.delete', 'supplier.payment', 'account.save', 'account.entry',
  'purchase.create', 'preturn.create', 'sale.create', 'sreturn.create', 'expense.create',
  'expense.categories', 'reverse', 'claim.create', 'claim.update', 'claim.restock', 'repair.save', 'repair.status', 'repair.deliver', 'repair.cancel', 'user.save',
  'rolePerms.save', 'settings.save', 'sale.link'
]);
const pendingWrites = new Map();
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
  const key = write ? JSON.stringify([target, token, action, payload]) : '';
  const id = requestId || (write && pendingWrites.get(key)) || newRequestId();
  if (write) pendingWrites.set(key, id);
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
  if (write && !body.uncertain && !body.retryable && pendingWrites.get(key) === id) pendingWrites.delete(key);
  if (!body.ok) {
    const message = String(body.error || 'Unknown error').replace(/^AUTH:\s*/, '');
    if (body.auth) { setToken(null); onAuthLost(message); }
    throw new ApiError(message, body.auth, Boolean(body.uncertain || body.retryable));
  }
  if (!offline && (action === 'ping' || action === 'bootstrap')) endpointCapabilities.set(target, body.data?.apiCapabilities?.idempotency === true);
  return body.data;
}

export async function testConnection(url) { return api('ping', {}, { url }); }
