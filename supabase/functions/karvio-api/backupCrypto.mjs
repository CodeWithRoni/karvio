// Backup encryption with one server secret (KARVIO_BACKUP_KEY). Each backup gets its own key, derived from
// the secret and the backup's job ID (HKDF-SHA256). Every page is gzip-compressed, then sealed with AES-256-GCM.
// The page's table name and its plain SHA-256 are bound to the seal, so a page cannot be moved or swapped.
import {createCipheriv,createDecipheriv,createHash,hkdfSync,randomBytes} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

export const PAGE_PREFIX='kvenc1:';
const ALG='AES-256-GCM';
const sha=s=>createHash('sha256').update(s).digest('hex');
const fail=message=>{throw new Error('BACKUP: '+message);};

/** A usable secret: at least 32 characters. Anything shorter is treated as not set. */
export function backupSecret(value){return typeof value==='string'&&value.trim().length>=32?value.trim():'';}
/** A short public fingerprint of the secret, written into every backup so a wrong key is named clearly. */
export const keyId=secret=>sha('karvio-backup-key-id|'+secret).slice(0,16);
function derive(secret,salt,purpose){return Buffer.from(hkdfSync('sha256',Buffer.from(secret,'utf8'),Buffer.from(String(salt),'utf8'),Buffer.from(purpose,'utf8'),32));}
const pageAad=(salt,table,plainSha)=>Buffer.from(`karvio-backup-page|${salt}|${table}|${plainSha}`,'utf8');

/** The header block stored in the backup's manifest. */
export function encryptionHeader(secret,salt){return {alg:ALG,compression:'gzip',kdf:'HKDF-SHA256',version:1,salt:String(salt),key_id:keyId(secret)};}

/** Check a manifest's encryption block against this server's key. Returns the block, or null for a plain backup. */
export function checkHeader(secret,header){
 const e=header&&header.encryption;
 if(e===undefined||e===null)return null;
 if(typeof e!=='object'||e.alg!==ALG||e.version!==1||typeof e.salt!=='string'||!e.salt||e.salt.length>200||typeof e.key_id!=='string')fail('Unsupported backup encryption');
 if(!secret)fail('This backup is encrypted, but the server backup key (KARVIO_BACKUP_KEY) is not set');
 if(e.key_id!==keyId(secret))fail('This backup was encrypted with a different backup key. Set the original KARVIO_BACKUP_KEY to restore it');
 return e;
}

export function sealPage(secret,salt,table,payload){
 const plainSha=sha(payload),iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',derive(secret,salt,'karvio-backup-v1'),iv);cipher.setAAD(pageAad(salt,table,plainSha));
 const body=Buffer.concat([cipher.update(gzipSync(Buffer.from(payload,'utf8'),{level:6})),cipher.final()]);
 const sealed=PAGE_PREFIX+Buffer.concat([iv,body,cipher.getAuthTag()]).toString('base64');
 return {payload:sealed,sha256:plainSha,enc_sha256:sha(sealed)};
}

export function openPage(secret,salt,table,sealed,plainSha){
 if(typeof sealed!=='string'||!sealed.startsWith(PAGE_PREFIX))fail('Backup page is not encrypted');
 const raw=Buffer.from(sealed.slice(PAGE_PREFIX.length),'base64');
 if(raw.length<12+16+1)fail('Backup page is damaged');
 let plain;
 try{
  const decipher=createDecipheriv('aes-256-gcm',derive(secret,salt,'karvio-backup-v1'),raw.subarray(0,12));
  decipher.setAAD(pageAad(salt,table,String(plainSha)));decipher.setAuthTag(raw.subarray(raw.length-16));
  plain=gunzipSync(Buffer.concat([decipher.update(raw.subarray(12,raw.length-16)),decipher.final()]),{maxOutputLength:8*1048576}).toString('utf8');
 }catch{fail('Backup page could not be decrypted: the file is damaged, was edited or uses another key');}
 if(sha(plain)!==plainSha)fail('Backup page is damaged/out of order');
 return plain;
}

/** Small secrets kept by the server itself (the Google Drive sign-in), sealed with the same backup key. */
export function sealSecret(secret,purpose,value){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',derive(secret,'karvio-secret',purpose),iv);
 const body=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
 return Buffer.concat([iv,body,cipher.getAuthTag()]).toString('base64');
}
export function openSecret(secret,purpose,sealed){
 const raw=Buffer.from(String(sealed||''),'base64');if(raw.length<29)fail('Stored secret is damaged');
 const decipher=createDecipheriv('aes-256-gcm',derive(secret,'karvio-secret',purpose),raw.subarray(0,12));decipher.setAuthTag(raw.subarray(raw.length-16));
 try{return Buffer.concat([decipher.update(raw.subarray(12,raw.length-16)),decipher.final()]).toString('utf8');}catch{fail('Stored secret could not be opened. Was KARVIO_BACKUP_KEY changed? Connect Google Drive again');}
}
