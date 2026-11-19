// The vercel-dev-free output check (web build spec §8): `tsx scripts/web/check-output.ts [outDir]` (default .vercel/output).
import { resolve } from 'node:path';
import { checkWebOutput } from './web-output';

const outDir = resolve(process.argv[2] ?? '.vercel/output');
checkWebOutput(outDir).then(({ problems, staticPaths }) => {
  if (problems.length) { console.error(`WEB OUTPUT FAIL (${outDir}):\n  ${problems.slice(0, 40).join('\n  ')}`); process.exitCode = 1; return; }
  console.log(`WEB OUTPUT PASS: ${staticPaths} static paths need the cookie; only the passcode page and ${'/__pass'} answer without it (${outDir})`);
}, error => { console.error(`WEB OUTPUT FAIL: ${String((error as Error)?.message ?? error)}`); process.exitCode = 1; });
