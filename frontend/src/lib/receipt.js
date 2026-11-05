// Thermal receipts (58mm / 80mm), A4 quotation and ledger statements.
import { useStore } from './store';
import { money, qty, fdate, fdatetime, splitList } from './format';
import { printHtml, esc } from './export';

function shopHead(s) {
  return `<div class="c"><b class="shop">${esc(s.shop_name || 'ShopERP')}</b>
    ${s.shop_address ? `<div>${esc(s.shop_address)}</div>` : ''}
    ${s.shop_phone ? `<div>${esc(s.shop_phone)}</div>` : ''}</div>`;
}

/** detail = response of sale.detail / sale.create  ({sale, items, customer}) */
export function printReceipt(detail, widthOverride) {
  const s = useStore.getState().settings;
  const w = Number(widthOverride || s.receipt_width || 80);
  const paper = w === 58 ? 48 : 72; // printable width in mm
  const fs = w === 58 ? 10 : 11.5;
  const { sale, items, customer } = detail;
  const pays = Array.isArray(sale.payments) ? sale.payments : safeJson(sale.payments, []);
  const lines = items.map((i) => {
    const sers = splitList(i.serials);
    return `<tr><td colspan="3" class="nm">${esc(i.name)}</td></tr>
      <tr><td>${esc(qty(i.qty, i.unit))} × ${esc(money(i.price, false))}</td><td></td><td class="r">${esc(money(i.total, false))}</td></tr>
      ${sers.length ? `<tr><td colspan="3" class="sm">S/N: ${esc(sers.join(', '))}</td></tr>` : ''}
      ${i.warranty_expiry ? `<tr><td colspan="3" class="sm">Warranty: ${esc(i.warranty_days)} days (till ${esc(fdate(i.warranty_expiry))})${i.warranty_type === 'invoice' ? ' — keep this receipt' : ''}</td></tr>` : ''}`;
  }).join('');
  printHtml(`
  <style>
    @page{size:${w}mm auto;margin:0}
    body{margin:0;font:${fs}px/1.35 'Courier New','Hind Siliguri',ui-monospace,monospace;color:#000;width:${paper}mm;padding:3mm ${(w - paper) / 2}mm}
    .c{text-align:center}.shop{font-size:${fs + 4}px}.r{text-align:right}.sm{font-size:${fs - 2}px}.nm{padding-top:4px;font-weight:700}
    table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:0}
    hr{border:0;border-top:1px dashed #000;margin:5px 0}.tot td{font-weight:700;font-size:${fs + 1}px}
  </style>
  ${shopHead(s)}
  <hr>
  <div>Invoice: <b>${esc(sale.invoice_no)}</b></div>
  <div>Date: ${esc(fdatetime(sale.created_at || sale.date))}</div>
  <div>Customer: ${esc(sale.customer_name)}${customer && customer.phones ? ' (' + esc(splitList(customer.phones)[0]) + ')' : ''}</div>
  <div>Served by: ${esc(sale.user_name || '')}</div>
  ${sale.status === 'cancelled' ? '<div class="c"><b>*** CANCELLED ***</b></div>' : ''}
  <hr>
  <table>${lines}</table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td class="r">${esc(money(sale.subtotal, false))}</td></tr>
    ${sale.discount ? `<tr><td>Discount</td><td class="r">-${esc(money(sale.discount, false))}</td></tr>` : ''}
    <tr class="tot"><td>TOTAL</td><td class="r">${esc(money(sale.total))}</td></tr>
    ${pays.map((p) => `<tr><td>Paid (${esc(p.account_name)})</td><td class="r">${esc(money(p.amount, false))}</td></tr>`).join('')}
    ${sale.credit_used ? `<tr><td>Paid (advance)</td><td class="r">${esc(money(sale.credit_used, false))}</td></tr>` : ''}
    ${sale.due > 0 ? `<tr class="tot"><td>DUE</td><td class="r">${esc(money(sale.due))}</td></tr>` : ''}
    ${customer && customer.balance !== undefined ? `<tr><td>Total balance due</td><td class="r">${esc(money(customer.balance, false))}</td></tr>` : ''}
  </table>
  <hr>
  <div class="c">${esc(s.shop_footer || 'Thank you!')}</div>
  <div class="c sm">Goods sold are subject to warranty terms.</div>`);
}

function safeJson(s, d) { try { return JSON.parse(s); } catch { return d; } }

/** A4 quotation for the PC builder. lines = [{name, qty, price, warranty}] */
export function printQuotation({ title, customer, phone, lines, discount = 0, note = '', validDays = 7 }) {
  const s = useStore.getState().settings;
  const sub = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const no = 'Q-' + Date.now().toString().slice(-7);
  const rows = lines.map((l, i) => `<tr><td>${i + 1}</td><td><b>${esc(l.group || '')}</b>${l.group ? '<br>' : ''}${esc(l.name)}</td><td class="r">${esc(l.warranty || '—')}</td><td class="r">${esc(l.qty)}</td><td class="r">${esc(money(l.price, false))}</td><td class="r">${esc(money(l.qty * l.price, false))}</td></tr>`).join('');
  printHtml(`
  <style>
    @page{size:A4;margin:14mm}body{font:12px/1.45 system-ui,'Hind Siliguri',sans-serif;color:#111;margin:0}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d1b2a;padding-bottom:10px;margin-bottom:14px}
    h1{margin:0;font-size:22px}h2{margin:0;font-size:26px;letter-spacing:.04em;color:#0d1b2a}
    table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:7px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
    th{background:#0d1b2a;color:#fff;font-weight:600}.r{text-align:right}.tot td{font-weight:700;border:0}.big{font-size:16px}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}.note{margin-top:18px;color:#444}
  </style>
  <div class="top"><div><h1>${esc(s.shop_name || 'ShopERP')}</h1><div>${esc(s.shop_address || '')}</div><div>${esc(s.shop_phone || '')}</div></div>
  <div class="r"><h2>QUOTATION</h2><div>${esc(no)}</div><div>${esc(fdate(new Date().toISOString()))}</div></div></div>
  <div class="meta"><div><b>Prepared for:</b> ${esc(customer || '—')}</div><div><b>Phone:</b> ${esc(phone || '—')}</div>
  <div><b>Subject:</b> ${esc(title || 'Custom PC build')}</div><div><b>Valid for:</b> ${esc(validDays)} days</div></div>
  <table><thead><tr><th>#</th><th>Item</th><th class="r">Warranty</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr class="tot"><td colspan="5" class="r">Subtotal</td><td class="r">${esc(money(sub))}</td></tr>
    ${discount ? `<tr class="tot"><td colspan="5" class="r">Discount</td><td class="r">-${esc(money(discount))}</td></tr>` : ''}
    <tr class="tot big"><td colspan="5" class="r">Grand total</td><td class="r">${esc(money(sub - discount))}</td></tr>
  </tfoot></table>
  ${note ? `<div class="note"><b>Notes:</b> ${esc(note)}</div>` : ''}
  <div class="note">Prices may change with market rates after the validity period. Stock is not reserved until an order is confirmed.</div>`);
}

/** Customer / supplier ledger statement on A4. */
export function printStatement(kind, st, from, to) {
  const s = useStore.getState().settings;
  const rows = st.rows.map((r) => `<tr><td>${esc(fdate(r.date))}</td><td>${esc(r.ref_no || '')}</td><td>${esc(r.note || r.type)}</td><td class="r">${r.debit ? esc(money(r.debit, false)) : ''}</td><td class="r">${r.credit ? esc(money(r.credit, false)) : ''}</td><td class="r">${esc(money(r.balance, false))}</td></tr>`).join('');
  const dl = kind === 'customer' ? ['Sale / paid out', 'Received'] : ['Paid / returned', 'Purchased'];
  printHtml(`
  <style>@page{size:A4;margin:14mm}body{font:11.5px/1.45 system-ui,'Hind Siliguri',sans-serif;color:#111;margin:0}
  h1{margin:0;font-size:18px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left}
  th{background:#eef1f6}.r{text-align:right}.b{font-weight:700}</style>
  <h1>${esc(s.shop_name || 'ShopERP')}</h1><div>${esc(s.shop_address || '')} ${esc(s.shop_phone || '')}</div>
  <h3 style="margin:14px 0 4px">${kind === 'customer' ? 'Customer' : 'Supplier'} statement — ${esc(st.party)}</h3>
  <div>${esc(st.phones || '')} ${esc(st.address || '')}</div>
  <div>Period: ${esc(from ? fdate(from) : 'Beginning')} to ${esc(to ? fdate(to) : 'Today')}</div>
  <table><thead><tr><th>Date</th><th>Ref</th><th>Details</th><th class="r">${dl[0]}</th><th class="r">${dl[1]}</th><th class="r">Balance</th></tr></thead>
  <tbody><tr><td colspan="5" class="b">Opening balance</td><td class="r b">${esc(money(st.opening, false))}</td></tr>${rows}
  <tr><td colspan="5" class="b">Closing balance ${st.closing > 0 ? (kind === 'customer' ? '(customer owes)' : '(payable to supplier)') : st.closing < 0 ? '(advance)' : ''}</td><td class="r b">${esc(money(st.closing))}</td></tr></tbody></table>`);
}

/** Small money receipt for due collection. */
export function printMoneyReceipt(r) {
  const s = useStore.getState().settings;
  const w = Number(s.receipt_width || 80), paper = w === 58 ? 48 : 72;
  printHtml(`<style>@page{size:${w}mm auto;margin:0}body{margin:0;width:${paper}mm;padding:3mm ${(w - paper) / 2}mm;font:11px/1.4 'Courier New','Hind Siliguri',monospace}.c{text-align:center}hr{border:0;border-top:1px dashed #000}</style>
  ${shopHead(s)}<hr><div class="c"><b>MONEY RECEIPT</b></div><div>No: ${esc(r.receipt_no)}</div><div>Date: ${esc(new Date().toLocaleString())}</div>
  <div>Received from: <b>${esc(r.customer)}</b></div><div>Amount: <b>${esc(money(r.amount))}</b></div><div>Via: ${esc(r.account)}</div><hr>
  <div>Remaining balance: <b>${esc(money(r.balance))}</b></div><hr><div class="c">${esc(s.shop_footer || '')}</div>`);
}
