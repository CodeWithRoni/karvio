import { createHash, randomUUID, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createEngine } from './engine.mjs';
import schema from './schema.json' with { type: 'json' };
const clone = x => JSON.parse(JSON.stringify(x));
export const hash = text => createHash('sha256').update(String(text)).digest('hex');
function formatDate(date, timezone = 'Asia/Dhaka', format = 'yyyy-MM-dd') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
  const day = `${p.year}-${p.month}-${p.day}`;
  return format === 'yyyy-MM-dd' ? day : `${day}T${p.hour}:${p.minute}:${p.second}`;
}
export function createRuntime(snapshot) {
  const state = {sheets:{},properties:clone(snapshot.metadata.properties || {})};
  const cache = clone(snapshot.metadata.cache || {});
  const now = Date.now(); for (const k of Object.keys(cache)) if (cache[k].until <= now) delete cache[k];
  for (const [name, cols] of Object.entries(schema)) {
    const rows = [cols.map(c=>c.key)];
    for (const record of snapshot.tables[name] || []) {
      const pos = Number(record._position);
      if (!Number.isSafeInteger(pos) || pos < 2 || pos > 2000000) throw new Error('Invalid stored row position');
      while(rows.length < pos) rows.push([]);
      rows[pos-1] = cols.map(c=>record[c.key] ?? '');
    }
    state.sheets[name] = {rows,columns:cols.length};
  }
  Object.assign(state.sheets, clone(snapshot.metadata.privateSheets || {}));
  const before = clone(state);
  let backupReason = null; let outbox=[];
  class Range {
    constructor(sheet,row,column,height=1,width=1) {
      if (![row,column,height,width].every(n=>Number.isInteger(n)&&n>0) || row+height>2000001 || width>1000) throw new Error('Invalid table range');
      Object.assign(this,{sheet,row,column,height,width});
    }
    getValues() { return Array.from({length:this.height},(_,r)=>Array.from({length:this.width},(_,c)=>this.sheet.data.rows[this.row-1+r]?.[this.column-1+c] ?? '')); }
    setValues(values) {
      if(values.length!==this.height||values.some(r=>r.length!==this.width)) throw new Error('Table size mismatch');
      values.forEach((cells,r)=>{const i=this.row-1+r; while(this.sheet.data.rows.length<=i)this.sheet.data.rows.push([]);cells.forEach((v,c)=>{this.sheet.data.rows[i][this.column-1+c]=v;});});
      this.sheet.data.columns=Math.max(this.sheet.data.columns||0,this.column-1+this.width);return this;
    }
    setValue(v){return this.setValues([[v]]);}
    clearContent(){return this.setValues(Array.from({length:this.height},()=>Array(this.width).fill('')));}
    setFontWeight(){return this;} setBackground(){return this;} setNumberFormat(){return this;}
  }
  class Sheet {
    constructor(name){this.name=name;}
    get data(){return state.sheets[this.name];}
    getName(){return this.name;} getRange(...args){return new Range(this,...args);}
    getLastRow(){let n=this.data.rows.length;while(n&&!this.data.rows[n-1].some(v=>v!==''&&v!=null))n--;return n;}
    getMaxRows(){return Math.max(1000,this.data.rows.length);}
    getMaxColumns(){return this.data.rows.reduce((m,r)=>Math.max(m,r.length),Math.max(this.data.columns||0,1));}
    insertColumnsAfter(after,count){this.data.rows.forEach(r=>{while(r.length<after)r.push('');r.splice(after,0,...Array(count).fill(''));});this.data.columns=after+count;return this;}
    setFrozenRows(){} hideSheet(){return this;} clearContents(){this.data.rows=[];return this;}
    getDataRange(){return this.getRange(1,1,Math.max(1,this.getLastRow()),this.getMaxColumns());}
    appendRow(cells){this.getRange(this.getLastRow()+1,1,1,cells.length).setValues([cells]);}
    deleteRow(row){this.data.rows.splice(row-1,1);} deleteRows(row,count=1){this.data.rows.splice(row-1,count);return this;}
  }
  const book={getId:()=> 'KARVIO_POSTGRES',getSheetByName:name=>Object.hasOwn(state.sheets,name)?new Sheet(name):null,
    insertSheet(name){if(Object.hasOwn(state.sheets,name)||['__proto__','constructor','prototype'].includes(name))throw new Error('Invalid table');state.sheets[name]={rows:[],columns:1};return new Sheet(name);},
    getSheets:()=>Object.keys(state.sheets).map(n=>new Sheet(n)),deleteSheet:sheet=>{delete state.sheets[sheet.name];},setSpreadsheetTimeZone(){}};
  const security={
    passwordHash:(salt,pw)=>'pbkdf2$600000$'+pbkdf2Sync(pw,salt,600000,32,'sha256').toString('hex'),
    passwordCheck(user,pw){
      const m=/^pbkdf2\$(600000)\$([a-f0-9]{64})$/.exec(String(user.password_hash));
      if(!m)return false;
      return timingSafeEqual(Buffer.from(m[2],'hex'),pbkdf2Sync(pw,String(user.salt),Number(m[1]),32,'sha256'));
    },
    backup:reason=>{backupReason=String(reason);}, queueSms:job=>outbox.push(job)
  };
  const engine=createEngine({
    SpreadsheetApp:{getActiveSpreadsheet:()=>book,openById:()=>book,flush(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>state.properties[key]??null,setProperty:(key,value)=>{state.properties[key]=value;}})},
    CacheService:{getScriptCache:()=>({get:key=>{const v=cache[key];return v&&v.until>Date.now()?v.text:null;},put:(key,text,seconds)=>{cache[key]={text,until:Date.now()+seconds*1000};},remove:key=>{delete cache[key];}})},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},Session:{getScriptTimeZone:()=> 'Asia/Dhaka'},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType(){return this;},getContent:()=>text})},
    UrlFetchApp:{fetch(){throw new Error('SMS dispatcher is not configured');}},
    Utilities:{getUuid:randomUUID,DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,text)=>Array.from(createHash('sha256').update(String(text)).digest()).map(b=>b>127?b-256:b),formatDate}
  },security);
  function finish(response) {
    if(!response.ok){state.sheets=before.sheets;state.properties=before.properties;backupReason=null;outbox=[];}
    const changes={};
    for(const [name,cols] of Object.entries(schema)) {
      const rows=state.sheets[name].rows;
      if(JSON.stringify(rows)===JSON.stringify(before.sheets[name].rows))continue;
      const seen=new Set();
      changes[name]=rows.slice(1).flatMap((row,i)=>{
        if(!row.some(v=>v!==''&&v!=null))return [];
        const record={_position:i+2};
        cols.forEach((c,j)=>{let v=row[j]??'';if(c.type==='n'){v=Number(v);if(!Number.isFinite(v))throw new Error('Invalid numeric value');}else if(c.type==='b')v=v===true||String(v).toLowerCase()==='true';else v=String(v);record[c.key]=v;});
        const id=record[name==='Settings'?'key':'id'];if(!id||seen.has(id))throw new Error('Duplicate or missing record identifier');seen.add(id);
        return [record];
      });
    }
    const privateSheets=Object.fromEntries(Object.entries(state.sheets).filter(([name])=>!Object.hasOwn(schema,name)));
    return {response,changes,metadata:{properties:state.properties,cache,privateSheets},outbox,backupReason};
  }
  return {
    execute(request){return finish(JSON.parse(engine.doPost({postData:{contents:JSON.stringify(request)}}).getContent()));},
    initialize(payload){try{return finish({ok:true,data:engine.initialize(payload)});}catch(e){return finish({ok:false,error:e.message});}}
  };
}
