import {useState} from 'react';
import {Btn} from './ui';
import {readFields,writeFields,SMS_VALUES} from '../lib/smsGateway';
export default function SmsFieldBuilder({body,type,onChange}) {
 const [rows,setRows]=useState(()=>readFields(body,type));
 if(!rows)return <p className="muted wide">This request uses a custom format. Edit it under Advanced request settings.</p>;
 const update=next=>{
  setRows(next);
  const names=next.map(r=>r.name.trim()).filter(Boolean);
  const duplicate=type==='json'&&new Set(names).size!==names.length;
  onChange(writeFields(next,type),duplicate?'Each JSON field name must be unique.':'');
 };
 const change=(i,patch)=>update(rows.map((r,j)=>i===j?{...r,...patch}:r));
 return <div className="wide sms-mapping">
  <h3>Request fields</h3><p className="muted">Copy the field names from your provider’s API guide, then choose what Karvio should put in each field. No code is needed for a simple request.</p>
  {rows.map((r,i)=><div className="sms-field-row" key={i}>
   <input aria-label={`Gateway field ${i+1}`} placeholder="Provider field, e.g. mobile" value={r.name} onChange={e=>change(i,{name:e.target.value})} />
   <select aria-label={`Gateway value ${i+1}`} value={SMS_VALUES[r.value]?r.value:'custom'} onChange={e=>change(i,{value:e.target.value==='custom'?'':e.target.value})}>
    {Object.entries(SMS_VALUES).map(([value,label])=><option key={value} value={value}>{label}</option>)}<option value="custom">Fixed value</option>
   </select>
   {!SMS_VALUES[r.value]&&<input aria-label={`Fixed value ${i+1}`} placeholder="Value from provider" value={r.value} onChange={e=>change(i,{value:e.target.value})} />}
   <button type="button" className="act-btn act-delete act-icon" title="Remove field" aria-label={`Remove gateway field ${i+1}`} onClick={()=>update(rows.filter((_,j)=>i!==j))}>×</button>
  </div>)}
  <Btn size="sm" onClick={()=>update([...rows,{name:'',value:'{number}'}])}>Add field</Btn>
 </div>;
}
