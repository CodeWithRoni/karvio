import {test,expect} from '@playwright/test';
const endpoint='http://localhost:8787';let token;
async function call(request,action,payload={}){const r=await request.post(endpoint,{data:{action,payload,token}});const b=await r.json();expect(b.ok,b.error).toBe(true);return b.data;}
test.beforeAll(async({request})=>{token=(await call(request,'login',{username:'admin',password:'admin123'})).token;});

test('background refresh never pulls the cursor out of a field in an open dialog',async({page})=>{
 await page.clock.install();
 await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});
 await page.goto('/#/repairs');
 await page.getByRole('button',{name:'New repair job',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'New repair job'});
 const problem=dialog.getByPlaceholder('What the customer says is wrong');
 // The customer box opens with suggestions that can cover the field, so move the cursor directly.
 await problem.focus();await page.keyboard.type('No display');
 let lists=0;page.on('request',r=>{if(r.method()==='POST'&&String(r.postData()).includes('"repairs.list"'))lists++;});
 // The job list refreshes every 15 seconds; run the clock well past two refreshes.
 await page.clock.runFor(35000);
 await expect.poll(()=>lists).toBeGreaterThan(0);
 await page.waitForTimeout(300);
 await expect(problem).toBeFocused();
 await page.keyboard.type(' after refresh');
 await expect(problem).toHaveValue('No display after refresh');
 // Opening a dialog still puts the cursor in its first field, and Escape still closes it.
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:'New repair job',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'New repair job'}).locator('input,select,textarea').first()).toBeFocused();
});
