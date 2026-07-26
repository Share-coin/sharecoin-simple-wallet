# Third-party binaries bundled with this app

This app bundles two third-party executables under `resources/bin/` so a
casual user never has to download or place anything manually.

## kawpowminer (GPU mining)

- Source: https://github.com/RavenCommunity/kawpowminer
- License: **GPL-3.0** (fork of ethminer, same license)
- Bundled unmodified at `resources/bin/kawpowminer/kawpowminer.exe`, along
  with its own copy of the license at
  `resources/bin/kawpowminer/LICENSE` and the CUDA runtime DLLs it needs
  (`nvrtc64_112_0.dll`, `nvrtc-builtins64_112.dll`), also unmodified.
- This app runs it only as a separate subprocess (never links against its
  code), and distributes it with the GPL-3.0 license text included
  alongside the binary as required. Corresponding source for the exact
  bundled version is available at the repository above.

## sharecoind / sharecoin-cli (wallet node)

- Source: fork of Bitcoin Core, https://github.com/bitcoin/bitcoin
- License: **MIT**
- Bundled unmodified at `resources/bin/sharecoind.exe` and
  `resources/bin/sharecoin-cli.exe`. MIT imposes no redistribution
  obligations beyond preserving copyright notice, which the binaries
  themselves already print (`--version`).

---

Note for maintainers: bundling `kawpowminer` is a deliberate, one-off
departure from this project's usual "never bundle the miner" release
habit (see the Sharecoin monorepo's own notes) - that habit exists
specifically to avoid GPL-3.0 redistribution obligations, which this app
takes on instead in exchange for a true one-click first run. Don't treat
this file's approach as precedent for other releases without re-checking
the same tradeoff.
