// Customer / Supplier Ledger Report on paper: print, PDF (A4) and Excel, plus the WhatsApp summary.
// On screen the report is shown in the app's own style; this paper look is only for printing and PDF.
import { useStore } from './store';
import { money, fdate, splitList, today } from './format';
import { printHtml, esc, shopContacts } from './export';
import { pdfPages } from './purchaseDocs';

export const LEDGER_TXT = {
  customer: { who: 'Customer', title: 'CUSTOMER LEDGER STATEMENT', list: 'CUSTOMER LEDGER SUMMARY', sales: 'Sales', paid: 'Collected', owes: 'customer owes', adv: 'advance', sign: 'Customer signature', invoices: 'Invoices', closing: 'Closing (owes)' },
  supplier: { who: 'Supplier', title: 'SUPPLIER LEDGER STATEMENT', list: 'SUPPLIER LEDGER SUMMARY', sales: 'Purchases', paid: 'Paid', owes: 'we owe', adv: 'advance paid', sign: 'Supplier signature', invoices: 'Purchases', closing: 'Closing (we owe)' }
};
export const ENTRY_TAG = { sale: ['SALE', 's'], purchase: ['PURCHASE', 's'], payment: ['PAYMENT', 'c'], refund: ['REFUND', 'r'], sreturn: ['RETURN', 'r'], preturn: ['RETURN', 'r'], adjust: ['ADJUST', 'a'], rebate: ['ADJUST', 'a'] };
export const tagOf = (kind, type) => (kind === 'customer' && type === 'payment' ? ['COLLECTION', 'c'] : ENTRY_TAG[type] || [String(type || '').toUpperCase(), 'c']);
export const balText = (kind, v) => (v > 0.004 ? `${money(v, false)} · ${LEDGER_TXT[kind].owes}` : v < -0.004 ? `${money(-v, false)} · ${LEDGER_TXT[kind].adv}` : '0');
export const periodText = (from, to) => (from || to ? `${from ? fdate(from) : 'Start'} – ${to ? fdate(to) : fdate(today())}` : 'All time');
const n = (v) => money(v, false);
const addr = (a) => String(a || '').split('|').map((x) => x.trim()).filter(Boolean).join('; ');

/** What a ledger row says, in words (the type tag is drawn separately). */
export function rowText(kind, r) {
  if (r.adjust) return `${r.adjust.dir === 'add' ? 'Addition' : 'Deduction'} · ${r.adjust.type_label}${r.adjust.invoice_no ? ` · ${r.adjust.invoice_no}` : ''}`;
  if (r.type === 'sale') return `Sale invoice${r.by ? ` · sold by ${r.by}` : ''}${r.credit > 0 ? ` · paid at the counter ${n(r.credit)}` : ''}${r.next_payment_date && r.due_now > 0 ? ` · next payment promised ${fdate(r.next_payment_date)}` : ''}`;
  if (r.type === 'purchase') return `Purchase${r.supplier_invoice ? ` · supplier invoice ${r.supplier_invoice}` : ''}${r.debit > 0 ? ` · paid ${n(r.debit)}` : ''}`;
  const acc = r.accounts?.length ? r.accounts.join(', ') : '';
  const note = String(r.note || '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  return [note, acc].filter(Boolean).join(' · ') || (r.type === 'payment' ? 'Payment' : r.type);
}
export const subText = (r) => (r.adjust ? `Reason: ${r.adjust.reason}${r.adjust.reference ? ` · Ref: ${r.adjust.reference}` : ''}${r.adjust.by ? ` · by ${r.adjust.by}` : ''}` : '');

export const LEDGER_CSS = `
.lr-doc{font:12px/1.45 'Manrope','Hind Siliguri',system-ui,sans-serif;color:#1f2937;background:#fff}
.lr-doc *{box-sizing:border-box}
.lr-top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111827;padding-bottom:10px;gap:20px}
.lr-shop b{font-size:19px;color:#111827}.lr-shop div{color:#4b5563}
.lr-title{text-align:right}.lr-title h2{margin:0;font-size:16px;letter-spacing:.06em;color:#111827}.lr-title div{color:#4b5563}
.lr-party{display:grid;grid-template-columns:1.4fr 1fr;gap:16px;margin:12px 0;padding:9px 12px;background:#f3f4f6;border-radius:6px}
.lr-party small{display:block;color:#6b7280;text-transform:uppercase;font-size:10px;letter-spacing:.05em;font-weight:700}
.lr-party b{font-size:13.5px;color:#111827}
.lr-doc table{width:100%;border-collapse:collapse}
.lr-doc th{background:#111827;color:#fff;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;padding:6px 7px;text-align:left}
.lr-doc td{padding:5px 7px;border-bottom:1px solid #e5e7eb;vertical-align:top}
.lr-doc .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.lr-doc tr.op td,.lr-doc tr.tot td{background:#f9fafb;font-weight:700}
.lr-doc tr.tot td{border-top:2px solid #111827}
.lr-doc tr.it td{background:#fbfbfd;border-bottom:0;padding:1px 7px;color:#4b5563;font-size:11px}
.lr-doc tr.it td:first-child{padding-left:22px}
.lr-doc tr.it.last td{border-bottom:1px solid #e5e7eb;padding-bottom:5px}
.lr-doc .tg{display:inline-block;font-size:9.5px;font-weight:700;padding:1px 5px;border-radius:4px;margin-right:6px}
.tg.s{background:#dbeafe;color:#1d4ed8}.tg.c{background:#dcfce7;color:#15803d}.tg.r{background:#fee2e2;color:#b91c1c}.tg.a{background:#ffedd5;color:#c2410c}
.lr-doc .sub{color:#6b7280;font-size:10.5px}
.lr-bottom{display:grid;grid-template-columns:1.3fr 1fr;gap:20px;margin-top:14px}
.lr-age{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;text-align:center}
.lr-age div{padding:6px 4px;border-right:1px solid #e5e7eb}.lr-age div:last-child{border-right:0}
.lr-age small{display:block;color:#6b7280;font-size:10px}.lr-age b{font-size:12.5px}
.lr-sum div{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #e5e7eb}
.lr-sum div.big{border:0;border-top:2px solid #111827;margin-top:4px;padding-top:6px;font-size:14px;font-weight:800}
.lr-sign{display:flex;justify-content:space-between;margin-top:40px;color:#6b7280}.lr-sign span{border-top:1px solid #9ca3af;padding-top:4px;width:170px;text-align:center}
.lr-foot{margin-top:12px;text-align:center;color:#9ca3af;font-size:10px}
`;

function head(kind, d, title) {
  const s = useStore.getState().settings;
  return `<div class="lr-top">
    <div class="lr-shop"><b>${esc(s.shop_name || 'Karvio')}</b><div>${esc(s.shop_address || '')}</div><div>${shopContacts(s)}</div></div>
    <div class="lr-title"><h2>${title}</h2><div>Statement date: ${esc(fdate(today()))}<br>Period: ${esc(periodText(d.from, d.to))}</div></div>
  </div>`;
}
const foot = (sign) => `<div class="lr-sign"><span>${sign}</span><span>Authorised signature</span></div><div class="lr-foot">Printed from Karvio · ${esc(new Date().toLocaleString())}</div>`;

/** One party's statement on paper. `opt.items` / `opt.serials` follow the on-screen ticks. */
export function statementPaper(kind, d, opt = {}) {
  const L = LEDGER_TXT[kind], p = d.party, t = d.totals;
  const body = d.rows.map((r) => {
    const [tag, c] = tagOf(kind, r.type), sub = subText(r);
    let h = `<tr><td>${esc(fdate(r.date))}</td><td>${esc(r.ref_no || '')}</td><td><span class="tg ${c}">${tag}</span>${esc(rowText(kind, r))}${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</td><td class="r">${r.debit ? n(r.debit) : ''}</td><td class="r">${r.credit ? n(r.credit) : ''}</td><td class="r">${n(r.balance)}</td></tr>`;
    if (opt.items !== false && r.items?.length) {
      const lines = r.items.map((i) => [`${i.name}${opt.serials !== false && i.serials?.length ? ` · SN ${i.serials.join(', ')}` : ''}`, `${i.qty} × ${n(i.price)}`, n(i.total)]);
      if (r.discount > 0) lines.push(['Discount', '', `− ${n(r.discount)}`]);
      h += lines.map((x, i) => `<tr class="it${i === lines.length - 1 ? ' last' : ''}"><td colspan="3">${esc(x[0])}</td><td class="r" colspan="2">${esc(x[1])}</td><td class="r">${esc(x[2])}</td></tr>`).join('');
    }
    return h;
  }).join('');
  const deb = d.rows.reduce((a, r) => a + r.debit, 0), cre = d.rows.reduce((a, r) => a + r.credit, 0);
  const b = d.aging.buckets;
  return `<div class="lr-doc">${head(kind, d, L.title)}
    <div class="lr-party"><div><small>${L.who}</small><b>${esc(p.name)}</b><div>${esc([splitList(p.phones || '').join(', '), addr(p.address)].filter(Boolean).join(' · '))}</div></div>
      <div><small>Balance on ${esc(fdate(today()))}</small><b style="color:#b45309">${esc(balText(kind, p.balance))}</b>${p.last_payment ? `<div>Last payment: ${esc(fdate(p.last_payment.date))} · ${n(p.last_payment.amount)}</div>` : ''}</div></div>
    <table><thead><tr><th style="width:12%">Date</th><th style="width:12%">Voucher</th><th>Particulars</th><th class="r" style="width:11%">Debit</th><th class="r" style="width:11%">Credit</th><th class="r" style="width:12%">Balance</th></tr></thead>
    <tbody><tr class="op"><td>${d.from ? esc(fdate(d.from)) : ''}</td><td></td><td>Opening balance</td><td></td><td></td><td class="r">${n(t.opening)}</td></tr>${body || '<tr><td colspan="6">No entries in this period</td></tr>'}
    <tr class="tot"><td colspan="3">Totals for the period</td><td class="r">${n(deb)}</td><td class="r">${n(cre)}</td><td class="r">${n(t.closing)}</td></tr></tbody></table>
    <div class="lr-bottom">
      <div><b style="display:block;margin-bottom:6px">Due by age</b><div class="lr-age"><div><small>0–30 days</small><b>${n(b.d30)}</b></div><div><small>31–60</small><b>${n(b.d60)}</b></div><div><small>61–90</small><b>${n(b.d90)}</b></div><div><small>90+</small><b>${n(b.over90)}</b></div><div><small>Total due</small><b>${n(b.d30 + b.d60 + b.d90 + b.over90 + d.aging.other)}</b></div></div>
        <div class="sub" style="margin-top:6px">${d.aging.invoices.length ? `${L.invoices} with due: ${esc(d.aging.invoices.map((i) => `${i.invoice_no} (${n(i.due)})`).join(', '))}` : `No ${L.invoices.toLowerCase()} with due`}${d.aging.other > 0.004 ? ` · Not tied to an invoice: ${n(d.aging.other)}` : ''}</div></div>
      <div class="lr-sum"><div><span>Opening balance</span><b>${n(t.opening)}</b></div><div><span>+ ${L.sales}</span><b>${n(t.sales)}</b></div><div><span>− Returns</span><b>${n(t.returns)}</b></div><div><span>− ${L.paid}</span><b>${n(t.paid)}</b></div><div><span>${t.adjusted < 0 ? '+ Added' : '− Adjusted'}</span><b>${n(Math.abs(t.adjusted))}</b></div><div class="big"><span>Closing balance</span><span>${n(t.closing)}</span></div></div>
    </div>${foot(L.sign)}</div>`;
}

/** Every party in the period on paper. */
export function listPaper(kind, d, rows) {
  const L = LEDGER_TXT[kind], t = d.totals;
  const body = rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.phone || '')}</td><td class="r">${n(r.opening)}</td><td class="r">${n(r.sales)}</td><td class="r">${n(r.paid + r.returns)}</td><td class="r">${n(r.adjusted)}</td><td class="r">${n(r.closing)}</td><td class="r">${r.oldest_days == null ? '—' : r.oldest_days + ' days'}</td></tr>`).join('');
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  return `<div class="lr-doc">${head(kind, d, L.list)}
    <table style="margin-top:12px"><thead><tr><th>${L.who}</th><th>Phone</th><th class="r">Opening</th><th class="r">${L.sales}</th><th class="r">${L.paid} + returns</th><th class="r">Adjusted</th><th class="r">${L.closing}</th><th class="r">Oldest due</th></tr></thead>
    <tbody>${body || '<tr><td colspan="8">Nothing to show</td></tr>'}<tr class="tot"><td colspan="2">Total · ${rows.length}</td><td class="r">${n(sum((r) => r.opening))}</td><td class="r">${n(sum((r) => r.sales))}</td><td class="r">${n(sum((r) => r.paid + r.returns))}</td><td class="r">${n(sum((r) => r.adjusted))}</td><td class="r">${n(sum((r) => r.closing))}</td><td></td></tr></tbody></table>
    ${rows.length === d.rows.length ? '' : `<div class="lr-foot" style="text-align:left">Shown ${rows.length} of ${d.rows.length} (filters on). All ${d.rows.length} together: closing ${n(t.closing)}.</div>`}
    <div class="lr-foot">Printed from Karvio · ${esc(new Date().toLocaleString())}</div></div>`;
}

export const printLedger = (html) => printHtml(`<style>@page{size:A4;margin:12mm}body{margin:0}${LEDGER_CSS}</style>${html}`);
export const pdfLedger = (html, filename) => pdfPages([html], LEDGER_CSS, filename);

export async function excelLedger(kind, d, rows, filename) {
  const XLSX = await import('xlsx'), L = LEDGER_TXT[kind];
  const wb = XLSX.utils.book_new();
  if (d.party) {
    const a = [[L.who, d.party.name], ['Period', periodText(d.from, d.to)], [], ['Date', 'Voucher', 'Type', 'Particulars', 'Debit', 'Credit', 'Balance'], ['', '', '', 'Opening balance', '', '', d.totals.opening]];
    d.rows.forEach((r) => {
      a.push([r.date, r.ref_no || '', tagOf(kind, r.type)[0], [rowText(kind, r), subText(r)].filter(Boolean).join(' — '), r.debit || 0, r.credit || 0, r.balance]);
      (r.items || []).forEach((i) => a.push(['', '', '', `   ${i.name}${i.serials?.length ? ` · SN ${i.serials.join(', ')}` : ''} · ${i.qty} × ${i.price} = ${i.total}`, '', '', '']));
    });
    a.push(['', '', '', 'Closing balance', '', '', d.totals.closing]);
    const ws = XLSX.utils.aoa_to_sheet(a); ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 60 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
  } else {
    const a = [[L.who, 'Phone', 'Opening', L.sales, `${L.paid} + returns`, 'Adjusted', L.closing, 'Oldest due (days)']];
    rows.forEach((r) => a.push([r.name, r.phone || '', r.opening, r.sales, r.paid + r.returns, r.adjusted, r.closing, r.oldest_days ?? '']));
    const ws = XLSX.utils.aoa_to_sheet(a); ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
  }
  XLSX.writeFile(wb, filename);
}

/** A short balance message for WhatsApp. */
export function ledgerMessage(kind, d) {
  const s = useStore.getState().settings, p = d.party, dues = d.aging.invoices;
  const lines = [`Assalamu Alaikum ${p.name},`, `Your account with ${s.shop_name || 'us'} (${periodText(d.from, d.to)}):`, `${LEDGER_TXT[kind].sales}: Tk ${n(d.totals.sales)} · ${LEDGER_TXT[kind].paid}: Tk ${n(d.totals.paid)}`, `Balance: Tk ${balText(kind, p.balance)}`];
  if (dues.length) lines.push(`Due on: ${dues.slice(0, 6).map((i) => `${i.invoice_no} (Tk ${n(i.due)})`).join(', ')}`);
  const phone = splitList(s.shop_phone || s.shop_tel || '')[0]; if (phone) lines.push(phone);
  return lines.join('\n');
}
