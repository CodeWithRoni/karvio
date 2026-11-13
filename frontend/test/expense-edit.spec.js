import {test,expect} from '@playwright/test';
const endpoint='http://localhost:8787';let token,cash;
async function call(request,action,payload={}){const r=await request.post(endpoint,{data:{action,payload,token}});const b=await r.json();expect(b.ok,b.error).toBe(true);return b.data;}
test.beforeAll(async({request})=>{token=(await call(request,'login',{username:'admin',password:'admin123'})).token;cash=(await call(request,'bootstrap')).accounts[0].id;});
test.beforeEach(async({page})=>{await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});});

test('expenses filter by category, show category totals and edit from a row popup',async({page,request})=>{
 await call(request,'expense.create',{category:'Food',amount:120,account_id:cash,note:'E2E burger'});
 await call(request,'expense.create',{category:'Transport',amount:80,account_id:cash,note:'E2E rickshaw'});
 await page.goto('/#/expenses');
 const summary=page.locator('.exp-summary');await expect(summary).toContainText('Spending by category');
 await summary.getByRole('button',{name:/^Transport/}).click();
 await expect(page.getByLabel('Filter by category')).toHaveValue('Transport');
 const table=page.locator('table').last();
 await expect(table).toContainText('E2E rickshaw');await expect(table).not.toContainText('E2E burger');
 await page.getByRole('button',{name:'Show all',exact:true}).click();
 await page.getByPlaceholder('Search this table').fill('E2E burger');
 // Category and note change without a password.
 await table.locator('tbody tr').filter({hasText:'E2E burger'}).click();
 let dialog=page.getByRole('dialog');await expect(dialog).toContainText('Edit expense — Food');
 await dialog.locator('select').first().selectOption('Transport');
 await expect(dialog.getByLabel('Your password')).toHaveCount(0);
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 await expect(table.locator('tbody tr').filter({hasText:'E2E burger'})).toContainText('Transport');
 // An amount change asks for the admin password.
 await table.locator('tbody tr').filter({hasText:'E2E burger'}).click();
 dialog=page.getByRole('dialog');
 await dialog.locator('input[type=number]').fill('150');
 await expect(dialog.getByLabel('Your password')).toBeVisible();
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(page.getByText('Enter the admin password to change the amount, account or date')).toBeVisible();
 await dialog.getByLabel('Your password').fill('admin123');
 await dialog.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 await expect(table.locator('tbody tr').filter({hasText:'E2E burger'})).toContainText('150');
 // The Cancel button opens the cancellation dialog, not the edit popup.
 await table.locator('tbody tr').filter({hasText:'E2E burger'}).getByRole('button',{name:'Cancel',exact:true}).click();
 dialog=page.getByRole('dialog');await expect(dialog).toHaveCount(1);await expect(dialog).not.toContainText('Edit expense');
});
