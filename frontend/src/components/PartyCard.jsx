// A small card about one customer or supplier: since when, how many invoices, what they bought (or sold us),
// how much of it is paid, and the due or advance. Shown when hovering a chosen customer (POS) or supplier
// (Purchase), and at the top of the Individual report.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { money, fdate } from '../lib/format';

const cache = new Map(); // party → { at, data }: a hover again within 20 s shows the same figures without a new call
const FRESH = 20000;

export function loadPartyCard(kind, id, force = false) {
  const key = `${kind}:${id}`, hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < FRESH) return Promise.resolve(hit.data);
  return api('party.card', { kind, id }).then((data) => { cache.set(key, { at: Date.now(), data }); return data; });
}

function Ring({ pct, tone, label }) {
  const r = 26, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <svg className="pc-ring" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r={r} className="pc-ring-bg" />
      <circle cx="32" cy="32" r={r} className={`pc-ring-fg ${tone}`} strokeDasharray={`${(c * p) / 100} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="31" className="pc-ring-pct">{p}%</text>
      <text x="32" y="42" className="pc-ring-lbl">{label}</text>
    </svg>
  );
}

export function PartyCardBody({ d }) {
  const cust = d.kind === 'customer';
  const since = d.since ? fdate(d.since) : '';
  const owing = d.due > 0.004, adv = d.advance > 0.004;
  return (
    <div className="pc-card">
      <div className="pc-head">
        <span className={`pc-avatar ${cust ? 'c' : 's'}`} aria-hidden="true">{String(d.name || '?').trim().charAt(0).toUpperCase()}</span>
        <div className="pc-who">
          <b title={d.name}>{d.name}</b>
          <small>{cust ? 'Customer' : 'Supplier'}{since ? ` since ${since}` : ''}</small>
        </div>
        <span className="pc-inv" title={`${d.invoices} ${cust ? 'sale' : 'purchase'} invoice${d.invoices === 1 ? '' : 's'}`}><b>{d.invoices}</b> INV</span>
      </div>
      <div className="pc-rings">
        <div className="pc-col">
          <Ring pct={d.net > 0 ? 100 : 0} tone="ok" label={cust ? 'SALES' : 'BOUGHT'} />
          <b>{money(d.net)}</b>
          <small>{d.returns > 0.004 ? `after ${money(d.returns, false)} returned` : cust ? 'total sales' : 'total purchases'}</small>
        </div>
        <span className="pc-split" aria-hidden="true" />
        <div className="pc-col">
          <Ring pct={d.paid_pct} tone={owing ? 'warn' : 'info'} label={cust ? 'COLLECTED' : 'PAID'} />
          <b className={owing ? 'warn' : adv ? 'ok' : ''}>{owing ? `${money(d.due)} due` : adv ? `${money(d.advance)} advance` : `${money(0)} due`}</b>
          <small>{owing ? (cust ? 'customer owes' : 'we owe') : adv ? (cust ? 'paid in advance' : 'paid to supplier in advance') : 'all settled'}</small>
        </div>
      </div>
      {d.last && <div className="pc-foot">Last {cust ? 'sale' : 'purchase'}: {fdate(d.last)}{d.phone ? ` · ${d.phone}` : ''}</div>}
    </div>
  );
}

/** Wraps the party's name: hovering (or focusing, unless focus={false}) it opens the card under it after a short pause. */
export function PartyHover({ kind, id, children, className = '', focus = true }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const timer = useRef(), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(timer.current); }; }, []);
  useEffect(() => { setOpen(false); setState(null); }, [kind, id]);
  if (!id) return children;
  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setOpen(true);
      setState((s) => (s?.data ? s : { loading: true }));
      loadPartyCard(kind, id).then((data) => alive.current && setState({ data }), (e) => alive.current && setState({ error: e.message }));
    }, 250);
  };
  const hide = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 120); };
  return (
    <span className={`pc-anchor ${className}`} onMouseEnter={show} onMouseLeave={hide} onFocus={focus ? show : undefined} onBlur={focus ? hide : undefined}>
      {children}
      {open && (
        <span className="pc-pop" role="tooltip" onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={hide} onClick={(e) => e.preventDefault()}>
          {state?.data ? <PartyCardBody d={state.data} /> : state?.error ? <span className="pc-msg bad">{state.error}</span> : <span className="pc-msg">Loading…</span>}
        </span>
      )}
    </span>
  );
}
