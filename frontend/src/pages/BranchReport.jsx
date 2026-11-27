import { useState } from 'react';
import { useStore } from '../lib/store';
import { money, monthStart, today, fdate } from '../lib/format';
import { printTable, exportExcel } from '../lib/export';
import { useApi, PageHead, Field, DateRange, ErrorBox, Loading, Empty, Btn } from '../components/ui';

/** Money & Reports → Branch report: every branch side by side, and all branches together. */
export default function BranchReport() {
  const on = useStore((s) => !!s.branches?.on);
  const can = useStore((s) => s.can);
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const q = useApi('branch.report', range, [range.from, range.to], { skip: !on });
  if (!on) return <><PageHead title="Branch report" /><Empty icon="receipt" title="Branches are off">An admin can add branches in Settings → Branches.</Empty></>;
  const d = q.data, cost = can('cost');
  const cols = [
    { key: 'name', label: 'Branch' }, { key: 'sales_count', label: 'Invoices' }, { key: 'sales', label: 'Sales', type: 'money' }, { key: 'paid', label: 'Received', type: 'money' },
    { key: 'due', label: 'Due', type: 'money' }, { key: 'returns', label: 'Returns', type: 'money' }, ...(cost ? [{ key: 'profit', label: 'Gross profit', type: 'money' }] : []),
    { key: 'purchases', label: 'Purchases', type: 'money' }, { key: 'expenses', label: 'Expenses', type: 'money' }, { key: 'stock_text', label: 'Stock' },
    ...(cost ? [{ key: 'stock_value', label: 'Stock value', type: 'money' }] : []), { key: 'cash', label: 'Cash & accounts', type: 'money' }
  ];
  // Stock is shown per unit (pcs and meters are not added together); an older server sends only one number.
  const summary = d?.all || d?.branches[0];
  const rows = d ? [...d.branches, ...(d.all ? [{ ...d.all, name: 'All branches', id: 'all' }] : [])].map((r) => ({ ...r, stock_text: r.stock_text ?? r.stock_qty })) : [];
  const title = d ? `Branch report ${fdate(d.from)} – ${fdate(d.to)}` : 'Branch report';
  return (
    <>
      <PageHead title="Branch report" sub="Sales, purchases, expenses, stock and cash by branch.">
        {d && <><Btn onClick={() => printTable(title, cols, rows)}>Print</Btn><Btn onClick={() => exportExcel(title, cols, rows)}>Excel</Btn></>}
      </PageHead>
      <div className="filters"><Field label="Days"><DateRange from={range.from} to={range.to} onChange={(r) => r.from && r.to && setRange(r)} /></Field></div>
      <ErrorBox error={q.error} onRetry={q.reload} />
      {q.loading && !d ? <Loading label="Reading branch report" /> : d && summary && <>
        <div className="db-sum">
          <div className="card"><span>Sales — {d.all ? 'all branches' : summary.name}</span><b className="num">{money(summary.sales)}</b><small>{summary.sales_count} invoices</small></div>
          <div className="card"><span>Purchases</span><b className="num">{money(summary.purchases)}</b><small>{summary.purchase_count} purchases</small></div>
          <div className="card out"><span>Expenses</span><b className="num">{money(summary.expenses)}</b></div>
          {d.transit && <div className="card"><span>Stock on the way</span><b className="num">{d.transit.text ?? d.transit.qty}</b><small>{cost ? `${money(d.transit.value || 0)} at cost` : 'units between branches'}</small></div>}
        </div>
        <section className="card">
          <div className="dt-scroll"><table className="dc-hist br-table">
            <thead><tr>{cols.map((c) => <th key={c.key} className={c.key === 'name' ? '' : 'r'}>{c.label}</th>)}</tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id} className={r.id === 'all' ? 'all' : ''}>{cols.map((c) => <td key={c.key} className={c.key === 'name' ? '' : 'r num'}>{c.type === 'money' ? money(r[c.key] || 0, false) : r[c.key]}{c.key === 'name' && r.active === false ? <small className="muted"> (closed)</small> : ''}</td>)}</tr>)}</tbody>
          </table></div>
          {d.shared_cash ? <p className="muted">Accounts not given to a branch hold {money(d.shared_cash)}; it is counted only in "All branches".</p> : null}
        </section>
      </>}
    </>
  );
}
