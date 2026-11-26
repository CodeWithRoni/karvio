import { useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import DateInput from '../components/DateInput';
import { Btn, ErrorBox, Field, Loading, Modal, PageHead, useAction, useApi } from '../components/ui';
import { printHtml, printFonts } from '../lib/export';
import { fdate } from '../lib/format';
import { shopDay, useStore } from '../lib/store';
import { deliveryChallanHtml } from '../lib/deliveryChallan';

const TITLES = { info: 'Courier Information', challan: 'Delivery Challan', report: 'Delivery Report' };
const STATUS = {
  confirmed: 'To ship', shipped: 'With courier', delivered: 'Delivered',
  settled: 'Paid by courier', returned: 'Returned', cancelled: 'Cancelled'
};
const courierName = (order) => order.courier?.label || order.courier_label || '';
const ORDER_COLUMNS = [
  { key: 'no', label: 'Order' },
  { key: 'date', label: 'Order date', type: 'date' },
  { key: 'invoice_no', label: 'Invoice' },
  { key: 'customer', label: 'Customer', value: (o) => o.customer?.name || '' },
  { key: 'courier', label: 'Courier', value: courierName },
  { key: 'tracking', label: 'Tracking', value: (o) => o.courier?.tracking || '' },
  { key: 'status', label: 'Status', value: (o) => STATUS[o.status] || o.status }
];
const REPORT_COLUMNS = [
  ...ORDER_COLUMNS,
  { key: 'booked', label: 'Booking date', type: 'date', value: (o) => o.courier?.booked_at?.slice(0, 10) || '' },
  { key: 'providerStatus', label: 'Courier status', value: (o) => o.courier?.status || '' },
  { key: 'cod', label: 'COD', type: 'money' },
  { key: 'charge', label: 'Courier charge', type: 'money', value: (o) => o.settlement?.charge ?? o.return_charge ?? o.courier?.charge ?? 0 },
  { key: 'received', label: 'Received', type: 'money', sum: true, value: (o) => o.settlement?.received ?? 0 }
];

export default function Courier({ mode }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [courier, setCourier] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const report = mode === 'report';
  const invalidDates = Boolean(from && to && from > to);
  const q = useApi('orders.list', report ? { from, to } : {}, [], { skip: invalidDates });
  const orders = q.data?.orders || [];
  const deliveries = orders.filter((o) => o.status === 'confirmed' || o.courier);
  const names = [...new Set(deliveries.map(courierName).filter(Boolean))].sort();
  const rows = report
    ? deliveries.filter((o) => (!courier || courierName(o) === courier) && (!status || o.status === status))
    : deliveries.filter((o) => o.sale_id && ['confirmed', 'shipped', 'delivered', 'settled'].includes(o.status));

  return <>
    <PageHead title={TITLES[mode]}><Link className="btn" to="/online-orders">Online Orders</Link></PageHead>
    {report && <div className="row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
      <Field label="Order date from"><DateInput value={from} onChange={(v) => { setFrom(v); setCourier(''); }} /></Field>
      <Field label="Order date to"><DateInput value={to} onChange={(v) => { setTo(v); setCourier(''); }} /></Field>
      <Field label="Courier"><select aria-label="Courier" value={courier} onChange={(e) => setCourier(e.target.value)}>
        <option value="">All couriers</option>{names.map((name) => <option key={name}>{name}</option>)}
      </select></Field>
      <Field label="Delivery status"><select value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All statuses</option>{Object.entries(STATUS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></Field>
    </div>}
    <ErrorBox error={invalidDates ? 'The start date must be on or before the end date.' : q.error} onRetry={invalidDates ? undefined : q.reload} />
    {!invalidDates && !q.error && (q.loading ? <Loading /> : q.data && (mode === 'info'
      ? <DataTable title={TITLES.info} rows={q.data.couriers} exportable={false} searchable={false}
          columns={[
            { key: 'name', label: 'Courier' },
            { key: 'api', label: 'Booking', value: (c) => c.api ? 'API connected · Manual tracking available' : 'Manual tracking' }
          ]} />
      : <DataTable title={TITLES[mode]} rows={rows} columns={report ? REPORT_COLUMNS : ORDER_COLUMNS}
          exportable={report} onRowClick={mode === 'challan' ? setSelected : undefined}
          empty={report ? 'No deliveries match these filters.' : 'No confirmed orders available for a challan.'}
          toolbar={mode === 'challan' ? <span className="muted">Select an order to preview and print its challan.</span> : undefined} />))}
    {selected && <Challan order={selected} onClose={() => setSelected(null)} />}
  </>;
}

function Challan({ order, onClose }) {
  const settings = useStore((s) => s.settings);
  const user = useStore((s) => s.user);
  const q = useApi('sale.detail', { id: order.sale_id });
  const { run, busy } = useAction();
  const [booking, setBooking] = useState('');
  const [date, setDate] = useState(() => order.courier?.booked_at?.slice(0, 10) || shopDay());
  const html = q.data && deliveryChallanHtml({
    order, items: q.data.items, settings, booking, date: fdate(date),
    bookedBy: order.courier?.booked_by || user?.name || ''
  });

  return <Modal open size="lg" title={`Delivery Challan · ${order.no}`} onClose={onClose}
    footer={<><Btn onClick={onClose}>Close</Btn><Btn kind="primary" busy={busy} disabled={!html || q.loading || !!q.error}
      onClick={() => run(() => printHtml(html)).catch(() => {})}>Print / Save as PDF</Btn></>}>
    <ErrorBox error={q.error} onRetry={q.reload} />
    {q.loading && <Loading label="Reading invoice items and serial numbers" />}
    {html && !q.error && <>
      <div className="row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        <Field label="Booking type"><select aria-label="Booking type" value={booking} onChange={(e) => setBooking(e.target.value)}>
          <option value="">Leave unchecked</option><option value="cash">Cash Booking</option><option value="due">Due Booking</option>
        </select></Field>
        <Field label="Challan date"><DateInput value={date} onChange={setDate} /></Field>
      </div>
      <iframe title="Delivery Challan preview" sandbox=""
        srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>${printFonts}</style></head><body>${html}</body></html>`}
        style={{ width: '100%', height: 'min(60vh, 620px)', background: '#fff', border: 0 }} />
    </>}
  </Modal>;
}
