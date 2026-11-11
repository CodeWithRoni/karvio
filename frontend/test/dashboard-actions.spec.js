import {test,expect} from '@playwright/test';
test('business overview uses totals and dashboard shortcuts open repair and service',async({page,request})=>{
 const endpoint='http://localhost:8787';const response=await request.post(endpoint,{data:{action:'login',payload:{username:'admin',password:'admin123'}}});const token=(await response.json()).data.token;
 await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});
 await page.setViewportSize({width:1920,height:1080});await page.goto('/');
 await expect(page.getByText('Total Business Overview',{exact:true})).toBeVisible();
 await expect(page.locator('.page-head').getByRole('tab')).toHaveCount(0);
 expect(await page.locator('.page-head a').allTextContents()).toEqual(['New Service','New Repair','New sale']);
 await page.screenshot({path:'../verification/dashboard-overview-actions-review.png',fullPage:true,animations:'disabled'});
 await page.getByRole('link',{name:'New Repair',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'New repair job',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.getByRole('link',{name:/^Dashboard/}).click();await page.getByRole('link',{name:'New Service',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Service',exact:true})).toBeVisible();
 await page.getByRole('link',{name:/^Dashboard/}).click();await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
