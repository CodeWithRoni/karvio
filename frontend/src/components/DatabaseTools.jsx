import { clearShopDrafts, shopStorageKey } from '../lib/shopStorage';
import {downloadStreamBackup,inspectStreamingBackup,isEncryptedManifest,isStreamingBackup,restoreStreamBackup} from '../lib/backupStream';
import { restoreBackup } from '../lib/restoreBackup';
// Settings → Database (Administrator account only): overview, full backup download, restore from a backup file.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { api, isOffline } from '../lib/api';
import { fdatetime, today } from '../lib/format';
import { Btn, Field, useAction, useApi, useConfirm, Loading, ErrorBox } from './ui';

export const BACKUP_FORMAT = 'Karvio database backup';
const RESTORE_WORD = 'RESTORE';
const label = (name) => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^(\w)(.*)$/, (m, a, b) => a + b.toLowerCase());
const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const daysSince = (ts) => (ts ? Math.floor((Date.now() - new Date(ts.replace(' ', 'T') + '+06:00').getTime()) / 864e5) : null);
/** 14:30 → 2:30 PM (Bangladesh time, as set for the automatic backup). */
export const clock12 = (t = '00:00') => { const [h, m] = String(t).split(':').map(Number); return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const MAIN = ['Products', 'Customers', 'Suppliers', 'Sales', 'Purchases', 'SalesReturns', 'Expenses', 'Users'];

/** Same checksum as the server: SHA-256 of "karvio-backup-v1|" + JSON of the tables, in hex. */
export async function backupChecksum(tables) {
  if (!globalThis.crypto?.subtle) return null;
  const bytes = new TextEncoder().encode(`karvio-backup-v1|${JSON.stringify(tables)}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}


export function DatabaseOverview({ info, drive }) {
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
        {d.backend === 'supabase' && (drive?.connected && !drive.needs_reconnect
          ? <div className={`db-stamp ${drive.last?.status === 'failed' ? 'warn' : 'ok'}`}><span>Scheduled backups</span><b>Google Drive · {clock12(drive.time)} daily</b><small>{drive.last ? (drive.last.status === 'ok' ? `Last saved ${fdatetime(drive.last.at)}` : `Last try failed ${fdatetime(drive.last.at)}`) : `First backup ${fdatetime(drive.next_at)}`}</small></div>
          : <div className="db-stamp"><span>Scheduled backups</span><b>Off</b><small>{drive ? 'Connect Google Drive below for a nightly backup.' : 'Backup exports are available in this tab.'}</small></div>)}
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
    setSaved({name:result.name,size:result.bytes||0,records:result.records,encrypted:result.encrypted});setProgress('Backup saved and verified');onDone?.();
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
      {saved && <div className="wide note reset-done" role="status"><b>Saved:</b> {saved.name} · {size(saved.size)} · {saved.records.toLocaleString('en-IN')} records{saved.encrypted ? ' · 🔒 encrypted' : ''}</div>}
      {saved && saved.encrypted === false && <div className="wide errbox" role="alert">This backup is <b>not encrypted</b>: anyone with the file can read it. Set <code>KARVIO_BACKUP_KEY</code> on the server to encrypt backups.</div>}
      {progress&&<p className="wide muted" role="status">{progress}</p>}
      <div className="wide row end db-card-foot">
        <Btn kind="primary" busy={busy} onClick={bounded?streamed:download}>Download Backup</Btn>
      </div>
    </div>
  );
}

export function DatabaseRestore({ onDone }) {
  const bounded=useStore(s=>!!s.apiCapabilities?.boundedBackup);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [progress, setProgress] = useState('');
  const [busy, run] = useAction();
  const [confirmUI, ask] = useConfirm();
  const input = useRef();
  const offline = isOffline();
  // The signed-in Administrator restores with one confirmation: no password, nothing to type.
  const credentials = { password: '', confirm: RESTORE_WORD };

  /** Read and check the chosen file. Returns { meta, encrypted, streamed, text? } or throws with a clear message. */
  const read = async (picked) => {
    if(isStreamingBackup(picked)){
      if(!bounded)throw Error('Update the Karvio backend before restoring this backup.');
      const header=await inspectStreamingBackup(picked);
      return {streamed:true,encrypted:isEncryptedManifest(header),meta:{shop:header.shop_name,created:header.created_at,version:header.app_version,records:header.total_rows}};
    }
    if(picked.size>16*1048576)throw Error('Older .json backups can be restored up to 16 MB. Use a .karvio backup for a larger shop.');
    const text = await picked.text();
    let b; try { b = JSON.parse(text); } catch { throw Error('This is not a Karvio database backup file.'); }
    if (b?.format !== BACKUP_FORMAT || !b.tables) throw Error('This is not a Karvio database backup file.');
    const sum = await backupChecksum(b.tables);
    if (sum !== null && sum !== b.checksum) throw Error('This file is damaged or was edited — it cannot be restored.');
    return {streamed:false,encrypted:false,text,meta:{shop:b.shop_name,created:b.created_at,by:b.created_by,version:b.app_version,records:Object.values(b.counts||{}).reduce((x,y)=>x+Number(y||0),0)}};
  };
  const pick = async (picked) => {
    setDone(null); setError(''); setProgress('');
    if (!picked) return;
    let file; try { file = await read(picked); } catch (e) { setError(e.message || 'This backup cannot be opened.'); return; }
    const m = file.meta;
    const ok = await ask({ title: 'Restore this backup?', confirmLabel: 'Restore',
      message: <>All current data will be replaced by the backup of <b>{m.shop || 'the shop'}</b> made <b>{fdatetime(m.created)}</b>{m.records ? <> ({Number(m.records).toLocaleString('en-IN')} records)</> : null}. A copy of the current data is kept first.{file.encrypted ? '' : ' This is an older backup that is not encrypted.'}</> });
    if (!ok) return;
    let r; try { r = await run(() => file.streamed?restoreStreamBackup(picked,{call:api,credentials,key:shopStorageKey('erp_stream_restore'),progress:setProgress}):restoreBackup(file.text, credentials, setProgress)); } catch { setProgress(''); return; }
    setProgress('');
    if (!clearShopDrafts()) useStore.getState().toast('Database changed, but saved carts could not be cleared. Clear this site’s saved data before opening POS.', 'err');
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
  return (
    <div className="card form db-card">
<div className="wide db-card-head"><span className="db-ic aqua" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M4 17v3h16v-3" /></svg></span><h2>Import Backup</h2></div>
      {busy && progress && <p className="wide muted" role="status">{progress}</p>}
      {done && <div className="wide note reset-done" role="status">
        <b>Restored</b> the backup of {done.shop_name || 'the shop'} made {fdatetime(done.backup_created_at)}.{' '}
        {done.safety ? <>The data from before the restore was saved as <b>{done.safety.name}</b>{done.safety.url ? <> (<a href={done.safety.url} target="_blank" rel="noreferrer">open the copy</a>)</> : null}.</> : offline ? 'The data from before the restore is kept in the data folder on this computer.' : null}
      </div>}
      <input ref={input} type="file" hidden accept=".karvio,.json,.jsonl,.gz,application/json,application/gzip" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} aria-label="Backup file" />
      {error && <div className="wide errbox" role="alert">{error}</div>}
      <div className="wide row end db-card-foot">
        <Btn kind="primary" busy={busy} onClick={() => input.current?.click()}>Upload Backup</Btn>
      </div>
      {confirmUI}
    </div>
  );
}

/** The whole Database tab. `Reset` is the existing reset card. */
export function DatabaseTab({ Reset }) {
  const info = useApi('database.info', {});
  const driveOn = useStore((s) => !!s.apiCapabilities?.driveBackup);
  const drive = useApi('backup.drive.status', {}, [], { skip: !driveOn });
  const changed=()=>info.reload();
  return (
    <div className="db-tab">
      <DatabaseOverview info={info} drive={driveOn ? drive.data : null} />
      {driveOn && <AutoBackup q={drive} onChanged={() => { drive.reload(); info.reload(); }} />}
      {/* Backup, Import and Reset side by side: one row of three cards (stacked on narrow screens). */}
      <div className="db-grid three">
        <DatabaseBackup onDone={changed} />
        <DatabaseRestore onDone={changed} />
        <Reset onDone={info.reload} />
      </div>
    </div>
  );
}

/** Automatic backup: the owner connects their own Google Drive once; every day at the time they set the server saves an encrypted backup there. */
export function AutoBackup({ q, onChanged }) {
  const d = q.data;
  const [busy, run] = useAction();
  const [waiting, setWaiting] = useState(false);
  const [confirmUI, ask] = useConfirm();
  const [time, setTime] = useState('');
  useEffect(() => { if (d?.time) setTime(d.time); }, [d?.time]);
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);
  // The Google window finishes on the server; check until the account shows up (at most 10 minutes).
  useEffect(() => {
    if (!waiting) return undefined;
    const started = Date.now();
    timer.current = setInterval(async () => {
      try { const s = await api('backup.drive.status', {}); if (s.connected && !s.needs_reconnect) { setWaiting(false); useStore.getState().toast(`Google Drive connected: ${s.email}`); onChanged(); } } catch { /* keep waiting */ }
      if (Date.now() - started > 600000) setWaiting(false);
    }, 2500);
    return () => clearInterval(timer.current);
  }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  const connect = async () => {
    const popup = window.open('', 'karvio-google', 'width=520,height=680');
    let r; try { r = await run(() => api('backup.drive.connect', {})); } catch { popup?.close(); return; }
    if (popup && !popup.closed) popup.location.href = r.url; else window.location.href = r.url;
    setWaiting(true);
  };
  const saveTime = async () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return useStore.getState().toast('Choose a backup time', 'err');
    try { await run(() => api('backup.drive.schedule', { time }), `Daily backup time set to ${clock12(time)}`); } catch { return; }
    onChanged();
  };
  const now = async () => { try { await run(() => api('backup.drive.run', {}), 'Backup saved to Google Drive'); } catch { /* shown */ } onChanged(); };
  const disconnect = async () => {
    if (!(await ask({ title: 'Disconnect Google Drive?', message: 'Nightly backups stop. Backups already in your Google Drive stay there.', confirmLabel: 'Disconnect' }))) return;
    try { await run(() => api('backup.drive.disconnect', {}), 'Google Drive disconnected'); } catch { return; }
    onChanged();
  };
  const last = d?.last;
  return (
    <div className="card form db-card db-auto">
      <div className="wide db-card-head"><span className="db-ic aqua" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5H7z" /><path d="M12 11v6" /><path d="m9.5 13.5 2.5-2.5 2.5 2.5" /></svg></span><h2>Automatic Backup</h2>
        {d?.connected && !d.needs_reconnect && <span className="db-badge ok">On · Google Drive</span>}</div>
      <p className="wide muted" style={{ margin: 0 }}>Every day at the time you set{d?.time ? ` (now ${clock12(d.time)})` : ''} an encrypted backup of the whole shop is saved to your own Google Drive, in the “Karvio Backups” folder. The newest {d?.keep || 30} are kept. Karvio can only see the files it saves there.</p>
      {q.loading && !d && <div className="wide"><Loading label="Checking Google Drive" /></div>}
      <ErrorBox error={q.error} onRetry={q.reload} />
      {d && !d.configured && <div className="wide note" role="note">
        <b>Server setup needed.</b> Set {d.missing.map((m, i) => <span key={m}>{i ? ', ' : ''}<code>{m}</code></span>)} in the Supabase Edge Function secrets.
        {d.redirect_uri && <> In Google Cloud → Credentials, use this as the authorised redirect URI: <code className="db-uri">{d.redirect_uri}</code></>}
      </div>}
      {d?.configured && d.connected && <div className="wide db-stamps">
        <div className={`db-stamp ${d.needs_reconnect ? 'warn' : 'ok'}`}><span>Google account</span><b>{d.email || 'Connected'}</b><small>{d.needs_reconnect ? 'Access was removed — connect again' : `Folder: ${d.folder || 'Karvio Backups'}`}</small></div>
        <div className={`db-stamp ${last?.status === 'failed' ? 'warn' : last ? 'ok' : ''}`}><span>Last backup</span><b>{last ? fdatetime(last.at) : 'Not yet'}</b>
          <small>{!last ? 'The first one is saved tonight.' : last.status === 'ok' ? `${last.file} · ${size(last.bytes || 0)}` : last.error}</small></div>
        <div className="db-stamp"><span>Next backup</span><b>{d.next_at ? fdatetime(d.next_at) : '—'}</b><small>{d.running ? 'A backup is running now…' : d.due_now ? 'Due now — starts within 5 minutes' : `Every day at ${clock12(d.time)}`}</small></div>
      </div>}
      {d?.configured && d.connected && !d.needs_reconnect && <div className="wide row db-time">
        <Field label="Daily backup time (Bangladesh time)" hint="The backup starts within 5 minutes of this time. If the shop is offline then, it is tried again later the same day.">
          <input type="time" step="60" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Daily backup time" />
        </Field>
        <Btn busy={busy} disabled={!time || time === d.time} onClick={saveTime}>Save time</Btn>
      </div>}
      {waiting && <p className="wide muted" role="status">Finish signing in to Google in the window that opened. This card updates by itself.</p>}
      {d?.configured && <div className="wide row end db-card-foot">
        {d.connected && <Btn busy={busy} onClick={disconnect}>Disconnect</Btn>}
        {d.connected && !d.needs_reconnect && <Btn busy={busy || d.running} onClick={now}>Back up now</Btn>}
        {(!d.connected || d.needs_reconnect) && <Btn kind="primary" busy={busy || waiting} onClick={connect}>{d.needs_reconnect ? 'Connect again' : 'Connect Google Drive'}</Btn>}
      </div>}
      {confirmUI}
    </div>
  );
}
