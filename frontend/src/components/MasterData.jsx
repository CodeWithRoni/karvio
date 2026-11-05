// Categories → sub-categories, brands and warranty periods.
// Three equal, fixed-height panels: header and add-form stay put, the list scrolls.
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
  return <button type="button" className={className || `act-btn act-${tone}`} {...p}><Svg name={icon} />{children}</button>;
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
  const { categories, brands, warrantyPeriods, products, refresh } = useStore();
  const [busy, run] = useAction();
  const [confirmUI, ask] = useConfirm();
  const [nc, setNc] = useState({ name: '', parent_id: '' });
  const [nb, setNb] = useState('');
  const [nw, setNw] = useState({ days: '', label: '' });
  const [qc, setQc] = useState('');
  const [qb, setQb] = useState('');
  const [closed, setClosed] = useState({});
  const [edit, setEdit] = useState(null); // { kind, item, field, value }

  const tops = categories.filter((c) => !c.parent_id);
  const subsOf = (id) => categories.filter((c) => c.parent_id === id);
  const used = useMemo(() => {
    const m = {};
    products.forEach((p) => { [p.category_id, p.subcategory_id, p.brand_id].forEach((id) => { if (id) m[id] = (m[id] || 0) + 1; }); });
    return m;
  }, [products]);

  const save = async (p, msg) => { await run(() => api('master.save', p), msg); await refresh('all'); };
  const KIND = { category: 'category', brand: 'brand', warranty_period: 'warranty period' };

  const del = async (kind, item) => {
    const name = item.name || item.label;
    const isMain = kind === 'category' && !item.parent_id;
    const ok = await ask({
      title: `Delete ${isMain ? 'category' : kind === 'category' ? 'sub-category' : KIND[kind]}?`,
      message: <>Are you sure you want to delete <b>“{name}”</b>?{isMain ? ' Its sub-categories must be deleted first.' : ''}{kind !== 'warranty_period' ? ' Items used by products cannot be deleted.' : ' Products already set to this period keep their warranty days.'}</>
    });
    if (!ok) return;
    try { await run(() => api('master.delete', { kind, id: item.id }), `${name} deleted`); } catch { return; }
    await refresh('all');
  };
  const saveEdit = async (e) => {
    e?.preventDefault();
    const v = String(edit.value).trim();
    if (!v || v === edit.item[edit.field]) return setEdit(null);
    try { await save({ ...edit.item, kind: edit.kind, [edit.field]: v }, 'Renamed'); setEdit(null); } catch {}
  };

  // category search: show a main category if it or any of its sub-categories match
  const q = qc.trim().toLowerCase();
  const visibleTops = tops.filter((t) => !q || t.name.toLowerCase().includes(q) || subsOf(t.id).some((s) => s.name.toLowerCase().includes(q)));
  const shownBrands = brands.filter((b) => !qb.trim() || b.name.toLowerCase().includes(qb.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const periods = [...warrantyPeriods].sort((a, b) => a.days - b.days);

  return (
    <div className="md-grid">
      {/* ---------------- Categories ---------------- */}
      <Panel title="Categories" count={`${tops.length} main · ${categories.length - tops.length} sub`} search={qc} setSearch={setQc}
        form={
          <form className="md-form md-form-cat" onSubmit={(e) => { e.preventDefault(); save({ kind: 'category', ...nc }, nc.parent_id ? 'Sub-category added' : 'Category added').then(() => setNc({ name: '', parent_id: nc.parent_id })).catch(() => {}); }}>
            <select value={nc.parent_id} onChange={(e) => setNc({ ...nc, parent_id: e.target.value })} aria-label="Add as">
              <option value="">New main category</option>
              {tops.map((t) => <option key={t.id} value={t.id}>Sub-category of {t.name}</option>)}
            </select>
            <div className="md-form-row">
              <input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder={nc.parent_id ? 'Sub-category name' : 'Category name'} aria-label="Name" />
              <Btn kind="primary" busy={busy} type="submit" disabled={!nc.name.trim()}>Add</Btn>
            </div>
          </form>
        }
        empty={!visibleTops.length && <p className="md-empty">{q ? 'No category matches your search.' : 'No categories yet.'}</p>}>
        {visibleTops.map((t) => {
          const subs = subsOf(t.id).filter((s) => !q || t.name.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
          const open = q ? true : !closed[t.id];
          return (
            <div className="md-group" key={t.id}>
              <div className="md-row md-main">
                <button type="button" className={`md-toggle ${open ? 'open' : ''}`} onClick={() => setClosed({ ...closed, [t.id]: open })} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${t.name}`}>
                  <Svg name="chevron" size={14} />
                </button>
                <span className="md-name" title={t.name}>{t.name}<small className="md-subcount">{subsOf(t.id).length}</small></span>
                <div className="md-actions">
                  <ActBtn tone="add" icon="plus" title={`Add a sub-category under ${t.name}`} aria-label={`Add sub-category to ${t.name}`} className="act-btn act-add act-icon" onClick={() => { setNc({ name: '', parent_id: t.id }); setTimeout(() => document.querySelector('.md-form-cat input')?.focus(), 0); }} />
                  <ActBtn tone="edit" icon="edit" onClick={() => setEdit({ kind: 'category', item: t, field: 'name', value: t.name })} aria-label={`Rename ${t.name}`}>Rename</ActBtn>
                  <ActBtn tone="delete" icon="trash" onClick={() => del('category', t)} aria-label={`Delete ${t.name}`}>Delete</ActBtn>
                </div>
              </div>
              {open && (
                <ul className="md-subs">
                  {subs.map((c) => (
                    <li className="md-row md-sub" key={c.id}>
                      <span className="md-name" title={c.name}>{c.name}</span>
                      {used[c.id] > 0 && <span className="md-pill md-used" title="Products in this sub-category">{used[c.id]} products</span>}
                      <div className="md-actions">
                        <ActBtn tone="edit" icon="edit" onClick={() => setEdit({ kind: 'category', item: c, field: 'name', value: c.name })} aria-label={`Rename ${c.name}`}>Rename</ActBtn>
                        <ActBtn tone="delete" icon="trash" onClick={() => del('category', c)} aria-label={`Delete ${c.name}`}>Delete</ActBtn>
                      </div>
                    </li>
                  ))}
                  {!subs.length && <li className="md-sub md-none">No sub-categories yet</li>}
                </ul>
              )}
            </div>
          );
        })}
      </Panel>

      {/* ---------------- Brands ---------------- */}
      <Panel title="Brands" count={brands.length} search={qb} setSearch={setQb}
        form={
          <form className="md-form" onSubmit={(e) => { e.preventDefault(); save({ kind: 'brand', name: nb }, 'Brand added').then(() => setNb('')).catch(() => {}); }}>
            <div className="md-form-row">
              <input value={nb} onChange={(e) => setNb(e.target.value)} placeholder="Brand name, e.g. TP-Link" aria-label="Brand name" />
              <Btn kind="primary" busy={busy} type="submit" disabled={!nb.trim()}>Add</Btn>
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
              <Btn kind="primary" busy={busy} type="submit" disabled={!nw.days}>Add</Btn>
            </div>
          </form>
        }
        empty={!periods.length && <p className="md-empty">No warranty periods yet.</p>}>
        <ul className="md-list">
          {periods.map((w) => (
            <li className="md-row" key={w.id}>
              <span className="md-name" title={w.label}>{w.label}</span>
              <span className="md-pill">{w.days} days</span>
              <div className="md-actions">
                <ActBtn tone="edit" icon="edit" onClick={() => setEdit({ kind: 'warranty_period', item: w, field: 'label', value: w.label })} aria-label={`Rename ${w.label}`}>Rename</ActBtn>
                <ActBtn tone="delete" icon="trash" onClick={() => del('warranty_period', w)} aria-label={`Delete ${w.label}`}>Delete</ActBtn>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Modal open={!!edit} onClose={() => setEdit(null)} size="sm"
        title={edit ? `Rename ${edit.kind === 'category' ? (edit.item.parent_id ? 'sub-category' : 'category') : KIND[edit.kind]}` : ''}
        footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={saveEdit}>Save name</Btn></>}>
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
