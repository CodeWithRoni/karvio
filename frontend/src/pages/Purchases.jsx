import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, qty as fqty, fdate, monthStart, today, splitList, round2, isDecimalUnit } from '../lib/format';
import DataTable from '../components/DataTable';
import { useApi, PageHead, Tabs, DateRange, Badge, statusTone, Modal, Btn, Field, Loading, ErrorBox, useAction, Select } from '../components/ui';
import { ProductSearch, PaymentSplit, cleanPays, ReverseDialog } from '../components/widgets';

export default function Purchases() {
  const can = useStore((s) => s.can);
  const [tab, setTab] = useState('list');
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const list = useApi('purchases.list', range, [], { skip: tab !== 'list' });
  const rets = useApi('preturns.list', range, [], { skip: tab !== 'returns' });
  const [open, setOpen] = useState(null);
  const [rev, setRev] = useState(null);

  return (
    <>
      <PageHead title="Purchases" sub="Stock coming in from suppliers, and returns going back.">
        <Tabs tabs={[['list', 'Purchase invoices'], ['returns', 'Purchase returns'], ['new', 'New purchase']]} value={tab} onChange={setTab} />
      </PageHead>
      {tab === 'new' ? <NewPurchase onDone={() => setTab('list')} /> : (
        <>
          <div className="filters"><DateRange {...range} onChange={setRange} /></div>
          {tab === 'list' ? (
            <>
              <ErrorBox error={list.error} onRetry={list.reload} />
              <DataTable title="Purchases" loading={list.loading} rows={list.data || []} onRowClick={(r) => setOpen(r.id)} rowClass={(r) => (r.status === 'cancelled' ? 'dim' : '')}
                columns={[
                  { key: 'date', label: 'Date', type: 'date' }, { key: 'invoice_no', label: 'Purchase #' }, { key: 'supplier_name', label: 'Supplier' },
                  { key: 'items_text', label: 'Items', className: 'clip' }, { key: 'total', label: 'Total', type: 'money', sum: true },
                  { key: 'paid', label: 'Paid', type: 'money', sum: true }, { key: 'due', label: 'Due', type: 'money', sum: true },
                  { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> }
                ]} />
            </>
          ) : (
            <DataTable title="Purchase returns" loading={rets.loading} rows={rets.data || []} rowClass={(r) => (r.status === 'cancelled' ? 'dim' : '')}
              columns={[
                { key: 'date', label: 'Date', type: 'date' }, { key: 'return_no', label: 'Return #' }, { key: 'invoice_no', label: 'Purchase' },
                { key: 'supplier_name', label: 'Supplier' }, { key: 'items_text', label: 'Items', className: 'clip' },
                { key: 'total', label: 'Value', type: 'money', sum: true }, { key: 'received', label: 'Money received', type: 'money', sum: true },
                { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
                ...(can('cancel') ? [{ key: 'act', label: '', noSort: true, noExport: true, render: (r) => r.status === 'active' && <Btn size="sm" kind="danger" onClick={() => setRev({ type: 'preturn', id: r.id, label: `return ${r.return_no}` })}>Cancel</Btn> }] : [])
              ]} />
          )}
        </>
      )}
      {open && <PurchaseDetail id={open} onClose={() => setOpen(null)} onChanged={() => { list.reload(); rets.reload(); }} />}
      <ReverseDialog open={!!rev} {...(rev || {})} onClose={() => setRev(null)} onDone={() => rets.reload()} />
    </>
  );
}

function NewPurchase({ onDone }) {
  const { suppliers, products, refresh } = useStore();
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState(today());
  const [lines, setLines] = useState([]);
  const [discount, setDiscount] = useState('');
  const [pays, setPays] = useState([]);
  const [note, setNote] = useState('');
  const [busy, run] = useAction();
  const pmap = Object.fromEntries(products.map((p) => [p.id, p]));
  const isSerial = (p) => p?.has_warranty && p.warranty_type === 'serial';

  const add = (p) => {
    if (lines.some((l) => l.product_id === p.id)) return;
    setLines([...lines, { product_id: p.id, qty: 1, cost: p.cost_price || '', sale: p.sale_price || '', whole: p.wholesale_price || '', serials: '' }]);
  };
  const upd = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const sub = round2(lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0));
  const total = round2(sub - (Number(discount) || 0));
  const paid = cleanPays(pays).reduce((a, p) => a + p.amount, 0);

  // Every line needs a unit cost; a product that has never been priced also needs its retail price.
  const [tried, setTried] = useState(false);
  const bad = (l) => ({ cost: !(Number(l.cost) > 0), sale: !(Number(l.sale) > 0) && !(Number(pmap[l.product_id]?.sale_price) > 0) });
  const invalid = lines.some((l) => { const b = bad(l); return b.cost || b.sale; });
  const save = async () => {
    setTried(true);
    if (invalid) return useStore.getState().toast('Enter the unit cost and retail price for every item', 'err');
    await run(() => api('purchase.create', {
      supplier_id: supplier, date, discount: Number(discount) || 0, note, payments: cleanPays(pays),
      items: lines.map((l) => ({ product_id: l.product_id, qty: Number(l.qty), cost: Number(l.cost), sale_price: l.sale === '' ? '' : Number(l.sale), wholesale_price: l.whole === '' ? '' : Number(l.whole), serials: l.serials }))
    }), 'Purchase saved — stock updated');
    await refresh('products', 'suppliers');
    onDone();
  };

  return (
    <div className="split">
      <div className="grid">
        <ProductSearch onPick={add} noServices placeholder="Scan or search the product you received" />
        <div className="dt"><div className="dt-scroll"><table>
          <thead><tr><th>Product</th><th style={{ width: 100 }} className="r">Qty</th><th style={{ width: 110 }} className="r">Unit cost <span className="req">*</span></th><th style={{ width: 110 }} className="r">Retail price <span className="req">*</span></th><th style={{ width: 110 }} className="r">Wholesale</th><th className="r">Amount</th><th /></tr></thead>
          <tbody>{lines.map((l, i) => {
            const p = pmap[l.product_id];
            const n = splitList(l.serials.replace(/\n/g, ',')).length;
            return (
              <tr key={l.product_id}>
                <td><b>{p?.name}</b><div className="muted" style={{ fontSize: 12 }}>in stock {fqty(p?.stock, p?.unit)} · per {p?.unit}</div>
                  {isSerial(p) && <><textarea value={l.serials} onChange={(e) => upd(i, { serials: e.target.value, qty: splitList(e.target.value.replace(/\n/g, ',')).length || l.qty })} placeholder="Scan one serial per line" style={{ marginTop: 6, minHeight: 60 }} />
                    <small style={{ color: n === Number(l.qty) ? 'var(--ok)' : 'var(--warn)' }}>{n} of {l.qty} serials entered</small></>}
                </td>
                <td><input type="number" min="0" step={isDecimalUnit(p?.unit) ? 'any' : 1} value={l.qty} onChange={(e) => upd(i, { qty: e.target.value })} /></td>
                <td><input type="number" min="0" step="any" value={l.cost} onChange={(e) => upd(i, { cost: e.target.value })} aria-label={`Unit cost for ${p?.name}`} aria-invalid={tried && bad(l).cost} className={tried && bad(l).cost ? 'invalid' : ''} /></td>
                <td><input type="number" min="0" step="any" value={l.sale} onChange={(e) => upd(i, { sale: e.target.value })} aria-label={`Retail price for ${p?.name}`} aria-invalid={tried && bad(l).sale} className={tried && bad(l).sale ? 'invalid' : ''} placeholder="Retail" />
                  {Number(l.cost) > 0 && Number(l.sale) > 0 && <small className={Number(l.sale) < Number(l.cost) ? 'margin bad' : 'margin'}>{Math.round(((l.sale - l.cost) / l.cost) * 100)}% margin</small>}</td>
                <td><input type="number" min="0" step="any" value={l.whole} onChange={(e) => upd(i, { whole: e.target.value })} aria-label={`Wholesale price for ${p?.name}`} placeholder="—" /></td>
                <td className="r num">{money((Number(l.qty) || 0) * (Number(l.cost) || 0), false)}</td>
                <td><button className="x" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button></td>
              </tr>
            );
          })}</tbody>
        </table>{!lines.length && <div className="empty"><b>No items yet</b><div>Search above to add products. For serial-tracked items, scan every serial.</div></div>}</div></div>
      </div>
      <div className="card">
        <div className="form">
          <Field label="Supplier" wide hint="Required when buying on credit."><Select value={supplier} onChange={setSupplier} options={suppliers} placeholder="No supplier (cash purchase)" /></Field>
          <Field label="Purchase date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Discount"><input type="number" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
        </div>
        <div className="totals" style={{ margin: '14px 0' }}>
          <span>Subtotal</span><b className="num">{money(sub, false)}</b>
          <span>Total</span><span className="grand">{money(total)}</span>
        </div>
        <PaymentSplit value={pays} onChange={setPays} total={total} label="Paid now (leave empty for full credit)" />
        <div className="totals" style={{ marginTop: 10 }}><span>Due to supplier</span><span className="due num">{money(Math.max(total - paid, 0))}</span></div>
        <Field label="Note" wide><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Supplier invoice number, etc." /></Field>
        <Btn kind="primary" size="lg" style={{ width: '100%', marginTop: 14 }} busy={busy} disabled={!lines.length} onClick={save}>Save purchase</Btn>
      </div>
    </div>
  );
}

function PurchaseDetail({ id, onClose, onChanged }) {
  const can = useStore((s) => s.can);
  const { data, loading, error, reload } = useApi('purchase.detail', { id });
  const [ret, setRet] = useState(false);
  const [rev, setRev] = useState(false);
  const p = data?.purchase;
  return (
    <Modal open onClose={onClose} size="lg" title={p ? `Purchase ${p.invoice_no}` : 'Purchase'}
      footer={p && p.status === 'active' && <>{can('cancel') && <Btn kind="danger" onClick={() => setRev(true)}>Cancel purchase</Btn>}<span className="spacer" /><Btn onClick={() => setRet(true)}>Return to supplier</Btn></>}>
      {loading && <Loading />}<ErrorBox error={error} onRetry={reload} />
      {p && <>
        {p.status === 'cancelled' && <div className="errbox">Cancelled — {p.cancel_reason}</div>}
        <div className="kv">
          <div><span>Date</span><b>{fdate(p.date)}</b></div><div><span>Supplier</span><b>{p.supplier_name || '—'}</b></div>
          <div><span>Total</span><b>{money(p.total)}</b></div><div><span>Paid</span><b>{money(p.paid)}</b></div><div><span>Due</span><b>{money(p.due)}</b></div>
          <div><span>Entered by</span><b>{p.user}</b></div>
        </div>
        <div className="dt" style={{ marginTop: 14 }}><div className="dt-scroll"><table>
          <thead><tr><th>Item</th><th>Serials</th><th className="r">Qty</th><th className="r">Cost</th><th className="r">Amount</th></tr></thead>
          <tbody>{data.items.map((i) => <tr key={i.id}><td>{i.name}</td><td>{i.serials}</td><td className="r num">{fqty(i.qty, i.unit)}</td><td className="r num">{money(i.cost, false)}</td><td className="r num">{money(i.total, false)}</td></tr>)}</tbody>
        </table></div></div>
        {data.returns.length > 0 && <p className="muted">Returns: {data.returns.map((r) => `${r.return_no} (${money(r.total, false)}, ${r.status})`).join(', ')}</p>}
      </>}
      {ret && <PReturnForm detail={data} onClose={() => setRet(false)} onDone={() => { setRet(false); reload(); onChanged(); }} />}
      <ReverseDialog open={rev} type="purchase" id={p?.id} label={`purchase ${p?.invoice_no}`} onClose={() => setRev(false)} onDone={() => { reload(); onChanged(); }} />
    </Modal>
  );
}

function PReturnForm({ detail, onClose, onDone }) {
  const { accounts, refresh } = useStore();
  const { purchase, items } = detail;
  const [lines, setLines] = useState(items.map((i) => ({ id: i.id, qty: '', serials: [] })));
  const [mode, setMode] = useState(purchase.supplier_id ? 'adjust' : 'cash');
  const [acc, setAcc] = useState(accounts[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [busy, run] = useAction();
  const ratio = purchase.subtotal > 0 ? purchase.total / purchase.subtotal : 1;
  const value = round2(lines.reduce((a, l, i) => a + (Number(l.qty) || 0) * items[i].cost * ratio, 0));
  useEffect(() => setAmount(value || ''), [value]);
  const set = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const save = async () => {
    await run(() => api('preturn.create', {
      purchase_id: purchase.id,
      items: lines.map((l) => ({ purchase_item_id: l.id, qty: Number(l.qty) || 0, serials: l.serials })).filter((l) => l.qty > 0),
      refund: mode === 'adjust' ? { mode: 'adjust' } : { mode: 'cash', account_id: acc, amount: Number(amount) }
    }), 'Purchase return saved — stock reduced');
    await refresh('products', 'suppliers'); onDone();
  };
  return (
    <Modal open onClose={onClose} size="lg" title={`Return to supplier — ${purchase.invoice_no}`} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!value} onClick={save}>Record return</Btn></>}>
      <div className="dt"><div className="dt-scroll"><table>
        <thead><tr><th>Item</th><th className="r">Bought</th><th style={{ width: 110 }} className="r">Return qty</th><th>Serials</th></tr></thead>
        <tbody>{items.map((it, i) => (
          <tr key={it.id}><td>{it.name}</td><td className="r num">{fqty(it.qty, it.unit)}</td>
            <td><input type="number" min="0" max={it.qty} step="any" value={lines[i].qty} onChange={(e) => set(i, { qty: e.target.value })} /></td>
            <td>{splitList(it.serials).length > 0 && <div className="serial-grid">{splitList(it.serials).map((sn) => (
              <button type="button" key={sn} className={lines[i].serials.includes(sn) ? 'on' : ''} onClick={() => { const c = lines[i].serials; const n = c.includes(sn) ? c.filter((x) => x !== sn) : [...c, sn]; set(i, { serials: n, qty: n.length || '' }); }}>{sn}</button>
            ))}</div>}</td></tr>
        ))}</tbody>
      </table></div></div>
      <div className="form" style={{ marginTop: 14 }}>
        <Field label="Return value"><input readOnly value={money(value)} /></Field>
        <Field label="Settle as">
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {purchase.supplier_id && <option value="adjust">Reduce what we owe the supplier</option>}
            <option value="cash">Supplier refunds money now</option>
          </select>
        </Field>
        {mode === 'cash' && <><Field label="Received into"><Select value={acc} onChange={setAcc} options={accounts} allowEmpty={false} /></Field>
          <Field label="Amount received"><input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field></>}
      </div>
    </Modal>
  );
}
