// Reproducible transfer inventory for the local, unpublished patch. Does not upload anything.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'RELEASE-MANIFEST.json');
const sumsPath = path.join(root, 'SHA256SUMS.txt');
const roots = ['.github', 'backend/test', 'frontend/src', 'frontend/src-tauri', 'frontend/desktop', 'frontend/public', 'frontend/branding', 'frontend/scripts', 'frontend/test', 'frontend/dist', 'scripts', 'supabase'];
const fixed = ['.gitignore', 'README.md', 'AI_HANDOVER.md', 'CHANGES.md', 'FIXES-1.0.6.md', 'FIXES-REVIEW.md', 'SETUP.md', 'UPLOAD_GUIDE-বাংলা.md', 'VERIFICATION.md', 'VERIFICATION-1.0.6.md', 'backend/Code.gs', 'backend/appsscript.json', 'frontend/.gitignore', 'frontend/.env.example', 'frontend/package.json', 'frontend/package-lock.json', 'frontend/index.html', 'frontend/vite.config.js', 'frontend/playwright.config.js', 'frontend/capacitor.config.json'];
fixed.push('SUPABASE-SETUP.md');
const excluded = new Set(['node_modules', 'target', '.git', '.temp', 'test-results', 'playwright-report', 'release', 'android', 'ios']);
function walk(relative) {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
    const name = relative + '/' + entry.name;
    if (entry.isSymbolicLink()) throw new Error('Unexpected symbolic link in transfer files: ' + name);
    if (entry.isDirectory()) return excluded.has(entry.name) && !relative.startsWith('frontend/branding') ? [] : walk(name);
    if (/^(?:karvio(?:\.previous)?|shop-erp.*)\.json$|\.pem$|\.key$|^\.env(?:\..+)?$/.test(entry.name) && entry.name !== '.env.example') throw new Error('Private data is not a transfer artifact: ' + name);
    return [name];
  });
}
const files = [...new Set(fixed.concat(roots.flatMap(walk), ['RELEASE-MANIFEST.json', 'SHA256SUMS.txt']))].sort();
const digest = name => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
if (process.argv.includes('--check')) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (JSON.stringify(manifest.files) !== JSON.stringify(files) || manifest.fileCount !== files.length) throw new Error('Transfer file inventory changed; regenerate it.');
  const lines = fs.readFileSync(sumsPath, 'utf8').trim().split(/\r?\n/);
  const names = [];
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match || digest(match[2]) !== match[1]) throw new Error('Transfer checksum mismatch: ' + line);
    names.push(match[2]);
  }
  if (JSON.stringify(names) !== JSON.stringify(files.filter(name => name !== 'SHA256SUMS.txt'))) throw new Error('Incomplete checksum list');
  console.log(`Transfer verified: ${files.length} files, ${lines.length} SHA-256 entries. No upload performed.`);
} else {
  const verification = fs.readFileSync(path.join(root, 'VERIFICATION.md'), 'utf8').match(/```json\s*([\s\S]+?)```/);
  if (!verification) throw new Error('Record the current checks in VERIFICATION.md before preparing the package.');
  const manifest = {
    product: 'Karvio', version: JSON.parse(fs.readFileSync(path.join(root, 'frontend/package.json'))).version,
    preparedDate: '2026-11-12', state: 'owner-authorized-stock-alignment-publication',
    baseCommit: '08c8f4260a36107282f7d624bc89602b1610e97e',
    validation: JSON.parse(verification[1]),
    excluded: ['backend/parts (legacy duplicate backend)', 'node_modules', 'verification artifacts', 'test results', 'release installers', 'user databases/backups', 'credentials'],
    fileCount: files.length, files,
    checksumPolicy: 'SHA256SUMS.txt covers every listed file except itself, including this manifest.',
    uploadOrder: ['Owner authorized publishing stock total alignment', 'Frontend-only change; no API deployment or database migration required', 'Publish main and verify CI/Pages and live assets'],
    onlineUploadPerformed: true,
    appsScriptVersion: 42,
    supabase: { project: 'svqhlotlzgmwjneuphpe', edgeFunction: 'karvio-api', deployedVersion: 15, businessTables: 29, ownerSetup: 'created by owner', liveFrontendCutover: true }
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(sumsPath, files.filter(name => name !== 'SHA256SUMS.txt').map(name => digest(name) + '  ' + name).join('\n') + '\n');
  console.log(`Prepared ${files.length} transfer files. Run with --check to verify. No upload performed.`);
}
