// Excel / PDF / Print exports shared by every table and report.
import { useStore } from './store';
import { money, fdate } from './format';
import bengaliRegular from '@fontsource/hind-siliguri/files/hind-siliguri-bengali-400-normal.woff2?url';
import bengaliBold from '@fontsource/hind-siliguri/files/hind-siliguri-bengali-600-normal.woff2?url';

export const printFonts = `@font-face{font-family:'Hind Siliguri';font-weight:400;src:url('${bengaliRegular}')}@font-face{font-family:'Hind Siliguri';font-weight:600 900;src:url('${bengaliBold}')}`;

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
  // jsPDF's built-in fonts cannot shape Bengali conjuncts. Render Bengali reports
  // with the browser's font engine, keeping the existing text PDF for Latin data.
  if (/[\u0980-\u09ff]/.test(JSON.stringify([title, useStore.getState().settings.shop_name, columns.map((c) => c.label), rows.map((r) => columns.map((c) => cell(c, r)))]))) {
    return exportBengaliPdf(title, columns, rows, totals);
  }
  const [{ jsPDF }, auto] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = auto.default;
  const s = useStore.getState().settings;
  const doc = new jsPDF({ orientation: columns.length > 7 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(14); doc.text(s.shop_name || 'Karvio', 40, 40);
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

async function exportBengaliPdf(title, columns, rows, totals) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const landscape = columns.length > 7;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth(), pageHeight = doc.internal.pageSize.getHeight();
  const width = (pageWidth - 80) * 4 / 3, maxHeight = (pageHeight - 90) * 4 / 3;
  const root = document.createElement('div');
  root.className = 'erp-pdf-export';
  Object.assign(root.style, { position: 'absolute', left: '-10000px', top: '0', width: `${width}px`, background: '#fff', color: '#111', font: "13px/1.5 'Hind Siliguri', sans-serif" });
  const style = document.createElement('style');
  style.textContent = `${printFonts}.erp-pdf-export *{box-sizing:border-box;color:#111;letter-spacing:normal}.erp-pdf-export table{width:100%;border-collapse:collapse;table-layout:fixed}.erp-pdf-export th,.erp-pdf-export td{border:1px solid #aaa;padding:5px;text-align:left;white-space:normal;overflow-wrap:anywhere;font-size:12px;line-height:1.5;vertical-align:top}.erp-pdf-export th{background:#e8eef5;font-weight:600}.erp-pdf-export h1{font-size:21px;margin:0}.erp-pdf-export h2{font-size:16px;margin:4px 0}.erp-pdf-export p{font-size:11px;margin:0 0 12px}`;
  root.appendChild(style);
  document.body.appendChild(root);
  try {
    await document.fonts.load("400 13px 'Hind Siliguri'", 'বাংলা');
    await document.fonts.load("600 13px 'Hind Siliguri'", 'বাংলা');
    let page = 0;
    const createPage = () => {
      root.querySelector('.pdf-content')?.remove();
      const content = document.createElement('div'); content.className = 'pdf-content';
      content.innerHTML = `<h1>${esc(useStore.getState().settings.shop_name || 'Karvio')}</h1><h2>${esc(title)}</h2><p>${esc(new Date().toLocaleString())}</p><table><thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody></tbody></table>`;
      root.appendChild(content);
      return content.querySelector('tbody');
    };
    const capture = async () => {
      const canvas = await html2canvas(root, { scale: 2, backgroundColor: '#ffffff', logging: false });
      const maxSlice = Math.floor(maxHeight * 2);
      for (let offset = 0; offset < canvas.height; offset += maxSlice) {
        const slice = document.createElement('canvas'); slice.width = canvas.width; slice.height = Math.min(maxSlice, canvas.height - offset);
        slice.getContext('2d').drawImage(canvas, 0, offset, canvas.width, slice.height, 0, 0, slice.width, slice.height);
        if (page++) doc.addPage();
        doc.addImage(slice.toDataURL('image/png'), 'PNG', 40, 40, pageWidth - 80, slice.height / slice.width * (pageWidth - 80));
        doc.setFontSize(8); doc.text(String(page), pageWidth - 40, pageHeight - 24, { align: 'right' });
      }
    };
    let body = createPage();
    const lines = rows.map((r) => columns.map((c) => cell(c, r)));
    if (!lines.length) lines.push(columns.map((_, i) => i === 0 ? 'No data' : ''));
    if (totals) lines.push(columns.map((c, i) => i === 0 ? 'Total' : totals[c.key] ?? ''));
    for (const line of lines) {
      const tr = document.createElement('tr');
      tr.innerHTML = line.map((v) => `<td>${esc(v)}</td>`).join('');
      body.appendChild(tr);
      if (root.getBoundingClientRect().height > maxHeight && body.children.length > 1) {
        tr.remove(); await capture(); body = createPage(); body.appendChild(tr);
      }
    }
    await capture();
    doc.save(`${slug(title)}.pdf`);
  } finally { root.remove(); }
}

/** Opens a print window with a clean A4 table. */
export function printTable(title, columns, rows, totals, subtitle = '') {
  const s = useStore.getState().settings;
  const head = columns.map((c) => `<th class="${c.type === 'money' || c.type === 'num' ? 'r' : ''}">${esc(c.label)}</th>`).join('');
  const body = rows.map((r) => `<tr>${columns.map((c) => `<td class="${c.type === 'money' || c.type === 'num' ? 'r' : ''}">${esc(cell(c, r))}</td>`).join('')}</tr>`).join('');
  const foot = totals ? `<tfoot><tr>${columns.map((c, i) => `<td class="r">${i === 0 ? 'Total' : totals[c.key] !== undefined ? esc(money(totals[c.key], false)) : ''}</td>`).join('')}</tr></tfoot>` : '';
  return printHtml(`
    <style>
      body{font:11px/1.4 system-ui,'Hind Siliguri',sans-serif;margin:24px;color:#111}
      h1{font-size:16px;margin:0} h2{font-size:12px;font-weight:500;margin:2px 0 12px;color:#444}
      table{width:100%;border-collapse:collapse} th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}
      th{background:#eef1f6} .r{text-align:right} tfoot td{font-weight:700;background:#f4f6fa}
      @page{size:A4 ${columns.length > 7 ? 'landscape' : 'portrait'};margin:12mm}
    </style>
    <h1>${esc(s.shop_name || 'Karvio')}</h1>
    <h2>${esc(title)}${subtitle ? ' — ' + esc(subtitle) : ''} · Printed ${esc(new Date().toLocaleString())}</h2>
    <table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}">No data</td></tr>`}</tbody>${foot}</table>`);
}

/** Print arbitrary HTML via a hidden iframe (works in browsers, Electron and Tauri). */
export async function printHtml(html) {
  const f = document.createElement('iframe');
  Object.assign(f.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(f);
  const d = f.contentDocument;
  d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><style>${printFonts}</style></head><body>${html}</body></html>`); d.close();
  try {
    await d.fonts.load("400 12px 'Hind Siliguri'", 'বাংলা');
    await d.fonts.load("600 12px 'Hind Siliguri'", 'বাংলা');
    await d.fonts.ready;
    await new Promise((resolve) => f.contentWindow.requestAnimationFrame(() => f.contentWindow.requestAnimationFrame(resolve)));
    f.contentWindow.addEventListener('afterprint', () => f.remove(), { once: true });
    f.contentWindow.focus();
    f.contentWindow.print();
    setTimeout(() => f.remove(), 60000);
  } catch (e) { f.remove(); throw e; }
}
export { esc };

/** Shop contact lines for printed headers: phone, tel, email, website, social (only the filled ones). */
export function shopContacts(st, sep = ' · ') {
  const parts = [['Phone', st.shop_phone], ['Tel', st.shop_tel], ['Email', st.shop_email], ['Web', st.shop_web], ['Social', st.shop_social]]
    .filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}: ${esc(String(v).trim())}`);
  return parts.join(sep);
}
