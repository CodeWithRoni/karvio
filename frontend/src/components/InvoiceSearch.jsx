// POS: a separate invoice search box left of the product search. Clicking it lists every invoice (newest first);
// typing an invoice number (or customer name / phone) narrows the list; picking one opens it in the POS for editing.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { money, fdate } from '../lib/format';

const SHOW = 300; // rows drawn at once; typing narrows the rest

export default function InvoiceSearch({ onPick, current }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [state, setState] = useState(null);
  const ref = useRef(), listRef = useRef();
  // Every active invoice, loaded each time the box opens (so new sales appear).
  useEffect(() => {
    if (!open) return;
    let live = true;
    setState((s) => (s?.rows ? { ...s, refreshing: true } : { loading: true }));
    api('sales.list', { status: 'active' })
      .then((rows) => live && setState({ rows: Array.isArray(rows) ? rows : rows?.rows || [] }), (e) => live && setState({ error: e.message }));
    return () => { live = false; };
  }, [open]);
  const list = useMemo(() => {
    const rows = state?.rows || [], words = q.toLowerCase().split(/\s+/).filter(Boolean), digits = q.replace(/\D/g, '');
    if (!words.length) return rows;
    return rows.filter((r) => {
      const hay = `${r.invoice_no} ${r.customer_name || ''} ${r.user_name || ''}`.toLowerCase();
      return words.every((w) => hay.includes(w)) || (digits.length >= 3 && String(r.invoice_no).replace(/\D/g, '').includes(digits));
    });
  }, [state, q]);
  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector('li.hi')?.scrollIntoView({ block: 'nearest' }); }, [hi]);
  const pick = (r) => { setOpen(false); setQ(''); ref.current?.blur(); onPick(r); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, Math.min(list.length, SHOW) - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (list[hi]) pick(list[hi]); }
    else if (e.key === 'Escape') { setOpen(false); setQ(''); ref.current?.blur(); }
  };
  return (
    <div className={`inv-search ${current ? 'editing' : ''}`}>
      <span className="inv-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6M9 13h8M9 17h5" /></svg></span>
      <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onMouseDown={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey} autoComplete="off"
        placeholder={current ? `✎ ${current}` : 'Search invoice'} aria-label="Search invoice" role="combobox" aria-expanded={open} title={current ? `Editing ${current}. Search to open another invoice` : 'Find an invoice by number or customer to edit it here'} />
      {open && (
        <div className="ri" role="dialog" aria-label="Invoices">
          <div className="ri-head"><b>{q ? `${list.length} matching invoice${list.length === 1 ? '' : 's'}` : `All invoices${state?.rows ? ` (${state.rows.length})` : ''}`}</b><small>Pick one to edit it here</small></div>
          {state?.loading ? <div className="ri-msg">Loading invoices…</div> : state?.error ? <div className="ri-msg bad">{state.error}</div> : !list.length ? <div className="ri-msg">{q ? `No invoice matches “${q}”` : 'No invoices yet.'}</div> : (
            <ul ref={listRef} className="ri-list" role="listbox" aria-label="Invoices">
              {list.slice(0, SHOW).map((r, i) => (
                <li key={r.id} role="option" aria-selected={i === hi} className={`${i === hi ? 'hi' : ''} ${r.invoice_no === current ? 'on' : ''}`}
                  onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(r); }}>
                  <span className="ri-no">{r.invoice_no}</span>
                  <span className="ri-who"><b>{r.customer_name || 'Cash sale'}</b><small>{fdate(r.date)}{r.created_at ? ` · ${String(r.created_at).slice(11, 16)}` : ''}{r.user_name ? ` · ${r.user_name}` : ''}</small></span>
                  <span className="ri-amt"><b>{money(r.total, false)}</b>{r.due_now > 0.004 ? <small className="due">Due {money(r.due_now, false)}</small> : <small>Paid</small>}</span>
                </li>
              ))}
              {list.length > SHOW && <li className="ri-more">{list.length - SHOW} more — type the invoice number to find older ones</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
