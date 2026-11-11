import {createEngine} from './engine.mjs';
const failed=createEngine({},{}).smsReplyFailed_;
export async function dispatchSms(rpc, transport=fetch) {
 const jobs=await rpc('karvio_claim_sms',{});
 for(const job of jobs) {
  let status='unknown',text='Delivery could not be confirmed. Check gateway before resending.';
  try {
   const url=new URL(job.url);
   if(url.protocol!=='https:'||url.username||url.password||!url.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)|\.(local|internal)$|:/.test(url.hostname))throw new Error('Only public HTTPS SMS gateways are allowed');
   const response=await transport(url,{...job.options,redirect:'error',signal:AbortSignal.timeout(12000)});
   const reader=response.body.getReader();let content='';const decoder=new TextDecoder();
   while(content.length<300){const {done,value}=await reader.read();if(done)break;content+=decoder.decode(value,{stream:true});}await reader.cancel();
   text=content.slice(0,300);status=!response.ok||failed(text)?'failed':'sent';
  }catch{/* A timeout can follow a successful gateway send. Never automatically retry. */}
  await rpc('karvio_finish_sms',{job_id:job.id,delivery_status:status,gateway_response:text});
 }
}
