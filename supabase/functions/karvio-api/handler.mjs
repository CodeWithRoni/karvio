import {createRuntime,hash} from './runtime.mjs';
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
export function createHandler({rpc,dispatch=()=>{}}) {
 return async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply({ok:false,error:'Use POST'},405);
  try {
   // Streaming limit prevents an untrusted body from exhausting the isolate before validation.
   const reader=request.body?.getReader();let size=0,chunks=[];
   if(reader){while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024){await reader.cancel();return reply({ok:false,error:'Request exceeds 8 MB'},413);}chunks.push(value);}}
   const bytes=new Uint8Array(size);let off=0;for(const c of chunks){bytes.set(c,off);off+=c.length;}
   let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply({ok:false,error:'Invalid JSON body'},400);}
   if(!body||typeof body.action!=='string'||body.action.length>100)return reply({ok:false,error:'Invalid action'},400);
   for(let attempt=0;attempt<4;attempt++) {
    const snapshot=await rpc('karvio_snapshot',{});
    if(body.action==='ping')return reply({ok:true,data:{app:'Karvio',version:'1.2.0',backend:'supabase',requiresSetup:snapshot.requiresSetup,apiCapabilities:{idempotency:true,durableRecovery:true,credentialSessions:true,chunkedRestore:{maxBytes:16*1024*1024,partChars:128*1024}}}});
    const initializing=body.action==='owner.initialize';
    if(snapshot.requiresSetup&&!initializing)return reply({ok:false,error:'The owner must initialize this fresh database first.'});
    if(initializing&&!snapshot.requiresSetup)return reply({ok:false,error:'The owner account is already initialized.'});
    const runtime=createRuntime(snapshot);
    const result=initializing?runtime.initialize(body.payload||{}):runtime.execute(body);
    // An invalid first setup must not consume the one-time setup key.
    if(initializing&&!result.response.ok)return reply(result.response);
    const changed=Object.keys(result.changes).length||JSON.stringify(result.metadata)!==JSON.stringify(snapshot.metadata);
    if(!changed)return reply(result.response);
    const committed=await rpc('karvio_commit',{expected_revision:snapshot.revision,changes:result.changes,next_metadata:result.metadata,initialize_owner:initializing,setup_token_hash:initializing?hash(String(body.payload?.setup_key||'')):null,backup_reason:result.backupReason,sms_jobs:result.outbox});
    if(committed.committed){dispatch();return reply(result.response);}
   }
   return reply({ok:false,error:'The shop is busy. Retry this same request.',retryable:true},200);
  }catch(error){
   console.error('Karvio gateway request failed',error?.name||'Error');
   // Commit acknowledgement may have been lost. Never tell a caller to make a new money request.
   return reply({ok:false,error:'The database response could not be confirmed. Retry the same request ID.',retryable:true,uncertain:true},503);
  }
 };
}
