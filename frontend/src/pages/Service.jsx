import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { money, fdate, fdatetime, round2, splitList } from '../lib/format';
import { printInvoice } from '../lib/receipt';
import { useStore } from '../lib/store';
import DataTable from '../components/DataTable';
import DateInput from '../components/DateInput';
import { useApi, PageHead, Tabs, Modal, Btn, Field, Badge, useAction, ErrorBox, Select } from '../components/ui';
import { CustomerPicker, ProductSearch, SerialChooser } from '../components/widgets';

// Service jobs (field work): Pending → Work done (by the technician) → Completed (the admin sets what was used and
// what came back, and an invoice is made) — or Cancelled. Products the technician takes stay reserved until then.
const TONE = { Pending: 'warn', 'Work done': 'info', Completed: 'ok', Cancelled: 'bad' };
const OPEN = ['Pending', 'Work done'];
const isSerial = (p) => !!p && !p.service && p.has_warranty && p.warranty_type === 'serial';
const partsTotal = (parts) => round2(parts.reduce((a, x) => a + round2((Number(x.qty) || 0) * (Number(x.price) || 0)), 0));
const smsNote = (r, who) => {
  if (!r) return;
  const toast = useStore.getState().toast;
  if (r.ok) toast(`SMS sent to ${who}`); else if (r.status !== 'queued') toast(`SMS to ${who}: ${r.status}${r.response ? ` — ${r.response}` : ''}`, 'err');
};

export default function Service() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'Pending');
  const [tech, setTech] = useState('');
  const meta = useApi('services.meta', {}, [], { refreshMs: 60000 });
  const list = useApi('services.list', {}, [], { refreshMs: 15000 });
  const [form, setForm] = useState(null);
  const [sel, setSel] = useState(null);
  const [types, setTypes] = useState(false);
  const { id } = useParams();
  const nav = useNavigate();
  useEffect(() => { if (params.get('tab')) { setTab(params.get('tab')); setParams({}, { replace: true }); } }, [params, setParams]);
  useEffect(() => { if (id) api('service.get', { id }).then(setSel).catch((e) => useStore.getState().toast(e.message, 'err')); }, [id]);
  const m = meta.data;
  const all = (list.data || []).filter((r) => !tech || r.technician_id === tech);
  const count = (st) => all.filter((r) => r.status === st).length;
  const rows = all.filter((r) => tab === 'all' || r.status === tab);
  const done = (job) => { list.reload(); setForm(null); setSel(job || null); };
  const closeSel = () => { setSel(null); if (id) nav('/service'); };

  return (
    <>
      <PageHead title="Service" sub={m && !m.manage ? 'Your service jobs. Press Work done when the job is finished.' : 'Field work — CC camera installation, new internet connection and more: give the job to a technician, then complete it with an invoice.'}>
        {m?.admin && <Btn onClick={() => setTypes(true)}>Service list</Btn>}
        {m?.manage && <Btn kind="primary" disabled={!m.types.some((t) => t.active !== false)} title={m.types.some((t) => t.active !== false) ? '' : 'Add a service in the Service list first'} onClick={() => setForm({})}>New service</Btn>}
      </PageHead>
      <ErrorBox error={list.error || meta.error} onRetry={() => { list.reload(); meta.reload(); }} />
      {m?.admin && !m.types.length && <div className="card sv-empty">No services yet. Add the kinds of work you do — e.g. <b>CC Camera Installation</b>, <b>New Internet Connection</b> — in <button className="link" onClick={() => setTypes(true)}>Service list</button>.</div>}
      <div className="sv-counts">
        {[['Pending', 'Pending', 'Given to a technician, not done yet'], ['Work done', 'Work done', 'Technician finished — complete and invoice'], ['Completed', 'Completed', 'Invoice made'], ['Cancelled', 'Cancelled', '']].map(([k, l, h]) => (
          <button key={k} type="button" className={`sv-count tone-${TONE[k]} ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)} aria-pressed={tab === k}>
            <span>{l}</span><b>{count(k)}</b>{h && <small>{h}</small>}
          </button>
        ))}
      </div>
      <div className="filters">
        <Tabs tabs={[['Pending', 'Pending'], ['Work done', 'Work done'], ['Completed', 'Completed'], ['Cancelled', 'Cancelled'], ['all', 'All']]} value={tab} onChange={setTab} />
        {m?.manage && <Select value={tech} onChange={setTech} options={m.technicians} placeholder="All technicians" aria-label="Technician" />}
      </div>
      <DataTable title="Service jobs" loading={list.loading && !list.data} rows={rows} onRowClick={setSel} empty="No service jobs here"
        sumFilter={(r) => r.status !== 'Cancelled'} rowClass={(r) => (r.status === 'Cancelled' ? 'dim' : '')}
        columns={[
          { key: 'job_no', label: 'Job #' }, { key: 'date', label: 'Date', type: 'date' },
          { key: 'customer_name', label: 'Customer', render: (r) => <>{r.customer_name}<small className="muted" style={{ display: 'block' }}>{r.phone}</small></> },
          { key: 'service', label: 'Service', className: 'sv-clip' }, { key: 'address', label: 'Address', className: 'sv-clip' },
          { key: 'technician_name', label: 'Technician', value: (r) => r.technician_name || '—' },
          { key: 'items', label: 'Products', value: (r) => r.parts.length ? r.parts.map((x) => `${x.qty} ${x.name}`).join(', ') : '—', className: 'sv-clip' },
          { key: 'total', label: 'Total', type: 'money', sum: true },
          { key: 'status', label: 'Status', render: (r) => <Badge tone={TONE[r.status]}>{r.status}</Badge> }
        ]} />
      {form && m && <JobForm job={form.id ? form : null} meta={m} onClose={() => setForm(null)} onDone={done} />}
      {sel && !form && m && <JobDetail key={`${sel.id}-${sel.status}-${sel.updated_at || ''}`} job={sel} meta={m} onClose={closeSel} onEdit={() => setForm(sel)} onDone={done} />}
      {types && m && <TypesEditor types={m.types} onClose={() => setTypes(false)} onDone={() => meta.reload()} />}
    </>
  );
}

/* ---------------- New service / edit an open one ---------------- */
function JobForm({ job, meta, onClose, onDone }) {
  const products = useStore((s) => s.products);
  const customers = useStore((s) => s.customers);
  const can = useStore((s) => s.can);
  const pmap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const active = meta.types.filter((t) => t.active !== false || t.id === job?.type_id);
  const [f, setF] = useState(() => job ? {
    type_id: job.type_id, details: job.details, address: job.address, technician_id: job.technician_id, charge: String(job.charge ?? ''), note: job.note || '',
    parts: (job.parts || []).map((x) => ({ ...x, serials: String(x.serials || '').split(',').filter(Boolean) }))
  } : { customer_id: '', customer_name: '', phone: '', address: '', type_id: '', details: '', technician_id: '', charge: '', note: '', parts: [] });
  const [busy, run] = useAction();
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const setPart = (i, patch) => set({ parts: f.parts.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const addPart = (p) => {
    if (f.parts.some((x) => x.product_id === p.id)) return useStore.getState().toast(`${p.name} is already in the list`, 'err');
    set({ parts: [...f.parts, { product_id: p.id, name: p.name, unit: p.unit, qty: isSerial(p) ? 0 : 1, price: p.sale_price, serials: [] }] });
  };
  const pickType = (id) => { const t = meta.types.find((x) => x.id === id); set({ type_id: id, charge: t && (f.charge === '' || meta.types.some((x) => String(x.charge) === String(f.charge))) ? String(t.charge || '') : f.charge }); };
  const pickCustomer = (id) => { const c = customers.find((x) => x.id === id); set({ customer_id: id, address: f.address || splitList(c?.addresses || '', '|')[0] || '' }); };
  const techs = job && job.technician_id && !meta.technicians.some((u) => u.id === job.technician_id) ? [...meta.technicians, { id: job.technician_id, name: job.technician_name, phone: '' }] : meta.technicians;
  const techPhone = (techs.find((u) => u.id === f.technician_id) || {}).phone;
  const customerOk = job || f.customer_id || (f.customer_name.trim() && f.phone.trim());
  const ok = customerOk && f.type_id && f.details.trim() && (job || f.address.trim()) && f.parts.every((x) => Number(x.qty) > 0);
  const total = round2(partsTotal(f.parts) + (Number(f.charge) || 0));

  const save = async () => {
    const payload = {
      ...(job ? { id: job.id } : { customer_id: f.customer_id, customer_name: f.customer_name, phone: f.phone }),
      type_id: f.type_id, details: f.details, address: f.address, technician_id: f.technician_id, charge: Number(f.charge) || 0, note: f.note,
      parts: f.parts.map((x) => ({ product_id: x.product_id, qty: Number(x.qty) || 0, price: Number(x.price) || 0, serials: (x.serials || []).join(',') }))
    };
    const r = await run(() => api('service.save', payload), job ? `Service ${job.job_no} saved` : 'Service created — it is Pending');
    smsNote(r.tech_sms, 'the technician');
    if (!job) useStore.getState().refresh('customers');
    onDone(r);
  };

  return (
    <Modal open onClose={onClose} size="lg" title={job ? `Edit service ${job.job_no}` : 'New service'}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save} disabled={!ok}>{job ? 'Save' : 'Save service'}</Btn></>}>
      <div className="form">
        {job ? <Field label="Customer" wide><input value={`${job.customer_name} · ${job.phone}`} disabled /></Field> : (
          <>
            <div className="field wide">
              <span className="field-label">Customer (search a saved customer)</span>
              <CustomerPicker value={f.customer_id} onChange={pickCustomer} onAddNew={(q) => set({ customer_name: /\d{5,}/.test(q) ? '' : q, phone: /\d{5,}/.test(q) ? q : '' })} />
            </div>
            {!f.customer_id && <>
              <Field label="Or new customer name"><input value={f.customer_name} onChange={(e) => set({ customer_name: e.target.value })} /></Field>
              <Field label="Phone" hint="A phone number already saved goes to that customer."><input value={f.phone} inputMode="tel" onChange={(e) => set({ phone: e.target.value })} placeholder="01XXXXXXXXX" /></Field>
            </>}
          </>
        )}
        <Field label="Service"><select value={f.type_id} onChange={(e) => pickType(e.target.value)} aria-label="Service"><option value="">Choose…</option>{active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label="Technician" hint={!techs.length ? 'Add technicians in Users & roles (role: Technician).' : f.technician_id ? (techPhone ? `Mobile: ${techPhone} — gets the job, customer and address by SMS` : 'No mobile number saved for this person') : 'Not given yet — you can give it later'}>
          <Select value={f.technician_id} onChange={(v) => set({ technician_id: v })} options={techs} placeholder="Not given yet" aria-label="Technician" />
        </Field>
        <Field label="Work details" wide><textarea value={f.details} onChange={(e) => set({ details: e.target.value })} placeholder="e.g. 4 cameras at the shop front and the store room, DVR in the office" /></Field>
        <Field label="Work address" wide hint={job ? '' : 'Filled from the customer. Change it when the work is somewhere else.'}><input value={f.address} onChange={(e) => set({ address: e.target.value })} placeholder="House, road, area" /></Field>
        <Field label="Service charge"><input type="number" min="0" step="any" value={f.charge} onChange={(e) => set({ charge: e.target.value })} aria-label="Service charge" /></Field>
        <Field label="Note (inside the shop only)"><input value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
      </div>

      <h3 style={{ margin: '16px 0 6px' }}>Products the technician takes</h3>
      <ProductSearch inStockOnly noServices onPick={addPart} placeholder="Search a product in stock (camera, DVR, cable, router…)" />
      {f.parts.length > 0 && (
        <div className="dt" style={{ marginTop: 8 }}><div className="dt-scroll"><table>
          <thead><tr><th>Product</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Amount</th><th /></tr></thead>
          <tbody>{f.parts.map((x, i) => {
            const p = pmap[x.product_id];
            return (
              <tr key={x.product_id}>
                <td>{x.name}{isSerial(p) && <SerialChooser productId={x.product_id} extra={String((job?.parts || []).find((part) => part.product_id === x.product_id)?.serials || '').split(',').filter(Boolean)} value={x.serials} onChange={(s) => setPart(i, { serials: s, qty: s.length })} />}</td>
                <td className="r">{isSerial(p) ? x.qty : <input type="number" min="0" step="any" value={x.qty} onChange={(e) => setPart(i, { qty: e.target.value })} style={{ width: 80 }} aria-label={`Qty of ${x.name}`} />} <small className="muted">{x.unit || ''}</small></td>
                <td className="r"><input type="number" min="0" step="any" value={x.price} disabled={!can('pos')} onChange={(e) => setPart(i, { price: e.target.value })} style={{ width: 100 }} aria-label={`Price of ${x.name}`} /></td>
                <td className="r num">{money((Number(x.qty) || 0) * (Number(x.price) || 0), false)}</td>
                <td><button className="x" onClick={() => set({ parts: f.parts.filter((_, j) => j !== i) })} aria-label={`Remove ${x.name}`}>×</button></td>
              </tr>
            );
          })}</tbody>
        </table></div></div>
      )}
      <p className="muted" style={{ margin: '6px 0 0' }}>These stay reserved in stock for this job. On Complete you mark what was used; the rest goes back to stock.</p>
      <div className="wide totals" style={{ marginTop: 12 }}>
        <span>Products</span><b className="num">{money(partsTotal(f.parts), false)}</b>
        <span>Total (products + charge)</span><span className="grand">{money(total)}</span>
      </div>
    </Modal>
  );
}

/* ---------------- One service job ---------------- */
function JobDetail({ job, meta, onClose, onEdit, onDone }) {
  const can = useStore((s) => s.can);
  const [busy, run] = useAction();
  const [step, setStep] = useState('');
  const [note, setNote] = useState('');
  const open = OPEN.includes(job.status);
  const status = async (to) => {
    const r = await run(() => api('service.status', { id: job.id, status: to, note }), to === 'Work done' ? `Service ${job.job_no}: work done` : `Service ${job.job_no} is Pending again`);
    smsNote(r.sms, 'the admin / manager');
    onDone(r);
  };
  const invoice = async () => printInvoice(await run(() => api('sale.detail', { id: job.sale_id })));
  if (step === 'complete') return <Complete job={job} meta={meta} onClose={() => setStep('')} onDone={onDone} />;
  if (step === 'cancel') return <Cancel job={job} onClose={() => setStep('')} onDone={onDone} />;
  return (
    <Modal open onClose={onClose} size="lg" title={`Service ${job.job_no}`}
      footer={<>
        {job.sale_id && can('pos') && <Btn busy={busy} onClick={invoice}>Print invoice</Btn>}
        <span className="spacer" />
        {open && meta.manage && <Btn kind="danger" onClick={() => setStep('cancel')}>Cancel service</Btn>}
        {open && meta.manage && <Btn onClick={onEdit}>Edit / products</Btn>}
        {job.status === 'Work done' && meta.manage && <Btn busy={busy} onClick={() => status('Pending')}>Back to pending</Btn>}
        {job.status === 'Pending' && <Btn kind={meta.manage ? 'ghost' : 'primary'} busy={busy} onClick={() => status('Work done')}>Work done</Btn>}
        {open && meta.manage && can('pos') && <Btn kind="primary" onClick={() => setStep('complete')}>Complete & invoice</Btn>}
      </>}>
      <div className="kv">
        <div><span>Status</span><b><Badge tone={TONE[job.status]}>{job.status}</Badge>{job.sale_status === 'cancelled' ? ' (invoice cancelled)' : ''}</b></div>
        <div><span>Date</span><b>{fdate(job.date)}</b></div>
        <div><span>Service</span><b>{job.service}</b></div>
        <div><span>Customer</span><b>{job.customer_name} · <a href={`tel:${job.phone}`}>{job.phone}</a></b></div>
        <div><span>Address</span><b>{job.address}</b></div>
        <div><span>Work details</span><b>{job.details}</b></div>
        <div><span>Technician</span><b>{job.technician_name || 'Not given yet'}</b></div>
        <div><span>Service charge</span><b>{money(job.charge)}</b></div>
        <div><span>Products</span><b>{money(job.parts_total)}</b></div>
        <div><span>Total</span><b>{money(job.total)}</b></div>
        {job.invoice_no && <div><span>Invoice</span><b>{job.invoice_no}</b></div>}
        {job.result_note && <div><span>Technician's note</span><b>{job.result_note}</b></div>}
        {job.result_by && job.status !== 'Pending' && <div><span>Work done by</span><b>{job.result_by}{job.result_at ? ` · ${fdatetime(job.result_at)}` : ''}</b></div>}
        {job.cancel_reason && <div><span>Cancelled because</span><b>{job.cancel_reason}</b></div>}
        {job.note && meta.manage && <div><span>Note</span><b>{job.note}</b></div>}
      </div>
      {job.parts.length > 0 && (
        <div className="dt" style={{ marginTop: 12 }}><div className="dt-scroll"><table>
          <thead><tr><th>{job.status === 'Completed' ? 'Used' : open ? 'Taken (reserved)' : 'Product'}</th><th>Serial</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Amount</th></tr></thead>
          <tbody>{job.parts.map((x) => <tr key={x.product_id}><td>{x.name}</td><td>{x.serials ? String(x.serials).split(',').join(', ') : '—'}</td><td className="r">{x.qty} {x.unit || ''}</td><td className="r num">{money(x.price, false)}</td><td className="r num">{money(x.qty * x.price, false)}</td></tr>)}</tbody>
        </table></div></div>
      )}
      {job.status === 'Pending' && (
        <div className="form" style={{ marginTop: 12 }}>
          <Field label="Note with Work done (optional)" wide hint="Goes with the SMS to the admin / manager."><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 4 cameras fitted, 1 camera and 20 m cable not used" /></Field>
        </div>
      )}
      <h3 style={{ margin: '14px 0 6px' }}>History</h3>
      {job.log.map((l, i) => <div key={i} className="muted" style={{ fontSize: 13 }}>{fdatetime(l.ts)} · <b>{l.status}</b> · {l.note} · {l.user}</div>)}
    </Modal>
  );
}

/* ---------------- Complete: what was used, what came back, and the invoice ---------------- */
function Complete({ job, meta, onClose, onDone }) {
  const [used, setUsed] = useState(() => job.parts.map((x) => ({ product_id: x.product_id, name: x.name, unit: x.unit, price: x.price, taken: x.qty, qty: String(x.qty), took: String(x.serials || '').split(',').filter(Boolean), serials: String(x.serials || '').split(',').filter(Boolean) })));
  const [charge, setCharge] = useState(String(job.charge ?? ''));
  const [discount, setDiscount] = useState('');
  const set = (i, patch) => setUsed((u) => u.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const qtyOf = (x) => (x.took.length ? x.serials.length : Number(x.qty) || 0);
  const bad = used.some((x) => !x.took.length && (Number(x.qty) < 0 || Number(x.qty) > x.taken + 1e-9 || x.qty === ''));
  const total = round2(used.reduce((a, x) => a + round2(qtyOf(x) * x.price), 0) + (Number(charge) || 0));
  const jobDetails = useApi('service.get', { id: job.id });
  const [useAdvance, setUseAdvance] = useState(false);
  const availableAdvance = jobDetails.data?.available_advance || 0;
  const invoiceTotal = round2(Math.max(total - (Number(discount) || 0), 0));
  const credit = useAdvance ? Math.min(availableAdvance, invoiceTotal) : 0;
  const toPay = round2(invoiceTotal - credit);
  const badDiscount = Number(discount) < 0 || Number(discount) > total;
  const [pay, setPay] = useState({ account_id: meta.accounts[0]?.id || '', amount: '' });
  const [nextDate, setNextDate] = useState('');
  const amount = Number(pay.amount) || 0;
  const left = round2(toPay - amount);
  const [busy, run] = useAction();
  const back = used.filter((x) => qtyOf(x) < x.taken - 1e-9);
  const go = async (print) => {
    const r = await run(() => api('service.complete', {
      id: job.id, charge: Number(charge) || 0, discount: Number(discount) || 0, credit_used: credit, next_payment_date: left > 0.004 ? nextDate : '',
      used: used.map((x) => ({ product_id: x.product_id, qty: qtyOf(x), ...(x.took.length ? { serials: x.serials.join(',') } : {}) })),
      payments: amount > 0 ? [{ account_id: pay.account_id, amount }] : []
    }), `Service ${job.job_no} completed${back.length ? ' — unused products are back in stock' : ''}`);
    if (print && r.invoice) printInvoice(r.invoice);
    onDone(r);
  };
  return (
    <Modal open onClose={onClose} size="lg" title={`Complete ${job.job_no} · ${job.service}`}
      footer={<><Btn onClick={onClose}>Back</Btn>
        <Btn busy={busy} disabled={bad || badDiscount || amount < 0 || amount > toPay + 0.004} onClick={() => go(false)}>Complete</Btn>
        <Btn kind="primary" busy={busy} disabled={bad || badDiscount || amount < 0 || amount > toPay + 0.004 || total <= 0} onClick={() => go(true)}>Complete & print invoice</Btn></>}>
      {used.length > 0 ? (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Mark what was used at the customer. What the technician brought back goes back to stock.</p>
          <div className="dt"><div className="dt-scroll"><table className="sv-used">
            <thead><tr><th>Product</th><th className="r">Taken</th><th className="r">Used</th><th className="r">Back to stock</th><th className="r">Price</th><th className="r">Amount</th></tr></thead>
            <tbody>{used.map((x, i) => (
              <tr key={x.product_id}>
                <td>{x.name}
                  {x.took.length > 0 && <div className="sv-serials">{x.took.map((sn) => (
                    <label key={sn} className="check"><input type="checkbox" checked={x.serials.includes(sn)} onChange={(e) => set(i, { serials: e.target.checked ? [...x.serials, sn] : x.serials.filter((s) => s !== sn) })} /> {sn}</label>
                  ))}</div>}
                </td>
                <td className="r">{x.taken} {x.unit || ''}</td>
                <td className="r">{x.took.length ? qtyOf(x) : <input type="number" min="0" max={x.taken} step="any" value={x.qty} onChange={(e) => set(i, { qty: e.target.value })} style={{ width: 80 }} aria-label={`Used qty of ${x.name}`} />}</td>
                <td className="r">{round2(x.taken - qtyOf(x)) || '—'}</td>
                <td className="r num">{money(x.price, false)}</td>
                <td className="r num">{money(qtyOf(x) * x.price, false)}</td>
              </tr>
            ))}</tbody>
          </table></div></div>
        </>
      ) : <p className="muted" style={{ marginTop: 0 }}>No products were taken for this job.</p>}
      <div className="form" style={{ marginTop: 12 }}>
        <Field label="Service charge"><input type="number" min="0" step="any" value={charge} onChange={(e) => setCharge(e.target.value)} aria-label="Service charge" /></Field>
        <Field label="Discount" hint={badDiscount ? "Discount must be between zero and the total." : undefined}><input type="number" min="0" max={total} step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} aria-label="Discount" /></Field>
        {availableAdvance > 0 && <label className="check wide"><input type="checkbox" checked={useAdvance}
          onChange={(e) => setUseAdvance(e.target.checked)} /> Use customer advance ({money(availableAdvance) } available)</label>}
        <Field label="Received now into"><Select value={pay.account_id} onChange={(v) => setPay({ ...pay, account_id: v })} options={meta.accounts} allowEmpty={false} aria-label="Account" /></Field>
        <Field label={`Amount received (to pay ${money(toPay, false)})`} hint="Leave blank if no payment was received."><input type="number" min="0" step="any" value={pay.amount} placeholder="0" onChange={(e) => setPay({ ...pay, amount: e.target.value })} aria-label="Amount received" /></Field>
        {left > 0.004 && <Field label={`Next payment date (${money(left, false)} stays as the customer's due)`}><DateInput value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></Field>}
        <div className="wide totals">
          <span>Products used</span><b className="num">{money(round2(total - (Number(charge) || 0)), false)}</b>
          <span>Total</span><span className="grand">{money(invoiceTotal)}</span>
          {credit > 0 && <><span>Advance applied</span><b>{money(credit)}</b><span>To pay</span><b>{money(toPay)}</b></>}
        </div>
        {back.length > 0 && <p className="wide la-note">Back to stock: {back.map((x) => `${round2(x.taken - qtyOf(x))} ${x.unit || ''} ${x.name}`).join(', ')}</p>}
        <p className="muted wide" style={{ margin: 0 }}>{total > 0 ? 'An invoice is made for the products used and the service charge. They leave stock now.' : 'Nothing to charge: the service is closed without an invoice.'}</p>
      </div>
    </Modal>
  );
}

function Cancel({ job, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, run] = useAction();
  const go = async () => onDone(await run(() => api('service.cancel', { id: job.id, reason }), `Service ${job.job_no} cancelled`));
  return (
    <Modal open onClose={onClose} title={`Cancel ${job.job_no}`}
      footer={<><Btn onClick={onClose}>Back</Btn><Btn kind="danger" busy={busy} disabled={!reason.trim()} onClick={go}>Cancel service</Btn></>}>
      <div className="form">
        <Field label="Why is it cancelled?" wide><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer changed the plan" /></Field>
        {job.parts.length > 0 && <p className="muted wide" style={{ margin: 0 }}>The products taken for this job go back to stock.</p>}
      </div>
    </Modal>
  );
}

/* ---------------- Admin: the list of services ---------------- */
function TypesEditor({ types, onClose, onDone }) {
  const [list, setList] = useState(types);
  const [f, setF] = useState({ id: '', name: '', charge: '' });
  const [busy, run] = useAction();
  const save = async (t) => { setList(await run(() => api('service.type.save', t), `${t.name} saved`)); setF({ id: '', name: '', charge: '' }); onDone(); };
  const del = async (t) => { setList(await run(() => api('service.type.delete', { id: t.id }), `${t.name} deleted`)); onDone(); };
  return (
    <Modal open onClose={onClose} title="Service list" footer={<Btn onClick={onClose}>Close</Btn>}>
      <p className="muted" style={{ marginTop: 0 }}>The kinds of work you do. The charge is filled in on a new service and can be changed there.</p>
      <div className="row sv-type-form">
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. CC Camera Installation" aria-label="Service name" />
        <input type="number" min="0" step="any" value={f.charge} onChange={(e) => setF({ ...f, charge: e.target.value })} placeholder="Charge" aria-label="Usual charge" style={{ width: 120 }} />
        <Btn kind="primary" busy={busy} disabled={!f.name.trim()} onClick={() => save({ ...(f.id ? { id: f.id, active: list.find((t) => t.id === f.id)?.active !== false } : {}), name: f.name, charge: Number(f.charge) || 0 })}>{f.id ? 'Save' : 'Add'}</Btn>
        {f.id && <Btn onClick={() => setF({ id: '', name: '', charge: '' })}>Cancel</Btn>}
      </div>
      <div className="dt" style={{ marginTop: 10 }}><div className="dt-scroll"><table>
        <thead><tr><th>Service</th><th className="r">Usual charge</th><th>In use</th><th /></tr></thead>
        <tbody>
          {list.map((t) => (
            <tr key={t.id} className={t.active === false ? 'muted' : ''}>
              <td>{t.name}</td><td className="r num">{money(t.charge || 0, false)}</td>
              <td><label className="check"><input type="checkbox" checked={t.active !== false} onChange={(e) => save({ id: t.id, name: t.name, charge: t.charge, active: e.target.checked })} aria-label={`${t.name} in use`} /> {t.active === false ? 'Off' : 'On'}</label></td>
              <td className="r"><button className="link" onClick={() => setF({ id: t.id, name: t.name, charge: String(t.charge || '') })}>Edit</button> · <button className="link" style={{ color: 'var(--bad)' }} onClick={() => del(t)}>Delete</button></td>
            </tr>
          ))}
          {!list.length && <tr><td colSpan={4} className="muted">No services yet.</td></tr>}
        </tbody>
      </table></div></div>
    </Modal>
  );
}
