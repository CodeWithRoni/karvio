// Reports hub — party reports: Due collection, Supplier payments, Aging and the Individual report.
// Each has its own filters; the "Report" picker of the hub is passed in so it stays first in the filter row.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { monthStart, today, addDays, money, fdate } from '../lib/format';
import DataTable from '../components/DataTable';
import DocViewer from '../components/DocViewer';
import { PartyCardBody, loadPartyCard } from '../components/PartyCard';
import { useApi, Field, Select, DateRange, ErrorBox, Tabs, Empty } from '../components/ui';
import { salesDetails } from '../lib/salesDetails';
import { purchaseDetails } from '../lib/purchaseDetails';
import { excelSales, pdfSales, printSales, printSalesReturns, pdfSalesReturns } from '../lib/salesDocs';
import { excelPurchases, pdfPurchases, printPurchases, printPurchaseReturns, pdfPurchaseReturns } from '../lib/purchaseDocs';
import { printStatement } from '../lib/receipt';
import { tagOf } from '../lib/ledgerDocs';

export const PERIODS = [
  ['today', 'Today', () => ({ from: today(), to: today() })],
  ['7', 'Last 7 days', () => ({ from: addDays(today(), -6), to: today() })],
  ['month', 'This month', () => ({ from: monthStart(), to: today() })],
  ['last_month', 'Last month', () => { const end = addDays(monthStart(), -1); return { from: end.slice(0, 8) + '01', to: end }; }],
  ['year', 'This year', () => ({ from: today().slice(0, 4) + '-01-01', to: today() })],
  ['all', 'All time', () => ({ from: '', to: '' })]
];

/** Quick periods plus a custom date range. */
function Period({ value, onChange }) {
  return (
    <>
      <Field label="Period"><Tabs tabs={PERIODS.map(([v, l]) => [v, l])} value={value.preset} onChange={(v) => onChange({ preset: v, ...PERIODS.find((p) => p[0] === v)[2]() })} /></Field>
      <Field label="Custom range"><DateRange from={value.from} to={value.to} onChange={(x) => onChange({ preset: '', ...x })} /></Field>
    </>
  );
}
const usePeriod = (preset = 'month') => useState(() => ({ preset, ...PERIODS.find((p) => p[0] === preset)[2]() }));
const periodLabel = (p) => (p.from || p.to ? `${p.from ? fdate(p.from) : 'Start'} – ${p.to ? fdate(p.to) : fdate(today())}` : 'All time');

function Kpis({ items }) {
  return <div className="om-kpis pr-kpis">{items.map(([label, value, small, tone]) => <div className="card" key={label}><span>{label}</span><b className={tone || ''}>{value}</b>{small && <small>{small}</small>}</div>)}</div>;
}

/* ---------------------------------------------------------------- Due collection / Supplier payments */
const MONEY_VIEWS = (cust) => [['list', 'Every entry'], ['daily', 'Daily'], ['monthly', 'Monthly'], ['party', cust ? 'By customer' : 'By supplier'], ['account', 'By account'], ['staff', cust ? 'By collector' : 'By payer']];

export function MoneyReport({ kind, picker }) {
  const cust = kind === 'customer';
  const { customers, suppliers, accounts } = useStore();
  const [period, setPeriod] = usePeriod();
  const [f, setF] = useState({ group: 'list', party_id: '', account_id: '', staff: '', direction: 'main', source: 'all' });
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const rep = useApi('reports', { type: cust ? 'due_collections' : 'supplier_payments', from: period.from, to: period.to, ...f });
  const r = rep.data, k = r?.party_money;
  // People who took or paid money, from the last unfiltered result (so the list does not shrink to the chosen one).
  const [staffList, setStaffList] = useState([]);
  useEffect(() => { if (r?.rows && !f.staff && f.group === 'list') setStaffList([...new Set(r.rows.map((x) => x.by).filter(Boolean))].sort()); }, [r, f.staff, f.group]);
  const sources = cust ? [['all', 'All sources'], ['counter', 'At the counter'], ['cod', 'Courier COD']] : [['all', 'All payments'], ['due', 'Due payments'], ['invoice', 'Paid with purchases']];
  return (
    <>
      <div className="filters pr-filters">
        {picker}
        <Field label="View"><select value={f.group} onChange={(e) => set({ group: e.target.value })}>{MONEY_VIEWS(cust).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Period value={period} onChange={setPeriod} />
        <Field label={cust ? 'Customer' : 'Supplier'}><Select value={f.party_id} onChange={(v) => set({ party_id: v })} options={cust ? customers : suppliers} placeholder={cust ? 'All customers' : 'All suppliers'} /></Field>
        <Field label="Account"><Select value={f.account_id} onChange={(v) => set({ account_id: v })} options={accounts} placeholder="All accounts" /></Field>
        <Field label={cust ? 'Collected by' : 'Paid by'}><select value={f.staff} onChange={(e) => set({ staff: e.target.value })}><option value="">All staff</option>{[...new Set([...staffList, f.staff].filter(Boolean))].map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Type"><select value={f.direction} onChange={(e) => set({ direction: e.target.value })}>
          <option value="main">{cust ? 'Collections' : 'Payments'}</option><option value="refund">{cust ? 'Advance refunds' : 'Refunds received'}</option><option value="all">Both</option>
        </select></Field>
        <Field label="Source"><select value={f.source} onChange={(e) => set({ source: e.target.value })}>{sources.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      </div>
      <ErrorBox error={rep.error} onRetry={rep.reload} />
      {k && <Kpis items={[
        [cust ? 'Collected' : 'Paid to suppliers', money(k.amount), `${k.count} entr${k.count === 1 ? 'y' : 'ies'} · ${periodLabel(period)}`, 'ok'],
        [cust ? 'Refunded' : 'Refunds received', money(k.refund), cust ? 'advance paid back' : 'money back from suppliers'],
        ['Net', money(k.net), cust ? 'collected − refunded' : 'paid − received back'],
        [cust ? 'Customers' : 'Suppliers', k.parties, k.top ? `Most: ${k.top} · ${money(k.top_amount, false)}` : 'none in this period']
      ]} />}
      {r && <h2 className="pr-title">{r.title}</h2>}
      <DataTable title={r?.title || 'Report'} loading={rep.loading} rows={r?.rows || []} columns={r?.columns || []} totals={r?.totals}
        empty={<Empty title={cust ? 'No collections' : 'No payments'}>Nothing matches these filters in this period.</Empty>} />
    </>
  );
}

/* ---------------------------------------------------------------- Aging */
const AGE_FILTERS = [['all', 'All dues'], ['b60', 'Over 30 days'], ['b90', 'Over 60 days'], ['b180', 'Over 90 days'], ['bmax', 'Over 180 days']];
const AGE_TONE = { b30: 'a1', b60: 'a2', b90: 'a3', b180: 'a4', bmax: 'a5', none: 'a0' };

export function AgingReport({ picker }) {
  const { customers, suppliers, can } = useStore();
  const [party, setParty] = useState(can('customers') ? 'customer' : 'supplier');
  const cust = party === 'customer';
  const [f, setF] = useState({ group: 'invoice', party_id: '', bucket: 'all' });
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const [doc, setDoc] = useState(null);
  const rep = useApi('reports', { type: 'aging', party, ...f });
  const r = rep.data, a = r?.aging, buckets = r?.aging_buckets || [];
  const parts = a ? [...buckets.map((b) => ({ ...b, amount: a[b.key] || 0 })), ...(a.none > 0.004 ? [{ key: 'none', label: 'No invoice', amount: a.none }] : [])] : [];
  const columns = (r?.columns || []).map((c) => (c.key === 'bucket_label' ? { ...c, render: (row) => <span className={`age-chip ${AGE_TONE[row.bucket] || ''}`}>{row.bucket_label}</span> } : c));
  return (
    <>
      <div className="filters pr-filters">
        {picker}
        {can('customers') && can('suppliers') && <Field label="Dues of"><Tabs tabs={[['customer', 'Customers'], ['supplier', 'Suppliers']]} value={party} onChange={(v) => { setParty(v); set({ party_id: '' }); }} /></Field>}
        <Field label="View"><select value={f.group} onChange={(e) => set({ group: e.target.value })}><option value="invoice">Invoice-wise</option><option value="party">{cust ? 'By customer' : 'By supplier'}</option></select></Field>
        <Field label={cust ? 'Customer' : 'Supplier'}><Select value={f.party_id} onChange={(v) => set({ party_id: v })} options={cust ? customers : suppliers} placeholder={cust ? 'All customers' : 'All suppliers'} /></Field>
        <Field label="Age"><Tabs tabs={AGE_FILTERS} value={f.bucket} onChange={(v) => set({ bucket: v })} /></Field>
      </div>
      <ErrorBox error={rep.error} onRetry={rep.reload} />
      {a && (
        <div className="card aging-box">
          <div className="aging-top">
            <div><span>Total due{cust ? ' from customers' : ' to suppliers'}</span><b>{money(a.total)}</b><small>{a.count} open invoice{a.count === 1 ? '' : 's'} · {a.parties} {cust ? 'customer' : 'supplier'}{a.parties === 1 ? '' : 's'} · oldest {a.oldest} day{a.oldest === 1 ? '' : 's'}</small></div>
            <small className="muted">Age = days since the invoice date, as of {fdate(today())}</small>
          </div>
          <div className="aging-bar" aria-hidden="true">{parts.filter((p) => p.amount > 0.004).map((p) => <i key={p.key} className={AGE_TONE[p.key]} style={{ flexGrow: p.amount }} title={`${p.label}: ${money(p.amount)}`} />)}</div>
          <div className="aging-buckets">
            {parts.map((p) => (
              <button type="button" key={p.key} className={`aging-b ${AGE_TONE[p.key]} ${p.amount > 0.004 ? '' : 'zero'}`} onClick={() => p.key !== 'none' && p.key !== 'b30' && set({ bucket: f.bucket === p.key ? 'all' : p.key })} disabled={p.key === 'none' || p.key === 'b30'}
                title={p.key === 'none' || p.key === 'b30' ? undefined : `Show dues ${p.label.toLowerCase()} and older`}>
                <span><i />{p.label}</span><b>{money(p.amount)}</b><small>{a.total > 0 ? Math.round((p.amount / a.total) * 100) : 0}% of the due</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {r && <h2 className="pr-title">{r.title}</h2>}
      <DataTable title={r?.title || 'Aging report'} loading={rep.loading} rows={r?.rows || []} columns={columns} totals={r?.totals}
        onRowClick={f.group === 'invoice' ? (row) => row.doc && setDoc({ type: row.doc, id: row.id }) : (row) => set({ group: 'invoice', party_id: row.party_id })}
        empty={<Empty title="Nothing due">{f.bucket === 'all' ? 'No open dues for this choice.' : 'No dues that old.'}</Empty>} />
      <p className="muted">{f.group === 'invoice' ? 'Click an invoice to open it.' : `Click a ${cust ? 'customer' : 'supplier'} to see their invoices.`} "No invoice" is an opening balance or other due not tied to an invoice.</p>
      {doc && <DocViewer doc={doc} onClose={() => setDoc(null)} />}
    </>
  );
}

/* ---------------------------------------------------------------- Individual report */
const KINDS = {
  customer: [['sales', 'Sales invoices'], ['returns', 'Sales returns'], ['payments', 'Due collections'], ['ledger', 'Ledger statement'], ['items', 'Products bought'], ['aging', 'Dues by age']],
  supplier: [['purchases', 'Purchase invoices'], ['returns', 'Purchase returns'], ['payments', 'Payments'], ['ledger', 'Ledger statement'], ['items', 'Products supplied'], ['aging', 'Dues by age']]
};
const DOCS_OF = { sales: 'invoices', purchases: 'invoices', returns: 'return slips' };

async function returnDocs(type, rows) {
  if (rows.length > 100) throw new Error('Print at most 100 returns at a time. Tick the ones you need or narrow the dates.');
  const out = [];
  for (const row of rows) out.push((await api('history.doc', { type, id: row.id })).detail);
  return out;
}

export function IndividualReport({ picker }) {
  const { customers, suppliers, can } = useStore();
  const [party, setParty] = useState(can('customers') ? 'customer' : 'supplier');
  const cust = party === 'customer';
  const [id, setId] = useState('');
  const [kind, setKind] = useState(cust ? 'sales' : 'purchases');
  const [period, setPeriod] = usePeriod('year');
  const [status, setStatus] = useState('active');
  const [printAs, setPrintAs] = useState('docs');
  const [card, setCard] = useState(null);
  const [doc, setDoc] = useState(null);
  const list = cust ? customers : suppliers;
  const who = list.find((x) => x.id === id);
  useEffect(() => { setCard(null); if (id) loadPartyCard(party, id, true).then(setCard, () => setCard(null)); }, [party, id]);

  const ledger = kind === 'ledger';
  const payload = useMemo(() => {
    if (!id || ledger) return null;
    const range = { from: period.from, to: period.to };
    if (kind === 'sales') return { type: 'sales', group: 'invoice', customer_id: id, status, ...range };
    if (kind === 'purchases') return { type: 'purchases', group: 'invoice', supplier_id: id, status, ...range };
    if (kind === 'returns') return cust ? { type: 'sales_returns', customer_id: id, status, ...range } : { type: 'purchase_returns', supplier_id: id, status, ...range };
    if (kind === 'payments') return { type: cust ? 'due_collections' : 'supplier_payments', party_id: id, direction: 'all', ...range };
    if (kind === 'items') return { type: 'party_items', party, party_id: id, ...range };
    return { type: 'aging', party, party_id: id };
  }, [id, kind, party, cust, status, period, ledger]);
  const rep = useApi('reports', payload || {}, [], { skip: !payload });
  const st = useApi(cust ? 'customer.statement' : 'supplier.statement', cust ? { customer_id: id, from: period.from, to: period.to } : { supplier_id: id, from: period.from, to: period.to }, [], { skip: !(id && ledger) });
  const r = rep.data, s = st.data;

  const docExport = useMemo(() => {
    if (printAs !== 'docs') return undefined;
    const name = `${(who?.name || party).replace(/[^\w-]+/g, '-')}-${kind}`;
    if (kind === 'sales') return { excel: async (rows) => excelSales(await salesDetails(rows), `${name}.xlsx`), pdf: async (rows) => pdfSales(await salesDetails(rows), `${name}.pdf`), print: async (rows) => printSales(await salesDetails(rows)) };
    if (kind === 'purchases') return { excel: async (rows) => excelPurchases(await purchaseDetails(rows.map((x) => x.id)), `${name}.xlsx`), pdf: async (rows) => pdfPurchases(await purchaseDetails(rows.map((x) => x.id)), `${name}.pdf`), print: async (rows) => printPurchases(await purchaseDetails(rows.map((x) => x.id))) };
    if (kind === 'returns') return cust
      ? { pdf: async (rows) => pdfSalesReturns(await returnDocs('sreturn', rows), `${name}.pdf`), print: async (rows) => printSalesReturns(await returnDocs('sreturn', rows)) }
      : { pdf: async (rows) => pdfPurchaseReturns(await returnDocs('preturn', rows), `${name}.pdf`), print: async (rows) => printPurchaseReturns(await returnDocs('preturn', rows)) };
    return undefined;
  }, [printAs, kind, cust, who, party]);
  const docOf = { sales: 'sale', purchases: 'purchase', returns: cust ? 'sreturn' : 'preturn' }[kind];
  const ledgerCols = [
    { key: 'date', label: 'Date', type: 'date' }, { key: 'ref_no', label: 'Ref' }, { key: 'type', label: 'Entry', value: (row) => { const t = tagOf(party, row.type)[0]; return t.charAt(0) + t.slice(1).toLowerCase(); } }, { key: 'note', label: 'Details', className: 'clip' },
    { key: 'debit', label: cust ? 'Sale / paid out' : 'Paid / returned', type: 'money', sum: true }, { key: 'credit', label: cust ? 'Received' : 'Purchased', type: 'money', sum: true },
    { key: 'balance', label: 'Balance', type: 'money' }
  ];

  return (
    <>
      <div className="filters pr-filters">
        {picker}
        {can('customers') && can('suppliers') && <Field label="Report for"><Tabs tabs={[['customer', 'Customer'], ['supplier', 'Supplier']]} value={party} onChange={(v) => { setParty(v); setId(''); setKind(v === 'customer' ? 'sales' : 'purchases'); }} /></Field>}
        <Field label={cust ? 'Customer' : 'Supplier'}><Select value={id} onChange={setId} options={list} placeholder={cust ? 'Choose a customer…' : 'Choose a supplier…'} aria-label={cust ? 'Customer' : 'Supplier'} /></Field>
        {kind !== 'aging' && <Period value={period} onChange={setPeriod} />}
        {['sales', 'purchases', 'returns'].includes(kind) && <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active only</option><option value="cancelled">Cancelled only</option><option value="all">All</option></select></Field>}
      </div>
      <Field label="Report"><Tabs tabs={KINDS[party]} value={kind} onChange={setKind} /></Field>
      {!id ? <div className="card"><Empty title={`Choose a ${cust ? 'customer' : 'supplier'}`}>Their sales or purchases, returns, payments, ledger, products and dues appear here, for any period you pick.</Empty></div> : <>
        {card && <div className="ir-card"><PartyCardBody d={card} /></div>}
        {DOCS_OF[kind] && (
          <div className="ir-print">
            <span className="muted">Excel / PDF / Print gives</span>
            <Tabs tabs={[['docs', `Full ${DOCS_OF[kind]}`], ['list', 'This list']]} value={printAs} onChange={setPrintAs} />
            <span className="muted">{printAs === 'docs' ? `each ${kind === 'returns' ? 'return' : 'invoice'} printed as it was ${kind === 'returns' ? 'made' : cust ? 'at the sale' : 'at the purchase'} (ticked rows only, or every row)` : 'one table with the rows below'}</span>
          </div>
        )}
        {ledger ? <>
          <ErrorBox error={st.error} onRetry={st.reload} />
          {s && <Kpis items={[['Opening balance', money(s.opening), periodLabel(period)], ['Closing balance', money(s.closing), s.closing > 0.004 ? (cust ? 'customer owes' : 'we owe') : s.closing < -0.004 ? 'advance' : 'settled', s.closing > 0.004 ? 'warn' : 'ok'], ['Entries', s.rows.length, 'in this period']]} />}
          <DataTable title={`${cust ? 'Customer' : 'Supplier'} statement — ${who?.name || ''}`} loading={st.loading} rows={s?.rows || []} columns={ledgerCols}
            toolbar={s && <button className="btn" onClick={() => printStatement(party, s, period.from, period.to)}>Print statement</button>} />
        </> : <>
          <ErrorBox error={rep.error} onRetry={rep.reload} />
          {r && <h2 className="pr-title">{r.title}{who ? ` — ${who.name}` : ''}</h2>}
          <DataTable title={`${r?.title || 'Report'}${who ? ` — ${who.name}` : ''}`} loading={rep.loading} rows={r?.rows || []} totals={r?.totals}
            columns={(r?.columns || []).map((c) => ({ ...c, className: c.key === 'items' || c.key === 'items_text' ? 'clip' : '' }))}
            sumFilter={(row) => row.status === undefined || row.status === 'active'} rowClass={(row) => (row.status === 'cancelled' ? 'dim' : '')}
            docExport={docExport} docAll={!!docExport}
            onRowClick={docOf ? (row) => setDoc({ type: docOf, id: row.id }) : kind === 'aging' ? (row) => row.doc && setDoc({ type: row.doc, id: row.id }) : undefined}
            empty={<Empty title="Nothing in this period">Choose another period or report.</Empty>} />
          {(docOf || kind === 'aging') && <p className="muted">Click a row to see the full document.</p>}
        </>}
      </>}
      {doc && <DocViewer doc={doc} onClose={() => setDoc(null)} />}
    </>
  );
}
