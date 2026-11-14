import { createHandler } from './handler.mjs';
import { dispatchSms } from './sms.mjs';
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
  Object.assign(error,{code:detail?.code});throw error;
 }
 return await response.json();
};
const gateway=createHandler({rpc,
 // Database derives the bucket from a stored, unexpired session, never from
 // client-controlled forwarding headers or a claimed username/user ID.
 allowRequest:body=>rpc('karvio_request_limit',{session_key:'tok_'+String(body.token||'').slice(0,512)}),
 dispatch:()=>EdgeRuntime.waitUntil(dispatchSms(rpc).catch(()=>console.error('SMS worker unavailable')))});
Deno.serve(gateway);
