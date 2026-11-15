import { useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, monthStart, today } from '../lib/format';
import DataTable from '../components/DataTable';
import { useSearchParams } from 'react-router-dom';
import { useApi, PageHead, Modal, Btn, Field, useAction, Select, DateRange, ErrorBox, Badge, Tabs, useConfirm } from '../components/ui';
import DayClose from './DayClose';
import { ReverseDialog } from '../components/widgets';
import DateInput from '../components/DateInput';

const TYPES = [['cash', 'Cash'], ['mfs', 'Mobile banking (bKash, Nagad, Rocket…)'], ['bank', 'Bank account']];

export default function Accounts() {
  const list = useApi('accounts.list', {});
  const [edit, setEdit] = useState(null);
  const [entry, setEntry] = useState(null);
  const [sel, setSel] = useState(null);
  const accs = list.data || [];
  const active = accs.filter((a) => a.active);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'dayclose' ? 'dayclose' : 'accounts';
  const [confirmUI, ask] = useConfirm();
  const [, runDelete] = useAction();
  // Delete unused accounts (no transactions, no opening balance). The server refuses any with history.
  const removeAccounts = async (picked, clear) => {
    const used = picked.filter((a) => a.has_history || Number(a.opening_balance));
    if (used.length) return useStore.getState().toast(`${used.map((a) => a.name).join(', ')} ${used.length === 1 ? 'has' : 'have'} history or an opening balance and cannot be deleted. Make ${used.length === 1 ? 'it' : 'them'} inactive instead.`, 'err');
    if (!(await ask({ title: picked.length === 1 ? `Delete ${picked[0].name}?` : `Delete ${picked.length} accounts?`, message: `${picked.map((a) => a.name).join(', ')} will be removed. They have never been used, so no history is lost.`, confirmLabel: 'Delete' }))) return;
    await runDelete(() => api('account.delete', { ids: picked.map((a) => a.id) }), picked.length === 1 ? 'Account deleted' : `${picked.length} accounts deleted`);
    clear?.(); setEdit(null); list.reload(); useStore.getState().boot();
  };
  const tabs = <Tabs tabs={[['accounts', 'Accounts'], ['dayclose', 'Day close']]} value={tab} onChange={(v) => setParams(v === 'dayclose' ? { tab: v } : {}, { replace: true })} />;

  if (tab === 'dayclose') return (
    <>
      <PageHead title="Cash, bank & MFS" sub="Count the cash at the end of the day and compare it with the books.">{tabs}</PageHead>
      <DayClose />
    </>
  );
  return (
    <>
      <PageHead title="Cash, bank & MFS" sub="Every sale, purchase, expense and refund moves money in or out of one of these accounts automatically.">
        {tabs}
        <Btn onClick={() => setEntry({ kind: 'transfer' })}>Transfer</Btn>
        <Btn onClick={() => setEntry({ kind: 'deposit' })}>Deposit / withdraw</Btn>
        <Btn kind="primary" onClick={() => setEdit({ name: '', type: 'mfs', number: '', opening_balance: 0 })}>Add account</Btn>
      </PageHead>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <div className="patch">
        {active.map((a) => (
          <button key={a.id} className="port" data-type={a.type} style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }} onClick={() => setSel(a)}>
            <div className="pn">{a.name}</div>
            <div className="pt">{TYPES.find((t) => t[0] === a.type)?.[1].split(' (')[0]}{a.number ? ` · ${a.number}` : ''}</div>
            <div className={`pb ${a.balance < 0 ? 'neg' : ''}`}>{money(a.balance)}</div>
          </button>
        ))}
        {active.length > 0 && <div className="port" style={{ '--c': 'var(--fiber)' }}><div className="pn">Total</div><div className="pt">All active accounts</div><div className="pb">{money(active.reduce((s, a) => s + a.balance, 0))}</div></div>}
      </div>
      <div style={{ marginTop: 18 }}>
        <DataTable title="Accounts" rows={accs} loading={list.loading} onRowClick={(a) => setEdit(a)}
          selectionActions={(picked, clear) => <Btn size="sm" kind="danger" onClick={() => removeAccounts(picked, clear)}>Delete selected ({picked.length})</Btn>}
          columns={[
            { key: 'name', label: 'Account' }, { key: 'type', label: 'Type' }, { key: 'number', label: 'Number' },
            { key: 'opening_balance', label: 'Opening', type: 'money' }, { key: 'balance', label: 'Current balance', type: 'money', sum: true },
            { key: 'active', label: 'Status', value: (r) => (r.active ? 'Active' : 'Inactive'), render: (r) => <Badge tone={r.active ? 'ok' : 'muted'}>{r.active ? 'Active' : 'Inactive'}</Badge> }
          ]} />
      </div>
      {edit && <AccountForm initial={edit} onClose={() => setEdit(null)} onDone={list.reload} onDelete={(a) => removeAccounts([a])} />}
      {confirmUI}
      {entry && <EntryForm initial={entry} accounts={active} onClose={() => setEntry(null)} onDone={list.reload} />}
      {sel && <Ledger account={sel} onClose={() => setSel(null)} onChanged={list.reload} />}
    </>
  );
}

function AccountForm({ initial, onClose, onDone, onDelete }) {
  const [f, setF] = useState(initial);
  const [busy, run] = useAction();
  const boot = useStore((s) => s.boot);
  const booksClosed = useStore((s) => !!s.settings.books_locked_until);
  const save = async () => { await run(() => api('account.save', f), 'Account saved'); onDone(); boot(); onClose(); };
  return (
    <Modal open onClose={onClose} size="sm" title={f.id ? `Edit ${f.name}` : 'Add account'} footer={<>{f.id && !initial.has_history && !Number(initial.opening_balance) && <Btn kind="danger" onClick={() => onDelete(initial)}>Delete account</Btn>}<span className="spacer" /><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>Save account</Btn></>}>
      <div className="form">
        {f.has_history ? <p className="muted wide">This account has transaction history and is retained for accounting. Turn Active off to stop using it; previous entries remain.</p>
          : f.id && Number(initial.opening_balance) ? <p className="muted wide">To delete this unused account, set its opening balance to 0 and save first.</p> : null}
        <Field label="Account name" wide><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. bKash Merchant, Islami Bank" autoFocus /></Field>
        <Field label="Type" wide><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Account / wallet number" wide><input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field>
        <Field label="Opening balance" wide hint={booksClosed ? "Books are closed. Reopen them before changing opening balances." : "The balance on the day you start using Karvio."}><input type="number" step="any" value={f.opening_balance} disabled={booksClosed} onChange={(e) => setF({ ...f, opening_balance: e.target.value })} /></Field>
        {f.id && <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>}
      </div>
    </Modal>
  );
}

function EntryForm({ initial, accounts, onClose, onDone }) {
  const [f, setF] = useState({ kind: initial.kind, account_id: accounts[0]?.id || '', to_account_id: accounts[1]?.id || '', amount: '', note: '', date: today() });
  const [busy, run] = useAction();
  const save = async () => { await run(() => api('account.entry', { ...f, amount: Number(f.amount) }), 'Saved'); onDone(); onClose(); };
  const transfer = f.kind === 'transfer';
  return (
    <Modal open onClose={onClose} size="sm" title={transfer ? 'Transfer between accounts' : 'Deposit or withdraw'} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>Save</Btn></>}>
      <div className="form">
        {!transfer && <Field label="Type" wide><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="deposit">Owner deposit / capital in</option><option value="withdraw">Owner withdrawal / cash out</option></select></Field>}
        <Field label={transfer ? 'From' : 'Account'} wide><Select value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} options={accounts} allowEmpty={false} /></Field>
        {transfer && <Field label="To" wide><Select value={f.to_account_id} onChange={(v) => setF({ ...f, to_account_id: v })} options={accounts} allowEmpty={false} /></Field>}
        <Field label="Amount"><input type="number" step="any" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus /></Field>
        <Field label="Date"><DateInput value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Note" wide><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={transfer ? 'e.g. bKash cash out to drawer' : ''} /></Field>
      </div>
    </Modal>
  );
}

function Ledger({ account, onClose, onChanged }) {
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const l = useApi('account.ledger', { account_id: account.id, ...range });
  const can = useStore((s) => s.can);
  const [rev, setRev] = useState(null);
  return (
    <Modal open onClose={onClose} size="lg" title={`${account.name} — transactions`}>
      <div className="row" style={{ marginBottom: 12 }}>
        <DateRange {...range} onChange={setRange} /><span className="spacer" />
        {l.data && <b>Balance now {money(l.data.current_balance ?? l.data.closing)}</b>}
      </div>
      {l.data && <p className="muted">Period opening {money(l.data.opening)} · Period closing {money(l.data.closing)}</p>}
      <ErrorBox error={l.error} onRetry={l.reload} />
      <DataTable title={`${account.name} ledger`} loading={l.loading} rows={l.data?.rows || []}
        columns={[
          { key: 'date', label: 'Date', type: 'date' }, { key: 'ref_type', label: 'Source' }, { key: 'note', label: 'Details', className: 'clip' },
          { key: 'in', label: 'In', type: 'money', sum: true }, { key: 'out', label: 'Out', type: 'money', sum: true },
          { key: 'balance', label: 'Balance', type: 'money' }, { key: 'user', label: 'By' },
          // Deposits, withdrawals and transfers have no document of their own, so they are cancelled here.
          ...(can('cancel') ? [{ key: 'act', label: '', noSort: true, noExport: true, render: (r) => (r.ref_type === 'manual' || r.ref_type === 'transfer') && <Btn size="sm" kind="danger" onClick={(e) => { e.stopPropagation(); setRev({ type: 'account', id: r.id, label: r.ref_type === 'transfer' ? 'this transfer (both accounts)' : 'this entry' }); }}>Cancel</Btn> }] : [])
        ]} />
      <ReverseDialog open={!!rev} {...(rev || {})} onClose={() => setRev(null)} onDone={() => { setRev(null); l.reload(); onChanged(); }} />
    </Modal>
  );
}
