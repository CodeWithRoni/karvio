import { useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { splitList } from '../lib/format';

/**
 * Pick one customer or supplier by typing part of the name or phone number. Once chosen it shows as a chip
 * (name · phone · `extra`) with a Change button. `allowAll` adds an "All …" choice (value '').
 */
export default function PartyPicker({ kind, value, onChange, extra, allowAll = false, label, autoFocus }) {
  const list = useStore((s) => (kind === 'customer' ? s.customers : s.suppliers)) || [];
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const box = useRef(null);
  const chosen = value ? list.find((p) => p.id === value) : null;
  const who = kind === 'customer' ? 'customer' : 'supplier';
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase(), digits = t.replace(/\D/g, '');
    return list.filter((p) => !t || String(p.name).toLowerCase().includes(t) || (digits.length >= 3 && String(p.phones || '').replace(/\D/g, '').includes(digits))).slice(0, 8);
  }, [list, q]);
  const pick = (p) => { onChange(p ? p.id : ''); setQ(''); setOpen(false); };
  if (chosen || (allowAll && value === '' && !open && !q)) {
    return (
      <div className="party-chip" aria-label={label || `Chosen ${who}`}>
        <span>{chosen ? <><b>{chosen.name}</b>{splitList(chosen.phones || '')[0] && <small> · {splitList(chosen.phones || '')[0]}</small>}</> : <span className="muted">All {who}s</span>}</span>
        {chosen && extra && <small className="party-extra">{extra}</small>}
        <button type="button" className="link" onClick={() => { if (chosen) onChange(''); setOpen(true); setTimeout(() => box.current?.focus(), 0); }}>{chosen ? 'Change' : 'Choose'}</button>
      </div>
    );
  }
  return (
    <div className="party-pick" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <input ref={box} value={q} autoFocus={autoFocus} placeholder={`Search ${who} by name or phone`} aria-label={label || `Search ${who}`}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setAt(0); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(i + 1, hits.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter' && hits[at]) { e.preventDefault(); pick(hits[at]); }
          else if (e.key === 'Escape') setOpen(false);
        }} />
      {open && (
        <div className="party-list" role="listbox">
          {allowAll && <button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(null)}>All {who}s</button>}
          {hits.map((p, i) => (
            <button type="button" role="option" aria-selected={i === at} className={i === at ? 'on' : ''} key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
              <b>{p.name}</b><small>{splitList(p.phones || '')[0] || ''}</small>
            </button>
          ))}
          {!hits.length && <div className="party-none">No {who} matches “{q}”</div>}
        </div>
      )}
    </div>
  );
}
