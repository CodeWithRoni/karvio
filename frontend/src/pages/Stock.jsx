import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, qty as fqty } from '../lib/format';
import DataTable from '../components/DataTable';
import MasterData from '../components/MasterData';
import { PageHead, Tabs, Modal, Btn, Field, Badge, Select, useAction } from '../components/ui';

const blank = { name: '', sku: '', barcode: '', category_id: '', subcategory_id: '', brand_id: '', unit: 'pcs', roll_length: '', cost_price: '', sale_price: '', wholesale_price: '', low_stock: '', has_warranty: false, warranty_type: 'serial', warranty_days: 0, active: true };

export default function Stock() {
  const { products, categories, brands, can } = useStore();
  const [params] = useSearchParams();
  const [tab, setTab] = useState('stock');
  const [f, setF] = useState({ cat: '', sub: '', brand: '', qty: '', low: params.get('low') === '1', inactive: false });
  const [edit, setEdit] = useState(null);
  const [adj, setAdj] = useState(null);
  const lowDef = Number(useStore.getState().settings.low_stock_default || 5);

  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);
  const brandMap = useMemo(() => Object.fromEntries(brands.map((b) => [b.id, b.name])), [brands]);
  const tops = categories.filter((c) => !c.parent_id);
  const subs = categories.filter((c) => c.parent_id && (!f.cat || c.parent_id === f.cat));

  const rows = useMemo(() => products.filter((p) => {
    if (!f.inactive && !p.active) return false;
    if (f.cat && p.category_id !== f.cat) return false;
    if (f.sub && p.subcategory_id !== f.sub) return false;
    if (f.brand && p.brand_id !== f.brand) return false;
    if (f.qty !== '' && Number(p.stock) !== Number(f.qty)) return false;
    if (f.low && p.stock > (p.low_stock > 0 ? p.low_stock : lowDef)) return false;
    return true;
  }).map((p) => ({ ...p, group: catMap[p.category_id] || '', category: catMap[p.subcategory_id] || '', brand: brandMap[p.brand_id] || '', value: p.stock * (p.cost_price || 0) })), [products, f, catMap, brandMap, lowDef]);

  const cols = [
    { key: 'name', label: 'Product', render: (r) => <><b>{r.name}</b>{!r.active && <> <Badge>inactive</Badge></>}<div className="muted" style={{ fontSize: 12 }}>{[r.sku, r.barcode].filter(Boolean).join(' / ')}</div></> , value: (r) => r.name },
    { key: 'group', label: 'Product group' },
    { key: 'category', label: 'Category' },
    { key: 'brand', label: 'Brand' },
    { key: 'stock', label: 'Stock', type: 'num', render: (r) => <b style={{ color: r.stock <= 0 ? 'var(--bad)' : r.stock <= (r.low_stock > 0 ? r.low_stock : lowDef) ? 'var(--warn)' : undefined }}>{fqty(r.stock, r.unit)}</b> },
    { key: 'unit', label: 'Unit' },
    ...(can('cost') ? [{ key: 'cost_price', label: 'Cost', type: 'money' }] : []),
    { key: 'sale_price', label: 'Price', type: 'money' },
    ...(can('cost') ? [{ key: 'value', label: 'Stock value', type: 'money', sum: true }] : []),
    { key: 'warranty', label: 'Warranty', value: (r) => (r.has_warranty ? `${r.warranty_days}d ${r.warranty_type === 'serial' ? 'serial' : 'invoice'}` : ''), render: (r) => r.has_warranty ? <Badge tone="violet">{r.warranty_days}d · {r.warranty_type === 'serial' ? 'serial' : 'invoice'}</Badge> : '' },
    ...(can('products') ? [{ key: 'act', label: '', noSort: true, noExport: true, render: (r) => !(r.has_warranty && r.warranty_type === 'serial') && <Btn size="sm" onClick={(e) => { e.stopPropagation(); setAdj(r); }}>Adjust</Btn> }] : [])
  ];

  return (
    <>
      <PageHead title="Products & stock" sub="Filter by product group, category, brand or an exact stock quantity — 0 shows everything out of stock.">
        {can('products') && <Tabs tabs={[['stock', 'Stock explorer'], ['master', 'Categories, brands & warranty']]} value={tab} onChange={setTab} />}
        {can('products') && <Btn kind="primary" onClick={() => setEdit({ ...blank, low_stock: '' })}>Add product</Btn>}
      </PageHead>

      {tab === 'stock' ? (
        <>
          <div className="filters">
            <Field label="Product group"><Select value={f.cat} onChange={(v) => setF({ ...f, cat: v, sub: '' })} options={tops} placeholder="All groups" /></Field>
            <Field label="Category"><Select value={f.sub} onChange={(v) => setF({ ...f, sub: v })} options={subs.map((c) => ({ ...c, name: f.cat ? c.name : `${catMap[c.parent_id]} / ${c.name}` }))} placeholder="All categories" /></Field>
            <Field label="Brand"><Select value={f.brand} onChange={(v) => setF({ ...f, brand: v })} options={brands} placeholder="All brands" /></Field>
            <Field label="Exact stock qty"><input type="number" step="any" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} placeholder="e.g. 0" style={{ width: 120, minWidth: 0 }} /></Field>
            <label className="check" style={{ paddingBottom: 8 }}><input type="checkbox" checked={f.low} onChange={(e) => setF({ ...f, low: e.target.checked })} /> Low stock only</label>
            <label className="check" style={{ paddingBottom: 8 }}><input type="checkbox" checked={f.inactive} onChange={(e) => setF({ ...f, inactive: e.target.checked })} /> Show inactive</label>
            {(f.cat || f.sub || f.brand || f.qty !== '' || f.low) && <button className="link" style={{ paddingBottom: 10 }} onClick={() => setF({ cat: '', sub: '', brand: '', qty: '', low: false, inactive: false })}>Clear filters</button>}
          </div>
          <DataTable title="Stock report" rows={rows} columns={cols} onRowClick={can('products') ? (r) => setEdit(r) : undefined} pageSize={100} />
        </>
      ) : <MasterData />}

      {edit && <ProductForm initial={edit} onClose={() => setEdit(null)} />}
      {adj && <AdjustForm product={adj} onClose={() => setAdj(null)} />}
    </>
  );
}

function ProductForm({ initial, onClose }) {
  const { categories, brands, warrantyPeriods, refresh, can } = useStore();
  const [f, setF] = useState({ ...initial });
  const [busy, run] = useAction();
  const s = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const tops = categories.filter((c) => !c.parent_id);
  const subs = categories.filter((c) => c.parent_id && c.parent_id === f.category_id);
  const isNew = !f.id;
  const save = async () => {
    await run(() => api('product.save', f), isNew ? 'Product added' : 'Product updated');
    await refresh('products'); onClose();
  };
  const remove = async () => {
    if (!confirm('Delete this product? Products with sales or purchases are deactivated instead.')) return;
    const r = await run(() => api('product.delete', { id: f.id }));
    useStore.getState().toast(r.deleted ? 'Product deleted' : 'Product has history — it was deactivated');
    await refresh('products'); onClose();
  };
  return (
    <Modal open onClose={onClose} size="lg" title={isNew ? 'Add product' : `Edit — ${initial.name}`}
      footer={<>{!isNew && <Btn kind="danger" onClick={remove}>Delete</Btn>}<span className="spacer" /><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>{isNew ? 'Add product' : 'Save changes'}</Btn></>}>
      <div className="form">
        <Field label="Product name" wide><input value={f.name} onChange={s('name')} placeholder="e.g. TP-Link Archer C6 Router" autoFocus /></Field>
        <Field label="Barcode"><input value={f.barcode} onChange={s('barcode')} placeholder="Scan into this box" /></Field>
        <Field label="SKU / model"><input value={f.sku} onChange={s('sku')} /></Field>
        <Field label="Product group"><Select value={f.category_id} onChange={(v) => setF({ ...f, category_id: v, subcategory_id: '' })} options={tops} placeholder="Select a group" /></Field>
        <Field label="Category"><Select value={f.subcategory_id} onChange={(v) => setF({ ...f, subcategory_id: v })} options={subs} placeholder={f.category_id ? 'Select a category' : 'Select a group first'} /></Field>
        <Field label="Brand"><Select value={f.brand_id} onChange={(v) => setF({ ...f, brand_id: v })} options={brands} /></Field>
        <Field label="Selling unit" hint="Meter / feet lets you sell cable from bulk rolls.">
          <select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value, warranty_type: e.target.value !== 'pcs' ? 'invoice' : f.warranty_type })}>
            <option value="pcs">Pieces (pcs)</option><option value="meter">Meter</option><option value="feet">Feet</option>
          </select>
        </Field>
        {f.unit !== 'pcs' && <Field label={`Roll length (${f.unit})`} hint="For reference when buying rolls, e.g. 305 m Cat6 box."><input type="number" value={f.roll_length} onChange={s('roll_length')} /></Field>}
        {(isNew || can('cost')) && <Field label={`Cost price per ${f.unit}`}><input type="number" step="any" value={f.cost_price} onChange={s('cost_price')} /></Field>}
        <Field label={`Retail price per ${f.unit}`}><input type="number" step="any" value={f.sale_price} onChange={s('sale_price')} /></Field>
        {(isNew || can('cost')) && <Field label="Wholesale price"><input type="number" step="any" value={f.wholesale_price} onChange={s('wholesale_price')} /></Field>}
        <Field label="Low-stock alert at" hint="Blank uses the default from Settings."><input type="number" step="any" value={f.low_stock} onChange={s('low_stock')} /></Field>

        <div className="wide card" style={{ background: 'var(--panel-2)' }}>
          <label className="check"><input type="checkbox" checked={f.has_warranty} onChange={s('has_warranty')} /> This product has warranty</label>
          {f.has_warranty && (
            <div className="form" style={{ marginTop: 12 }}>
              <Field label="Warranty tracking">
                <select value={f.warranty_type} onChange={s('warranty_type')}>
                  <option value="serial" disabled={f.unit !== 'pcs'}>Serial-based (log each serial / IMEI)</option>
                  <option value="invoice">Invoice-based (no serials)</option>
                </select>
              </Field>
              <Field label="Default warranty period">
                <select value={f.warranty_days} onChange={s('warranty_days')}>
                  {[...new Set([Number(f.warranty_days) || 0, ...warrantyPeriods.map((w) => w.days)])].filter(Boolean).sort((a, b) => a - b).map((d) => <option key={d} value={d}>{warrantyPeriods.find((w) => w.days === d)?.label || `${d} days`}</option>)}
                  {!f.warranty_days && <option value={0}>Choose…</option>}
                </select>
              </Field>
              <Field label="Or custom days"><input type="number" min="1" value={f.warranty_days} onChange={s('warranty_days')} /></Field>
              <p className="muted wide" style={{ margin: 0 }}>{f.warranty_type === 'serial' ? 'Serial numbers are required when buying and selling this item, and every serial gets its own history.' : 'Warranty is proved by the invoice — good for cables and small accessories.'}</p>
            </div>
          )}
        </div>
        {!isNew && <label className="check"><input type="checkbox" checked={f.active} onChange={s('active')} /> Active (available for sale)</label>}
      </div>
    </Modal>
  );
}

function AdjustForm({ product, onClose }) {
  const refresh = useStore((s) => s.refresh);
  const [n, setN] = useState(product.stock);
  const [note, setNote] = useState('');
  const [busy, run] = useAction();
  const save = async () => { await run(() => api('stock.adjust', { product_id: product.id, new_stock: Number(n), note }), 'Stock updated'); await refresh('products'); onClose(); };
  return (
    <Modal open onClose={onClose} size="sm" title={`Adjust stock — ${product.name}`} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>Save count</Btn></>}>
      <div className="form">
        <Field label="Current" wide><input value={fqty(product.stock, product.unit)} readOnly /></Field>
        <Field label={`Counted quantity (${product.unit})`} wide><input type="number" step="any" min="0" value={n} onChange={(e) => setN(e.target.value)} /></Field>
        <Field label="Reason" wide><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. physical count, damaged" /></Field>
      </div>
    </Modal>
  );
}
