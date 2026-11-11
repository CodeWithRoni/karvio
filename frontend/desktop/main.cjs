const { app, BrowserWindow, Menu, shell, ipcMain, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { OfflineRuntime } = require('./offline-runtime.cjs');

const { desktopMode } = require('./mode.cjs');
const online = desktopMode({ args: process.argv, appData: app.getPath('appData'), dataDir: process.env.KARVIO_DATA_DIR, defaultMode: require('../package.json').karvioDefaultMode }) === 'online';
app.setName('Karvio');
app.setAppUserModelId('com.karvio.erp');
// Offline data lives in "Karvio Offline"; an older "ShopERP Offline" folder is moved there on first start.
const { offlineDataDir } = require('./data-folder.cjs');
const dataDir = process.env.KARVIO_DATA_DIR ? path.resolve(process.env.KARVIO_DATA_DIR)
  : online ? path.join(app.getPath('appData'), 'Karvio Online') : offlineDataDir(app.getPath('appData'));
fs.mkdirSync(dataDir, { recursive: true });
app.setPath('userData', dataDir);
if (!online) {
  app.commandLine.appendSwitch('disable-background-networking');
  app.commandLine.appendSwitch('disable-component-update');
}
const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
const appUrl = pathToFileURL(indexPath).href;
let runtime, mainWindow;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
  });
  app.whenReady().then(() => {
    try {
      session.defaultSession.setPermissionRequestHandler((_, __, callback) => callback(false));
      if (!online) {
        runtime = new OfflineRuntime({ dataDir, codePath: app.isPackaged
          ? path.join(process.resourcesPath, 'backend', 'Code.gs')
          : path.join(__dirname, '..', '..', 'backend', 'Code.gs') });
        session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] },
          (details, callback) => callback({ cancel: /^(https?|wss?|ftp):/i.test(details.url) }));
        const trusted = (event) => {
          if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame?.url.split('#')[0] !== appUrl)
            throw new Error('Untrusted application request');
        };
        const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
          try { trusted(event); return { ok: true, data: await fn(...args) }; }
          catch (error) { return { ok: false, error: String(error.message || error) }; }
        });
        ipcMain.handle('erp:request', (event, request) => { trusted(event); return runtime.execute(request); });
        handle('erp:storage', (token) => runtime.info(token));
        handle('erp:folder', async (token) => {
          runtime.requireAdmin(token); const error = await shell.openPath(runtime.dataDir);
          if (error) throw new Error(error); return true;
        });
        handle('erp:backup', async (token) => {
          runtime.requireAdmin(token);
          const result = await dialog.showSaveDialog(mainWindow, { title: 'Save Karvio offline backup',
            defaultPath: path.join(app.getPath('documents'), `Karvio-backup-${new Date().toISOString().slice(0, 10)}.json`),
            filters: [{ name: 'Karvio backup', extensions: ['json'] }] });
          return result.canceled || !result.filePath ? { canceled: true } : runtime.exportBackup(token, result.filePath);
        });
        handle('erp:restore', async (token) => {
          runtime.requireAdmin(token);
          const choice = await dialog.showOpenDialog(mainWindow, { title: 'Restore Karvio offline backup',
            properties: ['openFile'], filters: [{ name: 'Karvio backup', extensions: ['json'] }] });
          if (choice.canceled || !choice.filePaths[0]) return { canceled: true };
          const confirm = await dialog.showMessageBox(mainWindow, { type: 'warning', title: 'Restore offline backup?',
            message: 'Replace local data with the selected backup?',
            detail: 'A safety copy will be saved first. You will need to sign in again.',
            buttons: ['Cancel', 'Restore backup'], defaultId: 0, cancelId: 0 });
          return confirm.response !== 1 ? { canceled: true } : runtime.restoreBackup(token, choice.filePaths[0]);
        });
      }
      Menu.setApplicationMenu(null);
      const createWindow = () => {
        mainWindow = new BrowserWindow({ width: 1440, height: 900, minWidth: 1024, minHeight: 640,
          backgroundColor: '#0d1b2a', title: online ? 'Karvio Online' : 'Karvio Offline',
          icon: path.join(__dirname, '..', 'branding', 'linux', '256x256.png'),
          show: process.env.KARVIO_TEST_MODE !== '1', webPreferences: {
            ...(!online ? { preload: path.join(__dirname, 'preload.cjs') } : {}),
            contextIsolation: true, sandbox: true, nodeIntegration: false } });
        mainWindow.loadFile(indexPath);
        mainWindow.webContents.setWindowOpenHandler(({ url }) => {
          if (online && /^https?:\/\//i.test(url)) shell.openExternal(url);
          return { action: 'deny' };
        });
        mainWindow.webContents.on('will-navigate', (event, url) => {
          if (url.split('#')[0] !== appUrl) event.preventDefault();
        });
        mainWindow.on('closed', () => { mainWindow = null; });
      };
      createWindow();
      app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
    } catch (error) {
      dialog.showErrorBox('Karvio could not start', `Your saved data has not been replaced.\n\n${error.message}\n\nData folder: ${dataDir}`);
      app.quit();
    }
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
