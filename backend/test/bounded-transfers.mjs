import fs from 'node:fs';import assert from 'node:assert/strict';import {PGlite} from '../../frontend/node_modules/@electric-sql/pglite/dist/index.js';import {createHandler} from '../../supabase/functions/karvio-api/handler.mjs';import {hash} from '../../supabase/functions/karvio-api/runtime.mjs';
import {exportBackupLines,restoreStreamBackup,inspectStreamingBackup} from '../../frontend/src/lib/backupStream.js';
const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema cron;create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;');
for(const f of ['20261111071516_karvio_fresh_schema.sql','20261111072742_karvio_scoped_table_replacement.sql','20261114133852_karvio_row_deltas_and_status.sql','20261114134523_karvio_backup_retention_and_references.sql','20261114151019_karvio_bounded_transfers.sql','20261114185716_karvio_request_scoped_snapshots.sql','20261114202706_karvio_table_scoped_reads.sql','20261114204617_karvio_private_rows.sql','20261114210842_karvio_read_cache.sql','20261118052545_karvio_backup_saved_quotes.sql','20261119120000_karvio_backup_online_orders.sql','20261119150000_karvio_backup_branch_rows.sql'])await db.exec(fs.readFileSync(new URL('../../supabase/migrations/'+f,import.meta.url),'utf8'));
await db.query('update karvio_private.runtime set setup_hash=$1',[hash('test-key')]);
const calls=[];let maxBytes=0;
async function rpc(name,p){calls.push(name);maxBytes=Math.max(maxBytes,Buffer.byteLength(JSON.stringify(p)));return(await db.query('select public.'+name+'('+Object.keys(p).map((k,i)=>k+' => $'+(i+1)).join(',')+') as r',Object.values(p))).rows[0].r;}
const handler=createHandler({rpc});let token='';async function raw(action,payload={},id=crypto.randomUUID(),t=token){return(await handler(new Request('http://test',{method:'POST',body:JSON.stringify({action,payload,token:t,request_id:id})}))).json();}async function q(a,p={},id){const r=await raw(a,p,id);assert.equal(r.ok,true,a+': '+r.error);return r.data;}
await q('owner.initialize',{name:'Transfer test',password:'transfer-password-2026',setup_key:'test-key'});token=(await q('login',{username:'admin',password:'transfer-password-2026'})).token;
const count=Number(process.env.KARVIO_LARGE_ROWS||100);await db.query('insert into public."AuditLog"(_position,id,ts,"user",action,detail) select (select coalesce(max(_position),1) from public."AuditLog")+g,\'load-\'||g,\'2026-11-15\',\'test\',\'fixture\',repeat(\'load\',256) from generate_series(1,$1::int) g',[count]);
const fingerprint=async()=>(await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(a) order by _position)::text,'[]')) as h from public."AuditLog" a where action is distinct from 'database_restore'`)).rows[0].h;
const before=await fingerprint();calls.length=0;
const begin=await q('database.transfer.export.begin',{},'export-id');const again=await q('database.transfer.export.begin',{},'export-id');assert.equal(again.job_id,begin.job_id);
if(count>=18000)assert.ok(begin.manifest.data_bytes>16*1048576,'fixture exceeds the old restore ceiling');
const manifest=JSON.stringify(begin.manifest),batches=[];let seq=0,digest=hash(manifest);
for(const table of begin.manifest.tables){let after_position=0,seen=0;while(true){const p=await q('database.transfer.export.page',{job_id:begin.job_id,table:table.name,after_position});assert.equal(p.sha256,hash(p.payload));if(p.rows){batches.push({seq,table:table.name,payload:p.payload,sha256:p.sha256});digest=hash(digest+'|'+seq+'|'+table.name+'|'+p.sha256);seq++;seen+=p.rows;}after_position=p.next_cursor;if(p.done)break;}assert.equal(seen,table.rows);}
assert.ok(!calls.includes('karvio_snapshot')&&!calls.includes('karvio_snapshot_for'),'transfer never loads a business snapshot into Edge');
const receipt_key='receipt-'+crypto.randomUUID()+crypto.randomUUID();const restore=await q('database.transfer.restore.begin',{manifest,receipt_key,password:'transfer-password-2026',confirm:'RESTORE'},'restore-id');
const denied=await raw('database.transfer.restore.begin',{manifest,receipt_key:'wrong-'+receipt_key,password:'incorrect',confirm:'RESTORE'},'wrong-password');assert.equal(denied.ok,false);assert.match(denied.error,/password is incorrect/);
const tampered=await raw('database.transfer.restore.page',{job_id:restore.job_id,...batches[0],sha256:'0'.repeat(64)});assert.equal(tampered.ok,false);
for(const b of batches){const r=await q('database.transfer.restore.page',{job_id:restore.job_id,...b});assert.equal(r.received,b.seq+1);if(b.seq===0)assert.equal((await q('database.transfer.restore.page',{job_id:restore.job_id,...b})).received,1);}
assert.equal(await fingerprint(),before,'staging does not change live rows');
const bad=await raw('database.transfer.restore.finish',{job_id:restore.job_id,receipt_key,digest:'0'.repeat(64),pages:seq,confirm:'RESTORE'});assert.equal(bad.ok,false);assert.equal(await fingerprint(),before);
await db.query('insert into public."AuditLog"(_position,id,action,detail) values((select max(_position)+1 from public."AuditLog"),\'after-export\',\'fixture\',\'must remain in safety copy\')');
const queued=await q('database.transfer.restore.finish',{job_id:restore.job_id,receipt_key,digest,pages:seq,confirm:'RESTORE'});assert.equal(queued.state,'queued');
if(process.env.DEBUG_TRANSFER_SQL){await db.exec('begin');try{await db.query('select karvio_private.transfer_apply($1)',[restore.job_id]);}finally{await db.exec('rollback');}}
if(process.env.DEBUG_TRANSFER_SQL){const definition=(await db.query("select pg_get_functiondef('karvio_private.transfer_restore_worker()'::regprocedure) as d")).rows[0].d;await db.exec(definition.replace("else 'Backup validation or database storage/constraint check failed; original data is unchanged'",'else sqlerrm'));}
await db.query('select karvio_private.transfer_restore_worker()');
const status=await q('database.transfer.status',{job_id:restore.job_id,receipt_key});assert.equal(status.state,'done',JSON.stringify(status));assert.equal(status.result.signed_out,true);assert.equal(await fingerprint(),before);
assert.equal((await q('database.transfer.restore.finish',{job_id:restore.job_id,receipt_key,digest,pages:seq,confirm:'RESTORE'})).state,'done','lost reply cannot restore twice');
token=(await q('login',{username:'admin',password:'transfer-password-2026'})).token;
const safety=await q('database.transfer.safety.list');assert.equal(safety.length,1);const safetyBegin=await q('database.transfer.export.begin',{source_id:safety[0].id});assert.ok(safetyBegin.manifest.total_rows>begin.manifest.total_rows);
const page=await q('database.transfer.export.page',{job_id:safety[0].id,table:'AuditLog',after_position:0});assert.ok(page.rows>0);
const lines=[];let completed;for await(const line of exportBackupLines({call:(a,p)=>q(a,p),pace:0,onComplete:x=>completed=x}))lines.push(line);
await q('database.transfer.export.close',{job_id:completed.job_id});
const plainFile=new File(lines,'roundtrip.jsonl',{lastModified:123});assert.equal((await inspectStreamingBackup(plainFile)).format,'Karvio streaming backup');
const compressed=await new Response(plainFile.stream().pipeThrough(new CompressionStream('gzip'))).blob();const file=new File([compressed],'roundtrip.karvio.gz',{lastModified:123});
assert.equal((await inspectStreamingBackup(file)).total_rows,completed.manifest.total_rows);
const saved=new Map(),storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
const result=await restoreStreamBackup(file,{call:(a,p)=>q(a,p),credentials:{password:'transfer-password-2026',confirm:'RESTORE'},storage,key:'test-restore',pace:0,wait:async()=>db.query('select karvio_private.transfer_restore_worker()')});assert.equal(result.signed_out,true);assert.equal(saved.size,0);
assert.ok(maxBytes<2*1048576,'large transfer never sends the whole file in an RPC request');
await db.exec('set role anon');await assert.rejects(()=>db.query('select public.karvio_export_begin(\'x\',\'y\')'));await db.exec('reset role');
// Saved quotations (private sheet) travel in the backup and come back on restore.
token=(await q('login',{username:'admin',password:'transfer-password-2026'})).token;
const quotesSql="select coalesce(jsonb_agg(cells order by position),'[]') as q from karvio_private.private_rows where sheet='__KarvioSavedQuotes'";
await db.query("insert into karvio_private.private_sheets(name,columns) values('__KarvioSavedQuotes',3) on conflict do nothing");
await db.query("delete from karvio_private.private_rows where sheet='__KarvioSavedQuotes'");
await db.query("insert into karvio_private.private_sheets(name,columns) values('__KarvioOnlineOrders',3) on conflict do nothing");
await db.query(`insert into karvio_private.private_rows(sheet,position,cells) values('__KarvioOnlineOrders',1,'["o-1",1763000000000,"{\\"no\\":\\"OO-000001\\"}"]') on conflict do nothing`);
const ordersSql="select coalesce(jsonb_agg(cells order by position),'[]') as q from karvio_private.private_rows where sheet='__KarvioOnlineOrders'";
const ordersBefore=(await db.query(ordersSql)).rows[0].q;assert.equal(ordersBefore.length,1);
await db.query("insert into karvio_private.private_sheets(name,columns) values('__KarvioBranchRows',3) on conflict do nothing");
await db.query(`insert into karvio_private.private_rows(sheet,position,cells) values('__KarvioBranchRows',1,'["s|p1|b1",2.5,""]'),('__KarvioBranchRows',2,'["n|x1",0,"b1"]') on conflict do nothing`);
const branchSql="select coalesce(jsonb_agg(cells order by position),'[]') as q from karvio_private.private_rows where sheet='__KarvioBranchRows'";
const branchBefore=(await db.query(branchSql)).rows[0].q;assert.equal(branchBefore.length,2);
await db.query(`insert into karvio_private.private_rows(sheet,position,cells) values('__KarvioSavedQuotes',1,'["q-1",1763000000000,"{\\"kind\\":\\"pc\\",\\"meta\\":{\\"customer\\":\\"Rahim\\"}}"]'),('__KarvioSavedQuotes',3,'["q-2",1763000005000,"{\\"kind\\":\\"cctv\\"}"]')`);
const quotesBefore=(await db.query(quotesSql)).rows[0].q;assert.equal(quotesBefore.length,2);
const qLines=[];let qDone;for await(const line of exportBackupLines({call:(a,p)=>q(a,p),pace:0,onComplete:x=>qDone=x}))qLines.push(line);
await q('database.transfer.export.close',{job_id:qDone.job_id});
const qHead=JSON.parse(qLines[0]);assert.deepEqual(qHead.tables.slice(-3),[{name:'SavedQuotes',rows:2},{name:'OnlineOrders',rows:1},{name:'BranchRows',rows:2}],'saved quotations, online orders and branch rows are listed in the backup');
assert.ok(qLines.some(l=>l.includes('"table":"SavedQuotes"')),'saved quotation rows are in the file');
// An older backup (no SavedQuotes section) still restores and keeps today's quotations.
const oldHead={...qHead,tables:qHead.tables.slice(0,-3),total_rows:qHead.total_rows-5};
const oldLines=[JSON.stringify(oldHead)];let oldDigest=hash(oldLines[0]),oldSeq=0,oldRows=0;
for(const l of qLines.slice(1,-1)){const part=JSON.parse(l);if(part.table==='SavedQuotes'||part.table==='OnlineOrders'||part.table==='BranchRows')continue;part.seq=oldSeq;oldDigest=hash(oldDigest+'|'+oldSeq+'|'+part.table+'|'+part.sha256);oldSeq++;oldRows+=JSON.parse(part.payload).length;oldLines.push(JSON.stringify(part));}
oldLines.push(JSON.stringify({kind:'end',pages:oldSeq,rows:oldRows,digest:oldDigest}));
const restoreFile=async(lines,name)=>{const r=await restoreStreamBackup(new File(lines.map(l=>l+'\n'),name,{lastModified:456}),{call:(a,p)=>q(a,p),credentials:{password:'transfer-password-2026',confirm:'RESTORE'},storage,key:'quote-'+name,pace:0,wait:async()=>db.query('select karvio_private.transfer_restore_worker()')});token=(await q('login',{username:'admin',password:'transfer-password-2026'})).token;return r;};
await db.query("delete from karvio_private.private_rows where sheet='__KarvioSavedQuotes' and position=3");
const oldResult=await restoreFile(oldLines.map(l=>l.replace(/\n$/,'')),'old.jsonl');assert.equal(oldResult.counts.SavedQuotes,undefined);
assert.deepEqual((await db.query(quotesSql)).rows[0].q,[quotesBefore[0]],'an older backup keeps the current saved quotations');
assert.deepEqual((await db.query(ordersSql)).rows[0].q,ordersBefore,'an older backup keeps the current online orders');
await db.query("delete from karvio_private.private_rows where sheet='__KarvioOnlineOrders'");
assert.deepEqual((await db.query(branchSql)).rows[0].q,branchBefore,'an older backup keeps the current branch rows');
await db.query("delete from karvio_private.private_rows where sheet='__KarvioBranchRows'");
// A new backup replaces them with the quotations in the file.
const newResult=await restoreFile(qLines.map(l=>l.replace(/\n$/,'')),'new.jsonl');assert.equal(newResult.counts.SavedQuotes,2);
assert.deepEqual((await db.query(quotesSql)).rows[0].q,quotesBefore.map(c=>[c[0],c[1],c[2]]),'saved quotations come back from the backup');
assert.deepEqual((await db.query(ordersSql)).rows[0].q,ordersBefore,'online orders come back from the backup');
assert.deepEqual((await db.query(branchSql)).rows[0].q,branchBefore,'branch rows (with decimals) come back from the backup');
console.log(JSON.stringify({fixtureRows:count,pages:seq,maxRpcBytes:maxBytes,atomicRestore:true,readback:true,noFullSnapshot:true,safetyCopy:true}));await db.close();
