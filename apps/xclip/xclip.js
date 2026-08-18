#!/usr/bin/env bun

// Ported from ../tmpk/bin/xclip.sh (the DroidScript-era xclip). That version
// bridged to native only through DroidScript's dsapi.pipe; this one uses
// native-bridge instead. The core semantics are unchanged: "primary" is
// local-file-only (matches X11's mouse-selection clipboard, which xclip also
// keeps separate from the real clipboard), and only "-selection clipboard"
// (or its "-clip"/"-clipboard" shorthand) touches the real Android
// clipboard, via getcb()/setcb().
import { getcb, setcb, available } from "../native-bridge/native-bridge.js"

const argv = process.argv.slice(2)

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`
 Usage: Paste/Copy
  xclip -o [-selection clipboard]
  xclip -o [-clip]
  echo hello | xclip [-selection clipboard]
  echo hello | xclip [-clip]

 Uses primary by default(mouse selection)
`)
  process.exit(0)
}

const selMatch = argv.join(" ").match(/-selection\s+(\S+)/)
const cb = selMatch ? selMatch[1]
  : argv.some(a => a.includes("-clip")) ? "clipboard"
  : "primary"

process.stderr.write(`\x1b[35mClipboard 剪貼板📋 ： ${cb} \n\x1b[0m`)

const cbf = `${process.env.HOME}/.xclip.${cb}`
const useNative = cb !== "primary"

if (useNative && !available())
  process.stderr.write(`native bridge not available: PKG_BRIDGE_SOCK is not set\nNo native clipboard now!\n`)

const isPaste = argv.some(a => a.toLowerCase() === "-o")

if (isPaste) {
  process.stderr.write(`\x1b[33mPaste 貼上 📋 \n\x1b[0m`)

  if (useNative && available()) {
    try {
      await Bun.write(cbf, (await getcb()) ?? "")
    } catch (e) {
      process.stderr.write(`getcb failed: ${e.message}\n`)
    }
  }

  const file = Bun.file(cbf)
  if (await file.exists()) process.stdout.write(new Uint8Array(await file.arrayBuffer()))
} else {
  process.stderr.write(`\x1b[33mCopy 複製 ✂️ \n\x1b[0m`)

  const input = await Bun.stdin.arrayBuffer()
  await Bun.write(cbf, input)

  if (useNative && available()) {
    try {
      await setcb(new TextDecoder().decode(input))
    } catch (e) {
      process.stderr.write(`setcb failed: ${e.message}\n`)
    }
  }
}

// Explicit exit: call()'s own timeout race means every await above is
// guaranteed to settle, but a getcb()/setcb() that hit that timeout leaves
// an abandoned fetch running, which keeps Bun's event loop alive on its own.
// Without this, xclip could still hang after printing everything it needs
// to -- the shell would just never get its prompt back.
process.exit(0)
