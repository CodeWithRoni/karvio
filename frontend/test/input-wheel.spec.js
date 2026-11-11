import {test,expect} from '@playwright/test';
test.beforeEach(async({page,request})=>{
 const endpoint='http://localhost:8787';
 const response=await request.post(endpoint,{data:{action:'login',payload:{username:'admin',password:'admin123'}}});
 const token=(await response.json()).data.token;
 await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});
});
test('wheel leaves custom warranty and low-stock values unchanged inside a product dialog',async({page})=>{
 await page.goto('/#/stock');await page.getByRole('button',{name:'Add product',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Warranty',{exact:true}).check();
 for(const [label,value] of [['Or custom days','11'],['Low-stock alert at','5']]){
  const input=dialog.getByLabel(label);await input.fill(value);await input.focus();await input.hover();
  await page.mouse.wheel(0,-120);await expect(input).not.toBeFocused();await expect(input).toHaveValue(value);
  await input.focus();await input.hover();await page.mouse.wheel(0,120);await expect(input).toHaveValue(value);
  await input.fill('17');await expect(input).toHaveValue('17');
 }
});
test('global wheel guard covers new numeric/date fields while preserving scrolling and text focus',async({page})=>{
 await page.goto('/#/stock');await expect(page.getByRole('heading',{name:'Products & stock',exact:true})).toBeVisible();
 // New native controls have no component-level onWheel handler: this verifies future coverage.
 await page.evaluate(()=>{
  const box=document.createElement('div');box.id='wheel-fixture';box.style.cssText='position:fixed;top:100px;left:250px;width:260px;height:180px;overflow:auto;z-index:99999;background:white;padding:10px';
  for(const [type,value] of [['number','11.25'],['range','11'],['date','2026-11-11'],['time','11:25'],['datetime-local','2026-11-11T11:25'],['month','2026-11'],['week','2026-W46'],['text','unchanged']]){
   const input=document.createElement('input');input.type=type;input.value=value;input.step='any';input.setAttribute('aria-label','Wheel fixture '+type);input.style.cssText='display:block;width:200px;margin-bottom:8px';box.append(input);
  }
  const select=document.createElement('select');select.setAttribute('aria-label','Wheel fixture select');select.innerHTML='<option value="a">Alpha</option><option value="b">Beta</option>';box.append(select);
  const filler=document.createElement('div');filler.style.height='1000px';box.append(filler);document.body.append(box);
 });
 for(const type of ['number','range','date','time','datetime-local','month','week']){
  const input=page.getByLabel('Wheel fixture '+type,{exact:true});const before=await input.inputValue();await input.focus();await input.hover();await page.mouse.wheel(0,100);await expect(input).not.toBeFocused();await expect(input).toHaveValue(before);
 }
 const number=page.getByLabel('Wheel fixture number',{exact:true});await number.fill('25.5');await expect(number).toHaveValue('25.5');
 const select=page.getByLabel('Wheel fixture select',{exact:true});await select.focus();await select.hover();await page.mouse.wheel(0,-100);await expect(select).not.toBeFocused();await expect(select).toHaveValue('a');await select.focus();await select.press('ArrowDown');await expect(select).toHaveValue('b');
 const text=page.getByLabel('Wheel fixture text',{exact:true});await text.focus();await text.hover();const before=await page.locator('#wheel-fixture').evaluate(e=>e.scrollTop);await page.mouse.wheel(0,120);await expect(text).toBeFocused();
 await expect.poll(()=>page.locator('#wheel-fixture').evaluate(e=>e.scrollTop)).toBeGreaterThan(before);
});
