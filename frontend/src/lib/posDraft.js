import { useStore } from './store';
import { endpoint } from './api';

export function posDraftKey() {
  const user = useStore.getState().user;
  return user?.id ? `erp_pos_draft:${encodeURIComponent(endpoint())}:${encodeURIComponent(user.id)}` : null;
}
export function loadPosDraft() {
  try { const key = posDraftKey(); return key ? JSON.parse(localStorage.getItem(key)) : null; } catch { return null; }
}
export function savePosDraft(draft) {
  const key = posDraftKey();
  if (!key) throw new Error('Sign in before saving a cart');
  localStorage.setItem(key, JSON.stringify(draft));
}

// Held sales: carts put aside so the counter can serve the next customer (this browser, this user).
const holdKey = () => { const k = posDraftKey(); return k ? k.replace('erp_pos_draft:', 'erp_pos_holds:') : null; };
export function loadHolds() {
  try { const k = holdKey(); const v = k ? JSON.parse(localStorage.getItem(k) || '[]') : []; return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveHolds(list) {
  const k = holdKey(); if (!k) throw new Error('Sign in before holding a sale');
  localStorage.setItem(k, JSON.stringify(list.slice(0, 20)));
}
