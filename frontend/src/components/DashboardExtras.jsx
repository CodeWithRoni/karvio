// Dashboard blocks: collection reminders, stock summary and best-selling products.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, shopDay } from '../lib/store';
import { api } from '../lib/api';
import { money, qty as fqty, fdate } from '../lib/format';
import { Tabs, Btn, Empty } from './ui';

// Dates in the shop's time zone (from the server), as yyyy-mm-dd.
const addDays = (n) => shopDay(n);
const localToday = () => shopDay(0);

/** Due invoices whose promised payment date is today or has passed. Switches off by itself once paid. */
export function CollectionReminders({ list, onChanged }) {
  const toast = useStore((s) => s.toast);
  const [edit, setEdit] = useState(null); // sale_id being re-dated
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState('');
  if (!list || !list.length) return null;
  const total = list.reduce((a, r) => a + r.remaining, 0);
  const save = async (r, value) => {
    setBusy(r.sale_id);
    try {
      await api('sale.promise', { id: r.sale_id, next_payment_date: value });
      toast(value ? `${r.invoice_no}: next payment date set to ${fdate(value)}` : `${r.invoice_no}: reminder removed`, 'ok');
      setEdit(null); onChanged?.();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(''); }
  };
  return (
    <section className="card reminders" aria-label="Collection reminders">
      <div className="card-head">
        <h2><span className="rem-bell" aria-hidden="true">🔔</span> Collection reminders <span className="rem-count">{list.length}</span></h2>
        <span className="muted">To collect: <b className="num" style={{ color: 'var(--warn)' }}>{money(total)}</b></span>
      </div>
      <div className="rem-list">
        {list.map((r) => (
          <div className={`rem-row ${r.overdue_days > 0 ? 'late' : 'today'}`} key={r.sale_id}>
            <div className="rem-who">
              <Link to={`/customers/${r.customer_id}`}><b>{r.customer_name}</b></Link>
              <small>{r.phone ? <a href={`tel:${r.phone}`}>{r.phone}</a> : 'No phone'} · <Link to={`/sales/${r.sale_id}`}>{r.invoice_no}</Link> · sold {fdate(r.date)}</small>
            </div>
            <div className="rem-when">
              <span className={`rem-tag ${r.overdue_days > 0 ? 'late' : 'today'}`}>{r.overdue_days > 0 ? `Overdue ${r.overdue_days} day${r.overdue_days === 1 ? '' : 's'}` : 'Payment due today'}</span>
              <small>Promised {fdate(r.next_payment_date)}</small>
            </div>
            <div className="rem-amt"><b className="num">{money(r.remaining)}</b>{r.remaining < r.invoice_due - 0.004 && <small>of {money(r.invoice_due, false)} (part paid)</small>}</div>
            <div className="rem-act">
              {edit === r.sale_id ? (
                <>
                  <input type="date" min={localToday()} value={date} onChange={(e) => setDate(e.target.value)} aria-label={`New payment date for ${r.invoice_no}`} />
                  <Btn size="sm" kind="primary" busy={busy === r.sale_id} disabled={!date} onClick={() => save(r, date)}>Save</Btn>
                  <Btn size="sm" onClick={() => setEdit(null)}>Cancel</Btn>
                </>
              ) : (
                <>
                  <Link className="btn btn-sm btn-primary" to={`/customers/${r.customer_id}`}>Collect</Link>
                  <Btn size="sm" onClick={() => { setEdit(r.sale_id); setDate(addDays(3)); }}>New date</Btn>
                  <Btn size="sm" busy={busy === r.sale_id} onClick={() => save(r, '')} title="Stop reminding for this invoice">Dismiss</Btn>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Stock row: products, stock value at cost and at selling price. */
export function StockSummary({ s }) {
  if (!s) return null;
  return (
    <section style={{ marginTop: 18 }}>
      <div className="card-head"><h2>Stock summary</h2><Link to="/stock" className="link">Open products & stock</Link></div>
      <div className="stats period-stats">
        <div className="stat"><span>Total products</span><b>{s.products}</b><small>{s.in_stock} in stock · {s.out_of_stock} out of stock</small></div>
        {s.cost_value !== undefined && <div className="stat"><span>Total products cost</span><b>{money(s.cost_value)}</b><small>Stock × purchase cost</small></div>}
        <div className="stat"><span>Total products sales price</span><b>{money(s.sale_value)}</b><small>Stock × retail price{s.unpriced ? ` · ${s.unpriced} without a price` : ''}</small></div>
        {s.expected_profit !== undefined && <div className={`stat ${s.expected_profit >= 0 ? 'up' : 'down'}`}><span>Expected profit</span><b>{money(s.expected_profit)}</b><small>If all stock sells at retail</small></div>}
      </div>
    </section>
  );
}

/** Best sellers, leaderboard style: Today / Month / All, by product or by product group. */
export function TopProducts({ data, showProfit }) {
  const [per, setPer] = useState('month');
  const [view, setView] = useState('products');
  const [group, setGroup] = useState('');
  const rows = (data && data[per]) || [];
  const groups = useMemo(() => {
    const g = {};
    rows.forEach((r) => {
      const k = r.group_id || '-';
      const x = g[k] = g[k] || { id: k, name: r.group, qty: 0, amount: 0, profit: 0, products: 0, top: r.name };
      x.qty += r.qty; x.amount += r.amount; x.profit += r.profit; x.products++;
    });
    return Object.values(g).sort((a, b) => b.amount - a.amount);
  }, [rows]);
  const allGroups = useMemo(() => {
    const g = {}; ((data && data.total) || []).forEach((r) => { g[r.group_id || '-'] = r.group; });
    return Object.entries(g).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);
  const shown = rows.filter((r) => !group || (r.group_id || '-') === group).slice(0, 10);
  const maxAmt = Math.max(1, ...(view === 'groups' ? groups : shown).map((r) => r.amount));
  return (
    <div className="card top-products">
      <div className="card-head">
        <h2>Top selling {view === 'groups' ? 'product groups' : 'products'}</h2>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Tabs tabs={[['products', 'Products'], ['groups', 'Groups']]} value={view} onChange={setView} />
          <Tabs tabs={[['today', 'Today'], ['month', 'Month'], ['total', 'All']]} value={per} onChange={setPer} />
        </div>
      </div>
      {view === 'products' && allGroups.length > 1 && (
        <div className="tp-filter">
          <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Product group">
            <option value="">All product groups</option>
            {allGroups.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
      )}
      {view === 'products' ? (shown.length ? (
        <table className="lb tp">
          <tbody>{shown.map((r, i) => (
            <tr key={r.product_id}>
              <td className="tp-rank">{i + 1}</td>
              <td><b>{r.name}</b><div className="muted" style={{ fontSize: 12 }}>{[r.group, r.category].filter(Boolean).join(' / ')} · {r.invoices} invoice{r.invoices === 1 ? '' : 's'}{showProfit ? ` · profit ${money(r.profit, false)}` : ''}</div>
                <div className="tp-bar"><i style={{ width: `${(r.amount / maxAmt) * 100}%` }} /></div></td>
              <td className="r num"><b>{fqty(r.qty, r.unit)}</b><div className="muted" style={{ fontSize: 12 }}>{money(r.amount, false)}</div></td>
            </tr>
          ))}</tbody>
        </table>
      ) : <Empty title={per === 'today' ? 'No sales yet today' : 'No sales in this period'} />)
        : (groups.length ? (
          <table className="lb tp">
            <tbody>{groups.map((g, i) => (
              <tr key={g.id}>
                <td className="tp-rank">{i + 1}</td>
                <td><b>{g.name}</b><div className="muted" style={{ fontSize: 12 }}>{g.products} product{g.products === 1 ? '' : 's'} · best: {g.top}{showProfit ? ` · profit ${money(g.profit, false)}` : ''}</div>
                  <div className="tp-bar"><i style={{ width: `${(g.amount / maxAmt) * 100}%` }} /></div></td>
                <td className="r num"><b>{money(g.amount, false)}</b><div className="muted" style={{ fontSize: 12 }}>{Math.round(g.qty * 100) / 100} units</div></td>
              </tr>
            ))}</tbody>
          </table>
        ) : <Empty title={per === 'today' ? 'No sales yet today' : 'No sales in this period'} />)}
    </div>
  );
}
