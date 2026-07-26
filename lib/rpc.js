'use strict';

const http = require('http');

class RpcError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** Minimal JSON-RPC client for sharecoind's HTTP RPC interface. */
class RpcClient {
  constructor({ port, user, password, host = '127.0.0.1' }) {
    this.port = port;
    this.user = user;
    this.password = password;
    this.host = host;
  }

  call(method, params = []) {
    const body = JSON.stringify({ jsonrpc: '1.0', id: 'sharecoin-simple-wallet', method, params });
    const auth = Buffer.from(`${this.user}:${this.password}`).toString('base64');

    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: this.host,
          port: this.port,
          method: 'POST',
          path: '/',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${auth}`,
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 10000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch (err) {
              reject(new RpcError(`Bad RPC response: ${data.slice(0, 200)}`, res.statusCode));
              return;
            }
            if (parsed.error) {
              reject(new RpcError(parsed.error.message, parsed.error.code));
              return;
            }
            resolve(parsed.result);
          });
        }
      );
      req.on('timeout', () => req.destroy(new RpcError('RPC request timed out')));
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

module.exports = { RpcClient, RpcError };
