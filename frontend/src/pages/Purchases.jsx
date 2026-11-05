import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, qty as fqty, fdate, monthStart, today, splitList, round2, isDecimalUnit } from '../lib/format';
import DataTable from '../components/DataTable';
import { useApi, PageHead, Tabs, DateRange, Badge, statusTone, Modal, Btn, Field, Loading, ErrorBox, useAction, Select } from '../components/ui';
import { ProductSearch, PaymentSplit, cleanPays, defaultPay, ReverseDialog } from '../components/widgets';

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
  const { suppliers, products, refresh, toast } = useStore();
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState(today());
  const [lines, setLines] = useState([]);
  const [openId, setOpenId] = useState(''); // the line whose serial box is expanded
  const [discount, setDiscount] = useState('');
  const [pays, setPays] = useState(() => defaultPay(''));
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [needSupplier, setNeedSupplier] = useState(false);
  const [busy, run] = useAction();
  const supplierRef = useRef();
  const tableRef = useRef();
  const pmap = Object.fromEntries(products.map((p) => [p.id, p]));
  const isSerial = (p) => !!p && !p.service && p.has_warranty && p.warranty_type === 'serial';
  const sup = suppliers.find((x) => x.id === supplier);

  // Cash is pre-selected once accounts are loaded; the amount stays empty (= buy on credit) until typed.
  const accCount = useStore((st) => st.accounts.length);
  useEffect(() => { if (!pays.length) setPays(defaultPay('')); }, [accCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clicking anywhere outside the open line collapses it once its serials are entered.
  useEffect(() => {
    const close = (e) => {
      if (!openId) return;
      const inside = e.target.closest?.(`[data-line="${openId}"]`);
      const line = lines.find((l) => l.product_id === openId);
      if (!inside && (!line || !isSerial(pmap[openId]) || line.serials.length)) setOpenId('');
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  });

  const add = (p) => {
    if (lines.some((l) => l.product_id === p.id)) { setOpenId(p.id); return; }
    setLines([...lines, { product_id: p.id, qty: isSerial(p) ? 0 : 1, cost: p.cost_price || '', sale: p.sale_price || '', whole: p.wholesale_price || '', serials: [] }]);
    setOpenId(isSerial(p) ? p.id : '');
  };
  const upd = (id, patch) => setLines((ls) => ls.map((l) => (l.product_id === id ? { ...l, ...patch } : l)));
  const remove = (id) => { setLines((ls) => ls.filter((l) => l.product_id !== id)); if (openId === id) setOpenId(''); };

  // Serials: one per Enter (barcode scanners send Enter after each code). Pasting a list adds them all.
  const allSerials = new Set(lines.flatMap((l) => l.serials.map((x) => x.toLowerCase())));
  const addSerials = (id, text) => {
    const list = String(text).split(/[\n,;\t]+/).map((x) => x.trim()).filter(Boolean);
    if (!list.length) return true;
    const fresh = [], seen = new Set(allSerials);
    for (const x of list) {
      if (seen.has(x.toLowerCase())) { toast(`Serial ${x} is already in this purchase`, 'err'); continue; }
      seen.add(x.toLowerCase()); fresh.push(x);
    }
    if (fresh.length) setLines((ls) => ls.map((l) => (l.product_id === id ? { ...l, serials: [...l.serials, ...fresh], qty: l.serials.length + fresh.length } : l)));
    return fresh.length === list.length;
  };
  const dropSerial = (id, sn) => setLines((ls) => ls.map((l) => (l.product_id === id ? { ...l, serials: l.serials.filter((x) => x !== sn), qty: l.serials.length - 1 } : l)));

  const sub = round2(lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0));
  const total = round2(Math.max(sub - (Number(discount) || 0), 0));
  const paid = round2(cleanPays(pays).reduce((a, p) => a + p.amount, 0));
  const due = round2(Math.max(total - paid, 0));
  const prev = Number(sup?.balance) || 0; // > 0: you owe the supplier, < 0: supplier owes you (advance)
  const after = round2(prev + total - paid);

  const bad = (l) => ({
    cost: !(Number(l.cost) > 0),
    sale: !(Number(l.sale) > 0) && !(Number(pmap[l.product_id]?.sale_price) > 0),
    qty: !(Number(l.qty) > 0)
  });
  const firstBad = lines.find((l) => Object.values(bad(l)).some(Boolean));

  const save = async () => {
    setTried(true);
    if (!supplier) { setNeedSupplier(true); supplierRef.current?.focus(); return toast('Select a supplier first', 'err'); }
    if (firstBad) {
      const p = pmap[firstBad.product_id], b = bad(firstBad);
      if (isSerial(p) && b.qty) setOpenId(p.id);
      return toast(b.qty ? (isSerial(p) ? `Scan the serial numbers for ${p.name}` : `Enter the quantity for ${p.name}`) : `Enter the unit cost and retail price for ${p.name}`, 'err');
    }
    if (paid > total + 0.004) return toast(`Paid (${money(paid, false)}) is more than the purchase total (${money(total, false)})`, 'err');
    await run(() => api('purchase.create', {
      supplier_id: supplier, date, discount: Number(discount) || 0, note, payments: cleanPays(pays),
      items: lines.map((l) => ({ product_id: l.product_id, qty: Number(l.qty), cost: Number(l.cost), sale_price: l.sale === '' ? '' : Number(l.sale), wholesale_price: l.whole === '' ? '' : Number(l.whole), serials: l.serials.join('\n') }))
    }), due > 0 ? `Purchase saved — ${money(due)} added to ${sup.name}'s payable` : 'Purchase saved — stock updated');
    await refresh('products', 'suppliers');
    onDone();
  };
  const blockSearch = () => { setNeedSupplier(true); supplierRef.current?.focus(); };

  return (
    <div className="split">
      <div className="grid">
        {supplier
          ? <ProductSearch onPick={add} noServices placeholder="Scan or search the product you received" />
          : <div className="psearch">
              <input readOnly value="" placeholder="Select a supplier first, then search products" onFocus={blockSearch} onMouseDown={blockSearch} aria-label="Search product (select a supplier first)" className={needSupplier ? 'invalid' : ''} />
              {needSupplier && <div className="pur-warn" role="alert">Please select the supplier on the right before adding products.</div>}
            </div>}
        <div className="dt"><div className="dt-scroll"><table className="pur-table" ref={tableRef}>
          <thead><tr><th>Product</th><th style={{ width: 90 }} className="r">Qty</th><th style={{ width: 110 }} className="r">Unit cost <span className="req">*</span></th><th style={{ width: 110 }} className="r">Retail price <span className="req">*</span></th><th style={{ width: 110 }} className="r">Wholesale</th><th className="r" style={{ width: 100 }}>Amount</th><th style={{ width: 34 }} /></tr></thead>
          {lines.map((l) => {
            const p = pmap[l.product_id], b = bad(l), serial = isSerial(p), open = serial && openId === l.product_id;
            return (
              <tbody key={l.product_id} data-line={l.product_id} className={`pur-line ${open ? 'open' : ''}`}>
                <tr onClick={() => serial && setOpenId(l.product_id)} className={serial ? 'clickable' : ''}>
                  <td><b>{p?.name}</b>
                    <div className="muted" style={{ fontSize: 12 }}>in stock {fqty(p?.stock, p?.unit)} · per {p?.unit}
                      {serial && !open && <> · <span className={l.serials.length ? 'sn-count' : 'sn-count bad'}>{l.serials.length ? `${l.serials.length} serial${l.serials.length === 1 ? '' : 's'} — click to edit` : 'serials missing'}</span></>}
                    </div>
                  </td>
                  <td><input type="number" min="0" step={isDecimalUnit(p?.unit) ? 'any' : 1} value={l.qty} readOnly={serial} title={serial ? 'Counted from the serial numbers' : undefined}
                    className={`${serial ? 'readonly-qty' : ''} ${tried && b.qty ? 'invalid' : ''}`} onChange={(e) => upd(l.product_id, { qty: e.target.value })} aria-label={`Quantity of ${p?.name}`} /></td>
                  <td><input type="number" min="0" step="any" value={l.cost} onChange={(e) => upd(l.product_id, { cost: e.target.value })} aria-label={`Unit cost for ${p?.name}`} className={tried && b.cost ? 'invalid' : ''} /></td>
                  <td><input type="number" min="0" step="any" value={l.sale} onChange={(e) => upd(l.product_id, { sale: e.target.value })} aria-label={`Retail price for ${p?.name}`} className={tried && b.sale ? 'invalid' : ''} placeholder="Retail" />
                    {Number(l.cost) > 0 && Number(l.sale) > 0 && <small className={Number(l.sale) < Number(l.cost) ? 'margin bad' : 'margin'}>{Math.round(((l.sale - l.cost) / l.cost) * 100)}% margin</small>}</td>
                  <td><input type="number" min="0" step="any" value={l.whole} onChange={(e) => upd(l.product_id, { whole: e.target.value })} aria-label={`Wholesale price for ${p?.name}`} placeholder="—" /></td>
                  <td className="r num">{money((Number(l.qty) || 0) * (Number(l.cost) || 0), false)}</td>
                  <td><button className="x" onClick={(e) => { e.stopPropagation(); remove(l.product_id); }} aria-label={`Remove ${p?.name}`}>×</button></td>
                </tr>
                {open && (
                  <tr className="sn-row"><td colSpan={7}>
                    <div className="sn-box">
                      <div className="sn-head"><b>Serial numbers</b><span className="muted">Scan with the barcode scanner, or type and press Enter. Quantity is counted automatically.</span><span className="sn-total">{l.serials.length} entered</span></div>
                      <div className="sn-chips">
                        {l.serials.map((sn) => (
                          <span className="sn-chip" key={sn}>{sn}<button type="button" onClick={() => dropSerial(l.product_id, sn)} aria-label={`Remove serial ${sn}`}>×</button></span>
                        ))}
                        <input className="sn-input" autoFocus placeholder={l.serials.length ? 'Next serial…' : 'Scan or type serial, then Enter'} aria-label={`Add serial for ${p?.name}`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Tab') {
                              if (!e.currentTarget.value.trim()) return;
                              e.preventDefault();
                              if (addSerials(l.product_id, e.currentTarget.value)) e.currentTarget.value = ''; else e.currentTarget.select();
                            } else if (e.key === 'Backspace' && !e.currentTarget.value && l.serials.length) dropSerial(l.product_id, l.serials[l.serials.length - 1]);
                          }}
                          onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/[\n,;\t]/.test(t)) { e.preventDefault(); addSerials(l.product_id, t); } }} />
                      </div>
                    </div>
                  </td></tr>
                )}
              </tbody>
            );
          })}
        </table>{!lines.length && <div className="empty"><b>No items yet</b><div>{supplier ? 'Search above to add products. For serial-tracked items, scan every serial.' : 'Select the supplier first, then add products.'}</div></div>}</div></div>
      </div>
      <div className="card">
        <div className="form">
          <Field label={<>Supplier <span className="req">*</span></>} wide error={needSupplier && !supplier ? 'Select the supplier you are buying from' : undefined}>
            <select ref={supplierRef} value={supplier} onChange={(e) => { setSupplier(e.target.value); setNeedSupplier(false); }} aria-label="Supplier" className={needSupplier && !supplier ? 'invalid' : ''}>
              <option value="">Select a supplier…</option>
              {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          {sup && prev !== 0 && (
            <div className={`wide sup-bal ${prev > 0 ? 'owe' : 'adv'}`}>
              <span>{prev > 0 ? 'Previous due to this supplier' : 'Advance with this supplier (they owe you)'}</span>
              <b>{money(Math.abs(prev))}</b>
            </div>
          )}
          {sup && prev === 0 && <div className="wide sup-bal clear"><span>No previous balance with this supplier</span></div>}
          <Field label="Purchase date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Discount"><input type="number" min="0" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
        </div>
        <div className="totals" style={{ margin: '14px 0' }}>
          <span>Subtotal</span><b className="num">{money(sub, false)}</b>
          <span>Total</span><span className="grand">{money(total)}</span>
        </div>
        <PaymentSplit value={pays} onChange={setPays} total={total} label="Pay supplier now (leave the amount empty to buy on credit)" />
        <div className="totals" style={{ marginTop: 10 }}>
          <span>Paid now</span><b className="num">{money(paid, false)}</b>
          <span>Due on this purchase</span><span className="due num">{money(due)}</span>
          {sup && <>
            <span>Previous balance</span><span className="num">{prev < 0 ? `-${money(-prev, false)}` : money(prev, false)}</span>
            <span><b>{after >= 0 ? 'Total payable to supplier' : 'Advance left with supplier'}</b></span><b className="num" style={{ color: after > 0 ? 'var(--bad)' : 'var(--ok)' }}>{money(Math.abs(after))}</b>
          </>}
        </div>
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
