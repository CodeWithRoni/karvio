// Excel / PDF / Print exports shared by every table and report.
import { useStore } from './store';
import { money, fdate } from './format';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function cell(col, row) {
  const v = col.value ? col.value(row) : row[col.key];
  if (v === undefined || v === null) return '';
  if (col.type === 'money') return money(v, false);
  if (col.type === 'date') return fdate(v);
  return String(v);
}
function rawCell(col, row) {
  const v = col.value ? col.value(row) : row[col.key];
  if (col.type === 'money' || col.type === 'num') return Number(v) || 0;
  if (col.type === 'date') return v ? String(v).slice(0, 10) : '';
  return v ?? '';
}
function slug(s) { return String(s || 'export').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

/** columns: [{key,label,type,value?,sum?}] */
export async function exportExcel(title, columns, rows, totals) {
  const XLSX = await import('xlsx');
  const data = [columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => rawCell(c, r)))];
  if (totals) data.push(columns.map((c, i) => (i === 0 ? 'Total' : totals[c.key] ?? '')));
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(10, Math.min(45, c.label.length + 4, ...rows.slice(0, 200).map((r) => String(cell(c, r)).length + 2))) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${slug(title)}.xlsx`);
}

export async function exportPdf(title, columns, rows, totals) {
  const [{ jsPDF }, auto] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = auto.default;
  const s = useStore.getState().settings;
  const doc = new jsPDF({ orientation: columns.length > 7 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(14); doc.text(s.shop_name || 'ShopERP', 40, 40);
  doc.setFontSize(10); doc.text(title, 40, 58);
  doc.setFontSize(8); doc.text(`Generated ${new Date().toLocaleString()}`, 40, 72);
  const body = rows.map((r) => columns.map((c) => cell(c, r)));
  const foot = totals ? [columns.map((c, i) => (i === 0 ? 'Total' : totals[c.key] !== undefined ? money(totals[c.key], false) : ''))] : undefined;
  autoTable(doc, {
    startY: 84, head: [columns.map((c) => c.label)], body, foot,
    styles: { fontSize: 7.5, cellPadding: 3 }, headStyles: { fillColor: [13, 27, 42] }, footStyles: { fillColor: [230, 236, 245], textColor: 20, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, c.type === 'money' || c.type === 'num' ? { halign: 'right' } : {}]))
  });
  doc.save(`${slug(title)}.pdf`);
}

/** Opens a print window with a clean A4 table. */
export function printTable(title, columns, rows, totals, subtitle = '') {
  const s = useStore.getState().settings;
  const head = columns.map((c) => `<th class="${c.type === 'money' || c.type === 'num' ? 'r' : ''}">${esc(c.label)}</th>`).join('');
  const body = rows.map((r) => `<tr>${columns.map((c) => `<td class="${c.type === 'money' || c.type === 'num' ? 'r' : ''}">${esc(cell(c, r))}</td>`).join('')}</tr>`).join('');
  const foot = totals ? `<tfoot><tr>${columns.map((c, i) => `<td class="r">${i === 0 ? 'Total' : totals[c.key] !== undefined ? esc(money(totals[c.key], false)) : ''}</td>`).join('')}</tr></tfoot>` : '';
  printHtml(`
    <style>
      body{font:11px/1.4 system-ui,'Hind Siliguri',sans-serif;margin:24px;color:#111}
      h1{font-size:16px;margin:0} h2{font-size:12px;font-weight:500;margin:2px 0 12px;color:#444}
      table{width:100%;border-collapse:collapse} th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}
      th{background:#eef1f6} .r{text-align:right} tfoot td{font-weight:700;background:#f4f6fa}
      @page{size:A4 ${columns.length > 7 ? 'landscape' : 'portrait'};margin:12mm}
    </style>
    <h1>${esc(s.shop_name || 'ShopERP')}</h1>
    <h2>${esc(title)}${subtitle ? ' — ' + esc(subtitle) : ''} · Printed ${esc(new Date().toLocaleString())}</h2>
    <table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}">No data</td></tr>`}</tbody>${foot}</table>`);
}

/** Print arbitrary HTML via a hidden iframe (works in browsers, Electron and Tauri). */
export function printHtml(html) {
  const f = document.createElement('iframe');
  Object.assign(f.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(f);
  const d = f.contentDocument;
  d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`); d.close();
  setTimeout(() => {
    f.contentWindow.focus();
    f.contentWindow.print();
    setTimeout(() => f.remove(), 1500);
  }, 250);
}
export { esc };
