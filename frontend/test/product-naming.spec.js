import {test,expect} from '@playwright/test';
test('brand leads automatic product name and description is a single trailing suffix',async({page,request})=>{
 const endpoint='http://localhost:8787';let token;
 const call=async(action,payload={})=>{const r=await request.post(endpoint,{data:{action,payload,token}});const b=await r.json();expect(b.ok,b.error).toBe(true);return b.data;};
 token=(await call('login',{username:'admin',password:'admin123'})).token;
 const group=await call('master.save',{kind:'group',name:'MOTHERBOARD'}),cat=await call('master.save',{kind:'category',parent_id:group.id,name:'AMD'}),brand=await call('master.save',{kind:'brand',name:'MSI'});
 await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});
 await page.setViewportSize({width:1920,height:1080});await page.goto('/#/stock');await page.getByRole('button',{name:'Add product',exact:true}).click();
 const dlg=page.getByRole('dialog');await dlg.getByLabel('Product group').selectOption(group.id);await dlg.getByLabel('Category').selectOption(cat.id);await dlg.getByLabel(/^Brand/).selectOption(brand.id);await dlg.getByLabel('SKU / model').fill('B450M-A PRO MAX II');
 const name=dlg.getByLabel('Product name',{exact:true}),desc=dlg.getByLabel('Short description',{exact:true});
 await desc.fill('DDR4, AM4 Socket');await expect(name).toHaveValue('MSI MOTHERBOARD AMD B450M-A PRO MAX II #DDR4, AM4 Socket');
 await desc.fill(' DDR4, AM4 Socket');await expect(name).toHaveValue('MSI MOTHERBOARD AMD B450M-A PRO MAX II # DDR4, AM4 Socket');
 await desc.fill('DDR4, AM4 Socket');
 await page.screenshot({path:'../verification/product-naming-review.png',fullPage:true,animations:'disabled'});
 await desc.fill('Updated');await expect(name).toHaveValue('MSI MOTHERBOARD AMD B450M-A PRO MAX II #Updated');await desc.fill('');await expect(name).toHaveValue('MSI MOTHERBOARD AMD B450M-A PRO MAX II');
 await desc.fill('   ');await expect(name).toHaveValue('MSI MOTHERBOARD AMD B450M-A PRO MAX II');
 await name.fill('My custom name');await desc.fill('Custom notes');await expect(name).toHaveValue('My custom name #Custom notes');
 await dlg.getByRole('button',{name:'Use automatic name',exact:true}).click();
 await desc.fill('  DDR4, AM4 Socket');await dlg.getByRole('button',{name:'Add product',exact:true}).click();
 await expect(dlg).toHaveCount(0);
 const saved=(await call('products.list')).find(p=>p.sku==='B450M-A PRO MAX II');
 expect(saved.name).toBe('MSI MOTHERBOARD AMD B450M-A PRO MAX II #  DDR4, AM4 Socket');
 expect(saved.description).toBe('  DDR4, AM4 Socket');
 await call('product.delete',{id:saved.id});
 // Leave no sample master records behind for the later category workflow tests.
 await call('master.delete',{kind:'category',id:cat.id});
 await call('master.delete',{kind:'group',id:group.id});
 await call('master.delete',{kind:'brand',id:brand.id});
});
