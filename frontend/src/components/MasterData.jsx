// Product groups contain categories. Keep the existing IDs and parent links.
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { Btn, Field, Modal, useAction, useConfirm } from './ui';

const Icon = {
  edit: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />,
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>
};
const Svg = ({ name, size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{Icon[name]}</svg>
);

/** Small outlined action button: tone = edit | delete | add */
function ActBtn({ tone, icon, children, className, ...p }) {
  // title = tooltip, so the button still explains itself when only its icon is shown
  return <button type="button" className={className || `act-btn act-${tone}`} title={typeof children === 'string' ? children : undefined} {...p}><Svg name={icon} />{children}</button>;
}

function Panel({ title, count, hint, form, search, setSearch, children, empty }) {
  return (
    <section className="md-panel">
      <header className="md-head">
        <div className="md-title"><h2>{title}</h2><span className="md-count">{count}</span></div>
        {hint && <p className="muted md-hint">{hint}</p>}
        {form}
        {setSearch && (
          <label className="md-search"><Svg name="search" size={14} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${title.toLowerCase()}`} aria-label={`Search ${title}`} />
          </label>
        )}
      </header>
      <div className="md-body">{children}{empty}</div>
    </section>
  );
}

export default function MasterData() {
  const { categories, brands, warrantyPeriods, units, products, refresh } = useStore();
  // Separate busy flags: only the button that was pressed shows the spinner.
  const [busyGroup, runGroup] = useAction();
  const [busyCat, runCat] = useAction();
  const [busyBrand, runBrand] = useAction();
  const [busyWarranty, runWarranty] = useAction();
  const [busyUnit, runUnit] = useAction();
  const [busyEdit, runEdit] = useAction();
  const [, runDel] = useAction();
  const runners = { group: runGroup, category: runCat, brand: runBrand, warranty_period: runWarranty, unit: runUnit };
  const [confirmUI, ask] = useConfirm();
  const [ng, setNg] = useState('');
  const [nc, setNc] = useState({ name: '', parent_id: '' });
  const [nb, setNb] = useState('');
  const [nw, setNw] = useState({ days: '', label: '' });
  const [nu, setNu] = useState({ name: '', label: '', decimal: false });
  const [qc, setQc] = useState('');
  const [qg, setQg] = useState('');
  const [qb, setQb] = useState('');
  const [edit, setEdit] = useState(null); // { kind, item, field, value }

  const tops = categories.filter((c) => !c.parent_id);
  const subsOf = (id) => categories.filter((c) => c.parent_id === id);
  const groupNames = Object.fromEntries(tops.map((g) => [g.id, g.name]));
  const used = useMemo(() => {
    const m = {};
    products.forEach((p) => { [p.category_id, p.subcategory_id, p.brand_id, p.unit && `unit:${p.unit}`].forEach((id) => { if (id) m[id] = (m[id] || 0) + 1; }); });
    return m;
  }, [products]);

  // The spinner keeps going until the list has reloaded, so the new item appears as the spinner stops.
  // Brands and warranty periods have no server-side duplicate check in older deployments, so stop repeats here too.
  const duplicateOf = (p) => {
    if (p.kind === 'brand') return brands.some((b) => b.id !== p.id && String(b.name).trim().toLowerCase() === String(p.name || '').trim().toLowerCase()) && 'This brand already exists';
    if (p.kind === 'warranty_period') return warrantyPeriods.some((w) => w.id !== p.id && Number(w.days) === Math.round(Number(p.days))) && `A ${Math.round(Number(p.days))}-day warranty period already exists`;
    if (p.kind === 'unit') { const n = String(p.name || '').trim().toLowerCase(), l = String(p.label || '').trim().toLowerCase(); return units.some((u) => u.id !== p.id && (u.name === n || (l && u.label.toLowerCase() === l))) && 'This selling unit already exists'; }
    return false;
  };
  const save = (p, msg, runner = runners[p.kind]) => runner(async () => { const dup = duplicateOf(p); if (dup) throw new Error(dup); const r = await api('master.save', p); await refresh('all'); return r; }, msg);
  const KIND = { group: 'product group', category: 'category', brand: 'brand', warranty_period: 'warranty period', unit: 'selling unit' };

  const del = async (kind, item) => {
    const name = item.name || item.label;
    const ok = await ask({
      title: `Delete ${KIND[kind]}?`,
      message: <>Are you sure you want to delete <b>“{name}”</b>?{kind === 'group' ? ' Delete its categories first.' : ''}{kind === 'unit' ? ' Units used by products cannot be deleted.' : kind !== 'warranty_period' ? ' Items used by products cannot be deleted.' : ' Products already set to this period keep their warranty days.'}</>
    });
    if (!ok) return;
    try { await runDel(async () => { await api('master.delete', { kind, id: item.id }); await refresh('all'); }, `${name} deleted`); } catch { /* error shown as a toast */ }
  };
  const saveEdit = async (e) => {
    e?.preventDefault();
    const v = String(edit.value).trim();
    if (!v || v === edit.item[edit.field]) return setEdit(null);
    try { await save({ ...edit.item, kind: edit.kind, [edit.field]: v }, 'Renamed', runEdit); setEdit(null); } catch {}
  };

  const q = qc.trim().toLowerCase();
  const shownGroups = tops.filter((g) => !qg.trim() || g.name.toLowerCase().includes(qg.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const childCategories = categories.filter((c) => c.parent_id);
  const shownCategories = childCategories.filter((c) => !q || `${c.name} ${groupNames[c.parent_id] || ''}`.toLowerCase().includes(q)).sort((a, b) => (groupNames[a.parent_id] || '').localeCompare(groupNames[b.parent_id] || '') || a.name.localeCompare(b.name));
  const shownBrands = brands.filter((b) => !qb.trim() || b.name.toLowerCase().includes(qb.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const periods = [...warrantyPeriods].sort((a, b) => a.days - b.days);
  const unitList = [...units].sort((a, b) => (a.name === 'pcs' ? -1 : b.name === 'pcs' ? 1 : a.label.localeCompare(b.label)));

  return (
    <div className="md-grid">
      <Panel title="Product groups" count={tops.length} hint="Create a group such as PROCESSOR. Its categories can be INTEL or AMD." search={qg} setSearch={setQg}
        form={
          <form className="md-form" onSubmit={(e) => { e.preventDefault(); save({ kind: 'group', name: ng }, 'Product group added').then(() => setNg('')).catch(() => {}); }}>
            <div className="md-form-row">
              <input value={ng} onChange={(e) => setNg(e.target.value)} placeholder="e.g. PROCESSOR" aria-label="Group name" />
              <Btn kind="primary" busy={busyGroup} type="submit" disabled={!ng.trim()}>Add</Btn>
            </div>
          </form>
        }
        empty={!shownGroups.length && <p className="md-empty">{qg ? 'No group matches your search.' : 'Add a product group first.'}</p>}>
        <ul className="md-list">
          {shownGroups.map((g) => <li className="md-row" key={g.id}>
            <div className="md-name"><b title={g.name}>{g.name}</b><small className="md-category-group">{subsOf(g.id).length} categories</small></div>
            <div className="md-actions">
              <ActBtn tone="add" icon="plus" className="act-btn act-add act-icon" title={`Add a category under ${g.name}`} aria-label={`Add category to ${g.name}`} onClick={() => { setNc({ name: '', parent_id: g.id }); document.querySelector('.md-form-cat input')?.focus(); }} />
              <ActBtn tone="edit" icon="edit" onClick={() => setEdit({ kind: 'group', item: g, field: 'name', value: g.name })} aria-label={`Rename ${g.name}`}>Rename</ActBtn>
              <ActBtn tone="delete" icon="trash" onClick={() => del('group', g)} aria-label={`Delete ${g.name}`}>Delete</ActBtn>
            </div>
          </li>)}
        </ul>
      </Panel>

      {/* ---------------- Categories ---------------- */}
      <Panel title="Categories" count={childCategories.length} hint="Select a product group, then add its category." search={qc} setSearch={setQc}
        form={
          <form className="md-form md-form-cat" onSubmit={(e) => { e.preventDefault(); if (!nc.parent_id) return; save({ kind: 'category', ...nc }, 'Category added').then(() => setNc({ name: '', parent_id: nc.parent_id })).catch(() => {}); }}>
            <select required value={nc.parent_id} onChange={(e) => setNc({ ...nc, parent_id: e.target.value })} aria-label="Category group">
              <option value="">Select a product group</option>
              {tops.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="md-form-row">
              <input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder="e.g. INTEL / AMD" aria-label="Category name" />
              <Btn kind="primary" busy={busyCat} type="submit" disabled={!nc.name.trim() || !nc.parent_id}>Add</Btn>
            </div>
          </form>
        }
        empty={!shownCategories.length && <p className="md-empty">{q ? 'No category matches your search.' : 'No categories yet. Choose a group above to add one.'}</p>}>
        <ul className="md-list">
          {shownCategories.map((c) => <li className="md-row" key={c.id}>
            <div className="md-name"><span title={c.name}>{c.name}</span><small className="md-category-group" title={groupNames[c.parent_id]}>{groupNames[c.parent_id] || 'Unknown group'}</small></div>
            <div className="md-actions">
              <ActBtn tone="edit" icon="edit" onClick={() => setEdit({ kind: 'category', item: c, field: 'name', value: c.name })} aria-label={`Rename ${c.name}`}>Rename</ActBtn>
              <ActBtn tone="delete" icon="trash" onClick={() => del('category', c)} aria-label={`Delete ${c.name}`}>Delete</ActBtn>
            </div>
          </li>)}
        </ul>
      </Panel>

      {/* ---------------- Brands ---------------- */}
      <Panel title="Brands" count={brands.length} search={qb} setSearch={setQb}
        form={
          <form className="md-form" onSubmit={(e) => { e.preventDefault(); save({ kind: 'brand', name: nb }, 'Brand added').then(() => setNb('')).catch(() => {}); }}>
            <div className="md-form-row">
              <input value={nb} onChange={(e) => setNb(e.target.value)} placeholder="Brand name, e.g. TP-Link" aria-label="Brand name" />
              <Btn kind="primary" busy={busyBrand} type="submit" disabled={!nb.trim()}>Add</Btn>
            </div>
          </form>
        }
        empty={!shownBrands.length && <p className="md-empty">{qb ? 'No brand matches your search.' : 'No brands yet. Add the brands you sell, like Kingston, TP-Link or Gigabyte.'}</p>}>
        <ul className="md-list">
          {shownBrands.map((b) => (
            <li className="md-row" key={b.id}>
              <span className="md-name" title={b.name}>{b.name}</span>
              {used[b.id] > 0 && <span className="md-pill md-used">{used[b.id]} products</span>}
              <div className="md-actions">
                <ActBtn tone="edit" icon="edit" onClick={() => setEdit({ kind: 'brand', item: b, field: 'name', value: b.name })} aria-label={`Rename ${b.name}`}>Rename</ActBtn>
                <ActBtn tone="delete" icon="trash" onClick={() => del('brand', b)} aria-label={`Delete ${b.name}`}>Delete</ActBtn>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {/* ---------------- Warranty periods ---------------- */}
      <Panel title="Warranty periods" count={periods.length} hint="Shown as choices on products and at the POS."
        form={
          <form className="md-form" onSubmit={(e) => { e.preventDefault(); save({ kind: 'warranty_period', ...nw }, 'Warranty period added').then(() => setNw({ days: '', label: '' })).catch(() => {}); }}>
            <div className="md-form-row">
              <input type="number" min="1" value={nw.days} onChange={(e) => setNw({ ...nw, days: e.target.value })} placeholder="Days" aria-label="Days" style={{ width: 90, flex: 'none' }} />
              <input value={nw.label} onChange={(e) => setNw({ ...nw, label: e.target.value })} placeholder="Label, e.g. 3 years" aria-label="Label" />
              <Btn kind="primary" busy={busyWarranty} type="submit" disabled={!nw.days}>Add</Btn>
            </div>
          </form>
        }
        empty={!periods.length && <p className="md-empty">No warranty periods yet.</p>}>
        <ul className="md-list">
          {periods.map((w) => (
            <li className="md-row" key={w.id}>
              <span className="md-name" title={w.label}>{w.label}</span>
              {String(w.label).trim().toLowerCase() !== `${w.days} days` && <span className="md-pill">{w.days} days</span>}
              <div className="md-actions">
                <ActBtn tone="edit" icon="edit" onClick={() => setEdit({ kind: 'warranty_period', item: w, field: 'label', value: w.label })} aria-label={`Rename ${w.label}`}>Rename</ActBtn>
                <ActBtn tone="delete" icon="trash" onClick={() => del('warranty_period', w)} aria-label={`Delete ${w.label}`}>Delete</ActBtn>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {/* ---------------- Selling units ---------------- */}
      <Panel title="Selling units" count={unitList.length} hint="Choices for “Selling unit” when you add a product. Tick Decimal for units sold in parts, like 1.5 meter."
        form={
          <form className="md-form" onSubmit={(e) => { e.preventDefault(); save({ kind: 'unit', ...nu }, 'Selling unit added').then(() => setNu({ name: '', label: '', decimal: false })).catch(() => {}); }}>
            <div className="md-form-row">
              <input value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} placeholder="Short, e.g. box" aria-label="Unit short name" maxLength={12} style={{ width: 120, flex: 'none' }} />
              <input value={nu.label} onChange={(e) => setNu({ ...nu, label: e.target.value })} placeholder="Full name, e.g. Box" aria-label="Unit full name" />
              <Btn kind="primary" busy={busyUnit} type="submit" disabled={!nu.name.trim()}>Add</Btn>
            </div>
            <label className="check md-check"><input type="checkbox" checked={nu.decimal} onChange={(e) => setNu({ ...nu, decimal: e.target.checked })} /> Decimal quantity (e.g. 1.5)</label>
          </form>
        }
        empty={!unitList.length && <p className="md-empty">No selling units yet.</p>}>
        <ul className="md-list">
          {unitList.map((u) => (
            <li className="md-row" key={u.id}>
              <span className="md-name" title={u.label}>{u.label}</span>
              {u.label.toLowerCase() !== u.name && <span className="md-pill">{u.name}</span>}
              {u.decimal && <span className="md-pill">decimal</span>}
              {used[`unit:${u.name}`] > 0 && <span className="md-pill md-used">{used[`unit:${u.name}`]} products</span>}
              <div className="md-actions">
                <ActBtn tone="edit" icon="edit" onClick={() => setEdit({ kind: 'unit', item: u, field: 'label', value: u.label })} aria-label={`Rename ${u.label}`}>Rename</ActBtn>
                {u.name !== 'pcs' && <ActBtn tone="delete" icon="trash" onClick={() => del('unit', u)} aria-label={`Delete ${u.label}`}>Delete</ActBtn>}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Modal open={!!edit} onClose={() => setEdit(null)} size="sm"
        title={edit ? `Rename ${KIND[edit.kind]}` : ''}
        footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn kind="primary" busy={busyEdit} onClick={saveEdit}>Save name</Btn></>}>
        {edit && (
          <form onSubmit={saveEdit}>
            <Field label="New name" wide><input value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} autoFocus /></Field>
          </form>
        )}
      </Modal>
      {confirmUI}
    </div>
  );
}
