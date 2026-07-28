'use strict';

const syncPill = document.getElementById('sync-pill');
const balanceConfirmedEl = document.getElementById('balance-confirmed');
const balancePendingEl = document.getElementById('balance-pending');
const addressEl = document.getElementById('address');
const copyButton = document.getElementById('copy-address');
const sendTo = document.getElementById('send-to');
const sendAmount = document.getElementById('send-amount');
const sendButton = document.getElementById('send-button');
const sendStatus = document.getElementById('send-status');
const miningToggle = document.getElementById('mining-toggle');
const hashrateEl = document.getElementById('hashrate');
const backupButton = document.getElementById('backup-button');
const restoreButton = document.getElementById('restore-button');
const backupStatus = document.getElementById('backup-status');
const welcomeSection = document.getElementById('welcome');
const dashboardSection = document.getElementById('dashboard');
const createWalletButton = document.getElementById('create-wallet-button');
const welcomeRestoreButton = document.getElementById('welcome-restore-button');
const welcomeStatus = document.getElementById('welcome-status');
const nodeAddressInput = document.getElementById('node-address');
const nodeAddressSaveButton = document.getElementById('node-address-save');
const nodeAddressStatus = document.getElementById('node-address-status');

let isMining = false;
let sending = false;

function formatShc(amount) {
  return `${Number(amount).toFixed(8)} SHC`;
}

function formatHashrate(hz) {
  if (!hz || hz <= 0) return 'Not mining';
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s'];
  let value = hz;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex++;
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

window.sharecoin.onStatus((status) => {
  if (!status.ok) {
    syncPill.textContent = 'Error';
    syncPill.classList.remove('synced');
    return;
  }

  if (status.needsWallet) {
    welcomeSection.style.display = '';
    dashboardSection.style.display = 'none';
    syncPill.textContent = 'Ready';
    return;
  }
  welcomeSection.style.display = 'none';
  dashboardSection.style.display = '';

  addressEl.value = status.address || '';
  balanceConfirmedEl.textContent = formatShc(status.confirmed);
  balancePendingEl.textContent = formatShc(status.pending);

  const progressPct = Math.min(100, (status.verificationProgress || 0) * 100);
  if (progressPct >= 99.9) {
    syncPill.textContent = 'Synced';
    syncPill.classList.add('synced');
  } else {
    syncPill.textContent = `Syncing… ${progressPct.toFixed(1)}%`;
    syncPill.classList.remove('synced');
  }

  isMining = status.mining;
  miningToggle.textContent = isMining ? 'Stop Mining' : 'Start Mining';
  miningToggle.classList.toggle('running', isMining);
  hashrateEl.textContent = isMining ? formatHashrate(status.hashrate) : 'Not mining';
});

copyButton.addEventListener('click', async () => {
  if (!addressEl.value) return;
  await navigator.clipboard.writeText(addressEl.value);
  copyButton.textContent = 'Copied!';
  setTimeout(() => (copyButton.textContent = 'Copy'), 1500);
});

sendButton.addEventListener('click', async () => {
  if (sending) return;
  const toAddress = sendTo.value.trim();
  const amount = parseFloat(sendAmount.value);

  sendStatus.textContent = '';
  sendStatus.className = 'status-msg';

  if (!toAddress || !amount || amount <= 0) {
    sendStatus.textContent = 'Enter a valid address and amount.';
    sendStatus.classList.add('error');
    return;
  }

  sending = true;
  sendButton.disabled = true;
  try {
    const result = await window.sharecoin.send(toAddress, amount);
    sendStatus.textContent = `Sent! txid: ${result.txid}`;
    sendStatus.classList.add('success');
    sendTo.value = '';
    sendAmount.value = '';
  } catch (err) {
    sendStatus.textContent = err.message || 'Send failed.';
    sendStatus.classList.add('error');
  } finally {
    sending = false;
    sendButton.disabled = false;
  }
});

miningToggle.addEventListener('click', async () => {
  miningToggle.disabled = true;
  try {
    if (isMining) {
      await window.sharecoin.stopMining();
    } else {
      await window.sharecoin.startMining('wallet');
    }
  } catch (err) {
    hashrateEl.textContent = err.message || 'Mining error.';
  } finally {
    miningToggle.disabled = false;
  }
});

backupButton.addEventListener('click', async () => {
  backupStatus.textContent = '';
  backupStatus.className = 'status-msg';
  backupButton.disabled = true;
  try {
    const result = await window.sharecoin.backupWallet();
    if (!result.canceled) {
      backupStatus.textContent = `Backed up to ${result.path}`;
      backupStatus.classList.add('success');
    }
  } catch (err) {
    backupStatus.textContent = err.message || 'Backup failed.';
    backupStatus.classList.add('error');
  } finally {
    backupButton.disabled = false;
  }
});

restoreButton.addEventListener('click', async () => {
  const confirmed = confirm(
    'Restoring will replace the wallet this app currently uses with the one in your backup file. ' +
      'Your current wallet is not deleted, but its address will no longer be shown here. Continue?'
  );
  if (!confirmed) return;

  backupStatus.textContent = '';
  backupStatus.className = 'status-msg';
  restoreButton.disabled = true;
  try {
    const result = await window.sharecoin.restoreWallet();
    if (!result.canceled) {
      backupStatus.textContent = 'Wallet restored - rescanning for your balance and history.';
      backupStatus.classList.add('success');
    }
  } catch (err) {
    backupStatus.textContent = err.message || 'Restore failed.';
    backupStatus.classList.add('error');
  } finally {
    restoreButton.disabled = false;
  }
});

createWalletButton.addEventListener('click', async () => {
  welcomeStatus.textContent = '';
  welcomeStatus.className = 'status-msg';
  createWalletButton.disabled = true;
  welcomeRestoreButton.disabled = true;
  try {
    await window.sharecoin.createWallet();
    // Dashboard appears automatically on the next status push.
  } catch (err) {
    welcomeStatus.textContent = err.message || 'Could not create wallet.';
    welcomeStatus.classList.add('error');
    createWalletButton.disabled = false;
    welcomeRestoreButton.disabled = false;
  }
});

window.sharecoin.getNodeAddress().then((result) => {
  nodeAddressInput.value = result.address || '';
});

nodeAddressSaveButton.addEventListener('click', async () => {
  nodeAddressStatus.textContent = '';
  nodeAddressStatus.className = 'status-msg';
  nodeAddressSaveButton.disabled = true;
  try {
    await window.sharecoin.setNodeAddress(nodeAddressInput.value.trim());
    nodeAddressStatus.textContent = 'Saved - restart the app to apply.';
    nodeAddressStatus.classList.add('success');
  } catch (err) {
    nodeAddressStatus.textContent = err.message || 'Could not save.';
    nodeAddressStatus.classList.add('error');
  } finally {
    nodeAddressSaveButton.disabled = false;
  }
});

welcomeRestoreButton.addEventListener('click', async () => {
  welcomeStatus.textContent = '';
  welcomeStatus.className = 'status-msg';
  createWalletButton.disabled = true;
  welcomeRestoreButton.disabled = true;
  try {
    const result = await window.sharecoin.restoreWallet();
    if (result.canceled) {
      createWalletButton.disabled = false;
      welcomeRestoreButton.disabled = false;
    }
    // Otherwise dashboard appears automatically on the next status push.
  } catch (err) {
    welcomeStatus.textContent = err.message || 'Restore failed.';
    welcomeStatus.classList.add('error');
    createWalletButton.disabled = false;
    welcomeRestoreButton.disabled = false;
  }
});
