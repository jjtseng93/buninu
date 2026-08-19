#!/usr/bin/env bun

// Android goes through native-bridge's xdgOpen (MainActivity.java validates
// the path stays under Buninu's home and serves it back out through a
// read-only content:// provider; a bare URL just goes to ACTION_VIEW). The
// other platforms each have their own "open with whatever the OS thinks is
// the default handler" mechanism -- macOS/Windows are real OS
// commands/APIs, but Linux's is conventionally *also* a command named
// xdg-open, so this script has to be careful not to find itself on PATH.
import { xdgOpen as bridgeOpen, available } from "../native-bridge/native-bridge.js"
const fs = require("fs")

// Buninu's own bin/ is prepended to PATH ahead of any real system binary of
// the same name (same concern as xclip.js/tts.js), and this script is
// itself registered as Buninu's "xdg-open" command -- a naive PATH search
// would just find this file. Skip Buninu's own bin dir and keep looking
// further down PATH for wherever a real xdg-open actually lives.
function findSystemXdgOpen() {
  const ownBinDir = process.env.BUNINU_HOME ? `${process.env.BUNINU_HOME}/bin` : null
  for (const dir of (process.env.PATH || "").split(":").filter(Boolean)) {
    if (dir === ownBinDir) continue
    const candidate = `${dir}/xdg-open`
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return candidate
    } catch {}
  }
  return null
}

async function runCommand(args) {
  const proc = Bun.spawn(args, { stdout: "ignore", stderr: "ignore" })
  return (await proc.exited) === 0
}

const argv = process.argv.slice(2)

if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
  console.log("usage: xdg-open <file-or-url>")
  process.exit(argv.length === 0 ? 1 : 0)
}

const target = argv[0]
let ok = false

try {
  if (process.platform === "android") {
    if (available()) {
      ok = await bridgeOpen(target)
    } else if (Bun.which("termux-open")) {
      // Plain Termux (no minapk) still reports platform "android" but has
      // no PKG_BRIDGE_SOCK -- termux-open (Termux:API) does the same
      // ACTION_VIEW-based open, same fallback relationship as tts.js's
      // termux-tts-speak branch when native-bridge isn't available.
      ok = await runCommand(["termux-open", target])
    } else {
      throw new Error("no native bridge and no termux-open (install termux-api, or run inside minapk's APK)")
    }
  } else if (process.platform === "darwin") {
    ok = await runCommand(["open", target])
  } else if (process.platform === "win32") {
    // start is a cmd builtin, not a real executable, and needs an empty ""
    // title argument first or it treats a quoted target as the title.
    ok = await runCommand(["cmd", "/c", "start", "", target])
  } else {
    const real = findSystemXdgOpen()
    if (!real) throw new Error("no system xdg-open found on PATH")
    ok = await runCommand([real, target])
  }
} catch (e) {
  process.stderr.write(`xdg-open: ${e.message}\n`)
  process.exit(1)
}

// Explicit exit: bridgeOpen() goes through native-bridge's call(), whose own
// timeout race leaves an abandoned fetch running the event loop on a
// timeout -- without this, xdg-open could hang after printing everything it
// needs to.
process.exit(ok ? 0 : 1)
