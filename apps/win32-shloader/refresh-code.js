// Maintainer-only: refresh the checked-in instruction templates after editing .S.
// Uses jasm.js, the pure-JavaScript assembler; no compiler is needed.
// `--check` exits with status 1 when code.js is out of date, without writing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { assembleTemplate, codeModule } from './jasm.js';

const here = new URL('./', import.meta.url);
const templates = {};
for (const arch of ['x64', 'arm64']) {
  templates[arch] = assembleTemplate(readFileSync(new URL(arch + '.S', here)), { arch, file: arch + '.S' });
}
const generated = codeModule(templates), target = new URL('code.js', here);
const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
if (process.argv.includes('--check')) {
  if (current !== generated) {
    console.error('code.js is out of date; run: bun apps/win32-shloader/refresh-code.js');
    process.exit(1);
  }
} else if (current !== generated) {
  writeFileSync(target, generated);
}
