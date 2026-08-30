#!/usr/bin/env bun

import pkg from "../package.json" with { type: "json" };
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  lutimesSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  utimesSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const binDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(binDir, "..");

function fail(message) {
  console.error(`${pkg.name}: ${message}`);
  process.exit(1);
}

export function installUsage() {
  return `${pkg.name} install - copy this installation to a durable directory

Usage:
  ${pkg.name} --install [target-dir]
  ${pkg.name} --strip-install [target-dir]

Install options:
  -i,  --install [dir]        Install into <dir>/${pkg.name}/ (default mode)
  -si, --strip-install [dir]  Install into <dir>/ directly, no top-level
                               directory of its own
  -f,  --force                Install even when the destination is not empty
  -h,  --help                 Show this help and exit

The target directory defaults to the current directory, so running this
script with no arguments installs into ./${pkg.name}/.

Relative symbolic links are copied exactly as stored rather than followed,
so bin/androidNativeLibs and the multicall command links survive the copy
and are rebuilt for the destination platform on the next normal startup.
`;
}

export function parseInstallArguments(arguments_) {
  let strip = false;
  let force = false;
  let help = false;
  let target = null;

  const setTarget = (value, option) => {
    if (!value) fail(`${option} requires a directory`);
    if (target !== null) fail(`install accepts one target directory, got: ${value}`);
    target = value;
  };

  for (const argument of arguments_) {
    if (argument === "-i" || argument === "--install") {
      strip = false;
    } else if (argument === "-si" || argument === "--strip-install") {
      strip = true;
    } else if (argument.startsWith("--install=")) {
      strip = false;
      setTarget(argument.slice("--install=".length), "--install");
    } else if (argument.startsWith("--strip-install=")) {
      strip = true;
      setTarget(argument.slice("--strip-install=".length), "--strip-install");
    } else if (argument === "-f" || argument === "--force") {
      force = true;
    } else if (argument === "-h" || argument === "--help") {
      help = true;
    } else if (argument.startsWith("-")) {
      fail(`unknown install option: ${argument}`);
    } else {
      setTarget(argument, "install");
    }
  }

  return { strip, force, help, target: target ?? process.cwd() };
}

function hasEntries(path) {
  try {
    return readdirSync(path).length > 0;
  } catch {
    return false;
  }
}

function copyTree(source, destination) {
  const cp = Bun.which("cp");
  if (cp) {
    // `source/.` copies the directory contents, dotfiles such as .bashrc
    // included; -a implies -d, so symbolic links are recreated as links
    // instead of being followed. -f matches the fs path's force option: it
    // unlinks and retries a destination file that cannot be opened, which a
    // reinstall over read-only files (.git/objects is mode 444) needs.
    const result = Bun.spawnSync([cp, "-af", `${source}/.`, `${destination}/`], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if (result.exitCode !== 0) fail(`cp -af failed with exit ${result.exitCode}`);
    return "cp -af";
  }

  copyEntry(source, destination);
  return "node:fs";
}

function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

// Deliberately not fs.cpSync: it stats destination entries through their
// symbolic links, so reinstalling over a tree that already contains the
// dangling relative links Buninu ships (bin/musl-la -> shloader ->
// androidNativeLibs/...) fails with ENOENT before copying anything.
function copyEntry(source, destination) {
  const stats = lstatSync(source);
  const mode = stats.mode & 0o7777;

  if (stats.isSymbolicLink()) {
    // Recreate the link with its target string untouched. Resolving it would
    // turn bin/androidNativeLibs -> ../.. into a copy of the parent tree.
    rmSync(destination, { recursive: true, force: true });
    try {
      symlinkSync(readlinkSync(source), destination);
      // lutimes, not utimes: the latter follows the link and would stamp the
      // target instead. Not every platform implements it, and a link's own
      // timestamp matters to nothing here, so a failure is not worth reporting.
      try {
        lutimesSync(destination, stats.atime, stats.mtime);
      } catch {}
    } catch (error) {
      // Windows refuses symbolic links without the right privileges. Those
      // links are unused there (bin/*.bat stands in for them), so a warning
      // beats aborting an otherwise complete install.
      console.error(`${pkg.name}: skipped symbolic link ${destination}: ${error.message}`);
    }
    return;
  }

  if (stats.isDirectory()) {
    const existing = lstatOrNull(destination);
    if (existing && !existing.isDirectory()) rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(source)) {
      copyEntry(resolve(source, entry), resolve(destination, entry));
    }
    chmodSync(destination, mode);
    utimesSync(destination, stats.atime, stats.mtime);
    return;
  }

  // Device nodes, FIFOs and sockets. Nothing Buninu ships is one of these, and
  // recreating them needs mknod, so say what was left out instead of dropping
  // it silently and letting the gap surface later as a missing file.
  if (!stats.isFile()) {
    console.error(`${pkg.name}: skipped ${source}: not a regular file, directory, or symbolic link`);
    return;
  }

  // Read-only files (.git/objects is mode 444) cannot be written over, so
  // unlink first, the way cp -f does.
  rmSync(destination, { force: true });
  copyFileSync(source, destination);
  chmodSync(destination, mode);
  utimesSync(destination, stats.atime, stats.mtime);
}

export async function runInstall(arguments_ = []) {
  const options = parseInstallArguments(arguments_);
  if (options.help) {
    console.log(installUsage());
    return 0;
  }

  const target = resolve(options.target);
  const destination = options.strip ? target : resolve(target, pkg.name);

  // Copying a tree into itself either fails or recurses forever, depending on
  // which of the two copy paths runs, so refuse both shapes up front.
  const fromSource = relative(rootDir, destination);
  if (!fromSource) fail(`install destination is this installation: ${destination}`);
  if (!fromSource.startsWith("..") && !isAbsolute(fromSource)) {
    fail(`install destination is inside this installation: ${destination}`);
  }

  if (!options.force && existsSync(destination) && hasEntries(destination)) {
    fail(`install destination is not empty, pass --force to install anyway: ${destination}`);
  }

  mkdirSync(destination, { recursive: true });
  const method = copyTree(rootDir, destination);

  console.error(`${pkg.name}@${pkg.version}: installed to ${destination} (${method})`);
  console.error(`Start it with: bun ${resolve(destination, "bin", "init.js")}`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = await runInstall(process.argv.slice(2));
}
