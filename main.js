'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { Config } = require('./lib/config');
const { SharecoinNode } = require('./lib/node');
const { Miner } = require('./lib/miner');
const QRCode = require('qrcode');

const RPC_PORT = 19802;
const STATUS_POLL_MS = 5000;

const BIN_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'bin')
  : path.join(__dirname, 'resources', 'bin');

// Portable by design: wallet/config/blockchain data lives next to the real
// exe, not the OS's per-user AppData, so copying it (or a whole packaged
// folder) to a USB drive carries the wallet with it. Only applies once
// packaged; dev runs (`npm start`) keep Electron's normal default so they
// don't write into node_modules/electron's own install location.
//
// The single-exe NSIS "portable" build self-extracts to a fresh temp folder
// on every launch, so `app.getPath('exe')` there points at that throwaway
// copy, not the real file - using it would silently lose the wallet between
// runs. electron-builder's portable wrapper sets PORTABLE_EXECUTABLE_DIR to
// the *actual* exe's folder specifically to solve this; prefer it when set.
if (app.isPackaged) {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'));
  app.setPath('userData', path.join(portableDir, 'data'));
}

let mainWindow;
let node;
let miner;
let config;
let statusTimer;
let walletAddress;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 640,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function pushStatus(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

async function pollStatus() {
  try {
    const status = await node.getStatus(walletAddress);
    pushStatus('status', { ok: true, ...status, mining: miner.running, hashrate: miner.hashrate });
  } catch (err) {
    pushStatus('status', { ok: false, error: err.message });
  }
}

app.whenReady().then(async () => {
  config = new Config(app.getPath('userData'));
  const { user, password } = config.getRpcCredentials();

  node = new SharecoinNode({
    binDir: BIN_DIR,
    dataDir: path.join(app.getPath('userData'), 'node-data'),
    rpcPort: RPC_PORT,
    rpcUser: user,
    rpcPassword: password,
    walletName: config.getWalletName(),
    customNodeAddress: config.getCustomNodeAddress(),
    log: (line) => console.log(line.toString().trimEnd()),
  });
  miner = new Miner({
    binDir: BIN_DIR,
    log: (line) => console.log(line.toString().trimEnd()),
  });

  createWindow();

  try {
    await node.start();
    if (config.getWalletName()) {
      walletAddress = await node.getOrCreateAddress(config);
      statusTimer = setInterval(pollStatus, STATUS_POLL_MS);
      pollStatus();
    } else {
      // First run: no wallet yet. Renderer shows Create/Restore instead of
      // the dashboard until one of those IPC handlers below fires.
      pushStatus('status', { ok: true, needsWallet: true });
    }
  } catch (err) {
    pushStatus('status', { ok: false, error: err.message });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (event) => {
  if (!node && !miner) return;
  event.preventDefault();
  clearInterval(statusTimer);
  if (miner) miner.stop();
  if (node) await node.stop();
  node = null;
  miner = null;
  app.quit();
});

ipcMain.handle('settings:getNodeAddress', () => {
  return { address: config.getCustomNodeAddress() || '' };
});

ipcMain.handle('settings:setNodeAddress', (_event, { address }) => {
  config.setCustomNodeAddress(address ? address.trim() : null);
  return { saved: true };
});

// Encodes the bare address (not a bitcoin:/sharecoin: URI) so it's readable
// by any scanner that recognises a plain Sharecoin address, including the
// Electrum-SHC mobile app.
ipcMain.handle('wallet:getAddressQR', (_event, address) => {
  return QRCode.toDataURL(address, { margin: 1, width: 240 });
});

ipcMain.handle('wallet:send', async (_event, { toAddress, amount }) => {
  const txid = await node.send(toAddress, amount);
  return { txid };
});

ipcMain.handle('mining:start', (_event, { workerName }) => {
  if (!walletAddress) throw new Error('No receive address yet - wait for the node to finish starting.');
  miner.start(walletAddress, workerName);
  return { started: true };
});

ipcMain.handle('mining:stop', () => {
  miner.stop();
  return { stopped: true };
});

ipcMain.handle('wallet:backup', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Backup Sharecoin Wallet',
    defaultPath: `sharecoin-wallet-backup-${new Date().toISOString().slice(0, 10)}.dat`,
    filters: [{ name: 'Wallet Backup', extensions: ['dat'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  await node.backup(result.filePath);
  return { canceled: false, path: result.filePath };
});

ipcMain.handle('wallet:createNew', async () => {
  await node.createWallet('wallet');
  config.setWalletName('wallet');
  walletAddress = await node.getOrCreateAddress(config);

  statusTimer = setInterval(pollStatus, STATUS_POLL_MS);
  pollStatus();

  return { created: true };
});

ipcMain.handle('wallet:restore', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Restore Sharecoin Wallet From Backup',
    properties: ['openFile'],
    filters: [{ name: 'Wallet Backup', extensions: ['dat', '*'] }],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };

  if (miner.running) miner.stop();
  clearInterval(statusTimer);

  const newWalletName = `restored-${Date.now()}`;
  await node.restore(result.filePaths[0], newWalletName);
  config.setWalletName(newWalletName);
  walletAddress = await node.addressAfterRestore(config);

  statusTimer = setInterval(pollStatus, STATUS_POLL_MS);
  pollStatus();

  return { canceled: false, walletName: newWalletName };
});
