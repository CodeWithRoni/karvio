import{_ as L,u as v}from"./index-BQQlFPQv.js";import{b as C,f as g,s as _,q as $,m as b,t as I}from"./format-4oLPXMLQ.js";import{e as t,p as R,s as N}from"./export-DT5Ui9QX.js";import{p as F}from"./purchaseDocs-B5a0Z3D_.js";const j=`
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
`,A=(e,s)=>{const o=v.getState().settings;return`<div class="top"><div><h1>${t(o.shop_name||"Karvio")}</h1><div>${t(o.shop_address||"")}</div><div>${N(o)}</div></div><div><h2>${e}</h2><div style="text-align:right">${s}</div></div></div>`},H=e=>{try{return Array.isArray(e.payments)?e.payments:JSON.parse(e.payments||"[]")}catch{return[]}},w=e=>_(String(e||"").replace(/\n/g,",")),O=`
  .sdoc.tpl-modern .top{border:0;background:#0d1b2a;color:#fff;padding:14px 16px;border-radius:10px}.sdoc.tpl-modern .top .sm{color:#cbd5e1}.sdoc.tpl-modern .top h2{color:#f2c230}
  .sdoc.tpl-modern th{background:#12b5b0;color:#fff}.sdoc.tpl-modern .tot .g td{border-top-color:#12b5b0;color:#0d1b2a}
  .sdoc.tpl-modern .box{border-color:#12b5b0;background:#f4fbfb}
  .sdoc.tpl-minimal .top{border-bottom:1px solid #111}.sdoc.tpl-minimal th{background:#fff;color:#111;border-bottom:2px solid #111}
  .sdoc.tpl-minimal th,.sdoc.tpl-minimal td{border-left:0;border-right:0}.sdoc.tpl-minimal .box{border:0;padding:0}.sdoc.tpl-minimal .tot .g td{border-top:1px solid #111}
  .sdoc .note-line{margin-top:14px;text-align:left;white-space:pre-wrap;font-size:11.5px}
`,V=e=>e==="a5"?"@page{size:A5;margin:8mm}.sdoc{font-size:10.5px}.sdoc h1{font-size:16px}.sdoc h2{font-size:16px}":"@page{size:A4;margin:12mm}",T=()=>v.getState().settings.invoice_template==="business",f=(e,s="a4",o=!1)=>`<style>${o&&s!=="a5"?G():V(s)}body{margin:0}${j}${O}${o?W:""}.sdoc+.sdoc,.bdoc+.bdoc{page-break-before:always;break-before:page}</style>${e.join("")}`,q=()=>{const e=String(v.getState().settings.invoice_note||"").trim();return e?`<div class="note-line"><b>Note:</b> ${t(e)}</div>`:""},P=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"],X=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"],y=e=>e<20?P[e]:`${X[Math.floor(e/10)]}${e%10?" "+P[e%10]:""}`,Q=e=>[e>=100?`${P[Math.floor(e/100)]} Hundred`:"",y(e%100)].filter(Boolean).join(" ");function J(e){const s=Math.abs(Number(e)||0),o=Math.floor(s),c=Math.round((s-o)*100),d=a=>{if(!a)return"";const i=[];let n=a;return n>=1e7&&(i.push(`${d(Math.floor(n/1e7))} Crore`),n%=1e7),n>=1e5&&(i.push(`${y(Math.floor(n/1e5))} Lakh`),n%=1e5),n>=1e3&&(i.push(`${y(Math.floor(n/1e3))} Thousand`),n%=1e3),n&&i.push(Q(n)),i.join(" ")};return`${d(o)||"Zero"}${c?` and ${y(c)} Paisa`:""} Only`}const W=`
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
`,u=(e,s)=>(Number(e)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),M="For Software: 01913354321",G=()=>{const e=new Date,s=c=>JSON.stringify(c),o='font:10.5px "Times New Roman",Times,serif;color:#000;border-top:1px solid #777;padding-top:4px;vertical-align:top';return`@page{size:A4;margin:12mm 12mm 16mm;
    @top-left{content:' '}@top-center{content:' '}@top-right{content:' '}
    @bottom-left{content:${s(`Print Date: ${g(I())}    Print Time: ${e.toLocaleTimeString("en-US")}`)};${o}}
    @bottom-center{content:${s(M)};${o}}
    @bottom-right{content:"Page " counter(page) " of " counter(pages);${o}}}`};function K(e){const s=v.getState().settings,o=e.sale,c=e.customer||{},d=(m,k)=>`<tr><td class="k">${m}</td><td class="c">:</td><td>${k}</td></tr>`,l=e.items.map((m,k)=>{const z=w(m.serials);return`<tr><td class="cn">${k+1}</td><td>${t(m.name)}${z.length?`<div class="sn">${t(z.join(", "))}</div>`:""}${m.returned_qty?`<div class="sn">Returned: ${t($(m.returned_qty))}</div>`:""}</td>
      <td class="cn">${Number(m.warranty_days)>0?t(m.warranty_days):"—"}</td><td class="r">${t(u(m.price))}</td><td class="cn">${t($(m.qty))}${m.unit&&m.unit!=="pcs"?" "+t(m.unit):""}</td><td class="r">${t(u(m.total))}</td></tr>`}).join(""),a=Number(o.total)||0,i=Number(o.paid)||0;let n=null;try{n=typeof o.balance_snapshot=="string"?JSON.parse(o.balance_snapshot||"null"):o.balance_snapshot}catch{}const r=n&&Number.isFinite(Number(n.previous))&&Number.isFinite(Number(n.outstanding)),h=r?Number(n.outstanding):o.customer_id?null:Number(o.due)||0,x=r?Number(n.previous):o.customer_id?null:0,p=t(o.user_name||""),B=c.phones?t(_(c.phones).join(", ")):"",S=!o.customer_id||!o.customer_name||/^walk-?in/i.test(String(o.customer_name).trim()),U=new Date;return`<div class="bdoc">
    <div class="bh"><h1>${t(s.shop_name||"Karvio")}</h1>${s.shop_address?`<div>${t(s.shop_address)}</div>`:""}${N(s)?`<div>${N(s)}</div>`:""}</div>
    <div class="bbar">Invoice/ Bill</div>
    <div class="binfo">
      <table>${d("Sold To",`<b>${S?"CASH":t(o.customer_name)}</b>${!S&&c.addresses?`<div>${t(String(c.addresses).split("|").join("; "))}</div>`:""}`)}${d("Contact No",S?t(s.shop_tel||s.shop_phone||"—"):B||"—")}${d("Invoice No",t(o.invoice_no))}</table>
      <table>${d("Date",t(g(o.date||o.created_at)))}${d("Sold By",p)}${d("Billing By",p)}${d("Sales Person By",p)}</table>
    </div>
    ${o.status==="cancelled"?`<div class="cx">CANCELLED — ${t(o.cancel_reason||"")}</div>`:""}
    <table class="bitems"><thead><tr><th style="width:38px">S/L</th><th>Item Descriptions</th><th style="width:72px">Warranty Days</th><th style="width:96px">Unit Price</th><th style="width:72px">Quantity</th><th style="width:100px">Total</th></tr></thead><tbody>${l}</tbody></table>
    <div class="bsum">
      <div><div><b>Amount In Words :</b> ${t(J(a))}</div>
        <table class="bdue">
          <tr><td class="k">Previous Due</td><td>:</td><td class="r">${x===null?"Not recorded":t(u(x))}</td></tr>
          <tr><td class="k">Sales Amount</td><td>:</td><td class="r">${t(u(a))}</td></tr>
          <tr><td class="k">Collected Amount</td><td>:</td><td class="r">${t(u(i))}</td></tr>
          <tr><td class="k">Outstanding Amount</td><td>:</td><td class="r">${h===null?"Not recorded":t(u(h))}</td></tr>
          ${o.next_payment_date&&o.due>0?`<tr><td class="k">Next Payment Date</td><td>:</td><td class="r">${t(g(o.next_payment_date))}</td></tr>`:""}
        </table></div>
      <table class="btot">
        <tr><td class="k">TOTAL :</td><td class="r">${t(u(o.subtotal))}</td></tr>
        <tr><td class="k">Discount :</td><td class="r">${t(u(o.discount||0))}</td></tr>
        <tr><td class="k">Grand TOTAL :</td><td class="r"><b>${t(u(a))}</b></td></tr>
      </table>
    </div>
    <div class="bsign"><span>Authorised Signature And Company Stamp</span></div>
    ${q()}
    <div class="bfoot"><span>Print Date: ${t(g(I()))}</span><span>Print Time: ${t(U.toLocaleTimeString("en-US"))}</span><span>${M}</span><span>Page 1 of 1</span></div>
  </div>`}function D(e){const s=e.sale,o=e.customer||{},c=e.items.map((a,i)=>{const n=w(a.serials);return`<tr><td>${i+1}</td><td><b>${t(a.name)}</b>${n.length?`<div class="sn">S/N: ${t(n.join(", "))}</div>`:""}${a.warranty_expiry?`<div class="sm">Warranty ${t(a.warranty_days)} days — till ${t(g(a.warranty_expiry))}${a.warranty_type==="invoice"?" (keep this invoice)":""}</div>`:""}${a.returned_qty?`<div class="sm">Returned: ${t($(a.returned_qty))}</div>`:""}</td>
      <td>${t(a.unit||"pcs")}</td><td class="r">${t($(a.qty))}</td><td class="r">${t(b(a.price,!1))}</td><td class="r">${t(b(a.total,!1))}</td></tr>`}).join(""),d=H(s),l=v.getState().settings.invoice_template||"classic";return l==="business"?K(e):`<div class="sdoc tpl-${t(l)}">${A("INVOICE",`<b>${t(s.invoice_no)}</b><br>${t(C(s.created_at||s.date))}<br><span class="sm">Served by ${t(s.user_name||"")}</span>`)}
    ${s.status==="cancelled"?`<div class="cx">CANCELLED — ${t(s.cancel_reason||"")}</div>`:""}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${t(s.customer_name||"Walk-in")}</b>${o.phones?`<div>Phone: ${t(_(o.phones).join(", "))}</div>`:""}${o.addresses?`<div>${t(String(o.addresses).split("|").join("; "))}</div>`:""}</div>
      <div class="box"><b class="t">Payment</b>${d.length?d.map(a=>`<div>${t(a.account_name||"Paid")}: <b>${t(b(a.amount,!1))}</b></div>`).join(""):""}${s.credit_used?`<div>Advance used: <b>${t(b(s.credit_used,!1))}</b></div>`:""}${!d.length&&!s.credit_used?"<div>Sold on due</div>":""}${s.note?`<div class="sm">Note: ${t(s.note)}</div>`:""}</div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Product / serial / warranty</th><th style="width:56px">Unit</th><th class="r" style="width:60px">Qty</th><th class="r" style="width:90px">Price</th><th class="r" style="width:96px">Amount</th></tr></thead><tbody>${c}</tbody></table>
    <table class="tot">
      <tr><td>Subtotal</td><td class="r">${t(b(s.subtotal,!1))}</td></tr>
      ${s.discount?`<tr><td>Discount</td><td class="r">-${t(b(s.discount,!1))}</td></tr>`:""}
      <tr class="g"><td>Total</td><td class="r">${t(b(s.total))}</td></tr>
      <tr><td>Paid</td><td class="r">${t(b(s.paid,!1))}</td></tr>
      ${s.due>0?`<tr><td><b>Due</b></td><td class="r"><b>${t(b(s.due))}</b></td></tr>`:""}
      ${e.customer&&e.customer.balance!==void 0?`<tr><td>Total balance due</td><td class="r">${t(b(e.customer.balance,!1))}</td></tr>`:""}
      ${s.next_payment_date&&s.due>0?`<tr><td>Next payment date</td><td class="r">${t(g(s.next_payment_date))}</td></tr>`:""}
    </table>
    ${e.returns&&e.returns.length?`<p class="sm">Returns: ${t(e.returns.map(a=>`${a.return_no} (${b(a.total,!1)}, ${a.status})`).join(", "))}</p>`:""}
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div>${q()}</div>`}const ot=(e,s)=>R(f(e.map(D),s,T())),at=(e,s="a4")=>f([D(e)],s,T()),nt=(e,s)=>F(e.map(D),j+O+(T()?W:""),s);async function dt(e,s){const o=await L(()=>import("./xlsx-CVny20fG.js"),[],import.meta.url),c=[["Invoice #","Date","Status","Customer","Phone","Address","Subtotal","Discount","Total","Paid","Due","Payment","Served by","Note"]],d=[["Invoice #","Date","Customer","Phone","Product","Unit","Qty","Price","Amount","Serial numbers","Warranty days","Warranty till","Returned qty"]];e.forEach(n=>{const r=n.sale,h=n.customer||{},x=_(h.phones||"").join(", ");c.push([r.invoice_no,String(r.date).slice(0,10),r.status,r.customer_name,x,String(h.addresses||"").split("|").join("; "),r.subtotal,r.discount,r.total,r.paid,r.due,H(r).map(p=>`${p.account_name||""} ${p.amount}`).join("; "),r.user_name||"",r.note||""]),n.items.forEach(p=>d.push([r.invoice_no,String(r.date).slice(0,10),r.customer_name,x,p.name,p.unit||"pcs",p.qty,p.price,p.total,w(p.serials).join(", "),p.warranty_days||"",p.warranty_expiry?String(p.warranty_expiry).slice(0,10):"",p.returned_qty||0]))});const l=o.utils.book_new(),a=o.utils.aoa_to_sheet(c);a["!cols"]=c[0].map((n,r)=>({wch:[3,5,11].includes(r)?30:13}));const i=o.utils.aoa_to_sheet(d);i["!cols"]=d[0].map((n,r)=>({wch:[2,4,9].includes(r)?34:13})),o.utils.book_append_sheet(l,a,"Invoices"),o.utils.book_append_sheet(l,i,"Items & serials"),o.writeFile(l,s)}function E(e){const s=(e.log||[]).map(o=>`<li><b>${t(o.status)}</b> — ${t(C(o.ts))} · ${t(o.user||"")}${o.note?` — ${t(o.note)}`:""}</li>`).join("");return`<div class="sdoc">${A("WARRANTY CLAIM",`<b>${t(e.claim_no)}</b><br>Received ${t(g(e.date))}<br>Status: <b>${t(e.status)}</b>`)}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${t(e.customer_name||"—")}</b><div>${t(e.phone||"")}</div><div class="sm">Invoice: ${t(e.invoice_no||"—")}</div></div>
      <div class="box"><b class="t">Product</b><b>${t(e.product_name||"")}</b><div class="sn">Serial: ${t(e.serial||"—")}</div><div>Warranty till: ${t(g(e.expiry)||"N/A")} — <b>${e.in_warranty?"In warranty":"EXPIRED"}</b></div></div>
    </div>
    <div class="box" style="margin-bottom:12px"><b class="t">Problem reported</b>${t(e.issue||"—")}${e.vendor?`<div style="margin-top:6px"><b class="t">Vendor / service centre</b>${t(e.vendor)}</div>`:""}</div>
    <div class="box"><b class="t">Progress</b><ul class="log" style="margin:4px 0 0;padding-left:18px">${s||"<li>—</li>"}</ul></div>
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div></div>`}const it=e=>R(f(e.map(E))),rt=e=>f([E(e)]);function Y(e){const s=e.ret,o=e.customer||{},c=e.items.map((l,a)=>{const i=w(l.serials);return`<tr><td>${a+1}</td><td><b>${t(l.name)}</b>${i.length?`<div class="sn">S/N: ${t(i.join(", "))}</div>`:""}</td>
      <td class="r">${t($(l.qty))}</td><td class="r">${t(b(l.price,!1))}</td><td class="r">${t(b(l.total,!1))}</td></tr>`}).join(""),d=s.type==="exchange"?"EXCHANGE":"SALES RETURN";return`<div class="sdoc">${A(d,`<b>${t(s.return_no)}</b><br>${t(C(s.created_at||s.date))}<br><span class="sm">By ${t(s.user||"")}</span>`)}
    ${s.status==="cancelled"?`<div class="cx">CANCELLED — ${t(s.cancel_reason||"")}</div>`:""}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${t(s.customer_name||"Walk-in")}</b>${o.phones?`<div>Phone: ${t(_(o.phones).join(", "))}</div>`:""}${o.addresses?`<div>${t(String(o.addresses).split("|").join("; "))}</div>`:""}</div>
      <div class="box"><b class="t">Original invoice</b><b>${t(s.invoice_no||"—")}</b><div>${s.type==="exchange"?"Exchange — value kept as customer credit":"Return"}</div>${s.note?`<div class="sm">Note: ${t(s.note)}</div>`:""}</div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Product / serial</th><th class="r" style="width:60px">Qty</th><th class="r" style="width:90px">Price</th><th class="r" style="width:96px">Value</th></tr></thead><tbody>${c}</tbody></table>
    <table class="tot">
      <tr class="g"><td>Return value</td><td class="r">${t(b(s.total))}</td></tr>
      <tr><td>Refunded${s.refund_account?` (${t(s.refund_account)})`:""}</td><td class="r">${t(b(s.refund||0,!1))}</td></tr>
      ${Number(s.total)-Number(s.refund||0)>.004?`<tr><td>Adjusted to customer balance</td><td class="r">${t(b(Number(s.total)-Number(s.refund||0),!1))}</td></tr>`:""}
    </table>
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div></div>`}const ct=e=>f([Y(e)]),lt=(e,s)=>F(e.map(E),j,s);async function pt(e,s){const o=await L(()=>import("./xlsx-CVny20fG.js"),[],import.meta.url),c=[["Claim #","Received","Status","Product","Serial","Invoice","Customer","Phone","Problem","Coverage","Warranty till","Vendor","Progress"]];e.forEach(a=>c.push([a.claim_no,String(a.date).slice(0,10),a.status,a.product_name,a.serial||"",a.invoice_no||"",a.customer_name||"",a.phone||"",a.issue||"",a.in_warranty?"In warranty":"Expired",a.expiry?String(a.expiry).slice(0,10):"",a.vendor||"",(a.log||[]).map(i=>`${String(i.ts).slice(0,16)} ${i.status}${i.note?` (${i.note})`:""}`).join(" | ")]));const d=o.utils.book_new(),l=o.utils.aoa_to_sheet(c);l["!cols"]=c[0].map((a,i)=>({wch:[3,8,12].includes(i)?36:14})),o.utils.book_append_sheet(d,l,"Warranty claims"),o.writeFile(d,s)}export{J as amountInWords,rt as claimDocHtml,E as claimHtml,pt as excelClaims,dt as excelSales,lt as pdfClaims,nt as pdfSales,it as printClaims,ot as printSales,at as saleDocHtml,D as saleInvoiceHtml,ct as salesReturnDocHtml,Y as salesReturnHtml};
