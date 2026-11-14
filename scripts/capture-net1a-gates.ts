// Explicit baseline capture only. Ordinary gate tests compare pinned data and never rewrite it.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const output = resolve('.superpowers/sdd/2026-11-13-net-1a-boundary/gate-capture');
mkdirSync(output, { recursive: true });
const gates = ['survival', 'cutter', 'duo', 'skiff', 'boarding', 'jump', 'run', 'warden'];
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...gates.map((g) => `tests/gate-${g}.test.ts`), '--reporter=dot'], { encoding: 'utf8', env: { ...process.env, NET1A_CAPTURE_GATE_OUTPUT: output } });
writeFileSync(join(output, 'capture.log'), result.stdout + result.stderr);
if (result.status !== 0) { process.stderr.write(result.stdout + result.stderr); process.exit(result.status ?? 1); }
const traces = readdirSync(output).filter((p) => p.endsWith('.json')).sort().map((p) => JSON.parse(readFileSync(join(output, p), 'utf8')));
writeFileSync('tests/fixtures/net1a-gates.json', JSON.stringify({ baseline: '88979b3', gameCode: '0a47e50', gates: traces }) + '\n');
console.log(`Captured ${traces.length} gate traces; original assertions all passed.`);
