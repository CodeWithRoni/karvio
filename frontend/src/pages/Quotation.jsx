import { quotationTotals } from '../lib/quotationTotals';
import { shopStorageKey } from '../lib/shopStorage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { money, fdate, qty as fqty } from '../lib/format';
import { printQuotation } from '../lib/receipt';
import { textOf, cpuInfo, boardInfo, ramInfo, boardFitsCpu, ramFits } from '../lib/compat';
import { PageHead, Btn, Field, Tabs, Modal, noWheel, useApi, useConfirm, useAction } from '../components/ui';
import { api } from '../lib/api';
import { loadPosDraft, savePosDraft } from '../lib/posDraft';

// Suggest parts using their product group, category or product name.
const SLOTS = [
  ['Processor', ['cpu', 'processor']], ['Motherboard', ['motherboard']], ['RAM', ['ram', 'memory']], ['Storage', ['ssd', 'hdd', 'storage']],
  ['Graphics card', ['gpu', 'graphics']], ['Power supply', ['power supply', 'psu']], ['Casing', ['casing', 'case']], ['CPU cooler / fans', ['cool', 'fan']],
  ['Monitor', ['monitor']], ['Keyboard', ['keyboard']], ['Mouse', ['mouse']], ['UPS', ['ups']]
];
// CC camera setups: the same builder with its own rows.
const CCTV_SLOTS = [
  ['DVR / NVR', ['dvr', 'nvr', 'xvr']], ['Bullet Camera', ['bullet']], ['Dome Camera', ['dome']], ['HDD (Hard Disk Drive)', ['hdd', 'hard disk']],
  ['Monitor', ['monitor']], ['Video Balun', ['balun']], ['Adapter', ['adapter']], ['POE Switch', ['poe']], ['UTP Cable', ['utp', 'cat6', 'cat 6']],
  ['Power/AC Cable', ['power cable', 'ac cable']], ['Junction Box', ['junction']], ['Camera Stand', ['stand']], ['Server Rack', ['rack']],
  ['Accessories', ['accessor']], ['Wall Mount', ['wall mount']], ['Giga Switch', ['giga']]
];
const KINDS = {
  pc: { label: 'PC builder', slots: SLOTS, title: 'Custom PC build', note: 'Assembly charge, OS installation, delivery…', example: 'e.g. Gaming PC — Ryzen 5 / RTX 4060' },
  cctv: { label: 'CC Camera', slots: CCTV_SLOTS, title: 'CC Camera setup', note: 'Cable laying, installation, delivery…', example: 'e.g. 4 camera setup — shop and office' }
};
const blankMeta = (k) => ({ customer: '', phone: '', title: KINDS[k].title, discount: '', note: '', validDays: 7 });
// Quotations used to be saved only in this browser; they are moved to the server the first time the page opens.
const savedKey = () => shopStorageKey('erp_quotes');
const loadSaved = () => { try { const key=savedKey(); const rows=key ? JSON.parse(localStorage.getItem(key)) : []; return Array.isArray(rows) ? rows : []; } catch { return []; } };
const newLines = (k = 'pc') => KINDS[k].slots.map(([g]) => ({ group: g, product_id: '', name: '', qty: 1, price: '' }));

export default function PCBuilder() {
  const userId = useStore((s) => s.user?.id);
  return <Builder key={userId + ':' + savedKey()} />;
}
function Builder() {
  const { products, categories, brands, warrantyPeriods, settings } = useStore();
  const [sending, runSend] = useAction();
  const nav = useNavigate();
  const [confirmDialog, ask] = useConfirm();
  const [params] = useSearchParams();
  const [kind, setKind] = useState(params.get('kind') === 'cctv' ? 'cctv' : 'pc');
  const [lines, setLines] = useState(() => newLines(kind));
  const [meta, setMeta] = useState(() => blankMeta(kind));
  // Each tab keeps its own quote while you switch between them.
  const drafts = useRef({});
  const [touched, setTouched] = useState(false); // show the missing customer fields once an action needed them
  const [showSaved, setShowSaved] = useState(false);
  const phoneDigits = String(meta.phone || '').replace(/\D/g, '');
  const phoneOk = /^(?:01\d{9}|8801\d{9})$/.test(phoneDigits);
  const [savedId, setSavedId] = useState(''); // the saved quotation that is open (Save updates it)
  const switchTo = (k, d) => {
    if (k === kind && !d) return;
    drafts.current[kind] = { lines, meta, savedId };
    const next = d || drafts.current[k] || { lines: newLines(k), meta: blankMeta(k), savedId: '' };
    setKind(k); setLines(next.lines); setMeta(next.meta); setSavedId(next.savedId || ''); setTouched(false);
  };
  // Saved quotations live on the server: every user, every device, until someone deletes them.
  const savedList = useApi('quotes.list', {}, []);
  const saved = savedList.data || [];
  const [saving, runSave] = useAction();
  useEffect(() => {
    const local = loadSaved();
    if (!local.length || !savedKey()) return;
    (async () => {
      let moved = 0;
      for (const q of local) { try { await api('quote.save', { imported: true, kind: q.kind || 'pc', meta: q.meta || {}, lines: q.lines || [], date: q.date }); moved++; } catch { /* a broken old entry is skipped */ } }
      try { localStorage.removeItem(savedKey()); } catch { /* nothing more to do */ }
      savedList.reload();
      if (moved) useStore.getState().toast(`${moved} quotation${moved > 1 ? 's' : ''} saved on this device ${moved > 1 ? 'are' : 'is'} now on the server for every user`);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const catName = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name.toLowerCase()])), [categories]);
  const brandName = useMemo(() => Object.fromEntries(brands.map((b) => [b.id, b.name])), [brands]);
  // Quotes are only for what is in stock right now.
  const inStock = useMemo(() => products.filter((p) => p.active && (p.service || Number(p.stock) > 0)), [products]);
  const optionsFor = (keys) => inStock.filter((p) => keys.some((k) => (catName[p.category_id] || '').includes(k) || (catName[p.subcategory_id] || '').includes(k) || p.name.toLowerCase().includes(k)));
  const pmap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const txt = (p) => textOf(p, catName, brandName);

  // Compatibility: processor → motherboard (socket / AMD or Intel), motherboard (or processor) → RAM type.
  const cpuLine = lines.find((l) => l.group === 'Processor' && l.product_id);
  const boardLine = lines.find((l) => l.group === 'Motherboard' && l.product_id);
  const cpu = cpuLine ? cpuInfo(txt(pmap[cpuLine.product_id] || {})) : null;
  const board = boardLine ? boardInfo(txt(pmap[boardLine.product_id] || {})) : null;
  const wantDdr = board?.ddr || ({ AM5: 'DDR5', AM4: 'DDR4', LGA1851: 'DDR5', LGA1200: 'DDR4' })[cpu?.socket] || null;
  const fit = (group, p) => group === 'Motherboard' ? boardFitsCpu(boardInfo(txt(p)), cpu) : group === 'RAM' ? ramFits(ramInfo(txt(p)), wantDdr) : 'ok';
  const hint = (group) => {
    if (group === 'Motherboard' && cpu && (cpu.socket || cpu.vendor)) return `Showing ${cpu.socket || cpu.vendor.toUpperCase()} motherboards for the selected processor`;
    if (group === 'RAM' && wantDdr) return `Showing ${wantDdr} memory for the selected ${board?.ddr ? 'motherboard' : 'processor'}`;
    return '';
  };
  const upd = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i, id) => {
    const p = products.find((x) => x.id === id);
    upd(i, p ? { product_id: p.id, name: p.name, price: p.sale_price, warranty: p.has_warranty && Number(p.warranty_days) > 0 ? `${p.warranty_days} days` : '', manual: false } : { product_id: '', name: '', price: '', warranty: '', manual: false });
  };
  // A part typed by hand (not in stock, or not in Karvio yet): it goes on the quote with the price typed beside it.
  const typeManual = (i, text) => {
    const l = lines[i];
    if (!text) { upd(i, { manual: false, name: '', product_id: '', warranty: '', ...(l.manual ? { price: '' } : {}) }); return; }
    upd(i, { manual: true, name: text, product_id: '', ...(l.manual ? {} : { price: '', warranty: '' }) });
  };
  // Warranty shown on the quote, per line: the product's own period, the shop's warranty periods, or none.
  const warrantyDays = (l) => { const m = String(l.warranty || '').match(/^(\d+)\s*days?$/i); return m ? Number(m[1]) : 0; };
  const warrantyOptions = (l) => {
    const p = l.product_id && pmap[l.product_id];
    return [...new Set([...(warrantyPeriods || []).map((w) => Number(w.days)), p && p.has_warranty ? Number(p.warranty_days) : 0, warrantyDays(l), 0])].filter((d) => d >= 0).sort((a, b) => a - b);
  };
  const filled = lines.filter((l) => (l.product_id || (l.manual && String(l.name).trim())) && l.name && Number(l.qty) > 0);
  const pricing = quotationTotals(filled, meta.discount);
  const sub = pricing.subtotal, total = pricing.total;

  // A quotation needs the customer's name and mobile number (saving, printing and sending it).
  const needCustomer = () => {
    if (meta.customer.trim() && phoneOk) return true;
    setTouched(true);
    useStore.getState().toast(!meta.customer.trim() ? 'Write the customer name' : 'Write the customer\'s mobile number (01XXXXXXXXX)', 'err');
    return false;
  };
  const quote = () => { if (!pricing.valid) return useStore.getState().toast(pricing.error, 'err'); if (!needCustomer()) return; return printQuotation({ ...meta, discount: Number(meta.discount) || 0, lines: filled.map((l) => ({ ...l, price: Number(l.price) || 0 })) }); };
  const save = () => {
    if (!pricing.valid) return useStore.getState().toast(pricing.error, 'err');
    if (!needCustomer()) return;
    return runSave(async () => {
      const r = await api('quote.save', { id: savedId || undefined, kind, meta, lines });
      setSavedId(r.id); savedList.reload();
      useStore.getState().toast(`${savedId ? 'Quotation updated' : 'Quotation saved'} — ${meta.customer.trim()}`);
    }).catch(() => {});
  };
  // Send the quotation to the customer's mobile: an SMS with a private link, valid as set in Settings → Invoice → Link validity.
  const smsOn = settings.sms_enabled === 'true';
  const linkDays = (() => {
    const v = String(settings.quote_link_days ?? '').trim().toLowerCase();
    if (!v) return 3;
    if (v === 'life' || v === 'lifetime' || v === '0') return 0;
    const n = Math.round(Number(v));
    return n >= 1 && n <= 3650 ? n : 3;
  })();
  const linkLife = linkDays ? `valid ${linkDays} day${linkDays === 1 ? '' : 's'}` : 'never expires';
  const sendTitle = !smsOn ? 'Turn on SMS in Settings to send quotations' : !phoneOk ? 'Enter the customer\'s mobile number (01XXXXXXXXX)' : `Send this quotation to the customer by SMS (link ${linkLife})`;
  const clearAll = async () => {
    const used = filled.length || meta.customer.trim() || meta.phone.trim() || meta.note.trim() || String(meta.discount).trim();
    if (used && !await ask({ title: 'Clear this quotation?', message: `Every part, the customer and the notes on the ${KINDS[kind].label} tab are cleared. Saved quotations are not touched.`, confirmLabel: 'Clear' })) return;
    setLines(newLines(kind)); setMeta(blankMeta(kind)); setTouched(false); setSavedId('');
  };
  const toCustomer = async () => {
    if (!pricing.valid) return useStore.getState().toast(pricing.error, 'err');
    if (!needCustomer()) return;
    if (!await ask({ title: 'Send quotation by SMS?', message: <>Send <b>{meta.title || 'this quotation'}</b> ({money(total)}) to <b>{meta.phone}</b>? {linkDays ? <>The customer gets a link that works for <b>{linkDays} day{linkDays === 1 ? '' : 's'}</b>; then it is deleted.</> : <>The customer gets a link that <b>never expires</b>.</>}</>, confirmLabel: 'Send SMS' })) return;
    try {
      const r = await runSend(() => api('quote.send', {
        customer: meta.customer, phone: meta.phone, title: meta.title, valid_days: Number(meta.validDays) || 7, discount: Number(meta.discount) || 0, note: meta.note,
        lines: filled.map((l) => ({ group: l.group, name: l.name, warranty: l.warranty || '', qty: Number(l.qty), price: Number(l.price) || 0 }))
      }));
      useStore.getState().toast(`Quotation ${r.no} ${r.sms?.status === 'sent' ? 'sent' : 'queued for SMS'} to ${r.phone} — ${r.lifetime ? 'link never expires' : `link valid ${r.days || 3} day${r.days === 1 ? '' : 's'}`}`, 'ok');
    } catch { /* toast shown */ }
  };
  const toPos = async () => {
    if (!pricing.valid) return useStore.getState().toast(pricing.error, 'err');
    const inStock = filled.filter((l) => l.product_id);
    if (!inStock.length) return useStore.getState().toast('Add a stock product before sending to POS', 'err');
    const transferPricing = quotationTotals(inStock, meta.discount);
    if (!transferPricing.valid) return useStore.getState().toast('The discount exceeds the subtotal of products sent to POS. Reduce the discount before continuing. Your current cart has not changed.', 'err');
    const typed = filled.length - inStock.length;
    if (typed && Number(meta.discount) > 0 && !await ask({ title: 'Review the POS discount', message: <>The {typed} typed part{typed > 1 ? 's' : ''} will be left out. Keeping the full discount of <b>{money(meta.discount)}</b> on the remaining products changes the total from <b>{money(pricing.total)}</b> to <b>{money(transferPricing.total)}</b>. Review this amount before continuing.</>, confirmLabel: 'Keep discount and continue' })) return;
    if (loadPosDraft()?.cart?.length && !await ask({ title: 'Replace the POS cart?', message: 'Your current cart will be replaced by this quotation. Cancel to keep it.', confirmLabel: 'Replace cart' })) return;
    if (typed) useStore.getState().toast(`${typed} typed part${typed > 1 ? 's were' : ' was'} not sent to the POS — only products in stock can be sold there`);
    try { savePosDraft({ cart: inStock.map((l) => ({ product_id: l.product_id, qty: Number(l.qty), price: Number(l.price), serials: [], warranty_days: warrantyDays(l) })), customerId: '', discount: meta.discount }); }
    catch { return useStore.getState().toast('Could not save the POS cart. Nothing was replaced.', 'err'); }
    nav('/pos');
  };

  const deleteSaved = async (id) => {
    try { await api('quote.delete', { id }); useStore.getState().toast('Quotation deleted'); } catch (e) { useStore.getState().toast(e.message, 'err'); }
    if (id === savedId) setSavedId('');
    Object.values(drafts.current).forEach((d) => { if (d && d.savedId === id) d.savedId = ''; });
    savedList.reload();
  };
  return (
    <>
      {showSaved && <SavedQuotes saved={saved} onClose={() => setShowSaved(false)} onOpen={(q) => { switchTo(q.kind === 'cctv' ? 'cctv' : 'pc', { lines: q.lines, meta: q.meta, savedId: q.id }); setShowSaved(false); }} loading={savedList.loading && !savedList.data} error={savedList.error}
        onPrint={(q) => { const ls = q.lines.filter((l) => String(l.name || '').trim() && Number(l.qty) > 0); printQuotation({ ...q.meta, discount: Number(q.meta.discount) || 0, lines: ls.map((l) => ({ ...l, price: Number(l.price) || 0 })) }); }}
        onDelete={async (q) => { if (await ask({ title: 'Delete this saved quotation?', message: `${q.meta.customer || 'No name'} — ${q.meta.title}`, confirmLabel: 'Delete' })) deleteSaved(q.id); }} />}
      {confirmDialog /* after the saved list, so a question asked from it shows on top */}
      <PageHead title="Quotation" sub="Build a PC or a CC camera setup part by part, print a quote for the customer, or send it straight to the POS.">
        <Btn className="btn-clear" onClick={clearAll} aria-label="Clear this quotation"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 11v6m4-6v6" /></svg>Clear</Btn>
        <Btn onClick={save} busy={saving} disabled={!filled.length || !pricing.valid} title={savedId ? 'Saves the changes to the quotation you opened' : ''}>{savedId ? 'Save changes' : 'Save quotation'}</Btn>
        <Btn onClick={() => { savedList.reload(); setShowSaved(true); }}>See Saved Quotations{saved.length ? <span className="pcb-count">{saved.length}</span> : null}</Btn>
        <Btn onClick={toCustomer} busy={sending} disabled={!filled.length || !pricing.valid || !phoneOk || !smsOn} title={sendTitle}>Send to customer</Btn>
        <Btn onClick={toPos} disabled={!filled.some((l) => l.product_id) || !pricing.valid}>Send to POS</Btn>
        <Btn kind="primary" onClick={quote} disabled={!filled.length || !pricing.valid}>Print / PDF quote</Btn>
      </PageHead>
      <div className="split">
        <div className="card">
          <div style={{ marginBottom: 10 }}><Tabs tabs={Object.entries(KINDS).map(([k, v]) => [k, v.label])} value={kind} onChange={(k) => switchTo(k)} /></div>
          {lines.map((l, i) => {
            const slot = KINDS[kind].slots.find((s) => s[0] === l.group);
            const all = slot ? optionsFor(slot[1]) : inStock;
            const opts = all.filter((p) => fit(l.group, p) === 'ok');
            const maybe = all.filter((p) => fit(l.group, p) === 'unknown');
            const cur = l.product_id && pmap[l.product_id];
            const bad = cur && fit(l.group, cur) === 'no';
            const h = hint(l.group);
            return (
              <div className="pcb-row" key={i}>
                {slot ? <span className="g">{l.group}</span> : <input value={l.group} onChange={(e) => upd(i, { group: e.target.value })} placeholder="Part" />}
                <div>
                  <select value={l.product_id} onChange={(e) => pick(i, e.target.value)} aria-label={`${l.group} product`} className={bad ? 'invalid' : ''}>
                    <option value="">{all.length ? `Choose ${l.group.toLowerCase()}…` : `No ${l.group.toLowerCase()} in stock`}</option>
                    {opts.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.sale_price, false)} ({p.service ? 'service' : `${fqty(p.stock, p.unit)} in stock`})</option>)}
                    {maybe.length > 0 && <optgroup label="Compatibility not known — check the specs">{maybe.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.sale_price, false)} ({fqty(p.stock, p.unit)} in stock)</option>)}</optgroup>}
                    {bad && <option value={cur.id}>{cur.name} (not compatible)</option>}
                  </select>
                  {bad ? <small className="pcb-warn">Not compatible with the selected {l.group === 'RAM' ? (board?.ddr ? 'motherboard' : 'processor') : 'processor'} — choose another</small> : h && <small className="pcb-hint">{h}</small>}
                  <input className="pcb-manual" value={l.manual ? l.name : ''} onChange={(e) => typeManual(i, e.target.value)} placeholder="Or type a part that is not in stock…" aria-label={`${l.group} typed by hand`} />
                </div>
                <select value={warrantyDays(l)} onChange={(e) => upd(i, { warranty: Number(e.target.value) > 0 ? `${Number(e.target.value)} days` : '' })} aria-label={`${l.group} warranty`} title="Warranty shown on the quote">
                  {warrantyOptions(l).map((d) => <option key={d} value={d}>{d ? `${d} days warranty` : 'No warranty'}</option>)}
                </select>
                <input type="number" min="0" value={l.qty} onChange={(e) => upd(i, { qty: e.target.value })} onWheel={noWheel} aria-label="Qty" />
                <input type="number" min="0" step="any" value={l.price} onChange={(e) => upd(i, { price: e.target.value })} placeholder="Price" aria-label="Price" />
                <b className="r num">{l.name ? money((Number(l.qty) || 0) * (Number(l.price) || 0), false) : ''}</b>
                <button className="x" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line">×</button>
              </div>
            );
          })}
          <button className="link" style={{ marginTop: 10 }} onClick={() => setLines([...lines, { group: 'Other', product_id: '', name: '', qty: 1, price: '' }])}>+ Add another part</button>
        </div>
        <div className="grid">
          <div className="card form">
            <Field label={<>Customer name <i className="req">*</i></>} wide error={touched && !meta.customer.trim() ? 'Customer name is required' : ''}><input value={meta.customer} onChange={(e) => setMeta({ ...meta, customer: e.target.value })} aria-label="Customer name" aria-required="true" /></Field>
            <Field label={<>Phone <i className="req">*</i></>} error={(touched || phoneDigits.length >= 11) && !phoneOk ? (phoneDigits ? 'Use a mobile number like 01XXXXXXXXX' : 'Phone is required') : ''}><input value={meta.phone} inputMode="tel" placeholder="01XXXXXXXXX" onChange={(e) => setMeta({ ...meta, phone: e.target.value })} aria-label="Phone" aria-required="true" /></Field>
            <Field label="Valid for (days)"><input type="number" value={meta.validDays} onChange={(e) => setMeta({ ...meta, validDays: e.target.value })} /></Field>
            <Field label="Quote title" wide><input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} placeholder={KINDS[kind].example} /></Field>
            <Field label="Discount"><input type="number" step="any" value={meta.discount} onChange={(e) => setMeta({ ...meta, discount: e.target.value })} /></Field>
            <Field label="Notes" wide><textarea value={meta.note} onChange={(e) => setMeta({ ...meta, note: e.target.value })} placeholder={KINDS[kind].note} /></Field>
            <div className="wide totals">
              <span>{filled.length} parts</span><b className="num">{money(sub, false)}</b>
              <span>Grand total</span><span className="grand">{pricing.valid ? money(total) : '—'}</span>
            </div>
          </div>
          {pricing.error && <p className="errbox" role="alert">{pricing.error}</p>}
        </div>
      </div>
    </>
  );
}

/** Every saved quotation (all users, all devices): search, open, print or delete. */
function SavedQuotes({ saved, loading, error, onClose, onOpen, onPrint, onDelete }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const rows = saved.map((x) => {
    const ls = (x.lines || []).filter((l) => String(l.name || '').trim() && Number(l.qty) > 0);
    const t = quotationTotals(ls, x.meta.discount);
    return { ...x, parts: ls.length, total: t.valid ? t.total : 0 };
  }).filter((x) => (kind === 'all' || (x.kind || 'pc') === kind) && (!q.trim() || [x.meta.customer, x.meta.phone, x.meta.title].join(' ').toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <Modal open onClose={onClose} size="lg" title="Saved quotations" footer={<Btn onClick={onClose}>Close</Btn>}>
      <div className="row pcb-saved-bar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, phone or title" aria-label="Search saved quotations" autoFocus />
        <Tabs tabs={[['all', 'All'], ['pc', 'PC builder'], ['cctv', 'CC Camera']]} value={kind} onChange={setKind} />
      </div>
      <div className="dt" style={{ marginTop: 10 }}><div className="dt-scroll"><table>
        <thead><tr><th>Date</th><th>Customer</th><th>Phone</th><th>Type</th><th>Title</th><th className="r">Parts</th><th className="r">Total</th><th>Saved by</th><th /></tr></thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{fdate(x.date)}</td><td><b>{x.meta.customer || 'No name'}</b></td><td style={{ whiteSpace: 'nowrap' }}>{x.meta.phone || '—'}</td>
              <td><span className={`badge ${x.kind === 'cctv' ? 'badge-info' : 'badge-violet'}`}>{KINDS[x.kind || 'pc'].label}</span></td>
              <td>{x.meta.title}</td><td className="r">{x.parts}</td><td className="r num">{money(x.total, false)}</td><td className="muted">{x.updated_by || x.created_by || ''}</td>
              <td className="r pcb-saved-actions">
                <Btn size="sm" kind="primary" onClick={() => onOpen(x)}>Open</Btn>
                <Btn size="sm" onClick={() => onPrint(x)}>Print</Btn>
                <button className="link" style={{ color: 'var(--bad)' }} onClick={() => onDelete(x)} aria-label={`Delete the quotation for ${x.meta.customer || 'no name'}`}>Delete</button>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={9} className="muted">{loading ? 'Loading…' : error ? error : saved.length ? 'No saved quotation matches.' : 'No quotations saved yet. Fill one in and press Save quotation.'}</td></tr>}
        </tbody>
      </table></div></div>
      <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>Saved on the server: every user sees them on every device, and they stay until someone deletes them. Open one and press Save changes to update it.</p>
    </Modal>
  );
}
