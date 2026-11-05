import { useStore } from './store';

export const cur = () => useStore.getState().settings.currency || 'Tk';

export function money(n, withCur = true) {
  const v = Number(n) || 0;
  const s = v.toLocaleString('en-IN', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return withCur ? `${cur()} ${s}` : s;
}
export function qty(n, unit) {
  const v = Number(n) || 0;
  const s = v.toLocaleString('en-IN', { maximumFractionDigits: 3 });
  return unit && unit !== 'pcs' ? `${s} ${unit === 'meter' ? 'm' : 'ft'}` : s;
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
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
export function monthStart() { return today().slice(0, 8) + '01'; }

export const unitLabel = (u) => (u === 'meter' ? 'meter' : u === 'feet' ? 'feet' : 'pcs');
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const splitList = (s, sep = ',') => String(s || '').split(sep).map((x) => x.trim()).filter(Boolean);
