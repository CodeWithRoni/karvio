import{_ as L,u as $}from"./index-BhIHQnKG.js";import{b as C,f as g,s as v,q as x,m as p}from"./format-BbazwFgk.js";import{e as t,p as R,s as P}from"./export-DXxjpEJe.js";import{p as O}from"./purchaseDocs-mclrIt3I.js";const j=`
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
`,A=(e,s)=>{const o=$.getState().settings;return`<div class="top"><div><h1>${t(o.shop_name||"Karvio")}</h1><div>${t(o.shop_address||"")}</div><div>${P(o)}</div></div><div><h2>${e}</h2><div style="text-align:right">${s}</div></div></div>`},H=e=>{try{return Array.isArray(e.payments)?e.payments:JSON.parse(e.payments||"[]")}catch{return[]}},w=e=>v(String(e||"").replace(/\n/g,",")),q=`
  .sdoc.tpl-modern .top{border:0;background:#0d1b2a;color:#fff;padding:14px 16px;border-radius:10px}.sdoc.tpl-modern .top .sm{color:#cbd5e1}.sdoc.tpl-modern .top h2{color:#f2c230}
  .sdoc.tpl-modern th{background:#12b5b0;color:#fff}.sdoc.tpl-modern .tot .g td{border-top-color:#12b5b0;color:#0d1b2a}
  .sdoc.tpl-modern .box{border-color:#12b5b0;background:#f4fbfb}
  .sdoc.tpl-minimal .top{border-bottom:1px solid #111}.sdoc.tpl-minimal th{background:#fff;color:#111;border-bottom:2px solid #111}
  .sdoc.tpl-minimal th,.sdoc.tpl-minimal td{border-left:0;border-right:0}.sdoc.tpl-minimal .box{border:0;padding:0}.sdoc.tpl-minimal .tot .g td{border-top:1px solid #111}
  .sdoc .note-line{margin-top:14px;text-align:left;white-space:pre-wrap;font-size:11.5px}
`,B=e=>e==="a5"?"@page{size:A5;margin:8mm}.sdoc{font-size:10.5px}.sdoc h1{font-size:16px}.sdoc h2{font-size:16px}":"@page{size:A4;margin:12mm}",T=()=>$.getState().settings.invoice_template==="business",f=(e,s="a4",o=!1)=>`<style>${o&&s!=="a5"?Q():B(s)}body{margin:0}${j}${q}${o?F:""}.sdoc+.sdoc,.bdoc+.bdoc{page-break-before:always;break-before:page}</style>${e.join("")}`,W=()=>{const e=String($.getState().settings.invoice_note||"").trim();return e?`<div class="note-line"><b>Note:</b> ${t(e)}</div>`:""},N=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"],U=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"],y=e=>e<20?N[e]:`${U[Math.floor(e/10)]}${e%10?" "+N[e%10]:""}`,V=e=>[e>=100?`${N[Math.floor(e/100)]} Hundred`:"",y(e%100)].filter(Boolean).join(" ");function X(e){const s=Math.abs(Number(e)||0),o=Math.floor(s),c=Math.round((s-o)*100),n=a=>{if(!a)return"";const i=[];let d=a;return d>=1e7&&(i.push(`${n(Math.floor(d/1e7))} Crore`),d%=1e7),d>=1e5&&(i.push(`${y(Math.floor(d/1e5))} Lakh`),d%=1e5),d>=1e3&&(i.push(`${y(Math.floor(d/1e3))} Thousand`),d%=1e3),d&&i.push(V(d)),i.join(" ")};return`${n(o)||"Zero"}${c?` and ${y(c)} Paisa`:""} Only`}const F=`
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
`,u=(e,s)=>(Number(e)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),M="For Software: 01913354321",Q=()=>{const e=new Date,s=c=>JSON.stringify(c),o='font:10.5px "Times New Roman",Times,serif;color:#000;border-top:1px solid #777;padding-top:4px;vertical-align:top';return`@page{size:A4;margin:12mm 12mm 16mm;
    @top-left{content:' '}@top-center{content:' '}@top-right{content:' '}
    @bottom-left{content:${s(`Print Date: ${g(e.toISOString())}    Print Time: ${e.toLocaleTimeString("en-US")}`)};${o}}
    @bottom-center{content:${s(M)};${o}}
    @bottom-right{content:"Page " counter(page) " of " counter(pages);${o}}}`};function G(e){const s=$.getState().settings,o=e.sale,c=e.customer||{},n=(m,k)=>`<tr><td class="k">${m}</td><td class="c">:</td><td>${k}</td></tr>`,l=e.items.map((m,k)=>{const I=w(m.serials);return`<tr><td class="cn">${k+1}</td><td>${t(m.name)}${I.length?`<div class="sn">${t(I.join(", "))}</div>`:""}${m.returned_qty?`<div class="sn">Returned: ${t(x(m.returned_qty))}</div>`:""}</td>
      <td class="cn">${Number(m.warranty_days)>0?t(m.warranty_days):"—"}</td><td class="r">${t(u(m.price))}</td><td class="cn">${t(x(m.qty))}${m.unit&&m.unit!=="pcs"?" "+t(m.unit):""}</td><td class="r">${t(u(m.total))}</td></tr>`}).join(""),a=Number(o.total)||0,i=Number(o.paid)||0,d=e.customer&&e.customer.balance!==void 0,r=d?Number(e.customer.balance)||0:Number(o.due)||0,_=d?r-(Number(o.due)||0):0,h=t(o.user_name||""),b=c.phones?t(v(c.phones).join(", ")):"",S=!o.customer_id||!o.customer_name||/^walk-?in/i.test(String(o.customer_name).trim()),z=new Date;return`<div class="bdoc">
    <div class="bh"><h1>${t(s.shop_name||"Karvio")}</h1>${s.shop_address?`<div>${t(s.shop_address)}</div>`:""}${P(s)?`<div>${P(s)}</div>`:""}</div>
    <div class="bbar">Invoice/ Bill</div>
    <div class="binfo">
      <table>${n("Sold To",`<b>${S?"CASH":t(o.customer_name)}</b>${!S&&c.addresses?`<div>${t(String(c.addresses).split("|").join("; "))}</div>`:""}`)}${n("Contact No",S?t(s.shop_tel||s.shop_phone||"—"):b||"—")}${n("Invoice No",t(o.invoice_no))}</table>
      <table>${n("Date",t(g(o.date||o.created_at)))}${n("Sold By",h)}${n("Billing By",h)}${n("Sales Person By",h)}</table>
    </div>
    ${o.status==="cancelled"?`<div class="cx">CANCELLED — ${t(o.cancel_reason||"")}</div>`:""}
    <table class="bitems"><thead><tr><th style="width:38px">S/L</th><th>Item Descriptions</th><th style="width:72px">Warranty Days</th><th style="width:96px">Unit Price</th><th style="width:72px">Quantity</th><th style="width:100px">Total</th></tr></thead><tbody>${l}</tbody></table>
    <div class="bsum">
      <div><div><b>Amount In Words :</b> ${t(X(a))}</div>
        <table class="bdue">
          <tr><td class="k">Previous Due</td><td>:</td><td class="r">${t(u(_))}</td></tr>
          <tr><td class="k">Sales Amount</td><td>:</td><td class="r">${t(u(a))}</td></tr>
          <tr><td class="k">Collected Amount</td><td>:</td><td class="r">${t(u(i))}</td></tr>
          <tr><td class="k">Outstanding Amount</td><td>:</td><td class="r">${t(u(r))}</td></tr>
          ${o.next_payment_date&&o.due>0?`<tr><td class="k">Next Payment Date</td><td>:</td><td class="r">${t(g(o.next_payment_date))}</td></tr>`:""}
        </table></div>
      <table class="btot">
        <tr><td class="k">TOTAL :</td><td class="r">${t(u(o.subtotal))}</td></tr>
        <tr><td class="k">Discount :</td><td class="r">${t(u(o.discount||0))}</td></tr>
        <tr><td class="k">Grand TOTAL :</td><td class="r"><b>${t(u(a))}</b></td></tr>
      </table>
    </div>
    <div class="bsign"><span>Authorised Signature And Company Stamp</span></div>
    ${W()}
    <div class="bfoot"><span>Print Date: ${t(g(z.toISOString()))}</span><span>Print Time: ${t(z.toLocaleTimeString("en-US"))}</span><span>${M}</span><span>Page 1 of 1</span></div>
  </div>`}function D(e){const s=e.sale,o=e.customer||{},c=e.items.map((a,i)=>{const d=w(a.serials);return`<tr><td>${i+1}</td><td><b>${t(a.name)}</b>${d.length?`<div class="sn">S/N: ${t(d.join(", "))}</div>`:""}${a.warranty_expiry?`<div class="sm">Warranty ${t(a.warranty_days)} days — till ${t(g(a.warranty_expiry))}${a.warranty_type==="invoice"?" (keep this invoice)":""}</div>`:""}${a.returned_qty?`<div class="sm">Returned: ${t(x(a.returned_qty))}</div>`:""}</td>
      <td>${t(a.unit||"pcs")}</td><td class="r">${t(x(a.qty))}</td><td class="r">${t(p(a.price,!1))}</td><td class="r">${t(p(a.total,!1))}</td></tr>`}).join(""),n=H(s),l=$.getState().settings.invoice_template||"classic";return l==="business"?G(e):`<div class="sdoc tpl-${t(l)}">${A("INVOICE",`<b>${t(s.invoice_no)}</b><br>${t(C(s.created_at||s.date))}<br><span class="sm">Served by ${t(s.user_name||"")}</span>`)}
    ${s.status==="cancelled"?`<div class="cx">CANCELLED — ${t(s.cancel_reason||"")}</div>`:""}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${t(s.customer_name||"Walk-in")}</b>${o.phones?`<div>Phone: ${t(v(o.phones).join(", "))}</div>`:""}${o.addresses?`<div>${t(String(o.addresses).split("|").join("; "))}</div>`:""}</div>
      <div class="box"><b class="t">Payment</b>${n.length?n.map(a=>`<div>${t(a.account_name||"Paid")}: <b>${t(p(a.amount,!1))}</b></div>`).join(""):""}${s.credit_used?`<div>Advance used: <b>${t(p(s.credit_used,!1))}</b></div>`:""}${!n.length&&!s.credit_used?"<div>Sold on due</div>":""}${s.note?`<div class="sm">Note: ${t(s.note)}</div>`:""}</div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Product / serial / warranty</th><th style="width:56px">Unit</th><th class="r" style="width:60px">Qty</th><th class="r" style="width:90px">Price</th><th class="r" style="width:96px">Amount</th></tr></thead><tbody>${c}</tbody></table>
    <table class="tot">
      <tr><td>Subtotal</td><td class="r">${t(p(s.subtotal,!1))}</td></tr>
      ${s.discount?`<tr><td>Discount</td><td class="r">-${t(p(s.discount,!1))}</td></tr>`:""}
      <tr class="g"><td>Total</td><td class="r">${t(p(s.total))}</td></tr>
      <tr><td>Paid</td><td class="r">${t(p(s.paid,!1))}</td></tr>
      ${s.due>0?`<tr><td><b>Due</b></td><td class="r"><b>${t(p(s.due))}</b></td></tr>`:""}
      ${e.customer&&e.customer.balance!==void 0?`<tr><td>Total balance due</td><td class="r">${t(p(e.customer.balance,!1))}</td></tr>`:""}
      ${s.next_payment_date&&s.due>0?`<tr><td>Next payment date</td><td class="r">${t(g(s.next_payment_date))}</td></tr>`:""}
    </table>
    ${e.returns&&e.returns.length?`<p class="sm">Returns: ${t(e.returns.map(a=>`${a.return_no} (${p(a.total,!1)}, ${a.status})`).join(", "))}</p>`:""}
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div>${W()}</div>`}const et=(e,s)=>R(f(e.map(D),s,T())),st=(e,s="a4")=>f([D(e)],s,T()),ot=(e,s)=>O(e.map(D),j+q+(T()?F:""),s);async function at(e,s){const o=await L(()=>import("./xlsx-CVny20fG.js"),[],import.meta.url),c=[["Invoice #","Date","Status","Customer","Phone","Address","Subtotal","Discount","Total","Paid","Due","Payment","Served by","Note"]],n=[["Invoice #","Date","Customer","Phone","Product","Unit","Qty","Price","Amount","Serial numbers","Warranty days","Warranty till","Returned qty"]];e.forEach(d=>{const r=d.sale,_=d.customer||{},h=v(_.phones||"").join(", ");c.push([r.invoice_no,String(r.date).slice(0,10),r.status,r.customer_name,h,String(_.addresses||"").split("|").join("; "),r.subtotal,r.discount,r.total,r.paid,r.due,H(r).map(b=>`${b.account_name||""} ${b.amount}`).join("; "),r.user_name||"",r.note||""]),d.items.forEach(b=>n.push([r.invoice_no,String(r.date).slice(0,10),r.customer_name,h,b.name,b.unit||"pcs",b.qty,b.price,b.total,w(b.serials).join(", "),b.warranty_days||"",b.warranty_expiry?String(b.warranty_expiry).slice(0,10):"",b.returned_qty||0]))});const l=o.utils.book_new(),a=o.utils.aoa_to_sheet(c);a["!cols"]=c[0].map((d,r)=>({wch:[3,5,11].includes(r)?30:13}));const i=o.utils.aoa_to_sheet(n);i["!cols"]=n[0].map((d,r)=>({wch:[2,4,9].includes(r)?34:13})),o.utils.book_append_sheet(l,a,"Invoices"),o.utils.book_append_sheet(l,i,"Items & serials"),o.writeFile(l,s)}function E(e){const s=(e.log||[]).map(o=>`<li><b>${t(o.status)}</b> — ${t(C(o.ts))} · ${t(o.user||"")}${o.note?` — ${t(o.note)}`:""}</li>`).join("");return`<div class="sdoc">${A("WARRANTY CLAIM",`<b>${t(e.claim_no)}</b><br>Received ${t(g(e.date))}<br>Status: <b>${t(e.status)}</b>`)}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${t(e.customer_name||"—")}</b><div>${t(e.phone||"")}</div><div class="sm">Invoice: ${t(e.invoice_no||"—")}</div></div>
      <div class="box"><b class="t">Product</b><b>${t(e.product_name||"")}</b><div class="sn">Serial: ${t(e.serial||"—")}</div><div>Warranty till: ${t(g(e.expiry)||"N/A")} — <b>${e.in_warranty?"In warranty":"EXPIRED"}</b></div></div>
    </div>
    <div class="box" style="margin-bottom:12px"><b class="t">Problem reported</b>${t(e.issue||"—")}${e.vendor?`<div style="margin-top:6px"><b class="t">Vendor / service centre</b>${t(e.vendor)}</div>`:""}</div>
    <div class="box"><b class="t">Progress</b><ul class="log" style="margin:4px 0 0;padding-left:18px">${s||"<li>—</li>"}</ul></div>
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div></div>`}const nt=e=>R(f(e.map(E))),dt=e=>f([E(e)]);function J(e){const s=e.ret,o=e.customer||{},c=e.items.map((l,a)=>{const i=w(l.serials);return`<tr><td>${a+1}</td><td><b>${t(l.name)}</b>${i.length?`<div class="sn">S/N: ${t(i.join(", "))}</div>`:""}</td>
      <td class="r">${t(x(l.qty))}</td><td class="r">${t(p(l.price,!1))}</td><td class="r">${t(p(l.total,!1))}</td></tr>`}).join(""),n=s.type==="exchange"?"EXCHANGE":"SALES RETURN";return`<div class="sdoc">${A(n,`<b>${t(s.return_no)}</b><br>${t(C(s.created_at||s.date))}<br><span class="sm">By ${t(s.user||"")}</span>`)}
    ${s.status==="cancelled"?`<div class="cx">CANCELLED — ${t(s.cancel_reason||"")}</div>`:""}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${t(s.customer_name||"Walk-in")}</b>${o.phones?`<div>Phone: ${t(v(o.phones).join(", "))}</div>`:""}${o.addresses?`<div>${t(String(o.addresses).split("|").join("; "))}</div>`:""}</div>
      <div class="box"><b class="t">Original invoice</b><b>${t(s.invoice_no||"—")}</b><div>${s.type==="exchange"?"Exchange — value kept as customer credit":"Return"}</div>${s.note?`<div class="sm">Note: ${t(s.note)}</div>`:""}</div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Product / serial</th><th class="r" style="width:60px">Qty</th><th class="r" style="width:90px">Price</th><th class="r" style="width:96px">Value</th></tr></thead><tbody>${c}</tbody></table>
    <table class="tot">
      <tr class="g"><td>Return value</td><td class="r">${t(p(s.total))}</td></tr>
      <tr><td>Refunded${s.refund_account?` (${t(s.refund_account)})`:""}</td><td class="r">${t(p(s.refund||0,!1))}</td></tr>
      ${Number(s.total)-Number(s.refund||0)>.004?`<tr><td>Adjusted to customer balance</td><td class="r">${t(p(Number(s.total)-Number(s.refund||0),!1))}</td></tr>`:""}
    </table>
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div></div>`}const it=e=>f([J(e)]),rt=(e,s)=>O(e.map(E),j,s);async function ct(e,s){const o=await L(()=>import("./xlsx-CVny20fG.js"),[],import.meta.url),c=[["Claim #","Received","Status","Product","Serial","Invoice","Customer","Phone","Problem","Coverage","Warranty till","Vendor","Progress"]];e.forEach(a=>c.push([a.claim_no,String(a.date).slice(0,10),a.status,a.product_name,a.serial||"",a.invoice_no||"",a.customer_name||"",a.phone||"",a.issue||"",a.in_warranty?"In warranty":"Expired",a.expiry?String(a.expiry).slice(0,10):"",a.vendor||"",(a.log||[]).map(i=>`${String(i.ts).slice(0,16)} ${i.status}${i.note?` (${i.note})`:""}`).join(" | ")]));const n=o.utils.book_new(),l=o.utils.aoa_to_sheet(c);l["!cols"]=c[0].map((a,i)=>({wch:[3,8,12].includes(i)?36:14})),o.utils.book_append_sheet(n,l,"Warranty claims"),o.writeFile(n,s)}export{X as amountInWords,dt as claimDocHtml,E as claimHtml,ct as excelClaims,at as excelSales,rt as pdfClaims,ot as pdfSales,nt as printClaims,et as printSales,st as saleDocHtml,D as saleInvoiceHtml,it as salesReturnDocHtml,J as salesReturnHtml};
