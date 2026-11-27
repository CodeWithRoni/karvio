// Encrypted backups (KARVIO_BACKUP_KEY) and the nightly Google Drive backup, against a real migrated database.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient, rpcFor} from './pg-harness.mjs';
import {exportBackupLines, restoreStreamBackup, inspectStreamingBackup, isEncryptedManifest} from '../../frontend/src/lib/backupStream.js';
import {driveCallback, KEEP_BACKUPS} from '../../supabase/functions/karvio-api/drive.mjs';
import {sealPage, openPage, keyId} from '../../supabase/functions/karvio-api/backupCrypto.mjs';

const KEY = 'test-backup-key-0123456789-abcdefghijklmnop';
const OTHER = 'another-backup-key-0123456789-abcdefghijkl';
const PASSWORD = 'harness-password-1';
const storage = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k)}; };

// ---- Fake Google: OAuth token exchange, userinfo, Drive folder, resumable upload, list and bin.
const google = {files: new Map(), uploads: [], revoked: [], refreshes: 0, sessions: new Map(), nextId: 1, failUpload: false};
async function fakeFetch(input, init = {}) {
  const url = new URL(String(input)), method = init.method || 'GET';
  const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json', ...headers}});
  const body = typeof init.body === 'string' ? init.body : '';
  if (url.host === 'oauth2.googleapis.com' && url.pathname === '/token') {
    const f = new URLSearchParams(body);
    if (f.get('grant_type') === 'authorization_code') {
      assert.equal(f.get('redirect_uri'), 'https://karvio.test/functions/v1/karvio-api');
      return json({access_token: 'at-1', refresh_token: 'rt-secret-123', scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file', id_token: 'x'});
    }
    if (f.get('refresh_token') === 'rt-secret-123') { google.refreshes++; return json({access_token: 'at-2'}); }
    return json({error: 'invalid_grant', error_description: 'Token has been expired or revoked.'}, 400);
  }
  if (url.host === 'oauth2.googleapis.com' && url.pathname === '/revoke') { google.revoked.push(new URLSearchParams(body).get('token')); return json({}); }
  if (url.pathname === '/oauth2/v3/userinfo') return json({email: 'owner@example.com'});
  assert.match(String(init.headers?.Authorization || init.headers?.authorization || 'Bearer session'), /^Bearer /);
  if (url.pathname === '/drive/v3/files' && method === 'POST') { const meta = JSON.parse(body), id = 'f' + google.nextId++; google.files.set(id, {...meta, id, trashed: false, created: google.nextId}); return json({id}); }
  if (url.pathname.startsWith('/drive/v3/files/') && method === 'GET') { const f = google.files.get(decodeURIComponent(url.pathname.split('/').pop())); return f ? json({id: f.id, trashed: f.trashed}) : json({error: {code: 404, message: 'File not found', errors: [{reason: 'notFound'}]}}, 404); }
  if (url.pathname.startsWith('/drive/v3/files/') && method === 'PATCH') { const f = google.files.get(decodeURIComponent(url.pathname.split('/').pop())); f.trashed = true; return json({id: f.id}); }
  if (url.pathname === '/drive/v3/files' && method === 'GET') {
    const folder = /'([^']+)' in parents/.exec(url.searchParams.get('q'))[1];
    return json({files: [...google.files.values()].filter(f => f.parents?.[0] === folder && !f.trashed).sort((a, b) => b.created - a.created).map(f => ({id: f.id, name: f.name}))});
  }
  if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
    if (google.failUpload) return json({error: {code: 500, message: 'Backend Error'}}, 500);
    const meta = JSON.parse(body), session = 'https://upload.test/session/' + google.nextId++;
    google.sessions.set(session, {meta, parts: []});
    return new Response(null, {status: 200, headers: {Location: session}});
  }
  if (url.host === 'upload.test' && method === 'PUT') {
    const s = google.sessions.get(String(input)), range = init.headers['Content-Range'], bytes = init.body;
    s.parts.push(Buffer.from(bytes));
    if (/\/\*$/.test(range)) return new Response(null, {status: 308});
    const text = Buffer.concat(s.parts).toString('utf8'), id = 'f' + google.nextId++;
    google.files.set(id, {...s.meta, id, trashed: false, created: google.nextId, text});
    google.uploads.push({name: s.meta.name, text});
    return json({id, name: s.meta.name, size: String(Buffer.byteLength(text))}, 200);
  }
  throw new Error('Unexpected fetch ' + method + ' ' + url);
}
const drive = {clientId: 'client-id.apps.googleusercontent.com', clientSecret: 'client-secret', redirectUri: 'https://karvio.test/functions/v1/karvio-api', fetch: fakeFetch};

const db = await freshDatabase();
const rpc = rpcFor(db);
const worker = async () => db.query('select karvio_private.transfer_restore_worker()');
const client = async (backupKey) => apiClient(db, {handlerOptions: {backupKey, drive}});
const api = await client(KEY);
await api.q('customer.save', {name: 'Secret Customer Rahim', phones: '01711000009', opening_balance: 1234});
const fingerprint = async () => (await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(c) order by _position)::text,'[]')) as h from public."Customers" c`)).rows[0].h;
const before = await fingerprint();

// ---- 1. Download Backup with the server key: every page is sealed, nothing readable is left in the file.
async function download(c) {
  const lines = []; let done;
  for await (const line of exportBackupLines({call: (a, p) => c.q(a, p), pace: 0, onComplete: x => { done = x; }})) lines.push(line);
  await c.q('database.transfer.export.close', {job_id: done.job_id});
  return lines;
}
const lines = await download(api);
const header = JSON.parse(lines[0]);
assert.ok(isEncryptedManifest(header), 'manifest carries the encryption block');
assert.equal(header.encryption.key_id, keyId(KEY));
assert.equal(header.encryption.alg, 'AES-256-GCM');
const text = lines.join('');
assert.ok(!text.includes('Secret Customer Rahim') && !text.includes('01711000009'), 'customer data is not readable in the file');
assert.ok(!text.includes('pbkdf2$'), 'password hashes are not readable in the file');
assert.ok(lines.slice(1, -1).every(l => JSON.parse(l).payload.startsWith('kvenc1:')), 'every page is sealed');
const file = new File(lines, 'Karvio-backup-2026-11-27.karvio', {lastModified: 1});
assert.ok(isEncryptedManifest(await inspectStreamingBackup(file)));

// ---- 2. It restores on the same server, and the data comes back exactly.
await api.q('customer.save', {name: 'Added after the backup'});
const restored = await restoreStreamBackup(file, {call: (a, p) => api.q(a, p), credentials: {password: PASSWORD, confirm: 'RESTORE'}, storage: storage(), key: 'r1', pace: 0, wait: worker});
assert.equal(restored.signed_out, true);
assert.equal(await fingerprint(), before, 'encrypted backup restores the same customers');

// ---- 3. An edited page, a swapped page or a different server key is refused; live data is untouched.
const api2 = await client(KEY);
const tamper = (i, fn) => { const copy = [...lines]; const part = JSON.parse(copy[i]); fn(part); copy[i] = JSON.stringify(part) + '\n'; return new File(copy, 'edited.karvio', {lastModified: 2}); };
const flip = (s) => { const at = s.length - 10; return s.slice(0, at) + (s[at] === 'A' ? 'B' : 'A') + s.slice(at + 1); };
await assert.rejects(restoreStreamBackup(tamper(1, p => { p.payload = flip(p.payload); }), {call: (a, p) => api2.q(a, p), credentials: {password: PASSWORD, confirm: 'RESTORE'}, storage: storage(), key: 'r2', pace: 0, wait: worker}), /damaged/);
// A page that was re-sealed by someone else (checksum fixed) still fails the server's seal check.
await assert.rejects(restoreStreamBackup(tamper(1, p => { const forged = sealPage(OTHER, header.encryption.salt, p.table, '[]'); p.payload = forged.payload; p.enc_sha256 = forged.enc_sha256; }), {call: (a, p) => api2.q(a, p), credentials: {password: PASSWORD, confirm: 'RESTORE'}, storage: storage(), key: 'r3', pace: 0, wait: worker}), /could not be decrypted/);
const other = await client(OTHER);
await assert.rejects(restoreStreamBackup(file, {call: (a, p) => other.q(a, p), credentials: {password: PASSWORD, confirm: 'RESTORE'}, storage: storage(), key: 'r4', pace: 0, wait: worker}), /different backup key/);
const keyless = await client('');
await assert.rejects(restoreStreamBackup(file, {call: (a, p) => keyless.q(a, p), credentials: {password: PASSWORD, confirm: 'RESTORE'}, storage: storage(), key: 'r5', pace: 0, wait: worker}), /KARVIO_BACKUP_KEY/);
assert.equal(await fingerprint(), before, 'refused restores change nothing');
assert.throws(() => openPage(KEY, 'salt', 'Customers', sealPage(KEY, 'salt', 'Sales', '[1]').payload, 'x'), /could not be decrypted/, 'a page cannot be moved to another table');

// ---- 4. Without the key, backups stay plain (old behaviour) and old plain files still restore.
const plain = await download(keyless);
assert.ok(!isEncryptedManifest(JSON.parse(plain[0])));
assert.ok(plain.join('').includes('Secret Customer Rahim'));
const plainBack = await restoreStreamBackup(new File(plain, 'old.karvio.gz'.replace('.gz', '.jsonl'), {lastModified: 3}), {call: (a, p) => api2.q(a, p), credentials: {password: PASSWORD, confirm: 'RESTORE'}, storage: storage(), key: 'r6', pace: 0, wait: worker});
assert.equal(plainBack.signed_out, true, 'a plain (older) backup still restores on a server with the key');
assert.equal(await fingerprint(), before);

// ---- 5. Automatic backup card: connect Google Drive, back up now, nightly tick, keep the newest 30, disconnect.
const owner = await client(KEY);
let st = await owner.q('backup.drive.status');
assert.equal(st.configured, true); assert.equal(st.connected, false); assert.equal(st.redirect_uri, drive.redirectUri);
const notReady = await (await client('')).raw('backup.drive.connect');
assert.equal(notReady.ok, false); assert.match(notReady.error, /KARVIO_BACKUP_KEY/);
const {url} = await owner.q('backup.drive.connect');
const auth = new URL(url);
assert.equal(auth.host, 'accounts.google.com');
assert.match(auth.searchParams.get('scope'), /auth\/drive\.file/);
assert.ok(!/auth\/drive( |$)/.test(auth.searchParams.get('scope')), 'only the files Karvio creates');
const back = new URL(drive.redirectUri + '?state=' + auth.searchParams.get('state') + '&code=auth-code');
const done = await driveCallback(back, rpc, {...drive, backupKey: KEY});
assert.equal(done.status, 200); assert.match(await done.text(), /Google Drive connected/);
assert.equal((await driveCallback(back, rpc, {...drive, backupKey: KEY})).status, 400, 'a sign-in link works once');
const stored = (await db.query("select value from karvio_private.config where key='drive_backup'")).rows[0].value;
assert.ok(!stored.includes('rt-secret-123'), 'the Google refresh token is stored sealed');
st = await owner.q('backup.drive.status');
assert.equal(st.connected, true); assert.equal(st.email, 'owner@example.com'); assert.ok(st.next_at.endsWith('T00:00:00'));
assert.ok(!JSON.stringify(st).includes('rt-secret'), 'the token never reaches the browser');

// A staff member (not the Administrator) cannot see or change it.
await owner.q('user.save', {name: 'Manager', username: 'm1', role: 'manager', password: 'manager-password-1'});
const staff = await client(KEY); staff.setToken((await staff.q('login', {username: 'm1', password: 'manager-password-1'})).token);
const deniedStatus = await staff.raw('backup.drive.status');
assert.equal(deniedStatus.ok, false); assert.match(deniedStatus.error, /Administrator/);

await owner.q('backup.drive.run');
assert.equal(google.uploads.length, 1);
const up = google.uploads[0];
assert.match(up.name, /^Karvio-backup-.+\.karvio$/);
assert.ok(!up.text.includes('Secret Customer Rahim'), 'the Drive copy is encrypted too');
st = await owner.q('backup.drive.status');
assert.equal(st.last.status, 'ok'); assert.equal(st.last.file, up.name);
// The Drive file restores like a downloaded one.
const fromDrive = await restoreStreamBackup(new File([up.text], up.name, {lastModified: 4}), {call: (a, p) => owner.q(a, p), credentials: {password: PASSWORD, confirm: 'RESTORE'}, storage: storage(), key: 'r7', pace: 0, wait: worker});
assert.equal(fromDrive.signed_out, true);
assert.equal(await fingerprint(), before);
owner.setToken((await owner.q('login', {username: 'admin', password: PASSWORD})).token);
assert.equal((await owner.q('backup.drive.status')).connected, true, 'the Drive connection is not part of the backup and survives a restore');

// Nightly: pg_cron mints a one-time code and posts it; a wrong or reused code is refused.
await rpc('karvio_register_endpoint', {endpoint_url: drive.redirectUri});
await db.query('delete from net.calls');
await db.query('select karvio_private.drive_tick()');
const call = (await db.query('select body from net.calls')).rows[0].body;
assert.equal(call.action, 'backup.drive.tick');
assert.equal((await owner.raw('backup.drive.tick', {nonce: 'x'.repeat(64)})).ok, false);
assert.equal((await owner.raw('backup.drive.tick', call.payload)).ok, true);
assert.equal(google.uploads.length, 2);
assert.equal((await owner.raw('backup.drive.tick', call.payload)).ok, false, 'a code works once');
const job = (await db.query("select command from cron.job where jobname='karvio-drive-backup'")).rows[0];
assert.ok(job, 'nightly job scheduled');
assert.equal((await db.query("select schedule from cron.job where jobname='karvio-drive-backup'")).rows[0].schedule, '0 18 * * *', '00:00 Asia/Dhaka');

// Keep the newest 30.
for (let i = 0; i < KEEP_BACKUPS + 2; i++) await owner.q('backup.drive.run');
const live = [...google.files.values()].filter(f => /\.karvio$/.test(f.name || '') && !f.trashed);
assert.equal(live.length, KEEP_BACKUPS);

// A failed upload is reported, the staged copy is dropped, and nothing else changes.
google.failUpload = true;
const failed = await owner.raw('backup.drive.run');
assert.equal(failed.ok, false); assert.match(failed.error, /Google answered 500/);
assert.equal((await owner.q('backup.drive.status')).last.status, 'failed');
assert.equal(Number((await db.query("select count(*) from karvio_private.transfer_rows r join karvio_private.transfer_jobs j on j.id=r.job_id where j.request_key like 'drive:%'")).rows[0].count), 0);
google.failUpload = false;

// Disconnect: access is revoked at Google and nightly backups stop.
await owner.q('backup.drive.disconnect');
assert.deepEqual(google.revoked, ['rt-secret-123']);
assert.equal((await owner.q('backup.drive.status')).connected, false);
await db.query('delete from net.calls'); await db.query('select karvio_private.drive_tick()');
assert.equal(Number((await db.query('select count(*) from net.calls')).rows[0].count), 0, 'no nightly call after disconnect');

// The database functions are for the server only.
await db.exec('set role anon');
await assert.rejects(() => db.query('select public.karvio_drive_state()'));
await assert.rejects(() => db.query("select public.karvio_drive_export_begin('x')"));
await db.exec('reset role');
console.log('Encrypted backups and Google Drive automatic backup: all checks passed');
