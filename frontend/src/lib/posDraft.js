import { useStore } from './store';
import { endpoint } from './api';

// One cart per branch: a cart started in one branch stays there (its stock and prices belong to that branch).
const branchNow = () => useStore.getState().branches?.current || '';
const baseKey = () => { const user = useStore.getState().user; return user?.id ? `erp_pos_draft:${encodeURIComponent(endpoint())}:${encodeURIComponent(user.id)}` : null; };
export function posDraftKey() {
  const base = baseKey(), b = branchNow();
  return base ? (b ? `${base}:${encodeURIComponent(b)}` : base) : null;
}
export function loadPosDraft() {
  try {
    const key = posDraftKey(); if (!key) return null;
    const own = localStorage.getItem(key);
    if (own !== null) return JSON.parse(own);
    // a cart saved before carts were kept per branch: it opens once, in the branch you are in, then moves there
    const base = baseKey();
    if (base !== key && localStorage.getItem(base) !== null) {
      const old = localStorage.getItem(base); localStorage.setItem(key, old); localStorage.removeItem(base);
      const oldHolds = localStorage.getItem(base.replace('erp_pos_draft:', 'erp_pos_holds:'));
      if (oldHolds !== null) { localStorage.setItem(key.replace('erp_pos_draft:', 'erp_pos_holds:'), oldHolds); localStorage.removeItem(base.replace('erp_pos_draft:', 'erp_pos_holds:')); }
      return JSON.parse(old);
    }
    return null;
  } catch { return null; }
}
/** key: the cart's own key, taken when the POS opened — so a cart is never written into the branch switched to. */
export function savePosDraft(draft, key = posDraftKey()) {
  if (!key) throw new Error('Sign in before saving a cart');
  localStorage.setItem(key, JSON.stringify(draft));
}

// Held sales: carts put aside so the counter can serve the next customer (this browser, this user).
const holdKey = (draftKey = posDraftKey()) => (draftKey ? draftKey.replace('erp_pos_draft:', 'erp_pos_holds:') : null);
export function loadHolds() {
  try { const k = holdKey(); const v = k ? JSON.parse(localStorage.getItem(k) || '[]') : []; return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveHolds(list, draftKey) {
  const k = holdKey(draftKey); if (!k) throw new Error('Sign in before holding a sale');
  localStorage.setItem(k, JSON.stringify(list.slice(0, 20)));
}
