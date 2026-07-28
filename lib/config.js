'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** Small persisted JSON store for local RPC credentials + the wallet's receive address. */
class Config {
  constructor(userDataDir) {
    this.filePath = path.join(userDataDir, 'config.json');
    this.data = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch (err) {
      return {};
    }
  }

  _save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  /** Local-only RPC credentials for our own headless sharecoind, generated once. */
  getRpcCredentials() {
    if (!this.data.rpcUser || !this.data.rpcPassword) {
      this.data.rpcUser = 'sharecoinsimplewallet';
      this.data.rpcPassword = crypto.randomBytes(24).toString('hex');
      this._save();
    }
    return { user: this.data.rpcUser, password: this.data.rpcPassword };
  }

  getAddress() {
    return this.data.address || null;
  }

  setAddress(address) {
    this.data.address = address;
    this._save();
  }

  /** null means no wallet has been created or restored yet - distinct from
   * a wallet that happens to be named 'wallet'. */
  getWalletName() {
    return this.data.walletName || null;
  }

  setWalletName(name) {
    this.data.walletName = name;
    this._save();
  }

  /** Optional user-supplied node to try connecting to, on top of the app's
   * built-in fallback list (see lib/node.js). null means "just use the
   * built-in defaults". */
  getCustomNodeAddress() {
    return this.data.customNodeAddress || null;
  }

  setCustomNodeAddress(address) {
    this.data.customNodeAddress = address || null;
    this._save();
  }
}

module.exports = { Config };
