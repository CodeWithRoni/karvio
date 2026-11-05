// Shared directory + ledger page for customers (Bakir Khata) and suppliers.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, fdate, splitList } from '../lib/format';
import { printStatement, printMoneyReceipt } from '../lib/receipt';
import DataTable from './DataTable';
import { useApi, PageHead, Modal, Btn, Field, Loading, ErrorBox, useAction, Select, DateRange, Badge, Tabs } from './ui';
import { ReverseDialog } from './widgets';

const CFG = {
  customer: {
    title: 'Customers & dues', sub: 'Customer directory and digital Bakir Khata — record partial payments and print statements.',
    list: 'customers.list', save: 'customer.save', statement: 'customer.statement', payment: 'customer.payment', key: 'customer_id', path: '/customers', perm: 'customers', revType: 'cpay',
    pos: 'Customer owes', neg: 'Advance', payLabel: 'Collect payment', dirs: [['receive', 'Collect from customer'], ['pay', 'Pay to customer (return advance)']],
    debit: 'Sales / paid out', credit: 'Received'
  },
  supplier: {
    title: 'Suppliers', sub: 'Supplier directory, accounts payable and payment history.',
    list: 'suppliers.list', save: 'supplier.save', statement: 'supplier.statement', payment: 'supplier.payment', key: 'supplier_id', path: '/suppliers', perm: 'suppliers', revType: 'spay',
    pos: 'We owe', neg: 'Advance paid', payLabel: 'Pay supplier', dirs: [['pay', 'Pay to supplier'], ['receive', 'Receive from supplier (refund)']],
    debit: 'Paid / returned', credit: 'Purchased'
  }
};

export default function PartyPage({ kind }) {
  const c = CFG[kind];
  const { id } = useParams();
  const nav = useNavigate();
  const can = useStore((s) => s.can);
  const list = useApi(c.list, {});
  const [edit, setEdit] = useState(null);
  const [filter, setFilter] = useState('all');
  const rows = (list.data || []).filter((r) => (filter === 'all' ? r.active : filter === 'due' ? r.active && r.balance > 0.004 : filter === 'adv' ? r.balance < -0.004 : !r.active));
  const canManage = can(c.perm);

  return (
    <>
      <PageHead title={c.title} sub={c.sub}>
        <Tabs tabs={[['all', 'All'], ['due', kind === 'customer' ? 'With dues' : 'Payable'], ['adv', 'Advance'], ['inactive', 'Inactive']]} value={filter} onChange={setFilter} />
        {(canManage || (kind === 'customer' && can('pos'))) && <Btn kind="primary" onClick={() => setEdit({ name: '', phones: [''], addresses: [''], address: '', opening_balance: 0, note: '' })}>Add {kind}</Btn>}
      </PageHead>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <DataTable title={c.title} loading={list.loading} rows={rows} onRowClick={canManage ? (r) => nav(`${c.path}/${r.id}`) : undefined}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'phones', label: 'Phones' },
          { key: kind === 'customer' ? 'addresses' : 'address', label: 'Address', value: (r) => (r.addresses || r.address || '').split('|').join('; '), className: 'clip' },
          { key: 'balance', label: 'Balance', type: 'money', sum: true, render: (r) => <b style={{ color: r.balance > 0 ? 'var(--warn)' : r.balance < 0 ? 'var(--ok)' : undefined }}>{money(r.balance, false)}</b> },
          { key: 'state', label: '', noSort: true, value: (r) => (r.balance > 0.004 ? c.pos : r.balance < -0.004 ? c.neg : ''), render: (r) => r.balance > 0.004 ? <Badge tone="warn">{c.pos}</Badge> : r.balance < -0.004 ? <Badge tone="ok">{c.neg}</Badge> : null }
        ]} />
      {edit && <PartyForm kind={kind} initial={edit} onClose={() => setEdit(null)} onSaved={() => { list.reload(); useStore.getState().refresh(kind === 'customer' ? 'customers' : 'suppliers'); }} />}
      {id && canManage && <PartyDetail kind={kind} id={id} onClose={() => nav(c.path)} onEdit={(p) => setEdit({ ...p, phones: splitList(p.phones), addresses: splitList(p.addresses, '|') })} onChanged={list.reload} />}
    </>
  );
}

function PartyForm({ kind, initial, onClose, onSaved }) {
  const c = CFG[kind];
  const can = useStore((s) => s.can);
  const [f, setF] = useState({ ...initial, phones: initial.phones?.length ? initial.phones : [''], addresses: initial.addresses?.length ? initial.addresses : [''] });
  const [busy, run] = useAction();
  const save = async () => {
    const payload = { ...f, phones: f.phones.filter(Boolean), addresses: kind === 'customer' ? f.addresses.filter(Boolean) : undefined };
    await run(() => api(c.save, payload), f.id ? 'Saved' : `${kind === 'customer' ? 'Customer' : 'Supplier'} added`);
    onSaved(); onClose();
  };
  const listEdit = (key, label, ph) => (
    <Field label={label} wide>
      {f[key].map((v, i) => (
        <div className="row" key={i} style={{ marginBottom: 6 }}>
          <input value={v} placeholder={ph} onChange={(e) => setF({ ...f, [key]: f[key].map((x, j) => (j === i ? e.target.value : x)) })} style={{ flex: 1 }} />
          {f[key].length > 1 && <button type="button" className="x" onClick={() => setF({ ...f, [key]: f[key].filter((_, j) => j !== i) })}>×</button>}
        </div>
      ))}
      <button type="button" className="link" onClick={() => setF({ ...f, [key]: [...f[key], ''] })}>+ Add another</button>
    </Field>
  );
  return (
    <Modal open onClose={onClose} title={f.id ? `Edit ${f.name}` : `Add ${kind}`}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>Save</Btn></>}>
      <div className="form">
        <Field label="Name" wide><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        {listEdit('phones', 'Phone numbers', '01XXXXXXXXX')}
        {kind === 'customer' ? listEdit('addresses', 'Addresses', 'House, road, area') : <Field label="Address" wide><input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>}
        {can(c.perm) && <Field label="Opening balance" hint={kind === 'customer' ? 'Old due carried over (negative = advance).' : 'Amount we already owed (negative = advance paid).'}><input type="number" step="any" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: e.target.value })} /></Field>}
        <Field label="Note" wide><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        {f.id && <label className="check"><input type="checkbox" checked={f.active !== false} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>}
      </div>
    </Modal>
  );
}

function PartyDetail({ kind, id, onClose, onEdit, onChanged }) {
  const c = CFG[kind];
  const { accounts, can } = useStore();
  const [range, setRange] = useState({ from: '', to: '' });
  const st = useApi(c.statement, { [c.key]: id, ...range });
  const party = useApi(c.list, {}).data?.find((x) => x.id === id);
  const [pay, setPay] = useState(false);
  const [rev, setRev] = useState(null);

  return (
    <Modal open onClose={onClose} size="lg" title={st.data ? st.data.party : 'Ledger'}
      footer={st.data && <>
        {party && <Btn onClick={() => onEdit(party)}>Edit details</Btn>}
        <span className="spacer" />
        <Btn onClick={() => printStatement(kind, st.data, range.from, range.to)}>Print statement</Btn>
        <Btn kind="primary" onClick={() => setPay(true)}>{c.payLabel}</Btn>
      </>}>
      {st.loading && !st.data && <Loading />}
      <ErrorBox error={st.error} onRetry={st.reload} />
      {st.data && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="kv" style={{ flex: 1 }}>
              <div><span>Phones</span><b>{st.data.phones || '—'}</b></div>
              <div><span>Opening</span><b>{money(st.data.opening)}</b></div>
              <div><span>Closing balance</span><b style={{ color: st.data.closing > 0 ? 'var(--warn)' : 'var(--ok)' }}>{money(st.data.closing)} {st.data.closing > 0 ? `(${c.pos.toLowerCase()})` : st.data.closing < 0 ? `(${c.neg.toLowerCase()})` : ''}</b></div>
            </div>
            <DateRange {...range} onChange={setRange} />
          </div>
          <DataTable title={`${st.data.party} statement`} rows={st.data.rows} searchable={false} pageSize={200}
            columns={[
              { key: 'date', label: 'Date', type: 'date' }, { key: 'ref_no', label: 'Ref' }, { key: 'note', label: 'Details', className: 'clip' },
              { key: 'debit', label: c.debit, type: 'money', sum: true }, { key: 'credit', label: c.credit, type: 'money', sum: true },
              { key: 'balance', label: 'Balance', type: 'money' },
              ...(can('cancel') ? [{ key: 'x', label: '', noSort: true, noExport: true, render: (r) => (r.type === 'payment' || r.type === 'refund') && <button className="link" style={{ color: 'var(--bad)' }} onClick={() => setRev({ type: c.revType, id: r.id, label: `payment ${r.ref_no}` })}>Void</button> }] : [])
            ]} />
        </>
      )}
      {pay && <PaymentForm kind={kind} id={id} name={st.data?.party} balance={st.data?.closing} accounts={accounts} onClose={() => setPay(false)} onDone={() => { st.reload(); onChanged(); }} />}
      <ReverseDialog open={!!rev} {...(rev || {})} onClose={() => setRev(null)} onDone={() => { st.reload(); onChanged(); }} />
    </Modal>
  );
}

function PaymentForm({ kind, id, name, balance, accounts, onClose, onDone }) {
  const c = CFG[kind];
  const refresh = useStore((s) => s.refresh);
  const [f, setF] = useState({ direction: c.dirs[0][0], amount: balance > 0 ? balance : '', account_id: accounts[0]?.id || '', note: '', date: '' });
  const [print, setPrint] = useState(kind === 'customer');
  const [busy, run] = useAction();
  useEffect(() => { if (!f.account_id && accounts[0]) setF((x) => ({ ...x, account_id: accounts[0].id })); }, [accounts, f.account_id]);
  const save = async () => {
    const r = await run(() => api(c.payment, { [c.key]: id, ...f, amount: Number(f.amount) }), 'Payment recorded');
    if (print && kind === 'customer' && f.direction === 'receive') printMoneyReceipt(r);
    refresh(kind === 'customer' ? 'customers' : 'suppliers');
    onDone(); onClose();
  };
  return (
    <Modal open onClose={onClose} size="sm" title={`${c.payLabel} — ${name}`} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>Save payment</Btn></>}>
      <div className="form">
        <Field label="Type" wide><select value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}>{c.dirs.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Amount" wide hint={`Current balance ${money(balance)}`}><input type="number" step="any" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Account" wide><Select value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} options={accounts} allowEmpty={false} /></Field>
        <Field label="Note" wide><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. part payment for INV-000123" /></Field>
        {kind === 'customer' && f.direction === 'receive' && <label className="check"><input type="checkbox" checked={print} onChange={(e) => setPrint(e.target.checked)} /> Print money receipt</label>}
      </div>
    </Modal>
  );
}
