import { useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import DateInput from '../components/DateInput';
import PartyPicker from '../components/PartyPicker';
import { api } from '../lib/api';
import { quantityTotal } from '../lib/quantityTotals';
import { Badge, Btn, ClearFiltersButton, ErrorBox, Field, Loading, Modal, PageHead, useAction, useApi } from '../components/ui';
import { printHtml, printFonts } from '../lib/export';
import { fdate, fdatetime, money, splitList } from '../lib/format';
import { shopDay, useStore } from '../lib/store';
import { deliveryChallanHtml } from '../lib/deliveryChallan';

const TITLES = { info: 'Courier Information', challan: 'Delivery Challan', report: 'Delivery Report' };
const STATUS = {
  confirmed: 'To ship', shipped: 'With courier', delivered: 'Delivered',
  settled: 'Paid by courier', returned: 'Returned', cancelled: 'Cancelled'
};
const courierName = (order) => order.courier?.label || order.courier_label || '';
const bookingLabel = (o) => o.booking === 'cash' ? 'Paid' : o.booking === 'due' ? 'Due' : '';
const ORDER_COLUMNS = [
  { key: 'no', label: 'Order / challan' },
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'invoice_no', label: 'Invoice' },
  { key: 'customer', label: 'Customer', value: (o) => o.customer?.name || '' },
  { key: 'courier', label: 'Courier', value: courierName },
  { key: 'tracking', label: 'Tracking', value: (o) => o.courier?.tracking || '' },
  { key: 'status', label: 'Status', value: (o) => o.manual ? 'Booked' : STATUS[o.status] || o.status }
];
const REPORT_COLUMNS = [
  { key: 'source', label: 'Source', value: (o) => o.manual ? 'Manual' : 'Online' },
  ...ORDER_COLUMNS.filter((c) => c.key !== 'date'),
  { key: 'items', label: 'Products', value: (o) => (o.items || []).map((i) => i.name + ' × ' + i.qty).join(', ') },
  { key: 'qty', label: 'Quantity', value: (o) => quantityTotal(o.items || []), sum: true, total: (rows) => quantityTotal(rows.flatMap((o) => o.items || [])) },
  { key: 'booking', label: 'Booking payment', value: bookingLabel },
  { key: 'booked', label: 'Booking date', type: 'date', value: (o) => o.courier?.booked_at?.slice(0, 10) || '' },
  { key: 'providerStatus', label: 'Courier status', value: (o) => o.courier?.status || '' },
  { key: 'cod', label: 'COD', type: 'money' },
  { key: 'charge', label: 'Courier charge', type: 'money', value: (o) => o.settlement?.charge ?? o.return_charge ?? o.courier?.charge ?? 0 },
  { key: 'received', label: 'Received', type: 'money', sum: true, value: (o) => o.settlement?.received ?? 0 }
];

const STAGES = [['confirmed', 'To Ship', 'warn'], ['shipped', 'In Transit', 'info'], ['delivered', 'Delivered', 'ok'], ['returned', 'Returned', 'bad']];
const RATES = [['inside', 'Inside Dhaka'], ['outside', 'Outside Dhaka'], ['cod', 'COD fee (%)'], ['return_fee', 'Return fee']];

function CourierHub() {
  const overview = useApi('orders.list', { courier_overview: true }, [], { refreshMs: 60000 });
  const canTest = useStore((state) => state.can('settings'));
  const isAdmin = useStore((state) => state.user?.role === 'admin');
  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState({ query: '', courier: '' });
  const [editor, setEditor] = useState(null);
  const [busy, run] = useAction();
  const searchRef = useRef(null);
  const results = useApi('orders.list', { tracking_query: lookup.query, tracking_courier: lookup.courier, include_manual: true }, [], { skip: !lookup.query });
  const couriers = overview.data?.couriers || [];
  const parcels = [...(results.data?.orders || []), ...(results.data?.manual || [])];

  async function check(payload) {
    try {
      await run(() => api('courier.call', payload), payload.op === 'test' ? 'Connection verified' : 'Tracking updated');
      await Promise.all([overview.reload(), results.reload()]);
    } catch { /* useAction displays the error. */ }
  }

  return <>
    <PageHead title="Courier Information" sub="Track parcels, compare rates and review delivery activity.">
      <Link className="btn" to="/online-orders">Online Orders</Link>
    </PageHead>
    <ErrorBox error={overview.error} onRetry={overview.reload} />
    {!overview.data && !overview.error && <Loading label="Reading courier information" />}
    {overview.data && <div className="courier-hub">
      <section aria-label="Today's online delivery activity">
        <h2>Today’s online delivery activity <small className="muted">{fdate(overview.data.activity_day)}</small></h2>
        <div className="courier-hub-grid">
          {STAGES.map(([id, label, tone]) => <Link className="card courier-hub-metric" key={id}
            to={`/delivery-report?activity=${id}&day=${overview.data.activity_day}`}>
            <Badge tone={tone}>{label}</Badge><strong>{overview.data.activity_counts?.[id] ?? '—'}</strong><small>View report →</small>
          </Link>)}
        </div>
      </section>
      <section className="card" aria-label="Track a parcel">
        <h2>Track a parcel</h2>
        <form className="courier-hub-search" onSubmit={(event) => {
          event.preventDefault();
          const value = query.trim();
          if (value.length < 2) return;
          if (value === lookup.query) results.reload();
          else setLookup({ ...lookup, query: value });
        }}>
          <Field label="Tracking ID, Order ID or Challan No."><input type="search" ref={searchRef} maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} /></Field>
          <Field label="Courier"><select value={lookup.courier} onChange={(event) => setLookup({ ...lookup, courier: event.target.value })}>
            <option value="">All couriers</option>
            {couriers.map((courier) => <option key={courier.id} value={courier.id}>{courier.name}</option>)}
          </select></Field>
          <Btn kind="primary" type="submit" disabled={query.trim().length < 2} busy={Boolean(lookup.query && results.loading)}>Search</Btn>
        </form>
        <ErrorBox error={results.error} onRetry={results.reload} />
        {lookup.query && !results.loading && !results.error && results.data && <div aria-live="polite">
          <p className="muted">{results.data.tracking_total ? `Showing ${parcels.length} of ${results.data.tracking_total} parcels` : 'No matching parcels.'}</p>
          {parcels.map((parcel) => {
            const latest = [parcel.courier?.checked_at, parcel.updated_at, parcel.created_at, parcel.date].filter(Boolean).sort().at(-1);
            return <article className="courier-hub-parcel" key={parcel.id}>
              <div><strong>{parcel.no}</strong><small>{courierName(parcel) || 'Courier not assigned'}{parcel.courier?.tracking ? ` · ${parcel.courier.tracking}` : ''}</small></div>
              <div><Badge>{parcel.manual ? 'Booked manually' : STATUS[parcel.status] || parcel.status}</Badge>
                {parcel.courier?.status && <small>Provider: {parcel.courier.status}</small>}
                {latest && <small>Updated {fdatetime(latest)}</small>}</div>
              {parcel.courier?.by_api && <Btn size="sm" disabled={busy} onClick={() => check({ op: 'track', id: parcel.id })}>Refresh status</Btn>}
            </article>;
          })}
        </div>}
      </section>
      <section aria-label="Courier providers">
        <h2>Courier providers</h2>
        <div className="courier-hub-grid">
          {couriers.map((courier) => <article className="card courier-hub-provider" key={courier.id}>
            <header><h3>{courier.name}</h3><Badge tone={courier.api ? 'ok' : 'muted'}>{courier.api ? 'API configured' : 'Manual'}</Badge></header>
            <dl className="courier-hub-rates">{RATES.map(([key, label]) => <div key={key}><dt>{label}</dt>
              <dd>{courier.rates?.[key] == null ? '—' : key === 'cod' ? `${courier.rates[key]}%` : money(courier.rates[key])}</dd></div>)}</dl>
            {courier.rates?.terms && <p className="muted">{courier.rates.terms}</p>}
            {courier.api && <small>{courier.checked_at ? `Last successful check · ${fdatetime(courier.checked_at)}` : 'Connection has not been checked'}</small>}
            <div className="courier-hub-actions">
              <Btn size="sm" onClick={() => { setLookup({ ...lookup, courier: courier.id }); searchRef.current?.focus(); }}>Track Parcel</Btn>
              <Link className="btn btn-sm" to={`/online-orders?courier=${courier.id}`}>View Orders</Link>
              <Link className="btn btn-sm" to={`/delivery-challan?create=${courier.id}`}>Create Challan</Link>
              {canTest && isAdmin && <Btn size="sm" onClick={() => setEditor(courier)}>Edit rates</Btn>}
              {canTest && courier.api && <Btn size="sm" disabled={busy} onClick={() => check({ op: 'test', courier: courier.id })}>Test API</Btn>}
            </div>
          </article>)}
        </div>
      </section>
    </div>}
    {editor && <CourierRateForm courier={editor} onClose={() => setEditor(null)} onSaved={overview.reload} />}
  </>;
}

function CourierRateForm({ courier, onClose, onSaved }) {
  const [rates, setRates] = useState(courier.rates || {});
  const [busy, run] = useAction();
  const form = useId();
  async function save(event) {
    event.preventDefault();
    try {
      await run(() => api('settings.save', { values: { [`courier_rates_${courier.id}`]: rates } }), 'Courier rates saved');
      onSaved();
      onClose();
    } catch { /* useAction displays the error. */ }
  }
  return <Modal open size="sm" title={`Rates · ${courier.name}`} onClose={onClose}
    footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} type="submit" form={form}>Save rates</Btn></>}>
    <form id={form} className="courier-hub-rate-form" onSubmit={save}>
      <div className="courier-hub-rates">{RATES.map(([key, label]) => <Field key={key} label={label}>
        <input type="number" min="0" max={key === 'cod' ? 100 : 1000000} step="0.01" value={rates[key] ?? ''}
          onChange={(event) => setRates({ ...rates, [key]: event.target.value })} />
      </Field>)}</div>
      <Field label="Terms" hint="Reference rates. Leave an unknown value blank."><textarea rows={3} maxLength={500} value={rates.terms || ''}
        onChange={(event) => setRates({ ...rates, terms: event.target.value })} /></Field>
    </form>
  </Modal>;
}

export default function Courier({ mode }) {
  return mode === 'info' ? <CourierHub /> : <CourierDeliveries mode={mode} />;
}

function CourierDeliveries({ mode }) {
  const [params, setParams] = useSearchParams();
  const stage = mode === 'report' && STAGES.find(([id]) => id === params.get('activity'));
  const day = stage && /^\d{4}-\d{2}-\d{2}$/.test(params.get('day') || '') ? params.get('day') : '';
  const preset = mode === 'challan' ? params.get('create') : '';
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [courier, setCourier] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [booking, setBooking] = useState('');
  const [selected, setSelected] = useState(null);
  const [manual, setManual] = useState(false);
  const report = mode === 'report';
  const invalidDates = Boolean(!day && from && to && from > to);
  const q = useApi('orders.list', { ...(report ? { ...(day ? { activity_day: day, activity_status: stage[0] } : { from, to }), delivery_report: true } : {}), include_manual: !day }, [], { skip: invalidDates });
  const orders = q.data?.orders || [];
  const deliveries = [...(q.data?.manual || []), ...orders.filter((o) => o.status === 'confirmed' || o.courier)];
  const names = [...new Set(deliveries.map(courierName).filter(Boolean))].sort();
  const rows = day ? orders : report
    ? deliveries.filter((o) => (!source || source === (o.manual ? 'manual' : 'online')) &&
        (!courier || courierName(o) === courier) && (!status || status === (o.manual ? 'booked' : o.status)) &&
        (!booking || o.booking === booking))
    : deliveries.filter((o) => o.manual || (o.sale_id && ['confirmed', 'shipped', 'delivered', 'settled'].includes(o.status)));
  const reportTitle = source ? (source === 'manual' ? 'Manual Courier Delivery Report' : 'Online Order Delivery Report') : TITLES.report;

  return <>
    <PageHead title={TITLES[mode]}>
      {mode === 'challan' && <Btn kind="primary" onClick={() => setManual(true)}>+ Manual Challan</Btn>}
      <Link className="btn" to="/online-orders">Online Orders</Link>
    </PageHead>
    {day && <div className="card row"><strong>{stage[1]} · {fdate(day)}</strong>
      <span className="muted">Parcels that reached this stage on the selected day.</span>
      <Btn size="sm" onClick={() => setParams({}, { replace: true })}>Clear activity</Btn></div>}
    {report && !day && <div className="card row courier-report-filters">
      <Field label="Delivery source"><select aria-label="Delivery source" value={source} onChange={(e) => { setSource(e.target.value); setBooking(''); setStatus(''); }}>
        <option value="">All deliveries</option><option value="online">Online orders</option><option value="manual">Manual bookings</option>
      </select></Field>
      <Field label="Booking date from"><DateInput value={from} onChange={(e) => { setFrom(e.target.value); setCourier(''); }} /></Field>
      <Field label="Booking date to"><DateInput value={to} onChange={(e) => { setTo(e.target.value); setCourier(''); }} /></Field>
      <Field label="Courier"><select aria-label="Courier" value={courier} onChange={(e) => setCourier(e.target.value)}>
        <option value="">All couriers</option>{names.map((name) => <option key={name}>{name}</option>)}
      </select></Field>
      <Field label="Delivery status"><select aria-label="Delivery status" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All statuses</option>{source !== 'online' && <option value="booked">Booked</option>}
        {source !== 'manual' && Object.entries(STATUS).filter(([id]) => id !== 'confirmed').map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></Field>
      {source !== 'online' && <Field label="Booking payment"><select aria-label="Booking payment" value={booking} onChange={(e) => setBooking(e.target.value)}>
        <option value="">Any payment</option><option value="cash">Paid</option><option value="due">Due</option>
      </select></Field>}
      <ClearFiltersButton onClick={() => { setFrom(''); setTo(''); setCourier(''); setSource(''); setStatus(''); setBooking(''); }} />
    </div>}
    {report && !invalidDates && !q.loading && !q.error && <div className="db-sum">
      {['online', 'manual'].filter((kind) => !source || kind === source).map((kind) => {
        const matches = rows.filter((o) => !!o.manual === (kind === 'manual'));
        return <div className="card" key={kind}><span>{kind === 'manual' ? 'Manual bookings' : 'Online deliveries'}</span>
          <b className="num">{matches.length}</b><small>{quantityTotal(matches.flatMap((o) => o.items || [])) || '0 products'}</small></div>;
      })}
    </div>}
    <ErrorBox error={invalidDates ? 'The start date must be on or before the end date.' : q.error} onRetry={invalidDates ? undefined : q.reload} />
    {!invalidDates && !q.error && (q.loading ? <Loading /> : q.data && <DataTable title={report ? reportTitle : TITLES[mode]} rows={rows} columns={report ? REPORT_COLUMNS : ORDER_COLUMNS}
          exportable={report} onRowClick={mode === 'challan' ? setSelected : undefined}
          empty={report ? 'No deliveries match these filters.' : 'No saved challans or confirmed orders.'}
          toolbar={mode === 'challan' ? <span className="muted">Select an order or booking to preview its challan.</span> : undefined} />)}
    {selected && <Challan order={selected} onClose={() => setSelected(null)} />}
    {(manual || (preset && q.data?.couriers?.some((courier) => courier.id === preset))) && <ManualChallan
      initialCourier={q.data?.couriers?.find((courier) => courier.id === preset)?.name}
      onClose={() => { setManual(false); if (preset) setParams({}, { replace: true }); }} onSaved={q.reload} />}
  </>;
}

function Challan({ order, onClose }) {
  const settings = useStore((s) => s.settings);
  const user = useStore((s) => s.user);
  const q = useApi('sale.detail', { id: order.sale_id }, [], { skip: order.manual });
  const [busy, run] = useAction();
  const [booking, setBooking] = useState(order.booking || '');
  const [date, setDate] = useState(() => order.courier?.booked_at?.slice(0, 10) || shopDay());
  const items = order.manual ? order.items : q.data?.items;
  const html = items && deliveryChallanHtml({
    order, items, settings, booking, date: fdate(date),
    bookedBy: order.courier?.booked_by || user?.name || ''
  });

  return <Modal open size="lg" title={`Delivery Challan · ${order.no}`} onClose={onClose}
    footer={<><Btn onClick={onClose}>Close</Btn><Btn kind="primary" busy={busy} disabled={!html || q.loading || !!q.error}
      onClick={() => run(() => printHtml(html)).catch(() => {})}>Print / Save as PDF</Btn></>}>
    <ErrorBox error={q.error} onRetry={q.reload} />
    {q.loading && <Loading label="Reading invoice items and serial numbers" />}
    {html && !q.error && <>
      {!order.manual && <div className="row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        <Field label="Booking type"><select aria-label="Booking type" value={booking} onChange={(e) => setBooking(e.target.value)}>
          <option value="">Leave unchecked</option><option value="cash">Cash Booking</option><option value="due">Due Booking</option>
        </select></Field>
        <Field label="Challan date"><DateInput value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>}
      <ChallanPreview html={html} />
    </>}
  </Modal>;
}

function ChallanPreview({ html }) {
  return <iframe title="Delivery Challan preview" sandbox=""
    srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>${printFonts}</style></head><body>${html}</body></html>`}
    style={{ width: '100%', height: 'min(60vh, 620px)', background: '#fff', border: 0 }} />;
}

function ManualChallan({ onClose, onSaved, initialCourier }) {
  const formId = useId();
  const nextLine = useRef(1);
  const settings = useStore((s) => s.settings);
  const userName = useStore((s) => s.user?.name || '');
  const canPickSupplier = useStore((s) => s.can({ any: ['suppliers', 'purchase'] }));
  const canPayCourier = useStore((s) => s.can('expenses'));
  const accounts = useStore((s) => s.accounts);
  const [source, setSource] = useState('manual');
  const [partyId, setPartyId] = useState('');
  const [recipient, setRecipient] = useState({ name: '', phone: '', address: '' });
  const [lines, setLines] = useState([0]);
  const [date, setDate] = useState(() => shopDay());
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);
  const [uncertain, setUncertain] = useState(false);
  const [payment, setPayment] = useState('due');
  const [busy, run] = useAction();

  function selectParty(id) {
    setPartyId(id);
    const { customers, suppliers } = useStore.getState();
    const party = (source === 'customer' ? customers : suppliers).find((p) => p.id === id);
    if (party) setRecipient({
      name: party.name || '',
      phone: splitList(party.phones || party.phone)[0] || '',
      address: splitList(party.addresses || party.address, '|')[0] || ''
    });
  }
  const recipientInput = (key) => ({
    value: recipient[key],
    onChange: (e) => setRecipient({ ...recipient, [key]: e.target.value })
  });

  function preview(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key) => String(data.get(key) || '').trim();
    const items = lines.map((id) => ({ name: value(`product-${id}`), serials: value(`serials-${id}`), qty: value(`qty-${id}`), unit: value(`unit-${id}`) }));
    const order = {
      manual: true,
      customer: { name: value('recipient'), address: value('address'), phone: value('phone') },
      courier: { label: value('courier'), tracking: value('tracking') }
    };
    setDraft({ ...order, items, date, booking: payment, booked_by: value('bookedBy'),
      ...(payment === 'cash' ? { amount: value('amount'), account_id: value('account') } : {}) });
  }

  async function save() {
    try {
      const result = await run(() => api(draft.booking === 'cash' ? 'courier.manual.paid' : 'courier.manual.save', draft), 'Courier booking saved');
      if (!result) return;
      if (result.pending_approval) { onClose(); return; }
      setSaved(result);
      onSaved();
    } catch (e) { setUncertain(Boolean(e.uncertain)); }
  }
  const details = saved || draft;
  const html = details && deliveryChallanHtml({ order: details, items: details.items, settings,
    booking: details.booking, date: fdate(details.date), bookedBy: details.courier.booked_by || details.booked_by });

  return <Modal open size="lg" title="Manual Delivery Challan" onClose={onClose}
    footer={saved
      ? <><Btn onClick={onClose}>Close</Btn><Btn kind="primary" busy={busy}
          onClick={() => run(() => printHtml(html)).catch(() => {})}>Print / Save as PDF</Btn></>
      : draft ? <><Btn disabled={busy || uncertain} onClick={() => setDraft(null)}>Edit details</Btn>
          <Btn kind="primary" busy={busy} onClick={save}>{uncertain ? 'Retry save' : 'Save booking'}</Btn></>
      : <><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" type="submit" form={formId}>Preview challan</Btn></>}>
    <form id={formId} onSubmit={preview} hidden={Boolean(draft)}>
      <div className="form">
        <Field label="Recipient source" wide><select aria-label="Recipient source" value={source} onChange={(e) => { setSource(e.target.value); setPartyId(''); }}>
          <option value="manual">Enter manually</option>
          <option value="customer">ERP Customer</option>
          {canPickSupplier && <option value="supplier">ERP Supplier</option>}
        </select></Field>
        {source !== 'manual' && <div className="wide">
          <PartyPicker key={source} kind={source} value={partyId} onChange={selectParty} />
        </div>}
        <Field label="Recipient name"><input name="recipient" required pattern={'.*\\S.*'} {...recipientInput('name')} /></Field>
        <Field label="Recipient phone"><input name="phone" type="tel" required pattern={'.*\\S.*'} {...recipientInput('phone')} /></Field>
        <Field label="Delivery address" wide><input name="address" required pattern={'.*\\S.*'} {...recipientInput('address')} /></Field>
        <Field label="Courier name"><input name="courier" defaultValue={initialCourier} required pattern={'.*\\S.*'} /></Field>
        <Field label="Tracking number (optional)"><input name="tracking" /></Field>
        <Field label="Booking by"><input name="bookedBy" defaultValue={userName} /></Field>
        <Field label="Booking type"><select aria-label="Booking type" value={payment} onChange={(e) => setPayment(e.target.value)}>
          <option value="due">Due Booking</option>{canPayCourier && <option value="cash">Paid Booking</option>}
        </select></Field>
        <Field label="Challan date"><DateInput value={date} max={shopDay()} onChange={(e) => setDate(e.target.value)} /></Field>
        {payment === 'cash' && <>
          <Field label="Courier charge" hint="Recorded under Expenses → Transport"><input name="amount" type="number" min="0.01" step="0.01" required /></Field>
          <Field label="Paid from"><select name="account" aria-label="Paid from" required defaultValue="">
            <option value="">Select an account</option>{accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></Field>
        </>}
      </div>
      <section className="challan-products" aria-label="Products">
        <h3>Products</h3>
        {lines.map((id, index) => <div className="challan-product" key={id} role="group" aria-label={`Product ${index + 1}`}>
          <div className="challan-product-head">
            <strong>Product {index + 1}</strong>
            {lines.length > 1 && (
              <Btn type="button" kind="danger" className="challan-product-remove"
                aria-label={`Remove product ${index + 1}`} title={`Remove product ${index + 1}`}
                onClick={() => setLines((current) => current.filter((line) => line !== id))}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18M8 6V3h8v3m3 0-1 14H6L5 6m5 4v6m4-6v6" />
                </svg>
              </Btn>
            )}
          </div>
          <div className="challan-product-fields">
            <Field label="Product name"><input name={`product-${id}`} required pattern={'.*\\S.*'} /></Field>
            <Field label="Serial numbers (optional)"><input name={`serials-${id}`} /></Field>
            <Field label="Quantity"><input name={`qty-${id}`} type="number" min="0.0001" step="0.0001" defaultValue="1" required /></Field>
            <Field label="Unit"><input name={`unit-${id}`} defaultValue="pcs" maxLength={30} /></Field>
          </div>
        </div>)}
        <Btn type="button" className="challan-product-add" onClick={() => {
          const id = nextLine.current++;
          setLines((current) => [...current, id]);
        }}>+ Add product</Btn>
      </section>
    </form>
    {html && <ChallanPreview html={html} />}
  </Modal>;
}
