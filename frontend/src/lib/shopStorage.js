import { endpoint } from './api';
import { useStore } from './store';
export function shopStorageKey(kind) {
  const id = useStore.getState().user?.id;
  return id ? `${kind}:${encodeURIComponent(endpoint())}:${encodeURIComponent(id)}` : null;
}
const resetKey = () => `erp_drafts_reset:${encodeURIComponent(endpoint())}`;
export function onShopDraftsCleared(callback) {
  const onStorage = (event) => { if (event.key === resetKey() || event.key === null) callback(); };
  const onLocal = (event) => { if (event.detail?.endpoint === endpoint()) callback(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener('karvio:drafts-cleared', onLocal);
  return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('karvio:drafts-cleared', onLocal); };
}
// A reset/restore invalidates every user's product references for this shop only.
export function clearShopDrafts() {
  try {
  const prefixes = ['erp_pos_draft', 'erp_quotes', 'erp_pos_holds', 'erp_stock_count'].map((kind) => `${kind}:${encodeURIComponent(endpoint())}:`);
  const keys = Array.from({length: localStorage.length}, (_, i) => localStorage.key(i));
  keys.forEach((key) => {
    if (key === 'erp_pos_draft' || key === 'erp_quotes' || key === 'erp_pos_holds' || key === 'karvio_stock_count' || prefixes.some((p) => key?.startsWith(p))) localStorage.removeItem(key);
  });
  // Other open tabs must drop their in-memory carts/counts too, or they can save stale drafts again.
  localStorage.setItem(resetKey(), `${Date.now()}:${Math.random()}`);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('karvio:drafts-cleared', {detail:{endpoint:endpoint()}}));
  return true;
  } catch { return false; }
}
