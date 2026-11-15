import {createRuntime,hash} from './runtime.mjs';
import {APP_VERSION,BUILD_ID} from './release.mjs';
import {boundedBackup,transferRequest} from './transfers.mjs';
import {ROW_SCOPED_ACTIONS,NARROW_READ_ACTIONS,TABLE_HINTS,APPEND_HINTS,ALWAYS_TABLES,DEFAULT_PRIVATE,PRIVATE_HINTS} from './scope.mjs';
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const clock=()=>(globalThis.performance?.now?.()??Date.now());
// A request slower than this, or one that had to retry, is logged as a warning.
export const SLOW_REQUEST_MS=1500;
/**
 * One structured line per request (no payload, token or customer data): visible in
 * Supabase → Edge Functions → karvio-api → Logs. Filter on "karvio_request".
 */
export const notableRequest=m=>m.outcome==='error'||m.outcome==='busy'||m.ms>=SLOW_REQUEST_MS||m.attempts>1;
export function logRequest(m){
 const line=JSON.stringify({evt:'karvio_request',...m});
 if(notableRequest(m))console.warn(line);else console.log(line);
}
// Default for tests and embedders: only the requests worth investigating.
const logNotable=m=>{if(notableRequest(m))console.warn(JSON.stringify({evt:'karvio_request',...m}));};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Key order differs between Postgres jsonb and JavaScript objects, so compare values, not text.
// (Comparing text made every read look like a change and save, taking the shop lock each time.)
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
export const sameValue=(a,b)=>canonical(a)===canonical(b);
// Per server instance: tables an action turned out to need beyond its hint, and whether the
// narrow-read database functions exist (they arrive with a migration that may lag a deploy).
// PostgREST: PGRST202 "Could not find the function"; Postgres: 42883 undefined_function.
const missingFunction=e=>e?.code==='PGRST202'||e?.code==='42883'||/Could not find the function|function .* does not exist/i.test(String(e?.message||''));
// A database function found missing (Edge deployed before its migration) is tried again after recheckMs.
const newScopeState=(recheckMs=60000)=>({learned:new Map(),learnedPrivate:new Map(),narrowUnavailable:0,readUnavailable:0,cacheUnavailable:0,recheckMs});
const unavailable=(state,flag)=>state[flag]>0&&Date.now()-state[flag]<state.recheckMs;
function remember(map,key,names){const set=map.get(key)||new Set();names.forEach(t=>set.add(t));map.set(key,set);}
/**
 * How much of the database a request reads:
 *  rows   – the hand-written row filters in karvio_snapshot_request (checkout, payments, details …)
 *  scoped – row filters for read-only lists/statements in karvio_snapshot_scoped (date range / one party)
 *  tables – every row of only the tables this action uses (hint list, widened automatically if needed)
 *  full   – the whole shop (setup, or a narrow read that turned out too narrow)
 */
// Reports differ a lot by type, so each report type keeps its own table list.
export const hintKey=(action,payload)=>action==='reports'&&typeof payload?.type==='string'&&/^[a-z_]{1,40}$/.test(payload.type)?'reports:'+payload.type:action;
export function planFor(action,options={},state=newScopeState()){
 const plan=basePlan(action,options,state);
 // Private sheets to read with the business rows (the journal is needed by every locked request).
 const key=plan.key||action;
 plan.private=new Set([...DEFAULT_PRIVATE,...(Object.hasOwn(PRIVATE_HINTS,key)?PRIVATE_HINTS[key]:[]),...(state.learnedPrivate.get(key)||[])]);
 return plan;
}
function basePlan(action,{protocol=2,scopedReads=true,narrowReads=true,payload={}}={},state){
 if(protocol!==2)return {kind:'legacy'};
 if(!scopedReads)return {kind:'unscoped'};
 if(action==='owner.initialize')return {kind:'full'};
 if(!narrowReads||unavailable(state,'narrowUnavailable'))return {kind:'rows',key:action}; // v1.2.4 behaviour
 if(NARROW_READ_ACTIONS.has(action))return {kind:'scoped',key:hintKey(action,payload)};
 const key=hintKey(action,payload);
 // No table list yet: the database's own request scoping (it reads the whole shop for unknown actions).
 if(ROW_SCOPED_ACTIONS.has(action)||!Object.hasOwn(TABLE_HINTS,key))return {kind:'rows',key};
 return tablesPlan(key,state);
}
function tablesPlan(key,state){
 const hint=Object.hasOwn(TABLE_HINTS,key)?TABLE_HINTS[key]:null;
 // No list yet, or regenerating the lists (scripts/trace-table-hints.mjs must see every table used).
 if(!hint||globalThis.__karvioTraceWholeShop)return {kind:'full',key};
 const learned=state.learned.get(key)||new Set();
 // Logs the action only appends to: read their last row position instead of every row.
 const append=new Set((Object.hasOwn(APPEND_HINTS,key)?APPEND_HINTS[key]:[]).filter(t=>hint.includes(t)&&!learned.has(t)));
 return {kind:'tables',key,append,tables:new Set([...ALWAYS_TABLES,...hint,...learned].filter(t=>!append.has(t)))};
}
function snapshotCall(plan,body,protocol,state){
 if(protocol===2&&plan.kind!=='legacy'&&!plan.readMissing&&!unavailable(state,'readUnavailable'))
  return ['karvio_read',{kind:plan.kind,action_name:body.action,payload:body.payload||{},table_names:plan.tables?[...plan.tables].sort():null,private_names:[...plan.private].sort(),...(plan.kind==='tables'&&plan.append?.size?{append_names:[...plan.append].sort()}:{})}];
 switch(plan.kind){
  case 'legacy':return ['karvio_snapshot',{}];
  case 'unscoped':return ['karvio_snapshot_for',{action_name:body.action}];
  case 'rows':return ['karvio_snapshot_request',{action_name:body.action,payload:body.payload||{}}];
  case 'scoped':return ['karvio_snapshot_scoped',{action_name:body.action,payload:body.payload||{}}];
  case 'tables':return ['karvio_snapshot_tables',{table_names:[...plan.tables].sort()}];
  default:return ['karvio_snapshot',{}];
 }
}
// Heavy read-only screens whose answers are reused until the shop changes (karvio_cached_read).
export const CACHED_READS=new Set(['dashboard','reports','profit.report']);
export function createHandler({rpc,dispatch=()=>{},protocol=2,scopedReads=true,narrowReads=true,readCache=true,allowRequest=async()=>true,log=logNotable,retryDelay=attempt=>attempt*(25+Math.random()*50),recheckMs=60000}) {
 const scopeState=newScopeState(recheckMs);
 return async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply({ok:false,error:'Use POST'},405);
  const started=clock();
  const m={action:'',outcome:'ok',ms:0,attempts:0,dbMs:0,engineMs:0,readBytes:0,writes:0};
  // Every database call is timed; the Edge rpc reports the response size as __bytes.
  const call=async(name,args)=>{const t=clock();try{const out=await rpc(name,args);m.readBytes+=Number(out?.__bytes)||0;return out;}finally{m.dbMs+=clock()-t;}};
  const finish=(response,outcome)=>{
   if(outcome)m.outcome=outcome;
   m.ms=Math.round(clock()-started);m.dbMs=Math.round(m.dbMs);m.engineMs=Math.round(m.engineMs);
   if(m.action){try{log(m);}catch{}}
   return response;
  };
  try {
   // Streaming limit prevents an untrusted body from exhausting the isolate before validation.
   const reader=request.body?.getReader();let size=0,chunks=[];
   if(reader){while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024){await reader.cancel();return reply({ok:false,error:'Request exceeds 8 MB'},413);}chunks.push(value);}}
   const bytes=new Uint8Array(size);let off=0;for(const c of chunks){bytes.set(c,off);off+=c.length;}
   let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply({ok:false,error:'Invalid JSON body'},400);}
   if(!body||typeof body.action!=='string'||body.action.length>100)return reply({ok:false,error:'Invalid action'},400);
   m.action=body.action;
   if(!await allowRequest(body))return finish(reply({ok:false,error:'Too many requests. Try again in a minute.'},429),'limited');
   // The daily-summary scheduler (pg_cron) must hand over a one-time code the database minted for this call.
   if(body.action==='summary.tick'){let ok=false;try{ok=await call('karvio_cron_claim',{nonce:String(body.payload?.nonce||'')})===true;}catch{}if(!ok)return finish(reply({ok:false,error:'Not allowed'},403),'rejected');}
   if(protocol===2&&body.action.startsWith('database.transfer.')){const data=await transferRequest(body,call);return finish(reply(data),data.ok?'ok':'rejected');}
   if(body.action==='ping'&&protocol===2){
    const status=await call('karvio_status',{});
    return finish(reply({ok:true,data:{app:'Karvio',version:APP_VERSION,buildId:BUILD_ID,backend:'supabase',requiresSetup:status.requiresSetup,apiCapabilities:{idempotency:true,durableRecovery:true,credentialSessions:true,purchaseDuePayment:true,saleDuePayment:true,rowDeltas:true,boundedBackup,chunkedRestore:{maxBytes:16*1024*1024,partChars:128*1024}}}}));
   }
   // Same answer as last time if nothing was saved since (see the read-cache migration for the rules).
   const cacheKey=readCache&&protocol===2&&scopedReads&&CACHED_READS.has(body.action)&&typeof body.token==='string'&&!unavailable(scopeState,'cacheUnavailable')&&!globalThis.__karvioTraceWholeShop
    ?body.action+':'+hash(canonical(body.payload??{})):null;
   if(cacheKey){
    try{const hit=await call('karvio_cached_read',{token:body.token,cache_key:cacheKey});if(hit!==null&&hit!==undefined){m.scope='cache';return finish(reply({ok:true,data:hit}),'ok');}}
    catch(error){if(missingFunction(error))scopeState.cacheUnavailable=Date.now();else throw error;}
   }
   const plan=planFor(body.action,{protocol,scopedReads,narrowReads,payload:body.payload},scopeState);
   // Up to 4 tries when another counter saves first; a narrow read may also widen a few times.
   for(let attempt=0,widened=0;attempt<4&&m.attempts<12;) {
    // Another counter saved first: wait a short, random moment so both do not collide again.
    if(attempt&&!plan.widening)await pause(retryDelay(attempt));
    plan.widening=false;
    m.attempts++;m.scope=plan.kind;
    let snapshot;
    const [readName,readArgs]=snapshotCall(plan,body,protocol,scopeState);
    try{snapshot=await call(readName,readArgs);}
    catch(error){
     // Database functions from a newer migration not installed yet (the Edge function is deployed
     // first): use the older read path for this server instance instead of failing the request.
     if(!missingFunction(error))throw error;
     if(readName==='karvio_read'){scopeState.readUnavailable=Date.now();plan.readMissing=true;plan.widening=true;continue;}
     if(plan.kind!=='tables'&&plan.kind!=='scoped')throw error;
     scopeState.narrowUnavailable=Date.now();Object.assign(plan,{kind:'rows',widening:true});continue;
    }
    // Read through the older path but the database already keeps private sheets as rows
    // (migrated while this instance was running): switch to karvio_read, never run without receipts.
    if(protocol===2&&readName!=='karvio_read'&&snapshot&&snapshot.metadata&&!Object.hasOwn(snapshot.metadata,'privateSheets')){scopeState.readUnavailable=0;plan.readMissing=false;plan.widening=true;continue;}
    // The request is not narrow enough for a row-scoped read (e.g. no date range): read whole tables.
    if(snapshot===null&&plan.kind==='scoped'){Object.assign(plan,tablesPlan(plan.key,scopeState),{widening:true});continue;}
    if(body.action==='ping')return finish(reply({ok:true,data:{app:'Karvio',version:APP_VERSION,buildId:BUILD_ID,backend:'supabase',requiresSetup:snapshot.requiresSetup,apiCapabilities:{idempotency:true,durableRecovery:true,credentialSessions:true,purchaseDuePayment:true,saleDuePayment:true,chunkedRestore:{maxBytes:16*1024*1024,partChars:128*1024}}}}));
    const initializing=body.action==='owner.initialize';
    if(snapshot.requiresSetup&&!initializing)return finish(reply({ok:false,error:'The owner must initialize this fresh database first.'}),'rejected');
    if(initializing&&!snapshot.requiresSetup)return finish(reply({ok:false,error:'The owner account is already initialized.'}),'rejected');
    const engineStarted=clock();
    const runtime=createRuntime(snapshot,{deltaOnly:protocol===2});
    const result=initializing?runtime.initialize(body.payload||{}):runtime.execute(body);
    m.engineMs+=clock()-engineStarted;
    globalThis.__karvioTrace?.(hintKey(body.action,body.payload),result.touched,snapshot.loadedTables,result.missing,result.read,result.unread);
    // The engine opened a table this narrow read did not load: never use that result. Load it and run again.
    if(result.missing?.length){
     widened++;
     const sheets=result.missing.filter(t=>t.startsWith('#')).map(t=>t.slice(1)),tables=result.missing.filter(t=>!t.startsWith('#'));
     sheets.forEach(t=>plan.private.add(t));remember(scopeState.learnedPrivate,plan.key||body.action,sheets);
     if(tables.length){
      if(plan.kind==='tables'&&widened<3){tables.forEach(t=>{plan.tables.add(t);plan.append?.delete(t);});remember(scopeState.learned,plan.key,tables);}
      else plan.kind='full';
     }
     plan.widening=true;m.widened=(m.widened||0)+1;
     continue;
    }
    // An invalid first setup must not consume the one-time setup key.
    if(initializing&&!result.response.ok)return finish(reply(result.response),'rejected');
    const changes=protocol===2?result.delta:result.changes;
    // A row-scoped read saw only part of some tables, so it may never save business rows.
    if(snapshot.readOnlyScope&&Object.keys(changes).length){plan.kind='full';plan.widening=true;m.widened=(m.widened||0)+1;continue;}
    const privateChanges=result.privateDelta||{};
    const changed=Object.keys(changes).length||Object.keys(privateChanges).length||!sameValue(result.metadata,snapshot.metadata);
    if(!changed){
     if(cacheKey&&result.response.ok){try{await call('karvio_cache_store',{token:body.token,cache_key:cacheKey,revision:snapshot.revision,response:result.response.data});}catch{}}
     return finish(reply(result.response),result.response.ok?'ok':'rejected');
    }
    const commitArgs={expected_revision:snapshot.revision,changes,next_metadata:result.metadata,initialize_owner:initializing,setup_token_hash:initializing?hash(String(body.payload?.setup_key||'')):null,backup_reason:result.backupReason,sms_jobs:result.outbox};
    const committed=await call(snapshot.privateRows?'karvio_commit_rows':protocol===2?'karvio_commit_delta':'karvio_commit',snapshot.privateRows?{...commitArgs,private_changes:privateChanges}:commitArgs);
    if(committed.committed){
     m.writes=Object.values(changes).reduce((n,t)=>n+(Array.isArray(t)?t.length:(t.upsert?.length||0)+(t.remove?.length||0)),0);
     dispatch();return finish(reply(result.response),result.response.ok?'ok':'rejected');
    }
    attempt++;
   }
   return finish(reply({ok:false,error:'The shop is busy. Retry this same request.',retryable:true},200),'busy');
  }catch(error){
   // Why it failed (no payload, token or customer data): error type, database code and message.
   m.error=[error?.name||'Error',error?.code,String(error?.dbMessage||error?.message||'').slice(0,200)].filter(Boolean).join(': ');
   console.error('Karvio gateway request failed',m.error);
   // Commit acknowledgement may have been lost. Never tell a caller to make a new money request.
   return finish(reply({ok:false,error:'The database response could not be confirmed. Retry the same request ID.',retryable:true,uncertain:true},503),'error');
  }
 };
}
