'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { RpcClient } = require('./rpc');

// Built-in fallback peers, tried in addition to each other (not exclusive):
// the DNS name first, then direct IPs for both Oracle instances so the
// wallet still reaches the network even if sharecoin.duckdns.org - or
// DuckDNS itself - is ever unreachable. Deliberately `-addnode=`, not
// `-connect=`: `-connect` puts sharecoind into exclusive manual-connection
// mode, which also silently disables the compiled-in DNS-seed peer
// discovery - `-addnode` adds peers without turning that off, so the
// compiled-in seed is a fourth fallback layer for free.
const FALLBACK_NODES = [
  'sharecoin.duckdns.org:8443',
  '145.241.202.13:8443', // Oracle primary
  '79.72.76.95:8443', // Oracle secondary
];

/** Runs sharecoind headless, pointed at the live public Sharecoin network, and
 * exposes the handful of wallet RPCs this app needs (address/balance/send). */
class SharecoinNode {
  constructor({ binDir, dataDir, rpcPort, rpcUser, rpcPassword, walletName, customNodeAddress, log }) {
    this.binDir = binDir;
    this.dataDir = dataDir;
    this.rpcPort = rpcPort;
    this.walletName = walletName || null;
    this.customNodeAddress = customNodeAddress || null;
    this.log = log || (() => {});
    this.rpc = new RpcClient({ port: rpcPort, user: rpcUser, password: rpcPassword });
    this.process = null;
  }

  async start() {
    fs.mkdirSync(this.dataDir, { recursive: true });

    const exe = path.join(this.binDir, 'sharecoind.exe');
    // User-supplied address (if set) is added on top of the built-in list,
    // never in place of it - a typo'd custom address can't strand the app
    // with no way to reach the network.
    const nodes = this.customNodeAddress ? [this.customNodeAddress, ...FALLBACK_NODES] : FALLBACK_NODES;
    const args = [
      `-datadir=${this.dataDir}`,
      ...nodes.map((addr) => `-addnode=${addr}`),
      '-prune=550',
      '-fallbackfee=0.0001',
      '-listen=0',
      '-server=1',
      `-rpcport=${this.rpcPort}`,
      `-rpcuser=${this.rpc.user}`,
      `-rpcpassword=${this.rpc.password}`,
      '-rpcbind=127.0.0.1',
      '-rpcallowip=127.0.0.1',
    ];
    if (this.walletName) args.push(`-wallet=${this.walletName}`);

    this.process = spawn(exe, args, { windowsHide: true });
    this.process.stdout.on('data', (chunk) => this.log(`[sharecoind] ${chunk}`));
    this.process.stderr.on('data', (chunk) => this.log(`[sharecoind:err] ${chunk}`));
    this.process.on('exit', (code) => this.log(`[sharecoind] exited with code ${code}`));

    await this._waitForRpc();
    // No wallet chosen yet (first run, before Create/Restore) - nothing more
    // to load. main.js drives wallet creation/restore explicitly from here.
    if (this.walletName) await this._ensureWalletLoaded();
  }

  async _waitForRpc(retries = 60, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        await this.rpc.call('getblockchaininfo');
        return;
      } catch (err) {
        if (this.process.exitCode !== null) {
          throw new Error('sharecoind exited before RPC became ready');
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw new Error('Timed out waiting for sharecoind RPC to come up');
  }

  async _ensureWalletLoaded() {
    const wallets = await this.rpc.call('listwallets');
    if (wallets.includes(this.walletName)) return;

    try {
      await this.rpc.call('loadwallet', [this.walletName]);
    } catch (err) {
      // Wallet doesn't exist on disk yet - create it.
      await this.rpc.call('createwallet', [this.walletName]);
    }
  }

  /** Explicit "Create New Wallet" path - only ever called once the user
   * chooses it on the first-run screen, never automatically. */
  async createWallet(name) {
    await this.rpc.call('createwallet', [name]);
    this.walletName = name;
  }

  async getOrCreateAddress(config) {
    const existing = config.getAddress();
    if (existing) return existing;

    const address = await this.rpc.call('getnewaddress', ['', 'bech32']);
    config.setAddress(address);
    return address;
  }

  /** After a restore, show the same address this app would have generated
   * first for this wallet (index 0 of its bech32 receive descriptor),
   * rather than minting a new one via getnewaddress. Deriving it directly
   * from the descriptor - instead of looking at transaction history - is
   * deliberate: `restorewallet`'s rescan runs in the background and can
   * take many seconds after the RPC call already returned (observed 17s
   * for a ~1000-block rescan), so checking history immediately after
   * restore() resolves is a race that reliably loses; the descriptor is
   * available the instant the wallet loads, no rescan required. */
  async addressAfterRestore(config) {
    const descriptors = await this.rpc.call('listdescriptors').catch(() => null);
    const bech32Desc = descriptors && descriptors.descriptors.find((d) => !d.internal && d.desc.startsWith('wpkh('));

    let address = bech32Desc && (await this.rpc.call('deriveaddresses', [bech32Desc.desc, [0, 0]]).catch(() => null))?.[0];
    if (!address) {
      address = await this.rpc.call('getnewaddress', ['', 'bech32']);
    }

    config.setAddress(address);
    return address;
  }

  async getStatus(address) {
    const [balances, chainInfo, received] = await Promise.all([
      this.rpc.call('getbalances'),
      this.rpc.call('getblockchaininfo'),
      this.rpc.call('listreceivedbyaddress', [0, false, false, address]).catch(() => []),
    ]);

    return {
      address,
      confirmed: balances.mine.trusted,
      pending: balances.mine.untrusted_pending + (balances.mine.immature || 0),
      blocks: chainInfo.blocks,
      headers: chainInfo.headers,
      verificationProgress: chainInfo.verificationprogress,
      addressTxCount: received.length ? received[0].txids.length : 0,
    };
  }

  async send(toAddress, amount) {
    return this.rpc.call('sendtoaddress', [toAddress, amount]);
  }

  async backup(destPath) {
    return this.rpc.call('backupwallet', [destPath]);
  }

  /** Unloads the currently active wallet and loads `backupFile` as a new,
   * distinctly-named wallet via the fork's `restorewallet` RPC - which also
   * rescans the chain for that wallet's history. Never touches the old
   * wallet's on-disk files, so a failed/cancelled restore can't lose data.
   *
   * `load_on_startup: false` on both calls is deliberate: sharecoind has its
   * own persistent "wallets to auto-load" list (settings.json) independent
   * of our own `-wallet=` startup flag, and it only ever grows unless told
   * otherwise - passing true here once meant every past restore left its
   * old wallet name auto-loading forever, until multiple wallets ended up
   * loaded at once and every wallet RPC started failing with "Multiple
   * wallets are loaded". Our app already decides which single wallet to
   * load at startup itself (`config.getWalletName()` + `-wallet=`), so we
   * don't need sharecoind's own list at all. */
  async restore(backupFile, newWalletName) {
    if (this.walletName) {
      await this.rpc.call('unloadwallet', [this.walletName, false]).catch(() => {});
    }
    const result = await this.rpc.call('restorewallet', [newWalletName, backupFile, false]);
    this.walletName = newWalletName;
    return result;
  }

  async stop() {
    if (!this.process || this.process.exitCode !== null) return;
    try {
      await this.rpc.call('stop');
    } catch (err) {
      // fall through to force-kill below
    }
    await new Promise((resolve) => {
      if (this.process.exitCode !== null) return resolve();
      this.process.once('exit', resolve);
      setTimeout(() => {
        if (this.process.exitCode === null) this.process.kill();
        resolve();
      }, 15000);
    });
  }
}

module.exports = { SharecoinNode };
