import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, qty as fqty, round2 } from '../lib/format';
import { printReceipt } from '../lib/receipt';
import { Btn, Modal, Field, Tabs, useAction, useHotkeys } from '../components/ui';
import { ProductSearch, PaymentSplit, defaultPay, cleanPays, QuickCustomer, CustomerPicker, SerialChooser } from '../components/widgets';

const DRAFT = 'erp_pos_draft';
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT)) || null; } catch { return null; } };

export default function POS() {
  const { products, customers, warrantyPeriods, settings, refresh, toast } = useStore();
  const draft = loadDraft();
  const [cart, setCart] = useState(draft?.cart || []);
  const [customerId, setCustomerId] = useState(draft?.customerId || '');
  const [discount, setDiscount] = useState(draft?.discount || '');
  const [pays, setPaysRaw] = useState(defaultPay());
  const [payTouched, setPayTouched] = useState(false);
  const setPays = (v) => { setPayTouched(true); setPaysRaw(v); };
  const [useCredit, setUseCredit] = useState(false);
  const [tier, setTier] = useState('retail');
  const [note, setNote] = useState('');
  const [sendSms, setSendSms] = useState(true);
  const [serialFor, setSerialFor] = useState(null);
  const [quick, setQuick] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, run] = useAction();
  const searchRef = useRef();
  const discRef = useRef();

  useEffect(() => { try { localStorage.setItem(DRAFT, JSON.stringify({ cart, customerId, discount })); } catch {} }, [cart, customerId, discount]);

  const pmap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const customer = customers.find((c) => c.id === customerId);
  const isSerial = (p) => p.has_warranty && p.warranty_type === 'serial';
  const priceFor = (p) => (tier === 'wholesale' && p.wholesale_price ? p.wholesale_price : p.sale_price);

  const add = (p) => {
    if (p.stock <= 0) return toast(`${p.name} is out of stock`, 'err');
    const i = cart.findIndex((l) => l.product_id === p.id);
    if (i >= 0) {
      setCart(cart.map((l, j) => (j === i ? { ...l, qty: round2(Number(l.qty) + 1) } : l)));
      if (isSerial(p)) setSerialFor(i);
      return;
    }
    setCart([...cart, { product_id: p.id, qty: 1, price: priceFor(p), serials: [], warranty_days: p.has_warranty ? p.warranty_days : '' }]);
    if (isSerial(p)) setSerialFor(cart.length);
  };
  const upd = (i, patch) => setCart((c) => c.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const del = (i) => setCart((c) => c.filter((_, j) => j !== i));

  const subtotal = round2(cart.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0));
  const disc = Math.min(Number(discount) || 0, subtotal);
  const total = round2(subtotal - disc);
  const advance = customer && customer.balance < 0 ? -customer.balance : 0;
  const credit = useCredit ? Math.min(advance, total) : 0;
  const paid = round2(cleanPays(pays).reduce((a, p) => a + p.amount, 0) + credit);
  const due = round2(total - paid);
  const change = paid > total ? round2(paid - total) : 0;

  // Until the cashier edits the payment, it follows the bill total (one cash line).
  useEffect(() => {
    if (!payTouched) setPaysRaw((p) => (p.length ? [{ ...p[0], amount: total - credit > 0 ? round2(total - credit) : '' }] : p));
  }, [total, credit, payTouched]);

  const problems = [];
  cart.forEach((l) => {
    const p = pmap[l.product_id];
    if (!p) return problems.push('A cart item no longer exists');
    if (isSerial(p) && l.serials.length !== Number(l.qty)) problems.push(`Pick ${l.qty} serial(s) for ${p.name}`);
    if (Number(l.qty) > p.stock) problems.push(`Only ${fqty(p.stock, p.unit)} of ${p.name} in stock`);
  });
  if (due > 0.004 && !customer) problems.push('Walk-in sales must be fully paid — attach a customer to sell on credit');

  const reset = () => { setCart([]); setCustomerId(''); setDiscount(''); setPaysRaw(defaultPay()); setPayTouched(false); setUseCredit(false); setNote(''); searchRef.current?.focus(); };

  const checkout = async (print) => {
    if (!cart.length || busy) return;
    if (problems.length) return toast(problems[0], 'err');
    // Collected more than the bill (cash change): only send what the invoice needs.
    let payList = cleanPays(pays);
    if (change > 0) {
      let excess = change;
      payList = [...payList].reverse().map((p) => { const cut = Math.min(p.amount, excess); excess = round2(excess - cut); return { ...p, amount: round2(p.amount - cut) }; }).reverse().filter((p) => p.amount > 0);
    }
    const res = await run(() => api('sale.create', {
      customer_id: customerId, discount: disc, note, send_sms: sendSms, credit_used: credit,
      items: cart.map((l) => ({ product_id: l.product_id, qty: Number(l.qty), price: Number(l.price), serials: l.serials, warranty_days: l.warranty_days })),
      payments: payList
    }));
    setDone({ ...res, change });
    if (print) printReceipt(res);
    reset();
    refresh('products', 'customers');
  };

  useHotkeys({
    F2: () => searchRef.current?.focus(),
    F4: () => document.getElementById('pos-customer')?.focus(),
    F8: () => discRef.current?.focus(),
    F9: () => checkout(false),
    F10: () => checkout(true),
    'mod+delete': () => cart.length && confirm('Clear the cart?') && reset()
  }, [cart, pays, customerId, discount, useCredit, note, sendSms, busy, tier]);

  return (
    <div className="pos">
      <div className="pos-left">
        <div className="row">
          <div style={{ flex: 1 }}><ProductSearch onPick={add} inputRef={searchRef} autoFocus /></div>
          <Tabs tabs={[['retail', 'Retail'], ['wholesale', 'Wholesale']]} value={tier} onChange={setTier} />
        </div>
        <div className="cart">
          <table>
            <thead><tr><th>Item</th><th style={{ width: 100 }} className="r">Qty</th><th style={{ width: 120 }} className="r">Price</th><th style={{ width: 110 }} className="r">Amount</th><th style={{ width: 30 }} /></tr></thead>
            <tbody>
              {cart.map((l, i) => {
                const p = pmap[l.product_id]; if (!p) return null;
                return (
                  <tr key={i}>
                    <td className="cn">
                      <b>{p.name}</b>
                      <small>{fqty(p.stock, p.unit)} in stock{p.unit !== 'pcs' ? ` · sold by ${p.unit}` : ''}</small>
                      {isSerial(p) && (l.serials.length === Number(l.qty)
                        ? <div><button className="serial-ok" onClick={() => setSerialFor(i)}>S/N: {l.serials.join(', ')}</button></div>
                        : <div><button className="serial-need" onClick={() => setSerialFor(i)}>Pick serial numbers ({l.serials.length}/{l.qty})</button></div>)}
                      {p.has_warranty && (
                        <div className="w">Warranty&nbsp;
                          <select value={l.warranty_days} onChange={(e) => upd(i, { warranty_days: e.target.value })} style={{ width: 'auto', minHeight: 24, padding: '0 4px', fontSize: 12 }} aria-label="Warranty period">
                            {[...new Set([Number(p.warranty_days), ...warrantyPeriods.map((w) => w.days), 0])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d ? `${d} days` : 'No warranty'}</option>)}
                          </select>
                          {p.warranty_type === 'invoice' && ' (invoice-based)'}
                        </div>
                      )}
                    </td>
                    <td><input type="number" min="0" step={p.unit === 'pcs' ? 1 : 0.5} value={l.qty} onChange={(e) => upd(i, { qty: e.target.value, serials: isSerial(p) ? l.serials.slice(0, Number(e.target.value)) : l.serials })} aria-label="Quantity" /></td>
                    <td><input type="number" min="0" step="any" value={l.price} onChange={(e) => upd(i, { price: e.target.value })} aria-label="Unit price" /></td>
                    <td className="r num"><b>{money((Number(l.qty) || 0) * (Number(l.price) || 0), false)}</b></td>
                    <td><button className="x" onClick={() => del(i)} aria-label={`Remove ${p.name}`}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!cart.length && <div className="empty"><b>Cart is empty</b><div>Scan a barcode or type a product name above. Cables sold by the meter accept decimal quantities.</div></div>}
        </div>
        <div className="keys">
          <span><kbd>F2</kbd> search</span><span><kbd>F4</kbd> customer</span><span><kbd>F8</kbd> discount</span>
          <span><kbd>F9</kbd> complete sale</span><span><kbd>F10</kbd> complete & print</span><span><kbd>Ctrl</kbd>+<kbd>Del</kbd> clear cart</span>
        </div>
      </div>

      <div className="pos-right">
        <div className="card">
          <CustomerPicker value={customerId} onChange={(id) => { setCustomerId(id); setUseCredit(false); }} onAddNew={(q) => setQuick(q)} />
          {customer && settings.sms_enabled === 'true' && (
            <label className="check" style={{ marginTop: 8, fontWeight: 500 }}><input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} /> Send SMS invoice to {customer.phones?.split(',')[0]}</label>
          )}
        </div>

        <div className="card">
          <div className="totals">
            <span>Subtotal</span><b className="num">{money(subtotal, false)}</b>
            <span>Discount</span><input ref={discRef} type="number" min="0" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" aria-label="Discount" />
            <span>Total</span><span className="grand">{money(total)}</span>
          </div>
        </div>

        <div className="card">
          <PaymentSplit value={pays} onChange={setPays} total={round2(total - credit)} label="Received" />
          {advance > 0 && (
            <label className="check" style={{ marginTop: 10, fontWeight: 500 }}>
              <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} /> Use customer advance ({money(advance)})
            </label>
          )}
          <div className="totals" style={{ marginTop: 12 }}>
            <span>Paid</span><b className="num">{money(paid, false)}</b>
            {due > 0.004 && <><span>Due (added to customer ledger)</span><span className="due num">{money(due)}</span></>}
            {change > 0 && <><span>Change to return</span><span className="change num">{money(change)}</span></>}
          </div>
          <Field label="Note" wide><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></Field>
        </div>

        {problems.length > 0 && cart.length > 0 && <div className="note" style={{ borderColor: 'var(--warn)' }}>{problems[0]}</div>}
        <div className="row">
          <Btn kind="primary" size="lg" style={{ flex: 1 }} busy={busy} disabled={!cart.length} onClick={() => checkout(true)}>Complete & print</Btn>
          <Btn size="lg" disabled={!cart.length || busy} onClick={() => checkout(false)}>Complete</Btn>
        </div>
        {cart.length > 0 && <button className="link" onClick={() => confirm('Clear the cart?') && reset()}>Clear cart</button>}
      </div>

      <Modal open={serialFor !== null} onClose={() => setSerialFor(null)} title={serialFor !== null && cart[serialFor] ? `Serial numbers — ${pmap[cart[serialFor].product_id]?.name}` : ''}
        footer={<Btn kind="primary" onClick={() => setSerialFor(null)}>Done</Btn>}>
        {serialFor !== null && cart[serialFor] && (
          <>
            <p className="muted">Select {cart[serialFor].qty} serial(s). Scan the barcode on the box and press Enter.</p>
            <SerialChooser productId={cart[serialFor].product_id} value={cart[serialFor].serials} max={Number(cart[serialFor].qty)}
              onChange={(v) => upd(serialFor, { serials: v })} />
          </>
        )}
      </Modal>

      <QuickCustomer open={quick !== null} initial={quick || ''} onClose={() => setQuick(null)} onCreated={(c) => setCustomerId(c.id)} />

      <Modal open={!!done} onClose={() => { setDone(null); searchRef.current?.focus(); }} title="Sale completed" size="sm"
        footer={<>
          <Btn onClick={() => printReceipt(done, 58)}>Print 58mm</Btn>
          <Btn onClick={() => printReceipt(done, 80)}>Print 80mm</Btn>
          <Btn kind="primary" onClick={() => { setDone(null); searchRef.current?.focus(); }}>Next sale</Btn>
        </>}>
        {done && (
          <div className="kv">
            <div><span>Invoice</span><b>{done.sale.invoice_no}</b></div>
            <div><span>Customer</span><b>{done.sale.customer_name}</b></div>
            <div><span>Total</span><b>{money(done.sale.total)}</b></div>
            <div><span>Due</span><b>{money(done.sale.due)}</b></div>
            {done.change > 0 && <div><span>Change to return</span><b style={{ color: 'var(--ok)' }}>{money(done.change)}</b></div>}
            {done.sms && <div><span>SMS</span><b style={{ color: done.sms.ok ? 'var(--ok)' : 'var(--bad)' }}>{done.sms.ok ? 'Sent' : 'Failed — check SMS settings'}</b></div>}
          </div>
        )}
      </Modal>
    </div>
  );
}
