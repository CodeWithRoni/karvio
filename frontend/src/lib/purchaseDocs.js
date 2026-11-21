// Purchase invoices as full documents: print, PDF (one invoice per A4 page) and Excel.
import { money, qty, fdate, fdatetime, splitList } from './format';
import { esc } from './export';
import { bizDocHtml, isBizTpl, docOpen, docHead, docWrap, printDocs, pdfDocs, m2fmt } from './salesDocs';

const pays = (p) => { try { return Array.isArray(p.payments) ? p.payments : JSON.parse(p.payments || '[]'); } catch { return []; } };

export function purchaseInvoiceHtml(d) {
  const p = d.purchase, sup = d.supplier || {};
  const rows = d.items.map((i, n) => {
    const sers = splitList(String(i.serials || '').replace(/\n/g, ','));
    return `<tr><td>${n + 1}</td><td><b>${esc(i.name)}</b>${i.sku ? `<div class="sm">Model: ${esc(i.sku)}</div>` : ''}${i.description ? `<div class="sm">${esc(i.description)}</div>` : ''}${sers.length ? `<div class="sn">S/N (${sers.length}): ${esc(sers.join(', '))}</div>` : ''}</td>
      <td>${esc(i.unit || 'pcs')}</td><td class="r">${esc(qty(i.qty))}</td><td class="r">${esc(money(i.cost, false))}</td><td class="r">${esc(money(i.total, false))}</td></tr>`;
  }).join('');
  const pl = pays(p);
  if (isBizTpl()) return bizDocHtml({
    title: 'Purchase Invoice',
    left: [['Supplier', `<b>${esc(sup.name || p.supplier_name || '—')}</b>`], ['Address', esc(sup.address || '')], ['Contact No', esc(splitList(sup.phones || '').join(', '))], ['Supplier Invoice', esc(p.supplier_invoice || '')]],
    right: [['Purchase No', `<b>${esc(p.invoice_no)}</b>`], ['Date', esc(fdate(p.date))], ['Entered By', esc(p.user || '')], ['Payment', pl.length ? pl.map((x) => `${esc(x.account_name || 'Paid')} ${esc(m2fmt(x.amount))}`).join(', ') : 'Bought on credit']],
    cancelled: p.status === 'cancelled' ? p.cancel_reason || '' : null,
    cols: [{ label: 'S/L', w: 38, cls: 'cn' }, { label: 'Item Descriptions' }, { label: 'Unit', w: 56, cls: 'cn' }, { label: 'Quantity', w: 72, cls: 'cn' }, { label: 'Purchase Price', w: 96, cls: 'r' }, { label: 'Total', w: 100, cls: 'r' }],
    rows: d.items.map((i, n) => {
      const sers = splitList(String(i.serials || '').replace(/\n/g, ','));
      return [n + 1, `${esc(i.name)}${i.sku ? `<div class="sn">Model: ${esc(i.sku)}</div>` : ''}${i.description ? `<div class="sn">${esc(i.description)}</div>` : ''}${sers.length ? `<div class="sn">S/N (${sers.length}): ${esc(sers.join(', '))}</div>` : ''}`, esc(i.unit || 'pcs'), esc(qty(i.qty)), esc(m2fmt(i.cost)), esc(m2fmt(i.total))];
    }),
    words: Number(p.total) || 0,
    due: [['Paid', esc(m2fmt(p.paid))], ['Due at Purchase', esc(m2fmt(p.due))], ['Due Now', esc(m2fmt(p.due_now ?? p.due))]],
    totals: [['TOTAL', esc(m2fmt(p.subtotal))], ['Discount', esc(m2fmt(p.discount || 0))], ['Grand TOTAL', esc(m2fmt(p.total)), true]],
    foot: `${p.note ? `<div class="bfootnote"><b>Note:</b> ${esc(p.note)}</div>` : ''}${d.returns && d.returns.length ? `<div class="bfootnote">Returns: ${esc(d.returns.map((r) => `${r.return_no} (${money(r.total, false)}, ${r.status})`).join(', '))}</div>` : ''}`,
    sign: 'Received By'
  });
  return `${docOpen()}${docHead('PURCHASE INVOICE', `<b>${esc(p.invoice_no)}</b><br>${p.supplier_invoice ? `Supplier invoice: <b>${esc(p.supplier_invoice)}</b><br>` : ''}Date: ${esc(fdate(p.date))}<br><span class="sm">Entered ${esc(fdatetime(p.created_at))} by ${esc(p.user || '')}</span>`)}
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
      <tr><td><b>Due at purchase</b></td><td class="r"><b>${esc(money(p.due))}</b></td></tr>
      <tr><td><b>Due now</b></td><td class="r"><b>${esc(money(p.due_now ?? p.due))}</b></td></tr>
    </table>
    ${d.returns && d.returns.length ? `<p class="sm">Returns: ${esc(d.returns.map((r) => `${r.return_no} (${money(r.total, false)}, ${r.status})`).join(', '))}</p>` : ''}
    <div class="foot"><span>Printed ${esc(new Date().toLocaleString())}</span><span>Received by: ____________________</span></div>
  </div>`;
}

export const printPurchases = (list) => printDocs(list.map(purchaseInvoiceHtml));
/** One purchase invoice as the full document printPurchases prints. */
export const purchaseDocHtml = (d) => docWrap([purchaseInvoiceHtml(d)]);

/** A purchase return (goods sent back to the supplier). d = { ret, items, supplier } from history.doc (type preturn) */
export function purchaseReturnHtml(d) {
  const r = d.ret, sup = d.supplier || {};
  const rows = d.items.map((i, n) => {
    const sers = splitList(String(i.serials || '').replace(/\n/g, ','));
    return `<tr><td>${n + 1}</td><td><b>${esc(i.name)}</b>${sers.length ? `<div class="sn">S/N (${sers.length}): ${esc(sers.join(', '))}</div>` : ''}</td>
      <td class="r">${esc(qty(i.qty))}</td><td class="r">${esc(money(i.cost, false))}</td><td class="r">${esc(money(i.total, false))}</td></tr>`;
  }).join('');
  const adjusted = Number(r.total) - Number(r.received || 0);
  if (isBizTpl()) return bizDocHtml({
    title: 'Purchase Return',
    left: [['Returned To', `<b>${esc(sup.name || r.supplier_name || '—')}</b>`], ['Address', esc(sup.address || '')], ['Contact No', esc(splitList(sup.phones || '').join(', '))], ['Original Purchase', esc(r.invoice_no || '')]],
    right: [['Return No', `<b>${esc(r.return_no)}</b>`], ['Date', esc(fdate(r.date))], ['Entered By', esc(r.user || '')]],
    cancelled: r.status === 'cancelled' ? r.cancel_reason || '' : null,
    cols: [{ label: 'S/L', w: 38, cls: 'cn' }, { label: 'Item Descriptions' }, { label: 'Quantity', w: 72, cls: 'cn' }, { label: 'Purchase Price', w: 96, cls: 'r' }, { label: 'Total', w: 100, cls: 'r' }],
    rows: d.items.map((i, n) => {
      const sers = splitList(String(i.serials || '').replace(/\n/g, ','));
      return [n + 1, `${esc(i.name)}${sers.length ? `<div class="sn">S/N (${sers.length}): ${esc(sers.join(', '))}</div>` : ''}`, esc(qty(i.qty)), esc(m2fmt(i.cost)), esc(m2fmt(i.total))];
    }),
    words: Number(r.total) || 0,
    totals: [['Return Value', esc(m2fmt(r.total)), true], [`Received${r.account ? ` (${r.account})` : ''}`, esc(m2fmt(r.received || 0))], ...(adjusted > 0.004 ? [['Adjusted to Balance', esc(m2fmt(adjusted))]] : [])],
    foot: r.note ? `<div class="bfootnote"><b>Note:</b> ${esc(r.note)}</div>` : '',
    sign: 'Authorised Signature'
  });
  return `${docOpen()}${docHead('PURCHASE RETURN', `<b>${esc(r.return_no)}</b><br>Date: ${esc(fdate(r.date))}<br><span class="sm">Entered ${esc(fdatetime(r.created_at))} by ${esc(r.user || '')}</span>`)}
    ${r.status === 'cancelled' ? `<div class="cx">CANCELLED — ${esc(r.cancel_reason || '')}</div>` : ''}
    <div class="meta">
      <div class="box"><b class="t">Returned to supplier</b><b>${esc(sup.name || r.supplier_name || '—')}</b>${sup.phones ? `<div>Phone: ${esc(splitList(sup.phones).join(', '))}</div>` : ''}${sup.address ? `<div>${esc(sup.address)}</div>` : ''}</div>
      <div class="box"><b class="t">Original purchase</b><b>${esc(r.invoice_no || '—')}</b>${r.note ? `<div class="sm">Note: ${esc(r.note)}</div>` : ''}</div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Product / serial numbers</th><th class="r" style="width:60px">Qty</th><th class="r" style="width:92px">Purchase price</th><th class="r" style="width:96px">Value</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="tot">
      <tr class="g"><td>Return value</td><td class="r">${esc(money(r.total))}</td></tr>
      <tr><td>Received from supplier${r.account ? ` (${esc(r.account)})` : ''}</td><td class="r">${esc(money(r.received || 0, false))}</td></tr>
      ${adjusted > 0.004 ? `<tr><td>Adjusted to supplier balance</td><td class="r">${esc(money(adjusted, false))}</td></tr>` : ''}
    </table>
    <div class="foot"><span>Printed ${esc(new Date().toLocaleString())}</span><span>Received by: ____________________</span></div>
  </div>`;
}
export const purchaseReturnDocHtml = (d) => docWrap([purchaseReturnHtml(d)]);
/** Several purchase returns, each on its own page (Reports hub → Individual report). */
export const printPurchaseReturns = (list) => printDocs(list.map(purchaseReturnHtml));

export { pdfPages } from './pdfPages';
export const pdfPurchases = (list, filename) => pdfDocs(list.map(purchaseInvoiceHtml), filename);
export const pdfPurchaseReturns = (list, filename) => pdfDocs(list.map(purchaseReturnHtml), filename);

/** Sheet 1: one line per invoice. Sheet 2: every product line with supplier details and serial numbers. */
export async function excelPurchases(list, filename) {
  const XLSX = await import('xlsx');
  const inv = [['Purchase #', 'Supplier invoice', 'Date', 'Status', 'Supplier', 'Phone', 'Address', 'Subtotal', 'Discount', 'Total', 'Paid', 'Due at purchase', 'Due now', 'Payment', 'Note', 'Entered by']];
  const lines = [['Purchase #', 'Supplier invoice', 'Date', 'Supplier', 'Phone', 'Address', 'Product', 'Model', 'Description', 'Unit', 'Qty', 'Purchase price', 'Amount', 'Serial numbers']];
  list.forEach((d) => {
    const p = d.purchase, s = d.supplier || {}, phone = splitList(s.phones || '').join(', ');
    inv.push([p.invoice_no, p.supplier_invoice || '', String(p.date).slice(0, 10), p.status, s.name || p.supplier_name || '', phone, s.address || '', p.subtotal, p.discount, p.total, p.paid, p.due, p.due_now ?? p.due,
      pays(p).map((x) => `${x.account_name || ''} ${x.amount}`).join('; '), p.note || '', p.user || '']);
    d.items.forEach((i) => lines.push([p.invoice_no, p.supplier_invoice || '', String(p.date).slice(0, 10), s.name || p.supplier_name || '', phone, s.address || '', i.name, i.sku || '', i.description || '',
      i.unit || 'pcs', i.qty, i.cost, i.total, splitList(String(i.serials || '').replace(/\n/g, ',')).join(', ')]));
  });
  const wb = XLSX.utils.book_new();
  const a = XLSX.utils.aoa_to_sheet(inv); a['!cols'] = inv[0].map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const b = XLSX.utils.aoa_to_sheet(lines); b['!cols'] = lines[0].map((h, i) => ({ wch: [6, 8, 13].includes(i) ? 34 : Math.max(12, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, a, 'Invoices');
  XLSX.utils.book_append_sheet(wb, b, 'Items & serials');
  XLSX.writeFile(wb, filename);
}
