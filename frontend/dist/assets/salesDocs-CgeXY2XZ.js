import{_ as I,u as g}from"./index-1ywX1X6r.js";import{b as C,f as v,s as x,q as _,m as p,t as L}from"./format-D7gXdJjf.js";import{e as t,p as R,s as N}from"./export-BatAJmqz.js";import{p as F}from"./purchaseDocs-HiXPbehh.js";const j=`
  .sdoc{font:12px/1.45 'Manrope','Hind Siliguri',system-ui,sans-serif;color:#111;background:#fff;padding:0 2px}
  .sdoc *{box-sizing:border-box}
  .sdoc .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d1b2a;padding-bottom:10px;margin-bottom:12px}
  .sdoc h1{margin:0;font-size:20px}.sdoc h2{margin:0;font-size:21px;letter-spacing:.04em;color:#0d1b2a;text-align:right}
  .sdoc .meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
  .sdoc .box{border:1px solid #ccd3dc;border-radius:6px;padding:8px 10px}
  .sdoc .box b.t{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#556;margin-bottom:3px}
  .sdoc table{width:100%;border-collapse:collapse}.sdoc th,.sdoc td{border:1px solid #ccd3dc;padding:5px 7px;text-align:left;vertical-align:top}
  .sdoc th{background:#0d1b2a;color:#fff;font-weight:600;font-size:11.5px}
  .sdoc .r{text-align:right}.sdoc .sm{font-size:10.5px;color:#444}.sdoc .sn{font-family:Consolas,monospace;font-size:10.5px;word-break:break-all}
  .sdoc .tot{margin-left:auto;width:290px;margin-top:10px}.sdoc .tot td{border:0;padding:3px 0}.sdoc .tot .g td{font-weight:800;font-size:14px;border-top:2px solid #0d1b2a;padding-top:6px}
  .sdoc .cx{margin:8px 0;padding:6px 10px;border:2px solid #c0392b;color:#c0392b;font-weight:800;text-align:center}
  .sdoc .log li{margin:3px 0}.sdoc .foot{margin-top:18px;display:flex;justify-content:space-between;font-size:11px;color:#444}
`,A=(s,e,o=g.getState().settings)=>{const i=o;return`<div class="top"><div><h1>${t(i.shop_name||"Karvio")}</h1><div>${t(i.shop_address||"")}</div><div>${N(i)}</div></div><div><h2>${s}</h2><div style="text-align:right">${e}</div></div></div>`},H=s=>{try{return Array.isArray(s.payments)?s.payments:JSON.parse(s.payments||"[]")}catch{return[]}},w=s=>x(String(s||"").replace(/\n/g,",")),O=`
  .sdoc.tpl-modern .top{border:0;background:#0d1b2a;color:#fff;padding:14px 16px;border-radius:10px}.sdoc.tpl-modern .top .sm{color:#cbd5e1}.sdoc.tpl-modern .top h2{color:#f2c230}
  .sdoc.tpl-modern th{background:#12b5b0;color:#fff}.sdoc.tpl-modern .tot .g td{border-top-color:#12b5b0;color:#0d1b2a}
  .sdoc.tpl-modern .box{border-color:#12b5b0;background:#f4fbfb}
  .sdoc.tpl-minimal .top{border-bottom:1px solid #111}.sdoc.tpl-minimal th{background:#fff;color:#111;border-bottom:2px solid #111}
  .sdoc.tpl-minimal th,.sdoc.tpl-minimal td{border-left:0;border-right:0}.sdoc.tpl-minimal .box{border:0;padding:0}.sdoc.tpl-minimal .tot .g td{border-top:1px solid #111}
  .sdoc .note-line{margin-top:14px;text-align:left;white-space:pre-wrap;font-size:11.5px}
`,V=s=>s==="a5"?"@page{size:A5;margin:8mm}.sdoc{font-size:10.5px}.sdoc h1{font-size:16px}.sdoc h2{font-size:16px}":"@page{size:A4;margin:12mm}",T=(s=[])=>s.length?s.some(e=>(e.shop||g.getState().settings).invoice_template==="business"):g.getState().settings.invoice_template==="business",f=(s,e="a4",o=!1)=>`<style>${o&&e!=="a5"?G():V(e)}body{margin:0}${j}${O}${o?W:""}.sdoc+.sdoc,.bdoc+.bdoc{page-break-before:always;break-before:page}</style>${s.join("")}`,q=(s=g.getState().settings)=>{const e=String(s.invoice_note||"").trim();return e?`<div class="note-line"><b>Note:</b> ${t(e)}</div>`:""},P=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"],X=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"],y=s=>s<20?P[s]:`${X[Math.floor(s/10)]}${s%10?" "+P[s%10]:""}`,Q=s=>[s>=100?`${P[Math.floor(s/100)]} Hundred`:"",y(s%100)].filter(Boolean).join(" ");function J(s){const e=Math.abs(Number(s)||0),o=Math.floor(e),i=Math.round((e-o)*100),c=n=>{if(!n)return"";const a=[];let d=n;return d>=1e7&&(a.push(`${c(Math.floor(d/1e7))} Crore`),d%=1e7),d>=1e5&&(a.push(`${y(Math.floor(d/1e5))} Lakh`),d%=1e5),d>=1e3&&(a.push(`${y(Math.floor(d/1e3))} Thousand`),d%=1e3),d&&a.push(Q(d)),a.join(" ")};return`${c(o)||"Zero"}${i?` and ${y(i)} Paisa`:""} Only`}const W=`
  .bdoc{font:12.5px/1.4 'Times New Roman',Times,'Hind Siliguri',serif;color:#000;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:0 2px}
  .bdoc *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .bdoc *{box-sizing:border-box}
  .bdoc .bh{text-align:center;margin-bottom:8px}.bdoc .bh h1{margin:0 0 4px;font-size:30px;font-weight:700}.bdoc .bh div{font-size:11.5px}
  .bdoc .bbar{background:#b5b5b5;border:1px solid #8f8f8f;text-align:center;font-weight:700;font-size:14px;padding:5px}
  .bdoc .binfo{display:grid;grid-template-columns:1.15fr 1fr;gap:20px;background:#ececec;border:1px solid #b5b5b5;border-top:0;padding:10px 12px;margin-bottom:12px}
  .bdoc .binfo table{width:100%;border-collapse:collapse}.bdoc .binfo td{padding:2px 0;vertical-align:top;border:0}
  .bdoc .binfo td.k{font-weight:700;width:118px;white-space:nowrap}.bdoc .binfo td.c{width:18px}
  .bdoc .bitems{width:100%;border-collapse:collapse}.bdoc .bitems th,.bdoc .bitems td{border:1px solid #333;padding:6px 7px;vertical-align:top}
  .bdoc .bitems th{background:#d6d6d6;font-weight:700;text-align:center}.bdoc .bitems td.r{text-align:right}.bdoc .bitems td.cn{text-align:center}
  .bdoc .bitems thead{display:table-header-group}.bdoc .bitems tr{break-inside:avoid;page-break-inside:avoid}
  .bdoc .sn{font-size:11px;margin-top:2px;word-break:break-all}
  .bdoc .bsum{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-top:8px;break-inside:avoid;page-break-inside:avoid}
  .bdoc .btot td{padding:2px 0 2px 12px;border:0}.bdoc .btot td.k{font-weight:700;padding-left:0}.bdoc .btot td.r{text-align:right;min-width:110px}
  .bdoc .bdue{border:1.5px solid #000;padding:8px 10px;margin-top:10px;width:300px}.bdoc .bdue td{padding:2px 0;border:0}.bdoc .bdue td.k{font-weight:700}.bdoc .bdue td.r{text-align:right}
  .bdoc .bsign{display:flex;justify-content:flex-end;margin-top:44px;break-inside:avoid;page-break-inside:avoid}
  .bdoc .bsign span{width:220px;border-top:1px solid #000;text-align:center;padding-top:5px}
  .bdoc .note-line{margin-top:16px;text-align:left;white-space:pre-wrap;font-size:11.5px;break-inside:avoid}
  .bdoc .cx{margin:8px 0;padding:6px 10px;border:2px solid #c0392b;color:#c0392b;font-weight:800;text-align:center}
  .bdoc .bfoot{display:flex;justify-content:space-between;border-top:1px solid #777;margin-top:22px;padding-top:5px;font-size:11px}
  @media print{.bdoc .bfoot{display:none}}
`,u=(s,e)=>(Number(s)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),M="For Software: 01913354321",G=()=>{const s=new Date,e=i=>JSON.stringify(i),o='font:10.5px "Times New Roman",Times,serif;color:#000;border-top:1px solid #777;padding-top:4px;vertical-align:top';return`@page{size:A4;margin:12mm 12mm 16mm;
    @top-left{content:' '}@top-center{content:' '}@top-right{content:' '}
    @bottom-left{content:${e(`Print Date: ${v(L())}    Print Time: ${s.toLocaleTimeString("en-US")}`)};${o}}
    @bottom-center{content:${e(M)};${o}}
    @bottom-right{content:"Page " counter(page) " of " counter(pages);${o}}}`};function K(s){const e=s.shop||g.getState().settings,o=s.sale,i=s.customer||{},c=(m,k)=>`<tr><td class="k">${m}</td><td class="c">:</td><td>${k}</td></tr>`,l=s.items.map((m,k)=>{const z=w(m.serials);return`<tr><td class="cn">${k+1}</td><td>${t(m.name)}${z.length?`<div class="sn">${t(z.join(", "))}</div>`:""}${m.returned_qty?`<div class="sn">Returned: ${t(_(m.returned_qty))}</div>`:""}</td>
      <td class="cn">${Number(m.warranty_days)>0?t(m.warranty_days):"—"}</td><td class="r">${t(u(m.price))}</td><td class="cn">${t(_(m.qty))}${m.unit&&m.unit!=="pcs"?" "+t(m.unit):""}</td><td class="r">${t(u(m.total))}</td></tr>`}).join(""),n=Number(o.total)||0,a=Number(o.live_invoice?o.paid_now??o.paid:o.paid)||0;let d=null;try{d=typeof o.balance_snapshot=="string"?JSON.parse(o.balance_snapshot||"null"):o.balance_snapshot}catch{}const r=d&&Number.isFinite(Number(d.previous))&&Number.isFinite(Number(d.outstanding)),h=o.live_invoice?Number(o.due_now??o.due)||0:r?Number(d.outstanding):o.customer_id?null:Number(o.due)||0,$=r?Number(d.previous):o.customer_id?null:0,b=t(o.user_name||""),B=i.phones?t(x(i.phones).join(", ")):"",S=!o.customer_id||!o.customer_name||/^walk-?in/i.test(String(o.customer_name).trim()),U=new Date;return`<div class="bdoc">
    <div class="bh"><h1>${t(e.shop_name||"Karvio")}</h1>${e.shop_address?`<div>${t(e.shop_address)}</div>`:""}${N(e)?`<div>${N(e)}</div>`:""}</div>
    <div class="bbar">Invoice/ Bill</div>
    <div class="binfo">
      <table>${c("Sold To",`<b>${S?"CASH":t(o.customer_name)}</b>${!S&&i.addresses?`<div>${t(String(i.addresses).split("|").join("; "))}</div>`:""}`)}${c("Contact No",S?t(e.shop_tel||e.shop_phone||"—"):B||"—")}${c("Invoice No",t(o.invoice_no))}</table>
      <table>${c("Date",t(v(o.date||o.created_at)))}${c("Sold By",b)}${c("Billing By",b)}${c("Sales Person By",b)}</table>
    </div>
    ${o.status==="cancelled"?`<div class="cx">CANCELLED — ${t(o.cancel_reason||"")}</div>`:""}
    <table class="bitems"><thead><tr><th style="width:38px">S/L</th><th>Item Descriptions</th><th style="width:72px">Warranty Days</th><th style="width:96px">Unit Price</th><th style="width:72px">Quantity</th><th style="width:100px">Total</th></tr></thead><tbody>${l}</tbody></table>
    <div class="bsum">
      <div><div><b>Amount In Words :</b> ${t(J(n))}</div>
        <table class="bdue">
          <tr><td class="k">${o.live_invoice?"Previous balance at sale":"Previous Due"}</td><td>:</td><td class="r">${$===null?"Not recorded":t(u($))}</td></tr>
          <tr><td class="k">Sales Amount</td><td>:</td><td class="r">${t(u(n))}</td></tr>
          ${o.live_invoice&&o.returned_total>0?`<tr><td class="k">Returned value</td><td>:</td><td class="r">${t(u(o.returned_total))}</td></tr><tr><td class="k">Net invoice amount</td><td>:</td><td class="r">${t(u(o.net_total))}</td></tr>`:""}
          <tr><td class="k">${o.live_invoice?"Paid now":"Collected Amount"}</td><td>:</td><td class="r">${t(u(a))}</td></tr>
          <tr><td class="k">${o.live_invoice?"Invoice due now":"Outstanding Amount"}</td><td>:</td><td class="r">${h===null?"Not recorded":t(u(h))}</td></tr>
          ${o.next_payment_date&&o.due>0?`<tr><td class="k">Next Payment Date</td><td>:</td><td class="r">${t(v(o.next_payment_date))}</td></tr>`:""}
        </table></div>
      <table class="btot">
        <tr><td class="k">TOTAL :</td><td class="r">${t(u(o.subtotal))}</td></tr>
        <tr><td class="k">Discount :</td><td class="r">${t(u(o.discount||0))}</td></tr>
        <tr><td class="k">Grand TOTAL :</td><td class="r"><b>${t(u(n))}</b></td></tr>
      </table>
    </div>
    <div class="bsign"><span>Authorised Signature And Company Stamp</span></div>
    ${q(e)}
    <div class="bfoot"><span>Print Date: ${t(v(L()))}</span><span>Print Time: ${t(U.toLocaleTimeString("en-US"))}</span><span>${M}</span><span>Page 1 of 1</span></div>
  </div>`}function D(s){const e=s.sale,o=s.customer||{},i=s.items.map((a,d)=>{const r=w(a.serials);return`<tr><td>${d+1}</td><td><b>${t(a.name)}</b>${r.length?`<div class="sn">S/N: ${t(r.join(", "))}</div>`:""}${a.warranty_expiry?`<div class="sm">Warranty ${t(a.warranty_days)} days — till ${t(v(a.warranty_expiry))}${a.warranty_type==="invoice"?" (keep this invoice)":""}</div>`:""}${a.returned_qty?`<div class="sm">Returned: ${t(_(a.returned_qty))}</div>`:""}</td>
      <td>${t(a.unit||"pcs")}</td><td class="r">${t(_(a.qty))}</td><td class="r">${t(p(a.price,!1))}</td><td class="r">${t(p(a.total,!1))}</td></tr>`}).join(""),c=H(e),l=s.shop||g.getState().settings,n=l.invoice_template||"classic";return n==="business"?K(s):`<div class="sdoc tpl-${t(n)}">${A("INVOICE",`<b>${t(e.invoice_no)}</b><br>${t(C(e.created_at||e.date))}<br><span class="sm">Served by ${t(e.user_name||"")}</span>`,l)}
    ${e.status==="cancelled"?`<div class="cx">CANCELLED — ${t(e.cancel_reason||"")}</div>`:""}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${t(e.customer_name||"Walk-in")}</b>${o.phones?`<div>Phone: ${t(x(o.phones).join(", "))}</div>`:""}${o.addresses?`<div>${t(String(o.addresses).split("|").join("; "))}</div>`:""}</div>
      <div class="box"><b class="t">${e.live_invoice?"Payments at sale":"Payment"}</b>${c.length?c.map(a=>`<div>${t(a.account_name||"Paid")}: <b>${t(p(a.amount,!1))}</b></div>`).join(""):""}${e.credit_used?`<div>Advance used: <b>${t(p(e.credit_used,!1))}</b></div>`:""}${!c.length&&!e.credit_used?"<div>Sold on due</div>":""}${e.note?`<div class="sm">Note: ${t(e.note)}</div>`:""}</div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Product / serial / warranty</th><th style="width:56px">Unit</th><th class="r" style="width:60px">Qty</th><th class="r" style="width:90px">Price</th><th class="r" style="width:96px">Amount</th></tr></thead><tbody>${i}</tbody></table>
    <table class="tot">
      <tr><td>Subtotal</td><td class="r">${t(p(e.subtotal,!1))}</td></tr>
      ${e.discount?`<tr><td>Discount</td><td class="r">-${t(p(e.discount,!1))}</td></tr>`:""}
      <tr class="g"><td>Total</td><td class="r">${t(p(e.total))}</td></tr>
      ${e.live_invoice&&e.returned_total>0?`<tr><td>Returned value</td><td class="r">${t(p(e.returned_total,!1))}</td></tr><tr><td>Net invoice amount</td><td class="r">${t(p(e.net_total,!1))}</td></tr>`:""}
      <tr><td>${e.live_invoice?"Paid now":"Paid"}</td><td class="r">${t(p(e.live_invoice?e.paid_now??e.paid:e.paid,!1))}</td></tr>
      ${e.due>0?`<tr><td><b>Due</b></td><td class="r"><b>${t(p(e.due))}</b></td></tr>`:""}
      ${s.customer&&s.customer.balance!==void 0?`<tr><td>Total balance due</td><td class="r">${t(p(s.customer.balance,!1))}</td></tr>`:""}
      ${e.next_payment_date&&e.due>0?`<tr><td>Next payment date</td><td class="r">${t(v(e.next_payment_date))}</td></tr>`:""}
    </table>
    ${s.returns&&s.returns.length?`<p class="sm">Returns: ${t(s.returns.map(a=>`${a.return_no} (${p(a.total,!1)}, ${a.status})`).join(", "))}</p>`:""}
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div>${q(l)}</div>`}const ot=(s,e)=>R(f(s.map(D),e,T(s))),at=(s,e="a4")=>f([D(s)],e,T([s])),nt=(s,e)=>F(s.map(D),j+O+(T(s)?W:""),e);async function dt(s,e){const o=await I(()=>import("./xlsx-Cznzrv2E.js"),[],import.meta.url),i=[["Invoice #","Date","Status","Customer","Phone","Address","Subtotal","Discount","Total","Paid","Due","Payment","Served by","Note"]],c=[["Invoice #","Date","Customer","Phone","Product","Unit","Qty","Price","Amount","Serial numbers","Warranty days","Warranty till","Returned qty"]];s.forEach(d=>{const r=d.sale,h=d.customer||{},$=x(h.phones||"").join(", ");i.push([r.invoice_no,String(r.date).slice(0,10),r.status,r.customer_name,$,String(h.addresses||"").split("|").join("; "),r.subtotal,r.discount,r.total,r.paid,r.due,H(r).map(b=>`${b.account_name||""} ${b.amount}`).join("; "),r.user_name||"",r.note||""]),d.items.forEach(b=>c.push([r.invoice_no,String(r.date).slice(0,10),r.customer_name,$,b.name,b.unit||"pcs",b.qty,b.price,b.total,w(b.serials).join(", "),b.warranty_days||"",b.warranty_expiry?String(b.warranty_expiry).slice(0,10):"",b.returned_qty||0]))});const l=o.utils.book_new(),n=o.utils.aoa_to_sheet(i);n["!cols"]=i[0].map((d,r)=>({wch:[3,5,11].includes(r)?30:13}));const a=o.utils.aoa_to_sheet(c);a["!cols"]=c[0].map((d,r)=>({wch:[2,4,9].includes(r)?34:13})),o.utils.book_append_sheet(l,n,"Invoices"),o.utils.book_append_sheet(l,a,"Items & serials"),o.writeFile(l,e)}function E(s){const e=(s.log||[]).map(o=>`<li><b>${t(o.status)}</b> — ${t(C(o.ts))} · ${t(o.user||"")}${o.note?` — ${t(o.note)}`:""}</li>`).join("");return`<div class="sdoc">${A("WARRANTY CLAIM",`<b>${t(s.claim_no)}</b><br>Received ${t(v(s.date))}<br>Status: <b>${t(s.status)}</b>`)}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${t(s.customer_name||"—")}</b><div>${t(s.phone||"")}</div><div class="sm">Invoice: ${t(s.invoice_no||"—")}</div></div>
      <div class="box"><b class="t">Product</b><b>${t(s.product_name||"")}</b><div class="sn">Serial: ${t(s.serial||"—")}</div><div>Warranty till: ${t(v(s.expiry)||"N/A")} — <b>${s.in_warranty?"In warranty":"EXPIRED"}</b></div></div>
    </div>
    <div class="box" style="margin-bottom:12px"><b class="t">Problem reported</b>${t(s.issue||"—")}${s.vendor?`<div style="margin-top:6px"><b class="t">Vendor / service centre</b>${t(s.vendor)}</div>`:""}</div>
    <div class="box"><b class="t">Progress</b><ul class="log" style="margin:4px 0 0;padding-left:18px">${e||"<li>—</li>"}</ul></div>
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div></div>`}const it=s=>R(f(s.map(E))),rt=s=>f([E(s)]);function Y(s){const e=s.ret,o=s.customer||{},i=s.items.map((l,n)=>{const a=w(l.serials);return`<tr><td>${n+1}</td><td><b>${t(l.name)}</b>${a.length?`<div class="sn">S/N: ${t(a.join(", "))}</div>`:""}</td>
      <td class="r">${t(_(l.qty))}</td><td class="r">${t(p(l.price,!1))}</td><td class="r">${t(p(l.total,!1))}</td></tr>`}).join(""),c=e.type==="exchange"?"EXCHANGE":"SALES RETURN";return`<div class="sdoc">${A(c,`<b>${t(e.return_no)}</b><br>${t(C(e.created_at||e.date))}<br><span class="sm">By ${t(e.user||"")}</span>`)}
    ${e.status==="cancelled"?`<div class="cx">CANCELLED — ${t(e.cancel_reason||"")}</div>`:""}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${t(e.customer_name||"Walk-in")}</b>${o.phones?`<div>Phone: ${t(x(o.phones).join(", "))}</div>`:""}${o.addresses?`<div>${t(String(o.addresses).split("|").join("; "))}</div>`:""}</div>
      <div class="box"><b class="t">Original invoice</b><b>${t(e.invoice_no||"—")}</b><div>${e.type==="exchange"?"Exchange — value kept as customer credit":"Return"}</div>${e.note?`<div class="sm">Note: ${t(e.note)}</div>`:""}</div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Product / serial</th><th class="r" style="width:60px">Qty</th><th class="r" style="width:90px">Price</th><th class="r" style="width:96px">Value</th></tr></thead><tbody>${i}</tbody></table>
    <table class="tot">
      <tr class="g"><td>Return value</td><td class="r">${t(p(e.total))}</td></tr>
      <tr><td>Refunded${e.refund_account?` (${t(e.refund_account)})`:""}</td><td class="r">${t(p(e.refund||0,!1))}</td></tr>
      ${Number(e.total)-Number(e.refund||0)>.004?`<tr><td>Adjusted to customer balance</td><td class="r">${t(p(Number(e.total)-Number(e.refund||0),!1))}</td></tr>`:""}
    </table>
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div></div>`}const ct=s=>f([Y(s)]),lt=(s,e)=>F(s.map(E),j,e);async function pt(s,e){const o=await I(()=>import("./xlsx-Cznzrv2E.js"),[],import.meta.url),i=[["Claim #","Received","Status","Product","Serial","Invoice","Customer","Phone","Problem","Coverage","Warranty till","Vendor","Progress"]];s.forEach(n=>i.push([n.claim_no,String(n.date).slice(0,10),n.status,n.product_name,n.serial||"",n.invoice_no||"",n.customer_name||"",n.phone||"",n.issue||"",n.in_warranty?"In warranty":"Expired",n.expiry?String(n.expiry).slice(0,10):"",n.vendor||"",(n.log||[]).map(a=>`${String(a.ts).slice(0,16)} ${a.status}${a.note?` (${a.note})`:""}`).join(" | ")]));const c=o.utils.book_new(),l=o.utils.aoa_to_sheet(i);l["!cols"]=i[0].map((n,a)=>({wch:[3,8,12].includes(a)?36:14})),o.utils.book_append_sheet(c,l,"Warranty claims"),o.writeFile(c,e)}export{J as amountInWords,rt as claimDocHtml,E as claimHtml,pt as excelClaims,dt as excelSales,lt as pdfClaims,nt as pdfSales,it as printClaims,ot as printSales,at as saleDocHtml,D as saleInvoiceHtml,ct as salesReturnDocHtml,Y as salesReturnHtml};
