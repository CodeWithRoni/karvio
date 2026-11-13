import {test,expect} from '@playwright/test';
const endpoint='http://localhost:8787';let token,cash;
async function call(request,action,payload={}){const r=await request.post(endpoint,{data:{action,payload,token}});const b=await r.json();expect(b.ok,b.error).toBe(true);return b.data;}
test.beforeAll(async({request})=>{token=(await call(request,'login',{username:'admin',password:'admin123'})).token;cash=(await call(request,'bootstrap')).accounts[0].id;});
test.beforeEach(async({page})=>{await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});});
async function product(request,name,price,cost){const p=await call(request,'product.save',{name,sale_price:price});await call(request,'purchase.create',{items:[{product_id:p.id,qty:5,cost}],payments:[{account_id:cash,amount:5*cost}]});return p;}
const balance=async(request,id)=>(await call(request,'accounts.list')).find(a=>a.id===id).balance;

test('walk-in exchange: return a 550 mouse, take a 700 mouse, customer pays the 150 difference',async({page,request})=>{
 const m620=await product(request,'XCH Mouse 620D',550,400),m900=await product(request,'XCH Mouse 900X',700,500);
 const sale=await call(request,'sale.create',{items:[{product_id:m620.id,qty:1,price:550}],payments:[{account_id:cash,amount:550}],send_sms:false});
 const cashBefore=await balance(request,cash);
 await page.goto('/#/sales/'+sale.sale.id);
 await page.getByRole('button',{name:'Return / exchange',exact:true}).click();
 const dialog=page.getByRole('dialog').filter({hasText:'Return items'});
 await dialog.getByRole('tab',{name:'Exchange',exact:true}).click();
 await dialog.getByLabel('Return quantity for XCH Mouse 620D').fill('1');
 await dialog.getByPlaceholder('Search the replacement product (name, model, brand, barcode)').fill('XCH Mouse 900X');
 await dialog.getByText('XCH Mouse 900X',{exact:false}).last().click();
 const sum=dialog.locator('.xch-sum');
 await expect(sum).toContainText('Customer pays');await expect(sum).toContainText('150');
 await dialog.getByRole('button',{name:'Record exchange',exact:true}).click();
 await expect(page.getByText(/Exchanged: SR-\d+ → /)).toBeVisible();
 const list=await call(request,'products.list');
 expect(list.find(p=>p.id===m620.id).stock).toBe(5);expect(list.find(p=>p.id===m900.id).stock).toBe(4);
 expect(await balance(request,cash)-cashBefore).toBe(150);
 const newSale=(await call(request,'sales.list',{})).find(s=>s.note&&s.note.includes(sale.sale.invoice_no));
 expect(newSale.total).toBe(700);expect(newSale.paid).toBe(700);expect(newSale.profit).toBe(200);
});

test('customer exchange to a cheaper product refunds the difference',async({page,request})=>{
 const m620=await product(request,'XCH2 Mouse 620D',550,400),m100=await product(request,'XCH2 Mouse 100',400,250);
 const cust=await call(request,'customer.save',{name:'XCH Customer',phones:['01799123456']});
 const sale=await call(request,'sale.create',{customer_id:cust.id,items:[{product_id:m620.id,qty:1,price:550}],payments:[{account_id:cash,amount:550}],send_sms:false});
 const cashBefore=await balance(request,cash);
 await page.goto('/#/sales/'+sale.sale.id);
 await page.getByRole('button',{name:'Return / exchange',exact:true}).click();
 const dialog=page.getByRole('dialog').filter({hasText:'Return items'});
 await dialog.getByRole('tab',{name:'Exchange',exact:true}).click();
 await dialog.getByLabel('Return quantity for XCH2 Mouse 620D').fill('1');
 await dialog.getByPlaceholder('Search the replacement product (name, model, brand, barcode)').fill('XCH2 Mouse 100');
 await dialog.getByText('XCH2 Mouse 100',{exact:false}).last().click();
 await expect(dialog.locator('.xch-sum')).toContainText('Available surplus');
 await dialog.getByLabel('What to do with the extra value').selectOption('refund');
 await dialog.getByRole('button',{name:'Record exchange',exact:true}).click();
 await expect(page.getByText(/Exchanged: SR-\d+ → .*gave back/)).toBeVisible();
 expect(await balance(request,cash)-cashBefore).toBe(-150);
 expect((await call(request,'customers.list')).find(c=>c.id===cust.id).balance).toBe(0);
});

test('cash sales show Cash and offer no customer link; customer sales keep the link',async({page,request})=>{
 const m=await product(request,'CASHNAME Mouse',550,400);
 const cust=await call(request,'customer.save',{name:'CASHNAME Customer',phones:['01799654321']});
 const cashSale=await call(request,'sale.create',{items:[{product_id:m.id,qty:1,price:550}],payments:[{account_id:cash,amount:550}],send_sms:false});
 const custSale=await call(request,'sale.create',{customer_id:cust.id,items:[{product_id:m.id,qty:1,price:550}],payments:[{account_id:cash,amount:550}],send_sms:false});
 await page.goto('/#/sales/'+cashSale.sale.id);
 let dialog=page.getByRole('dialog');
 await expect(dialog).toContainText('Cash');await expect(dialog).not.toContainText('Walk-in');
 await expect(dialog.getByRole('button',{name:'Return / exchange',exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Customer link',exact:true})).toHaveCount(0);
 await page.goto('/#/sales/'+custSale.sale.id);
 dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('button',{name:'Customer link',exact:true})).toBeVisible();
});
