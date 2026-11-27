import { clearShopDrafts, shopStorageKey } from '../lib/shopStorage';
import {downloadStreamBackup,inspectStreamingBackup,isStreamingBackup,restoreStreamBackup} from '../lib/backupStream';
import { restoreBackup } from '../lib/restoreBackup';
// Settings → Database (Administrator account only): overview, full backup download, restore from a backup file.
import { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { api, isOffline } from '../lib/api';
import { fdatetime, today } from '../lib/format';
import { Btn, Field, useAction, useApi, Loading, ErrorBox } from './ui';

export const BACKUP_FORMAT = 'Karvio database backup';
const RESTORE_WORD = 'RESTORE';
const label = (name) => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^(\w)(.*)$/, (m, a, b) => a + b.toLowerCase());
const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const daysSince = (ts) => (ts ? Math.floor((Date.now() - new Date(ts.replace(' ', 'T') + '+06:00').getTime()) / 864e5) : null);
const MAIN = ['Products', 'Customers', 'Suppliers', 'Sales', 'Purchases', 'SalesReturns', 'Expenses', 'Users'];

/** Same checksum as the server: SHA-256 of "karvio-backup-v1|" + JSON of the tables, in hex. */
export async function backupChecksum(tables) {
  if (!globalThis.crypto?.subtle) return null;
  const bytes = new TextEncoder().encode(`karvio-backup-v1|${JSON.stringify(tables)}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}


export function DatabaseOverview({ info }) {
  if (info.loading && !info.data) return <div className="card"><Loading label="Reading the database" /></div>;
  if (!info.data) return <ErrorBox error={info.error} onRetry={info.reload} />;
  const d = info.data, age = daysSince(d.last_backup);
  const shown = [...MAIN.map((n) => d.tables.find((t) => t.name === n)).filter(Boolean), ...d.tables.filter((t) => !MAIN.includes(t.name))];
  return (
    <div className="card db-overview">
      <div className="card-head"><h2>Database</h2><span className="muted">{d.offline ? 'Saved on this computer' : d.backend === 'supabase' ? 'Supabase (online database)' : 'Google Sheets'} · {d.total.toLocaleString('en-IN')} records in {d.tables.length} tables</span></div>
      <div className="db-stamps">
        <div className={`db-stamp ${age === null || age > 7 ? 'warn' : 'ok'}`}>
          <span>{d.backend === 'supabase' ? 'Last backup export' : 'Last backup'}</span>
          <b>{d.last_backup ? fdatetime(d.last_backup) : 'Never'}</b>
          <small>{age === null ? 'Download a backup and keep it safe.' : age === 0 ? 'Today' : `${age} day${age === 1 ? '' : 's'} ago${age > 7 ? ' — time for a new backup' : ''}`}</small>
        </div>
        {d.backend === 'supabase' && <div className="db-stamp"><span>Scheduled backups</span><b>Off</b><small>Backup exports are available in this tab.</small></div>}
        <div className="db-stamp"><span>Last restore</span><b>{d.last_restore ? fdatetime(d.last_restore) : '—'}</b><small>{d.last_restore ? 'Data was loaded from a backup file' : 'Not restored yet'}</small></div>
      </div>
      <div className="db-tables">
        {shown.map((t) => <div key={t.name} className={MAIN.includes(t.name) ? 'db-main' : ''}><span>{label(t.name)}</span><b>{t.rows.toLocaleString('en-IN')}</b></div>)}
      </div>
    </div>
  );
}

export function DatabaseBackup({ onDone }) {
  const [busy, run] = useAction();
  const [saved, setSaved] = useState(null);
  const [progress,setProgress]=useState('');
  const bounded=useStore(s=>!!s.apiCapabilities?.boundedBackup);
  const streamed=async()=>{
    let result;try{result=await run(()=>downloadStreamBackup({call:api,progress:setProgress,date:today()}));}catch{return;}
    setSaved({name:result.name,size:result.bytes||0,records:result.records});setProgress('Backup saved and verified');onDone?.();
  };
  const download = async () => {
    let b; try { b = await run(() => api('database.export', {})); } catch { return; } // the error is already shown
    const text = JSON.stringify(b);
    const stamp = b.created_at.slice(0, 16).replace('T', '-').replace(':', '');
    const shop = (b.shop_name || 'shop').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shop';
    const name = `Karvio-backup-${shop}-${stamp}.json`;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    const records = Object.values(b.counts).reduce((x, y) => x + y, 0);
    setSaved({ name, size: text.length, records });
    useStore.getState().toast('Backup downloaded');
    onDone?.();
  };
  return (
    <div className="card form db-card">
<div className="wide db-card-head"><span className="db-ic ok" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 17v3h16v-3" /></svg></span><h2>Export Backup</h2></div>
      {saved && <div className="wide note reset-done" role="status"><b>Saved:</b> {saved.name} · {size(saved.size)} · {saved.records.toLocaleString('en-IN')} records</div>}
      {progress&&<p className="wide muted" role="status">{progress}</p>}
      <div className="wide row end db-card-foot">
        <Btn kind="primary" busy={busy} onClick={bounded?streamed:download}>Download Backup</Btn>
      </div>
    </div>
  );
}

export function DatabaseRestore({ onDone }) {
  const bounded=useStore(s=>!!s.apiCapabilities?.boundedBackup);
  const [file, setFile] = useState(null); // { name, size, text, meta, verified, error }
  const [f, setF] = useState({ password: '', confirm: '' });
  const [done, setDone] = useState(null);
  const [progress, setProgress] = useState('');
  const [busy, run] = useAction();
  const input = useRef();
  const offline = isOffline();

  const pick = async (picked) => {
    setDone(null);
    if (!picked) return;
    if(isStreamingBackup(picked)){
      if(!bounded){setFile({name:picked.name,size:picked.size,error:'Update the Karvio backend before restoring a streamed backup.'});return;}
      try{const header=await inspectStreamingBackup(picked);setFile({name:picked.name,size:picked.size,source:picked,streamed:true,verified:null,meta:{shop:header.shop_name,created:header.created_at,version:header.app_version,counts:Object.fromEntries(header.tables.map(t=>[t.name,t.rows]))}});}
      catch(error){setFile({name:picked.name,size:picked.size,error:error.message});}return;
    }
    if(picked.size>16*1048576){setFile({name:picked.name,size:picked.size,error:'Legacy JSON restore supports up to 16 MiB. For larger databases use a streamed backup or native PostgreSQL recovery.'});return;}
    const text = await picked.text();
    let meta = null, error = '', verified = null;
    try {
      const b = JSON.parse(text);
      if (b?.format !== BACKUP_FORMAT || !b.tables) error = 'This is not a Karvio database backup file.';
      else {
        meta = { shop: b.shop_name, created: b.created_at, by: b.created_by, version: b.app_version, counts: b.counts || {} };
        const sum = await backupChecksum(b.tables);
        verified = sum === null ? null : sum === b.checksum;
        if (verified === false) error = 'This file is damaged or was edited — it cannot be restored.';
      }
    } catch { error = 'This is not a Karvio database backup file.'; }
    setFile({ name: picked.name, size: picked.size, text, meta, verified, error });
  };
  const ready = file && !file.error && f.password && f.confirm.trim() === RESTORE_WORD;
  const restore = async () => {
    if (!ready) return;
    let r; try { r = await run(() => file.streamed?restoreStreamBackup(file.source,{call:api,credentials:f,key:shopStorageKey('erp_stream_restore'),progress:setProgress}):restoreBackup(file.text, f, setProgress)); } catch { return; }
    if (!clearShopDrafts()) useStore.getState().toast('Database changed, but saved carts could not be cleared. Clear this site’s saved data before opening POS.', 'err');
    setF({ password: '', confirm: '' }); setFile(null); if (input.current) input.current.value = '';
    if (r.signed_out) {
      await useStore.getState().logout();
      useStore.getState().toast('Database restored. Sign in with the Administrator password from the backup.');
      return;
    }
    setDone(r);
    useStore.getState().toast('Database restored from the backup');
    await useStore.getState().refresh('all').catch(() => {});
    onDone?.();
  };
  const m = file?.meta;
  return (
    <div className="card form db-card">
<div className="wide db-card-head"><span className="db-ic aqua" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M4 17v3h16v-3" /></svg></span><h2>Import Backup</h2></div>
      {busy && progress && <p className="wide muted" role="status">{progress}</p>}
      {done && <div className="wide note reset-done" role="status">
        <b>Restored</b> the backup of {done.shop_name || 'the shop'} made {fdatetime(done.backup_created_at)}.{' '}
        {done.safety ? <>The data from before the restore was saved as <b>{done.safety.name}</b>{done.safety.url ? <> (<a href={done.safety.url} target="_blank" rel="noreferrer">open the copy</a>)</> : null}.</> : offline ? 'The data from before the restore is kept in the data folder on this computer.' : null}
      </div>}
      <input ref={input} type="file" hidden accept=".json,.jsonl,.gz,application/json,application/gzip" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} aria-label="Backup file" />
      <div className={`wide row end ${file ? '' : 'db-card-foot'}`}>
        {file && <span className="muted">{file.name} · {size(file.size)}</span>}
        {file && <span className="spacer" />}
        <Btn kind={file?.meta && !file.error ? undefined : 'primary'} busy={busy} onClick={() => input.current?.click()}>{file ? 'Choose another file' : 'Upload Backup'}</Btn>
      </div>
      {file?.error && <div className="wide errbox" role="alert">{file.error}</div>}
      {m && !file.error && <div className="wide db-preview">
        <div className="db-preview-head">
          <div><b>{m.shop || 'Shop'}</b><small>Backup made {fdatetime(m.created)}{m.by ? ` by ${m.by}` : ''}{m.version ? ` · Karvio ${m.version}` : ''}</small></div>
          <span className={`db-badge ${file.verified ? 'ok' : ''}`}>{file.verified ? '✓ File verified' : 'Checked on restore'}</span>
        </div>
        <div className="db-tables">{MAIN.filter((n) => m.counts[n] !== undefined).map((n) => <div key={n} className="db-main"><span>{label(n)}</span><b>{Number(m.counts[n]).toLocaleString('en-IN')}</b></div>)}</div>
      </div>}
      {m && !file.error && <>
        <Field label="Administrator password" wide><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" /></Field>
        <Field label={`Type ${RESTORE_WORD} to confirm`} wide><input value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} placeholder={RESTORE_WORD} autoComplete="off" autoCapitalize="characters" spellCheck={false} /></Field>
        <div className="wide row end"><Btn kind="danger" busy={busy} disabled={!ready} onClick={restore}>Restore database</Btn></div>
      </>}
    </div>
  );
}

/** The whole Database tab. `Reset` is the existing reset card. */
export function DatabaseTab({ Reset }) {
  const info = useApi('database.info', {});
  const changed=()=>info.reload();
  return (
    <div className="db-tab">
      <DatabaseOverview info={info} />
      {/* Backup, Import and Reset side by side: one row of three cards (stacked on narrow screens). */}
      <div className="db-grid three">
        <DatabaseBackup onDone={changed} />
        <DatabaseRestore onDone={changed} />
        <Reset onDone={info.reload} />
      </div>
    </div>
  );
}
