const { app, BrowserWindow, Menu, shell, ipcMain, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');


const { desktopMode } = require('./mode.cjs');
const online = desktopMode({ args: process.argv, appData: app.getPath('appData'), dataDir: process.env.KARVIO_DATA_DIR, defaultMode: require('../package.json').karvioDefaultMode }) === 'online';
app.setName('Karvio');
app.setAppUserModelId('com.karvio.erp');
// Leave legacy offline data untouched.
const dataDir = path.join(app.getPath('appData'), 'Karvio Online');
fs.mkdirSync(dataDir, { recursive: true });
app.setPath('userData', dataDir);
const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
const appUrl = pathToFileURL(indexPath).href;
let mainWindow;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
  });
  app.whenReady().then(() => {
    try {
      session.defaultSession.setPermissionRequestHandler((_, __, callback) => callback(false));
      Menu.setApplicationMenu(null);
      const createWindow = () => {
        mainWindow = new BrowserWindow({ width: 1440, height: 900, minWidth: 1024, minHeight: 640,
          backgroundColor: '#0d1b2a', title: 'Karvio Online',
          icon: path.join(__dirname, '..', 'branding', 'linux', '256x256.png'),
          show: process.env.KARVIO_TEST_MODE !== '1', webPreferences: {
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
