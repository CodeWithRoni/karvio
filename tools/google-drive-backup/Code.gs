/**
 * Karvio — nightly backup to your own Google Drive (Google Apps Script).
 *
 * Makes the same .karvio.gz file as Karvio's "Download backup" and saves it in the Drive folder
 * "Karvio Backups". Backups older than KEEP_DAYS go to the Drive trash (the newest KEEP_AT_LEAST
 * always stay). If a backup fails, an email is sent to this Google account.
 *
 * One-time setup (script.google.com → New project → paste this file):
 *   1. Project Settings (gear) → Script properties → add
 *        SUPABASE_ACCESS_TOKEN = your Supabase access token
 *        SUPABASE_PROJECT_ID   = svqhlotlzgmwjneuphpe
 *   2. Choose the function "setup" at the top and press Run. Allow the permissions Google asks for.
 *      It makes the first backup now and schedules one every night at about 3 AM (Dhaka time).
 * To restore: download the file from Drive, then in Karvio choose Restore backup and pick it.
 */
const FOLDER_NAME = 'Karvio Backups';
const KEEP_DAYS = 90;
const KEEP_AT_LEAST = 7;
const RUN_HOUR = 3; // Asia/Dhaka
const TIME_LIMIT_MS = 5 * 60 * 1000; // Apps Script stops a run at 6 minutes
const FORMAT = 'Karvio streaming backup';

/** Run once by hand: checks the settings, makes a backup now and schedules the nightly one. */
function setup() {
  settings_();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'dailyBackup')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(RUN_HOUR).inTimezone('Asia/Dhaka').create();
  dailyBackup();
}

/** The nightly job (also safe to run by hand). */
function dailyBackup() {
  try {
    const result = makeBackup_();
    const removed = removeOldBackups_();
    console.log(`Saved ${result.name}: ${result.rows} rows, ${(result.bytes / 1048576).toFixed(2)} MiB. Old backups moved to trash: ${removed}.`);
    return result;
  } catch (e) {
    const to = Session.getEffectiveUser().getEmail();
    if (to) MailApp.sendEmail(to, 'Karvio backup FAILED', 'Tonight\'s Karvio backup to Google Drive failed:\n\n' + (e && e.message || e) +
      '\n\nOpen script.google.com → this project → Executions for details. Your shop data was not changed.');
    throw e;
  }
}

function settings_() {
  const p = PropertiesService.getScriptProperties();
  const token = (p.getProperty('SUPABASE_ACCESS_TOKEN') || '').trim();
  const project = (p.getProperty('SUPABASE_PROJECT_ID') || '').trim();
  if (!token) throw new Error('Script property SUPABASE_ACCESS_TOKEN is missing.');
  if (!/^[a-z]{20}$/.test(project)) throw new Error('Script property SUPABASE_PROJECT_ID is missing or wrong (20 lowercase letters).');
  return {token, project};
}

/** Runs one SQL statement through the Supabase Management API; retries temporary errors. */
function sql_(query) {
  const {token, project} = settings_();
  for (let attempt = 1; ; attempt++) {
    let status = 0, text = '';
    try {
      const res = UrlFetchApp.fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
        method: 'post', contentType: 'application/json', headers: {Authorization: 'Bearer ' + token},
        payload: JSON.stringify({query}), muteHttpExceptions: true});
      status = res.getResponseCode(); text = res.getContentText('UTF-8');
      if (status >= 200 && status < 300) {
        const r = JSON.parse(text)[0].r;
        return typeof r === 'string' ? JSON.parse(r) : r;
      }
    } catch (e) { text = String(e && e.message || e); }
    if ((status >= 400 && status < 500 && status !== 408 && status !== 429) || attempt >= 5)
      throw new Error(`Supabase answered ${status || 'no connection'}: ${text.slice(0, 300)}`);
    Utilities.sleep(Math.min(20000, 1000 * Math.pow(2, attempt)));
  }
}

function sha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

/** Same lines as Karvio's own export: header, checked pages, and a trailer with a running digest. */
function makeBackup_() {
  const started = Date.now();
  const begin = sql_('select karvio_private.offsite_export_begin() as r');
  const jobId = begin && begin.job_id;
  if (!/^offsite-[0-9a-f-]{36}$/.test(jobId || '')) throw new Error('Supabase did not start the backup.');
  try {
    const manifest = begin.manifest;
    if (manifest.format !== FORMAT || manifest.version !== 2 || !Array.isArray(manifest.tables) || !(manifest.total_rows >= 1))
      throw new Error('Unexpected backup header from Supabase.');
    const header = JSON.stringify(manifest);
    const lines = [header];
    let digest = sha256_(header), seq = 0, rows = 0;
    for (const table of manifest.tables) {
      if (!/^[A-Za-z]{1,60}$/.test(table.name)) throw new Error('Unexpected table name.');
      let cursor = 0, seen = 0;
      for (;;) {
        if (Date.now() - started > TIME_LIMIT_MS) throw new Error('The shop is too large to back up within Apps Script\'s 6-minute limit.');
        const page = sql_(`select karvio_private.offsite_export_page('${jobId}', '${table.name}', ${cursor}) as r`);
        if (page.sha256 !== sha256_(page.payload)) throw new Error('Backup download checksum mismatch.');
        if (page.rows) {
          if (!(page.rows >= 1) || page.next_cursor <= cursor) throw new Error('Invalid export page.');
          seen += page.rows; rows += page.rows;
          lines.push(JSON.stringify({kind: 'rows', seq, table: table.name, payload: page.payload, sha256: page.sha256}));
          digest = sha256_(digest + '|' + seq + '|' + table.name + '|' + page.sha256);
          seq++;
        } else if (!page.done) throw new Error('Export cursor did not advance.');
        cursor = page.next_cursor;
        if (page.done) break;
      }
      if (seen !== table.rows) throw new Error('Backup table count mismatch: ' + table.name);
    }
    if (rows !== manifest.total_rows) throw new Error('Backup row count mismatch.');
    lines.push(JSON.stringify({kind: 'end', pages: seq, rows, digest}));
    const text = lines.join('\n') + '\n';

    const name = 'Karvio-backup-' + Utilities.formatDate(new Date(), 'Asia/Dhaka', 'yyyy-MM-dd-HHmm') + '.karvio.gz';
    const gz = Utilities.gzip(Utilities.newBlob(text, 'application/x-ndjson'), name);
    // Read the compressed file back before saving it.
    if (Utilities.ungzip(gz).getDataAsString('UTF-8') !== text) throw new Error('Compressed backup did not read back correctly.');
    const file = folder_().createFile(gz.setName(name));
    return {name, rows, bytes: file.getSize(), id: file.getId()};
  } finally {
    try { sql_(`select karvio_private.offsite_export_close('${jobId}') as r`); } catch (e) { console.warn('Could not close the export: ' + e.message); }
  }
}

function folder_() {
  const found = DriveApp.getFoldersByName(FOLDER_NAME);
  return found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME);
}

function removeOldBackups_() {
  const files = [];
  const it = folder_().getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (/^Karvio-backup-.*\.karvio\.gz$/.test(f.getName())) files.push(f);
  }
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  let removed = 0;
  files.slice(KEEP_AT_LEAST).forEach(f => { if (f.getDateCreated().getTime() < cutoff) { f.setTrashed(true); removed++; } });
  return removed;
}
