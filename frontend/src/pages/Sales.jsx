import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, qty as fqty, fdate, fdatetime, monthStart, today, splitList, round2, isDecimalUnit } from '../lib/format';
import { printReceipt, printInvoice } from '../lib/receipt';
import DataTable from '../components/DataTable';
import { excelSales, pdfSales, printSales } from '../lib/salesDocs';
// Full invoices for ticked rows (fetched in one call).
const saleDocs = { excel: async (rows) => excelSales(await salesDetails(rows), `invoices-${rows.length}.xlsx`), pdf: async (rows) => pdfSales(await salesDetails(rows), `invoices-${rows.length}.pdf`), print: async (rows) => printSales(await salesDetails(rows)) };
import { useApi, PageHead, Tabs, DateRange, Badge, statusTone, Modal, Btn, Field, Loading, ErrorBox, useAction, Select, noWheel } from '../components/ui';
import { ReverseDialog } from '../components/widgets';
import { salesDetails } from '../lib/salesDetails';
import { returnValue } from '../lib/returnValue';

export default function Sales() {
  const { id } = useParams();
  const nav = useNavigate();
  const can = useStore((s) => s.can);
  const [tab, setTab] = useState('sales');
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const [status, setStatus] = useState('');
  const sales = useApi('sales.list', { ...range, status }, [], { skip: tab !== 'sales' });
  const rets = useApi('sreturns.list', { ...range }, [], { skip: tab !== 'returns' || !can('sales.return') });
  const [rev, setRev] = useState(null);

  return (
    <>
      <PageHead title="Sales & returns" sub="Every invoice, with returns, exchanges and cancellations.">
        <Tabs tabs={[['sales', 'Invoices'], ...(can('sales.return') ? [['returns', 'Returns & exchanges']] : [])]} value={tab} onChange={setTab} />
      </PageHead>
      <div className="filters">
        <DateRange {...range} onChange={setRange} />
        {tab === 'sales' && <Select value={status} onChange={setStatus} options={[{ id: 'active', name: 'Active' }, { id: 'cancelled', name: 'Cancelled' }]} placeholder="All statuses" />}
      </div>

      {tab === 'sales' ? (
        <>
          <ErrorBox error={sales.error} onRetry={sales.reload} />
          <DataTable title={`Sales ${range.from} to ${range.to}`} loading={sales.loading} rows={sales.data || []} pageSize={10} docExport={saleDocs} sumFilter={(r) => r.status === 'active'} onRowClick={(r) => nav(`/sales/${r.id}`)}
            rowClass={(r) => (r.status === 'cancelled' ? 'dim' : '')}
            columns={[
              { key: 'date', label: 'Date', type: 'date' },
              { key: 'invoice_no', label: 'Invoice' },
              { key: 'customer_name', label: 'Customer' },
              { key: 'items_text', label: 'Items', className: 'clip' },
              { key: 'total', label: 'Total', type: 'money', sum: true },
              { key: 'paid', label: 'Paid', type: 'money', sum: true },
              { key: 'due_now', label: 'Due now', type: 'money', sum: true, value: (r) => r.due_now ?? r.due },
              ...(can('cost') ? [{ key: 'profit', label: 'Profit', type: 'money', sum: true }] : []),
              { key: 'user_name', label: 'Staff' },
              { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> }
            ]} />
        </>
      ) : (
        <>
          <ErrorBox error={rets.error} onRetry={rets.reload} />
          <DataTable title="Sales returns" sumFilter={(r) => r.status === 'active'} loading={rets.loading} rows={rets.data || []} pageSize={10} rowClass={(r) => (r.status === 'cancelled' ? 'dim' : '')}
            columns={[
              { key: 'date', label: 'Date', type: 'date' },
              { key: 'return_no', label: 'Return #' },
              { key: 'invoice_no', label: 'Invoice' },
              { key: 'customer_name', label: 'Customer' },
              { key: 'type', label: 'Type' },
              { key: 'items_text', label: 'Items', className: 'clip' },
              { key: 'total', label: 'Value', type: 'money', sum: true },
              { key: 'refund', label: 'Cash refund', type: 'money', sum: true },
              { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
              ...(can('cancel') ? [{ key: 'act', label: '', noSort: true, noExport: true, render: (r) => r.status === 'active' && <Btn size="sm" kind="danger" onClick={(e) => { e.stopPropagation(); setRev({ type: 'sreturn', id: r.id, label: `return ${r.return_no}` }); }}>Cancel</Btn> }] : [])
            ]} />
        </>
      )}

      {id && <SaleDetail id={id} onClose={() => nav('/sales')} onChanged={() => { sales.reload(); rets.reload(); }} />}
      <ReverseDialog open={!!rev} {...(rev || {})} onClose={() => setRev(null)} onDone={() => rets.reload()} />
    </>
  );
}

function SaleDetail({ id, onClose, onChanged }) {
  const can = useStore((s) => s.can);
  const { data, loading, error, reload } = useApi('sale.detail', { id });
  const [ret, setRet] = useState(false);
  const [rev, setRev] = useState(false);
  const [link, setLink] = useState(null); // { url, expires_at } — a customer link made for this invoice
  const [linkBusy, setLinkBusy] = useState(false);
  const toast = useStore((st) => st.toast);
  const s = data?.sale;
  const makeLink = async () => {
    setLinkBusy(true);
    try {
      const l = await api('sale.link', { id: s.id });
      setLink(l);
      try { await navigator.clipboard.writeText(l.url); toast('Customer link copied — valid for 15 days', 'ok'); } catch { toast('Customer link ready — copy it below', 'ok'); }
    } catch (e) { toast(e.message, 'err'); } finally { setLinkBusy(false); }
  };
  const pays = s ? (Array.isArray(s.payments) ? s.payments : (() => { try { return JSON.parse(s.payments); } catch { return []; } })()) : [];

  return (
    <Modal open onClose={onClose} size="lg" title={s ? `Invoice ${s.invoice_no}` : 'Invoice'}
      footer={s && <>
        {can('cancel') && s.status === 'active' && <Btn kind="danger" onClick={() => setRev(true)}>Cancel invoice</Btn>}
        {can('sales.return') && s.status === 'active' && <Btn onClick={() => setRet(true)}>Return / exchange</Btn>}
        {can('pos') && <Btn busy={linkBusy} onClick={makeLink} title="A private link to this invoice for the customer (WhatsApp, Messenger…). Works for 15 days.">Customer link</Btn>}
        <span className="spacer" />
        <div className="seg">
          <button onClick={() => excelSales([data], `invoice-${s.invoice_no}.xlsx`)}>Excel</button>
          <button onClick={() => pdfSales([data], `invoice-${s.invoice_no}.pdf`)}>PDF</button>
          <button onClick={() => printSales([data])}>Print A4</button>
        </div>
        <Btn onClick={() => printInvoice(data)}>Print (default)</Btn>
        <Btn onClick={() => printReceipt(data, 58)}>Print 58mm</Btn>
        <Btn kind="primary" onClick={() => printReceipt(data, 80)}>Print 80mm</Btn>
      </>}>
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {s && (
        <>
          {s.status === 'cancelled' && <div className="errbox">Cancelled — {s.cancel_reason}</div>}
          {link && (
            <div className="cust-link" role="status">
              <span>Customer link (works until {fdate(link.expires_at)}):</span>
              <input readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Customer invoice link" />
              <a className="btn btn-sm btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(`Invoice ${s.invoice_no}: ${link.url}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
            </div>
          )}
          <div className="kv">
            <div><span>Date</span><b>{fdatetime(s.created_at)}</b></div>
            <div><span>Customer</span><b>{s.customer_name}</b></div>
            <div><span>Served by</span><b>{s.user_name}</b></div>
            <div><span>Total</span><b>{money(s.total)}</b></div>
            <div><span>Paid</span><b>{money(s.paid)}{pays.length ? ` (${pays.map((p) => p.account_name).join(', ')})` : ''}</b></div>
            <div><span>Due at sale</span><b>{money(s.due)}</b></div>
            {s.due_now !== undefined && <div><span>Due now</span><b style={{ color: s.due_now > 0 ? 'var(--warn)' : undefined }}>{money(s.due_now)}</b></div>}
            {s.profit !== undefined && <div><span>Profit</span><b>{money(s.profit)}</b></div>}
          </div>
          <div className="dt" style={{ marginTop: 14 }}><div className="dt-scroll"><table>
            <thead><tr><th>Item</th><th>Serials</th><th>Warranty</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Amount</th><th className="r">Returned</th></tr></thead>
            <tbody>{data.items.map((i) => (
              <tr key={i.id}><td>{i.name}</td><td>{i.serials}</td><td>{i.warranty_expiry ? <Badge tone="violet">{i.warranty_days}d · till {fdate(i.warranty_expiry)}</Badge> : '—'}</td>
                <td className="r num">{fqty(i.qty, i.unit)}</td><td className="r num">{money(i.price, false)}</td><td className="r num">{money(i.total, false)}</td><td className="r num">{i.returned_qty ? fqty(i.returned_qty, i.unit) : ''}</td></tr>
            ))}</tbody>
          </table></div></div>
          {data.returns.length > 0 && <p className="muted" style={{ marginTop: 10 }}>Returns: {data.returns.map((r) => `${r.return_no} (${money(r.total, false)}, ${r.status})`).join(', ')}</p>}
        </>
      )}
      {ret && <ReturnForm detail={data} onClose={() => setRet(false)} onDone={() => { setRet(false); reload(); onChanged(); }} />}
      <ReverseDialog open={rev} type="sale" id={s?.id} label={`invoice ${s?.invoice_no}`} onClose={() => setRev(false)} onDone={() => { reload(); onChanged(); }} />
    </Modal>
  );
}

function ReturnForm({ detail, onClose, onDone }) {
  const { accounts, refresh } = useStore();
  const { sale, items } = detail;
  const [lines, setLines] = useState(() => items.map((i) => ({ id: i.id, qty: '', serials: [] })));
  const [type, setType] = useState('return');
  const [mode, setMode] = useState('cash');
  const [acc, setAcc] = useState(accounts[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, run] = useAction();
  const value = returnValue(sale, items, lines);
  // The return first clears what is still unpaid on this invoice; only the rest can be paid back in cash.
  const owed = sale.customer_id ? Number(sale.due_now ?? sale.due) || 0 : 0;
  const maxCash = round2(Math.max(value - owed, 0));
  useEffect(() => { setAmount(maxCash || (value ? 0 : '')); if (sale.customer_id && value > 0 && maxCash <= 0) setMode('adjust'); }, [value, maxCash]);
  const set = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    await run(() => api('sreturn.create', {
      sale_id: sale.id, type, note,
      items: lines.map((l) => ({ sale_item_id: l.id, qty: Number(l.qty) || 0, serials: l.serials })).filter((l) => l.qty > 0),
      refund: mode === 'adjust' ? { mode: 'adjust' } : { mode: 'cash', account_id: acc, ...(sale.customer_id ? { amount: Number(amount) } : {}) }
    }), type === 'exchange' ? 'Exchange recorded — sell the replacement from POS' : 'Return recorded and items restocked');
    refresh('products', 'customers');
    onDone();
  };

  return (
    <Modal open onClose={onClose} title={`Return items — ${sale.invoice_no}`} size="lg"
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!value} onClick={submit}>Record {type}</Btn></>}>
      <div className="row" style={{ marginBottom: 12 }}>
        <Tabs tabs={[['return', 'Return'], ['exchange', 'Exchange']]} value={type} onChange={setType} />
        {type === 'exchange' && <span className="muted">The returned value becomes customer credit; then sell the replacement in POS and tick “Use customer advance”.</span>}
      </div>
      <div className="dt"><div className="dt-scroll"><table>
        <thead><tr><th>Item</th><th className="r">Sold</th><th className="r">Returnable</th><th style={{ width: 110 }} className="r">Return qty</th><th>Serials returned</th></tr></thead>
        <tbody>{items.map((it, i) => {
          const left = round2(it.qty - (it.returned_qty || 0));
          const sers = splitList(it.serials);
          return (
            <tr key={it.id}>
              <td>{it.name}</td><td className="r num">{fqty(it.qty, it.unit)}</td><td className="r num">{fqty(left, it.unit)}</td>
              <td><input type="number" min="0" max={left} step={isDecimalUnit(it.unit) ? 0.5 : 1} value={lines[i].qty} disabled={left <= 0}
                onChange={(e) => set(i, { qty: e.target.value, serials: lines[i].serials.slice(0, Number(e.target.value) || 0) })} onWheel={noWheel} /></td>
              <td>{sers.length > 0 && <div className="serial-grid">{sers.map((sn) => (
                <button type="button" key={sn} className={lines[i].serials.includes(sn) ? 'on' : ''}
                  onClick={() => { const cur = lines[i].serials; const next = cur.includes(sn) ? cur.filter((x) => x !== sn) : [...cur, sn]; set(i, { serials: next, qty: next.length || '' }); }}>{sn}</button>
              ))}</div>}</td>
            </tr>
          );
        })}</tbody>
      </table></div></div>
      <div className="form" style={{ marginTop: 14 }}>
        <Field label="Return value (after invoice discount)"><input value={money(value)} readOnly /></Field>
        {sale.customer_id ? (
          <Field label="Settle as">
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="cash">Refund money now</option>
              <option value="adjust">Adjust customer balance (reduce due / add credit)</option>
            </select>
          </Field>
        ) : <Field label="Settle as"><input value="Refund money (walk-in sale)" readOnly /></Field>}
        {mode === 'cash' && <>
          <Field label="Refund from"><Select value={acc} onChange={setAcc} options={accounts} allowEmpty={false} /></Field>
          <Field label="Refund amount" hint={sale.customer_id ? (owed > 0 ? `${money(Math.min(owed, value))} of this return clears the unpaid due on this invoice, so at most ${money(maxCash)} can be refunded. Anything not refunded is credited to the customer.` : 'Any amount not refunded is credited to the customer.') : ''}><input type="number" min="0" max={maxCash} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!sale.customer_id} /></Field>
        </>}
        <Field label="Note" wide><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for return" /></Field>
      </div>
    </Modal>
  );
}
