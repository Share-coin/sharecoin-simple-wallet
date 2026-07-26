'use strict';

const path = require('path');
const { spawn } = require('child_process');

const STRATUM_HOST = 'sharecoin.duckdns.org:10000';

// kawpowminer's real per-interval log line looks like:
//   " m 07:59:10 <unknown> 0:00 A0 32.24 Mh - cu0 32.24"
// The aggregate rate always follows "A<accepted-count>" and is suffixed
// with an SI prefix + lowercase "h" (no "/s"), e.g. "32.24 Mh" or "0.00 h".
const HASHRATE_RE = /A\d+\s+([\d.]+)\s*([KMGT]?)h\b/i;

/** Runs the bundled kawpowminer as a subprocess, pointed at the user's own
 * address against the public stratum endpoint, and parses its live hashrate. */
class Miner {
  constructor({ binDir, log }) {
    this.binDir = binDir;
    this.log = log || (() => {});
    this.process = null;
    this.hashrate = null;
  }

  get running() {
    return !!this.process && this.process.exitCode === null;
  }

  start(address, workerName) {
    if (this.running) return;

    const exe = path.join(this.binDir, 'kawpowminer', 'kawpowminer.exe');
    const worker = (workerName || 'wallet').replace(/[^a-zA-Z0-9_-]/g, '') || 'wallet';
    const url = `stratum+tcp://${address}.${worker}@${STRATUM_HOST}`;
    const args = ['-P', url, '--cu-schedule', 'spin', '--cu-parallel-hash', '8', '--cu-streams', '4', '--display-interval', '2'];

    this.hashrate = null;
    this.process = spawn(exe, args, { cwd: path.join(this.binDir, 'kawpowminer'), windowsHide: true });

    const handleOutput = (chunk) => {
      const text = chunk.toString();
      this.log(`[kawpowminer] ${text}`);
      const match = text.match(HASHRATE_RE);
      if (match) {
        const value = parseFloat(match[1]);
        const unit = (match[2] || '').toUpperCase();
        const multiplier = { '': 1, K: 1e3, M: 1e6, G: 1e9, T: 1e12 }[unit];
        this.hashrate = value * multiplier;
      }
    };

    this.process.stdout.on('data', handleOutput);
    this.process.stderr.on('data', handleOutput);
    this.process.on('exit', (code) => {
      this.log(`[kawpowminer] exited with code ${code}`);
      this.process = null;
      this.hashrate = null;
    });
  }

  stop() {
    if (!this.running) return;
    this.process.kill();
  }
}

module.exports = { Miner };
