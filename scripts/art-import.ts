// npm run art:import (Art-i spec section 3): reads art/import.json, the packs from FTLITE_ASSETS (else the owner's folder),
// writes public/assets/paid/ and .art/contact.png. Lists every problem and exits 1 without writing anything if one is found.
import { readFileSync } from 'node:fs';
import { runImport, sourceFolder } from './art/importCore';

const repoRoot = process.cwd();   // npm runs scripts from the package root
const config: unknown = JSON.parse(readFileSync('art/import.json', 'utf8'));
const result = runImport({ repoRoot, sourceRoot: sourceFolder(process.env), config });
if (result.problems.length) {
  console.error(`art:import found ${result.problems.length} problem(s); nothing was written:`);
  for (const p of result.problems) console.error(`  ${p}`);
  process.exitCode = 1;
} else if (!result.written.length) console.log('art:import: art/import.json lists no outputs; nothing to do');
else for (const p of result.written) console.log(`wrote ${p}`);
