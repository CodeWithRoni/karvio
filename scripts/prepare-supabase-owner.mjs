// Generate a PRIVATE, local-only first-owner page. Never put its output in the repository.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
const folder=process.argv[2];if(!folder)throw new Error('Choose a private folder outside the repository');
const resolved=path.resolve(folder),repo=path.resolve(import.meta.dirname,'..');
if(resolved===repo||resolved.startsWith(repo+path.sep))throw new Error('The setup page must be outside the repository');
fs.mkdirSync(resolved,{recursive:true});
const destination=path.join(resolved,'Karvio-private-owner-setup.html');
if(fs.existsSync(destination))throw new Error('A setup page already exists. Reuse it; do not silently rotate the key.');
const token=randomBytes(32).toString('hex');
const endpoint='https://svqhlotlzgmwjneuphpe.supabase.co/functions/v1/karvio-api';
const html=`<!doctype html><html lang="bn"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Karvio — প্রথম Administrator</title>
<style>body{font:17px system-ui;background:#101b22;color:#edf3f6;margin:0;padding:32px}main{max-width:530px;margin:auto}label{display:block;margin-top:20px}input,button{box-sizing:border-box;width:100%;padding:12px;border-radius:7px;font:inherit}input{margin-top:7px;border:1px solid #637784}button{margin-top:24px;background:#30cc94;border:0;cursor:pointer}#message{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#c7d2d9}code{overflow-wrap:anywhere}</style>
<main><h1>Karvio সেটআপ</h1><p>নতুন খালি database-এর Administrator account তৈরি করুন। Username হবে <b>admin</b>। নিজের পাসওয়ার্ড এখানেই লিখুন; চ্যাটে পাঠাবেন না।</p>
<p><small>এই পাতাটি ব্যক্তিগত। কাউকে পাঠাবেন না। এটি শুধু Karvio project-এর সঙ্গে যোগাযোগ করে।</small></p>
<form id="form"><label>আপনার নাম<input id="name" required maxlength="100" autocomplete="name"></label><label>নতুন পাসওয়ার্ড (কমপক্ষে ১২ অক্ষর)<input id="password" type="password" required minlength="12" autocomplete="new-password"></label><label>পাসওয়ার্ড আবার লিখুন<input id="confirm" type="password" required minlength="12" autocomplete="new-password"></label><button id="button">Administrator account তৈরি করুন</button></form><p id="message" role="status"></p>
<details><summary>ERP-এর API ঠিকানা</summary><p>ERP-তে Change API connection থেকে এই ঠিকানাটি দিন:</p><code>${endpoint}</code></details></main>
<script type="module">
const endpoint=${JSON.stringify(endpoint)},setupKey=${JSON.stringify(token)};
const form=document.querySelector('#form'),message=document.querySelector('#message'),button=document.querySelector('#button');
const check=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'ping'})}).then(r=>r.json()).catch(()=>null);
if(check?.ok&&!check.data.requiresSetup){form.hidden=true;message.textContent='Administrator account আগে থেকেই তৈরি হয়েছে। ERP-তে admin username ও নিজের পাসওয়ার্ড দিয়ে login করুন।';}
form.addEventListener('submit',async e=>{e.preventDefault();const password=document.querySelector('#password'),confirm=document.querySelector('#confirm');if(password.value!==confirm.value){message.textContent='দুটি পাসওয়ার্ড মিলছে না।';return;}button.disabled=true;message.textContent='Account তৈরি হচ্ছে…';try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'owner.initialize',payload:{name:document.querySelector('#name').value,password:password.value,setup_key:setupKey}})});const result=await response.json();if(!result.ok)throw Error(result.error);password.value='';confirm.value='';form.hidden=true;message.textContent='Administrator account তৈরি হয়েছে। Username: admin। এখন ERP-তে নিজের পাসওয়ার্ড দিয়ে login করতে পারবেন।';}catch(error){message.textContent=error.message+' Account তৈরি হয়েছে কি না ERP-তে login করে যাচাই করুন।';}button.disabled=false;});
</script></html>`;
fs.writeFileSync(destination,html,{mode:0o600});
// Only the hash is returned for provisioning; the usable key stays in the local page.
console.log(JSON.stringify({setupHash:createHash('sha256').update(token).digest('hex')}));
