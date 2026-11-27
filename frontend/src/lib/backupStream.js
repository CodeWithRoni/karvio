export const STREAM_FORMAT='Karvio streaming backup';
const encoder=new TextEncoder();
const limits={file:536870912,line:4194304,manifest:65536,rows:2000000};
export async function streamHash(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function paced(call,wait=delay,interval=450){let last=0;return async(action,payload)=>{const remaining=last+interval-Date.now();if(remaining>0)await wait(remaining);last=Date.now();return call(action,payload);};}
function manifestOf(line){
 if(encoder.encode(line).length>limits.manifest)throw Error('Backup header is too large');
 const m=JSON.parse(line);
 if(m.format!==STREAM_FORMAT||m.version!==2||!Array.isArray(m.tables)||!Number.isSafeInteger(m.total_rows)||m.total_rows<1||m.total_rows>limits.rows)throw Error('Unsupported streaming backup');
 return m;
}
export function isStreamingBackup(file){return /\.(?:karvio|karvio\.gz|jsonl|jsonl\.gz)$/i.test(file.name);}
/** An encrypted backup (made while the server has its backup key): every page is sealed on the server. */
export const isEncryptedManifest=m=>!!(m&&m.encryption&&typeof m.encryption.salt==='string');
export async function* backupLines(file){
 if(file.size>limits.file)throw Error('Backup file exceeds the 512 MiB compressed/container limit');
 let source=file.stream();
 if(/\.gz$/i.test(file.name)){
  if(typeof DecompressionStream==='undefined')throw Error('This browser cannot open compressed backups. Use a current browser or an uncompressed .jsonl backup');
  source=source.pipeThrough(new DecompressionStream('gzip'));
 }
 const reader=source.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let buffer='',bytes=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limits.file)throw Error('Uncompressed backup exceeds 512 MiB');buffer+=decoder.decode(value,{stream:true});let at;
   while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(encoder.encode(line).length>limits.line)throw Error('Backup contains an oversized page');if(line.trim())yield line;}
   if(encoder.encode(buffer).length>limits.line)throw Error('Backup contains an oversized page');
  }
  buffer+=decoder.decode();if(buffer.trim())yield buffer;
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function inspectStreamingBackup(file){for await(const line of backupLines(file))return manifestOf(line);throw Error('Backup is empty');}
export async function* exportBackupLines({call,sourceId,progress=()=>{},wait=delay,pace=450,onComplete=()=>{}}){
 const request=paced(call,wait,pace);
 const {job_id,manifest}=await request('database.transfer.export.begin',sourceId?{source_id:sourceId}:{});
 const header=JSON.stringify(manifest);manifestOf(header);let digest=await streamHash(header),seq=0,rows=0;
 yield header+'\n';
 for(const table of manifest.tables){let cursor=0,seen=0;
  while(true){const page=await request('database.transfer.export.page',{job_id,table:table.name,after_position:cursor});
   // Encrypted page: its own checksum covers the sealed text; sha256 is the plain page's (checked again by the server on restore).
   if((page.encrypted?page.enc_sha256:page.sha256)!==await streamHash(page.payload))throw Error('Backup download checksum mismatch');
   if(page.rows){if(!Number.isSafeInteger(page.rows)||page.rows<1||page.next_cursor<=cursor)throw Error('Invalid export page');seen+=page.rows;rows+=page.rows;
    const batch=page.encrypted?{kind:'rows',seq,table:table.name,rows:page.rows,payload:page.payload,sha256:page.sha256,enc_sha256:page.enc_sha256}:{kind:'rows',seq,table:table.name,payload:page.payload,sha256:page.sha256};digest=await streamHash(digest+'|'+seq+'|'+table.name+'|'+page.sha256);seq++;yield JSON.stringify(batch)+'\n';
   }else if(!page.done)throw Error('Export cursor did not advance');
   cursor=page.next_cursor;progress(`Preparing backup ${Math.floor(rows/manifest.total_rows*100)}%`);if(page.done)break;
  }
  if(seen!==table.rows)throw Error('Backup table count mismatch');
 }
 if(rows!==manifest.total_rows)throw Error('Backup row count mismatch');
 yield JSON.stringify({kind:'end',pages:seq,rows,digest})+'\n';
 // The caller acknowledges only after the destination stream/download succeeds.
 onComplete({job_id,manifest,request});
}
export async function downloadStreamBackup(options){
 let completed;const iterator=exportBackupLines({...options,onComplete:r=>{completed=r;}})[Symbol.asyncIterator]();
 // The header says whether the server sealed the pages: an encrypted .karvio file is not compressed again.
 const first=await iterator.next();if(first.done)throw Error('Backup is empty');
 const encrypted=isEncryptedManifest(JSON.parse(first.value));
 const gzip=!encrypted&&typeof CompressionStream!=='undefined';
 const date=options.date||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const name=`Karvio-backup-${date}.${encrypted?'karvio':gzip?'karvio.gz':'jsonl'}`;
 let handle;
 // This optional path writes directly to disk without retaining the archive.
 if(options.directToFile&&typeof window.showSaveFilePicker==='function')handle=await window.showSaveFilePicker({suggestedName:name});
 let pendingHeader=first.value,failure=null;
 // A page that fails (server refused it, network lost) stops the download; keep its own message, not the browser's "Failed to fetch".
 let stream=new ReadableStream({async pull(controller){try{if(pendingHeader!==null){controller.enqueue(encoder.encode(pendingHeader));pendingHeader=null;return;}const r=await iterator.next();if(r.done)controller.close();else controller.enqueue(encoder.encode(r.value));}catch(e){failure=e;controller.error(e);}},async cancel(){await iterator.return?.();}});
 if(gzip)stream=stream.pipeThrough(new CompressionStream('gzip'));
 let bytes=0;stream=stream.pipeThrough(new TransformStream({transform(chunk,controller){bytes+=chunk.byteLength;controller.enqueue(chunk);}}));
 if(handle){const writer=await handle.createWritable();try{await stream.pipeTo(writer);}catch(e){throw failure||e;}}
 else{
  let blob;try{blob=await new Response(stream).blob();}catch(e){throw failure||e;}bytes=blob.size;
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 if(!completed)throw Error('Backup download did not complete');
 await completed.request('database.transfer.export.close',{job_id:completed.job_id});
 return {name,bytes,records:completed.manifest.total_rows,encrypted};
}
async function waitForRestore(request,job,progress,wait){
 for(;;){const status=await request('database.transfer.status',{job_id:job.job_id,receipt_key:job.receipt_key});
  if(status.state==='done')return status.result;
  if(status.state==='failed'){const error=Error(status.result?.error||'Restore validation failed; original data is unchanged');error.restoreFailed=true;throw error;}
  if(status.state!=='queued')throw Error('Restore is not queued');
  progress('Restore is queued or processing. It will complete atomically; keep this page open.');await wait(2000);
 }
}
export async function restoreStreamBackup(file,{call,credentials,storage=sessionStorage,key,progress=()=>{},wait=delay,pace=450}){
 const request=paced(call,wait,pace),fingerprint=await streamHash(JSON.stringify([file.name,file.size,file.lastModified]));
 let job;try{job=JSON.parse(storage.getItem(key));}catch{}
 if(job?.fingerprint!==fingerprint)job=null;
 if(job?.job_id){const status=await request('database.transfer.status',{job_id:job.job_id,receipt_key:job.receipt_key});if(status.state==='done'){storage.removeItem(key);return status.result;}if(status.state==='queued'){try{const result=await waitForRestore(request,job,progress,wait);storage.removeItem(key);return result;}catch(error){if(error.restoreFailed)storage.removeItem(key);throw error;}}if(status.state==='failed'){storage.removeItem(key);throw Error(status.result?.error||'Restore failed; original data is unchanged. You may retry the upload.');}}
 let manifest,digest,seq=0,rows=0,ended=false,received=0,serverDigest,sealed=false;
 for await(const line of backupLines(file)){
  if(!manifest){manifest=manifestOf(line);digest=await streamHash(line);sealed=isEncryptedManifest(manifest);
   if(!job){job={fingerprint,receipt_key:crypto.randomUUID()+crypto.randomUUID()};storage.setItem(key,JSON.stringify(job));}
   if(!job.job_id){const started=await request('database.transfer.restore.begin',{manifest:line,receipt_key:job.receipt_key,...credentials});job.job_id=started.job_id;storage.setItem(key,JSON.stringify(job));}
   const status=await request('database.transfer.status',{job_id:job.job_id,receipt_key:job.receipt_key});received=status.received;serverDigest=status.digest;
   if(received===0&&serverDigest!==digest)throw Error('Backup header differs from the pending upload');continue;
  }
  if(ended)throw Error('Unexpected data after backup trailer');
  const part=JSON.parse(line);
  if(part.kind==='end'){
   if(part.pages!==seq||part.rows!==rows||part.rows!==manifest.total_rows||part.digest!==digest)throw Error('Backup is incomplete or was edited');ended=true;continue;
  }
  if(part.kind!=='rows'||part.seq!==seq||typeof part.payload!=='string')throw Error('Backup page is damaged/out of order');
  if(sealed){
   // Only the server can open a sealed page; here its own checksum and the plain page's checksum are checked.
   if(typeof part.sha256!=='string'||!/^[a-f0-9]{64}$/.test(part.sha256)||part.enc_sha256!==await streamHash(part.payload)||!Number.isSafeInteger(part.rows)||part.rows<1||part.rows>1000)throw Error('Backup page is damaged/out of order');
   rows+=part.rows;
  }else{
   if(part.sha256!==await streamHash(part.payload))throw Error('Backup page is damaged/out of order');
   const values=JSON.parse(part.payload);if(!Array.isArray(values)||!values.length||values.length>1000)throw Error('Invalid backup page');rows+=values.length;
  }
  digest=await streamHash(digest+'|'+seq+'|'+part.table+'|'+part.sha256);
  if(seq<received){if(seq+1===received&&digest!==serverDigest)throw Error('Backup differs from the pending upload');}
  else{const status=await request('database.transfer.restore.page',{job_id:job.job_id,seq,table:part.table,payload:part.payload,sha256:part.sha256,...(sealed?{encryption_salt:manifest.encryption.salt}:{})});if(status.received!==seq+1||status.digest!==digest)throw Error('Restore progress/checksum mismatch');}
  seq++;progress(`Uploading backup ${Math.min(100,Math.floor(rows/manifest.total_rows*100))}% — current data is unchanged`);
 }
 if(!ended||!job?.job_id)throw Error('Backup ended before its verified trailer');
 const queued=await request('database.transfer.restore.finish',{job_id:job.job_id,receipt_key:job.receipt_key,digest,pages:seq,confirm:credentials.confirm});
 if(queued.state==='failed'){storage.removeItem(key);throw Error(queued.result?.error||'Restore failed');}
 let result;try{result=queued.state==='done'?queued.result:await waitForRestore(request,job,progress,wait);}catch(error){if(error.restoreFailed)storage.removeItem(key);throw error;}
 storage.removeItem(key);return result;
}
