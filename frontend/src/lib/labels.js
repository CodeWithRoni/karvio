// Barcode labels: sizes, barcode drawing and the printable page (thermal label rolls and A4 label sheets).
// Everything is laid out in millimetres so what is printed matches the chosen label size exactly.
import JsBarcode from 'jsbarcode';
import { esc, printFonts } from './export';

/** Label printer (roll) sizes, width × height in mm. `cols` > 1 = several labels side by side on the roll. */
export const ROLLS = [
  { id: '38x25', name: '38 × 25 mm', w: 38, h: 25 },
  { id: '40x30', name: '40 × 30 mm', w: 40, h: 30 },
  { id: '50x25', name: '50 × 25 mm', w: 50, h: 25 },
  { id: '50x30', name: '50 × 30 mm', w: 50, h: 30 },
  { id: '60x40', name: '60 × 40 mm', w: 60, h: 40 },
  { id: '30x20', name: '30 × 20 mm (small)', w: 30, h: 20 },
  { id: '2x32x25', name: '2 across · 32 × 25 mm', w: 32, h: 25, cols: 2, gapX: 2 },
  { id: '3x30x20', name: '3 across · 30 × 20 mm', w: 30, h: 20, cols: 3, gapX: 2 }
];
/** A4 label sheets (210 × 297 mm). top/left = page margin, gapX/gapY = space between labels. */
export const SHEETS = [
  { id: 'a4-65', name: 'A4 · 65 labels (38.1 × 21.2 mm)', w: 38.1, h: 21.2, cols: 5, rows: 13, top: 10.7, left: 4.7, gapX: 2.5, gapY: 0 },
  { id: 'a4-40', name: 'A4 · 40 labels (48.5 × 25.4 mm)', w: 48.5, h: 25.4, cols: 4, rows: 10, top: 21.5, left: 8, gapX: 0, gapY: 0 },
  { id: 'a4-24', name: 'A4 · 24 labels (70 × 37 mm)', w: 70, h: 37, cols: 3, rows: 8, top: 0.5, left: 0, gapX: 0, gapY: 0 },
  { id: 'a4-21', name: 'A4 · 21 labels (70 × 42.3 mm)', w: 70, h: 42.3, cols: 3, rows: 7, top: 0.4, left: 0, gapX: 0, gapY: 0 }
];
export const A4 = { w: 210, h: 297 };

export const DEFAULT_OPTS = {
  mode: 'roll', // roll | sheet
  size: '38x25', // a ROLLS / SHEETS id, or 'custom'
  custom: { w: 50, h: 30, cols: 1, rows: 10, top: 10, left: 5, gapX: 2, gapY: 2 },
  show: { shop: true, name: true, brand: true, warranty: false, price: true, code: true, sku: false, line: false, border: false },
  priceType: 'retail', // retail | wholesale | both
  priceLabel: 'Price', // text before the price; '' = none
  line: '', // extra line (phone number, "Thank you", etc.)
  textSize: 1, // 0.85 small · 1 normal · 1.15 large
  dpi: 203, // label printer resolution: 203 (most) or 300
  start: 1 // A4 sheets: first free label position (for part-used sheets)
};

/** The label geometry the options describe: label size, labels per row/page, page size and margins (all mm). */
export function layoutOf(o) {
  const c = o.custom || {};
  if (o.mode === 'sheet') {
    const s = o.size === 'custom' ? { w: +c.w, h: +c.h, cols: +c.cols, rows: +c.rows, top: +c.top, left: +c.left, gapX: +c.gapX, gapY: +c.gapY } : (SHEETS.find((x) => x.id === o.size) || SHEETS[0]);
    return { ...s, pageW: A4.w, pageH: A4.h, perPage: s.cols * s.rows };
  }
  const r = o.size === 'custom' ? { w: +c.w, h: +c.h, cols: Math.max(1, +c.cols || 1), gapX: +c.gapX || 0 } : (ROLLS.find((x) => x.id === o.size) || ROLLS[0]);
  const cols = r.cols || 1, gapX = cols > 1 ? r.gapX || 0 : 0;
  return { w: r.w, h: r.h, cols, rows: 1, top: 0, left: 0, gapX, gapY: 0, pageW: round(cols * r.w + (cols - 1) * gapX), pageH: r.h, perPage: cols };
}
const round = (n) => Math.round(n * 100) / 100;

/** Problems with the chosen size, in words; empty when it is fine to print. */
export function layoutErrors(L) {
  const e = [];
  if (!(L.w >= 15 && L.w <= 120)) e.push('Label width must be between 15 and 120 mm');
  if (!(L.h >= 10 && L.h <= 100)) e.push('Label height must be between 10 and 100 mm');
  if (!(L.cols >= 1 && L.cols <= 10) || !(L.rows >= 1 && L.rows <= 30)) e.push('Labels across must be 1–10 and rows 1–30');
  if ([L.top, L.left, L.gapX, L.gapY].some((v) => !(v >= 0))) e.push('Margins and gaps cannot be negative');
  if (!e.length && L.pageW === A4.w) {
    if (L.left + L.cols * L.w + (L.cols - 1) * L.gapX > A4.w + 0.01) e.push(`${L.cols} labels of ${L.w} mm do not fit across an A4 page (210 mm)`);
    if (L.top + L.rows * L.h + (L.rows - 1) * L.gapY > A4.h + 0.01) e.push(`${L.rows} rows of ${L.h} mm do not fit down an A4 page (297 mm)`);
  }
  return e;
}

/** EAN-13 when the code is 13 digits with a correct check digit (shop codes, most retail goods), else Code 128. */
export function codeFormat(code) {
  const c = String(code || '');
  if (/^\d{13}$/.test(c)) {
    let s = 0; for (let i = 0; i < 12; i++) s += +c[i] * (i % 2 ? 3 : 1);
    if ((10 - (s % 10)) % 10 === +c[12]) return 'EAN13';
  }
  return 'CODE128';
}
/** Why a code cannot be printed as a barcode ('' = fine). Code 128 holds plain keyboard characters only. */
export function codeProblem(code) {
  const c = String(code || '');
  if (!c) return 'No barcode';
  if (c.length > 40) return 'Code is too long for a label (max 40 characters)';
  if (!/^[\x20-\x7e]+$/.test(c)) return 'Code has characters a barcode cannot hold (use English letters, digits and symbols only)';
  return '';
}
/** Barcode SVG (bars only, quiet zones included) and its width in modules (thinnest bar units). Cached per code. */
const drawn = new Map();
function draw(code) {
  const c = String(code);
  if (drawn.has(c)) return drawn.get(c);
  if (typeof document === 'undefined') return { svg: '', modules: 1 };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  // width 2 per module, 10-module quiet zone each side
  JsBarcode(svg, c, { format: codeFormat(c), width: 2, height: 100, margin: 0, marginLeft: 20, marginRight: 20, displayValue: false, flat: true, background: '#ffffff', lineColor: '#000000' });
  const w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height'));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.removeAttribute('width'); svg.removeAttribute('height'); svg.removeAttribute('style');
  svg.setAttribute('class', 'bc');
  const out = { svg: svg.outerHTML, modules: w / 2 };
  if (drawn.size > 3000) drawn.clear();
  drawn.set(c, out);
  return out;
}
const padOf = (L) => (L.h <= 22 ? 0.8 : 1.2);
/** Width of one module in mm. On a label printer it is a whole number of printer dots, so every bar prints at
 *  exactly the right width (stretched bars come out uneven at 203 dpi and stop scanning). */
export function moduleFor(code, L, o) {
  const avail = L.w - 2 * (padOf(L) + 0.4);
  let mod = Math.min(0.5, avail / draw(code).modules);
  const dot = dotMm(o), k = Math.floor(mod / dot + 1e-6);
  if (k >= 1) mod = k * dot;
  return mod;
}
/** One printer dot in mm: the label printer's resolution, or 300 dpi for A4 sheets (also whole dots at 600 dpi). */
const dotMm = (o) => 25.4 / (o.mode === 'sheet' ? 300 : Number(o.dpi) || 203);
/** True when the bars would be too thin to scan reliably (under 2 printer dots). */
export function scanRisk(code, L, o) { return moduleFor(code, L, o) < 2 * dotMm(o) - 1e-6; }
/** Narrowest label (mm) on which this code still prints with bars of 2 printer dots. */
export function minWidthFor(code, L, o) { return Math.ceil(draw(code).modules * 2 * dotMm(o) + 2 * (padOf(L) + 0.4)); }
/** Barcode markup sized for this label. */
export function barcodeSvg(code, L, o) {
  const d = draw(code);
  if (!L) return d.svg;
  const w = round(moduleFor(code, L, o) * d.modules * 1000) / 1000;
  return d.svg.replace('<svg ', `<svg style="width:${w}mm" `);
}

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** One label. item = { name, code, price, wholesale, brand, warranty, sku } */
export function labelHtml(item, o, ctx) {
  const s = o.show || {};
  const cur = ctx.currency || 'Tk';
  const meta = [s.brand && item.brand, s.warranty && item.warranty, s.sku && item.sku && `SKU ${item.sku}`].filter(Boolean).join(' · ');
  const pl = o.priceLabel ? `<small>${esc(o.priceLabel)}</small> ` : '';
  let price = '';
  if (s.price) {
    if (o.priceType === 'both') price = `<div class="pr both"><span>${pl}<b>${esc(cur)} ${fmt(item.price)}</b></span>${item.wholesale > 0 ? `<span class="ws"><small>Wholesale</small> ${esc(cur)} ${fmt(item.wholesale)}</span>` : ''}</div>`;
    else {
      const v = o.priceType === 'wholesale' && item.wholesale > 0 ? item.wholesale : item.price;
      price = v > 0 ? `<div class="pr">${pl}<b>${esc(cur)} ${fmt(v)}</b></div>` : '';
    }
  }
  return `<div class="lbl"${ctx.L && scanRisk(item.code, ctx.L, o) ? ' data-thin="1"' : ''}>
    ${s.shop && ctx.shop ? `<div class="shop">${esc(ctx.shop)}</div>` : ''}
    ${s.name ? `<div class="nm">${esc(item.name)}</div>` : ''}
    ${meta ? `<div class="meta">${esc(meta)}</div>` : ''}
    <div class="bcw">${barcodeSvg(item.code, ctx.L, o)}</div>
    ${s.code ? `<div class="code">${esc(item.code)}</div>` : ''}
    ${price}
    ${s.line && o.line ? `<div class="line">${esc(o.line)}</div>` : ''}
  </div>`;
}

/** Font sizes (pt) that suit the label height; the user's text size scales them. */
function fontBase(L, scale) { const b = L.h <= 22 ? 6 : L.h <= 27 ? 6.8 : L.h <= 33 ? 7.6 : L.h <= 42 ? 8.8 : 10; return round(b * (scale || 1)); }

/** How much the text must shrink (1 = not at all) for these items to fit with a scannable barcode height.
 *  Worst case is assumed: a two-line product name and every ticked line filled. Not clamped. */
function rawFit(L, o, s) {
  const f = fontBase(L, o.textSize), mm = 0.3528 * 1.12; // pt → mm of one text line
  const nameLines = s.name ? (L.h <= 22 ? 1 : 2) : 0;
  const text = (s.shop ? 0.92 : 0) + nameLines + (s.brand || s.warranty || s.sku ? 0.82 : 0) + (s.code ? 0.86 : 0)
    + (s.price ? (o.priceType === 'both' ? 1.15 : 1.45) : 0) + (s.line && o.line ? 0.8 : 0);
  const fixed = (L.h <= 22 ? 1.6 : 2.4) + (s.shop ? 0.9 : 0) + 0.5 + (s.code ? 0.2 : 0) + (s.price ? 0.2 : 0) + (s.line && o.line ? 0.2 : 0) + 0.4;
  const bar = Math.max(L.h <= 22 ? 3.5 : 5, L.h * 0.26);
  return text ? (L.h - fixed - bar) / (text * f * mm) : 1;
}
const DROP = [['line', 'Extra line'], ['sku', 'SKU'], ['warranty', 'Warranty'], ['brand', 'Brand'], ['shop', 'Shop name'], ['code', 'Barcode number']];
/** What actually goes on the label: the ticked items, minus the least important ones when the label is too small
 *  for all of them, and the text scale that makes the rest fit. hidden = names of the items left out. */
export function fitLabel(L, o) {
  const show = { ...(o.show || {}) }, hidden = [];
  for (const [k, name] of DROP) {
    if (rawFit(L, o, show) >= 0.7) break;
    if (show[k] && (k !== 'line' || o.line)) { show[k] = false; hidden.push(name); }
  }
  const k = rawFit(L, o, show);
  return { show, hidden, scale: Math.max(0.55, Math.min(1, Math.floor(k * 100) / 100)) };
}
export const fitScale = (L, o) => fitLabel(L, o).scale;

/** CSS for the labels; `screen` adds the page look used by the on-screen preview. */
export function labelsCss(L, o, screen = false) {
  const f = round(fontBase(L, o.textSize) * fitLabel(L, o).scale);
  const pad = padOf(L);
  return `${printFonts}
  @page{size:${L.pageW}mm ${L.pageH}mm;margin:0}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:system-ui,'Segoe UI',Arial,'Hind Siliguri',sans-serif;color:#000}
  .page{width:${L.pageW}mm;height:${L.pageH}mm;padding:${L.top}mm 0 0 ${L.left}mm;display:grid;grid-template-columns:repeat(${L.cols},${L.w}mm);grid-auto-rows:${L.h}mm;column-gap:${L.gapX}mm;row-gap:${L.gapY}mm;overflow:hidden;break-after:page;page-break-after:always}
  .page:last-child{break-after:auto;page-break-after:auto}
  .cell{width:${L.w}mm;height:${L.h}mm;overflow:hidden}
  .lbl{width:100%;height:100%;padding:${pad}mm ${pad + 0.4}mm;display:flex;flex-direction:column;align-items:stretch;text-align:center;line-height:1.12;overflow:hidden${o.show && o.show.border ? ';outline:0.2mm dashed #888;outline-offset:-0.3mm;border-radius:1mm' : ''}}
  .shop,.nm,.meta,.code,.pr,.line{flex:none}
  .shop{font-size:${round(f * 0.92)}pt;font-weight:800;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-bottom:.3mm;border-bottom:0.2mm solid #000;margin-bottom:.4mm}
  .nm{font-size:${f}pt;font-weight:700;display:-webkit-box;-webkit-line-clamp:${L.h <= 22 ? 1 : 2};-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
  .meta{font-size:${round(f * 0.82)}pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#222}
  .bcw{flex:1 1 0;min-height:${L.h <= 22 ? 3.5 : 5}mm;display:flex;justify-content:center;margin-top:.5mm;overflow:hidden}
  .bc{height:100%;display:block;flex:none;shape-rendering:crispEdges}
  .code{font-size:${round(f * 0.86)}pt;letter-spacing:.12em;font-family:'Consolas','Courier New',monospace;margin-top:.2mm}
  .pr{font-size:${round(f * 1.45)}pt;font-weight:800;margin-top:.2mm;white-space:nowrap}
  .pr small{font-size:${round(f * 0.8)}pt;font-weight:600}
  .pr.both{display:flex;justify-content:center;align-items:baseline;gap:1.5mm;font-size:${round(f * 1.15)}pt;overflow:hidden}
  .pr .ws{font-size:${round(f * 0.85)}pt;font-weight:700}
  .line{font-size:${round(f * 0.8)}pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.2mm}
  ${screen ? `html{background:#525a66}body{background:transparent;padding:14px;display:flex;flex-direction:column;align-items:center;gap:14px}
  .page{background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.35)}.pz{flex:none}
  .cell.blank{background:repeating-linear-gradient(45deg,#f1f1f1 0 2mm,#fafafa 2mm 4mm)}
  ${o.mode === 'sheet' ? '' : '.cell{outline:0.2mm dashed #bbb;outline-offset:0}'}` : ''}`;
}

/** Expand the chosen items into one entry per label (count each) and lay them out on pages. */
export function pagesHtml(items, o, ctx, { screen = false, maxPages = 0, zoom = 0 } = {}) {
  const L = layoutOf(o);
  const fit = fitLabel(L, o);
  const css = labelsCss(L, o, screen);
  o = { ...o, show: fit.show }; // labels carry only what fits
  ctx = { ...ctx, L };
  const cells = [];
  if (o.mode === 'sheet') for (let i = 1; i < Math.min(Math.max(1, +o.start || 1), L.perPage + 1); i++) cells.push(null);
  items.forEach((it) => { for (let i = 0; i < it.count; i++) cells.push(it); });
  const pages = [];
  for (let i = 0; i < cells.length; i += L.perPage) pages.push(cells.slice(i, i + L.perPage));
  const shown = maxPages ? pages.slice(0, maxPages) : pages;
  const z = screen && zoom ? zoom : 0; // preview only: scale the page without changing its mm layout
  const body = shown.map((pg) => {
    const page = `<div class="page"${z ? ` style="transform:scale(${z});transform-origin:0 0"` : ''}>${pg.map((it) => (it ? `<div class="cell">${labelHtml(it, o, ctx)}</div>` : `<div class="cell blank"></div>`)).join('')}</div>`;
    return z ? `<div class="pz" style="width:${round(L.pageW * z)}mm;height:${round(L.pageH * z)}mm">${page}</div>` : page;
  }).join('');
  return { html: `<style>${css}</style>${body}`, hidden: fit.hidden, pages: pages.length, labels: cells.filter(Boolean).length, layout: L };
}
