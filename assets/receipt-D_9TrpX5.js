const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./salesDocs-kInvqzqC.js","./index-CqG2RKLT.js","./index-C8esFbIF.css","./export-Bb_iKgai.js","./qr-CN6hI8hC.js"])))=>i.map(i=>d[i]);
import{i as P,_ as q,H as y,f as v,m as c,w as S,u as N,q as z,G as F,n as Q,z as U}from"./index-CqG2RKLT.js";import{l as V,q as G}from"./qr-CN6hI8hC.js";import{m as W,n as D,o as L,q as O,r as g,t as j,u as R}from"./salesDocs-kInvqzqC.js";import{e as t,p as I,s as T}from"./export-Bb_iKgai.js";const A=e=>Number(e||0).toLocaleString("en-IN",{minimumFractionDigits:Number(e)%1?2:0,maximumFractionDigits:20});function J(e,a){const o=Number(a||0),i=e.every(r=>Number.isFinite(Number(r.qty))&&Number(r.qty)>0&&Number.isFinite(Number(r.price))&&Number(r.price)>=0),n=P(e.reduce((r,m)=>r+P(Number(m.qty)*Number(m.price)),0)),p=!i||!Number.isFinite(n)?"Enter a valid quantity and price for each part.":!Number.isFinite(o)||o<0||o>n?"Discount must be between 0 and the subtotal.":"";return{subtotal:n,discount:o,total:p?null:P(n-o),error:p,valid:!p}}const k={customer:{title:"CUSTOMER STATEMENT",who:"Customer",debit:"Sale / paid out",credit:"Received",pos:"customer owes",neg:"advance"},supplier:{title:"SUPPLIER STATEMENT",who:"Supplier",debit:"Paid / returned",credit:"Purchased",pos:"payable to supplier",neg:"advance paid"}},E=e=>{var a,o;return(((a=e.info)==null?void 0:a.addresses)||((o=e.info)==null?void 0:o.address)||e.address||"").split("|").map(i=>i.trim()).filter(Boolean).join("; ")};function M(e,a,o={}){var m,$;const i=k[e],n=o.from||o.to?`${o.from?v(o.from):"Beginning"} to ${o.to?v(o.to):"Today"}`:"",p=a.rows.map(s=>`<tr><td>${t(v(s.date))}</td><td>${t(s.ref_no||"")}</td><td>${t(s.note||s.type||"")}</td><td class="r">${s.debit?t(c(s.debit,!1)):""}</td><td class="r">${s.credit?t(c(s.credit,!1)):""}</td><td class="r">${t(c(s.balance,!1))}</td></tr>`).join(""),r=a.closing>.004?` (${i.pos})`:a.closing<-.004?` (${i.neg})`:"";return L()?O({title:e==="customer"?"Customer Statement":"Supplier Statement",left:[[i.who,`<b>${t(a.party)}</b>`],["Contact No",t(y(a.phones||"").join(", "))],["Address",t(E(a))]],right:[["Date",t(v(S()))],...n?[["Period",t(n)]]:[],["Balance",`<b>${t(g(a.closing))}${t(r)}</b>`]],cols:[{label:"Date",w:84,cls:"cn"},{label:"Ref",w:110},{label:"Details"},{label:i.debit,w:100,cls:"r"},{label:i.credit,w:100,cls:"r"},{label:"Balance",w:100,cls:"r"}],rows:[{span:["Opening balance",t(g(a.opening))]},...a.rows.map(s=>[t(v(s.date)),t(s.ref_no||""),t(s.note||s.type||""),s.debit?t(g(s.debit)):"",s.credit?t(g(s.credit)):"",t(g(s.balance))]),{span:[`Closing balance${t(r)}`,t(g(a.closing))]}],foot:(m=a.info)!=null&&m.note?`<div class="bfootnote"><b>Note:</b> ${t(a.info.note)}</div>`:"",sign:"Authorised Signature"}):`${j()}${R(i.title,`${t(v(S()))}${n?`<br><span class="sm">Period: ${t(n)}</span>`:""}`)}
    <div class="box sgrid">
      <div><b class="t">${i.who}</b><b>${t(a.party)}</b></div>
      <div><b class="t">Phone</b>${t(y(a.phones||"").join(", ")||"—")}</div>
      <div><b class="t">Address</b>${t(E(a)||"—")}</div>
      <div><b class="t">Balance</b><b>${t(c(a.closing))}${t(r)}</b></div>
      ${($=a.info)!=null&&$.note?`<div style="grid-column:1/-1"><b class="t">Note</b>${t(a.info.note)}</div>`:""}
    </div>
    <table><thead><tr><th style="width:84px">Date</th><th style="width:100px">Ref</th><th>Details</th><th class="r" style="width:96px">${i.debit}</th><th class="r" style="width:96px">${i.credit}</th><th class="r" style="width:96px">Balance</th></tr></thead>
    <tbody><tr class="b"><td colspan="5">Opening balance</td><td class="r">${t(c(a.opening,!1))}</td></tr>${p||'<tr><td colspan="6">No transactions</td></tr>'}
    <tr class="b"><td colspan="5">Closing balance${t(r)}</td><td class="r">${t(c(a.closing))}</td></tr></tbody></table>
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Signature: ____________________</span></div>
  </div>`}const X=(e,a,o)=>D(a.map(i=>M(e,i,o))),ot=(e,a,o)=>W(a.map(i=>M(e,i)),o);async function nt(e,a,o){const i=await q(()=>import("./xlsx-CVny20fG.js"),[],import.meta.url),n=k[e],p=[[n.who,"Phones","Address","Opening balance","Balance","Status","Note"]],r=[[n.who,"Date","Ref","Details",n.debit,n.credit,"Balance"]];a.forEach(l=>{var b,f,_;p.push([l.party,y(l.phones||"").join(", "),E(l),((b=l.info)==null?void 0:b.opening_balance)??l.opening,l.closing,((f=l.info)==null?void 0:f.active)===!1?"Inactive":"Active",((_=l.info)==null?void 0:_.note)||""]),r.push([l.party,"","","Opening balance","","",l.opening]),l.rows.forEach(h=>r.push([l.party,String(h.date).slice(0,10),h.ref_no||"",h.note||h.type||"",h.debit||0,h.credit||0,h.balance])),r.push([l.party,"","","Closing balance","","",l.closing])});const m=i.utils.book_new(),$=i.utils.aoa_to_sheet(p);$["!cols"]=[{wch:28},{wch:26},{wch:40},{wch:14},{wch:14},{wch:10},{wch:30}];const s=i.utils.aoa_to_sheet(r);s["!cols"]=[{wch:28},{wch:12},{wch:16},{wch:44},{wch:14},{wch:14},{wch:14}],i.utils.book_append_sheet(m,$,e==="customer"?"Customers":"Suppliers"),i.utils.book_append_sheet(m,s,"Ledger"),i.writeFile(m,o)}function B(e){return`<div class="c"><b class="shop">${t(e.shop_name||"Karvio")}</b>
    ${e.shop_address?`<div>${t(e.shop_address)}</div>`:""}
    ${T(e,"<br>")?`<div>${T(e,"<br>")}</div>`:""}</div>`}const rt=[["80","80 mm thermal"],["58","58 mm thermal"],["a4","A4 page"],["a5","A5 page"],["custom","Custom"]],dt=[["classic","Classic"],["modern","Modern"],["minimal","Minimal"],["business","Business"]];function ct(e,a){const o=N.getState().settings,i=o.invoice_paper||String(o.receipt_width||80);if(i==="a4"||i==="a5")return q(()=>import("./salesDocs-kInvqzqC.js").then(r=>r.v),__vite__mapDeps([0,1,2,3,4]),import.meta.url).then(r=>r.printSales([e],i));if(i!=="custom")return C(e,Number(i)||80);const[n,p]=K(o);return C(e,n,p)}const K=e=>[Math.min(Math.max(Number(e.invoice_custom_width)||80,40),216),Number(e.invoice_custom_height)>0?Math.min(Math.max(Number(e.invoice_custom_height),40),1e3):0];function C(e,a,o=0){return I(Y(e,a,o))}function Y(e,a,o=0){const i=N.getState().settings,n=Number(a||i.receipt_width||80),p=n<=60?n-10:n-8,r=n<=60?10:n>=100?12.5:11.5,m=i.invoice_template||"classic",$=String(i.invoice_note||"").trim(),{sale:s,items:l,customer:b}=e,f=Array.isArray(s.payments)?s.payments:Z(s.payments,[]),_=l.map(u=>{const x=y(u.serials);return`<tr><td colspan="3" class="nm">${t(u.name)}</td></tr>
      <tr><td>${t(z(u.qty,u.unit))} × ${t(F(u.price))}</td><td></td><td class="r">${t(c(u.total,!1))}</td></tr>
      ${x.length?`<tr><td colspan="3" class="sm">S/N: ${t(x.join(", "))}</td></tr>`:""}
      ${u.warranty_expiry?`<tr><td colspan="3" class="sm">Warranty: ${t(u.warranty_days)} days (till ${t(v(u.warranty_expiry))})${u.warranty_type==="invoice"?" — keep this receipt":""}</td></tr>`:""}`}).join(""),h=m==="minimal"?"system-ui,'Hind Siliguri',sans-serif":"'Courier New','Hind Siliguri',ui-monospace,monospace";return`
  <style>
    @page{size:${n}mm ${o?o+"mm":"auto"};margin:0}
    body{margin:0;font:${r}px/1.35 ${h};color:#000;width:${p}mm;padding:3mm ${(n-p)/2}mm}
    .c{text-align:center}.shop{font-size:${r+4}px}.r{text-align:right}.sm{font-size:${r-2}px}.nm{padding-top:4px;font-weight:700}
    table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:0}
    hr{border:0;border-top:1px ${m==="minimal"?"solid":"dashed"} #000;margin:5px 0}.tot td{font-weight:700;font-size:${r+1}px}
    .t-modern .head{background:#000;color:#fff;padding:5px 4px;border-radius:4px}.t-modern .tot td{border-top:1.5px solid #000;padding-top:2px}
    .t-modern .ttl{display:block;margin:4px 0;text-align:center;font-weight:800;letter-spacing:.2em}
    .note{margin-top:6px;text-align:left;white-space:pre-wrap;font-size:${r-1}px}
    .rlogo{display:block;margin:0 auto 4px;max-width:60%;max-height:22mm;object-fit:contain;filter:grayscale(1)}
    .rqr{display:block;margin:6px auto 2px;width:24mm;height:24mm}.rqr svg{width:100%;height:100%;display:block}
  </style>
  <div class="t-${t(m)}">
  <div class="head">${V(i,"rlogo")}${B(i)}</div>
  ${m==="modern"?'<span class="ttl">INVOICE</span>':"<hr>"}
  <div>Invoice: <b>${t(s.invoice_no)}</b></div>
  <div>Date: ${t(Q(s.created_at||s.date))}</div>
  <div>Customer: ${t(s.customer_name)}${b&&b.phones?" ("+t(y(b.phones)[0])+")":""}</div>
  <div>Served by: ${t(U(s.user_name||""))}</div>
  ${s.status==="cancelled"?'<div class="c"><b>*** CANCELLED ***</b></div>':""}
  <hr>
  <table>${_}</table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td class="r">${t(c(s.subtotal,!1))}</td></tr>
    ${s.discount?`<tr><td>Discount</td><td class="r">-${t(c(s.discount,!1))}</td></tr>`:""}
    <tr class="tot"><td>TOTAL</td><td class="r">${t(c(s.total))}</td></tr>
    ${f.map(u=>`<tr><td>Paid (${t(u.account_name)})</td><td class="r">${t(c(u.amount,!1))}</td></tr>`).join("")}
    ${s.credit_used?`<tr><td>Paid (advance)</td><td class="r">${t(c(s.credit_used,!1))}</td></tr>`:""}
    ${s.due>0?`<tr class="tot"><td>DUE</td><td class="r">${t(c(s.due))}</td></tr>`:""}
    ${b&&b.balance!==void 0?`<tr><td>Total balance due</td><td class="r">${t(c(b.balance,!1))}</td></tr>`:""}
    ${s.next_payment_date&&s.due>0?`<tr><td>Next payment date</td><td class="r">${t(v(s.next_payment_date))}</td></tr>`:""}
  </table>
  <hr>
  <div class="c">${t(i.shop_footer||"Thank you!")}</div>
  <div class="c sm">Goods sold are subject to warranty terms.</div>
  ${String(i.invoice_qr??"true")!=="false"&&s.invoice_no?`<div class="rqr">${G(s.invoice_no,2)}</div><div class="c sm">Scan at the shop to find this invoice</div>`:""}
  ${$?`<div class="note"><b>Note:</b> ${t($)}</div>`:""}
  </div>`}function Z(e,a){try{return JSON.parse(e)}catch{return a}}function lt({title:e,customer:a,phone:o,lines:i,discount:n=0,note:p="",validDays:r=7,no:m,date:$,storedTotals:s}){N.getState().settings;const l=m||"Q-"+Date.now().toString().slice(-7),b=s?{...s,valid:!0}:J(i,n),f=b.subtotal;if(!b.valid)throw new Error(b.error);const _=i.map((d,w)=>`<tr><td>${w+1}</td><td><b>${t(d.group||"")}</b>${d.group?"<br>":""}${t(d.name)}</td><td class="r">${t(d.warranty||"—")}</td><td class="r">${t(d.qty)}</td><td class="r">${t(A(d.price))}</td><td class="r">${t(c(s?d.total:d.qty*d.price,!1))}</td></tr>`).join(""),h=r?`${r} days`:"—",u=`${p?`<div class="note-box"><b>Notes:</b> ${t(p)}</div>`:""}<div class="note-box sm">Prices may change with market rates after the validity period. Stock is not reserved until an order is confirmed.</div>`,x=[["Subtotal",t(c(f))],...n?[["Discount","-"+t(c(n))]]:[],["Grand total",t(c(b.total)),!0]];return L()?D([O({title:"Quotation",left:[["Prepared For",`<b>${t(a||"—")}</b>`],["Contact No",t(o||"")],["Subject",t(e||"Custom PC build")]],right:[["Quotation No",`<b>${t(l)}</b>`],["Date",t(v($||S()))],["Valid For",t(h)]],cols:[{label:"S/L",w:38,cls:"cn"},{label:"Item Descriptions"},{label:"Warranty",w:80,cls:"cn"},{label:"Unit Price",w:96,cls:"r"},{label:"Quantity",w:72,cls:"cn"},{label:"Total",w:100,cls:"r"}],rows:i.map((d,w)=>[w+1,`${d.group?`<b>${t(d.group)}</b><br>`:""}${t(d.name)}`,t(d.warranty||"—"),t(A(d.price)),t(d.qty),t(g(s?d.total:d.qty*d.price))]),words:Number(b.total)||0,totals:[["TOTAL",t(g(f))],["Discount",t(g(n||0))],["Grand TOTAL",t(g(b.total)),!0]],foot:`${p?`<div class="bfootnote"><b>Notes:</b> ${t(p)}</div>`:""}<div class="bfootnote">Prices may change with market rates after the validity period. Stock is not reserved until an order is confirmed.</div>`})]):D([`${j()}${R("QUOTATION",`<b>${t(l)}</b><br>${t(v($||S()))}`)}
    <div class="meta">
      <div class="box"><b class="t">Prepared for</b><b>${t(a||"—")}</b><div>Phone: ${t(o||"—")}</div></div>
      <div class="box"><b class="t">Subject</b><b>${t(e||"Custom PC build")}</b><div>Valid for: ${t(h)}</div></div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Item</th><th class="r" style="width:80px">Warranty</th><th class="r" style="width:56px">Qty</th><th class="r" style="width:90px">Unit price</th><th class="r" style="width:96px">Amount</th></tr></thead><tbody>${_}</tbody>
    <tfoot class="qtot">${x.map(([d,w,H])=>`<tr class="${H?"big":""}"><td colspan="5" class="r">${d}</td><td class="r">${w}</td></tr>`).join("")}</tfoot></table>
    ${u}
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Authorised signature: ____________________</span></div></div>`])}function pt(e,a,o,i){return X(e,[a],{from:o,to:i})}function tt(e){var n;const a=N.getState().settings,o=Number(a.receipt_width||80),i=o===58?48:72;I(`<style>@page{size:${o}mm auto;margin:0}body{margin:0;width:${i}mm;padding:3mm ${(o-i)/2}mm;font:11px/1.4 'Courier New','Hind Siliguri',monospace}.c{text-align:center}hr{border:0;border-top:1px dashed #000}</style>
  ${B(a)}<hr><div class="c"><b>MONEY RECEIPT</b></div><div>No: ${t(e.receipt_no)}</div><div>Date: ${t(e.date||(n=e.entry)!=null&&n.date?v(e.date||e.entry.date):"—")}</div>
  <div>Received from: <b>${t(e.customer)}</b></div><div>Amount: <b>${t(c(e.amount))}</b></div><div>Via: ${t(e.account)}</div><hr>
  <div>Remaining balance: <b>${t(c(e.balance))}</b></div><hr><div class="c">${t(a.shop_footer||"")}</div>`)}function mt(e){var o;const a=e.receipts||[];if(!a.length)throw new Error("Due payment receipt is missing");tt({receipt_no:a.map(i=>i.receipt_no).join(", "),date:a[0].date||((o=a[0].entry)==null?void 0:o.date),customer:a[0].customer,amount:e.amount,account:a.map(i=>i.account+" "+c(i.amount)).join(" + "),balance:a.at(-1).balance})}export{rt as P,dt as T,mt as a,C as b,lt as c,tt as d,pt as e,nt as f,ot as g,X as h,A as i,ct as p,J as q};
