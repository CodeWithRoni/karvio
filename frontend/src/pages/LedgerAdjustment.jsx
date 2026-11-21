import { roundDecimal } from '../lib/round';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, fdate, today } from '../lib/format';
import { Btn, Badge, ErrorBox, Field, Modal, PageHead, Tabs, useAction, useApi } from '../components/ui';
import { ReverseDialog } from '../components/widgets';
import DataTable from '../components/DataTable';
import DateInput from '../components/DateInput';
import PartyPicker from '../components/PartyPicker';

/**
 * Customer / Supplier Ledger Adjust (admin only): raise or lower what a customer owes or what we owe a supplier.
 * No money moves. Supplier deductions are rebates (received now, or only promised for later).
 */
const TXT = {
  customer: {
    title: 'Customer Ledger Adjust', who: 'Customer', invoice: 'Sale invoice', report: '/customer-ledger-report', prefix: 'CLA', rev: 'cadjust',
    sub: 'Raise or lower what a customer owes — write off a small leftover due, give a late discount or correct a mistake. No cash, bank or MFS money moves.',
    add: 'Customer owes more', ded: 'Write off / discount', owes: 'owes', adv: 'advance',
    effect: 'A deduction shows as Customer dues written off in the profit report. A Missed charge or Other addition counts as income there; a Correction only fixes the balance.'
  },
  supplier: {
    title: 'Supplier Ledger Adjust', who: 'Supplier', invoice: 'Purchase invoice', report: '/supplier-ledger-report', prefix: 'SLA', rev: 'sadjust',
    sub: 'Raise or lower what we owe a supplier — rebates, discounts and corrections. No cash, bank or MFS money moves.',
    add: 'We owe more', ded: 'Rebate / discount', owes: 'we owe', adv: 'advance paid',
    effect: 'A deduction shows as Supplier rebates in the profit report. A Missed charge or Other addition counts as a cost there; a Correction only fixes the balance.'
  }
};
const blank = (dir = 'ded') => ({ party_id: '', invoice_id: '', date: today(), ref: '', dir, type: '', promised: false, expected: '', amount: '', reason: '', pending_id: '' });
const r2 = (n) => roundDecimal(n, 2);

export default function LedgerAdjustment({ kind }) {
  const t = TXT[kind];
  const nav = useNavigate();
  const [params] = useSearchParams();
  const refresh = useStore((s) => s.refresh);
  const [f, setF] = useState(() => ({ ...blank(), party_id: params.get('party') || '' }));
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const opts = useApi('adjust.options', { kind, party_id: f.party_id }, [kind, f.party_id]);
  const list = useApi('adjust.list', { kind }, [kind]);
  const [busy, run] = useAction();
  const [rev, setRev] = useState(null);
  const [drop, setDrop] = useState(null);
  const top = useRef(null);
  const shownKind = useRef(kind);
  useEffect(() => { if (shownKind.current !== kind) { shownKind.current = kind; setF(blank()); } }, [kind]); // the other page reuses this one

  const types = opts.data?.types?.[f.dir] || {};
  useEffect(() => { if (!types[f.type]) { const first = Object.keys(types)[0]; if (first) set({ type: first }); } }, [f.dir, opts.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const bal = Number(opts.data?.balance) || 0;
  const inv = (opts.data?.invoices || []).find((i) => i.id === f.invoice_id);
  const amount = Number(f.amount), okAmount = Number.isFinite(amount) && amount > 0;
  const lower = f.dir === 'ded', sign = lower ? -1 : 1;
  const promised = kind === 'supplier' && lower && f.promised && !f.pending_id;
  const after = r2(bal + sign * (okAmount ? amount : 0)), invAfter = inv ? r2(Math.max(inv.due + sign * (okAmount ? amount : 0), 0)) : 0;
  const tooMuch = kind === 'customer' && lower && okAmount && (amount > bal + 0.005 || (inv && amount > inv.due + 0.005));
  const noReason = f.reason.trim().length < 3;
  const side = (v) => (v > 0.004 ? `${money(v)} · ${t.owes}` : v < -0.004 ? `${money(-v)} · ${t.adv}` : money(0));
  const canSave = f.party_id && f.type && okAmount && !noReason && !tooMuch && f.date;

  const clear = () => setF(blank(f.dir));
  const save = async () => {
    const r = await run(() => api('ledger.adjust', { kind, party_id: f.party_id, dir: f.dir, type: f.type, amount, reason: f.reason.trim(), invoice_id: f.invoice_id, date: f.date, ref: f.ref,
      promised: promised, expected: promised ? f.expected : '', pending_id: f.pending_id }),
    promised ? 'Promised rebate noted — nothing changes in the books yet' : null);
    if (!promised) useStore.getState().toast(`${r.ref_no} saved · ${t.who.toLowerCase()} balance now ${side(r.balance)}`);
    setF({ ...blank(f.dir), party_id: f.party_id });
    opts.reload(); list.reload(); refresh(kind === 'customer' ? 'customers' : 'suppliers');
  };
  const receive = (p) => {
    setF({ ...blank('ded'), party_id: p.supplier_id, invoice_id: p.purchase_id || '', type: p.kind, amount: String(p.amount), reason: p.note || '', ref: p.ref || '', pending_id: p.id });
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const pending = list.data?.pending || [];
  return (
    <>
      <div ref={top} />
      <PageHead title={t.title} sub={t.sub}><Btn onClick={() => nav(`${t.report}${f.party_id ? `?party=${f.party_id}` : ''}`)}>{t.who} Ledger Report</Btn></PageHead>
      <section className="card la-card" aria-label="General information">
        <h2 className="la-sec">General information <span className="muted">Fields marked <i className="req">*</i> are required</span></h2>
        {f.pending_id && <div className="la-banner">Receiving a promised rebate — saving books it and removes it from the promised list. <button className="link" onClick={clear}>Cancel</button></div>}
        <div className="la-top">
          <div className="la-dir" role="radiogroup" aria-label="Adjustment">
            {[['add', 'Addition', t.add], ['ded', 'Deduction', t.ded]].map(([v, l, h]) => (
              <label key={v} className={`${v} ${f.dir === v ? 'on' : ''} ${f.pending_id ? 'off' : ''}`}>
                <input type="radio" name="la-dir" value={v} checked={f.dir === v} disabled={!!f.pending_id} onChange={() => set({ dir: v, type: '', promised: false })} />
                <span><b>{l}</b><small>{h}</small></span>
              </label>
            ))}
          </div>
          {kind === 'supplier' && lower && !f.pending_id && (
            <Tabs tabs={[['now', 'Received now'], ['later', 'Only promised']]} value={f.promised ? 'later' : 'now'} onChange={(v) => set({ promised: v === 'later' })} />
          )}
        </div>
        <div className="la-grid">
          <Row label={t.who} req span={2}><PartyPicker kind={kind} value={f.party_id} onChange={(id) => set({ party_id: id, invoice_id: '', pending_id: '' })} extra={f.party_id && opts.data ? side(bal) : ''} label={t.who} /></Row>
          <Row label="Adjustment date" req><DateInput value={f.date} max={today()} required onChange={(e) => set({ date: e.target.value })} aria-label="Adjustment date" /></Row>
          <Row label={t.invoice} span={kind === 'supplier' ? 1 : 2}>
            <select value={f.invoice_id} onChange={(e) => set({ invoice_id: e.target.value })} disabled={!f.party_id} aria-label={t.invoice}>
              <option value="">Not for one invoice (optional)</option>
              {(opts.data?.invoices || []).map((i) => <option key={i.id} value={i.id}>{i.invoice_no}{i.supplier_invoice ? ` (${i.supplier_invoice})` : ''} · {fdate(i.date)} · total {money(i.total, false)} · due {money(i.due, false)}</option>)}
            </select>
          </Row>
          <Row label="Adjustment type" req>
            <select value={f.type} onChange={(e) => set({ type: e.target.value })} aria-label="Adjustment type">{Object.entries(types).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </Row>
          {kind === 'supplier' && <Row label="Reference no"><input value={f.ref} maxLength={60} onChange={(e) => set({ ref: e.target.value })} placeholder="Supplier's credit note / letter no" aria-label="Reference no" /></Row>}
          {promised && <Row label="Expected by"><DateInput value={f.expected} min={today()} onChange={(e) => set({ expected: e.target.value })} aria-label="Expected by" /></Row>}
        </div>
        <div className="la-bottom">
          <div className="la-ar">
            <Row label="Amount" req hint={tooMuch ? (inv && amount > inv.due + 0.005 ? `${inv.invoice_no} has only ${money(inv.due)} still due.` : `The customer owes only ${money(Math.max(bal, 0))}.`) : ''} error={!!tooMuch}>
              <input type="number" step="any" min="0" value={f.amount} onChange={(e) => set({ amount: e.target.value })} aria-label="Amount" placeholder="0" />
              {kind === 'customer' && lower && inv && inv.due > 0 && <div className="la-quick"><Btn size="sm" onClick={() => set({ amount: String(inv.due) })}>Whole invoice due · {money(inv.due, false)}</Btn></div>}
            </Row>
            <Row label="Reason" req><textarea rows={1} maxLength={200} value={f.reason} onChange={(e) => set({ reason: e.target.value })} placeholder={kind === 'customer' ? 'e.g. customer asked to leave the last 50' : 'e.g. Eid offer on the router lot'} aria-label="Reason" /></Row>
          </div>
          {f.party_id && opts.data ? (promised
            ? <p className="la-note la-promise">Nothing changes in the books yet. The promise is listed below and on the dashboard until you mark it received or drop it.</p>
            : (
              <div className={`la-pre ${inv ? 'inv' : ''}`} aria-label="Balance after">
                <span /><span className="h">{t.who} balance</span>{inv && <span className="h">{inv.invoice_no} due</span>}
                <span className="m">Now</span><b>{side(bal)}</b>{inv && <b>{money(inv.due)}</b>}
                <span className="m">{lower ? 'Deduction' : 'Addition'}</span><b className={lower ? 'ok' : 'warn'}>{lower ? '−' : '+'} {money(okAmount ? amount : 0)}</b>{inv && <b className={lower ? 'ok' : 'warn'}>{`${lower ? '−' : '+'} ${money(okAmount ? amount : 0)}`}</b>}
                <span className="m sum">After saving</span><b className="sum">{side(after)}</b>{inv && <b className="sum">{money(invAfter) + (invAfter < 0.005 ? ' · settled' : '')}</b>}
              </div>
            )) : <p className="la-note la-pre-empty">Pick a {t.who.toLowerCase()} to see the balance before and after saving.</p>}
        </div>
        <ErrorBox error={opts.error} onRetry={opts.reload} />
        <div className="la-actions">
          <p className="la-note">{t.effect}</p><span className="spacer" />
          <Btn onClick={clear}>Clear</Btn>
          <Btn kind="primary" busy={busy} disabled={!canSave} onClick={save}>{promised ? 'Save as promised' : f.pending_id ? 'Save received rebate' : 'Save adjustment'}</Btn>
        </div>
      </section>

      {kind === 'supplier' && pending.length > 0 && (
        <section className="card" aria-label="Promised rebates">
          <div className="card-head"><b>Promised rebates not received yet</b><Badge tone="warn">{pending.length} · {money(pending.reduce((a, p) => a + Number(p.amount), 0), false)}</Badge></div>
          <div className="la-pend">
            {pending.map((p) => (
              <div key={p.id}>
                <span><b>{p.supplier}</b> · {opts.data?.types?.ded?.[p.kind] || p.kind}{p.purchase_no ? ` · ${p.purchase_no}` : ''} · <span className="muted">{p.note}{p.expected ? ` · expected ${fdate(p.expected)}` : ''}</span></span>
                <b>{money(p.amount, false)}</b>
                <Btn size="sm" kind="primary" onClick={() => receive(p)} aria-label={`Mark the ${money(p.amount)} rebate from ${p.supplier} received`}>Mark received</Btn>
                <Btn size="sm" onClick={() => setDrop(p)} aria-label={`Drop the ${money(p.amount)} promised rebate from ${p.supplier}`}>Drop</Btn>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card" aria-label="Recent adjustments">
        <div className="card-head"><b>Recent adjustments</b><span className="muted" style={{ fontSize: 12.5 }}>newest first · cancelling needs the admin password</span></div>
        <ErrorBox error={list.error} onRetry={list.reload} />
        <DataTable title={`${t.who} adjustments`} rows={list.data?.rows || []} loading={list.loading && !list.data}
          empty={`No ${t.who.toLowerCase()} adjustments yet`}
          columns={[
            { key: 'ref_no', label: 'No' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'party', label: t.who },
            { key: 'invoice_no', label: 'Invoice', value: (r) => r.invoice_no || '—' }, { key: 'type_label', label: 'Type' },
            { key: 'dir', label: 'Adjustment', value: (r) => (r.dir === 'add' ? 'Addition' : 'Deduction'), render: (r) => <Badge tone={r.dir === 'add' ? 'warn' : 'ok'}>{r.dir === 'add' ? 'Addition' : 'Deduction'}</Badge> },
            { key: 'amount', label: 'Amount', type: 'money' },
            { key: 'reason', label: 'Reason', className: 'clip', value: (r) => r.reason + (r.reference ? ` · Ref: ${r.reference}` : '') },
            { key: 'by', label: 'By' },
            { key: 'x', label: '', noSort: true, noExport: true, render: (r) => <button className="link" style={{ color: 'var(--bad)' }} onClick={() => setRev({ type: t.rev, id: r.id, label: `adjustment ${r.ref_no}` })}>Cancel</button> }
          ]} />
      </section>
      <ReverseDialog open={!!rev} {...(rev || {})} onClose={() => setRev(null)} onDone={() => { list.reload(); opts.reload(); }} />
      {drop && <DropPromise promise={drop} onClose={() => setDrop(null)} onDone={() => list.reload()} />}
    </>
  );
}

function Row({ label, req, hint, error, span, children }) {
  return (
    <div className={`la-row ${error ? 'has-error' : ''}`} style={span > 1 ? { gridColumn: `span ${span}` } : undefined}>
      <span className="la-label">{label}{req && <i className="req">*</i>}</span>
      {children}{hint && <div className={`field-hint ${error ? 'field-error' : ''}`}>{hint}</div>}
    </div>
  );
}

function DropPromise({ promise, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, run] = useAction();
  const save = async () => { await run(() => api('rebate.promise.cancel', { id: promise.id, reason }), 'Promised rebate dropped'); onDone(); onClose(); };
  return (
    <Modal open onClose={onClose} size="sm" title={`Drop the promised rebate of ${money(promise.amount)}?`} footer={<><Btn onClick={onClose}>Keep it</Btn><Btn kind="primary" busy={busy} disabled={!reason.trim()} onClick={save}>Drop it</Btn></>}>
      <div className="form"><Field label="Why is it dropped?" wide><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. target was not reached" autoFocus /></Field></div>
    </Modal>
  );
}
