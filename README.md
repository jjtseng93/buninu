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
glow        Render files with jsmdcui syntax highlighting
jmi         Open files in the js micro editor
jsgotty     Run a browser-accessible terminal
jsmdcui     Edit and run interactive Markdown applications
musl-la     Launch AArch64 ELF programs with the bundled musl loader
buninu-help Render README.md with glow, then show icon.png with jsgotty --viu
bunx        Globally install a package with bun, then exec its matching binary
```

`buninu-help` renders README.md with jsmdcui's `--cat` mode and then shows
`icon.png` with jsgotty's `--viu`. It is the command the default startup
greeting points to.

`bunx <package>[@version] [args...]` installs with `bun i -g` and runs the
matching binary. On Android, the underlying `bun i -g` currently needs
[oven-sh/bun#39084](https://github.com/oven-sh/bun/pull/39084) merged
upstream — without it, install is killed by SIGSYS (Android's seccomp policy
rejects a syscall bin-linking uses), so `bunx` can't install anything there yet.

## Export

Export the current Buninu installation as a gzip-compressed tar archive:

```sh
npx buninu --export
npx buninu --export /path/to/buninu.tgz
```

The default output is `./buninu.tgz`. The archive contains exactly one
top-level directory so consumers can remove one component while extracting.
Export requires `tar` in `PATH`; when replacing an existing output,
Buninu restores the previous file if archive creation or replacement fails.

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

## Process-list helpers

The bundled `.bashrc` provides `pspa` (`ps -eo pid,args`) and `pspac`, which
writes that process list to `$HOME/.pspidargs.sh` and displays it with `glow`.
Buninu preserves an existing `HOME` rather than replacing or modifying the
user's home; shells that honor `ENV` load the bundled file, while interactive
Bash may load only `$HOME/.bashrc`, so add `. "$BUNINU_HOME/.bashrc"` to a
custom Bash configuration when these aliases are not available.
