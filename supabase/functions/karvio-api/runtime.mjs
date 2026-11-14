import { createHash, randomUUID, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createEngine } from './engine.mjs';
import schema from './schema.json' with { type: 'json' };
import {boundedBackup} from './transfers.mjs';
const clone = x => JSON.parse(JSON.stringify(x));
export const hash = text => createHash('sha256').update(String(text)).digest('hex');
function formatDate(date, timezone = 'Asia/Dhaka', format = 'yyyy-MM-dd') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
  const day = `${p.year}-${p.month}-${p.day}`;
  return format === 'yyyy-MM-dd' ? day : `${day}T${p.hour}:${p.minute}:${p.second}`;
}
export function createRuntime(snapshot, {deltaOnly=false}={}) {
  const state = {sheets:{},properties:clone(snapshot.metadata.properties || {})};
  const cache = clone(snapshot.metadata.cache || {});
  const now = Date.now(); for (const k of Object.keys(cache)) if (cache[k].until <= now) delete cache[k];
  const originalPositions={},nextPositions={};
  for (const [name, cols] of Object.entries(schema)) {
    const rows = [cols.map(c=>c.key)];
    originalPositions[name]=new Map();nextPositions[name]=Number(snapshot.tablePositions?.[name]||1);
    for (const record of snapshot.tables[name] || []) {
      const pos = Number(record._position);
      if (!Number.isSafeInteger(pos) || pos < 2 || pos > 2000000) throw new Error('Invalid stored row position');
      const cells=cols.map(c=>record[c.key] ?? '');
      if(snapshot.compactRows){rows.push(cells);originalPositions[name].set(String(cells[0]),pos);}
      else{while(rows.length < pos) rows.push([]);rows[pos-1]=cells;}
      nextPositions[name]=Math.max(nextPositions[name],pos);
    }
    state.sheets[name] = {rows,columns:cols.length};
  }
  // Private sheets (journal, request receipts, quotation links): stored as rows when the database
  // supports it (snapshot.privateRows), otherwise inside the runtime JSON as before.
  const privateRows=snapshot.privateRows===true;
  const privateNames=new Set(privateRows?snapshot.privateNames||[]:[]), privateLoaded=new Set(), privateCreated=new Set();
  if(privateRows){
    for(const [name,sheet] of Object.entries(snapshot.privateSheets||{})){
      if(Object.hasOwn(schema,name)||!/^__Karvio[A-Za-z]{1,60}$/.test(name))throw new Error('Invalid private sheet');
      const rows=[];
      for(const [pos,cells] of sheet.rows||[]){
        if(!Number.isSafeInteger(pos)||pos<1||pos>2000000||!Array.isArray(cells))throw new Error('Invalid private row');
        while(rows.length<pos)rows.push([]);rows[pos-1]=cells;
      }
      state.sheets[name]={rows,columns:Number(sheet.columns)||1};privateLoaded.add(name);
    }
  } else Object.assign(state.sheets, clone(snapshot.metadata.privateSheets || {}));
  // Rows returned by getValues are copies. Keep an immutable baseline and copy
  // only the table's row array / individual rows when a write actually occurs.
  const before = {sheets:{...state.sheets},properties:clone(state.properties)};
  const dirty = new Set();
  const resetTables=new Set();
  function editSheet(name) {
    if(!dirty.has(name)) {
      state.sheets[name]={...state.sheets[name],rows:state.sheets[name].rows.slice()};
      dirty.add(name);
    }
    return state.sheets[name];
  }
  let backupReason = null; let outbox=[];
  class Range {
    constructor(sheet,row,column,height=1,width=1) {
      if (![row,column,height,width].every(n=>Number.isInteger(n)&&n>0) || row+height>2000001 || width>1000) throw new Error('Invalid table range');
      Object.assign(this,{sheet,row,column,height,width});
    }
    getValues() { return Array.from({length:this.height},(_,r)=>Array.from({length:this.width},(_,c)=>this.sheet.data.rows[this.row-1+r]?.[this.column-1+c] ?? '')); }
    setValues(values) {
      if(values.length!==this.height||values.some(r=>r.length!==this.width)) throw new Error('Table size mismatch');
      const data=editSheet(this.sheet.name);
      values.forEach((cells,r)=>{const i=this.row-1+r; while(data.rows.length<=i)data.rows.push([]);data.rows[i]=data.rows[i].slice();cells.forEach((v,c)=>{data.rows[i][this.column-1+c]=v;});});
      data.columns=Math.max(data.columns||0,this.column-1+this.width);return this;
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
    insertColumnsAfter(after,count){const d=editSheet(this.name);d.rows=d.rows.map(row=>{const r=row.slice();while(r.length<after)r.push('');r.splice(after,0,...Array(count).fill(''));return r;});d.columns=after+count;return this;}
    setFrozenRows(){} hideSheet(){return this;} clearContents(){editSheet(this.name).rows=[];resetTables.add(this.name);return this;}
    getDataRange(){return this.getRange(1,1,Math.max(1,this.getLastRow()),this.getMaxColumns());}
    appendRow(cells){this.getRange(this.getLastRow()+1,1,1,cells.length).setValues([cells]);}
    deleteRow(row){editSheet(this.name).rows.splice(row-1,1);} deleteRows(row,count=1){editSheet(this.name).rows.splice(row-1,count);return this;}
  }
  // Business tables the engine opened, and the ones it needed but this snapshot did not load.
  // The gateway re-runs a request with a missing table loaded, so a narrow read can never change a result.
  const touched=new Set(), missing=new Set();
  const loaded=snapshot.loadedTables?new Set(snapshot.loadedTables):null;
  const book={getId:()=> 'KARVIO_POSTGRES',getSheetByName:name=>{
    if(Object.hasOwn(schema,name)){
      touched.add(name);
      if(loaded && !loaded.has(name)){missing.add(name);throw new Error('Action requires an unloaded table: '+name);}
    } else {
      touched.add('#'+name);
      // An existing private sheet that this read did not load ('#' marks private sheets).
      if(privateRows && privateNames.has(name) && !privateLoaded.has(name) && !privateCreated.has(name)){missing.add('#'+name);throw new Error('Action requires an unloaded table: '+name);}
    }
    return Object.hasOwn(state.sheets,name)?new Sheet(name):null;
  },
    insertSheet(name){if(Object.hasOwn(state.sheets,name)||['__proto__','constructor','prototype'].includes(name))throw new Error('Invalid table');if(privateRows&&!Object.hasOwn(schema,name)){if(privateNames.has(name))throw new Error('Invalid table');privateCreated.add(name);}state.sheets[name]={rows:[],columns:1};return new Sheet(name);},
    getSheets:()=>{if(loaded)for(const n of Object.keys(schema))if(!loaded.has(n))missing.add(n);for(const n of Object.keys(schema))touched.add(n);return Object.keys(state.sheets).map(n=>new Sheet(n));},deleteSheet:sheet=>{delete state.sheets[sheet.name];},setSpreadsheetTimeZone(){}};
  const security={
    backupCapabilities:boundedBackup,
    readMetrics:snapshot.readMetrics,
    textBytes:text=>Buffer.byteLength(text,'utf8'),
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
    if(!response.ok){state.sheets=before.sheets;state.properties=before.properties;backupReason=null;outbox=[];dirty.clear();resetTables.clear();}
    const changes={},delta={};
    for(const [name,cols] of Object.entries(schema)) {
      if(!dirty.has(name))continue;
      const rows=state.sheets[name].rows;
      const oldRows=before.sheets[name].rows;
      if(!deltaOnly && JSON.stringify(rows)===JSON.stringify(oldRows))continue;
      const seen=new Set();
      const oldById=snapshot.compactRows?new Map(oldRows.slice(1).map(r=>[String(r[0]),r])):null;
      const removed=new Set(oldRows.slice(1).filter(r=>r[0]!==''&&r[0]!=null).map(r=>String(r[0])));
      const records=rows.slice(1).flatMap((row,i)=>{
        if(!row.some(v=>v!==''&&v!=null))return [];
        const id=String(row[0]??'');if(!id||seen.has(id))throw new Error('Duplicate or missing record identifier');seen.add(id);removed.delete(id);
        const previous=snapshot.compactRows?oldById.get(id):oldRows[i+1];
        if(deltaOnly && !resetTables.has(name) && (row===previous || JSON.stringify(row)===JSON.stringify(previous)))return [];
        const position=snapshot.compactRows&&!resetTables.has(name)?(originalPositions[name].get(id)||++nextPositions[name]):i+2;
        if(position>2000000)throw new Error('Table row-position budget exceeded');
        const record={_position:position};
        cols.forEach((c,j)=>{let v=row[j]??'';if(c.type==='n'){v=Number(v);if(!Number.isFinite(v))throw new Error('Invalid numeric value');}else if(c.type==='b')v=v===true||String(v).toLowerCase()==='true';else v=String(v);record[c.key]=v;});
        return [record];
      });
      if(deltaOnly){if(records.length||removed.size)delta[name]={upsert:records,remove:[...removed]};}
      else changes[name]=records;
    }
    const touchedList=[...touched].sort(), missingList=[...missing].sort();
    if(privateRows){
      // Only the private rows that changed: [position, cells] to write, positions to clear.
      const blank=r=>!Array.isArray(r)||!r.some(v=>v!==''&&v!=null);
      const privateDelta={};
      for(const name of Object.keys(state.sheets)){
        if(Object.hasOwn(schema,name))continue;
        const created=!response.ok?false:privateCreated.has(name);
        if(!dirty.has(name)&&!created)continue;
        const rows=state.sheets[name].rows, old=before.sheets[name]?.rows||[], upsert=[], remove=[];
        for(let i=0;i<Math.max(rows.length,old.length);i++){
          const now=rows[i]||[], was=old[i]||[];
          if(blank(now)){if(!blank(was))remove.push(i+1);}
          else if(now!==was&&JSON.stringify(now)!==JSON.stringify(was))upsert.push([i+1,now]);
        }
        const columns=Math.max(1,Math.min(1000,Number(state.sheets[name].columns)||1));
        if(upsert.length||remove.length||created||columns!==(Number(before.sheets[name]?.columns)||1))privateDelta[name]={columns,upsert,remove};
      }
      return {response,changes,delta,privateDelta,metadata:{properties:state.properties,cache},outbox,backupReason,touched:touchedList,missing:missingList};
    }
    const privateSheets=Object.fromEntries(Object.entries(state.sheets).filter(([name])=>!Object.hasOwn(schema,name)));
    return {response,changes,delta,metadata:{properties:state.properties,cache,privateSheets},outbox,backupReason,touched:touchedList,missing:missingList};
  }
  return {
    // Trusted offline administration helper. No HTTP route invokes this method;
    // callers must already possess a complete private database snapshot. Writes
    // to this ephemeral runtime are discarded; live database is never mutated.
    exportBackup(){return engine.exportBackup();},
    execute(request){return finish(JSON.parse(engine.doPost({postData:{contents:JSON.stringify(request)}}).getContent()));},
    initialize(payload){try{return finish({ok:true,data:engine.initialize(payload)});}catch(e){return finish({ok:false,error:e.message});}}
  };
}
