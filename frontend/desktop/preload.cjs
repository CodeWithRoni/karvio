const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('karvio', {
  offline: true,
  request: (request) => ipcRenderer.invoke('erp:request', request),
  storageInfo: (token) => ipcRenderer.invoke('erp:storage', token),
  exportBackup: (token) => ipcRenderer.invoke('erp:backup', token),
  restoreBackup: (token) => ipcRenderer.invoke('erp:restore', token),
  openDataFolder: (token) => ipcRenderer.invoke('erp:folder', token)
});
