import { useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { money, fdate, fdatetime, qty as fqty } from '../lib/format';
import { PageHead, Btn, Badge, statusTone, Empty, ErrorBox, Loading } from '../components/ui';
import DocViewer, { DOC_PERM } from '../components/DocViewer';

const EV = {
  purchase: ['Purchased from supplier', 'purchase'], sale: ['Sold', 'sale'], sale_return: ['Returned by customer', 'return'],
  purchase_return: ['Returned to supplier', 'return'], sale_cancelled: ['Sale cancelled', 'cancel'], purchase_cancelled: ['Purchase cancelled', 'cancel'],
  return_cancelled: ['Return cancelled', 'cancel'], stock_adjust: ['Stock adjusted', 'return'], warranty_in: ['Received for warranty', 'warranty']
};
const evLabel = (e) => EV[e]?.[0] || (e.startsWith('warranty_') ? 'Warranty: ' + e.slice(9).replace(/_/g, ' ') : e);
const evKind = (e) => EV[e]?.[1] || (e.startsWith('warranty') ? 'warranty' : 'sale');
// timeline references that open a document
const REF_DOC = { sale: 'sale', purchase: 'purchase', sreturn: 'sreturn', preturn: 'preturn', claim: 'claim' };
const wText = (d) => (!d ? '' : d % 365 === 0 ? `${d / 365} year${d === 365 ? '' : 's'}` : d % 30 === 0 ? `${d / 30} month${d === 30 ? '' : 's'}` : `${d} days`);

// the cards after the product card, in this order
const CARDS = [
  ['purchases', 'Purchased from', 'purchase', 'No purchase found'],
  ['sales', 'Sold to', 'sale', 'Not sold yet'],
  ['sreturns', 'Sales returns', 'sreturn', 'No sales return'],
  ['preturns', 'Purchase returns', 'preturn', 'No purchase return'],
  ['claims', 'Warranty claims', 'claim', 'No warranty claim']
];

export default function History() {
  const can = useStore((s) => s.can);
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [doc, setDoc] = useState(null); // the document open in the viewer
  const find = async (payload) => {
    setLoading(true); setErr('');
    try { setRes(await api('history', payload)); } catch (e2) { setErr(e2.message); }
    setLoading(false);
  };
  const go = (e, val) => {
    e?.preventDefault();
    const term = (val ?? q).trim(); if (!term) return;
    if (val !== undefined) setQ(val);
    find({ q: term });
  };
  const pickProduct = (p) => { setQ(p.name); find({ product_id: p.id }); };
  const open = (type, id, no) => setDoc({ type, id, no });
  const canOpen = (type) => !!DOC_PERM[type] && can(DOC_PERM[type]);
  const DocNo = ({ type, id, no }) => (canOpen(type) && id
    ? <button type="button" className="hc-no" onClick={() => open(type, id, no)} title={`Open ${no}`}>{no}</button>
    : <b className="hc-no-off">{no}</b>);
  const c = res?.cards;

  return (
    <>
      <PageHead title="Advance Search" sub="Search a serial number, product (name, model or barcode), invoice or purchase number to see its complete life cycle." />
      <form className="row" onSubmit={go} style={{ marginBottom: 16 }}>
        <div className="psearch" style={{ flex: 1 }}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Serial / IMEI, product name, model, barcode, INV-000123, PUR-000045 or supplier invoice" aria-label="Search" autoFocus /></div>
        <Btn kind="primary" size="lg" busy={loading} type="submit">Search</Btn>
      </form>
      <ErrorBox error={err} />
      {loading && <Loading label="Tracing history" />}
      {res && res.kind === 'none' && <Empty title={`Nothing found for “${res.query}”`}>Serials must match exactly. Try part of the product name, the model, or the invoice number printed on the receipt.</Empty>}

      {res && res.kind === 'choose' && (
        <div className="card hc-choose">
          <div className="card-head"><h2>Which product?</h2><span className="muted">{res.total > res.items.length ? `First ${res.items.length} of ${res.total} — type more to narrow down` : `${res.total} products match “${res.query}”`}</span></div>
          <ul>{res.items.map((p) => (
            <li key={p.id}><button type="button" onClick={() => pickProduct(p)}>
              <b>{p.name}</b><span className="muted">{[p.sku && `Model ${p.sku}`, p.barcode, p.service ? 'Service' : `${fqty(p.stock, p.unit)} in stock`, !p.active && 'hidden'].filter(Boolean).join(' · ')}</span>
            </button></li>
          ))}</ul>
        </div>
      )}

      {c && (
        <>
          <div className="hcards">
            <section className="card hcard" data-k="product" aria-label={c.products.length > 1 ? 'Products' : 'Product'}>
              <div className="hc-head"><h2>{c.products.length > 1 ? 'Products' : 'Product'}</h2>{c.products.length > 1 && <span className="hc-count">{c.products.length}</span>}</div>
              {c.products.length === 1 && !c.products[0].line
                ? <ProductInfo p={c.products[0]} serials={res.kind === 'product' ? res.items : []} onSerial={(sn) => go(null, sn)} />
                : <ul className="hc-list">{c.products.map((p, k) => <LineInfo key={k} p={p} kind={res.kind} onProduct={() => pickProduct(p)} onSerial={(sn) => go(null, sn)} />)}</ul>}
            </section>
            {CARDS.map(([key, title, type, none]) => {
              const card = c[key] || { rows: [], total: 0 };
              return (
                <section key={key} className="card hcard" data-k={type} aria-label={title}>
                  <div className="hc-head"><h2>{title}</h2><span className="hc-count">{card.total > card.rows.length ? `${card.rows.length} of ${card.total}` : card.total}</span></div>
                  {c.notes?.[key] && <p className="hc-note">{c.notes[key]}</p>}
                  {card.rows.length ? (
                    <ul className="hc-list">{card.rows.map((r) => (
                      <li key={r.type + r.id} className="hc-row">
                        <div className="hc-top">
                          <DocNo type={r.type} id={r.id} no={r.no} />
                          <span className="muted">{fdate(r.date)}</span>
                          {r.status && r.status !== 'active' && <Badge tone={statusTone(r.status)}>{r.status}</Badge>}
                          {r.kind === 'exchange' && <Badge tone="info">exchange</Badge>}
                          <span className="spacer" />
                          {r.amount !== undefined && <b className="num">{money(r.amount, false)}</b>}
                        </div>
                        <div className="hc-party">{r.party}{type === 'claim' && r.product ? <span className="muted"> · {r.product}{r.serial ? ` · S/N ${r.serial}` : ''}</span> : null}</div>
                        <div className="hc-meta">
                          {r.qty !== undefined && type !== 'claim' && <span>Qty {fqty(r.qty)}</span>}
                          {r.items && (res.kind === 'sale_invoice' || res.kind === 'purchase_invoice') && <span>{r.items}</span>}
                          {r.supplier_invoice && <span><span className="hc-k">Supplier invoice</span> <b>{r.supplier_invoice}</b></span>}
                          {r.whole && r.paid !== undefined && <span>Paid {money(r.paid, false)}{(r.due_now ?? r.due) > 0 ? <> · <b className="hc-due">Due {money(r.due_now ?? r.due, false)}</b></> : ''}</span>}
                          {r.refund > 0 && <span>Refunded {money(r.refund, false)}</span>}
                          {r.invoice_no && type !== 'claim' && <span>from <DocNo type={type === 'sreturn' ? 'sale' : 'purchase'} id={r.invoice_no} no={r.invoice_no} /></span>}
                          {type === 'claim' && r.invoice_no && <span>Invoice <DocNo type="sale" id={r.invoice_no} no={r.invoice_no} /></span>}
                          {type === 'claim' && <span>{r.in_warranty ? 'In warranty' : 'Out of warranty'}</span>}
                          {r.last && <span className="hc-k">last purchase before this sale</span>}
                          {r.staff && <span className="muted">by {r.staff}</span>}
                        </div>
                      </li>
                    ))}</ul>
                  ) : <p className="hc-none">{none}</p>}
                </section>
              );
            })}
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head"><h2>{res.kind === 'product' ? 'Movement history' : 'Timeline'}</h2>{res.kind === 'product' && <span className="muted">latest 300 events</span>}</div>
            <Timeline items={res.kind === 'product' ? [...res.timeline].reverse() : res.timeline} DocNo={DocNo} />
          </div>
        </>
      )}
      {doc && <DocViewer doc={doc} onClose={() => setDoc(null)} />}
    </>
  );
}

/** One product: details, and for a serial its warranty and status; for a serial product its serial numbers. */
function ProductInfo({ p, serials, onSerial }) {
  const sn = p.serial;
  return (
    <div className="hc-prod">
      <h3>{p.name}</h3>
      <div className="hc-tags">{p.brand && <Badge tone="info">{p.brand}</Badge>}{p.group && <Badge>{p.group}{p.category ? ` › ${p.category}` : ''}</Badge>}{p.service && <Badge tone="violet">Service</Badge>}{!p.active && <Badge tone="bad">hidden</Badge>}</div>
      {sn && (
        <div className="hc-serial">
          <div><span>Serial</span><b className="hc-sn">{sn.serial}</b> <Badge tone={statusTone(sn.status)}>{String(sn.status).replace('_', ' ')}</Badge></div>
          {sn.warranty_expiry ? <div><span>Warranty</span><b><Badge tone={sn.in_warranty ? 'ok' : 'bad'}>{sn.in_warranty ? `${sn.days_left} days left` : 'Expired'}</Badge> till {fdate(sn.warranty_expiry)}</b></div> : null}
          <div><span>Days in stock</span><b>{sn.days_in_inventory}</b></div>
        </div>
      )}
      <div className="kv hc-kv">
        {p.sku && <div><span>Model</span><b>{p.sku}</b></div>}
        {p.barcode && <div><span>Barcode</span><b>{p.barcode}</b></div>}
        {!p.service && <div><span>In stock</span><b>{fqty(p.stock, p.unit)}</b></div>}
        <div><span>Retail price</span><b>{money(p.sale_price)}</b></div>
        {p.wholesale_price > 0 && <div><span>Wholesale price</span><b>{money(p.wholesale_price)}</b></div>}
        {p.cost_price !== undefined && !p.service && <div><span>Average cost</span><b>{money(p.cost_price)}</b></div>}
        <div><span>Warranty</span><b>{p.has_warranty ? `${wText(p.warranty_days)} · ${p.warranty_type === 'serial' ? 'by serial' : 'keep the invoice'}` : 'No warranty'}</b></div>
        {p.serials && <div><span>Serials</span><b>{p.serials.in_stock} in stock · {p.serials.sold} sold{p.serials.returned_supplier ? ` · ${p.serials.returned_supplier} back to supplier` : ''}</b></div>}
      </div>
      {p.description && <p className="muted hc-desc">{p.description}</p>}
      {serials.length > 0 && <>
        <div className="serial-grid hc-sgrid">{serials.map((i) => <button key={i.serial} type="button" className={i.status === 'in_stock' ? '' : 'on'} title={i.status} onClick={() => onSerial(i.serial)}>{i.serial}</button>)}</div>
        <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Highlighted serials have left stock. Click a serial for its own history.</p>
      </>}
    </div>
  );
}

/** One line of the searched invoice in the Products card. */
function LineInfo({ p, kind, onProduct, onSerial }) {
  const l = p.line, sers = String(l.serials || '').split(',').map((x) => x.trim()).filter(Boolean);
  return (
    <li className="hc-row">
      <div className="hc-top"><button type="button" className="hc-pname" onClick={onProduct} title="See this product's history">{l.name}</button><span className="spacer" />{l.total !== undefined && <b className="num">{money(l.total, false)}</b>}</div>
      <div className="hc-meta">
        <span>Qty {fqty(l.qty, l.unit)}</span>
        {l.price !== undefined && <span>× {money(l.price, false)}</span>}
        {l.cost !== undefined && <span>× {money(l.cost, false)}</span>}
        {[p.brand, p.sku && `Model ${p.sku}`].filter(Boolean).map((t) => <span key={t} className="muted">{t}</span>)}
        {kind === 'sale_invoice' && l.warranty_expiry && <span><Badge tone="violet">warranty till {fdate(l.warranty_expiry)}</Badge></span>}
      </div>
      {sers.length > 0 && <div className="hc-sers">{sers.map((sn) => <button key={sn} type="button" onClick={() => onSerial(sn)}>{sn}</button>)}</div>}
    </li>
  );
}

function Timeline({ items, DocNo }) {
  if (!items.length) return <Empty title="No events recorded" />;
  return (
    <ul className="timeline">
      {items.map((e) => (
        <li key={e.id} data-k={evKind(e.event)}>
          <div className="t-head"><b>{evLabel(e.event)}</b><span className="t-meta">{fdatetime(e.ts)} · {REF_DOC[e.ref_type] && e.ref_no ? <DocNo type={REF_DOC[e.ref_type]} id={e.ref_id} no={e.ref_no} /> : e.ref_no} · by {e.user}</span></div>
          <div>{[e.party, e.serial ? `S/N ${e.serial}` : e.product_name, e.qty && e.qty !== 1 ? `qty ${fqty(e.qty)}` : '', e.amount ? money(e.amount) : ''].filter(Boolean).join(' — ')}</div>
          {e.note && <div className="t-meta">{e.note}</div>}
        </li>
      ))}
    </ul>
  );
}
