import{I as m,N as p}from"./index-Cw0qLR4K.js";const u=`Assalamu Alaikum {name},
Thank you for shopping at {shop}.
Invoice: {invoice}
Total: Tk {total} · Paid: Tk {paid} · Due: Tk {due}
View / download your invoice:
{link}
{shop_phone}`,e=t=>p(t,2).toLocaleString("en-IN",{maximumFractionDigits:2});function l(t){const n=String(t||"").replace(/[^0-9]/g,"");return/^8801\d{9}$/.test(n)?n:/^01\d{9}$/.test(n)?"88"+n:/^1\d{9}$/.test(n)?"880"+n:n.length>=10&&!n.startsWith("0")?n:""}const f=(t,n)=>`https://wa.me/${l(t)}?text=${encodeURIComponent(n)}`,d=t=>m(t||"")[0]||"";function w(t,n,o,s){const c=t.whatsapp_template||u,a=Math.max(p(Number(n.due_now??n.due)||0,2),0),i={name:(o==null?void 0:o.name)||n.customer_name||"",shop:t.shop_name||"",invoice:n.invoice_no,total:e(n.total),paid:e(Math.max((Number(n.total)||0)-a,0)),due:e(a),link:s||"",shop_phone:d(t.shop_phone||t.shop_tel)};return c.replace(/\{(\w+)\}/g,(h,r)=>r in i?i[r]:h).replace(/\n{3,}/g,`

`).trim()}export{l as a,d as f,w as i,f as w};
