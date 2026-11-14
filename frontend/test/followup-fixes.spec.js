import {test,expect} from '@playwright/test';
import * as XLSX from 'xlsx';
import fs from 'node:fs/promises';
const endpoint='http://localhost:8787';let token,cash;
async function call(request,action,payload={}){const r=await request.post(endpoint,{data:{action,payload,token}});const b=await r.json();expect(b.ok,b.error).toBe(true);return b.data;}
test.beforeAll(async({request})=>{token=(await call(request,'login',{username:'admin',password:'admin123'})).token;cash=(await call(request,'bootstrap')).accounts[0].id;});
test.beforeEach(async({page})=>{await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});});

test('fully paid public invoice and its Business print/PDF agree without changing saved invoice history',async({page,request})=>{
 const settings=(await call(request,'bootstrap')).settings;
 const c=await call(request,'customer.save',{name:'Followup public paid'}),p=await call(request,'product.save',{name:'Followup public service',service:true,sale_price:500});
 const d=await call(request,'sale.create',{customer_id:c.id,items:[{product_id:p.id,qty:1,price:500}],payments:[{account_id:cash,amount:100}],send_sms:false});
 await call(request,'customer.payment',{customer_id:c.id,amount:400,account_id:cash});await call(request,'settings.save',{values:{invoice_template:'business'}});
 try {
  const link=await call(request,'sale.link',{id:d.sale.id});await page.goto('/#/i/'+link.url.split('/i/')[1]);await expect(page.getByRole('article')).toBeVisible();
  await expect(page.locator('.pubinv-tot > div').filter({has:page.getByText('Paid now',{exact:true})})).toContainText('500');await expect(page.locator('.pubinv-status')).toHaveText('Paid');
  await page.getByRole('button',{name:'Print',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>document.querySelector('iframe:last-of-type')?.contentDocument?.body?.innerText||'')).toContain('Invoice due now');
  const text=await page.evaluate(()=>document.querySelector('iframe:last-of-type').contentDocument.body.innerText);expect(text).toMatch(/Paid now[\s\S]*500\.00/);expect(text).toMatch(/Invoice due now[\s\S]*0\.00/);expect(text).not.toContain('Outstanding Amount');
  const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF'}).click();expect((await fs.stat(await (await dl).path())).size).toBeGreaterThan(10000);
  const original=(await call(request,'sale.detail',{id:d.sale.id})).sale;expect([original.paid,original.due,JSON.parse(original.balance_snapshot).outstanding]).toEqual([100,400,400]);
 } finally {await call(request,'settings.save',{values:{invoice_template:settings.invoice_template||'classic'}});}
});

test('quotation rejects excessive discount for save, POS and print, then accepts a corrected amount',async({page,request})=>{
 const p=await call(request,'product.save',{name:'Followup CPU part',sale_price:100});await call(request,'purchase.create',{items:[{product_id:p.id,qty:1,cost:50}],payments:[{account_id:cash,amount:50}]});
 await page.goto('/#/pc-builder');await page.getByLabel('Processor product').selectOption(p.id);await page.getByLabel('Discount',{exact:true}).fill('150');
 await expect(page.getByRole('alert')).toContainText('Discount must be between');await expect(page.locator('.totals .grand')).toHaveText('—');
 for(const name of ['Save quote','Send to POS','Print / PDF quote'])await expect(page.getByRole('button',{name,exact:true})).toBeDisabled();
 await page.getByLabel('Discount',{exact:true}).fill('25');await expect(page.locator('.totals .grand')).toContainText('75');await expect(page.getByRole('button',{name:'Save quote'})).toBeEnabled();
 await page.getByRole('button',{name:'Print / PDF quote'}).click();await expect.poll(()=>page.evaluate(()=>document.querySelector('iframe:last-of-type')?.contentDocument?.body?.innerText||'')).toContain('Tk 75');
});

test('selected purchase export contains all 201 invoices across page boundaries',async({page})=>{
 const rows=Array.from({length:201},(_,i)=>({id:'EXPORT-'+i,invoice_no:'BUY-'+i,date:'2026-11-11',status:'active',total:100,paid:100,due:0,due_now:0,supplier_name:'Export fixture'}));const batches=[];
 await page.route(endpoint,async route=>{const req=route.request().postDataJSON();if(req.action==='purchases.list'){const page=Number(req.payload.page)||1;return route.fulfill({json:{ok:true,data:{rows:rows.slice((page-1)*10,page*10),total:201,page,per:10,sums:{total:20100,paid:20100,due:0,due_now:0}}}});}if(req.action==='purchases.details'){batches.push(req.payload.ids.length);return route.fulfill({json:{ok:true,data:req.payload.ids.map(id=>({purchase:rows.find(r=>r.id===id),supplier:null,items:[],returns:[]}))}});}return route.continue();});
 await page.goto('/#/purchases');
 for(let i=0;i<21;i++){await expect(page.locator('.pager')).toContainText('of 201');await page.getByLabel('Select all on this page',{exact:true}).check();if(i<20){await page.getByRole('button',{name:'Next ›',exact:true}).click();await expect(page.locator('tbody tr').first()).toContainText('BUY-'+((i+1)*10));}}
 await expect(page.locator('.pl-export')).toContainText('201 selected');const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Excel',exact:true}).click();const wb=XLSX.read(await fs.readFile(await (await dl).path()));const invoices=XLSX.utils.sheet_to_json(wb.Sheets.Invoices,{header:1});expect(invoices).toHaveLength(202);expect(batches).toEqual([200,1]);expect(invoices.at(-1)[0]).toBe('BUY-200');
});

test('cancelled return remains visible while table and selected Excel totals exclude it',async({page})=>{
 await page.route(endpoint,async route=>{const req=route.request().postDataJSON();if(req.action==='sreturns.list')return route.fulfill({json:{ok:true,data:[{id:'cancelled-return',return_no:'SR-CANCEL',invoice_no:'INV-CANCEL',date:'2026-11-11',total:200,refund:200,status:'cancelled'},{id:'active-return',return_no:'SR-ACTIVE',invoice_no:'INV-ACTIVE',date:'2026-11-11',total:200,refund:200,status:'active'}]}});return route.continue();});
 await page.goto('/#/sales');await page.getByRole('tab',{name:'Returns & exchanges'}).click();await expect(page.locator('tfoot')).toContainText('200');await expect(page.getByText('SR-CANCEL',{exact:true})).toBeVisible();
 await page.getByLabel('Select row',{exact:true}).first().check();const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Excel',exact:true}).click();const wb=XLSX.read(await fs.readFile(await (await dl).path()));const rows=XLSX.utils.sheet_to_json(wb.Sheets.Report,{header:1});const totalIndex=rows[0].indexOf('Value');expect(rows.at(-1)[totalIndex]).toBe(0);
});

test('Reports Hub shows historical and current purchase due separately',async({page,request})=>{
 const supplier=await call(request,'supplier.save',{name:'Followup report supplier'}),p=await call(request,'product.save',{name:'Followup report item',sale_price:200});const purchase=await call(request,'purchase.create',{supplier_id:supplier.id,items:[{product_id:p.id,qty:1,cost:100}],payments:[]});await call(request,'supplier.payment',{supplier_id:supplier.id,account_id:cash,amount:100});
 await page.goto('/#/reports');await page.locator('.field').filter({has:page.locator('.field-label').filter({hasText:/^Report$/})}).locator('select').selectOption('purchases');await expect(page.getByRole('columnheader',{name:'Due at purchase',exact:true})).toBeVisible();await expect(page.getByRole('columnheader',{name:'Due now',exact:true})).toBeVisible();
 await page.getByPlaceholder('Search this table').fill(purchase.purchase.invoice_no);
 const row=page.locator('tbody tr').filter({hasText:purchase.purchase.invoice_no});await expect(row).toBeVisible();const idx=await page.locator('thead th').evaluateAll(th=>th.findIndex(t=>t.innerText.trim()==='Due now'));await expect(row.locator('td').nth(idx)).toHaveText('0');const originalIdx=await page.locator('thead th').evaluateAll(th=>th.findIndex(t=>t.innerText.trim()==='Due at purchase'));await expect(row.locator('td').nth(originalIdx)).toHaveText('100');
});

test('party Delete stays disabled at zero balance when cancelled payment history exists',async({page,request})=>{
 for(const supplier of [false,true]) {
  const kind=supplier?'supplier':'customer',party=await call(request,kind+'.save',{name:'Protected history '+kind});
  const payment=await call(request,kind+'.payment',{[kind+'_id']:party.id,amount:100,account_id:cash});
  await call(request,'reverse',{type:supplier?'spay':'cpay',id:payment.entry.id,password:'admin123',reason:'Cancelled payment test'});
  await page.goto('/#/'+(supplier?'suppliers':'customers')+'/'+party.id);
  await expect(page.getByRole('dialog').getByRole('button',{name:'Delete',exact:true})).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText('including cancelled entries');
 }
 const unused=await call(request,'customer.save',{name:'Unused deletable profile'});await page.goto('/#/customers/'+unused.id);
 await expect(page.getByRole('dialog').getByRole('button',{name:'Delete',exact:true})).toBeEnabled();
});
