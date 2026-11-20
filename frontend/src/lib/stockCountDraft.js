import { shopStorageKey } from './shopStorage';
import { useStore } from './store';
export function stockCountKey() {
  const prefix = shopStorageKey('erp_stock_count');
  return prefix ? prefix + ':' + encodeURIComponent(useStore.getState().branches?.current || '') : null;
}
export function loadStockCount() {
  try { const key = stockCountKey(); return key ? JSON.parse(localStorage.getItem(key) || 'null') : null; } catch { return null; }
}
export function saveStockCount(draft, expectedKey) {
  const key = stockCountKey();
  if (!key) throw new Error('Sign in before saving a stock count');
  if (expectedKey !== undefined && expectedKey !== key) throw new Error('The user, connection or branch changed. Reopen Stock Count before continuing.');
  if (draft) localStorage.setItem(key, JSON.stringify(draft)); else localStorage.removeItem(key);
}
