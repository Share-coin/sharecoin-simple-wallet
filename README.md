# Sharecoin Simple Wallet

A single, simple desktop app for casual Sharecoin (SHC) users: open it, get
a wallet, click a button, start mining. No config files, no flags, no
understanding what an RPC port or a datadir is.

It's a lightweight Electron companion app that drives the existing,
already-correct Sharecoin backend rather than reimplementing any wallet or
consensus logic:

- Runs `sharecoind` headless in the background, connected to the public
  Sharecoin network.
- Talks to it over its own local JSON-RPC interface for the wallet side -
  address, balance, send.
- A "Start Mining" / "Stop Mining" toggle that runs the bundled
  `kawpowminer` as a subprocess, pointed at your own address, with live
  hashrate.

## Features

- Create a new wallet or restore one from a backup file on first run - no
  wallet-creation dialog otherwise.
- Receive address with one-click copy.
- Confirmed + pending balance.
- Send: address and amount, nothing more.
- One-click GPU mining start/stop with live hashrate.
- Wallet backup and restore.
- Portable: wallet data lives next to the app itself, not scattered across
  the OS - copy it to a USB drive and it comes with you.

## Running from source

```
npm install
npm start
```

## Downloads

Two forms are published under [Releases](https://github.com/Share-coin/sharecoin-simple-wallet/releases):

- **Zip (recommended)** - a plain folder, no installer, no self-extraction.
  Unzip it and run `sharecoin.exe` inside. Carries proper file metadata
  (publisher, description, version) and isn't a self-extracting exe, so
  it's the one less likely to get flagged by antivirus heuristics.
- **Portable exe** - a single self-extracting `sharecoin.exe`, for anyone
  who'd rather not unzip. Some antivirus tools are more suspicious of this
  format purely because it's self-extracting; if yours flags it, use the
  zip instead. Either one is the same app underneath.

## Building a distributable

Two build options are provided, matching the two published forms above:

```
npm run package           # a portable app folder (dist/) - zip it yourself for release
npm run package:portable  # a single self-extracting sharecoin.exe (dist-portable/)
```

Both bundle the third-party binaries in `resources/bin/` automatically -
see [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for what's included
and why.

## Requirements to actually mine

An NVIDIA GPU with a working CUDA driver. The bundled `kawpowminer` is the
CUDA build; there is no CPU fallback.

## License

App code (`main.js`, `preload.js`, `lib/`, `renderer/`) is MIT licensed -
see [LICENSE](LICENSE). The bundled third-party binaries in `resources/bin/`
carry their own licenses (MIT and GPL-3.0) - see
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
