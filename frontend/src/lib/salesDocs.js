// Sales invoices and warranty claims as full A4 documents: print, PDF (one per page) and Excel.
import { useStore } from './store';
import { money, qty, fdate, fdatetime, splitList } from './format';
import { printHtml, esc } from './export';
import { pdfPages } from './purchaseDocs';

const css = `
  .sdoc{font:12px/1.45 'Manrope','Hind Siliguri',system-ui,sans-serif;color:#111;background:#fff}
  .sdoc *{box-sizing:border-box}
  .sdoc .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d1b2a;padding-bottom:10px;margin-bottom:12px}
  .sdoc h1{margin:0;font-size:20px}.sdoc h2{margin:0;font-size:21px;letter-spacing:.04em;color:#0d1b2a;text-align:right}
  .sdoc .meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
  .sdoc .box{border:1px solid #ccd3dc;border-radius:6px;padding:8px 10px}
  .sdoc .box b.t{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#556;margin-bottom:3px}
  .sdoc table{width:100%;border-collapse:collapse}.sdoc th,.sdoc td{border:1px solid #ccd3dc;padding:5px 7px;text-align:left;vertical-align:top}
  .sdoc th{background:#0d1b2a;color:#fff;font-weight:600;font-size:11.5px}
  .sdoc .r{text-align:right}.sdoc .sm{font-size:10.5px;color:#444}.sdoc .sn{font-family:Consolas,monospace;font-size:10.5px;word-break:break-all}
  .sdoc .tot{margin-left:auto;width:290px;margin-top:10px}.sdoc .tot td{border:0;padding:3px 0}.sdoc .tot .g td{font-weight:800;font-size:14px;border-top:2px solid #0d1b2a;padding-top:6px}
  .sdoc .cx{margin:8px 0;padding:6px 10px;border:2px solid #c0392b;color:#c0392b;font-weight:800;text-align:center}
  .sdoc .log li{margin:3px 0}.sdoc .foot{margin-top:18px;display:flex;justify-content:space-between;font-size:11px;color:#444}
`;
const head = (title, right) => { const s = useStore.getState().settings; return `<div class="top"><div><h1>${esc(s.shop_name || 'Karvio')}</h1><div>${esc(s.shop_address || '')}</div><div>${esc(s.shop_phone || '')}</div></div><div><h2>${title}</h2><div style="text-align:right">${right}</div></div></div>`; };
const pays = (x) => { try { return Array.isArray(x.payments) ? x.payments : JSON.parse(x.payments || '[]'); } catch { return []; } };
const sers = (v) => splitList(String(v || '').replace(/\n/g, ','));
// Invoice templates (Settings → Invoice). They restyle the same content.
const tplCss = `
  .sdoc.tpl-modern .top{border:0;background:#0d1b2a;color:#fff;padding:14px 16px;border-radius:10px}.sdoc.tpl-modern .top .sm{color:#cbd5e1}.sdoc.tpl-modern .top h2{color:#f2c230}
  .sdoc.tpl-modern th{background:#12b5b0;color:#fff}.sdoc.tpl-modern .tot .g td{border-top-color:#12b5b0;color:#0d1b2a}
  .sdoc.tpl-modern .box{border-color:#12b5b0;background:#f4fbfb}
  .sdoc.tpl-minimal .top{border-bottom:1px solid #111}.sdoc.tpl-minimal th{background:#fff;color:#111;border-bottom:2px solid #111}
  .sdoc.tpl-minimal th,.sdoc.tpl-minimal td{border-left:0;border-right:0}.sdoc.tpl-minimal .box{border:0;padding:0}.sdoc.tpl-minimal .tot .g td{border-top:1px solid #111}
  .sdoc .note-line{margin-top:14px;text-align:left;white-space:pre-wrap;font-size:11.5px}
`;
const pageCss = (paper) => paper === 'a5' ? '@page{size:A5;margin:8mm}.sdoc{font-size:10.5px}.sdoc h1{font-size:16px}.sdoc h2{font-size:16px}' : '@page{size:A4;margin:12mm}';
const wrap = (blocks, paper = 'a4') => `<style>${pageCss(paper)}body{margin:0}${css}${tplCss}.sdoc+.sdoc{page-break-before:always;break-before:page}</style>${blocks.join('')}`;
const noteHtml = () => { const n = String(useStore.getState().settings.invoice_note || '').trim(); return n ? `<div class="note-line"><b>Note:</b> ${esc(n)}</div>` : ''; };

/* ---------------- Sales invoices ---------------- */
export function saleInvoiceHtml(d) {
  const s = d.sale, c = d.customer || {};
  const rows = d.items.map((i, n) => {
    const sn = sers(i.serials);
    return `<tr><td>${n + 1}</td><td><b>${esc(i.name)}</b>${sn.length ? `<div class="sn">S/N: ${esc(sn.join(', '))}</div>` : ''}${i.warranty_expiry ? `<div class="sm">Warranty ${esc(i.warranty_days)} days — till ${esc(fdate(i.warranty_expiry))}${i.warranty_type === 'invoice' ? ' (keep this invoice)' : ''}</div>` : ''}${i.returned_qty ? `<div class="sm">Returned: ${esc(qty(i.returned_qty))}</div>` : ''}</td>
      <td>${esc(i.unit || 'pcs')}</td><td class="r">${esc(qty(i.qty))}</td><td class="r">${esc(money(i.price, false))}</td><td class="r">${esc(money(i.total, false))}</td></tr>`;
  }).join('');
  const pl = pays(s);
  const tpl = useStore.getState().settings.invoice_template || 'classic';
  return `<div class="sdoc tpl-${esc(tpl)}">${head('INVOICE', `<b>${esc(s.invoice_no)}</b><br>${esc(fdatetime(s.created_at || s.date))}<br><span class="sm">Served by ${esc(s.user_name || '')}</span>`)}
    ${s.status === 'cancelled' ? `<div class="cx">CANCELLED — ${esc(s.cancel_reason || '')}</div>` : ''}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${esc(s.customer_name || 'Walk-in')}</b>${c.phones ? `<div>Phone: ${esc(splitList(c.phones).join(', '))}</div>` : ''}${c.addresses ? `<div>${esc(String(c.addresses).split('|').join('; '))}</div>` : ''}</div>
      <div class="box"><b class="t">Payment</b>${pl.length ? pl.map((x) => `<div>${esc(x.account_name || 'Paid')}: <b>${esc(money(x.amount, false))}</b></div>`).join('') : ''}${s.credit_used ? `<div>Advance used: <b>${esc(money(s.credit_used, false))}</b></div>` : ''}${!pl.length && !s.credit_used ? '<div>Sold on due</div>' : ''}${s.note ? `<div class="sm">Note: ${esc(s.note)}</div>` : ''}</div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Product / serial / warranty</th><th style="width:56px">Unit</th><th class="r" style="width:60px">Qty</th><th class="r" style="width:90px">Price</th><th class="r" style="width:96px">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="tot">
      <tr><td>Subtotal</td><td class="r">${esc(money(s.subtotal, false))}</td></tr>
      ${s.discount ? `<tr><td>Discount</td><td class="r">-${esc(money(s.discount, false))}</td></tr>` : ''}
      <tr class="g"><td>Total</td><td class="r">${esc(money(s.total))}</td></tr>
      <tr><td>Paid</td><td class="r">${esc(money(s.paid, false))}</td></tr>
      ${s.due > 0 ? `<tr><td><b>Due</b></td><td class="r"><b>${esc(money(s.due))}</b></td></tr>` : ''}
      ${d.customer && d.customer.balance !== undefined ? `<tr><td>Total balance due</td><td class="r">${esc(money(d.customer.balance, false))}</td></tr>` : ''}
    </table>
    ${d.returns && d.returns.length ? `<p class="sm">Returns: ${esc(d.returns.map((r) => `${r.return_no} (${money(r.total, false)}, ${r.status})`).join(', '))}</p>` : ''}
    <div class="foot"><span>Printed ${esc(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div>${noteHtml()}</div>`;
}
export const printSales = (list, paper) => printHtml(wrap(list.map(saleInvoiceHtml), paper));
export const pdfSales = (list, filename) => pdfPages(list.map(saleInvoiceHtml), css + tplCss, filename);
export async function excelSales(list, filename) {
  const XLSX = await import('xlsx');
  const a = [['Invoice #', 'Date', 'Status', 'Customer', 'Phone', 'Address', 'Subtotal', 'Discount', 'Total', 'Paid', 'Due', 'Payment', 'Served by', 'Note']];
  const b = [['Invoice #', 'Date', 'Customer', 'Phone', 'Product', 'Unit', 'Qty', 'Price', 'Amount', 'Serial numbers', 'Warranty days', 'Warranty till', 'Returned qty']];
  list.forEach((d) => {
    const s = d.sale, c = d.customer || {}, ph = splitList(c.phones || '').join(', ');
    a.push([s.invoice_no, String(s.date).slice(0, 10), s.status, s.customer_name, ph, String(c.addresses || '').split('|').join('; '), s.subtotal, s.discount, s.total, s.paid, s.due, pays(s).map((x) => `${x.account_name || ''} ${x.amount}`).join('; '), s.user_name || '', s.note || '']);
    d.items.forEach((i) => b.push([s.invoice_no, String(s.date).slice(0, 10), s.customer_name, ph, i.name, i.unit || 'pcs', i.qty, i.price, i.total, sers(i.serials).join(', '), i.warranty_days || '', i.warranty_expiry ? String(i.warranty_expiry).slice(0, 10) : '', i.returned_qty || 0]));
  });
  const wb = XLSX.utils.book_new();
  const sa = XLSX.utils.aoa_to_sheet(a); sa['!cols'] = a[0].map((h, i) => ({ wch: [3, 5, 11].includes(i) ? 30 : 13 }));
  const sb = XLSX.utils.aoa_to_sheet(b); sb['!cols'] = b[0].map((h, i) => ({ wch: [2, 4, 9].includes(i) ? 34 : 13 }));
  XLSX.utils.book_append_sheet(wb, sa, 'Invoices'); XLSX.utils.book_append_sheet(wb, sb, 'Items & serials');
  XLSX.writeFile(wb, filename);
}

/* ---------------- Warranty claims ---------------- */
export function claimHtml(c) {
  const log = (c.log || []).map((l) => `<li><b>${esc(l.status)}</b> — ${esc(fdatetime(l.ts))} · ${esc(l.user || '')}${l.note ? ` — ${esc(l.note)}` : ''}</li>`).join('');
  return `<div class="sdoc">${head('WARRANTY CLAIM', `<b>${esc(c.claim_no)}</b><br>Received ${esc(fdate(c.date))}<br>Status: <b>${esc(c.status)}</b>`)}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${esc(c.customer_name || '—')}</b><div>${esc(c.phone || '')}</div><div class="sm">Invoice: ${esc(c.invoice_no || '—')}</div></div>
      <div class="box"><b class="t">Product</b><b>${esc(c.product_name || '')}</b><div class="sn">Serial: ${esc(c.serial || '—')}</div><div>Warranty till: ${esc(fdate(c.expiry) || 'N/A')} — <b>${c.in_warranty ? 'In warranty' : 'EXPIRED'}</b></div></div>
    </div>
    <div class="box" style="margin-bottom:12px"><b class="t">Problem reported</b>${esc(c.issue || '—')}${c.vendor ? `<div style="margin-top:6px"><b class="t">Vendor / service centre</b>${esc(c.vendor)}</div>` : ''}</div>
    <div class="box"><b class="t">Progress</b><ul class="log" style="margin:4px 0 0;padding-left:18px">${log || '<li>—</li>'}</ul></div>
    <div class="foot"><span>Printed ${esc(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div></div>`;
}
export const printClaims = (list) => printHtml(wrap(list.map(claimHtml)));
export const pdfClaims = (list, filename) => pdfPages(list.map(claimHtml), css, filename);
export async function excelClaims(list, filename) {
  const XLSX = await import('xlsx');
  const a = [['Claim #', 'Received', 'Status', 'Product', 'Serial', 'Invoice', 'Customer', 'Phone', 'Problem', 'Coverage', 'Warranty till', 'Vendor', 'Progress']];
  list.forEach((c) => a.push([c.claim_no, String(c.date).slice(0, 10), c.status, c.product_name, c.serial || '', c.invoice_no || '', c.customer_name || '', c.phone || '', c.issue || '', c.in_warranty ? 'In warranty' : 'Expired', c.expiry ? String(c.expiry).slice(0, 10) : '', c.vendor || '',
    (c.log || []).map((l) => `${String(l.ts).slice(0, 16)} ${l.status}${l.note ? ` (${l.note})` : ''}`).join(' | ')]));
  const wb = XLSX.utils.book_new();
  const sa = XLSX.utils.aoa_to_sheet(a); sa['!cols'] = a[0].map((h, i) => ({ wch: [3, 8, 12].includes(i) ? 36 : 14 }));
  XLSX.utils.book_append_sheet(wb, sa, 'Warranty claims');
  XLSX.writeFile(wb, filename);
}
