const fs = require('node:fs');
const path = require('node:path');

// Existing offline shops keep their data. Fresh standard installers use online mode.
function desktopMode({ args, appData, dataDir, defaultMode }) {
  if (args.includes('--online') && args.includes('--offline')) throw new Error('Choose either --online or --offline');
  if (args.includes('--online')) return 'online';
  if (args.includes('--offline') || defaultMode === 'offline') return 'offline';
  const dirs = dataDir ? [dataDir] : ['Karvio Offline', 'ShopERP Offline'].map(name => path.join(appData, name));
  return dirs.some(dir => ['karvio.json', 'shop-erp.json'].some(name => fs.existsSync(path.join(dir, name)))) ? 'offline' : 'online';
}
module.exports = { desktopMode };
