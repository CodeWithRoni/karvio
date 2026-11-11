// Sales invoices and warranty claims as full A4 documents: print, PDF (one per page) and Excel.
import { useStore } from './store';
import { money, qty, fdate, fdatetime, splitList, today } from './format';
import { printHtml, esc, shopContacts } from './export';
import { pdfPages } from './purchaseDocs';

const css = `
  .sdoc{font:12px/1.45 'Manrope','Hind Siliguri',system-ui,sans-serif;color:#111;background:#fff;padding:0 2px}
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
const head = (title, right) => { const s = useStore.getState().settings; return `<div class="top"><div><h1>${esc(s.shop_name || 'Karvio')}</h1><div>${esc(s.shop_address || '')}</div><div>${shopContacts(s)}</div></div><div><h2>${title}</h2><div style="text-align:right">${right}</div></div></div>`; };
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
const isBiz = () => useStore.getState().settings.invoice_template === 'business';
const wrap = (blocks, paper = 'a4', biz = false) => `<style>${biz && paper !== 'a5' ? bizPageCss() : pageCss(paper)}body{margin:0}${css}${tplCss}${biz ? bizCss : ''}.sdoc+.sdoc,.bdoc+.bdoc{page-break-before:always;break-before:page}</style>${blocks.join('')}`;
const noteHtml = () => { const n = String(useStore.getState().settings.invoice_note || '').trim(); return n ? `<div class="note-line"><b>Note:</b> ${esc(n)}</div>` : ''; };

/* ---------------- "Business" template: centred letterhead, grey bill bar, boxed info, page footer ---------------- */
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const w99 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`);
const w999 = (n) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', w99(n % 100)].filter(Boolean).join(' ');
/** Taka in words, Bangladesh style (Crore / Lakh / Thousand): 12500 → "Twelve Thousand Five Hundred Only". */
export function amountInWords(v) {
  const amt = Math.abs(Number(v) || 0), t = Math.floor(amt), ps = Math.round((amt - t) * 100);
  const part = (n) => {
    if (!n) return '';
    const out = []; let r = n;
    if (r >= 1e7) { out.push(`${part(Math.floor(r / 1e7))} Crore`); r %= 1e7; }
    if (r >= 1e5) { out.push(`${w99(Math.floor(r / 1e5))} Lakh`); r %= 1e5; }
    if (r >= 1e3) { out.push(`${w99(Math.floor(r / 1e3))} Thousand`); r %= 1e3; }
    if (r) out.push(w999(r));
    return out.join(' ');
  };
  const words = part(t) || 'Zero';
  return `${words}${ps ? ` and ${w99(ps)} Paisa` : ''} Only`;
}
const bizCss = `
  .bdoc{font:12.5px/1.4 'Times New Roman',Times,'Hind Siliguri',serif;color:#000;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:0 2px}
  .bdoc *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .bdoc *{box-sizing:border-box}
  .bdoc .bh{text-align:center;margin-bottom:8px}.bdoc .bh h1{margin:0 0 4px;font-size:30px;font-weight:700}.bdoc .bh div{font-size:11.5px}
  .bdoc .bbar{background:#b5b5b5;border:1px solid #8f8f8f;text-align:center;font-weight:700;font-size:14px;padding:5px}
  .bdoc .binfo{display:grid;grid-template-columns:1.15fr 1fr;gap:20px;background:#ececec;border:1px solid #b5b5b5;border-top:0;padding:10px 12px;margin-bottom:12px}
  .bdoc .binfo table{width:100%;border-collapse:collapse}.bdoc .binfo td{padding:2px 0;vertical-align:top;border:0}
  .bdoc .binfo td.k{font-weight:700;width:118px;white-space:nowrap}.bdoc .binfo td.c{width:18px}
  .bdoc .bitems{width:100%;border-collapse:collapse}.bdoc .bitems th,.bdoc .bitems td{border:1px solid #333;padding:6px 7px;vertical-align:top}
  .bdoc .bitems th{background:#d6d6d6;font-weight:700;text-align:center}.bdoc .bitems td.r{text-align:right}.bdoc .bitems td.cn{text-align:center}
  .bdoc .bitems thead{display:table-header-group}.bdoc .bitems tr{break-inside:avoid;page-break-inside:avoid}
  .bdoc .sn{font-size:11px;margin-top:2px;word-break:break-all}
  .bdoc .bsum{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-top:8px;break-inside:avoid;page-break-inside:avoid}
  .bdoc .btot td{padding:2px 0 2px 12px;border:0}.bdoc .btot td.k{font-weight:700;padding-left:0}.bdoc .btot td.r{text-align:right;min-width:110px}
  .bdoc .bdue{border:1.5px solid #000;padding:8px 10px;margin-top:10px;width:300px}.bdoc .bdue td{padding:2px 0;border:0}.bdoc .bdue td.k{font-weight:700}.bdoc .bdue td.r{text-align:right}
  .bdoc .bsign{display:flex;justify-content:flex-end;margin-top:44px;break-inside:avoid;page-break-inside:avoid}
  .bdoc .bsign span{width:220px;border-top:1px solid #000;text-align:center;padding-top:5px}
  .bdoc .note-line{margin-top:16px;text-align:left;white-space:pre-wrap;font-size:11.5px;break-inside:avoid}
  .bdoc .cx{margin:8px 0;padding:6px 10px;border:2px solid #c0392b;color:#c0392b;font-weight:800;text-align:center}
  .bdoc .bfoot{display:flex;justify-content:space-between;border-top:1px solid #777;margin-top:22px;padding-top:5px;font-size:11px}
  @media print{.bdoc .bfoot{display:none}}
`;
const m2 = (v, _x) => (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SOFTWARE_LINE = 'For Software: 01913354321';
/** Footer printed in the bottom margin of every A4 page, with "Page X of Y". */
const bizPageCss = () => {
  const now = new Date(), q = (t) => JSON.stringify(t);
  const box = 'font:10.5px "Times New Roman",Times,serif;color:#000;border-top:1px solid #777;padding-top:4px;vertical-align:top';
  // Empty top margin boxes stop the browser printing its own date / page title at the top.
  return `@page{size:A4;margin:12mm 12mm 16mm;
    @top-left{content:' '}@top-center{content:' '}@top-right{content:' '}
    @bottom-left{content:${q(`Print Date: ${fdate(today())}\u00a0\u00a0\u00a0\u00a0Print Time: ${now.toLocaleTimeString('en-US')}`)};${box}}
    @bottom-center{content:${q(SOFTWARE_LINE)};${box}}
    @bottom-right{content:"Page " counter(page) " of " counter(pages);${box}}}`;
};
function businessInvoiceHtml(d) {
  const st = useStore.getState().settings;
  const s = d.sale, c = d.customer || {};
  const row = (k, v) => `<tr><td class="k">${k}</td><td class="c">:</td><td>${v}</td></tr>`;
  const rows = d.items.map((i, n) => {
    const sn = sers(i.serials);
    return `<tr><td class="cn">${n + 1}</td><td>${esc(i.name)}${sn.length ? `<div class="sn">${esc(sn.join(', '))}</div>` : ''}${i.returned_qty ? `<div class="sn">Returned: ${esc(qty(i.returned_qty))}</div>` : ''}</td>
      <td class="cn">${Number(i.warranty_days) > 0 ? esc(i.warranty_days) : '—'}</td><td class="r">${esc(m2(i.price, false))}</td><td class="cn">${esc(qty(i.qty))}${i.unit && i.unit !== 'pcs' ? ' ' + esc(i.unit) : ''}</td><td class="r">${esc(m2(i.total, false))}</td></tr>`;
  }).join('');
  const total = Number(s.total) || 0, paid = Number(s.paid) || 0;
  let snapshot = null;
  try { snapshot = typeof s.balance_snapshot === 'string' ? JSON.parse(s.balance_snapshot || 'null') : s.balance_snapshot; } catch {}
  const recorded = snapshot && Number.isFinite(Number(snapshot.previous)) && Number.isFinite(Number(snapshot.outstanding));
  const outstanding = recorded ? Number(snapshot.outstanding) : !s.customer_id ? Number(s.due) || 0 : null;
  const prev = recorded ? Number(snapshot.previous) : !s.customer_id ? 0 : null;
  const user = esc(s.user_name || '');
  const phone = c.phones ? esc(splitList(c.phones).join(', ')) : '';
  const walkIn = !s.customer_id || !s.customer_name || /^walk-?in/i.test(String(s.customer_name).trim());
  const now = new Date();
  return `<div class="bdoc">
    <div class="bh"><h1>${esc(st.shop_name || 'Karvio')}</h1>${st.shop_address ? `<div>${esc(st.shop_address)}</div>` : ''}${shopContacts(st) ? `<div>${shopContacts(st)}</div>` : ''}</div>
    <div class="bbar">Invoice/ Bill</div>
    <div class="binfo">
      <table>${row('Sold To', `<b>${walkIn ? 'CASH' : esc(s.customer_name)}</b>${!walkIn && c.addresses ? `<div>${esc(String(c.addresses).split('|').join('; '))}</div>` : ''}`)}${row('Contact No', walkIn ? esc(st.shop_tel || st.shop_phone || '—') : phone || '—')}${row('Invoice No', esc(s.invoice_no))}</table>
      <table>${row('Date', esc(fdate(s.date || s.created_at)))}${row('Sold By', user)}${row('Billing By', user)}${row('Sales Person By', user)}</table>
    </div>
    ${s.status === 'cancelled' ? `<div class="cx">CANCELLED — ${esc(s.cancel_reason || '')}</div>` : ''}
    <table class="bitems"><thead><tr><th style="width:38px">S/L</th><th>Item Descriptions</th><th style="width:72px">Warranty Days</th><th style="width:96px">Unit Price</th><th style="width:72px">Quantity</th><th style="width:100px">Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="bsum">
      <div><div><b>Amount In Words :</b> ${esc(amountInWords(total))}</div>
        <table class="bdue">
          <tr><td class="k">Previous Due</td><td>:</td><td class="r">${prev === null ? 'Not recorded' : esc(m2(prev, false))}</td></tr>
          <tr><td class="k">Sales Amount</td><td>:</td><td class="r">${esc(m2(total, false))}</td></tr>
          <tr><td class="k">Collected Amount</td><td>:</td><td class="r">${esc(m2(paid, false))}</td></tr>
          <tr><td class="k">Outstanding Amount</td><td>:</td><td class="r">${outstanding === null ? 'Not recorded' : esc(m2(outstanding, false))}</td></tr>
          ${s.next_payment_date && s.due > 0 ? `<tr><td class="k">Next Payment Date</td><td>:</td><td class="r">${esc(fdate(s.next_payment_date))}</td></tr>` : ''}
        </table></div>
      <table class="btot">
        <tr><td class="k">TOTAL :</td><td class="r">${esc(m2(s.subtotal, false))}</td></tr>
        <tr><td class="k">Discount :</td><td class="r">${esc(m2(s.discount || 0, false))}</td></tr>
        <tr><td class="k">Grand TOTAL :</td><td class="r"><b>${esc(m2(total, false))}</b></td></tr>
      </table>
    </div>
    <div class="bsign"><span>Authorised Signature And Company Stamp</span></div>
    ${noteHtml()}
    <div class="bfoot"><span>Print Date: ${esc(fdate(today()))}</span><span>Print Time: ${esc(now.toLocaleTimeString('en-US'))}</span><span>${SOFTWARE_LINE}</span><span>Page 1 of 1</span></div>
  </div>`;
}

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
  if (tpl === 'business') return businessInvoiceHtml(d);
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
      ${s.next_payment_date && s.due > 0 ? `<tr><td>Next payment date</td><td class="r">${esc(fdate(s.next_payment_date))}</td></tr>` : ''}
    </table>
    ${d.returns && d.returns.length ? `<p class="sm">Returns: ${esc(d.returns.map((r) => `${r.return_no} (${money(r.total, false)}, ${r.status})`).join(', '))}</p>` : ''}
    <div class="foot"><span>Printed ${esc(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div>${noteHtml()}</div>`;
}
export const printSales = (list, paper) => printHtml(wrap(list.map(saleInvoiceHtml), paper, isBiz()));
/** One sale invoice as the full document printSales prints (A4 / A5, with the chosen template). */
export const saleDocHtml = (d, paper = 'a4') => wrap([saleInvoiceHtml(d)], paper, isBiz());
export const pdfSales = (list, filename) => pdfPages(list.map(saleInvoiceHtml), css + tplCss + (isBiz() ? bizCss : ''), filename);
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
export const claimDocHtml = (c) => wrap([claimHtml(c)]);

/* ---------------- Sales return / exchange ---------------- */
/** d = { ret, items, customer } from history.doc (type sreturn) */
export function salesReturnHtml(d) {
  const r = d.ret, c = d.customer || {};
  const rows = d.items.map((i, n) => {
    const sn = sers(i.serials);
    return `<tr><td>${n + 1}</td><td><b>${esc(i.name)}</b>${sn.length ? `<div class="sn">S/N: ${esc(sn.join(', '))}</div>` : ''}</td>
      <td class="r">${esc(qty(i.qty))}</td><td class="r">${esc(money(i.price, false))}</td><td class="r">${esc(money(i.total, false))}</td></tr>`;
  }).join('');
  const title = r.type === 'exchange' ? 'EXCHANGE' : 'SALES RETURN';
  return `<div class="sdoc">${head(title, `<b>${esc(r.return_no)}</b><br>${esc(fdatetime(r.created_at || r.date))}<br><span class="sm">By ${esc(r.user || '')}</span>`)}
    ${r.status === 'cancelled' ? `<div class="cx">CANCELLED — ${esc(r.cancel_reason || '')}</div>` : ''}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${esc(r.customer_name || 'Walk-in')}</b>${c.phones ? `<div>Phone: ${esc(splitList(c.phones).join(', '))}</div>` : ''}${c.addresses ? `<div>${esc(String(c.addresses).split('|').join('; '))}</div>` : ''}</div>
      <div class="box"><b class="t">Original invoice</b><b>${esc(r.invoice_no || '—')}</b><div>${r.type === 'exchange' ? 'Exchange — value kept as customer credit' : 'Return'}</div>${r.note ? `<div class="sm">Note: ${esc(r.note)}</div>` : ''}</div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Product / serial</th><th class="r" style="width:60px">Qty</th><th class="r" style="width:90px">Price</th><th class="r" style="width:96px">Value</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="tot">
      <tr class="g"><td>Return value</td><td class="r">${esc(money(r.total))}</td></tr>
      <tr><td>Refunded${r.refund_account ? ` (${esc(r.refund_account)})` : ''}</td><td class="r">${esc(money(r.refund || 0, false))}</td></tr>
      ${Number(r.total) - Number(r.refund || 0) > 0.004 ? `<tr><td>Adjusted to customer balance</td><td class="r">${esc(money(Number(r.total) - Number(r.refund || 0), false))}</td></tr>` : ''}
    </table>
    <div class="foot"><span>Printed ${esc(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div></div>`;
}
export const salesReturnDocHtml = (d) => wrap([salesReturnHtml(d)]);
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
