import { test, expect } from 'bun:test';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { assemble, assembleTemplate, codeModule, AsmError } from '../jasm.js';
import { buildLoader } from '../index.js';
import { nativeCode } from '../code.js';

const here = new URL('../', import.meta.url);
const jasm = fileURLToPath(new URL('jasm.js', here));

test('jasm reproduces the checked-in code.js byte for byte', () => {
  const templates = {};
  for (const arch of ['x64', 'arm64']) {
    templates[arch] = assembleTemplate(readFileSync(new URL(arch + '.S', here)), { arch });
    expect(templates[arch]).toEqual(nativeCode[arch]);
  }
  expect(codeModule(templates)).toBe(readFileSync(new URL('code.js', here), 'utf8'));
});

// Expected bytes and relocations were produced once by Clang's integrated
// assembler; the test itself needs no compiler.
for (const arch of ['x64', 'arm64']) {
  test(`${arch}: instruction corpus matches Clang's encoding and relocations`, () => {
    const source = readFileSync(new URL(`jasm/${arch}-corpus.S`, import.meta.url), 'utf8');
    const expected = JSON.parse(readFileSync(new URL(`jasm/${arch}-corpus.json`, import.meta.url), 'utf8'));
    const result = assemble(source, { arch });
    expect(result.code.toString('base64')).toBe(expected.code);
    expect(result.relocations).toEqual(expected.relocations);
  });
}

test('the CLI writes the same PE launchers as index.js', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jasm-'));
  try {
    for (const [arch, mode] of [['x64', 'shell'], ['arm64', 'shell'], ['x64', 'bun'], ['arm64', 'bun']]) {
      const out = join(dir, `${arch}-${mode}.exe`);
      const run = Bun.spawnSync([process.execPath, jasm, `--mode=${mode}`, '-o', out, fileURLToPath(new URL(arch + '.S', here))]);
      expect(run.exitCode).toBe(0);
      expect(readFileSync(out)).toEqual(buildLoader(arch, mode));
    }
    const json = join(dir, 'x64.json');
    expect(Bun.spawnSync([process.execPath, jasm, '-o', json, fileURLToPath(new URL('x64.S', here))]).exitCode).toBe(0);
    expect(JSON.parse(readFileSync(json, 'utf8'))).toEqual(nativeCode.x64);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('errors name the file, line and statement', () => {
  const error = (() => { try { assemble('.intel_syntax noprefix\n  nop\n  frob eax\n', { arch: 'x64', file: 'bad.S' }); } catch (e) { return e; } })();
  expect(error).toBeInstanceOf(AsmError);
  expect(error.message).toContain('bad.S:3');
  expect(error.message).toContain('frob eax');
  expect(() => assemble('nop\n', { arch: 'x64' })).toThrow('.intel_syntax noprefix');
  expect(() => assemble('mov x0, #0x123456789\n', { arch: 'arm64' })).toThrow('more than one instruction');
  expect(() => assemble('.intel_syntax noprefix\nmov eax, [label]\nlabel:\n', { arch: 'x64' })).toThrow('RIP-relative');
});

test('x64 preserves operand widths and register writes in short encodings', () => {
  const source = [
    '.intel_syntax noprefix', 'xchg eax,eax', 'xchg rax,rax', 'xchg ax,ax',
    'push word ptr [rax]', 'pop word ptr [rax]', 'lea rbx,[rcx+rsp]',
  ].join('\n');
  expect(assemble(source).code.toString('hex')).toBe('87c090669066ff30668f00488d1c0c');
  for (const instruction of ['push byte ptr [rax]', 'mov eax,[rip+rbx]'])
    expect(() => assemble('.intel_syntax noprefix\n' + instruction)).toThrow(AsmError);
});

test('arm64 rejects operands that would encode a different register or shift', () => {
  for (const instruction of [
    'add x0,x1,w2', 'add xzr,x0,#1', 'add x0,x1,x2,uxtw', 'mov sp,xzr',
    'and x0,sp,#1', 'orr x0,x0,x1,lsl #64', 'ldrb x0,[x1]', 'ldr x0,[x1,sp]',
    'br sp', 'movk x0,#1,lsl #-16',
  ]) expect(() => assemble(instruction, { arch: 'arm64' })).toThrow(AsmError);
});

test('text data preserves UTF-8 and handles padding larger than a JS argument list', () => {
  const { code } = assemble('.asciz "😀"\n.zero 262144\n.byte 1', { arch: 'arm64' });
  expect(code.subarray(0, 5)).toEqual(Buffer.from('😀\0'));
  expect(code.length).toBe(5 + 262144 + 1);
  expect(code.at(-1)).toBe(1);
});
