import { assignBarcodes } from '../lib/barcodeAssignment';
// Barcode labels: pick products (or a whole purchase), choose a label size and what to show, preview and print.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { printHtml } from '../lib/export';
import { money, qty as fqty, fdate } from '../lib/format';
import { ROLLS, SHEETS, DEFAULT_OPTS, layoutOf, layoutErrors, codeProblem, codeFormat, scanRisk, minWidthFor, pagesHtml, fitScale } from '../lib/labels';
import { PageHead, Btn, Field, Tabs, Badge, Empty, DeleteBtn, useAction } from '../components/ui';
import { ProductSearch } from '../components/widgets';

const OPTS_KEY = 'karvio_label_opts';
const MAX_LABELS = 2000;
function loadOpts() {
  try {
    const o = JSON.parse(localStorage.getItem(OPTS_KEY) || 'null');
    if (o && typeof o === 'object') return { ...DEFAULT_OPTS, ...o, custom: { ...DEFAULT_OPTS.custom, ...o.custom }, show: { ...DEFAULT_OPTS.show, ...o.show } };
  } catch { /* storage blocked: use defaults */ }
  return DEFAULT_OPTS;
}
export function warrantyText(p) {
  const d = Number(p.warranty_days) || 0;
  if (!p.has_warranty || d <= 0) return '';
  if (d % 365 === 0) return `${d / 365} Year${d / 365 > 1 ? 's' : ''} warranty`;
  if (d % 30 === 0) return `${d / 30} Month${d / 30 > 1 ? 's' : ''} warranty`;
  return `${d} Days warranty`;
}
const isSerial = (p) => p && p.has_warranty && p.warranty_type === 'serial';
let seq = 0;

export default function Barcodes() {
  const { products, brands, categories, settings, can, refresh, toast } = useStore();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]); // { key, product_id, count, serialMode, serials, picked }
  const [opts, setOptsState] = useState(loadOpts);
  const [busy, run] = useAction();
  const [bulk, setBulk] = useState({ cat: '', brand: '', stockOnly: true, per: 'stock' });
  const [purchases, setPurchases] = useState(null);
  const [purId, setPurId] = useState('');
  const pmap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const brandMap = useMemo(() => Object.fromEntries(brands.map((b) => [b.id, b.name])), [brands]);

  const setOpts = (patch) => setOptsState((o) => {
    const n = { ...o, ...patch };
    try { localStorage.setItem(OPTS_KEY, JSON.stringify(n)); } catch { /* not saved: fine */ }
    return n;
  });
  const setShow = (k, v) => setOpts({ show: { ...opts.show, [k]: v } });
  const setCustom = (k, v) => setOpts({ custom: { ...opts.custom, [k]: v } });

  /* ---------- adding products ---------- */
  const addRows = (list) => setRows((cur) => {
    const next = [...cur];
    list.forEach((r) => {
      const at = next.findIndex((x) => x.product_id === r.product_id && !x.serialMode && !r.serialMode);
      if (at >= 0) next[at] = { ...next[at], count: Math.min(MAX_LABELS, next[at].count + r.count) };
      else next.push({ key: ++seq, serialMode: false, serials: [], picked: [], ...r });
    });
    return next;
  });
  const addProduct = (p, count = 1) => {
    if (p.service) return toast(`${p.name} is a service — services have no labels`, 'err');
    addRows([{ product_id: p.id, count }]);
  };
  const addBulk = () => {
    const list = products.filter((p) => p.active && !p.service && (!bulk.cat || p.category_id === bulk.cat || p.subcategory_id === bulk.cat) && (!bulk.brand || p.brand_id === bulk.brand) && (!bulk.stockOnly || p.stock > 0));
    if (!list.length) return toast('No products match these filters', 'err');
    addRows(list.map((p) => ({ product_id: p.id, count: bulk.per === 'stock' ? Math.max(1, Math.min(MAX_LABELS, Math.floor(p.stock))) : 1 })));
    toast(`${list.length} product${list.length === 1 ? '' : 's'} added`, 'ok');
  };
  const loadPurchases = async () => {
    if (purchases) return;
    try { const r = await api('purchases.list', { page: 1, per: 40, status: 'active' }); setPurchases(r.rows || []); }
    catch (e) { toast(e.message, 'err'); setPurchases([]); }
  };
  const addPurchase = async (id) => {
    if (!id) return;
    try { await run(async () => {
      const d = await api('purchase.detail', { id });
      const list = [];
      d.items.forEach((i) => {
        const p = pmap[i.product_id]; if (!p || p.service) return;
        const sers = String(i.serials || '').split(',').map((x) => x.trim()).filter(Boolean);
        if (sers.length && isSerial(p)) list.push({ product_id: p.id, count: sers.length, serialMode: true, serials: sers, picked: sers });
        else list.push({ product_id: p.id, count: Math.max(1, Math.min(MAX_LABELS, Math.ceil(Number(i.qty) || 1))) });
      });
      if (!list.length) throw new Error('This purchase has no products that take labels');
      addRows(list);
      return list;
    }, `Labels added from purchase ${purchases?.find((x) => x.id === id)?.invoice_no || ''}`.trim()); setPurId(''); } catch { /* shown as a toast */ }
  };

  // Links from other screens: #/barcodes?product=ID or ?purchase=ID
  const linked = useRef('');
  useEffect(() => {
    if (!products.length) return;
    const pid = params.get('product'), pur = params.get('purchase');
    if (!pid && !pur) { linked.current = ''; return; }
    const sig = params.toString();
    if (linked.current === sig) return; // already handled (React may run effects twice)
    linked.current = sig;
    if (pid && pmap[pid]) addProduct(pmap[pid], 1);
    if (pur && can('purchase')) addPurchase(pur);
    setParams({}, { replace: true });
  }, [products, params]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- row edits ---------- */
  const patchRow = (key, patch) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const toggleSerial = async (r, on) => {
    if (!on) return patchRow(r.key, { serialMode: false, count: Math.max(1, r.picked.length || 1) });
    try {
      const list = r.serials.length ? r.serials : (await api('serials.list', { product_id: r.product_id, status: 'in_stock' })).map((s) => s.serial);
      if (!list.length) return toast(`${pmap[r.product_id]?.name}: no serial numbers in stock`, 'err');
      patchRow(r.key, { serialMode: true, serials: list, picked: list, count: list.length });
    } catch (e) { toast(e.message, 'err'); }
  };
  const togglePick = (r, sn) => {
    const picked = r.picked.includes(sn) ? r.picked.filter((x) => x !== sn) : [...r.picked, sn];
    patchRow(r.key, { picked, count: picked.length });
  };

  /* ---------- what gets printed ---------- */
  const codeOf = (p) => String(p.barcode || '').trim() || String(p.sku || '').trim();
  const labelItems = useMemo(() => rows.flatMap((r) => {
    const p = pmap[r.product_id]; if (!p) return [];
    const base = { name: p.name, price: Number(p.sale_price) || 0, wholesale: Number(p.wholesale_price) || 0, brand: brandMap[p.brand_id] || '', warranty: warrantyText(p), sku: p.sku || '' };
    if (r.serialMode) return r.picked.map((sn) => ({ ...base, code: sn, count: 1, sku: base.sku, serial: true }));
    return [{ ...base, code: codeOf(p), count: Math.max(0, Math.floor(Number(r.count) || 0)) }];
  }), [rows, pmap, brandMap]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = labelItems.reduce((a, i) => a + i.count, 0);
  const noBarcode = rows.filter((r) => !r.serialMode && pmap[r.product_id] && !String(pmap[r.product_id].barcode || '').trim());
  const noCode = noBarcode.filter((r) => !codeOf(pmap[r.product_id])); // nothing at all to print
  const skuOnly = noBarcode.filter((r) => codeOf(pmap[r.product_id])); // prints the SKU as its barcode
  const badCode = labelItems.filter((i) => i.code && codeProblem(i.code));
  const L = layoutOf(opts);
  const errs = layoutErrors(L);
  const dense = errs.length ? [] : labelItems.filter((i) => i.code && !codeProblem(i.code) && scanRisk(i.code, L, opts));
  const ctx = { shop: settings.shop_name || '', currency: settings.currency || 'Tk' };
  const sample = [{ name: 'Sample product name', code: '2000000000015', price: 1250, wholesale: 1150, brand: 'Brand', warranty: '1 Year warranty', sku: 'SKU-01', count: L.perPage }];
  const zoom = Math.min(3.2, 430 / (L.pageW * 3.78));
  const preview = useMemo(() => pagesHtml(total ? labelItems.filter((i) => i.code && !codeProblem(i.code)) : sample, opts, ctx, { screen: true, maxPages: 1, zoom: errs.length ? 0 : zoom }),
    [labelItems, opts, ctx.shop, ctx.currency, total]); // eslint-disable-line react-hooks/exhaustive-deps

  const assign = async () => {
    await run(async () => {
      const ids = [...new Set(noBarcode.map(x => x.product_id))];
      let assigned;
      try { assigned = await assignBarcodes(ids); }
      catch (e) { await refresh('products').catch(() => {}); throw e; }
      await refresh('products');
      const current = new Map(useStore.getState().products.map(p=>[p.id,p]));
      if (ids.some(id=>!current.get(id)?.barcode)) throw new Error('Some products still have no barcode. Refresh and retry the remaining products.');
      toast(`Barcodes ready for ${ids.length} product${ids.length===1?'':'s'} (${assigned.length} newly created)`);
      return assigned;
    }).catch(() => {});
  };
  const print = async () => {
    if (!total) return toast('Add products first', 'err');
    if (errs.length) return toast(errs[0], 'err');
    if (noCode.length) return toast(`${pmap[noCode[0].product_id].name} has no barcode — create barcodes first`, 'err');
    if (badCode.length) return toast(`${badCode[0].name}: ${codeProblem(badCode[0].code)}`, 'err');
    if (total > MAX_LABELS) return toast(`Print at most ${MAX_LABELS} labels at a time`, 'err');
    await run(() => printHtml(pagesHtml(labelItems, opts, ctx).html)).catch(() => {});
  };

  const tops = categories.filter((c) => !c.parent_id);
  const subsOf = (id) => categories.filter((c) => c.parent_id === id);
  const sizes = opts.mode === 'sheet' ? SHEETS : ROLLS;

  return (
    <>
      <PageHead title="Barcode labels" sub="Print price labels with barcodes for your products — on a label printer roll or on A4 label sheets.">
        {rows.length > 0 && <Btn onClick={() => setRows([])}>Clear list</Btn>}
        <Btn kind="primary" busy={busy} disabled={!total} onClick={print}>Print {total ? `${total} label${total === 1 ? '' : 's'}` : 'labels'}</Btn>
      </PageHead>

      <div className="bc-layout">
        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="card">
            <div className="card-head"><h2>Products to print</h2><span className="muted">{rows.length} product{rows.length === 1 ? '' : 's'} · {total} label{total === 1 ? '' : 's'}</span></div>
            <ProductSearch noServices onPick={(p) => addProduct(p)} placeholder="Search or scan a product to add (name, model, brand, barcode)" />
            <div className="bc-add">
              <details>
                <summary>Add many at once</summary>
                <div className="bc-bulk">
                  <select value={bulk.cat} onChange={(e) => setBulk({ ...bulk, cat: e.target.value })} aria-label="Product group or category">
                    <option value="">All groups</option>
                    {tops.map((t) => [<option key={t.id} value={t.id}>{t.name}</option>, ...subsOf(t.id).map((s) => <option key={s.id} value={s.id}>&nbsp;&nbsp;{t.name} › {s.name}</option>)])}
                  </select>
                  <select value={bulk.brand} onChange={(e) => setBulk({ ...bulk, brand: e.target.value })} aria-label="Brand">
                    <option value="">All brands</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <select value={bulk.per} onChange={(e) => setBulk({ ...bulk, per: e.target.value })} aria-label="Labels per product">
                    <option value="stock">One label per unit in stock</option>
                    <option value="one">One label per product</option>
                  </select>
                  <label className="check"><input type="checkbox" checked={bulk.stockOnly} onChange={(e) => setBulk({ ...bulk, stockOnly: e.target.checked })} /> In stock only</label>
                  <Btn onClick={addBulk}>Add products</Btn>
                </div>
              </details>
              {can('purchase') && (
                <details onToggle={(e) => e.currentTarget.open && loadPurchases()}>
                  <summary>Add from a purchase</summary>
                  <div className="bc-bulk">
                    <select value={purId} onChange={(e) => setPurId(e.target.value)} aria-label="Purchase" style={{ flex: 1, minWidth: 220 }}>
                      <option value="">{purchases === null ? 'Loading purchases…' : purchases.length ? 'Choose a purchase…' : 'No purchases yet'}</option>
                      {(purchases || []).map((x) => <option key={x.id} value={x.id}>{x.invoice_no} · {fdate(x.date)} · {x.supplier_name || 'No supplier'} · {money(x.total, false)}</option>)}
                    </select>
                    <Btn disabled={!purId} busy={busy} onClick={() => addPurchase(purId)}>Add its items</Btn>
                  </div>
                  <p className="muted" style={{ margin: '6px 0 0', fontSize: 12.5 }}>One label for every unit bought; serial-number products get one label per serial.</p>
                </details>
              )}
            </div>

            {noBarcode.length > 0 && (
              <div className="bc-warn" role="alert">
                {noCode.length > 0 && <div><b>{noCode.length} product{noCode.length === 1 ? ' has' : 's have'} no barcode:</b> {noCode.slice(0, 4).map((r) => pmap[r.product_id].name).join(', ')}{noCode.length > 4 ? ` and ${noCode.length - 4} more` : ''}.</div>}
                {skuOnly.length > 0 && <div><b>{skuOnly.length} product{skuOnly.length === 1 ? '' : 's'} will print the SKU as the barcode</b> ({skuOnly.slice(0, 3).map((r) => pmap[r.product_id].name).join(', ')}{skuOnly.length > 3 ? '…' : ''}). A shop barcode is shorter and scans better.</div>}
                {can('products')
                  ? <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}><Btn size="sm" kind="primary" busy={busy} onClick={assign}>Create barcode{noBarcode.length === 1 ? '' : 's'} for {noBarcode.length === 1 ? 'it' : `these ${noBarcode.length}`}</Btn><span className="muted" style={{ fontSize: 12.5 }}>Each gets its own 13-digit shop code (starts with 20) saved on the product, so it scans at the POS.</span></div>
                  : noCode.length > 0 && <div className="muted" style={{ marginTop: 6 }}>Ask an admin to create barcodes for {noCode.length === 1 ? 'it' : 'them'}, or remove {noCode.length === 1 ? 'it' : 'them'} from the list.</div>}
              </div>
            )}
            {badCode.length > 0 && <div className="bc-warn" role="alert"><b>{badCode[0].name}:</b> {codeProblem(badCode[0].code)} — code “{badCode[0].code}”. Change the product's barcode or remove it from the list.</div>}

            {rows.length ? (
              <div className="dt-scroll"><table className="bc-rows">
                <thead><tr><th>Product</th><th>Barcode</th><th className="r">Price</th><th className="r">Labels</th><th /></tr></thead>
                <tbody>{rows.map((r) => {
                  const p = pmap[r.product_id]; if (!p) return null;
                  const code = codeOf(p);
                  return (
                    <tr key={r.key}>
                      <td><b>{p.name}</b><div className="muted" style={{ fontSize: 12 }}>{[brandMap[p.brand_id], `${fqty(p.stock, p.unit)} in stock`].filter(Boolean).join(' · ')}</div>
                        {isSerial(p) && <label className="check bc-sn-toggle"><input type="checkbox" checked={r.serialMode} onChange={(e) => toggleSerial(r, e.target.checked)} /> Print serial numbers</label>}
                        {r.serialMode && (
                          <div className="bc-sns">{r.serials.map((sn) => <label key={sn} className={`bc-sn ${r.picked.includes(sn) ? 'on' : ''}`}><input type="checkbox" checked={r.picked.includes(sn)} onChange={() => togglePick(r, sn)} />{sn}</label>)}</div>
                        )}
                      </td>
                      <td>{r.serialMode ? <Badge tone="violet">Serial numbers</Badge> : code ? <><code className="bc-code">{code}</code><div className="muted" style={{ fontSize: 11.5 }}>{p.barcode ? codeFormat(code).replace('CODE', 'Code ').replace('EAN13', 'EAN-13') : 'Using the SKU'}</div></> : <Badge tone="warn">No barcode</Badge>}</td>
                      <td className="r num">{money(p.sale_price, false)}</td>
                      <td className="r">{r.serialMode ? <b className="num">{r.picked.length}</b>
                        : <input type="number" min="1" max={MAX_LABELS} step="1" value={r.count} aria-label={`Labels for ${p.name}`} className="bc-count"
                          onChange={(e) => patchRow(r.key, { count: e.target.value === '' ? '' : Math.max(0, Math.min(MAX_LABELS, Math.floor(Number(e.target.value)) || 0)) })}
                          onBlur={() => { if (!(Number(r.count) >= 1)) patchRow(r.key, { count: 1 }); }} />}</td>
                      <td className="r"><DeleteBtn label="Remove" onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))} /></td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            ) : <Empty title="No products yet">Search or scan a product above, add a whole group, or add the items of a purchase.</Empty>}
          </div>
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="card form bc-design">
            <div className="card-head wide" style={{ marginBottom: 0 }}><h2>Label design</h2>
              <Tabs tabs={[['roll', 'Label printer'], ['sheet', 'A4 sheet']]} value={opts.mode} onChange={(m) => setOpts({ mode: m, size: m === 'sheet' ? SHEETS[0].id : ROLLS[0].id })} /></div>
            <Field label={opts.mode === 'sheet' ? 'Sheet' : 'Label size'} wide>
              <select value={opts.size} onChange={(e) => setOpts({ size: e.target.value })}>
                {sizes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="custom">Custom size…</option>
              </select>
            </Field>
            {opts.size === 'custom' && (
              <div className="wide bc-custom">
                <Field label="Width (mm)"><input type="number" min="15" max="120" step="0.1" value={opts.custom.w} onChange={(e) => setCustom('w', e.target.value)} /></Field>
                <Field label="Height (mm)"><input type="number" min="10" max="100" step="0.1" value={opts.custom.h} onChange={(e) => setCustom('h', e.target.value)} /></Field>
                <Field label="Labels across"><input type="number" min="1" max="10" step="1" value={opts.custom.cols} onChange={(e) => setCustom('cols', e.target.value)} /></Field>
                <Field label="Gap across (mm)"><input type="number" min="0" step="0.1" value={opts.custom.gapX} onChange={(e) => setCustom('gapX', e.target.value)} /></Field>
                {opts.mode === 'sheet' && <>
                  <Field label="Rows"><input type="number" min="1" max="30" step="1" value={opts.custom.rows} onChange={(e) => setCustom('rows', e.target.value)} /></Field>
                  <Field label="Gap down (mm)"><input type="number" min="0" step="0.1" value={opts.custom.gapY} onChange={(e) => setCustom('gapY', e.target.value)} /></Field>
                  <Field label="Top margin (mm)"><input type="number" min="0" step="0.1" value={opts.custom.top} onChange={(e) => setCustom('top', e.target.value)} /></Field>
                  <Field label="Left margin (mm)"><input type="number" min="0" step="0.1" value={opts.custom.left} onChange={(e) => setCustom('left', e.target.value)} /></Field>
                </>}
              </div>
            )}
            {opts.mode === 'sheet' && (
              <Field label="Start at label no." hint={`For a part-used sheet: skip the first ${Math.max(0, (+opts.start || 1) - 1)} label${(+opts.start || 1) === 2 ? '' : 's'}`}>
                <input type="number" min="1" max={L.perPage || 1} step="1" value={opts.start} onChange={(e) => setOpts({ start: Math.max(1, Math.min(L.perPage || 1, Math.floor(Number(e.target.value)) || 1)) })} />
              </Field>
            )}
            {opts.mode === 'roll' && (
              <Field label="Printer resolution" hint="Printed on the printer's box or settings page">
                <select value={opts.dpi} onChange={(e) => setOpts({ dpi: Number(e.target.value) })}><option value={203}>203 dpi (most common)</option><option value={300}>300 dpi</option></select>
              </Field>
            )}
            <Field label="Text size">
              <select value={opts.textSize} onChange={(e) => setOpts({ textSize: Number(e.target.value) })}><option value={0.85}>Small</option><option value={1}>Normal</option><option value={1.15}>Large</option></select>
            </Field>

            <div className="wide bc-show">
              <span className="bc-show-h">Show on the label</span>
              {[['shop', 'Shop name'], ['name', 'Product name'], ['brand', 'Brand'], ['warranty', 'Warranty'], ['sku', 'SKU'], ['code', 'Barcode number'], ['price', 'Price'], ['line', 'Extra line'], ['border', 'Cutting border']].map(([k, label]) => (
                <label key={k} className={`check bc-opt ${opts.show[k] ? 'on' : ''}`}><input type="checkbox" checked={!!opts.show[k]} onChange={(e) => setShow(k, e.target.checked)} /> {label}</label>
              ))}
            </div>
            {opts.show.price && <>
              <Field label="Price shown">
                <select value={opts.priceType} onChange={(e) => setOpts({ priceType: e.target.value })}><option value="retail">Retail price</option><option value="wholesale">Wholesale price</option><option value="both">Retail + wholesale</option></select>
              </Field>
              <Field label="Price label">
                <select value={opts.priceLabel} onChange={(e) => setOpts({ priceLabel: e.target.value })}><option value="Price">Price</option><option value="MRP">MRP</option><option value="Price:">Price:</option><option value="">(none)</option></select>
              </Field>
            </>}
            {opts.show.line && <Field label="Extra line text" wide hint="For example your phone number, website or “Thank you”"><input value={opts.line} maxLength={60} onChange={(e) => setOpts({ line: e.target.value })} placeholder={settings.shop_phone ? `Call ${settings.shop_phone}` : 'Thank you for shopping with us'} /></Field>}
            {!settings.shop_name && opts.show.shop && <p className="wide muted" style={{ margin: 0, fontSize: 12.5 }}>Set your shop name in Settings › Shop to show it on labels.</p>}
          </div>

          <div className="card">
            <div className="card-head"><h2>Preview</h2><span className="muted">{total ? `${total} label${total === 1 ? '' : 's'} · ${preview.pages} page${preview.pages === 1 ? '' : 's'}` : 'Sample label'} · {L.w} × {L.h} mm</span></div>
            {errs.length > 0 && <div className="bc-warn" role="alert">{errs.join('. ')}.</div>}
            {!errs.length && preview.hidden.length > 0 && <div className="bc-warn" role="status">This label is too small for everything ticked, so it leaves out: <b>{preview.hidden.join(', ')}</b>. Choose a bigger label to show them.</div>}
            {!errs.length && !preview.hidden.length && fitScale(L, opts) < 0.85 && <div className="bc-warn" role="status">A lot is ticked for a {L.w} × {L.h} mm label, so the text was made smaller to fit. Untick a few items (or choose a bigger label) for larger text.</div>}
            {dense.length > 0 && !errs.length && <div className="bc-warn" role="alert"><b>{dense.length === 1 ? dense[0].name : `${dense.length} labels`}</b>{dense.length === 1 ? ` (${dense[0].code})` : ''}: the code is long for a {L.w} mm wide label, so the bars may be too thin to scan reliably. Use a label at least {Math.max(...dense.map((i) => minWidthFor(i.code, L, opts)))} mm wide{dense.some((i) => !i.serial) ? ', or give the product a shop barcode (short 13-digit code)' : ''}.</div>}
            {!errs.length && <iframe title="Label preview" className="bc-preview" srcDoc={`<!doctype html><html><head><meta charset="utf-8"></head><body>${preview.html}</body></html>`} />}
            <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
              {opts.mode === 'roll'
                ? 'In the print window choose your label printer, set Margins to None and Scale to 100%. The paper size is set to the label size automatically.'
                : 'In the print window choose A4, Margins: None and Scale: 100% (turn off “Fit to page”) so the labels line up with the sheet.'}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
