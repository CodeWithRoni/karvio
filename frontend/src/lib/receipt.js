import { quotationTotals, quotationPrice } from './quotationTotals';
import { qrSvg, logoImg } from './qr';
// Thermal receipts (58mm / 80mm), A4 quotation and ledger statements.
import { useStore } from './store';
import { bizDocHtml, isBizTpl, docOpen, docHead, printDocs, m2fmt, invoicePaymentSummary } from './salesDocs';
import { printParties } from './partyDocs';
import { unitPrice, money, qty, fdate, fdatetime, splitList, today, cap1 } from './format';
import { printHtml, esc, shopContacts } from './export';

function shopHead(s) {
  return `<div class="c"><b class="shop">${esc(s.shop_name || 'Karvio')}</b>
    ${s.shop_address ? `<div>${esc(s.shop_address)}</div>` : ''}
    ${shopContacts(s, '<br>') ? `<div>${shopContacts(s, '<br>')}</div>` : ''}</div>`;
}

/** Paper sizes for invoices (Settings → Invoice). Thermal widths in mm, or a full page. */
export const PAPERS = [['80', '80 mm thermal'], ['58', '58 mm thermal'], ['a4', 'A4 page'], ['a5', 'A5 page'], ['custom', 'Custom']];
export const TEMPLATES = [['classic', 'Classic'], ['modern', 'Modern'], ['minimal', 'Minimal'], ['business', 'Business']];

/** Print an invoice the way Settings says: template, paper size and footer note. `paperOverride` = '58' | '80' | 'a4' … */
export function printInvoice(detail, paperOverride) {
  const s = useStore.getState().settings;
  const paper = paperOverride || s.invoice_paper || String(s.receipt_width || 80);
  if (paper === 'a4' || paper === 'a5') return import('./salesDocs').then((m) => m.printSales([detail], paper));
  if (paper !== 'custom') return printReceipt(detail, Number(paper) || 80);
  const [w, h] = customPaper(s);
  return printReceipt(detail, w, h);
}
const customPaper = (s) => [Math.min(Math.max(Number(s.invoice_custom_width) || 80, 40), 216),
  Number(s.invoice_custom_height) > 0 ? Math.min(Math.max(Number(s.invoice_custom_height), 40), 1000) : 0];
/** The same invoice printInvoice prints, as HTML for an on-screen view: { html, paper: 'a4' | 'a5' | 'receipt' }. */
export async function invoiceHtml(detail) {
  const s = useStore.getState().settings;
  const paper = s.invoice_paper || String(s.receipt_width || 80);
  if (paper === 'a4' || paper === 'a5') { const m = await import('./salesDocs'); return { html: m.saleDocHtml(detail, paper), paper }; }
  if (paper !== 'custom') return { html: receiptHtml(detail, Number(paper) || 80), paper: 'receipt' };
  const [w, h] = customPaper(s);
  return { html: receiptHtml(detail, w, h), paper: 'receipt' };
}

/** detail = response of sale.detail / sale.create  ({sale, items, customer}) */
/** `height` in mm fixes the page height (custom paper); 0 = page grows with the invoice. */
export function printReceipt(detail, widthOverride, height = 0) { return printHtml(receiptHtml(detail, widthOverride, height)); }
export function receiptHtml(detail, widthOverride, height = 0) {
  const s = useStore.getState().settings;
  const w = Number(widthOverride || s.receipt_width || 80);
  const paper = w <= 60 ? w - 10 : w - 8; // printable width in mm
  const fs = w <= 60 ? 10 : w >= 100 ? 12.5 : 11.5;
  const tpl = s.invoice_template || 'classic';
  const note = String(s.invoice_note || '').trim();
  const { sale, items, customer } = detail;
  const payment = invoicePaymentSummary(detail);
  const pays = Array.isArray(sale.payments) ? sale.payments : safeJson(sale.payments, []);
  const lines = items.map((i) => {
    const sers = splitList(i.serials);
    return `<tr><td colspan="3" class="nm">${esc(i.name)}</td></tr>
      <tr><td>${esc(qty(i.qty, i.unit))} × ${esc(unitPrice(i.price))}</td><td></td><td class="r">${esc(money(i.total, false))}</td></tr>
      ${sers.length ? `<tr><td colspan="3" class="sm">S/N: ${esc(sers.join(', '))}</td></tr>` : ''}
      ${i.warranty_expiry ? `<tr><td colspan="3" class="sm">Warranty: ${esc(i.warranty_days)} days (till ${esc(fdate(i.warranty_expiry))})${i.warranty_type === 'invoice' ? ' — keep this receipt' : ''}</td></tr>` : ''}`;
  }).join('');
  const font = tpl === 'minimal' ? "system-ui,'Hind Siliguri',sans-serif" : "'Courier New','Hind Siliguri',ui-monospace,monospace";
  return `
  <style>
    @page{size:${w}mm ${height ? height + 'mm' : 'auto'};margin:0}
    body{margin:0;font:${fs}px/1.35 ${font};color:#000;width:${paper}mm;padding:3mm ${(w - paper) / 2}mm}
    .c{text-align:center}.shop{font-size:${fs + 4}px}.r{text-align:right}.sm{font-size:${fs - 2}px}.nm{padding-top:4px;font-weight:700}
    table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:0}
    hr{border:0;border-top:1px ${tpl === 'minimal' ? 'solid' : 'dashed'} #000;margin:5px 0}.tot td{font-weight:700;font-size:${fs + 1}px}
    .t-modern .head{background:#000;color:#fff;padding:5px 4px;border-radius:4px}.t-modern .tot td{border-top:1.5px solid #000;padding-top:2px}
    .t-modern .ttl{display:block;margin:4px 0;text-align:center;font-weight:800;letter-spacing:.2em}
    .note{margin-top:6px;text-align:left;white-space:pre-wrap;font-size:${fs - 1}px}
    .rlogo{display:block;margin:0 auto 4px;max-width:60%;max-height:22mm;object-fit:contain;filter:grayscale(1)}
    .rqr{display:block;margin:6px auto 2px;width:24mm;height:24mm}.rqr svg{width:100%;height:100%;display:block}
  </style>
  <div class="t-${esc(tpl)}">
  <div class="head">${logoImg(s, 'rlogo')}${shopHead(s)}</div>
  ${tpl === 'modern' ? '<span class="ttl">INVOICE</span>' : '<hr>'}
  <div>Invoice: <b>${esc(sale.invoice_no)}</b></div>
  <div>Date: ${esc(fdatetime(sale.created_at || sale.date))}</div>
  <div>Customer: ${esc(sale.customer_name)}${customer && customer.phones ? ' (' + esc(splitList(customer.phones)[0]) + ')' : ''}</div>
  <div>Served by: ${esc(cap1(sale.user_name || ''))}</div>
  ${sale.status === 'cancelled' ? '<div class="c"><b>*** CANCELLED ***</b></div>' : ''}
  <hr>
  <table>${lines}</table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td class="r">${esc(money(sale.subtotal, false))}</td></tr>
    ${sale.discount ? `<tr><td>Discount</td><td class="r">-${esc(money(sale.discount, false))}</td></tr>` : ''}
    <tr class="tot"><td>TOTAL</td><td class="r">${esc(money(sale.total))}</td></tr>
    ${payment.returned > 0 ? `<tr><td>Returned value</td><td class="r">${esc(money(payment.returned, false))}</td></tr><tr><td>Net invoice amount</td><td class="r">${esc(money(payment.net, false))}</td></tr>` : ''}
    ${pays.map((p) => `<tr><td>${payment.current ? 'At sale' : 'Paid'} (${esc(p.account_name)})</td><td class="r">${esc(money(p.amount, false))}</td></tr>`).join('')}
    ${sale.credit_used ? `<tr><td>${payment.current ? 'At sale' : 'Paid'} (advance)</td><td class="r">${esc(money(sale.credit_used, false))}</td></tr>` : ''}
    ${payment.current ? `<tr><td>Paid now</td><td class="r">${esc(money(payment.paid, false))}</td></tr>` : ''}
    ${payment.due > 0 ? `<tr class="tot"><td>DUE</td><td class="r">${esc(money(payment.due))}</td></tr>` : ''}
    ${customer && customer.balance !== undefined ? `<tr><td>${customer.balance < 0 ? 'Customer advance' : 'Total balance due'}</td><td class="r">${esc(money(Math.abs(customer.balance), false))}</td></tr>` : ''}
    ${sale.next_payment_date && (sale.due_now ?? sale.due) > 0 ? `<tr><td>Next payment date</td><td class="r">${esc(fdate(sale.next_payment_date))}</td></tr>` : ''}
  </table>
  <hr>
  <div class="c">${esc(s.shop_footer || 'Thank you!')}</div>
  <div class="c sm">Goods sold are subject to warranty terms.</div>
  ${String(s.invoice_qr ?? 'true') !== 'false' && sale.invoice_no ? `<div class="rqr">${qrSvg(sale.invoice_no, 2)}</div><div class="c sm">Scan at the shop to find this invoice</div>` : ''}
  ${note ? `<div class="note"><b>Note:</b> ${esc(note)}</div>` : ''}
  </div>`;
}

function safeJson(s, d) { try { return JSON.parse(s); } catch { return d; } }

/** A4 quotation for the PC builder. lines = [{name, qty, price, warranty}] */
export function printQuotation({ title, customer, phone, lines, discount = 0, note = '', validDays = 7, no: quoteNo, date: quoteDate, storedTotals }) {
  const s = useStore.getState().settings;
  const no = quoteNo || 'Q-' + Date.now().toString().slice(-7);
  const pricing = storedTotals ? { ...storedTotals, valid: true } : quotationTotals(lines, discount), sub = pricing.subtotal;
  if (!pricing.valid) throw new Error(pricing.error);
  const rows = lines.map((l, i) => `<tr><td>${i + 1}</td><td><b>${esc(l.group || '')}</b>${l.group ? '<br>' : ''}${esc(l.name)}</td><td class="r">${esc(l.warranty || '—')}</td><td class="r">${esc(l.qty)}</td><td class="r">${esc(quotationPrice(l.price))}</td><td class="r">${esc(money(storedTotals ? l.total : l.qty * l.price, false))}</td></tr>`).join('');
  const valid = validDays ? `${validDays} days` : '—';
  const notes = `${note ? `<div class="note-box"><b>Notes:</b> ${esc(note)}</div>` : ''}<div class="note-box sm">Prices may change with market rates after the validity period. Stock is not reserved until an order is confirmed.</div>`;
  const totals = [['Subtotal', esc(money(sub))], ...(discount ? [['Discount', '-' + esc(money(discount))]] : []), ['Grand total', esc(money(pricing.total)), true]];
  // the template chosen in Settings → Invoice
  if (isBizTpl()) return printDocs([bizDocHtml({
    title: 'Quotation',
    left: [['Prepared For', `<b>${esc(customer || '—')}</b>`], ['Contact No', esc(phone || '')], ['Subject', esc(title || 'Custom PC build')]],
    right: [['Quotation No', `<b>${esc(no)}</b>`], ['Date', esc(fdate(quoteDate || today()))], ['Valid For', esc(valid)]],
    cols: [{ label: 'S/L', w: 38, cls: 'cn' }, { label: 'Item Descriptions' }, { label: 'Warranty', w: 80, cls: 'cn' }, { label: 'Unit Price', w: 96, cls: 'r' }, { label: 'Quantity', w: 72, cls: 'cn' }, { label: 'Total', w: 100, cls: 'r' }],
    rows: lines.map((l, i) => [i + 1, `${l.group ? `<b>${esc(l.group)}</b><br>` : ''}${esc(l.name)}`, esc(l.warranty || '—'), esc(quotationPrice(l.price)), esc(l.qty), esc(m2fmt(storedTotals ? l.total : l.qty * l.price))]),
    words: Number(pricing.total) || 0,
    totals: [['TOTAL', esc(m2fmt(sub))], ['Discount', esc(m2fmt(discount || 0))], ['Grand TOTAL', esc(m2fmt(pricing.total)), true]],
    foot: `${note ? `<div class="bfootnote"><b>Notes:</b> ${esc(note)}</div>` : ''}<div class="bfootnote">Prices may change with market rates after the validity period. Stock is not reserved until an order is confirmed.</div>`
  })]);
  return printDocs([`${docOpen()}${docHead('QUOTATION', `<b>${esc(no)}</b><br>${esc(fdate(quoteDate || today()))}`)}
    <div class="meta">
      <div class="box"><b class="t">Prepared for</b><b>${esc(customer || '—')}</b><div>Phone: ${esc(phone || '—')}</div></div>
      <div class="box"><b class="t">Subject</b><b>${esc(title || 'Custom PC build')}</b><div>Valid for: ${esc(valid)}</div></div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Item</th><th class="r" style="width:80px">Warranty</th><th class="r" style="width:56px">Qty</th><th class="r" style="width:90px">Unit price</th><th class="r" style="width:96px">Amount</th></tr></thead><tbody>${rows}</tbody>
    <tfoot class="qtot">${totals.map(([k, v, g]) => `<tr class="${g ? 'big' : ''}"><td colspan="5" class="r">${k}</td><td class="r">${v}</td></tr>`).join('')}</tfoot></table>
    ${notes}
    <div class="foot"><span>Printed ${esc(new Date().toLocaleString())}</span><span>Authorised signature: ____________________</span></div></div>`]);
}

/** Customer / supplier ledger statement on A4, in the invoice template (Settings → Invoice). */
export function printStatement(kind, st, from, to) { return printParties(kind, [st], { from, to }); }

/** Small money receipt for due collection. */
export function printMoneyReceipt(r) {
  const s = useStore.getState().settings;
  const w = Number(s.receipt_width || 80), paper = w === 58 ? 48 : 72;
  printHtml(`<style>@page{size:${w}mm auto;margin:0}body{margin:0;width:${paper}mm;padding:3mm ${(w - paper) / 2}mm;font:11px/1.4 'Courier New','Hind Siliguri',monospace}.c{text-align:center}hr{border:0;border-top:1px dashed #000}</style>
  ${shopHead(s)}<hr><div class="c"><b>MONEY RECEIPT</b></div><div>No: ${esc(r.receipt_no)}</div><div>Date: ${esc(r.date || r.entry?.date ? fdate(r.date || r.entry.date) : '—')}</div>
  <div>Received from: <b>${esc(r.customer)}</b></div><div>Amount: <b>${esc(money(r.amount))}</b></div><div>Via: ${esc(r.account)}</div><hr>
  <div>Remaining balance: <b>${esc(money(r.balance))}</b></div><hr><div class="c">${esc(s.shop_footer || '')}</div>`);
}

/** A separate collection document; each CP number remains in the customer ledger. */
export function printPreviousDueReceipt(payment) {
  const receipts = payment.receipts || [];
  if (!receipts.length) throw new Error('Due payment receipt is missing');
  printMoneyReceipt({receipt_no:receipts.map(r=>r.receipt_no).join(', '),date:receipts[0].date || receipts[0].entry?.date,customer:receipts[0].customer,amount:payment.amount,account:receipts.map(r=>r.account+' '+money(r.amount)).join(' + '),balance:receipts.at(-1).balance});
}
