import { endpoint } from './api';
import { useStore } from './store';
export function shopStorageKey(kind) {
  const id = useStore.getState().user?.id;
  return id ? `${kind}:${encodeURIComponent(endpoint())}:${encodeURIComponent(id)}` : null;
}
// A reset/restore invalidates every user's product references for this shop only.
export function clearShopDrafts() {
  try {
  const prefixes = ['erp_pos_draft', 'erp_quotes'].map((kind) => `${kind}:${encodeURIComponent(endpoint())}:`);
  const keys = Array.from({length: localStorage.length}, (_, i) => localStorage.key(i));
  keys.forEach((key) => {
    if (key === 'erp_pos_draft' || key === 'erp_quotes' || prefixes.some((p) => key?.startsWith(p))) localStorage.removeItem(key);
  });
  return true;
  } catch { return false; }
}
