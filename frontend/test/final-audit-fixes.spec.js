import {test,expect} from '@playwright/test';
const endpoint='http://localhost:8787';let token;
async function call(request,action,payload={}){const res=await request.post(endpoint,{data:{action,payload,token}});const body=await res.json();expect(body.ok,body.error).toBe(true);return body.data;}
test.beforeAll(async({request})=>{token=(await call(request,'login',{username:'admin',password:'admin123'})).token;});
test.beforeEach(async({page})=>{await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});});

test('Quick fill changes only the 500 rendered products and leaves the hidden match untouched',async({page})=>{
 const products=Array.from({length:501},(_,i)=>({id:'audit-price-'+i,name:'Audit price '+String(i).padStart(3,'0'),unit:'pcs',stock:1,active:true,cost_price:100,sale_price:200,wholesale_price:0}));let saved;
 await page.route(endpoint,async route=>{const req=route.request().postDataJSON();if(req.action==='price.update'){saved=req.payload.items;return route.fulfill({json:{ok:true,data:{updated:saved.length}}});}if(req.action==='products.list')return route.fulfill({json:{ok:true,data:products}});if(req.action==='bootstrap'){const res=await route.fetch(),body=await res.json();body.data.products=products;return route.fulfill({json:body});}return route.continue();});
 await page.goto('/#/prices');await expect(page.locator('.price-table tbody tr')).toHaveCount(500);await page.getByLabel('Retail markup percent').fill('10');await page.getByRole('button',{name:'Apply to 500 shown',exact:true}).click();await expect(page.getByRole('button',{name:'Save changes (500)',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Save changes (500)',exact:true}).click();await expect.poll(()=>saved?.length).toBe(500);expect(saved.every(x=>x.sale_price===110)).toBe(true);expect(saved.some(x=>x.id==='audit-price-500')).toBe(false);
});

test('saving quotation before 6 AM uses the shop day instead of yesterday in UTC',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-11-11T19:30:00Z'));
 await page.route(endpoint,async route=>{const req=route.request().postDataJSON();if(req.action==='bootstrap'){const res=await route.fetch(),body=await res.json();body.data.serverToday='2026-11-12';return route.fulfill({json:body});}return route.continue();});
 await page.goto('/#/pc-builder');await page.getByLabel('Processor typed by hand').fill('Audit manual CPU');await page.locator('.pcb-row').first().getByLabel('Price',{exact:true}).fill('100');await page.getByRole('button',{name:'Save quote',exact:true}).click();const stored=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('erp_quotes:')).flatMap(k=>JSON.parse(localStorage.getItem(k))));expect(stored[0].date).toBe('2026-11-12');await expect(page.getByText('2026-11-12',{exact:true})).toBeVisible();
});

test('closed books explain and disable opening balance changes for accounts and both party types',async({page})=>{
 await page.route(endpoint,async route=>{const req=route.request().postDataJSON();if(req.action==='bootstrap'){const res=await route.fetch(),body=await res.json();body.data.settings.books_locked_until='2020-01-01';return route.fulfill({json:body});}return route.continue();});
 for(const [path,button] of [['accounts','Add account'],['customers','Add customer'],['suppliers','Add supplier']]){await page.goto('/#/'+path);await page.getByRole('button',{name:button,exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.locator('.field').filter({hasText:'Opening balance'}).locator('input')).toBeDisabled();await expect(dialog).toContainText('Reopen them before changing opening balances');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();}
});
