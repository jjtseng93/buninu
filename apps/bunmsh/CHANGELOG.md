# Changelog

All notable user-visible changes to bunmsh are documented here.

## [0.2.0] - 2026-08-29

### Added

- Add `SERVE_AUTO_OPEN`, `SERVE_MINAPK_WEBVIEW`, and `SERVE_RANDOM_URL` plus
  overriding `serve` CLI flags for opening the server (cross-platform, with
  `xdg-open` on PATH preferred), targeting the npm `buninu` package's app
  WebView, and protecting it behind a high-entropy random URL prefix.
- Add repeatable `--exclude PATTERN` and `--exclude=PATTERN` filtering backed
  by `Bun.Glob` to the `cat` and `catfancy` fallback builtins for concatenating
  expanded file sets.
- Add JS/TS syntax coloring to `catfancy`: `.js`/`.mjs`/`.cjs`/`.jsx` and
  `.ts`/`.mts`/`.cts`/`.tsx` files are wrapped in a fenced ` ```javascript `/
  ` ```typescript ` block and rendered through the same `Bun.markdown.ansi`
  path Markdown gets, reusing its code-block highlighter rather than adding
  one. The fence is widened past the longest run of backticks already in the
  source, so a file containing its own triple-backtick text can't prematurely
  close it.
- Add bracketed-paste support to the interactive prompt. A paste containing a
  newline no longer gets read back a physical line at a time (which broke any
  `\`-continued command in it, since each line ran on its own the instant its
  line-ending arrived); it now resolves as a single already-typed line, going
  through the same continuation/execute path Enter does, so a whole
  multi-command, `\`-continued tutorial block can be pasted and run as-is. A
  paste's own line-ending convention — `\n`, `\r\n`, or a bare `\r` (some
  terminals use it for pasted content, even though bunmsh's parser otherwise
  treats a standalone `\r` as whitespace) — is normalized before anything
  downstream sees it. A single-line paste is unaffected. Independent of
  `--mouse`/`BUNMSH_MOUSE`.

### Fixed

- Recognize a line ending in a bare trailing backslash as an interactive
  continuation request. Previously, typing `echo hi \` and pressing Enter ran
  it immediately as `echo`, `hi`, `\` instead of showing the PS2 prompt and
  waiting for the next line, because the interactive line-by-line `pending`
  buffer only had the lone `\` at that point — the following `\n` that the
  existing backslash-newline splice looks for hadn't been typed yet.

## [0.1.11] - 2026-08-28

### Added

- Add a `tac` PATH-fallback builtin for reversing newline-delimited records
  from files or stdin while preserving their bytes and separators.
- Add asset-backed `-h` and `--help` output for documented regular and fallback
  builtins. Help lives as Markdown under `help/`, starts at level-two headings,
  and renders through `Bun.markdown.ansi` with terminal hyperlinks enabled.
- Add the `catfancy` PATH-fallback builtin. Previewable data formats are
  parsed and emitted as colorized pretty JSON; Markdown is rendered with
  `Bun.markdown.ansi` and hyperlinks enabled, while unrecognized formats pass
  through unchanged.

### Fixed

- Normalize CRLF source to LF at every shell-language input boundary, covering
  script files, stdin, `-c`, interactive continuation, command substitutions,
  compound syntax, quoted text, and here-documents. A standalone carriage
  return remains untouched.
- Treat backslash followed by either LF or CRLF as a line continuation before
  token recognition. This supports indented multi-line command invocations
  without introducing empty arguments, including `enter_rootfs.sh`-style
  multi-line `exec` commands.
- Stream top-level compound-command output directly to the terminal. An
  interactive program launched by `exec` inside `if`, loops, or other compound
  syntax previously inherited stdin but had stdout and stderr buffered until
  it exited, making an entered rootfs appear to hang with a blank screen.

## [0.1.10] - 2026-08-27

### Added

- Add `<<`/`<<-` here-documents. An unquoted, unescaped delimiter expands
  parameters, command substitution, and arithmetic in the body like a
  double-quoted string; a quoted or backslash-escaped delimiter (`<<'EOF'`,
  `<<\EOF`) leaves it literal. `<<-` strips leading tabs from the body and the
  terminator. Here-documents work on plain command lines, in pipelines, across
  multiple heredocs on one command, and inside `if`/`while`/`for`/`case`
  bodies. Like dash and bash, a script that ends before the terminator line
  appears uses whatever was read as the body instead of raising a syntax
  error.
- Add `<<<` here-strings, matching mksh's `DOHERESTR | DOSCALAR` word
  expansion: parameter, command, and arithmetic substitution run, but there is
  no field splitting, pathname expansion, or tilde expansion, and a trailing
  newline is appended before the word becomes stdin.
- Fix an unrelated pre-existing crash surfaced while adding here-documents: any
  tokenizer syntax error (for example an unterminated quote) raised while
  probing whether a script uses compound (`if`/`while`/`for`/`case`) syntax
  used to escape as an unhandled exception instead of the usual
  `bunmsh: syntax error: ...` message.
- Show mksh's `PS2` continuation prompt (default `"> "`) in interactive mode
  while a here-document, an open quote/substitution, or an unfinished
  `if`/`while`/`for`/`case` body is still being typed, instead of running each
  line on its own as soon as Enter is pressed. Ctrl-C during a continuation
  discards it and returns to the primary prompt; Ctrl-D runs whatever was
  typed so far — the same leniency the non-interactive here-document fallback
  above already has — and then keeps the shell running (Node's `readline`
  closes itself on an empty-line Ctrl-D, so this transparently rebuilds it),
  the same as mksh, instead of exiting the whole session.
- `lsfancy -l` now shows a symlink's target (`link -> target`), including a
  broken one, matching real `ls` — this was missing from both `lsfancy` and
  the Bun Shell `ls` fallback it is compared against. Reading it works the
  same way on Windows as on POSIX platforms.
- Give a symlink whose target does not resolve (missing, or a cycle) a
  distinct 🚫 icon instead of the normal 🔗, in both the plain and `-l`
  listing forms.
- With mouse tracking enabled, clicking inside the line currently being typed
  now moves the cursor there (accounting for the active prompt's own width
  and wrapping, including multi-line/multi-tab prompts and the `PS2`
  continuation prompt), the same as clicking inside a text field, instead of
  only reacting to clicks on tabs. Clicking past the end of the typed text
  moves the cursor to the end of the line rather than doing nothing.
- Add `-S` (sort by size, largest first), `-1` (force one entry per line,
  even in a terminal), and `-F` (append a classify suffix — `/` directory,
  `@` symlink, `*` executable, `=` socket, `|` FIFO) to `lsfancy`, all
  combinable with the existing flags (`-lSF`, etc.).
- Save history automatically — every 60s, once more on exit, and once more
  on SIGTERM/SIGHUP — by appending only this session's own new commands to a
  JSON Lines history file, never rewriting it, so several bunmsh sessions
  saving around the same time can no longer overwrite each other's history.
  `tab s`/`tab save` trigger the same append immediately; the new `tab s d`/
  `tab save dedupe` is a separate, explicit whole-file rewrite that drops
  duplicate commands and reports if another session's write raced it. A
  history file saved in the previous single-JSON-array format is still read
  correctly and is silently upgraded to JSON Lines the next time anything
  is saved.
- Catch SIGTERM and SIGHUP in interactive mode instead of leaving them at
  the default disposition (which killed bunmsh immediately, before it could
  save anything). Receiving either while waiting at the prompt now flushes
  history and exits with the conventional 128+signal status; while a
  foreground command owns the terminal, it flushes history immediately and
  exits once that command finishes on its own, since there is no
  job-control layer yet to also stop the command itself.

### Changed

- `tab s`/`tab save` (with no `d`/`dedupe`) no longer removes duplicate
  commands as a side effect of saving — it now only appends, matching how
  most shells' history files work. Use the new `tab s d`/`tab save dedupe`
  to remove duplicates explicitly.
- The `ls` fallback builtin (used when no PATH `ls` is found, e.g. on
  Windows, or under `--builtin-only`) is now `lsfancy` instead of Bun Shell's
  own `ls`, since it now covers more real `ls` behavior (working `-h`/`-t`/
  `-r`, a symlink's target, alphabetical default order) than Bun Shell's
  version does. Bun Shell's `ls` is still reachable, renamed to `lsbun`.
  `lsfancy` itself is unchanged and still callable under its own name.

### Fixed

- Fix an unrelated pre-existing hang found while working on the above: a
  pipeline whose downstream stage closes early (`yes | head -n 3`) could
  leave the killed upstream stage's own output-forwarding stuck forever —
  Bun never releases the reader lock it holds on that pipeline link's read
  side once the stage reading it has exited, so a write already in flight
  into it backpressures permanently and cannot be canceled from outside.
  That write is now abandoned instead of waited on once the downstream stage
  is known to be done, and the shell forces its own exit once a script or
  `-c` command finishes rather than leaving that abandoned operation to keep
  the process running forever.
- Fix `lsfancy -l` showing every file's modification time in UTC instead of
  local time (it built the column from `Date.prototype.toISOString()`, which
  is always UTC) — a pre-existing bug, not something the symlink-target work
  above introduced.

## [0.1.9] - 2026-08-27

### Added

- Render Markdown previews in `serve` with heading anchors, passing
  `{ headings: true }` to `Bun.markdown.html`, so long documents get linkable
  section ids.
- Document `serve` in its own README section, pulled out of the fallback
  builtin table: port selection and its fallback, the `q`/`quit`/`exit` and `o`
  controls, exit codes, directory listings and previews, and the
  non-interactive forms such as `bmsh -cc builtin serve <directory>` that start
  it from another shell or a script.
- Document packing a folder into a single executable without a source
  checkout — `npx bunmsh --build-exe --asset /absolute/path/mysite`, then
  `bmsh -cc builtin serve 'B:/~BUN/mysite'` — including the absolute-path
  requirement, the PowerShell and `cmd.exe` spellings, and the trade-off
  against the `package.json` `assets` route, which is what makes the same file
  readable through `readAssetText` from a checkout and from the binary.
- Document that `serve` always answers a directory with its listing rather than
  the directory's `index.html`, and point site hosting at `npx serve` or Bun
  1.4's `{ dir }` routes, which do send it.
- Document that HTTP Range is not honoured for files inside a compiled binary:
  Bun answers those with the whole body and a `200`.

## [0.1.8] - 2026-08-27

### Added

- Add the `serve [directory]` fallback builtin and standalone `serve.js` as a
  minimal replacement for `python3 -m http.server`. It provides live directory
  listings, reflects filesystem changes, and serves whole `Bun.file` responses
  with Bun's native HTTP Range support.
- Add `🔍` preview links to `serve` directory pages. Markdown is rendered by
  `Bun.markdown.html`; JSON, JSON5, JSONC, JSONL/NDJSON, YAML, and TOML are
  parsed by their corresponding runtime parser and pretty-printed as HTML.
  XML is also previewed when the running Bun provides `Bun.XML.parse`.
- Add basic syntax colouring to structured-data previews, following the
  statement, string, escape, number, and constant groups from jsmdcui's
  `runtime/syntax/json.yaml` after parser output is pretty-printed as JSON.
- Add interactive `serve` controls: `q`, `quit`, and `exit` stop the server,
  while `o` opens its URL through `xdg-open`.
- Accept both `/$bunfs/...` and `B:/~BUN/...` serve paths on every platform,
  translating either spelling through the compiled module's
  `import.meta.dirname` to the bunfs mount accepted by the current runtime.

### Fixed

- Keep `serve` running after malformed preview data or any other uncaught
  request-handler exception; parser failures return 422 and the outer request
  boundary converts unexpected failures to an isolated HTTP 500 response.
- Prevent Termux foreground/resume terminal resize events from repainting the
  shell's cwd prompt over a running server or other foreground command.
- Keep the interactive shell alive when Ctrl-C interrupts the prompt or a
  foreground `serve`. Like mksh, SIGINT now abandons the current operation and
  returns to a fresh prompt; Ctrl-D on an empty input remains the way to send
  EOF and leave the shell.

## [0.1.5] - 2026-08-26

### Added

- Mark shell-inserted line endings with `↩️`, making the exact boundary of a
  command's output visible when the command does not emit a trailing newline.
- Document this marker under **Special Interactions → Terminal behavior**.

### Fixed

- Preserve the final line of any interactive command whose output has no
  trailing newline, including streamed external commands such as
  `printf hello`. bunmsh now queries the terminal cursor before repainting the
  prompt and only inserts a marked newline when the cursor remains mid-line.

## [0.1.4] - 2026-08-26

### Added

- Added `Alt-P` as a second shortcut for `builtin lsfancy ..`, matching
  `Alt-U` and listing the Parent (upper) folder without changing cwd or
  discarding the current edit buffer.

### Fixed

- Preserve short `Alt-L`, `Alt-U`, `Alt-P`, and tab-double-click `lsfancy`
  output when readline redraws the prompt. A two-line prompt previously moved
  upward and erased a one-line listing, which was especially visible for the
  parent of the Termux home directory.
- Derive `HOME` on Windows from `USERPROFILE`, or from `HOMEDRIVE` plus
  `HOMEPATH`, when the environment does not define it. Bare `cd`, `~`, `$HOME`,
  prompt home shortening, and child environments now share a usable home path.
- Normalise Windows HOME paths to forward slashes and compare HOME/cwd without
  case sensitivity when deciding whether a prompt path should use `~`.
- Treat Android's `/data/data/PACKAGE` and `/data/user/0/PACKAGE` app-sandbox
  paths as equivalent for prompt home shortening, so Termux HOME and its
  descendants display as `~` even when HOME and cwd use different aliases.
