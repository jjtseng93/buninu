#!/usr/bin/env bun
// jasm: a small pure-JavaScript assembler for x64 (GNU Intel syntax) and
// AArch64 sources. It emits the .text bytes and relocations that Clang's
// integrated assembler would emit for the same input, without any compiler.
//
// Relocations use ELF numbering so templates stay compatible with code.js and
// the PE writer in index.js: [offset, type, symbol, addend].
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const RELOC = {
  x64: { PC32: 2, PLT32: 4 },
  arm64: {
    LD_PREL_LO19: 273, ADR_PREL_LO21: 274, ADR_PREL_PG_HI21: 275, ADD_ABS_LO12_NC: 277,
    LDST8_ABS_LO12_NC: 278, TSTBR14: 279, CONDBR19: 280, JUMP26: 282, CALL26: 283,
    LDST16_ABS_LO12_NC: 284, LDST32_ABS_LO12_NC: 285, LDST64_ABS_LO12_NC: 286,
  },
};

export class AsmError extends Error {
  constructor(message) { super(message); this.name = 'AsmError'; }
}
const fail = message => { throw new AsmError(message); };

// ---------------------------------------------------------------- utilities

const fitsS = (v, bits) => v >= -(1n << BigInt(bits - 1)) && v < (1n << BigInt(bits - 1));
const pushLE = (out, v, bytes) => {
  let u = BigInt.asUintN(bytes * 8, BigInt(v));
  for (let i = 0; i < bytes; i++, u >>= 8n) out.push(Number(u & 0xffn));
};
const writeLE = (out, at, v, bytes) => {
  let u = BigInt.asUintN(bytes * 8, BigInt(v));
  for (let i = 0; i < bytes; i++, u >>= 8n) out[at + i] = Number(u & 0xffn);
};

// Split on top-level commas, keeping brackets, parentheses and strings intact.
function splitOperands(text) {
  const parts = [];
  let depth = 0, current = '', quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      current += c;
      if (c === '\\') current += text[++i] ?? '';
      else if (c === '"') quote = false;
      continue;
    }
    if (c === '"') quote = true;
    else if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += c;
  }
  if (current.trim() || parts.length) parts.push(current.trim());
  return parts;
}

function parseString(text) {
  const m = /^"((?:\\.|[^"\\])*)"$/s.exec(text.trim());
  if (!m) fail('expected a string literal: ' + text);
  const out = [];
  const s = m[1];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') {
      const char = String.fromCodePoint(s.codePointAt(i));
      out.push(...Buffer.from(char));
      i += char.length - 1;
      continue;
    }
    const c = s[++i];
    const simple = { n: 10, t: 9, r: 13, b: 8, f: 12, v: 11, a: 7, '\\': 92, '"': 34, "'": 39 };
    if (c in simple) out.push(simple[c]);
    else if (c === 'x') {
      const hex = /^[0-9a-fA-F]+/.exec(s.slice(i + 1))?.[0];
      if (!hex) fail('expected a hex digit after a hex escape');
      out.push(parseInt(hex.slice(-2), 16)); i += hex.length;
    } else if (/[0-7]/.test(c)) {
      const oct = /^[0-7]{1,3}/.exec(s.slice(i))[0];
      out.push(parseInt(oct, 8) & 0xff); i += oct.length - 1;
    } else fail('unknown string escape \\' + c);
  }
  return out;
}

// ---------------------------------------------------------------- expressions
// Values are linear: { sym, k } meaning symbol + k (BigInt). Precedence
// follows GNU as: + - < | ^ & < * / % << >> < unary.

function tokenizeExpr(text) {
  const tokens = [];
  const re = /\s*(?:(0[xX][0-9a-fA-F]+|0[bB][01]+|\d+)|'(\\.|[^\\'])'?|([A-Za-z_.$][\w.$@]*)|(<<|>>|[-+*/%&|^~()!]))/y;
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) { i++; continue; }
    re.lastIndex = i;
    const m = re.exec(text);
    if (!m) fail('bad expression: ' + text);
    i = re.lastIndex;
    if (m[1] !== undefined) {
      const s = m[1];
      const v = /^0\d/.test(s) ? BigInt('0o' + s.slice(1)) : BigInt(s);
      tokens.push({ num: v });
    } else if (m[2] !== undefined) {
      const ch = m[2].startsWith('\\') ? parseString(`"${m[2]}"`)[0] : m[2].codePointAt(0);
      tokens.push({ num: BigInt(ch) });
    } else if (m[3] !== undefined) tokens.push({ id: m[3] });
    else tokens.push({ op: m[4] });
  }
  return tokens;
}

export function evalExpr(text, consts = new Map()) {
  const tokens = tokenizeExpr(text);
  let pos = 0;
  const peek = () => tokens[pos]?.op;
  const numeric = (v, op) => { if (v.sym) fail(`'${op}' needs plain numbers: ${text}`); return v.k; };
  const level = (ops, next, apply) => () => {
    let left = next();
    while (ops.includes(peek())) { const op = tokens[pos++].op; left = apply(op, left, next()); }
    return left;
  };
  const unary = () => {
    const t = tokens[pos++];
    if (!t) fail('incomplete expression: ' + text);
    if (t.op === '-') return { sym: null, k: -numeric(unary(), '-') };
    if (t.op === '+') return unary();
    if (t.op === '~') return { sym: null, k: ~numeric(unary(), '~') };
    if (t.op === '!') return { sym: null, k: numeric(unary(), '!') ? 0n : 1n };
    if (t.op === '(') { const v = additive(); if (tokens[pos++]?.op !== ')') fail('missing ) in ' + text); return v; }
    if (t.num !== undefined) return { sym: null, k: t.num };
    if (t.id !== undefined) return consts.has(t.id) ? { sym: null, k: consts.get(t.id) } : { sym: t.id, k: 0n };
    fail('unexpected token in expression: ' + text);
  };
  const mul = level(['*', '/', '%', '<<', '>>'], unary, (op, a, b) => {
    const x = numeric(a, op), y = numeric(b, op);
    if ((op === '/' || op === '%') && y === 0n) fail('division by zero: ' + text);
    return { sym: null, k: op === '*' ? x * y : op === '/' ? x / y : op === '%' ? x % y : op === '<<' ? x << y : x >> y };
  });
  const bits = level(['|', '^', '&'], mul, (op, a, b) => {
    const x = numeric(a, op), y = numeric(b, op);
    return { sym: null, k: op === '|' ? x | y : op === '^' ? x ^ y : x & y };
  });
  const additive = level(['+', '-'], bits, (op, a, b) => {
    if (op === '+') {
      if (a.sym && b.sym) fail('cannot add two symbols: ' + text);
      return { sym: a.sym ?? b.sym, k: a.k + b.k };
    }
    if (b.sym && a.sym === b.sym) return { sym: null, k: a.k - b.k };
    if (b.sym) fail('cannot subtract a symbol: ' + text);
    return { sym: a.sym, k: a.k - b.k };
  });
  const v = additive();
  if (pos !== tokens.length) fail('bad expression: ' + text);
  return v;
}

const plainNumber = (v, what = 'value') => {
  if (v.sym) fail(`${what} must be a number, not symbol '${v.sym}'`);
  return v.k;
};

// ---------------------------------------------------------------- x64

const X86_REGS = new Map();
{
  const add = (name, n, size, extra = {}) => X86_REGS.set(name, { t: 'reg', name, n, size, ...extra });
  ['rax', 'rcx', 'rdx', 'rbx', 'rsp', 'rbp', 'rsi', 'rdi'].forEach((r, i) => add(r, i, 64));
  ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi'].forEach((r, i) => add(r, i, 32));
  ['ax', 'cx', 'dx', 'bx', 'sp', 'bp', 'si', 'di'].forEach((r, i) => add(r, i, 16));
  ['al', 'cl', 'dl', 'bl'].forEach((r, i) => add(r, i, 8));
  ['spl', 'bpl', 'sil', 'dil'].forEach((r, i) => add(r, i + 4, 8, { rex: true }));
  ['ah', 'ch', 'dh', 'bh'].forEach((r, i) => add(r, i + 4, 8, { high: true }));
  for (let i = 8; i < 16; i++) {
    add('r' + i, i, 64); add(`r${i}d`, i, 32); add(`r${i}w`, i, 16); add(`r${i}b`, i, 8); add(`r${i}l`, i, 8);
  }
}
const X86_SIZES = { byte: 8, word: 16, dword: 32, qword: 64 };
const X86_SCALE = { 1: 0, 2: 1, 4: 2, 8: 3 };

function splitTerms(text) {
  const terms = [];
  let sign = 1, current = '', depth = 0;
  for (const c of text) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (depth === 0 && (c === '+' || c === '-')) {
      if (!current.trim()) { if (c === '-') sign = -sign; continue; }
      if (/[*\/]\s*$/.test(current)) { current += c; continue; }
      terms.push({ sign, term: current.trim() });
      current = ''; sign = c === '-' ? -1 : 1;
      continue;
    }
    current += c;
  }
  if (!current.trim()) fail('incomplete memory operand: [' + text + ']');
  terms.push({ sign, term: current.trim() });
  return terms;
}

function x86Memory(text, size, consts) {
  const mem = { t: 'mem', size, base: null, index: null, scale: 1, rip: false, sym: null, k: 0n };
  for (const { sign, term } of splitTerms(text)) {
    const lower = term.toLowerCase();
    if (lower === 'rip') {
      if (sign < 0 || mem.rip || mem.base) fail('bad RIP-relative operand: [' + text + ']');
      mem.rip = true;
      continue;
    }
    const reg = X86_REGS.get(lower);
    if (reg) {
      if (sign < 0) fail('registers cannot be subtracted: [' + text + ']');
      if (reg.size !== 64) fail('only 64-bit address registers are supported: ' + term);
      if (!mem.base) mem.base = reg;
      else if (!mem.index) mem.index = reg;
      else fail('too many registers in [' + text + ']');
      continue;
    }
    const a = /^(\w+)\s*\*\s*(.+)$/.exec(term), b = /^(.+?)\s*\*\s*(\w+)$/.exec(term);
    let index = null, scale = null;
    if (a && X86_REGS.has(a[1].toLowerCase())) { index = X86_REGS.get(a[1].toLowerCase()); scale = a[2]; }
    else if (b && X86_REGS.has(b[2].toLowerCase())) { index = X86_REGS.get(b[2].toLowerCase()); scale = b[1]; }
    if (index) {
      const s = Number(plainNumber(evalExpr(scale, consts), 'scale'));
      if (sign < 0 || mem.index || !(s in X86_SCALE) || index.size !== 64) fail('bad index in [' + text + ']');
      mem.index = index; mem.scale = s;
      continue;
    }
    const v = evalExpr(term, consts);
    if (v.sym) {
      if (sign < 0 || mem.sym) fail('bad symbol use in [' + text + ']');
      mem.sym = v.sym;
    }
    mem.k += sign < 0 ? -v.k : v.k;
  }
  if (mem.rip && (mem.base || mem.index)) fail('RIP-relative operands cannot have another register');
  if (mem.index?.n === 4 && mem.base && mem.base.n !== 4 && mem.scale === 1)
    [mem.base, mem.index] = [mem.index, mem.base];
  if (mem.index?.n === 4) fail('rsp cannot be an index register');
  if (mem.sym && !mem.rip) fail(`'${mem.sym}' must be addressed RIP-relative: [rip + ${mem.sym}]`);
  if (!fitsS(mem.k, 32)) fail('displacement out of range: [' + text + ']');
  return mem;
}

function x86Operand(text, consts) {
  let s = text.trim(), size = null;
  const m = /^(byte|word|dword|qword)\s+ptr\s+/i.exec(s);
  if (m) { size = X86_SIZES[m[1].toLowerCase()]; s = s.slice(m[0].length).trim(); }
  if (s.startsWith('[')) {
    if (!s.endsWith(']')) fail('unterminated memory operand: ' + text);
    return x86Memory(s.slice(1, -1), size, consts);
  }
  if (size) fail('ptr size needs a memory operand: ' + text);
  const reg = X86_REGS.get(s.toLowerCase());
  if (reg) return reg;
  return { t: 'imm', ...evalExpr(s, consts) };
}

function x86ModRM(reg, op) {
  if (op.t === 'reg') return { bytes: [0xc0 | (reg & 7) << 3 | (op.n & 7)], r: reg >> 3, x: 0, b: op.n >> 3 };
  if (op.t !== 'mem') fail('expected a register or memory operand');
  if (op.rip) return { bytes: [0x05 | (reg & 7) << 3, 0, 0, 0, 0], r: reg >> 3, x: 0, b: 0, rip: { pos: 1, sym: op.sym, k: op.k } };
  const bytes = [], disp = op.k, index = op.index ? op.index.n : 4;
  if (!op.base) {
    bytes.push(0x04 | (reg & 7) << 3, X86_SCALE[op.scale] << 6 | (index & 7) << 3 | 5);
    pushLE(bytes, disp, 4);
    return { bytes, r: reg >> 3, x: index >> 3 & (op.index ? 1 : 0), b: 0 };
  }
  const base = op.base.n, sib = !!op.index || (base & 7) === 4;
  const mod = disp === 0n && (base & 7) !== 5 ? 0 : fitsS(disp, 8) ? 1 : 2;
  bytes.push(mod << 6 | (reg & 7) << 3 | (sib ? 4 : base & 7));
  if (sib) bytes.push(X86_SCALE[op.scale] << 6 | (index & 7) << 3 | (base & 7));
  if (mod === 1) pushLE(bytes, disp, 1);
  if (mod === 2) pushLE(bytes, disp, 4);
  return { bytes, r: reg >> 3, x: op.index ? index >> 3 : 0, b: base >> 3 };
}

function x86Emit(env, s) {
  const out = [];
  if (s.p66) out.push(0x66);
  let r = 0, x = 0, b = 0, m = null;
  if (s.modrm) ({ r, x, b } = m = x86ModRM(s.modrm.reg, s.modrm.rm));
  if (s.plusReg !== undefined) b = s.plusReg >> 3;
  const byteRegs = (s.byteRegs ?? []).filter(o => o?.t === 'reg' && o.size === 8);
  const rex = (s.w ? 8 : 0) | r << 2 | x << 1 | b;
  if (rex || byteRegs.some(o => o.rex)) {
    if (byteRegs.some(o => o.high)) fail('ah/bh/ch/dh cannot be encoded with a REX prefix');
    out.push(0x40 | rex);
  }
  const opcode = [...s.opcode];
  if (s.plusReg !== undefined) opcode[opcode.length - 1] |= s.plusReg & 7;
  out.push(...opcode);
  let dispAt = -1;
  if (m) { if (m.rip) dispAt = out.length + m.rip.pos; out.push(...m.bytes); }
  if (s.imm) pushLE(out, s.imm.v, s.imm.bytes);
  const relocs = [];
  if (m?.rip) {
    const { sym, k } = m.rip;
    const target = sym === null ? undefined : env.label(sym);
    if (sym === null) writeLE(out, dispAt, k, 4);
    else if (target !== undefined) {
      const v = BigInt(target) + k - BigInt(env.pc + out.length);
      if (!fitsS(v, 32)) fail('RIP-relative target out of range');
      writeLE(out, dispAt, v, 4);
    } else relocs.push([dispAt, RELOC.x64.PC32, sym, Number(k) - (out.length - dispAt)]);
  }
  return { bytes: out, relocs };
}

const opSize = (...ops) => {
  let size = null;
  for (const o of ops) {
    const s = o?.t === 'reg' || o?.t === 'mem' ? o.size : null;
    if (!s) continue;
    if (size && size !== s) fail('operand size mismatch');
    size = s;
  }
  if (!size) fail('operand size is ambiguous; add byte/word/dword/qword ptr');
  return size;
};
const sizeBits = size => ({ p66: size === 16, w: size === 64 ? 1 : 0 });
function x86Imm(op, size) {
  if (op.t !== 'imm') fail('expected an immediate');
  const v = plainNumber(op, 'immediate');
  if (size === 64) {
    if (!fitsS(v, 32)) fail('immediate does not fit a sign-extended 32-bit field');
    return v;
  }
  if (v < -(1n << BigInt(size - 1)) || v >= (1n << BigInt(size))) fail(`immediate out of ${size}-bit range`);
  return BigInt.asIntN(size, v);
}

const X86_ALU = { add: 0, or: 1, adc: 2, sbb: 3, and: 4, sub: 5, xor: 6, cmp: 7 };
const X86_CC = {
  o: 0, no: 1, b: 2, c: 2, nae: 2, ae: 3, nb: 3, nc: 3, e: 4, z: 4, ne: 5, nz: 5, be: 6, na: 6,
  a: 7, nbe: 7, s: 8, ns: 9, p: 10, pe: 10, np: 11, po: 11, l: 12, nge: 12, ge: 13, nl: 13,
  le: 14, ng: 14, g: 15, nle: 15,
};
const X86_SHIFT = { rol: 0, ror: 1, rcl: 2, rcr: 3, shl: 4, sal: 4, shr: 5, sar: 7 };
const X86_UNARY = { inc: [0xfe, 0], dec: [0xfe, 1], not: [0xf6, 2], neg: [0xf6, 3], mul: [0xf6, 4], div: [0xf6, 6], idiv: [0xf6, 7] };
const X86_SIMPLE = {
  ret: [0xc3], cld: [0xfc], std: [0xfd], clc: [0xf8], stc: [0xf9], cmc: [0xf5], hlt: [0xf4],
  int3: [0xcc], nop: [0x90], ud2: [0x0f, 0x0b], leave: [0xc9], cdq: [0x99], cqo: [0x48, 0x99],
  cdqe: [0x48, 0x98], cwde: [0x98], syscall: [0x0f, 0x05], pause: [0xf3, 0x90],
};

function x86Branch(env, item, cc, op, call) {
  if (op.t === 'reg' || op.t === 'mem') {
    if (cc !== null) fail('conditional jumps need a label');
    if (op.t === 'reg' && op.size !== 64) fail('indirect branches need a 64-bit register');
    if (op.size && op.size !== 64) fail('indirect branches need a qword operand');
    return x86Emit(env, { opcode: [0xff], modrm: { reg: call ? 2 : 4, rm: op } });
  }
  if (!op.sym) fail('branch target must be a label');
  const long = call ? [0xe8] : cc === null ? [0xe9] : [0x0f, 0x80 | cc];
  const target = env.label(op.sym);
  if (target === undefined) {
    return { bytes: [...long, 0, 0, 0, 0], relocs: [[long.length, RELOC.x64.PLT32, op.sym, Number(op.k) - 4]] };
  }
  const dest = target + Number(op.k);
  if (!call && !item.long) {
    const rel = dest - (env.pc + 2);
    if (rel >= -128 && rel <= 127) return { bytes: [cc === null ? 0xeb : 0x70 | cc, rel & 0xff], relocs: [] };
    item.long = true;
  }
  const bytes = [...long];
  pushLE(bytes, dest - (env.pc + long.length + 4), 4);
  return { bytes, relocs: [] };
}

function x86Instruction(env, item) {
  const mn = item.mnemonic, ops = item.operands.map(o => x86Operand(o, env.consts)), n = ops.length;
  const emit = spec => x86Emit(env, spec);
  const [d, s] = ops;
  if (X86_SIMPLE[mn] && n === 0) return { bytes: [...X86_SIMPLE[mn]], relocs: [] };
  if (mn === 'ret' && n === 1) return emit({ opcode: [0xc2], imm: { v: x86Imm(d, 16), bytes: 2 } });
  if (mn === 'int' && n === 1 && d.t === 'imm' && !d.sym && d.k === 3n) return { bytes: [0xcc], relocs: [] };
  if (mn === 'int' && n === 1) return emit({ opcode: [0xcd], imm: { v: x86Imm(d, 8), bytes: 1 } });
  if (mn === 'call' && n === 1) return x86Branch(env, item, null, d, true);
  if (mn === 'jmp' && n === 1) return x86Branch(env, item, null, d, false);
  if (mn[0] === 'j' && n === 1 && X86_CC[mn.slice(1)] !== undefined) return x86Branch(env, item, X86_CC[mn.slice(1)], d, false);

  if (mn in X86_ALU && n === 2) {
    const a = X86_ALU[mn], size = opSize(d, s);
    if (d.t === 'imm') fail('destination cannot be an immediate');
    if (s.t === 'imm') {
      if (size === 8) {
        const v = x86Imm(s, 8);
        if (d.t === 'reg' && d.n === 0 && !d.high) return emit({ opcode: [0x04 + a * 8], imm: { v, bytes: 1 } });
        return emit({ opcode: [0x80], modrm: { reg: a, rm: d }, imm: { v, bytes: 1 }, byteRegs: [d] });
      }
      const v = x86Imm(s, size), bytes = size === 16 ? 2 : 4;
      if (fitsS(v, 8)) return emit({ ...sizeBits(size), opcode: [0x83], modrm: { reg: a, rm: d }, imm: { v, bytes: 1 } });
      if (d.t === 'reg' && d.n === 0) return emit({ ...sizeBits(size), opcode: [0x05 + a * 8], imm: { v, bytes } });
      return emit({ ...sizeBits(size), opcode: [0x81], modrm: { reg: a, rm: d }, imm: { v, bytes } });
    }
    if (s.t === 'reg') return emit({ ...sizeBits(size), opcode: [a * 8 + (size === 8 ? 0 : 1)], modrm: { reg: s.n, rm: d }, byteRegs: [d, s] });
    if (d.t === 'reg' && s.t === 'mem') return emit({ ...sizeBits(size), opcode: [a * 8 + (size === 8 ? 2 : 3)], modrm: { reg: d.n, rm: s }, byteRegs: [d] });
  }

  if (mn === 'mov' && n === 2) {
    const size = opSize(d, s);
    if (s.t === 'imm') {
      if (d.t === 'reg') {
        if (size === 64) {
          const v = plainNumber(s, 'immediate');
          if (fitsS(v, 32)) return emit({ w: 1, opcode: [0xc7], modrm: { reg: 0, rm: d }, imm: { v, bytes: 4 } });
          if (v < -(1n << 63n) || v >= (1n << 64n)) fail('immediate out of 64-bit range');
          return emit({ w: 1, opcode: [0xb8], plusReg: d.n, imm: { v, bytes: 8 } });
        }
        return emit({ ...sizeBits(size), opcode: [size === 8 ? 0xb0 : 0xb8], plusReg: d.n, imm: { v: x86Imm(s, size), bytes: size / 8 }, byteRegs: [d] });
      }
      if (d.t === 'mem') return emit({ ...sizeBits(size), opcode: [size === 8 ? 0xc6 : 0xc7], modrm: { reg: 0, rm: d }, imm: { v: x86Imm(s, size), bytes: Math.min(size, 32) / 8 } });
    }
    if (s.t === 'reg' && d.t !== 'imm') return emit({ ...sizeBits(size), opcode: [size === 8 ? 0x88 : 0x89], modrm: { reg: s.n, rm: d }, byteRegs: [d, s] });
    if (d.t === 'reg' && s.t === 'mem') return emit({ ...sizeBits(size), opcode: [size === 8 ? 0x8a : 0x8b], modrm: { reg: d.n, rm: s }, byteRegs: [d] });
  }

  if (mn === 'test' && n === 2) {
    let [a, b] = ops;
    if (a.t === 'reg' && b.t === 'mem') [a, b] = [b, a];
    const size = opSize(a, b);
    if (b.t === 'imm') {
      const v = x86Imm(b, size), bytes = Math.min(size, 32) / 8;
      if (a.t === 'reg' && a.n === 0 && !a.high) return emit({ ...sizeBits(size), opcode: [size === 8 ? 0xa8 : 0xa9], imm: { v, bytes } });
      return emit({ ...sizeBits(size), opcode: [size === 8 ? 0xf6 : 0xf7], modrm: { reg: 0, rm: a }, imm: { v, bytes }, byteRegs: [a] });
    }
    if (b.t === 'reg') return emit({ ...sizeBits(size), opcode: [size === 8 ? 0x84 : 0x85], modrm: { reg: b.n, rm: a }, byteRegs: [a, b] });
  }

  if (mn === 'xchg' && n === 2) {
    const size = opSize(d, s);
    // 90 is a true NOP. XCHG EAX,EAX must still clear RAX's upper half.
    if (d.name === 'rax' && s.name === 'rax') return emit({ opcode: [0x90] });
    const bothEax = d.name === 'eax' && s.name === 'eax';
    if (d.t === 'reg' && s.t === 'reg' && size !== 8 && (d.n === 0 || s.n === 0) && !bothEax) {
      const other = d.n === 0 ? s : d;
      return emit({ ...sizeBits(size), opcode: [0x90], plusReg: other.n });
    }
    // Register pairs use the first operand as ModRM.reg, as LLVM does.
    const [m, r] = d.t === 'reg' && s.t === 'reg' ? [s, d] : s.t === 'reg' ? [d, s] : [s, d];
    if (r.t === 'reg') return emit({ ...sizeBits(size), opcode: [size === 8 ? 0x86 : 0x87], modrm: { reg: r.n, rm: m }, byteRegs: [m, r] });
  }

  if (mn === 'lea' && n === 2 && d.t === 'reg' && s.t === 'mem' && d.size !== 8) {
    return emit({ ...sizeBits(d.size), opcode: [0x8d], modrm: { reg: d.n, rm: s } });
  }

  if ((mn === 'movzx' || mn === 'movsx' || mn === 'movsxd') && n === 2 && d.t === 'reg') {
    const from = s.size;
    if (!from) fail('source operand size is required');
    if (mn === 'movsxd' || (mn === 'movsx' && from === 32)) {
      if (d.size !== 64 || from !== 32) fail('movsxd needs a 64-bit destination and 32-bit source');
      return emit({ w: 1, opcode: [0x63], modrm: { reg: d.n, rm: s } });
    }
    if (from > 16 || from >= d.size) fail('bad operand sizes for ' + mn);
    return emit({ ...sizeBits(d.size), opcode: [0x0f, (mn === 'movzx' ? 0xb6 : 0xbe) + (from === 16 ? 1 : 0)], modrm: { reg: d.n, rm: s }, byteRegs: [s] });
  }

  if ((mn in X86_UNARY || mn === 'imul') && n === 1) {
    const [opcode, ext] = X86_UNARY[mn] ?? [0xf6, 5], size = opSize(d);
    return emit({ ...sizeBits(size), opcode: [opcode + (size === 8 ? 0 : 1)], modrm: { reg: ext, rm: d }, byteRegs: [d] });
  }

  if (mn === 'imul' && (n === 2 || n === 3) && d.t === 'reg' && d.size !== 8) {
    const [dst, src, imm] = n === 2 && s.t === 'imm' ? [d, d, s] : ops;
    const size = opSize(dst, src);
    if (!imm) return emit({ ...sizeBits(size), opcode: [0x0f, 0xaf], modrm: { reg: dst.n, rm: src } });
    const v = x86Imm(imm, size);
    if (fitsS(v, 8)) return emit({ ...sizeBits(size), opcode: [0x6b], modrm: { reg: dst.n, rm: src }, imm: { v, bytes: 1 } });
    return emit({ ...sizeBits(size), opcode: [0x69], modrm: { reg: dst.n, rm: src }, imm: { v, bytes: size === 16 ? 2 : 4 } });
  }

  if (mn in X86_SHIFT && (n === 1 || n === 2)) {
    const ext = X86_SHIFT[mn], size = opSize(d), w8 = size === 8 ? 0 : 1;
    if (n === 1 || (s.t === 'imm' && !s.sym && s.k === 1n)) return emit({ ...sizeBits(size), opcode: [0xd0 + w8], modrm: { reg: ext, rm: d }, byteRegs: [d] });
    if (s.t === 'reg' && s.size === 8 && s.n === 1 && !s.rex) return emit({ ...sizeBits(size), opcode: [0xd2 + w8], modrm: { reg: ext, rm: d }, byteRegs: [d] });
    if (s.t === 'imm') return emit({ ...sizeBits(size), opcode: [0xc0 + w8], modrm: { reg: ext, rm: d }, imm: { v: x86Imm(s, 8), bytes: 1 }, byteRegs: [d] });
  }

  if ((mn === 'push' || mn === 'pop') && n === 1) {
    const push = mn === 'push';
    if (d.t === 'reg') {
      if (d.size !== 64 && d.size !== 16) fail(mn + ' needs a 64-bit or 16-bit register');
      return emit({ p66: d.size === 16, opcode: [push ? 0x50 : 0x58], plusReg: d.n });
    }
    if (d.t === 'imm' && push) {
      const v = x86Imm(d, 64);
      return fitsS(v, 8) ? emit({ opcode: [0x6a], imm: { v, bytes: 1 } }) : emit({ opcode: [0x68], imm: { v, bytes: 4 } });
    }
    if (d.t === 'mem') {
      if (d.size && d.size !== 16 && d.size !== 64) fail(mn + ' needs a word or qword memory operand');
      return emit({ p66: d.size === 16, opcode: [push ? 0xff : 0x8f], modrm: { reg: push ? 6 : 0, rm: d } });
    }
  }

  if (mn.startsWith('set') && X86_CC[mn.slice(3)] !== undefined && n === 1) {
    if (opSize(d) !== 8) fail(mn + ' needs a byte operand');
    return emit({ opcode: [0x0f, 0x90 | X86_CC[mn.slice(3)]], modrm: { reg: 0, rm: d }, byteRegs: [d] });
  }
  if (mn.startsWith('cmov') && X86_CC[mn.slice(4)] !== undefined && n === 2 && d.t === 'reg' && d.size !== 8) {
    return emit({ ...sizeBits(opSize(d, s)), opcode: [0x0f, 0x40 | X86_CC[mn.slice(4)]], modrm: { reg: d.n, rm: s } });
  }
  fail(`unsupported x64 instruction or operands: ${mn} ${item.operands.join(', ')}`.trim());
}

// LLVM's x86 NOP table (up to 10 bytes per NOP in 64-bit mode).
const X86_NOPS = [
  [0x90], [0x66, 0x90], [0x0f, 0x1f, 0x00], [0x0f, 0x1f, 0x40, 0x00], [0x0f, 0x1f, 0x44, 0x00, 0x00],
  [0x66, 0x0f, 0x1f, 0x44, 0x00, 0x00], [0x0f, 0x1f, 0x80, 0, 0, 0, 0], [0x0f, 0x1f, 0x84, 0, 0, 0, 0, 0],
  [0x66, 0x0f, 0x1f, 0x84, 0, 0, 0, 0, 0], [0x66, 0x2e, 0x0f, 0x1f, 0x84, 0, 0, 0, 0, 0],
];

// ---------------------------------------------------------------- AArch64

const A64_COND = { eq: 0, ne: 1, cs: 2, hs: 2, cc: 3, lo: 3, mi: 4, pl: 5, vs: 6, vc: 7, hi: 8, ls: 9, ge: 10, lt: 11, gt: 12, le: 13, al: 14, nv: 15 };
const A64_SHIFT = { lsl: 0, lsr: 1, asr: 2, ror: 3 };
const A64_EXTEND = { uxtb: 0, uxth: 1, uxtw: 2, uxtx: 3, sxtb: 4, sxth: 5, sxtw: 6, sxtx: 7 };

function a64Reg(text) {
  const t = text.trim().toLowerCase();
  const m = /^([xw])(\d+)$/.exec(t);
  if (m && +m[2] <= 30) return { t: 'reg', n: +m[2], x: m[1] === 'x' };
  return {
    sp: { t: 'reg', n: 31, x: true, sp: true }, wsp: { t: 'reg', n: 31, x: false, sp: true },
    xzr: { t: 'reg', n: 31, x: true, zr: true }, wzr: { t: 'reg', n: 31, x: false, zr: true },
    lr: { t: 'reg', n: 30, x: true }, fp: { t: 'reg', n: 29, x: true },
  }[t] ?? null;
}

function a64Imm(text, consts) {
  let s = text.trim();
  if (s.startsWith('#')) s = s.slice(1).trim();
  const m = /^:([a-z0-9_]+):(.+)$/i.exec(s);
  if (m) {
    const mod = m[1].toLowerCase();
    if (mod !== 'lo12' && mod !== 'pg_hi21') fail('unsupported relocation modifier :' + m[1] + ':');
    return { t: 'imm', mod, ...evalExpr(m[2], consts) };
  }
  return { t: 'imm', mod: null, ...evalExpr(s, consts) };
}

function a64Operand(text, consts) {
  let s = text.trim();
  if (s.startsWith('[')) {
    let wb = false;
    if (s.endsWith('!')) { wb = true; s = s.slice(0, -1).trim(); }
    if (!s.endsWith(']')) fail('unterminated memory operand: ' + text);
    const parts = splitOperands(s.slice(1, -1));
    const base = a64Reg(parts[0]);
    if (!base || !base.x || base.zr) fail('memory base must be an X register or sp: ' + text);
    const mem = { t: 'mem', base, off: null, ext: null, wb };
    if (parts[1] !== undefined) mem.off = a64Reg(parts[1]) ?? a64Imm(parts[1], consts);
    if (parts[2] !== undefined) mem.ext = a64Operand(parts[2], consts);
    if (parts.length > 3) fail('bad memory operand: ' + text);
    return mem;
  }
  const reg = a64Reg(s);
  if (reg) return reg;
  let m = /^(lsl|lsr|asr|ror)\s+#?(.+)$/i.exec(s);
  if (m) return { t: 'shift', kind: m[1].toLowerCase(), amount: Number(plainNumber(evalExpr(m[2], consts), 'shift')) };
  m = /^([us]xt[bhwx])(?:\s+#?(.+))?$/i.exec(s);
  if (m) return { t: 'extend', kind: m[1].toLowerCase(), amount: m[2] === undefined ? null : Number(plainNumber(evalExpr(m[2], consts), 'shift')) };
  return a64Imm(s, consts);
}

const word = (v, relocs = []) => {
  const bytes = [];
  pushLE(bytes, v >>> 0, 4);
  return { bytes, relocs };
};
const need = (cond, message) => { if (!cond) fail(message); };
const isReg = o => o?.t === 'reg';
const num = (o, what = 'immediate') => {
  need(o?.t === 'imm' && !o.mod, 'expected an immediate ' + what);
  return plainNumber(o, what);
};
const cond = o => {
  need(o?.t === 'imm' && o.sym && o.k === 0n && A64_COND[o.sym.toLowerCase()] !== undefined, 'expected a condition code');
  return A64_COND[o.sym.toLowerCase()];
};
const sameWidth = (...regs) => need(regs.every(r => isReg(r) && r.x === regs[0].x), 'register widths must match');

// PC-relative field for a label; external symbols get a relocation instead.
function a64Target(env, op, bits, type) {
  need(op?.t === 'imm' && op.sym && !op.mod, 'expected a label');
  const target = env.label(op.sym);
  if (target === undefined) return { field: 0, relocs: [[0, type, op.sym, Number(op.k)]] };
  const offset = target + Number(op.k) - env.pc, scale = type === RELOC.arm64.ADR_PREL_LO21 ? 1 : 4;
  need(offset % scale === 0, 'misaligned branch target');
  const v = offset / scale;
  need(v >= -(2 ** (bits - 1)) && v < 2 ** (bits - 1), 'branch target out of range');
  return { field: v & (2 ** bits - 1), relocs: [] };
}

function logicalImmediate(value, bits) {
  const mask = (1n << BigInt(bits)) - 1n, u = BigInt.asUintN(bits, value);
  if (u === 0n || u === mask) return null;
  let size = bits;
  while (size > 2) {
    const half = size / 2, hm = (1n << BigInt(half)) - 1n;
    if ((u & hm) !== ((u >> BigInt(half)) & hm)) break;
    size = half;
  }
  const em = (1n << BigInt(size)) - 1n, element = u & em;
  let ones = 0;
  for (let v = element; v; v >>= 1n) ones += Number(v & 1n);
  const run = (1n << BigInt(ones)) - 1n;
  for (let r = 0; r < size; r++) {
    const rotated = ((run >> BigInt(r)) | (run << BigInt(size - r))) & em;
    if (rotated === element) return { N: size === 64 ? 1 : 0, immr: r, imms: ((-size << 1) | (ones - 1)) & 0x3f };
  }
  return null;
}

function a64AddSub(env, mn, d, rn, m, extra) {
  let sub = mn.startsWith('sub') || mn.startsWith('cmp'), S = mn.endsWith('s');
  need(isReg(d) && isReg(rn) && d.x === rn.x, 'bad add/sub registers');
  const sf = d.x ? 0x80000000 : 0;
  if (m?.t === 'imm') {
    need(!rn.zr && !(S ? d.sp : d.zr), 'bad add/sub immediate registers');
    if (m.mod) {
      need(m.sym && m.mod === 'lo12' && !sub && !S && !extra, 'only add accepts :lo12:');
      return word(sf | 0x11000000 | rn.n << 5 | d.n, [[0, RELOC.arm64.ADD_ABS_LO12_NC, m.sym, Number(m.k)]]);
    }
    let v = Number(plainNumber(m, 'immediate')), shift = 0;
    if (extra) {
      need(extra.t === 'shift' && extra.kind === 'lsl' && (extra.amount === 0 || extra.amount === 12), 'add/sub immediates accept only lsl #0 or #12');
      shift = extra.amount === 12 ? 1 : 0;
    }
    if (v < 0) { v = -v; sub = !sub; }
    if (!shift && v > 4095 && (v & 0xfff) === 0 && v <= 0xfff000) { v /= 4096; shift = 1; }
    need(v <= 4095, 'add/sub immediate out of range');
    return word(sf | (sub ? 0x40000000 : 0) | (S ? 0x20000000 : 0) | 0x11000000 | shift << 22 | v << 10 | rn.n << 5 | d.n);
  }
  need(isReg(m) && !m.sp, 'bad add/sub operand');
  const head = sf | (sub ? 0x40000000 : 0) | (S ? 0x20000000 : 0);
  const extended = extra?.t === 'extend' || d.sp || rn.sp;
  if (extended) {
    need(!rn.zr && !(S ? d.sp : d.zr), 'bad extended register operands');
    let option = d.x ? 3 : 2, amount = 0;
    if (extra?.t === 'extend') { option = A64_EXTEND[extra.kind]; amount = extra.amount ?? 0; }
    else if (extra) { need(extra.t === 'shift' && extra.kind === 'lsl', 'bad extended register shift'); amount = extra.amount; }
    need(m.x === (d.x && (option & 3) === 3), 'wrong extended register width');
    need(amount >= 0 && amount <= 4, 'extend shift out of range');
    return word(head | 0x0b200000 | m.n << 16 | option << 13 | amount << 10 | rn.n << 5 | d.n);
  }
  sameWidth(d, m);
  let type = 0, amount = 0;
  if (extra) {
    need(extra.t === 'shift' && extra.kind !== 'ror', 'bad add/sub shift');
    type = A64_SHIFT[extra.kind]; amount = extra.amount;
  }
  need(amount >= 0 && amount < (d.x ? 64 : 32), 'shift out of range');
  return word(head | 0x0b000000 | type << 22 | m.n << 16 | amount << 10 | rn.n << 5 | d.n);
}

const A64_LOGIC = { and: [0, 0], orr: [1, 0], eor: [2, 0], ands: [3, 0], bic: [0, 1], orn: [1, 1], eon: [2, 1], bics: [3, 1] };
function a64Logic(mn, d, rn, m, extra) {
  const [opc, invert] = A64_LOGIC[mn], bits = d.x ? 64 : 32, sf = d.x ? 0x80000000 : 0;
  sameWidth(d, rn);
  if (m?.t === 'imm') {
    need(!extra && !m.mod && !rn.sp && !(opc === 3 ? d.sp : d.zr), 'bad logical immediate operands');
    const v = plainNumber(m, 'immediate');
    need(v >= -(1n << BigInt(bits - 1)) && v < (1n << BigInt(bits)), 'logical immediate out of range');
    const e = logicalImmediate(invert ? ~v : v, bits);
    need(e, 'immediate is not encodable as a logical immediate');
    return word(sf | opc << 29 | 0x12000000 | e.N << 22 | e.immr << 16 | e.imms << 10 | rn.n << 5 | d.n);
  }
  sameWidth(d, m);
  let type = 0, amount = 0;
  if (extra) { need(extra.t === 'shift', 'bad logical shift'); type = A64_SHIFT[extra.kind]; amount = extra.amount; }
  need(!d.sp && !rn.sp && !m.sp && amount >= 0 && amount < bits, 'bad logical register or shift');
  return word(sf | opc << 29 | 0x0a000000 | type << 22 | invert << 21 | m.n << 16 | amount << 10 | rn.n << 5 | d.n);
}

function a64MovImmediate(d, value) {
  const bits = d.x ? 64 : 32, sf = d.x ? 0x80000000 : 0;
  need(value >= -(1n << BigInt(bits - 1)) && value < (1n << BigInt(bits)), 'mov immediate out of range');
  const u = BigInt.asUintN(bits, value), mask = (1n << BigInt(bits)) - 1n;
  for (const [pattern, opc] of [[u, 2], [~u & mask, 0]]) {
    for (let hw = 0; hw < bits / 16; hw++) {
      if ((pattern & ~(0xffffn << BigInt(hw * 16)) & mask) === 0n) {
        return word(sf | opc << 29 | 0x12800000 | hw << 21 | Number(pattern >> BigInt(hw * 16) & 0xffffn) << 5 | d.n);
      }
    }
  }
  const e = logicalImmediate(u, bits);
  need(e, 'mov immediate needs more than one instruction');
  return word(sf | 1 << 29 | 0x12000000 | e.N << 22 | e.immr << 16 | e.imms << 10 | 31 << 5 | d.n);
}

const A64_LS = {
  ldrb: [0, 1], strb: [0, 0], ldrh: [1, 1], strh: [1, 0], ldrsb: [0, -1], ldrsh: [1, -1], ldrsw: [2, 2],
  ldr: [-1, 1], str: [-1, 0],
};
const A64_LO12 = [RELOC.arm64.LDST8_ABS_LO12_NC, RELOC.arm64.LDST16_ABS_LO12_NC, RELOC.arm64.LDST32_ABS_LO12_NC, RELOC.arm64.LDST64_ABS_LO12_NC];

function a64LoadStore(env, mn, ops) {
  const unscaled = /^(ld|st)ur/.test(mn), base = mn.replace(/^(ld|st)ur/, '$1r');
  let [size, opc] = A64_LS[base];
  const [rt, mem, post] = ops;
  need(isReg(rt) && !rt.sp, 'bad transfer register');
  if (size < 0) size = rt.x ? 3 : 2;
  if (size < 2 && opc >= 0) need(!rt.x, mn + ' needs a W register');
  if (opc < 0) opc = rt.x ? 2 : 3;
  need(!(base === 'ldrsw' && !rt.x), 'ldrsw needs an X register');
  if (mem?.t === 'imm' && !unscaled) {
    need(['ldr', 'ldrsw'].includes(base) && !post, 'only ldr/ldrsw accept a literal');
    const head = base === 'ldrsw' ? 0x98000000 : rt.x ? 0x58000000 : 0x18000000;
    const t = a64Target(env, mem, 19, RELOC.arm64.LD_PREL_LO19);
    return word(head | t.field << 5 | rt.n, t.relocs);
  }
  need(mem?.t === 'mem', 'expected a memory operand');
  const head = size << 30 | 0x38000000 | opc << 22, rn = mem.base.n, scale = 1 << size;
  if (post !== undefined) {
    need(!mem.off && !mem.wb && !unscaled, 'bad post-index operand');
    const v = Number(num(post, 'offset'));
    need(v >= -256 && v <= 255, 'post-index offset out of range');
    return word(head | (v & 0x1ff) << 12 | 1 << 10 | rn << 5 | rt.n);
  }
  if (isReg(mem.off)) {
    need(!mem.off.sp && !mem.wb && !unscaled, 'bad register offset');
    let option = 3, S = 0;
    const e = mem.ext;
    if (e) {
      need(e.t === 'extend' || (e.t === 'shift' && e.kind === 'lsl'), 'bad register offset extend');
      if (e.t === 'extend') option = A64_EXTEND[e.kind];
      need([2, 3, 6, 7].includes(option), 'bad register offset extend');
      if (e.amount !== null) { need(e.amount === 0 || e.amount === size, 'bad register offset shift'); S = size === 0 || e.amount ? 1 : 0; }
    }
    need(mem.off.x === ((option & 1) === 1), 'bad register offset width');
    return word(head | 0x00200800 | mem.off.n << 16 | option << 13 | S << 12 | rn << 5 | rt.n);
  }
  need(!mem.ext, 'unexpected memory operand modifier');
  if (mem.off?.mod) {
    need(mem.off.mod === 'lo12' && !mem.wb && !unscaled && size <= 3, 'bad :lo12: memory operand');
    return word(head | 0x01000000 | rn << 5 | rt.n, [[0, A64_LO12[size], mem.off.sym, Number(mem.off.k)]]);
  }
  const v = mem.off ? Number(num(mem.off, 'offset')) : 0;
  if (mem.wb) {
    need(v >= -256 && v <= 255 && !unscaled, 'pre-index offset out of range');
    return word(head | (v & 0x1ff) << 12 | 3 << 10 | rn << 5 | rt.n);
  }
  if (!unscaled && v >= 0 && v % scale === 0 && v / scale < 4096) return word(head | 0x01000000 | (v / scale) << 10 | rn << 5 | rt.n);
  need(v >= -256 && v <= 255, 'memory offset out of range');
  return word(head | (v & 0x1ff) << 12 | rn << 5 | rt.n);
}

function a64Pair(mn, ops) {
  const [rt, rt2, mem, post] = ops, load = mn.startsWith('ld');
  need(isReg(rt) && isReg(rt2) && mem?.t === 'mem' && !isReg(mem.off) && !mem.ext && !mem.off?.mod, 'bad ' + mn + ' operands');
  sameWidth(rt, rt2);
  need(!rt.sp && !rt2.sp && (mn !== 'ldpsw' || rt.x), 'bad pair transfer registers');
  const sw = mn === 'ldpsw', opc = sw ? 1 : rt.x ? 2 : 0, scale = sw || !rt.x ? 4 : 8;
  let index = 2, v = mem.off ? Number(num(mem.off, 'offset')) : 0;
  if (post !== undefined) { need(!mem.off && !mem.wb, 'bad post-index operand'); index = 1; v = Number(num(post, 'offset')); }
  else if (mem.wb) index = 3;
  need(v % scale === 0 && v / scale >= -64 && v / scale < 64, mn + ' offset out of range');
  return word(opc << 30 | 0x28000000 | index << 23 | (load ? 1 << 22 : 0) | ((v / scale) & 0x7f) << 15 | rt2.n << 10 | mem.base.n << 5 | rt.n);
}

function a64Instruction(env, item) {
  let mn = item.mnemonic;
  const ops = item.operands.map(o => a64Operand(o, env.consts)), n = ops.length;
  const [a, b, c, d] = ops;
  const zr = r => { need(isReg(r), 'expected a register'); return { t: 'reg', n: 31, x: r.x, zr: true }; };
  // Register 31 denotes SP only in specific encodings. All other register
  // fields with that value mean ZR, even when the source spelled it 'sp'.
  if (ops.some(o => o.sp) && !['mov', 'add', 'adds', 'sub', 'subs', 'cmp', 'cmn'].includes(mn) && !Object.hasOwn(A64_LOGIC, mn))
    fail('stack pointer is not valid for ' + mn);
  const simple = { nop: 0xd503201f, yield: 0xd503203f, wfe: 0xd503205f, wfi: 0xd503207f, sev: 0xd503209f, eret: 0xd69f03e0 };
  if (simple[mn] !== undefined && n === 0) return word(simple[mn]);
  if (/^b[a-z]{2}$/.test(mn) && A64_COND[mn.slice(1)] !== undefined) mn = 'b.' + mn.slice(1);
  if (mn.startsWith('b.') && n === 1) {
    const cc = A64_COND[mn.slice(2)];
    need(cc !== undefined, 'unknown condition ' + mn);
    const t = a64Target(env, a, 19, RELOC.arm64.CONDBR19);
    return word(0x54000000 | t.field << 5 | cc, t.relocs);
  }
  if ((mn === 'b' || mn === 'bl') && n === 1) {
    const t = a64Target(env, a, 26, mn === 'b' ? RELOC.arm64.JUMP26 : RELOC.arm64.CALL26);
    return word((mn === 'b' ? 0x14000000 : 0x94000000) | t.field, t.relocs);
  }
  if ((mn === 'cbz' || mn === 'cbnz') && n === 2 && isReg(a) && !a.sp) {
    const t = a64Target(env, b, 19, RELOC.arm64.CONDBR19);
    return word((a.x ? 0x80000000 : 0) | (mn === 'cbz' ? 0x34000000 : 0x35000000) | t.field << 5 | a.n, t.relocs);
  }
  if ((mn === 'tbz' || mn === 'tbnz') && n === 3 && isReg(a)) {
    const bit = Number(num(b, 'bit'));
    need(bit >= 0 && bit < (a.x ? 64 : 32), 'bit number out of range');
    const t = a64Target(env, c, 14, RELOC.arm64.TSTBR14);
    return word((bit >> 5) << 31 | (mn === 'tbz' ? 0x36000000 : 0x37000000) | (bit & 31) << 19 | t.field << 5 | a.n, t.relocs);
  }
  if ((mn === 'br' || mn === 'blr') && n === 1 && isReg(a) && a.x) return word((mn === 'br' ? 0xd61f0000 : 0xd63f0000) | a.n << 5);
  if (mn === 'ret' && n <= 1) { need(!a || (isReg(a) && a.x), 'ret needs an X register'); return word(0xd65f0000 | (a ? a.n : 30) << 5); }
  if ((mn === 'brk' || mn === 'svc' || mn === 'hvc' || mn === 'hlt') && n === 1) {
    const v = Number(num(a));
    need(v >= 0 && v <= 0xffff, mn + ' immediate out of range');
    return word({ brk: 0xd4200000, svc: 0xd4000001, hvc: 0xd4000002, hlt: 0xd4400000 }[mn] | v << 5);
  }
  if (mn === 'adrp' && n === 2 && isReg(a) && a.x) {
    need(b?.t === 'imm' && b.sym && (!b.mod || b.mod === 'pg_hi21'), 'adrp needs a symbol');
    need(env.label(b.sym) === undefined, 'adrp to a local label is not supported; use adr');
    return word(0x90000000 | a.n, [[0, RELOC.arm64.ADR_PREL_PG_HI21, b.sym, Number(b.k)]]);
  }
  if (mn === 'adr' && n === 2 && isReg(a) && a.x) {
    const t = a64Target(env, b, 21, RELOC.arm64.ADR_PREL_LO21);
    return word(0x10000000 | (t.field & 3) << 29 | (t.field >> 2) << 5 | a.n, t.relocs);
  }
  if (['add', 'adds', 'sub', 'subs'].includes(mn) && (n === 3 || n === 4)) return a64AddSub(env, mn, a, b, c, d);
  if ((mn === 'cmp' || mn === 'cmn') && (n === 2 || n === 3)) return a64AddSub(env, mn === 'cmp' ? 'subs' : 'adds', zr(a), a, b, c);
  if ((mn === 'neg' || mn === 'negs') && (n === 2 || n === 3)) return a64AddSub(env, mn === 'neg' ? 'sub' : 'subs', a, zr(a), b, c);
  if (mn in A64_LOGIC && (n === 3 || n === 4)) return a64Logic(mn, a, b, c, d);
  if (mn === 'tst' && (n === 2 || n === 3)) return a64Logic('ands', zr(a), a, b, c);
  if (mn === 'mvn' && (n === 2 || n === 3)) return a64Logic('orn', a, zr(a), b, c);
  if (mn === 'mov' && n === 2 && isReg(a)) {
    if (isReg(b)) {
      sameWidth(a, b);
      if (a.sp || b.sp) return a64AddSub(env, 'add', a, b, { t: 'imm', mod: null, sym: null, k: 0n });
      return word((a.x ? 0xaa000000 : 0x2a000000) | b.n << 16 | 31 << 5 | a.n);
    }
    need(!a.sp, 'mov immediate to sp is not supported');
    return a64MovImmediate(a, num(b));
  }
  if (['movz', 'movn', 'movk'].includes(mn) && (n === 2 || n === 3) && isReg(a)) {
    const v = Number(num(b)), shift = c ? c.amount : 0;
    need(!c || (c.t === 'shift' && c.kind === 'lsl'), 'bad ' + mn + ' shift');
    need(v >= 0 && v <= 0xffff && shift >= 0 && shift % 16 === 0 && shift < (a.x ? 64 : 32), mn + ' immediate out of range');
    const opc = { movn: 0, movz: 2, movk: 3 }[mn];
    return word((a.x ? 0x80000000 : 0) | opc << 29 | 0x12800000 | (shift / 16) << 21 | v << 5 | a.n);
  }
  if (['lsl', 'lsr', 'asr', 'ror'].includes(mn) && n === 3 && isReg(a)) {
    sameWidth(a, b);
    const sf = a.x ? 0x80000000 : 0, width = a.x ? 64 : 32;
    if (isReg(c)) { sameWidth(a, c); return word(sf | 0x1ac02000 | { lsl: 0, lsr: 1, asr: 2, ror: 3 }[mn] << 10 | c.n << 16 | b.n << 5 | a.n); }
    const s = Number(num(c, 'shift'));
    need(s >= 0 && s < width, 'shift out of range');
    if (mn === 'ror') return word(sf | 0x13800000 | (a.x ? 1 << 22 : 0) | b.n << 16 | s << 10 | b.n << 5 | a.n);
    const [immr, imms] = mn === 'lsl' ? [(width - s) % width, width - 1 - s] : [s, width - 1];
    return word(sf | (mn === 'asr' ? 0x13000000 : 0x53000000) | (a.x ? 1 << 22 : 0) | immr << 16 | imms << 10 | b.n << 5 | a.n);
  }
  if (['uxtb', 'uxth', 'sxtb', 'sxth', 'sxtw'].includes(mn) && n === 2 && isReg(a) && isReg(b)) {
    const signed = mn[0] === 's', imms = { b: 7, h: 15, w: 31 }[mn[3]];
    need(signed ? (mn !== 'sxtw' || a.x) : !a.x, 'bad ' + mn + ' register width');
    const sf = a.x ? 0x80000000 | 1 << 22 : 0;
    return word(sf | (signed ? 0x13000000 : 0x53000000) | imms << 10 | b.n << 5 | a.n);
  }
  if (['udiv', 'sdiv', 'lslv', 'lsrv', 'asrv', 'rorv'].includes(mn) && n === 3) {
    sameWidth(a, b, c);
    const op = { udiv: 2, sdiv: 3, lslv: 8, lsrv: 9, asrv: 10, rorv: 11 }[mn];
    return word((a.x ? 0x80000000 : 0) | 0x1ac00000 | c.n << 16 | op << 10 | b.n << 5 | a.n);
  }
  if (['mul', 'mneg', 'madd', 'msub'].includes(mn) && (n === 3 || n === 4)) {
    const ra = mn === 'mul' || mn === 'mneg' ? zr(a) : d;
    need(n === (mn === 'mul' || mn === 'mneg' ? 3 : 4), 'bad ' + mn + ' operands');
    sameWidth(a, b, c, ra);
    const sub = mn === 'mneg' || mn === 'msub' ? 0x8000 : 0;
    return word((a.x ? 0x80000000 : 0) | 0x1b000000 | c.n << 16 | sub | ra.n << 10 | b.n << 5 | a.n);
  }
  const csel = { csel: 0x1a800000, csinc: 0x1a800400, csinv: 0x5a800000, csneg: 0x5a800400 };
  const encodeCsel = (base, rd, rn, rm, cc) => { sameWidth(rd, rn, rm); return word((rd.x ? 0x80000000 : 0) | base | rm.n << 16 | cc << 12 | rn.n << 5 | rd.n); };
  if (mn in csel && n === 4) return encodeCsel(csel[mn], a, b, c, cond(d));
  const invert = cc => { need(cc < 14, 'al/nv cannot be inverted'); return cc ^ 1; };
  if ((mn === 'cset' || mn === 'csetm') && n === 2) return encodeCsel(mn === 'cset' ? csel.csinc : csel.csinv, a, zr(a), zr(a), invert(cond(b)));
  if (['cinc', 'cinv', 'cneg'].includes(mn) && n === 3) {
    return encodeCsel({ cinc: csel.csinc, cinv: csel.csinv, cneg: csel.csneg }[mn], a, b, b, invert(cond(c)));
  }
  if ((A64_LS[mn] || A64_LS[mn.replace(/^(ld|st)ur/, '$1r')]) && (n === 2 || n === 3)) return a64LoadStore(env, mn, ops);
  if (['ldp', 'stp', 'ldpsw'].includes(mn) && (n === 3 || n === 4)) return a64Pair(mn, ops);
  fail(`unsupported AArch64 instruction or operands: ${mn} ${item.operands.join(', ')}`.trim());
}

// ---------------------------------------------------------------- front end

function stripComments(text, arch) {
  let out = '', quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"' || c === '\n') quote = false;
      continue;
    }
    if (c === '"') { quote = true; out += c; continue; }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) fail('unterminated /* comment');
      out += text.slice(i, end + 2).replace(/[^\n]/g, ' ');
      i = end + 1;
      continue;
    }
    if ((c === '/' && text[i + 1] === '/') || (c === '#' && (arch === 'x64' || /(^|\n)[ \t]*$/.test(out)))) {
      while (i < text.length && text[i] !== '\n') i++;
      i--;
      continue;
    }
    out += c;
  }
  return out;
}

function splitStatements(line) {
  const parts = [];
  let current = '', quote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) { current += c; if (c === '\\') current += line[++i] ?? ''; else if (c === '"') quote = false; continue; }
    if (c === '"') quote = true;
    if (c === ';') { parts.push(current); current = ''; continue; }
    current += c;
  }
  parts.push(current);
  return parts;
}

export function detectArch(source, file = '') {
  if (/^[ \t]*\.intel_syntax\b/m.test(source)) return 'x64';
  const name = basename(file).toLowerCase();
  if (/arm64|aarch64/.test(name)) return 'arm64';
  if (/x64|x86_64|amd64/.test(name)) return 'x64';
  fail('cannot infer the architecture; pass --arch=x64 or --arch=arm64');
}

// Parses statements into items, expanding .macro definitions.
function parse(source, arch, file) {
  const items = [], labels = new Map(), globals = new Set(), consts = new Map(), macros = new Map();
  let intel = false;
  const where = line => `${file}:${line}`;
  const statements = [];
  stripComments(source, arch).split('\n').forEach((text, i) => {
    for (const s of splitStatements(text)) if (s.trim()) statements.push({ text: s.trim(), line: i + 1 });
  });

  const expand = (list, depth) => {
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      try {
        let text = st.text;
        for (let m; (m = /^([A-Za-z_.$][\w.$@]*)\s*:(?!:)\s*/.exec(text));) {
          if (labels.has(m[1]) || consts.has(m[1])) fail(`symbol '${m[1]}' is already defined`);
          labels.set(m[1], items.length);
          text = text.slice(m[0].length);
        }
        if (!text) continue;
        let m = /^([A-Za-z_.$][\w.$@]*)\s*=\s*(.+)$/.exec(text);
        if (m) { consts.set(m[1], plainNumber(evalExpr(m[2], consts), m[1])); continue; }
        m = /^(\S+)\s*(.*)$/s.exec(text);
        const mnemonic = m[1].toLowerCase(), rest = m[2].trim();
        if (mnemonic === '.macro') {
          const [name, ...params] = rest.split(/[\s,]+/).filter(Boolean);
          if (!name) fail('.macro needs a name');
          const body = [];
          let j = i + 1;
          for (; j < list.length && !/^\.endm\b/i.test(list[j].text); j++) body.push(list[j]);
          if (j === list.length) fail('missing .endm for macro ' + name);
          macros.set(name.toLowerCase(), {
            params: params.map(p => { const [pname, def] = p.split('='); return { name: pname.replace(/:req$/, ''), def: def ?? '' }; }),
            body,
          });
          i = j;
          continue;
        }
        const macro = macros.get(mnemonic);
        if (macro) {
          if (depth > 64) fail('macro expansion is too deep');
          let args = rest ? splitOperands(rest) : [];
          if (args.length < macro.params.length && args.length === 1) args = rest.split(/\s+/);
          if (args.length > macro.params.length) fail(`too many arguments for macro ${mnemonic}`);
          const values = new Map(macro.params.map((p, k) => [p.name, args[k] ?? p.def]));
          const body = macro.body.map(b => ({
            line: st.line,
            text: b.text.replace(/\\(\(\)|[A-Za-z_]\w*)/g, (all, name) => name === '()' ? '' : values.has(name) ? values.get(name) : all),
          }));
          expand(body.flatMap(b => splitStatements(b.text).filter(s => s.trim()).map(s => ({ line: b.line, text: s.trim() }))), depth + 1);
          continue;
        }
        const operands = rest ? splitOperands(rest) : [];
        if (mnemonic.startsWith('.')) directive(mnemonic, rest, operands, st);
        else {
          if (arch === 'x64' && !intel) fail('x64 sources must use .intel_syntax noprefix');
          items.push({ kind: 'insn', mnemonic, operands, line: st.line, text: st.text, long: false });
        }
      } catch (error) {
        if (error instanceof AsmError && !error.located) {
          error.message = `${where(st.line)}: ${error.message}\n    ${st.text}`;
          error.located = true;
        }
        throw error;
      }
    }
  };

  const directive = (name, rest, operands, st) => {
    const data = (bytes) => items.push({ kind: 'data', width: bytes, values: operands, line: st.line, text: st.text });
    switch (name) {
      case '.intel_syntax':
        if (arch !== 'x64') fail('.intel_syntax is only valid for x64');
        if (rest && rest !== 'noprefix') fail('only .intel_syntax noprefix is supported');
        intel = true; return;
      case '.att_syntax': fail('AT&T syntax is not supported; use .intel_syntax noprefix');
      case '.text': case '.code64': case '.file': case '.ident': case '.type': case '.size': case '.arch': case '.cpu': return;
      case '.section':
        if (rest.split(',')[0].trim() !== '.text') fail('only the .text section is supported');
        return;
      case '.data': case '.bss': case '.rodata': fail('only the .text section is supported');
      case '.global': case '.globl':
        for (const g of rest.split(/[\s,]+/).filter(Boolean)) globals.add(g);
        return;
      case '.equ': case '.set': {
        if (operands.length !== 2) fail(name + ' needs a name and a value');
        consts.set(operands[0], plainNumber(evalExpr(operands[1], consts), operands[0]));
        return;
      }
      case '.byte': return data(1);
      case '.short': case '.hword': case '.2byte': case '.value': return data(2);
      case '.word': return data(arch === 'arm64' ? 4 : 2);
      case '.long': case '.int': case '.4byte': return data(4);
      case '.quad': case '.8byte': case '.xword': case '.dword': return data(8);
      case '.ascii': case '.asciz': case '.string':
        items.push({ kind: 'bytes', bytes: operands.flatMap(o => [...parseString(o), ...(name === '.ascii' ? [] : [0])]), line: st.line, text: st.text });
        return;
      case '.zero': case '.space': case '.skip': {
        const count = Number(plainNumber(evalExpr(operands[0], consts), 'size'));
        const fill = operands[1] ? Number(plainNumber(evalExpr(operands[1], consts), 'fill')) & 0xff : 0;
        if (count < 0) fail('negative size');
        items.push({ kind: 'bytes', bytes: Array(count).fill(fill), line: st.line, text: st.text });
        return;
      }
      case '.p2align': case '.balign': case '.align': {
        const v = Number(plainNumber(evalExpr(operands[0], consts), 'alignment'));
        const power = name === '.p2align' || (name === '.align' && arch === 'arm64');
        const alignment = power ? 2 ** v : v;
        if (!Number.isInteger(Math.log2(alignment))) fail('alignment must be a power of two');
        const fill = operands[1] ? Number(plainNumber(evalExpr(operands[1], consts), 'fill')) & 0xff : null;
        const max = operands[2] ? Number(plainNumber(evalExpr(operands[2], consts), 'limit')) : Infinity;
        items.push({ kind: 'align', alignment, fill, max, line: st.line, text: st.text });
        return;
      }
      default: fail('unsupported directive ' + name);
    }
  };

  expand(statements, 0);
  return { items, labels, globals, consts };
}

function encodeItem(env, item, arch) {
  if (item.kind === 'insn') return arch === 'x64' ? x86Instruction(env, item) : a64Instruction(env, item);
  if (item.kind === 'bytes') return { bytes: item.bytes, relocs: [] };
  if (item.kind === 'data') {
    const bytes = [];
    for (const v of item.values) {
      const value = plainNumber(evalExpr(v, env.consts), 'data value');
      const bits = BigInt(item.width * 8);
      if (value < -(1n << (bits - 1n)) || value >= (1n << bits)) fail('data value out of range: ' + v);
      pushLE(bytes, value, item.width);
    }
    return { bytes, relocs: [] };
  }
  // align
  let pad = (item.alignment - env.pc % item.alignment) % item.alignment;
  if (pad > item.max) pad = 0;
  if (item.fill !== null) return { bytes: Array(pad).fill(item.fill), relocs: [] };
  const bytes = [];
  if (arch === 'x64') {
    for (let left = pad; left > 0;) { const len = Math.min(left, 10); bytes.push(...X86_NOPS[len - 1]); left -= len; }
  } else {
    bytes.push(...Array(pad % 4).fill(0));
    for (let i = 0; i < Math.floor(pad / 4); i++) pushLE(bytes, 0xd503201f, 4);
  }
  return { bytes, relocs: [] };
}

/**
 * Assemble x64 (GNU Intel syntax) or AArch64 source.
 * Returns { arch, code: Buffer, relocations, labels, globals, listing }.
 */
export function assemble(source, { arch, file = '<input>' } = {}) {
  source = String(source);
  arch ??= detectArch(source, file);
  if (arch !== 'x64' && arch !== 'arm64') fail('architecture must be x64 or arm64');
  const { items, labels, globals, consts } = parse(source, arch, file);
  const offsets = new Array(items.length + 1).fill(0);
  const located = (item, error) => {
    if (error instanceof AsmError && !error.located) {
      error.message = `${file}:${item.line}: ${error.message}\n    ${item.text}`;
      error.located = true;
    }
    return error;
  };
  const run = (address, final) => {
    let pc = 0, changed = false;
    items.forEach((item, i) => {
      offsets[i] = pc;
      const env = { pc, consts, final, label: name => labels.has(name) ? address(name, pc) : undefined };
      let out;
      try { out = encodeItem(env, item, arch); } catch (error) { throw located(item, error); }
      if (out.bytes.length !== item.size) changed = true;
      item.size = out.bytes.length;
      item.out = out;
      pc += item.size;
    });
    offsets[items.length] = pc;
    return changed;
  };
  // Start with every jump short (labels at the current pc), then grow jumps
  // that do not fit until the layout reaches a fixed point, like LLVM's relaxation.
  run((name, pc) => pc, false);
  const layout = offsets.slice();
  for (let pass = 0; ; pass++) {
    if (pass > 200) fail('layout did not converge');
    const snapshot = layout.slice();
    const changed = run(name => snapshot[labels.get(name)], false);
    offsets.forEach((v, i) => layout[i] = v);
    if (!changed && snapshot.every((v, i) => v === layout[i])) break;
  }
  const code = Buffer.alloc(offsets[items.length]), relocations = [], listing = [];
  for (const [i, item] of items.entries()) {
    const at = offsets[i];
    for (const [offset, type, sym, addend] of item.out.relocs) relocations.push([at + offset, type, sym, addend]);
    code.set(item.out.bytes, at);
    listing.push({ offset: at, bytes: item.out.bytes, line: item.line, text: item.text });
  }
  const labelOffsets = Object.fromEntries([...labels].map(([name, index]) => [name, offsets[index]]));
  return { arch, code, relocations, labels: labelOffsets, globals: [...globals], listing };
}

/** The checked-in code.js template for one source: hash, base64 code and relocations. */
export function assembleTemplate(source, options = {}) {
  const bytes = Buffer.isBuffer(source) ? source : Buffer.from(String(source));
  const result = assemble(bytes.toString('utf8'), options);
  return {
    sourceSHA256: createHash('sha256').update(bytes).digest('hex'),
    code: result.code.toString('base64'),
    relocations: result.relocations,
  };
}

export function codeModule(templates) {
  return '// Generated by refresh-code.js; source is x64.S / arm64.S. No compiler needed to use.\n' +
    'export const nativeCode = ' + JSON.stringify(templates, null, 2) + ';\n';
}

export function formatListing(result) {
  return result.listing.map(({ offset, bytes, text }) => {
    const hex = Buffer.from(bytes).toString('hex').replace(/(..)/g, '$1 ').trim();
    const label = Object.entries(result.labels).filter(([, v]) => v === offset).map(([k]) => k + ':').join(' ');
    return (label ? label + '\n' : '') + offset.toString(16).padStart(6, '0') + '  ' + hex.padEnd(30) + '  ' + text;
  }).join('\n');
}

// ---------------------------------------------------------------- CLI

const USAGE = `Usage: bun jasm.js [options] input.S [more.S ...]

Assemble x64 (GNU Intel syntax) or AArch64 source in pure JavaScript.

Options:
  -o FILE          Output file; the extension selects the format:
                     .exe   shloader PE32+ launcher (symbols come from index.js)
                     .json  template {sourceSHA256, code, relocations}
                     .js    code.js module (one template per input architecture)
                     .bin   raw .text bytes (unresolved relocations stay zero)
  -m, --arch=ARCH  x64 or arm64 (default: inferred from .intel_syntax or the file name)
  --mode=MODE      shell or bun, for .exe output (default: shell)
  -l, --list       Print an offset / bytes / source listing
  -h, --help       Show this help

Without -o, the listing is printed.`;

export async function main(argv) {
  const inputs = [];
  let output = null, arch = null, mode = 'shell', list = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => { if (i + 1 >= argv.length) fail(a + ' needs a value'); return argv[++i]; };
    if (a === '-h' || a === '--help') { console.log(USAGE); return 0; }
    else if (a === '-o' || a === '--output') output = value();
    else if (a.startsWith('--output=')) output = a.slice(9);
    else if (a.startsWith('-o') && a.length > 2) output = a.slice(2);
    else if (a === '-m' || a === '--arch') arch = value();
    else if (a.startsWith('--arch=')) arch = a.slice(7);
    else if (a.startsWith('--mode=')) mode = a.slice(7);
    else if (a === '--mode') mode = value();
    else if (a === '-l' || a === '--list') list = true;
    else if (a.startsWith('-') && a !== '-') fail('unknown option ' + a);
    else inputs.push(a);
  }
  if (!inputs.length) { console.error(USAGE); return 2; }
  if (arch && !['x64', 'arm64'].includes(arch)) fail('--arch must be x64 or arm64');
  const format = output ? extname(output).toLowerCase() : null;
  if (format && !['.exe', '.json', '.js', '.bin'].includes(format)) fail('output extension must be .exe, .json, .js or .bin');
  if (inputs.length > 1 && format !== '.js') fail('several inputs are only allowed with .js output');

  const results = inputs.map(path => {
    const bytes = readFileSync(path === '-' ? 0 : path);
    const text = bytes.toString('utf8');
    const options = { arch: arch ?? detectArch(text, path), file: path };
    return { path, bytes, options, result: assemble(text, options), template: assembleTemplate(bytes, options) };
  });
  if (list || !output) for (const { result } of results) console.log(formatListing(result));
  if (!output) return 0;

  let data;
  const [{ result, template, options }] = results;
  if (format === '.exe') {
    const { buildLoader } = await import('./index.js');
    data = buildLoader(options.arch, mode, template);
  } else if (format === '.json') {
    data = JSON.stringify(template, null, 2) + '\n';
  } else if (format === '.js') {
    const templates = {};
    for (const r of results) {
      if (templates[r.options.arch]) fail('two inputs target ' + r.options.arch);
      templates[r.options.arch] = r.template;
    }
    data = codeModule(templates);
  } else {
    if (result.relocations.length) {
      const names = [...new Set(result.relocations.map(r => r[2]))];
      console.error(`jasm: warning: ${result.relocations.length} unresolved relocations left as zero (${names.join(', ')})`);
    }
    data = result.code;
  }
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(output, data);
  if (!list) console.error(`${output}: ${Buffer.byteLength(data)} bytes`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof AsmError)) throw error;
    console.error('jasm: ' + error.message);
    process.exitCode = 1;
  }
}
