// Read-only verification: no login, database reads or test transactions.
const fs = require('fs');
const path = require('path');
const config = fs.readFileSync(path.join(__dirname, '../../frontend/src/config.js'), 'utf8');
const url = config.match(/https:\/\/script\.google\.com\/macros\/s\/[^']+/)?.[0];
if (!url) throw new Error('Default API URL not found');
fetch(url, { signal: AbortSignal.timeout(30000) }).then(async (response) => {
  const result = await response.json();
  const version = JSON.parse(fs.readFileSync(path.join(__dirname, '../../frontend/package.json'), 'utf8')).version;
  if (!response.ok || !result.ok || result.data?.version !== version) throw new Error('Unexpected live API version: ' + JSON.stringify(result));
  console.log('Live Karvio API verified: ' + result.data.version);
}).catch((e) => { console.error(e.message); process.exitCode = 1; });
