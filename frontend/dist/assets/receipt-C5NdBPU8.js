const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./salesDocs-CgeXY2XZ.js","./index-1ywX1X6r.js","./index-Dkxq2n3J.css","./format-D7gXdJjf.js","./export-BatAJmqz.js","./purchaseDocs-HiXPbehh.js"])))=>i.map(i=>d[i]);
import{u as h,_ as P}from"./index-1ywX1X6r.js";import{r as x,m as n,f as b,s as N,q as C,b as T,t as z}from"./format-D7gXdJjf.js";import{p as g,e as t,s as $}from"./export-BatAJmqz.js";function q(e,s){const a=Number(s||0),r=e.every(c=>Number.isFinite(Number(c.qty))&&Number(c.qty)>0&&Number.isFinite(Number(c.price))&&Number(c.price)>=0),o=x(e.reduce((c,d)=>c+x(Number(d.qty)*Number(d.price)),0)),l=!r||!Number.isFinite(o)?"Enter a valid quantity and price for each part.":!Number.isFinite(a)||a<0||a>o?"Discount must be between 0 and the subtotal.":"";return{subtotal:o,discount:a,total:l?null:x(o-a),error:l,valid:!l}}function E(e){return`<div class="c"><b class="shop">${t(e.shop_name||"Karvio")}</b>
    ${e.shop_address?`<div>${t(e.shop_address)}</div>`:""}
    ${$(e,"<br>")?`<div>${$(e,"<br>")}</div>`:""}</div>`}const L=[["80","80 mm thermal"],["58","58 mm thermal"],["a4","A4 page"],["a5","A5 page"],["custom","Custom"]],M=[["classic","Classic"],["modern","Modern"],["minimal","Minimal"],["business","Business"]];function k(e,s){const a=h.getState().settings,r=a.invoice_paper||String(a.receipt_width||80);if(r==="a4"||r==="a5")return P(()=>import("./salesDocs-CgeXY2XZ.js"),__vite__mapDeps([0,1,2,3,4,5]),import.meta.url).then(c=>c.printSales([e],r));if(r!=="custom")return S(e,Number(r)||80);const[o,l]=D(a);return S(e,o,l)}const D=e=>[Math.min(Math.max(Number(e.invoice_custom_width)||80,40),216),Number(e.invoice_custom_height)>0?Math.min(Math.max(Number(e.invoice_custom_height),40),1e3):0];async function V(e){const s=h.getState().settings,a=s.invoice_paper||String(s.receipt_width||80);if(a==="a4"||a==="a5")return{html:(await P(()=>import("./salesDocs-CgeXY2XZ.js"),__vite__mapDeps([0,1,2,3,4,5]),import.meta.url)).saleDocHtml(e,a),paper:a};if(a!=="custom")return{html:_(e,Number(a)||80),paper:"receipt"};const[r,o]=D(s);return{html:_(e,r,o),paper:"receipt"}}function S(e,s,a=0){return g(_(e,s,a))}function _(e,s,a=0){const r=h.getState().settings,o=Number(s||r.receipt_width||80),l=o<=60?o-10:o-8,c=o<=60?10:o>=100?12.5:11.5,d=r.invoice_template||"classic",v=String(r.invoice_note||"").trim(),{sale:i,items:f,customer:u}=e,m=Array.isArray(i.payments)?i.payments:R(i.payments,[]),y=f.map(p=>{const w=N(p.serials);return`<tr><td colspan="3" class="nm">${t(p.name)}</td></tr>
      <tr><td>${t(C(p.qty,p.unit))} × ${t(n(p.price,!1))}</td><td></td><td class="r">${t(n(p.total,!1))}</td></tr>
      ${w.length?`<tr><td colspan="3" class="sm">S/N: ${t(w.join(", "))}</td></tr>`:""}
      ${p.warranty_expiry?`<tr><td colspan="3" class="sm">Warranty: ${t(p.warranty_days)} days (till ${t(b(p.warranty_expiry))})${p.warranty_type==="invoice"?" — keep this receipt":""}</td></tr>`:""}`}).join(""),A=d==="minimal"?"system-ui,'Hind Siliguri',sans-serif":"'Courier New','Hind Siliguri',ui-monospace,monospace";return`
  <style>
    @page{size:${o}mm ${a?a+"mm":"auto"};margin:0}
    body{margin:0;font:${c}px/1.35 ${A};color:#000;width:${l}mm;padding:3mm ${(o-l)/2}mm}
    .c{text-align:center}.shop{font-size:${c+4}px}.r{text-align:right}.sm{font-size:${c-2}px}.nm{padding-top:4px;font-weight:700}
    table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:0}
    hr{border:0;border-top:1px ${d==="minimal"?"solid":"dashed"} #000;margin:5px 0}.tot td{font-weight:700;font-size:${c+1}px}
    .t-modern .head{background:#000;color:#fff;padding:5px 4px;border-radius:4px}.t-modern .tot td{border-top:1.5px solid #000;padding-top:2px}
    .t-modern .ttl{display:block;margin:4px 0;text-align:center;font-weight:800;letter-spacing:.2em}
    .note{margin-top:6px;text-align:left;white-space:pre-wrap;font-size:${c-1}px}
  </style>
  <div class="t-${t(d)}">
  <div class="head">${E(r)}</div>
  ${d==="modern"?'<span class="ttl">INVOICE</span>':"<hr>"}
  <div>Invoice: <b>${t(i.invoice_no)}</b></div>
  <div>Date: ${t(T(i.created_at||i.date))}</div>
  <div>Customer: ${t(i.customer_name)}${u&&u.phones?" ("+t(N(u.phones)[0])+")":""}</div>
  <div>Served by: ${t(i.user_name||"")}</div>
  ${i.status==="cancelled"?'<div class="c"><b>*** CANCELLED ***</b></div>':""}
  <hr>
  <table>${y}</table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td class="r">${t(n(i.subtotal,!1))}</td></tr>
    ${i.discount?`<tr><td>Discount</td><td class="r">-${t(n(i.discount,!1))}</td></tr>`:""}
    <tr class="tot"><td>TOTAL</td><td class="r">${t(n(i.total))}</td></tr>
    ${m.map(p=>`<tr><td>Paid (${t(p.account_name)})</td><td class="r">${t(n(p.amount,!1))}</td></tr>`).join("")}
    ${i.credit_used?`<tr><td>Paid (advance)</td><td class="r">${t(n(i.credit_used,!1))}</td></tr>`:""}
    ${i.due>0?`<tr class="tot"><td>DUE</td><td class="r">${t(n(i.due))}</td></tr>`:""}
    ${u&&u.balance!==void 0?`<tr><td>Total balance due</td><td class="r">${t(n(u.balance,!1))}</td></tr>`:""}
    ${i.next_payment_date&&i.due>0?`<tr><td>Next payment date</td><td class="r">${t(b(i.next_payment_date))}</td></tr>`:""}
  </table>
  <hr>
  <div class="c">${t(r.shop_footer||"Thank you!")}</div>
  <div class="c sm">Goods sold are subject to warranty terms.</div>
  ${v?`<div class="note"><b>Note:</b> ${t(v)}</div>`:""}
  </div>`}function R(e,s){try{return JSON.parse(e)}catch{return s}}function F({title:e,customer:s,phone:a,lines:r,discount:o=0,note:l="",validDays:c=7}){const d=h.getState().settings,v="Q-"+Date.now().toString().slice(-7),i=q(r,o),f=i.subtotal;if(!i.valid)throw new Error(i.error);const u=r.map((m,y)=>`<tr><td>${y+1}</td><td><b>${t(m.group||"")}</b>${m.group?"<br>":""}${t(m.name)}</td><td class="r">${t(m.warranty||"—")}</td><td class="r">${t(m.qty)}</td><td class="r">${t(n(m.price,!1))}</td><td class="r">${t(n(m.qty*m.price,!1))}</td></tr>`).join("");g(`
  <style>
    @page{size:A4;margin:14mm}body{font:12px/1.45 system-ui,'Hind Siliguri',sans-serif;color:#111;margin:0}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d1b2a;padding-bottom:10px;margin-bottom:14px}
    h1{margin:0;font-size:22px}h2{margin:0;font-size:26px;letter-spacing:.04em;color:#0d1b2a}
    table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:7px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
    th{background:#0d1b2a;color:#fff;font-weight:600}.r{text-align:right}.tot td{font-weight:700;border:0}.big{font-size:16px}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}.note{margin-top:18px;color:#444}
  </style>
  <div class="top"><div><h1>${t(d.shop_name||"Karvio")}</h1><div>${t(d.shop_address||"")}</div><div>${$(d)}</div></div>
  <div class="r"><h2>QUOTATION</h2><div>${t(v)}</div><div>${t(b(z()))}</div></div></div>
  <div class="meta"><div><b>Prepared for:</b> ${t(s||"—")}</div><div><b>Phone:</b> ${t(a||"—")}</div>
  <div><b>Subject:</b> ${t(e||"Custom PC build")}</div><div><b>Valid for:</b> ${t(c)} days</div></div>
  <table><thead><tr><th>#</th><th>Item</th><th class="r">Warranty</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
  <tbody>${u}</tbody>
  <tfoot>
    <tr class="tot"><td colspan="5" class="r">Subtotal</td><td class="r">${t(n(f))}</td></tr>
    ${o?`<tr class="tot"><td colspan="5" class="r">Discount</td><td class="r">-${t(n(o))}</td></tr>`:""}
    <tr class="tot big"><td colspan="5" class="r">Grand total</td><td class="r">${t(n(i.total))}</td></tr>
  </tfoot></table>
  ${l?`<div class="note"><b>Notes:</b> ${t(l)}</div>`:""}
  <div class="note">Prices may change with market rates after the validity period. Stock is not reserved until an order is confirmed.</div>`)}function Q(e,s,a,r){const o=h.getState().settings,l=s.rows.map(d=>`<tr><td>${t(b(d.date))}</td><td>${t(d.ref_no||"")}</td><td>${t(d.note||d.type)}</td><td class="r">${d.debit?t(n(d.debit,!1)):""}</td><td class="r">${d.credit?t(n(d.credit,!1)):""}</td><td class="r">${t(n(d.balance,!1))}</td></tr>`).join(""),c=e==="customer"?["Sale / paid out","Received"]:["Paid / returned","Purchased"];g(`
  <style>@page{size:A4;margin:14mm}body{font:11.5px/1.45 system-ui,'Hind Siliguri',sans-serif;color:#111;margin:0}
  h1{margin:0;font-size:18px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left}
  th{background:#eef1f6}.r{text-align:right}.b{font-weight:700}</style>
  <h1>${t(o.shop_name||"Karvio")}</h1><div>${t(o.shop_address||"")}</div><div>${$(o)}</div>
  <h3 style="margin:14px 0 4px">${e==="customer"?"Customer":"Supplier"} statement — ${t(s.party)}</h3>
  <div>${t(s.phones||"")} ${t(s.address||"")}</div>
  <div>Period: ${t(a?b(a):"Beginning")} to ${t(r?b(r):"Today")}</div>
  <table><thead><tr><th>Date</th><th>Ref</th><th>Details</th><th class="r">${c[0]}</th><th class="r">${c[1]}</th><th class="r">Balance</th></tr></thead>
  <tbody><tr><td colspan="5" class="b">Opening balance</td><td class="r b">${t(n(s.opening,!1))}</td></tr>${l}
  <tr><td colspan="5" class="b">Closing balance ${s.closing>0?e==="customer"?"(customer owes)":"(payable to supplier)":s.closing<0?"(advance)":""}</td><td class="r b">${t(n(s.closing))}</td></tr></tbody></table>`)}function j(e){const s=h.getState().settings,a=Number(s.receipt_width||80),r=a===58?48:72;g(`<style>@page{size:${a}mm auto;margin:0}body{margin:0;width:${r}mm;padding:3mm ${(a-r)/2}mm;font:11px/1.4 'Courier New','Hind Siliguri',monospace}.c{text-align:center}hr{border:0;border-top:1px dashed #000}</style>
  ${E(s)}<hr><div class="c"><b>MONEY RECEIPT</b></div><div>No: ${t(e.receipt_no)}</div><div>Date: ${t(e.date?b(e.date):new Date().toLocaleString())}</div>
  <div>Received from: <b>${t(e.customer)}</b></div><div>Amount: <b>${t(n(e.amount))}</b></div><div>Via: ${t(e.account)}</div><hr>
  <div>Remaining balance: <b>${t(n(e.balance))}</b></div><hr><div class="c">${t(s.shop_footer||"")}</div>`)}function B(e){const s=e.receipts||[];if(!s.length)throw new Error("Due payment receipt is missing");j({receipt_no:s.map(a=>a.receipt_no).join(", "),customer:s[0].customer,amount:e.amount,account:s.map(a=>a.account+" "+n(a.amount)).join(" + "),balance:s.at(-1).balance})}export{L as P,M as T,B as a,S as b,F as c,j as d,Q as e,V as i,k as p,q};
