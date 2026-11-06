const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./salesDocs-SsGRIDd4.js","./index-Btfq1F1K.js","./index-CsPmg8R5.css","./format-BTMnBEjt.js","./export-DmoadpDQ.js","./purchaseDocs-UlzmYEu9.js"])))=>i.map(i=>d[i]);
import{u as v,_ as P}from"./index-Btfq1F1K.js";import{s as x,q as A,m as a,f as h,b as C}from"./format-BTMnBEjt.js";import{e as t,p as u,s as g}from"./export-DmoadpDQ.js";function w(e){return`<div class="c"><b class="shop">${t(e.shop_name||"Karvio")}</b>
    ${e.shop_address?`<div>${t(e.shop_address)}</div>`:""}
    ${g(e,"<br>")?`<div>${g(e,"<br>")}</div>`:""}</div>`}const O=[["80","80 mm thermal"],["58","58 mm thermal"],["a4","A4 page"],["a5","A5 page"],["custom","Custom"]],I=[["classic","Classic"],["modern","Modern"],["minimal","Minimal"],["business","Business"]];function M(e,d){const o=v.getState().settings,i=o.invoice_paper||String(o.receipt_width||80);if(i==="a4"||i==="a5")return P(()=>import("./salesDocs-SsGRIDd4.js"),__vite__mapDeps([0,1,2,3,4,5]),import.meta.url).then(p=>p.printSales([e],i));if(i!=="custom")return _(e,Number(i)||80);const n=Math.min(Math.max(Number(o.invoice_custom_width)||80,40),216),m=Number(o.invoice_custom_height)>0?Math.min(Math.max(Number(o.invoice_custom_height),40),1e3):0;return _(e,n,m)}function _(e,d,o=0){const i=v.getState().settings,n=Number(d||i.receipt_width||80),m=n<=60?n-10:n-8,p=n<=60?10:n>=100?12.5:11.5,r=i.invoice_template||"classic",$=String(i.invoice_note||"").trim(),{sale:s,items:f,customer:c}=e,b=Array.isArray(s.payments)?s.payments:z(s.payments,[]),S=f.map(l=>{const y=x(l.serials);return`<tr><td colspan="3" class="nm">${t(l.name)}</td></tr>
      <tr><td>${t(A(l.qty,l.unit))} × ${t(a(l.price,!1))}</td><td></td><td class="r">${t(a(l.total,!1))}</td></tr>
      ${y.length?`<tr><td colspan="3" class="sm">S/N: ${t(y.join(", "))}</td></tr>`:""}
      ${l.warranty_expiry?`<tr><td colspan="3" class="sm">Warranty: ${t(l.warranty_days)} days (till ${t(h(l.warranty_expiry))})${l.warranty_type==="invoice"?" — keep this receipt":""}</td></tr>`:""}`}).join(""),N=r==="minimal"?"system-ui,'Hind Siliguri',sans-serif":"'Courier New','Hind Siliguri',ui-monospace,monospace";u(`
  <style>
    @page{size:${n}mm ${o?o+"mm":"auto"};margin:0}
    body{margin:0;font:${p}px/1.35 ${N};color:#000;width:${m}mm;padding:3mm ${(n-m)/2}mm}
    .c{text-align:center}.shop{font-size:${p+4}px}.r{text-align:right}.sm{font-size:${p-2}px}.nm{padding-top:4px;font-weight:700}
    table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:0}
    hr{border:0;border-top:1px ${r==="minimal"?"solid":"dashed"} #000;margin:5px 0}.tot td{font-weight:700;font-size:${p+1}px}
    .t-modern .head{background:#000;color:#fff;padding:5px 4px;border-radius:4px}.t-modern .tot td{border-top:1.5px solid #000;padding-top:2px}
    .t-modern .ttl{display:block;margin:4px 0;text-align:center;font-weight:800;letter-spacing:.2em}
    .note{margin-top:6px;text-align:left;white-space:pre-wrap;font-size:${p-1}px}
  </style>
  <div class="t-${t(r)}">
  <div class="head">${w(i)}</div>
  ${r==="modern"?'<span class="ttl">INVOICE</span>':"<hr>"}
  <div>Invoice: <b>${t(s.invoice_no)}</b></div>
  <div>Date: ${t(C(s.created_at||s.date))}</div>
  <div>Customer: ${t(s.customer_name)}${c&&c.phones?" ("+t(x(c.phones)[0])+")":""}</div>
  <div>Served by: ${t(s.user_name||"")}</div>
  ${s.status==="cancelled"?'<div class="c"><b>*** CANCELLED ***</b></div>':""}
  <hr>
  <table>${S}</table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td class="r">${t(a(s.subtotal,!1))}</td></tr>
    ${s.discount?`<tr><td>Discount</td><td class="r">-${t(a(s.discount,!1))}</td></tr>`:""}
    <tr class="tot"><td>TOTAL</td><td class="r">${t(a(s.total))}</td></tr>
    ${b.map(l=>`<tr><td>Paid (${t(l.account_name)})</td><td class="r">${t(a(l.amount,!1))}</td></tr>`).join("")}
    ${s.credit_used?`<tr><td>Paid (advance)</td><td class="r">${t(a(s.credit_used,!1))}</td></tr>`:""}
    ${s.due>0?`<tr class="tot"><td>DUE</td><td class="r">${t(a(s.due))}</td></tr>`:""}
    ${c&&c.balance!==void 0?`<tr><td>Total balance due</td><td class="r">${t(a(c.balance,!1))}</td></tr>`:""}
    ${s.next_payment_date&&s.due>0?`<tr><td>Next payment date</td><td class="r">${t(h(s.next_payment_date))}</td></tr>`:""}
  </table>
  <hr>
  <div class="c">${t(i.shop_footer||"Thank you!")}</div>
  <div class="c sm">Goods sold are subject to warranty terms.</div>
  ${$?`<div class="note"><b>Note:</b> ${t($)}</div>`:""}
  </div>`)}function z(e,d){try{return JSON.parse(e)}catch{return d}}function R({title:e,customer:d,phone:o,lines:i,discount:n=0,note:m="",validDays:p=7}){const r=v.getState().settings,$=i.reduce((c,b)=>c+b.qty*b.price,0),s="Q-"+Date.now().toString().slice(-7),f=i.map((c,b)=>`<tr><td>${b+1}</td><td><b>${t(c.group||"")}</b>${c.group?"<br>":""}${t(c.name)}</td><td class="r">${t(c.warranty||"—")}</td><td class="r">${t(c.qty)}</td><td class="r">${t(a(c.price,!1))}</td><td class="r">${t(a(c.qty*c.price,!1))}</td></tr>`).join("");u(`
  <style>
    @page{size:A4;margin:14mm}body{font:12px/1.45 system-ui,'Hind Siliguri',sans-serif;color:#111;margin:0}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d1b2a;padding-bottom:10px;margin-bottom:14px}
    h1{margin:0;font-size:22px}h2{margin:0;font-size:26px;letter-spacing:.04em;color:#0d1b2a}
    table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:7px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
    th{background:#0d1b2a;color:#fff;font-weight:600}.r{text-align:right}.tot td{font-weight:700;border:0}.big{font-size:16px}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}.note{margin-top:18px;color:#444}
  </style>
  <div class="top"><div><h1>${t(r.shop_name||"Karvio")}</h1><div>${t(r.shop_address||"")}</div><div>${g(r)}</div></div>
  <div class="r"><h2>QUOTATION</h2><div>${t(s)}</div><div>${t(h(new Date().toISOString()))}</div></div></div>
  <div class="meta"><div><b>Prepared for:</b> ${t(d||"—")}</div><div><b>Phone:</b> ${t(o||"—")}</div>
  <div><b>Subject:</b> ${t(e||"Custom PC build")}</div><div><b>Valid for:</b> ${t(p)} days</div></div>
  <table><thead><tr><th>#</th><th>Item</th><th class="r">Warranty</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
  <tbody>${f}</tbody>
  <tfoot>
    <tr class="tot"><td colspan="5" class="r">Subtotal</td><td class="r">${t(a($))}</td></tr>
    ${n?`<tr class="tot"><td colspan="5" class="r">Discount</td><td class="r">-${t(a(n))}</td></tr>`:""}
    <tr class="tot big"><td colspan="5" class="r">Grand total</td><td class="r">${t(a($-n))}</td></tr>
  </tfoot></table>
  ${m?`<div class="note"><b>Notes:</b> ${t(m)}</div>`:""}
  <div class="note">Prices may change with market rates after the validity period. Stock is not reserved until an order is confirmed.</div>`)}function j(e,d,o,i){const n=v.getState().settings,m=d.rows.map(r=>`<tr><td>${t(h(r.date))}</td><td>${t(r.ref_no||"")}</td><td>${t(r.note||r.type)}</td><td class="r">${r.debit?t(a(r.debit,!1)):""}</td><td class="r">${r.credit?t(a(r.credit,!1)):""}</td><td class="r">${t(a(r.balance,!1))}</td></tr>`).join(""),p=e==="customer"?["Sale / paid out","Received"]:["Paid / returned","Purchased"];u(`
  <style>@page{size:A4;margin:14mm}body{font:11.5px/1.45 system-ui,'Hind Siliguri',sans-serif;color:#111;margin:0}
  h1{margin:0;font-size:18px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left}
  th{background:#eef1f6}.r{text-align:right}.b{font-weight:700}</style>
  <h1>${t(n.shop_name||"Karvio")}</h1><div>${t(n.shop_address||"")}</div><div>${g(n)}</div>
  <h3 style="margin:14px 0 4px">${e==="customer"?"Customer":"Supplier"} statement — ${t(d.party)}</h3>
  <div>${t(d.phones||"")} ${t(d.address||"")}</div>
  <div>Period: ${t(o?h(o):"Beginning")} to ${t(i?h(i):"Today")}</div>
  <table><thead><tr><th>Date</th><th>Ref</th><th>Details</th><th class="r">${p[0]}</th><th class="r">${p[1]}</th><th class="r">Balance</th></tr></thead>
  <tbody><tr><td colspan="5" class="b">Opening balance</td><td class="r b">${t(a(d.opening,!1))}</td></tr>${m}
  <tr><td colspan="5" class="b">Closing balance ${d.closing>0?e==="customer"?"(customer owes)":"(payable to supplier)":d.closing<0?"(advance)":""}</td><td class="r b">${t(a(d.closing))}</td></tr></tbody></table>`)}function H(e){const d=v.getState().settings,o=Number(d.receipt_width||80),i=o===58?48:72;u(`<style>@page{size:${o}mm auto;margin:0}body{margin:0;width:${i}mm;padding:3mm ${(o-i)/2}mm;font:11px/1.4 'Courier New','Hind Siliguri',monospace}.c{text-align:center}hr{border:0;border-top:1px dashed #000}</style>
  ${w(d)}<hr><div class="c"><b>MONEY RECEIPT</b></div><div>No: ${t(e.receipt_no)}</div><div>Date: ${t(new Date().toLocaleString())}</div>
  <div>Received from: <b>${t(e.customer)}</b></div><div>Amount: <b>${t(a(e.amount))}</b></div><div>Via: ${t(e.account)}</div><hr>
  <div>Remaining balance: <b>${t(a(e.balance))}</b></div><hr><div class="c">${t(d.shop_footer||"")}</div>`)}export{O as P,I as T,_ as a,R as b,j as c,H as d,M as p};
