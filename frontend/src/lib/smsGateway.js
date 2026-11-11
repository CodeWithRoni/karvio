export const SMS_VALUES = {'{number}':'Customer phone','{message}':'SMS message','{api_key}':'API key','{sender_id}':'Sender ID'};
export function readFields(body, type) {
 try {
  const entries=type==='json'?Object.entries(JSON.parse(body||'{}')):[...new URLSearchParams(body||'').entries()];
  if(type==='json'&&entries.some(([,value])=>typeof value!=='string'))return null;
  return entries.map(([name,value])=>({name,value:String(value)}));
 }catch{return null;}
}
export function writeFields(rows,type) {
 const data=rows.filter(r=>r.name.trim()).map(r=>[r.name.trim(),r.value]);
 if(type==='json')return JSON.stringify(Object.fromEntries(data),null,2);
 return new URLSearchParams(data).toString().replace(/%7B(number|message|api_key|sender_id)%7D/g,'{$1}');
}
export function gatewayError(f) {
 try {const u=new URL(f.sms_url);if(u.protocol!=='https:'||u.username||u.password)return 'Use a public HTTPS API URL without a username or password in the address.';}catch{return 'Enter a valid HTTPS API URL.';}
 if(/PASTE-BASE-URL|BASE_URL|api\.example\.com/i.test(f.sms_url))return 'Replace the example API URL with the address from your provider.';
 const request=f.sms_url+' '+(f.sms_method==='POST'?f.sms_body:'');
 if(!request.includes('{number}')||!request.includes('{message}'))return 'Map both Customer phone and SMS message to your provider’s fields.';
 if(f.sms_method==='POST'&&f.sms_body_type==='json'){
  try{const body=JSON.parse(f.sms_body);if(!body||Array.isArray(body)||typeof body!=='object')return 'The JSON request must be an object.';}catch{return 'The request body contains invalid JSON. Open Advanced request settings to fix it.';}
 }
 if(f.sms_enabled==='true'&&request.concat(f.sms_headers||'').includes('{api_key}')&&!String(f.sms_api_key||'').trim())return 'Enter the API key before turning on automatic SMS.';
 return '';
}
