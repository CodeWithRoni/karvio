import {test,expect} from '@playwright/test';
const endpoint='http://localhost:8787';let token;
async function call(request,action,payload={}){const res=await request.post(endpoint,{data:{action,payload,token}});const body=await res.json();expect(body.ok,body.error).toBe(true);return body.data;}
test.beforeAll(async({request})=>{token=(await call(request,'login',{username:'admin',password:'admin123'})).token;});
test.beforeEach(async({page})=>{await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});});

test('Quick fill changes only the products on the shown page and leaves the hidden matches untouched',async({page})=>{
 const products=Array.from({length:501},(_,i)=>({id:'audit-price-'+i,name:'Audit price '+String(i).padStart(3,'0'),unit:'pcs',stock:1,active:true,cost_price:100,sale_price:200,wholesale_price:0}));let saved;
 await page.route(endpoint,async route=>{const req=route.request().postDataJSON();if(req.action==='price.update'){saved=req.payload.items;return route.fulfill({json:{ok:true,data:{updated:saved.length}}});}if(req.action==='products.list')return route.fulfill({json:{ok:true,data:products}});if(req.action==='bootstrap'){const res=await route.fetch(),body=await res.json();body.data.products=products;return route.fulfill({json:body});}return route.continue();});
 await page.goto('/#/prices');await expect(page.locator('.price-table tbody tr')).toHaveCount(10);await page.getByLabel('Retail markup percent').fill('10');await page.getByRole('button',{name:'Apply to 10 shown',exact:true}).click();await expect(page.getByRole('button',{name:'Save changes (10)',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Save changes (10)',exact:true}).click();await expect.poll(()=>saved?.length).toBe(10);expect(saved.every(x=>x.sale_price===110)).toBe(true);expect(saved.some(x=>x.id==='audit-price-10'||x.id==='audit-price-500')).toBe(false);
});

test('a saved quotation gets the shop day from the server, not the computer clock',async({page,request})=>{
 await page.clock.setFixedTime(new Date('2026-11-11T19:30:00Z'));
 const serverDay=(await (await request.post(endpoint,{data:{action:'ping',payload:{}}})).json()).data.time.slice(0,10);
 await page.goto('/#/pc-builder');await page.getByLabel('Processor typed by hand').fill('Audit manual CPU');await page.locator('.pcb-row').first().getByLabel('Price',{exact:true}).fill('100');await page.getByLabel('Customer name').fill('Shop day customer');await page.getByLabel('Phone',{exact:true}).fill('01712345678');await page.getByRole('button',{name:'Save quotation',exact:true}).click();
 await expect(page.getByText('Quotation saved — Shop day customer')).toBeVisible();
 const stored=await page.evaluate(async()=>{const {api}=await import('/src/lib/api.js');return (await api('quotes.list')).find(q=>q.meta.customer==='Shop day customer');});
 expect(stored.date).not.toBe('2026-11-11');expect(stored.date.slice(0,7)).toBe(serverDay.slice(0,7));
});

test('closed books explain and disable opening balance changes for accounts and both party types',async({page})=>{
 await page.route(endpoint,async route=>{const req=route.request().postDataJSON();if(req.action==='bootstrap'){const res=await route.fetch(),body=await res.json();body.data.settings.books_locked_until='2020-01-01';return route.fulfill({json:body});}return route.continue();});
 for(const [path,button] of [['accounts','Add account'],['customers','Add customer'],['suppliers','Add supplier']]){await page.goto('/#/'+path);await page.getByRole('button',{name:button,exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.locator('.field').filter({hasText:'Opening balance'}).locator('input')).toBeDisabled();await expect(dialog).toContainText('Reopen them before changing opening balances');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();}
});
