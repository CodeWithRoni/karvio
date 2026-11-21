import { roundDecimal } from '../lib/round';
// Customers / Suppliers are plain directories (mode "directory": names, phones, addresses).
// Collection / Payment (mode "money") show the dues, the ledger and take or make payments.
import { useEffect, useState } from 'react';
import { Pager, DEFAULT_PAGE_SIZE } from './Pager';
import { useNavigate, useParams } from 'react-router-dom';
import { partyStatements } from '../lib/partyStatements';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, fdate, splitList, today } from '../lib/format';
import { printStatement, printMoneyReceipt } from '../lib/receipt';
import DataTable from './DataTable';
import { useApi, PageHead, Modal, Btn, Field, Loading, ErrorBox, useAction, Select, DateRange, Badge, Tabs, useConfirm } from './ui';
import { ReverseDialog } from './widgets';
import { excelParties, pdfParties, printParties } from '../lib/partyDocs';
import DueReminder from './DueReminder';
import DateInput from './DateInput';

const CFG = {
  customer: {
    title: 'Customers', sub: 'Customer directory — names, phone numbers and addresses. Dues and payments are under Collection.',
    moneyTitle: 'Collection', moneySub: 'Customer dues (Bakir Khata) — collect payments, send due reminders and print statements.', moneyPath: '/collection',
    list: 'customers.list', save: 'customer.save', statement: 'customer.statement', statements: 'customer.statements', del: 'customer.delete', payment: 'customer.payment', key: 'customer_id', path: '/customers', perm: 'customers', revType: 'cpay',
    pos: 'Customer owes', neg: 'Advance', payLabel: 'Collect payment', dirs: [['receive', 'Collect from customer']],
    debit: 'Sales / paid out', credit: 'Received'
  },
  supplier: {
    title: 'Suppliers', sub: 'Supplier directory — names, phone numbers and addresses. Dues and payments are under Payment.',
    moneyTitle: 'Payment', moneySub: 'What we owe suppliers — pay them and see the payment history. Rebates and corrections are under Party Ledger.', moneyPath: '/payment',
    list: 'suppliers.list', save: 'supplier.save', statement: 'supplier.statement', statements: 'supplier.statements', del: 'supplier.delete', payment: 'supplier.payment', key: 'supplier_id', path: '/suppliers', perm: 'suppliers', revType: 'spay',
    pos: 'We owe', neg: 'Advance paid', payLabel: 'Pay supplier', dirs: [['pay', 'Pay to supplier']],
    debit: 'Paid / returned', credit: 'Purchased'
  }
};

export default function PartyPage({ kind, mode = 'directory' }) {
  const c = CFG[kind], money_ = mode === 'money', path = money_ ? c.moneyPath : c.path;
  const { id } = useParams();
  const nav = useNavigate();
  const can = useStore((s) => s.can);
  const list = useApi(c.list, {});
  const [edit, setEdit] = useState(null);
  const [filter, setFilter] = useState(money_ ? 'due' : 'all');
  const rows = (list.data || []).filter((r) => (filter === 'all' ? r.active : filter === 'due' ? r.active && r.balance > 0.004 : filter === 'adv' ? r.balance < -0.004 : !r.active));
  const canManage = can(c.perm);
  const refreshAll = () => { list.reload(); useStore.getState().refresh(kind === 'customer' ? 'customers' : 'suppliers'); };
  const startEdit = (p) => setEdit({ ...p, phones: splitList(p.phones), addresses: splitList(p.addresses, '|') });

  return (
    <>
      <PageHead title={money_ ? c.moneyTitle : c.title} sub={money_ ? c.moneySub : c.sub}>
        <Tabs tabs={money_ ? [['due', kind === 'customer' ? 'With dues' : 'Payable'], ['adv', 'Advance'], ['all', 'All']] : [['all', 'All'], ['inactive', 'Inactive']]} value={filter} onChange={setFilter} />
        {!money_ && (canManage || (kind === 'customer' && can('pos'))) && <Btn kind="primary" onClick={() => setEdit({ name: '', phones: [''], addresses: [''], address: '', opening_balance: 0, note: '' })}>Add {kind}</Btn>}
      </PageHead>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <PartyList kind={kind} mode={mode} filter={filter} rows={rows} loading={list.loading} onOpen={canManage ? (r) => nav(`${path}/${r.id}`) : undefined} />
      {edit && <PartyForm kind={kind} initial={edit} onClose={() => setEdit(null)} onSaved={refreshAll} />}
      {id && canManage && money_ && <PartyDetail kind={kind} id={id} onClose={() => nav(path)} onChanged={list.reload} />}
      {id && canManage && !money_ && !edit && <PartyProfile kind={kind} id={id} list={list.data} onClose={() => nav(path)} onEdit={startEdit} onMoney={() => nav(`${c.moneyPath}/${id}`)} onDeleted={() => { nav(path); refreshAll(); }} />}
    </>
  );
}

/** Customers / Suppliers: who they are. Money (dues, ledger, payments) lives under Collection / Payment. */
function PartyProfile({ kind, id, list, onClose, onEdit, onMoney, onDeleted }) {
  const c = CFG[kind];
  const party = (list || []).find((x) => x.id === id);
  const [confirmUI, ask] = useConfirm();
  const [busy, run] = useAction();
  if (!party) return null;
  const zero = Math.abs(Number(party.balance) || 0) < 0.005;
  const del = async () => {
    if (!(await ask({ title: `Delete ${kind}?`, message: <>Delete <b>“{party.name}”</b> permanently? Only unused records can be deleted. For a record with history, use Edit details → turn Active off.</> }))) return;
    try { await run(() => api(c.del, { id }), `${party.name} deleted`); onDeleted(); } catch { /* toast shown */ }
  };
  const addresses = (party.addresses || party.address || '').split('|').filter(Boolean);
  return (
    <Modal open onClose={onClose} size="md" title={party.name}
      footer={<>
        <Btn onClick={() => onEdit(party)}>Edit details</Btn>
        <Btn kind="danger" busy={busy} disabled={!zero || party.has_history} onClick={del} title={party.has_history ? `This ${kind} has transaction or job history. Turn Active off in Edit details instead.` : zero ? `Delete an unused ${kind}` : `A ${kind} with a balance cannot be deleted`}>Delete</Btn>
        <span className="spacer" />
        <Btn kind="primary" onClick={onMoney}>{kind === 'customer' ? 'Open in Collection' : 'Open in Payment'}</Btn>
      </>}>
      <div className="kv pp-kv">
        <div><span>Phones</span><b>{splitList(party.phones || '').join(', ') || '—'}</b></div>
        <div><span>{addresses.length > 1 ? 'Addresses' : 'Address'}</span><b>{addresses.join('; ') || '—'}</b></div>
        <div><span>Status</span><b>{party.active ? 'Active' : 'Inactive'}{party.combined ? ` · also a ${kind === 'customer' ? 'supplier' : 'customer'}` : ''}</b></div>
        {party.note && <div><span>Note</span><b>{party.note}</b></div>}
      </div>
      <p className="muted pp-note">{kind === 'customer' ? 'Dues, the ledger and collecting payments are under Collection.' : 'What we owe, the ledger and payments are under Payment.'}{party.has_history ? ` This ${kind} has history, so it cannot be deleted — turn Active off in Edit details instead.` : ''}</p>
      {confirmUI}
    </Modal>
  );
}

async function exportParties(kind, ids, how) {
  const c = CFG[kind];
  const docs = await partyStatements(c.statements, ids);
  const name = docs.length === 1 ? `${kind}-${docs[0].party.replace(/[^\w\u0980-\u09ff]+/g, '-')}` : `${kind}s-${docs.length}`;
  if (how === 'excel') return excelParties(kind, docs, `${name}.xlsx`);
  if (how === 'pdf') return pdfParties(kind, docs, `${name}.pdf`);
  return printParties(kind, docs);
}

/** Directory: search, 20 per page by default (20 / 50 / 100 / custom), tick parties to export their details and full ledger. */
function PartyList({ kind, mode, filter, rows, loading, onOpen }) {
  const c = CFG[kind], money_ = mode === 'money';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [PER, setPer] = useState(DEFAULT_PAGE_SIZE);
  const [sel, setSel] = useState({});
  const [busy, setBusy] = useState('');
  const [remind, setRemind] = useState(false);
  const canFn = useStore((s) => s.can);
  const canRemind = money_ && kind === 'customer' && canFn('customers');
  // Reminders go to the ticked customers shown under the current tab, so the button and the window count the same people.
  const remindRows = canRemind ? rows.filter((r) => sel[r.id]) : [];
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter((r) => words.every((w) => `${r.name} ${r.phones || ''} ${r.addresses || r.address || ''}`.toLowerCase().includes(w)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(shown.length / PER)), cur = Math.min(page, pages);
  const pageRows = shown.slice((cur - 1) * PER, cur * PER);
  const ids = Object.keys(sel);
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => sel[r.id]);
  const toggle = (r) => setSel((x) => { const n = { ...x }; if (n[r.id]) delete n[r.id]; else n[r.id] = 1; return n; });
  const togglePage = () => setSel((x) => { const n = { ...x }; pageRows.forEach((r) => { if (allOnPage) delete n[r.id]; else n[r.id] = 1; }); return n; });
  const out = async (how) => { setBusy(how); try { await exportParties(kind, ids, how); } catch (e) { useStore.getState().toast(e.message, 'err'); } finally { setBusy(''); } };
  const total = shown.reduce((a, r) => a + (Number(r.balance) || 0), 0);
  useEffect(() => { setPage(1); }, [q, rows.length]);

  return (
    <div className="dt">
      <div className="dt-bar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or address" aria-label={`Search ${kind}s`} style={{ maxWidth: 340 }} />
        <span className="spacer" />
        {money_ && <div className="pl-export">
          <span className="muted">{ids.length ? `${ids.length} selected` : `Tick ${kind}s to export`}</span>
          {ids.length > 0 && <button className="link" onClick={() => setSel({})}>Clear</button>}
          <div className="seg">
            <button disabled={!ids.length || !!busy} onClick={() => out('excel')}>{busy === 'excel' ? '…' : 'Excel'}</button>
            <button disabled={!ids.length || !!busy} onClick={() => out('pdf')}>{busy === 'pdf' ? '…' : 'PDF'}</button>
            <button disabled={!ids.length || !!busy} onClick={() => out('print')}>{busy === 'print' ? '…' : 'Print'}</button>
          </div>
          {canRemind && <Btn kind="primary" size="sm" disabled={!remindRows.length} onClick={() => setRemind(true)} title={remindRows.length ? 'Send a due reminder SMS to the ticked customers' : 'Tick customers first'}>Send due reminder{remindRows.length ? ` (${remindRows.length})` : ''}</Btn>}
        </div>}
      </div>
      <div className="dt-scroll"><table className="pl-table">
        <thead><tr>
          {money_ && <th style={{ width: 36 }}><input type="checkbox" checked={allOnPage} onChange={togglePage} aria-label="Select all on this page" /></th>}
          <th>Name</th><th>Phones</th><th>Address</th>{money_ && <><th className="r">{kind === 'customer' ? 'Due' : 'We owe'}</th><th /></>}
        </tr></thead>
        <tbody>{pageRows.map((r) => (
          <tr key={r.id} className={sel[r.id] ? 'picked' : ''} onClick={() => onOpen && onOpen(r)} style={{ cursor: onOpen ? 'pointer' : 'default' }}>
            {money_ && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={!!sel[r.id]} onChange={() => toggle(r)} aria-label={`Select ${r.name}`} /></td>}
            <td><b>{r.name}</b>{r.combined && <> <Badge tone="violet">Combined</Badge></>}{!r.active && <> <Badge>inactive</Badge></>}</td>
            <td>{splitList(r.phones || '').join(', ')}</td>
            <td className="clip">{(r.addresses || r.address || '').split('|').filter(Boolean).join('; ')}</td>
            {money_ && <><td className="r num"><b style={{ color: r.balance > 0 ? 'var(--warn)' : r.balance < 0 ? 'var(--ok)' : undefined }}>{money(r.balance, false)}</b></td>
            <td>{r.balance > 0.004 ? <Badge tone="warn">{c.pos}</Badge> : r.balance < -0.004 ? <Badge tone="ok">{c.neg}</Badge> : null}{r.next_payment_date && <small className={`pl-promise ${r.next_payment_date <= today() ? 'late' : ''}`}> promised {fdate(r.next_payment_date)}</small>}</td></>}
          </tr>
        ))}</tbody>
        {money_ && shown.length > 0 && <tfoot><tr><td /><td colSpan={3}><b>Total of {shown.length} {kind}{shown.length === 1 ? '' : 's'}</b></td><td className="r num"><b>{money(total, false)}</b></td><td /></tr></tfoot>}
      </table>
      {loading && !rows.length && <Loading />}
      {!loading && !shown.length && <div className="empty"><b>{money_ && !q && filter === 'due' ? (kind === 'customer' ? 'No customer owes anything' : 'Nothing is owed to suppliers') : `No ${kind}s found`}</b><div>{q ? 'Try another search.' : money_ ? (filter === 'due' ? 'Open the All tab to find someone and record a payment.' : 'Nothing under this tab.') : `Add your first ${kind}.`}</div></div>}
      </div>
      <Pager page={cur - 1} pageSize={PER} total={shown.length} label={`${kind}s`} onPage={(n) => setPage(n + 1)} onPageSize={(n) => { setPer(n); setPage(1); }} />
      {remind && <DueReminder customers={remindRows} onClose={() => setRemind(false)} />}
    </div>
  );
}

function PartyForm({ kind, initial, onClose, onSaved }) {
  const c = CFG[kind];
  const can = useStore((s) => s.can);
  const booksClosed = useStore((s) => !!s.settings.books_locked_until);
  const [f, setF] = useState({ ...initial, phones: initial.phones?.length ? initial.phones : [''], addresses: initial.addresses?.length ? initial.addresses : [''] });
  const [busy, run] = useAction();
  const save = async () => {
    const payload = { ...f, phones: f.phones.filter(Boolean), addresses: kind === 'customer' ? f.addresses.filter(Boolean) : undefined };
    await run(() => api(c.save, payload), f.id ? 'Saved' : `${kind === 'customer' ? 'Customer' : 'Supplier'} added`);
    useStore.getState().refresh('customers', 'suppliers').catch(() => {});
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
        {can(c.perm) && <Field label="Opening balance" hint={booksClosed ? 'Books are closed. Reopen them before changing opening balances.' : kind === 'customer' ? 'Old due carried over (negative = advance).' : 'Amount we already owed (negative = advance paid).'}><input type="number" step="any" value={f.opening_balance} disabled={booksClosed} onChange={(e) => setF({ ...f, opening_balance: e.target.value })} /></Field>}
        <Field label="Note" wide><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        {(can('customers') && can('suppliers')) && (
          <div className="wide combined-box">
            <label className="check"><input type="checkbox" checked={!!f.combined} onChange={(e) => setF({ ...f, combined: e.target.checked })} /> <b>Combined</b> — also a {kind === 'customer' ? 'supplier' : 'customer'}</label>
            <p className="muted">Tick this for someone you both buy from and sell to (e.g. CASH SALE / CASH PURCHASE, or a dealer). They appear in Customers and Suppliers, so you can sell to them at the POS and buy from them in Purchases. Name, phone and address stay the same on both sides.</p>
          </div>
        )}
        {f.id && <label className="check"><input type="checkbox" checked={f.active !== false} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>}
      </div>
    </Modal>
  );
}

function PartyDetail({ kind, id, onClose, onChanged }) {
  const c = CFG[kind];
  const { accounts, can } = useStore();
  const [range, setRange] = useState({ from: '', to: '' });
  const st = useApi(c.statement, { [c.key]: id, ...range });
  const partyList = useApi(c.list, {});
  const party = partyList.data?.find((x) => x.id === id);
  const [pay, setPay] = useState(false);
  const [rev, setRev] = useState(null);
  // Full-period statement closing is the live balance; with a date filter fall back to the directory balance.
  const liveBal = st.data && !range.from && !range.to ? st.data.closing : Number(party?.balance) || 0;
  return (
    <Modal open onClose={onClose} size="lg" title={st.data ? st.data.party : 'Ledger'}
      footer={st.data && <>
        <div className="seg">
          <button onClick={() => exportParties(kind, [id], 'excel')}>Excel</button>
          <button onClick={() => exportParties(kind, [id], 'pdf')}>PDF</button>
          <button onClick={() => printStatement(kind, st.data, range.from, range.to)}>Print</button>
        </div>
        <span className="spacer" />
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
              {party?.combined && party.link_balance !== undefined && <div><span>As {kind === 'customer' ? 'supplier (you owe)' : 'customer (owes you)'}</span><b>{money(party.link_balance)}</b></div>}
              <div><span>Closing balance</span><b style={{ color: st.data.closing > 0 ? 'var(--warn)' : 'var(--ok)' }}>{money(st.data.closing)} {st.data.closing > 0 ? `(${c.pos.toLowerCase()})` : st.data.closing < 0 ? `(${c.neg.toLowerCase()})` : ''}</b></div>
            </div>
            <DateRange {...range} onChange={setRange} />
          </div>
          {kind === 'customer' && party?.next_payment_date && (
            <div className={`rb-pending promise-bar ${party.next_payment_date <= today() ? 'late' : ''}`} role="region" aria-label="Promised payment">
              <div className="rb-pend-row" style={{ marginTop: 0 }}>
                <span>🔔 Promised to pay the rest on <b>{fdate(party.next_payment_date)}</b>{party.next_payment_date <= today() ? ' — due now' : ''}</span>
                <span className="spacer" />
                <Btn size="sm" onClick={async () => { await api('customer.promise', { customer_id: id, next_payment_date: '' }); useStore.getState().toast('Reminder removed', 'ok'); onChanged(); partyList.reload(); }}>Remove reminder</Btn>
              </div>
            </div>
          )}
          <DataTable keepOrder title={`${st.data.party} statement`} rows={st.data.rows} searchable={false}
            columns={[
              { key: 'date', label: 'Date', type: 'date' }, { key: 'ref_no', label: 'Ref' }, { key: 'note', label: 'Details', className: 'clip' },
              { key: 'debit', label: c.debit, type: 'money', sum: true }, { key: 'credit', label: c.credit, type: 'money', sum: true },
              { key: 'balance', label: 'Balance', type: 'money' },
              ...(kind === 'customer' ? [{key:'receipt',label:'',noSort:true,noExport:true,render:(r)=>r.type==='payment' && <button className="link" onClick={()=>printMoneyReceipt({receipt_no:r.ref_no,customer:st.data.party,amount:r.credit,balance:r.balance,account:r.note.match(/\[([^\]]+)\]$/)?.[1] || r.note,date:r.date})}>Print receipt</button>}] : []),
              ...(can('cancel') ? [{ key: 'x', label: '', noSort: true, noExport: true, render: (r) => (r.type === 'payment' || r.type === 'refund') && <button className="link" style={{ color: 'var(--bad)' }} onClick={() => setRev({ type: c.revType, id: r.id, label: `payment ${r.ref_no}` })}>Void</button> }] : [])
            ]} />
        </>
      )}
      {pay && <PaymentForm kind={kind} id={id} name={st.data?.party} balance={liveBal} accounts={accounts} onClose={() => setPay(false)} onDone={() => { st.reload(); onChanged(); partyList.reload(); }} />}
      <ReverseDialog open={!!rev} {...(rev || {})} onClose={() => setRev(null)} onDone={() => { st.reload(); onChanged(); }} />
    </Modal>
  );
}

function PaymentForm({ kind, id, name, balance, accounts, onClose, onDone }) {
  const c = CFG[kind];
  const refresh = useStore((s) => s.refresh);
  const [f, setF] = useState({ direction: c.dirs[0][0], amount: balance > 0 ? balance : '', account_id: accounts[0]?.id || '', note: '', date: '', next_payment_date: '' });
  const [print, setPrint] = useState(kind === 'customer');
  const [busy, run] = useAction();
  useEffect(() => { if (!f.account_id && accounts[0]) setF((x) => ({ ...x, account_id: accounts[0].id })); }, [accounts, f.account_id]);
  const returningAdvance = kind === 'customer' && f.direction === 'pay';
  const availableAdvance = Math.max(-Number(balance || 0), 0);
  const invalidAmount = !Number.isFinite(Number(f.amount)) || Number(f.amount) <= 0 || (returningAdvance && Number(f.amount) > availableAdvance + 0.005);
  // Collecting less than the customer owes: ask when the rest will be paid, for a dashboard reminder on that day.
  const rest = kind === 'customer' && f.direction === 'receive' && balance > 0.004 && Number(f.amount) > 0 ? roundDecimal(balance - Number(f.amount), 2) : 0;
  const partPaid = rest > 0.004;
  const save = async () => {
    const r = await run(() => api(c.payment, { [c.key]: id, ...f, amount: Number(f.amount), next_payment_date: partPaid ? f.next_payment_date : '' }), partPaid && f.next_payment_date ? `Payment recorded · reminder set for ${fdate(f.next_payment_date)}` : 'Payment recorded');
    if (print && !r?.pending_approval && kind === 'customer' && f.direction === 'receive') printMoneyReceipt(r); // held for an admin: no receipt yet
    refresh(kind === 'customer' ? 'customers' : 'suppliers');
    onDone(); onClose();
  };
  return (
    <Modal open onClose={onClose} size="sm" title={`${c.payLabel} — ${name}`} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={invalidAmount} onClick={save}>Save payment</Btn></>}>
      <div className="form">
        {c.dirs.length > 1 && <Field label="Type" wide><select value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}>{c.dirs.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>}
        <Field label="Amount" wide hint={returningAdvance ? `Available advance ${money(availableAdvance)}. Refund cannot exceed this amount.` : `Current balance ${money(balance)}`}><input type="number" step="any" min="0" max={returningAdvance ? availableAdvance : undefined} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Account" wide><Select value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} options={accounts} allowEmpty={false} /></Field>
        {partPaid && (
          <div className="field wide next-due">
            <span className="field-label">Next payment date <small className="muted">(optional)</small></span>
            <DateInput value={f.next_payment_date} min={today()} onChange={(e) => setF({ ...f, next_payment_date: e.target.value })} aria-label="Next payment date" />
            <span className="field-hint"><b>{money(rest)}</b> will still be due. Choose when the customer promised to pay it — a reminder appears on the dashboard that day.</span>
          </div>
        )}
        <Field label="Note" wide><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. part payment for INV-000123" /></Field>
        {kind === 'customer' && f.direction === 'receive' && <label className="check"><input type="checkbox" checked={print} onChange={(e) => setPrint(e.target.checked)} /> Print money receipt</label>}
      </div>
    </Modal>
  );
}
