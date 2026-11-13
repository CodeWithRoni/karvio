import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, today, monthStart, round2, fdate } from '../lib/format';
import DataTable from '../components/DataTable';
import { useApi, PageHead, Btn, Field, useAction, Select, DateRange, ErrorBox, Badge, statusTone, Tabs, useConfirm, Modal } from '../components/ui';
import { ReverseDialog } from '../components/widgets';

const catKey = (c) => String(c || '').trim().replace(/\s+/g, ' ').toLowerCase();

export default function Expenses() {
  const { accounts, settings, can } = useStore();
  const cats = (() => { try { return JSON.parse(settings.expense_categories); } catch { return ['Other']; } })();
  const cash = accounts.find((a) => a.type === 'cash') || accounts[0];
  const [f, setF] = useState({ date: today(), category: cats[0] || '', amount: '', account_id: cash?.id || '', note: '' });
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const [catFilter, setCatFilter] = useState('');
  const list = useApi('expenses.list', range);
  const balances = useApi('accounts.list', {}, [], { skip: !can('accounts') });
  const [busy, run] = useAction();
  const [rev, setRev] = useState(null);
  const [edit, setEdit] = useState(null);
  const [tab, setTab] = useState('list');

  const save = async (e) => {
    e.preventDefault();
    await run(() => api('expense.create', { ...f, amount: Number(f.amount) }), 'Expense recorded');
    setF({ ...f, amount: '', note: '' });
    list.reload(); balances.reload();
  };
  const all = list.data || [];
  const todayTotal = all.filter((x) => x.date === today() && x.status === 'active').reduce((a, x) => a + x.amount, 0);
  const drawers = (balances.data || []).filter((a) => a.active && a.type === 'cash');
  // Category totals for the chosen dates (active expenses only); old categories stay listed with their history.
  const byCategory = useMemo(() => {
    const m = {};
    all.filter((x) => x.status === 'active').forEach((x) => {
      const k = catKey(x.category), r = m[k] || (m[k] = { category: x.category, count: 0, amount: 0 });
      r.count++; r.amount = round2(r.amount + x.amount);
    });
    return Object.values(m).sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
  }, [all]);
  const rangeTotal = round2(byCategory.reduce((a, r) => a + r.amount, 0));
  const filterCats = [...cats, ...byCategory.map((r) => r.category).filter((c) => !cats.some((x) => catKey(x) === catKey(c)))];
  const rows = catFilter ? all.filter((x) => catKey(x.category) === catKey(catFilter)) : all;
  const open = (r) => {
    if (r.status !== 'active') return useStore.getState().toast('A cancelled expense cannot be edited', 'err');
    setEdit(r);
  };
  const changed = () => { list.reload(); balances.reload(); };

  return (
    <>
      <PageHead title="Expenses" sub="Shop running costs are paid from an account, so the cash balance stays accurate.">
        <Tabs tabs={[['list', 'Daily expenses'], ['cats', 'Expense categories']]} value={tab} onChange={setTab} />
      </PageHead>
      {tab === 'cats' ? <ExpenseCategories cats={cats} /> : <>
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
      <div className="filters">
        <DateRange {...range} onChange={setRange} />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {filterCats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {catFilter && <Btn size="sm" onClick={() => setCatFilter('')}>Show all</Btn>}
      </div>
      <ErrorBox error={list.error} onRetry={list.reload} />
      {!list.loading && byCategory.length > 0 && (
        <div className="card exp-summary">
          <div className="card-head"><h2>Spending by category</h2><span className="muted">{range.from ? fdate(range.from) : 'Start'} to {range.to ? fdate(range.to) : 'today'} · Total {money(rangeTotal)}</span></div>
          <ul className="exp-sum-list">
            {byCategory.map((r) => {
              const share = rangeTotal > 0 ? (r.amount / rangeTotal) * 100 : 0, on = catKey(catFilter) === catKey(r.category);
              return (
                <li key={r.category}>
                  <button type="button" className={`exp-sum-row${on ? ' on' : ''}`} onClick={() => setCatFilter(on ? '' : r.category)} title={on ? 'Show all categories' : `Show only ${r.category}`}>
                    <span className="exp-sum-name">{r.category}</span>
                    <span className="exp-sum-bar"><i style={{ width: `${Math.max(share, 1)}%` }} /></span>
                    <span className="exp-sum-share">{share.toFixed(1)}%</span>
                    <span className="exp-sum-count muted">{r.count} {r.count === 1 ? 'entry' : 'entries'}</span>
                    <b className="exp-sum-amt">{money(r.amount)}</b>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <DataTable title={catFilter ? `Expenses — ${catFilter}` : 'Expenses'} loading={list.loading} rows={rows} rowClass={(r) => (r.status === 'cancelled' ? 'dim' : '')}
        onRowClick={open}
        totals={{ amount: rows.filter((x) => x.status === 'active').reduce((a, x) => a + x.amount, 0) }}
        columns={[
          { key: 'date', label: 'Date', type: 'date' }, { key: 'category', label: 'Category' }, { key: 'note', label: 'Note' },
          { key: 'account_name', label: 'Paid from' }, { key: 'amount', label: 'Amount', type: 'money' }, { key: 'user', label: 'By' },
          { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
          ...(can('cancel') ? [{ key: 'x', label: '', noSort: true, noExport: true, render: (r) => r.status === 'active' && <span onClick={(e) => e.stopPropagation()}><Btn size="sm" kind="danger" onClick={() => setRev({ type: 'expense', id: r.id, label: 'expense' })}>Cancel</Btn></span> }] : [])
        ]} />
      </>}
      {edit && <ExpenseEdit expense={edit} cats={cats} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); changed(); }} />}
      <ReverseDialog open={!!rev} {...(rev || {})} onClose={() => setRev(null)} onDone={changed} />
    </>
  );
}

/** Edit popup: category and note change freely; amount, account or date move money, so they need an admin password. */
function ExpenseEdit({ expense: e, cats, onClose, onSaved }) {
  const { accounts, user } = useStore();
  const [f, setF] = useState({ date: e.date, category: e.category, amount: String(e.amount), account_id: e.account_id, note: e.note || '' });
  const [password, setPassword] = useState('');
  const [busy, run] = useAction();
  const catOptions = cats.some((c) => catKey(c) === catKey(e.category)) ? cats : [e.category, ...cats];
  const accOptions = accounts.some((a) => a.id === e.account_id) ? accounts : [{ id: e.account_id, name: `${e.account_name || 'Account'} (inactive)` }, ...accounts];
  const amount = Number(f.amount);
  const moneyChanged = Math.abs(round2(amount) - e.amount) > 0.004 || f.account_id !== e.account_id || f.date !== e.date;
  const anyChange = moneyChanged || f.category !== e.category || f.note.trim() !== (e.note || '');
  const save = async () => {
    if (!(amount > 0)) return useStore.getState().toast('Amount must be greater than 0', 'err');
    if (moneyChanged && !password) return useStore.getState().toast('Enter the admin password to change the amount, account or date', 'err');
    try {
      await run(() => api('expense.update', { id: e.id, ...f, amount: round2(amount), note: f.note.trim(), ...(moneyChanged ? { password } : {}) }), 'Expense updated');
      onSaved();
    } catch { /* toast shown */ }
  };
  return (
    <Modal open onClose={onClose} title={`Edit expense — ${e.category}`}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!anyChange} onClick={save}>Save changes</Btn></>}>
      <div className="form">
        <Field label="Date"><input type="date" value={f.date} max={today()} onChange={(ev) => setF({ ...f, date: ev.target.value })} /></Field>
        <Field label="Category"><select value={f.category} onChange={(ev) => setF({ ...f, category: ev.target.value })}>{catOptions.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Amount"><input type="number" step="any" min="0" value={f.amount} onChange={(ev) => setF({ ...f, amount: ev.target.value })} /></Field>
        <Field label="Paid from"><Select value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} options={accOptions} allowEmpty={false} /></Field>
        <Field label="Note" wide><input value={f.note} onChange={(ev) => setF({ ...f, note: ev.target.value })} placeholder="e.g. Lunch for staff, DESCO bill" /></Field>
        {moneyChanged && <Field label={user?.role === 'admin' ? 'Your password' : 'Admin password'} wide hint="Changing the amount, account or date changes the account balance, so it needs admin authorisation.">
          <input type="password" value={password} onChange={(ev) => setPassword(ev.target.value)} autoComplete="current-password" />
        </Field>}
        <p className="muted wide">Recorded by {e.user || '—'}. Every change is kept in the audit log.</p>
      </div>
    </Modal>
  );
}

function ExpenseCategories({ cats }) {
  const usage = useApi('expense.categories.usage', {});
  const used = c => !!usage.data?.[c.trim().replace(/\s+/g, ' ').toLowerCase()];
  const [name, setName] = useState('');
  const [edit, setEdit] = useState(null); // { from, value }
  const [busy, run] = useAction();
  const [confirmUI, ask] = useConfirm();
  const save = (list, msg) => run(async () => {
    const saved = await api('expense.categories', { categories: list });
    useStore.setState((st) => ({ settings: { ...st.settings, expense_categories: JSON.stringify(saved) } }));
  }, msg);
  const add = async (e) => {
    e.preventDefault();
    const v = name.trim(); if (!v) return;
    if (cats.some((c) => c.toLowerCase() === v.toLowerCase())) return useStore.getState().toast(`${v} already exists`, 'err');
    await save([...cats, v], 'Category added'); setName('');
  };
  const rename = async (e) => {
    e?.preventDefault();
    const v = edit.value.trim();
    if (!v || v === edit.from) return setEdit(null);
    if (cats.some((c) => c !== edit.from && c.toLowerCase() === v.toLowerCase())) return useStore.getState().toast(`${v} already exists`, 'err');
    await save(cats.map((c) => (c === edit.from ? v : c)), 'Category renamed'); setEdit(null);
  };
  const remove = async (c) => {
    if (cats.length <= 1) return useStore.getState().toast('Keep at least one category', 'err');
    if (!(await ask({ title: 'Delete category?', message: <>Delete <b>“{c}”</b>? Only unused categories can be deleted. Used categories stay with their expense history.</> }))) return;
    await save(cats.filter((x) => x !== c), `${c} deleted`);
  };
  return (
    <div className="card exp-cats">
      <ErrorBox error={usage.error} onRetry={usage.reload} />
      <form className="row" onSubmit={add} style={{ gap: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category, e.g. Shop rent" aria-label="New expense category" style={{ flex: 1 }} />
        <Btn kind="primary" type="submit" busy={busy} disabled={!name.trim()}>Add</Btn>
      </form>
      <ul className="exp-cat-list">
        {cats.map((c) => (
          <li key={c}>
            {edit?.from === c
              ? <form className="row" onSubmit={rename} style={{ gap: 6, flex: 1 }}><input value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} autoFocus aria-label={`New name for ${c}`} style={{ flex: 1 }} /><Btn size="sm" kind="primary" type="submit" busy={busy}>Save</Btn><Btn size="sm" onClick={() => setEdit(null)}>Cancel</Btn></form>
              : <><span>{c}{used(c) && <small className="muted"> · Used — retained for history</small>}</span><span className="spacer" /><Btn size="sm" disabled={usage.loading || !!usage.error || used(c)} onClick={() => setEdit({ from: c, value: c })}>Rename</Btn><Btn size="sm" kind="danger" disabled={usage.loading || !!usage.error || used(c)} title={used(c) ? 'This category has expense history and cannot be deleted' : 'Delete unused category'} onClick={() => remove(c)}>Delete</Btn></>}
          </li>
        ))}
      </ul>
      {confirmUI}
    </div>
  );
}
