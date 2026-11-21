import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, fdate, fdatetime, today, round2 } from '../lib/format';
import DataTable from '../components/DataTable';
import { useApi, PageHead, Btn, Field, ErrorBox, Badge, Loading, useAction, Modal, Tabs, useConfirm } from '../components/ui';
import { ProductSearch } from '../components/widgets';

const STATUS = { new: ['New', 'info'], confirmed: ['To ship', 'warn'], shipped: ['With courier', 'info'], delivered: ['Delivered', 'ok'], settled: ['Paid by courier', 'ok'], returned: ['Returned', 'bad'], cancelled: ['Cancelled', 'muted'] };
const TABS = ['all', 'new', 'confirmed', 'shipped', 'delivered', 'settled', 'returned', 'cancelled'];
const tk = (v) => money(v, false);

/** Sales → Online orders: Facebook / website / phone orders, courier booking and cash on delivery. */
export default function OnlineOrders() {
  const q = useApi('orders.list', {}, []);
  const [tab, setTab] = useState('all');
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null);
  const d = q.data;
  const rows = useMemo(() => (d ? d.orders.filter((o) => tab === 'all' || o.status === tab) : []), [d, tab]);
  const changed = (o) => { q.reload(); if (o) setOpen(o); };
  return (
    <>
      <PageHead title="Online orders" sub="Orders from Facebook, the website or the phone: confirm into an invoice, hand to the courier, collect the cash on delivery.">
        <Btn kind="primary" onClick={() => setForm({})}>+ New order</Btn>
      </PageHead>
      <ErrorBox error={q.error} onRetry={q.reload} />
      {q.loading && !d ? <Loading label="Reading online orders" /> : d && <>
        <div className="db-sum">
          <div className="card"><span>New orders</span><b className="num">{d.counts.new}</b><small>to confirm</small></div>
          <div className="card"><span>To ship</span><b className="num">{d.counts.confirmed}</b><small>invoice made, not with a courier yet</small></div>
          <div className="card"><span>Cash with couriers</span><b className="num">{money(d.cod_with_courier)}</b><small>{d.counts.shipped + d.counts.delivered} parcels out</small></div>
          <div className="card in"><span>Delivered, not paid yet</span><b className="num">{money(d.cod_delivered)}</b><small>{d.counts.delivered} parcels — settle when the courier pays</small></div>
        </div>
        <div className="row" style={{ marginBottom: 10 }}>
          <Tabs tabs={TABS.map((t) => [t, t === 'all' ? `All · ${d.orders.length}` : `${STATUS[t][0]} · ${d.counts[t] || 0}`])} value={tab} onChange={setTab} />
        </div>
        <DataTable title="Online orders" rows={rows} onRowClick={setOpen}
          columns={[
            { key: 'no', label: 'Order' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'source', label: 'From' },
            { key: 'customer', label: 'Customer', value: (o) => `${o.customer.name} ${o.customer.phone}`, render: (o) => <><b>{o.customer.name}</b><small className="muted"> {o.customer.phone}</small></> },
            { key: 'items', label: 'Items', value: (o) => o.items.map((i) => `${i.name} ×${i.qty}`).join(', ') },
            { key: 'total', label: 'Total', type: 'money' }, { key: 'cod', label: 'COD', type: 'money' },
            { key: 'courier', label: 'Courier', value: (o) => (o.courier ? `${o.courier.label} ${o.courier.tracking}` : o.courier_label || '') },
            { key: 'status', label: 'Status', value: (o) => STATUS[o.status]?.[0] || o.status, render: (o) => <Badge tone={STATUS[o.status]?.[1]}>{STATUS[o.status]?.[0] || o.status}</Badge> }
          ]} />
      </>}
      {form && d && <OrderForm initial={form} sources={d.sources} couriers={d.couriers} onClose={() => setForm(null)} onSaved={(o) => { setForm(null); changed(o); }} />}
      {open && d && <OrderView o={open} couriers={d.couriers} onClose={() => setOpen(null)} onChanged={changed} onEdit={(o) => { setOpen(null); setForm(o); }} />}
    </>
  );
}

function OrderForm({ initial, sources, couriers, onClose, onSaved }) {
  const { accounts, products } = useStore();
  const mfs = accounts.find((a) => a.type === 'mfs') || accounts[0];
  const [f, setF] = useState(() => ({
    source: initial.source || 'Facebook', name: initial.customer?.name || '', phone: initial.customer?.phone || '', address: initial.customer?.address || '', area: initial.customer?.area || '',
    items: (initial.items || []).map((i) => ({ product_id: i.product_id, name: i.name, qty: String(i.qty), price: String(i.price) })),
    delivery_charge: initial.delivery_charge ?? '', discount: initial.discount || '', advance: initial.advance || '', advance_account_id: initial.advance_account_id || mfs?.id || '',
    courier: initial.courier_choice || '', weight: initial.weight || '0.5', note: initial.note || ''
  }));
  const [busy, run] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const add = (p) => {
    if (f.items.some((i) => i.product_id === p.id)) return setF({ ...f, items: f.items.map((i) => (i.product_id === p.id ? { ...i, qty: String((Number(i.qty) || 0) + 1) } : i)) });
    setF({ ...f, items: [...f.items, { product_id: p.id, name: p.name, qty: '1', price: String(p.sale_price || 0) }] });
  };
  const setItem = (id, k, v) => setF({ ...f, items: f.items.map((i) => (i.product_id === id ? { ...i, [k]: v } : i)) });
  // As order.save works it out: each price to 2 decimals, the products added up, then rounded.
  const subtotal = round2(f.items.reduce((s, i) => s + (Number(i.qty) || 0) * round2(Number(i.price) || 0), 0));
  const total = round2(subtotal + round2(Number(f.delivery_charge) || 0) - round2(Number(f.discount) || 0));
  const cod = round2(total - round2(Number(f.advance) || 0));
  const save = async () => {
    const o = await run(() => api('order.save', { id: initial.id, source: f.source, customer: { name: f.name, phone: f.phone, address: f.address, area: f.area },
      items: f.items.map((i) => ({ product_id: i.product_id, qty: i.qty, price: i.price })), delivery_charge: f.delivery_charge, discount: f.discount,
      advance: f.advance, advance_account_id: Number(f.advance) > 0 ? f.advance_account_id : '', courier: f.courier, weight: f.weight, note: f.note }), initial.id ? 'Order updated' : 'Order saved');
    if (o) onSaved(o);
  };
  const stockOf = (id) => products.find((p) => p.id === id);
  return (
    <Modal open size="lg" title={initial.id ? `Edit ${initial.no}` : 'New online order'} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save} disabled={!f.items.length || f.items.some((i) => !(Number(i.price) > 0))}>Save order</Btn></>}>
      <div className="oo-form">
        <div className="oo-cols">
          <Field label="Order from"><select value={f.source} onChange={set('source')} aria-label="Order from">{sources.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label={<>Customer name <span className="req">*</span></>}><input value={f.name} onChange={set('name')} maxLength={120} aria-label="Customer name" /></Field>
          <Field label={<>Mobile <span className="req">*</span></>}><input value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="01XXXXXXXXX" aria-label="Mobile" /></Field>
        </div>
        <div className="oo-cols two">
          <Field label={<>Delivery address <span className="req">*</span></>}><textarea rows={2} value={f.address} onChange={set('address')} maxLength={400} aria-label="Delivery address" placeholder="House, road, area, thana, district" /></Field>
          <Field label="Area / district"><input value={f.area} onChange={set('area')} maxLength={120} aria-label="Area" placeholder="e.g. Mirpur, Dhaka" /></Field>
        </div>
        <ProductSearch onPick={add} placeholder="Add a product: search by name, model or scan" />
        {f.items.length > 0 && <table className="dc-hist oo-items"><thead><tr><th>Product</th><th className="r">In stock</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Total</th><th /></tr></thead>
          <tbody>{f.items.map((i) => { const p = stockOf(i.product_id); return (
            <tr key={i.product_id}><td>{i.name}</td><td className="r muted">{p?.service ? '—' : p?.available ?? p?.stock ?? ''}</td>
              <td className="r"><input className="sc-in" type="number" min="0" step="any" value={i.qty} onChange={(e) => setItem(i.product_id, 'qty', e.target.value)} aria-label={`Quantity of ${i.name}`} /></td>
              <td className="r"><input className={`sc-in ${Number(i.price) > 0 ? '' : 'bad'}`} type="number" min="0" step="any" value={i.price} onChange={(e) => setItem(i.product_id, 'price', e.target.value)} aria-label={`Price of ${i.name}`} title={Number(i.price) > 0 ? '' : 'The price must be more than 0'} /></td>
              <td className="r num">{tk((Number(i.qty) || 0) * (Number(i.price) || 0))}</td>
              <td className="r"><Btn size="sm" kind="danger" onClick={() => setF({ ...f, items: f.items.filter((x) => x.product_id !== i.product_id) })} aria-label={`Remove ${i.name}`}>×</Btn></td></tr>); })}</tbody></table>}
        <div className="oo-cols four">
          <Field label="Delivery charge"><input type="number" min="0" value={f.delivery_charge} onChange={set('delivery_charge')} placeholder="0" aria-label="Delivery charge" /></Field>
          <Field label="Discount"><input type="number" min="0" value={f.discount} onChange={set('discount')} placeholder="0" aria-label="Discount" /></Field>
          <Field label="Advance paid"><input type="number" min="0" value={f.advance} onChange={set('advance')} placeholder="0" aria-label="Advance paid" /></Field>
          <Field label="Advance received in"><select value={f.advance_account_id} onChange={set('advance_account_id')} disabled={!(Number(f.advance) > 0)} aria-label="Advance received in">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        </div>
        <div className="oo-cols three">
          <Field label="Courier (plan)"><select value={f.courier} onChange={set('courier')} aria-label="Courier plan"><option value="">Decide later</option>{couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Weight (kg)"><input type="number" min="0.1" step="0.1" value={f.weight} onChange={set('weight')} aria-label="Weight" /></Field>
          <Field label="Note"><input value={f.note} onChange={set('note')} maxLength={500} placeholder="Size, colour, delivery time…" aria-label="Note" /></Field>
        </div>
        <div className="oo-totals"><span>Products {tk(subtotal)}</span><span>+ Delivery {tk(Number(f.delivery_charge) || 0)}</span><span>− Discount {tk(Number(f.discount) || 0)}</span><b>Total {money(total)}</b><span>− Advance {tk(Number(f.advance) || 0)}</span><b className="cod">Cash on delivery {money(cod)}</b></div>
      </div>
    </Modal>
  );
}

function OrderView({ o, couriers, onClose, onChanged, onEdit }) {
  const can = useStore((s) => s.can);
  const nav = useNavigate();
  const [dlg, setDlg] = useState('');
  const [busy, run] = useAction();
  const [confirmUI, ask] = useConfirm();
  const [serials, setSerials] = useState({});
  const act = async (action, payload, msg) => { const r = await run(() => api(action, { id: o.id, ...payload }), msg); if (r) onChanged(r); return r; };
  const serialItems = o.items.filter((i) => i.serial);
  const confirm = async () => act('order.confirm', { serials }, `Invoice made for ${o.no}`);
  const cancel = async () => { if (await ask({ title: `Cancel ${o.no}?`, message: 'The order stays in the list as cancelled. Stock is not touched (no invoice was made).', confirmLabel: 'Cancel order' })) act('order.cancel', { reason: 'Cancelled' }, 'Order cancelled'); };
  const [st, tone] = STATUS[o.status] || [o.status, 'muted'];
  return (
    <Modal open size="lg" title={`${o.no} — ${o.customer.name}`} onClose={onClose}
      footer={<>
        {o.sale_id && <Btn onClick={() => nav(`/sales/${o.sale_id}`)}>Open invoice {o.invoice_no}</Btn>}
        {o.status === 'new' && <><Btn kind="danger" onClick={cancel}>Cancel order</Btn><Btn onClick={() => onEdit(o)}>Edit</Btn><Btn kind="primary" busy={busy} onClick={confirm} disabled={serialItems.some((i) => !(serials[i.product_id] || '').trim())}>✓ Confirm & make invoice</Btn></>}
        {o.status === 'confirmed' && <><Btn onClick={() => setDlg('return')}>Parcel came back</Btn><Btn kind="primary" onClick={() => setDlg('ship')}>🚚 Send with courier</Btn></>}
        {(o.status === 'shipped' || o.status === 'delivered') && <>
          <Btn onClick={() => setDlg('return')}>Parcel came back</Btn>
          {o.courier?.by_api && <Btn busy={busy} onClick={() => act('courier.call', { op: 'track' }, 'Status updated')}>↻ Check status</Btn>}
          {o.status === 'shipped' && <Btn onClick={() => act('order.deliver', {}, 'Marked delivered')}>Mark delivered</Btn>}
          {can('customers') && <Btn kind="primary" onClick={() => setDlg('settle')}>Courier paid</Btn>}
        </>}
      </>}>
      <div className="oo-view">
        <div>
          <p className="oo-st"><Badge tone={tone}>{st}</Badge> <span className="muted">{o.source} · {fdate(o.date)} · by {o.created_by}</span>{o.sale_status === 'cancelled' && <Badge tone="bad">Invoice cancelled</Badge>}</p>
          <p><b>{o.customer.name}</b> · {o.customer.phone}<br />{o.customer.address}{o.customer.area ? `, ${o.customer.area}` : ''}</p>
          <table className="dc-hist"><tbody>{o.items.map((i) => <tr key={i.product_id}><td>{i.name}</td><td className="r">{i.qty} × {tk(i.price)}</td><td className="r num">{tk(i.qty * i.price)}</td></tr>)}
            {o.delivery_charge > 0 && <tr><td>Delivery charge</td><td /><td className="r num">{tk(o.delivery_charge)}</td></tr>}
            {o.discount > 0 && <tr><td>Discount</td><td /><td className="r num">−{tk(o.discount)}</td></tr>}
            <tr><th>Total</th><th /><th className="r num">{money(o.total)}</th></tr>
            {o.advance > 0 && <tr><td>Advance paid</td><td /><td className="r num">−{tk(o.advance)}</td></tr>}
            <tr><th>Cash on delivery</th><th /><th className="r num">{money(o.cod)}</th></tr></tbody></table>
          {o.note && <p><b>Note:</b> {o.note}</p>}
          {o.status === 'new' && serialItems.length > 0 && <div className="oo-serials">
            <p className="muted">Serial numbers of the pieces to send:</p>
            {serialItems.map((i) => <Field key={i.product_id} label={`${i.name} — ${i.qty} serial(s)`}><input value={serials[i.product_id] || ''} onChange={(e) => setSerials({ ...serials, [i.product_id]: e.target.value })} placeholder="SN1, SN2" aria-label={`Serials of ${i.name}`} /></Field>)}
          </div>}
        </div>
        <div>
          {o.courier && <div className="oo-courier"><b>{o.courier.label}</b> · {o.courier.tracking}{o.courier.status && <> · <Badge tone="info">{o.courier.status}</Badge></>}
            <small className="muted">Booked {fdatetime(o.courier.booked_at)} by {o.courier.booked_by}{o.courier.by_api ? ' through the API' : ''}{o.courier.checked_at && o.courier.by_api ? ` · checked ${fdatetime(o.courier.checked_at)}` : ''}</small></div>}
          {o.settlement && <div className="oo-courier"><b>Courier paid {money(o.settlement.received)}</b><small className="muted">COD {tk(o.settlement.collected)} − charge {tk(o.settlement.charge)} into {o.settlement.account_name} · {fdate(o.settlement.date)}</small></div>}
          <h4 style={{ margin: '10px 0 6px' }}>History</h4>
          <ol className="oo-hist">{(o.history || []).slice().reverse().map((h, n) => <li key={n}><b>{STATUS[h.status]?.[0] || h.status}</b> <span className="muted">· {fdatetime(h.at)} · {h.by}</span>{h.note && <div>{h.note}</div>}</li>)}</ol>
        </div>
      </div>
      {dlg === 'ship' && <ShipDialog o={o} couriers={couriers} onClose={() => setDlg('')} onDone={(r) => { setDlg(''); onChanged(r); }} />}
      {dlg === 'settle' && <SettleDialog o={o} onClose={() => setDlg('')} onDone={(r) => { setDlg(''); onChanged(r); }} />}
      {dlg === 'return' && <ReturnDialog o={o} onClose={() => setDlg('')} onDone={(r) => { setDlg(''); onChanged(r); }} />}
      {confirmUI}
    </Modal>
  );
}

function ShipDialog({ o, couriers, onClose, onDone }) {
  const admin = useStore((state) => state.user?.role === 'admin');
  const [unconfirmed, setUnconfirmed] = useState(!!o.booking_pending);
  const [resetForm, setResetForm] = useState(false);
  const [clear, setClear] = useState({ password: '', reason: '', confirm: '' });
  const [courier, setCourier] = useState(o.courier_choice || (couriers.find((c) => c.api) || couriers[0]).id);
  const c = couriers.find((x) => x.id === courier);
  const [manual, setManual] = useState(!c?.api);
  const [tracking, setTracking] = useState('');
  const [name, setName] = useState('');
  const [charge, setCharge] = useState('');
  const [lists, setLists] = useState({});
  const [pick, setPick] = useState({ city_id: '', zone_id: '', area_id: '', area_name: '' });
  const [areaQ, setAreaQ] = useState('');
  const [busy, run] = useAction();
  const useApiBook = c?.api && !manual;
  useEffect(() => { setManual(!c?.api); setPick({ city_id: '', zone_id: '', area_id: '', area_name: '' }); }, [courier]);
  const load = async (op, extra = {}) => { const r = await run(() => api('courier.call', { op, courier, ...extra })); if (r) setLists((l) => ({ ...l, [op]: r })); };
  useEffect(() => {
    if (!useApiBook) return;
    if (courier === 'pathao' && !lists.cities) load('cities');
    if (courier === 'redx' && !lists.areas) load('areas');
  }, [useApiBook, courier]);
  const submit = async () => {
    try {
    const r = useApiBook
      ? await run(() => api('courier.call', { op: 'book', courier, id: o.id, ...pick }), `Booked with ${c.name}`)
      : await run(() => api('order.ship', { id: o.id, courier, courier_name: name, tracking, charge }), 'Marked as sent');
    if (r) onDone(r);
    } catch (error) { if (error.uncertain && useApiBook) setUnconfirmed(true); }
  };
  const redxAreas = (lists.areas || []).filter((a) => !areaQ || a.name.toLowerCase().includes(areaQ.toLowerCase())).slice(0, 200);
  const ready = useApiBook ? (courier === 'steadfast' || (courier === 'pathao' && pick.city_id && pick.zone_id) || (courier === 'redx' && pick.area_id)) : tracking.trim();
  return (
    <Modal open size="md" title={`Send ${o.no} with a courier`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!ready} onClick={submit}>{useApiBook ? `Book with ${c.name} · COD ${tk(o.cod)}` : 'Save tracking'}</Btn></>}>
      <div className="form">
        {unconfirmed && <div className="wide note" role="alert">
          <b>Booking result needs checking</b>
          <p>Check the courier portal. If the parcel exists, select manual entry below and enter its tracking number. Retrying checks the saved result and will not send an unresolved booking again.</p>
          {admin && <Btn size="sm" onClick={() => setResetForm(!resetForm)}>I checked: no booking exists</Btn>}
          {admin && resetForm && <div className="form" style={{marginTop:10}}>
            <Field label="Administrator password"><input type="password" value={clear.password} onChange={e=>setClear({...clear,password:e.target.value})} /></Field>
            <Field label="Why is another attempt safe?"><input value={clear.reason} onChange={e=>setClear({...clear,reason:e.target.value})} /></Field>
            <Field label="Type NOT BOOKED"><input value={clear.confirm} onChange={e=>setClear({...clear,confirm:e.target.value})} /></Field>
            <Btn busy={busy} disabled={!clear.password||clear.reason.trim().length<5||clear.confirm!=='NOT BOOKED'} onClick={async()=>{try{const r=await run(()=>api('courier.reset',{id:o.id,...clear}),'Another booking attempt is allowed');if(r)onDone(r);}catch{}}}>Allow another attempt</Btn>
          </div>}
        </div>}
        <Field label="Courier" wide><div className="oo-couriers" role="radiogroup" aria-label="Courier">{couriers.map((x) => (
          <label key={x.id} className={`sh-mode ${courier === x.id ? 'on' : ''}`}><input type="radio" name="courier" checked={courier === x.id} onChange={() => setCourier(x.id)} />
            <span><b>{x.name}</b><small>{x.id === 'other' ? 'Any courier, by hand' : x.api ? 'API ready — book from here' : 'No API keys — by hand'}</small></span></label>))}</div></Field>
        {c?.api && <label className="check wide"><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> I already booked it on the {c.name} website — just write the tracking number</label>}
        {useApiBook && courier === 'steadfast' && <p className="muted wide">Steadfast books with the customer's address, phone and the cash on delivery ({money(o.cod)}).</p>}
        {useApiBook && courier === 'pathao' && <>
          <Field label="City"><select value={pick.city_id} onChange={(e) => { setPick({ ...pick, city_id: e.target.value, zone_id: '', area_id: '' }); setLists((l) => ({ ...l, zones: null, areas: null })); if (e.target.value) load('zones', { city_id: e.target.value }); }} aria-label="Pathao city">
            <option value="">{lists.cities ? 'Choose the city' : 'Loading…'}</option>{(lists.cities || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Field label="Zone"><select value={pick.zone_id} onChange={(e) => { setPick({ ...pick, zone_id: e.target.value, area_id: '' }); setLists((l) => ({ ...l, areas: null })); if (e.target.value) load('areas', { zone_id: e.target.value }); }} aria-label="Pathao zone" disabled={!pick.city_id}>
            <option value="">Choose the zone</option>{(lists.zones || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Field label="Area (optional)"><select value={pick.area_id} onChange={(e) => setPick({ ...pick, area_id: e.target.value })} aria-label="Pathao area" disabled={!pick.zone_id}>
            <option value="">—</option>{(lists.areas || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        </>}
        {useApiBook && courier === 'redx' && <>
          <Field label="Find the delivery area"><input value={areaQ} onChange={(e) => setAreaQ(e.target.value)} placeholder={lists.areas ? 'Type the area or post code' : 'Loading areas…'} aria-label="Find RedX area" /></Field>
          <Field label="Delivery area"><select value={pick.area_id} onChange={(e) => { const a = (lists.areas || []).find((x) => String(x.id) === e.target.value); setPick({ ...pick, area_id: e.target.value, area_name: a?.raw || '' }); }} aria-label="RedX area">
            <option value="">Choose the area</option>{redxAreas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        </>}
        {!useApiBook && <>
          {courier === 'other' && <Field label="Courier name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sundarban, SA Paribahan" aria-label="Courier name" /></Field>}
          <Field label="Tracking / consignment no."><input value={tracking} onChange={(e) => setTracking(e.target.value)} aria-label="Tracking number" /></Field>
          <Field label="Courier charge (if known)"><input type="number" min="0" value={charge} onChange={(e) => setCharge(e.target.value)} placeholder="0" aria-label="Courier charge" /></Field>
        </>}
      </div>
    </Modal>
  );
}

function SettleDialog({ o, onClose, onDone }) {
  const { accounts } = useStore();
  const [account, setAccount] = useState((accounts.find((a) => a.type === 'mfs') || accounts[0])?.id || '');
  const [charge, setCharge] = useState(String(o.courier?.charge || ''));
  const [collected, setCollected] = useState(String(o.cod));
  const [date, setDate] = useState(today());
  const [busy, run] = useAction();
  const received = (Number(collected) || 0) - (Number(charge) || 0);
  const submit = async () => { const r = await run(() => api('order.settle', { id: o.id, account_id: account, charge: charge || 0, collected, date }), `${o.no} settled`); if (r) onDone(r); };
  return (
    <Modal open size="sm" title={`Courier paid — ${o.no}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={submit} disabled={!account || received < 0}>Save · {money(received)} received</Btn></>}>
      <div className="form">
        <Field label="Cash collected from the customer" wide><input type="number" min="0" value={collected} onChange={(e) => setCollected(e.target.value)} aria-label="Cash collected" /></Field>
        <Field label="Courier charge" wide><input type="number" min="0" value={charge} onChange={(e) => setCharge(e.target.value)} placeholder="0" aria-label="Courier charge" /></Field>
        <Field label="Paid into" wide><select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Paid into">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Date" wide><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} aria-label="Date" /></Field>
        <p className="muted wide">The customer's due of {money(o.cod)} is collected; the courier charge is saved as an expense ("Courier charge").</p>
      </div>
    </Modal>
  );
}

function ReturnDialog({ o, onClose, onDone }) {
  const { accounts } = useStore();
  const [charge, setCharge] = useState('');
  const [account, setAccount] = useState(accounts[0]?.id || '');
  const [note, setNote] = useState('');
  const [busy, run] = useAction();
  const submit = async () => { const r = await run(() => api('order.return', { id: o.id, charge: charge || 0, account_id: account, note }), `${o.no} returned to stock`); if (r) onDone(r); };
  return (
    <Modal open size="sm" title={`Parcel came back — ${o.no}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="danger" busy={busy} onClick={submit}>Take it back</Btn></>}>
      <div className="form">
        <p className="muted wide">Everything on invoice {o.invoice_no} goes back to stock and the customer's due is cleared.{o.advance > 0 ? ` The advance of ${money(o.advance)} stays as the customer's credit.` : ''}</p>
        <Field label="Return charge to the courier" wide><input type="number" min="0" value={charge} onChange={(e) => setCharge(e.target.value)} placeholder="0" aria-label="Return charge" /></Field>
        {Number(charge) > 0 && <Field label="Paid from" wide><select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Paid from">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
        <Field label="Why" wide><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Customer refused" aria-label="Why it came back" /></Field>
      </div>
    </Modal>
  );
}
