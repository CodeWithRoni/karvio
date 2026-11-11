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
