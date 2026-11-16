import { useState } from 'react';
import { fdatetime, money, monthStart, today } from '../lib/format';
import { useApi, PageHead, Field, DateRange, ErrorBox, Badge, Empty } from '../components/ui';
import { TableSkeleton } from '../components/Skeleton';

// Friendly names for what the server records. Unknown codes are shown as they are.
const ACTIONS = {
  sale_create: ['Sale', 'ok'], sale_exchange: ['Exchange', 'info'], sale_promise: ['Payment date set', 'info'], sreturn_create: ['Sales return', 'warn'],
  purchase_create: ['Purchase', 'ok'], preturn_create: ['Purchase return', 'warn'], customer_payment: ['Customer payment', 'ok'], supplier_payment: ['Supplier payment', 'ok'], supplier_rebate: ['Supplier rebate', 'ok'], rebate_promised: ['Rebate promised', 'muted'], rebate_promise_cancelled: ['Promised rebate dropped', 'warn'], reverse_rebate: ['Rebate cancelled', 'bad'],
  expense_update: ['Expense edited', 'warn'], expense_categories: ['Expense categories', 'muted'], price_update: ['Prices changed', 'warn'], stock_adjust: ['Stock adjusted', 'warn'],
  products_import: ['Products imported', 'info'], master_import: ['List imported', 'info'], barcode_assign: ['Barcodes assigned', 'muted'], claim_restock: ['Claim restocked', 'info'],
  repair_create: ['Repair job', 'info'], repair_update: ['Repair edited', 'muted'], repair_deliver: ['Repair delivered', 'ok'], repair_cancel: ['Repair cancelled', 'bad'],
  invoice_link: ['Invoice link', 'muted'], quote_send: ['Quotation sent', 'info'], settings_save: ['Settings changed', 'warn'], books_lock: ['Books closed', 'warn'],
  database_backup: ['Backup', 'muted'], database_restore: ['Database restored', 'bad'], database_reset: ['Database reset', 'bad'], backup_schedule: ['Backup schedule', 'muted'],
  supplier_warranty_date: ['Supplier warranty', 'muted'], day_close: ['Day closed', 'info'], account_deposit: ['Deposit', 'ok'], account_withdraw: ['Withdrawal', 'warn'], account_transfer: ['Transfer', 'info'], account_opening_balance: ['Opening balance', 'muted'], recurring_expenses: ['Monthly expenses list', 'muted'], daily_summary: ['Daily summary SMS', 'muted']
};
const FILTERS = [['', 'Everything'], ['sale', 'Sales'], ['sreturn', 'Sales returns'], ['purchase', 'Purchases'], ['reverse', 'Cancellations'], ['price', 'Price changes'], ['stock', 'Stock adjustments'], ['account', 'Account entries'], ['day_close', 'Day close'], ['settings', 'Settings'], ['database', 'Database'], ['repair', 'Repairs']];

function label(code) {
  if (ACTIONS[code]) return ACTIONS[code];
  if (/^reverse_/.test(code)) return [`Cancelled: ${code.slice(8).replace(/_/g, ' ')}`, 'bad'];
  if (/^repair_/.test(code)) return [`Repair: ${code.slice(7).replace(/_/g, ' ')}`, 'muted'];
  return [code.replace(/_/g, ' '), 'muted'];
}
/** One readable line from the stored detail (JSON or text). */
function summary(code, raw) {
  let d; try { d = JSON.parse(raw); } catch { return raw; }
  if (d === null || typeof d !== 'object') return String(d ?? '');
  if (Array.isArray(d)) return d.join(', ');
  if (code === 'day_close') return `${d.account_name}: expected ${money(d.expected, false)}, counted ${money(d.counted, false)}${d.difference ? ` (${d.difference > 0 ? '+' : ''}${money(d.difference, false)})` : ''}${d.note ? ` — ${d.note}` : ''}`;
  if (code === 'price_update' && Array.isArray(d.items)) return `${d.count} product${d.count === 1 ? '' : 's'}: ` + d.items.slice(0, 4).map((x) => `${x.name} ${money(x.from?.[0], false)} → ${money(x.to?.[0], false)}`).join(', ') + (d.count > 4 ? '…' : '');
  const pick = ['invoice_no', 'return_no', 'job_no', 'no', 'reason', 'amount', 'total', 'name', 'note', 'count', 'added', 'updated'];
  const parts = pick.filter((k) => d[k] !== undefined && d[k] !== '').map((k) => (['amount', 'total'].includes(k) ? money(d[k]) : k === 'reason' || k === 'note' ? `“${d[k]}”` : `${k.replace(/_/g, ' ')} ${d[k]}`));
  return parts.length ? parts.join(' · ') : Object.entries(d).slice(0, 4).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v).slice(0, 40) : v}`).join(' · ');
}

/** Admin → Activity log: who did what and when. */
export default function Activity() {
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const [user, setUser] = useState('');
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const list = useApi('audit.list', { ...range, user, action, q: search }, []);
  const d = list.data;
  return (
    <>
      <PageHead title="Activity log" sub="Who did what and when: sales, returns, cancellations, price and stock changes, settings and more." />
      <div className="filters">
        <Field label="Period"><DateRange {...range} onChange={setRange} /></Field>
        <Field label="Staff"><select value={user} onChange={(e) => setUser(e.target.value)} aria-label="Staff"><option value="">Everyone</option>{(d?.users || []).map((u) => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Type"><select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Type">{FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Contains"><form onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }} className="row" style={{ gap: 6 }}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice, name, note…" aria-label="Contains" /><button className="btn" type="submit">Search</button></form></Field>
      </div>
      <ErrorBox error={list.error} onRetry={list.reload} />
      {!d && list.loading ? <div className="card"><TableSkeleton rows={8} cols={4} label="Loading activity" /></div> : d && (
        d.rows.length ? (
          <div className="card act-card">
            <div className="card-head"><h2>{d.total} event{d.total === 1 ? '' : 's'}</h2>{d.total > d.rows.length && <span className="muted">Showing the newest {d.rows.length}; narrow the dates to see older ones</span>}</div>
            <div className="act-list">
              {d.rows.map((r) => { const [l, tone] = label(r.action); return (
                <div className="act-row" key={r.id}>
                  <time>{fdatetime(r.ts)}</time>
                  <span className="act-user">{r.user || 'System'}</span>
                  <Badge tone={tone}>{l}</Badge>
                  <span className="act-detail" title={r.detail}>{summary(r.action, r.detail)}</span>
                </div>
              ); })}
            </div>
          </div>
        ) : <div className="card"><Empty icon="search" title="No activity found">Change the dates, staff or type above.</Empty></div>
      )}
    </>
  );
}
