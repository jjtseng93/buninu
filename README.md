# Buninu

![icon](https://raw.githubusercontent.com/jjtseng93/buninu/main/icon.png)

> **Early development:** Buninu is still at an early stage of development.
> Features, configuration, and command-line behavior may change between releases.
> Linux, Android, and Windows can run the current early implementation, but
> their support and portability behavior are still being tested and refined.

- Buninu is a portable, self-bootstrapping Unix-like userspace built on Bun that runs across operating systems

- It starts a browser-accessible terminal through jsgotty. The architecture is
  designed for Android, Linux, and Windows.

- Name expansions:
  * English: **BUNinu Is Not Unix** 🐮
  * 中文：**幫你牛** 🐂
  * 日本語：**Bunに入魂** 🔥

- Core components:
  * [jsgotty](https://github.com/jjtseng93/js-gotty): Remote shell from a Browser or Terminal
  * [jsmdcui](https://github.com/jjtseng93/jsmdcui): Both a text editor and Markdown execution runtime (not static rendering) based on [bunmicro](https://github.com/jjtseng93/bunmicro)
  * [bunmsh](https://github.com/jjtseng93/bunmsh): Bun Modern Shell. Not completed yet

See [ARCHITECTURE.md](ARCHITECTURE.md) for the complete architecture, portability model,
and self-bootstrapping design.

## Differences from upstream

### The bundled jsmdcui

  * Is configured editor-first by MDCUI_DEFAULT_EDIT
  * The command `jmi` with a Markdown file opens the normal terminal editor.(js micro editor)
  * The command `jsmdcui` preserves its original behavior: `apps/jsmdcui/jsmdcui.sh`, which starts its `tui` entry point with `--mdcui` when running markdown Apps, and forwards all command-line arguments.
  * Adds the Buninu-only `# syntax: markdown` marker for Markdown highlighting in extensionless files; upstreaming may be considered later.

### The bundled jsgotty

  * No longer depends on or ships `node-pty`. 
  * Its PTY is provided by Bun's terminal API.

## Install Bun

Buninu requires [Bun](https://bun.com). On Android, install Bun in Termux:

```sh
npm install -g bun
```

On Linux and Windows, follow the
[official Bun installation guide](https://bun.com/docs/installation).

## Start

Run the npm package:

```sh
npx buninu
```

Or run it from a source checkout:

```sh
bun ./bin/init.js
```

The launcher automatically chooses a free TCP port and detects an available
shell for the current platform. Other arguments are forwarded to jsgotty:

```sh
npx buninu --credential user:pass
npx buninu --port 9000
npx buninu --jsgotty --help

# public: listen on every interface, reachable from other devices on the network, be cautious!
npx buninu -a 0.0.0.0
```

As the first argument, `--jsgotty`, `--jsmdcui`, or `--musl-la` bypasses the
shell/command startup flow entirely: it spawns that app directly with every
remaining argument forwarded to it, and exits with its exit code. Use this to
reach an app's own options directly, for example `npx buninu --jsgotty --help`
to see jsgotty's actual flag reference instead of Buninu's.

## Security

`scripts.start` binds jsgotty to `127.0.0.1` by default, so the terminal
server only accepts connections from the same machine. It is not reachable
from other devices on the network unless you explicitly opt in.

The terminal itself is writable (`-w`) and unauthenticated by default; only
the loopback binding and jsgotty's random URL path (`-r`) stand between a
local process and a shell with Buninu's permissions. To listen on another
interface, forward `--address <value>` (see [Start](#start)); forwarded
arguments override the flags baked into `scripts.start`. Also pass
`--credential user:pass` when doing so, since the random port and URL path
are not a substitute for authentication once the server is reachable from
outside the machine.

## Command-line information

```text
-h, --help       Show command-line help
-V, --version    Show the Buninu, Bun, platform, and architecture versions
--readme          Render README.md in the terminal
--changelog       Render CHANGELOG.md in the terminal
--jsgotty [args...]  Spawn jsgotty directly and exit with its exit code
--jsmdcui [args...]  Spawn jsmdcui directly and exit with its exit code
--musl-la [args...]  Spawn musl-la directly and exit with its exit code
```

These are flags to `bin/init.js` itself, resolved before Buninu starts.

## Commands inside the shell

Once you are inside a running Buninu shell, these are available (the
validated source list is `apps/cmdlist`; see [Add a command](#add-a-command)
for how it works):

```text
glow          Render files with jsmdcui syntax highlighting
jmi           Open files in the js micro editor
jsgotty       Run a browser-accessible terminal
jsmdcui       Edit and run interactive Markdown applications
musl-la       Launch AArch64 ELF programs with the bundled musl loader
buninu-help   Render README.md with glow, then show icon.png with jsgotty --viu
bunx          Globally install a package with bun, then exec its matching binary
native-bridge Call the Android host app (toast, clipboard, speak, WebViews) over PKG_BRIDGE_SOCK
xclip         X11-style clipboard tool; -selection clipboard/-clip bridges to the system clipboard
tts           Speak text and wait for it to finish (-a to not wait)
showimg       Shorthand for jsgotty --viu
rz            Upload a file over ZMODEM
sz            Download a file over ZMODEM
xdg-open      Open a file or URL with the platform's default handler
```

`buninu-help` renders README.md with jsmdcui's `--cat` mode and then shows
`icon.png` with jsgotty's `--viu`. It is the command the default startup
greeting points to.

`bunx <package>[@version] [args...]` installs with `bun i -g` and runs the
matching binary. On Android, the underlying `bun i -g` currently needs
[oven-sh/bun#39084](https://github.com/oven-sh/bun/pull/39084) merged
upstream — without it, install is killed by SIGSYS (Android's seccomp policy
rejects a syscall bin-linking uses), so `bunx` can't install anything there yet.

`native-bridge [func] [args...]` calls into the Android host app that
[minapk](https://www.npmjs.com/package/@drxiaozhi/minapk) built the running
APK with, over an abstract-namespace unix socket. A bare `native-bridge`
lists what the host implements. Every call
times out after 5 seconds instead of hanging; outside such an APK, every call
fails with a clear error instead of doing nothing silently. `import { toast,
clipboardRead, clipboardWrite, speak, ttsStatus, openWebView, evalWebView,
showWebView, currWebView, call, available } from
"apps/native-bridge/native-bridge.js"` gives the same functions as a library,
for use from a `js back` block.

`openWebView(id, url)`, `evalWebView(id, js)`, `showWebView(id)` and
`currWebView()` (short: `openwv`, `evalwv`, `showwv`, `currwv`) drive the host
app's WebViews. There are exactly two, both
alive from startup and neither ever created nor closed at runtime: id `0` is
the console -- the jsgotty terminal this shell is rendered in -- and id `1` is
the app WebView, which starts out blank and behind. Anywhere an id is taken,
`-1` means whichever WebView is in front right now.

`openWebView` loads a URL *without* bringing that WebView to the front, so
loading the app WebView while the user keeps looking at the terminal is one
call. `showWebView` is the only thing that changes what is on screen; the
host's on-screen key bar (Ctrl/Alt/Shift and friends), its volume-key menu and
its back key all act on whichever WebView is in front, so they follow the
switch. Back on the app WebView with no page of its own to go back to
switches to the console rather than leaving the app, unless
`buninu.backToConsole` says otherwise (see "Back key" below).
`showWebView(-1)` switches to the next WebView instead of being a no-op --
with two of them, a toggle. `evalWebView` resolves to the value the
expression produced, not a string containing it; `undefined`, a function, and
a thrown exception all arrive as `null`, since WebView itself does not
distinguish them.

All four also answer to a short `openwv`/`evalwv`/`showwv`/`currwv` spelling,
the same way `clipboardRead`/`clipboardWrite` answer to `getcb`/`setcb`: the
host accepts either and lists both in its `_discover` response, so either name
works from the CLI, from `rpcraw`, and as an `import`.

```sh
native-bridge openwv 1 https://example.com   # load it, screen unchanged
native-bridge showwv 1                       # now bring it to the front
native-bridge evalwv 1 document.title
native-bridge currwv
```

`xclip [-o] [-selection primary|clipboard] [-clip]` is a small X11-`xclip`-
compatible clipboard tool. `-selection primary` (the default) never touches
the system clipboard, matching real X11 semantics. `-selection
clipboard`/`-clip` reaches the real system clipboard on Android, macOS,
Windows, and Linux/Wayland. jsmdcui picks this up automatically once it's on
`PATH`, so its middle-click paste and copy/paste commands just work.

`tts <text> [-f|--flush] [-a|--async] [--timeout <ms>] [--pitch <n>]
[--speed <n>]` speaks text and, by default, blocks until it finishes -- no
timeout unless you pass `--timeout`. Works on Android, macOS, Windows, and
Linux (via espeak-ng/espeak). `--pitch`/`--speed` fall back to
`$TTS_PITCH`/`$TTS_SPEED` when not given explicitly, so jsmdcui's own
pitch/speed setting is honored automatically.

`rz [target-dir]` (upload into `target-dir`, default: cwd) and `sz <file>
[more files...]` (download one or more files) are thin `bin/`-only wrappers
around `apps/jsgotty/rz.js`/`sz.js`, transferring files over ZMODEM through
the same terminal connection jsgotty already renders in a browser or WebView.

`xdg-open <file-or-url>` hands a file or URL to whatever the platform treats
as its default handler: the host app through native-bridge on Android (or
`termux-open` under plain Termux), `open` on macOS, `start` on Windows, and
the real system `xdg-open` on Linux.

Inside minapk's APK, `MINAPK_WEBVIEW` redirects that: set it to a WebView id
and a URL is loaded into that WebView and brought to the front (`openWebView`
then `showWebView`) instead of being handed to the system's default handler.

```sh
MINAPK_WEBVIEW=1 xdg-open https://example.com   # in the app WebView, on screen
export MINAPK_WEBVIEW=1                         # ...or for the whole session
```

`0` is the console, so it navigates the terminal page away -- the back key
returns to it and jsgotty reconnects, but it is not usually what you want.
`-1` is whichever WebView is in front. Only URLs are redirected: a file path
always goes to the host's own handler, since WebView cannot read a `file://`
URL under Buninu's home (`setAllowFileAccess` is false from API 30 on) while
the host serves that same file through its content:// provider. A value that
is not a plain integer is reported on stderr and ignored rather than guessed
at, an unset or empty value keeps the default behavior, and a WebView the host
does not have falls back to the default handler after saying so.

## Export

Export the current Buninu installation as a gzip-compressed tar archive:

```sh
npx buninu@latest --export
npx buninu@latest --export /path/to/buninu.tgz
```

The default output is `./buninu.tgz`. The archive contains exactly one
top-level directory so consumers can remove one component while extracting.
Export requires `tar` in `PATH`; when replacing an existing output,
Buninu restores the previous file if archive creation or replacement fails.

Export this `package.json` on its own, instead of the whole installation:

```sh
npx buninu@latest --export-config
npx buninu@latest --export-config /path/to/buninu.json
```

The default output is `./buninu.json`. This is the full `package.json` (not
just the `buninu` section), so the output is ready to use as-is anywhere a
complete replacement `package.json` is expected.

## Environment

`BUNINU_HOME` is the absolute path to the installed Buninu package root.
The jsgotty process, startup command, and interactive shell start with this
directory as their working directory. Buninu also appends
`$BUNINU_HOME/bin` to `PATH` (`Path` on Windows).

Buninu preserves inherited environment variables and supplies these fallbacks:

- `HOME`: inherited value, or `BUNINU_HOME` when unset.
- `TMPDIR`: inherited value; on Android, use the app cache directory when it
  exists or `$BUNINU_HOME/tmp` otherwise; on other platforms, use the system
  temporary directory.
- `SHELL`: inherited value, or a detected platform-appropriate shell.
- `TERM`: `xterm-256color` when unset.
- `COLORTERM`: `truecolor` when unset.

The Buninu Android APK launcher also supplies user-aware external-storage
paths obtained from Android APIs:

- `PKG_DDIR`: `/storage/emulated/<user-id>/Android/data/<package>`.
- `PKG_MDIR`: `/storage/emulated/<user-id>/Android/media/<package>`.
- `PKG_BRIDGE_SOCK`: the `native-bridge` unix socket, when the host app
  wires one in; see `native-bridge` above.

## Add a command

On POSIX systems, Buninu exposes its commands through the multicall
`shloader`. The command names are listed one per line in `apps/cmdlist`:

```text
# syntax: markdown

# Lines beginning with # are comments
glow
jsgotty
jsmdcui
```

Blank lines and comment lines are ignored. Keep comments on their own lines;
inline comments are not supported. Command names may contain ASCII letters,
digits, `.`, `_`, and `-`, and must begin with a letter or digit.

For example, to add a command named `hello`, create
`apps/hello/hello.js`:

```js
console.log("Hello from Buninu");
```

Then add its name to `apps/cmdlist`:

```text
hello
```

Restart Buninu normally. During startup, `bin/init.js` reads the list and
rebuilds `bin/hello` as a symbolic link to `shloader`. The command is then
available from the Buninu shell:

```sh
hello
```

The multicall loader looks for an implementation in this order:

```text
bin/hello.sh
apps/hello/hello.sh
apps/hello/hello.js
apps/hello/hello.mjs
apps/hello/hello.ts
apps/hello/hello.mts
```

Running only an information option such as `--help` or `--version` does not
rebuild links; start Buninu normally at least once after changing the list.
Windows does not use these POSIX symbolic links. To expose the same command
on Windows, also provide `bin/hello.bat`, for example:

```bat
@echo off
call "%~dp0bun.bat" "%~dp0..\apps\hello\hello.js" %*
exit /b %ERRORLEVEL%
```

## Startup command (optional)

Set `buninu.command.default` or a platform-specific value (`android`, `linux`,
or `windows`) in `package.json` to run a complete shell command from
the directory containing `package.json`. The platform value takes precedence
over `default`. After the command finishes—successfully or unsuccessfully—the
terminal returns to an interactive shell.

```json
{
  "buninu": {
    "command": {
      "default": "echo Welcome to Buninu",
      "android": null
    }
  }
}
```

For compatibility, `"command": "..."` is also accepted as a shared command
for every platform.

Override it for one run with:

```sh
bun ./bin/init.js --command "echo temporary command"
```

Set `buninu.exitAfterCmd` to `true` to exit once `buninu.command` finishes
instead of falling back to an interactive shell. It defaults to `false`,
which is the current fall-back-to-shell behavior described above.

```json
{
  "buninu": {
    "command": { "default": "echo Welcome to Buninu" },
    "exitAfterCmd": true
  }
}
```

## Shell selection (optional)

Set `buninu.shell.default` or a platform-specific value (`android`, `linux`,
or `windows`) in `package.json`. A relative shell path is resolved
from the directory containing `package.json`.

```json
{
  "buninu": {
    "shell": {
      "default": null,
      "android": "../bunmsh/bunmsh"
    }
  }
}
```

Use `--shell <path-or-name>` for a one-time override.

## Back key (Android, optional)

Set `buninu.backToConsole` in `package.json` to decide what the Android host
app's back key does while the app WebView (id `1`, see `native-bridge` above)
is in front and has no page of its own left to go back to. It defaults to
`true`: back switches to the console WebView, leaving the app WebView loaded
and running behind it. Set it to `false` and back leaves the app instead.

```json
{
  "buninu": {
    "backToConsole": false
  }
}
```

This one is read by the host app, not by Buninu itself, so it does nothing
outside an APK built with
[minapk](https://www.npmjs.com/package/@drxiaozhi/minapk) -- where it can also
be set for a single build with `--no-back-to-console`. The host treats a
missing, unreadable, or non-boolean value as `true`, so nothing here can fail
in a way that leaves the back key broken.

## Process-list helpers

The bundled `.bashrc` provides `pspa` (`ps -eo pid,args`) and `pspac`, which
writes that process list to `$HOME/.pspidargs.sh` and displays it with `glow`.
Buninu preserves an existing `HOME` rather than replacing or modifying the
user's home; shells that honor `ENV` load the bundled file, while interactive
Bash may load only `$HOME/.bashrc`, so add `. "$BUNINU_HOME/.bashrc"` to a
custom Bash configuration when these aliases are not available.
