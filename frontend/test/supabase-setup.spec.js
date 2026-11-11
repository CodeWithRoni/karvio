import {test,expect} from '@playwright/test';
test('a fresh Supabase shop creates its owner without storing the setup password',async({page})=>{
 const endpoint='https://fresh-karvio.example/functions/v1/karvio-api';let initialized=false,submitted;
 await page.addInitScript(url=>localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:url})),endpoint);
 await page.route(endpoint,async route=>{
  const body=JSON.parse(route.request().postData());
  if(body.action==='ping')return route.fulfill({json:{ok:true,data:{app:'Karvio',version:'1.2.0',backend:'supabase',requiresSetup:!initialized}}});
  if(body.action==='owner.initialize'){submitted=body.payload;initialized=true;return route.fulfill({json:{ok:true,data:{initialized:true,username:'admin'}}});}
  throw new Error('Unexpected request '+body.action);
 });
 await page.goto('/');await expect(page.getByRole('heading',{name:'Set up your fresh shop'})).toBeVisible();
 await page.getByLabel('Your name').fill('Test owner');await page.getByLabel('One-time setup key').fill('fixture-only-setup-key');
 await page.getByLabel('Choose a password').fill('fixture-owner-password');await page.getByLabel('Confirm password').fill('fixture-owner-password');
 await page.getByRole('button',{name:'Create Administrator account'}).click();
 await expect(page.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible();
 expect(submitted).toEqual({name:'Test owner',setup_key:'fixture-only-setup-key',password:'fixture-owner-password'});
 await expect(page.getByLabel('Username',{exact:true})).toHaveValue('admin');await expect(page.getByLabel('Password',{exact:true})).toHaveValue('');
 const stored=await page.evaluate(()=>JSON.stringify({...localStorage}));expect(stored).not.toContain('fixture-owner-password');expect(stored).not.toContain('fixture-only-setup-key');
});
