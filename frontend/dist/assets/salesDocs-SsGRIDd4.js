import{_ as j,u as h}from"./index-Btfq1F1K.js";import{b as A,f as g,s as _,q as $,m}from"./format-BTMnBEjt.js";import{e as t,p as z,s as S}from"./export-DmoadpDQ.js";import{p as D}from"./purchaseDocs-UlzmYEu9.js";const P=`
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
`,I=(e,o)=>{const s=h.getState().settings;return`<div class="top"><div><h1>${t(s.shop_name||"Karvio")}</h1><div>${t(s.shop_address||"")}</div><div>${S(s)}</div></div><div><h2>${e}</h2><div style="text-align:right">${o}</div></div></div>`},E=e=>{try{return Array.isArray(e.payments)?e.payments:JSON.parse(e.payments||"[]")}catch{return[]}},N=e=>_(String(e||"").replace(/\n/g,",")),L=`
  .sdoc.tpl-modern .top{border:0;background:#0d1b2a;color:#fff;padding:14px 16px;border-radius:10px}.sdoc.tpl-modern .top .sm{color:#cbd5e1}.sdoc.tpl-modern .top h2{color:#f2c230}
  .sdoc.tpl-modern th{background:#12b5b0;color:#fff}.sdoc.tpl-modern .tot .g td{border-top-color:#12b5b0;color:#0d1b2a}
  .sdoc.tpl-modern .box{border-color:#12b5b0;background:#f4fbfb}
  .sdoc.tpl-minimal .top{border-bottom:1px solid #111}.sdoc.tpl-minimal th{background:#fff;color:#111;border-bottom:2px solid #111}
  .sdoc.tpl-minimal th,.sdoc.tpl-minimal td{border-left:0;border-right:0}.sdoc.tpl-minimal .box{border:0;padding:0}.sdoc.tpl-minimal .tot .g td{border-top:1px solid #111}
  .sdoc .note-line{margin-top:14px;text-align:left;white-space:pre-wrap;font-size:11.5px}
`,B=e=>e==="a5"?"@page{size:A5;margin:8mm}.sdoc{font-size:10.5px}.sdoc h1{font-size:16px}.sdoc h2{font-size:16px}":"@page{size:A4;margin:12mm}",O=()=>h.getState().settings.invoice_template==="business",R=(e,o="a4",s=!1)=>`<style>${s&&o!=="a5"?Q():B(o)}body{margin:0}${P}${L}${s?F:""}.sdoc+.sdoc,.bdoc+.bdoc{page-break-before:always;break-before:page}</style>${e.join("")}`,q=()=>{const e=String(h.getState().settings.invoice_note||"").trim();return e?`<div class="note-line"><b>Note:</b> ${t(e)}</div>`:""},k=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"],U=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"],f=e=>e<20?k[e]:`${U[Math.floor(e/10)]}${e%10?" "+k[e%10]:""}`,V=e=>[e>=100?`${k[Math.floor(e/100)]} Hundred`:"",f(e%100)].filter(Boolean).join(" ");function X(e){const o=Math.abs(Number(e)||0),s=Math.floor(o),r=Math.round((o-s)*100),i=a=>{if(!a)return"";const c=[];let n=a;return n>=1e7&&(c.push(`${i(Math.floor(n/1e7))} Crore`),n%=1e7),n>=1e5&&(c.push(`${f(Math.floor(n/1e5))} Lakh`),n%=1e5),n>=1e3&&(c.push(`${f(Math.floor(n/1e3))} Thousand`),n%=1e3),n&&c.push(V(n)),c.join(" ")};return`${i(s)||"Zero"}${r?` and ${f(r)} Paisa`:""} Only`}const F=`
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
`,u=(e,o)=>(Number(e)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),W="For Software: 01913354321",Q=()=>{const e=new Date,o=r=>JSON.stringify(r),s='font:10.5px "Times New Roman",Times,serif;color:#000;border-top:1px solid #777;padding-top:4px;vertical-align:top';return`@page{size:A4;margin:12mm 12mm 16mm;
    @top-left{content:' '}@top-center{content:' '}@top-right{content:' '}
    @bottom-left{content:${o(`Print Date: ${g(e.toISOString())}    Print Time: ${e.toLocaleTimeString("en-US")}`)};${s}}
    @bottom-center{content:${o(W)};${s}}
    @bottom-right{content:"Page " counter(page) " of " counter(pages);${s}}}`};function J(e){const o=h.getState().settings,s=e.sale,r=e.customer||{},i=(p,w)=>`<tr><td class="k">${p}</td><td class="c">:</td><td>${w}</td></tr>`,b=e.items.map((p,w)=>{const C=N(p.serials);return`<tr><td class="cn">${w+1}</td><td>${t(p.name)}${C.length?`<div class="sn">${t(C.join(", "))}</div>`:""}${p.returned_qty?`<div class="sn">Returned: ${t($(p.returned_qty))}</div>`:""}</td>
      <td class="cn">${Number(p.warranty_days)>0?t(p.warranty_days):"—"}</td><td class="r">${t(u(p.price))}</td><td class="cn">${t($(p.qty))}${p.unit&&p.unit!=="pcs"?" "+t(p.unit):""}</td><td class="r">${t(u(p.total))}</td></tr>`}).join(""),a=Number(s.total)||0,c=Number(s.paid)||0,n=e.customer&&e.customer.balance!==void 0,d=n?Number(e.customer.balance)||0:Number(s.due)||0,v=n?d-(Number(s.due)||0):0,x=t(s.user_name||""),l=r.phones?t(_(r.phones).join(", ")):"",y=!s.customer_id||!s.customer_name||/^walk-?in/i.test(String(s.customer_name).trim()),T=new Date;return`<div class="bdoc">
    <div class="bh"><h1>${t(o.shop_name||"Karvio")}</h1>${o.shop_address?`<div>${t(o.shop_address)}</div>`:""}${S(o)?`<div>${S(o)}</div>`:""}</div>
    <div class="bbar">Invoice/ Bill</div>
    <div class="binfo">
      <table>${i("Sold To",`<b>${y?"CASH":t(s.customer_name)}</b>${!y&&r.addresses?`<div>${t(String(r.addresses).split("|").join("; "))}</div>`:""}`)}${i("Contact No",y?t(o.shop_tel||o.shop_phone||"—"):l||"—")}${i("Invoice No",t(s.invoice_no))}</table>
      <table>${i("Date",t(g(s.date||s.created_at)))}${i("Sold By",x)}${i("Billing By",x)}${i("Sales Person By",x)}</table>
    </div>
    ${s.status==="cancelled"?`<div class="cx">CANCELLED — ${t(s.cancel_reason||"")}</div>`:""}
    <table class="bitems"><thead><tr><th style="width:38px">S/L</th><th>Item Descriptions</th><th style="width:72px">Warranty Days</th><th style="width:96px">Unit Price</th><th style="width:72px">Quantity</th><th style="width:100px">Total</th></tr></thead><tbody>${b}</tbody></table>
    <div class="bsum">
      <div><div><b>Amount In Words :</b> ${t(X(a))}</div>
        <table class="bdue">
          <tr><td class="k">Previous Due</td><td>:</td><td class="r">${t(u(v))}</td></tr>
          <tr><td class="k">Sales Amount</td><td>:</td><td class="r">${t(u(a))}</td></tr>
          <tr><td class="k">Collected Amount</td><td>:</td><td class="r">${t(u(c+(Number(s.credit_used)||0)))}</td></tr>
          <tr><td class="k">Outstanding Amount</td><td>:</td><td class="r">${t(u(d))}</td></tr>
          ${s.next_payment_date&&s.due>0?`<tr><td class="k">Next Payment Date</td><td>:</td><td class="r">${t(g(s.next_payment_date))}</td></tr>`:""}
        </table></div>
      <table class="btot">
        <tr><td class="k">TOTAL :</td><td class="r">${t(u(s.subtotal))}</td></tr>
        <tr><td class="k">Discount :</td><td class="r">${t(u(s.discount||0))}</td></tr>
        <tr><td class="k">Grand TOTAL :</td><td class="r"><b>${t(u(a))}</b></td></tr>
      </table>
    </div>
    <div class="bsign"><span>Authorised Signature And Company Stamp</span></div>
    ${q()}
    <div class="bfoot"><span>Print Date: ${t(g(T.toISOString()))}</span><span>Print Time: ${t(T.toLocaleTimeString("en-US"))}</span><span>${W}</span><span>Page 1 of 1</span></div>
  </div>`}function M(e){const o=e.sale,s=e.customer||{},r=e.items.map((a,c)=>{const n=N(a.serials);return`<tr><td>${c+1}</td><td><b>${t(a.name)}</b>${n.length?`<div class="sn">S/N: ${t(n.join(", "))}</div>`:""}${a.warranty_expiry?`<div class="sm">Warranty ${t(a.warranty_days)} days — till ${t(g(a.warranty_expiry))}${a.warranty_type==="invoice"?" (keep this invoice)":""}</div>`:""}${a.returned_qty?`<div class="sm">Returned: ${t($(a.returned_qty))}</div>`:""}</td>
      <td>${t(a.unit||"pcs")}</td><td class="r">${t($(a.qty))}</td><td class="r">${t(m(a.price,!1))}</td><td class="r">${t(m(a.total,!1))}</td></tr>`}).join(""),i=E(o),b=h.getState().settings.invoice_template||"classic";return b==="business"?J(e):`<div class="sdoc tpl-${t(b)}">${I("INVOICE",`<b>${t(o.invoice_no)}</b><br>${t(A(o.created_at||o.date))}<br><span class="sm">Served by ${t(o.user_name||"")}</span>`)}
    ${o.status==="cancelled"?`<div class="cx">CANCELLED — ${t(o.cancel_reason||"")}</div>`:""}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${t(o.customer_name||"Walk-in")}</b>${s.phones?`<div>Phone: ${t(_(s.phones).join(", "))}</div>`:""}${s.addresses?`<div>${t(String(s.addresses).split("|").join("; "))}</div>`:""}</div>
      <div class="box"><b class="t">Payment</b>${i.length?i.map(a=>`<div>${t(a.account_name||"Paid")}: <b>${t(m(a.amount,!1))}</b></div>`).join(""):""}${o.credit_used?`<div>Advance used: <b>${t(m(o.credit_used,!1))}</b></div>`:""}${!i.length&&!o.credit_used?"<div>Sold on due</div>":""}${o.note?`<div class="sm">Note: ${t(o.note)}</div>`:""}</div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Product / serial / warranty</th><th style="width:56px">Unit</th><th class="r" style="width:60px">Qty</th><th class="r" style="width:90px">Price</th><th class="r" style="width:96px">Amount</th></tr></thead><tbody>${r}</tbody></table>
    <table class="tot">
      <tr><td>Subtotal</td><td class="r">${t(m(o.subtotal,!1))}</td></tr>
      ${o.discount?`<tr><td>Discount</td><td class="r">-${t(m(o.discount,!1))}</td></tr>`:""}
      <tr class="g"><td>Total</td><td class="r">${t(m(o.total))}</td></tr>
      <tr><td>Paid</td><td class="r">${t(m(o.paid,!1))}</td></tr>
      ${o.due>0?`<tr><td><b>Due</b></td><td class="r"><b>${t(m(o.due))}</b></td></tr>`:""}
      ${e.customer&&e.customer.balance!==void 0?`<tr><td>Total balance due</td><td class="r">${t(m(e.customer.balance,!1))}</td></tr>`:""}
      ${o.next_payment_date&&o.due>0?`<tr><td>Next payment date</td><td class="r">${t(g(o.next_payment_date))}</td></tr>`:""}
    </table>
    ${e.returns&&e.returns.length?`<p class="sm">Returns: ${t(e.returns.map(a=>`${a.return_no} (${m(a.total,!1)}, ${a.status})`).join(", "))}</p>`:""}
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div>${q()}</div>`}const tt=(e,o)=>z(R(e.map(M),o,O())),et=(e,o)=>D(e.map(M),P+L+(O()?F:""),o);async function st(e,o){const s=await j(()=>import("./xlsx-Cznzrv2E.js"),[],import.meta.url),r=[["Invoice #","Date","Status","Customer","Phone","Address","Subtotal","Discount","Total","Paid","Due","Payment","Served by","Note"]],i=[["Invoice #","Date","Customer","Phone","Product","Unit","Qty","Price","Amount","Serial numbers","Warranty days","Warranty till","Returned qty"]];e.forEach(n=>{const d=n.sale,v=n.customer||{},x=_(v.phones||"").join(", ");r.push([d.invoice_no,String(d.date).slice(0,10),d.status,d.customer_name,x,String(v.addresses||"").split("|").join("; "),d.subtotal,d.discount,d.total,d.paid,d.due,E(d).map(l=>`${l.account_name||""} ${l.amount}`).join("; "),d.user_name||"",d.note||""]),n.items.forEach(l=>i.push([d.invoice_no,String(d.date).slice(0,10),d.customer_name,x,l.name,l.unit||"pcs",l.qty,l.price,l.total,N(l.serials).join(", "),l.warranty_days||"",l.warranty_expiry?String(l.warranty_expiry).slice(0,10):"",l.returned_qty||0]))});const b=s.utils.book_new(),a=s.utils.aoa_to_sheet(r);a["!cols"]=r[0].map((n,d)=>({wch:[3,5,11].includes(d)?30:13}));const c=s.utils.aoa_to_sheet(i);c["!cols"]=i[0].map((n,d)=>({wch:[2,4,9].includes(d)?34:13})),s.utils.book_append_sheet(b,a,"Invoices"),s.utils.book_append_sheet(b,c,"Items & serials"),s.writeFile(b,o)}function H(e){const o=(e.log||[]).map(s=>`<li><b>${t(s.status)}</b> — ${t(A(s.ts))} · ${t(s.user||"")}${s.note?` — ${t(s.note)}`:""}</li>`).join("");return`<div class="sdoc">${I("WARRANTY CLAIM",`<b>${t(e.claim_no)}</b><br>Received ${t(g(e.date))}<br>Status: <b>${t(e.status)}</b>`)}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${t(e.customer_name||"—")}</b><div>${t(e.phone||"")}</div><div class="sm">Invoice: ${t(e.invoice_no||"—")}</div></div>
      <div class="box"><b class="t">Product</b><b>${t(e.product_name||"")}</b><div class="sn">Serial: ${t(e.serial||"—")}</div><div>Warranty till: ${t(g(e.expiry)||"N/A")} — <b>${e.in_warranty?"In warranty":"EXPIRED"}</b></div></div>
    </div>
    <div class="box" style="margin-bottom:12px"><b class="t">Problem reported</b>${t(e.issue||"—")}${e.vendor?`<div style="margin-top:6px"><b class="t">Vendor / service centre</b>${t(e.vendor)}</div>`:""}</div>
    <div class="box"><b class="t">Progress</b><ul class="log" style="margin:4px 0 0;padding-left:18px">${o||"<li>—</li>"}</ul></div>
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div></div>`}const ot=e=>z(R(e.map(H))),at=(e,o)=>D(e.map(H),P,o);async function nt(e,o){const s=await j(()=>import("./xlsx-Cznzrv2E.js"),[],import.meta.url),r=[["Claim #","Received","Status","Product","Serial","Invoice","Customer","Phone","Problem","Coverage","Warranty till","Vendor","Progress"]];e.forEach(a=>r.push([a.claim_no,String(a.date).slice(0,10),a.status,a.product_name,a.serial||"",a.invoice_no||"",a.customer_name||"",a.phone||"",a.issue||"",a.in_warranty?"In warranty":"Expired",a.expiry?String(a.expiry).slice(0,10):"",a.vendor||"",(a.log||[]).map(c=>`${String(c.ts).slice(0,16)} ${c.status}${c.note?` (${c.note})`:""}`).join(" | ")]));const i=s.utils.book_new(),b=s.utils.aoa_to_sheet(r);b["!cols"]=r[0].map((a,c)=>({wch:[3,8,12].includes(c)?36:14})),s.utils.book_append_sheet(i,b,"Warranty claims"),s.writeFile(i,o)}export{X as amountInWords,H as claimHtml,nt as excelClaims,st as excelSales,at as pdfClaims,et as pdfSales,ot as printClaims,tt as printSales,M as saleInvoiceHtml};
