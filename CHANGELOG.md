# Changelog

## 0.2.0 - 2026-08-17

### Added

- Add `--jsgotty`, `--jsmdcui`, and `--musl-la` as the first argument to
  `bin/init.js` to spawn that app directly, forwarding every remaining
  argument to it and exiting with its exit code. This bypasses the shell and
  startup-command flow entirely, and lets `--jsgotty --help` (and the same for
  the other two) show the app's own option reference instead of Buninu's.
- Add `buninu-help`, a POSIX and Windows multicall command that renders
  README.md with jsmdcui's `--cat` mode and then displays `icon.png` with
  jsgotty's `--viu`. The default startup greeting now points to it instead of
  separately mentioning `glow`/`README.md`.

### Security

- Bind jsgotty to `127.0.0.1` by default instead of `0.0.0.0` in
  `scripts.start`. Previously the terminal server accepted connections from
  any device able to reach the host on its network, relying only on the
  random port and `--random-url` path segment for protection. Pass
  `--address <value>` through to `bin/init.js` (forwarded arguments override
  the flags baked into `scripts.start`) to opt back into listening on other
  interfaces.

## 0.1.9 - 2026-08-17

### Fixed

- Correct `apps/musl-la/NOTICE`: it listed 11 third-party components
  (llama.cpp, nghttp2/nghttp3, OpenSSL, libssh2, curl, zlib, libidn2,
  libunistring, brotli, c-ares, libpsl) with no corresponding files anywhere
  in the package — leftover from an unrelated bundle. The only files actually
  shipped in that directory are `ld-musl-aarch64.so.1`, `libgcc_s.so.1`, and
  `libstdc++.so.6`; the notice now covers only those, identifying the exact
  build (GCC 14.2.0, packaged as Alpine Linux 3.22's `libgcc`/`libstdc++`
  14.2.0-r6, aarch64) with matching SHA-256 hashes and a link to Alpine's
  build recipe pinned to the commit for that package revision, satisfying the
  GCC Runtime Library Exception's corresponding-source requirement.

## 0.1.8 - 2026-08-17

### Changed

- Run an optional `libmain.so` from Android's native-library PATH at startup,
  falling back to the normal Android welcome message when it is unavailable.

## 0.1.7 - 2026-08-17

### Added

- Add `buninu --export [output.tgz]` to create a gzip-compressed tar archive of
  the current Buninu installation. The archive retains exactly one top-level
  directory and defaults to `./buninu.tgz`. An existing output is backed up and
  restored if archive creation or replacement fails.
- Add `apps/cmdlist` as the validated source of POSIX multicall commands.
  Normal startup now recreates every listed command as a `shloader` symlink,
  including after npm installs that omit package symlinks.
- Add the Buninu-only `# syntax: markdown` first-line marker for Markdown
  highlighting in extensionless files such as `apps/cmdlist`.

### Changed

- Update the default and Android startup greetings to point users to
  `glow apps/cmdlist`.
- Update `musl-la` to prefer Android's native `libld-musl.so`, fall back to the
  bundled loader, add the target ELF directory and existing `LD_LIBRARY_PATH`
  to its library search path, and support `-e` for the environment-variable
  launch mode.
- Document how to add POSIX multicall commands and their separate Windows
  batch launchers.

### Fixed

- Keep the POSIX startup wrapper and Android greeting command on one line so
  process listings do not expose embedded LF (`Ctrl+J`) characters.

## 0.1.5 - 2026-08-16

### Fixed

- Enable jsmdcui's mdcui encoding for `--cdp-maze`, which selects the bundled
  Markdown maze without passing a `.md` filename or a `--demo*` argument.

### Changed

- Prefer PowerShell (`pwsh.exe`, then `powershell.exe`) as the default Windows
  shell, falling back to `%COMSPEC%` or `cmd.exe` when PowerShell is unavailable.

## 0.1.4 - 2026-08-16

### Changed

- Enable jsmdcui's mdcui encoding when any launcher argument begins with
  `--demo`, in addition to the existing `.md` file detection.
- Run jsmdcui's `src/index.js` entry point directly from the Unix and Windows
  `jsmdcui`, `jmi`, and `glow` launchers instead of going through its `tui`
  wrapper. This gives demos such as `--demo-img-change` the expected `Bun.main`
  path so their bundled image assets can be resolved correctly.

## 0.1.3 - 2026-08-16

### Fixed

- Preserve a single canonical child-process path variable: `Path` on Windows
  and `PATH` on other platforms. This ensures the Buninu `bin` directory is
  available inside the shell started by jsgotty on Windows.
- Keep the jsgotty reconnect overlay clickable in WebGL mode by placing it
  above the canvas and preventing Kitty image pointer handling from intercepting
  its mouse and touch events.

### Changed

- Enable jsmdcui's mdcui encoding from the Unix and Windows launchers only when
  at least one command-line argument is a `.md` file. Launching without a
  Markdown file now retains the editor-first behavior.
