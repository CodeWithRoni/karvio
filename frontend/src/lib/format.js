import { useStore, shopDay } from './store';

export const cur = () => useStore.getState().settings.currency || 'Tk';

export function money(n, withCur = true) {
  const v = Number(n) || 0;
  const s = v.toLocaleString('en-IN', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return withCur ? `${cur()} ${s}` : s;
}
const SHORT = { meter: 'm', feet: 'ft' };
/** Units such as meter / feet allow 1.5; pcs, box, set need whole numbers. */
export function isDecimalUnit(code) {
  const u = useStore.getState().units.find((x) => x.name === code);
  return u ? !!u.decimal : !!code && code !== 'pcs';
}
export function qty(n, unit) {
  const v = Number(n) || 0;
  const s = v.toLocaleString('en-IN', { maximumFractionDigits: 4 });
  return unit && unit !== 'pcs' ? `${s} ${SHORT[unit] || unit}` : s;
}
export function fdate(d) {
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  if (!day) return d;
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1];
  return `${Number(day)} ${mon} ${y}`;
}
export function fdatetime(ts) {
  if (!ts) return '';
  const t = String(ts).slice(11, 16);
  return `${fdate(ts)}${t ? ', ' + t : ''}`;
}
export function today() {
  return shopDay();
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
export function monthStart() { return today().slice(0, 8) + '01'; }

export const unitLabel = (u) => u || 'pcs';
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const splitList = (s, sep = ',') => String(s || '').split(sep).map((x) => x.trim()).filter(Boolean);
