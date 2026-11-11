const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),esbuild=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
let checks=0;const eq=(a,b)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),b);checks++;};
function load(file,imports){const module={exports:{}};vm.runInNewContext(esbuild.transformSync(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{format:'cjs',loader:'jsx'}).code,{module,exports:module.exports,React,require:n=>{assert(n in imports,'Unmocked dependency '+n);return imports[n];},console,Date});return module.exports;}
const state={settings:{currency:'Tk',invoice_template:'classic',shop_name:'Unrelated staff shop'},units:[]};
const store={getState:()=>state};
const format=load('lib/format.js',{'./store':{useStore:store,shopDay:()=> '2026-11-11'}});
const pricing=load('lib/quotationTotals.js',{'./format':format});
for(const discount of [150,-1,Infinity,'not money']){eq(pricing.quotationTotals([{qty:1,price:100}],discount).valid,false);}
eq(pricing.quotationTotals([{qty:1,price:100}],25).total,75);eq(pricing.quotationTotals([{qty:1,price:100}],100).total,0);
eq(pricing.quotationTotals([{qty:1,price:-100}],0).valid,false);
const printed=[];const exportMocks={esc:x=>String(x??''),shopContacts:()=>'',printHtml:html=>printed.push(html)};
const receipt=load('lib/receipt.js',{'./quotationTotals':pricing,'./store':{useStore:store},'./format':format,'./export':exportMocks});
assert.throws(()=>receipt.printQuotation({lines:[{name:'Part',qty:1,price:100}],discount:150}),/Discount/);checks++;eq(printed.length,0);
receipt.printQuotation({lines:[{name:'Part',qty:1,price:100}],discount:25});assert(printed[0].includes('Tk 75'));checks++;
// A public document uses its own shop/template and live amounts, without replacing frozen staff fields.
const docs=load('lib/salesDocs.js',{'./store':{useStore:store},'./format':format,'./export':exportMocks,'./purchaseDocs':{pdfPages:()=>{}}});
const sale={invoice_no:'FOLLOWUP',customer_id:'C',customer_name:'Customer',total:500,subtotal:500,paid:100,paid_at_sale:100,paid_now:500,due:0,due_now:0,net_total:500,returned_total:0,live_invoice:true,status:'active',balance_snapshot:JSON.stringify({previous:0,outstanding:400}),payments:[{account_name:'Cash',amount:100}]};
const detail={sale,shop:{shop_name:'Public shop',invoice_template:'business',invoice_note:'Public note'},customer:{balance:0},items:[],returns:[]};
let html=docs.saleDocHtml(detail);assert(html.includes('Public shop'));assert(!html.includes('Unrelated staff shop'));assert(html.includes('.bdoc'));checks+=3;
assert.match(html,/Paid now<\/td><td>:<\/td><td class="r">500\.00/);assert.match(html,/Invoice due now<\/td><td>:<\/td><td class="r">0\.00/);assert(!html.includes('Outstanding Amount'));checks+=3;
const staff={...detail,sale:{...sale,live_invoice:false,due:400}};html=docs.saleDocHtml(staff);assert.match(html,/Outstanding Amount<\/td><td>:<\/td><td class="r">400\.00/);assert.match(html,/Collected Amount<\/td><td>:<\/td><td class="r">100\.00/);checks+=2;
const returned={...detail,sale:{...sale,paid_now:400,returned_total:100,net_total:400}};html=docs.saleDocHtml(returned);assert(html.includes('Returned value'));assert.match(html,/Paid now<\/td><td>:<\/td><td class="r">400\.00/);checks+=2;
html=docs.saleDocHtml({...returned,shop:{...detail.shop,invoice_template:'classic'}});assert.match(html,/Paid now<\/td><td class="r">400/);assert(html.includes('Net invoice amount'));checks+=2;
// Public view displays current Paid now, while original payment-account rows are labeled At sale.
let index=0;const hooks={...React,useState:()=>[index++===0?detail:'',()=>{}],useEffect:()=>{}};
const Public=load('pages/PublicInvoice.jsx',{'react':hooks,'../lib/api':{},'../lib/store':{},'../lib/format':format}).default;
html=renderToStaticMarkup(React.createElement(Public,{token:'fixture'}));assert.match(html,/<span>Paid now<\/span><span>500/);assert.match(html,/At sale/);checks+=2;
// Complete purchase exports use bounded batches and reject incomplete server replies.
(async()=>{const ids=Array.from({length:501},(_,i)=>'id-'+i),batches=[];const batch=load('lib/purchaseDetails.js',{'./api':{api:async(action,payload)=>{eq(action,'purchases.details');batches.push(payload.ids);return payload.ids.map(id=>({purchase:{id}}));}}});eq((await batch.purchaseDetails(ids)).map(d=>d.purchase.id),ids);eq(batches.map(b=>b.length),[200,200,101]);
const missing=load('lib/purchaseDetails.js',{'./api':{api:async()=>[]}});await assert.rejects(()=>missing.purchaseDetails(['one']),/incomplete/);checks++;
console.log('Follow-up client calculation, invoice rendering and export regressions: '+checks+' checks passed');})().catch(e=>{console.error(e);process.exitCode=1});
