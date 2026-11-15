// Off-site backup: writes the same .karvio.gz file the app's "Download backup" makes, by reading the
// shop through the Supabase Management API (no Karvio sign-in needed). Used by
// .github/workflows/offsite-backup.yml.
//
//   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_ID=... node scripts/offsite-backup.mjs <output-folder>
//
// Prints the file path on the last line.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {exportBackupLines} from '../frontend/src/lib/backupStream.js';
import {APP_VERSION} from '../supabase/functions/karvio-api/release.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ID = /^offsite-[0-9a-f-]{36}$/, TABLE = /^[A-Za-z]{1,60}$/;

/** Runs one SQL statement through the Management API and returns its rows. Retries busy/temporary errors. */
export function managementSql({token, project, fetchImpl = fetch, wait = sleep}) {
  const url = `https://api.supabase.com/v1/projects/${project}/database/query`;
  return async query => {
    for (let attempt = 1; ; attempt++) {
      let status = 0, text = '';
      try {
        const res = await fetchImpl(url, {method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'}, body: JSON.stringify({query})});
        status = res.status; text = await res.text();
        if (res.ok) return JSON.parse(text);
      } catch (e) { text = String(e.message || e); }
      // 4xx other than 408/429 will not get better by retrying (bad token, SQL error).
      if ((status >= 400 && status < 500 && status !== 408 && status !== 429) || attempt >= 6)
        throw new Error(`Management API ${status || 'network'} error: ${text.slice(0, 300)}`);
      await wait(Math.min(30000, 1000 * 2 ** attempt));
    }
  };
}

const one = rows => { const r = rows?.[0]?.r; return typeof r === 'string' ? JSON.parse(r) : r; };

/** Makes the backup file with any SQL runner (the Management API in the workflow, PGlite in tests). */
export async function writeOffsiteBackup({sql, folder, now = new Date(), pace = 250}) {
  let jobId;
  // The app's export code produces the file, so the format (pages, checksums, trailer) is identical.
  const call = async (action, payload) => {
    if (action === 'database.transfer.export.begin') {
      const res = one(await sql('select karvio_private.offsite_export_begin() as r'));
      if (!ID.test(res?.job_id || '')) throw new Error('Off-site export did not start');
      jobId = res.job_id;
      res.manifest.app_version = APP_VERSION; // as the Edge function adds it
      return res;
    }
    if (action === 'database.transfer.export.page') {
      if (payload.job_id !== jobId || !TABLE.test(payload.table) || !Number.isSafeInteger(payload.after_position) || payload.after_position < 0)
        throw new Error('Invalid export page request');
      return one(await sql(`select karvio_private.offsite_export_page('${jobId}', '${payload.table}', ${payload.after_position}) as r`));
    }
    throw new Error('Unexpected action ' + action);
  };
  const date = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);
  const file = path.join(folder, `Karvio-backup-${date}.karvio.gz`);
  let manifest;
  try {
    const lines = exportBackupLines({call, pace, onComplete: r => { manifest = r.manifest; }});
    await pipeline(Readable.from(lines), zlib.createGzip({level: 9}), fs.createWriteStream(file));
    if (!manifest) throw new Error('Backup did not complete');
  } catch (e) {
    fs.rmSync(file, {force: true});
    throw e;
  } finally {
    if (jobId) await sql(`select karvio_private.offsite_export_close('${jobId}') as r`).catch(() => {});
  }
  return {file, manifest, bytes: fs.statSync(file).size};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const token = process.env.SUPABASE_ACCESS_TOKEN, project = process.env.SUPABASE_PROJECT_ID, folder = process.argv[2];
  if (!token || !project || !folder) { console.error('Usage: SUPABASE_ACCESS_TOKEN=.. SUPABASE_PROJECT_ID=.. node scripts/offsite-backup.mjs <folder>'); process.exit(2); }
  fs.mkdirSync(folder, {recursive: true});
  const {file, manifest, bytes} = await writeOffsiteBackup({sql: managementSql({token, project}), folder});
  // Only counts are printed; shop data never goes to the log.
  console.log(`Backup of ${manifest.total_rows} rows in ${manifest.tables.length} tables, ${(bytes / 1048576).toFixed(2)} MiB compressed`);
  console.log(file);
}
