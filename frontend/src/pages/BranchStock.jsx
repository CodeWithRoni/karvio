import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { money, qty as fqty } from '../lib/format';
import DataTable from '../components/DataTable';
import { stockQuantityTotal } from '../lib/stockTotals';
import { useApi, PageHead, Field, ErrorBox, Loading, Empty } from '../components/ui';

const TRANSIT = '__transit';

/** Stock → Branch stock: every product with how much each branch holds, what is on the way between branches, and the shop total. */
export default function BranchStock() {
  const on = useStore((s) => !!s.branches?.on);
  const here = useStore((s) => s.branches?.current || '');
  const q = useApi('branch.stock', {}, [], { skip: !on });
  const [f, setF] = useState({ group: '', category: '', brand: '', branch: '', inStock: true, serials: false });
  const d = q.data;

  const flat = useMemo(() => (d?.rows || []).map((r) => {
    const o = { ...r };
    d.branches.forEach((b) => { o[`b_${b.id}`] = r.by[b.id] || 0; });
    o.serial_text = Object.entries(r.serials || {}).map(([id, list]) => `${id === TRANSIT ? 'On the way' : (d.branches.find((b) => b.id === id) || {}).name || id}: ${list.join(', ')}`).join(' | ');
    return o;
  }), [d]);
  const opts = (k) => [...new Set(flat.map((r) => r[k]))].sort((a, b) => String(a).localeCompare(String(b)));
  const rows = flat.filter((r) => (!f.group || r.group === f.group) && (!f.category || r.category === f.category) && (!f.brand || r.brand === f.brand)
    && (!f.inStock || r.total > 0) && (!f.branch || (f.branch === TRANSIT ? r.transit > 0 : r[`b_${f.branch}`] > 0)));

  if (!on) return <><PageHead title="Branch stock" /><Empty icon="box" title="Branches are off">An admin can add branches in Settings → Branches.</Empty></>;

  const branches = d?.branches || [];
  // Card totals keep each selling unit apart (pcs and meters are not added together).
  const unitTotal = (key) => { const t = stockQuantityTotal(flat, key); return typeof t === 'number' ? fqty(t) : t; };
  const cell = (n) => (n ? <b>{fqty(n)}</b> : <span className="bs-zero">0</span>);
  const where = (id) => (id === TRANSIT ? 'On the way' : (branches.find((b) => b.id === id) || {}).name || id);
  const cols = [
    { key: 'name', label: 'Product', render: (r) => <><b>{r.name}</b>{!r.active && <small className="muted"> (inactive)</small>}<div className="bs-meta">{[r.group, r.category, r.brand].filter((x) => !/^No /.test(x)).join(' · ')}</div></> },
    { key: 'unit', label: 'Unit' },
    ...branches.map((b) => ({ key: `b_${b.id}`, label: `${b.name}${b.active ? '' : ' (closed)'}`, type: 'num', className: b.id === here ? 'bs-here' : '',
      sum: true, render: (r) => cell(r[`b_${b.id}`]), total: (list) => stockQuantityTotal(list, `b_${b.id}`) })),
    { key: 'transit', label: 'On the way', type: 'num', sum: true, render: (r) => cell(r.transit), total: (list) => stockQuantityTotal(list, 'transit') },
    { key: 'total', label: 'Total', type: 'num', className: 'bs-total', sum: true, render: (r) => <b>{fqty(r.total)}</b>, total: (list) => stockQuantityTotal(list, 'total') },
    ...(d?.cost ? [{ key: 'value', label: 'Stock value', type: 'money', sum: true }] : []),
    // serial products: which serial numbers are where (Excel / PDF get the same text)
    ...(f.serials ? [{ key: 'serial_text', label: 'Serial numbers', className: 'bs-sn-col', noSort: true,
      render: (r) => Object.entries(r.serials || {}).map(([id, list]) => <div key={id} className="bs-sn"><span>{where(id)}:</span> {list.join(', ')}</div>) }] : [])
  ];

  return (
    <>
      <PageHead title="Branch stock" sub="How much of every product each branch has, what is on the way between branches, and the total in the shop." />
      <ErrorBox error={q.error} onRetry={q.reload} />
      {q.loading && !d ? <Loading label="Reading every branch" /> : d && <>
        <div className="bs-sum">
          {branches.map((b) => (
            <button type="button" key={b.id} className={`card bs-card ${f.branch === b.id ? 'on' : ''} ${b.id === here ? 'here' : ''}`} onClick={() => setF({ ...f, branch: f.branch === b.id ? '' : b.id })} aria-pressed={f.branch === b.id} title="Show only the products this branch has">
              <span>{b.name}{b.id === here ? ' · you are here' : ''}</span><b className="num">{unitTotal(`b_${b.id}`)}</b><small>in stock</small>
            </button>
          ))}
          <button type="button" className={`card bs-card transit ${f.branch === TRANSIT ? 'on' : ''}`} onClick={() => setF({ ...f, branch: f.branch === TRANSIT ? '' : TRANSIT })} aria-pressed={f.branch === TRANSIT} title="Show only what is on the way">
            <span>On the way</span><b className="num">{unitTotal('transit')}</b><small>between branches</small>
          </button>
          <div className="card bs-card all"><span>All branches</span><b className="num">{unitTotal('total')}</b><small>{d.cost ? `${money(d.totals.value)} at cost` : 'in the shop'}</small></div>
        </div>
        <div className="filters">
          <Field label="Product group"><select value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })}><option value="">All groups</option>{opts('group').map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Category"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">All categories</option>{opts('category').map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Brand"><select value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })}><option value="">All brands</option>{opts('brand').map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Branch"><select value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}><option value="">Every branch</option>{branches.map((b) => <option key={b.id} value={b.id}>Has stock in {b.name}</option>)}<option value={TRANSIT}>On the way</option></select></Field>
          <label className="check"><input type="checkbox" checked={f.inStock} onChange={(e) => setF({ ...f, inStock: e.target.checked })} /> Only products with stock</label>
          <label className="check"><input type="checkbox" checked={f.serials} onChange={(e) => setF({ ...f, serials: e.target.checked })} /> Show serial numbers</label>
        </div>
        <DataTable title="Branch stock" rows={rows} columns={cols}
          empty={<Empty icon="search" title="No products match">Clear a filter above, or untick "Only products with stock".</Empty>} />
      </>}
    </>
  );
}
