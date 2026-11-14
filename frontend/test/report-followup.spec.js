import {test,expect} from '@playwright/test';
import * as XLSX from 'xlsx';
import fs from 'node:fs/promises';
const endpoint='http://localhost:8787';let token,cash,day;
async function q(request,action,payload={}){const r=await(await request.post(endpoint,{data:{action,payload,token}})).json();expect(r.ok,r.error).toBe(true);return r.data;}
test.beforeAll(async({request})=>{token=(await q(request,'login',{username:'admin',password:'admin123'})).token;const b=await q(request,'bootstrap');cash=b.accounts[0].id;day=b.serverToday;});
test.beforeEach(async({page})=>{await page.addInitScript(({token,endpoint})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{token,endpoint});});
test('report search and Excel footer follow the matching invoices',async({page,request})=>{
 const customer=await q(request,'customer.save',{name:'Report search reconciliation customer'});
 const sale=async(name,price)=>{const p=await q(request,'product.save',{name,service:true,sale_price:price});return q(request,'sale.create',{customer_id:customer.id,items:[{product_id:p.id,qty:1,price}],payments:[{account_id:cash,amount:price}]});};
 const a=await sale('Report match only',100);await sale('Report other row',200);
 await page.goto('/#/reports');await page.getByRole('combobox',{name:'Customer',exact:true}).selectOption(customer.id);
 const index=await page.locator('thead th').evaluateAll(th=>th.findIndex(x=>x.innerText.trim()==='Total'));
 await expect(page.locator('tfoot td').nth(index)).toHaveText('300');
 await page.getByPlaceholder('Search this table').fill(a.sale.invoice_no);await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.locator('tfoot td').nth(index)).toHaveText('100');
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Excel',exact:true}).click();const file=await(await dl).path();const book=XLSX.read(await fs.readFile(file));const rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1});const col=rows[0].indexOf('Total');expect(rows[1][col]).toBe(100);expect(rows.at(-1)[col]).toBe(100);
 await page.getByPlaceholder('Search this table').fill('');await expect(page.locator('tfoot td').nth(index)).toHaveText('300');
});
test('Profit quantities keep their units through table search and selected Excel export',async({page,request})=>{
 await q(request,'master.save',{kind:'unit',name:'reportmeter',label:'Report meter',decimal:true});
 const a=await q(request,'product.save',{name:'REPORT-UNIT pieces',service:true,unit:'pcs',sale_price:100}),b=await q(request,'product.save',{name:'REPORT-UNIT cable',unit:'reportmeter',sale_price:10});
 await q(request,'purchase.create',{items:[{product_id:b.id,qty:3,cost:5}],payments:[{account_id:cash,amount:15}]});await q(request,'sale.create',{items:[{product_id:a.id,qty:2,price:100},{product_id:b.id,qty:3,price:10}],payments:[{account_id:cash,amount:230}]});
 const daily=await q(request,'reports',{type:'daily_summary',from:day,to:day});expect(daily.totals.items).toContain('3 reportmeter');expect(daily.rows[0].item_quantities.reportmeter).toBe(3);
 await page.goto('/#/profit');await page.getByRole('tab',{name:'By product',exact:true}).click();await page.getByPlaceholder('Search this table').fill('REPORT-UNIT');
 const idx=await page.locator('thead th').evaluateAll(th=>th.findIndex(x=>x.innerText.trim()==='Qty sold'));await expect(page.locator('tfoot td').nth(idx)).toHaveText('2 pcs · 3 reportmeter');
 await page.locator('tbody tr').filter({hasText:b.name}).getByRole('checkbox').check();const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Excel',exact:true}).click();const file=await(await dl).path();const book=XLSX.read(await fs.readFile(file));const rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1});expect(rows.at(-1)[rows[0].indexOf('Qty sold')]).toBe('3 reportmeter');
});
