// Explicit developer command only; never imported by tests. Run on the pinned baseline before migration.
import { writeFileSync } from 'node:fs';
import { scenarios, runScenario } from '../tests/helpers/gameplayTrace';
writeFileSync('tests/fixtures/net1a-baseline.json', JSON.stringify({ baseline: '88979b3', gameCode: '0a47e50', simVersion: 34, goldenFinalHash: '0a644af3', scenarios: scenarios.map(runScenario) }) + '\n');
console.log(`Captured ${scenarios.length} immutable gameplay scenarios`);
