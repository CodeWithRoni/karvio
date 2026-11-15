import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { money, qty as fqty, fdate, today } from '../lib/format';
import { printHtml, esc, shopContacts, exportExcel } from '../lib/export';
import { logoImg } from '../lib/qr';
import { Modal, Btn, Field, Select } from './ui';

/** Price list for customers: pick groups / categories / brands, retail and/or wholesale, then print, save as PDF or Excel. */
export default function PriceList({ onClose }) {
  const { products, categories, brands, settings } = useStore();
  const [f, setF] = useState({ cat: '', sub: '', brand: '', retail: true, wholesale: false, stock: false, inStock: true, warranty: true, title: 'Price list' });
  const tops = categories.filter((c) => !c.parent_id), subs = categories.filter((c) => c.parent_id && (!f.cat || c.parent_id === f.cat));
  const cat = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);
  const br = useMemo(() => Object.fromEntries(brands.map((b) => [b.id, b.name])), [brands]);
  const rows = useMemo(() => products
    .filter((p) => p.active !== false && Number(p.sale_price) > 0 && (!f.cat || p.category_id === f.cat) && (!f.sub || p.subcategory_id === f.sub) && (!f.brand || p.brand_id === f.brand) && (!f.inStock || p.service || Number(p.stock) > 0))
    .sort((a, b) => (cat[a.category_id] || '~').localeCompare(cat[b.category_id] || '~') || (cat[a.subcategory_id] || '').localeCompare(cat[b.subcategory_id] || '') || a.name.localeCompare(b.name)),
  [products, f, cat]);
  const cols = [['name', 'Product'], ...(f.warranty ? [['w', 'Warranty']] : []), ...(f.stock ? [['s', 'Stock']] : []), ...(f.retail ? [['r', 'Retail price']] : []), ...(f.wholesale ? [['ws', 'Wholesale']] : [])];
  const cell = (p, k) => k === 'name' ? p.name + (br[p.brand_id] ? ` · ${br[p.brand_id]}` : '')
    : k === 'w' ? (p.has_warranty && p.warranty_days ? (p.warranty_days % 365 === 0 ? `${p.warranty_days / 365} yr` : `${p.warranty_days} days`) : '—')
      : k === 's' ? (p.service ? 'Service' : fqty(p.stock, p.unit)) : k === 'r' ? money(p.sale_price, false) : p.wholesale_price > 0 ? money(p.wholesale_price, false) : '—';
  const title = f.title.trim() || 'Price list';

  const print = () => {
    let group = null;
    const body = rows.map((p) => {
      const g = [cat[p.category_id], cat[p.subcategory_id]].filter(Boolean).join(' › ') || 'Other';
      const head = g !== group ? `<tr class="g"><td colspan="${cols.length}">${esc(g)}</td></tr>` : '';
      group = g;
      return head + `<tr>${cols.map(([k]) => `<td class="${k === 'name' ? '' : 'r'}">${esc(cell(p, k))}</td>`).join('')}</tr>`;
    }).join('');
    printHtml(`<style>@page{size:A4;margin:12mm}body{font:12px/1.4 'Manrope','Hind Siliguri',sans-serif;color:#111}
      .hd{display:flex;gap:14px;align-items:center;border-bottom:3px solid #0d1b2a;padding-bottom:10px;margin-bottom:12px}.doc-logo{max-height:56px;max-width:150px}
      h1{margin:0;font-size:20px}h2{margin:0 0 0 auto;font-size:18px;text-align:right}h2 small{display:block;font-size:11px;font-weight:400;color:#555}
      table{width:100%;border-collapse:collapse}th{background:#0d1b2a;color:#fff;text-align:left;padding:6px 8px;font-size:11px}th.r,td.r{text-align:right}
      td{padding:5px 8px;border-bottom:1px solid #dde3ea}tr.g td{background:#eef2f6;font-weight:800;padding-top:8px;border-bottom:0}
      .ft{margin-top:12px;font-size:10.5px;color:#555}</style>
      <div class="hd">${logoImg(settings)}<div><h1>${esc(settings.shop_name || 'Karvio')}</h1><div>${esc(settings.shop_address || '')}</div><div>${shopContacts(settings)}</div></div><h2>${esc(title)}<small>${esc(fdate(today()))} · ${rows.length} items</small></h2></div>
      <table><thead><tr>${cols.map(([k, l]) => `<th class="${k === 'name' ? '' : 'r'}">${esc(l)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
      <p class="ft">Prices in ${esc(settings.currency || 'Tk')}, valid on ${esc(fdate(today()))} and may change without notice. ${esc(settings.shop_footer || '')}</p>`);
  };
  const excel = () => exportExcel(`${title} ${today()}`, [{ key: 'group', label: 'Group' }, ...cols.map(([k, l]) => ({ key: k, label: l, type: ['r', 'ws'].includes(k) ? 'money' : undefined }))],
    rows.map((p) => ({ group: [cat[p.category_id], cat[p.subcategory_id]].filter(Boolean).join(' › '), ...Object.fromEntries(cols.map(([k]) => [k, ['r', 'ws'].includes(k) ? (k === 'r' ? p.sale_price : p.wholesale_price || '') : cell(p, k)])) })));

  return (
    <Modal open onClose={onClose} size="lg" title="Price list"
      footer={<><span className="muted">{rows.length} products</span><span className="spacer" /><Btn onClick={onClose}>Close</Btn><Btn onClick={excel} disabled={!rows.length}>Excel</Btn><Btn kind="primary" onClick={print} disabled={!rows.length || (!f.retail && !f.wholesale)}>Print / save PDF</Btn></>}>
      <div className="form">
        <Field label="Title" wide><input value={f.title} maxLength={60} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Product group"><Select value={f.cat} onChange={(v) => setF({ ...f, cat: v, sub: '' })} options={tops} placeholder="All groups" /></Field>
        <Field label="Category"><Select value={f.sub} onChange={(v) => setF({ ...f, sub: v })} options={subs} placeholder="All categories" /></Field>
        <Field label="Brand"><Select value={f.brand} onChange={(v) => setF({ ...f, brand: v })} options={brands} placeholder="All brands" /></Field>
        <div className="wide pl-checks">
          {[['retail', 'Retail price'], ['wholesale', 'Wholesale price'], ['warranty', 'Warranty'], ['stock', 'Stock quantity'], ['inStock', 'Only items in stock']].map(([k, l]) => (
            <label className="check" key={k}><input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} /> {l}</label>
          ))}
        </div>
      </div>
      <div className="dt-scroll pl-preview"><table>
        <thead><tr>{cols.map(([k, l]) => <th key={k} className={k === 'name' ? '' : 'r'}>{l}</th>)}</tr></thead>
        <tbody>{rows.slice(0, 60).map((p) => <tr key={p.id}>{cols.map(([k]) => <td key={k} className={k === 'name' ? '' : 'r num'}>{cell(p, k)}</td>)}</tr>)}</tbody>
      </table>{rows.length > 60 && <p className="muted" style={{ margin: 8 }}>Preview shows 60 of {rows.length}; the printout has all.</p>}{!rows.length && <p className="muted" style={{ margin: 12 }}>No priced products match.</p>}</div>
    </Modal>
  );
}
