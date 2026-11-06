import { useState } from 'react';
import { api } from '../lib/api';
import { money, fdate, fdatetime, qty as fqty } from '../lib/format';
import { PageHead, Btn, Badge, statusTone, Empty, ErrorBox, Loading } from '../components/ui';

const EV = {
  purchase: ['Purchased from supplier', 'purchase'], sale: ['Sold', 'sale'], sale_return: ['Returned by customer', 'return'],
  purchase_return: ['Returned to supplier', 'return'], sale_cancelled: ['Sale cancelled', 'cancel'], purchase_cancelled: ['Purchase cancelled', 'cancel'],
  return_cancelled: ['Return cancelled', 'cancel'], stock_adjust: ['Stock adjusted', 'return'], warranty_in: ['Received for warranty', 'warranty']
};
const evLabel = (e) => EV[e]?.[0] || (e.startsWith('warranty_') ? 'Warranty: ' + e.slice(9).replace(/_/g, ' ') : e);
const evKind = (e) => EV[e]?.[1] || (e.startsWith('warranty') ? 'warranty' : 'sale');

export default function History() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const go = async (e, val) => {
    e?.preventDefault();
    const term = (val ?? q).trim(); if (!term) return;
    setLoading(true); setErr('');
    try { setRes(await api('history', { q: term })); } catch (e2) { setErr(e2.message); }
    setLoading(false);
  };
  const s = res?.summary;

  return (
    <>
      <PageHead title="Advance Search" sub="Scan a serial number, product barcode or invoice number to see its complete life cycle." />
      <form className="row" onSubmit={go} style={{ marginBottom: 16 }}>
        <div className="psearch" style={{ flex: 1 }}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Serial / IMEI, barcode, INV-000123, PUR-000045 or supplier invoice" autoFocus /></div>
        <Btn kind="primary" size="lg" busy={loading} type="submit">Search</Btn>
      </form>
      <ErrorBox error={err} />
      {loading && <Loading label="Tracing history" />}
      {res && res.kind === 'none' && <Empty title={`Nothing found for “${res.query}”`}>Serials must match exactly. Try the invoice number printed on the receipt.</Empty>}

      {res && res.kind === 'serial' && (
        <div className="split">
          <div className="card">
            <div className="card-head"><h2>Timeline for {s.serial}</h2><Badge tone={statusTone(s.status)}>{s.status.replace('_', ' ')}</Badge></div>
            <Timeline items={res.timeline} />
          </div>
          <div className="grid">
            <div className="card">
              <h2 style={{ marginBottom: 12 }}>{s.product}</h2>
              <div className="kv">
                <div><span>Purchased</span><b>{fdate(s.purchase_date)}</b></div>
                <div><span>Purchase invoice</span><b><a href="#" onClick={(e) => { e.preventDefault(); setQ(s.purchase_invoice); go(null, s.purchase_invoice); }}>{s.purchase_invoice}</a></b></div>
                <div><span>Supplier</span><b>{s.supplier || '—'}</b></div>
                {s.cost !== undefined && <div><span>Cost</span><b>{money(s.cost)}</b></div>}
                <div><span>Days in inventory</span><b>{s.days_in_inventory}</b></div>
                {s.sale_invoice && <>
                  <div><span>Sold</span><b>{fdate(s.sale_date)}</b></div>
                  <div><span>Sale invoice</span><b><a href="#" onClick={(e) => { e.preventDefault(); setQ(s.sale_invoice); go(null, s.sale_invoice); }}>{s.sale_invoice}</a></b></div>
                  <div><span>Customer</span><b>{s.customer}</b></div>
                  <div><span>Sale price</span><b>{money(s.sale_price)}</b></div>
                </>}
                {s.warranty_expiry && <div><span>Warranty</span><b><Badge tone={s.in_warranty ? 'ok' : 'bad'}>{s.in_warranty ? `${s.days_left} days left` : 'Expired'}</Badge> till {fdate(s.warranty_expiry)}</b></div>}
              </div>
            </div>
            {res.claims.length > 0 && <div className="card"><h2 style={{ marginBottom: 10 }}>Warranty claims</h2>{res.claims.map((c) => <div key={c.id} className="row" style={{ padding: '4px 0' }}><b>{c.claim_no}</b><span className="muted">{fdate(c.date)}</span><span className="spacer" /><Badge tone={statusTone(c.status)}>{c.status}</Badge></div>)}</div>}
          </div>
        </div>
      )}

      {res && (res.kind === 'sale_invoice' || res.kind === 'purchase_invoice') && (
        <div className="split">
          <div className="card"><div className="card-head"><h2>Timeline</h2></div><Timeline items={res.timeline} /></div>
          <div className="grid">
            <div className="card">
              <div className="card-head"><h2>{res.kind === 'sale_invoice' ? 'Sale' : 'Purchase'} {s.invoice}</h2><Badge tone={statusTone(s.status)}>{s.status}</Badge></div>
              <div className="kv">
                <div><span>Date</span><b>{fdate(s.date)}</b></div>
                <div><span>{res.kind === 'sale_invoice' ? 'Customer' : 'Supplier'}</span><b>{s.customer || s.supplier || '—'}</b></div>
                {s.supplier_invoice && <div><span>Supplier invoice</span><b>{s.supplier_invoice}</b></div>}
                <div><span>Total</span><b>{money(s.total)}</b></div><div><span>Due</span><b>{money(s.due)}</b></div>
              </div>
              <table style={{ marginTop: 12 }}><tbody>{res.items.map((i, k) => (
                <tr key={k}><td style={{ padding: '5px 0' }}>{i.name}{i.serials && <div className="muted" style={{ fontSize: 12 }}>
                  {i.serials.split(',').map((sn) => <a key={sn} href="#" style={{ marginRight: 8 }} onClick={(e) => { e.preventDefault(); setQ(sn); go(null, sn); }}>{sn}</a>)}</div>}
                  {i.warranty_expiry && <Badge tone="violet">warranty till {fdate(i.warranty_expiry)}</Badge>}</td>
                  <td className="r num">{fqty(i.qty)}</td></tr>
              ))}</tbody></table>
            </div>
            {res.returns?.length > 0 && <div className="card"><h2 style={{ marginBottom: 8 }}>Returns</h2>{res.returns.map((r) => <div key={r.return_no} className="row"><b>{r.return_no}</b><span className="muted">{fdate(r.date)}</span><span className="spacer" />{money(r.total, false)} <Badge tone={statusTone(r.status)}>{r.status}</Badge></div>)}</div>}
            {res.claims?.length > 0 && <div className="card"><h2 style={{ marginBottom: 8 }}>Warranty claims</h2>{res.claims.map((c) => <div key={c.claim_no} className="row"><b>{c.claim_no}</b><span>{c.product_name} {c.serial}</span><span className="spacer" /><Badge tone={statusTone(c.status)}>{c.status}</Badge></div>)}</div>}
          </div>
        </div>
      )}

      {res && res.kind === 'product' && (
        <div className="split">
          <div className="card"><div className="card-head"><h2>Movement history</h2><span className="muted">latest 300 events</span></div><Timeline items={[...res.timeline].reverse()} /></div>
          <div className="card">
            <h2 style={{ marginBottom: 12 }}>{s.product}</h2>
            <div className="kv">
              <div><span>In stock</span><b>{fqty(s.stock, s.unit)}</b></div><div><span>Barcode</span><b>{s.barcode || '—'}</b></div>
              <div><span>Serials in stock</span><b>{s.serials_in_stock}</b></div><div><span>Serials sold</span><b>{s.serials_sold}</b></div>
            </div>
            {res.items.length > 0 && <div className="serial-grid" style={{ marginTop: 14, maxHeight: 340 }}>{res.items.map((i) => (
              <button key={i.serial} type="button" className={i.status === 'in_stock' ? '' : 'on'} title={i.status} onClick={() => { setQ(i.serial); go(null, i.serial); }}>{i.serial}</button>
            ))}</div>}
            {res.items.length > 0 && <p className="muted" style={{ fontSize: 12 }}>Highlighted serials have left stock. Click any serial for its timeline.</p>}
          </div>
        </div>
      )}
    </>
  );
}

function Timeline({ items }) {
  if (!items.length) return <Empty title="No events recorded" />;
  return (
    <ul className="timeline">
      {items.map((e) => (
        <li key={e.id} data-k={evKind(e.event)}>
          <div className="t-head"><b>{evLabel(e.event)}</b><span className="t-meta">{fdatetime(e.ts)} · {e.ref_no} · by {e.user}</span></div>
          <div>{[e.party, e.serial ? `S/N ${e.serial}` : e.product_name, e.qty && e.qty !== 1 ? `qty ${fqty(e.qty)}` : '', e.amount ? money(e.amount) : ''].filter(Boolean).join(' — ')}</div>
          {e.note && <div className="t-meta">{e.note}</div>}
        </li>
      ))}
    </ul>
  );
}
