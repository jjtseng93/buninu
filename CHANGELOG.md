# Changelog

## 0.2.4 - 2026-08-19

### Added

- Add the `xdg-open` command (`apps/xdg-open`), which opens a file or URL
  with whatever the platform considers its default handler: native-bridge's
  `xdgOpen` on Android (the host resolves a path under Buninu's home and
  hands it to another app through a read-only `content://` provider, since
  that directory is otherwise private to the APK), `termux-open` when
  running under plain Termux with no native bridge, `open` on macOS, `start`
  on Windows, and the real system `xdg-open` on Linux. That last one skips
  Buninu's own `bin` while searching `PATH`, since this script is itself
  registered as `xdg-open` and would otherwise find and run itself.
- Add `showimg`, a `bin/`-only shorthand for `jsgotty --viu` (no `apps/`
  subfolder, since it has no logic of its own beyond forwarding args).
- Add `rz`/`sz`, `bin/`-only companion scripts wrapping the existing
  `apps/jsgotty/rz.js`/`sz.js` -- `rz` uploads a file over ZMODEM, `sz`
  downloads one -- over the same terminal connection jsgotty renders in a
  browser or WebView.

- Add `apps/native-bridge`, a Bun module (`toast`, `clipboardRead`/`getcb`,
  `clipboardWrite`/`setcb`, and the raw `call(func, args, envp)` it and the
  CLI both sit on top of) that reaches minapk's Android native bridge over
  `PKG_BRIDGE_SOCK` -- a Bun unix socket, filesystem-path or Linux
  abstract-namespace depending on how that env var is encoded -- using
  jsmdcui's `rpc.mjs` `switchBackend`. Only meaningful inside an APK built by
  minapk with the native bridge wired in; elsewhere `available()` returns
  `false` and calls throw a clear error instead of doing nothing silently.
  Every call times out after 5s by default, so a stuck or unresponsive host
  can never hang the caller. `bun apps/native-bridge/native-bridge.js [func]
  [args...]` runs it directly; a bare invocation defaults `func` to
  `_discover` and lists what the host implements.
- Add the `xclip` command (`apps/xclip`), ported from the DroidScript-era
  `../tmpk/bin/xclip.sh` to use native-bridge instead of `dsapi.pipe`.
  `-selection primary` (the default) stays local-file-only, matching real X11
  semantics where the primary selection is never the same thing as the
  clipboard; `-selection clipboard`/`-clip` bridges to the real Android
  clipboard through native-bridge. jsmdcui's own clipboard backend detection
  already shells out to `xclip` on Linux-like platforms (`isLinuxLike()`
  counts `process.platform === "android"`), so jsmdcui's middle-click paste,
  selection auto-sync, and `PastePrimary` command all work inside an APK with
  no further wiring once `xclip` is on `PATH`.
- Add `speak`/`ttsStatus`/`tts` to native-bridge and the `tts` command
  (`apps/tts`) built on them. Android's TextToSpeech completion signal is an
  asynchronous callback with no way to push it to the far side over this
  protocol, so `speak(text, speed, pitch, flush)` never blocks -- it returns
  a handle immediately, and `ttsStatus(handle)`/`tts(handle)` (`"speaking"`,
  `"done"`, `"error"`, or `"unknown"` once a terminal state has already been
  consumed) is polled to find out when it finishes. `pitch`/`speed` both
  default to `1.0` (normal), the same convention as `termux-tts-speak`'s
  `-p`/`-r`; native-bridge passes them straight to `TextToSpeech.setPitch()`/
  `setSpeechRate()` with no unit conversion. `tts <text>` wraps the polling
  loop for the common case, blocking the calling process until speech
  finishes -- the same as any other CLI tool that waits for the thing it
  started, and, like real TTS tooling (espeak-ng has no timeout concept at
  all; Windows SAPI's `WaitUntilDone` documents `-1`/infinite as the default),
  waits as long as it takes with no wall-clock cap by default. Pass
  `--timeout <ms>` to opt into a bounded wait instead, or `-a`/`--async` to
  not wait at all. `--pitch`/`--speed` override the environment; without
  them, `tts` reads `$TTS_PITCH`/`$TTS_SPEED` itself (falling back to `1` for
  either that is unset), so jsmdcui's own `TTS_PITCH`/`TTS_SPEED` convention
  (which it sets on `Bun.env` before spawning a TTS command, inherited here
  like any other child process env var) is honored automatically -- jsmdcui's
  own `detectTtsCmd()` already falls back to a bare `Bun.which("tts")` after
  termux-tts-speak/espeak-ng/espeak, which this `tts` now satisfies, but that
  particular fallback branch passes no `-p`/`-r`-equivalent flags at all, so
  reading the env vars directly here is the only way `tts`'s pitch/speed
  actually reaches Android's TTS engine through that path.
- Give `xclip` and `tts` a real fallback on non-Android platforms too, since
  Buninu is cross-OS, not Android-only. `xclip`'s `-selection clipboard`
  register now also tries jsmdcui's own `ClipboardManager`
  (`src/platform/clipboard.js`, imported directly rather than reimplemented)
  on win32/darwin, then `wl-copy`/`wl-paste` on Linux; `tts` gains a
  `detectTtsCmd()` copied verbatim from jsmdcui's `src/index.js` (same
  pitch/speed/lang math and command construction, including the win32
  PowerShell/SAPI SSML branch, copied rather than hand-retyped since that
  quoting is easy to silently break and this had no Windows machine to
  verify it on) covering termux-tts-speak/say/PowerShell/espeak-ng/espeak.
  Both deliberately skip the one path that would reintroduce the exact
  self-reference risk they otherwise avoid: `ClipboardManager`'s Linux-like
  branch searches PATH for a binary named `xclip`, and jsmdcui's own
  `detectTtsCmd()` ends with a `Bun.which("tts")` fallback -- since these two
  commands are themselves registered as Buninu's `xclip`/`tts`, ahead of
  anything else of the same name on PATH, using either the way jsmdcui does
  from inside xclip.js/tts.js would just be each script invoking itself.
- Add `bin/*.bat` launchers for the new commands (`native-bridge`, `xclip`,
  `tts`, `showimg`, `rz`, `sz`, `xdg-open`). POSIX platforms get their
  `bin/<name>` entries as symlinks rebuilt by `bin/init.js` on startup,
  which Windows cannot use, so each command needs its own `.bat` there.

### Changed

- Update the bundled jsmdcui to 0.18.1, which adds `switchBackend()` to
  `src/cui/rpc.mjs` so an RPC caller can point at something other than the
  default `rpc` endpoint -- specifically a unix socket, which is what
  `native-bridge` dials. Also picks up 0.18.1's fix for decoding a
  percent-encoded socket path, needed because `new URL("unix:" + sock)`
  turns a leading NUL (a Linux abstract-namespace socket) into `%00`.
- `native-bridge`'s CLI now prints `_discover` one function per line instead
  of as a single line of JSON, which makes the list greppable. The value
  itself is untouched -- rpc.mjs dispatches every call against that object,
  so it stays exactly what the host returned; only the CLI's own display of
  it changed.

## 0.2.3 - 2026-08-18

### Added

- Add `buninu.exitAfterCmd` package.json setting (default `false`). When
  `true`, the shell/PTY exits with `buninu.command`'s status instead of
  falling back to an interactive shell once the command finishes; `false`
  keeps the existing fall-back-to-shell behavior.
- Add `--export-config [output.json]`, which writes this entire `package.json`
  to `buninu.json` in the current directory by default (like `--export`, the
  output path can be overridden), instead of exporting the whole installation
  like `--export` does. If the output path already exists, it now asks for
  confirmation (`[y/N]`) before overwriting.

## 0.2.2 - 2026-08-17

### Added

- Add a "Commands inside the shell" section to README.md, split out of
  Command-line information (which is only `bin/init.js`'s own flags, resolved
  before Buninu starts). Lists everything in `apps/cmdlist` and moves the
  `buninu-help`/`bunx` write-ups there, including a note that `bunx` can't
  install anything on Android until
  [oven-sh/bun#39084](https://github.com/oven-sh/bun/pull/39084) merges
  upstream (Android's seccomp policy kills `bun i -g` with SIGSYS during bin
  linking until then).

## 0.2.1 - 2026-08-17

### Added

- Add `bunx`, a POSIX and Windows multicall command that ensures a package is
  installed via `bun i -g` and then runs its matching binary, forwarding the
  remaining arguments. Reinstall timing is adapted from real bunx's own rules
  (an explicit dist-tag like `@latest` always reinstalls; otherwise a cached
  binary is reused until it's older than 24h, or stat fails, or bun's own
  `install/global/package.json` shows a different pinned version than the one
  requested — this script has one shared install location instead of bunx's
  per-version cache, so this last check substitutes for that). The global bin
  directory is resolved via `bun pm bin -g`, falling back to
  `$BUN_INSTALL`/`$HOME/.bun` on the very first install before that project
  exists (which `bun pm bin -g` requires).
  - Runs the target through `bun <target>` instead of exec'ing it directly:
    on Android the resolved binary typically sits under storage mounted
    noexec, so a direct exec is refused even though the file is readable and
    executable-bit set. Trade-off: a package whose bin is a real native
    executable rather than a JS/bun script won't run this way.
  - On Android (detected the same way as `bin/init.js`, via
    `/system/bin/linker64`), installs with `--backend=copyfile` since
    hardlinks/symlinks frequently fail across Android's storage, and sets
    `$PREFIX=/data/data/com.termux/files/usr` for the target process (not the
    install step) so CLIs that check for a Termux environment still find one,
    unless `$PREFIX` is already set.

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
