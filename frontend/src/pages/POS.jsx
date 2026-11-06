import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, qty as fqty, round2, isDecimalUnit } from '../lib/format';
import { printReceipt, printInvoice } from '../lib/receipt';
import { Btn, Modal, Field, Tabs, useAction, useHotkeys, useConfirm } from '../components/ui';
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
  // Walk-in (cash) sale: payment follows the bill total. Customer sale: starts at 0 so anything not collected becomes due.
  const [payTouched, setPayTouched] = useState(!!draft?.customerId);
  const setPays = (v) => { setPayTouched(true); setPaysRaw(v); };
  const [useCredit, setUseCredit] = useState(false);
  const [tier, setTier] = useState('retail');
  const [note, setNote] = useState('');
  const [sendSms, setSendSms] = useState(false); // SMS to the customer is off unless switched on for this sale
  const [serialFor, setSerialFor] = useState(null);
  const [quick, setQuick] = useState(null);
  const [done, setDone] = useState(null);
  // Cost peek: tick "Cost" in the header, then Show / Hide per item. Screen only — never sent with the sale or printed.
  const canCost = useStore((st) => st.can('cost'));
  const [costOn, setCostOn] = useState(false);
  const [costShown, setCostShown] = useState({});
  const [busy, run] = useAction();
  const searchRef = useRef();
  const discRef = useRef();

  useEffect(() => { try { localStorage.setItem(DRAFT, JSON.stringify({ cart, customerId, discount })); } catch {} }, [cart, customerId, discount]);

  const pmap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const customer = customers.find((c) => c.id === customerId);
  const isSerial = (p) => !p.service && p.has_warranty && p.warranty_type === 'serial';
  const priceFor = (p) => (tier === 'wholesale' && p.wholesale_price ? p.wholesale_price : p.sale_price);

  const add = (p) => {
    if (!p.service && p.stock <= 0) return toast(`${p.name} is out of stock`, 'err');
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
    if (!p.service && Number(l.qty) > p.stock) problems.push(`Only ${fqty(p.stock, p.unit)} of ${p.name} in stock`);
  });
  if (due > 0.004 && !customer) problems.push('Cash sales must be fully paid — select a customer to sell on due');

  const selectCustomer = (id) => {
    setCustomerId(id); setUseCredit(false);
    if (id) { setPaysRaw(defaultPay('')); setPayTouched(true); refresh('customers'); }
    else setPayTouched(false); // back to a cash sale: auto-fill the full amount again
  };

  const [confirmUI, ask] = useConfirm();
  const reset = () => { setSendSms(false); setCart([]); setCustomerId(''); setDiscount(''); setPaysRaw(defaultPay()); setPayTouched(false); setUseCredit(false); setNote(''); searchRef.current?.focus(); };

  const gatewayOn = settings.sms_enabled === 'true';
  const phone = customer?.phones?.split(',')[0]?.trim() || '';
  const smsReady = gatewayOn && !!customer && !!phone;

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
      customer_id: customerId, discount: disc, note, send_sms: smsReady && sendSms, credit_used: credit,
      items: cart.map((l) => ({ product_id: l.product_id, qty: Number(l.qty), price: Number(l.price), serials: l.serials, warranty_days: l.warranty_days })),
      payments: payList
    }));
    setDone({ ...res, change });
    if (print) printInvoice(res);
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
            <thead><tr><th>Item</th>{canCost && <th style={{ width: 110 }} className="cost-col"><label className="cost-toggle"><input type="checkbox" checked={costOn} onChange={(e) => { setCostOn(e.target.checked); setCostShown({}); }} aria-label="Show cost column" /> Cost</label></th>}<th style={{ width: 100 }} className="r">Qty</th><th style={{ width: 120 }} className="r">Price</th><th style={{ width: 110 }} className="r">Amount</th><th style={{ width: 30 }} /></tr></thead>
            <tbody>
              {cart.map((l, i) => {
                const p = pmap[l.product_id]; if (!p) return null;
                return (
                  <tr key={i}>
                    <td className="cn">
                      <b>{p.name}</b>
                      <small>{p.service ? 'Service — no stock' : `${fqty(p.stock, p.unit)} in stock`}{p.unit !== 'pcs' ? ` · sold by ${p.unit}` : ''}</small>
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
                    {canCost && <td className="cost-col">{costOn && (costShown[p.id]
                      ? <span className="cost-peek"><b className={Number(l.price) < Number(p.cost_price) ? 'loss' : ''}>{p.cost_price > 0 ? money(p.cost_price, false) : 'No cost'}</b><button type="button" className="link" onClick={() => setCostShown({ ...costShown, [p.id]: false })}>Hide</button></span>
                      : <button type="button" className="link" onClick={() => setCostShown({ ...costShown, [p.id]: true })} aria-label={`Show cost of ${p.name}`}>Show</button>)}</td>}
                    <td><input type="number" min="0" step={isDecimalUnit(p.unit) ? 0.5 : 1} value={l.qty} onChange={(e) => upd(i, { qty: e.target.value, serials: isSerial(p) ? l.serials.slice(0, Number(e.target.value)) : l.serials })} aria-label="Quantity" /></td>
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
          <CustomerPicker value={customerId} onChange={selectCustomer} onAddNew={(q) => setQuick(q)} />
          {customer && (
            <div className="collect">
              <PaymentSplit value={pays} onChange={setPays} total={round2(total - credit)} label="Collected balance" />
              {advance > 0 && (
                <label className="check" style={{ marginTop: 8, fontWeight: 500 }}>
                  <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} /> Use customer advance ({money(advance)})
                </label>
              )}
              {(customer.balance > 0.004 || (total > 0 && due > 0.004)) && (
                <div className="prev-due" role="status">
                  {customer.balance > 0.004 && <div className="row"><span>Previous due</span><b>{money(customer.balance)}</b></div>}
                  {total > 0 && due > 0.004 && <div className="row"><span>Due on this sale</span><b>{money(due)}</b></div>}
                  {customer.balance > 0.004 && total > 0 && due > 0.004 && <div className="row total-due"><span>Total due</span><b>{money(customer.balance + due)}</b></div>}
                </div>
              )}
              {change > 0 && <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}><span>Change to return</span><b className="change num">{money(change)}</b></div>}
            </div>
          )}
        </div>

        <div className="card">
          <div className="totals">
            <span>Subtotal</span><input value={money(subtotal, false)} readOnly tabIndex={-1} className="readonly-num" aria-label="Subtotal (calculated)" />
            <span>Discount</span><input ref={discRef} type="number" min="0" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" aria-label="Discount" />
            <span>Total</span><span className="grand">{money(total)}</span>
          </div>
        </div>

        <div className="card">
          {!customer && <>
            <PaymentSplit value={pays} onChange={setPays} total={round2(total - credit)} label="Cash sale — received" />
            <div className="totals" style={{ marginTop: 12 }}>
              <span>Paid</span><b className="num">{money(paid, false)}</b>
              {due > 0.004 && <><span>Short by</span><span className="due num">{money(due)}</span></>}
              {change > 0 && <><span>Change to return</span><span className="change num">{money(change)}</span></>}
            </div>
          </>}
          <Field label="Note" wide><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></Field>
        </div>

        {problems.length > 0 && cart.length > 0 && <div className="note" style={{ borderColor: 'var(--warn)' }}>{problems[0]}</div>}
        <div className={`sms-toggle ${smsReady && sendSms ? 'on' : ''} ${smsReady ? '' : 'off'}`}>
          <div className="sms-text">
            <b>SMS to customer</b>
            <small>{!gatewayOn ? 'SMS gateway is off — turn it on in Settings → SMS gateway' : !customer ? 'Select a customer to send the invoice by SMS' : !phone ? 'This customer has no phone number' : sendSms ? `Invoice SMS will go to ${phone}` : 'No SMS will be sent for this sale'}</small>
          </div>
          <button type="button" role="switch" aria-checked={smsReady && sendSms} aria-label="Send SMS to customer" className="switch" disabled={!smsReady} onClick={() => setSendSms(!sendSms)}><span /></button>
        </div>
        <div className="row">
          <Btn kind="primary" size="lg" style={{ flex: 1 }} busy={busy} disabled={!cart.length} onClick={() => checkout(true)}>Complete & print</Btn>
          <Btn size="lg" disabled={!cart.length || busy} onClick={() => checkout(false)}>Complete</Btn>
        </div>
        <button type="button" className="btn clear-cart" disabled={!cart.length} onClick={async () => { if (await ask({ title: 'Clear the cart?', message: 'All items, the customer and payments on this screen will be removed.' })) reset(); }}>
          <span className="cc-ico"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg></span>
          <span>Clear cart</span><kbd>Ctrl + Del</kbd>
        </button>
        {confirmUI}
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

      <QuickCustomer open={quick !== null} initial={quick || ''} onClose={() => setQuick(null)} onCreated={(c) => selectCustomer(c.id)} />

      <Modal open={!!done} onClose={() => { setDone(null); searchRef.current?.focus(); }} title="Sale completed" size="sm"
        footer={<>
          <Btn kind="primary" onClick={() => printInvoice(done)}>Print invoice</Btn>
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
