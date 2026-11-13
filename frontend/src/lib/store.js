import { create } from 'zustand';
import { api, getToken, setToken, onAuthExpired } from './api';

const localYmd = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5);
/** The shop's date (server time zone) n days from today, as yyyy-mm-dd — use this instead of the browser clock. */
export function shopDay(n = 0) {
  const { clockShift, dayOffset } = useStore.getState();
  // Shop wall clock = this computer's clock + the shift measured at sign-in, so midnight follows the shop's time zone.
  if (Number.isFinite(clockShift)) return new Date(Date.now() + clockShift + n * 864e5).toISOString().slice(0, 10);
  const d = new Date(); d.setDate(d.getDate() + n + (dayOffset || 0));
  return localYmd(d);
}
/** Milliseconds to add to Date.now() to read the shop's wall clock (serverTime is shop-local, without an offset). */
const clockShiftFrom = (serverTime) => {
  const t = Date.parse(String(serverTime || '').slice(0, 19) + 'Z');
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(String(serverTime || '')) && Number.isFinite(t) ? t - Date.now() : null;
};

const loadTheme = () => { try { return localStorage.getItem('erp_theme') || 'dark'; } catch { return 'dark'; } };

export const useStore = create((set, get) => ({
  theme: loadTheme(),
  token: getToken(),
  user: null,
  perms: [],
  permLabels: {},
  settings: {},
  accounts: [],
  categories: [],
  brands: [],
  warrantyPeriods: [],
  units: [],
  products: [],
  customers: [],
  suppliers: [],
  booting: false,
  bootError: '',
  toasts: [],

  toggleTheme() {
    const t = get().theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('erp_theme', t); } catch {}
    set({ theme: t });
  },

  can(perm) {
    if (Array.isArray(perm)) return perm.every((x) => get().can(x)); // every permission in the list
    const p = get().perms;
    return !perm || p.includes('*') || p.includes(perm);
  },

  async login(username, password) {
    const r = await api('login', { username, password });
    setToken(r.token);
    set({ token: r.token, user: r.user, perms: r.perms });
    await get().boot();
  },
  async logout() {
    try { await api('logout'); } catch {}
    setToken(null);
    set({ token: null, user: null, perms: [] });
  },

  /** Load everything the UI needs in one round-trip. */
  async boot() {
    set({ booting: true, bootError: '' });
    try {
      const d = await api('bootstrap');
      // The shop's date comes from the server (its time zone), not this computer's clock.
      set({ ...d, dayOffset: d.serverToday ? dayDiff(d.serverToday, localYmd(new Date())) : 0, clockShift: d.serverToday && String(d.serverTime || '').slice(0, 10) === d.serverToday ? clockShiftFrom(d.serverTime) : null, booting: false });
    } catch (e) {
      set({ booting: false, bootError: e.message });
      throw e;
    }
  },
  async refresh(...keys) {
    // Light refresh of lists after a write
    const jobs = {
      products: () => api('products.list').then((products) => set({ products })),
      customers: () => api('customers.list').then((c) => set({ customers: c.filter((x) => x.active) })),
      suppliers: () => (get().can('suppliers') || get().can('purchase')) && api('suppliers.list').then((s) => set({ suppliers: s.filter((x) => x.active) })),
      all: () => get().boot()
    };
    await Promise.all((keys.length ? keys : ['all']).map((k) => jobs[k] && jobs[k]()));
  },

  toast(msg, kind = 'ok') {
    const id = Math.random().toString(36).slice(2);
    set({ toasts: [...get().toasts, { id, msg, kind }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), kind === 'err' ? 6000 : 3200);
  }
}));

// signed out by the server (session expired, account disabled, outside working hours): keep the reason for the sign-in page
onAuthExpired((reason) => useStore.setState({ token: null, user: null, perms: [], authNote: reason || '' }));
