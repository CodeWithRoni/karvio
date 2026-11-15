import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { money, qty, fdate } from '../lib/format';
import { useApi, PageHead, Tabs, ErrorBox, Btn, Empty } from '../components/ui';
import { DashboardSkeleton } from '../components/Skeleton';
import LiveClock from '../components/LiveClock';
import { useCardOn } from '../lib/dashboardCards';
import { CollectionReminders, RepairAlerts, InventoryHealth, TopProducts } from '../components/DashboardExtras';
import SalesChart from '../components/SalesChart';

// History tabs after "Sales": [field, tab label, counted thing, colour, link]
const HISTORY = [
  ['sales_returns', 'Sales returns', 'return', 'warn', ['/sales', 'Open sales & returns', 'pos']],
  ['purchases', 'Purchases', 'purchase', '', ['/purchases', 'Open purchases', 'purchase']],
  ['purchase_returns', 'Purchase returns', 'return', '', ['/purchases', 'Open purchases', 'purchase']],
  ['expenses', 'Expenses', 'expense', '', ['/expenses', 'Open expenses', 'expenses']],
  ['gross_profit', 'Gross profit', '', 'pl', null],
  ['net_profit', 'Net profit', '', 'pl', null],
  ['receivable', 'Receivable', 'invoice with due', 'warn', ['/customers', 'Open customer dues', null]],
  ['payable', 'Payable', 'purchase with due', 'down', ['/suppliers', 'Open suppliers', 'suppliers']]
];
const SCOPES = [['today', 'Today'], ['month', 'This month'], ['total', 'All time']];
const SCOPE_KEY = 'karvio_dash_scope';
const readScope = () => { try { const v = localStorage.getItem(SCOPE_KEY); return SCOPES.some(([k]) => k === v) ? v : 'today'; } catch { return 'today'; } };

/** Change against yesterday: green when it moved the good way (for expenses, down is good). */
function Delta({ now, before, lowerIsBetter }) {
  if (before === undefined || now === undefined) return null;
  if (!before) return now ? <span className="delta flat">new today</span> : null;
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  if (!pct) return <span className="delta flat">same as yesterday</span>;
  const good = lowerIsBetter ? pct < 0 : pct > 0;
  return <span className={`delta ${good ? 'up' : 'down'}`} title={`Yesterday ${money(before)}`}><i aria-hidden="true">{pct > 0 ? '▲' : '▼'}</i>{Math.abs(pct)}% <em>vs yesterday</em></span>;
}

function Kpi({ label, value, sub, tone, to, title, children }) {
  const body = <><span>{label}</span><b className={tone || ''}>{value}</b><small>{children}{sub}</small></>;
  return to ? <Link to={to} className="kpi kpi-link" title={title}>{body}</Link> : <div className="kpi">{body}</div>;
}

const plTone = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');

/** This month at a glance: where each taka of sales went (cost of goods, expenses, profit) and the margins. */
function ProfitBreakdown({ p }) {
  if (!p) return null;
  const sales = Math.max(0, p.sales || 0), cost = Math.max(0, p.cost ?? (p.sales - p.gross)), exp = Math.max(0, p.expenses || 0), net = p.net || 0;
  const base = Math.max(sales, cost + exp + Math.max(0, net), 1);
  const pct = (v) => `${Math.max(0, Math.min(100, (v / base) * 100))}%`;
  const avg = p.invoices ? sales / p.invoices : 0;
  return (
    <div className="pf-break">
      <div className="pf-break-head"><b>This month at a glance</b><span className="muted">Sales {money(sales)}</span></div>
      {sales > 0 ? (
        <div className="pf-bar" role="img" aria-label={`Of sales ${money(sales)}: cost ${money(cost)}, expenses ${money(exp)}, net profit ${money(net)}`}>
          <i className="seg cost" style={{ width: pct(cost) }} />
          <i className="seg exp" style={{ width: pct(exp) }} />
          {net > 0 && <i className="seg net" style={{ width: pct(net) }} />}
        </div>
      ) : <div className="pf-bar empty" />}
      <div className="pf-legend">
        <span><i className="cost" />Cost of goods <b>{money(cost, false)}</b></span>
        <span><i className="exp" />Expenses <b>{money(exp, false)}</b></span>
        <span><i className="net" />Net profit <b className={plTone(net)}>{money(net, false)}</b></span>
      </div>
      <div className="pf-kpis">
        <div><span>Gross margin</span><b className={plTone(p.gross)}>{p.margin ?? 0}%</b></div>
        <div><span>Net margin</span><b className={plTone(net)}>{p.net_margin ?? 0}%</b></div>
        <div><span>Invoices</span><b>{p.invoices || 0}</b></div>
        <div><span>Average invoice</span><b>{money(avg)}</b></div>
      </div>
      {net < 0 && <p className="pf-warn">Expenses are higher than the gross profit this month.</p>}
    </div>
  );
}

export default function Dashboard() {
  const { data: d, loading, error, reload } = useApi('dashboard', {}, [], { refreshMs: 30000 });
  const can = useStore((s) => s.can);
  const on = useCardOn();
  const [lb, setLb] = useState('month');
  const [scope, setScopeState] = useState(readScope);
  const [hist, setHist] = useState('sales');
  const [showEmpty, setShowEmpty] = useState(false);
  const setScope = (v) => { setScopeState(v); try { localStorage.setItem(SCOPE_KEY, v); } catch { /* private mode */ } };

  if (loading && !d) return <DashboardSkeleton />;
  if (error && !d) return <ErrorBox error={error} onRetry={reload} />;
  const c = d[scope] || d.total, y = scope === 'today' ? d.yesterday : undefined;
  const scopeNote = scope === 'today' ? '' : scope === 'month' ? 'This month' : 'All time';

  const salesTabs = Array.isArray(d.periods) && d.periods.some((x) => on('sales_' + x.key));
  const histTabs = Array.isArray(d.periods) ? HISTORY.filter(([k]) => on('hist_' + k) && d.periods[0] && d.periods[0][k]) : [];
  const tabs = [...(salesTabs ? [['sales', 'Sales']] : []), ...histTabs.map(([k, l]) => [k, l])];
  const activeHist = tabs.some(([k]) => k === hist) ? hist : tabs[0]?.[0];
  const histDef = HISTORY.find(([k]) => k === activeHist);
  const histLink = activeHist === 'sales' ? (can('pos') ? ['/sales', 'Open sales'] : null) : histDef?.[4] && (!histDef[4][2] || can(histDef[4][2])) ? histDef[4] : null;

  const claimsOpen = d.claims ? d.claims.pending + d.claims.vendor + d.claims.ready : 0;
  const attention = [
    on('low_stock') && { key: 'low', label: 'Low stock items', n: d.low_stock.length, tone: 'warn', to: '/stock?low=1' },
    on('reminders') && Array.isArray(d.reminders) && { key: 'dues', label: 'Payments due or overdue', n: d.reminders.length, tone: 'bad', to: '#reminders' },
    d.repairs_waiting !== undefined && { key: 'repairs', label: 'Repairs waiting for pickup', n: d.repairs_waiting, tone: 'aqua', to: '/repairs' },
    d.claims && can('warranty') && { key: 'claims', label: 'Open warranty claims', n: claimsOpen, tone: 'violet', to: '/warranty' },
    d.recurring_due !== undefined && { key: 'monthly', label: 'Monthly expenses due', n: d.recurring_due, tone: 'warn', to: '/expenses?tab=monthly' },
    d.stock_summary && { key: 'oos', label: 'Out of stock products', n: d.stock_summary.out_of_stock, tone: 'muted', to: '/stock?qty=0' }
  ].filter(Boolean);

  const showChart = on('chart');
  const alerts = [on('reminders') && d.reminders?.length, d.repair_alerts?.length].filter(Boolean).length;

  return (
    <>
      <PageHead title={d.limited ? `Hello, ${d.user}` : 'Dashboard'}
        sub={<span className="dash-when">{fdate(d.date)}{d.limited ? ' — your own sales' : ''}<LiveClock compact /></span>}>
        <Btn onClick={reload} busy={loading}>Refresh</Btn>
        {can('repairs') && <Link to="/service" className="btn">New service</Link>}
        {can('repairs') && <Link to="/repairs?new=1" className="btn">New repair</Link>}
        {can('pos') && <Link to="/pos" className="btn btn-primary">New sale</Link>}
      </PageHead>

      {error && <ErrorBox error={`Could not update the dashboard. Showing the last loaded balances. ${error}`} onRetry={reload} />}
      {alerts > 0 && (
        <div className={`dash-alerts ${alerts > 1 ? 'two' : ''}`}>
          {on('reminders') && <CollectionReminders list={d.reminders} onChanged={reload} />}
          {d.repair_alerts && <RepairAlerts list={d.repair_alerts} onChanged={reload} />}
        </div>
      )}

      <div className="dash-overview">
        <h2 className="sr-only">Business overview</h2>
        <Tabs tabs={SCOPES} value={scope} onChange={setScope} />
        {scopeNote && <span className="muted">{scopeNote} totals{scope === 'total' ? ' since the shop started' : ''}</span>}
      </div>
      <div className="kpis">
        {on('sales') && <Kpi label={scope === 'today' ? "Today's sales" : 'Sales'} value={money(c.sales)}><Delta now={c.sales} before={y?.sales} />{`${c.invoices} invoice${c.invoices === 1 ? '' : 's'}`}</Kpi>}
        {!d.limited && on('gross_profit') && c.gross_profit !== undefined && <Kpi label="Gross profit" value={money(c.gross_profit)} tone={plTone(c.gross_profit)} sub={y ? '' : 'Sales − cost − returns'}><Delta now={c.gross_profit} before={y?.gross_profit} /></Kpi>}
        {!d.limited && on('expenses') && <Kpi label="Expenses" value={money(c.expenses)} sub={y ? '' : 'Paid from accounts'}><Delta now={c.expenses} before={y?.expenses} lowerIsBetter /></Kpi>}
        {d.limited && on('new_dues') && <Kpi label="New dues on sales" value={money(c.due)} tone={c.due ? 'warn' : ''} sub="Left unpaid on your invoices" />}
        {!d.limited && on('receivable') && <Kpi label="Receivable" value={money(d.receivable)} tone={d.receivable > 0 ? 'warn' : ''} to="/customers" title="Open customer dues" sub="All time · customers owe you" />}
        {!d.limited && on('payable') && <Kpi label="Payable" value={money(d.payable)} tone={d.payable > 0 ? 'down' : ''} to={can('suppliers') ? '/suppliers' : undefined} title="Open supplier balances" sub="All time · you owe suppliers" />}
      </div>
      {!d.limited && (on('sales_returns') || on('purchases') || on('purchase_returns') || on('net_profit') || on('new_dues')) && (
        <div className="kpi-mini">
          {on('sales_returns') && <div><span>Sales returns</span><b className={c.sales_returns ? 'warn' : ''}>{money(c.sales_returns)}</b></div>}
          {on('purchases') && <div><span>Purchases</span><b>{money(c.purchases)}</b></div>}
          {on('purchase_returns') && <div><span>Purchase returns</span><b>{money(c.purchase_returns)}</b></div>}
          {on('net_profit') && c.net_profit !== undefined && <div title="Gross profit − expenses"><span>Net profit</span><b className={plTone(c.net_profit)}>{money(c.net_profit)}</b></div>}
          {on('new_dues') && <div><span>New dues on sales</span><b className={c.due ? 'warn' : ''}>{money(c.due)}</b></div>}
        </div>
      )}

      {(showChart || attention.length > 0) && (
        <div className={`dash-duo ${showChart && attention.length ? '' : 'one'}`}>
          {showChart && (
            <section className="card">
              <div className="card-head"><h2>Sales — last 30 days</h2>
                <div className="chart-legend"><span><i className="sw-sales" />Sales</span>{d.series.some((x) => x.profit !== undefined) && <span><i className="sw-profit" />Profit</span>}</div>
              </div>
              <SalesChart series={d.series} />
              {!d.limited && (
                <div className="chart-foot">
                  {d.stock_value !== undefined && <span>Stock value at cost <b>{money(d.stock_value)}</b></span>}
                  {d.claims && <span>Warranty: pending / at vendor / ready <b>{d.claims.pending} / {d.claims.vendor} / {d.claims.ready}</b></span>}
                </div>
              )}
            </section>
          )}
          {attention.length > 0 && (
            <section className="card attention">
              <div className="card-head"><h2>Needs attention</h2></div>
              <div className="att-list">
                {attention.map((a) => {
                  const inner = <><span><i className={`att-dot ${a.tone}`} />{a.label}</span><b>{a.n}</b></>;
                  const cls = `att-row ${a.n ? '' : 'zero'}`;
                  return a.to.startsWith('#')
                    ? <a key={a.key} className={cls} href={a.to} onClick={(e) => { e.preventDefault(); document.getElementById(a.to.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{inner}</a>
                    : <Link key={a.key} className={cls} to={a.to}>{inner}</Link>;
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {tabs.length > 0 && (
        <section className="card dash-history">
          <div className="card-head">
            <div className="hist-title"><h2>History</h2><Tabs tabs={tabs} value={activeHist} onChange={setHist} /></div>
            {histLink && <Link to={histLink[0]} className="link">{histLink[1]}</Link>}
          </div>
          <div className="stats period-stats">
            {activeHist === 'sales'
              ? d.periods.filter((x) => on('sales_' + x.key)).map((x) => (
                <div className="stat" key={x.key} title={`${fdate(x.from)} – ${fdate(x.to)}`}>
                  <span>{x.label}</span>
                  <b>{money(x.sales)}</b>
                  <small>{x.invoices} invoice{x.invoices === 1 ? '' : 's'}{x.returns ? ` · returns ${money(x.returns, false)} · net ${money(x.net, false)}` : ''}{x.profit !== undefined ? ` · profit ${money(x.profit, false)}` : ''}</small>
                  <small className="period-range">{fdate(x.from)} – {fdate(x.to)}</small>
                </div>
              ))
              : d.periods.map((x) => {
                const [k, , unit, tone] = histDef;
                const v = x[k];
                const cls = tone === 'pl' ? plTone(v.amount) : v.amount > 0 ? tone : '';
                return (
                  <div className={`stat ${cls}`} key={x.key} title={`${fdate(x.from)} – ${fdate(x.to)}`}>
                    <span>{x.label}</span>
                    <b>{money(v.amount)}</b>
                    <small>{unit ? `${v.count} ${unit}${v.count === 1 ? '' : 's'}` : ' '}</small>
                    <small className="period-range">{fdate(x.from)} – {fdate(x.to)}</small>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {((on('profit_card') && Array.isArray(d.profit)) || (on('balances') && d.accounts)) && (
        <div className={`dash-duo ${on('profit_card') && Array.isArray(d.profit) && on('balances') && d.accounts ? '' : 'one'}`}>
          {/* Profit: today, this week, this month, last 6 months — net and gross. */}
          {on('profit_card') && Array.isArray(d.profit) && (
            <section className="card">
              <div className="card-head"><h2>Profit</h2>{can(['reports', 'cost']) && <Link to="/profit" className="link">Open profit report</Link>}</div>
              <div className="profit-tiles">
                {d.profit.map((x) => (
                  <div className="profit-stat" key={x.key} title={`${fdate(x.from)} – ${fdate(x.to)}`}>
                    <span>{x.label}</span>
                    <b className={`pf-net ${plTone(x.net)}`}>{money(x.net)}</b>
                    <small>Net profit</small>
                    <small className="pf-gross-line">Gross profit <b className={plTone(x.gross)}>{money(x.gross)}</b></small>
                    <small>Sales {money(x.sales, false)} · expenses {money(x.expenses, false)}</small>
                    <small className="period-range">{x.from === x.to ? fdate(x.from) : `${fdate(x.from)} – ${fdate(x.to)}`}</small>
                  </div>
                ))}
              </div>
              <ProfitBreakdown p={d.profit.find((x) => x.key === 'month')} />
            </section>
          )}
          {on('balances') && d.accounts && (
            <section className="card">
              <div className="card-head"><h2>Live balances</h2>{can('accounts') && <Link to="/accounts" className="link">Manage accounts</Link>}</div>
              <div className="bal-list">
                {/* Accounts holding money first; empty ones fold into one line that opens on click. */}
                {[...d.accounts].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).filter((a) => showEmpty || Math.abs(a.balance) > 0.005).map((a) => (
                  <div className="bal-row" data-type={a.type} key={a.id}>
                    <span><b>{a.name}</b><small>{a.type === 'mfs' ? 'Mobile banking' : a.type === 'cash' ? 'Cash' : 'Bank'}{a.number ? ` · ${a.number}` : ''}</small></span>
                    <b className={`num ${a.balance < 0 ? 'down' : ''}`}>{money(a.balance)}</b>
                  </div>
                ))}
                {d.accounts.some((a) => Math.abs(a.balance) <= 0.005) && (
                  <button type="button" className="bal-empty" onClick={() => setShowEmpty(!showEmpty)} aria-expanded={showEmpty}>
                    {showEmpty ? 'Hide accounts with Tk 0' : `${d.accounts.filter((a) => Math.abs(a.balance) <= 0.005).length} more account${d.accounts.filter((a) => Math.abs(a.balance) <= 0.005).length === 1 ? '' : 's'} with Tk 0`}
                  </button>
                )}
                <div className="bal-row total"><span><b>All accounts</b><small>Total money in hand</small></span><b className="num">{money(d.accounts.reduce((a, x) => a + x.balance, 0))}</b></div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Leaderboard, best sellers and low stock side by side: three equal cards per row (stacks on small screens). */}
      {(on('leaderboard') || (on('top_products') && d.top_products) || on('low_stock')) && <div className="dash-trio">
        {!on('leaderboard') ? null : d.leaderboard ? (
          <div className="card">
            <div className="card-head"><h2>Staff leaderboard</h2><Tabs tabs={[['today', 'Today'], ['month', 'Month'], ['total', 'All']]} value={lb} onChange={setLb} /></div>
            {d.leaderboard[lb].length ? (
              <div className="trio-body rank-list">
                {d.leaderboard[lb].map((r, i, all) => (
                  <div className="rank-row" key={r.name}>
                    <span className={`rank-n ${i === 0 ? 'first' : ''}`}>{i + 1}</span>
                    <div className="rank-main">
                      <div className="rank-top"><b>{r.name}</b><b className="num">{money(r.total, false)}</b></div>
                      <small>{r.invoices} invoice{r.invoices === 1 ? '' : 's'}{r.profit !== undefined ? ` · profit ${money(r.profit, false)}` : ''}</small>
                      <div className="tp-bar"><i style={{ width: `${(r.total / Math.max(1, all[0].total)) * 100}%` }} /></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <Empty compact icon="receipt" title="No sales in this period" />}
          </div>
        ) : (
          <div className="card">
            <div className="card-head"><h2>Your recent invoices</h2></div>
            {d.recent.length ? d.recent.map((s) => <div key={s.id} className="row" style={{ padding: '6px 0' }}><Link to={`/sales/${s.id}`}>{s.invoice_no}</Link><span className="muted">{s.customer_name}</span><span className="spacer" /><b className="num">{money(s.total, false)}</b></div>) : <Empty compact icon="receipt" title="No sales yet today" />}
          </div>
        )}

        {on('top_products') && d.top_products && <TopProducts data={d.top_products} showProfit={can('cost') && !d.limited} />}

        {on('low_stock') && <div className="card">
          <div className="card-head"><h2>Low stock</h2><Link to="/stock?low=1" className="link">Open stock explorer</Link></div>
          {d.low_stock.length ? (
            <div className="trio-body rank-list low">
              {d.low_stock.map((p) => (
                <div className="rank-row" key={p.id}>
                  <span className={`rank-n ${p.stock <= 0 ? 'out' : 'warn'}`} aria-hidden="true">!</span>
                  <div className="rank-main">
                    <div className="rank-top"><span>{p.name}</span><b className={`num ${p.stock <= 0 ? 'down' : 'warn'}`}>{qty(p.stock, p.unit)}</b></div>
                    <small>Alert at {qty(p.threshold, p.unit)}</small>
                    <div className="tp-bar"><i style={{ width: `${Math.max(3, Math.min(100, (Math.max(0, p.stock) / Math.max(1, p.threshold)) * 100))}%` }} /></div>
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty compact icon="ok" title="Stock levels look healthy" />}
        </div>}
      </div>}

      {!d.limited && (on('stock_summary') || on('product_summary')) && (
        <InventoryHealth stock={on('stock_summary') ? d.stock_summary : null} product={on('product_summary') ? d.product_summary : null} />
      )}
    </>
  );
}
