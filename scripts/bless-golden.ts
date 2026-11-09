import { writeFileSync, mkdirSync } from 'node:fs';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { runReplay } from '../src/renderer/src/sim/replay';
import { scriptedReplay } from '../tests/helpers/script';

const layout = parseShip(starter);
const replay = scriptedReplay(2026, 4, 60 * 120);   // 2 minutes, 4 players
const { hashes, finalHash } = runReplay(layout, replay);
mkdirSync('tests/golden', { recursive: true });
writeFileSync('tests/golden/basic.json', JSON.stringify({ replay, hashes, finalHash }));
console.log(`blessed tests/golden/basic.json: ${hashes.length} checkpoints, final ${finalHash}`);
