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
import { ReverseDialog, ProductSearch, SerialChooser, PaymentSplit, defaultPay, cleanPays } from '../components/widgets';
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

const isSerialProduct = (p) => !p.service && p.has_warranty && p.warranty_type === 'serial';

function ReturnForm({ detail, onClose, onDone }) {
  const { accounts, refresh, can, toast } = useStore();
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

  // Exchange: the replacement products are sold on a new invoice in the same step.
  const [repl, setRepl] = useState([]);
  const exchanging = type === 'exchange' && repl.length > 0;
  const walkIn = !sale.customer_id;
  const cashAcc = (accounts.find((a) => a.type === 'cash') || accounts[0])?.id || '';
  const [settleAcc, setSettleAcc] = useState(cashAcc);
  const [pays, setPays] = useState(() => defaultPay(''));
  const [payTouched, setPayTouched] = useState(false);
  const [surplusMode, setSurplusMode] = useState('credit');
  const [refundAcc, setRefundAcc] = useState(cashAcc);
  const [refundAmt, setRefundAmt] = useState('');
  const [nextPay, setNextPay] = useState('');
  const replTotal = round2(repl.reduce((a, l) => a + round2((Number(l.qty) || 0) * (Number(l.price) || 0)), 0));
  const diff = round2(replTotal - value);
  const paidNow = diff > 0 ? round2(cleanPays(pays).reduce((a, p) => a + p.amount, 0)) : 0;
  const unpaid = diff > 0 ? round2(diff - paidNow) : 0;
  // What the customer will hold as credit after the exchange (their old dues are cleared first).
  const custBal = Number(detail.customer?.balance) || 0;
  const holding = round2(Math.max(-(custBal - value + replTotal), 0));
  const refundMax = diff < 0 ? round2(Math.min(-diff, holding)) : 0;
  useEffect(() => { if (!payTouched) setPays(defaultPay(diff > 0 ? diff : '')); }, [diff, payTouched]);
  useEffect(() => { setRefundAmt(refundMax > 0 ? refundMax : ''); }, [refundMax]);

  const addRepl = (p) => {
    if (isSerialProduct(p)) {
      if (repl.some((l) => l.product_id === p.id)) return toast(`${p.name} is already added — pick more serials on its line`, 'err');
      return setRepl((r) => [...r, { product_id: p.id, name: p.name, unit: p.unit, serial: true, qty: 0, price: p.sale_price, serials: [] }]);
    }
    setRepl((r) => (r.some((l) => l.product_id === p.id) ? r.map((l) => (l.product_id === p.id ? { ...l, qty: (Number(l.qty) || 0) + 1 } : l)) : [...r, { product_id: p.id, name: p.name, unit: p.unit, serial: false, qty: 1, price: p.sale_price, serials: [] }]));
  };
  const setRepLine = (i, patch) => setRepl((r) => r.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const problems = [];
  if (exchanging) {
    if (!value) problems.push('Select the item(s) the customer is returning');
    repl.forEach((l) => {
      if (!(Number(l.qty) > 0)) problems.push(l.serial ? `Pick the serial number(s) for ${l.name}` : `Enter a quantity for ${l.name}`);
      if (!(Number(l.price) >= 0) || l.price === '') problems.push(`Enter a price for ${l.name}`);
    });
    if (diff > 0 && paidNow > diff + 0.004) problems.push(`Payment is more than the difference (${money(diff)})`);
    if (diff > 0 && walkIn && Math.abs(unpaid) > 0.004) problems.push(`Walk-in customer must pay the full difference of ${money(diff)}`);
    if (diff < 0 && !walkIn && surplusMode === 'refund' && (Number(refundAmt) > refundMax + 0.004 || !(Number(refundAmt) > 0))) problems.push(`Refund must be between 0 and ${money(refundMax)}`);
  }

  const submit = async (print) => {
    if (exchanging) {
      if (problems.length) return toast(problems[0], 'err');
      let res;
      try {
        res = await run(() => api('sale.exchange', {
          sale_id: sale.id, note, expected_return_value: value, expected_total: replTotal,
          items: lines.map((l) => ({ sale_item_id: l.id, qty: Number(l.qty) || 0, serials: l.serials })).filter((l) => l.qty > 0),
          replacement: repl.map((l) => ({ product_id: l.product_id, qty: Number(l.qty), price: Number(l.price), serials: l.serials })),
          payments: diff > 0 ? cleanPays(pays) : [],
          ...(walkIn ? { account_id: settleAcc } : {}),
          ...(!walkIn && diff < 0 && surplusMode === 'refund' ? { refund: { account_id: refundAcc, amount: round2(Number(refundAmt)) } } : {}),
          next_payment_date: unpaid > 0.004 ? nextPay : ''
        }));
      } catch { return; }
      const d = res.summary;
      toast(`Exchanged: ${res.return.return_no} → ${res.sale.sale.invoice_no}` + (d.difference > 0 ? ` · received ${money(d.paid_now)}${d.due > 0 ? `, ${money(d.due)} due` : ''}` : d.difference < 0 ? (d.refund > 0 || walkIn ? ` · gave back ${money(walkIn ? -d.difference : d.refund)}` : ` · ${money(-d.difference)} kept as customer credit`) : ''), 'ok');
      if (print) printInvoice(res.sale);
      refresh('products', 'customers');
      return onDone();
    }
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
      footer={<><Btn onClick={onClose}>Cancel</Btn>
        {exchanging && <Btn busy={busy} disabled={!value || problems.length > 0} onClick={() => submit(true)}>Exchange &amp; print invoice</Btn>}
        <Btn kind="primary" busy={busy} disabled={!value || (exchanging && problems.length > 0)} onClick={() => submit(false)}>Record {type}</Btn></>}>
      <div className="row" style={{ marginBottom: 12 }}>
        <Tabs tabs={[['return', 'Return'], ['exchange', 'Exchange']]} value={type} onChange={setType} />
        {type === 'exchange' && <span className="muted">{can('pos') ? 'Pick what comes back, then add the product the customer takes instead. Stock, cash and profit follow both products.' : 'The returned value becomes customer credit; then sell the replacement in POS and tick “Use customer advance”.'}</span>}
      </div>
      <h3 className="xch-title">{type === 'exchange' ? '1. Item(s) coming back' : 'Items'}</h3>
      <div className="dt"><div className="dt-scroll"><table>
        <thead><tr><th>Item</th><th className="r">Sold</th><th className="r">Returnable</th><th style={{ width: 110 }} className="r">Return qty</th><th>Serials returned</th></tr></thead>
        <tbody>{items.map((it, i) => {
          const left = round2(it.qty - (it.returned_qty || 0));
          const sers = splitList(it.serials);
          return (
            <tr key={it.id}>
              <td>{it.name}</td><td className="r num">{fqty(it.qty, it.unit)}</td><td className="r num">{fqty(left, it.unit)}</td>
              <td><input type="number" min="0" max={left} step={isDecimalUnit(it.unit) ? 0.5 : 1} value={lines[i].qty} disabled={left <= 0}
                onChange={(e) => set(i, { qty: e.target.value, serials: lines[i].serials.slice(0, Number(e.target.value) || 0) })} onWheel={noWheel} aria-label={`Return quantity for ${it.name}`} /></td>
              <td>{sers.length > 0 && <div className="serial-grid">{sers.map((sn) => (
                <button type="button" key={sn} className={lines[i].serials.includes(sn) ? 'on' : ''}
                  onClick={() => { const cur = lines[i].serials; const next = cur.includes(sn) ? cur.filter((x) => x !== sn) : [...cur, sn]; set(i, { serials: next, qty: next.length || '' }); }}>{sn}</button>
              ))}</div>}</td>
            </tr>
          );
        })}</tbody>
      </table></div></div>

      {type === 'exchange' && can('pos') && <>
        <h3 className="xch-title">2. Product the customer takes instead</h3>
        <ProductSearch inStockOnly onPick={addRepl} placeholder="Search the replacement product (name, model, brand, barcode)" />
        {repl.length > 0 && <div className="dt" style={{ marginTop: 10 }}><div className="dt-scroll"><table>
          <thead><tr><th>Replacement</th><th style={{ width: 110 }} className="r">Qty</th><th style={{ width: 130 }} className="r">Price</th><th className="r">Amount</th><th /></tr></thead>
          <tbody>{repl.map((l, i) => (
            <tr key={l.product_id}>
              <td>{l.name}{l.serial && <SerialChooser productId={l.product_id} value={l.serials} onChange={(sers) => setRepLine(i, { serials: sers, qty: sers.length })} />}</td>
              <td>{l.serial ? <span className="num">{l.qty}</span> : <input type="number" min="0" step={isDecimalUnit(l.unit) ? 'any' : 1} value={l.qty} onChange={(e) => setRepLine(i, { qty: e.target.value })} onWheel={noWheel} aria-label={`Quantity of ${l.name}`} />}</td>
              <td><input type="number" min="0" step="any" value={l.price} onChange={(e) => setRepLine(i, { price: e.target.value })} onWheel={noWheel} aria-label={`Price of ${l.name}`} /></td>
              <td className="r num">{money(round2((Number(l.qty) || 0) * (Number(l.price) || 0)), false)}</td>
              <td><button type="button" className="x" aria-label={`Remove ${l.name}`} onClick={() => setRepl((r) => r.filter((_, j) => j !== i))}>×</button></td>
            </tr>
          ))}</tbody>
        </table></div></div>}
        {!repl.length && <p className="muted" style={{ marginTop: 6 }}>No replacement yet. Leave it empty only if the customer will choose later — the returned value then stays as customer credit (or is refunded).</p>}
      </>}

      {exchanging ? <>
        <h3 className="xch-title">3. Settle the difference</h3>
        <div className="xch-sum">
          <div><span>Returned value</span><b>{money(value)}</b></div>
          <div><span>Replacement total</span><b>{money(replTotal)}</b></div>
          <div className={diff > 0 ? 'due' : diff < 0 ? 'back' : ''}><span>{diff > 0 ? 'Customer pays' : diff < 0 ? 'Shop gives back' : 'Difference'}</span><b>{money(Math.abs(diff))}</b></div>
        </div>
        <div className="form" style={{ marginTop: 12 }}>
          {walkIn && <Field label="Counter account" hint="The returned value and the replacement pass through this account, so only the difference actually changes hands."><Select value={settleAcc} onChange={setSettleAcc} options={accounts} allowEmpty={false} /></Field>}
          {diff > 0 && <div className="wide"><PaymentSplit value={pays} onChange={(v) => { setPayTouched(true); setPays(v); }} total={diff} label="Customer pays the difference" /></div>}
          {diff > 0 && !walkIn && unpaid > 0.004 && <Field label="Next payment date" hint={`${money(unpaid)} stays due on the new invoice.`}><input type="date" min={today()} value={nextPay} onChange={(e) => setNextPay(e.target.value)} /></Field>}
          {diff < 0 && walkIn && <p className="wide muted">Give {money(-diff)} back to the customer from the counter account.</p>}
          {diff < 0 && !walkIn && <>
            <Field label="The extra value">
              <select value={surplusMode} onChange={(e) => setSurplusMode(e.target.value)} aria-label="What to do with the extra value">
                <option value="credit">Keep as customer credit</option>
                <option value="refund" disabled={refundMax <= 0}>Refund money now</option>
              </select>
            </Field>
            {surplusMode === 'refund' && <>
              <Field label="Refund from"><Select value={refundAcc} onChange={setRefundAcc} options={accounts} allowEmpty={false} /></Field>
              <Field label="Refund amount" hint={refundMax < -diff ? `At most ${money(refundMax)}: the rest clears what the customer still owes.` : ''}><input type="number" min="0" max={refundMax} step="any" value={refundAmt} onChange={(e) => setRefundAmt(e.target.value)} /></Field>
            </>}
            {refundMax < -diff && surplusMode === 'credit' && <p className="wide muted">The customer still owes money, so the extra value first reduces that due.</p>}
          </>}
          <Field label="Note" wide><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for exchange" /></Field>
        </div>
        {problems.length > 0 && value > 0 && <p className="wide" style={{ color: 'var(--warn)', marginTop: 8 }}>{problems[0]}</p>}
      </> : (
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
      </div>)}
    </Modal>
  );
}
