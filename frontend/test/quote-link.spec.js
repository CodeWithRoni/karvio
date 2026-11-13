import {test,expect} from '@playwright/test';
const endpoint='http://localhost:8787';let token;
async function call(request,action,payload={}){const r=await request.post(endpoint,{data:{action,payload,token}});const b=await r.json();expect(b.ok,b.error).toBe(true);return b.data;}
test.beforeAll(async({request})=>{token=(await call(request,'login',{username:'admin',password:'admin123'})).token;});

test('PC builder sends a quotation by SMS; the customer opens it without signing in',async({page,request,browser})=>{
 await call(request,'settings.save',{values:{sms_enabled:'true',sms_method:'GET',sms_url:'https://sms.example.com/send?to={number}&text={message}'}});
 try {
  await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});
  await page.goto('/#/pc-builder');
  const send=page.getByRole('button',{name:'Send to customer',exact:true});
  await expect(send).toBeDisabled();
  await page.getByLabel('Processor typed by hand').fill('E2E Quote Ryzen 7');
  await page.locator('.pcb-row').first().getByLabel('Price',{exact:true}).fill('25000');
  await page.getByLabel('Customer name').fill('Quote Customer');
  await expect(send).toBeDisabled();
  await page.getByLabel('Phone',{exact:true}).fill('01711555666');
  await expect(send).toBeEnabled();
  await send.click();
  await page.getByRole('dialog',{name:'Send quotation by SMS?'}).getByRole('button',{name:'Send SMS',exact:true}).click();
  await expect(page.getByText(/Quotation Q-\d+ (sent|queued for SMS) to 01711555666/)).toBeVisible();
  const log=await (await request.get(endpoint+'/__fetchlog')).json();
  const sms=log.map(x=>decodeURIComponent(x.url)).reverse().find(u=>u.includes('8801711555666')&&u.includes('#/q/'));
  expect(sms).toBeTruthy();
  const key=/#\/q\/([A-Za-z0-9]{22})/.exec(sms)[1];
  // The customer's phone: nobody signed in.
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true});
  const p=await ctx.newPage();
  await p.addInitScript((ep)=>localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:ep})),endpoint);
  await p.goto('/#/q/'+key);
  await expect(p.getByText('E2E Quote Ryzen 7')).toBeVisible();
  await expect(p.getByText('Quote Customer')).toBeVisible();
  await expect(p.locator('.pubinv-tot')).toContainText('25,000');
  await expect(p.getByRole('button',{name:'Print / Save PDF'})).toBeVisible();
  await p.goto('/#/q/'+'Z'.repeat(22));
  await expect(p.getByText('Quotation not available')).toBeVisible();
  await ctx.close();
 } finally {
  await call(request,'settings.save',{values:{sms_enabled:'false'}});
 }
});
