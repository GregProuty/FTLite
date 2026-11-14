import { computeContentDigest } from '../build/contentDigest';
import { writeFileSync, mkdirSync } from 'node:fs';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { runSemanticReplay } from '../tests/helpers/semanticReplay';
import { scriptedSemanticReplay } from '../tests/helpers/script';

const layout = parseShip(starter);
const contentDigest = computeContentDigest(process.cwd());
const replay = scriptedSemanticReplay(2026, 4, 60 * 120, contentDigest);   // 2 minutes, 4 players
const { hashes, finalHash } = runSemanticReplay(layout, replay, 60, contentDigest);
mkdirSync('tests/golden', { recursive: true });
writeFileSync('tests/golden/basic.json', JSON.stringify({ replay, hashes, finalHash }));
console.log(`blessed tests/golden/basic.json: ${hashes.length} checkpoints, final ${finalHash}`);
