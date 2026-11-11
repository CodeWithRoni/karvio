// Settings → Database (Administrator account only): overview, full backup download, restore from a backup file.
import { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { api, isOffline } from '../lib/api';
import { fdatetime } from '../lib/format';
import { Btn, Field, useAction, useApi, Loading, ErrorBox } from './ui';

export const BACKUP_FORMAT = 'Karvio database backup';
const RESTORE_WORD = 'RESTORE';
const LOCAL_DRAFTS = ['erp_pos_draft', 'erp_quotes'];
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
function forgetLocalDrafts() { LOCAL_DRAFTS.forEach((k) => { try { localStorage.removeItem(k); } catch { /* private mode */ } }); }

export function DatabaseOverview({ info }) {
  if (info.loading && !info.data) return <div className="card"><Loading label="Reading the database" /></div>;
  if (!info.data) return <ErrorBox error={info.error} onRetry={info.reload} />;
  const d = info.data, age = daysSince(d.last_backup);
  const shown = [...MAIN.map((n) => d.tables.find((t) => t.name === n)).filter(Boolean), ...d.tables.filter((t) => !MAIN.includes(t.name))];
  return (
    <div className="card db-overview">
      <div className="card-head"><h2>Database</h2><span className="muted">{d.offline ? 'Saved on this computer' : 'Google Sheets'} · {d.total.toLocaleString('en-IN')} records in {d.tables.length} tables</span></div>
      <div className="db-stamps">
        <div className={`db-stamp ${age === null || age > 7 ? 'warn' : 'ok'}`}>
          <span>Last backup</span>
          <b>{d.last_backup ? fdatetime(d.last_backup) : 'Never'}</b>
          <small>{age === null ? 'Download a backup and keep it safe.' : age === 0 ? 'Today' : `${age} day${age === 1 ? '' : 's'} ago${age > 7 ? ' — time for a new backup' : ''}`}</small>
        </div>
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
      <h2 className="wide">Backup (export)</h2>
      <p className="muted wide">Downloads one file with <b>all</b> data — products, stock and serials, sales, purchases, returns, customers, suppliers, dues, accounts, expenses, warranty, users and settings. Keep it on another drive or in Google Drive. The file is checked when it is restored, so a damaged or edited file is refused.</p>
      <p className="wide db-secret">The file also holds user password hashes and the SMS API key — share it with nobody.</p>
      {saved && <div className="wide note reset-done" role="status"><b>Saved:</b> {saved.name} · {size(saved.size)} · {saved.records.toLocaleString('en-IN')} records</div>}
      <div className="wide row end"><Btn kind="primary" busy={busy} onClick={download}>Download backup</Btn></div>
    </div>
  );
}

export function DatabaseRestore({ onDone }) {
  const [file, setFile] = useState(null); // { name, size, text, meta, verified, error }
  const [f, setF] = useState({ password: '', confirm: '' });
  const [done, setDone] = useState(null);
  const [drag, setDrag] = useState(false);
  const [busy, run] = useAction();
  const input = useRef();
  const offline = isOffline();

  const pick = async (picked) => {
    setDone(null);
    if (!picked) return;
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
    let r; try { r = await run(() => api('database.restore', { password: f.password, confirm: f.confirm, backup_text: file.text })); } catch { return; } // shown as a message; nothing changed
    forgetLocalDrafts();
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
      <h2 className="wide">Restore (import)</h2>
      <p className="muted wide">Replaces <b>everything</b> in Karvio with the data in a backup file. {offline ? 'The current data file is kept on this computer first.' : 'A full safety backup is saved in your backend first — if it cannot be saved, nothing changes.'}</p>
      {done && <div className="wide note reset-done" role="status">
        <b>Restored</b> the backup of {done.shop_name || 'the shop'} made {fdatetime(done.backup_created_at)}.{' '}
        {done.safety ? <>The data from before the restore was saved as <b>{done.safety.name}</b>{done.safety.url ? <> (<a href={done.safety.url} target="_blank" rel="noreferrer">open the copy</a>)</> : null}.</> : offline ? 'The data from before the restore is kept in the data folder on this computer.' : null}
      </div>}
      <label className={`wide db-drop ${drag ? 'on' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}>
        <input ref={input} type="file" accept=".json,application/json" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} aria-label="Backup file" />
        <b>{file ? file.name : 'Choose a backup file'}</b>
        <small>{file ? size(file.size) : 'Click here, or drop the Karvio-backup-….json file'}</small>
      </label>
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
        <p className="muted wide" style={{ margin: 0, fontSize: 12.5 }}>After the restore, sign-ins come from the backup: if the Administrator password in the backup is different, you are signed out and sign in with that password.</p>
        <div className="wide row end"><Btn kind="danger" busy={busy} disabled={!ready} onClick={restore}>Restore database</Btn></div>
      </>}
    </div>
  );
}

/** The whole Database tab. `Reset` is the existing reset card. */
export function DatabaseTab({ Reset }) {
  const info = useApi('database.info', {});
  return (
    <div className="db-tab">
      <DatabaseOverview info={info} />
      <div className="db-grid">
        <DatabaseBackup onDone={info.reload} />
        <DatabaseRestore onDone={info.reload} />
      </div>
      {info.data && !info.data.offline && <DailyBackup info={info.data} onDone={info.reload} />}
      <Reset onDone={info.reload} />
    </div>
  );
}

/** Nightly copy of the Google Sheet to the Drive folder "Karvio backups"; old copies go to the trash. */
function DailyBackup({ info, onDone }) {
  const supabase = info.backend === 'supabase';
  const [on, setOn] = useState(!!info.daily_backup);
  const [keep, setKeep] = useState(info.backup_keep_days || 30);
  const [busy, run] = useAction();
  const save = async () => { await run(() => api('backup.schedule', { enabled: on, keep_days: Number(keep) }), on ? 'Daily backup is on' : 'Daily backup is off'); onDone?.(); };
  return (
    <div className="card form">
      <div className="card-head wide"><h2>Automatic daily backup</h2><span className="muted">{supabase ? 'Private Supabase snapshots' : `Google Drive folder “${info.backup_folder || 'Karvio backups'}”`}</span></div>
      <Field label="Back up every night"><label className="check"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> {supabase ? 'Save a private database snapshot at 2 AM (Dhaka)' : 'Copy the database to Google Drive at about 2 AM'}</label></Field>
      <Field label="Keep copies for (days)" hint={supabase ? 'Expired daily snapshots are deleted. Also keep downloaded exports outside this project.' : 'Older copies are moved to the Drive trash.'}><input type="number" min="1" max="365" value={keep} onChange={(e) => setKeep(e.target.value)} /></Field>
      <p className="muted wide" style={{ margin: 0 }}>Last automatic backup: {info.last_daily_backup ? fdatetime(info.last_daily_backup) : 'none yet'}</p>
      <div className="wide row end"><Btn kind="primary" busy={busy} onClick={save}>Save</Btn></div>
    </div>
  );
}
