import { useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, today, monthStart } from '../lib/format';
import DataTable from '../components/DataTable';
import { useApi, PageHead, Btn, Field, useAction, Select, DateRange, ErrorBox, Badge, statusTone } from '../components/ui';
import { ReverseDialog } from '../components/widgets';

export default function Expenses() {
  const { accounts, settings, can } = useStore();
  const cats = (() => { try { return JSON.parse(settings.expense_categories); } catch { return ['Other']; } })();
  const cash = accounts.find((a) => a.type === 'cash') || accounts[0];
  const [f, setF] = useState({ date: today(), category: cats[0] || '', amount: '', account_id: cash?.id || '', note: '' });
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const list = useApi('expenses.list', range);
  const balances = useApi('accounts.list', {}, [], { skip: !can('accounts') });
  const [busy, run] = useAction();
  const [rev, setRev] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    await run(() => api('expense.create', { ...f, amount: Number(f.amount) }), 'Expense recorded');
    setF({ ...f, amount: '', note: '' });
    list.reload(); balances.reload();
  };
  const todayTotal = (list.data || []).filter((x) => x.date === today() && x.status === 'active').reduce((a, x) => a + x.amount, 0);
  const drawers = (balances.data || []).filter((a) => a.active && a.type === 'cash');

  return (
    <>
      <PageHead title="Daily expenses" sub="Shop running costs are paid from an account, so the cash drawer balance stays accurate." />
      <div className="split" style={{ marginBottom: 16 }}>
        <form className="card form" onSubmit={save}>
          <Field label="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Category"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Amount"><input type="number" step="any" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
          <Field label="Paid from"><Select value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} options={accounts} allowEmpty={false} /></Field>
          <Field label="Note" wide><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Lunch for staff, DESCO bill" /></Field>
          <div className="wide row end"><Btn kind="primary" busy={busy} type="submit">Add expense</Btn></div>
        </form>
        <div className="stats" style={{ gridTemplateColumns: '1fr' }}>
          <div className="stat"><span>Spent today</span><b>{money(todayTotal)}</b></div>
          {drawers.map((d) => <div className="stat" key={d.id}><span>{d.name} — live balance</span><b>{money(d.balance)}</b></div>)}
        </div>
      </div>
      <div className="filters"><DateRange {...range} onChange={setRange} /></div>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <DataTable title="Expenses" loading={list.loading} rows={list.data || []} rowClass={(r) => (r.status === 'cancelled' ? 'dim' : '')}
        totals={{ amount: (list.data || []).filter((x) => x.status === 'active').reduce((a, x) => a + x.amount, 0) }}
        columns={[
          { key: 'date', label: 'Date', type: 'date' }, { key: 'category', label: 'Category' }, { key: 'note', label: 'Note' },
          { key: 'account_name', label: 'Paid from' }, { key: 'amount', label: 'Amount', type: 'money' }, { key: 'user', label: 'By' },
          { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
          ...(can('cancel') ? [{ key: 'x', label: '', noSort: true, noExport: true, render: (r) => r.status === 'active' && <Btn size="sm" kind="danger" onClick={() => setRev({ type: 'expense', id: r.id, label: 'expense' })}>Cancel</Btn> }] : [])
        ]} />
      <ReverseDialog open={!!rev} {...(rev || {})} onClose={() => setRev(null)} onDone={() => { list.reload(); balances.reload(); }} />
    </>
  );
}
