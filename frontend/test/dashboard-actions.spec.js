import {test,expect} from '@playwright/test';
test('business overview switches between today, this month and all time; shortcuts open repair and service',async({page,request})=>{
 const endpoint='http://localhost:8787';const response=await request.post(endpoint,{data:{action:'login',payload:{username:'admin',password:'admin123'}}});const token=(await response.json()).data.token;
 await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});
 await page.setViewportSize({width:1920,height:1080});await page.goto('/');
 const scope=page.locator('.dash-overview');await expect(scope.getByRole('tab',{name:'Today',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.locator('.kpi').first()).toContainText("Today's sales");await scope.getByRole('tab',{name:'All time',exact:true}).click();await expect(page.locator('.kpi').first()).toContainText('Sales');await expect(scope).toContainText('since the shop started');
 await page.reload();await expect(page.locator('.dash-overview').getByRole('tab',{name:'All time',exact:true})).toHaveAttribute('aria-selected','true');await page.locator('.dash-overview').getByRole('tab',{name:'Today',exact:true}).click();
 await expect(page.locator('.page-head').getByRole('tab')).toHaveCount(0);
 expect(await page.locator('.page-head a').allTextContents()).toEqual(['New service','New repair','New sale']);
 await page.screenshot({path:'../verification/dashboard-overview-actions-review.png',fullPage:true,animations:'disabled'});
 await page.getByRole('link',{name:'New repair',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'New repair job',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.getByRole('link',{name:/^Dashboard/}).click();await page.getByRole('link',{name:'New service',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Service',exact:true})).toBeVisible();
 await page.getByRole('link',{name:/^Dashboard/}).click();await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
