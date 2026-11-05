import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, qty as fqty, round2 } from '../lib/format';
import { Modal, Btn, Field, useAction } from './ui';

/* ------------------------------------------------------------------
 * Product search box with barcode support.
 * Typing a barcode / SKU and pressing Enter adds it straight away.
 * ---------------------------------------------------------------- */
export function ProductSearch({ onPick, inStockOnly = false, autoFocus, placeholder = 'Scan barcode or search product (F2)', inputRef }) {
  const products = useStore((s) => s.products);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const localRef = useRef();
  const ref = inputRef || localRef;

  const list = useMemo(() => {
    if (!q.trim()) return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return products
      .filter((p) => p.active && (!inStockOnly || p.stock > 0))
      .filter((p) => { const hay = `${p.name} ${p.sku} ${p.barcode}`.toLowerCase(); return words.every((w) => hay.includes(w)); })
      .slice(0, 12);
  }, [q, products, inStockOnly]);

  const pick = (p) => { onPick(p); setQ(''); setHi(0); ref.current?.focus(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const code = q.trim().toLowerCase();
      const exact = products.find((p) => p.active && ((p.barcode && p.barcode.toLowerCase() === code) || (p.sku && p.sku.toLowerCase() === code)));
      if (exact) pick(exact); else if (list[hi]) pick(list[hi]);
    } else if (e.key === 'Escape') setQ('');
  };

  return (
    <div className="psearch">
      <input ref={ref} value={q} autoFocus={autoFocus} onChange={(e) => { setQ(e.target.value); setHi(0); }} onKeyDown={onKey}
        placeholder={placeholder} aria-label="Search product" role="combobox" aria-expanded={list.length > 0} />
      {list.length > 0 && (
        <ul className="psearch-list" role="listbox">
          {list.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === hi} className={i === hi ? 'hi' : ''} onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseEnter={() => setHi(i)}>
              <span className="pn">{p.name}<small>{[p.sku, p.barcode].filter(Boolean).join(' / ')}</small></span>
              <span className={`ps ${p.stock <= 0 ? 'out' : ''}`}>{fqty(p.stock, p.unit)}</span>
              <span className="pp">{money(p.sale_price, false)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
 * Split payment input: several accounts (Cash + bKash + Bank…)
 * value = [{account_id, amount}]
 * ---------------------------------------------------------------- */
export function PaymentSplit({ value, onChange, total, label = 'Payment', allowZero = true }) {
  const accounts = useStore((s) => s.accounts).filter((a) => a.active !== false);
  const set = (i, patch) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const paid = value.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const rest = round2((total || 0) - paid);
  return (
    <div className="paysplit">
      <div className="paysplit-head"><span>{label}</span>
        {total !== undefined && rest > 0.004 && <button type="button" className="link" onClick={() => {
          const i = value.length - 1;
          if (i >= 0) set(i, { amount: round2((Number(value[i].amount) || 0) + rest) });
        }}>Fill remaining {money(rest, false)}</button>}
      </div>
      {value.map((p, i) => (
        <div className="paysplit-row" key={i}>
          <select value={p.account_id} onChange={(e) => set(i, { account_id: e.target.value })} aria-label="Account">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input type="number" inputMode="decimal" min="0" step="any" value={p.amount} onChange={(e) => set(i, { amount: e.target.value })} aria-label="Amount" />
          {value.length > (allowZero ? 0 : 1) && <button type="button" className="x" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove payment line">×</button>}
        </div>
      ))}
      {accounts.length > 0 && <button type="button" className="link" onClick={() => onChange([...value, { account_id: accounts.find((a) => !value.some((v) => v.account_id === a.id))?.id || accounts[0].id, amount: '' }])}>+ Add another method</button>}
    </div>
  );
}
export const defaultPay = (amount = '') => {
  const acc = useStore.getState().accounts;
  const cash = acc.find((a) => a.type === 'cash') || acc[0];
  return cash ? [{ account_id: cash.id, amount }] : [];
};
export const cleanPays = (arr) => arr.map((p) => ({ account_id: p.account_id, amount: Number(p.amount) || 0 })).filter((p) => p.amount > 0);

/* ------------------------------------------------------------------
 * Admin-authorised reversal dialog
 * ---------------------------------------------------------------- */
export function ReverseDialog({ open, onClose, type, id, label, onDone }) {
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [busy, run] = useAction();
  const refresh = useStore((s) => s.refresh);
  const user = useStore((s) => s.user);
  useEffect(() => { if (open) { setReason(''); setPassword(''); } }, [open]);
  const submit = async (e) => {
    e?.preventDefault();
    await run(() => api('reverse', { type, id, reason, password }), `${label} cancelled — stock, balances and ledgers restored`);
    await refresh('all');
    onDone?.(); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={`Cancel ${label}`} size="sm"
      footer={<><Btn onClick={onClose}>Keep it</Btn><Btn kind="danger" busy={busy} onClick={submit} disabled={!reason.trim() || !password}>Cancel {label}</Btn></>}>
      <form onSubmit={submit} className="form">
        <p className="muted">This reverses the transaction completely: stock levels, account balances and customer / supplier ledgers go back to how they were. The record stays in history, marked cancelled.</p>
        <Field label="Reason" wide><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong item entered" required /></Field>
        <Field label={user?.role === 'admin' ? 'Your password' : 'Admin password'} wide hint="Required to authorise the cancellation."><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------
 * Quick add customer (used at POS)
 * ---------------------------------------------------------------- */
export function QuickCustomer({ open, onClose, onCreated, initial = '' }) {
  const [f, setF] = useState({ name: '', phone: '', address: '' });
  const [busy, run] = useAction();
  const setStore = useStore.setState;
  useEffect(() => {
    if (open) setF({ name: /\d{5,}/.test(initial) ? '' : initial, phone: /\d{5,}/.test(initial) ? initial : '', address: '' });
  }, [open, initial]);
  const submit = async (e) => {
    e?.preventDefault();
    const c = await run(() => api('customer.quickAdd', f), 'Customer added');
    setStore((s) => ({ customers: [...s.customers, c] }));
    onCreated(c); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Add customer" size="sm"
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={submit}>Add customer</Btn></>}>
      <form className="form" onSubmit={submit}>
        <Field label="Name" wide><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="Phone" wide><input value={f.phone} inputMode="tel" onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="01XXXXXXXXX" required /></Field>
        <Field label="Address" wide><input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------
 * Customer picker (search by name / phone)
 * ---------------------------------------------------------------- */
export function CustomerPicker({ value, onChange, onAddNew }) {
  const customers = useStore((s) => s.customers);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const sel = customers.find((c) => c.id === value);
  const list = useMemo(() => {
    const ql = q.toLowerCase();
    return customers.filter((c) => !ql || `${c.name} ${c.phones}`.toLowerCase().includes(ql)).slice(0, 10);
  }, [q, customers]);
  if (sel) {
    return (
      <div className="cust-sel">
        <div><b>{sel.name}</b><small>{sel.phones}</small></div>
        {sel.balance > 0 && <span className="badge badge-warn">Due {money(sel.balance, false)}</span>}
        {sel.balance < 0 && <span className="badge badge-ok">Advance {money(-sel.balance, false)}</span>}
        <button className="x" onClick={() => onChange('')} aria-label="Remove customer">×</button>
      </div>
    );
  }
  return (
    <div className="psearch">
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Walk-in customer — search name or phone (F4)" aria-label="Customer" id="pos-customer" />
      {open && (
        <ul className="psearch-list">
          {list.map((c) => (
            <li key={c.id} onMouseDown={(e) => { e.preventDefault(); onChange(c.id); setQ(''); setOpen(false); }}>
              <span className="pn">{c.name}<small>{c.phones}</small></span>
              <span className="ps">{c.balance ? money(c.balance, false) : ''}</span>
            </li>
          ))}
          <li className="add" onMouseDown={(e) => { e.preventDefault(); onAddNew(q); setOpen(false); }}>+ Add new customer{q ? ` “${q}”` : ''}</li>
        </ul>
      )}
    </div>
  );
}

/* Serial chooser: shows a checkbox grid of serials in stock for a product */
export function SerialChooser({ productId, value, onChange, max }) {
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    let live = true;
    api('serials.list', { product_id: productId, status: 'in_stock' })
      .then((r) => live && setList(r.map((x) => x.serial)))
      .catch(() => live && setList([]));
    return () => { live = false; };
  }, [productId]);
  if (!list) return <span className="muted">Loading serials…</span>;
  const shown = list.filter((s) => !q || s.toLowerCase().includes(q.toLowerCase()));
  const toggle = (s) => onChange(value.includes(s) ? value.filter((x) => x !== s) : max && value.length >= max ? value : [...value, s]);
  return (
    <div className="serials">
      <input placeholder="Scan / type serial and press Enter" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const hit = list.find((s) => s.toLowerCase() === q.trim().toLowerCase()); if (hit && !value.includes(hit)) toggle(hit); setQ(''); } }} />
      <div className="serial-grid">
        {shown.map((s) => <button type="button" key={s} className={value.includes(s) ? 'on' : ''} onClick={() => toggle(s)}>{s}</button>)}
        {!list.length && <span className="muted">No serials in stock for this product.</span>}
      </div>
    </div>
  );
}
