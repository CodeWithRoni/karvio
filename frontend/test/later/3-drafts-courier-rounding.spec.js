import {test,expect} from '@playwright/test';
const endpoint='http://localhost:8787';let token;
async function call(request,action,payload={}){const b=await(await request.post(endpoint,{data:{action,payload,token}})).json();expect(b.ok,b.error).toBe(true);return b.data;}
test.beforeAll(async({request})=>{token=(await call(request,'login',{username:'admin',password:'admin123'})).token;});
test.beforeEach(async({page})=>{await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});});
test('decimal rounding agrees with the POS preview',async({page,request})=>{
 const stamp=Date.now();await call(request,'master.save',{kind:'unit',name:'audmet',label:'Audit meter',decimal:true});
 const p=await call(request,'product.save',{name:'Decimal cable '+stamp,unit:'audmet',sale_price:2.01});const sup=await call(request,'supplier.save',{name:'Decimal supplier '+stamp});
 await call(request,'purchase.create',{supplier_id:sup.id,items:[{product_id:p.id,qty:10,cost:1.255}],payments:[]});
 await page.goto('/#/pos');await page.getByRole('combobox',{name:'Search product'}).fill(p.name);await page.keyboard.press('Enter');
 const row=page.locator('.cart tbody tr',{hasText:p.name});await expect(row).toBeVisible();await row.locator('input[type=number]').first().fill('0.5');await expect(row).toContainText('1.01');
 const n=await page.evaluate(async()=>{const {roundDecimal:r}=await import('/src/lib/round.js');return [r(1.005),r(1.255),r(-1.005),r(1e-7,4)];});expect(n).toEqual([1.01,1.26,-1,0]);
});
test('stock count drafts isolate user, shop and branch; cleanup removes held carts',async({page})=>{
 await page.goto('/#/stock-count');await expect(page.getByRole('heading',{name:'Stock count',exact:true})).toBeVisible();
 const result=await page.evaluate(async()=>{
  const {useStore}=await import('/src/lib/store.js'),state=useStore.getState();const {stockCountKey:key,saveStockCount:save,loadStockCount:load}=await import('/src/lib/stockCountDraft.js');const {setApiConfig,getApiConfig}=await import('/src/lib/api.js');const {clearShopDrafts}=await import('/src/lib/shopStorage.js');const {saveHolds,loadHolds}=await import('/src/lib/posDraft.js');const config=getApiConfig(),prefix=encodeURIComponent(config.scriptUrl),keys=[];
  useStore.setState({branches:{...state.branches,current:'A'}});keys.push(key());save({name:'A',products:[],counts:{},found:{},extra:{}});saveHolds([{id:'held'}]);
  useStore.setState({branches:{...state.branches,current:'B'}});keys.push(key());const branch=load();useStore.setState({user:{...state.user,id:'other-user'}});keys.push(key());const user=load();
  setApiConfig({scriptUrl:'https://other.invalid/api'});keys.push(key());save({name:'Other shop'});const otherKey=key();setApiConfig(config);useStore.setState({user:state.user,branches:state.branches});localStorage.setItem('karvio_stock_count','legacy');localStorage.setItem(`erp_pos_holds:${prefix}:another-user`,'[]');
  const cleared=clearShopDrafts(),r={keys,branch,user,cleared,holds:loadHolds(),legacy:localStorage.getItem('karvio_stock_count'),remaining:Object.keys(localStorage).filter(k=>k.startsWith(`erp_stock_count:${prefix}:`)||k.startsWith(`erp_pos_holds:${prefix}:`)),other:!!localStorage.getItem(otherKey)};localStorage.removeItem(otherKey);return r;
 });
 expect(new Set(result.keys).size).toBe(4);expect(result.branch).toBeNull();expect(result.user).toBeNull();expect(result.cleared).toBe(true);expect(result.holds).toEqual([]);expect(result.legacy).toBeNull();expect(result.remaining).toEqual([]);expect(result.other).toBe(true);
});
test('uncertain courier booking requires portal review and explicit admin confirmation',async({page,request})=>{
 const stamp=Date.now(),p=await call(request,'product.save',{name:'Courier UI '+stamp,sale_price:100}),sup=await call(request,'supplier.save',{name:'Courier supplier '+stamp});await call(request,'purchase.create',{supplier_id:sup.id,items:[{product_id:p.id,qty:2,cost:50}],payments:[]});
 await call(request,'settings.save',{values:{courier_steadfast_key:'fixture',courier_steadfast_secret:'fixture'}});const o=await call(request,'order.save',{source:'Facebook',customer:{name:'Courier UI '+stamp,phone:'01755556666',address:'Test road'},items:[{product_id:p.id,qty:1,price:100}]});await call(request,'order.confirm',{id:o.id});
 await page.route(endpoint,async route=>{const b=route.request().postDataJSON();if(b.action==='courier.call'&&b.payload?.op==='book')return route.fulfill({json:{ok:false,error:'Booking result unconfirmed',retryable:true,uncertain:true}});return route.continue();});
 await page.goto('/#/online-orders');await page.getByPlaceholder('Search this table').fill(o.no);await page.locator('tbody tr').filter({hasText:o.no}).filter({hasText:'Courier UI '+stamp}).click();await page.getByRole('dialog').getByRole('button',{name:/Send with courier|Send to courier|Ship/}).click();
 const ship=page.getByRole('dialog').last();await ship.getByRole('button',{name:/Book with Steadfast/}).click();await expect(ship.getByText('Booking result needs checking')).toBeVisible();await ship.getByRole('button',{name:'I checked: no booking exists'}).click();const allow=ship.getByRole('button',{name:'Allow another attempt'});await expect(allow).toBeDisabled();await ship.getByLabel('Administrator password',{exact:true}).fill('admin123');await ship.getByLabel('Why is another attempt safe?',{exact:true}).fill('Portal shows no booking');await ship.getByLabel('Type NOT BOOKED',{exact:true}).fill('NOT BOOKED');await expect(allow).toBeEnabled();
});
test('clearing drafts in another tab clears the open cart and held sales',async({page,request})=>{
 const stamp=Date.now(),p=await call(request,'product.save',{name:'Cross tab '+stamp,sale_price:100}),sup=await call(request,'supplier.save',{name:'Cross tab supplier '+stamp});await call(request,'purchase.create',{supplier_id:sup.id,items:[{product_id:p.id,qty:2,cost:50}],payments:[]});
 await page.goto('/#/settings');await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
 await page.evaluate(async id=>{const d=await import('/src/lib/posDraft.js');d.savePosDraft({cart:[{product_id:id,qty:1,price:100,serials:[],warranty_days:0}],customerId:'',discount:''});d.saveHolds([{id:'held',label:'Held before reset',items:1,total:100,cart:[]}]);},p.id);
 await page.goto('/#/pos');await expect(page.locator('.cart tbody tr',{hasText:p.name})).toBeVisible();await expect(page.getByRole('button',{name:/^Held · 1/})).toBeEnabled();
 const other=await page.context().newPage();await other.goto('/#/settings');await expect(other.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();await other.evaluate(async()=>{const m=await import('/src/lib/shopStorage.js');if(!m.clearShopDrafts())throw Error('cleanup failed');});
 await expect(page.locator('.cart tbody tr')).toHaveCount(0);await expect(page.getByRole('button',{name:'Held',exact:true})).toBeDisabled();await other.close();
});
