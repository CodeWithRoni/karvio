import { createHandler } from './handler.mjs';
import { dispatchSms } from './sms.mjs';
const url = Deno.env.get('SUPABASE_URL');
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !secret) throw new Error('Server database credentials are unavailable');
const rpc = async (name: string, body: unknown) => {
 const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
  method: 'POST', headers: {apikey: secret,Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify(body)
 });
 if (!response.ok) throw new Error(`Database RPC failed (${response.status})`);
 return await response.json();
};
const gateway=createHandler({rpc,dispatch:()=>EdgeRuntime.waitUntil(dispatchSms(rpc).catch(()=>console.error('SMS worker unavailable')))});
Deno.serve(async request=>{
 if(request.method==='POST') {
  // Keep raw IP addresses out of the database. Supabase supplies the forwarding header.
  const {hash}=await import('./runtime.mjs');
  const ip=(request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
  const allowed=await rpc('karvio_rate_limit',{bucket:hash(ip),max_requests:180,seconds:60});
  if(!allowed)return new Response(JSON.stringify({ok:false,error:'Too many requests. Try again in a minute.'}),{status:429,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
 }
 return gateway(request);
});
