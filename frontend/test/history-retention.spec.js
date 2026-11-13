import {test,expect} from '@playwright/test';
const endpoint='http://localhost:8787';let token,cash;
async function call(request,action,payload={}){const r=await request.post(endpoint,{data:{action,payload,token}});const b=await r.json();expect(b.ok,b.error).toBe(true);return b.data;}
test.beforeAll(async({request})=>{token=(await call(request,'login',{username:'admin',password:'admin123'})).token;cash=(await call(request,'bootstrap')).accounts[0].id;});
test.beforeEach(async({page})=>{await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});});
test('sold-out purchased product retains a disabled Delete action',async({page,request})=>{
 const p=await call(request,'product.save',{name:'Retained UI router',sale_price:200});await call(request,'purchase.create',{items:[{product_id:p.id,qty:1,cost:100}],payments:[{account_id:cash,amount:100}]});await call(request,'sale.create',{items:[{product_id:p.id,qty:1,price:200}],payments:[{account_id:cash,amount:200}],send_sms:false});
 await page.goto('/#/stock');await page.getByPlaceholder('Search this table').fill(p.name);await page.getByText(p.name,{exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'Delete',exact:true})).toBeDisabled();await expect(dialog).toContainText('cannot be deleted');await expect(dialog.getByLabel('Active (available for sale)')).toBeEnabled();
});
test('used MFS account is retained with an Inactive option and no Delete action',async({page,request})=>{
 const a=await call(request,'account.save',{name:'Retained UI bKash',type:'mfs',opening_balance:0});await call(request,'account.entry',{kind:'deposit',account_id:a.id,amount:100});const entry=(await call(request,'account.ledger',{account_id:a.id})).rows[0];await call(request,'reverse',{type:'account',id:entry.id,password:'admin123',reason:'Cancel entry'});
 await page.goto('/#/accounts');await page.locator('table tbody tr').filter({hasText:a.name}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('retained for accounting');await expect(dialog.getByRole('button',{name:'Delete',exact:true})).toHaveCount(0);await expect(dialog.getByLabel('Active',{exact:true})).toBeEnabled();
});
test('expense categories with cancelled expense history cannot be renamed or deleted',async({page,request})=>{
 const cats=JSON.parse((await call(request,'settings.get')).expense_categories);await call(request,'expense.categories',{categories:[...cats,'Used UI category','Unused UI category']});const e=await call(request,'expense.create',{category:'Used UI category',amount:20,account_id:cash});await call(request,'reverse',{type:'expense',id:e.id,password:'admin123',reason:'Cancel expense'});
 await page.goto('/#/expenses');await page.getByRole('tab',{name:'Expense categories',exact:true}).click();const used=page.locator('.exp-cat-list li').filter({hasText:/^Used UI category/});await expect(used.getByRole('button',{name:'Delete',exact:true})).toBeDisabled();await expect(used.getByRole('button',{name:'Rename',exact:true})).toBeDisabled();await expect(used).toContainText('Used — retained for history');
 const unused=page.locator('.exp-cat-list li').filter({hasText:/^Unused UI category/});await expect(unused.getByRole('button',{name:'Delete',exact:true})).toBeEnabled();await unused.getByRole('button',{name:'Delete',exact:true}).click();await page.getByRole('dialog',{name:'Delete category?'}).getByRole('button',{name:'Delete',exact:true}).click();await expect(unused).toHaveCount(0);
});

