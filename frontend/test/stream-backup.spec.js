import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
const endpoint='http://localhost:8787';
const hash=s=>createHash('sha256').update(s).digest('hex');
test('streamed database backup downloads gzip, previews and restores through a receipt',async({page,request})=>{
 const login=await request.post(endpoint,{data:{action:'login',payload:{username:'admin',password:'admin123'}}});const token=(await login.json()).data.token;
 await page.addInitScript(({endpoint,token})=>{localStorage.setItem('erp_api_config',JSON.stringify({scriptUrl:endpoint}));localStorage.setItem('erp_token',token);},{endpoint,token});
 const manifest={format:'Karvio streaming backup',version:2,total_rows:1,tables:[{name:'Products',rows:1}],shop_name:'Stream Test',created_at:'2026-11-15T12:00:00',app_version:'1.2.3'};
 const payload=JSON.stringify([{id:'fixture',name:'Fixture'}]);let queued=false,uploaded=0,received=0,digest=hash(JSON.stringify(manifest));
 await page.route(endpoint,async route=>{
  const body=route.request().postDataJSON();const action=body.action;let data;
  // Fetched through the test's own request context (not route.fetch): a bootstrap the app abandons on reload must not fail the test.
  if(action==='bootstrap'){const b=await (await request.post(endpoint,{data:body})).json();if(b.data)b.data.apiCapabilities={...b.data.apiCapabilities,boundedBackup:{}};return route.fulfill({json:b}).catch(()=>{});}
  if(action==='database.transfer.safety.list')data=[];
  else if(action==='database.transfer.export.begin')data={job_id:'export-fixture',manifest};
  else if(action==='database.transfer.export.page')data={payload,sha256:hash(payload),rows:1,next_cursor:2,done:true};
  else if(action==='database.transfer.export.close')data={closed:true};
  else if(action==='database.transfer.restore.begin')data={job_id:'restore-fixture'};
  else if(action==='database.transfer.restore.page'){uploaded++;received++;digest=hash(digest+'|0|Products|'+hash(payload));data={received,digest};}
  else if(action==='database.transfer.restore.finish'){queued=true;data={state:'queued'};}
  else if(action==='database.transfer.status')data=queued?{state:'done',result:{signed_out:false,shop_name:'Stream Test'}}:{state:'uploading',received,digest};
  else return route.continue();
  return route.fulfill({json:{ok:true,data}});
 });
 await page.goto('/#/settings');await page.getByRole('tab',{name:'Database',exact:true}).click();
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Download Backup',exact:true}).click();const download=await downloadEvent;expect(download.suggestedFilename()).toMatch(/\.karvio\.gz$/);
 const path=await download.path();await expect(page.getByText('Backup saved and verified')).toBeVisible();
 await page.getByLabel('Backup file',{exact:true}).setInputFiles({name:'test.karvio.gz',mimeType:'application/gzip',buffer:await (await import('node:fs/promises')).readFile(path)});
 await expect(page.locator('.db-preview')).toContainText('Stream Test');
 const restore=page.locator('.db-card').filter({has:page.getByRole('heading',{name:'Import Backup',exact:true})});
 await restore.getByLabel('Administrator password',{exact:true}).fill('fixture-password-123');await restore.getByLabel('Type RESTORE to confirm',{exact:true}).fill('RESTORE');
 await restore.getByRole('button',{name:'Restore database',exact:true}).click();await expect(restore).toContainText('Restored the backup');expect(uploaded).toBe(1);expect(queued).toBe(true);
});


