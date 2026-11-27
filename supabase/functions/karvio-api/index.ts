import { createHandler, logRequest } from './handler.mjs';
import { dispatchSms } from './sms.mjs';
import { driveCallback } from './drive.mjs';
import { backupSecret } from './backupCrypto.mjs';
const url = Deno.env.get('SUPABASE_URL');
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !secret) throw new Error('Server database credentials are unavailable');
const rpc = async (name: string, body: unknown) => {
 const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
  method: 'POST', headers: {apikey: secret,Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify(body)
 });
 if (!response.ok) {
  let detail;try{detail=await response.json();}catch{}
  const error=new Error(detail?.code==='P0001'?detail.message:`Database RPC failed (${response.status})`);
  // The database's own message is only logged (never sent to a client): it names the failing object.
  Object.assign(error,{code:detail?.code,dbMessage:typeof detail?.message==='string'?detail.message.slice(0,200):undefined});throw error;
 }
 const text = await response.text();
 const data = JSON.parse(text);
 // Response size for the request log; non-enumerable so it never reaches a client.
 if (data && typeof data === 'object') Object.defineProperty(data, '__bytes', {value: text.length});
 return data;
};
const functionUrl=`${url.replace(/\/+$/,'')}/functions/v1/karvio-api`;
// KARVIO_BACKUP_KEY (32+ characters) encrypts every backup; GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET enable Drive backups.
const backupKey=backupSecret(Deno.env.get('KARVIO_BACKUP_KEY')||'');
const drive={clientId:(Deno.env.get('GOOGLE_CLIENT_ID')||'').trim(),clientSecret:(Deno.env.get('GOOGLE_CLIENT_SECRET')||'').trim(),redirectUri:functionUrl,fetch:(input: RequestInfo,init?: RequestInit)=>fetch(input,init)};
const gateway=createHandler({rpc,log:logRequest,backupKey,drive,background:(work: Promise<unknown>)=>EdgeRuntime.waitUntil(work),
 // Database derives the bucket from a stored, unexpired session, never from
 // client-controlled forwarding headers or a claimed username/user ID.
 allowRequest:body=>rpc('karvio_request_limit',{session_key:'tok_'+String(body.token||'').slice(0,512),action_name:body.action}),
 dispatch:()=>EdgeRuntime.waitUntil(dispatchSms(rpc).catch(()=>console.error('SMS worker unavailable')))});
// Tell the database where this function lives, so its scheduler (daily summary SMS) can reach it.
rpc('karvio_register_endpoint',{endpoint_url:functionUrl}).catch(()=>console.error('Endpoint registration unavailable'));
// The Google sign-in window returns here with ?code=…&state=… (the redirect URI set in Google Cloud).
Deno.serve((request: Request)=>{
 const address=new URL(request.url);
 if(request.method==='GET'&&address.searchParams.has('state'))return driveCallback(address,rpc,{...drive,backupKey});
 return gateway(request);
});
