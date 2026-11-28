const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./salesDocs-Bz9DXpbM.js","./index-Cw0qLR4K.js","./index-fhKqn36s.css","./export-DzYz1CRd.js","./qr-CN6hI8hC.js"])))=>i.map(i=>d[i]);
import{i as P,_ as L,I as y,f as g,m as c,w as x,u as S,q as z,H as F,n as Q,z as U}from"./index-Cw0qLR4K.js";import{l as V,q as G}from"./qr-CN6hI8hC.js";import{f as W,g as D,i as q,h as j,m as f,j as O,k as R,l as J}from"./salesDocs-Bz9DXpbM.js";import{e as t,p as I,s as E}from"./export-DzYz1CRd.js";const C=e=>Number(e||0).toLocaleString("en-IN",{minimumFractionDigits:Number(e)%1?2:0,maximumFractionDigits:20});function X(e,a){const n=Number(a||0),s=e.every(r=>Number.isFinite(Number(r.qty))&&Number(r.qty)>0&&Number.isFinite(Number(r.price))&&Number(r.price)>=0),o=P(e.reduce((r,b)=>r+P(Number(b.qty)*Number(b.price)),0)),p=!s||!Number.isFinite(o)?"Enter a valid quantity and price for each part.":!Number.isFinite(n)||n<0||n>o?"Discount must be between 0 and the subtotal.":"";return{subtotal:o,discount:n,total:p?null:P(o-n),error:p,valid:!p}}const k={customer:{title:"CUSTOMER STATEMENT",who:"Customer",debit:"Sale / paid out",credit:"Received",pos:"customer owes",neg:"advance"},supplier:{title:"SUPPLIER STATEMENT",who:"Supplier",debit:"Paid / returned",credit:"Purchased",pos:"payable to supplier",neg:"advance paid"}},A=e=>{var a,n;return(((a=e.info)==null?void 0:a.addresses)||((n=e.info)==null?void 0:n.address)||e.address||"").split("|").map(s=>s.trim()).filter(Boolean).join("; ")};function M(e,a,n={}){var b,v;const s=k[e],o=n.from||n.to?`${n.from?g(n.from):"Beginning"} to ${n.to?g(n.to):"Today"}`:"",p=a.rows.map(i=>`<tr><td>${t(g(i.date))}</td><td>${t(i.ref_no||"")}</td><td>${t(i.note||i.type||"")}</td><td class="r">${i.debit?t(c(i.debit,!1)):""}</td><td class="r">${i.credit?t(c(i.credit,!1)):""}</td><td class="r">${t(c(i.balance,!1))}</td></tr>`).join(""),r=a.closing>.004?` (${s.pos})`:a.closing<-.004?` (${s.neg})`:"";return q()?j({title:e==="customer"?"Customer Statement":"Supplier Statement",left:[[s.who,`<b>${t(a.party)}</b>`],["Contact No",t(y(a.phones||"").join(", "))],["Address",t(A(a))]],right:[["Date",t(g(x()))],...o?[["Period",t(o)]]:[],["Balance",`<b>${t(f(a.closing))}${t(r)}</b>`]],cols:[{label:"Date",w:84,cls:"cn"},{label:"Ref",w:110},{label:"Details"},{label:s.debit,w:100,cls:"r"},{label:s.credit,w:100,cls:"r"},{label:"Balance",w:100,cls:"r"}],rows:[{span:["Opening balance",t(f(a.opening))]},...a.rows.map(i=>[t(g(i.date)),t(i.ref_no||""),t(i.note||i.type||""),i.debit?t(f(i.debit)):"",i.credit?t(f(i.credit)):"",t(f(i.balance))]),{span:[`Closing balance${t(r)}`,t(f(a.closing))]}],foot:(b=a.info)!=null&&b.note?`<div class="bfootnote"><b>Note:</b> ${t(a.info.note)}</div>`:"",sign:"Authorised Signature"}):`${O()}${R(s.title,`${t(g(x()))}${o?`<br><span class="sm">Period: ${t(o)}</span>`:""}`)}
    <div class="box sgrid">
      <div><b class="t">${s.who}</b><b>${t(a.party)}</b></div>
      <div><b class="t">Phone</b>${t(y(a.phones||"").join(", ")||"—")}</div>
      <div><b class="t">Address</b>${t(A(a)||"—")}</div>
      <div><b class="t">Balance</b><b>${t(c(a.closing))}${t(r)}</b></div>
      ${(v=a.info)!=null&&v.note?`<div style="grid-column:1/-1"><b class="t">Note</b>${t(a.info.note)}</div>`:""}
    </div>
    <table><thead><tr><th style="width:84px">Date</th><th style="width:100px">Ref</th><th>Details</th><th class="r" style="width:96px">${s.debit}</th><th class="r" style="width:96px">${s.credit}</th><th class="r" style="width:96px">Balance</th></tr></thead>
    <tbody><tr class="b"><td colspan="5">Opening balance</td><td class="r">${t(c(a.opening,!1))}</td></tr>${p||'<tr><td colspan="6">No transactions</td></tr>'}
    <tr class="b"><td colspan="5">Closing balance${t(r)}</td><td class="r">${t(c(a.closing))}</td></tr></tbody></table>
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Signature: ____________________</span></div>
  </div>`}const K=(e,a,n)=>D(a.map(s=>M(e,s,n))),ot=(e,a,n,s)=>W(a.map(o=>M(e,o,s)),n);async function rt(e,a,n){const s=await L(()=>import("./xlsx-CVny20fG.js"),[],import.meta.url),o=k[e],p=[[o.who,"Phones","Address","Opening balance","Balance","Status","Note"]],r=[[o.who,"Date","Ref","Details",o.debit,o.credit,"Balance"]];a.forEach(l=>{var m,u,_;p.push([l.party,y(l.phones||"").join(", "),A(l),((m=l.info)==null?void 0:m.opening_balance)??l.opening,l.closing,((u=l.info)==null?void 0:u.active)===!1?"Inactive":"Active",((_=l.info)==null?void 0:_.note)||""]),r.push([l.party,"","","Opening balance","","",l.opening]),l.rows.forEach($=>r.push([l.party,String($.date).slice(0,10),$.ref_no||"",$.note||$.type||"",$.debit||0,$.credit||0,$.balance])),r.push([l.party,"","","Closing balance","","",l.closing])});const b=s.utils.book_new(),v=s.utils.aoa_to_sheet(p);v["!cols"]=[{wch:28},{wch:26},{wch:40},{wch:14},{wch:14},{wch:10},{wch:30}];const i=s.utils.aoa_to_sheet(r);i["!cols"]=[{wch:28},{wch:12},{wch:16},{wch:44},{wch:14},{wch:14},{wch:14}],s.utils.book_append_sheet(b,v,e==="customer"?"Customers":"Suppliers"),s.utils.book_append_sheet(b,i,"Ledger"),s.writeFile(b,n)}function B(e){return`<div class="c"><b class="shop">${t(e.shop_name||"Karvio")}</b>
    ${e.shop_address?`<div>${t(e.shop_address)}</div>`:""}
    ${E(e,"<br>")?`<div>${E(e,"<br>")}</div>`:""}</div>`}const dt=[["80","80 mm thermal"],["58","58 mm thermal"],["a4","A4 page"],["a5","A5 page"],["custom","Custom"]],ct=[["classic","Classic"],["modern","Modern"],["minimal","Minimal"],["business","Business"]];function lt(e,a){const n=S.getState().settings,s=n.invoice_paper||String(n.receipt_width||80);if(s==="a4"||s==="a5")return L(()=>import("./salesDocs-Bz9DXpbM.js").then(r=>r.w),__vite__mapDeps([0,1,2,3,4]),import.meta.url).then(r=>r.printSales([e],s));if(s!=="custom")return T(e,Number(s)||80);const[o,p]=Y(n);return T(e,o,p)}const Y=e=>[Math.min(Math.max(Number(e.invoice_custom_width)||80,40),216),Number(e.invoice_custom_height)>0?Math.min(Math.max(Number(e.invoice_custom_height),40),1e3):0];function T(e,a,n=0){return I(Z(e,a,n))}function Z(e,a,n=0){const s=S.getState().settings,o=Number(a||s.receipt_width||80),p=o<=60?o-10:o-8,r=o<=60?10:o>=100?12.5:11.5,b=s.invoice_template||"classic",v=String(s.invoice_note||"").trim(),{sale:i,items:l,customer:m}=e,u=J(e),_=Array.isArray(i.payments)?i.payments:tt(i.payments,[]),$=l.map(h=>{const d=y(h.serials);return`<tr><td colspan="3" class="nm">${t(h.name)}</td></tr>
      <tr><td>${t(z(h.qty,h.unit))} × ${t(F(h.price))}</td><td></td><td class="r">${t(c(h.total,!1))}</td></tr>
      ${d.length?`<tr><td colspan="3" class="sm">S/N: ${t(d.join(", "))}</td></tr>`:""}
      ${h.warranty_expiry?`<tr><td colspan="3" class="sm">Warranty: ${t(h.warranty_days)} days (till ${t(g(h.warranty_expiry))})${h.warranty_type==="invoice"?" — keep this receipt":""}</td></tr>`:""}`}).join(""),N=b==="minimal"?"system-ui,'Hind Siliguri',sans-serif":"'Courier New','Hind Siliguri',ui-monospace,monospace";return`
  <style>
    @page{size:${o}mm ${n?n+"mm":"auto"};margin:0}
    body{margin:0;font:${r}px/1.35 ${N};color:#000;width:${p}mm;padding:3mm ${(o-p)/2}mm}
    .c{text-align:center}.shop{font-size:${r+4}px}.r{text-align:right}.sm{font-size:${r-2}px}.nm{padding-top:4px;font-weight:700}
    table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:0}
    hr{border:0;border-top:1px ${b==="minimal"?"solid":"dashed"} #000;margin:5px 0}.tot td{font-weight:700;font-size:${r+1}px}
    .t-modern .head{background:#000;color:#fff;padding:5px 4px;border-radius:4px}.t-modern .tot td{border-top:1.5px solid #000;padding-top:2px}
    .t-modern .ttl{display:block;margin:4px 0;text-align:center;font-weight:800;letter-spacing:.2em}
    .note{margin-top:6px;text-align:left;white-space:pre-wrap;font-size:${r-1}px}
    .rlogo{display:block;margin:0 auto 4px;max-width:60%;max-height:22mm;object-fit:contain;filter:grayscale(1)}
    .rqr{display:block;margin:6px auto 2px;width:24mm;height:24mm}.rqr svg{width:100%;height:100%;display:block}
  </style>
  <div class="t-${t(b)}">
  <div class="head">${V(s,"rlogo")}${B(s)}</div>
  ${b==="modern"?'<span class="ttl">INVOICE</span>':"<hr>"}
  <div>Invoice: <b>${t(i.invoice_no)}</b></div>
  <div>Date: ${t(Q(i.created_at||i.date))}</div>
  <div>Customer: ${t(i.customer_name)}${m&&m.phones?" ("+t(y(m.phones)[0])+")":""}</div>
  <div>Served by: ${t(U(i.user_name||""))}</div>
  ${i.status==="cancelled"?'<div class="c"><b>*** CANCELLED ***</b></div>':""}
  <hr>
  <table>${$}</table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td class="r">${t(c(i.subtotal,!1))}</td></tr>
    ${i.discount?`<tr><td>Discount</td><td class="r">-${t(c(i.discount,!1))}</td></tr>`:""}
    <tr class="tot"><td>TOTAL</td><td class="r">${t(c(i.total))}</td></tr>
    ${u.returned>0?`<tr><td>Returned value</td><td class="r">${t(c(u.returned,!1))}</td></tr><tr><td>Net invoice amount</td><td class="r">${t(c(u.net,!1))}</td></tr>`:""}
    ${_.map(h=>`<tr><td>${u.current?"At sale":"Paid"} (${t(h.account_name)})</td><td class="r">${t(c(h.amount,!1))}</td></tr>`).join("")}
    ${i.credit_used?`<tr><td>${u.current?"At sale":"Paid"} (advance)</td><td class="r">${t(c(i.credit_used,!1))}</td></tr>`:""}
    ${u.current?`<tr><td>Paid now</td><td class="r">${t(c(u.paid,!1))}</td></tr>`:""}
    ${u.due>0?`<tr class="tot"><td>DUE</td><td class="r">${t(c(u.due))}</td></tr>`:""}
    ${m&&m.balance!==void 0?`<tr><td>${m.balance<0?"Customer advance":"Total balance due"}</td><td class="r">${t(c(Math.abs(m.balance),!1))}</td></tr>`:""}
    ${i.next_payment_date&&(i.due_now??i.due)>0?`<tr><td>Next payment date</td><td class="r">${t(g(i.next_payment_date))}</td></tr>`:""}
  </table>
  <hr>
  <div class="c">${t(s.shop_footer||"Thank you!")}</div>
  <div class="c sm">Goods sold are subject to warranty terms.</div>
  ${String(s.invoice_qr??"true")!=="false"&&i.invoice_no?`<div class="rqr">${G(i.invoice_no,2)}</div><div class="c sm">Scan at the shop to find this invoice</div>`:""}
  ${v?`<div class="note"><b>Note:</b> ${t(v)}</div>`:""}
  </div>`}function tt(e,a){try{return JSON.parse(e)}catch{return a}}function pt({title:e,customer:a,phone:n,lines:s,discount:o=0,note:p="",validDays:r=7,no:b,date:v,storedTotals:i}){S.getState().settings;const l=b||"Q-"+Date.now().toString().slice(-7),m=i?{...i,valid:!0}:X(s,o),u=m.subtotal;if(!m.valid)throw new Error(m.error);const _=s.map((d,w)=>`<tr><td>${w+1}</td><td><b>${t(d.group||"")}</b>${d.group?"<br>":""}${t(d.name)}</td><td class="r">${t(d.warranty||"—")}</td><td class="r">${t(d.qty)}</td><td class="r">${t(C(d.price))}</td><td class="r">${t(c(i?d.total:d.qty*d.price,!1))}</td></tr>`).join(""),$=r?`${r} days`:"—",N=`${p?`<div class="note-box"><b>Notes:</b> ${t(p)}</div>`:""}<div class="note-box sm">Prices may change with market rates after the validity period. Stock is not reserved until an order is confirmed.</div>`,h=[["Subtotal",t(c(u))],...o?[["Discount","-"+t(c(o))]]:[],["Grand total",t(c(m.total)),!0]];return q()?D([j({title:"Quotation",left:[["Prepared For",`<b>${t(a||"—")}</b>`],["Contact No",t(n||"")],["Subject",t(e||"Custom PC build")]],right:[["Quotation No",`<b>${t(l)}</b>`],["Date",t(g(v||x()))],["Valid For",t($)]],cols:[{label:"S/L",w:38,cls:"cn"},{label:"Item Descriptions"},{label:"Warranty",w:80,cls:"cn"},{label:"Unit Price",w:96,cls:"r"},{label:"Quantity",w:72,cls:"cn"},{label:"Total",w:100,cls:"r"}],rows:s.map((d,w)=>[w+1,`${d.group?`<b>${t(d.group)}</b><br>`:""}${t(d.name)}`,t(d.warranty||"—"),t(C(d.price)),t(d.qty),t(f(i?d.total:d.qty*d.price))]),words:Number(m.total)||0,totals:[["TOTAL",t(f(u))],["Discount",t(f(o||0))],["Grand TOTAL",t(f(m.total)),!0]],foot:`${p?`<div class="bfootnote"><b>Notes:</b> ${t(p)}</div>`:""}<div class="bfootnote">Prices may change with market rates after the validity period. Stock is not reserved until an order is confirmed.</div>`})]):D([`${O()}${R("QUOTATION",`<b>${t(l)}</b><br>${t(g(v||x()))}`)}
    <div class="meta">
      <div class="box"><b class="t">Prepared for</b><b>${t(a||"—")}</b><div>Phone: ${t(n||"—")}</div></div>
      <div class="box"><b class="t">Subject</b><b>${t(e||"Custom PC build")}</b><div>Valid for: ${t($)}</div></div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Item</th><th class="r" style="width:80px">Warranty</th><th class="r" style="width:56px">Qty</th><th class="r" style="width:90px">Unit price</th><th class="r" style="width:96px">Amount</th></tr></thead><tbody>${_}</tbody>
    <tfoot class="qtot">${h.map(([d,w,H])=>`<tr class="${H?"big":""}"><td colspan="5" class="r">${d}</td><td class="r">${w}</td></tr>`).join("")}</tfoot></table>
    ${N}
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Authorised signature: ____________________</span></div></div>`])}function mt(e,a,n,s){return K(e,[a],{from:n,to:s})}function et(e){var o;const a=S.getState().settings,n=Number(a.receipt_width||80),s=n===58?48:72;I(`<style>@page{size:${n}mm auto;margin:0}body{margin:0;width:${s}mm;padding:3mm ${(n-s)/2}mm;font:11px/1.4 'Courier New','Hind Siliguri',monospace}.c{text-align:center}hr{border:0;border-top:1px dashed #000}</style>
  ${B(a)}<hr><div class="c"><b>MONEY RECEIPT</b></div><div>No: ${t(e.receipt_no)}</div><div>Date: ${t(e.date||(o=e.entry)!=null&&o.date?g(e.date||e.entry.date):"—")}</div>
  <div>Received from: <b>${t(e.customer)}</b></div><div>Amount: <b>${t(c(e.amount))}</b></div><div>Via: ${t(e.account)}</div><hr>
  <div>Remaining balance: <b>${t(c(e.balance))}</b></div><hr><div class="c">${t(a.shop_footer||"")}</div>`)}function bt(e){var n;const a=e.receipts||[];if(!a.length)throw new Error("Due payment receipt is missing");et({receipt_no:a.map(s=>s.receipt_no).join(", "),date:a[0].date||((n=a[0].entry)==null?void 0:n.date),customer:a[0].customer,amount:e.amount,account:a.map(s=>s.account+" "+c(s.amount)).join(" + "),balance:a.at(-1).balance})}export{dt as P,ct as T,bt as a,T as b,pt as c,et as d,mt as e,ot as f,rt as g,K as h,C as i,lt as p,X as q};
