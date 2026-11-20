// POS: hovering a product (search list, quick add, cart) shows its selling prices — last, second-last, highest
// and average — what the chosen customer paid before, and (with the cost permission) the purchase cost range.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { money, fdate } from '../lib/format';

const cache = new Map(); // product|customer → { at, data }
const FRESH = 30000, W = 320;
function load(id, customerId) {
  const key = `${id}|${customerId || ''}`, hit = cache.get(key);
  if (hit && Date.now() - hit.at < FRESH) return Promise.resolve(hit.data);
  return api('product.history', { product_id: id, customer_id: customerId || undefined }).then((data) => { cache.set(key, { at: Date.now(), data }); return data; });
}
/** A sale was just made: the next hover shows fresh prices. */
export const clearPriceCards = () => cache.clear();

const tk = (v) => (v === null || v === undefined ? '—' : money(v, false));

function Body({ name, d, customer }) {
  const st = d.sale_stats || {}, cs = d.cost_stats;
  return (
    <div className="ppc">
      <div className="ppc-title" title={name}>{name}</div>
      <div className="ppc-sec"><span className="ppc-h">📈 Selling prices</span>{st.times ? <small>sold {st.times} time{st.times === 1 ? '' : 's'}</small> : null}</div>
      {st.times ? <>
        <div className="ppc-grid">
          <div className="ppc-box last"><small>LAST</small><b>{tk(st.last?.price)}</b></div>
          <div className="ppc-box"><small>2ND LAST</small><b>{tk(st.second?.price)}</b></div>
          <div className="ppc-box max"><small>MAX</small><b>{tk(st.max)}</b></div>
          <div className="ppc-box avg"><small>AVG</small><b>{tk(st.avg)}</b></div>
        </div>
        <div className="ppc-line">Last: {fdate(st.last.date)} · {st.last.invoice_no}{st.last.customer ? ` · ${st.last.customer}` : ''}</div>
        {st.second && <div className="ppc-line">2nd: {fdate(st.second.date)} · {st.second.invoice_no}{st.second.customer ? ` · ${st.second.customer}` : ''}</div>}
      </> : <div className="ppc-empty">Not sold yet</div>}
      <div className="ppc-sec"><span className="ppc-h">👤 {customer ? customer.name : 'Customer'}</span></div>
      {!customer ? <div className="ppc-empty">Select a customer to see what they paid</div>
        : d.customer_sales?.length ? <div className="ppc-chips">{d.customer_sales.map((x, i) => <span key={i} title={`${fdate(x.date)} · ${x.invoice_no} · qty ${x.qty}`}>{tk(x.price)}<small>{fdate(x.date)}</small></span>)}</div>
        : <div className="ppc-empty">Never bought this before</div>}
      {cs && <>
        <div className="ppc-sec"><span className="ppc-h">🧾 Cost info</span><small>bought {cs.times} time{cs.times === 1 ? '' : 's'}</small></div>
        <div className="ppc-grid three">
          <div className="ppc-box min"><small>MIN</small><b>{tk(cs.min)}</b></div>
          <div className="ppc-box max"><small>MAX</small><b>{tk(cs.max)}</b></div>
          <div className="ppc-box avg"><small>AVG</small><b>{tk(cs.avg)}</b></div>
        </div>
      </>}
    </div>
  );
}

/** Wrap a product's name or tile. */
export default function ProductHover({ product, customerId, children, as: Tag = 'span', className = '' }) {
  const customers = useStore((s) => s.customers);
  const ref = useRef(), timer = useRef(), alive = useRef(true);
  const [pos, setPos] = useState(null);
  const [state, setState] = useState(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(timer.current); }; }, []);
  useEffect(() => { setPos(null); }, [product?.id, customerId]);
  if (!product) return children;
  const customer = customerId ? customers.find((c) => c.id === customerId) : null;
  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = ref.current?.getBoundingClientRect(); if (!r) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      const left = Math.max(8, Math.min(r.left, vw - W - 8));
      const below = vh - r.bottom > 300 || r.top < 300;
      setPos(below ? { left, top: r.bottom + 6 } : { left, bottom: vh - r.top + 6 });
      setState((s) => (s?.id === product.id && s.data ? s : { id: product.id, loading: true }));
      load(product.id, customerId).then((data) => alive.current && setState({ id: product.id, data }), (e) => alive.current && setState({ id: product.id, error: e.message }));
    }, 300);
  };
  const hide = () => { clearTimeout(timer.current); setPos(null); };
  return (
    <Tag ref={ref} className={`ppc-anchor ${className}`} onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide}>
      {children}
      {pos && createPortal(
        <div className="ppc-pop" role="tooltip" style={{ ...pos, width: W }}>
          {state?.data ? <Body name={product.name} d={state.data} customer={customer} /> : state?.error ? <div className="ppc"><div className="ppc-title">{product.name}</div><div className="ppc-empty bad">{state.error}</div></div>
            : <div className="ppc"><div className="ppc-title">{product.name}</div><div className="ppc-empty">Loading prices…</div></div>}
        </div>, document.body)}
    </Tag>
  );
}
