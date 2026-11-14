const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./salesDocs-BeufaWv6.js","./index-DogR3BcS.js","./index-BjVqbaY9.css","./format-VNiVWJcT.js","./export-Dm95llif.js","./purchaseDocs-Cjl6FweD.js"])))=>i.map(i=>d[i]);
import{u as h,_ as D}from"./index-DogR3BcS.js";import{r as w,m as d,f as u,s as S,q as C,b as q,t as z}from"./format-VNiVWJcT.js";import{p as y,e as t,s as f}from"./export-Dm95llif.js";const T=e=>Number(e||0).toLocaleString("en-IN",{minimumFractionDigits:Number(e)%1?2:0,maximumFractionDigits:20});function R(e,a){const s=Number(a||0),i=e.every(c=>Number.isFinite(Number(c.qty))&&Number(c.qty)>0&&Number.isFinite(Number(c.price))&&Number(c.price)>=0),r=w(e.reduce((c,l)=>c+w(Number(l.qty)*Number(l.price)),0)),p=!i||!Number.isFinite(r)?"Enter a valid quantity and price for each part.":!Number.isFinite(s)||s<0||s>r?"Discount must be between 0 and the subtotal.":"";return{subtotal:r,discount:s,total:p?null:w(r-s),error:p,valid:!p}}function E(e){return`<div class="c"><b class="shop">${t(e.shop_name||"Karvio")}</b>
    ${e.shop_address?`<div>${t(e.shop_address)}</div>`:""}
    ${f(e,"<br>")?`<div>${f(e,"<br>")}</div>`:""}</div>`}const M=[["80","80 mm thermal"],["58","58 mm thermal"],["a4","A4 page"],["a5","A5 page"],["custom","Custom"]],k=[["classic","Classic"],["modern","Modern"],["minimal","Minimal"],["business","Business"]];function F(e,a){const s=h.getState().settings,i=s.invoice_paper||String(s.receipt_width||80);if(i==="a4"||i==="a5")return D(()=>import("./salesDocs-BeufaWv6.js"),__vite__mapDeps([0,1,2,3,4,5]),import.meta.url).then(c=>c.printSales([e],i));if(i!=="custom")return P(e,Number(i)||80);const[r,p]=A(s);return P(e,r,p)}const A=e=>[Math.min(Math.max(Number(e.invoice_custom_width)||80,40),216),Number(e.invoice_custom_height)>0?Math.min(Math.max(Number(e.invoice_custom_height),40),1e3):0];async function V(e){const a=h.getState().settings,s=a.invoice_paper||String(a.receipt_width||80);if(s==="a4"||s==="a5")return{html:(await D(()=>import("./salesDocs-BeufaWv6.js"),__vite__mapDeps([0,1,2,3,4,5]),import.meta.url)).saleDocHtml(e,s),paper:s};if(s!=="custom")return{html:N(e,Number(s)||80),paper:"receipt"};const[i,r]=A(a);return{html:N(e,i,r),paper:"receipt"}}function P(e,a,s=0){return y(N(e,a,s))}function N(e,a,s=0){const i=h.getState().settings,r=Number(a||i.receipt_width||80),p=r<=60?r-10:r-8,c=r<=60?10:r>=100?12.5:11.5,l=i.invoice_template||"classic",$=String(i.invoice_note||"").trim(),{sale:o,items:v,customer:m}=e,b=Array.isArray(o.payments)?o.payments:j(o.payments,[]),x=v.map(n=>{const g=S(n.serials);return`<tr><td colspan="3" class="nm">${t(n.name)}</td></tr>
      <tr><td>${t(C(n.qty,n.unit))} × ${t(d(n.price,!1))}</td><td></td><td class="r">${t(d(n.total,!1))}</td></tr>
      ${g.length?`<tr><td colspan="3" class="sm">S/N: ${t(g.join(", "))}</td></tr>`:""}
      ${n.warranty_expiry?`<tr><td colspan="3" class="sm">Warranty: ${t(n.warranty_days)} days (till ${t(u(n.warranty_expiry))})${n.warranty_type==="invoice"?" — keep this receipt":""}</td></tr>`:""}`}).join(""),_=l==="minimal"?"system-ui,'Hind Siliguri',sans-serif":"'Courier New','Hind Siliguri',ui-monospace,monospace";return`
  <style>
    @page{size:${r}mm ${s?s+"mm":"auto"};margin:0}
    body{margin:0;font:${c}px/1.35 ${_};color:#000;width:${p}mm;padding:3mm ${(r-p)/2}mm}
    .c{text-align:center}.shop{font-size:${c+4}px}.r{text-align:right}.sm{font-size:${c-2}px}.nm{padding-top:4px;font-weight:700}
    table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:0}
    hr{border:0;border-top:1px ${l==="minimal"?"solid":"dashed"} #000;margin:5px 0}.tot td{font-weight:700;font-size:${c+1}px}
    .t-modern .head{background:#000;color:#fff;padding:5px 4px;border-radius:4px}.t-modern .tot td{border-top:1.5px solid #000;padding-top:2px}
    .t-modern .ttl{display:block;margin:4px 0;text-align:center;font-weight:800;letter-spacing:.2em}
    .note{margin-top:6px;text-align:left;white-space:pre-wrap;font-size:${c-1}px}
  </style>
  <div class="t-${t(l)}">
  <div class="head">${E(i)}</div>
  ${l==="modern"?'<span class="ttl">INVOICE</span>':"<hr>"}
  <div>Invoice: <b>${t(o.invoice_no)}</b></div>
  <div>Date: ${t(q(o.created_at||o.date))}</div>
  <div>Customer: ${t(o.customer_name)}${m&&m.phones?" ("+t(S(m.phones)[0])+")":""}</div>
  <div>Served by: ${t(o.user_name||"")}</div>
  ${o.status==="cancelled"?'<div class="c"><b>*** CANCELLED ***</b></div>':""}
  <hr>
  <table>${x}</table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td class="r">${t(d(o.subtotal,!1))}</td></tr>
    ${o.discount?`<tr><td>Discount</td><td class="r">-${t(d(o.discount,!1))}</td></tr>`:""}
    <tr class="tot"><td>TOTAL</td><td class="r">${t(d(o.total))}</td></tr>
    ${b.map(n=>`<tr><td>Paid (${t(n.account_name)})</td><td class="r">${t(d(n.amount,!1))}</td></tr>`).join("")}
    ${o.credit_used?`<tr><td>Paid (advance)</td><td class="r">${t(d(o.credit_used,!1))}</td></tr>`:""}
    ${o.due>0?`<tr class="tot"><td>DUE</td><td class="r">${t(d(o.due))}</td></tr>`:""}
    ${m&&m.balance!==void 0?`<tr><td>Total balance due</td><td class="r">${t(d(m.balance,!1))}</td></tr>`:""}
    ${o.next_payment_date&&o.due>0?`<tr><td>Next payment date</td><td class="r">${t(u(o.next_payment_date))}</td></tr>`:""}
  </table>
  <hr>
  <div class="c">${t(i.shop_footer||"Thank you!")}</div>
  <div class="c sm">Goods sold are subject to warranty terms.</div>
  ${$?`<div class="note"><b>Note:</b> ${t($)}</div>`:""}
  </div>`}function j(e,a){try{return JSON.parse(e)}catch{return a}}function Q({title:e,customer:a,phone:s,lines:i,discount:r=0,note:p="",validDays:c=7,no:l,date:$,storedTotals:o}){const v=h.getState().settings,m=l||"Q-"+Date.now().toString().slice(-7),b=o?{...o,valid:!0}:R(i,r),x=b.subtotal;if(!b.valid)throw new Error(b.error);const _=i.map((n,g)=>`<tr><td>${g+1}</td><td><b>${t(n.group||"")}</b>${n.group?"<br>":""}${t(n.name)}</td><td class="r">${t(n.warranty||"—")}</td><td class="r">${t(n.qty)}</td><td class="r">${t(T(n.price))}</td><td class="r">${t(d(o?n.total:n.qty*n.price,!1))}</td></tr>`).join("");y(`
  <style>
    @page{size:A4;margin:14mm}body{font:12px/1.45 system-ui,'Hind Siliguri',sans-serif;color:#111;margin:0}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d1b2a;padding-bottom:10px;margin-bottom:14px}
    h1{margin:0;font-size:22px}h2{margin:0;font-size:26px;letter-spacing:.04em;color:#0d1b2a}
    table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:7px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
    th{background:#0d1b2a;color:#fff;font-weight:600}.r{text-align:right}.tot td{font-weight:700;border:0}.big{font-size:16px}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}.note{margin-top:18px;color:#444}
  </style>
  <div class="top"><div><h1>${t(v.shop_name||"Karvio")}</h1><div>${t(v.shop_address||"")}</div><div>${f(v)}</div></div>
  <div class="r"><h2>QUOTATION</h2><div>${t(m)}</div><div>${t(u($||z()))}</div></div></div>
  <div class="meta"><div><b>Prepared for:</b> ${t(a||"—")}</div><div><b>Phone:</b> ${t(s||"—")}</div>
  <div><b>Subject:</b> ${t(e||"Custom PC build")}</div><div><b>Valid for:</b> ${t(c)} days</div></div>
  <table><thead><tr><th>#</th><th>Item</th><th class="r">Warranty</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
  <tbody>${_}</tbody>
  <tfoot>
    <tr class="tot"><td colspan="5" class="r">Subtotal</td><td class="r">${t(d(x))}</td></tr>
    ${r?`<tr class="tot"><td colspan="5" class="r">Discount</td><td class="r">-${t(d(r))}</td></tr>`:""}
    <tr class="tot big"><td colspan="5" class="r">Grand total</td><td class="r">${t(d(b.total))}</td></tr>
  </tfoot></table>
  ${p?`<div class="note"><b>Notes:</b> ${t(p)}</div>`:""}
  <div class="note">Prices may change with market rates after the validity period. Stock is not reserved until an order is confirmed.</div>`)}function B(e,a,s,i){const r=h.getState().settings,p=a.rows.map(l=>`<tr><td>${t(u(l.date))}</td><td>${t(l.ref_no||"")}</td><td>${t(l.note||l.type)}</td><td class="r">${l.debit?t(d(l.debit,!1)):""}</td><td class="r">${l.credit?t(d(l.credit,!1)):""}</td><td class="r">${t(d(l.balance,!1))}</td></tr>`).join(""),c=e==="customer"?["Sale / paid out","Received"]:["Paid / returned","Purchased"];y(`
  <style>@page{size:A4;margin:14mm}body{font:11.5px/1.45 system-ui,'Hind Siliguri',sans-serif;color:#111;margin:0}
  h1{margin:0;font-size:18px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left}
  th{background:#eef1f6}.r{text-align:right}.b{font-weight:700}</style>
  <h1>${t(r.shop_name||"Karvio")}</h1><div>${t(r.shop_address||"")}</div><div>${f(r)}</div>
  <h3 style="margin:14px 0 4px">${e==="customer"?"Customer":"Supplier"} statement — ${t(a.party)}</h3>
  <div>${t(a.phones||"")} ${t(a.address||"")}</div>
  <div>Period: ${t(s?u(s):"Beginning")} to ${t(i?u(i):"Today")}</div>
  <table><thead><tr><th>Date</th><th>Ref</th><th>Details</th><th class="r">${c[0]}</th><th class="r">${c[1]}</th><th class="r">Balance</th></tr></thead>
  <tbody><tr><td colspan="5" class="b">Opening balance</td><td class="r b">${t(d(a.opening,!1))}</td></tr>${p}
  <tr><td colspan="5" class="b">Closing balance ${a.closing>0?e==="customer"?"(customer owes)":"(payable to supplier)":a.closing<0?"(advance)":""}</td><td class="r b">${t(d(a.closing))}</td></tr></tbody></table>`)}function H(e){var r;const a=h.getState().settings,s=Number(a.receipt_width||80),i=s===58?48:72;y(`<style>@page{size:${s}mm auto;margin:0}body{margin:0;width:${i}mm;padding:3mm ${(s-i)/2}mm;font:11px/1.4 'Courier New','Hind Siliguri',monospace}.c{text-align:center}hr{border:0;border-top:1px dashed #000}</style>
  ${E(a)}<hr><div class="c"><b>MONEY RECEIPT</b></div><div>No: ${t(e.receipt_no)}</div><div>Date: ${t(e.date||(r=e.entry)!=null&&r.date?u(e.date||e.entry.date):"—")}</div>
  <div>Received from: <b>${t(e.customer)}</b></div><div>Amount: <b>${t(d(e.amount))}</b></div><div>Via: ${t(e.account)}</div><hr>
  <div>Remaining balance: <b>${t(d(e.balance))}</b></div><hr><div class="c">${t(a.shop_footer||"")}</div>`)}function K(e){var s;const a=e.receipts||[];if(!a.length)throw new Error("Due payment receipt is missing");H({receipt_no:a.map(i=>i.receipt_no).join(", "),date:a[0].date||((s=a[0].entry)==null?void 0:s.date),customer:a[0].customer,amount:e.amount,account:a.map(i=>i.account+" "+d(i.amount)).join(" + "),balance:a.at(-1).balance})}export{M as P,k as T,K as a,P as b,Q as c,H as d,B as e,T as f,V as i,F as p,R as q};
