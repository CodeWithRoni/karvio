// QR codes for printed invoices and receipts (vendored MIT library, no network needed).
import qrcode from './vendor/qrcode.mjs';

/** An <svg> QR code for `text`, drawn with square cells (crisp on thermal and laser printers). */
export function qrSvg(text, cell = 3) {
  const q = qrcode(0, 'M');
  q.addData(String(text));
  q.make();
  return q.createSvgTag({ cellSize: cell, margin: 0, scalable: true });
}

/** QR block shown on invoices: the invoice number, which the shop's scanner finds in Advanced search. */
export function invoiceQr(invoiceNo, settings = {}) {
  if (!invoiceNo || String(settings.invoice_qr ?? 'true') === 'false') return '';
  return `<div class="inv-qr"><div class="inv-qr-code">${qrSvg(invoiceNo)}</div><div><b>${escQr(invoiceNo)}</b><br>Scan this code at the shop to find your invoice quickly — for warranty, service or returns.</div></div>`;
}
const escQr = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Shop logo as an <img> for documents (empty when no logo is set). */
export function logoImg(settings = {}, cls = 'doc-logo') {
  const src = String(settings.shop_logo || '');
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src) ? `<img class="${cls}" src="${src}" alt="">` : '';
}
