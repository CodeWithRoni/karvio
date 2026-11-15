import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fdate } from '../lib/format';
import { shopDay } from '../lib/store';

/**
 * Date field that always reads "15 Nov 2026", whatever the computer's language is.
 * Value in and out stays yyyy-mm-dd, and onChange gets { target: { value } } like a native input,
 * so it drops in for <input type="date">. Typing works too: 15/11/2026, 15-11-2026, 15 Nov 2026, 2026-11-15.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const valid = (y, m, d) => y >= 1900 && y <= 2999 && m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m);
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** Read what the person typed; returns yyyy-mm-dd or '' when it is not a whole date. */
export function parseDate(text, year = Number(shopDay().slice(0, 4))) {
  const t = String(text || '').trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]) ? ymd(+m[1], +m[2], +m[3]) : '';
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (m) { const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : year; return valid(y, +m[2], +m[1]) ? ymd(y, +m[2], +m[1]) : ''; }
  m = t.match(/^(\d{1,2})[ -]?([a-z]{3,9})\.?(?:[ -]?(\d{4}))?$/);
  if (m) {
    const mi = LONG.findIndex((x) => x.toLowerCase().startsWith(m[2]) && m[2].length >= 3);
    const y = m[3] ? +m[3] : year;
    return mi >= 0 && valid(y, mi + 1, +m[1]) ? ymd(y, mi + 1, +m[1]) : '';
  }
  return '';
}

const inRange = (iso, min, max) => !!iso && (!min || iso >= min) && (!max || iso <= max);

export default function DateInput({ value = '', onChange, min, max, required, disabled, className = '', style, placeholder = 'dd Mon yyyy', ...rest }) {
  const [text, setText] = useState(fdate(value));
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => (value || shopDay()).slice(0, 7));
  const [pos, setPos] = useState(null);
  const box = useRef(null), pop = useRef(null), input = useRef(null);
  useEffect(() => { if (!editing) setText(fdate(value)); }, [value, editing]);
  const emit = (v) => onChange && onChange({ target: { value: v }, currentTarget: { value: v } });
  const pick = (iso) => { if (!inRange(iso, min, max)) return; emit(iso); setText(fdate(iso)); setOpen(false); input.current?.focus(); };

  const show = () => { if (disabled) return; setView((value || (max && max < shopDay() ? max : shopDay())).slice(0, 7)); setOpen(true); };
  // Calendar sits in <body> so modals and scrolling tables never clip it; it follows the field.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const r = box.current?.getBoundingClientRect(); if (!r) return;
      const h = pop.current?.offsetHeight || 330, w = 292;
      const below = window.innerHeight - r.bottom > h + 8 || r.top < h + 8;
      setPos({ top: below ? r.bottom + 6 : r.top - h - 6, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) });
    };
    place();
    const away = (e) => { if (!box.current?.contains(e.target) && !pop.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place); document.addEventListener('mousedown', away);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); document.removeEventListener('mousedown', away); };
  }, [open]);

  // While typing, only a whole date with a 4-digit year is applied (so "1/1" on the way to "15/11/2026"
  // never reloads a list). Anything shorter is read when the field is left or Enter is pressed.
  const whole = (t) => /^\d{4}-\d{1,2}-\d{1,2}$/.test(t.trim()) || /\d{4}$/.test(t.trim());
  const commit = (t) => {
    if (!t.trim()) { if (!required && value) emit(''); setText(''); return; }
    const iso = parseDate(t);
    if (iso && inRange(iso, min, max)) { if (iso !== value) emit(iso); setText(fdate(iso)); setView(iso.slice(0, 7)); } else setText(fdate(value));
  };
  const type = (e) => {
    const t = e.target.value; setText(t);
    if (!whole(t)) return;
    const iso = parseDate(t);
    if (iso && inRange(iso, min, max) && iso !== value) { emit(iso); setView(iso.slice(0, 7)); }
  };
  const leave = () => { setEditing(false); commit(text); };
  const key = (e) => {
    if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); return; }
    // Enter with a typed but not yet applied date: apply it first (a second Enter submits the form).
    if (e.key === 'Enter' && text.trim() && text !== fdate(value)) { e.preventDefault(); commit(text); setOpen(false); return; }
    if ((e.key === 'ArrowDown' && e.altKey) || (e.key === 'Enter' && !open && !text.trim())) { e.preventDefault(); show(); return; }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && value) {
      e.preventDefault(); const iso = addDays(value, e.key === 'ArrowUp' ? 1 : -1);
      if (inRange(iso, min, max)) { emit(iso); setText(fdate(iso)); setView(iso.slice(0, 7)); }
    }
  };

  const [vy, vm] = view.split('-').map(Number);
  const first = new Date(Date.UTC(vy, vm - 1, 1)).getUTCDay(), n = daysIn(vy, vm), today = shopDay();
  const step = (k) => { const d = new Date(Date.UTC(vy, vm - 1 + k, 1)); setView(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`); };

  return (
    <span className={`dinput ${className}`} style={style} ref={box}>
      <input {...rest} ref={input} type="text" inputMode="text" autoComplete="off" value={text} placeholder={placeholder} disabled={disabled} required={required}
        onChange={type} onFocus={() => setEditing(true)} onBlur={leave} onKeyDown={key} onClick={() => !open && show()} />
      <button type="button" className="dinput-btn" tabIndex={-1} disabled={disabled} aria-label="Open calendar" onClick={(e) => { e.preventDefault(); open ? setOpen(false) : show(); }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
      </button>
      {open && createPortal(
        <div className="dcal" ref={pop} role="dialog" aria-label="Choose a date" style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }} onMouseDown={(e) => e.preventDefault()}>
          <div className="dcal-head">
            <button type="button" onClick={() => step(-1)} aria-label="Previous month">‹</button>
            <b>{LONG[vm - 1]} {vy}</b>
            <button type="button" onClick={() => step(1)} aria-label="Next month">›</button>
          </div>
          <div className="dcal-grid">
            {WEEK.map((w) => <span key={w} className="dcal-wd">{w}</span>)}
            {Array.from({ length: first }, (_, i) => <span key={'b' + i} />)}
            {Array.from({ length: n }, (_, i) => {
              const iso = ymd(vy, vm, i + 1), ok = inRange(iso, min, max);
              return <button type="button" key={iso} disabled={!ok} onClick={() => pick(iso)} aria-label={fdate(iso)} aria-pressed={iso === value}
                className={`${iso === value ? 'on' : ''} ${iso === today ? 'now' : ''}`}>{i + 1}</button>;
            })}
          </div>
          <div className="dcal-foot">
            {inRange(addDays(today, -1), min, max) && <button type="button" className="btn btn-sm" onClick={() => pick(addDays(today, -1))}>Yesterday</button>}
            {!required && value && <button type="button" className="btn btn-sm" onClick={() => { emit(''); setText(''); setOpen(false); }}>Clear</button>}
            <span className="spacer" />
            {inRange(today, min, max) && <button type="button" className="btn btn-sm btn-primary" onClick={() => pick(today)}>Today</button>}
          </div>
        </div>, document.body)}
    </span>
  );
}

export { MONTHS };
