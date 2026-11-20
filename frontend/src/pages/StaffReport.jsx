// Reports hub — Staff leaderboard: everyone who sold in the period, best staff highlighted; pick one person for
// everything about their sales (invoices, profit, products, customers, payment methods, day by day).
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { money, qty as fqty, fdate } from '../lib/format';
import DataTable from '../components/DataTable';
import DocViewer from '../components/DocViewer';
import { useApi, Field, ErrorBox, Tabs, Empty, Btn } from '../components/ui';
import { PERIODS } from './PartyReports';
import { DateRange } from '../components/ui';

const pct = (v) => `${Number(v || 0).toFixed(1).replace(/\.0$/, '')}%`;
const ROLE = { admin: 'Admin', manager: 'Manager', sales: 'Sales', technician: 'Technician' };

function Period({ value, onChange }) {
  return (
    <>
      <Field label="Period"><Tabs tabs={PERIODS.map(([v, l]) => [v, l])} value={value.preset} onChange={(v) => onChange({ preset: v, ...PERIODS.find((p) => p[0] === v)[2]() })} /></Field>
      <Field label="Custom range"><DateRange from={value.from} to={value.to} onChange={(x) => onChange({ preset: '', ...x })} /></Field>
    </>
  );
}

export function StaffReport({ picker }) {
  const { can } = useStore();
  const all = can('sales.all'), cost = can('cost');
  const [period, setPeriod] = useState(() => ({ preset: 'month', ...PERIODS.find((p) => p[0] === 'month')[2]() }));
  const [staff, setStaff] = useState('');
  const [names, setNames] = useState([]); // everyone seen on the leaderboard, for the Staff picker
  const [tab, setTab] = useState('invoices');
  const [doc, setDoc] = useState(null);
  const rep = useApi('reports', { type: 'staff', from: period.from, to: period.to, staff_id: staff });
  const r = rep.data, b = r?.staff_board, d = r?.staff_detail && (staff || !all) ? r.staff_detail : null, board = r && !r.staff_detail;
  useEffect(() => { if (r && !r.staff_detail && r.rows) setNames((old) => { const m = new Map(old.map((x) => [x.id, x.name])); r.rows.forEach((x) => { if (x.staff_id) m.set(x.staff_id, x.staff || ''); }); return [...m].map(([id, name]) => ({ id, name })).sort((a, z) => String(a.name).localeCompare(String(z.name))); }); }, [r]);
  const pick = (id) => { setStaff(id); setTab('invoices'); };

  return (
    <>
      <div className="filters pr-filters">
        {picker}
        <Period value={period} onChange={setPeriod} />
        {all && <Field label="Staff"><select value={staff} onChange={(e) => pick(e.target.value)} aria-label="Staff">
          <option value="">All staff — leaderboard</option>
          {[...names, ...(staff && !names.some((n) => n.id === staff) ? [{ id: staff, name: d?.staff || 'Selected' }] : [])].map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select></Field>}
      </div>
      <ErrorBox error={rep.error} onRetry={rep.reload} />
      {board && b && <Board b={b} rows={r.rows} cost={cost} onPick={pick} />}
      {board && <>
        <h2 className="pr-title">{r.title}</h2>
        <DataTable title={r.title} loading={rep.loading} rows={r.rows || []} columns={(r.columns || []).map((c) => (c.key === 'staff' ? { ...c, render: (row) => <b className="sb-name">{row.staff}</b> } : c.key === 'role' ? { ...c, value: (row) => ROLE[row.role] || row.role } : c.key === 'share' || c.key === 'margin' ? { ...c, render: (row) => pct(row[c.key]) } : c))}
          totals={r.totals} onRowClick={(row) => pick(row.staff_id)} rowClass={(row) => (row.rank === 1 ? 'best' : '')}
          empty={<Empty title="No sales in this period">Choose another period.</Empty>} />
        <p className="muted">Click a person for their full report. Returns count against the seller of the invoice, on the day of the return.</p>
      </>}
      {d && <Detail d={d} r={r} cost={cost} all={all} tab={tab} setTab={setTab} onBack={() => pick('')} onOpen={(id) => setDoc({ type: 'sale', id })} loading={rep.loading} period={period} />}
      {doc && <DocViewer doc={doc} onClose={() => setDoc(null)} />}
    </>
  );
}

function Board({ b, rows, cost, onPick }) {
  const top = rows.slice(0, 3);
  const cards = [
    ['Best seller', b.best_seller, (v) => money(v), 'highest net sales'],
    ['Most invoices', b.most_invoices, (v) => `${v} invoice${v === 1 ? '' : 's'}`, 'busiest at the counter'],
    ...(cost ? [['Most profit', b.best_profit, (v) => money(v), 'profit after returns']] : []),
    ['Top collector', b.best_collector, (v) => money(v), 'customer dues collected'],
    ['Biggest bills', b.best_avg, (v) => money(v), 'average invoice']
  ];
  return (
    <>
      {top.length > 0 && (
        <div className="sb-podium">
          {top.map((x, i) => (
            <button type="button" key={x.staff_id} className={`sb-pod p${i + 1}`} onClick={() => onPick(x.staff_id)} title={`Open ${x.staff}'s report`}>
              <span className="sb-medal">{i + 1}</span>
              <span className="sb-av">{String(x.staff || '?').charAt(0).toUpperCase()}</span>
              <b>{x.staff}</b>
              <small>{ROLE[x.role] || x.role}</small>
              <strong>{money(x.net)}</strong>
              <span className="sb-sub">{x.invoices} invoice{x.invoices === 1 ? '' : 's'}{cost && x.profit !== undefined ? ` · profit ${money(x.profit, false)}` : ''}</span>
              <span className="sb-bar"><i style={{ width: `${Math.max(4, x.share)}%` }} /></span>
              <span className="sb-sub">{pct(x.share)} of team sales</span>
            </button>
          ))}
        </div>
      )}
      <div className="om-kpis pr-kpis">
        <div className="card"><span>Team</span><b>{money(b.team.net)}</b><small>{b.team.invoices} invoices · {b.team.staff} staff</small></div>
        {cards.map(([label, x, fmt, sub]) => <div className="card" key={label}><span>{label}</span><b>{x ? x.staff : '—'}</b><small>{x ? `${fmt(x.value)} · ${sub}` : 'nobody yet'}</small></div>)}
      </div>
    </>
  );
}

function Detail({ d, r, cost, all, tab, setTab, onBack, onOpen, loading, period }) {
  const s = d.summary;
  const maxDay = Math.max(1, ...d.daily.map((x) => Math.abs(x.net)));
  const k = [
    ['Net sales', money(s.net), `${money(s.gross, false)} sold − ${money(s.returns, false)} returned`, 'ok'],
    ['Invoices', s.invoices, `${s.cash_sales} cash sale${s.cash_sales === 1 ? '' : 's'} · ${s.customers} customer${s.customers === 1 ? '' : 's'}`],
    ['Average invoice', money(s.avg), `${fqty(s.qty)} items sold`],
    ...(cost ? [['Profit', money(s.profit), `margin ${pct(s.margin)}`, s.profit < 0 ? 'bad' : 'ok']] : []),
    ['Collected at sale', money(s.paid), 'cash, bank, MFS and advance'],
    ['Sold on due', money(s.due_given), 'left for customers to pay', s.due_given > 0 ? 'warn' : ''],
    ['Dues collected', money(s.collected), 'old dues taken from customers'],
    ['Discount given', money(s.discount), `${s.gross > 0 ? pct((s.discount / (s.gross + s.discount)) * 100) : '0%'} of the bill`],
    ['Returns', money(s.returns), `${s.returns_count} return${s.returns_count === 1 ? '' : 's'}`, s.returns > 0 ? 'warn' : ''],
    ['Cancelled invoices', s.cancelled, 'cancelled in this period', s.cancelled > 0 ? 'warn' : '']
  ];
  const tables = {
    invoices: { rows: r.rows, columns: r.columns, title: r.title, click: (row) => onOpen(row.id) },
    daily: { rows: d.daily, title: `Day by day — ${d.staff}`, columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'invoices', label: 'Invoices', type: 'num', sum: true }, { key: 'sales', label: 'Sales', type: 'money', sum: true }, { key: 'returns', label: 'Returns', type: 'money', sum: true }, { key: 'net', label: 'Net', type: 'money', sum: true }, ...(cost ? [{ key: 'profit', label: 'Profit', type: 'money', sum: true }] : [])] },
    products: { rows: d.products, title: `Products sold — ${d.staff}`, columns: [{ key: 'product', label: 'Product' }, { key: 'unit', label: 'Unit' }, { key: 'invoices', label: 'Invoices', type: 'num' }, { key: 'qty', label: 'Qty', type: 'num' }, { key: 'amount', label: 'Amount', type: 'money', sum: true }, ...(cost ? [{ key: 'profit', label: 'Profit', type: 'money', sum: true }] : [])] },
    customers: { rows: d.customers, title: `Customers served — ${d.staff}`, columns: [{ key: 'customer', label: 'Customer' }, { key: 'invoices', label: 'Invoices', type: 'num', sum: true }, { key: 'amount', label: 'Amount', type: 'money', sum: true }, { key: 'due', label: 'Left on due', type: 'money', sum: true }] },
    methods: { rows: d.methods, title: `How customers paid — ${d.staff}`, columns: [{ key: 'method', label: 'Paid by' }, { key: 'count', label: 'Invoices', type: 'num', sum: true }, { key: 'amount', label: 'Amount', type: 'money', sum: true }] }
  };
  const t = tables[tab];
  return (
    <>
      <div className="card sd-head">
        <span className="sb-av big">{String(d.staff || '?').charAt(0).toUpperCase()}</span>
        <div className="sd-who">
          <h2>{d.staff}</h2>
          <small>{ROLE[d.role] || d.role}{d.username ? ` · @${d.username}` : ''}{d.since ? ` · staff since ${fdate(d.since)}` : ''}{d.active ? '' : ' · inactive'}</small>
        </div>
        {d.rank > 0 && <span className={`sd-rank r${Math.min(d.rank, 4)}`}><b>#{d.rank}</b> of {d.of}</span>}
        {all && <Btn onClick={onBack}>← Leaderboard</Btn>}
      </div>
      <div className="om-kpis pr-kpis sd-kpis">{k.map(([label, v, sub, tone]) => <div className="card" key={label}><span>{label}</span><b className={tone || ''}>{v}</b><small>{sub}</small></div>)}</div>
      {d.daily.length > 1 && (
        <div className="card sd-trend">
          <b>Net sales by day</b>
          <div className="sd-bars">{d.daily.map((x) => <span key={x.date} title={`${fdate(x.date)} · ${money(x.net)} · ${x.invoices} invoice${x.invoices === 1 ? '' : 's'}`}><i className={x.net < 0 ? 'neg' : ''} style={{ height: `${Math.max(3, (Math.abs(x.net) / maxDay) * 100)}%` }} /></span>)}</div>
          <div className="sd-axis"><small>{fdate(d.daily[0].date)}</small><small>{fdate(d.daily[d.daily.length - 1].date)}</small></div>
        </div>
      )}
      <Field label="Show"><Tabs tabs={[['invoices', `Invoices (${r.rows.length})`], ['daily', 'Day by day'], ['products', 'Products'], ['customers', 'Customers'], ['methods', 'Payment methods']]} value={tab} onChange={setTab} /></Field>
      <h2 className="pr-title">{t.title}</h2>
      <DataTable key={tab} title={t.title} loading={loading} rows={t.rows || []} columns={t.columns || []} totals={tab === 'invoices' ? r.totals : undefined} onRowClick={t.click}
        empty={<Empty title="Nothing in this period">Choose another period.</Empty>} />
      {tab === 'invoices' && <p className="muted">Click an invoice to open it.</p>}
    </>
  );
}
