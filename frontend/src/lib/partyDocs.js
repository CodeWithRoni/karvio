// Customer / supplier details with their full ledger: print, PDF (one party per A4 page) and Excel.
import { money, fdate, splitList, today } from './format';
import { esc } from './export';
import { bizDocHtml, isBizTpl, docOpen, docHead, printDocs, pdfDocs, m2fmt } from './salesDocs';

const LBL = {
  customer: { title: 'CUSTOMER STATEMENT', who: 'Customer', debit: 'Sale / paid out', credit: 'Received', pos: 'customer owes', neg: 'advance' },
  supplier: { title: 'SUPPLIER STATEMENT', who: 'Supplier', debit: 'Paid / returned', credit: 'Purchased', pos: 'payable to supplier', neg: 'advance paid' }
};
const addr = (st) => (st.info?.addresses || st.info?.address || st.address || '').split('|').map((x) => x.trim()).filter(Boolean).join('; ');

/** A customer / supplier statement in the invoice template. opt = { from, to } prints the period. */
export function statementHtml(kind, st, opt = {}) {
  const L = LBL[kind];
  const period = opt.from || opt.to ? `${opt.from ? fdate(opt.from) : 'Beginning'} to ${opt.to ? fdate(opt.to) : 'Today'}` : '';
  const rows = st.rows.map((r) => `<tr><td>${esc(fdate(r.date))}</td><td>${esc(r.ref_no || '')}</td><td>${esc(r.note || r.type || '')}</td><td class="r">${r.debit ? esc(money(r.debit, false)) : ''}</td><td class="r">${r.credit ? esc(money(r.credit, false)) : ''}</td><td class="r">${esc(money(r.balance, false))}</td></tr>`).join('');
  const tag = st.closing > 0.004 ? ` (${L.pos})` : st.closing < -0.004 ? ` (${L.neg})` : '';
  if (isBizTpl()) return bizDocHtml({
    title: kind === 'customer' ? 'Customer Statement' : 'Supplier Statement',
    left: [[L.who, `<b>${esc(st.party)}</b>`], ['Contact No', esc(splitList(st.phones || '').join(', '))], ['Address', esc(addr(st))]],
    right: [['Date', esc(fdate(today()))], ...(period ? [['Period', esc(period)]] : []), ['Balance', `<b>${esc(m2fmt(st.closing))}${esc(tag)}</b>`]],
    cols: [{ label: 'Date', w: 84, cls: 'cn' }, { label: 'Ref', w: 110 }, { label: 'Details' }, { label: L.debit, w: 100, cls: 'r' }, { label: L.credit, w: 100, cls: 'r' }, { label: 'Balance', w: 100, cls: 'r' }],
    rows: [{ span: ['Opening balance', esc(m2fmt(st.opening))] },
      ...st.rows.map((r) => [esc(fdate(r.date)), esc(r.ref_no || ''), esc(r.note || r.type || ''), r.debit ? esc(m2fmt(r.debit)) : '', r.credit ? esc(m2fmt(r.credit)) : '', esc(m2fmt(r.balance))]),
      { span: [`Closing balance${esc(tag)}`, esc(m2fmt(st.closing))] }],
    foot: st.info?.note ? `<div class="bfootnote"><b>Note:</b> ${esc(st.info.note)}</div>` : '',
    sign: 'Authorised Signature'
  });
  return `${docOpen()}${docHead(L.title, `${esc(fdate(today()))}${period ? `<br><span class="sm">Period: ${esc(period)}</span>` : ''}`)}
    <div class="box sgrid">
      <div><b class="t">${L.who}</b><b>${esc(st.party)}</b></div>
      <div><b class="t">Phone</b>${esc(splitList(st.phones || '').join(', ') || '—')}</div>
      <div><b class="t">Address</b>${esc(addr(st) || '—')}</div>
      <div><b class="t">Balance</b><b>${esc(money(st.closing))}${esc(tag)}</b></div>
      ${st.info?.note ? `<div style="grid-column:1/-1"><b class="t">Note</b>${esc(st.info.note)}</div>` : ''}
    </div>
    <table><thead><tr><th style="width:84px">Date</th><th style="width:100px">Ref</th><th>Details</th><th class="r" style="width:96px">${L.debit}</th><th class="r" style="width:96px">${L.credit}</th><th class="r" style="width:96px">Balance</th></tr></thead>
    <tbody><tr class="b"><td colspan="5">Opening balance</td><td class="r">${esc(money(st.opening, false))}</td></tr>${rows || '<tr><td colspan="6">No transactions</td></tr>'}
    <tr class="b"><td colspan="5">Closing balance${esc(tag)}</td><td class="r">${esc(money(st.closing))}</td></tr></tbody></table>
    <div class="foot"><span>Printed ${esc(new Date().toLocaleString())}</span><span>Signature: ____________________</span></div>
  </div>`;
}

export const printParties = (kind, list, opt) => printDocs(list.map((st) => statementHtml(kind, st, opt)));
export const pdfParties = (kind, list, filename, opt) => pdfDocs(list.map((st) => statementHtml(kind, st, opt)), filename);

export async function excelParties(kind, list, filename) {
  const XLSX = await import('xlsx');
  const L = LBL[kind];
  const a = [[L.who, 'Phones', 'Address', 'Opening balance', 'Balance', 'Status', 'Note']];
  const b = [[L.who, 'Date', 'Ref', 'Details', L.debit, L.credit, 'Balance']];
  list.forEach((st) => {
    a.push([st.party, splitList(st.phones || '').join(', '), addr(st), st.info?.opening_balance ?? st.opening, st.closing, st.info?.active === false ? 'Inactive' : 'Active', st.info?.note || '']);
    b.push([st.party, '', '', 'Opening balance', '', '', st.opening]);
    st.rows.forEach((r) => b.push([st.party, String(r.date).slice(0, 10), r.ref_no || '', r.note || r.type || '', r.debit || 0, r.credit || 0, r.balance]));
    b.push([st.party, '', '', 'Closing balance', '', '', st.closing]);
  });
  const wb = XLSX.utils.book_new();
  const sa = XLSX.utils.aoa_to_sheet(a); sa['!cols'] = [{ wch: 28 }, { wch: 26 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 30 }];
  const sb = XLSX.utils.aoa_to_sheet(b); sb['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 16 }, { wch: 44 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, sa, kind === 'customer' ? 'Customers' : 'Suppliers');
  XLSX.utils.book_append_sheet(wb, sb, 'Ledger');
  XLSX.writeFile(wb, filename);
}
