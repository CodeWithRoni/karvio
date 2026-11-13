const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./salesDocs-C8ZUrFzj.js","./index-R24mDvRS.js","./index-Cgu6MHHI.css","./format-Dtky_YOR.js","./export-C_KygVk8.js","./purchaseDocs-CGEqge95.js"])))=>i.map(i=>d[i]);
import{u as h,_ as E}from"./index-R24mDvRS.js";import{r as _,m as n,f as b,s as S,q as C,b as T,t as z}from"./format-Dtky_YOR.js";import{p as g,e as t,s as $}from"./export-C_KygVk8.js";function q(e,s){const a=Number(s||0),i=e.every(d=>Number.isFinite(Number(d.qty))&&Number(d.qty)>0&&Number.isFinite(Number(d.price))&&Number(d.price)>=0),r=_(e.reduce((d,c)=>d+_(Number(c.qty)*Number(c.price)),0)),p=!i||!Number.isFinite(r)?"Enter a valid quantity and price for each part.":!Number.isFinite(a)||a<0||a>r?"Discount must be between 0 and the subtotal.":"";return{subtotal:r,discount:a,total:p?null:_(r-a),error:p,valid:!p}}function D(e){return`<div class="c"><b class="shop">${t(e.shop_name||"Karvio")}</b>
    ${e.shop_address?`<div>${t(e.shop_address)}</div>`:""}
    ${$(e,"<br>")?`<div>${$(e,"<br>")}</div>`:""}</div>`}const L=[["80","80 mm thermal"],["58","58 mm thermal"],["a4","A4 page"],["a5","A5 page"],["custom","Custom"]],M=[["classic","Classic"],["modern","Modern"],["minimal","Minimal"],["business","Business"]];function k(e,s){const a=h.getState().settings,i=a.invoice_paper||String(a.receipt_width||80);if(i==="a4"||i==="a5")return E(()=>import("./salesDocs-C8ZUrFzj.js"),__vite__mapDeps([0,1,2,3,4,5]),import.meta.url).then(d=>d.printSales([e],i));if(i!=="custom")return P(e,Number(i)||80);const[r,p]=A(a);return P(e,r,p)}const A=e=>[Math.min(Math.max(Number(e.invoice_custom_width)||80,40),216),Number(e.invoice_custom_height)>0?Math.min(Math.max(Number(e.invoice_custom_height),40),1e3):0];async function V(e){const s=h.getState().settings,a=s.invoice_paper||String(s.receipt_width||80);if(a==="a4"||a==="a5")return{html:(await E(()=>import("./salesDocs-C8ZUrFzj.js"),__vite__mapDeps([0,1,2,3,4,5]),import.meta.url)).saleDocHtml(e,a),paper:a};if(a!=="custom")return{html:w(e,Number(a)||80),paper:"receipt"};const[i,r]=A(s);return{html:w(e,i,r),paper:"receipt"}}function P(e,s,a=0){return g(w(e,s,a))}function w(e,s,a=0){const i=h.getState().settings,r=Number(s||i.receipt_width||80),p=r<=60?r-10:r-8,d=r<=60?10:r>=100?12.5:11.5,c=i.invoice_template||"classic",v=String(i.invoice_note||"").trim(),{sale:o,items:f,customer:m}=e,y=Array.isArray(o.payments)?o.payments:R(o.payments,[]),x=f.map(l=>{const N=S(l.serials);return`<tr><td colspan="3" class="nm">${t(l.name)}</td></tr>
      <tr><td>${t(C(l.qty,l.unit))} × ${t(n(l.price,!1))}</td><td></td><td class="r">${t(n(l.total,!1))}</td></tr>
      ${N.length?`<tr><td colspan="3" class="sm">S/N: ${t(N.join(", "))}</td></tr>`:""}
      ${l.warranty_expiry?`<tr><td colspan="3" class="sm">Warranty: ${t(l.warranty_days)} days (till ${t(b(l.warranty_expiry))})${l.warranty_type==="invoice"?" — keep this receipt":""}</td></tr>`:""}`}).join(""),u=c==="minimal"?"system-ui,'Hind Siliguri',sans-serif":"'Courier New','Hind Siliguri',ui-monospace,monospace";return`
  <style>
    @page{size:${r}mm ${a?a+"mm":"auto"};margin:0}
    body{margin:0;font:${d}px/1.35 ${u};color:#000;width:${p}mm;padding:3mm ${(r-p)/2}mm}
    .c{text-align:center}.shop{font-size:${d+4}px}.r{text-align:right}.sm{font-size:${d-2}px}.nm{padding-top:4px;font-weight:700}
    table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:0}
    hr{border:0;border-top:1px ${c==="minimal"?"solid":"dashed"} #000;margin:5px 0}.tot td{font-weight:700;font-size:${d+1}px}
    .t-modern .head{background:#000;color:#fff;padding:5px 4px;border-radius:4px}.t-modern .tot td{border-top:1.5px solid #000;padding-top:2px}
    .t-modern .ttl{display:block;margin:4px 0;text-align:center;font-weight:800;letter-spacing:.2em}
    .note{margin-top:6px;text-align:left;white-space:pre-wrap;font-size:${d-1}px}
  </style>
  <div class="t-${t(c)}">
  <div class="head">${D(i)}</div>
  ${c==="modern"?'<span class="ttl">INVOICE</span>':"<hr>"}
  <div>Invoice: <b>${t(o.invoice_no)}</b></div>
  <div>Date: ${t(T(o.created_at||o.date))}</div>
  <div>Customer: ${t(o.customer_name)}${m&&m.phones?" ("+t(S(m.phones)[0])+")":""}</div>
  <div>Served by: ${t(o.user_name||"")}</div>
  ${o.status==="cancelled"?'<div class="c"><b>*** CANCELLED ***</b></div>':""}
  <hr>
  <table>${x}</table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td class="r">${t(n(o.subtotal,!1))}</td></tr>
    ${o.discount?`<tr><td>Discount</td><td class="r">-${t(n(o.discount,!1))}</td></tr>`:""}
    <tr class="tot"><td>TOTAL</td><td class="r">${t(n(o.total))}</td></tr>
    ${y.map(l=>`<tr><td>Paid (${t(l.account_name)})</td><td class="r">${t(n(l.amount,!1))}</td></tr>`).join("")}
    ${o.credit_used?`<tr><td>Paid (advance)</td><td class="r">${t(n(o.credit_used,!1))}</td></tr>`:""}
    ${o.due>0?`<tr class="tot"><td>DUE</td><td class="r">${t(n(o.due))}</td></tr>`:""}
    ${m&&m.balance!==void 0?`<tr><td>Total balance due</td><td class="r">${t(n(m.balance,!1))}</td></tr>`:""}
    ${o.next_payment_date&&o.due>0?`<tr><td>Next payment date</td><td class="r">${t(b(o.next_payment_date))}</td></tr>`:""}
  </table>
  <hr>
  <div class="c">${t(i.shop_footer||"Thank you!")}</div>
  <div class="c sm">Goods sold are subject to warranty terms.</div>
  ${v?`<div class="note"><b>Note:</b> ${t(v)}</div>`:""}
  </div>`}function R(e,s){try{return JSON.parse(e)}catch{return s}}function F({title:e,customer:s,phone:a,lines:i,discount:r=0,note:p="",validDays:d=7,no:c,date:v}){const o=h.getState().settings,f=c||"Q-"+Date.now().toString().slice(-7),m=q(i,r),y=m.subtotal;if(!m.valid)throw new Error(m.error);const x=i.map((u,l)=>`<tr><td>${l+1}</td><td><b>${t(u.group||"")}</b>${u.group?"<br>":""}${t(u.name)}</td><td class="r">${t(u.warranty||"—")}</td><td class="r">${t(u.qty)}</td><td class="r">${t(n(u.price,!1))}</td><td class="r">${t(n(u.qty*u.price,!1))}</td></tr>`).join("");g(`
  <style>
    @page{size:A4;margin:14mm}body{font:12px/1.45 system-ui,'Hind Siliguri',sans-serif;color:#111;margin:0}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d1b2a;padding-bottom:10px;margin-bottom:14px}
    h1{margin:0;font-size:22px}h2{margin:0;font-size:26px;letter-spacing:.04em;color:#0d1b2a}
    table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:7px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
    th{background:#0d1b2a;color:#fff;font-weight:600}.r{text-align:right}.tot td{font-weight:700;border:0}.big{font-size:16px}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}.note{margin-top:18px;color:#444}
  </style>
  <div class="top"><div><h1>${t(o.shop_name||"Karvio")}</h1><div>${t(o.shop_address||"")}</div><div>${$(o)}</div></div>
  <div class="r"><h2>QUOTATION</h2><div>${t(f)}</div><div>${t(b(v||z()))}</div></div></div>
  <div class="meta"><div><b>Prepared for:</b> ${t(s||"—")}</div><div><b>Phone:</b> ${t(a||"—")}</div>
  <div><b>Subject:</b> ${t(e||"Custom PC build")}</div><div><b>Valid for:</b> ${t(d)} days</div></div>
  <table><thead><tr><th>#</th><th>Item</th><th class="r">Warranty</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
  <tbody>${x}</tbody>
  <tfoot>
    <tr class="tot"><td colspan="5" class="r">Subtotal</td><td class="r">${t(n(y))}</td></tr>
    ${r?`<tr class="tot"><td colspan="5" class="r">Discount</td><td class="r">-${t(n(r))}</td></tr>`:""}
    <tr class="tot big"><td colspan="5" class="r">Grand total</td><td class="r">${t(n(m.total))}</td></tr>
  </tfoot></table>
  ${p?`<div class="note"><b>Notes:</b> ${t(p)}</div>`:""}
  <div class="note">Prices may change with market rates after the validity period. Stock is not reserved until an order is confirmed.</div>`)}function Q(e,s,a,i){const r=h.getState().settings,p=s.rows.map(c=>`<tr><td>${t(b(c.date))}</td><td>${t(c.ref_no||"")}</td><td>${t(c.note||c.type)}</td><td class="r">${c.debit?t(n(c.debit,!1)):""}</td><td class="r">${c.credit?t(n(c.credit,!1)):""}</td><td class="r">${t(n(c.balance,!1))}</td></tr>`).join(""),d=e==="customer"?["Sale / paid out","Received"]:["Paid / returned","Purchased"];g(`
  <style>@page{size:A4;margin:14mm}body{font:11.5px/1.45 system-ui,'Hind Siliguri',sans-serif;color:#111;margin:0}
  h1{margin:0;font-size:18px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left}
  th{background:#eef1f6}.r{text-align:right}.b{font-weight:700}</style>
  <h1>${t(r.shop_name||"Karvio")}</h1><div>${t(r.shop_address||"")}</div><div>${$(r)}</div>
  <h3 style="margin:14px 0 4px">${e==="customer"?"Customer":"Supplier"} statement — ${t(s.party)}</h3>
  <div>${t(s.phones||"")} ${t(s.address||"")}</div>
  <div>Period: ${t(a?b(a):"Beginning")} to ${t(i?b(i):"Today")}</div>
  <table><thead><tr><th>Date</th><th>Ref</th><th>Details</th><th class="r">${d[0]}</th><th class="r">${d[1]}</th><th class="r">Balance</th></tr></thead>
  <tbody><tr><td colspan="5" class="b">Opening balance</td><td class="r b">${t(n(s.opening,!1))}</td></tr>${p}
  <tr><td colspan="5" class="b">Closing balance ${s.closing>0?e==="customer"?"(customer owes)":"(payable to supplier)":s.closing<0?"(advance)":""}</td><td class="r b">${t(n(s.closing))}</td></tr></tbody></table>`)}function j(e){const s=h.getState().settings,a=Number(s.receipt_width||80),i=a===58?48:72;g(`<style>@page{size:${a}mm auto;margin:0}body{margin:0;width:${i}mm;padding:3mm ${(a-i)/2}mm;font:11px/1.4 'Courier New','Hind Siliguri',monospace}.c{text-align:center}hr{border:0;border-top:1px dashed #000}</style>
  ${D(s)}<hr><div class="c"><b>MONEY RECEIPT</b></div><div>No: ${t(e.receipt_no)}</div><div>Date: ${t(e.date?b(e.date):new Date().toLocaleString())}</div>
  <div>Received from: <b>${t(e.customer)}</b></div><div>Amount: <b>${t(n(e.amount))}</b></div><div>Via: ${t(e.account)}</div><hr>
  <div>Remaining balance: <b>${t(n(e.balance))}</b></div><hr><div class="c">${t(s.shop_footer||"")}</div>`)}function B(e){const s=e.receipts||[];if(!s.length)throw new Error("Due payment receipt is missing");j({receipt_no:s.map(a=>a.receipt_no).join(", "),customer:s[0].customer,amount:e.amount,account:s.map(a=>a.account+" "+n(a.amount)).join(" + "),balance:s.at(-1).balance})}export{L as P,M as T,B as a,P as b,F as c,j as d,Q as e,V as i,k as p,q};
