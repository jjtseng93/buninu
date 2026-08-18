#!/usr/bin/env bun

import pkg from "../package.json" with { type: "json" };
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir as systemTmpDir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const binDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(binDir, "..");
const REPO_ROOT = rootDir;

function fail(message) {
  console.error(`${pkg.name}: ${message}`);
  process.exit(1);
}

function usage() {
  return `${pkg.name} - ${pkg.description}

Usage:
  ${pkg.name} [init options] [jsgotty options]

Init options:
  -h, --help             Show this help and exit
  -V, --version          Show version and runtime information, then exit
  --readme               Render README.md in the terminal and exit
  --changelog            Render CHANGELOG.md in the terminal and exit
  --export [output.tgz]  Export this Buninu installation (default: ./buninu.tgz)
  --export-config [output.json]  Export this package.json (default: ./buninu.json)
  --shell <path|name>    Override buninu.shell for this run
  --command <command>    Override buninu.command for this run

Direct app launch (must be the first argument; skips the shell/command
startup flow entirely):
  --jsgotty [args...]    Spawn jsgotty directly, forwarding remaining
                          arguments, and exit with its exit code
                          (--jsgotty --help shows jsgotty's own options)
  --jsmdcui [args...]    Spawn jsmdcui directly, same forwarding behavior
  --musl-la [args...]    Spawn musl-la directly, same forwarding behavior

Package configuration:
  package.json contains a buninu section for default and platform settings.
  buninu.shell          Select the shell to start
  buninu.command        Run a startup command before entering the shell
  buninu.exitAfterCmd   Exit after buninu.command instead of falling back to
                         the shell (default: false)

All other options are forwarded to jsgotty. Without buninu.command, the
selected shell starts directly. With a command, it runs from the package.json
directory and then returns to the interactive shell regardless of exit status,
unless buninu.exitAfterCmd is true, in which case it exits instead.
`;
}

async function handleInformationArguments(arguments_) {
  if (arguments_.includes("-h") || arguments_.includes("--help")) {
    console.log(usage());
    return true;
  }

  if (arguments_.includes("-V") || arguments_.includes("--version")) {
    console.log(`${pkg.name}: ${pkg.description}`);
    console.log("Version:", pkg.version);
    console.log("Runtime:", `Bun ${Bun.version}`);
    console.log("Platform:", `${process.platform}/${process.arch}`);
    return true;
  }

  const exportOption = readExportArgument(arguments_);
  if (exportOption) {
    await exportInstallation(exportOption.output);
    return true;
  }

  const exportConfigOption = readExportConfigArgument(arguments_);
  if (exportConfigOption) {
    await exportConfig(exportConfigOption.output);
    return true;
  }

  if (arguments_.includes("--readme")) {
    const readmePath = resolve(REPO_ROOT, "README.md");
    if (!await pathExists(readmePath)) fail(`README not found: ${readmePath}`);
    const markdown = await Bun.file(readmePath).text();
    process.stdout.write(Bun.markdown.ansi(markdown, { hyperlinks: true }));
    if (!markdown.endsWith("\n")) process.stdout.write("\n");
    return true;
  }

  if (arguments_.includes("--changelog")) {
    const changelogPath = resolve(REPO_ROOT, "CHANGELOG.md");
    if (!await pathExists(changelogPath)) fail(`CHANGELOG not found: ${changelogPath}`);
    const markdown = await Bun.file(changelogPath).text();
    process.stdout.write(Bun.markdown.ansi(markdown, { hyperlinks: true }));
    if (!markdown.endsWith("\n")) process.stdout.write("\n");
    return true;
  }

  return false;
}

function readExportArgument(arguments_) {
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--export") {
      const next = arguments_[index + 1];
      return { output: next || "buninu.tgz" };
    }
    if (argument.startsWith("--export=")) {
      const output = argument.slice("--export=".length);
      if (!output) fail("--export= requires an output path");
      return { output };
    }
  }
  return null;
}

function readExportConfigArgument(arguments_) {
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--export-config") {
      const next = arguments_[index + 1];
      return { output: next || "buninu.json" };
    }
    if (argument.startsWith("--export-config=")) {
      const output = argument.slice("--export-config=".length);
      if (!output) fail("--export-config= requires an output path");
      return { output };
    }
  }
  return null;
}

async function exportInstallation(output) {
  const outputPath = resolve(process.cwd(), output);
  const tar = Bun.which(process.platform === "win32" ? "tar.exe" : "tar") || Bun.which("tar");
  if (!tar) fail("tar was not found in PATH");

  mkdirSync(dirname(outputPath), { recursive: true });
  const temporaryDir = mkdtempSync(resolve(systemTmpDir(), "buninu-export-"));
  const temporaryArchive = resolve(temporaryDir, "buninu.tgz");
  const temporaryBackup = resolve(temporaryDir, "previous-output.tgz");
  const hadExistingOutput = existsSync(outputPath);
  let exportError = null;
  try {
    // Keep the previous output recoverable, but remove it from its original
    // path while tar walks REPO_ROOT so an in-tree export cannot include itself.
    if (hadExistingOutput) {
      if (!lstatSync(outputPath).isFile()) throw new Error(`export path is not a file: ${outputPath}`);
      await Bun.write(temporaryBackup, Bun.file(outputPath));
      unlinkSync(outputPath);
    }
    const process_ = Bun.spawn(
      [tar, "-czf", temporaryArchive, "-C", dirname(REPO_ROOT), basename(REPO_ROOT)],
      { env: { ...process.env }, stdin: "inherit", stdout: "inherit", stderr: "inherit" },
    );
    const status = await process_.exited;
    if (status !== 0) throw new Error(`tar failed with exit ${status}`);
    await Bun.write(outputPath, Bun.file(temporaryArchive));
  } catch (error) {
    exportError = error;
    if (hadExistingOutput && await pathExists(temporaryBackup)) {
      await Bun.write(outputPath, Bun.file(temporaryBackup));
    }
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true });
  }

  if (exportError) fail(exportError?.message || String(exportError));
  console.log(outputPath);
}

async function exportConfig(output) {
  const outputPath = resolve(process.cwd(), output);

  if (existsSync(outputPath)) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    let answer;
    try {
      answer = await rl.question(`${outputPath} already exists and may be overwritten. Continue? [y/N] `);
    } finally {
      rl.close();
    }
    if (!/^[yY]/.test(answer.trim())) fail("Cancelled: output file was not overwritten");
  }

  const packageJsonPath = resolve(REPO_ROOT, "package.json");
  await Bun.write(outputPath, Bun.file(packageJsonPath));
  console.log(outputPath);
}

function splitCommand(command) {
  const words = [];
  let word = "";
  let quote = "";
  let escaped = false;

  for (const char of command.trim()) {
    if (escaped) {
      word += char;
      escaped = false;
    } else if (char === "\\" && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (char === quote) quote = "";
      else word += char;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (/\s/.test(char)) {
      if (word) words.push(word), word = "";
    } else {
      word += char;
    }
  }

  if (escaped || quote) fail("invalid quoting in package.json scripts.start");
  if (word) words.push(word);
  return words;
}

async function pathExists(path) {
  return Bun.file(path).exists();
}

async function findCommand(command) {
  if (!command) return null;
  if (command.includes("/") || command.includes("\\")) {
    const path = isAbsolute(command) ? command : resolve(rootDir, command);
    return await pathExists(path) ? path : null;
  }
  return Bun.which(command);
}

async function detectEnvironment() {
  const windows = process.platform === "win32" || Boolean(process.env.WINDIR);
  const termux = !windows && await pathExists("/data/data/com.termux/files/usr/bin/bash");
  const android = !windows && !termux && (
    process.platform === "android" ||
    await pathExists("/system/bin/linker64") ||
    Boolean(process.env.ANDROID_ROOT && process.env.ANDROID_DATA)
  );

  if (windows) {
    return {
      name: "windows",
      shell:
        Bun.which("pwsh.exe") ||
        Bun.which("powershell.exe") ||
        await findCommand(process.env.COMSPEC) ||
        Bun.which("cmd.exe") ||
        "cmd.exe",
    };
  }

  if (termux) {
    return {
      name: "linux",
      shell:
        await findCommand(process.env.SHELL) ||
        Bun.which("bash") ||
        Bun.which("sh") ||
        "/bin/sh",
    };
  }

  if (android) {
    return {
      name: "android",
      shell:
        await findCommand(process.env.SHELL) ||
        (await pathExists("/system/bin/sh") ? "/system/bin/sh" : null) ||
        Bun.which("sh") ||
        "sh",
    };
  }

  if (process.platform === "darwin") {
    return {
      name: "macos",
      shell:
        await findCommand(process.env.SHELL) ||
        Bun.which("zsh") ||
        Bun.which("bash") ||
        Bun.which("sh") ||
        "/bin/zsh",
    };
  }

  if (process.platform === "linux") {
    return {
      name: "linux",
      shell:
        await findCommand(process.env.SHELL) ||
        Bun.which("bash") ||
        Bun.which("sh") ||
        "/bin/sh",
    };
  }

  return {
    name: `unix:${process.platform}`,
    shell:
      await findCommand(process.env.SHELL) ||
      Bun.which("bash") ||
      Bun.which("sh") ||
      "/bin/sh",
  };
}

async function runPlatformSwitch(environment) {
  const scriptName = environment.name === "android"
    ? "switch_to_android.sh"
    : environment.name === "linux"
      ? "switch_to_linux.sh"
      : null;
  if (!scriptName) return;

  const scriptPath = resolve(binDir, scriptName);
  if (!await pathExists(scriptPath)) {
    fail(`platform switch script does not exist: ${scriptPath}`);
  }

  const shell = environment.name === "android" && await pathExists("/system/bin/sh")
    ? "/system/bin/sh"
    : Bun.which("sh") || "/bin/sh";
  const result = Bun.spawn([shell, scriptPath], {
    cwd: rootDir,
    env: { ...process.env },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await result.exited;
  if (status !== 0) {
    fail(`${scriptName} failed with exit ${status}`);
  }
}

async function rebuildNativeSymlinks(environment) {
  if (environment.name === "windows") return;

  const platformLinks = environment.name === "android"
    ? {
        bun: "androidNativeLibs/libbun.so",
        shloader: "androidNativeLibs/libsh-loader.so",
      }
    : {
        bun: "bun.sh",
        shloader: "multicall.sh",
      };
  const cmdlistPath = resolve(rootDir, "apps", "cmdlist");
  if (!await pathExists(cmdlistPath)) {
    fail(`command list does not exist: ${cmdlistPath}`);
  }

  const commandNames = [...new Set(
    (await Bun.file(cmdlistPath).text())
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  )];
  for (const name of commandNames) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
      fail(`invalid command name in ${cmdlistPath}: ${name}`);
    }
  }

  const links = Object.fromEntries([
    ...Object.entries(platformLinks),
    ...commandNames.map((name) => [name, "shloader"]),
  ]);

  for (const [name, target] of Object.entries(links)) {
    const linkPath = resolve(binDir, name);
    try {
      const existing = lstatSync(linkPath);
      if (!existing.isSymbolicLink()) {
        fail(`cannot rebuild symlink over non-symlink: ${linkPath}`);
      }
      unlinkSync(linkPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    symlinkSync(target, linkPath);
  }
}

function getFreePort() {
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      data() {},
    },
  });
  const port = listener.port;
  listener.stop(true);
  return port;
}

async function createChildEnvironment(environment) {
  const packageDir = dirname(rootDir);
  const androidCacheDir = resolve(packageDir, "cache");
  const tmpDir = process.env.TMPDIR || (
    environment.name === "android"
      ? existsSync(androidCacheDir)
        ? androidCacheDir
        : resolve(rootDir, "tmp")
      : systemTmpDir()
  );
  const homeDir = process.env.HOME || rootDir;
  const envFile = await pathExists(resolve(rootDir, ".bashrc"))
    ? resolve(rootDir, ".bashrc")
    : await pathExists(resolve(homeDir, ".bashrc"))
      ? resolve(homeDir, ".bashrc")
      : null;

  mkdirSync(tmpDir, { recursive: true });

  const inheritedPath = process.env.PATH || "";
  const hasTermuxExecPreload =
    environment.name === "android" &&
    String(process.env.LD_PRELOAD || "").includes("libtermux-exec.so");
  const pathEntries = [
    ...(hasTermuxExecPreload ? ["/system/bin"] : []),
    inheritedPath,
    binDir,
  ].filter(Boolean);

  const childEnvironment = { ...process.env };
  for (const key of Object.keys(childEnvironment)) {
    if (key.toLowerCase() === "path") delete childEnvironment[key];
  }
  childEnvironment[environment.name === "windows" ? "Path" : "PATH"] =
    pathEntries.join(delimiter);

  return {
    ...childEnvironment,
    HOME: homeDir,
    TMPDIR: tmpDir,
    SHELL: process.env.SHELL || environment.shell,
    BUNINU_HOME: rootDir,
    ...(envFile ? { ENV: envFile } : {}),
    TERM: process.env.TERM || "xterm-256color",
    COLORTERM: process.env.COLORTERM || "truecolor",
    DISPLAY: process.env.DISPLAY || "127.0.0.1:0",
  };
}

const directAppTargets = {
  "--jsgotty": "jsgotty",
  "--jsmdcui": "jsmdcui",
  "--musl-la": "musl-la",
};

async function runDirectApp(name, forwardedArgs, environment) {
  const isWindows = environment.name === "windows";
  const launcherPath = resolve(binDir, isWindows ? `${name}.bat` : name);
  if (!await pathExists(launcherPath)) {
    fail(`${name} is not available on ${environment.name}: ${launcherPath}`);
  }

  const childEnvironment = await createChildEnvironment(environment);
  const argv = isWindows
    ? [process.env.ComSpec || "cmd.exe", "/c", launcherPath, ...forwardedArgs]
    : [launcherPath, ...forwardedArgs];

  const child = Bun.spawn(argv, {
    cwd: rootDir,
    env: childEnvironment,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(await child.exited);
}

function readInitArguments(arguments_) {
  const forwarded = [];
  let shell = null;
  let command = null;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--shell" || argument === "--terminal") {
      shell = arguments_[index + 1];
      if (!shell) fail(`${argument} requires a command or executable path`);
      index += 1;
    } else if (argument.startsWith("--shell=") || argument.startsWith("--terminal=")) {
      shell = argument.slice(argument.indexOf("=") + 1);
      if (!shell) fail(`${argument.split("=")[0]} requires a command or executable path`);
    } else if (argument === "--command") {
      command = arguments_[index + 1];
      if (!command) fail("--command requires a shell command string");
      index += 1;
    } else if (argument.startsWith("--command=")) {
      command = argument.slice("--command=".length);
      if (!command) fail("--command requires a shell command string");
    } else {
      forwarded.push(argument);
    }
  }

  return { shell, command, forwarded };
}

function shellCommandArguments(shell, command, exitAfterCmd) {
  if (!command) return [shell];

  const shellName = basename(shell).toLowerCase();
  if (shellName === "cmd" || shellName === "cmd.exe") {
    if (exitAfterCmd) return [shell, "/d", "/s", "/c", command];
    const quotedShell = `"${shell.replaceAll('"', '""')}"`;
    return [shell, "/d", "/s", "/c", `${command} & ${quotedShell}`];
  }

  if (["powershell", "powershell.exe", "pwsh", "pwsh.exe"].includes(shellName)) {
    if (exitAfterCmd) {
      return [
        shell,
        "-NoLogo",
        "-Command",
        `& { ${command}; if (-not $?) { Write-Error 'Startup command failed' } }`,
      ];
    }
    const escapedShell = shell.replaceAll("'", "''");
    return [
      shell,
      "-NoLogo",
      "-Command",
      `& { ${command}; if (-not $?) { Write-Error 'Startup command failed' }; & '${escapedShell}' -NoExit }`,
    ];
  }

  const wrapped =
    `buninu_command=$1; shift; ( eval "$buninu_command" ); status=$?; ` +
    `if [ "$status" -ne 0 ]; then ` +
    `echo "buninu: startup command failed with exit $status" >&2; ` +
    (exitAfterCmd ? `fi; exit "$status"` : `fi; exec "$0"`);
  // Pass both the shell and startup command as argv instead of interpolating
  // them into the wrapper. This keeps the wrapper single-line and avoids LF
  // (Ctrl+J) characters in its process-list representation.
  return [shell, "-c", wrapped, shell, command];
}

const startScript = pkg.scripts?.start;
if (typeof startScript !== "string" || !startScript.trim()) {
  fail("package.json does not define scripts.start");
}

const directAppTarget = directAppTargets[process.argv[2]];
if (directAppTarget) {
  const directEnvironment = await detectEnvironment();
  await runPlatformSwitch(directEnvironment);
  await rebuildNativeSymlinks(directEnvironment);
  await runDirectApp(directAppTarget, process.argv.slice(3), directEnvironment);
}

if (await handleInformationArguments(process.argv.slice(2))) process.exit(0);

const command = splitCommand(startScript);
if (!command.length) fail("package.json scripts.start is empty");

// Use the Bun currently running init.js instead of relying on a second PATH lookup.
if (command[0] === "bun") command[0] = process.execPath;

const environment = await detectEnvironment();
await runPlatformSwitch(environment);
await rebuildNativeSymlinks(environment);
const initArguments = readInitArguments(process.argv.slice(2));
const configuredShell =
  pkg.buninu?.shell?.[environment.name] ??
  pkg.buninu?.shell?.default ??
  null;
const requestedShell =
  initArguments.shell ||
  configuredShell;

if (requestedShell) {
  const resolvedShell = await findCommand(requestedShell);
  if (!resolvedShell) {
    fail(`configured shell does not exist: ${requestedShell}`);
  }
  environment.shell = resolvedShell;
}

const commandConfiguration = pkg.buninu?.command;
const configuredCommand =
  typeof commandConfiguration === "string"
    ? commandConfiguration
    : commandConfiguration?.[environment.name] ??
      commandConfiguration?.default ??
      null;
const startupCommand = initArguments.command ?? configuredCommand;
const exitAfterCmd = Boolean(pkg.buninu?.exitAfterCmd);

const forwardedArguments = initArguments.forwarded;
const hasExplicitPort = forwardedArguments.some((argument) =>
  argument === "-p" ||
  argument === "--port" ||
  argument.startsWith("--port=")
);
const portArguments = hasExplicitPort ? [] : ["-p", String(getFreePort())];
const childEnvironment = await createChildEnvironment(environment);

console.error(
  `${pkg.name}@${pkg.version}: ${environment.name}/${process.arch}, ` +
  `port=${portArguments[1] || "user-defined"}, shell=${environment.shell}`,
);

const child = Bun.spawn(
  [
    ...command,
    ...portArguments,
    ...forwardedArguments,
    ...shellCommandArguments(environment.shell, startupCommand, exitAfterCmd),
  ],
  {
    cwd: rootDir,
    env: childEnvironment,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

process.exit(await child.exited);
