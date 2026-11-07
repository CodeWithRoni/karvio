// The offline data folder is "Karvio Offline". Before the rename it was "ShopERP Offline":
// on the first start of a newer Karvio that folder is renamed (one atomic move, nothing copied or deleted).
const fs = require('node:fs');
const path = require('node:path');

const FOLDER = 'Karvio Offline', LEGACY_FOLDER = 'ShopERP Offline';
const hasData = (dir) => ['karvio.json', 'shop-erp.json'].some((f) => fs.existsSync(path.join(dir, f)));

function offlineDataDir(appData) {
  const fresh = path.join(appData, FOLDER), legacy = path.join(appData, LEGACY_FOLDER);
  if (!fs.existsSync(legacy) || !hasData(legacy)) return fresh; // nothing to move
  if (hasData(fresh)) return fresh; // already moved (or new data saved there): never mix the two
  if (fs.existsSync(fresh)) {
    // an empty "Karvio Offline" folder is in the way: set it aside instead of deleting it
    try { fs.renameSync(fresh, `${fresh} (empty ${Date.now()})`); } catch { return legacy; }
  }
  try { fs.renameSync(legacy, fresh); return fresh; }
  catch { return legacy; } // the folder is busy (an old Karvio still open): keep using it and move it next time
}

module.exports = { offlineDataDir, FOLDER, LEGACY_FOLDER };
