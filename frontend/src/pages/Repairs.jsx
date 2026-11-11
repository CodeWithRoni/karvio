import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { money, fdate, fdatetime, round2 } from '../lib/format';
import { printHtml, esc, shopContacts } from '../lib/export';
import { printInvoice } from '../lib/receipt';
import { useStore } from '../lib/store';
import DataTable from '../components/DataTable';
import { useApi, PageHead, Tabs, Modal, Btn, Field, Badge, useAction, ErrorBox, Select } from '../components/ui';
import { CustomerPicker, ProductSearch, SerialChooser } from '../components/widgets';
import {repairPeriods,jobsInPeriod,repairCounts} from '../lib/repairDashboard';

// Repair jobs: Received → Completed or Failed → Delivered (or Cancelled).
// The advance is a customer payment; delivery makes a normal invoice (parts + "Repair service" charge).
// The technician gets the job by SMS; Completed / Failed shows an alert on the admins' dashboard.
const TONE = { Received: 'warn', Completed: 'info', Failed: 'bad', Delivered: 'ok', Cancelled: 'bad' };
const OPEN = ['Received', 'Completed', 'Failed'];
const smsNote = (r, who) => {
  if (!r) return;
  const toast = useStore.getState().toast;
  if (r.ok) toast(`SMS sent to ${who}`); else if (r.status !== 'queued') toast(`SMS to ${who}: ${r.status}${r.response ? ` — ${r.response}` : ''}`, 'err');
};
const isSerial = (p) => !!p && !p.service && p.has_warranty && p.warranty_type === 'serial';
const partsTotal = (parts) => round2(parts.reduce((a, x) => a + (Number(x.qty) || 0) * (Number(x.price) || 0), 0));

export default function Repairs() {
  const [tab, setTab] = useState('open');
  const [tech, setTech] = useState('');
  const jobsRef = useRef(null);
  const showJobs = () => requestAnimationFrame(()=>jobsRef.current?.scrollIntoView({block:'start'}));
  const [period,setPeriod]=useState(null);
  const meta = useApi('repairs.meta', {}, [], {refreshMs:60000});
  const list = useApi('repairs.list', {}, [], {refreshMs:15000});
  const periods=repairPeriods(meta.data?.today);
  const activePeriod=periods.find(p=>p.key===period?.key)||period;
  const scope=(list.data||[]).filter(r=>!tech||r.technician_id===tech);
  const periodRows=activePeriod?jobsInPeriod(scope,activePeriod):scope;
  const rows = periodRows.filter(r=>tab==='all'||(tab==='open'?OPEN.includes(r.status):r.status===tab));
  const [form, setForm] = useState(null); // {} = new job, or the job being edited
  const [searchParams,setSearchParams] = useSearchParams();
  useEffect(()=>{
    if(searchParams.get('new')!=='1')return;
    setForm({});
    const next=new URLSearchParams(searchParams);next.delete('new');
    setSearchParams(next,{replace:true});
  },[searchParams,setSearchParams]);
  const [sel, setSel] = useState(null);
  const done = (job) => { list.reload(); setForm(null); setSel(job || null); };
  // #/repairs/<id> (from a dashboard alert) opens that job
  const { id } = useParams();
  const nav = useNavigate();
  useEffect(() => {
    if (!id) return;
    api('repair.get', { id }).then(setSel).catch((e) => useStore.getState().toast(e.message, 'err'));
  }, [id]);
  const closeSel = () => { setSel(null); if (id) nav('/repairs'); };

  return (
    <>
      <PageHead title="Repairs" sub="Job cards for devices left at the shop: receive, repair, mark ready and deliver with an invoice.">
        <Btn onClick={()=>{setTech('');setPeriod(null);setTab('all');showJobs();}}>All repair jobs</Btn>
        <Btn kind="primary" onClick={() => setForm({})} disabled={!meta.data}>New repair job</Btn>
      </PageHead>
      <ErrorBox error={list.error || meta.error} onRetry={() => { list.reload(); meta.reload(); }} />
      <>
        <p className="muted">By received date · week starts Saturday · Last 3/6 Months includes the current month. Pending = Received; Complete = Completed. Delivered and Cancelled remain available in each period’s list.</p>
        {meta.loading&&!meta.data&&<p role="status">Loading repair dashboard…</p>}
        <div className="repair-dashboard">
          {periods.map(p=>{
            const jobs=jobsInPeriod(scope,p),counts=repairCounts(jobs);
            return <section className="repair-period" key={p.key} aria-label={p.label}>
              <button type="button" className="repair-period-title" onClick={()=>{setPeriod(p);setTab('all');showJobs();}} aria-label={`View ${p.label} repair jobs`}>
                <h2>{p.label}</h2><small>{fdate(p.from)}{p.from!==p.to?` – ${fdate(p.to)}`:''}</small>
              </button>
              <div className="repair-period-counts">{[['pending','Pending','Received'],['complete','Complete','Completed'],['failed','Failed','Failed']].map(([key,label,status])=><button type="button" key={key} className={`repair-count repair-${key}`} aria-label={`${p.label} ${label}: ${counts[key]}`} onClick={()=>{setPeriod(p);setTab(status);showJobs();}}><span>{label}</span><strong>{list.loading&&!list.data?'—':counts[key]}</strong></button>)}</div>
              <button type="button" className="repair-period-footer" onClick={()=>{setPeriod(p);setTab('all');showJobs();}}>View {jobs.length} jobs →</button>
            </section>;
          })}
        </div>
      </>
      <section className="repair-jobs-section" ref={jobsRef} aria-label="Repair job list">
      <div className="repair-list-heading"><div><h2>Repair jobs</h2><p className="muted">{activePeriod?`${activePeriod.label} · Received ${fdate(activePeriod.from)} – ${fdate(activePeriod.to)}`:'All received dates'}</p></div><Btn size="sm" onClick={()=>{setPeriod(null);setTech('');setTab('all');}}>Reset filters</Btn></div>
      <div className="filters">
        <Tabs tabs={[['open', 'Open'], ['Received', 'Received'], ['Completed', 'Completed'], ['Failed', 'Failed'], ['Delivered', 'Delivered'], ['Cancelled', 'Cancelled'], ['all', 'All']]} value={tab} onChange={setTab} />
        <Select value={period?.key||''} onChange={key=>setPeriod(periods.find(p=>p.key===key)||null)} options={periods.map(p=>({id:p.key,name:p.label}))} placeholder="All received dates" aria-label="Received period" />
        <Select value={tech} onChange={setTech} options={meta.data?.technicians || []} placeholder="All technicians" aria-label="Technician" />
      </div>
      <DataTable title="Repair jobs" loading={list.loading} rows={rows} pageSize={10} onRowClick={setSel}
        columns={[
          { key: 'job_no', label: 'Job #' }, { key: 'date', label: 'Received', type: 'date' },
          { key: 'customer_name', label: 'Customer' }, { key: 'phone', label: 'Phone' },
          { key: 'device', label: 'Device' }, { key: 'problem', label: 'Problem', className: 'clip' },
          { key: 'technician_name', label: 'Technician' },
          { key: 'total', label: 'Total', type: 'money', sum: true }, { key: 'advance', label: 'Advance', type: 'money', sum: true },
          { key: 'due', label: 'Due', type: 'money', sum: true, value: (r) => (OPEN.includes(r.status) ? r.due : 0) },
          { key: 'status', label: 'Status', render: (r) => <Badge tone={TONE[r.status]}>{r.status}</Badge> }
        ]} />
      </section>
      {form && meta.data && <JobForm job={form.id ? form : null} meta={meta.data} onClose={() => setForm(null)} onDone={done} />}
      {sel && !form && meta.data && <JobDetail key={`${sel.id}-${sel.status}-${sel.updated_at || ''}`} job={sel} meta={meta.data} onClose={closeSel} onEdit={() => setForm(sel)} onDone={done} />}
    </>
  );
}

/* ---------------- New job / edit an open job ---------------- */
function JobForm({ job, meta, onClose, onDone }) {
  const products = useStore((s) => s.products);
  const can = useStore((s) => s.can);
  const pmap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const [f, setF] = useState(() => job ? {
    device: job.device, serial: job.serial, problem: job.problem, accessories: job.accessories, technician_id: job.technician_id,
    estimate: job.estimate || '', charge: job.charge || '', note: job.note,
    parts: (job.parts || []).map((x) => ({ ...x, serials: String(x.serials || '').split(',').filter(Boolean) }))
  } : { customer_id: '', customer_name: '', phone: '', device: '', serial: '', problem: '', accessories: '', technician_id: '', estimate: '', charge: '', note: '', parts: [] });
  const [adv, setAdv] = useState({ amount: '', account_id: meta.accounts[0]?.id || '' });
  const [busy, run] = useAction();
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const setPart = (i, patch) => set({ parts: f.parts.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const addPart = (p) => {
    if (f.parts.some((x) => x.product_id === p.id)) return useStore.getState().toast(`${p.name} is already in the parts list`, 'err');
    set({ parts: [...f.parts, { product_id: p.id, name: p.name, unit: p.unit, qty: isSerial(p) ? 0 : 1, price: p.sale_price, serials: [] }] });
  };
  const total = round2(partsTotal(f.parts) + (Number(f.charge) || 0));
  // Technicians come from Users & Roles (role Technician); a person already on the job stays in the list.
  const techs = job && job.technician_id && !meta.technicians.some((u) => u.id === job.technician_id)
    ? [...meta.technicians, { id: job.technician_id, name: job.technician_name, phone: '' }] : meta.technicians;
  const techPhone = (techs.find((u) => u.id === f.technician_id) || {}).phone;
  const customerOk = job || f.customer_id || (f.customer_name.trim() && f.phone.trim());

  const save = async (print) => {
    const payload = {
      ...(job ? { id: job.id } : { customer_id: f.customer_id, customer_name: f.customer_name, phone: f.phone }),
      device: f.device, serial: f.serial, problem: f.problem, accessories: f.accessories, technician_id: f.technician_id,
      estimate: Number(f.estimate) || 0, charge: Number(f.charge) || 0, note: f.note,
      parts: f.parts.map((x) => ({ product_id: x.product_id, qty: Number(x.qty) || 0, price: Number(x.price) || 0, serials: (x.serials || []).join(',') })),
      advance: Number(adv.amount) || 0, account_id: adv.account_id
    };
    const r = await run(() => api('repair.save', payload), job ? `Job ${job.job_no} saved` : 'Repair job created');
    smsNote(r.tech_sms, 'the technician');
    if (!job) useStore.getState().refresh('customers');
    if (print) printJobSlip(r);
    onDone(r);
  };

  return (
    <Modal open onClose={onClose} size="lg" title={job ? `Edit job ${job.job_no}` : 'New repair job'}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        {!job && <Btn busy={busy} onClick={() => save(true)} disabled={!customerOk || !f.device.trim() || !f.problem.trim()}>Save & print slip</Btn>}
        <Btn kind="primary" busy={busy} onClick={() => save(false)} disabled={!customerOk || !f.device.trim() || !f.problem.trim()}>Save</Btn>
      </>}>
      <div className="form">
        {job ? (
          <Field label="Customer" wide><input value={`${job.customer_name} · ${job.phone}`} disabled /></Field>
        ) : (
          <>
            {/* not a <label>: a click on the chosen customer must not press its remove button */}
            <div className="field wide">
              <span className="field-label">Customer (search a saved customer)</span>
              <CustomerPicker value={f.customer_id} onChange={(id) => set({ customer_id: id })} onAddNew={(q) => set({ customer_name: /\d{5,}/.test(q) ? '' : q, phone: /\d{5,}/.test(q) ? q : '' })} />
            </div>
            {!f.customer_id && <>
              <Field label="Or new customer name"><input value={f.customer_name} onChange={(e) => set({ customer_name: e.target.value })} /></Field>
              <Field label="Phone" hint="A phone number already saved goes to that customer."><input value={f.phone} inputMode="tel" onChange={(e) => set({ phone: e.target.value })} placeholder="01XXXXXXXXX" /></Field>
            </>}
          </>
        )}
        <Field label="Device"><input value={f.device} onChange={(e) => set({ device: e.target.value })} placeholder="e.g. HP 15 laptop, desktop PC, printer" /></Field>
        <Field label="Serial / model (optional)"><input value={f.serial} onChange={(e) => set({ serial: e.target.value })} /></Field>
        <Field label="Problem" wide><textarea value={f.problem} onChange={(e) => set({ problem: e.target.value })} placeholder="What the customer says is wrong" /></Field>
        <Field label="Received with (accessories)" wide><input value={f.accessories} onChange={(e) => set({ accessories: e.target.value })} placeholder="e.g. Charger, bag, no battery" /></Field>
        <Field label="Technician" hint={!techs.length ? 'Add technicians in Users & Roles (role: Technician).' : f.technician_id ? (techPhone ? `Mobile: ${techPhone} — gets this job by SMS` : 'No mobile number saved for this person') : undefined}>
          <Select value={f.technician_id} onChange={(v) => set({ technician_id: v })} options={techs} placeholder="Not assigned" />
        </Field>
        <Field label="Estimate (told to the customer)"><input type="number" min="0" step="any" value={f.estimate} onChange={(e) => set({ estimate: e.target.value })} /></Field>
        <Field label="Repair charge (service)" hint="Parts from stock are added below and billed separately."><input type="number" min="0" step="any" value={f.charge} onChange={(e) => set({ charge: e.target.value })} /></Field>
        <Field label="Note" wide><input value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
      </div>

      <h3 style={{ margin: '16px 0 6px' }}>Parts from stock</h3>
      <ProductSearch inStockOnly noServices onPick={addPart} placeholder="Search a part in stock to add (RAM, SSD, paste…)" />
      {f.parts.length > 0 && (
        <div className="dt" style={{ marginTop: 8 }}><div className="dt-scroll"><table>
          <thead><tr><th>Part</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Amount</th><th /></tr></thead>
          <tbody>{f.parts.map((x, i) => {
            const p = pmap[x.product_id];
            return (
              <tr key={x.product_id}>
                <td>{x.name}
                  {isSerial(p) && <SerialChooser productId={x.product_id} value={x.serials} onChange={(s) => setPart(i, { serials: s, qty: s.length })} />}
                </td>
                <td className="r">{isSerial(p) ? x.qty : <input type="number" min="0" step="any" value={x.qty} onChange={(e) => setPart(i, { qty: e.target.value })} style={{ width: 70 }} aria-label={`Qty of ${x.name}`} />}</td>
                <td className="r"><input type="number" min="0" step="any" value={x.price} disabled={!can('pos')} onChange={(e) => setPart(i, { price: e.target.value })} style={{ width: 100 }} aria-label={`Price of ${x.name}`} /></td>
                <td className="r num">{money((Number(x.qty) || 0) * (Number(x.price) || 0), false)}</td>
                <td><button className="x" onClick={() => set({ parts: f.parts.filter((_, j) => j !== i) })} aria-label={`Remove ${x.name}`}>×</button></td>
              </tr>
            );
          })}</tbody>
        </table></div></div>
      )}
      <p className="muted" style={{ margin: '6px 0 0' }}>Parts leave stock when the job is delivered (on its invoice).</p>

      <div className="form" style={{ marginTop: 14 }}>
        <Field label={job ? `More advance (paid so far ${money(job.advance)})` : 'Advance received'}><input type="number" min="0" step="any" value={adv.amount} onChange={(e) => setAdv({ ...adv, amount: e.target.value })} /></Field>
        <Field label="Advance into"><Select value={adv.account_id} onChange={(v) => setAdv({ ...adv, account_id: v })} options={meta.accounts} allowEmpty={false} /></Field>
        <div className="wide totals">
          <span>Parts</span><b className="num">{money(partsTotal(f.parts), false)}</b>
          <span>Total (parts + charge)</span><span className="grand">{money(total)}</span>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- One job: status, deliver, cancel, print ---------------- */
function JobDetail({ job, meta, onClose, onEdit, onDone }) {
  const can = useStore((s) => s.can);
  const smsOn = useStore((s) => s.settings?.sms_enabled === 'true');
  const [sms, setSms] = useState(true);
  const [busy, run] = useAction();
  const [step, setStep] = useState(''); // '' | deliver | cancel
  const [report, setReport] = useState('');
  const open = OPEN.includes(job.status);
  const status = async (to) => {
    const r = await run(() => api('repair.status', { id: job.id, status: to, note: report, send_sms: to === 'Completed' && smsOn ? sms : false }), `Job ${job.job_no} is ${to}`);
    smsNote(r.sms, 'the customer');
    onDone(r);
  };
  const invoice = async () => printInvoice(await run(() => api('sale.detail', { id: job.sale_id })));

  if (step === 'deliver') return <Deliver job={job} meta={meta} onClose={() => setStep('')} onDone={onDone} />;
  if (step === 'cancel') return <Cancel job={job} meta={meta} onClose={() => setStep('')} onDone={onDone} />;
  return (
    <Modal open onClose={onClose} size="lg" title={`Repair job ${job.job_no}`}
      footer={<>
        <Btn onClick={() => printJobSlip(job)}>Print slip</Btn>
        {job.sale_id && can('pos') && <Btn busy={busy} onClick={invoice}>Print invoice</Btn>}
        <span className="spacer" />
        {open && <Btn kind="danger" onClick={() => setStep('cancel')}>Cancel job</Btn>}
        {open && <Btn onClick={onEdit}>Edit / parts</Btn>}
        {job.status === 'Received' && <Btn kind="danger" busy={busy} onClick={() => status('Failed')} disabled={!report.trim()} title={report.trim() ? '' : 'Write the report first'}>Mark failed</Btn>}
        {job.status === 'Received' && <Btn kind="primary" busy={busy} onClick={() => status('Completed')}>Mark completed</Btn>}
        {(job.status === 'Completed' || job.status === 'Failed') && <Btn busy={busy} onClick={() => status('Received')}>Back to repair</Btn>}
        {open && can('pos') && <Btn kind="primary" onClick={() => setStep('deliver')}>Deliver</Btn>}
      </>}>
      <div className="kv">
        <div><span>Status</span><b><Badge tone={TONE[job.status]}>{job.status}</Badge>{job.sale_status === 'cancelled' ? ' (invoice cancelled)' : ''}</b></div>
        <div><span>Received</span><b>{fdate(job.date)}</b></div>
        <div><span>Customer</span><b>{job.customer_name} · {job.phone}</b></div>
        <div><span>Device</span><b>{job.device}{job.serial ? ` · ${job.serial}` : ''}</b></div>
        <div><span>Problem</span><b>{job.problem}</b></div>
        {job.accessories && <div><span>Received with</span><b>{job.accessories}</b></div>}
        <div><span>Technician</span><b>{job.technician_name || 'Not assigned'}</b></div>
        {job.estimate > 0 && <div><span>Estimate</span><b>{money(job.estimate)}</b></div>}
        <div><span>Repair charge</span><b>{money(job.charge)}</b></div>
        <div><span>Parts</span><b>{money(job.parts_total)}</b></div>
        <div><span>Total</span><b>{money(job.total)}</b></div>
        <div><span>Advance</span><b>{money(job.advance)}</b></div>
        {open && <div><span>Due</span><b style={{ color: job.due > 0 ? 'var(--warn)' : undefined }}>{money(job.due)}</b></div>}
        {job.invoice_no && <div><span>Invoice</span><b>{job.invoice_no}</b></div>}
        {job.cancel_reason && <div><span>Cancelled because</span><b>{job.cancel_reason}</b></div>}
        {job.note && <div><span>Note</span><b>{job.note}</b></div>}
        {(job.status === 'Completed' || job.status === 'Failed') && job.result_by && <div><span>{job.status} by</span><b>{job.result_by}{job.result_at ? ` · ${fdatetime(job.result_at)}` : ''}</b></div>}
        {job.result_note && <div><span>Technician report</span><b>{job.result_note}</b></div>}
      </div>
      {job.parts.length > 0 && (
        <div className="dt" style={{ marginTop: 12 }}><div className="dt-scroll"><table>
          <thead><tr><th>Part</th><th>Serial</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Amount</th></tr></thead>
          <tbody>{job.parts.map((x) => <tr key={x.product_id}><td>{x.name}</td><td>{x.serials || '—'}</td><td className="r">{x.qty}</td><td className="r num">{money(x.price, false)}</td><td className="r num">{money(x.qty * x.price, false)}</td></tr>)}</tbody>
        </table></div></div>
      )}
      {job.status === 'Received' && (
        <div className="form" style={{ marginTop: 12 }}>
          <Field label="Technician report" wide hint="Shown to the admins with the result. Needed when the repair failed."><textarea value={report} onChange={(e) => setReport(e.target.value)} placeholder="e.g. Replaced fan and paste, tested 1 hour / Board burnt, no spare available" /></Field>
        </div>
      )}
      {job.status === 'Received' && smsOn && <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} /> Send the customer an SMS when marked completed</label>}
      <h3 style={{ margin: '14px 0 6px' }}>History</h3>
      {job.log.map((l, i) => <div key={i} className="muted" style={{ fontSize: 13 }}>{fdatetime(l.ts)} · <b>{l.status}</b> · {l.note} · {l.user}</div>)}
    </Modal>
  );
}

function Deliver({ job, meta, onClose, onDone }) {
  const fresh = useApi('repair.get', { id: job.id });
  if (!fresh.data) return <Modal open onClose={onClose} title={`Deliver ${job.job_no}`}>
    <ErrorBox error={fresh.error} onRetry={fresh.reload} />
    {!fresh.error && <p className="muted">Checking available advance…</p>}
  </Modal>;
  return <DeliveryForm job={fresh.data} meta={meta} onClose={onClose} onDone={onDone} />;
}

function DeliveryForm({ job, meta, onClose, onDone }) {
  const advance = Number(job.available_advance) || 0;
  const [discount, setDiscount] = useState('');
  const toPay = round2(Math.max(job.total - (Number(discount) || 0) - advance, 0));
  const [pay, setPay] = useState({ account_id: meta.accounts[0]?.id || '', amount: String(toPay || '') });
  const [nextDate, setNextDate] = useState('');
  const [busy, run] = useAction();
  const left = round2(toPay - (Number(pay.amount) || 0));
  const go = async (print) => {
    const r = await run(() => api('repair.deliver', {
      id: job.id, expected_credit: round2(Math.min(advance, Math.max(job.total - (Number(discount) || 0), 0))), discount: Number(discount) || 0, next_payment_date: left > 0.004 ? nextDate : '',
      payments: Number(pay.amount) > 0 ? [{ account_id: pay.account_id, amount: Number(pay.amount) }] : []
    }), `Job ${job.job_no} delivered`);
    if (print && r.invoice) printInvoice(r.invoice);
    onDone(r);
  };
  return (
    <Modal open onClose={onClose} title={`Deliver ${job.job_no}`}
      footer={<><Btn onClick={onClose}>Back</Btn>
        <Btn busy={busy} onClick={() => go(false)} disabled={Number(pay.amount) > toPay + 0.004}>Deliver</Btn>
        <Btn kind="primary" busy={busy} onClick={() => go(true)} disabled={Number(pay.amount) > toPay + 0.004 || job.total <= 0}>Deliver & print invoice</Btn></>}>
      <div className="form">
        <div className="wide totals">
          <span>Parts + charge</span><b className="num">{money(job.total, false)}</b>
          <span>Advance available now</span><b className="num">{money(advance, false)}</b>
        </div>
        {job.total > 0 && <Field label="Discount"><input type="number" min="0" step="any" value={discount} onChange={(e) => { setDiscount(e.target.value); setPay({ ...pay, amount: String(round2(Math.max(job.total - (Number(e.target.value) || 0) - advance, 0)) || '') }); }} /></Field>}
        <Field label="Received now into"><Select value={pay.account_id} onChange={(v) => setPay({ ...pay, account_id: v })} options={meta.accounts} allowEmpty={false} /></Field>
        <Field label={`Amount received (to pay ${money(toPay, false)})`}><input type="number" min="0" step="any" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
        {left > 0.004 && <Field label={`Next payment date (${money(left, false)} stays as the customer's due)`}><input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></Field>}
        <p className="muted wide" style={{ margin: 0 }}>{job.total > 0 ? 'An invoice is made for the parts and the repair charge; the advance is used on it. Parts leave stock now.' : 'Nothing to charge: the job is closed without an invoice.'}</p>
      </div>
    </Modal>
  );
}

function Cancel({ job, meta, onClose, onDone }) {
  const canRefund = useStore((s) => s.can('customers'));
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState('keep');
  const [acc, setAcc] = useState(meta.accounts[0]?.id || '');
  const [busy, run] = useAction();
  const go = async () => {
    const r = await run(() => api('repair.cancel', { id: job.id, reason, refund_account_id: job.advance > 0 && refund === 'return' ? acc : '' }), `Job ${job.job_no} cancelled`);
    onDone(r);
  };
  return (
    <Modal open onClose={onClose} title={`Cancel ${job.job_no}`}
      footer={<><Btn onClick={onClose}>Back</Btn><Btn kind="danger" busy={busy} disabled={!reason.trim()} onClick={go}>Cancel job</Btn></>}>
      <div className="form">
        <Field label="Why is it cancelled?" wide><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer took it back, part not available" /></Field>
        {job.advance > 0 && <>
          <div className="field wide" role="radiogroup" aria-label="Advance">
            <span className="field-label">Advance {money(job.advance)}</span>
            {!canRefund && <small className="muted">Returning money requires Customers &amp; dues permission.</small>}
            <label className="check"><input type="radio" name="adv" disabled={!canRefund} checked={refund === 'return'} onChange={() => setRefund('return')} /> Give it back to the customer now</label>
            <label className="check"><input type="radio" name="adv" checked={refund === 'keep'} onChange={() => setRefund('keep')} /> Keep it on the customer's account (credit for later)</label>
          </div>
          {refund === 'return' && <Field label="Paid back from"><Select value={acc} onChange={setAcc} options={meta.accounts} allowEmpty={false} /></Field>}
        </>}
      </div>
    </Modal>
  );
}

/** 80 mm receiving slip for the customer, like the warranty slip. */
export function printJobSlip(j) {
  const s = useStore.getState().settings;
  const row = (k, v) => (v ? `<div>${esc(k)}: ${esc(v)}</div>` : '');
  printHtml(`<style>@page{size:80mm auto;margin:0}body{margin:0;width:72mm;padding:3mm 4mm;font:11px/1.4 'Courier New',monospace}.c{text-align:center}hr{border:0;border-top:1px dashed #000}</style>
  <div class="c"><b style="font-size:15px">${esc(s.shop_name)}</b><div>${shopContacts(s, '<br>')}</div></div><hr>
  <div class="c"><b>REPAIR RECEIVING SLIP</b></div>
  <div>Job: <b>${esc(j.job_no)}</b></div>${row('Date', fdate(j.date))}${row('Customer', `${j.customer_name} ${j.phone || ''}`)}
  ${row('Device', j.device)}${row('Serial / model', j.serial)}${row('Problem', j.problem)}${row('Received with', j.accessories)}
  ${row('Technician', j.technician_name)}${j.estimate > 0 ? row('Estimate', money(j.estimate)) : ''}${j.advance > 0 ? row('Advance paid', money(j.advance)) : ''}<hr>
  <div>Please bring this slip when collecting your device.</div><br><br><div>Customer signature ____________</div>`);
}
