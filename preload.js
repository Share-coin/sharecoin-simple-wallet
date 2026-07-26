'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sharecoin', {
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('status', listener);
    return () => ipcRenderer.removeListener('status', listener);
  },
  send: (toAddress, amount) => ipcRenderer.invoke('wallet:send', { toAddress, amount }),
  startMining: (workerName) => ipcRenderer.invoke('mining:start', { workerName }),
  stopMining: () => ipcRenderer.invoke('mining:stop'),
  backupWallet: () => ipcRenderer.invoke('wallet:backup'),
  restoreWallet: () => ipcRenderer.invoke('wallet:restore'),
  createWallet: () => ipcRenderer.invoke('wallet:createNew'),
});
