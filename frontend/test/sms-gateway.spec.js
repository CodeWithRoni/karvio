import {test,expect} from '@playwright/test';
test('custom SMS setup maps fields, saves, and reports queued delivery honestly',async({page,request})=>{
 const endpoint='http://localhost:8787';
 const login=await request.post(endpoint,{data:{action:'login',payload:{username:'admin',password:'admin123'}}});const token=(await login.json()).data.token;
 await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});
 // Intercept test sends: no real gateway or SMS is contacted.
 let tests=0;
 await page.route(endpoint,async route=>{const body=JSON.parse(route.request().postData());if(body.action==='sms.test'){tests++;return route.fulfill({json:{ok:true,data:{ok:false,status:'queued',response:'queued'}}});}return route.continue();});
 await page.goto('/#/settings');await page.getByRole('tab',{name:'SMS gateway',exact:true}).click();
 const provider=page.getByLabel('SMS provider preset');
 expect(await provider.locator('option').allTextContents()).not.toEqual(expect.arrayContaining([expect.stringMatching(/MRAM/)]));
 await provider.selectOption('Generic JSON POST');
 await page.getByLabel('API URL',{exact:true}).fill('https://sms.example/send');
 await page.getByLabel('Gateway field 3',{exact:true}).fill('mobile');
 await page.getByLabel('API key',{exact:true}).fill('fixture-only-secret');
 await page.getByLabel('Test SMS phone number').fill('01700000000');
 await expect(page.getByRole('button',{name:'Send test',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Save SMS settings',exact:true}).click();
 await expect(page.getByRole('button',{name:'Send test',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Send test',exact:true}).click();
 await expect(page.getByText('Queued for delivery. Check the SMS log for the final result.')).toBeVisible();expect(tests).toBe(1);
 await page.getByLabel('Preview message').selectOption('sms_repair_template');
 await expect(page.locator('.sms-preview')).toContainText('Laptop');
 await page.screenshot({path:'../verification/sms-gateway-review.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.reload();await page.getByRole('tab',{name:'SMS gateway',exact:true}).click();
 await expect(page.getByLabel('Gateway field 3',{exact:true})).toHaveValue('mobile');
});
