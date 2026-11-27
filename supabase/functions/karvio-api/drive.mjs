// Automatic backup to the owner's Google Drive (Settings → Database → Automatic backup).
// The owner signs in with Google once; Karvio may then only see the files it creates itself (drive.file).
// Every night at 00:00 Asia/Dhaka (pg_cron → backup.drive.tick) and on "Back up now", the server makes the
// same backup file as Download Backup, encrypted with KARVIO_BACKUP_KEY, and streams it into a
// "Karvio Backups" folder. The newest 30 backups are kept; older ones go to the Drive bin.
import {createHash,randomUUID} from 'node:crypto';
import {APP_VERSION} from './release.mjs';
import {encryptionHeader,openSecret,sealPage,sealSecret} from './backupCrypto.mjs';

const SCOPE='https://www.googleapis.com/auth/drive.file openid email';
const FOLDER_NAME='Karvio Backups';
export const KEEP_BACKUPS=30;
const CHUNK=8*1024*1024; // Drive resumable uploads take chunks in multiples of 256 KiB
const sha=s=>createHash('sha256').update(s).digest('hex');
const encoder=new TextEncoder();
const fail=message=>{throw new Error('BACKUP: '+message);};

const dhaka=(date=new Date())=>{
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));
 return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`,stamp:`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`};
};
/** The next 00:00 in Asia/Dhaka, as the shop's local date-time. */
export function nextRun(now=new Date()){const d=dhaka(new Date(now.getTime()+864e5));return `${d.date}T00:00:00`;}

/** What is still missing before the owner can connect Google Drive. */
export function missingSettings(cfg){
 return [!cfg.backupKey&&'KARVIO_BACKUP_KEY',!cfg.clientId&&'GOOGLE_CLIENT_ID',!cfg.clientSecret&&'GOOGLE_CLIENT_SECRET',!cfg.redirectUri&&'SUPABASE_URL'].filter(Boolean);
}
function statusOf(state,cfg){
 const missing=missingSettings(cfg);
 return {configured:!missing.length,missing,redirect_uri:cfg.redirectUri||'',encrypted:!!cfg.backupKey,
  connected:!!state?.refresh,email:state?.email||'',folder:state?.folder_name||'',connected_at:state?.connected_at||'',
  needs_reconnect:!!state?.needs_reconnect,keep:KEEP_BACKUPS,next_at:state?.refresh&&!state?.needs_reconnect?nextRun():'',
  running:!!(state?.running_at&&Date.now()-Date.parse(state.running_at)<15*60000),last:state?.last||null};
}

/* ---------------- Google ---------------- */
class GoogleError extends Error{constructor(message,status,reason){super(message);this.status=status;this.reason=reason;}}
async function google(fetchImpl,url,options={},{json=true,timeout=60000}={}){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
 let res;
 try{res=await fetchImpl(url,{...options,signal:ctl.signal});}
 catch{throw new GoogleError('Google Drive could not be reached. It will be tried again next night.',0,'network');}
 finally{clearTimeout(timer);}
 if(!json)return res;
 const text=await res.text();let data=null;try{data=text?JSON.parse(text):null;}catch{}
 if(!res.ok){
  const reason=data?.error?.errors?.[0]?.reason||data?.error?.status||(typeof data?.error==='string'?data.error:'')||'';
  const message=typeof data?.error==='object'?data.error.message:data?.error_description||'';
  throw new GoogleError(`Google answered ${res.status}${message?': '+String(message).slice(0,200):''}`,res.status,String(reason));
 }
 return data;
}
const form=o=>new URLSearchParams(o).toString();
async function accessToken(cfg,refresh){
 try{
  const t=await google(cfg.fetch,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:form({client_id:cfg.clientId,client_secret:cfg.clientSecret,refresh_token:refresh,grant_type:'refresh_token'})});
  return t.access_token;
 }catch(error){
  if(error.reason==='invalid_grant')throw Object.assign(new GoogleError('Google access was removed or expired. Connect Google Drive again.',400,'invalid_grant'),{reconnect:true});
  throw error;
 }
}
const bearer=token=>({Authorization:`Bearer ${token}`});
async function ensureFolder(cfg,token,folderId){
 if(folderId){
  try{const f=await google(cfg.fetch,`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,trashed`,{headers:bearer(token)});if(f&&!f.trashed)return folderId;}
  catch(error){if(error.status!==404)throw error;}
 }
 const f=await google(cfg.fetch,'https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{...bearer(token),'Content-Type':'application/json'},
  body:JSON.stringify({name:FOLDER_NAME,mimeType:'application/vnd.google-apps.folder',description:'Automatic, encrypted Karvio ERP backups. Restore one in Karvio → Settings → Database → Import Backup.'})});
 return f.id;
}
/** Resumable upload, chunk by chunk, so a large backup is never held in memory as a whole. */
async function upload(cfg,token,folder,name,chunks){
 const start=await google(cfg.fetch,'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size',{method:'POST',
  headers:{...bearer(token),'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':'application/octet-stream'},
  body:JSON.stringify({name,parents:[folder],mimeType:'application/octet-stream'})},{json:false});
 if(!start.ok){await start.text().catch(()=>{});throw new GoogleError(`Google answered ${start.status} when starting the upload`,start.status,start.status===404?'notFound':'');}
 const session=start.headers.get('location');if(!session)throw new GoogleError('Google did not start the upload',0,'');
 let pending=[],size=0,offset=0;
 const take=n=>{const out=new Uint8Array(n);let at=0;while(at<n){const head=pending[0],need=n-at;if(head.length<=need){out.set(head,at);at+=head.length;pending.shift();}else{out.set(head.subarray(0,need),at);pending[0]=head.subarray(need);at=n;}}size-=n;return out;};
 const put=async(body,last)=>{
  const end=offset+body.length;
  const range=body.length?`bytes ${offset}-${end-1}/${last?end:'*'}`:`bytes */${offset}`;
  const res=await google(cfg.fetch,session,{method:'PUT',headers:{'Content-Range':range},body},{json:false,timeout:120000});
  if(last){const text=await res.text();if(res.status!==200&&res.status!==201)throw new GoogleError(`Google answered ${res.status} when finishing the upload`,res.status,'');offset=end;return JSON.parse(text);}
  await res.text().catch(()=>{});if(res.status!==308)throw new GoogleError(`Google answered ${res.status} during the upload`,res.status,'');offset=end;
 };
 for await(const chunk of chunks){pending.push(chunk);size+=chunk.length;while(size>=CHUNK)await put(take(CHUNK),false);}
 const file=await put(size?take(size):new Uint8Array(0),true);
 return {id:file.id,name:file.name,bytes:offset};
}
async function keepNewest(cfg,token,folder){
 const q=encodeURIComponent(`'${folder}' in parents and trashed=false`);
 const list=await google(cfg.fetch,`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime%20desc&pageSize=200&fields=files(id,name)`,{headers:bearer(token)});
 const old=(list.files||[]).filter(f=>/\.karvio$/i.test(f.name)).slice(KEEP_BACKUPS);
 for(const f of old)await google(cfg.fetch,`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}?fields=id`,{method:'PATCH',headers:{...bearer(token),'Content-Type':'application/json'},body:JSON.stringify({trashed:true})}).catch(()=>{});
 return old.length;
}

/* ---------------- The backup file (same lines as the browser's Download Backup) ---------------- */
export async function* encryptedBackupLines(rpc,key,job,onDone){
 const manifest={...job.manifest,app_version:APP_VERSION,encryption:encryptionHeader(key,job.job_id)};
 const header=JSON.stringify(manifest);let digest=sha(header),seq=0,rows=0;
 yield header+'\n';
 for(const table of manifest.tables){
  let cursor=0,seen=0;
  while(true){
   const page=await rpc('karvio_drive_export_page',{job_id:job.job_id,table_name:table.name,after_position:cursor});
   if(page.sha256!==sha(page.payload))fail('Backup page checksum mismatch');
   if(page.rows){
    if(!Number.isSafeInteger(page.rows)||page.rows<1||page.next_cursor<=cursor)fail('Invalid export page');
    const sealed=sealPage(key,job.job_id,table.name,page.payload);
    yield JSON.stringify({kind:'rows',seq,table:table.name,rows:page.rows,payload:sealed.payload,sha256:sealed.sha256,enc_sha256:sealed.enc_sha256})+'\n';
    digest=sha(digest+'|'+seq+'|'+table.name+'|'+sealed.sha256);seq++;seen+=page.rows;rows+=page.rows;
   }else if(!page.done)fail('Export cursor did not advance');
   cursor=page.next_cursor;if(page.done)break;
  }
  if(seen!==table.rows)fail('Backup table count mismatch');
 }
 if(rows!==manifest.total_rows)fail('Backup row count mismatch');
 yield JSON.stringify({kind:'end',pages:seq,rows,digest})+'\n';
 onDone?.({manifest,rows});
}
async function* bytesOf(lines){for await(const line of lines)yield encoder.encode(line);}
const fileName=(shop,now)=>{const d=dhaka(now),slug=String(shop||'shop').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'')||'shop';return `Karvio-backup-${slug}-${d.date}-${d.time.replace(':','')}.karvio`;};
const cleanError=error=>String(error?.message||'Backup failed').replace(/^BACKUP:\s*/,'').slice(0,300);

/** Make one backup and upload it. Never throws: the result is recorded as the Drive state's "last". */
export async function runDriveBackup(rpc,cfg,{manual=false}={}){
 if(!cfg.backupKey)return {status:'failed',error:'Set KARVIO_BACKUP_KEY on the server first'};
 const state=await rpc('karvio_drive_state',{});
 if(!state?.refresh)return {status:'skipped',error:'Google Drive is not connected'};
 if(state.running_at&&Date.now()-Date.parse(state.running_at)<15*60000)return {status:'busy',error:'A backup is already running. Try again in a few minutes.'};
 await rpc('karvio_drive_state_save',{state:{...state,running_at:new Date().toISOString()}});
 const now=new Date();let job=null,last,reconnect=false;
 try{
  const token=await accessToken(cfg,openSecret(cfg.backupKey,'drive-refresh',state.refresh));
  const folder=await ensureFolder(cfg,token,state.folder_id);
  job=await rpc('karvio_drive_export_begin',{request_key:`${dhaka(now).date}-${randomUUID()}`});
  let done=null;
  const file=await upload(cfg,token,folder,fileName(job.manifest.shop_name,now),bytesOf(encryptedBackupLines(rpc,cfg.backupKey,job,x=>{done=x;})));
  if(!done)fail('Backup did not complete');
  await rpc('karvio_drive_export_close',{job_id:job.job_id,uploaded:true});job=null;
  const removed=await keepNewest(cfg,token,folder).catch(()=>0);
  last={at:dhaka().stamp,status:'ok',manual,file:file.name,bytes:file.bytes,records:done.rows,removed};
  state.folder_id=folder;
 }catch(error){
  reconnect=!!error.reconnect;
  last={at:dhaka().stamp,status:'failed',manual,error:cleanError(error)};
  if(job)await rpc('karvio_drive_export_close',{job_id:job.job_id,uploaded:false}).catch(()=>{});
 }
 // Disconnected (or reconnected) while this ran: keep what the owner did, only report the result.
 const fresh=await rpc('karvio_drive_state',{}).catch(()=>null);
 if(fresh?.refresh===state.refresh)await rpc('karvio_drive_state_save',{state:{...fresh,folder_id:state.folder_id,running_at:null,last,...(reconnect?{needs_reconnect:true}:{})}}).catch(()=>{});
 return last;
}

/* ---------------- Gateway actions (Administrator only) ---------------- */
export async function driveRequest(body,rpc,cfg){
 const token=typeof body.token==='string'?body.token:'';
 try{
  await rpc('karvio_transfer_context',{token}); // the Administrator account, signed in
  switch(body.action){
   case 'backup.drive.status':return {ok:true,data:statusOf(await rpc('karvio_drive_state',{}),cfg)};
   case 'backup.drive.connect':{
    const missing=missingSettings(cfg);if(missing.length)fail('Set '+missing.join(', ')+' on the server first');
    const nonce=await rpc('karvio_oauth_state_mint',{});
    const url='https://accounts.google.com/o/oauth2/v2/auth?'+form({client_id:cfg.clientId,redirect_uri:cfg.redirectUri,response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent',include_granted_scopes:'true',state:nonce});
    return {ok:true,data:{url}};
   }
   case 'backup.drive.run':{
    const last=await runDriveBackup(rpc,cfg,{manual:true});
    if(last.status!=='ok')return {ok:false,error:last.error||'Backup failed'};
    return {ok:true,data:statusOf(await rpc('karvio_drive_state',{}),cfg)};
   }
   case 'backup.drive.disconnect':{
    const state=await rpc('karvio_drive_state',{});
    if(state?.refresh&&cfg.backupKey){try{await google(cfg.fetch,'https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form({token:openSecret(cfg.backupKey,'drive-refresh',state.refresh)})},{timeout:15000});}catch{}}
    await rpc('karvio_drive_state_save',{state:null});
    return {ok:true,data:statusOf(null,cfg)};
   }
   default:fail('Unknown backup action');
  }
 }catch(error){
  const message=String(error.message||'');
  if(message.startsWith('AUTH:'))return {ok:false,error:message,auth:true};
  if(message.startsWith('BACKUP:')||message.startsWith('Only the Administrator'))return {ok:false,error:message.replace(/^BACKUP:\s*/,'').replace('transfer backups','use Google Drive backup')};
  if(error instanceof GoogleError)return {ok:false,error:message};
  return {ok:false,error:'The backup request could not be completed. Try again.'};
 }
}

/* ---------------- Google sign-in window comes back here (GET ?code=…&state=…) ---------------- */
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(title,text,ok){
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f7fb;color:#1f2937}main{max-width:440px;margin:24px;padding:28px;background:#fff;border-radius:14px;box-shadow:0 6px 30px rgba(0,0,0,.08);text-align:center}h1{font-size:20px;margin:0 0 8px;color:${ok?'#15803d':'#b91c1c'}}</style></head>
<body><main><h1>${esc(title)}</h1><p>${esc(text)}</p><p><small>You can close this window and go back to Karvio.</small></p></main>${ok?'<script>setTimeout(function(){window.close()},2500)</script>':''}</body></html>`;
 return new Response(html,{status:ok?200:400,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
export async function driveCallback(url,rpc,cfg){
 const state=url.searchParams.get('state')||'',code=url.searchParams.get('code')||'',denied=url.searchParams.get('error');
 let claimed=false;try{claimed=await rpc('karvio_oauth_state_claim',{nonce:state})===true;}catch{}
 if(!claimed)return page('Link expired','This Google sign-in link was already used or is too old. Press "Connect Google Drive" in Karvio again.',false);
 if(denied||!code)return page('Not connected','Google Drive was not connected because the sign-in was cancelled.',false);
 if(missingSettings(cfg).length)return page('Not connected','The server is not set up for Google Drive yet.',false);
 try{
  const t=await google(cfg.fetch,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:form({code,client_id:cfg.clientId,client_secret:cfg.clientSecret,redirect_uri:cfg.redirectUri,grant_type:'authorization_code'})});
  const scopes=String(t.scope||'').split(/\s+/);
  if(!scopes.includes('https://www.googleapis.com/auth/drive.file'))return page('Not connected','Karvio needs permission to save its own backup files in your Google Drive. Connect again and tick the Google Drive box.',false);
  const me=await google(cfg.fetch,'https://www.googleapis.com/oauth2/v3/userinfo',{headers:bearer(t.access_token)}).catch(()=>({}));
  const email=String(me.email||'').slice(0,200);
  const prev=await rpc('karvio_drive_state',{});
  let refresh=t.refresh_token||'';
  if(!refresh&&prev?.refresh&&prev.email===email)refresh=openSecret(cfg.backupKey,'drive-refresh',prev.refresh);
  if(!refresh)return page('Not connected','Google did not give Karvio lasting access. Open your Google Account → Security → Third-party connections, remove Karvio, then connect again.',false);
  const sameAccount=prev?.email===email;
  const folder=await ensureFolder(cfg,t.access_token,sameAccount?prev.folder_id:'');
  await rpc('karvio_drive_state_save',{state:{refresh:sealSecret(cfg.backupKey,'drive-refresh',refresh),email,folder_id:folder,folder_name:FOLDER_NAME,enabled:true,connected_at:dhaka().stamp,last:sameAccount?prev.last||null:null}});
  return page('Google Drive connected',`Backups will be saved every night at 12:00 AM in the "${FOLDER_NAME}" folder of ${email||'your Google Drive'}.`,true);
 }catch(error){
  return page('Not connected',error instanceof GoogleError?error.message:'Google Drive could not be connected. Try again.',false);
 }
}
