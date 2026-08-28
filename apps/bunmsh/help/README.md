## alias

Define or print aliases.

### Usage

```sh
alias [NAME[=VALUE] ...]
```

### Example

```sh
alias ll='builtin lsfancy -l'
alias ll
```

Output:

```text
ll='builtin lsfancy -l'
```
## basename

Remove directory components and an optional suffix.

### Usage

```sh
basename [--] STRING [SUFFIX]
```

### Options and forms

- `--`: Stop option parsing, allowing a string beginning with `-`.
- `SUFFIX`: Remove this exact suffix when it is present and is not the whole basename.

### Example

```sh
basename /usr/local/bin/bun
```

Output:

```text
bun
```

Suffix example:

```sh
basename archive.tar.gz .gz
```

Output:

```text
archive.tar
```
## builtin

Run a registered builtin explicitly; with no command, list builtin names.

### Usage

```sh
builtin [--] [COMMAND [ARG ...]]
```

### Options and forms

- `--`: Stop builtin's own option parsing before the command name.

### Example

```sh
builtin echo hello
```

Output:

```text
hello
```
## bun

Invoke the active Bun runtime.

### Usage

```sh
bun [ARG ...]
```

### Options and forms

All arguments are forwarded unchanged to the active Bun runtime. Bun's
supported flags depend on that runtime version; run the external `bun --help`
when its own complete CLI reference is required.

### Example

```sh
bun --version
```

Output:

```text
1.4.0
```
## bunmsh

Invoke the active bunmsh entry point.

### Usage

```sh
bunmsh [ARG ...]
```

### Options and forms

- `SCRIPT [ARG ...]`: Execute a shell script file.
- `-c SOURCE [ARG ...]`: Parse and execute shell source text.
- `-cc COMMAND [ARG ...]`: Execute argv directly without shell parsing or expansion.
- `-i`: Enter interactive mode after any requested command or script.
- `--mouse`: Enable terminal mouse events.
- `--builtin-only`: Disable PATH lookup while retaining builtins.
- `-V`, `--version`: Print the bunmsh version.
- `--readme`: Render the bundled README.
- `--changelog`: Render the bundled changelog.
- `--build-exe`: Build `./bmsh` for the current platform.
- `--build-for TARGET`: Cross-compile `./bmsh` for a target.
- `--`: Stop option parsing before a script path.

### Tar-backend asset controls

These options currently work only with the tar asset backend. They are not
available to builds that embed the asset directory directly with Bun's
`--asset` backend. See [single-exe/README.md](../single-exe/README.md) for the
backend comparison, build setup, and extraction layout.

- `--assets-list`: List embedded asset paths and exit.
- `--assets-extract`: Extract embedded assets beside the executable and exit.
- `--assets-external`: Ignore embedded assets and read the extracted files.

### Example

```sh
bunmsh -c 'echo hello'
```

Output:

```text
hello
```
## cat

Concatenate files or stdin.

### Usage

```sh
cat [--exclude PATTERN]... [--] [FILE ...]
```

### Options and forms

- `--`: Stop option parsing.
- `--exclude PATTERN`/`--exclude=PATTERN`: Omit matching file operands using
  `Bun.Glob` patterns. Repeat the option to exclude more patterns; quote a
  pattern to prevent the shell from expanding it first.
- `-`: Read from stdin at that operand position. No other options are supported.

### Example

```sh
printf 'alpha\n' > alpha.txt
printf 'beta\n' > beta.txt
builtin cat --exclude 'alpha.*' *.txt
```

Output:

```text
beta
```
## catfancy

Render Markdown and colorized parsed structured data; pass other formats through.

### Usage

```sh
catfancy [--exclude PATTERN]... [--] [FILE ...]
```

### Options and forms

- `--`: Stop option parsing.
- `--exclude PATTERN`/`--exclude=PATTERN`: Omit matching file operands using
  `Bun.Glob` patterns. Repeat the option to exclude more patterns; quote a
  pattern to prevent the shell from expanding it first.
- `-`: Read unformatted stdin; file previews are selected from filename extensions.
- `.js`/`.mjs`/`.cjs`/`.jsx` and `.ts`/`.mts`/`.cts`/`.tsx` files are wrapped
  in a fenced ` ```javascript `/` ```typescript ` block and rendered through
  `Bun.markdown.ansi`, for the same syntax coloring Markdown code blocks get.

### Example

```sh
builtin catfancy package.json
```

Output:

```text
{
  "name": "bunmsh",
  "version": "0.1.10"
}  # colorized
```
## cd

Change directory; cd - returns to the previous directory.

### Usage

```sh
cd [DIRECTORY]
```

### Example

```sh
cd /tmp
pwd
```

Output:

```text
/tmp
```
## chmod

Change modes using octal values, +x, or a+x.

### Usage

```sh
chmod MODE FILE ...
```

### Options and forms

- Octal modes such as `755` set all permission bits.
- `+x` and `a+x` add executable bits.

### Example

```sh
chmod +x script.sh
builtin test -x script.sh; echo $?
```

Output:

```text
0
```
## clear

Clear the terminal.

### Usage

```sh
clear
```

### Example

```sh
clear
```

Output:

```text
(terminal screen is cleared)
```
## :

Do nothing and return success.

### Usage

```sh
: [ARG ...]
```

### Example

```sh
: ignored
echo $?
```

Output:

```text
0
```
## command

Run or inspect a command while bypassing aliases.

### Usage

```sh
command [-pVv] COMMAND [ARG ...]
```

### Options and forms

- `-p`: Use bunmsh's default command PATH.
- `-v`: Print a concise lookup result.
- `-V`: Print a verbose lookup description.

### Example

```sh
command -V echo
```

Output:

```text
echo is a shell builtin
```
## cp

Copy files and directories.

### Usage

```sh
cp [-rRv] SOURCE ... DESTINATION
```

### Options and forms

- `-r`, `-R`: Copy directories recursively (`-r` is translated to Bun Shell's `-R`).
- `-v`: Request verbose output.
- `-n`: Accepted by Bun Shell but currently does not prevent overwriting.

### Example

```sh
cp source.txt copy.txt
cat copy.txt
```

Output:

```text
hello
```
## cut

Select character positions.

### Usage

```sh
cut -c LIST [FILE ...]
```

### Options and forms

- `-c LIST`, `-cLIST`: Select character positions or ranges such as `1-3,7`.

### Example

```sh
printf 'abcdef\n' | cut -c2-4
```

Output:

```text
bcd
```
## date

Print the current date.

### Usage

```sh
date [+FORMAT]
```

### Options and forms

- Formats include `%Y` year, `%m` month, `%d` day, `%H` hour, `%M` minute, `%S` second, `%s` Unix time, `%F` date, `%T` time, and `%%` percent.

### Example

```sh
date +%F
```

Output:

```text
2026-08-28
```
## dirname

Print a path's directory component.

### Usage

```sh
dirname [--] STRING
```

### Options and forms

- `--`: Stop option parsing, allowing a string beginning with `-`.

### Example

```sh
dirname /usr/local/bin/bun
```

Output:

```text
/usr/local/bin
```
## echo

Write space-separated arguments.

### Usage

```sh
echo [-n] [ARG ...]
```

### Options and forms

- `-n`: Omit the trailing newline.

### Example

```sh
echo hello world
```

Output:

```text
hello world
```
## env

Print or modify the environment and optionally run a command.

### Usage

```sh
env [-i] [-u NAME] [NAME=VALUE ...] [COMMAND [ARG ...]]
```

### Options and forms

- `-i`, `--ignore-environment`: Start with an empty environment.
- `-u NAME`, `--unset NAME`, `--unset=NAME`: Remove a variable.
- `--`: Stop option parsing.

### Example

```sh
env NAME=value sh -c 'echo "$NAME"'
```

Output:

```text
value
```
## eval

Evaluate arguments as shell source.

### Usage

```sh
eval [ARG ...]
```

### Example

```sh
code='echo evaluated'
eval "$code"
```

Output:

```text
evaluated
```
## exec

Run a command and terminate the current shell with its status.

### Usage

```sh
exec COMMAND [ARG ...]
```

### Example

```sh
exec printf 'done\n'
```

Output:

```text
done
(shell exits with status 0)
```
## exit

Exit the current shell.

### Usage

```sh
exit [STATUS]
```

### Example

```sh
exit 7
```

Output:

```text
(shell exits with status 7)
```
## export

Set or list environment variables.

### Usage

```sh
export [NAME[=VALUE] ...]
```

### Example

```sh
export NAME=value
env | grep '^NAME='
```

Output:

```text
NAME=value
```
## false

Return failure.

### Usage

```sh
false
```

### Example

```sh
false
echo $?
```

Output:

```text
1
```
## find

Walk paths with name, path, type, depth, print, and -exec expressions.

### Usage

```sh
find [PATH ...] [EXPRESSION]
```

### Options and forms

- `-name`, `-iname`: Match a basename, optionally ignoring case.
- `-path`, `-ipath`: Match a path, optionally ignoring case.
- `-type f|d|l`: Select files, directories, or links.
- `-mindepth N`, `-maxdepth N`: Limit traversal depth.
- `-print`, `-print0`: Emit newline- or NUL-delimited paths.
- `!`, `-not`: Negate the following expression.
- `-exec COMMAND {} \;`: Run once per path.
- `-exec COMMAND {} +`: Run with batches of paths.

### Example

```sh
find . -type f -name '*.md'
```

Output:

```text
./README.md
./CHANGELOG.md
```
## getopts

Parse positional options.

### Usage

```sh
getopts OPTSTRING NAME [ARG ...]
```

### Options and forms

- A leading `:` in OPTSTRING selects silent error reporting.
- A letter followed by `:` requires an argument. Results use the named variable plus `OPTARG` and `OPTIND`.

### Example

```sh
set -- -a value
getopts a: option
echo "$option=$OPTARG"
```

Output:

```text
a=value
```
## grep

Search text with basic, extended, fixed, recursive, and color modes.

### Usage

```sh
grep [OPTIONS] PATTERN [FILE ...]
```

### Options and forms

- `-E`: Extended regular expressions.
- `-F`: Fixed-string matching.
- `-i`: Ignore case.
- `-q`: Quiet; return status only.
- `-v`: Invert matches.
- `-n`: Prefix line numbers.
- `-o`: Print only matched text.
- `-r`: Recurse into directories.
- `-x`: Match whole lines.
- `--color=always|auto|never`: Control match color; `--colour` is also accepted.

### Example

```sh
printf 'alpha\nbeta\n' | grep beta
```

Output:

```text
beta
```
## head

Write the first lines or bytes of input.

### Usage

```sh
head [-n N | -N | -c N | -cN] [FILE ...]
```

### Options and forms

- `-n N`, `-N`: Write the first N lines.
- `-c N`, `-cN`: Write the first N bytes.

### Example

```sh
printf 'one\ntwo\nthree\n' | head -n 2
```

Output:

```text
one
two
```
## kill

Send a signal to processes.

### Usage

```sh
kill [-SIGNAL] PID ...
```

### Options and forms

- `-SIGNAL`: Select a signal by name or number; the default is SIGTERM.
- `-0`: Check whether a process can be signalled without sending a signal.

### Example

```sh
kill -0 $$
echo $?
```

Output:

```text
0
```
## ln

Create hard or symbolic links.

### Usage

```sh
ln [-sfT] TARGET LINK
```

### Options and forms

- `-s`: Create a symbolic link.
- `-f`: Replace an existing destination.
- `-T`: Treat the destination as a normal path, not a directory.

### Example

```sh
ln -s target.txt link.txt
readlink link.txt
```

Output:

```text
target.txt
```
## ls

Use the lsfancy emoji and terminal-width-aware listing.

### Usage

```sh
ls [-aAdlhRtrS1F] [PATH ...]
```

Because `-h` means human-readable sizes, use `--help` to display this page.

### Options and forms

- `-a`: Include `.` and `..` plus hidden entries.
- `-A`: Include hidden entries except `.` and `..`.
- `-d`: List directories themselves rather than their contents.
- `-l`: Use long format.
- `-h`: Show human-readable sizes; use `--help` for this page.
- `-R`: Recurse into directories.
- `-t`: Sort by modification time.
- `-r`: Reverse the result order.
- `-S`: Sort by size.
- `-1`: Print one entry per line.
- `-F`: Append classify suffixes such as `/`, `@`, and `*`.

### Example

```sh
builtin ls -l README.md
```

Output:

```text
-rw-r--r--    32221 2026-08-28 17:55 📄 README.md
```
## lsbun

Invoke Bun Shell's original ls implementation.

### Usage

```sh
lsbun [OPTIONS] [PATH ...]
```

### Options and forms

- `-a`: Include all entries.
- `-A`: Include hidden entries except `.` and `..`.
- `-d`: List directories themselves.
- `-l`: Use long format.
- `-R`: Recurse into directories.

### Example

```sh
builtin lsbun README.md
```

Output:

```text
README.md
```
## lsfancy

List files with icons, columns, metadata, sorting, and recursion.

### Usage

```sh
lsfancy [-aAdlhRtrS1F] [PATH ...]
```

Because `-h` means human-readable sizes, use `--help` to display this page.

### Options and forms

- `-a`: Include `.` and `..` plus hidden entries.
- `-A`: Include hidden entries except `.` and `..`.
- `-d`: List directories themselves rather than their contents.
- `-l`: Use long format, including symlink targets.
- `-h`: Show human-readable sizes; use `--help` for this page.
- `-R`: Recurse into directories.
- `-t`: Sort by modification time.
- `-r`: Reverse the result order.
- `-S`: Sort by size.
- `-1`: Print one entry per line.
- `-F`: Append `/` for directories, `@` for links, `*` for executables, `=` for sockets, or `|` for FIFOs.

### Example

```sh
builtin lsfancy -1 README.md
```

Output:

```text
📄 README.md
```
## md5sum

Print MD5 hashes.

### Usage

```sh
md5sum [FILE ...]
```

### Example

```sh
printf hello | md5sum
```

Output:

```text
5d41402abc4b2a76b9719d911017c592  -
```
## mkdir

Create directories with Bun Shell's fallback.

### Usage

```sh
mkdir [-pv] [--parents] DIRECTORY ...
```

### Options and forms

- `-p`, `--parents`: Create missing parent directories and accept existing directories.
- `-v`, `--vebose`: Request verbose output (`--vebose` is Bun Shell's currently accepted spelling).

### Example

```sh
mkdir -p build/output
builtin test -d build/output; echo $?
```

Output:

```text
0
```
## mktemp

Create a temporary file or directory; TEMPLATE ends in XXXXXX.

### Usage

```sh
mktemp [-d] TEMPLATE
```

### Options and forms

- `-d`: Create a directory instead of a file.
- The template must end in exactly six `X` characters.

### Example

```sh
mktemp sample.XXXXXX
```

Output:

```text
sample.a1B2c3
```
## mv

Move files with Bun Shell's fallback.

### Usage

```sh
mv [OPTIONS] SOURCE ... DESTINATION
```

### Options and forms

- `-f`, `-h`, `-i`, `-n`, `-v`: Currently accepted by Bun Shell but do not change behaviour; `-i` and `-n` do not prevent overwriting.

### Example

```sh
mv old.txt new.txt
basename new.txt
```

Output:

```text
new.txt
```
## print

Write arguments with mksh-style print semantics.

### Usage

```sh
print [-rRnNl] [-uFD] [--] [ARG ...]
```

### Options and forms

- `-r`, `-R`: Do not interpret backslash escapes.
- `-n`: Omit the terminator.
- `-l`: Separate arguments with newlines.
- `-N`: Separate and terminate arguments with NUL bytes.
- `-uFD`: Write to file descriptor 1 or 2; other descriptors are not implemented.
- `--`: Stop option parsing.

### Example

```sh
print hello world
```

Output:

```text
hello world
```
## printf

Format and write arguments.

### Usage

```sh
printf FORMAT [ARG ...]
```

### Options and forms

- Supported conversions are `%s`, `%d`, `%i`, `%%`, and optional numeric field widths; backslash escapes are also interpreted.

### Example

```sh
printf '%s=%d\n' answer 42
```

Output:

```text
answer=42
```
## pwd

Print the active directory.

### Usage

```sh
pwd
```

### Example

```sh
pwd
```

Output:

```text
/data/data/com.termux/files/home
```
## read

Read a line into shell variables.

### Usage

```sh
read [-r] NAME ...
```

### Options and forms

- `-r`: Preserve backslashes instead of treating them as escapes.
- `--`: Stop option parsing. With no names, assign to `REPLY`.

### Example

```sh
printf 'one two\n' | read first second
echo "$first/$second"
```

Output:

```text
one/two
```
## readonly

Define variables that cannot be changed.

### Usage

```sh
readonly [-p] [--] [NAME[=VALUE] ...]
```

### Options and forms

- `-p`: Print readonly definitions.
- `--`: Stop option parsing.

### Example

```sh
readonly NAME=value
echo "$NAME"
```

Output:

```text
value
```
## realpath

Print canonical absolute paths.

### Usage

```sh
realpath PATH ...
```

### Example

```sh
realpath .
```

Output:

```text
/data/data/com.termux/files/home/bunmsh
```
## rm

Remove files and directories with Bun Shell's fallback.

### Usage

```sh
rm [OPTIONS] FILE ...
```

### Options and forms

- `-f`: Ignore missing operands.
- `-r`, `-R`, `--recursive`: Remove directories recursively.
- `-v`, `--verbose`: Request verbose output.
- `-d`, `--dir`: Remove empty directories.
- `-i`, `--interactive=always`: Prompt for each removal.
- `-I`, `--interactive=once`: Prompt once.
- `--interactive=never`: Never prompt.
- `--preserve-root`, `--no-preserve-root`: Accepted but currently have no effect.

### Example

```sh
rm unwanted.txt
builtin test -e unwanted.txt; echo $?
```

Output:

```text
1
```
## rmdir

Remove empty directories.

### Usage

```sh
rmdir [-p | --parents] DIRECTORY ...
```

### Options and forms

- `-p`, `--parents`: Remove empty parent directories after each operand.

### Example

```sh
mkdir empty
rmdir empty
builtin test -d empty; echo $?
```

Output:

```text
1
```
## sed

Apply supported print and substitution expressions.

### Usage

```sh
sed [-nEr] [-e SCRIPT] [-i] [SCRIPT] [FILE ...]
```

### Options and forms

- `-n`: Suppress automatic output.
- `-e SCRIPT`, `-eSCRIPT`: Add a script.
- `-E`, `-r`: Use extended regular expressions.
- `-i`: Edit files in place.
- Supported commands include numeric `p` and `s///` with `g` and `p` flags.

### Example

```sh
printf 'hello world\n' | sed 's/world/bunmsh/'
```

Output:

```text
hello bunmsh
```
## seq

Print a numeric sequence.

### Usage

```sh
seq [OPTIONS] [FIRST [INCREMENT]] LAST
```

### Options and forms

- `-s TEXT`, `--separator TEXT`: Set the separator.
- `-t TEXT`, `--terminator TEXT`: Set the terminator.
- `-w`, `--fixed-width`: Accepted, but currently does not pad values.

### Example

```sh
seq 3
```

Output:

```text
1
2
3
```
## serve

Start the bunmsh HTTP file server.

### Usage

```sh
serve [--auto-open] [--minapk-webview] [--random-url] [DIRECTORY]
```

### Options and forms

- `--auto-open` / `--auto-open=off` / `--auto-open=/path`: Open the serving
  URL after startup, or explicitly disable it, or open a specific path under
  it instead of the root. Looks for `xdg-open` on PATH first regardless of
  platform; falls back to `open` on macOS or `cmd /c start` on Windows only
  when `xdg-open` isn't found. Bare `--auto-open` turns it on; `=off`, `=no`,
  `=false`, or `=` (empty) turns it off, overriding an environment default
  that turned it on; a value starting with `/` (e.g. `--auto-open=/index.html`)
  turns it on and opens that path relative to the served URL instead of the
  root — resolved after any `--random-url` prefix, so the secret prefix is
  still there and the URL still works. The `o` control on stdin (see below)
  opens the same target this flag configured.
- `--minapk-webview` / `--minapk-webview=N` / `--minapk-webview=off`: Pass
  `MINAPK_WEBVIEW` to the spawned opener. Bare `--minapk-webview` passes `1`;
  `=N` passes the literal digit string `N`; `=off`, `=no`, `=false`, or `=`
  (empty) means don't pass it at all. Not passed by default.
- `--random-url` / `--random-url=off`: Serve beneath a high-entropy random URL
  prefix (requests without it get `404`), or explicitly disable it. Same
  bare/`=off`/`=no`/`=false`/`=` rules as `--auto-open`.
- `SERVE_AUTO_OPEN`, `SERVE_MINAPK_WEBVIEW`, and `SERVE_RANDOM_URL` set the
  defaults before CLI flags are applied (accepting `1`, `true`, `yes`, or
  `on`; a digit string for `SERVE_MINAPK_WEBVIEW`; a `/`-led path for
  `SERVE_AUTO_OPEN`); every flag defaults to off/not-passed. A CLI flag
  always overrides its environment default, including turning off something
  the environment turned on.
- `--` stops option parsing. The optional operand selects the served directory.

### Example

```sh
serve --random-url public
```

Output:

```text
Serving /home/user/public
  http://localhost:3000/AaBIdviNcACxwZF2x3VW0QAaBIdviNcAGsAviNI5B59AAaBIdviNcAKsuNiSJkMrdQAaBIdviNcAOoVDLS5ydB9Q/
```
## set

Print variables or replace positional parameters.

### Usage

```sh
set [-- [ARG ...]]
```

### Options and forms

- `--`: Replace positional parameters with the remaining arguments. With no arguments, print variables.

### Example

```sh
set -- alpha beta
echo "$1/$2"
```

Output:

```text
alpha/beta
```
## sha256sum

Print SHA-256 hashes.

### Usage

```sh
sha256sum [FILE ...]
```

### Example

```sh
printf hello | sha256sum
```

Output:

```text
2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824  -
```
## shift

Discard leading positional parameters.

### Usage

```sh
shift [COUNT]
```

### Example

```sh
set -- one two three
shift
echo "$1 $2"
```

Output:

```text
two three
```
## sleep

Pause; supports ms, s, m, and h suffixes.

### Usage

```sh
sleep DURATION
```

### Options and forms

- Bare durations are seconds; suffixes `ms`, `s`, `m`, and `h` select milliseconds, seconds, minutes, and hours.

### Example

```sh
time sleep 10ms
```

Output:

```text
real 10.000000 ms
```
## sort

Sort, reverse, compare numerically, or deduplicate lines.

### Usage

```sh
sort [-rnu] [FILE ...]
```

### Options and forms

- `-r`: Reverse the result.
- `-n`: Compare numerically.
- `-u`: Remove duplicate lines. These short flags may be combined.

### Example

```sh
printf 'c\na\nb\n' | sort
```

Output:

```text
a
b
c
```
## source

Evaluate a file in the current shell.

### Usage

```sh
source FILE [ARG ...]
```

### Example

```sh
printf 'NAME=sourced\n' > settings.sh
source settings.sh
echo "$NAME"
```

Output:

```text
sourced
```
## tab

Manage directory tabs and shell session controls.

### Usage

```sh
tab [n | x | c | l | r | s | save | path | mouse | NUMBER]
```

### Options and forms

- `n` creates a tab; `x`/`c` closes it; `l` and `r` switch tabs.
- `save`/`s` saves history; `save d` deduplicates it.
- `path [on|off|true|false]` controls PATH lookup.
- `mouse [on|off|true|false]` controls terminal mouse tracking.
- A numeric operand selects that tab.

### Example

```sh
tab
```

Output:

```text
📁 ~/project  📂 ~/project
[2]$
```
## tac

Reverse newline-delimited records in each input file.

### Usage

```sh
tac [--] [FILE ...]
```

### Options and forms

- `--`: Stop option parsing.
- `-`: Read from stdin at that operand position.
- Other options are not currently supported.

### Example

```sh
printf 'one\ntwo\nthree\n' | tac
```

Output:

```text
three
two
one
```
## tail

Write the last lines, or start output at a selected line.

### Usage

```sh
tail [-n N | -N | -n +N | -n+N] [FILE ...]
```

### Options and forms

- `-n N`, `-N`: Write the last N lines.
- `-n +N`, `-n+N`: Start output at line N.

### Example

```sh
printf 'one\ntwo\nthree\n' | tail -n 2
```

Output:

```text
two
three
```
## tee

Copy stdin to stdout and files.

### Usage

```sh
tee [-a] [FILE ...]
```

### Options and forms

- `-a`: Append to files rather than replacing them.

### Example

```sh
printf hello | tee output.txt
```

Output:

```text
hello
```
## test

Evaluate file, string, and integer expressions; [ requires a closing ].

### Usage

```sh
test EXPRESSION
```

### Options and forms

- Unary file tests: `-e`, `-f`, `-d`, `-b`, `-c`, `-p`, `-S`, `-L`/`-h`, `-s`, `-r`, `-w`, and `-x`.
- Unary string tests: `-n` and `-z`.
- String comparisons: `=`, `==`, and `!=`.
- Integer comparisons: `-eq`, `-ne`, `-gt`, `-ge`, `-lt`, and `-le`.
- File comparisons: `-nt`, `-ot`, and `-ef`. Logical `!`, `-a`, and `-o` are supported.

### Example

```sh
test -d /tmp
echo $?
```

Output:

```text
0
```
## time

Run a command and report elapsed time.

### Usage

```sh
time [COMMAND [ARG ...]]
```

### Display

- Elapsed time is written to stderr in milliseconds with six decimal places.
- When stderr is a terminal, each three-digit magnitude group uses a different
  ANSI color, making units and fractional precision easier to distinguish.
- The decimal point is dimmed. Colors are omitted when stderr is redirected or
  captured.

### Example

```sh
time true
```

Output:

```text
real 0.000000 ms
```
## touch

Create files or update timestamps.

### Usage

```sh
touch FILE ...
```

### Options and forms

- No options are currently supported.

### Example

```sh
touch created.txt
builtin test -f created.txt; echo $?
```

Output:

```text
0
```
## tr

Translate or delete characters.

### Usage

```sh
tr [-d] SET1 [SET2]
```

### Options and forms

- `-d`: Delete characters in SET1 instead of translating them.
- Simple ranges such as `a-z` are supported.

### Example

```sh
printf 'hello\n' | tr a-z A-Z
```

Output:

```text
HELLO
```
## true

Return success.

### Usage

```sh
true
```

### Example

```sh
true
echo $?
```

Output:

```text
0
```
## type

Describe how command names resolve.

### Usage

```sh
type NAME ...
```

### Example

```sh
type echo
```

Output:

```text
echo is a shell builtin
```
## umask

Print or set the file-creation mask.

### Usage

```sh
umask [MODE]
```

### Example

```sh
umask 022
umask
```

Output:

```text
0022
```
## unalias

Remove aliases.

### Usage

```sh
unalias [-a] [--] NAME ...
```

### Options and forms

- `-a`: Remove every alias.
- `--`: Stop option parsing.

### Example

```sh
alias ll='ls -l'
unalias ll
type ll
```

Output:

```text
ll not found
```
## uname

Print system information.

### Usage

```sh
uname [-asnrvmp]
```

### Options and forms

- `-a`: Select all supported fields.
- `-s`: System name.
- `-n`: Host name.
- `-r`: OS release.
- `-v`: OS version.
- `-m`: Machine architecture.
- `-p`: Processor architecture. Short flags may be combined.

### Example

```sh
uname -mprs
```

Output:

```text
Linux 6.17.0-PRoot-Distro aarch64 aarch64
```
## unset

Remove shell variables.

### Usage

```sh
unset [-v] [--] NAME ...
```

### Options and forms

- `-v`: Explicitly select variables (the only supported unset kind).
- `--`: Stop option parsing.

### Example

```sh
NAME=value
unset NAME
echo "${NAME:-missing}"
```

Output:

```text
missing
```
## wc

Count lines, words, and bytes.

### Usage

```sh
wc [-lwc] [FILE ...]
```

### Options and forms

- `-l`: Count lines.
- `-w`: Count words.
- `-c`: Count bytes. Short flags may be combined.

### Example

```sh
printf 'one two\n' | wc -lwc
```

Output:

```text
1 2 8
```
## whence

Describe command lookup.

### Usage

```sh
whence [-pv] NAME ...
```

### Options

- `-p`: Search `PATH` only, ignoring aliases, functions, and builtins.
- `-v`: Print a verbose description of how each name resolves.

### Example

```sh
whence -p bun
```

Output:

```text
/data/data/com.termux/files/usr/bin/bun
```
## which

Print executable paths found through PATH.

### Usage

```sh
which NAME ...
```

### Behavior

- `which` explicitly searches the current `PATH`, even when normal PATH command
  lookup is disabled by `bunmsh --builtin-only` or `tab path off`.
- Use command substitution such as `"$(which NAME)"` to obtain an explicit path
  and run an external command in either mode.

### Example

```sh
which bun
```

Output:

```text
/data/data/com.termux/files/usr/bin/bun
```

To explicitly run a PATH command while normal PATH lookup is disabled:

```sh
tab path off
"$(which sh)" -c 'printf path-command'
```

Output:

```text
path-command
```
## yes

Repeatedly write the strings, or y by default.

### Usage

```sh
yes [STRING ...]
```

### Example

```sh
yes ok | head -n 3
```

Output:

```text
ok
ok
ok
```
