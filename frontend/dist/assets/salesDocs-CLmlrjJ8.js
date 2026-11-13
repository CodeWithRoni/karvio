import{_ as H,u as _}from"./index-CGT9AzLk.js";import{b as T,f as v,s as S,q as w,m,t as O}from"./format-B4Rgg47D.js";import{e as t,p as M,s as A}from"./export-BIIekvNw.js";import{p as B}from"./purchaseDocs--CtPfaP3.js";const D=`
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
`,z=(s,e,o=_.getState().settings)=>{const n=o;return`<div class="top"><div><h1>${t(n.shop_name||"Karvio")}</h1><div>${t(n.shop_address||"")}</div><div>${A(n)}</div></div><div><h2>${s}</h2><div style="text-align:right">${e}</div></div></div>`},W=s=>{try{return Array.isArray(s.payments)?s.payments:JSON.parse(s.payments||"[]")}catch{return[]}},C=s=>S(String(s||"").replace(/\n/g,",")),V=`
  .sdoc.tpl-modern .top{border:0;background:#0d1b2a;color:#fff;padding:14px 16px;border-radius:10px}.sdoc.tpl-modern .top .sm{color:#cbd5e1}.sdoc.tpl-modern .top h2{color:#f2c230}
  .sdoc.tpl-modern th{background:#12b5b0;color:#fff}.sdoc.tpl-modern .tot .g td{border-top-color:#12b5b0;color:#0d1b2a}
  .sdoc.tpl-modern .box{border-color:#12b5b0;background:#f4fbfb}
  .sdoc.tpl-minimal .top{border-bottom:1px solid #111}.sdoc.tpl-minimal th{background:#fff;color:#111;border-bottom:2px solid #111}
  .sdoc.tpl-minimal th,.sdoc.tpl-minimal td{border-left:0;border-right:0}.sdoc.tpl-minimal .box{border:0;padding:0}.sdoc.tpl-minimal .tot .g td{border-top:1px solid #111}
  .sdoc .note-line{margin-top:14px;text-align:left;white-space:pre-wrap;font-size:11.5px}
`,J=s=>s==="a5"?"@page{size:A5;margin:8mm}.sdoc{font-size:10.5px}.sdoc h1{font-size:16px}.sdoc h2{font-size:16px}":"@page{size:A4;margin:12mm}",I=(s=[])=>s.length?s.some(e=>(e.shop||_.getState().settings).invoice_template==="business"):_.getState().settings.invoice_template==="business",N=(s,e="a4",o=!1)=>`<style>${o&&e!=="a5"?Z():J(e)+(o?".bdoc{--bdoc-h:194mm;--bdoc-w:132mm}":"")}body{margin:0}${D}${V}${o?X:""}.sdoc+.sdoc,.bdoc+.bdoc{page-break-before:always;break-before:page}</style>${s.join("")}`,U=(s=_.getState().settings)=>{const e=String(s.invoice_note||"").trim();return e?`<div class="note-line"><b>Note:</b> ${t(e)}</div>`:""},E=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"],G=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"],k=s=>s<20?E[s]:`${G[Math.floor(s/10)]}${s%10?" "+E[s%10]:""}`,K=s=>[s>=100?`${E[Math.floor(s/100)]} Hundred`:"",k(s%100)].filter(Boolean).join(" ");function Y(s){const e=Math.abs(Number(s)||0),o=Math.floor(e),n=Math.round((e-o)*100),c=d=>{if(!d)return"";const a=[];let i=d;return i>=1e7&&(a.push(`${c(Math.floor(i/1e7))} Crore`),i%=1e7),i>=1e5&&(a.push(`${k(Math.floor(i/1e5))} Lakh`),i%=1e5),i>=1e3&&(a.push(`${k(Math.floor(i/1e3))} Thousand`),i%=1e3),i&&a.push(K(i)),a.join(" ")};return`${c(o)||"Zero"}${n?` and ${k(n)} Paisa`:""} Only`}const X=`
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
  .bdoc .btail{margin-top:8px;break-inside:avoid;page-break-inside:avoid}
  .bdoc .bsum{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
  .bdoc .btot td{padding:2px 0 2px 12px;border:0}.bdoc .btot td.k{font-weight:700;padding-left:0}.bdoc .btot td.r{text-align:right;min-width:110px}
  .bdoc .bdue{border:1.5px solid #000;padding:8px 10px;margin-top:10px;width:300px}.bdoc .bdue td{padding:2px 0;border:0}.bdoc .bdue td.k{font-weight:700}.bdoc .bdue td.r{text-align:right}
  .bdoc .bend{display:flex;justify-content:space-between;align-items:flex-end;gap:28px;padding-top:56px}
  .bdoc .bend .note-line{flex:1;margin:0;text-align:left;white-space:pre-wrap;font-size:11.5px}
  .bdoc .bsign{flex:none;width:230px;margin-left:auto;border-top:1px solid #000;text-align:center;padding-top:5px}
  .bdoc .cx{margin:8px 0;padding:6px 10px;border:2px solid #c0392b;color:#c0392b;font-weight:800;text-align:center}
  .bdoc .bfoot{display:flex;justify-content:space-between;border-top:1px solid #777;margin-top:22px;padding-top:5px;font-size:11px}
  @media print{.bdoc .bfoot{display:none}}
`,g=(s,e)=>(Number(s)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),Q="For Software: 01913354321",Z=()=>{const s=new Date,e=n=>JSON.stringify(n),o='font:10.5px "Times New Roman",Times,serif;color:#000;border-top:1px solid #777;padding-top:4px;vertical-align:top';return`@page{size:A4;margin:12mm 12mm 16mm;
    @top-left{content:' '}@top-center{content:' '}@top-right{content:' '}
    @bottom-left{content:${e(`Print Date: ${v(O())}    Print Time: ${s.toLocaleTimeString("en-US")}`)};${o}}
    @bottom-center{content:${e(Q)};${o}}
    @bottom-right{content:"Page " counter(page) " of " counter(pages);${o}}}
    .bdoc{--bdoc-h:269mm;--bdoc-w:186mm}`};function tt(s){const e=s.shop||_.getState().settings,o=s.sale,n=s.customer||{},c=(b,$)=>`<tr><td class="k">${b}</td><td class="c">:</td><td>${$}</td></tr>`,l=s.items.map((b,$)=>{const y=C(b.serials);return`<tr><td class="cn">${$+1}</td><td>${t(b.name)}${y.length?`<div class="sn">${t(y.join(", "))}</div>`:""}${b.returned_qty?`<div class="sn">Returned: ${t(w(b.returned_qty))}</div>`:""}</td>
      <td class="cn">${Number(b.warranty_days)>0?t(b.warranty_days):"—"}</td><td class="r">${t(g(b.price))}</td><td class="cn">${t(w(b.qty))}${b.unit&&b.unit!=="pcs"?" "+t(b.unit):""}</td><td class="r">${t(g(b.total))}</td></tr>`}).join(""),d=Number(o.total)||0,a=Number(o.live_invoice?o.paid_now??o.paid:o.paid)||0;let i=null;try{i=typeof o.balance_snapshot=="string"?JSON.parse(o.balance_snapshot||"null"):o.balance_snapshot}catch{}const r=i&&Number.isFinite(Number(i.previous))&&Number.isFinite(Number(i.outstanding)),u=o.live_invoice?Number(o.due_now??o.due)||0:r?Number(i.outstanding):o.customer_id?null:Number(o.due)||0,x=r?Number(i.previous):o.customer_id?null:0,p=t(o.user_name||""),j=n.phones?t(S(n.phones).join(", ")):"",h=!o.customer_id||!o.customer_name||/^walk-?in/i.test(String(o.customer_name).trim()),f=new Date;return`<div class="bdoc">
    <div class="bh"><h1>${t(e.shop_name||"Karvio")}</h1>${e.shop_address?`<div>${t(e.shop_address)}</div>`:""}${A(e)?`<div>${A(e)}</div>`:""}</div>
    <div class="bbar">Invoice/ Bill</div>
    <div class="binfo">
      <table>${c("Sold To",`<b>${h?"CASH":t(o.customer_name)}</b>`)}${c("Address",!h&&n.addresses?t(String(n.addresses).split("|").map(b=>b.trim()).filter(Boolean).join("; ")):"—")}${c("Contact No",h?t(e.shop_tel||e.shop_phone||"—"):j||"—")}${c("Invoice No",t(o.invoice_no))}</table>
      <table>${c("Date",t(v(o.date||o.created_at)))}${c("Sold By",p)}${c("Billing By",p)}${c("Sales Person By",p)}</table>
    </div>
    ${o.status==="cancelled"?`<div class="cx">CANCELLED — ${t(o.cancel_reason||"")}</div>`:""}
    <table class="bitems"><thead><tr><th style="width:38px">S/L</th><th>Item Descriptions</th><th style="width:72px">Warranty Days</th><th style="width:96px">Unit Price</th><th style="width:72px">Quantity</th><th style="width:100px">Total</th></tr></thead><tbody>${l}</tbody></table>
    <div class="btail"><div class="bsum">
      <div><div><b>Amount In Words :</b> ${t(Y(d))}</div>
        <table class="bdue">
          <tr><td class="k">${o.live_invoice?"Previous balance at sale":"Previous Due"}</td><td>:</td><td class="r">${x===null?"Not recorded":t(g(x))}</td></tr>
          <tr><td class="k">Sales Amount</td><td>:</td><td class="r">${t(g(d))}</td></tr>
          ${o.live_invoice&&o.returned_total>0?`<tr><td class="k">Returned value</td><td>:</td><td class="r">${t(g(o.returned_total))}</td></tr><tr><td class="k">Net invoice amount</td><td>:</td><td class="r">${t(g(o.net_total))}</td></tr>`:""}
          <tr><td class="k">${o.live_invoice?"Paid now":"Collected Amount"}</td><td>:</td><td class="r">${t(g(a))}</td></tr>
          <tr><td class="k">${o.live_invoice?"Invoice due now":"Outstanding Amount"}</td><td>:</td><td class="r">${u===null?"Not recorded":t(g(u))}</td></tr>
          ${o.next_payment_date&&o.due>0?`<tr><td class="k">Next Payment Date</td><td>:</td><td class="r">${t(v(o.next_payment_date))}</td></tr>`:""}
        </table></div>
      <table class="btot">
        <tr><td class="k">TOTAL :</td><td class="r">${t(g(o.subtotal))}</td></tr>
        <tr><td class="k">Discount :</td><td class="r">${t(g(o.discount||0))}</td></tr>
        <tr><td class="k">Grand TOTAL :</td><td class="r"><b>${t(g(d))}</b></td></tr>
      </table>
    </div>
    <div class="bspace"></div>
    <div class="bend">${U(e)}<div class="bsign">Authorised Signature And Company Stamp</div></div></div>
    <div class="bfoot"><span>Print Date: ${t(v(O()))}</span><span>Print Time: ${t(f.toLocaleTimeString("en-US"))}</span><span>${Q}</span><span>Page 1 of 1</span></div>
  </div>`}function L(s){const e=s.sale,o=s.customer||{},n=s.items.map((a,i)=>{const r=C(a.serials);return`<tr><td>${i+1}</td><td><b>${t(a.name)}</b>${r.length?`<div class="sn">S/N: ${t(r.join(", "))}</div>`:""}${a.warranty_expiry?`<div class="sm">Warranty ${t(a.warranty_days)} days — till ${t(v(a.warranty_expiry))}${a.warranty_type==="invoice"?" (keep this invoice)":""}</div>`:""}${a.returned_qty?`<div class="sm">Returned: ${t(w(a.returned_qty))}</div>`:""}</td>
      <td>${t(a.unit||"pcs")}</td><td class="r">${t(w(a.qty))}</td><td class="r">${t(m(a.price,!1))}</td><td class="r">${t(m(a.total,!1))}</td></tr>`}).join(""),c=W(e),l=s.shop||_.getState().settings,d=l.invoice_template||"classic";return d==="business"?tt(s):`<div class="sdoc tpl-${t(d)}">${z("INVOICE",`<b>${t(e.invoice_no)}</b><br>${t(T(e.created_at||e.date))}<br><span class="sm">Served by ${t(e.user_name||"")}</span>`,l)}
    ${e.status==="cancelled"?`<div class="cx">CANCELLED — ${t(e.cancel_reason||"")}</div>`:""}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${t(e.customer_name||"Cash")}</b>${o.phones?`<div>Phone: ${t(S(o.phones).join(", "))}</div>`:""}${o.addresses?`<div>${t(String(o.addresses).split("|").join("; "))}</div>`:""}</div>
      <div class="box"><b class="t">${e.live_invoice?"Payments at sale":"Payment"}</b>${c.length?c.map(a=>`<div>${t(a.account_name||"Paid")}: <b>${t(m(a.amount,!1))}</b></div>`).join(""):""}${e.credit_used?`<div>Advance used: <b>${t(m(e.credit_used,!1))}</b></div>`:""}${!c.length&&!e.credit_used?"<div>Sold on due</div>":""}${e.note?`<div class="sm">Note: ${t(e.note)}</div>`:""}</div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Product / serial / warranty</th><th style="width:56px">Unit</th><th class="r" style="width:60px">Qty</th><th class="r" style="width:90px">Price</th><th class="r" style="width:96px">Amount</th></tr></thead><tbody>${n}</tbody></table>
    <table class="tot">
      <tr><td>Subtotal</td><td class="r">${t(m(e.subtotal,!1))}</td></tr>
      ${e.discount?`<tr><td>Discount</td><td class="r">-${t(m(e.discount,!1))}</td></tr>`:""}
      <tr class="g"><td>Total</td><td class="r">${t(m(e.total))}</td></tr>
      ${e.live_invoice&&e.returned_total>0?`<tr><td>Returned value</td><td class="r">${t(m(e.returned_total,!1))}</td></tr><tr><td>Net invoice amount</td><td class="r">${t(m(e.net_total,!1))}</td></tr>`:""}
      <tr><td>${e.live_invoice?"Paid now":"Paid"}</td><td class="r">${t(m(e.live_invoice?e.paid_now??e.paid:e.paid,!1))}</td></tr>
      ${e.due>0?`<tr><td><b>Due</b></td><td class="r"><b>${t(m(e.due))}</b></td></tr>`:""}
      ${s.customer&&s.customer.balance!==void 0?`<tr><td>Total balance due</td><td class="r">${t(m(s.customer.balance,!1))}</td></tr>`:""}
      ${e.next_payment_date&&e.due>0?`<tr><td>Next payment date</td><td class="r">${t(v(e.next_payment_date))}</td></tr>`:""}
    </table>
    ${s.returns&&s.returns.length?`<p class="sm">Returns: ${t(s.returns.map(a=>`${a.return_no} (${m(a.total,!1)}, ${a.status})`).join(", "))}</p>`:""}
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div>${U(l)}</div>`}const it=(s,e)=>M(N(s.map(L),e,I(s)),et);function et(s){const e=3.7795275590551185,o=10;s.querySelectorAll(".bdoc").forEach(n=>{var q;const c=s.defaultView.getComputedStyle(n),l=parseFloat(c.getPropertyValue("--bdoc-h"))*e,d=parseFloat(c.getPropertyValue("--bdoc-w"))*e,a=n.querySelector(".bitems"),i=n.querySelector(".btail"),r=n.querySelector(".bspace");if(!l||!d||!a||!i||!r)return;Object.assign(n.style,{width:d+"px",boxSizing:"border-box"}),r.style.height="0px";const u=P=>P.getBoundingClientRect(),x=u(n).top,p=a.tHead?u(a.tHead).height:0,j=[...((q=a.tBodies[0])==null?void 0:q.rows)||[]];let h=u(a).top-x+p,f=0,b=u(a).top+p;for(const P of j){const F=u(P).height;h+F>l&&f&&(h=p,f=0),h+=F,f++,b=u(P).bottom}let $=h+(u(i).top-b);const y=u(i).height;$+y>l&&($=0),r.style.height=Math.max(0,Math.floor(l-$-y-o))+"px",Object.assign(n.style,{width:"",boxSizing:""})})}const rt=(s,e="a4")=>N([L(s)],e,I([s])),ct=(s,e)=>B(s.map(L),D+V+(I(s)?X:""),e);async function lt(s,e){const o=await H(()=>import("./xlsx-Cznzrv2E.js"),[],import.meta.url),n=[["Invoice #","Date","Status","Customer","Phone","Address","Subtotal","Discount","Total","Paid","Due","Payment","Served by","Note"]],c=[["Invoice #","Date","Customer","Phone","Product","Unit","Qty","Price","Amount","Serial numbers","Warranty days","Warranty till","Returned qty"]];s.forEach(i=>{const r=i.sale,u=i.customer||{},x=S(u.phones||"").join(", ");n.push([r.invoice_no,String(r.date).slice(0,10),r.status,r.customer_name,x,String(u.addresses||"").split("|").join("; "),r.subtotal,r.discount,r.total,r.paid,r.due,W(r).map(p=>`${p.account_name||""} ${p.amount}`).join("; "),r.user_name||"",r.note||""]),i.items.forEach(p=>c.push([r.invoice_no,String(r.date).slice(0,10),r.customer_name,x,p.name,p.unit||"pcs",p.qty,p.price,p.total,C(p.serials).join(", "),p.warranty_days||"",p.warranty_expiry?String(p.warranty_expiry).slice(0,10):"",p.returned_qty||0]))});const l=o.utils.book_new(),d=o.utils.aoa_to_sheet(n);d["!cols"]=n[0].map((i,r)=>({wch:[3,5,11].includes(r)?30:13}));const a=o.utils.aoa_to_sheet(c);a["!cols"]=c[0].map((i,r)=>({wch:[2,4,9].includes(r)?34:13})),o.utils.book_append_sheet(l,d,"Invoices"),o.utils.book_append_sheet(l,a,"Items & serials"),o.writeFile(l,e)}function R(s){const e=(s.log||[]).map(o=>`<li><b>${t(o.status)}</b> — ${t(T(o.ts))} · ${t(o.user||"")}${o.note?` — ${t(o.note)}`:""}</li>`).join("");return`<div class="sdoc">${z("WARRANTY CLAIM",`<b>${t(s.claim_no)}</b><br>Received ${t(v(s.date))}<br>Status: <b>${t(s.status)}</b>`)}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${t(s.customer_name||"—")}</b><div>${t(s.phone||"")}</div><div class="sm">Invoice: ${t(s.invoice_no||"—")}</div></div>
      <div class="box"><b class="t">Product</b><b>${t(s.product_name||"")}</b><div class="sn">Serial: ${t(s.serial||"—")}</div><div>Warranty till: ${t(v(s.expiry)||"N/A")} — <b>${s.in_warranty?"In warranty":"EXPIRED"}</b></div></div>
    </div>
    <div class="box" style="margin-bottom:12px"><b class="t">Problem reported</b>${t(s.issue||"—")}${s.vendor?`<div style="margin-top:6px"><b class="t">Vendor / service centre</b>${t(s.vendor)}</div>`:""}</div>
    <div class="box"><b class="t">Progress</b><ul class="log" style="margin:4px 0 0;padding-left:18px">${e||"<li>—</li>"}</ul></div>
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div></div>`}const pt=s=>M(N(s.map(R))),bt=s=>N([R(s)]);function st(s){const e=s.ret,o=s.customer||{},n=s.items.map((l,d)=>{const a=C(l.serials);return`<tr><td>${d+1}</td><td><b>${t(l.name)}</b>${a.length?`<div class="sn">S/N: ${t(a.join(", "))}</div>`:""}</td>
      <td class="r">${t(w(l.qty))}</td><td class="r">${t(m(l.price,!1))}</td><td class="r">${t(m(l.total,!1))}</td></tr>`}).join(""),c=e.type==="exchange"?"EXCHANGE":"SALES RETURN";return`<div class="sdoc">${z(c,`<b>${t(e.return_no)}</b><br>${t(T(e.created_at||e.date))}<br><span class="sm">By ${t(e.user||"")}</span>`)}
    ${e.status==="cancelled"?`<div class="cx">CANCELLED — ${t(e.cancel_reason||"")}</div>`:""}
    <div class="meta">
      <div class="box"><b class="t">Customer</b><b>${t(e.customer_name||"Cash")}</b>${o.phones?`<div>Phone: ${t(S(o.phones).join(", "))}</div>`:""}${o.addresses?`<div>${t(String(o.addresses).split("|").join("; "))}</div>`:""}</div>
      <div class="box"><b class="t">Original invoice</b><b>${t(e.invoice_no||"—")}</b><div>${e.type==="exchange"?"Exchange — value kept as customer credit":"Return"}</div>${e.note?`<div class="sm">Note: ${t(e.note)}</div>`:""}</div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Product / serial</th><th class="r" style="width:60px">Qty</th><th class="r" style="width:90px">Price</th><th class="r" style="width:96px">Value</th></tr></thead><tbody>${n}</tbody></table>
    <table class="tot">
      <tr class="g"><td>Return value</td><td class="r">${t(m(e.total))}</td></tr>
      <tr><td>Refunded${e.refund_account?` (${t(e.refund_account)})`:""}</td><td class="r">${t(m(e.refund||0,!1))}</td></tr>
      ${Number(e.total)-Number(e.refund||0)>.004?`<tr><td>Adjusted to customer balance</td><td class="r">${t(m(Number(e.total)-Number(e.refund||0),!1))}</td></tr>`:""}
    </table>
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Customer signature: ____________________</span></div></div>`}const mt=s=>N([st(s)]),ut=(s,e)=>B(s.map(R),D,e);async function gt(s,e){const o=await H(()=>import("./xlsx-Cznzrv2E.js"),[],import.meta.url),n=[["Claim #","Received","Status","Product","Serial","Invoice","Customer","Phone","Problem","Coverage","Warranty till","Vendor","Progress"]];s.forEach(d=>n.push([d.claim_no,String(d.date).slice(0,10),d.status,d.product_name,d.serial||"",d.invoice_no||"",d.customer_name||"",d.phone||"",d.issue||"",d.in_warranty?"In warranty":"Expired",d.expiry?String(d.expiry).slice(0,10):"",d.vendor||"",(d.log||[]).map(a=>`${String(a.ts).slice(0,16)} ${a.status}${a.note?` (${a.note})`:""}`).join(" | ")]));const c=o.utils.book_new(),l=o.utils.aoa_to_sheet(n);l["!cols"]=n[0].map((d,a)=>({wch:[3,8,12].includes(a)?36:14})),o.utils.book_append_sheet(c,l,"Warranty claims"),o.writeFile(c,e)}export{Y as amountInWords,bt as claimDocHtml,R as claimHtml,gt as excelClaims,lt as excelSales,et as fitBizEnd,ut as pdfClaims,ct as pdfSales,pt as printClaims,it as printSales,rt as saleDocHtml,L as saleInvoiceHtml,mt as salesReturnDocHtml,st as salesReturnHtml};
