// API client for the Google Apps Script Web App.
// The URL lives in localStorage so it can be changed from Settings without rebuilding.
// Requests are sent as text/plain — that avoids a CORS preflight, which Apps Script cannot answer.

const CFG_KEY = 'erp_api_config';
const TOKEN_KEY = 'erp_token';

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

export function getApiConfig() {
  return safe(() => JSON.parse(localStorage.getItem(CFG_KEY)) || {}, {});
}
export function setApiConfig(cfg) {
  safe(() => localStorage.setItem(CFG_KEY, JSON.stringify(cfg)));
}
export function getToken() { return safe(() => localStorage.getItem(TOKEN_KEY), null); }
export function setToken(t) { safe(() => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))); }

/** Proxy domain (optional) wins over the raw script URL. */
export function endpoint(cfg = getApiConfig()) {
  return (cfg.proxyUrl || cfg.scriptUrl || '').trim();
}

let onAuthLost = () => {};
export function onAuthExpired(fn) { onAuthLost = fn; }

export class ApiError extends Error {
  constructor(msg, auth) { super(msg); this.auth = auth; }
}

export async function api(action, payload = {}, { url } = {}) {
  const target = url || endpoint();
  if (!target) throw new ApiError('API URL is not configured. Open Settings → API connection.');
  let res;
  try {
    res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload, token: getToken() }),
      redirect: 'follow'
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your internet connection and the API URL.');
  }
  let body;
  try { body = await res.json(); } catch {
    throw new ApiError('The server did not return JSON. Make sure the Web App is deployed with access set to "Anyone".');
  }
  if (!body.ok) {
    if (body.auth) { setToken(null); onAuthLost(); }
    throw new ApiError(String(body.error || 'Unknown error').replace(/^AUTH:\s*/, ''), body.auth);
  }
  return body.data;
}

export async function testConnection(url) {
  return api('ping', {}, { url });
}
