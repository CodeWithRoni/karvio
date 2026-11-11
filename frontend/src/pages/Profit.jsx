import { useMemo, useState } from 'react';
import { shopDay } from '../lib/store';
import { money, fdate, addDays } from '../lib/format';
import DataTable from '../components/DataTable';
import { useApi, PageHead, Tabs, DateRange, Loading, ErrorBox, Btn, Empty } from '../components/ui';

/** Profit reports. Gross profit = sales − cost of goods − profit given back on returns. Net profit = gross − expenses ± stock adjustments and warranty replacements at cost. */
const PRESETS = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['last_month', 'Last month'], ['six', 'Last 6 months'], ['year', 'This year'], ['custom', 'Custom']];
const ym = (y, m) => { while (m < 1) { m += 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; };
const lastDayOf = (ymStr) => { const [y, m] = ymStr.split('-').map(Number); return `${ymStr}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
export function presetRange(key, t) {
  const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7));
  const dow = new Date(`${t}T12:00:00Z`).getUTCDay(); // 0 = Sunday; the shop week starts on Saturday
  if (key === 'today') return { from: t, to: t };
  if (key === 'week') return { from: addDays(t, -((dow + 1) % 7)), to: t };
  if (key === 'last_month') { const lm = ym(y, m - 1); return { from: `${lm}-01`, to: lastDayOf(lm) }; }
  if (key === 'six') return { from: `${ym(y, m - 5)}-01`, to: t };
  if (key === 'year') return { from: `${y}-01-01`, to: t };
  return { from: `${t.slice(0, 7)}-01`, to: t };
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const periodLabel = (p) => (p.length === 7 ? `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}` : fdate(p));
const tone = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');

export default function Profit() {
  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState(() => presetRange('month', shopDay()));
  const [group, setGroup] = useState('auto');
  const [view, setView] = useState('timeline');
  const range = preset === 'custom' ? custom : presetRange(preset, shopDay());
  const payload = useMemo(() => ({ from: range.from, to: range.to, ...(group === 'auto' ? {} : { group }) }), [range.from, range.to, group]);
  const { data: d, loading, error, reload } = useApi('profit.report', payload, [], { skip: !range.from || !range.to });

  return (
    <>
      <PageHead title="Profit" sub="Gross profit = sales − cost of goods − profit on returned goods. Net profit = gross profit − expenses − stock written off.">
        <Btn onClick={reload} busy={loading}>Refresh</Btn>
      </PageHead>
      <div className="filters profit-filters">
        <Tabs tabs={PRESETS} value={preset} onChange={(k) => { if (k === 'custom') setCustom(range); setPreset(k); }} />
        {preset === 'custom' && <DateRange {...custom} onChange={setCustom} />}
        {preset !== 'custom' && <span className="muted">{range.from === range.to ? fdate(range.from) : `${fdate(range.from)} – ${fdate(range.to)}`}</span>}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {!d ? (loading ? <Loading label="Calculating profit" /> : null) : <Report d={d} group={group} setGroup={setGroup} view={view} setView={setView} />}
    </>
  );
}

function Report({ d, group, setGroup, view, setView }) {
  const s = d.summary;
  return (
    <>
      <div className="stats profit-summary">
        <div className="stat"><span>Sales</span><b>{money(s.net_sales)}</b><small>{s.invoices} invoice{s.invoices === 1 ? '' : 's'}{s.returns ? ` · after ${money(s.returns, false)} returns` : ''}</small></div>
        <div className="stat"><span>Cost of goods</span><b>{money(s.cost - s.returns_cost)}</b><small>What the sold goods cost you</small></div>
        <div className={`stat ${tone(s.gross)}`}><span>Gross profit</span><b>{money(s.gross)}</b><small>Margin {s.margin}%</small></div>
        <div className="stat"><span>Expenses</span><b>{money(s.expenses)}</b><small>{s.expense_count} entr{s.expense_count === 1 ? 'y' : 'ies'}</small></div>
        <div className={`stat ${tone(s.net)}`}><span>Net profit</span><b>{money(s.net)}</b><small>Net margin {s.net_margin}%</small></div>
      </div>

      <div className="card profit-steps" style={{ marginTop: 14 }}>
        <div className="card-head"><h2>How the profit adds up</h2><span className="muted">{fdate(d.from)}{d.from !== d.to ? ` – ${fdate(d.to)}` : ''}</span></div>
        <table className="lb"><tbody>
          <tr><td>Sales <small className="muted">({s.invoices} invoice{s.invoices === 1 ? '' : 's'}{s.discount ? `, after ${money(s.discount, false)} invoice discounts` : ''})</small></td><td className="r num">{money(s.sales, false)}</td></tr>
          <tr><td>− Cost of goods sold</td><td className="r num">{money(-s.cost, false)}</td></tr>
          <tr className="sub"><td>= Profit on sales</td><td className="r num">{money(s.sales_profit, false)}</td></tr>
          <tr><td>− Profit given back on returns <small className="muted">({s.return_count} return{s.return_count === 1 ? '' : 's'} worth {money(s.returns, false)}, goods back at cost {money(s.returns_cost, false)})</small></td><td className="r num">{money(-s.returns_profit, false)}</td></tr>
          <tr className={`sub ${tone(s.gross)}`}><td><b>= Gross profit</b></td><td className="r num"><b>{money(s.gross, false)}</b></td></tr>
          <tr><td>− Expenses <small className="muted">({s.expense_count})</small></td><td className="r num">{money(-s.expenses, false)}</td></tr>
          {!!s.stock_adjust && <tr><td>{s.stock_adjust < 0 ? '− Stock / warranty loss' : '+ Stock / warranty recovery'} <small className="muted">(stock adjustments at cost)</small></td><td className="r num">{money(s.stock_adjust, false)}</td></tr>}
          <tr className={`sub total ${tone(s.net)}`}><td><b>= Net profit</b></td><td className="r num"><b>{money(s.net, false)}</b></td></tr>
        </tbody></table>
      </div>

      <div className="row" style={{ marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
        <Tabs tabs={[['timeline', d.group === 'month' ? 'Month by month' : 'Day by day'], ['products', 'By product'], ['staff', 'By staff'], ['expenses', 'Expenses by category']]} value={view} onChange={setView} />
        <span className="spacer" />
        {view === 'timeline' && <Tabs tabs={[['auto', 'Auto'], ['day', 'Daily'], ['month', 'Monthly']]} value={group} onChange={setGroup} />}
      </div>
      <div style={{ marginTop: 10 }}>
        {view === 'timeline' && <DataTable title={`Profit ${d.from} to ${d.to}`} rows={d.timeline} pageSize={31} empty={<Empty title="No sales, returns or expenses in this period" />}
          columns={[
            { key: 'period', label: d.group === 'month' ? 'Month' : 'Date', render: (r) => periodLabel(r.period) },
            { key: 'invoices', label: 'Invoices', type: 'num', sum: true },
            { key: 'sales', label: 'Sales', type: 'money', sum: true },
            { key: 'cost', label: 'Cost', type: 'money', sum: true },
            { key: 'returns', label: 'Returns', type: 'money', sum: true },
            { key: 'gross', label: 'Gross profit', type: 'money', sum: true },
            { key: 'expenses', label: 'Expenses', type: 'money', sum: true },
            { key: 'stock_adjust', label: 'Stock adjust', type: 'money', sum: true },
            { key: 'net', label: 'Net profit', type: 'money', sum: true, className: 'profit-net' }
          ]} />}
        {view === 'products' && <DataTable title={`Profit by product ${d.from} to ${d.to}`} rows={d.products} pageSize={25} empty={<Empty title="Nothing sold in this period" />}
          columns={[
            { key: 'name', label: 'Product' },
            { key: 'qty', label: 'Qty sold', type: 'num', sum: true },
            { key: 'revenue', label: 'Sales', type: 'money', sum: true },
            { key: 'cost', label: 'Cost', type: 'money', sum: true },
            { key: 'returned_qty', label: 'Returned qty', type: 'num', sum: true },
            { key: 'profit', label: 'Profit', type: 'money', sum: true },
            { key: 'margin', label: 'Margin %', type: 'num' }
          ]} />}
        {view === 'products' && d.products.length > 0 && s.discount > 0 && <p className="muted" style={{ fontSize: 12.5 }}>Product profit is before invoice discounts ({money(s.discount)} in this period), which are taken off in the gross profit above.</p>}
        {view === 'staff' && <DataTable title={`Profit by staff ${d.from} to ${d.to}`} rows={d.staff} pageSize={25} empty={<Empty title="No sales in this period" />}
          columns={[
            { key: 'name', label: 'Staff' },
            { key: 'invoices', label: 'Invoices', type: 'num', sum: true },
            { key: 'sales', label: 'Sales', type: 'money', sum: true },
            { key: 'returns', label: 'Returns', type: 'money', sum: true },
            { key: 'gross', label: 'Gross profit', type: 'money', sum: true }
          ]} />}
        {view === 'expenses' && <DataTable title={`Expenses by category ${d.from} to ${d.to}`} rows={d.expenses} pageSize={25} empty={<Empty title="No expenses in this period" />}
          columns={[
            { key: 'category', label: 'Category' },
            { key: 'count', label: 'Entries', type: 'num', sum: true },
            { key: 'amount', label: 'Amount', type: 'money', sum: true }
          ]} />}
      </div>
    </>
  );
}
