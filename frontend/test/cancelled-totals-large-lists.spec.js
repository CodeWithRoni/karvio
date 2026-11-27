import * as XLSX from 'xlsx';
import fs from 'node:fs/promises';
import {test,expect} from '@playwright/test';
const endpoint='http://localhost:8787';let token,cash;
async function call(request,action,payload={}) { const r=await request.post(endpoint,{data:{action,payload,token}});const b=await r.json();expect(b.ok,b.error).toBe(true);return b.data; }
test.beforeAll(async({request})=>{token=(await call(request,'login',{username:'admin',password:'admin123'})).token;cash=(await call(request,'bootstrap')).accounts[0].id;});
test.beforeEach(async({page})=>{await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});});

test('cancelled sales stay visible but totals and Excel totals count active only',async({page})=>{
 const sales = [
  { id:'active', invoice_no:'ACTIVE-1', date:'2026-11-11', total:100, paid:80, due:20, due_now:5, profit:10, status:'active' },
  { id:'cancel', invoice_no:'CANCEL-1', date:'2026-11-11', total:150, paid:90, due:60, due_now:60, profit:30, status:'cancelled' },
 ];
 await page.route(endpoint,async route=>{
  if (route.request().postDataJSON().action === 'sales.list')
   return route.fulfill({ json:{ ok:true, data:sales } });
  return route.continue();
 });
 await page.goto('/#/sales');
 const footerCell = (label) => page.locator(`tfoot td[data-label="${label}"]`);
 const activeTotals = { Total:100, 'Paid at sale':80, 'Due at sale':20, 'Due now':5, Profit:10 };
 for (const [label, value] of Object.entries(activeTotals))
  await expect(footerCell(label)).toHaveText(String(value));
 await expect(page.getByText('CANCEL-1')).toBeVisible();

 const download = page.waitForEvent('download');
 await page.getByRole('button',{name:'Excel',exact:true}).click();
 const file = await download;
 const wb = XLSX.read(await fs.readFile(await file.path()));
 const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});
 for (const [label, value] of Object.entries(activeTotals))
  expect(rows.at(-1)[rows[0].indexOf(label)], label).toBe(value);

 await page.getByLabel('Search table').fill('CANCEL-1');
 for (const label of Object.keys(activeTotals))
  await expect(footerCell(label)).toHaveText('0');
});

test('all 501 invoices reach the list and selected details load in complete batches',async({page})=>{
 const rows=Array.from({length:501},(_,i)=>({id:'row-'+i,invoice_no:'FULL-'+i,date:'2026-11-11',total:100,paid:100,due_now:0,status:'active'})),batches=[];
 await page.route(endpoint,async route=>{const req=route.request().postDataJSON();if(req.action==='sales.list')return route.fulfill({json:{ok:true,data:rows}});if(req.action==='sales.details'){batches.push(req.payload.ids);return route.fulfill({json:{ok:true,data:req.payload.ids.map(id=>({sale:rows.find(r=>r.id===id),items:[],returns:[]}))}});}return route.continue();});
 await page.goto('/#/sales');await expect(page.locator('.pager')).toContainText('of 501');
 const ids=await page.evaluate(async rows=>{const {salesDetails}=await import('/src/lib/salesDetails.js');return (await salesDetails(rows)).map(d=>d.sale.id);},rows);
 expect(ids).toEqual(rows.map(r=>r.id));expect(batches.map(b=>b.length)).toEqual([200,200,101]);
});

test('purchase return uses exact net line allocation and current supplier due is separate',async({page,request})=>{
 const products=[];for(let i=0;i<3;i++)products.push(await call(request,'product.save',{name:'Exact return UI '+i,sale_price:200}));
 const supplier=await call(request,'supplier.save',{name:'Current due UI'});
 const purchase=await call(request,'purchase.create',{supplier_id:supplier.id,discount:100,items:products.map(p=>({product_id:p.id,qty:1,cost:100})),payments:[]});
 await call(request,'supplier.payment',{supplier_id:supplier.id,account_id:cash,amount:200});
 await page.goto('/#/purchases');await page.evaluate(() => { location.hash = '#/purchases'; });
 await expect(page.locator('table tfoot tr')).toBeVisible();expect(await page.locator('table tfoot tr').evaluate(tr=>[...tr.cells].reduce((n,c)=>n+c.colSpan,0))).toBe(11);
 await page.locator('table').getByText(purchase.purchase.invoice_no,{exact:true}).click();
 const detail=page.getByRole('dialog',{name:`Purchase ${purchase.purchase.invoice_no}`});await expect(detail.locator('.kv').getByText('Due at purchase',{exact:true})).toBeVisible();
 await expect(detail.locator('.kv > div').filter({hasText:'Due now'})).toContainText('0');
 await detail.getByRole('button',{name:'Return to supplier'}).click();const form=page.getByRole('dialog',{name:`Return to supplier — ${purchase.purchase.invoice_no}`});
 await form.locator('tbody tr').nth(1).locator('input[type=number]').fill('1');await expect(form.getByLabel('Return value')).toHaveValue('Tk 66.66');
 await form.getByLabel('Settle as').selectOption('cash');await expect(form.getByLabel('Amount received')).toHaveValue('66.66');await form.getByRole('button',{name:'Record return'}).click();await expect(form).toHaveCount(0);
});

test('reset and restore cleanup removes all users drafts for this shop only',async({page})=>{
 await page.goto('/#/');await expect(page.locator('.shell')).toBeVisible();
 const result=await page.evaluate(async()=>{const {clearShopDrafts,shopStorageKey}=await import('/src/lib/shopStorage.js');const me=shopStorageKey('erp_pos_draft');const same=me.slice(0,me.lastIndexOf(':')+1)+'other-user';const other='erp_pos_draft:https%3A%2F%2Fother-shop:user';const quote=shopStorageKey('erp_quotes');for(const key of [me,same,other,quote])localStorage.setItem(key,'{}');clearShopDrafts();return [me,same,other,quote].map(k=>localStorage.getItem(k));});
 expect(result).toEqual([null,null,'{}',null]);
});

test('saved quotations are kept on the server: every user and every device sees them',async({page,request})=>{
 const name=`Shared quote ${Date.now()%100000}`;
 await page.goto('/#/quotation');await expect(page.locator('.pcb-row')).toHaveCount(12);
 await page.locator('.pcb-row').first().getByLabel('Processor typed by hand').fill('Private PC quote');await page.locator('.pcb-row').first().getByLabel('Price',{exact:true}).fill('100');await page.getByLabel('Customer name').fill(name);await page.getByLabel('Phone',{exact:true}).fill('01712345678');await page.getByRole('button',{name:'Save quotation',exact:true}).click();
 await expect(page.getByText(`Quotation saved — ${name}`)).toBeVisible();
 // another device: this browser's storage is empty, the quotation is still there
 await page.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('erp_quotes'))localStorage.removeItem(k);});await page.reload();
 await page.getByRole('button',{name:/See Saved Quotations/}).click();await page.getByLabel('Search saved quotations').fill(name);
 await expect(page.getByRole('dialog',{name:'Saved quotations'}).locator('tbody tr').filter({hasText:name})).toContainText('Administrator');
 // another user
 const u=`quoteuser${Date.now()%100000}`;await call(request,'user.save',{name:'Quote user',username:u,role:'sales',password:'quote-pass-123'});
 const other=(await (await request.post(endpoint,{data:{action:'login',payload:{username:u,password:'quote-pass-123'}}})).json()).data.token;
 const seen=(await (await request.post(endpoint,{data:{action:'quotes.list',payload:{},token:other}})).json()).data;
 expect(seen.some(q=>q.meta.customer===name)).toBe(true);
});

test('online wrapper keeps a 900px shell while the main page scrolls independently',async({page})=>{
 await page.setViewportSize({width:1600,height:900});await page.goto('/#/');await expect(page.locator('.shell')).toBeVisible();const sizes=await page.evaluate(()=>({rail:document.querySelector('.rail').getBoundingClientRect().height,shell:document.querySelector('.shell').getBoundingClientRect().height,document:document.documentElement.scrollHeight}));expect(sizes.rail).toBeLessThanOrEqual(900);expect(sizes.shell).toBe(900);expect(sizes.document).toBeLessThanOrEqual(900);await page.getByRole('button',{name:'Sign out',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeInViewport();
});


test('large restore uploads small chunks and resumes after an unconfirmed final reply',async({page})=>{
 await page.goto('/#/');await expect(page.locator('.shell')).toBeVisible();const chunks=[],calls=[];let finished=false,finishCalls=0;
 await page.route(endpoint,async route=>{const req=route.request().postDataJSON();calls.push(req.action);let data;
 if(req.action==='ping') data={apiCapabilities:{chunkedRestore:{maxBytes:16*1048576,partChars:131072}}};
 else if(req.action==='database.restore.begin')data={upload_id:'a'.repeat(32)};
 else if(req.action==='database.restore.chunk'){chunks[req.payload.index]=req.payload.text;expect(route.request().postData().length).toBeLessThan(1024*1024);data={received:chunks.length};}
 else if(req.action==='database.restore.finish'){finished=true;finishCalls++;await route.abort();return;}
 else if(req.action==='database.restore.status')data=finished?{done:{counts:{Products:1},signed_out:false}}:{received:chunks.length};
 else return route.continue();return route.fulfill({json:{ok:true,data}});
 });
 const result=await page.evaluate(async()=>{const {restoreBackup}=await import('/src/lib/restoreBackup.js');const text=JSON.stringify({data:'x'.repeat(131062)+'😀বাংলা'+'x'.repeat(8*1048576+1024)});let firstFailed=false;try{await restoreBackup(text,{password:'test-password',confirm:'RESTORE'});}catch{firstFailed=true;}const result=await restoreBackup(text,{password:'test-password',confirm:'RESTORE'});return {firstFailed,result,size:text.length};});
 expect(result.firstFailed).toBe(true);expect(result.result.counts.Products).toBe(1);expect(chunks.join('').length).toBe(result.size);expect(Buffer.concat(chunks.map(s=>Buffer.from(s))).equals(Buffer.from(chunks.join('')))).toBe(true);expect(finishCalls).toBe(1);expect(calls.filter(a=>a==='database.restore.begin')).toHaveLength(1);
});
