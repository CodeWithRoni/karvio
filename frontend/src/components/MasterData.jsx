// Product groups contain categories. Keep the existing IDs and parent links.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { Btn, Field, Modal, useAction, useConfirm } from './ui';
import { exportExcel, exportPdf, printTable } from '../lib/export';

const Icon = {
  edit: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />,
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  export: <><path d="M14 3H5v18h14v-8M14 3v5h5" /><path d="M12 12 21 3m-6 0h6v6" /></>,
  import: <><path d="M14 3H5v18h14v-8M14 3v5h5" /><path d="m21 3-9 9m0-6v6h6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></>
};
const Svg = ({ name, size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{Icon[name]}</svg>
);

/** Small outlined action button: tone = edit | delete | add */
function ActBtn({ tone, icon, children, className, ...p }) {
  // title = tooltip, so the button still explains itself when only its icon is shown
  return <button type="button" className={className || `act-btn act-${tone} act-icon`} title={p['aria-label'] || (typeof children === 'string' ? children : undefined)} {...p}><Svg name={icon} /></button>;
}

/* Export (Excel / PDF / Print), Import from Excel or CSV, and a demo file to copy the layout from. */
export const IO = {
  group: { file: 'product-groups', cols: [{ key: 'name', label: 'Name' }], demo: [['PROCESSOR'], ['MOTHERBOARD'], ['ROUTER']] },
  category: { file: 'categories', cols: [{ key: 'group', label: 'Group' }, { key: 'name', label: 'Category' }], demo: [['PROCESSOR', 'INTEL'], ['PROCESSOR', 'AMD'], ['ROUTER', 'DUAL BAND']] },
  brand: { file: 'brands', cols: [{ key: 'name', label: 'Name' }], demo: [['TP-Link'], ['Gigabyte'], ['Kingston']] },
  warranty_period: { file: 'warranty-periods', cols: [{ key: 'days', label: 'Days', type: 'num' }, { key: 'label', label: 'Label' }], demo: [[365, '1 year'], [730, '2 years'], [1095, '3 years']] },
  unit: { file: 'selling-units', cols: [{ key: 'name', label: 'Short name' }, { key: 'label', label: 'Full name' }, { key: 'decimal', label: 'Decimal' }], demo: [['box', 'Box', 'No'], ['set', 'Set', 'No'], ['kg', 'Kilogram', 'Yes']] }
};
// Accepted column titles in an import file (case, spaces and symbols are ignored).
const ALIASES = {
  name: ['name', 'group', 'productgroup', 'groupname', 'category', 'categoryname', 'brand', 'brandname', 'short', 'shortname', 'code', 'unit'],
  group: ['group', 'productgroup', 'groupname', 'parent'],
  label: ['label', 'fullname', 'title', 'unitname'],
  days: ['days', 'warrantydays', 'day'],
  decimal: ['decimal', 'decimalquantity', 'fraction']
};
function mapRows(kind, raw) {
  return raw.map((r) => {
    const cells = Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).toLowerCase().replace(/[^a-z]/g, ''), String(v ?? '').trim()]));
    const pick = (field, skip = []) => { for (const a of ALIASES[field]) if (a in cells && !skip.includes(a)) return cells[a]; return ''; };
    const out = {};
    if (kind === 'category') { out.group = pick('group'); out.name = cells.category || cells.categoryname || cells.name || ''; }
    else if (kind === 'warranty_period') { out.days = pick('days'); out.label = pick('label') || cells.name || ''; }
    else if (kind === 'unit') { out.name = pick('name'); out.label = pick('label') || cells.name || ''; out.decimal = pick('decimal'); }
    else out.name = pick('name');
    return out;
  }).filter((r) => Object.values(r).some((v) => v !== ''));
}

function PanelTools({ kind, title, rows, onImport, busy, selectedCount, onDelete }) {
  const [open, setOpen] = useState(false);
  const box = useRef(), file = useRef();
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const io = IO[kind];
  const run = (fn) => { setOpen(false); fn(title, io.cols, rows); };
  const demo = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([io.cols.map((c) => c.label), ...io.demo]);
    ws['!cols'] = io.cols.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Import');
    XLSX.writeFile(wb, `demo-import-${io.file}.xlsx`);
  };
  const pickFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await f.arrayBuffer());
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
    onImport(kind, mapRows(kind, raw), f.name);
  };
  return (
    <div className="md-tools" ref={box}>
      {!!selectedCount && <><span className="md-count">{selectedCount} selected</span><ActBtn tone="delete" icon="trash" disabled={busy} aria-label={`Delete selected ${title}`} onClick={onDelete} /></>}
      <button type="button" className="md-tool" title={selectedCount ? `Export ${selectedCount} selected ${title}` : `Export ${title}`} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={`Export ${title}`}><Svg name="export" size={16} /></button>
      {open && (
        <div className="md-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => run(exportExcel)}>Excel (.xlsx)</button>
          <button type="button" role="menuitem" onClick={() => run(exportPdf)}>PDF</button>
          <button type="button" role="menuitem" onClick={() => run(printTable)}>Print</button>
        </div>
      )}
      <button type="button" className="md-tool" title={`Import ${title}`} disabled={busy} onClick={() => file.current?.click()} aria-label={`Import ${title}`}><Svg name="import" size={16} /></button>
      <input ref={file} type="file" hidden accept=".xlsx,.xls,.csv,.ods" onChange={pickFile} />
      <button type="button" className="md-info" title="Download demo import" data-tip="Download demo import" aria-label={`Download demo import file for ${title}`} onClick={demo}><Svg name="info" size={15} /></button>
    </div>
  );
}

function Panel({ title, count, hint, form, search, setSearch, children, empty, tools }) {
  return (
    <section className="md-panel">
      <header className="md-head">
        <div className="md-title"><h2>{title}</h2><span className="md-spacer" />{tools}<span className="md-count">{count}</span></div>
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
  const [busyDelete, runDel] = useAction();
  const [selected, setSelected] = useState({});
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
  const [importing, setImporting] = useState('');
  const [importResult, setImportResult] = useState(null);
  const doImport = async (kind, rows, fileName) => {
    if (!rows.length) return useStore.getState().toast(`No usable rows found in ${fileName}. Download the demo file to see the column titles.`, 'err');
    setImporting(kind);
    try {
      const r = await api('master.import', { kind, rows });
      await refresh('all');
      useStore.getState().toast(`${r.added} added${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}`, r.added ? 'ok' : 'err');
      if (r.skipped.length) setImportResult({ kind, fileName, ...r });
    } catch (e) { useStore.getState().toast(e.message, 'err'); } finally { setImporting(''); }
  };
  const tools = (kind, title, rows) => {
    const ids = new Set(selected[kind] || []), chosen = rows.filter(r => ids.has(r.id));
    return <PanelTools kind={kind} title={title} rows={chosen.length ? chosen : rows} selectedCount={chosen.length} onDelete={()=>deleteSelected(kind, chosen)} onImport={doImport} busy={importing === kind || busyDelete} />;
  };

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
  const deleteSelected = async (kind, rows) => {
    if (busyDelete || !rows.length) return;
    if (rows.length > 200) return useStore.getState().toast('Select up to 200 items at a time', 'err');
    const ok = await ask({title:'Delete selected items?',message:<><b>{rows.length}</b> {KIND[kind]} items will be deleted. Items in use cannot be deleted; if any item is blocked, the entire selection stays unchanged.</>});
    if (!ok) return;
    try { await runDel(async()=>{
      await api('master.deleteMany',{kind,ids:rows.map(r=>r.id)});
      setSelected(s=>({...s,[kind]:[]})); await refresh('all');
    }, 'Selected items deleted'); } catch { /* Preserve selection for retry; toast explains the failure. */ }
  };
  const tick = (kind, item) => <input type="checkbox" className="md-select" aria-label={`Select ${item.name || item.label}`} checked={(selected[kind] || []).includes(item.id)} onChange={e=>setSelected(s=>({...s,[kind]:e.target.checked?[...(s[kind]||[]),item.id]:(s[kind]||[]).filter(id=>id!==item.id)}))} />;
  const selectAll = (kind, rows, title) => rows.length > 0 && <label className="check md-select-all"><input type="checkbox" aria-label={`Select all ${title}`} checked={rows.every(r=>(selected[kind]||[]).includes(r.id))} ref={el=>{if(el)el.indeterminate=rows.some(r=>(selected[kind]||[]).includes(r.id))&&!rows.every(r=>(selected[kind]||[]).includes(r.id));}} onChange={e=>{const checked=e.target.checked;setSelected(s=>{const ids=new Set(s[kind]||[]);rows.forEach(r=>checked?ids.add(r.id):ids.delete(r.id));return {...s,[kind]:[...ids]};});}} /> Select all shown</label>;
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
      <Panel title="Product groups" count={tops.length} tools={tools('group', 'Product groups', tops.map((g) => ({ id:g.id, name: g.name })))} hint="Create a group such as PROCESSOR. Its categories can be INTEL or AMD." search={qg} setSearch={setQg}
        form={
          <form className="md-form" onSubmit={(e) => { e.preventDefault(); save({ kind: 'group', name: ng }, 'Product group added').then(() => setNg('')).catch(() => {}); }}>
            <div className="md-form-row">
              <input value={ng} onChange={(e) => setNg(e.target.value)} placeholder="e.g. PROCESSOR" aria-label="Group name" />
              <Btn kind="primary" busy={busyGroup} type="submit" disabled={!ng.trim()}>Add</Btn>
            </div>
          </form>
        }
        empty={!shownGroups.length && <p className="md-empty">{qg ? 'No group matches your search.' : 'Add a product group first.'}</p>}>
        {selectAll('group', shownGroups, 'Product groups')}
        <ul className="md-list">
          {shownGroups.map((g) => <li className="md-row" key={g.id}>
              {tick('group', g)}
            <div className="md-name"><b title={g.name}>{g.name}</b><small className="md-category-group">{subsOf(g.id).length} {subsOf(g.id).length === 1 ? "category" : "categories"}</small></div>
            <div className="md-actions">
              <ActBtn tone="add" icon="plus" className="act-btn act-add act-icon" title={`Add a category under ${g.name}`} aria-label={`Add category to ${g.name}`} onClick={() => { setNc({ name: '', parent_id: g.id }); document.querySelector('.md-form-cat input')?.focus(); }} />
              <ActBtn tone="edit" icon="edit" onClick={() => setEdit({ kind: 'group', item: g, field: 'name', value: g.name })} aria-label={`Rename ${g.name}`}>Rename</ActBtn>
              <ActBtn tone="delete" icon="trash" onClick={() => del('group', g)} aria-label={`Delete ${g.name}`}>Delete</ActBtn>
            </div>
          </li>)}
        </ul>
      </Panel>

      {/* ---------------- Categories ---------------- */}
      <Panel title="Categories" count={childCategories.length} tools={tools('category', 'Categories', [...childCategories].sort((a, b) => (groupNames[a.parent_id] || '').localeCompare(groupNames[b.parent_id] || '') || a.name.localeCompare(b.name)).map((c) => ({ id:c.id, group: groupNames[c.parent_id] || '', name: c.name })))} hint="Select a product group, then add its category." search={qc} setSearch={setQc}
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
        {selectAll('category', shownCategories, 'Categories')}
        <ul className="md-list">
          {shownCategories.map((c) => <li className="md-row" key={c.id}>
              {tick('category', c)}
            <div className="md-name"><span title={c.name}>{c.name}</span><small className="md-category-group" title={groupNames[c.parent_id]}>{groupNames[c.parent_id] || 'Unknown group'}</small></div>
            <div className="md-actions">
              <ActBtn tone="edit" icon="edit" onClick={() => setEdit({ kind: 'category', item: c, field: 'name', value: c.name })} aria-label={`Rename ${c.name}`}>Rename</ActBtn>
              <ActBtn tone="delete" icon="trash" onClick={() => del('category', c)} aria-label={`Delete ${c.name}`}>Delete</ActBtn>
            </div>
          </li>)}
        </ul>
      </Panel>

      {/* ---------------- Brands ---------------- */}
      <Panel title="Brands" count={brands.length} tools={tools('brand', 'Brands', shownBrands.map((b) => ({ id:b.id, name: b.name })))} search={qb} setSearch={setQb}
        form={
          <form className="md-form" onSubmit={(e) => { e.preventDefault(); save({ kind: 'brand', name: nb }, 'Brand added').then(() => setNb('')).catch(() => {}); }}>
            <div className="md-form-row">
              <input value={nb} onChange={(e) => setNb(e.target.value)} placeholder="Brand name, e.g. TP-Link" aria-label="Brand name" />
              <Btn kind="primary" busy={busyBrand} type="submit" disabled={!nb.trim()}>Add</Btn>
            </div>
          </form>
        }
        empty={!shownBrands.length && <p className="md-empty">{qb ? 'No brand matches your search.' : 'No brands yet. Add the brands you sell, like Kingston, TP-Link or Gigabyte.'}</p>}>
        {selectAll('brand', shownBrands, 'Brands')}
        <ul className="md-list">
          {shownBrands.map((b) => (
            <li className="md-row" key={b.id}>
              {tick('brand', b)}
              <span className="md-name" title={b.name}>{b.name}</span>
              {used[b.id] > 0 && <span className="md-pill md-used">{used[b.id]} product{used[b.id] === 1 ? "" : "s"}</span>}
              <div className="md-actions">
                <ActBtn tone="edit" icon="edit" onClick={() => setEdit({ kind: 'brand', item: b, field: 'name', value: b.name })} aria-label={`Rename ${b.name}`}>Rename</ActBtn>
                <ActBtn tone="delete" icon="trash" onClick={() => del('brand', b)} aria-label={`Delete ${b.name}`}>Delete</ActBtn>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {/* ---------------- Warranty periods ---------------- */}
      <Panel title="Warranty periods" count={periods.length} tools={tools('warranty_period', 'Warranty periods', periods.map((w) => ({ id:w.id, days: w.days, label: w.label })))} hint="Shown as choices on products and at the POS."
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
        {selectAll('warranty_period', periods, 'Warranty periods')}
        <ul className="md-list">
          {periods.map((w) => (
            <li className="md-row" key={w.id}>
              {tick('warranty_period', w)}
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
      <Panel title="Selling units" count={unitList.length} tools={tools('unit', 'Selling units', unitList.map((u) => ({ id:u.id, name: u.name, label: u.label, decimal: u.decimal ? 'Yes' : 'No' })))} hint="Choices for “Selling unit” when you add a product. Tick Decimal for units sold in parts, like 1.5 meter."
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
        {selectAll('unit', unitList, 'Selling units')}
        <ul className="md-list">
          {unitList.map((u) => (
            <li className="md-row" key={u.id}>
              {tick('unit', u)}
              <span className="md-name" title={u.label}>{u.label}</span>
              {u.label.toLowerCase() !== u.name && <span className="md-pill">{u.name}</span>}
              {u.decimal && <span className="md-pill">decimal</span>}
              {used[`unit:${u.name}`] > 0 && <span className="md-pill md-used">{used[`unit:${u.name}`]} product{used[`unit:${u.name}`] === 1 ? "" : "s"}</span>}
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
      <Modal open={!!importResult} onClose={() => setImportResult(null)} size="sm" title="Import finished"
        footer={<Btn kind="primary" onClick={() => setImportResult(null)}>OK</Btn>}>
        {importResult && <>
          <p style={{ marginTop: 0 }}><b>{importResult.added}</b> added from {importResult.fileName}. These rows were skipped:</p>
          <ul className="md-skipped">{importResult.skipped.map((x) => <li key={x.row}><b>Row {x.row}</b>{x.value ? ` (${x.value})` : ''}: {x.reason}</li>)}</ul>
        </>}
      </Modal>
      {confirmUI}
    </div>
  );
}
