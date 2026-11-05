import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { money, qty, fdate } from '../lib/format';
import { useApi, PageHead, Tabs, Loading, ErrorBox, Btn, Empty } from '../components/ui';
import LiveClock from '../components/LiveClock';

function Stat({ label, value, sub, tone }) {
  return <div className={`stat ${tone || ''}`}><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>;
}

export default function Dashboard() {
  const { data: d, loading, error, reload } = useApi('dashboard', {});
  const can = useStore((s) => s.can);
  const [per, setPer] = useState('today');
  const [lb, setLb] = useState('month');

  if (loading && !d) return <Loading label="Loading dashboard" />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const c = d[per];
  const max = Math.max(1, ...d.series.map((x) => x.sales));

  return (
    <>
      <PageHead title={d.limited ? `Hello, ${d.user}` : 'Dashboard'} sub={`${fdate(d.date)}${d.limited ? ' — your own sales' : ''}`} center={<LiveClock />}>
        <Tabs tabs={[['today', 'Today'], ['month', 'This month'], ['total', 'All time']]} value={per} onChange={setPer} />
        <Btn onClick={reload} busy={loading}>Refresh</Btn>
        {can('pos') && <Link to="/pos" className="btn btn-primary">New sale</Link>}
      </PageHead>

      <div className="stats">
        <Stat label="Sales" value={money(c.sales)} sub={`${c.invoices} invoices`} />
        {!d.limited && <>
          <Stat label="Sales returns" value={money(c.sales_returns)} tone={c.sales_returns ? 'warn' : ''} />
          <Stat label="Purchases" value={money(c.purchases)} />
          <Stat label="Purchase returns" value={money(c.purchase_returns)} />
          <Stat label="Expenses" value={money(c.expenses)} />
          {c.gross_profit !== undefined && <Stat label="Gross profit" value={money(c.gross_profit)} sub="Sales − cost − returns" tone={c.gross_profit >= 0 ? 'up' : 'down'} />}
          {c.net_profit !== undefined && <Stat label="Net profit" value={money(c.net_profit)} sub="Gross profit − expenses" tone={c.net_profit >= 0 ? 'up' : 'down'} />}
        </>}
        <Stat label="New dues on sales" value={money(c.due)} tone={c.due ? 'warn' : ''} />
      </div>

      {d.accounts && (
        <section style={{ marginTop: 18 }}>
          <div className="card-head"><h2>Live balances</h2>{can('accounts') && <Link to="/accounts" className="link">Manage accounts</Link>}</div>
          <div className="patch">
            {d.accounts.map((a) => (
              <div className="port" data-type={a.type} key={a.id}>
                <div className="pn">{a.name}</div>
                <div className="pt">{a.type === 'mfs' ? 'Mobile banking' : a.type === 'cash' ? 'Cash drawer' : 'Bank'}{a.number ? ` · ${a.number}` : ''}</div>
                <div className={`pb ${a.balance < 0 ? 'neg' : ''}`}>{money(a.balance)}</div>
              </div>
            ))}
            <div className="port" data-type="bank" style={{ '--c': 'var(--fiber)' }}>
              <div className="pn">All accounts</div><div className="pt">Total money in hand</div>
              <div className="pb">{money(d.accounts.reduce((a, x) => a + x.balance, 0))}</div>
            </div>
          </div>
        </section>
      )}

      <div className="split" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="card-head"><h2>Last 14 days</h2><span className="muted">Hover a bar for the amount</span></div>
          <div className="bars">
            {d.series.map((x, i) => (
              <div className="b" key={x.date}>
                <div className={`bar ${i === d.series.length - 1 ? 'today' : ''}`} style={{ height: `${(x.sales / max) * 100}%` }} data-v={`${money(x.sales)} · ${x.invoices} inv`} />
                <small>{x.date.slice(8)}</small>
              </div>
            ))}
          </div>
          {!d.limited && (
            <div className="kv" style={{ marginTop: 16 }}>
              <div><span>Customers owe you</span><b>{money(d.receivable)}</b></div>
              <div><span>You owe suppliers</span><b>{money(d.payable)}</b></div>
              {d.stock_value !== undefined && <div><span>Stock value at cost</span><b>{money(d.stock_value)}</b></div>}
              <div><span>Warranty: pending / at vendor / ready</span><b>{d.claims.pending} / {d.claims.vendor} / {d.claims.ready}</b></div>
            </div>
          )}
        </div>

        {d.leaderboard ? (
          <div className="card">
            <div className="card-head"><h2>Staff leaderboard</h2><Tabs tabs={[['today', 'Today'], ['month', 'Month'], ['total', 'All']]} value={lb} onChange={setLb} /></div>
            {d.leaderboard[lb].length ? (
              <table className="lb">
                <tbody>
                  {d.leaderboard[lb].map((r, i) => (
                    <tr key={r.name}>
                      <td style={{ width: 26, color: 'var(--muted)', fontWeight: 800 }}>{i + 1}</td>
                      <td><b>{r.name}</b><div className="muted" style={{ fontSize: 12 }}>{r.invoices} invoices{r.profit !== undefined ? ` · profit ${money(r.profit, false)}` : ''}</div></td>
                      <td className="r num"><b>{money(r.total, false)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty title="No sales in this period" />}
          </div>
        ) : (
          <div className="card">
            <div className="card-head"><h2>Your recent invoices</h2></div>
            {d.recent.length ? d.recent.map((s) => <div key={s.id} className="row" style={{ padding: '6px 0' }}><Link to={`/sales/${s.id}`}>{s.invoice_no}</Link><span className="muted">{s.customer_name}</span><span className="spacer" /><b className="num">{money(s.total, false)}</b></div>) : <Empty title="No sales yet today" />}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head"><h2>Low stock</h2><Link to="/stock?low=1" className="link">Open stock explorer</Link></div>
        {d.low_stock.length ? (
          <div className="dt-scroll"><table className="lb"><tbody>
            {d.low_stock.map((p) => (
              <tr key={p.id}><td>{p.name}</td><td className="r num" style={{ color: p.stock <= 0 ? 'var(--bad)' : 'var(--warn)', fontWeight: 800 }}>{qty(p.stock, p.unit)}</td><td className="r muted">alert at {qty(p.threshold, p.unit)}</td></tr>
            ))}
          </tbody></table></div>
        ) : <Empty title="Stock levels look healthy" />}
      </div>
    </>
  );
}
