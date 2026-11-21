import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, qty, fdate, fdatetime } from '../lib/format';
import DataTable from '../components/DataTable';
import { useApi, PageHead, Tabs, Badge, Modal, Btn, Field, ErrorBox, Empty } from '../components/ui';

/** The five kinds of work a staff member may have to send to an admin (Users & Roles → Approvals). */
export const APPROVAL_PAGES = {
  purchase: ['Purchase approval', 'Purchases entered by staff who need an admin\'s approval. Stock and supplier dues change only after approval.'],
  payment: ['Payment approval', 'Supplier payments waiting for an admin. Cash and supplier balances change only after approval.'],
  collection: ['Collection approval', 'Money collected from customers, waiting for an admin. Customer dues change only after approval.'],
  expense: ['Expenses approval', 'Expenses waiting for an admin. Cash changes only after approval.'],
  transfer: ['Branch transfer approval', 'Stock to send to another branch, waiting for an admin. Stock leaves the branch only after approval.']
};
const TONE = { pending: 'warn', approved: 'ok', rejected: 'bad' };

export default function Approvals() {
  const { kind = 'purchase' } = useParams();
  const page = APPROVAL_PAGES[kind] || APPROVAL_PAGES.purchase;
  const [status, setStatus] = useState('pending');
  const q = useApi('approvals.list', { kind, status }, [kind, status]);
  const [open, setOpen] = useState(null);
  const d = q.data;
  const admin = !!d?.admin;
  const transfer = kind === 'transfer';
  return (
    <>
      <PageHead title={page[0]} sub={page[1]}>
        <Tabs tabs={[['pending', `Waiting${d?.pending?.[kind] ? ` (${d.pending[kind]})` : ''}`], ['approved', 'Approved'], ['rejected', 'Rejected'], ['', 'All']]} value={status} onChange={setStatus} />
      </PageHead>
      <ErrorBox error={q.error} onRetry={q.reload} />
      <DataTable title={page[0]} loading={q.loading} rows={d?.rows || []} onRowClick={(r) => setOpen(r)}
        empty={<Empty icon="check" title={status === 'pending' ? (admin ? 'Nothing is waiting for your approval' : 'You have nothing waiting for approval') : 'Nothing here yet'}>{admin ? 'Requests from the staff you chose in Users & Roles → Approvals appear here.' : 'Your work that needs an admin\'s approval appears here.'}</Empty>}
        columns={[
          { key: 'created_at', label: 'Date', type: 'date', render: (r) => fdatetime(r.created_at) },
          { key: 'no', label: 'Request #' },
          { key: 'user_name', label: 'Sent by' },
          ...(d?.rows?.some((r) => r.branch_name) ? [{ key: 'branch_name', label: 'Branch' }] : []),
          { key: 'party', label: transfer ? 'From → to' : kind === 'expense' ? 'Category' : kind === 'collection' ? 'Customer' : 'Supplier', value: (r) => r.summary?.party || '' },
          ...(transfer ? [{ key: 'items', label: 'Items', value: (r) => (r.summary?.lines || []).map((l) => `${l.name} × ${qty(l.qty)}`).join(', '), className: 'clip' }]
            : [{ key: 'amount', label: 'Amount', type: 'money', sum: true, value: (r) => r.summary?.amount || 0 }]),
          { key: 'status', label: 'Status', render: (r) => <Badge tone={TONE[r.status]}>{r.status === 'pending' ? 'waiting' : r.status}</Badge> },
          { key: 'decided', label: 'Decision', value: (r) => (r.status === 'pending' ? '' : `${r.decided_by} · ${fdate(r.decided_at)}${r.result_no ? ` · ${r.result_no}` : ''}${r.reason ? ` · ${r.reason}` : ''}`), className: 'clip' },
          ...(admin ? [{ key: 'act', label: '', noSort: true, noExport: true, render: (r) => r.status === 'pending' && <Btn size="sm" kind="primary" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>Review</Btn> }] : [])
        ]} />
      {open && <ApprovalDialog a={open} admin={admin} onClose={() => setOpen(null)} onDone={() => { setOpen(null); q.reload(); }} />}
    </>
  );
}

/** One request: what it is, line by line; an admin approves it or rejects it with a reason. */
export function ApprovalDialog({ a, admin, onClose, onDone }) {
  const toast = useStore((s) => s.toast);
  const refresh = useStore((s) => s.refresh);
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const s = a.summary || {};
  const decide = async (decision) => {
    setBusy(decision);
    try {
      const r = await api('approval.decide', { id: a.id, decision, reason });
      toast(decision === 'approve' ? `${a.no} approved${r.result_no ? ` — saved as ${r.result_no}` : ''}` : `${a.no} rejected`, 'ok');
      if (decision === 'approve') refresh?.('products', 'customers', 'suppliers', 'accounts');
      onDone?.(r);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(''); }
  };
  const lines = s.lines || [];
  const pending = a.status === 'pending';
  return (
    <Modal open onClose={onClose} title={`${a.kind_label} · ${a.no}`} size="md"
      footer={<>
        <Btn onClick={onClose}>Close</Btn>
        {admin && pending && !reject && <Btn kind="danger" onClick={() => setReject(true)}>Reject</Btn>}
        {admin && pending && reject && <Btn kind="danger" busy={busy === 'reject'} disabled={!reason.trim()} onClick={() => decide('reject')}>Reject request</Btn>}
        {admin && pending && !reject && <Btn kind="primary" busy={busy === 'approve'} onClick={() => decide('approve')}>Approve</Btn>}
      </>}>
      <div className="apr-head">
        <div><small className="muted">Sent by</small><b>{a.user_name}</b></div>
        <div><small className="muted">When</small><b>{fdatetime(a.created_at)}</b></div>
        {a.branch_name && <div><small className="muted">Branch</small><b>{a.branch_name}</b></div>}
        <div><small className="muted">Status</small><Badge tone={TONE[a.status]}>{pending ? 'waiting' : a.status}</Badge></div>
      </div>
      <div className="apr-main">
        <div className="apr-party"><small className="muted">{a.kind === 'transfer' ? 'From → to' : a.kind === 'expense' ? 'Category' : a.kind === 'collection' ? 'Customer' : 'Supplier'}</small><b>{s.party || '—'}</b>
          {s.account && <small>{a.kind === 'collection' ? 'Into' : 'From'}: {s.account}</small>}
          {s.ref && <small>Supplier invoice: {s.ref}</small>}
          {s.date && <small>Date: {fdate(s.date)}</small>}
        </div>
        {a.kind !== 'transfer' && <div className="apr-amt"><small className="muted">{a.kind === 'collection' && s.direction === 'pay' ? 'Paid back' : 'Amount'}</small><b className="num">{money(s.amount)}</b>{a.kind === 'purchase' && s.paid > 0 && <small>Paid now {money(s.paid)}</small>}</div>}
      </div>
      {lines.length > 0 && (
        <table className="apr-lines">
          <thead><tr><th>Product</th><th className="r">Qty</th>{a.kind === 'purchase' && <><th className="r">Cost</th><th className="r">Amount</th></>}</tr></thead>
          <tbody>{lines.map((l, i) => <tr key={i}><td>{l.name}{l.serials ? <div className="sn">{l.serials}</div> : null}</td><td className="r">{qty(l.qty)}</td>{a.kind === 'purchase' && <><td className="r">{money(l.price, false)}</td><td className="r">{money(l.total, false)}</td></>}</tr>)}</tbody>
        </table>
      )}
      {s.note && <p className="apr-note"><b>Note:</b> {s.note}</p>}
      {!pending && <p className="apr-note">{a.status === 'approved' ? 'Approved' : 'Rejected'} by <b>{a.decided_by}</b> on {fdatetime(a.decided_at)}{a.result_no ? <> — saved as <b>{a.result_no}</b></> : null}{a.reason ? <> — reason: <b>{a.reason}</b></> : null}</p>}
      {reject && <Field label="Why is it rejected?" wide><textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus placeholder="The staff member sees this reason" aria-label="Reason for rejecting" /></Field>}
      {admin && pending && !reject && <p className="muted apr-hint">Approve saves it now as {a.user_name}'s work{a.branch_name ? ` in ${a.branch_name}` : ''}. Nothing has changed in stock, cash or dues until then.</p>}
    </Modal>
  );
}
