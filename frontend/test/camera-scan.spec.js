import {test,expect} from '@playwright/test';
import JsBarcode from 'jsbarcode';
const endpoint='http://localhost:8787';let token,cash,plain,serial,supplier;
async function q(request,action,payload={}){const b=await (await request.post(endpoint,{data:{action,payload,token}})).json();expect(b.ok,b.error).toBe(true);return b.data;}
const bitsFor=code=>{const out={};JsBarcode(out,code,{format:'CODE128',displayValue:false});return out.encodings.map(e=>e.data).join('');};
async function setup(page,{camera=true}={}){
 await page.addInitScript(({token,endpoint,camera})=>{
  localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);
  if(!camera)return;
  window.__cameraStarts=0;window.__cameraStops=0;window.__cameraTracks=[];window.__scanBits='';
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async constraints=>{
   window.__cameraStarts++;window.__cameraConstraints=constraints;
   if(window.__cameraDenied)throw new DOMException('Permission denied','NotAllowedError');
   if(window.__cameraDelay)await new Promise(resolve=>window.__cameraResolve=resolve);
   const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
   const draw=()=>{const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,1280,720);const bits=window.__scanBits||'';if(bits){const unit=Math.min(4,1100/bits.length),x=(1280-unit*bits.length)/2;c.fillStyle='#000';for(let i=0;i<bits.length;i++)if(bits[i]==='1')c.fillRect(x+i*unit,230,Math.ceil(unit),240);}};
   draw();const interval=setInterval(draw,80),stream=canvas.captureStream(12);
   for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{window.__cameraStops++;clearInterval(interval);stop();};window.__cameraTracks.push(track);}
   return stream;
  }});
 },{token,endpoint,camera});
}
async function scan(page,button,code){await page.evaluate(bits=>window.__scanBits=bits,bitsFor(code));await button.click();await expect(page.getByRole('dialog',{name:/Scan/})).toHaveCount(0,{timeout:15000});}
test.beforeAll(async({request})=>{
 token=(await q(request,'login',{username:'admin',password:'admin123'})).token;
 const boot=await q(request,'bootstrap');cash=boot.accounts[0].id;
 supplier=boot.suppliers.find(s=>s.name==='Camera supplier')||await q(request,'supplier.save',{name:'Camera supplier'});
 plain=boot.products.find(p=>p.barcode==='CAM-PRODUCT-13')||await q(request,'product.save',{name:'Camera USB cable',barcode:'CAM-PRODUCT-13',sale_price:100});
 serial=boot.products.find(p=>p.barcode==='CAM-RAM-13')||await q(request,'product.save',{name:'Camera DDR4 RAM',barcode:'CAM-RAM-13',sale_price:200,has_warranty:true,warranty_type:'serial',warranty_days:365});
 if(!(await q(request,'serials.list',{product_id:serial.id})).length)await q(request,'purchase.create',{supplier_id:supplier.id,items:[{product_id:plain.id,qty:4,cost:60},{product_id:serial.id,qty:1,cost:120,serials:['CAM-SERIAL-13']}],payments:[{account_id:cash,amount:360}]});
});
test.describe('mobile camera',()=>{
 test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'});
 test.beforeEach(async({page})=>setup(page));
 test('real barcode frames add a POS product once and a serial through stock validation',async({page})=>{await page.goto('/#/pos');const button=page.getByRole('button',{name:'Scan product barcode or serial with camera'});await scan(page,button,plain.barcode);await expect(page.locator('.pos-left tbody')).toContainText(plain.name);expect(await page.evaluate(()=>window.__cameraTracks.every(t=>t.readyState==='ended'))).toBe(true);await scan(page,button,'CAM-SERIAL-13');await expect(page.locator('.pos-left tbody')).toContainText('CAM-SERIAL-13');await expect(page.getByRole('button',{name:'Quantity 1 — pick serial numbers of '+serial.name})).toBeVisible();expect(await page.evaluate(()=>window.__cameraConstraints.audio)).toBe(false);});
 test('purchase barcode adds product, serial scanning counts quantity and rejects duplicates',async({page})=>{await page.goto('/#/purchases');await page.getByRole('tab',{name:'New purchase',exact:true}).click();await page.getByRole('combobox',{name:'Supplier',exact:true}).selectOption(supplier.id);await scan(page,page.getByRole('button',{name:'Scan product barcode or serial with camera'}),serial.barcode);const button=page.getByRole('button',{name:'Scan serial for '+serial.name+' with camera'});await scan(page,button,'NEW-CAMERA-SN');await expect(page.locator('.sn-chip').filter({hasText:'NEW-CAMERA-SN'})).toHaveCount(1);await scan(page,button,'NEW-CAMERA-SN');await expect(page.locator('.sn-chip').filter({hasText:'NEW-CAMERA-SN'})).toHaveCount(1);await expect(page.locator('.toast-err')).toContainText('already in this purchase');});
 test('Advance Search immediately traces the scanned serial',async({page})=>{await page.goto('/#/history');await scan(page,page.getByRole('button',{name:'Scan barcode or serial to search'}),'CAM-SERIAL-13');await expect(page.getByRole('textbox',{name:'Search',exact:true})).toHaveValue('CAM-SERIAL-13');await expect(page.locator('main')).toContainText(serial.name);});
 test('permission denial offers retry and manual input, without changing the cart',async({page})=>{await page.goto('/#/pos');await page.evaluate(()=>window.__cameraDenied=true);await page.getByRole('button',{name:'Scan product barcode or serial with camera'}).click();await expect(page.getByRole('alert')).toContainText('Camera access is blocked');await page.getByRole('button',{name:'Close camera'}).click();await expect(page.getByRole('combobox',{name:'Search product'})).toBeEnabled();await expect(page.getByText('Cart is empty')).toBeVisible();});
 test('closing camera and closing before permission resolves both stop tracks',async({page})=>{await page.goto('/#/history');const button=page.getByRole('button',{name:'Scan barcode or serial to search'});await button.click();await expect(page.getByText('Camera ready',{exact:true})).toBeVisible();await page.keyboard.press('Escape');expect(await page.evaluate(()=>window.__cameraTracks.every(t=>t.readyState==='ended'))).toBe(true);await page.evaluate(()=>window.__cameraDelay=true);await button.click();await expect.poll(()=>page.evaluate(()=>!!window.__cameraResolve)).toBe(true);await page.getByRole('button',{name:'Close camera'}).click();await page.evaluate(()=>window.__cameraResolve());await expect.poll(()=>page.evaluate(()=>window.__cameraTracks.every(t=>t.readyState==='ended'))).toBe(true);});
 test('unknown camera codes never select a partial-name product',async({page})=>{await page.goto('/#/pos');await scan(page,page.getByRole('button',{name:'Scan product barcode or serial with camera'}),'Camera');await expect(page.getByText('Cart is empty')).toBeVisible();await expect(page.locator('.toast-err')).toContainText('No exact product found');});
});
test('desktop and narrow touch Windows laptop have no camera button',async({browser})=>{for(const width of [1440,390]){const c=await browser.newContext({viewport:{width,height:900},hasTouch:true,userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'});const page=await c.newPage();await setup(page);await page.goto('http://127.0.0.1:5178/#/pos');await expect(page.getByRole('combobox',{name:'Search product'})).toBeVisible();await expect(page.locator('.camera-trigger')).toHaveCount(0);expect(await page.evaluate(()=>window.__cameraStarts)).toBe(0);await c.close();}});
test('iPad desktop-style user agent still shows camera on a large tablet',async({browser})=>{const c=await browser.newContext({viewport:{width:1024,height:1366},hasTouch:true,userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'});const page=await c.newPage();await page.addInitScript(()=>Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5}));await setup(page);await page.goto('http://127.0.0.1:5178/#/history');await expect(page.getByRole('button',{name:'Scan barcode or serial to search'})).toBeVisible();expect(await page.evaluate(()=>window.__cameraStarts)).toBe(0);await c.close();});
