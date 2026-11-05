import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { money, qty as fqty } from '../lib/format';
import { printQuotation } from '../lib/receipt';
import { textOf, cpuInfo, boardInfo, ramInfo, boardFitsCpu, ramFits } from '../lib/compat';
import { PageHead, Btn, Field } from '../components/ui';

// Suggest parts using their product group, category or product name.
const SLOTS = [
  ['Processor', ['cpu', 'processor']], ['Motherboard', ['motherboard']], ['RAM', ['ram', 'memory']], ['Storage', ['ssd', 'hdd', 'storage']],
  ['Graphics card', ['gpu', 'graphics']], ['Power supply', ['power supply', 'psu']], ['Casing', ['casing', 'case']], ['CPU cooler / fans', ['cool', 'fan']],
  ['Monitor', ['monitor']], ['Keyboard', ['keyboard']], ['Mouse', ['mouse']], ['UPS', ['ups']]
];
const SAVED = 'erp_quotes';
const loadSaved = () => { try { return JSON.parse(localStorage.getItem(SAVED)) || []; } catch { return []; } };
const newLines = () => SLOTS.map(([g]) => ({ group: g, product_id: '', name: '', qty: 1, price: '' }));

export default function PCBuilder() {
  const { products, categories, brands } = useStore();
  const nav = useNavigate();
  const [lines, setLines] = useState(newLines);
  const [meta, setMeta] = useState({ customer: '', phone: '', title: 'Custom PC build', discount: '', note: '', validDays: 7 });
  const [saved, setSaved] = useState(loadSaved);

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
    upd(i, p ? { product_id: p.id, name: p.name, price: p.sale_price, warranty: p.has_warranty ? `${p.warranty_days} days` : '' } : { product_id: '', name: '', price: '', warranty: '' });
  };
  const filled = lines.filter((l) => l.product_id && l.name && Number(l.qty) > 0);
  const sub = filled.reduce((a, l) => a + l.qty * (Number(l.price) || 0), 0);
  const total = sub - (Number(meta.discount) || 0);

  const quote = () => printQuotation({ ...meta, discount: Number(meta.discount) || 0, lines: filled.map((l) => ({ ...l, price: Number(l.price) || 0 })) });
  const save = () => {
    const q = { id: Date.now(), date: new Date().toISOString().slice(0, 10), meta, lines };
    const next = [q, ...saved].slice(0, 30); setSaved(next);
    try { localStorage.setItem(SAVED, JSON.stringify(next)); } catch {}
    useStore.getState().toast('Quote saved on this device');
  };
  const toPos = () => {
    const inStock = filled.filter((l) => l.product_id);
    try { localStorage.setItem('erp_pos_draft', JSON.stringify({ cart: inStock.map((l) => { const p = products.find((x) => x.id === l.product_id); return { product_id: l.product_id, qty: Number(l.qty), price: Number(l.price), serials: [], warranty_days: p?.has_warranty ? p.warranty_days : '' }; }), customerId: '', discount: meta.discount })); } catch {}
    nav('/pos');
  };

  return (
    <>
      <PageHead title="PC builder & quotations" sub="Build a setup part by part, print a quote for the customer, or send it straight to the POS.">
        <Btn onClick={() => setLines(newLines())}>Start over</Btn>
        <Btn onClick={save} disabled={!filled.length}>Save quote</Btn>
        <Btn onClick={toPos} disabled={!filled.some((l) => l.product_id)}>Send to POS</Btn>
        <Btn kind="primary" onClick={quote} disabled={!filled.length}>Print / PDF quote</Btn>
      </PageHead>
      <div className="split">
        <div className="card">
          {lines.map((l, i) => {
            const slot = SLOTS.find((s) => s[0] === l.group);
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
                </div>
                <input type="number" min="0" value={l.qty} onChange={(e) => upd(i, { qty: e.target.value })} aria-label="Qty" />
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
            <Field label="Customer name" wide><input value={meta.customer} onChange={(e) => setMeta({ ...meta, customer: e.target.value })} /></Field>
            <Field label="Phone"><input value={meta.phone} onChange={(e) => setMeta({ ...meta, phone: e.target.value })} /></Field>
            <Field label="Valid for (days)"><input type="number" value={meta.validDays} onChange={(e) => setMeta({ ...meta, validDays: e.target.value })} /></Field>
            <Field label="Quote title" wide><input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} placeholder="e.g. Gaming PC — Ryzen 5 / RTX 4060" /></Field>
            <Field label="Discount"><input type="number" step="any" value={meta.discount} onChange={(e) => setMeta({ ...meta, discount: e.target.value })} /></Field>
            <Field label="Notes" wide><textarea value={meta.note} onChange={(e) => setMeta({ ...meta, note: e.target.value })} placeholder="Assembly charge, OS installation, delivery…" /></Field>
            <div className="wide totals">
              <span>{filled.length} parts</span><b className="num">{money(sub, false)}</b>
              <span>Grand total</span><span className="grand">{money(total)}</span>
            </div>
          </div>
          {saved.length > 0 && (
            <div className="card">
              <h2 style={{ marginBottom: 8 }}>Saved quotes</h2>
              {saved.map((q) => (
                <div className="row" key={q.id} style={{ padding: '4px 0' }}>
                  <span>{q.meta.customer || 'No name'} — {q.meta.title}</span><span className="muted">{q.date}</span><span className="spacer" />
                  <button className="link" onClick={() => { setLines(q.lines); setMeta(q.meta); }}>Open</button>
                  <button className="x" onClick={() => { const n = saved.filter((x) => x.id !== q.id); setSaved(n); try { localStorage.setItem(SAVED, JSON.stringify(n)); } catch {} }} aria-label="Delete quote">×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
