import { useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, fdate, today } from '../lib/format';
import { useApi, Btn, Field, Badge, Modal, Select, Empty, ErrorBox, useAction } from './ui';
import { TableSkeleton } from './Skeleton';

const blank = (cats, accounts) => ({ name: '', category: cats[0] || '', amount: '', account_id: (accounts.find((a) => a.type === 'cash') || accounts[0])?.id || '', day: 1, active: true });

/** Expenses → Monthly expenses: rent, salary, internet… set once, then recorded each month with one click. */
export default function MonthlyExpenses({ cats, onRecorded }) {
  const accounts = useStore((s) => s.accounts);
  const q = useApi('expense.recurring', {});
  const [edit, setEdit] = useState(null); // list being edited
  const [rec, setRec] = useState(null);   // template being recorded
  const d = q.data;
  if (!d && q.loading) return <div className="card"><TableSkeleton rows={4} cols={5} label="Loading monthly expenses" /></div>;
  if (!d) return <ErrorBox error={q.error} onRetry={q.reload} />;
  const acc = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  return (
    <div className="card">
      <div className="card-head"><h2>Monthly expenses {d.due > 0 && <Badge tone="warn">{d.due} due</Badge>}</h2><Btn onClick={() => setEdit(d.templates.map((t) => ({ ...t })))}>{d.templates.length ? 'Edit list' : 'Set up'}</Btn></div>
      {d.templates.length ? (
        <div className="mx-list">
          {d.templates.map((t) => (
            <div className={`mx-row ${t.due ? 'due' : ''} ${t.active === false ? 'off' : ''}`} key={t.id}>
              <div><b>{t.name}</b><small>{t.category} · from {acc[t.account_id] || '—'} · every month on day {t.day}</small></div>
              <b className="num">{money(t.amount)}</b>
              <div className="mx-state">
                {t.active === false ? <Badge tone="muted">Paused</Badge> : t.recorded ? <Badge tone="ok">Recorded for this month</Badge> : t.due ? <Badge tone="warn">Due since {fdate(t.due_date)}</Badge> : <Badge tone="muted">Due {fdate(t.due_date)}</Badge>}
                {t.active !== false && !t.recorded && <Btn size="sm" kind={t.due ? 'primary' : ''} onClick={() => setRec({ ...t, amount: t.amount, date: today(), note: '' })}>Record</Btn>}
              </div>
            </div>
          ))}
        </div>
      ) : <Empty compact icon="receipt" title="No monthly expenses yet">Add rent, salaries, internet or any bill you pay every month. Each month they come due on their day and are recorded with one click.</Empty>}
      {edit && <EditList list={edit} cats={cats} accounts={accounts} onClose={() => setEdit(null)} onSaved={(r) => { q.setData(r); setEdit(null); }} />}
      {rec && <RecordOne t={rec} accounts={accounts} onClose={() => setRec(null)} onSaved={(r) => { q.setData(r.list); setRec(null); onRecorded?.(); }} />}
    </div>
  );
}

function EditList({ list, cats, accounts, onClose, onSaved }) {
  const [rows, setRows] = useState(list.length ? list : [blank(cats, accounts)]);
  const [busy, run] = useAction();
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const save = async () => onSaved(await run(() => api('expense.recurring.save', { templates: rows.map((r) => ({ ...r, amount: Number(r.amount), day: Number(r.day) })) }), 'Monthly expenses saved'));
  return (
    <Modal open size="lg" title="Monthly expenses" onClose={onClose}
      footer={<><Btn onClick={() => setRows([...rows, blank(cats, accounts)])}>Add another</Btn><span className="spacer" /><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>Save list</Btn></>}>
      <div className="mx-edit">
        {rows.map((r, i) => (
          <div className="mx-edit-row" key={r.id || i}>
            <Field label="Name"><input value={r.name} maxLength={60} onChange={(e) => set(i, 'name', e.target.value)} placeholder="e.g. Shop rent" /></Field>
            <Field label="Category"><select value={r.category} onChange={(e) => set(i, 'category', e.target.value)}>{cats.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Amount"><input type="number" min="0" step="any" value={r.amount} onChange={(e) => set(i, 'amount', e.target.value)} /></Field>
            <Field label="Paid from"><Select value={r.account_id} onChange={(v) => set(i, 'account_id', v)} options={accounts} allowEmpty={false} /></Field>
            <Field label="Day"><input type="number" min="1" max="28" value={r.day} onChange={(e) => set(i, 'day', e.target.value)} aria-label="Day of the month" /></Field>
            <label className="check"><input type="checkbox" checked={r.active !== false} onChange={(e) => set(i, 'active', e.target.checked)} /> Active</label>
            <button type="button" className="del-btn" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove ${r.name || 'row'}`}>Remove</button>
          </div>
        ))}
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Days 1–28 only, so every month has the day. Pausing keeps the line but stops it coming due.</p>
      </div>
    </Modal>
  );
}

function RecordOne({ t, accounts, onClose, onSaved }) {
  const [f, setF] = useState(t);
  const [busy, run] = useAction();
  const save = async () => onSaved(await run(() => api('expense.recurring.record', { id: t.id, amount: Number(f.amount), date: f.date, account_id: f.account_id, note: f.note }), `${t.name} recorded`));
  return (
    <Modal open size="sm" title={`Record ${t.name}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>Record expense</Btn></>}>
      <div className="form">
        <Field label="Amount" wide hint="Change it if this month's bill is different."><input type="number" min="0" step="any" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Paid from"><Select value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} options={accounts} allowEmpty={false} /></Field>
        <Field label="Note" wide><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional" /></Field>
      </div>
    </Modal>
  );
}
