// Online Orders: orders placed on the shop website (codewithroni.github.io/karvio-shop).
// "Open in POS" fills the POS with the customer, items and delivery charge; finishing that sale confirms the order.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, fdatetime, qty as fqty } from '../lib/format';
import { PageHead, Tabs, Modal, Btn, Field, Badge, useApi, useAction, Loading, ErrorBox, Empty } from '../components/ui';

export const STATUS = { new: ['New', 'warn'], confirmed: ['Confirmed', 'info'], shipped: ['Shipped', 'violet'], delivered: ['Delivered', 'ok'], cancelled: ['Cancelled', 'bad'] };
const PAY = { cod: 'Cash on delivery', unverified: 'bKash — not checked yet', verified: 'bKash — verified', invalid: 'bKash — not received' };
const digits = (s) => String(s || '').replace(/\D/g, '');
const POS_DRAFT = 'erp_pos_draft';

export default function OnlineOrders() {
  const [tab, setTab] = useState('new');
  const { data, loading, error, reload } = useApi('weborders.list', {}, [], { refreshMs: 60000 });
  const [open, setOpen] = useState(null);
  const can = useStore((s) => s.can);

  const orders = data?.orders || [];
  const shown = tab === 'all' ? orders : orders.filter((o) => o.status === tab);
  const counts = data?.counts || {};
  const current = open && orders.find((o) => o.id === open);

  return (
    <>
      <PageHead title="Online Orders" sub="Orders from your shop website. Open an order in the POS to make the sale — that confirms it.">
        <Btn onClick={reload} busy={loading}>Refresh</Btn>
      </PageHead>
      <ErrorBox error={error} onRetry={reload} />
      {data && !data.ready && (
        <div className="card note" style={{ maxWidth: 680 }}>
          The online shop is not set up yet. {can('settings') ? <Link to="/settings?tab=online" className="link">Set it up in Settings → Online shop</Link> : 'Ask an admin to set it up in Settings → Online shop.'}
        </div>
      )}
      {data?.ready && <>
        <Tabs tabs={[...Object.entries(STATUS).map(([k, [label]]) => [k, `${label}${counts[k] ? ` (${counts[k]})` : ''}`]), ['all', 'All']]} value={tab} onChange={setTab} />
        <div className="worders" style={{ marginTop: 12 }}>
          {loading && !data ? <Loading /> : !shown.length ? <Empty title={tab === 'new' ? 'No new orders' : 'No orders here'} /> : shown.map((o) => (
            <button type="button" key={o.id} className="card worder" onClick={() => setOpen(o.id)}>
              <div className="worder-top"><b>{o.order_no}</b><Badge tone={STATUS[o.status]?.[1]}>{STATUS[o.status]?.[0] || o.status}</Badge></div>
              <div className="worder-who"><b>{o.customer_name}</b><span>{o.phone}</span></div>
              <div className="worder-meta"><span>{fdatetime(o.created_at)}</span><span>{o.items.length} item{o.items.length === 1 ? '' : 's'}</span>
                <span className={o.payment === 'bkash' ? (o.payment_status === 'verified' ? 'ok' : o.payment_status === 'invalid' ? 'bad' : 'warn') : ''}>{o.payment === 'bkash' ? 'bKash' : 'COD'}</span></div>
              <div className="worder-total">{money(o.total)}</div>
            </button>
          ))}
        </div>
      </>}
      {current && <OrderDetail order={current} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  );
}

function OrderDetail({ order: o, onClose, onChanged }) {
  const { products, customers, settings, refresh, toast } = useStore();
  const navigate = useNavigate();
  const [busy, run] = useAction();
  const [note, setNote] = useState(o.staff_note || '');
  const [inv, setInv] = useState('');
  const pmap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const final = o.status === 'delivered' || o.status === 'cancelled';
  const act = async (patch, msg) => { try { await run(() => api('weborder.update', { id: o.id, ...patch }), msg); onChanged(); } catch { /* shown */ } };
  const link = async () => { try { await run(() => api('weborder.link', { id: o.id, invoice_no: inv }), 'Invoice linked — order confirmed'); setInv(''); onChanged(); } catch { /* shown */ } };

  const openInPos = async () => {
    try {
      let draft = null; try { draft = JSON.parse(localStorage.getItem(POS_DRAFT)); } catch { draft = null; }
      if (draft?.cart?.length && !(draft.webOrder?.id === o.id) && !confirm('The POS already has items in the cart. Replace them with this order?')) return;
      const phone10 = digits(o.phone).slice(-10);
      let c = customers.find((x) => String(x.phones || '').split(',').some((p) => digits(p).slice(-10) === phone10));
      if (!c) { c = await run(() => api('customer.quickAdd', { name: o.customer_name, phone: o.phone, address: o.address })); await refresh('customers'); }
      const missing = o.items.filter((it) => !pmap[it.product_id]);
      const cart = o.items.filter((it) => pmap[it.product_id]).map((it) => {
        const p = pmap[it.product_id], serial = p.has_warranty && p.warranty_type === 'serial' && !p.service;
        return { product_id: it.product_id, qty: serial ? 0 : it.qty, ...(serial ? { want: it.qty } : {}), price: it.price, serials: [], warranty_days: p.has_warranty ? p.warranty_days : '' };
      });
      const dp = settings.shop_delivery_product_id && pmap[settings.shop_delivery_product_id];
      if (o.delivery > 0 && dp) cart.push({ product_id: dp.id, qty: 1, price: o.delivery, serials: [], warranty_days: '' });
      localStorage.setItem(POS_DRAFT, JSON.stringify({ cart, customerId: c.id, discount: '', webOrder: { id: o.id, order_no: o.order_no, payment: o.payment, payment_status: o.payment_status } }));
      if (missing.length) toast(`${missing.length} item(s) of this order no longer exist and were left out`, 'err');
      if (o.delivery > 0 && !dp) toast('Delivery charge item is missing — run Settings → Online shop → Set up again, or add the charge by hand', 'err');
      navigate('/pos');
    } catch { /* shown */ }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={`Order ${o.order_no}`}
      footer={<>
        {!final && <Btn kind="danger" busy={busy} onClick={() => confirm(o.sale_id ? `Cancel this order? Its sale ${o.sale_no} stays — cancel it in Sales & Returns if needed.` : 'Cancel this order?') && act({ status: 'cancelled' }, 'Order cancelled')}>Cancel order</Btn>}
        <span className="spacer" />
        {!o.sale_id && !final && <Btn kind="primary" busy={busy} onClick={openInPos}>Open in POS</Btn>}
        {o.status === 'confirmed' && <Btn kind="primary" busy={busy} onClick={() => act({ status: 'shipped' }, 'Marked shipped')}>Mark shipped</Btn>}
        {o.status === 'shipped' && <Btn kind="primary" busy={busy} onClick={() => act({ status: 'delivered' }, 'Marked delivered')}>Mark delivered</Btn>}
      </>}>
      <div className="worder-detail">
        <div className="worder-head">
          <Badge tone={STATUS[o.status]?.[1]}>{STATUS[o.status]?.[0]}</Badge>
          <span className="muted">{fdatetime(o.created_at)}</span>
          {o.sale_no && <Link className="link" to={`/sales/${o.sale_id}`} onClick={onClose}>Invoice {o.sale_no}</Link>}
        </div>
        <div className="worder-grid">
          <div className="card">
            <h3>Customer</h3>
            <p><b>{o.customer_name}</b><br /><a className="link" href={`tel:${o.phone}`}>{o.phone}</a></p>
            <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{o.address}<br />{o.area === 'outside' ? 'Outside the city' : (settings.shop_inside_label || 'Inside the city')}</p>
            {o.note && <p><span className="muted">Customer note:</span> {o.note}</p>}
          </div>
          <div className="card">
            <h3>Payment</h3>
            <p><b>{PAY[o.payment === 'bkash' ? o.payment_status : 'cod']}</b></p>
            {o.payment === 'bkash' && <>
              <p className="muted">Paid from <b>{o.bkash_sender}</b> · TrxID <b className="worder-trx">{o.bkash_trx}</b></p>
              {!final && <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Btn size="sm" busy={busy} disabled={o.payment_status === 'verified'} onClick={() => act({ payment_status: 'verified' }, 'bKash payment verified')}>Received ✓</Btn>
                <Btn size="sm" kind="danger" busy={busy} disabled={o.payment_status === 'invalid'} onClick={() => act({ payment_status: 'invalid' }, 'Marked as not received')}>Not received</Btn>
              </div>}
              <p className="muted" style={{ fontSize: 12 }}>Check the TrxID in your bKash app or statement before confirming.</p>
            </>}
          </div>
        </div>
        <table className="worder-items">
          <thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Amount</th></tr></thead>
          <tbody>
            {o.items.map((it) => <tr key={it.product_id}><td>{it.name}{!pmap[it.product_id] && <small className="muted"> (no longer in Karvio)</small>}</td><td className="r">{fqty(it.qty, it.unit)}</td><td className="r">{money(it.price, false)}</td><td className="r">{money(it.total, false)}</td></tr>)}
            <tr><td colSpan={3} className="r muted">Subtotal</td><td className="r">{money(o.subtotal, false)}</td></tr>
            <tr><td colSpan={3} className="r muted">Delivery</td><td className="r">{money(o.delivery, false)}</td></tr>
            <tr><td colSpan={3} className="r"><b>Total</b></td><td className="r"><b>{money(o.total)}</b></td></tr>
          </tbody>
        </table>
        {!o.sale_id && !final && <div className="card worder-link">
          <Field label="Already made the sale? Link its invoice"><div className="row" style={{ gap: 8 }}><input value={inv} onChange={(e) => setInv(e.target.value)} placeholder="e.g. INV-000123" /><Btn busy={busy} disabled={!inv.trim()} onClick={link}>Link</Btn></div></Field>
        </div>}
        <Field label="Staff note (not shown to the customer)"><div className="row" style={{ gap: 8 }}><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /><Btn busy={busy} disabled={note === (o.staff_note || '')} onClick={() => act({ staff_note: note }, 'Note saved')}>Save</Btn></div></Field>
        <div className="worder-log">
          <h3>History</h3>
          <ol>{o.log.map((l, i) => <li key={i}><b>{STATUS[l.status]?.[0] || l.status}</b>{l.note ? ` — ${l.note}` : ''} <span className="muted">· {fdatetime(l.at)} · {l.by}</span></li>)}</ol>
        </div>
      </div>
    </Modal>
  );
}
