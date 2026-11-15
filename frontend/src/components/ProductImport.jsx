import { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { Modal, Btn, Badge, useAction } from './ui';

// Excel columns ↔ fields. Headings are matched without caring about capital letters or spaces.
export const IMPORT_COLUMNS = [
  ['name', 'Product name'], ['sku', 'SKU'], ['barcode', 'Barcode'], ['group', 'Product group'], ['category', 'Category'], ['brand', 'Brand'],
  ['unit', 'Unit'], ['sale_price', 'Retail price'], ['wholesale_price', 'Wholesale price'], ['low_stock', 'Low stock alert'],
  ['warranty_days', 'Warranty days'], ['warranty_type', 'Warranty type'], ['service', 'Service'], ['description', 'Description']
];
const ALIASES = { 'name': 'name', 'product': 'name', 'product name': 'name', 'model': 'name', 'sku': 'sku', 'barcode': 'barcode', 'product group': 'group', 'group': 'group',
  'category': 'category', 'brand': 'brand', 'unit': 'unit', 'retail price': 'sale_price', 'sale price': 'sale_price', 'price': 'sale_price', 'wholesale price': 'wholesale_price',
  'low stock alert': 'low_stock', 'low stock': 'low_stock', 'warranty days': 'warranty_days', 'warranty': 'warranty_days', 'warranty type': 'warranty_type', 'service': 'service', 'description': 'description' };
const key = (h) => ALIASES[String(h || '').trim().toLowerCase().replace(/\s+/g, ' ')];

/** All products in the import layout, so a shop can edit them in Excel and import them back. */
export async function exportProducts(products, categories, brands) {
  const XLSX = await import('xlsx');
  const cat = Object.fromEntries(categories.map((c) => [c.id, c.name])), br = Object.fromEntries(brands.map((b) => [b.id, b.name]));
  const rows = products.map((p) => [p.name, p.sku || '', p.barcode || '', cat[p.category_id] || '', cat[p.subcategory_id] || '', br[p.brand_id] || '', p.unit || 'pcs',
    p.sale_price || '', p.wholesale_price || '', p.low_stock || '', p.has_warranty ? p.warranty_days : '', p.has_warranty ? p.warranty_type : 'none', p.service ? 'yes' : '', p.description || '']);
  const ws = XLSX.utils.aoa_to_sheet([IMPORT_COLUMNS.map(([, l]) => l), ...rows]);
  ws['!cols'] = IMPORT_COLUMNS.map(([k]) => ({ wch: k === 'name' || k === 'description' ? 34 : 14 }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Products');
  XLSX.writeFile(wb, `products-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function template() {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([IMPORT_COLUMNS.map(([, l]) => l),
    ['Logitech M331 Silent Mouse', 'LG-M331', '097855141322', 'Accessories', 'Mouse', 'Logitech', 'pcs', 950, 900, 5, 365, 'serial', '', 'Wireless, silent click'],
    ['Cat6 UTP Cable', 'CAT6-M', '', 'Networking', 'Cable', 'D-Link', 'meter', 35, 30, 100, '', 'none', '', 'Sold by the meter'],
    ['Windows installation', '', '', 'Service', '', '', 'pcs', 500, '', '', 7, 'invoice', 'yes', '']]);
  ws['!cols'] = IMPORT_COLUMNS.map(([k]) => ({ wch: k === 'name' || k === 'description' ? 30 : 14 }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Products');
  XLSX.writeFile(wb, 'karvio-products-template.xlsx');
}

/** Import dialog: pick a file → check (nothing saved) → import all rows in one save. */
export default function ProductImport({ onClose }) {
  const refresh = useStore((s) => s.refresh);
  const file = useRef();
  const [rows, setRows] = useState(null);
  const [check, setCheck] = useState(null);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, run] = useAction();
  const [checking, setChecking] = useState(false);
  const pick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setErr(''); setCheck(null); setRows(null); setName(f.name);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer());
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
      const list = raw.map((r) => { const o = {}; Object.entries(r).forEach(([h, v]) => { const k = key(h); if (k) o[k] = v; }); return o; })
        .filter((o) => Object.values(o).some((v) => String(v).trim() !== ''));
      if (!list.length) throw new Error('No product rows found. The first row must hold the column names (download the template to see them).');
      if (!list.some((o) => 'name' in o || 'barcode' in o || 'sku' in o)) throw new Error('No "Product name", "Barcode" or "SKU" column found.');
      setRows(list); setChecking(true);
      setCheck(await api('products.import.check', { rows: list }));
    } catch (e2) { setErr(e2.message); } finally { setChecking(false); }
  };
  const doImport = async () => {
    const r = await run(() => api('products.import', { rows }), null);
    useStore.getState().toast(`Imported: ${r.added} added, ${r.updated} updated${r.prices ? `, ${r.prices} prices set` : ''}`, 'ok');
    await refresh('all').catch(() => {});
    onClose();
  };
  const bad = check ? check.rows.filter((r) => r.action === 'error') : [];
  return (
    <Modal open onClose={onClose} size="lg" title="Import products from Excel"
      footer={<><Btn onClick={template}>Download template</Btn><span className="spacer" /><Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" busy={busy} disabled={!check || bad.length > 0 || !(check.counts.create + check.counts.update)} onClick={doImport}>{check ? `Import ${check.counts.create + check.counts.update} products` : 'Import'}</Btn></>}>
      <div className="imp">
        <p className="muted" style={{ marginTop: 0 }}>Use the template's columns (only <b>Product name</b> is required). A row updates the product with the same barcode, SKU or name; otherwise it adds a new one. Empty cells keep the current value. Missing product groups, categories and brands are created. Stock is not imported — it comes from purchases.</p>
        <div className="row" style={{ gap: 10 }}>
          <Btn kind={rows ? '' : 'primary'} onClick={() => file.current?.click()}>{rows ? 'Choose another file' : 'Choose Excel file'}</Btn>
          {name && <span className="muted">{name}{rows ? ` · ${rows.length} rows` : ''}</span>}
          <input ref={file} type="file" hidden accept=".xlsx,.xls,.csv,.ods" onChange={pick} aria-label="Excel file" />
        </div>
        {err && <div className="errbox" style={{ marginTop: 12 }}>{err}</div>}
        {checking && <p className="muted">Checking the file…</p>}
        {check && (
          <>
            <div className="imp-sum">
              <span><Badge tone="ok">{check.counts.create}</Badge> new</span>
              <span><Badge tone="info">{check.counts.update}</Badge> to update</span>
              <span><Badge tone={bad.length ? 'bad' : 'muted'}>{bad.length}</Badge> with problems</span>
            </div>
            {(check.new_groups.length + check.new_categories.length + check.new_brands.length) > 0 && (
              <p className="muted imp-new">Will also create: {[...check.new_groups.map((x) => `group ${x}`), ...check.new_categories.map((x) => `category ${x}`), ...check.new_brands.map((x) => `brand ${x}`)].join(', ')}.</p>
            )}
            <div className="dt-scroll imp-table"><table>
              <thead><tr><th>Row</th><th>Product</th><th>What happens</th></tr></thead>
              <tbody>{[...bad, ...check.rows.filter((r) => r.action !== 'error')].slice(0, 300).map((r) => (
                <tr key={r.line} className={r.action === 'error' ? 'imp-bad' : ''}>
                  <td className="num">{r.line}</td><td>{r.name || '—'}</td>
                  <td>{r.action === 'error' ? <span className="imp-err">{r.errors.join(' · ')}</span> : r.action === 'create' ? <Badge tone="ok">Add</Badge> : <Badge tone="info">Update</Badge>}</td>
                </tr>
              ))}</tbody>
            </table></div>
            {bad.length > 0 && <p className="imp-err">Fix the rows marked in red in your file, then choose it again. Nothing has been saved.</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
