// Customer / supplier details with their full ledger: print, PDF (one party per A4 page) and Excel.
import { useStore } from './store';
import { money, fdate, splitList } from './format';
import { printHtml, esc } from './export';
import { pdfPages } from './purchaseDocs';

const css = `
  .pst{font:12px/1.45 'Manrope','Hind Siliguri',system-ui,sans-serif;color:#111;background:#fff}
  .pst *{box-sizing:border-box}
  .pst .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d1b2a;padding-bottom:10px;margin-bottom:12px}
  .pst h1{margin:0;font-size:20px}.pst h2{margin:0;font-size:20px;letter-spacing:.04em;color:#0d1b2a;text-align:right}
  .pst .box{border:1px solid #ccd3dc;border-radius:6px;padding:8px 10px;margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr;gap:4px 18px}
  .pst .box b.t{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#556;display:block}
  .pst table{width:100%;border-collapse:collapse}.pst th,.pst td{border:1px solid #ccd3dc;padding:5px 7px;text-align:left;vertical-align:top}
  .pst th{background:#0d1b2a;color:#fff;font-weight:600;font-size:11.5px}.pst .r{text-align:right}.pst .b td{font-weight:800;background:#eef1f6}
  .pst .foot{margin-top:14px;font-size:11px;color:#444;display:flex;justify-content:space-between}
`;
const LBL = {
  customer: { title: 'CUSTOMER STATEMENT', who: 'Customer', debit: 'Sale / paid out', credit: 'Received', pos: 'customer owes', neg: 'advance' },
  supplier: { title: 'SUPPLIER STATEMENT', who: 'Supplier', debit: 'Paid / returned', credit: 'Purchased', pos: 'payable to supplier', neg: 'advance paid' }
};
const addr = (st) => (st.info?.addresses || st.info?.address || st.address || '').split('|').map((x) => x.trim()).filter(Boolean).join('; ');

export function statementHtml(kind, st) {
  const s = useStore.getState().settings, L = LBL[kind];
  const rows = st.rows.map((r) => `<tr><td>${esc(fdate(r.date))}</td><td>${esc(r.ref_no || '')}</td><td>${esc(r.note || r.type || '')}</td><td class="r">${r.debit ? esc(money(r.debit, false)) : ''}</td><td class="r">${r.credit ? esc(money(r.credit, false)) : ''}</td><td class="r">${esc(money(r.balance, false))}</td></tr>`).join('');
  const tag = st.closing > 0.004 ? ` (${L.pos})` : st.closing < -0.004 ? ` (${L.neg})` : '';
  return `<div class="pst">
    <div class="top"><div><h1>${esc(s.shop_name || 'ShopERP')}</h1><div>${esc(s.shop_address || '')}</div><div>${esc(s.shop_phone || '')}</div></div>
      <div><h2>${L.title}</h2><div style="text-align:right">${esc(fdate(new Date().toISOString()))}</div></div></div>
    <div class="box">
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

export const printParties = (kind, list) => printHtml(`<style>@page{size:A4;margin:12mm}body{margin:0}${css}.pst+.pst{page-break-before:always;break-before:page}</style>${list.map((st) => statementHtml(kind, st)).join('')}`);
export const pdfParties = (kind, list, filename) => pdfPages(list.map((st) => statementHtml(kind, st)), css, filename);

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
