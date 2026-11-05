// Purchase invoices as full documents: print, PDF (one invoice per A4 page) and Excel.
import { useStore } from './store';
import { money, qty, fdate, fdatetime, splitList } from './format';
import { printHtml, printFonts, esc } from './export';

const css = `
  .pinv{font:12px/1.45 'Manrope','Hind Siliguri',system-ui,sans-serif;color:#111;background:#fff}
  .pinv *{box-sizing:border-box}
  .pinv .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d1b2a;padding-bottom:10px;margin-bottom:12px}
  .pinv h1{margin:0;font-size:20px}.pinv h2{margin:0;font-size:22px;letter-spacing:.04em;color:#0d1b2a;text-align:right}
  .pinv .meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
  .pinv .box{border:1px solid #ccd3dc;border-radius:6px;padding:8px 10px}
  .pinv .box b.t{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#556;margin-bottom:3px}
  .pinv table{width:100%;border-collapse:collapse}
  .pinv th,.pinv td{border:1px solid #ccd3dc;padding:5px 7px;text-align:left;vertical-align:top}
  .pinv th{background:#0d1b2a;color:#fff;font-weight:600;font-size:11.5px}
  .pinv .r{text-align:right}.pinv .sm{font-size:10.5px;color:#444}.pinv .sn{font-family:Consolas,monospace;font-size:10.5px;word-break:break-all}
  .pinv .tot{margin-left:auto;width:290px;margin-top:10px}.pinv .tot td{border:0;padding:3px 0}.pinv .tot .g td{font-weight:800;font-size:14px;border-top:2px solid #0d1b2a;padding-top:6px}
  .pinv .cx{margin:8px 0;padding:6px 10px;border:2px solid #c0392b;color:#c0392b;font-weight:800;text-align:center}
  .pinv .foot{margin-top:18px;display:flex;justify-content:space-between;font-size:11px;color:#444}
`;
const pays = (p) => { try { return Array.isArray(p.payments) ? p.payments : JSON.parse(p.payments || '[]'); } catch { return []; } };

export function purchaseInvoiceHtml(d) {
  const s = useStore.getState().settings, p = d.purchase, sup = d.supplier || {};
  const rows = d.items.map((i, n) => {
    const sers = splitList(String(i.serials || '').replace(/\n/g, ','));
    return `<tr><td>${n + 1}</td><td><b>${esc(i.name)}</b>${i.sku ? `<div class="sm">Model: ${esc(i.sku)}</div>` : ''}${i.description ? `<div class="sm">${esc(i.description)}</div>` : ''}${sers.length ? `<div class="sn">S/N (${sers.length}): ${esc(sers.join(', '))}</div>` : ''}</td>
      <td>${esc(i.unit || 'pcs')}</td><td class="r">${esc(qty(i.qty))}</td><td class="r">${esc(money(i.cost, false))}</td><td class="r">${esc(money(i.total, false))}</td></tr>`;
  }).join('');
  const pl = pays(p);
  return `<div class="pinv">
    <div class="top"><div><h1>${esc(s.shop_name || 'ShopERP')}</h1><div>${esc(s.shop_address || '')}</div><div>${esc(s.shop_phone || '')}</div></div>
      <div><h2>PURCHASE INVOICE</h2><div style="text-align:right"><b>${esc(p.invoice_no)}</b><br>Date: ${esc(fdate(p.date))}<br><span class="sm">Entered ${esc(fdatetime(p.created_at))} by ${esc(p.user || '')}</span></div></div></div>
    ${p.status === 'cancelled' ? `<div class="cx">CANCELLED — ${esc(p.cancel_reason || '')}</div>` : ''}
    <div class="meta">
      <div class="box"><b class="t">Supplier</b><b>${esc(sup.name || p.supplier_name || '—')}</b>${sup.phones ? `<div>Phone: ${esc(splitList(sup.phones).join(', '))}</div>` : ''}${sup.address ? `<div>${esc(sup.address)}</div>` : ''}</div>
      <div class="box"><b class="t">Payment</b>${pl.length ? pl.map((x) => `<div>${esc(x.account_name || 'Paid')}: <b>${esc(money(x.amount, false))}</b></div>`).join('') : '<div>Bought on credit</div>'}${p.note ? `<div class="sm">Note: ${esc(p.note)}</div>` : ''}</div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Product / description / serial numbers</th><th style="width:56px">Unit</th><th class="r" style="width:60px">Qty</th><th class="r" style="width:92px">Purchase price</th><th class="r" style="width:96px">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="tot">
      <tr><td>Subtotal</td><td class="r">${esc(money(p.subtotal, false))}</td></tr>
      ${p.discount ? `<tr><td>Discount</td><td class="r">-${esc(money(p.discount, false))}</td></tr>` : ''}
      <tr class="g"><td>Total</td><td class="r">${esc(money(p.total))}</td></tr>
      <tr><td>Paid</td><td class="r">${esc(money(p.paid, false))}</td></tr>
      <tr><td><b>Due to supplier</b></td><td class="r"><b>${esc(money(p.due))}</b></td></tr>
    </table>
    ${d.returns && d.returns.length ? `<p class="sm">Returns: ${esc(d.returns.map((r) => `${r.return_no} (${money(r.total, false)}, ${r.status})`).join(', '))}</p>` : ''}
    <div class="foot"><span>Printed ${esc(new Date().toLocaleString())}</span><span>Received by: ____________________</span></div>
  </div>`;
}

export function printPurchases(list) {
  return printHtml(`<style>@page{size:A4;margin:12mm}body{margin:0}${css}.pinv+.pinv{page-break-before:always;break-before:page}</style>${list.map(purchaseInvoiceHtml).join('')}`);
}

/** Each invoice starts on a new A4 page; long invoices continue on the next page. Bengali text renders correctly. */
export async function pdfPurchases(list, filename) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 32;
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'absolute', left: '-10000px', top: '0', width: '760px', background: '#fff' });
  host.innerHTML = `<style>${printFonts}${css}</style>`;
  document.body.appendChild(host);
  try {
    await document.fonts.load("400 12px 'Hind Siliguri'", 'বাংলা');
    let first = true;
    for (const d of list) {
      const el = document.createElement('div'); el.style.padding = '4px'; el.innerHTML = purchaseInvoiceHtml(d);
      host.appendChild(el);
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false });
      el.remove();
      const pw = W - M * 2, sliceH = Math.floor(((H - M * 2) / pw) * canvas.width);
      for (let y = 0; y < canvas.height; y += sliceH) {
        const c = document.createElement('canvas'); c.width = canvas.width; c.height = Math.min(sliceH, canvas.height - y);
        c.getContext('2d').drawImage(canvas, 0, y, c.width, c.height, 0, 0, c.width, c.height);
        if (!first) doc.addPage(); first = false;
        doc.addImage(c.toDataURL('image/png'), 'PNG', M, M, pw, (c.height / c.width) * pw);
      }
    }
    doc.save(filename);
  } finally { host.remove(); }
}

/** Sheet 1: one line per invoice. Sheet 2: every product line with supplier details and serial numbers. */
export async function excelPurchases(list, filename) {
  const XLSX = await import('xlsx');
  const inv = [['Purchase #', 'Date', 'Status', 'Supplier', 'Phone', 'Address', 'Subtotal', 'Discount', 'Total', 'Paid', 'Due', 'Payment', 'Note', 'Entered by']];
  const lines = [['Purchase #', 'Date', 'Supplier', 'Phone', 'Address', 'Product', 'Model', 'Description', 'Unit', 'Qty', 'Purchase price', 'Amount', 'Serial numbers']];
  list.forEach((d) => {
    const p = d.purchase, s = d.supplier || {}, phone = splitList(s.phones || '').join(', ');
    inv.push([p.invoice_no, String(p.date).slice(0, 10), p.status, s.name || p.supplier_name || '', phone, s.address || '', p.subtotal, p.discount, p.total, p.paid, p.due,
      pays(p).map((x) => `${x.account_name || ''} ${x.amount}`).join('; '), p.note || '', p.user || '']);
    d.items.forEach((i) => lines.push([p.invoice_no, String(p.date).slice(0, 10), s.name || p.supplier_name || '', phone, s.address || '', i.name, i.sku || '', i.description || '',
      i.unit || 'pcs', i.qty, i.cost, i.total, splitList(String(i.serials || '').replace(/\n/g, ',')).join(', ')]));
  });
  const wb = XLSX.utils.book_new();
  const a = XLSX.utils.aoa_to_sheet(inv); a['!cols'] = inv[0].map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const b = XLSX.utils.aoa_to_sheet(lines); b['!cols'] = lines[0].map((h, i) => ({ wch: [5, 7, 12].includes(i) ? 34 : Math.max(12, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, a, 'Invoices');
  XLSX.utils.book_append_sheet(wb, b, 'Items & serials');
  XLSX.writeFile(wb, filename);
}
