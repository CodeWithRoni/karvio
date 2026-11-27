import {createHash,pbkdf2Sync,timingSafeEqual} from 'node:crypto';
// Buffer is not a global in the Supabase Edge runtime: always import it.
import {Buffer} from 'node:buffer';
import {APP_VERSION} from './release.mjs';
import {PAGE_PREFIX,checkHeader,encryptionHeader,openPage,sealPage} from './backupCrypto.mjs';
export const boundedBackup={version:2,maxDataBytes:268435456,maxFileBytes:536870912,maxRowBytes:1048576,maxLineBytes:4194304,maxRows:2000000};
const sha=s=>createHash('sha256').update(s).digest('hex');
const fail=message=>{throw new Error('BACKUP: '+message);};
const text=(value,max=256)=>{if(typeof value!=='string'||!value.length||value.length>max)fail('Invalid transfer argument');return value;};
function passwordMatches(user,password){
 if(typeof password!=='string'||password.length>4096)return false;
 const match=/^pbkdf2\$600000\$([a-f0-9]{64})$/.exec(user.password_hash||'');
 return !!match&&timingSafeEqual(Buffer.from(match[1],'hex'),pbkdf2Sync(password,user.salt,600000,32,'sha256'));
}
export async function transferRequest(body,rpc,{backupKey=''}={}){
 const p=body.payload||{},token=typeof body.token==='string'?body.token:'';
 try{
  let result;
  switch(body.action){
   case 'database.transfer.export.begin':
    result=await rpc('karvio_export_begin',{token,request_key:text(body.request_id,200),source_id:p.source_id||null});
    result.manifest.app_version=APP_VERSION;
    // Server key set: every page of this backup is sealed (the key itself never leaves the server).
    if(backupKey)result.manifest.encryption=encryptionHeader(backupKey,result.job_id);
    break;
   case 'database.transfer.export.page':
    if(!Number.isSafeInteger(p.after_position)||p.after_position<0)fail('Invalid export cursor');
    result=await rpc('karvio_export_page',{token,job_id:text(p.job_id),table_name:text(p.table,100),after_position:p.after_position});
    if(backupKey&&result.rows)result={...result,...sealPage(backupKey,p.job_id,p.table,result.payload),encrypted:true};
    break;
   case 'database.transfer.export.close':
    result=await rpc('karvio_export_close',{token,job_id:text(p.job_id)});break;
   case 'database.transfer.restore.begin':{
    if(p.confirm!=='RESTORE')fail('Type RESTORE to confirm');
    const manifest=text(p.manifest,65536),receipt=text(p.receipt_key);if(receipt.length<32)fail('Invalid recovery receipt');
    let header;try{header=JSON.parse(manifest);}catch{fail('Invalid restore manifest');}
    checkHeader(backupKey,header); // an encrypted backup needs this server's key; refused before anything is staged
    const context=await rpc('karvio_transfer_context',{token});
    return await rpc('karvio_restore_begin',{token,request_key:text(body.request_id,200),manifest_text:manifest,receipt_hash:sha(receipt),observed_credential:context.password_hash,password_ok:!context.blocked&&passwordMatches(context,p.password)});
   }
   case 'database.transfer.restore.page':
    if(!Number.isSafeInteger(p.seq)||p.seq<0)fail('Invalid upload sequence');
    {let payload=text(p.payload,1572864);const table=text(p.table,100),pageHash=text(p.sha256,64);
     if(payload.startsWith(PAGE_PREFIX)){if(!backupKey)fail('This backup is encrypted, but the server backup key (KARVIO_BACKUP_KEY) is not set');payload=openPage(backupKey,text(p.encryption_salt,200),table,payload,pageHash);}
     result=await rpc('karvio_restore_page',{token,job_id:text(p.job_id),seq:p.seq,table_name:table,payload,page_hash:pageHash});}
    break;
   case 'database.transfer.restore.finish':
    if(!Number.isSafeInteger(p.pages)||p.pages<0)fail('Invalid trailer');
    result=await rpc('karvio_restore_finish',{token,job_id:text(p.job_id),receipt_key:text(p.receipt_key),final_digest:text(p.digest,64),page_count:p.pages,confirm_word:p.confirm||''});break;
   case 'database.transfer.status':
    result=await rpc('karvio_transfer_status',{token,job_id:text(p.job_id),receipt_key:p.receipt_key||null});break;
   case 'database.transfer.abort':
    result=await rpc('karvio_transfer_abort',{token,job_id:text(p.job_id)});break;
   case 'database.transfer.safety.list':
    result=await rpc('karvio_transfer_safety_list',{token});break;
   default:fail('Unknown transfer action');
  }
  return {ok:true,data:result};
 }catch(error){
  const message=String(error.message||'');
  if(message.startsWith('AUTH:'))return {ok:false,error:message,auth:true};
  if(message.startsWith('BACKUP:')||message.startsWith('Backup transfer')||message.startsWith('Only the Administrator'))return {ok:false,error:message.replace(/^BACKUP:\s*/, '')};
  // Why it failed, for the function log (no payload, token or customer data).
  console.error('Backup transfer failed',body.action,[error?.name,error?.code,String(error?.dbMessage||message).slice(0,200)].filter(Boolean).join(': '));
  if(error.code==='23505')return {ok:false,error:'Backup contains duplicate IDs, usernames or row positions'};
  if(error.code==='23503')return {ok:false,error:'Backup contains a missing invoice/reference'};
  if(error.code==='22P02'||error.code==='23502')return {ok:false,error:'Backup contains an invalid field value'};
  return {ok:false,error:'The backup request could not be confirmed. Retry the same request or check its recovery receipt.',retryable:true,uncertain:true};
 }
}
