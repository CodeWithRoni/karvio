import {test,expect} from '@playwright/test';
const endpoint='http://localhost:8787';let token;
async function call(request,action,payload={}){const r=await request.post(endpoint,{data:{action,payload,token}});const b=await r.json();expect(b.ok,b.error).toBe(true);return b.data;}
test.beforeAll(async({request})=>{token=(await call(request,'login',{username:'admin',password:'admin123'})).token;});
test.beforeEach(async({page})=>{await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});});

test('every dropdown opens showing 10 options and scrolls for the rest; mouse and keyboard both pick',async({page})=>{
 const brands=Array.from({length:17},(_,i)=>({id:'SPB'+i,name:'Popup brand '+String(i).padStart(2,'0'),active:true}));
 const prods=brands.map((b,i)=>({id:'SPP'+i,name:'Popup product '+i,brand_id:b.id,unit:'pcs',stock:1,active:true,cost_price:10,sale_price:20}));
 await page.route(endpoint,async route=>{const req=route.request().postDataJSON();if(req.action==='bootstrap'){const res=await route.fetch(),body=await res.json();body.data.brands=brands;body.data.products=prods;return route.fulfill({json:body});}if(req.action==='products.list')return route.fulfill({json:{ok:true,data:prods}});return route.continue();});
 await page.goto('/#/prices');
 const brand=page.getByRole('combobox',{name:'Brand'}).or(page.locator('.field',{hasText:'Brand'}).locator('select')).first();
 await brand.click();
 const pop=page.locator('.select-pop');await expect(pop).toBeVisible();
 await expect(pop.getByRole('option')).toHaveCount(18);
 const box=await pop.boundingBox(),row=await pop.getByRole('option').first().boundingBox();
 expect(Math.round(box.height/row.height)).toBe(10);
 expect(await pop.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);
 await pop.getByRole('option',{name:'Popup brand 16'}).click();
 await expect(pop).toHaveCount(0);await expect(brand).toHaveValue('SPB16');
 await expect(page.locator('.price-table tbody tr')).toHaveCount(1);await expect(page.locator('.price-table tbody')).toContainText('Popup product 16');
 await brand.focus();await page.keyboard.press('Alt+ArrowDown');await expect(pop).toBeVisible();
 await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 await expect(pop).toHaveCount(0);await expect(brand).toHaveValue('SPB0');
 await brand.click();await expect(pop).toBeVisible();await page.keyboard.press('Escape');await expect(pop).toHaveCount(0);await expect(brand).toHaveValue('SPB0');
});
