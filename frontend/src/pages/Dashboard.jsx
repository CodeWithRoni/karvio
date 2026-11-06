import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { money, qty, fdate } from '../lib/format';
import { useApi, PageHead, Tabs, Loading, ErrorBox, Btn, Empty } from '../components/ui';
import LiveClock from '../components/LiveClock';
import { useCardOn } from '../lib/dashboardCards';
import { CollectionReminders, StockSummary, TopProducts } from '../components/DashboardExtras';

function Stat({ label, value, sub, tone }) {
  return <div className={`stat ${tone || ''}`}><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>;
}

// Extra history rows under "Sales history": [field, heading, counted thing, colour, link]
const HISTORY = [
  ['sales_returns', 'Sales returns history', 'return', 'warn', ['/sales', 'Open sales & returns', 'pos']],
  ['purchases', 'Purchase history', 'purchase', '', ['/purchases', 'Open purchases', 'purchase']],
  ['purchase_returns', 'Purchase returns history', 'return', '', ['/purchases', 'Open purchases', 'purchase']],
  ['expenses', 'Expenses history', 'expense', '', ['/expenses', 'Open expenses', 'expenses']],
  ['gross_profit', 'Gross profit history', '', 'pl', null],
  ['net_profit', 'Net profit history', '', 'pl', null],
  ['receivable', 'Receivable history — new customer dues', 'invoice with due', 'warn', ['/customers', 'Open customer dues', null]],
  ['payable', 'Payable history — new supplier dues', 'purchase with due', 'down', ['/suppliers', 'Open suppliers', 'suppliers']]
];

export default function Dashboard() {
  const { data: d, loading, error, reload } = useApi('dashboard', {}, [], { refreshMs: 30000 });
  const can = useStore((s) => s.can);
  const on = useCardOn();
  const [per, setPer] = useState('today');
  const [lb, setLb] = useState('month');

  if (loading && !d) return <Loading label="Loading dashboard" />;
  if (error && !d) return <ErrorBox error={error} onRetry={reload} />;
  const c = d[per];
  const max = Math.max(1, ...d.series.map((x) => x.sales));

  return (
    <>
      <PageHead title={d.limited ? `Hello, ${d.user}` : 'Dashboard'} sub={`${fdate(d.date)}${d.limited ? ' — your own sales' : ''}`} center={<LiveClock />}>
        <Tabs tabs={[['today', 'Today'], ['month', 'This month'], ['total', 'All time']]} value={per} onChange={setPer} />
        <Btn onClick={reload} busy={loading}>Refresh</Btn>
        {can('pos') && <Link to="/pos" className="btn btn-primary">New sale</Link>}
      </PageHead>

      {error && <ErrorBox error={`Could not update the dashboard. Showing the last loaded balances. ${error}`} onRetry={reload} />}
      {on('reminders') && <CollectionReminders list={d.reminders} onChanged={reload} />}
      <div className="stats">
        {on('sales') && <Stat label="Sales" value={money(c.sales)} sub={`${c.invoices} invoices`} />}
        {!d.limited && <>
          {on('sales_returns') && <Stat label="Sales returns" value={money(c.sales_returns)} tone={c.sales_returns ? 'warn' : ''} />}
          {on('purchases') && <Stat label="Purchases" value={money(c.purchases)} />}
          {on('purchase_returns') && <Stat label="Purchase returns" value={money(c.purchase_returns)} />}
          {on('expenses') && <Stat label="Expenses" value={money(c.expenses)} />}
          {on('gross_profit') && c.gross_profit !== undefined && <Stat label="Gross profit" value={money(c.gross_profit)} sub="Sales − cost − returns" tone={c.gross_profit >= 0 ? 'up' : 'down'} />}
          {on('net_profit') && c.net_profit !== undefined && <Stat label="Net profit" value={money(c.net_profit)} sub="Gross profit − expenses" tone={c.net_profit >= 0 ? 'up' : 'down'} />}
        </>}
        {on('new_dues') && <Stat label="New dues on sales" value={money(c.due)} tone={c.due ? 'warn' : ''} />}
        {!d.limited && <>
          {on('receivable') && <Link to="/customers" className="stat stat-link" title="Open customer dues">
            <span>Receivable</span><b style={{ color: d.receivable > 0 ? 'var(--warn)' : undefined }}>{money(d.receivable)}</b><small>Total customer dues</small>
          </Link>}
          {!on('payable') ? null : can('suppliers')
            ? <Link to="/suppliers" className="stat stat-link" title="Open supplier balances"><span>Payable</span><b style={{ color: d.payable > 0 ? 'var(--bad)' : undefined }}>{money(d.payable)}</b><small>Total you owe suppliers</small></Link>
            : <Stat label="Payable" value={money(d.payable)} sub="Total you owe suppliers" />}
        </>}
      </div>

      {Array.isArray(d.periods) && d.periods.some((x) => on('sales_' + x.key)) && (
        <section style={{ marginTop: 18 }}>
          <div className="card-head"><h2>Sales history</h2>{can('pos') && <Link to="/sales" className="link">Open sales</Link>}</div>
          <div className="stats period-stats">
            {d.periods.filter((x) => on('sales_' + x.key)).map((x) => (
              <div className="stat" key={x.key} title={`${fdate(x.from)} – ${fdate(x.to)}`}>
                <span>{x.label}</span>
                <b>{money(x.sales)}</b>
                <small>{x.invoices} invoice{x.invoices === 1 ? '' : 's'}{x.returns ? ` · returns ${money(x.returns, false)} · net ${money(x.net, false)}` : ''}{x.profit !== undefined ? ` · profit ${money(x.profit, false)}` : ''}</small>
                <small className="period-range">{fdate(x.from)} – {fdate(x.to)}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      {Array.isArray(d.periods) && HISTORY.filter(([k]) => on('hist_' + k) && d.periods[0] && d.periods[0][k]).map(([k, title, unit, tone, link]) => (
        <section style={{ marginTop: 18 }} key={k}>
          <div className="card-head"><h2>{title}</h2>{link && (!link[2] || can(link[2])) && <Link to={link[0]} className="link">{link[1]}</Link>}</div>
          <div className="stats period-stats">
            {d.periods.map((x) => {
              const v = x[k];
              const cls = tone === 'pl' ? (v.amount > 0 ? 'up' : v.amount < 0 ? 'down' : '') : v.amount > 0 ? tone : '';
              return (
                <div className={`stat ${cls}`} key={x.key} title={`${fdate(x.from)} – ${fdate(x.to)}`}>
                  <span>{x.label}</span>
                  <b>{money(v.amount)}</b>
                  <small>{unit ? `${v.count} ${unit}${v.count === 1 ? '' : 's'}` : '\u00a0'}</small>
                  <small className="period-range">{fdate(x.from)} – {fdate(x.to)}</small>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {on('stock_summary') && !d.limited && <StockSummary s={d.stock_summary} />}

      {on('balances') && d.accounts && (
        <section style={{ marginTop: 18 }}>
          <div className="card-head"><h2>Live balances</h2>{can('accounts') && <Link to="/accounts" className="link">Manage accounts</Link>}</div>
          <div className="patch">
            {d.accounts.map((a) => (
              <div className="port" data-type={a.type} key={a.id}>
                <div className="pn">{a.name}</div>
                <div className="pt">{a.type === 'mfs' ? 'Mobile banking' : a.type === 'cash' ? 'Cash' : 'Bank'}{a.number ? ` · ${a.number}` : ''}</div>
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

      {/* Profit row (under Live balances): today, this week, this month, last 6 months — net and gross. */}
      {on('profit_card') && Array.isArray(d.profit) && (
        <section style={{ marginTop: 18 }}>
          <div className="card-head"><h2>Profit</h2>{can(['reports', 'cost']) && <Link to="/profit" className="link">Open profit report</Link>}</div>
          <div className="stats period-stats profit-stats">
            {d.profit.map((x) => (
              <div className="stat profit-stat" key={x.key} title={`${fdate(x.from)} – ${fdate(x.to)}`}>
                <span>{x.label}</span>
                <div className="pf-line"><em>Net profit</em><b className={x.net > 0 ? 'pf-up' : x.net < 0 ? 'pf-down' : ''}>{money(x.net)}</b></div>
                <div className="pf-line"><em>Gross profit</em><b className={`pf-gross ${x.gross > 0 ? 'pf-up' : x.gross < 0 ? 'pf-down' : ''}`}>{money(x.gross)}</b></div>
                <small>Sales {money(x.sales, false)} · expenses {money(x.expenses, false)}</small>
                <small className="period-range">{x.from === x.to ? fdate(x.from) : `${fdate(x.from)} – ${fdate(x.to)}`}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      {on('chart') &&<div className="card" style={{ marginTop: 18 }}>
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
            {d.stock_value !== undefined && <div><span>Stock value at cost</span><b>{money(d.stock_value)}</b></div>}
            <div><span>Warranty: pending / at vendor / ready</span><b>{d.claims.pending} / {d.claims.vendor} / {d.claims.ready}</b></div>
          </div>
        )}
      </div>}

      {/* Leaderboard, best sellers and low stock side by side: three equal cards per row (stacks on small screens). */}
      {(on('leaderboard') || (on('top_products') && d.top_products) || on('low_stock')) && <div className="dash-trio">
        {!on('leaderboard') ? null : d.leaderboard ? (
          <div className="card">
            <div className="card-head"><h2>Staff leaderboard</h2><Tabs tabs={[['today', 'Today'], ['month', 'Month'], ['total', 'All']]} value={lb} onChange={setLb} /></div>
            {d.leaderboard[lb].length ? (
              <div className="trio-body"><table className="lb">
                <tbody>
                  {d.leaderboard[lb].map((r, i) => (
                    <tr key={r.name}>
                      <td style={{ width: 26, color: 'var(--muted)', fontWeight: 800 }}>{i + 1}</td>
                      <td><b>{r.name}</b><div className="muted" style={{ fontSize: 12 }}>{r.invoices} invoices{r.profit !== undefined ? ` · profit ${money(r.profit, false)}` : ''}</div></td>
                      <td className="r num"><b>{money(r.total, false)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            ) : <Empty title="No sales in this period" />}
          </div>
        ) : (
          <div className="card">
            <div className="card-head"><h2>Your recent invoices</h2></div>
            {d.recent.length ? d.recent.map((s) => <div key={s.id} className="row" style={{ padding: '6px 0' }}><Link to={`/sales/${s.id}`}>{s.invoice_no}</Link><span className="muted">{s.customer_name}</span><span className="spacer" /><b className="num">{money(s.total, false)}</b></div>) : <Empty title="No sales yet today" />}
          </div>
        )}

        {on('top_products') && d.top_products && <TopProducts data={d.top_products} showProfit={can('cost') && !d.limited} />}

        {on('low_stock') && <div className="card">
          <div className="card-head"><h2>Low stock</h2><Link to="/stock?low=1" className="link">Open stock explorer</Link></div>
          {d.low_stock.length ? (
            <div className="dt-scroll trio-body"><table className="lb"><tbody>
              {d.low_stock.map((p) => (
                <tr key={p.id}><td>{p.name}</td><td className="r num" style={{ color: p.stock <= 0 ? 'var(--bad)' : 'var(--warn)', fontWeight: 800 }}>{qty(p.stock, p.unit)}</td><td className="r muted">alert at {qty(p.threshold, p.unit)}</td></tr>
              ))}
            </tbody></table></div>
          ) : <Empty title="Stock levels look healthy" />}
        </div>}
      </div>}
    </>
  );
}
