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
      {saved && saved.encrypted === false && <div className="wide errbox" role="alert">This backup is <b>not encrypted</b>: anyone with the file can read it. Update the Karvio server, then download a new backup.</div>}
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
      try{const header=await inspectStreamingBackup(picked);setFile({name:picked.name,size:picked.size,source:picked,streamed:true,verified:null,encrypted:isEncryptedManifest(header),meta:{shop:header.shop_name,created:header.created_at,version:header.app_version,counts:Object.fromEntries(header.tables.map(t=>[t.name,t.rows]))}});}
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
      <input ref={input} type="file" hidden accept=".karvio,.json,.jsonl,.gz,application/json,application/gzip" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} aria-label="Backup file" />
      <div className={`wide row end ${file ? '' : 'db-card-foot'}`}>
        {file && <span className="muted">{file.name} · {size(file.size)}</span>}
        {file && <span className="spacer" />}
        <Btn kind={file?.meta && !file.error ? undefined : 'primary'} busy={busy} onClick={() => input.current?.click()}>{file ? 'Choose another file' : 'Upload Backup'}</Btn>
      </div>
      {file?.error && <div className="wide errbox" role="alert">{file.error}</div>}
      {m && !file.error && <div className="wide db-preview">
        <div className="db-preview-head">
          <div><b>{m.shop || 'Shop'}</b><small>Backup made {fdatetime(m.created)}{m.by ? ` by ${m.by}` : ''}{m.version ? ` · Karvio ${m.version}` : ''}</small></div>
          <span className={`db-badge ${file.verified || file.encrypted ? 'ok' : ''}`}>{file.encrypted ? '🔒 Encrypted' : file.verified ? '✓ File verified' : 'Checked on restore'}</span>
        </div>
        {!file.encrypted && <p className="muted db-plain">This is an older backup that is not encrypted. It can still be restored; keep the file private.</p>}
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

const CloudIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5H7z" /><path d="M12 11v6" /><path d="m9.5 13.5 2.5-2.5 2.5 2.5" /></svg>;
const shortId = (id = '') => (id.length > 34 ? `${id.slice(0, 18)}…${id.slice(-24)}` : id);

/** Where the owner gets their own Google keys: five steps in Google Cloud, with the redirect address to copy. */
function GoogleKeysGuide({ redirect }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(redirect); useStore.getState().toast('Address copied'); }
    catch { useStore.getState().toast('Select the address and copy it', 'err'); }
  };
  return (
    <div className="ab-box">
      <div className="ab-box-head"><h3>Step 1 — How to get your Google keys</h3><span className="muted">About 10 minutes · free</span></div>
      <ol className="ab-guide">
        <li>Open <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer">console.cloud.google.com</a> and sign in with the <b>Google account where the backups should go</b>. At the top, choose <b>Select a project → New project</b>, name it <i>Karvio Backup</i> and press <b>Create</b>.</li>
        <li>Menu <b>APIs &amp; Services → Library</b>, search <b>Google Drive API</b>, open it and press <b>Enable</b>.</li>
        <li>Menu <b>APIs &amp; Services → OAuth consent screen</b>: choose <b>External</b>, give the app a name (e.g. your shop name) and your email. Under <b>Scopes</b> add <code>…/auth/drive.file</code>. Then press <b>Publish app</b> so it shows <b>In production</b>.
          <div className="ab-warn">If it stays in “Testing”, Google stops the backups after 7 days.</div></li>
        <li>Menu <b>APIs &amp; Services → Credentials → Create credentials → OAuth client ID</b>. Application type: <b>Web application</b>. Under <b>Authorised redirect URIs</b> press <b>Add URI</b> and paste this:
          <div className="ab-uri"><code>{redirect}</code><Btn size="sm" onClick={copy}>Copy</Btn></div></li>
        <li>Press <b>Create</b>. Google shows a <b>Client ID</b> and a <b>Client secret</b>. Copy both into Step 2 below.</li>
      </ol>
    </div>
  );
}

/** Automatic backup: the owner saves their own Google keys, connects their Google Drive once, and every day at the time they set the server saves an encrypted backup there. */
export function AutoBackup({ q, onChanged }) {
  const d = q.data;
  const [busy, run] = useAction();
  const [waiting, setWaiting] = useState(false);
  const [confirmUI, ask] = useConfirm();
  const [time, setTime] = useState('');
  const [keys, setKeys] = useState({ client_id: '', client_secret: '' });
  const [showSecret, setShowSecret] = useState(false);
  const [editKeys, setEditKeys] = useState(false);
  const [guide, setGuide] = useState(false);
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
  if (q.loading && !d) return <div className="card db-card db-auto"><Loading label="Checking Google Drive" /></div>;
  if (!d) return <div className="card db-card db-auto"><ErrorBox error={q.error} onRetry={q.reload} /></div>;

  const saved = !!d.google?.saved, connected = d.connected && !d.needs_reconnect;
  const connect = async () => {
    const popup = window.open('', 'karvio-google', 'width=520,height=680');
    let r; try { r = await run(() => api('backup.drive.connect', {})); } catch { popup?.close(); return; }
    if (popup && !popup.closed) popup.location.href = r.url; else window.location.href = r.url;
    setWaiting(true);
  };
  const saveKeys = async () => {
    const id = keys.client_id.trim();
    if (!/\.apps\.googleusercontent\.com$/.test(id)) return useStore.getState().toast('The Google Client ID ends with .apps.googleusercontent.com', 'err');
    if (!keys.client_secret.trim()) return useStore.getState().toast('Enter the Google Client secret', 'err');
    if (d.connected && d.google?.client_id && d.google.client_id !== id
      && !(await ask({ title: 'Use another Google project?', message: 'Google Drive will be disconnected. Connect it again after saving. Backups already in Drive stay there.', confirmLabel: 'Save and disconnect' }))) return;
    try { await run(() => api('backup.drive.keys.save', { client_id: id, client_secret: keys.client_secret.trim() }), 'Google keys saved'); } catch { return; }
    setKeys({ client_id: '', client_secret: '' }); setShowSecret(false); setEditKeys(false); onChanged();
  };
  const saveTime = async () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return useStore.getState().toast('Choose a backup time', 'err');
    try { await run(() => api('backup.drive.schedule', { time }), `Daily backup time set to ${clock12(time)}`); } catch { return; }
    onChanged();
  };
  const now = async () => { try { await run(() => api('backup.drive.run', {}), 'Backup saved to Google Drive'); } catch { /* shown */ } onChanged(); };
  const disconnect = async () => {
    if (!(await ask({ title: 'Disconnect Google Drive?', message: 'Daily backups stop. Backups already in your Google Drive stay there.', confirmLabel: 'Disconnect' }))) return;
    try { await run(() => api('backup.drive.disconnect', {}), 'Google Drive disconnected'); } catch { return; }
    onChanged();
  };
  const last = d.last;
  const keysForm = (
    <div className="ab-box">
      <h3>Step 2 — Save your Google keys</h3>
      <Field label="Google Client ID" wide><input value={keys.client_id} onChange={(e) => setKeys({ ...keys, client_id: e.target.value })} placeholder="1234567890-abc123.apps.googleusercontent.com" autoComplete="off" spellCheck={false} aria-label="Google Client ID" /></Field>
      <Field label="Google Client secret" wide hint="Kept locked on the server. It is never shown again, never sent to other users and never put in a backup.">
        <div className="ab-secret"><input type={showSecret ? 'text' : 'password'} value={keys.client_secret} onChange={(e) => setKeys({ ...keys, client_secret: e.target.value })} placeholder="GOCSPX-…" autoComplete="off" spellCheck={false} aria-label="Google Client secret" /><Btn onClick={() => setShowSecret(!showSecret)}>{showSecret ? 'Hide' : 'Show'}</Btn></div>
      </Field>
      <div className="row end">{saved && <Btn onClick={() => { setEditKeys(false); setKeys({ client_id: '', client_secret: '' }); }}>Cancel</Btn>}<Btn kind="primary" busy={busy} disabled={!keys.client_id.trim() || !keys.client_secret.trim()} onClick={saveKeys}>Save keys</Btn></div>
    </div>
  );
  const keysSaved = (
    <div className="ab-saved">
      <span className="ab-check" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg></span>
      <div className="ab-saved-text"><b>Google keys saved</b><small>Client ID {shortId(d.google.client_id)} · secret hidden</small></div>
      <Btn size="sm" onClick={() => setEditKeys(true)}>Change keys</Btn>
      <button type="button" className="link" onClick={() => setGuide(!guide)}>{guide ? 'Hide the steps' : 'How to get the keys'}</button>
    </div>
  );
  const head = (
    <div className="wide db-card-head"><span className="db-ic aqua" aria-hidden="true"><CloudIcon /></span><h2>Automatic Backup</h2>
      <span className={`db-badge ${connected ? 'ok' : ''}`} style={{ marginLeft: 'auto' }}>{connected ? 'On · Google Drive' : d.needs_reconnect ? 'Off · Connect again' : 'Off · Not set up'}</span></div>
  );

  if (connected) return (
    <div className="card form db-card db-auto">
      {head}
      <p className="wide muted ab-intro">Every day at {clock12(d.time)} an encrypted backup of the whole shop is saved to your own Google Drive, in the “Karvio Backups” folder. The newest {d.keep || 30} are kept.</p>
      <div className="wide db-stamps">
        <div className="db-stamp ok"><span>Google account</span><b>{d.email || 'Connected'}</b><small>Folder: {d.folder || 'Karvio Backups'}</small></div>
        <div className={`db-stamp ${last?.status === 'failed' ? 'warn' : last ? 'ok' : ''}`}><span>Last backup</span><b>{last ? fdatetime(last.at) : 'Not yet'}</b>
          <small>{!last ? 'The first one is saved at the time below.' : last.status === 'ok' ? `${last.file} · ${size(last.bytes || 0)}` : last.error}</small></div>
        <div className="db-stamp"><span>Next backup</span><b>{d.next_at ? fdatetime(d.next_at) : '—'}</b><small>{d.running ? 'A backup is running now…' : d.due_now ? 'Due now — starts within 5 minutes' : `Every day at ${clock12(d.time)}`}</small></div>
      </div>
      <div className="wide row db-time">
        <Field label="Daily backup time (Bangladesh time)" hint="The backup starts within 5 minutes of this time. If the shop is offline then, it is tried again later the same day.">
          <input type="time" step="60" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Daily backup time" />
        </Field>
        <Btn busy={busy} disabled={!time || time === d.time} onClick={saveTime}>Save time</Btn>
      </div>
      <div className="wide">{editKeys ? keysForm : keysSaved}</div>
      {guide && !editKeys && <div className="wide"><GoogleKeysGuide redirect={d.redirect_uri} /></div>}
      <div className="wide row end db-card-foot">
        <Btn busy={busy} onClick={disconnect}>Disconnect</Btn>
        <Btn kind="primary" busy={busy || d.running} onClick={now}>Back up now</Btn>
      </div>
      {confirmUI}
    </div>
  );

  // Not connected yet (or Google access was removed): the three steps.
  const step = saved && !editKeys ? 3 : 1;
  return (
    <div className="card form db-card db-auto">
      {head}
      <p className="wide muted ab-intro">Every day at the time you choose, an encrypted backup of the whole shop is saved to <b>your own Google Drive</b>, in the “Karvio Backups” folder. The newest {d.keep || 30} are kept. It takes three steps, once.</p>
      {d.needs_reconnect && <div className="wide errbox" role="alert">Google access was removed or expired. Press Connect Google Drive again.</div>}
      <div className="wide ab-steps">
        <div className={`ab-step ${step === 1 ? 'on' : 'done'}`}><span>{step === 1 ? 1 : '✓'}</span>Get your Google keys</div>
        <div className={`ab-step ${step === 1 ? '' : 'done'}`}><span>{step === 1 ? 2 : '✓'}</span>Save them here</div>
        <div className={`ab-step ${step === 3 ? 'on' : ''}`}><span>3</span>Connect Google Drive</div>
      </div>
      {(!saved || editKeys || guide) && <div className="wide"><GoogleKeysGuide redirect={d.redirect_uri} /></div>}
      <div className="wide">{saved && !editKeys ? keysSaved : keysForm}</div>
      <div className={`wide ab-box ab-connect ${saved && !editKeys ? '' : 'off'}`}>
        <div><h3>Step 3 — Connect Google Drive</h3><p className="muted">Opens Google sign-in. Choose the same account and allow Karvio to save its own files.</p></div>
        <Btn kind={saved && !editKeys ? 'primary' : undefined} busy={busy || waiting} disabled={!saved || editKeys || !d.configured} onClick={connect}>{d.needs_reconnect ? 'Connect again' : 'Connect Google Drive'}</Btn>
      </div>
      {waiting && <p className="wide muted" role="status">Finish signing in to Google in the window that opened. This card updates by itself.</p>}
      {confirmUI}
    </div>
  );
}
