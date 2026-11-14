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

/** Admins: repair jobs a technician marked Completed or Failed. Gone after Seen (by any admin), or once delivered / cancelled. */
export function RepairAlerts({ list, onChanged }) {
  const toast = useStore((s) => s.toast);
  const [busy, setBusy] = useState('');
  if (!list || !list.length) return null;
  const seen = async (r) => {
    setBusy(r.id);
    try { await api('repair.seen', { id: r.id }); toast(`${r.job_no}: marked seen`, 'ok'); onChanged?.(); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(''); }
  };
  return (
    <section className="card reminders" aria-label="Repair alerts">
      <div className="card-head">
        <h2><span className="rem-bell" aria-hidden="true">🛠️</span> Repair results <span className="rem-count">{list.length}</span></h2>
        <Link to="/repairs" className="link">Open repairs</Link>
      </div>
      <div className="rem-list">
        {list.map((r) => (
          <div className={`rem-row ${r.status === 'Failed' ? 'late' : 'done'}`} key={r.id}>
            <div className="rem-who">
              <Link to={`/repairs/${r.id}`}><b>{r.job_no} · {r.device}</b></Link>
              <small>{r.customer_name}{r.phone ? <> · <a href={`tel:${r.phone}`}>{r.phone}</a></> : ''} · Technician: {r.technician_name || r.result_by || '—'}</small>
              {r.result_note && <small>Report: {r.result_note}</small>}
            </div>
            <div className="rem-when">
              <span className={`rem-tag ${r.status === 'Failed' ? 'late' : 'done'}`}>{r.status === 'Failed' ? 'Repair failed' : 'Repair completed'}</span>
              <small>{r.result_at ? fdate(r.result_at) : ''}{r.result_by ? ` · by ${r.result_by}` : ''}</small>
            </div>
            <div className="rem-amt"><b className="num">{money(r.total)}</b>{r.due > 0 && <small>Due {money(r.due, false)}</small>}</div>
            <div className="rem-act">
              <Link className="btn btn-sm btn-primary" to={`/repairs/${r.id}`}>Open job</Link>
              <Btn size="sm" busy={busy === r.id} onClick={() => seen(r)} title="Hide this alert for all admins">Seen</Btn>
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
export function ProductSummary({ data = [] }) {
  const cards = [['age3','In stock over 3 months','Includes over 6 months / 1 year'],['age6','In stock over 6 months','Includes over 1 year'],['age12','In stock over 1 year','Current unsold quantity'],['expiring','Supplier warranty ending','Today through the next 30 days'],['expired','Supplier warranty expired','Stock still held in the shop'],['warranty_unknown','Supplier warranty not set','Add the expiry on the purchase']];
  const quantity = key => data.filter(x => x[key] > 0).map(x => `${fqty(x[key])} ${x.unit}`).join(' · ') || '0';
  return <section className="product-summary" aria-label="Product Summary" style={{ marginTop:18 }}>
    <div className="card-head"><h2>Product Summary</h2><Link className="link" to="/reports?type=stock_summary">Open stock report</Link></div>
    <div className="stats period-stats">{cards.map(([key,label,note]) => <Link className={`stat stat-link ${key==='expired'?'down':key==='expiring'?'warn':''}`} key={key} to={`/reports?type=stock_summary&filter=${key}`}><span>{label}</span><b>{quantity(key)}</b><small>{note}</small></Link>)}</div>
    <p className="muted summary-note">Current stock quantities, kept separate by unit. Nonserial stock age and supplier warranty use a FIFO estimate; serial lots use their purchase records. Missing history stays unknown.</p>
  </section>;
}

export function TopProducts({ data, showProfit }) {
  const [per, setPer] = useState('month');
  const [view, setView] = useState('products');
  const [group, setGroup] = useState('');
  const rows = (data && data[per]) || [];
  const groups = useMemo(() => {
    const g = {};
    rows.forEach((r) => {
      const k = r.group_id || '-';
      const x = g[k] = g[k] || { id: k, name: r.group, qty: 0, quantities: {}, amount: 0, profit: 0, products: 0, top: r.name };
      x.quantities[r.unit || 'pcs'] = (x.quantities[r.unit || 'pcs'] || 0) + r.qty;
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
          <Tabs tabs={[['today', 'Today'], ['month', 'Month'], ['three_months', '3 months'], ['six_months', '6 months'], ['total', 'All']]} value={per} onChange={setPer} />
        </div>
      </div>
      {['three_months','six_months'].includes(per) && <p className="muted summary-note">Includes the current month and the preceding {per==='three_months'?2:5} calendar months, through today.</p>}
      {view === 'products' && allGroups.length > 1 && (
        <div className="tp-filter">
          <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Product group">
            <option value="">All product groups</option>
            {allGroups.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
      )}
      {view === 'products' ? (shown.length ? (
        <div className="trio-body"><table className="lb tp">
          <tbody>{shown.map((r, i) => (
            <tr key={r.product_id}>
              <td className="tp-rank">{i + 1}</td>
              <td><b>{r.name}</b><div className="muted" style={{ fontSize: 12 }}>{[r.group, r.category].filter(Boolean).join(' / ')} · {r.invoices} invoice{r.invoices === 1 ? '' : 's'}{showProfit ? ` · profit ${money(r.profit, false)}` : ''}</div>
                <div className="tp-bar"><i style={{ width: `${(r.amount / maxAmt) * 100}%` }} /></div></td>
              <td className="r num"><b>{fqty(r.qty, r.unit)}</b><div className="muted" style={{ fontSize: 12 }}>{money(r.amount, false)}</div></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <Empty title={per === 'today' ? 'No sales yet today' : 'No sales in this period'} />)
        : (groups.length ? (
          <div className="trio-body"><table className="lb tp">
            <tbody>{groups.map((g, i) => (
              <tr key={g.id}>
                <td className="tp-rank">{i + 1}</td>
                <td><b>{g.name}</b><div className="muted" style={{ fontSize: 12 }}>{g.products} product{g.products === 1 ? '' : 's'} · best: {g.top}{showProfit ? ` · profit ${money(g.profit, false)}` : ''}</div>
                  <div className="tp-bar"><i style={{ width: `${(g.amount / maxAmt) * 100}%` }} /></div></td>
                <td className="r num"><b>{money(g.amount, false)}</b><div className="muted" style={{ fontSize: 12 }}>{Object.keys(g.quantities).sort().map(u => `${fqty(g.quantities[u])} ${u}`).join(' · ')}</div></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty title={per === 'today' ? 'No sales yet today' : 'No sales in this period'} />)}
    </div>
  );
}
