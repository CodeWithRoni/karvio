import {test,expect} from '@playwright/test';
const endpoint='http://localhost:8787';let token;
async function call(request,action,payload={}){const r=await request.post(endpoint,{data:{action,payload,token}});const b=await r.json();expect(b.ok,b.error).toBe(true);return b.data;}
test.beforeAll(async({request})=>{token=(await call(request,'login',{username:'admin',password:'admin123'})).token;});
test.beforeEach(async({page})=>{await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});});

test('tables show 20 rows per page with page numbers and a 20 / 50 / 100 / custom size choice',async({page})=>{
 const rows=Array.from({length:125},(_,i)=>({id:'PG-'+i,name:'Pager customer '+String(i).padStart(3,'0'),phones:'01700'+String(100000+i),addresses:'Area',opening_balance:0,balance:0,active:true}));
 await page.route(endpoint,async route=>{const req=route.request().postDataJSON();if(req.action==='customers.list')return route.fulfill({json:{ok:true,data:rows}});return route.continue();});
 await page.goto('/#/customers');
 const body=page.locator('table tbody tr'),pager=page.locator('.pager'),size=page.getByLabel(/per page/).first();
 await expect(body).toHaveCount(20);
 await expect(pager).toContainText('Showing 1–20 of 125');
 await expect(size).toHaveValue('20');
 await expect(size.locator('option')).toHaveText(['20 Reports','50 Reports','100 Reports','Custom Range']);
 await pager.getByRole('button',{name:'Next ›'}).click();
 await expect(pager).toContainText('Showing 21–40 of 125');await expect(body.first()).toContainText('Pager customer 020');
 await pager.getByRole('button',{name:'7',exact:true}).click();
 await expect(pager).toContainText('Showing 121–125 of 125');await expect(body).toHaveCount(5);
 await expect(pager.getByRole('button',{name:'Next ›'})).toBeDisabled();
 await size.selectOption('50');
 await expect(body).toHaveCount(50);await expect(pager).toContainText('Showing 1–50 of 125');
 await size.selectOption('100');await expect(body).toHaveCount(100);
 await size.selectOption('custom');
 const custom=page.getByLabel('Rows per page (custom)');await custom.fill('7');await custom.press('Enter');
 await expect(body).toHaveCount(7);await expect(pager).toContainText('Showing 1–7 of 125');
 await custom.fill('0');await custom.press('Enter');await expect(custom).toHaveValue('7');await expect(body).toHaveCount(7);
});

test('purchases and the price manager use the same pager',async({page,request})=>{
 await page.goto('/#/purchases');
 const pager=page.locator('.pager');
 const total=(await call(request,'purchases.list',{page:1,per:20})).total;
 if(total){await expect(pager.getByLabel(/per page/)).toHaveValue('20');await expect(page.locator('table tbody tr')).toHaveCount(Math.min(total,20));}
 await page.goto('/#/prices');
 await expect(page.locator('.price-table tbody tr').first()).toBeVisible();
 await expect(page.locator('.pager').getByLabel(/per page/)).toHaveValue('20');
 const shown=await page.locator('.price-table tbody tr').count();expect(shown).toBeGreaterThan(0);expect(shown).toBeLessThanOrEqual(20);
 await expect(page.getByRole('button',{name:new RegExp('^Apply to '+shown+' shown$')})).toBeVisible();
});
