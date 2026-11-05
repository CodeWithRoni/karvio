import { useState } from 'react';
import { useStore } from '../lib/store';
import { monthStart, today, addDays, money } from '../lib/format';
import DataTable from '../components/DataTable';
import { useApi, PageHead, Field, Select, DateRange, ErrorBox, Tabs, Badge } from '../components/ui';

const REPORTS = [
  ['sales', 'Sales'], ['purchases', 'Purchases'], ['sales_returns', 'Sales returns'], ['purchase_returns', 'Purchase returns'],
  ['daily_summary', 'Daily counts'], ['payment_methods', 'Payment methods'], ['product_sales', 'Product-wise sales'],
  ['expenses', 'Expenses'], ['warranty', 'Warranty status']
];
const GROUPS = { sales: ['invoice', 'daily', 'monthly', 'yearly'], purchases: ['invoice', 'daily', 'monthly', 'yearly'], payment_methods: ['daily', 'monthly', 'yearly'], expenses: ['list', 'category'] };
const GLABEL = { invoice: 'Invoice-wise', daily: 'Daily', monthly: 'Monthly', yearly: 'Yearly', list: 'Every entry', category: 'By category' };

const PRESETS = [
  ['today', 'Today', () => ({ from: today(), to: today() })],
  ['7', 'Last 7 days', () => ({ from: addDays(today(), -6), to: today() })],
  ['month', 'This month', () => ({ from: monthStart(), to: today() })],
  ['year', 'This year', () => ({ from: today().slice(0, 4) + '-01-01', to: today() })],
  ['all', 'All time', () => ({ from: '', to: '' })]
];

export default function Reports() {
  const { customers, suppliers, accounts } = useStore();
  const [type, setType] = useState('sales');
  const [group, setGroup] = useState('invoice');
  const [range, setRange] = useState(PRESETS[2][2]());
  const [preset, setPreset] = useState('month');
  const [status, setStatus] = useState('active');
  const [party, setParty] = useState('');
  const [wst, setWst] = useState('all');
  const groups = GROUPS[type];
  const g = groups ? (groups.includes(group) ? group : groups[0]) : '';
  const payload = { type, ...range, group: g, status: type === 'warranty' ? wst : status, customer_id: type === 'sales' ? party : '', supplier_id: type === 'purchases' ? party : '', account_id: type === 'payment_methods' ? party : '' };
  const rep = useApi('reports', payload);
  const r = rep.data;

  return (
    <>
      <PageHead title="Reports hub" sub="Pick a report and a period. Every report exports to Excel, PDF or the printer." />
      <div className="filters">
        <Field label="Report"><select value={type} onChange={(e) => { setType(e.target.value); setParty(''); }}>{REPORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {groups && <Field label="View"><select value={g} onChange={(e) => setGroup(e.target.value)}>{groups.map((x) => <option key={x} value={x}>{GLABEL[x]}</option>)}</select></Field>}
        <Field label="Period"><Tabs tabs={PRESETS.map(([v, l]) => [v, l])} value={preset} onChange={(v) => { setPreset(v); setRange(PRESETS.find((p) => p[0] === v)[2]()); }} /></Field>
        <Field label="Custom range"><DateRange {...range} onChange={(x) => { setPreset(''); setRange(x); }} /></Field>
        {type === 'sales' && <Field label="Customer"><Select value={party} onChange={setParty} options={customers} placeholder="All customers" /></Field>}
        {type === 'purchases' && <Field label="Supplier"><Select value={party} onChange={setParty} options={suppliers} placeholder="All suppliers" /></Field>}
        {type === 'payment_methods' && <Field label="Account"><Select value={party} onChange={setParty} options={accounts} placeholder="All accounts" /></Field>}
        {['sales', 'purchases', 'sales_returns', 'purchase_returns', 'expenses'].includes(type) && (
          <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active only</option><option value="cancelled">Cancelled only</option><option value="all">All</option></select></Field>
        )}
        {type === 'warranty' && <Field label="Claim status"><select value={wst} onChange={(e) => setWst(e.target.value)}>
          <option value="all">All</option><option value="open">Open (not delivered)</option>{['Pending', 'Sent to Vendor', 'Repaired', 'Replaced', 'Delivered', 'Rejected'].map((s) => <option key={s}>{s}</option>)}
        </select></Field>}
      </div>
      <ErrorBox error={rep.error} onRetry={rep.reload} />
      {r?.summary && (
        <div className="row" style={{ marginBottom: 12 }}>{Object.entries(r.summary).map(([k, v]) => <Badge key={k} tone={k === 'Delivered' ? 'muted' : k === 'Pending' ? 'warn' : 'info'}>{k}: {v}</Badge>)}</div>
      )}
      {r && <h2 style={{ marginBottom: 10 }}>{r.title}</h2>}
      <DataTable title={r?.title || 'Report'} loading={rep.loading} rows={r?.rows || []} totals={r?.totals} pageSize={100}
        rowClass={(row) => (row.status === 'cancelled' ? 'dim' : '')}
        columns={(r?.columns || []).map((c) => ({ ...c, className: c.key === 'items' || c.key === 'items_text' || c.key === 'issue' ? 'clip' : '' }))} />
      {r?.totals && type === 'sales' && g === 'invoice' && status === 'all' && <p className="muted">Totals count active invoices only; cancelled ones are shown struck through.</p>}
    </>
  );
}
