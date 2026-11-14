import CameraScanButton from '../components/CameraScanButton';
import { purchaseDetails } from '../lib/purchaseDetails';
import { Pager, DEFAULT_PAGE_SIZE } from '../components/Pager';
import { returnValue } from '../lib/returnValue';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, shopDay } from '../lib/store';
import { api } from '../lib/api';
import { money, qty as fqty, fdate, monthStart, today, splitList, round2, isDecimalUnit } from '../lib/format';
import DataTable from '../components/DataTable';
import { useApi, PageHead, Tabs, DateRange, Badge, statusTone, Modal, Btn, Field, Loading, ErrorBox, useAction, useConfirm, Select, noWheel } from '../components/ui';
import { ProductSearch, PaymentSplit, cleanPays, defaultPay, ReverseDialog } from '../components/widgets';
import { excelPurchases, pdfPurchases, printPurchases } from '../lib/purchaseDocs';

export default function Purchases() {
  const can = useStore((s) => s.can);
  const [tab, setTab] = useState('list');
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  // Purchase invoices: newest first, 20 per page by default (20 / 50 / 100 / custom); narrow by supplier and / or dates.
  const [lf, setLf] = useState({ supplier_id: '', from: '', to: '', q: '', page: 1, per: DEFAULT_PAGE_SIZE });
  const list = useApi('purchases.list', lf, [lf.supplier_id, lf.from, lf.to, lf.q, lf.page, lf.per], { skip: tab !== 'list' });
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
          {tab === 'list' ? <PurchaseList list={list} f={lf} setF={setLf} onOpen={setOpen} /> : <div className="filters"><DateRange {...range} onChange={setRange} /></div>}
          {tab === 'list' ? null : (
            <DataTable title="Purchase returns" sumFilter={(r) => r.status === 'active'} loading={rets.loading} rows={rets.data || []} rowClass={(r) => (r.status === 'cancelled' ? 'dim' : '')}
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

function PurchaseList({ list, f, setF, onOpen }) {
  const suppliers = useStore((st) => st.suppliers);
  const [sel, setSel] = useState({}); // id -> invoice_no, kept across pages
  const [busy, setBusy] = useState('');
  const d = list.data && !Array.isArray(list.data) ? list.data : { rows: [], total: 0, page: 1, per: f.per || DEFAULT_PAGE_SIZE, sums: {} };
  const ids = Object.keys(sel);
  const allOnPage = d.rows.length > 0 && d.rows.every((r) => sel[r.id]);
  const toggle = (r) => setSel((x) => { const n = { ...x }; if (n[r.id]) delete n[r.id]; else n[r.id] = r.invoice_no; return n; });
  const togglePage = () => setSel((x) => { const n = { ...x }; d.rows.forEach((r) => { if (allOnPage) delete n[r.id]; else n[r.id] = r.invoice_no; }); return n; });
  const set = (patch) => setF({ ...f, ...patch, page: patch.page || 1 });
  // search box: waits until typing stops
  const [q, setQ] = useState(f.q || '');
  useEffect(() => { const t = setTimeout(() => { if (q.trim() !== (f.q || '')) set({ q: q.trim() }); }, 350); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const out = async (kind) => {
    setBusy(kind);
    try {
      const docs = await purchaseDetails(ids);
      const name = ids.length === 1 ? `purchase-${docs[0].purchase.invoice_no}` : `purchases-${ids.length}-invoices`;
      if (kind === 'excel') await excelPurchases(docs, `${name}.xlsx`);
      else if (kind === 'pdf') await pdfPurchases(docs, `${name}.pdf`);
      else await printPurchases(docs);
    } catch (e) { useStore.getState().toast(e.message, 'err'); } finally { setBusy(''); }
  };

  return (
    <>
      <div className="filters">
        <Field label="Search"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Purchase # / supplier invoice / product" aria-label="Search purchases" style={{ minWidth: 240 }} /></Field>
        <Field label="Supplier"><select value={f.supplier_id} onChange={(e) => set({ supplier_id: e.target.value })} aria-label="Filter by supplier" style={{ minWidth: 220 }}>
          <option value="">All suppliers</option>{suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select></Field>
        <Field label="From"><input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} aria-label="From date" /></Field>
        <Field label="To"><input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} aria-label="To date" /></Field>
        {(f.supplier_id || f.from || f.to || f.q) && <button className="link" style={{ paddingBottom: 10 }} onClick={() => { setQ(''); setF({ supplier_id: '', from: '', to: '', q: '', page: 1, per: f.per }); }}>Clear filters</button>}
        <span className="spacer" />
        <div className="pl-export">
          <span className="muted">{ids.length ? `${ids.length} selected` : 'Tick invoices to export'}</span>
          {ids.length > 0 && <button className="link" onClick={() => setSel({})}>Clear</button>}
          <div className="seg">
            <button disabled={!ids.length || !!busy} onClick={() => out('excel')}>{busy === 'excel' ? '…' : 'Excel'}</button>
            <button disabled={!ids.length || !!busy} onClick={() => out('pdf')}>{busy === 'pdf' ? '…' : 'PDF'}</button>
            <button disabled={!ids.length || !!busy} onClick={() => out('print')}>{busy === 'print' ? '…' : 'Print'}</button>
          </div>
        </div>
      </div>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <div className="dt"><div className="dt-scroll"><table className="pl-table">
        <thead><tr>
          <th style={{ width: 36 }}><input type="checkbox" checked={allOnPage} onChange={togglePage} aria-label="Select all on this page" /></th>
          <th>Date</th><th>Purchase #</th><th>Supplier invoice</th><th>Supplier</th><th>Items</th><th className="r">Total</th><th className="r">Paid</th><th className="r">Due at purchase</th><th className="r">Due now</th><th>Status</th>
        </tr></thead>
        <tbody>{d.rows.map((r) => (
          <tr key={r.id} className={`${r.status === 'cancelled' ? 'dim' : ''} ${sel[r.id] ? 'picked' : ''}`} onClick={() => onOpen(r.id)}>
            <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={!!sel[r.id]} onChange={() => toggle(r)} aria-label={`Select ${r.invoice_no}`} /></td>
            <td className="nowrap">{fdate(r.date)}</td><td>{r.invoice_no}</td><td>{r.supplier_invoice || <span className="muted">—</span>}</td><td>{r.supplier_name || '—'}</td><td className="clip">{r.items_text}</td>
            <td className="r num">{money(r.total, false)}</td><td className="r num">{money(r.paid, false)}</td><td className="r num">{money(r.due, false)}</td><td className="r num">{money(r.due_now ?? r.due, false)}</td>
            <td><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
          </tr>
        ))}</tbody>
        {d.total > 0 && <tfoot><tr><td /><td colSpan={5}><b>Total of {d.total} purchase{d.total === 1 ? '' : 's'}</b> <span className="muted">(cancelled not counted)</span></td>
          <td className="r num"><b>{money(d.sums.total, false)}</b></td><td className="r num"><b>{money(d.sums.paid, false)}</b></td><td className="r num"><b>{money(d.sums.due, false)}</b></td><td className="r num"><b>{money(d.sums.due_now ?? d.sums.due, false)}</b></td><td /></tr></tfoot>}
      </table>
      {list.loading && !d.rows.length && <Loading />}
      {!list.loading && !d.rows.length && <div className="empty"><b>No purchases found</b><div>{f.supplier_id || f.from || f.to ? 'Change the supplier or dates.' : 'Record your first purchase in New purchase.'}</div></div>}
      </div>
      <Pager page={d.page - 1} pageSize={d.per} total={d.total} label="purchases" onPage={(n) => set({ page: n + 1 })} onPageSize={(n) => set({ per: n })} />
      </div>
    </>
  );
}

function NewPurchase({ onDone }) {
  const { suppliers, products, refresh, toast } = useStore();
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState(() => shopDay(0)); // the shop's date (server), not this computer's clock
  const [lines, setLines] = useState([]);
  const [openId, setOpenId] = useState(''); // the line whose serial box is expanded
  const [discount, setDiscount] = useState('');
  const [pays, setPays] = useState(() => defaultPay(''));
  const [payPrevious, setPayPrevious] = useState(false);
  const [previousPays, setPreviousPays] = useState(() => defaultPay(''));
  const canPayPrevious = useStore((st) => st.can('suppliers') && st.apiCapabilities?.purchaseDuePayment === true);
  const [note, setNote] = useState('');
  const [supInv, setSupInv] = useState(''); // the supplier's own invoice / bill number
  const [confirmDlg, ask] = useConfirm();
  const [tried, setTried] = useState(false);
  const [needSupplier, setNeedSupplier] = useState(false);
  const [busy, run] = useAction();
  const saving = useRef(false);
  const supplierRef = useRef();
  const tableRef = useRef();
  const pmap = Object.fromEntries(products.map((p) => [p.id, p]));
  const isSerial = (p) => !!p && !p.service && p.has_warranty && p.warranty_type === 'serial';
  const sup = suppliers.find((x) => x.id === supplier);
  const canCost = useStore((st) => st.can('cost'));
  const [lastBuy, setLastBuy] = useState({}); // product_id -> last purchase { cost, date, supplier, invoice_no } | null
  const loadLastBuy = (id) => {
    if (lastBuy[id] !== undefined) return;
    api('product.history', { product_id: id }).then((h) => {
      const lp = h.last_purchase || null;
      setLastBuy((m) => ({ ...m, [id]: lp }));
      // start from the price paid last time, unless the cost was already typed
      if (lp && lp.cost > 0) setLines((ls) => ls.map((l) => (l.product_id === id && !l.costTyped ? { ...l, cost: lp.cost } : l)));
    }).catch(() => setLastBuy((m) => ({ ...m, [id]: null })));
  };

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
    loadLastBuy(p.id);
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

  const sub = round2(lines.reduce((a, l) => a + round2((Number(l.qty) || 0) * (Number(l.cost) || 0)), 0));
  const total = round2(Math.max(sub - (Number(discount) || 0), 0));
  const paid = round2(cleanPays(pays).reduce((a, p) => a + p.amount, 0));
  const due = round2(Math.max(total - paid, 0));
  const prev = Number(sup?.balance) || 0; // > 0: you owe the supplier, < 0: supplier owes you (advance)
  useEffect(() => {
    if (!sup || prev <= 0.004 || !canPayPrevious) { setPayPrevious(false); setPreviousPays(defaultPay('')); }
  }, [supplier, prev, canPayPrevious]);
  const previousPayments = cleanPays(previousPays).map((p) => ({...p, amount: round2(p.amount)})).filter((p) => p.amount > 0);
  const previousPaid = payPrevious && canPayPrevious && prev > 0.004 ? round2(previousPayments.reduce((a, p) => a + p.amount, 0)) : 0;
  const after = round2(prev + total - paid - previousPaid);

  const bad = (l) => ({
    cost: !Number.isFinite(Number(l.cost)) || !(Number(l.cost) > 0) || Math.abs(Number(l.cost)-Math.round(Number(l.cost)*10000)/10000)>Number.EPSILON*Math.max(1,Math.abs(Number(l.cost)))*4 || Math.round(Number(l.cost)*10000)<=0,
    sale: !(Number(l.sale) > 0) && !(Number(pmap[l.product_id]?.sale_price) > 0),
    qty: !(Number(l.qty) > 0)
  });
  const firstBad = lines.find((l) => Object.values(bad(l)).some(Boolean));

  const save = async () => {
    if (saving.current) return;
    setTried(true);
    if (!supplier) { setNeedSupplier(true); supplierRef.current?.focus(); return toast('Select a supplier first', 'err'); }
    if (firstBad) {
      const p = pmap[firstBad.product_id], b = bad(firstBad);
      if (b.cost) return toast(`Enter a positive unit cost for ${p.name}, with at most 4 decimal places (minimum 0.0001).`, 'err');
      if (isSerial(p) && b.qty) setOpenId(p.id);
      return toast(b.qty ? (isSerial(p) ? `Scan the serial numbers for ${p.name}` : `Enter the quantity for ${p.name}`) : `Enter the unit cost and retail price for ${p.name}`, 'err');
    }
    if (paid > total + 0.004) return toast(`Paid (${money(paid, false)}) is more than the purchase total (${money(total, false)})`, 'err');
    if (payPrevious && canPayPrevious && prev > 0.004) {
      if (previousPays.some((p) => !Number.isFinite(Number(p.amount)) || Number(p.amount) < 0)) return toast('Enter a valid previous due payment amount', 'err');
      if (previousPaid > Math.max(prev, 0) + 0.004) return toast('Previous due payment cannot exceed the previous due. Refresh the supplier balance if needed.', 'err');
    }
    const payload = {
      ...(previousPaid > 0 ? {previous_due_payments: previousPayments, expected_previous_due: prev} : {}),
      supplier_id: supplier, date, discount: Number(discount) || 0, note, supplier_invoice: supInv.trim(), payments: cleanPays(pays),
      items: lines.map((l) => ({ product_id: l.product_id, qty: Number(l.qty), cost: Number(l.cost), sale_price: l.sale === '' ? '' : Number(l.sale), wholesale_price: l.whole === '' ? '' : Number(l.whole), serials: l.serials.join('\n'), supplier_warranty_expiry:l.supplier_warranty_expiry || '' }))
    };
    saving.current = true;
    try {
      await run(async () => {
        try { return await api('purchase.create', payload); }
        catch (e) {
          // the same supplier invoice was entered before: probably a double entry — ask first
          if (!/^DUPLICATE_SUPPLIER_INVOICE:/.test(e.message)) throw e;
          const yes = await ask({ title: 'Supplier invoice already entered', message: `${e.message.replace(/^DUPLICATE_SUPPLIER_INVOICE:\s*/, '')} Save this purchase anyway?`, confirmLabel: 'Save anyway', cancelLabel: 'Go back' });
          if (!yes) { const stop = new Error('Not saved'); stop.quiet = true; throw stop; }
          return api('purchase.create', { ...payload, allow_duplicate_invoice: true });
        }
      }, due > 0 ? `Purchase saved — ${money(due)} added to ${sup.name}'s payable` : 'Purchase saved — stock updated');
      // Once committed, leave the form even if the following list refresh fails.
      // Keeping it editable would invite a second purchase after a successful save.
      onDone();
      await refresh('products', 'suppliers').catch(() => toast('Purchase saved. Reload the page to refresh stock and supplier balances.', 'err'));
    } finally { saving.current = false; }
  };
  const blockSearch = () => { setNeedSupplier(true); supplierRef.current?.focus(); };

  return (
    <div className="split">
      <div className="grid">
        {supplier
          ? <ProductSearch camera onPick={add} noServices placeholder="Scan or search the product you received" />
          : <div className="psearch camera-field">
              <input readOnly value="" placeholder="Select a supplier first, then search products" onFocus={blockSearch} onMouseDown={blockSearch} aria-label="Search product (select a supplier first)" className={needSupplier ? 'invalid' : ''} />
              <CameraScanButton disabled onScan={()=>{}} label="Select a supplier before scanning a product"/>
              {needSupplier && <div className="pur-warn" role="alert">Please select the supplier on the right before adding products.</div>}
            </div>}
        <div className="dt"><div className="dt-scroll"><table className="pur-table" ref={tableRef}>
          <thead><tr><th>Product</th><th style={{ width: 90 }} className="r">Qty</th><th style={{ width: 110 }} className="r">Unit cost <span className="req">*</span></th><th style={{ width: 110 }} className="r">Retail price <span className="req">*</span></th><th style={{ width: 110 }} className="r">Wholesale</th><th className="r" style={{ width: 100 }}>Amount</th><th style={{ width: 34 }} /></tr></thead>
          {lines.map((l) => {
            const p = pmap[l.product_id], b = bad(l), serial = isSerial(p), open = serial && openId === l.product_id;
            return (
              <tbody key={l.product_id} data-line={l.product_id} className={`pur-line ${open ? 'open' : ''}`}>
                <tr onClick={() => serial && setOpenId(l.product_id)} className={serial ? 'clickable' : ''}>
                  <td className="pur-product"><b className="pur-product-name">{p?.name}</b>
                    {(() => {
                      const lp = lastBuy[l.product_id];
                      if (lp === undefined) return <div className="last-buy muted">Last purchase: …</div>;
                      if (!lp) return <div className="last-buy muted">First purchase of this product</div>;
                      return <div className="last-buy" title={lp.invoice_no}>
                        <div>Last purchase <b>{money(lp.cost)}</b>
                          {Number(l.cost) > 0 && Math.abs(Number(l.cost) - lp.cost) > 0.004 && <span className={Number(l.cost) > lp.cost ? 'chg up' : 'chg down'} title={Number(l.cost) > lp.cost ? 'Costlier than last time' : 'Cheaper than last time'}>{Number(l.cost) > lp.cost ? '▲' : '▼'}&nbsp;{money(Math.abs(Number(l.cost) - lp.cost), false)}</span>}
                        </div>
                        <small>{fdate(lp.date)}{lp.supplier ? ` · ${lp.supplier}` : ''} · {fqty(lp.qty, p?.unit)}</small>
                      </div>;
                    })()}
                    <div className="muted" style={{ fontSize: 12 }}>in stock {fqty(p?.stock, p?.unit)} · per {p?.unit}
                      {serial && !open && <> · <span className={l.serials.length ? 'sn-count' : 'sn-count bad'}>{l.serials.length ? `${l.serials.length} serial${l.serials.length === 1 ? '' : 's'} — click to edit` : 'serials missing'}</span></>}
                    </div>
                    <details className="supplier-warranty-input" onClick={e=>e.stopPropagation()}><summary>Supplier warranty {l.supplier_warranty_expiry ? `· ${fdate(l.supplier_warranty_expiry)}` : '(optional)'}</summary><label>Expiry date<input type="date" aria-label={`Supplier warranty expiry for ${p?.name}`} value={l.supplier_warranty_expiry || ''} onChange={e=>upd(l.product_id,{supplier_warranty_expiry:e.target.value})}/></label><small className="muted">Use the supplier's actual expiry. Leave blank if not known.</small></details>
                  </td>
                  <td data-label="Qty"><input type="number" min="0" step={isDecimalUnit(p?.unit) ? 'any' : 1} value={l.qty} readOnly={serial} title={serial ? 'Counted from the serial numbers' : undefined}
                    className={`${serial ? 'readonly-qty' : ''} ${tried && b.qty ? 'invalid' : ''}`} onChange={(e) => upd(l.product_id, { qty: e.target.value })} onWheel={noWheel} aria-label={`Quantity of ${p?.name}`} /></td>
                  <td data-label="Unit cost"><input type="number" min="0" step="any" value={l.cost} onChange={(e) => upd(l.product_id, { cost: e.target.value, costTyped: true })} aria-label={`Unit cost for ${p?.name}`} className={tried && b.cost ? 'invalid' : ''} />
                    {(() => {
                      // The product cost after this purchase: weighted average of the stock on hand and this purchase.
                      const st = Number(p?.stock) || 0, avg = Number(p?.cost_price) || 0, q = Number(l.qty) || 0, c = Number(l.cost) || 0;
                      if (!canCost || !(c > 0) || !(q > 0) || st <= 0 || Math.abs(c - avg) < 0.005) return null;
                      const next = (st * avg + q * c) / (st + q);
                      return <small className="avg-next" title={`Average cost after this purchase: (${fqty(st)} × ${money(avg, false)} + ${fqty(q)} × ${money(c, false)}) ÷ ${fqty(st + q)}`}>New avg <b>{money(Math.round(next * 100) / 100, false)}</b><span className="muted">now {money(avg, false)}</span></small>;
                    })()}
                  </td>
                  <td data-label="Retail price"><input type="number" min="0" step="any" value={l.sale} onChange={(e) => upd(l.product_id, { sale: e.target.value })} aria-label={`Retail price for ${p?.name}`} className={tried && b.sale ? 'invalid' : ''} placeholder="Retail" />
                    {Number(l.cost) > 0 && Number(l.sale) > 0 && <small className={Number(l.sale) < Number(l.cost) ? 'margin bad' : 'margin'}>{Math.round(((l.sale - l.cost) / l.cost) * 100)}% margin</small>}</td>
                  <td data-label="Wholesale"><input type="number" min="0" step="any" value={l.whole} onChange={(e) => upd(l.product_id, { whole: e.target.value })} aria-label={`Wholesale price for ${p?.name}`} placeholder="—" /></td>
                  <td className="r num" data-label="Amount">{money((Number(l.qty) || 0) * (Number(l.cost) || 0), false)}</td>
                  <td className="pur-remove"><button type="button" className="x" onClick={(e) => { e.stopPropagation(); remove(l.product_id); }} aria-label={`Remove ${p?.name}`}>×</button></td>
                </tr>
                {open && (
                  <tr className="sn-row"><td colSpan={7}>
                    <div className="sn-box">
                      <div className="sn-head"><b>Serial numbers</b><span className="muted">Scan with the barcode scanner, or type and press Enter. Quantity is counted automatically.</span><span className="sn-total">{l.serials.length} entered</span></div>
                      <div className="sn-chips">
                        {l.serials.map((sn) => (
                          <span className="sn-chip" key={sn}>{sn}<button type="button" onClick={() => dropSerial(l.product_id, sn)} aria-label={`Remove serial ${sn}`}>×</button></span>
                        ))}
                      </div>
                      <div className="sn-scan-row">
                        <CameraScanButton label={`Scan serial for ${p?.name} with camera`} title="Scan purchase serial" onScan={code=>addSerials(l.product_id, code)}/>
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
            <select ref={supplierRef} value={supplier} onChange={(e) => { setSupplier(e.target.value); setNeedSupplier(false); setPayPrevious(false); setPreviousPays(defaultPay('')); }} aria-label="Supplier" className={needSupplier && !supplier ? 'invalid' : ''}>
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
          {sup && prev > 0 && canPayPrevious && <div className="wide">
            <label className="check"><input type="checkbox" checked={payPrevious} onChange={(e) => { setPayPrevious(e.target.checked); setPreviousPays(defaultPay('')); }} /> Make due payment to the supplier</label>
            {payPrevious && <div className="previous-due-payment" style={{ marginTop: 10 }}>
              <PaymentSplit value={previousPays} onChange={setPreviousPays} total={prev} label="Pay previous due (optional)" />
              <p className="muted" style={{fontSize:12,marginTop:6}}>Saved with this purchase as a separate supplier payment. Leave blank to keep the previous due unchanged.</p>
            </div>}
          </div>}
          {sup && <div className="wide"><button type="button" className="link" onClick={() => refresh('suppliers').catch(() => toast('Could not refresh supplier balance', 'err'))}>Refresh supplier balance</button></div>}
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
            {previousPaid > 0 && <><span>Previous due payment</span><span className="num">{money(previousPaid, false)}</span><span>Previous due remaining</span><span className="num">{money(Math.max(prev - previousPaid, 0), false)}</span></>}
            <span><b>{after >= 0 ? 'Total payable to supplier' : 'Advance left with supplier'}</b></span><b className="num" style={{ color: after > 0 ? 'var(--bad)' : 'var(--ok)' }}>{money(Math.abs(after))}</b>
          </>}
        </div>
        <Field label="Supplier invoice no." wide hint="The number printed on the supplier's bill — search for it later in Purchases or Advance Search."><input value={supInv} maxLength={60} onChange={(e) => setSupInv(e.target.value)} placeholder="e.g. INV-2026-0457" /></Field>
        <Field label="Note" wide><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to remember about this purchase" /></Field>
        {confirmDlg}
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
  const [warranty, setWarranty] = useState(null);
  const p = data?.purchase;
  return (
    <Modal open onClose={onClose} size="lg" title={p ? `Purchase ${p.invoice_no}` : 'Purchase'}
      footer={p && <>
        <div className="seg">
          <button onClick={() => excelPurchases([data], `purchase-${p.invoice_no}.xlsx`)}>Excel</button>
          <button onClick={() => pdfPurchases([data], `purchase-${p.invoice_no}.pdf`)}>PDF</button>
          <button onClick={() => printPurchases([data])}>Print</button>
        </div>
        {p.status === 'active' && <Link className="btn btn-ghost" to={`/barcodes?purchase=${p.id}`}>Print barcode labels</Link>}
        <span className="spacer" />
        {p.status === 'active' && <>{can('cancel') && <Btn kind="danger" onClick={() => setRev(true)}>Cancel purchase</Btn>}<Btn onClick={() => setRet(true)}>Return to supplier</Btn></>}
      </>}>
      {loading && <Loading />}<ErrorBox error={error} onRetry={reload} />
      {p && <>
        {p.status === 'cancelled' && <div className="errbox">Cancelled — {p.cancel_reason}</div>}
        <div className="kv">
          <div><span>Date</span><b>{fdate(p.date)}</b></div><div><span>Supplier</span><b>{p.supplier_name || '—'}</b></div>
          <div><span>Supplier invoice</span><b>{p.supplier_invoice || '—'}</b></div>
          {p.note && <div><span>Note</span><b>{p.note}</b></div>}
          <div><span>Total</span><b>{money(p.total)}</b></div><div><span>Paid</span><b>{money(p.paid)}</b></div><div><span>Due at purchase</span><b>{money(p.due)}</b></div><div><span>Due now</span><b>{money(p.due_now ?? p.due)}</b></div>
          <div><span>Entered by</span><b>{p.user}</b></div>
          {data.supplier && <div><span>Supplier phone</span><b>{splitList(data.supplier.phones || '').join(', ') || '—'}</b></div>}
          {data.supplier?.address && <div><span>Supplier address</span><b>{data.supplier.address}</b></div>}
        </div>
        <div className="dt" style={{ marginTop: 14 }}><div className="dt-scroll"><table>
          <thead><tr><th>Item</th><th>Unit</th><th>Serial numbers</th><th className="r">Qty</th><th className="r">Purchase price</th><th className="r">Amount</th></tr></thead>
          <tbody>{data.items.map((i) => <tr key={i.id}><td><b>{i.name}</b>{i.description && <div className="muted" style={{ fontSize: 12 }}>{i.description}</div>}<div className="muted" style={{fontSize:12}}>Supplier warranty: {i.supplier_warranty_expiry ? fdate(i.supplier_warranty_expiry) : 'Not set'}</div>{p.status==='active' && can('purchase') && <button className="link" onClick={()=>setWarranty(i)}>Set supplier warranty</button>}</td><td>{i.unit}</td>
            <td>{splitList(String(i.serials || '').replace(/\n/g, ',')).map((x) => <span key={x} className="sn-chip ro">{x}</span>)}</td>
            <td className="r num">{fqty(i.qty, i.unit)}</td><td className="r num">{money(i.cost, false)}</td><td className="r num">{money(i.total, false)}</td></tr>)}</tbody>
        </table></div></div>
        {data.returns.length > 0 && <p className="muted">Returns: {data.returns.map((r) => `${r.return_no} (${money(r.total, false)}, ${r.status})`).join(', ')}</p>}
      </>}
      {ret && <PReturnForm detail={data} onClose={() => setRet(false)} onDone={() => { setRet(false); reload(); onChanged(); }} />}
      {warranty && <SupplierWarrantyForm item={warranty} onClose={()=>setWarranty(null)} onDone={()=>{setWarranty(null);reload();onChanged();}}/>}
      <ReverseDialog open={rev} type="purchase" id={p?.id} label={`purchase ${p?.invoice_no}`} onClose={() => setRev(false)} onDone={() => { reload(); onChanged(); }} />
    </Modal>
  );
}

function SupplierWarrantyForm({item,onClose,onDone}) {
  const [expiry,setExpiry]=useState(item.supplier_warranty_expiry || '');
  const [busy,run]=useAction();
  const save=async()=>{await run(()=>api('purchase.warranty',{item_id:item.id,expiry}),'Supplier warranty updated');onDone();};
  return <Modal open title="Supplier warranty expiry" size="sm" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>Save warranty date</Btn></>}><p>{item.name}</p><Field label="Supplier warranty expiry" hint="Leave empty if unknown. This changes the warranty date only; purchase quantity, cost and payments stay unchanged."><input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></Field></Modal>;
}

function PReturnForm({ detail, onClose, onDone }) {
  const { accounts, refresh } = useStore();
  const { purchase, items } = detail;
  const [lines, setLines] = useState(items.map((i) => ({ id: i.id, qty: '', serials: [] })));
  const [mode, setMode] = useState(purchase.supplier_id ? 'adjust' : 'cash');
  const [acc, setAcc] = useState(accounts[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [busy, run] = useAction();
  const value = returnValue(purchase, items, lines);
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
    <Modal open onClose={onClose} size="lg" title={`Return to supplier — ${purchase.invoice_no}`} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!lines.some(l => Number(l.qty) > 0)} onClick={save}>Record return</Btn></>}>
      <div className="dt"><div className="dt-scroll"><table>
        <thead><tr><th>Item</th><th className="r">Bought</th><th style={{ width: 110 }} className="r">Return qty</th><th>Serials</th></tr></thead>
        <tbody>{items.map((it, i) => (
          <tr key={it.id}><td>{it.name}</td><td className="r num">{fqty(it.qty, it.unit)}</td>
            <td><input type="number" min="0" max={Math.max(0, it.qty - (it.returned_qty || 0))} step="any" value={lines[i].qty} onChange={(e) => set(i, { qty: e.target.value })} onWheel={noWheel} /></td>
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
