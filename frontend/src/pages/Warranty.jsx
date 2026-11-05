import { useState } from 'react';
import { api } from '../lib/api';
import { fdate, fdatetime } from '../lib/format';
import { printHtml, esc } from '../lib/export';
import { useStore } from '../lib/store';
import DataTable from '../components/DataTable';
import { useApi, PageHead, Tabs, Modal, Btn, Field, Badge, statusTone, useAction, ErrorBox, Empty } from '../components/ui';

const STATUSES = ['Pending', 'Sent to Vendor', 'Repaired', 'Replaced', 'Delivered', 'Rejected'];

export default function Warranty() {
  const [status, setStatus] = useState('open');
  const list = useApi('claims.list', { status: status === 'all' ? '' : status });
  const [newOpen, setNewOpen] = useState(false);
  const [sel, setSel] = useState(null);

  return (
    <>
      <PageHead title="Warranty claims" sub="Receive faulty items, send them to the vendor, and track every step until delivery.">
        <Btn kind="primary" onClick={() => setNewOpen(true)}>Receive warranty item</Btn>
      </PageHead>
      <div className="filters">
        <Tabs tabs={[['open', 'Open'], ...STATUSES.map((s) => [s, s]), ['all', 'All']]} value={status} onChange={setStatus} />
      </div>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <DataTable title="Warranty claims" loading={list.loading} rows={list.data || []} onRowClick={setSel}
        columns={[
          { key: 'claim_no', label: 'Claim #' }, { key: 'date', label: 'Received', type: 'date' },
          { key: 'product_name', label: 'Product' }, { key: 'serial', label: 'Serial' }, { key: 'invoice_no', label: 'Invoice' },
          { key: 'customer_name', label: 'Customer' }, { key: 'phone', label: 'Phone' }, { key: 'issue', label: 'Problem', className: 'clip' },
          { key: 'in_warranty', label: 'Coverage', value: (r) => (r.in_warranty ? 'In warranty' : 'Expired'), render: (r) => <Badge tone={r.in_warranty ? 'ok' : 'bad'}>{r.in_warranty ? 'In warranty' : 'Expired'}</Badge> },
          { key: 'vendor', label: 'Vendor' },
          { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> }
        ]} />
      {newOpen && <NewClaim onClose={() => setNewOpen(false)} onDone={list.reload} />}
      {sel && <ClaimDetail claim={sel} onClose={() => setSel(null)} onDone={() => { list.reload(); setSel(null); }} />}
    </>
  );
}

function NewClaim({ onClose, onDone }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [pick, setPick] = useState(null);
  const [issue, setIssue] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, run] = useAction();
  const search = async (e) => { e?.preventDefault(); setPick(null); setRes(await run(() => api('warranty.lookup', { q }))); };
  const save = async () => {
    const c = await run(() => api('claim.create', { sale_id: pick.sale_id, sale_item_id: pick.sale_item_id, serial: pick.serial, issue, phone }), 'Warranty claim created');
    printClaimSlip(c);
    onDone(); onClose();
  };
  return (
    <Modal open onClose={onClose} size="lg" title="Receive warranty item"
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!pick} onClick={save}>Create claim & print slip</Btn></>}>
      <form className="row" onSubmit={search}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Scan serial number or type invoice number" style={{ flex: 1 }} autoFocus />
        <Btn kind="primary" busy={busy} type="submit">Find</Btn>
      </form>
      {res && !res.length && <Empty title="No sold item found">Check the serial or invoice number. Items that were never sold from this shop cannot be claimed.</Empty>}
      {res && res.length > 0 && (
        <div className="dt" style={{ marginTop: 12 }}><div className="dt-scroll"><table>
          <thead><tr><th /><th>Product</th><th>Serial</th><th>Invoice</th><th>Customer</th><th>Warranty</th><th>Claims</th></tr></thead>
          <tbody>{res.map((r, i) => (
            <tr key={i} className="click" onClick={() => { setPick(r); }}>
              <td><input type="radio" checked={pick === r} onChange={() => setPick(r)} aria-label="Select item" /></td>
              <td>{r.product_name}</td><td>{r.serial || '—'}</td><td>{r.invoice_no}<div className="muted">{fdate(r.sale_date)}</div></td><td>{r.customer_name}</td>
              <td>{r.expiry ? <Badge tone={r.in_warranty ? 'ok' : 'bad'}>{r.in_warranty ? `${r.days_left} days left` : `Expired ${fdate(r.expiry)}`}</Badge> : <Badge>No warranty</Badge>}</td>
              <td>{r.claims.map((c) => <div key={c.id}>{c.claim_no} <Badge tone={statusTone(c.status)}>{c.status}</Badge></div>)}</td>
            </tr>
          ))}</tbody>
        </table></div></div>
      )}
      {pick && (
        <div className="form" style={{ marginTop: 14 }}>
          {!pick.in_warranty && <div className="errbox wide">This item is out of warranty. You can still log it as a paid service job.</div>}
          <Field label="Problem reported" wide><textarea value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="e.g. Not detected in BIOS, no display" /></Field>
          <Field label="Contact phone" hint="Leave blank to use the customer's saved number."><input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        </div>
      )}
    </Modal>
  );
}

function ClaimDetail({ claim, onClose, onDone }) {
  const [status, setStatus] = useState(claim.status);
  const [vendor, setVendor] = useState(claim.vendor || '');
  const [note, setNote] = useState('');
  const [busy, run] = useAction();
  const save = async () => { await run(() => api('claim.update', { id: claim.id, status, vendor, note }), `Claim marked ${status}`); onDone(); };
  return (
    <Modal open onClose={onClose} size="md" title={`Claim ${claim.claim_no}`}
      footer={<><Btn onClick={() => printClaimSlip(claim)}>Print slip</Btn><span className="spacer" /><Btn onClick={onClose}>Close</Btn><Btn kind="primary" busy={busy} onClick={save} disabled={status === claim.status && !note && vendor === claim.vendor}>Update claim</Btn></>}>
      <div className="kv">
        <div><span>Product</span><b>{claim.product_name}</b></div><div><span>Serial</span><b>{claim.serial || '—'}</b></div>
        <div><span>Invoice</span><b>{claim.invoice_no}</b></div><div><span>Customer</span><b>{claim.customer_name} {claim.phone}</b></div>
        <div><span>Warranty until</span><b>{fdate(claim.expiry) || '—'}</b></div><div><span>Problem</span><b>{claim.issue}</b></div>
      </div>
      <h3 style={{ margin: '18px 0 10px' }}>Progress</h3>
      <ul className="timeline">
        {claim.log.map((l, i) => <li key={i} data-k="warranty"><div className="t-head"><b>{l.status}</b><span className="t-meta">{fdatetime(l.ts)} · {l.user}</span></div>{l.note && <div>{l.note}</div>}</li>)}
      </ul>
      <div className="form" style={{ marginTop: 6 }}>
        <Field label="New status"><select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Vendor / service centre"><input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. Smart Technologies" /></Field>
        <Field label="Note" wide><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Replacement serial ABC123" /></Field>
      </div>
    </Modal>
  );
}

function printClaimSlip(c) {
  const s = useStore.getState().settings;
  printHtml(`<style>@page{size:80mm auto;margin:0}body{margin:0;width:72mm;padding:3mm 4mm;font:11px/1.4 'Courier New',monospace}.c{text-align:center}hr{border:0;border-top:1px dashed #000}</style>
  <div class="c"><b style="font-size:15px">${esc(s.shop_name)}</b><div>${esc(s.shop_phone || '')}</div></div><hr>
  <div class="c"><b>WARRANTY RECEIVING SLIP</b></div>
  <div>Claim: <b>${esc(c.claim_no)}</b></div><div>Date: ${esc(fdate(c.date))}</div><div>Customer: ${esc(c.customer_name)} ${esc(c.phone || '')}</div>
  <div>Invoice: ${esc(c.invoice_no)}</div><div>Item: ${esc(c.product_name)}</div><div>Serial: ${esc(c.serial || '—')}</div>
  <div>Problem: ${esc(c.issue || '')}</div><div>Warranty till: ${esc(fdate(c.expiry) || 'N/A')} ${c.in_warranty ? '' : '(EXPIRED)'}</div><hr>
  <div class="sm">Please bring this slip when collecting your item. Delivery time depends on the vendor.</div><br><br><div>Customer signature ____________</div>`);
}
