const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./salesDocs-BTkiNIvH.js","./index-BhIHQnKG.js","./index-DAvJuOeh.css","./format-BbazwFgk.js","./export-DXxjpEJe.js","./purchaseDocs-mclrIt3I.js"])))=>i.map(i=>d[i]);
import{u as $,_ as S}from"./index-BhIHQnKG.js";import{s as _,q as D,m as d,f as b,b as E}from"./format-BbazwFgk.js";import{p as g,e as t,s as v}from"./export-DXxjpEJe.js";function N(e){return`<div class="c"><b class="shop">${t(e.shop_name||"Karvio")}</b>
    ${e.shop_address?`<div>${t(e.shop_address)}</div>`:""}
    ${v(e,"<br>")?`<div>${v(e,"<br>")}</div>`:""}</div>`}const I=[["80","80 mm thermal"],["58","58 mm thermal"],["a4","A4 page"],["a5","A5 page"],["custom","Custom"]],R=[["classic","Classic"],["modern","Modern"],["minimal","Minimal"],["business","Business"]];function M(e,a){const s=$.getState().settings,i=s.invoice_paper||String(s.receipt_width||80);if(i==="a4"||i==="a5")return S(()=>import("./salesDocs-BTkiNIvH.js"),__vite__mapDeps([0,1,2,3,4,5]),import.meta.url).then(p=>p.printSales([e],i));if(i!=="custom")return w(e,Number(i)||80);const[o,m]=P(s);return w(e,o,m)}const P=e=>[Math.min(Math.max(Number(e.invoice_custom_width)||80,40),216),Number(e.invoice_custom_height)>0?Math.min(Math.max(Number(e.invoice_custom_height),40),1e3):0];async function j(e){const a=$.getState().settings,s=a.invoice_paper||String(a.receipt_width||80);if(s==="a4"||s==="a5")return{html:(await S(()=>import("./salesDocs-BTkiNIvH.js"),__vite__mapDeps([0,1,2,3,4,5]),import.meta.url)).saleDocHtml(e,s),paper:s};if(s!=="custom")return{html:y(e,Number(s)||80),paper:"receipt"};const[i,o]=P(a);return{html:y(e,i,o),paper:"receipt"}}function w(e,a,s=0){return g(y(e,a,s))}function y(e,a,s=0){const i=$.getState().settings,o=Number(a||i.receipt_width||80),m=o<=60?o-10:o-8,p=o<=60?10:o>=100?12.5:11.5,n=i.invoice_template||"classic",u=String(i.invoice_note||"").trim(),{sale:r,items:f,customer:c}=e,h=Array.isArray(r.payments)?r.payments:T(r.payments,[]),A=f.map(l=>{const x=_(l.serials);return`<tr><td colspan="3" class="nm">${t(l.name)}</td></tr>
      <tr><td>${t(D(l.qty,l.unit))} × ${t(d(l.price,!1))}</td><td></td><td class="r">${t(d(l.total,!1))}</td></tr>
      ${x.length?`<tr><td colspan="3" class="sm">S/N: ${t(x.join(", "))}</td></tr>`:""}
      ${l.warranty_expiry?`<tr><td colspan="3" class="sm">Warranty: ${t(l.warranty_days)} days (till ${t(b(l.warranty_expiry))})${l.warranty_type==="invoice"?" — keep this receipt":""}</td></tr>`:""}`}).join(""),C=n==="minimal"?"system-ui,'Hind Siliguri',sans-serif":"'Courier New','Hind Siliguri',ui-monospace,monospace";return`
  <style>
    @page{size:${o}mm ${s?s+"mm":"auto"};margin:0}
    body{margin:0;font:${p}px/1.35 ${C};color:#000;width:${m}mm;padding:3mm ${(o-m)/2}mm}
    .c{text-align:center}.shop{font-size:${p+4}px}.r{text-align:right}.sm{font-size:${p-2}px}.nm{padding-top:4px;font-weight:700}
    table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:0}
    hr{border:0;border-top:1px ${n==="minimal"?"solid":"dashed"} #000;margin:5px 0}.tot td{font-weight:700;font-size:${p+1}px}
    .t-modern .head{background:#000;color:#fff;padding:5px 4px;border-radius:4px}.t-modern .tot td{border-top:1.5px solid #000;padding-top:2px}
    .t-modern .ttl{display:block;margin:4px 0;text-align:center;font-weight:800;letter-spacing:.2em}
    .note{margin-top:6px;text-align:left;white-space:pre-wrap;font-size:${p-1}px}
  </style>
  <div class="t-${t(n)}">
  <div class="head">${N(i)}</div>
  ${n==="modern"?'<span class="ttl">INVOICE</span>':"<hr>"}
  <div>Invoice: <b>${t(r.invoice_no)}</b></div>
  <div>Date: ${t(E(r.created_at||r.date))}</div>
  <div>Customer: ${t(r.customer_name)}${c&&c.phones?" ("+t(_(c.phones)[0])+")":""}</div>
  <div>Served by: ${t(r.user_name||"")}</div>
  ${r.status==="cancelled"?'<div class="c"><b>*** CANCELLED ***</b></div>':""}
  <hr>
  <table>${A}</table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td class="r">${t(d(r.subtotal,!1))}</td></tr>
    ${r.discount?`<tr><td>Discount</td><td class="r">-${t(d(r.discount,!1))}</td></tr>`:""}
    <tr class="tot"><td>TOTAL</td><td class="r">${t(d(r.total))}</td></tr>
    ${h.map(l=>`<tr><td>Paid (${t(l.account_name)})</td><td class="r">${t(d(l.amount,!1))}</td></tr>`).join("")}
    ${r.credit_used?`<tr><td>Paid (advance)</td><td class="r">${t(d(r.credit_used,!1))}</td></tr>`:""}
    ${r.due>0?`<tr class="tot"><td>DUE</td><td class="r">${t(d(r.due))}</td></tr>`:""}
    ${c&&c.balance!==void 0?`<tr><td>Total balance due</td><td class="r">${t(d(c.balance,!1))}</td></tr>`:""}
    ${r.next_payment_date&&r.due>0?`<tr><td>Next payment date</td><td class="r">${t(b(r.next_payment_date))}</td></tr>`:""}
  </table>
  <hr>
  <div class="c">${t(i.shop_footer||"Thank you!")}</div>
  <div class="c sm">Goods sold are subject to warranty terms.</div>
  ${u?`<div class="note"><b>Note:</b> ${t(u)}</div>`:""}
  </div>`}function T(e,a){try{return JSON.parse(e)}catch{return a}}function L({title:e,customer:a,phone:s,lines:i,discount:o=0,note:m="",validDays:p=7}){const n=$.getState().settings,u=i.reduce((c,h)=>c+h.qty*h.price,0),r="Q-"+Date.now().toString().slice(-7),f=i.map((c,h)=>`<tr><td>${h+1}</td><td><b>${t(c.group||"")}</b>${c.group?"<br>":""}${t(c.name)}</td><td class="r">${t(c.warranty||"—")}</td><td class="r">${t(c.qty)}</td><td class="r">${t(d(c.price,!1))}</td><td class="r">${t(d(c.qty*c.price,!1))}</td></tr>`).join("");g(`
  <style>
    @page{size:A4;margin:14mm}body{font:12px/1.45 system-ui,'Hind Siliguri',sans-serif;color:#111;margin:0}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d1b2a;padding-bottom:10px;margin-bottom:14px}
    h1{margin:0;font-size:22px}h2{margin:0;font-size:26px;letter-spacing:.04em;color:#0d1b2a}
    table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:7px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
    th{background:#0d1b2a;color:#fff;font-weight:600}.r{text-align:right}.tot td{font-weight:700;border:0}.big{font-size:16px}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}.note{margin-top:18px;color:#444}
  </style>
  <div class="top"><div><h1>${t(n.shop_name||"Karvio")}</h1><div>${t(n.shop_address||"")}</div><div>${v(n)}</div></div>
  <div class="r"><h2>QUOTATION</h2><div>${t(r)}</div><div>${t(b(new Date().toISOString()))}</div></div></div>
  <div class="meta"><div><b>Prepared for:</b> ${t(a||"—")}</div><div><b>Phone:</b> ${t(s||"—")}</div>
  <div><b>Subject:</b> ${t(e||"Custom PC build")}</div><div><b>Valid for:</b> ${t(p)} days</div></div>
  <table><thead><tr><th>#</th><th>Item</th><th class="r">Warranty</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
  <tbody>${f}</tbody>
  <tfoot>
    <tr class="tot"><td colspan="5" class="r">Subtotal</td><td class="r">${t(d(u))}</td></tr>
    ${o?`<tr class="tot"><td colspan="5" class="r">Discount</td><td class="r">-${t(d(o))}</td></tr>`:""}
    <tr class="tot big"><td colspan="5" class="r">Grand total</td><td class="r">${t(d(u-o))}</td></tr>
  </tfoot></table>
  ${m?`<div class="note"><b>Notes:</b> ${t(m)}</div>`:""}
  <div class="note">Prices may change with market rates after the validity period. Stock is not reserved until an order is confirmed.</div>`)}function k(e,a,s,i){const o=$.getState().settings,m=a.rows.map(n=>`<tr><td>${t(b(n.date))}</td><td>${t(n.ref_no||"")}</td><td>${t(n.note||n.type)}</td><td class="r">${n.debit?t(d(n.debit,!1)):""}</td><td class="r">${n.credit?t(d(n.credit,!1)):""}</td><td class="r">${t(d(n.balance,!1))}</td></tr>`).join(""),p=e==="customer"?["Sale / paid out","Received"]:["Paid / returned","Purchased"];g(`
  <style>@page{size:A4;margin:14mm}body{font:11.5px/1.45 system-ui,'Hind Siliguri',sans-serif;color:#111;margin:0}
  h1{margin:0;font-size:18px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left}
  th{background:#eef1f6}.r{text-align:right}.b{font-weight:700}</style>
  <h1>${t(o.shop_name||"Karvio")}</h1><div>${t(o.shop_address||"")}</div><div>${v(o)}</div>
  <h3 style="margin:14px 0 4px">${e==="customer"?"Customer":"Supplier"} statement — ${t(a.party)}</h3>
  <div>${t(a.phones||"")} ${t(a.address||"")}</div>
  <div>Period: ${t(s?b(s):"Beginning")} to ${t(i?b(i):"Today")}</div>
  <table><thead><tr><th>Date</th><th>Ref</th><th>Details</th><th class="r">${p[0]}</th><th class="r">${p[1]}</th><th class="r">Balance</th></tr></thead>
  <tbody><tr><td colspan="5" class="b">Opening balance</td><td class="r b">${t(d(a.opening,!1))}</td></tr>${m}
  <tr><td colspan="5" class="b">Closing balance ${a.closing>0?e==="customer"?"(customer owes)":"(payable to supplier)":a.closing<0?"(advance)":""}</td><td class="r b">${t(d(a.closing))}</td></tr></tbody></table>`)}function q(e){const a=$.getState().settings,s=Number(a.receipt_width||80),i=s===58?48:72;g(`<style>@page{size:${s}mm auto;margin:0}body{margin:0;width:${i}mm;padding:3mm ${(s-i)/2}mm;font:11px/1.4 'Courier New','Hind Siliguri',monospace}.c{text-align:center}hr{border:0;border-top:1px dashed #000}</style>
  ${N(a)}<hr><div class="c"><b>MONEY RECEIPT</b></div><div>No: ${t(e.receipt_no)}</div><div>Date: ${t(new Date().toLocaleString())}</div>
  <div>Received from: <b>${t(e.customer)}</b></div><div>Amount: <b>${t(d(e.amount))}</b></div><div>Via: ${t(e.account)}</div><hr>
  <div>Remaining balance: <b>${t(d(e.balance))}</b></div><hr><div class="c">${t(a.shop_footer||"")}</div>`)}export{I as P,R as T,w as a,L as b,k as c,q as d,j as i,M as p};
