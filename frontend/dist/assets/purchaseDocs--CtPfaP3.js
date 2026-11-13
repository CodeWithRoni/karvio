const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./jspdf.es.min-DflbgHiY.js","./index-CGT9AzLk.js","./index-Cgu6MHHI.css"])))=>i.map(i=>d[i]);
import{_ as f,u as P}from"./index-CGT9AzLk.js";import{s as m,q as S,m as l,f as E,b as D}from"./format-B4Rgg47D.js";import{p as k,d as H,e as t,s as j}from"./export-BIIekvNw.js";const x=`
  .pinv{font:12px/1.45 'Manrope','Hind Siliguri',system-ui,sans-serif;color:#111;background:#fff}
  .pinv *{box-sizing:border-box}
  .pinv .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d1b2a;padding-bottom:10px;margin-bottom:12px}
  .pinv h1{margin:0;font-size:20px}.pinv h2{margin:0;font-size:22px;letter-spacing:.04em;color:#0d1b2a;text-align:right}
  .pinv .meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
  .pinv .box{border:1px solid #ccd3dc;border-radius:6px;padding:8px 10px}
  .pinv .box b.t{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#556;margin-bottom:3px}
  .pinv table{width:100%;border-collapse:collapse}
  .pinv th,.pinv td{border:1px solid #ccd3dc;padding:5px 7px;text-align:left;vertical-align:top}
  .pinv th{background:#0d1b2a;color:#fff;font-weight:600;font-size:11.5px}
  .pinv .r{text-align:right}.pinv .sm{font-size:10.5px;color:#444}.pinv .sn{font-family:Consolas,monospace;font-size:10.5px;word-break:break-all}
  .pinv .tot{margin-left:auto;width:290px;margin-top:10px}.pinv .tot td{border:0;padding:3px 0}.pinv .tot .g td{font-weight:800;font-size:14px;border-top:2px solid #0d1b2a;padding-top:6px}
  .pinv .cx{margin:8px 0;padding:6px 10px;border:2px solid #c0392b;color:#c0392b;font-weight:800;text-align:center}
  .pinv .foot{margin-top:18px;display:flex;justify-content:space-between;font-size:11px;color:#444}
`,A=s=>{try{return Array.isArray(s.payments)?s.payments:JSON.parse(s.payments||"[]")}catch{return[]}};function y(s){const p=P.getState().settings,e=s.purchase,o=s.supplier||{},h=s.items.map((a,v)=>{const n=m(String(a.serials||"").replace(/\n/g,","));return`<tr><td>${v+1}</td><td><b>${t(a.name)}</b>${a.sku?`<div class="sm">Model: ${t(a.sku)}</div>`:""}${a.description?`<div class="sm">${t(a.description)}</div>`:""}${n.length?`<div class="sn">S/N (${n.length}): ${t(n.join(", "))}</div>`:""}</td>
      <td>${t(a.unit||"pcs")}</td><td class="r">${t(S(a.qty))}</td><td class="r">${t(l(a.cost,!1))}</td><td class="r">${t(l(a.total,!1))}</td></tr>`}).join(""),d=A(e);return`<div class="pinv">
    <div class="top"><div><h1>${t(p.shop_name||"Karvio")}</h1><div>${t(p.shop_address||"")}</div><div>${j(p)}</div></div>
      <div><h2>PURCHASE INVOICE</h2><div style="text-align:right"><b>${t(e.invoice_no)}</b><br>${e.supplier_invoice?`Supplier invoice: <b>${t(e.supplier_invoice)}</b><br>`:""}Date: ${t(E(e.date))}<br><span class="sm">Entered ${t(D(e.created_at))} by ${t(e.user||"")}</span></div></div></div>
    ${e.status==="cancelled"?`<div class="cx">CANCELLED — ${t(e.cancel_reason||"")}</div>`:""}
    <div class="meta">
      <div class="box"><b class="t">Supplier</b><b>${t(o.name||e.supplier_name||"—")}</b>${o.phones?`<div>Phone: ${t(m(o.phones).join(", "))}</div>`:""}${o.address?`<div>${t(o.address)}</div>`:""}</div>
      <div class="box"><b class="t">Payment</b>${d.length?d.map(a=>`<div>${t(a.account_name||"Paid")}: <b>${t(l(a.amount,!1))}</b></div>`).join(""):"<div>Bought on credit</div>"}${e.note?`<div class="sm">Note: ${t(e.note)}</div>`:""}</div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Product / description / serial numbers</th><th style="width:56px">Unit</th><th class="r" style="width:60px">Qty</th><th class="r" style="width:92px">Purchase price</th><th class="r" style="width:96px">Amount</th></tr></thead><tbody>${h}</tbody></table>
    <table class="tot">
      <tr><td>Subtotal</td><td class="r">${t(l(e.subtotal,!1))}</td></tr>
      ${e.discount?`<tr><td>Discount</td><td class="r">-${t(l(e.discount,!1))}</td></tr>`:""}
      <tr class="g"><td>Total</td><td class="r">${t(l(e.total))}</td></tr>
      <tr><td>Paid</td><td class="r">${t(l(e.paid,!1))}</td></tr>
      <tr><td><b>Due at purchase</b></td><td class="r"><b>${t(l(e.due))}</b></td></tr>
      <tr><td><b>Due now</b></td><td class="r"><b>${t(l(e.due_now??e.due))}</b></td></tr>
    </table>
    ${s.returns&&s.returns.length?`<p class="sm">Returns: ${t(s.returns.map(a=>`${a.return_no} (${l(a.total,!1)}, ${a.status})`).join(", "))}</p>`:""}
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Received by: ____________________</span></div>
  </div>`}function M(s){return k(`<style>@page{size:A4;margin:12mm}body{margin:0}${x}.pinv+.pinv{page-break-before:always;break-before:page}</style>${s.map(y).join("")}`)}const R=s=>`<style>@page{size:A4;margin:12mm}body{margin:0}${x}</style>${s}`,T=s=>R(y(s));function L(s){const p=P.getState().settings,e=s.ret,o=s.supplier||{},h=s.items.map((a,v)=>{const n=m(String(a.serials||"").replace(/\n/g,","));return`<tr><td>${v+1}</td><td><b>${t(a.name)}</b>${n.length?`<div class="sn">S/N (${n.length}): ${t(n.join(", "))}</div>`:""}</td>
      <td class="r">${t(S(a.qty))}</td><td class="r">${t(l(a.cost,!1))}</td><td class="r">${t(l(a.total,!1))}</td></tr>`}).join(""),d=Number(e.total)-Number(e.received||0);return`<div class="pinv">
    <div class="top"><div><h1>${t(p.shop_name||"Karvio")}</h1><div>${t(p.shop_address||"")}</div><div>${j(p)}</div></div>
      <div><h2>PURCHASE RETURN</h2><div style="text-align:right"><b>${t(e.return_no)}</b><br>Date: ${t(E(e.date))}<br><span class="sm">Entered ${t(D(e.created_at))} by ${t(e.user||"")}</span></div></div></div>
    ${e.status==="cancelled"?`<div class="cx">CANCELLED — ${t(e.cancel_reason||"")}</div>`:""}
    <div class="meta">
      <div class="box"><b class="t">Returned to supplier</b><b>${t(o.name||e.supplier_name||"—")}</b>${o.phones?`<div>Phone: ${t(m(o.phones).join(", "))}</div>`:""}${o.address?`<div>${t(o.address)}</div>`:""}</div>
      <div class="box"><b class="t">Original purchase</b><b>${t(e.invoice_no||"—")}</b>${e.note?`<div class="sm">Note: ${t(e.note)}</div>`:""}</div>
    </div>
    <table><thead><tr><th style="width:28px">#</th><th>Product / serial numbers</th><th class="r" style="width:60px">Qty</th><th class="r" style="width:92px">Purchase price</th><th class="r" style="width:96px">Value</th></tr></thead><tbody>${h}</tbody></table>
    <table class="tot">
      <tr class="g"><td>Return value</td><td class="r">${t(l(e.total))}</td></tr>
      <tr><td>Received from supplier${e.account?` (${t(e.account)})`:""}</td><td class="r">${t(l(e.received||0,!1))}</td></tr>
      ${d>.004?`<tr><td>Adjusted to supplier balance</td><td class="r">${t(l(d,!1))}</td></tr>`:""}
    </table>
    <div class="foot"><span>Printed ${t(new Date().toLocaleString())}</span><span>Received by: ____________________</span></div>
  </div>`}const O=s=>R(L(s));async function z(s,p,e){const[{jsPDF:o},{default:h}]=await Promise.all([f(()=>import("./jspdf.es.min-DflbgHiY.js").then(c=>c.j),__vite__mapDeps([0,1,2]),import.meta.url),f(()=>import("./html2canvas.esm-CBrSDip1.js"),[],import.meta.url)]),d=new o({unit:"pt",format:"a4"}),a=d.internal.pageSize.getWidth(),v=d.internal.pageSize.getHeight(),n=32,i=document.createElement("div");Object.assign(i.style,{position:"absolute",left:"-10000px",top:"0",width:"760px",background:"#fff"}),i.innerHTML=`<style>${H}${p}</style>`,document.body.appendChild(i);try{await document.fonts.load("400 12px 'Hind Siliguri'","বাংলা");let c=!0;for(const g of s){const r=document.createElement("div");r.style.padding="4px",r.innerHTML=g,i.appendChild(r);const b=await h(r,{scale:2,backgroundColor:"#ffffff",logging:!1});r.remove();const $=a-n*2,w=Math.floor((v-n*2)/$*b.width);for(let _=0;_<b.height;_+=w){const u=document.createElement("canvas");u.width=b.width,u.height=Math.min(w,b.height-_),u.getContext("2d").drawImage(b,0,_,u.width,u.height,0,0,u.width,u.height),c||d.addPage(),c=!1,d.addImage(u.toDataURL("image/jpeg",.92),"JPEG",n,n,$,u.height/u.width*$)}}d.save(e)}finally{i.remove()}}const U=(s,p)=>z(s.map(y),x,p);async function q(s,p){const e=await f(()=>import("./xlsx-Cznzrv2E.js"),[],import.meta.url),o=[["Purchase #","Supplier invoice","Date","Status","Supplier","Phone","Address","Subtotal","Discount","Total","Paid","Due at purchase","Due now","Payment","Note","Entered by"]],h=[["Purchase #","Supplier invoice","Date","Supplier","Phone","Address","Product","Model","Description","Unit","Qty","Purchase price","Amount","Serial numbers"]];s.forEach(n=>{const i=n.purchase,c=n.supplier||{},g=m(c.phones||"").join(", ");o.push([i.invoice_no,i.supplier_invoice||"",String(i.date).slice(0,10),i.status,c.name||i.supplier_name||"",g,c.address||"",i.subtotal,i.discount,i.total,i.paid,i.due,i.due_now??i.due,A(i).map(r=>`${r.account_name||""} ${r.amount}`).join("; "),i.note||"",i.user||""]),n.items.forEach(r=>h.push([i.invoice_no,i.supplier_invoice||"",String(i.date).slice(0,10),c.name||i.supplier_name||"",g,c.address||"",r.name,r.sku||"",r.description||"",r.unit||"pcs",r.qty,r.cost,r.total,m(String(r.serials||"").replace(/\n/g,",")).join(", ")]))});const d=e.utils.book_new(),a=e.utils.aoa_to_sheet(o);a["!cols"]=o[0].map(n=>({wch:Math.max(12,n.length+2)}));const v=e.utils.aoa_to_sheet(h);v["!cols"]=h[0].map((n,i)=>({wch:[6,8,13].includes(i)?34:Math.max(12,n.length+2)})),e.utils.book_append_sheet(d,a,"Invoices"),e.utils.book_append_sheet(d,v,"Items & serials"),e.writeFile(d,p)}export{U as a,M as b,T as c,O as d,q as e,z as p};
