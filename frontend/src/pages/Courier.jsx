import { useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import DateInput from '../components/DateInput';
import PartyPicker from '../components/PartyPicker';
import { ReverseDialog } from '../components/widgets';
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
const deliveryStatus = (o) => o.manual && o.status !== 'cancelled' ? 'booked' : o.status;
const bookingLabel = (o) => o.booking === 'cash' ? 'Paid' : o.booking === 'due' ? 'Due' : '';
const ORDER_COLUMNS = [
  { key: 'no', label: 'Order / challan' },
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'invoice_no', label: 'Invoice' },
  { key: 'customer', label: 'Customer', value: (o) => o.customer?.name || '' },
  { key: 'courier', label: 'Courier', value: courierName },
  { key: 'tracking', label: 'Tracking', value: (o) => o.courier?.tracking || '' },
  { key: 'status', label: 'Status', value: (o) => deliveryStatus(o) === 'booked' ? 'Booked' : STATUS[o.status] || o.status }
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
  { key: 'charge', label: 'Courier charge', type: 'money', sum: true, value: (o) => o.status === 'cancelled' ? 0 : o.settlement?.charge ?? o.return_charge ?? o.courier?.charge ?? 0 },
  { key: 'received', label: 'Received', type: 'money', sum: true, value: (o) => o.settlement?.received ?? 0 }
];

const ACTIVITY = [
  ['confirmed', 'To Ship', 'warn'], ['shipped', 'In Transit', 'info'],
  ['delivered', 'Delivered', 'ok'], ['returned', 'Returned', 'bad']
];
const RATE_FIELDS = [
  ['inside', 'Inside Dhaka', '৳'], ['outside', 'Outside Dhaka', '৳'],
  ['cod', 'COD fee', '%'], ['return_fee', 'Return fee', '৳']
];

function CourierHub() {
  const overview = useApi('orders.list', { courier_overview: true }, [], { refreshMs: 60000 });
  const canEditRates = useStore((s) => s.user?.role === 'admin' && s.can('settings'));
  const canTest = useStore((s) => s.can('settings'));
  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState({ query: '', courier: '' });
  const [editor, setEditor] = useState(null);
  const inputRef = useRef(null);
  const [testing, setTesting] = useState('');
  const [busy, run] = useAction();
  const trackingQuery = useApi('orders.list', {
    include_manual: true, tracking_query: lookup.query, tracking_courier: lookup.courier
  }, [], { skip: !lookup.query });

  const data = overview.data;
  const couriers = data?.couriers || [];
  const results = trackingQuery.data;
  const parcels = [...(results?.orders || []), ...(results?.manual || [])];

  async function testConnection(courier) {
    setTesting(courier.id);
    try {
      await run(() => api('courier.call', { op: 'test', courier: courier.id }), `${courier.name} connection verified`);
      await overview.reload();
    } catch { /* useAction reports the provider error */ }
    finally { setTesting(''); }
  }

  async function refreshParcel(parcel) {
    try {
      const updated = await run(() => api('courier.call', { op: 'track', id: parcel.id }), 'Tracking updated');
      if (updated) await Promise.all([trackingQuery.reload(), overview.reload()]);
    } catch { /* useAction reports the provider error */ }
  }

  return <>
    <PageHead title="Courier Information" sub="Track parcels, compare courier rates and see today’s delivery activity.">
      <Link className="btn" to="/online-orders">Online Orders</Link>
    </PageHead>
    <ErrorBox error={overview.error} onRetry={overview.reload} />
    {!data && overview.loading && <Loading label="Reading courier overview" />}
    {data && <section className="courier-hub" aria-label="Courier overview">
      <section aria-label="Today's delivery activity">
        <div className="courier-section-heading"><h2>Today’s online delivery activity</h2><span className="muted">{fdate(data.activity_day)}</span></div>
        <div className="courier-metrics">
          {ACTIVITY.map(([id, label, tone]) => (
            <Link key={id} className={`card courier-metric courier-metric-${tone}`}
              to={`/delivery-report?activity=${id}&day=${encodeURIComponent(data.activity_day)}`}>
              <span>{label}</span><strong>{data.activity_counts?.[id] ?? '—'}</strong><small>View report →</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="card courier-lookup" aria-labelledby="courier-lookup-title">
        <div className="courier-section-heading"><h2 id="courier-lookup-title">Track a parcel</h2></div>
        <form className="courier-lookup-form" onSubmit={(event) => {
          event.preventDefault();
          const next = query.trim();
          if (next.length < 2) return;
          if (next === lookup.query) trackingQuery.reload();
          else setLookup({ ...lookup, query: next });
        }}>
          <Field label="Tracking ID, Order ID or Challan No.">
            <input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              maxLength={100} placeholder="Search by tracking or reference number" />
          </Field>
          <Field label="Courier">
            <select value={lookup.courier} onChange={(e) => setLookup({ ...lookup, courier: e.target.value })}>
              <option value="">All couriers</option>
              {couriers.map((courier) => <option key={courier.id} value={courier.id}>{courier.name}</option>)}
            </select>
          </Field>
          <Btn kind="primary" type="submit" disabled={query.trim().length < 2} busy={Boolean(lookup.query && trackingQuery.loading)}>Search</Btn>
        </form>
        <ErrorBox error={trackingQuery.error} onRetry={trackingQuery.reload} />
        {lookup.query && !trackingQuery.loading && !trackingQuery.error && results && <div className="courier-lookup-results" aria-live="polite">
          <p className="muted">{results.tracking_total ? `Showing ${parcels.length} of ${results.tracking_total} matching parcels` : 'No matching parcels found.'}</p>
          {parcels.map((parcel) => <article key={parcel.id} className="courier-parcel">
            <div><strong>{parcel.no}</strong><small className="muted">{courierName(parcel) || 'Courier not assigned'}{parcel.courier?.tracking ? ` · ${parcel.courier.tracking}` : ''}</small></div>
            <div><Badge tone={parcel.status === 'returned' ? 'bad' : ['delivered', 'settled'].includes(parcel.status) ? 'ok' : 'info'}>
              {deliveryStatus(parcel) === 'booked' ? 'Booked manually' : STATUS[parcel.status] || parcel.status}
            </Badge>{parcel.courier?.status && <small className="muted">Provider: {parcel.courier.status}</small>}
              <small className="muted">Updated {fdatetime([parcel.courier?.checked_at, parcel.updated_at, parcel.created_at, parcel.date].filter(Boolean).sort().at(-1))}</small>
            </div>
            {parcel.courier?.by_api && <Btn size="sm" disabled={busy} onClick={() => refreshParcel(parcel)}>Refresh status</Btn>}
          </article>)}
        </div>}
      </section>

      <section aria-label="Courier providers">
        <div className="courier-section-heading"><h2>Courier providers</h2></div>
        <div className="courier-provider-grid">
          {couriers.map((courier) => (
            <article key={courier.id} className="card courier-provider">
              <header className="courier-section-heading">
                <h3>{courier.name}</h3><Badge tone={courier.api ? 'ok' : 'muted'}>{courier.api ? 'API configured' : 'Manual'}</Badge>
              </header>
              <dl className="courier-rates">
                {RATE_FIELDS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{courier.rates?.[key] == null
                  ? '—' : key === 'cod' ? `${courier.rates[key]}%` : money(courier.rates[key])}</dd></div>)}
              </dl>
              {courier.rates?.terms && <p className="courier-terms">{courier.rates.terms}</p>}
              {courier.api && <small className="muted">{courier.checked_at ? `Last successful check · ${fdatetime(courier.checked_at)}` : 'Connection has not been checked'}</small>}
              <div className="courier-provider-actions">
                <Btn size="sm" onClick={() => {
                  setLookup({ ...lookup, courier: courier.id });
                  inputRef.current?.focus();
                }}>Track Parcel</Btn>
                <Link className="btn btn-sm" to={`/online-orders?courier=${encodeURIComponent(courier.id)}`}>View Orders</Link>
                <Link className="btn btn-sm" to={`/delivery-challan?create=${encodeURIComponent(courier.id)}`}>Create Challan</Link>
                {canEditRates && <Btn size="sm" onClick={() => setEditor(courier)}>Edit rates</Btn>}
                {canTest && courier.api && <Btn size="sm" busy={testing === courier.id} disabled={busy} onClick={() => testConnection(courier)}>Test API</Btn>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>}
    {editor && <CourierRatesDialog courier={editor} onClose={() => setEditor(null)} onSaved={overview.reload} />}
  </>;
}

function CourierRatesDialog({ courier, onClose, onSaved }) {
  const [rates, setRates] = useState(courier.rates || {});
  const [busy, run] = useAction();
  const formId = useId();
  async function save(event) {
    event.preventDefault();
    try {
      const result = await run(() => api('settings.save', { values: { [`courier_rates_${courier.id}`]: rates } }), 'Courier rates saved');
      if (result) { onClose(); onSaved(); }
    } catch { /* useAction reports the validation error */ }
  }

  return <Modal open size="sm" title={`Rates · ${courier.name}`} onClose={onClose}
    footer={<><Btn disabled={busy} onClick={onClose}>Cancel</Btn><Btn kind="primary" type="submit" form={formId} busy={busy}>Save rates</Btn></>}>
    <form id={formId} className="courier-rate-form" onSubmit={save}>
      <p className="muted">Reference rates for courier selection. Leave an unknown rate blank.</p>
      <div className="courier-rates">
        {RATE_FIELDS.map(([key, label, unit]) => <Field key={key} label={`${label} (${unit})`}>
          <input type="number" min="0" max={key === 'cod' ? 100 : 1000000} step="0.01" value={rates[key] ?? ''}
            onChange={(e) => setRates({ ...rates, [key]: e.target.value })} />
        </Field>)}
      </div>
      <Field label="Terms"><textarea rows={3} maxLength={500} value={rates.terms || ''}
        onChange={(e) => setRates({ ...rates, terms: e.target.value })} /></Field>
    </form>
  </Modal>;
}

export default function Courier({ mode }) {
  return mode === 'info' ? <CourierHub /> : <CourierDeliveries mode={mode} />;
}

function CourierDeliveries({ mode }) {
  const [params, setParams] = useSearchParams();
  const activity = mode === 'report' && ACTIVITY.find(([id]) => id === params.get('activity'));
  const activityDay = activity && /^\d{4}-\d{2}-\d{2}$/.test(params.get('day') || '') ? params.get('day') : '';
  const presetCourier = mode === 'challan' ? params.get('create') : '';
  const clearPreset = () => setParams({}, { replace: true });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [courier, setCourier] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [booking, setBooking] = useState('');
  const [selected, setSelected] = useState(null);
  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState(null);
  const [cancel, setCancel] = useState(null);
  const canCancel = useStore((s) => s.can('cancel'));
  const canExpense = useStore((s) => s.can('expenses'));
  const report = mode === 'report';
  const invalidDates = Boolean(!activityDay && from && to && from > to);
  const reportFilters = activityDay
    ? { activity_day: activityDay, activity_status: activity[0] }
    : { from, to };
  const q = useApi('orders.list', {
    ...(report ? { ...reportFilters, delivery_report: true } : {}), include_manual: !activityDay
  }, [], { skip: invalidDates });
  const orders = q.data?.orders || [];
  const deliveries = [...(q.data?.manual || []), ...orders.filter((o) => o.status === 'confirmed' || o.courier)];
  const names = [...new Set(deliveries.map(courierName).filter(Boolean))].sort();
  const rows = activityDay ? orders : report
    ? deliveries.filter((o) => (!source || source === (o.manual ? 'manual' : 'online')) &&
        (!courier || courierName(o) === courier) && (!status || status === deliveryStatus(o)) &&
        (!booking || o.booking === booking))
    : deliveries.filter((o) => o.manual || (o.sale_id && ['confirmed', 'shipped', 'delivered', 'settled'].includes(o.status)));
  const reportTitle = source ? (source === 'manual' ? 'Manual Courier Delivery Report' : 'Online Order Delivery Report') : TITLES.report;

  return <>
    <PageHead title={TITLES[mode]}>
      {mode === 'challan' && <Btn kind="primary" onClick={() => setManual(true)}>+ Manual Challan</Btn>}
      <Link className="btn" to="/online-orders">Online Orders</Link>
    </PageHead>
    {activityDay && <div className="card row courier-activity-report"><strong>{activity[1]} · {fdate(activityDay)}</strong>
      <span className="muted">Parcels that reached this stage on the selected day.</span><Btn size="sm" onClick={clearPreset}>Clear activity</Btn></div>}
    {report && !activityDay && <div className="card row courier-report-filters">
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
        {Object.entries(STATUS).filter(([id]) => source === 'manual' ? id === 'cancelled' : id !== 'confirmed').map(([id, label]) => <option key={id} value={id}>{label}</option>)}
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
    {selected && <Challan order={selected} onClose={() => setSelected(null)} onSaved={q.reload}
      onEdit={selected.manual && selected.status !== 'cancelled' ? () => { setEditing(selected); setSelected(null); } : undefined}
      onCancel={canCancel && selected.manual && selected.status !== 'cancelled' && (!selected.expense_id || selected.booking !== 'cash' || canExpense)
        ? () => { setCancel(selected); setSelected(null); } : undefined} />}
    {cancel && <ReverseDialog open type="manual_challan" id={cancel.id} label={`booking ${cancel.no}`}
      description="The booking stays in history as cancelled. Any linked, active Transport expense is reversed."
      onClose={() => setCancel(null)} onDone={q.reload} />}
    {(editing || manual || (presetCourier && q.data?.couriers?.some((c) => c.id === presetCourier))) && <ManualChallan
      initial={editing} courierName={q.data?.couriers?.find((c) => c.id === presetCourier)?.name}
      onClose={() => { setManual(false); setEditing(null); if (presetCourier) clearPreset(); }} onSaved={q.reload} />}
  </>;
}

function Challan({ order, onClose, onSaved, onEdit, onCancel }) {
  const settings = useStore((s) => s.settings);
  const user = useStore((s) => s.user);
  const q = useApi('sale.detail', { id: order.sale_id }, [], { skip: order.manual });
  const [busy, run] = useAction();
  const [booking, setBooking] = useState(order.booking || '');
  const [savedBooking, setSavedBooking] = useState(booking);
  const [date, setDate] = useState(() => order.courier?.booked_at?.slice(0, 10) || shopDay());
  const items = order.manual ? order.items : q.data?.items;
  const html = items && deliveryChallanHtml({
    order, items, settings, booking, date: fdate(date),
    bookedBy: order.courier?.booked_by || user?.name || ''
  });

  return <Modal open size="lg" title={`Delivery Challan · ${order.no}`} onClose={onClose}
    footer={<><Btn onClick={onClose}>Close</Btn>
      {onEdit && <Btn onClick={onEdit}>Edit booking</Btn>}
      {onCancel && <Btn kind="danger" onClick={onCancel}>Cancel booking</Btn>}
      {!order.manual && <Btn busy={busy} disabled={booking === savedBooking} onClick={() => run(async () => {
        const result = await api('courier.challan.save', { id: order.id, booking });
        setSavedBooking(result.booking);
        onSaved();
      }, 'Booking type saved').catch(() => {})}>Save booking type</Btn>}
      <Btn kind="primary" busy={busy} disabled={!html || q.loading || !!q.error || order.status === 'cancelled'}
      onClick={() => run(() => printHtml(html)).catch(() => {})}>Print / Save as PDF</Btn></>}>
    {order.status === 'cancelled' && <p className="muted">This courier booking was cancelled.</p>}
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

function ManualChallan({ onClose, onSaved, courierName: initialCourier, initial }) {
  const formId = useId();
  const nextLine = useRef(initial?.items?.length || 1);
  const settings = useStore((s) => s.settings);
  const userName = useStore((s) => s.user?.name || '');
  const canPickSupplier = useStore((s) => s.can({ any: ['suppliers', 'purchase'] }));
  const canPayCourier = useStore((s) => s.can('expenses'));
  const accounts = useStore((s) => s.accounts);
  const [source, setSource] = useState('manual');
  const [partyId, setPartyId] = useState('');
  const [recipient, setRecipient] = useState(() => initial?.customer || { name: '', phone: '', address: '' });
  const [lines, setLines] = useState(() => initial?.items?.map((_, index) => index) || [0]);
  const [date, setDate] = useState(() => initial?.date || shopDay());
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);
  const [uncertain, setUncertain] = useState(false);
  const [payment, setPayment] = useState(initial?.booking || 'due');
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
      id: initial?.id, manual: true,
      customer: { name: value('recipient'), address: value('address'), phone: value('phone') },
      courier: { label: value('courier'), tracking: value('tracking') }
    };
    setDraft({ ...order, items, date, booking: payment, booked_by: value('bookedBy'),
      amount: value('amount'), ...(payment === 'cash' && !initial ? { account_id: value('account') } : {}) });
  }

  async function save() {
    try {
      const result = await run(() => api(!initial && draft.booking === 'cash' ? 'courier.manual.paid' : 'courier.manual.save', draft), 'Courier booking saved');
      if (!result) return;
      if (result.pending_approval) { onClose(); return; }
      setSaved(result);
      onSaved();
    } catch (e) { setUncertain(Boolean(e.uncertain)); }
  }
  const details = saved || draft;
  const html = details && deliveryChallanHtml({ order: details, items: details.items, settings,
    booking: initial?.expense_id ? initial.booking : details.booking, date: fdate(details.date), bookedBy: details.courier.booked_by || details.booked_by });

  return <Modal open size="lg" title={initial ? `Edit booking · ${initial.no}` : 'Manual Delivery Challan'} onClose={onClose}
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
        <Field label="Courier name"><input name="courier" defaultValue={initial?.courier?.label || initialCourier} required pattern={'.*\\S.*'} /></Field>
        <Field label="Tracking number (optional)"><input name="tracking" defaultValue={initial?.courier?.tracking} /></Field>
        <Field label="Booking by"><input name="bookedBy" defaultValue={initial?.courier?.booked_by || userName} /></Field>
        <Field label="Booking type"><select aria-label="Booking type" value={payment} disabled={!!initial} onChange={(e) => setPayment(e.target.value)}>
          <option value="due">Due Booking</option>{(canPayCourier || payment === 'cash') && <option value="cash">Paid Booking</option>}
        </select></Field>
        <Field label="Challan date"><DateInput value={date} max={shopDay()} disabled={!!initial?.expense_id} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={payment === 'cash' ? 'Courier charge' : 'Courier charge (optional)'}
          hint={initial?.expense_id ? 'This charge is linked to the original Transport expense.' : payment === 'cash' ? 'Recorded under Expenses → Transport' : undefined}>
          <input name="amount" type="number" min={payment === 'cash' ? '0.01' : '0'} step="0.01" defaultValue={initial?.courier?.charge}
            required={payment === 'cash'} disabled={!!initial?.expense_id} />
        </Field>
        {payment === 'cash' && !initial && <>
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
            <Field label="Product name"><input name={`product-${id}`} defaultValue={initial?.items?.[id]?.name} required pattern={'.*\\S.*'} /></Field>
            <Field label="Serial numbers (optional)"><input name={`serials-${id}`} defaultValue={initial?.items?.[id]?.serials} /></Field>
            <Field label="Quantity"><input name={`qty-${id}`} type="number" min="0.0001" step="0.0001" defaultValue={initial?.items?.[id]?.qty ?? 1} required /></Field>
            <Field label="Unit"><input name={`unit-${id}`} defaultValue={initial?.items?.[id]?.unit || "pcs"} maxLength={30} /></Field>
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
