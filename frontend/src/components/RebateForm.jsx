import { useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, fdate, today } from '../lib/format';
import { Modal, Btn, Field, Tabs, useApi, useAction } from './ui';
import DateInput from './DateInput';

/**
 * Supplier rebate: a discount the supplier gives after the purchase. It lowers what we owe and moves no money
 * (no account is asked for). "Promised" only keeps a reminder until the rebate is really given.
 * `types` lets the person switch back to an ordinary payment; `pending` pre-fills a promised rebate being received.
 */
export default function RebateForm({ supplierId, name, balance, types, onType, pending, onClose, onDone }) {
  const refresh = useStore((s) => s.refresh);
  const opts = useApi('rebate.options', { supplier_id: supplierId }, [supplierId]);
  const [mode, setMode] = useState('received');
  const [f, setF] = useState({ kind: pending?.kind || 'invoice', amount: pending?.amount || '', purchase_id: pending?.purchase_id || '', note: pending?.note || '', date: today(), expected: '' });
  const [busy, run] = useAction();
  const amount = Number(f.amount), bad = !Number.isFinite(amount) || amount <= 0, noReason = f.note.trim().length < 3;
  const owe = Number(balance || 0), after = Math.round((owe - (bad ? 0 : amount)) * 100) / 100;
  const side = (v) => (v > 0.004 ? `${money(v)} · we owe` : v < -0.004 ? `${money(-v)} · our advance` : money(0));
  const promised = mode === 'promised' && !pending;
  const save = async () => {
    const base = { supplier_id: supplierId, kind: f.kind, amount, purchase_id: f.purchase_id, note: f.note.trim() };
    if (promised) await run(() => api('rebate.promise', { ...base, expected: f.expected }), 'Promised rebate noted');
    else await run(() => api('supplier.rebate', { ...base, date: f.date, pending_id: pending?.id }), `Rebate of ${money(amount)} recorded`);
    refresh('suppliers'); onDone(); onClose();
  };
  const kinds = opts.data?.kinds || { invoice: 'Invoice rebate', target: 'Target bonus', price: 'Price protection', cash: 'Cash payment discount', other: 'Other rebate' };
  return (
    <Modal open onClose={onClose} size="sm" title={`${pending ? 'Receive promised rebate' : 'Supplier rebate'} — ${name}`}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={bad || noReason} onClick={save}>{promised ? 'Save as promised' : 'Save rebate'}</Btn></>}>
      <div className="form">
        {types && <Field label="Type" wide><select value="rebate" onChange={(e) => onType(e.target.value)}>{types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>}
        {!pending && <div className="field wide"><span className="field-label">Has the supplier given it?</span><Tabs tabs={[['received', 'Yes — received now'], ['promised', 'Not yet — only promised']]} value={mode} onChange={setMode} /></div>}
        <Field label="Kind of rebate"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(kinds).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Rebate amount"><input type="number" step="any" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus /></Field>
        <Field label="For which purchase (optional)" wide hint="Choose the invoice the rebate is for, so it shows on that purchase.">
          <select value={f.purchase_id} onChange={(e) => setF({ ...f, purchase_id: e.target.value })}>
            <option value="">Not for one invoice</option>
            {(opts.data?.purchases || []).map((p) => <option key={p.id} value={p.id}>{p.invoice_no}{p.supplier_invoice ? ` (${p.supplier_invoice})` : ''} · {fdate(p.date)} · {money(p.total)}{p.rebated ? ` · rebate so far ${money(p.rebated)}` : ''}</option>)}
          </select>
        </Field>
        {promised
          ? <Field label="Expected by (optional)" wide><DateInput value={f.expected} min={today()} onChange={(e) => setF({ ...f, expected: e.target.value })} /></Field>
          : <Field label="Date received" wide><DateInput value={f.date} max={today()} required onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>}
        <Field label="Reason" wide hint="Required — for example the offer or the supplier's credit note number."><input value={f.note} maxLength={200} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. 2% rebate on October purchases, credit note CN-118" /></Field>
        {promised
          ? <p className="rb-note wide">Nothing changes in the books yet. The promise is listed on this supplier and in the rebate report until you mark it received or drop it.</p>
          : <>
            <div className="rb-preview wide" aria-label="Balance after the rebate">
              <span>Balance now</span><b>{side(owe)}</b>
              <span>Rebate</span><b className="ok">− {money(bad ? 0 : amount)}</b>
              <span>Balance after</span><b>{side(after)}</b>
            </div>
            <p className="rb-note wide">No account is asked for: Cash, bank and MFS balances do not change. The rebate shows as <b>Supplier rebates</b> in the profit report.</p>
          </>}
      </div>
    </Modal>
  );
}
