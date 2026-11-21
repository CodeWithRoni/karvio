import { useState } from 'react';
import { money, today, fdate } from '../lib/format';
import DataTable from '../components/DataTable';
import { useApi, PageHead, Field, DateRange, ErrorBox, Badge, Loading, Btn, Empty } from '../components/ui';

const ins = (v) => money(v, false);

/** Day book (daily khata): every money entry of the chosen days with opening and closing balances, and the business done. */
export default function DayBook() {
  const [range, setRange] = useState({ from: today(), to: today() });
  const [accountId, setAccountId] = useState('');
  const q = useApi('daybook', { ...range, account_id: accountId }, [range.from, range.to, accountId]);
  const d = q.data;
  const oneDay = range.from === range.to;
  const setDay = (n) => { const t = new Date(range.from + 'T12:00:00'); t.setDate(t.getDate() + n); const v = t.toISOString().slice(0, 10); if (v <= today()) setRange({ from: v, to: v }); };
  return (
    <>
      <PageHead title="Day book" sub="Every taka that came in or went out, account by account, with the opening and closing balance — and the business done on those days." />
      <div className="filters">
        <Field label="Days"><DateRange from={range.from} to={range.to} onChange={(r) => r.from && r.to && setRange(r)} /></Field>
        <Field label="Account"><select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account">
          <option value="">All accounts</option>{(d?.all_accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <div className="row" style={{ alignSelf: 'end' }}>
          <Btn onClick={() => setDay(-1)} disabled={!oneDay}>← Previous day</Btn>
          <Btn onClick={() => setRange({ from: today(), to: today() })}>Today</Btn>
          <Btn onClick={() => setDay(1)} disabled={!oneDay || range.from >= today()}>Next day →</Btn>
        </div>
      </div>
      <ErrorBox error={q.error} onRetry={q.reload} />
      {q.loading && !d ? <Loading label="Reading the day book" /> : d && <>
        <div className="db-sum">
          <div className="card"><span>Opening balance</span><b className="num">{money(d.opening)}</b><small>{fdate(d.from)} morning</small></div>
          <div className="card in"><span>Money in</span><b className="num">+ {money(d.in)}</b><small>{d.entries.filter((e) => e.direction === 'in').length} entries</small></div>
          <div className="card out"><span>Money out</span><b className="num">− {money(d.out)}</b><small>{d.entries.filter((e) => e.direction === 'out').length} entries</small></div>
          <div className="card"><span>Closing balance</span><b className="num">{money(d.closing)}</b><small>{fdate(d.to)} night</small></div>
        </div>

        {d.business && <section className="card">
          <div className="card-head"><h2>Business {oneDay ? `on ${fdate(d.from)}` : `${fdate(d.from)} – ${fdate(d.to)}`}</h2></div>
          <div className="db-biz">
            <div><span>Sales <small>({d.business.sales.count})</small></span><b className="num">{ins(d.business.sales.total)}</b><small>Received {ins(d.business.sales.paid)} · due {ins(d.business.sales.due)}</small></div>
            <div><span>Sales returns <small>({d.business.sales_returns.count})</small></span><b className="num">{ins(d.business.sales_returns.total)}</b><small>Refunded {ins(d.business.sales_returns.refund)}</small></div>
            <div><span>Purchases <small>({d.business.purchases.count})</small></span><b className="num">{ins(d.business.purchases.total)}</b><small>Paid {ins(d.business.purchases.paid)} · due {ins(d.business.purchases.due)}</small></div>
            <div><span>Purchase returns <small>({d.business.purchase_returns.count})</small></span><b className="num">{ins(d.business.purchase_returns.total)}</b><small>Received back {ins(d.business.purchase_returns.received)}</small></div>
            <div><span>Expenses <small>({d.business.expenses.count})</small></span><b className="num">{ins(d.business.expenses.amount)}</b></div>
            <div><span>Due collected</span><b className="num">{ins(d.business.collections)}</b></div>
            <div><span>Paid to suppliers</span><b className="num">{ins(d.business.supplier_payments)}</b></div>
            {d.business.profit !== null && <div><span>Gross profit on sales</span><b className="num">{ins(d.business.profit)}</b></div>}
          </div>
        </section>}

        <section className="card">
          <div className="card-head"><h2>Accounts</h2></div>
          <div className="dt-scroll"><table className="dc-hist">
            <thead><tr><th>Account</th><th className="r">Opening</th><th className="r">In</th><th className="r">Out</th><th className="r">Closing</th></tr></thead>
            <tbody>{d.accounts.map((a) => <tr key={a.id}><td>{a.name} <small className="muted">{a.type.toUpperCase()}</small></td><td className="r num">{ins(a.opening)}</td><td className="r num">{a.in ? '+' + ins(a.in) : '—'}</td><td className="r num">{a.out ? '−' + ins(a.out) : '—'}</td><td className="r num"><b>{ins(a.closing)}</b></td></tr>)}</tbody>
            <tfoot><tr><th>Total</th><th className="r num">{ins(d.opening)}</th><th className="r num">+{ins(d.in)}</th><th className="r num">−{ins(d.out)}</th><th className="r num">{ins(d.closing)}</th></tr></tfoot>
          </table></div>
        </section>

        {d.truncated && <p className="muted">Only the last 5,000 entries are listed — choose fewer days to see all.</p>}
        <DataTable keepOrder title={`Day book ${d.from}${oneDay ? '' : ' to ' + d.to}`} rows={d.entries} loading={q.loading}
          empty={<Empty icon="receipt" title="No money moved in or out on these days">Sales, payments, expenses and transfers will show here.</Empty>}
          totals={{ in_amount: d.in, out_amount: d.out }}
          columns={[
            ...(oneDay ? [] : [{ key: 'date', label: 'Date', type: 'date' }]),
            { key: 'account_name', label: 'Account' },
            { key: 'label', label: 'Type', render: (r) => <Badge tone={r.direction === 'in' ? 'ok' : 'bad'}>{r.label}</Badge> },
            { key: 'note', label: 'Details' },
            { key: 'in_amount', label: 'In', type: 'money', value: (r) => (r.direction === 'in' ? r.amount : ''), render: (r) => (r.direction === 'in' ? ins(r.amount) : '') },
            { key: 'out_amount', label: 'Out', type: 'money', value: (r) => (r.direction === 'out' ? r.amount : ''), render: (r) => (r.direction === 'out' ? ins(r.amount) : '') },
            { key: 'balance', label: 'Balance', type: 'money' },
            { key: 'user', label: 'By' }
          ]} />
      </>}
    </>
  );
}
