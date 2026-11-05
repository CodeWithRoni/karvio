// Price manager: find products by group / category / brand / name and set retail & wholesale prices in bulk.
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, qty as fqty } from '../lib/format';
import { exportExcel } from '../lib/export';
import { PageHead, Btn, Field, Select, Badge, useAction } from '../components/ui';

const num = (v) => (v === '' || v === null || v === undefined ? '' : Number(v));

export default function Prices() {
  const { products, categories, brands, can, refresh } = useStore();
  const showCost = can('cost');
  const [f, setF] = useState({ cat: '', sub: '', brand: '', q: '', unpriced: false, services: true });
  const [draft, setDraft] = useState({}); // id -> { sale, whole }
  const [markup, setMarkup] = useState({ sale: '', whole: '' });
  const [busy, run] = useAction();

  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);
  const brandMap = useMemo(() => Object.fromEntries(brands.map((b) => [b.id, b.name])), [brands]);
  const tops = categories.filter((c) => !c.parent_id);
  const subs = categories.filter((c) => c.parent_id && (!f.cat || c.parent_id === f.cat));

  const value = (p, k) => (draft[p.id] && draft[p.id][k] !== undefined ? draft[p.id][k] : (k === 'sale' ? p.sale_price : p.wholesale_price) || '');
  const rows = useMemo(() => {
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter((p) => p.active
      && (!f.cat || p.category_id === f.cat) && (!f.sub || p.subcategory_id === f.sub) && (!f.brand || p.brand_id === f.brand)
      && (f.services || !p.service)
      && (!f.unpriced || !(Number(p.sale_price) > 0))
      && words.every((w) => `${p.name} ${p.sku || ''} ${p.barcode || ''}`.toLowerCase().includes(w)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, f]);

  const changes = Object.entries(draft).map(([id, d]) => {
    const p = products.find((x) => x.id === id); if (!p) return null;
    const sale = d.sale !== undefined ? num(d.sale) : p.sale_price, whole = d.whole !== undefined ? num(d.whole) : p.wholesale_price;
    if (Number(sale) === Number(p.sale_price) && Number(whole || 0) === Number(p.wholesale_price || 0)) return null;
    return { id, name: p.name, sale_price: sale, wholesale_price: whole === '' ? 0 : whole };
  }).filter(Boolean);
  const invalid = changes.filter((c) => !(Number(c.sale_price) > 0));
  const edit = (p, k, v) => setDraft((d) => ({ ...d, [p.id]: { ...d[p.id], [k]: v } }));

  // Fill prices from cost + markup % for the products currently shown (not saved until "Save changes").
  const applyMarkup = () => {
    const next = { ...draft };
    let n = 0;
    rows.forEach((p) => {
      if (!(p.cost_price > 0)) return;
      const d = { ...next[p.id] };
      if (markup.sale !== '') d.sale = Math.round(p.cost_price * (1 + Number(markup.sale) / 100));
      if (markup.whole !== '') d.whole = Math.round(p.cost_price * (1 + Number(markup.whole) / 100));
      next[p.id] = d; n++;
    });
    setDraft(next);
    useStore.getState().toast(n ? `Prices filled for ${n} products — check them, then Save changes` : 'None of the shown products has a cost price yet', n ? 'ok' : 'err');
  };

  const save = async () => {
    if (invalid.length) return useStore.getState().toast(`Retail price must be more than 0 for ${invalid[0].name}`, 'err');
    await run(async () => {
      const r = await api('price.update', { items: changes.map(({ id, sale_price, wholesale_price }) => ({ id, sale_price, wholesale_price })) });
      await refresh('products'); setDraft({});
      return r;
    }, `${changes.length} price${changes.length === 1 ? '' : 's'} updated`);
  };

  const exportRows = () => exportExcel('Price list', [
    { key: 'name', label: 'Product' }, { key: 'group', label: 'Product group' }, { key: 'category', label: 'Category' }, { key: 'brand', label: 'Brand' },
    ...(showCost ? [{ key: 'cost_price', label: 'Cost', type: 'money' }] : []), { key: 'sale_price', label: 'Retail', type: 'money' }, { key: 'wholesale_price', label: 'Wholesale', type: 'money' }
  ], rows.map((p) => ({ ...p, group: catMap[p.category_id] || '', category: catMap[p.subcategory_id] || '', brand: brandMap[p.brand_id] || '' })));

  return (
    <>
      <PageHead title="Price manager" sub="Find products by group, category, brand or name, then set their retail and wholesale prices. Changes are saved together.">
        <Btn onClick={exportRows} disabled={!rows.length}>Export Excel</Btn>
        {changes.length > 0 && <Btn onClick={() => setDraft({})}>Discard</Btn>}
        <Btn kind="primary" busy={busy} disabled={!changes.length} onClick={save}>Save changes{changes.length ? ` (${changes.length})` : ''}</Btn>
      </PageHead>

      <div className="filters">
        <Field label="Product group"><Select value={f.cat} onChange={(v) => setF({ ...f, cat: v, sub: '' })} options={tops} placeholder="All groups" /></Field>
        <Field label="Category"><Select value={f.sub} onChange={(v) => setF({ ...f, sub: v })} options={subs.map((c) => ({ ...c, name: f.cat ? c.name : `${catMap[c.parent_id]} / ${c.name}` }))} placeholder="All categories" /></Field>
        <Field label="Brand"><Select value={f.brand} onChange={(v) => setF({ ...f, brand: v })} options={brands} placeholder="All brands" /></Field>
        <Field label="Search product"><input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Name, model or barcode" style={{ minWidth: 220 }} /></Field>
        <label className="check" style={{ paddingBottom: 8 }}><input type="checkbox" checked={f.unpriced} onChange={(e) => setF({ ...f, unpriced: e.target.checked })} /> Only without retail price</label>
        <label className="check" style={{ paddingBottom: 8 }}><input type="checkbox" checked={f.services} onChange={(e) => setF({ ...f, services: e.target.checked })} /> Include services</label>
      </div>

      {showCost && (
        <div className="card price-tools">
          <b>Quick fill from cost</b>
          <label>Retail = cost +<input type="number" step="any" value={markup.sale} onChange={(e) => setMarkup({ ...markup, sale: e.target.value })} placeholder="%" aria-label="Retail markup percent" />%</label>
          <label>Wholesale = cost +<input type="number" step="any" value={markup.whole} onChange={(e) => setMarkup({ ...markup, whole: e.target.value })} placeholder="%" aria-label="Wholesale markup percent" />%</label>
          <Btn size="sm" disabled={!rows.length || (markup.sale === '' && markup.whole === '')} onClick={applyMarkup}>Apply to {rows.length} shown</Btn>
          <span className="muted">Rounded to whole taka. Nothing is saved until you press Save changes.</span>
        </div>
      )}

      <div className="dt"><div className="dt-scroll"><table className="price-table">
        <thead><tr>
          <th>Product</th><th>Group / category</th><th>Brand</th><th className="r">Stock</th>
          {showCost && <th className="r">Cost</th>}<th className="r" style={{ width: 140 }}>Retail price</th><th className="r" style={{ width: 140 }}>Wholesale</th>{showCost && <th className="r">Margin</th>}
        </tr></thead>
        <tbody>{rows.slice(0, 500).map((p) => {
          const sale = value(p, 'sale'), whole = value(p, 'whole');
          const dirty = changes.some((c) => c.id === p.id);
          const m = showCost && p.cost_price > 0 && Number(sale) > 0 ? Math.round(((sale - p.cost_price) / p.cost_price) * 100) : null;
          return (
            <tr key={p.id} className={dirty ? 'dirty' : ''}>
              <td><b>{p.name}</b>{p.sku && <div className="muted" style={{ fontSize: 12 }}>{p.sku}</div>}</td>
              <td>{catMap[p.category_id] || '—'}<div className="muted" style={{ fontSize: 12 }}>{catMap[p.subcategory_id] || ''}</div></td>
              <td>{brandMap[p.brand_id] || '—'}</td>
              <td className="r num">{p.service ? <Badge tone="info">Service</Badge> : fqty(p.stock, p.unit)}</td>
              {showCost && <td className="r num">{p.cost_price > 0 ? money(p.cost_price, false) : <span className="muted">—</span>}</td>}
              <td><input type="number" min="0" step="any" value={sale} onChange={(e) => edit(p, 'sale', e.target.value)} aria-label={`Retail price for ${p.name}`} className={dirty && !(Number(sale) > 0) ? 'invalid' : ''} placeholder="Not set" /></td>
              <td><input type="number" min="0" step="any" value={whole} onChange={(e) => edit(p, 'whole', e.target.value)} aria-label={`Wholesale price for ${p.name}`} placeholder="—" /></td>
              {showCost && <td className={`r num ${m !== null && m < 0 ? 'neg' : ''}`}>{m === null ? '—' : `${m}%`}</td>}
            </tr>
          );
        })}</tbody>
      </table>
      {!rows.length && <div className="empty"><b>No products match</b><div>Change the filters or search.</div></div>}
      {rows.length > 500 && <div className="empty"><div>Showing the first 500 of {rows.length}. Narrow the filters to see the rest.</div></div>}
      </div></div>
    </>
  );
}
