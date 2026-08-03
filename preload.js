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
  getNodeAddress: () => ipcRenderer.invoke('settings:getNodeAddress'),
  setNodeAddress: (address) => ipcRenderer.invoke('settings:setNodeAddress', { address }),
  // Encodes the bare address (not a bitcoin:/sharecoin: URI) so it's
  // readable by any scanner that recognises a plain Sharecoin address,
  // including the Electrum-SHC mobile app. QR generation happens in the
  // main process (see main.js) since preload runs sandboxed and can't
  // require() arbitrary npm packages like qrcode directly.
  generateAddressQR: (address) => ipcRenderer.invoke('wallet:getAddressQR', address),
});
