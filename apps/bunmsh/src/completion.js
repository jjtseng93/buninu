import { readdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, resolve } from "node:path";
import { safeHistoryEntry } from "./history.js";
import { environmentValue } from "./environment.js";

const WINDOWS_EXECUTABLE_EXTENSIONS = [".exe", ".com", ".cmd", ".bat"];

function commandName(entry, platform) {
  if (platform !== "win32") return entry.name;
  const lower = entry.name.toLowerCase();
  const extension = WINDOWS_EXECUTABLE_EXTENSIONS.find((value) => lower.endsWith(value));
  return extension ? entry.name.slice(0, -extension.length) : null;
}

function lowerBound(items, value) {
  let left = 0;
  let right = items.length;
  while (left < right) {
    const middle = (left + right) >>> 1;
    if (items[middle] < value) left = middle + 1;
    else right = middle;
  }
  return left;
}

export function prefixMatches(items, prefix) {
  if (!prefix) return [];
  const start = lowerBound(items, prefix);
  const end = lowerBound(items, `${prefix}\uffff`);
  return items.slice(start, end);
}

export function firstPrefixMatch(items, prefix) {
  if (!prefix) return null;
  const index = lowerBound(items, prefix);
  return items[index]?.startsWith(prefix) ? items[index] : null;
}

export function completionContext(line, cursor = line.length) {
  const source = line.slice(0, cursor);
  let command = true;
  let wordStart = 0;
  let quote = null;
  let escaped = false;
  let token = "";

  const finishWord = () => {
    if (!token) return;
    if (command && /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      token = "";
      return;
    }
    command = false;
    token = "";
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (escaped) {
      token += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      else token += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === ";" || ch === "|" || ch === "&" || ch === "\n") {
      finishWord();
      command = true;
      token = "";
      wordStart = i + 1;
      continue;
    }
    if (/\s/.test(ch)) {
      finishWord();
      wordStart = i + 1;
      continue;
    }
    if (!token) wordStart = i;
    token += ch;
  }

  const assignment = command && /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
  return {
    command: command && !assignment && quote === null,
    prefix: token,
    start: wordStart,
  };
}

export function historyGhost(history, line) {
  if (!line) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (!safeHistoryEntry(entry)) continue;
    if (entry !== line && entry.startsWith(line)) return entry.slice(line.length);
  }
  return null;
}

export function nextGhostChunk(ghost) {
  if (!ghost) return "";
  let i = 0;
  while (i < ghost.length && /\s/.test(ghost[i])) i++;
  while (i < ghost.length && !/\s/.test(ghost[i])) i++;
  while (i < ghost.length && /\s/.test(ghost[i])) i++;
  return ghost.slice(0, i || ghost.length);
}

export function fitGhost(ghost, available) {
  let output = "", width = 0;
  for (const character of ghost ?? "") {
    const characterWidth = Bun.stringWidth(character);
    if (width + characterWidth > Math.max(0, available)) break;
    output += character;
    width += characterWidth;
  }
  return { output, width };
}

export class CommandIndex {
  constructor(builtins, options = {}) {
    this.builtins = builtins;
    this.platform = options.platform ?? process.platform;
    this.pathDelimiter = options.pathDelimiter ?? delimiter;
    this.pathNames = [];
    this.names = [...builtins].sort();
    this.pathValue = null;
    this.cwd = null;
    this.aliasSignature = null;
    this.refreshing = null;
  }

  syncShellNames(state) {
    const aliases = Object.keys(state.aliases).sort();
    const signature = aliases.join("\0");
    if (signature === this.aliasSignature) return;
    this.aliasSignature = signature;
    this.names = [...new Set([...this.builtins, ...aliases, ...this.pathNames])].sort();
  }

  async refresh(state) {
    if (this.refreshing) return this.refreshing;
    const pathValue = environmentValue(state.env, "PATH", this.platform) ?? "";
    const cwd = state.cwd;
    this.refreshing = (async () => {
      const directories = [...new Set(pathValue.split(this.pathDelimiter).map((directory) => {
        if (!directory) return cwd;
        return isAbsolute(directory) ? directory : resolve(cwd, directory);
      }))];
      const listings = await Promise.all(directories.map(async (directory) => {
        try {
          const entries = await readdir(directory, { withFileTypes: true });
          return entries
            .filter((entry) => !entry.isDirectory())
            .map((entry) => commandName(entry, this.platform))
            .filter((name) => name !== null);
        } catch {
          return [];
        }
      }));
      this.pathNames = listings.flat();
      this.pathValue = pathValue;
      this.cwd = cwd;
      this.aliasSignature = null;
      this.syncShellNames(state);
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  refreshIfChanged(state) {
    this.syncShellNames(state);
    const pathValue = environmentValue(state.env, "PATH", this.platform) ?? "";
    const relativePath = pathValue.split(this.pathDelimiter)
      .some((directory) => !directory || !isAbsolute(directory));
    if (this.pathValue !== pathValue || (relativePath && this.cwd !== state.cwd))
      void this.refresh(state);
  }

  matches(prefix) {
    return prefixMatches(this.names, prefix);
  }

  first(prefix) {
    return firstPrefixMatch(this.names, prefix);
  }
}

export class FileIndex {
  constructor(ttl = 10_000) {
    this.ttl = ttl;
    this.directories = new Map();
  }

  entries(directory) {
    const now = Date.now();
    const cached = this.directories.get(directory);
    if (cached && now - cached.at < this.ttl) return cached.names;
    let names = [];
    try {
      names = readdirSync(directory, { withFileTypes: true })
        .map((entry) => entry.name + (entry.isDirectory() ? "/" : ""))
        .sort();
    } catch {}
    this.directories.set(directory, { at: now, names });
    return names;
  }

  context(prefix, state) {
    const slash = prefix.lastIndexOf("/");
    const directoryPart = slash < 0 ? "" : prefix.slice(0, slash + 1);
    const basename = prefix.slice(slash + 1);
    let directory;
    if (directoryPart.startsWith("~/"))
      directory = resolve(state.env.HOME ?? state.cwd, directoryPart.slice(2));
    else if (isAbsolute(directoryPart)) directory = dirname(`${directoryPart}.`);
    else directory = resolve(state.cwd, directoryPart || ".");
    return { directoryPart, basename, directory };
  }

  matches(prefix, state) {
    const { directoryPart, basename, directory } = this.context(prefix, state);
    const names = basename
      ? prefixMatches(this.entries(directory), basename)
      : this.entries(directory);
    return names
      .filter((name) => basename.startsWith(".") || !name.startsWith("."))
      .map((name) => `${directoryPart}${name}`);
  }

  first(prefix, state) {
    return this.matches(prefix, state)[0] ?? null;
  }
}
