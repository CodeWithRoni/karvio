import { api, endpoint } from './api';
import { useStore } from './store';
const bytesOf = (s) => new TextEncoder().encode(s);
export async function restoreBackup(text, credentials, progress = () => {}) {
  // JSON escaping can more than double the HTTP payload size; switch well below 8 MiB.
  if (bytesOf(JSON.stringify({backup_text:text,...credentials})).length < 7 * 1024 * 1024)
    return api('database.restore', {...credentials,backup_text:text});
  const caps = (await api('ping')).apiCapabilities?.chunkedRestore;
  if (!caps) throw new Error('Update the Karvio backend before restoring a large backup. Nothing was changed.');
  const bytes=bytesOf(text);
  if (bytes.length > caps.maxBytes) throw new Error(`This backup exceeds the ${caps.maxBytes/1048576} MiB restore limit. Nothing was changed.`);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytesOf('restore-upload-v1|'+text))),b=>b.toString(16).padStart(2,'0')).join('');
  const chunks=[];
  for(let i=0;i<text.length;) {
    let end=Math.min(text.length,i+caps.partChars);
    // Keep surrogate pairs together, so per-chunk UTF-8 sizes match the full file.
    if(end<text.length && /[\uD800-\uDBFF]/.test(text[end-1])) end--;
    chunks.push(text.slice(i,end));i=end;
  }
  const key='erp_restore_upload:'+encodeURIComponent(endpoint())+':'+encodeURIComponent(useStore.getState().user?.id || '');
  let prior;try { prior=JSON.parse(sessionStorage.getItem(key)); } catch {}
  let upload_id, received=0;
  if(prior?.digest===digest && prior.expires>Date.now()) {
    try {
      const status=await api('database.restore.status',{upload_id:prior.upload_id});
      if(status.done) { sessionStorage.removeItem(key); return status.done; }
      upload_id=prior.upload_id;received=status.received;
    } catch(e) {
      if (!/Backup upload expired or is not available/.test(e.message)) throw e;
      sessionStorage.removeItem(key);
    }
  }
  if(!upload_id) {
    ({upload_id}=await api('database.restore.begin',{...credentials,size:bytes.length,parts:chunks.length,digest}));
    sessionStorage.setItem(key,JSON.stringify({upload_id,digest,expires:Date.now()+86400000}));
  }
  for(let index=received;index<chunks.length;index++) {
    progress(`Uploading backup ${Math.round(index/chunks.length*100)}% — current data stays unchanged`);
    // The same index/content is safe to repeat if its response was lost.
    try { await api('database.restore.chunk',{upload_id,index,text:chunks[index]}); }
    catch(e) { if(e.auth) throw e; await api('database.restore.chunk',{upload_id,index,text:chunks[index]}); }
  }
  progress('Upload complete. Checking and restoring the backup…');
  const result=await api('database.restore.finish',{upload_id,...credentials});
  sessionStorage.removeItem(key);return result;
}
