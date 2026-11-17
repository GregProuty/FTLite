// The duel migration oracle (engine refactor spec §5, R-2; the proof pattern of §7 and §9). A change that alters the
// duel's canonical array (ship slots, the missile pool's owner and active flags) cannot be proved by the duel golden,
// whose hashes change, nor by versionOnly.ts, which replays only the sector. So before the change this records, at
// EVERY tick of the duel golden's scripted pair and the ten gate seeds (seeds 1 to 10; the golden is seed 1), and of
// the same seeds with a passive crew:
//   - every named canonical field of the duel's modules (the interior expanded into its sector field names);
//   - every command result, and every tactical and repair event;
//   - the telemetry accumulator.
// After the change the same runs are checked through an alias table (MIGRATIONS, keyed by the baseline's SIM_VERSION):
// renamed fields, old fields rebuilt from several new ones, and new fields declared added. The check fails on any old
// field that is unmapped, any new field mapped from two old fields or neither mapped nor declared added, and any value,
// result, event or telemetry difference at any tick. R-2 drops no field, so there is no dropped list yet: a milestone
// that drops fields (R-3) adds one, left out of the record when its baseline is taken. The version is excluded from the
// values (the duel hash's leading SIM_VERSION and the interior's $simVersion) and checked on its own: a bump must be
// exactly the baseline's version plus 1. The baseline is also tied to the pinned duel golden: it records hashDuel at the
// golden's cadence (DUEL_GOLDEN_EVERY) in the golden's run (scripted, seed 1), and a bump is refused unless those
// checkpoints, the tick count, the outcome and the version equal tests/golden/duel-1.json's, so a baseline taken after
// an unblessed same-version rule change cannot pass the bump off as migration-only. No side effects on import: duel-oracle.ts is the CLI, and bless-golden.ts
// re-runs verifyDuelOracle() on every bump, so nothing from an earlier run is trusted.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalFields } from '../../src/renderer/src/sim/canonicalFields';
import { flattenDuel, hashDuel } from '../../src/renderer/src/sim/duel/hash';
import { DUEL_MODULES } from '../../src/renderer/src/sim/duel/modules';
import { createScriptedPair, scriptedInput } from '../../src/renderer/src/sim/duel/scripted';
import { createDuel, disposeDuel, type DuelState } from '../../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../../src/renderer/src/sim/duel/step';
import { createTelemetry, recordTick } from '../../src/renderer/src/sim/duel/telemetry';
import type { SimModule } from '../../src/renderer/src/sim/module';
import { Outcome } from '../../src/renderer/src/sim/tactical/state';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { CAP_TICKS, CUTTER, DUEL_GOLDEN, DUEL_GOLDEN_EVERY, DUEL_GOLDEN_SEED, GATE_SEEDS, passiveInput } from '../../tests/helpers/scriptedDuel';
import { dir, repoRoot, type VersionOnlyResult } from './versionOnly';

export const ORACLE_FILE = join(dir, 'duel-oracle.json');
/** The interior's own version value, excluded like the duel hash's leading SIM_VERSION. */
export const VERSION_FIELDS: readonly string[] = ['interior.$simVersion'];

/** One oracle run; `cap` (tests only) stops it early, the oracle runs use the gate cap. */
export interface OracleRunSpec { id: string; seed: number; crew: 'scripted' | 'passive'; cap?: number }
/** The gate seeds with the scripted pair (seed 1 is the duel golden), then the same seeds with a passive crew. */
export const ORACLE_RUNS: readonly OracleRunSpec[] = [
  ...GATE_SEEDS.map((seed) => ({ id: `scripted-${seed}`, seed, crew: 'scripted' as const })),
  ...GATE_SEEDS.map((seed) => ({ id: `passive-${seed}`, seed, crew: 'passive' as const }))
];

/** One run: its field schema (version fields left out), its length, and per tick three digests (fields, results and
 *  events, telemetry) as 24 hex characters; then one running digest per field over the whole run. */
export interface OracleRun { id: string; names: string[]; counts: number[]; ticks: number; outcome: number; perTick: string[]; chains: string[] }
/** The duel golden's checkpoints (tests/golden/duel-1.json, or the baseline's record of the same run): hashDuel every
 *  `every` ticks of the scripted pair at `seed`, with the run's length and outcome. */
export interface DuelGoldenCheckpoints { simVersion: number; seed: number; every: number; ticks: number; outcome: number; hashes: string[] }
/** `golden` ties the baseline to the pinned duel golden: the baseline's own scripted run at DUEL_GOLDEN_SEED, hashed at
 *  the golden's cadence. A baseline without it predates the tie and is refused. */
export interface OracleTrace { simVersion: number; cwd: string; head: string; runs: OracleRun[]; golden?: DuelGoldenCheckpoints }
/** The id of the oracle run that is the duel golden's run. */
export const GOLDEN_RUN_ID = `scripted-${DUEL_GOLDEN_SEED}`;

/** How a schema change maps the baseline's (old) named fields onto the current (new) ones. */
export interface Migration {
  readonly change: string;
  /** The new name of an old field that moved or was renamed (same count), or undefined. */
  rename(old: string): string | undefined;
  /** Old fields rebuilt from several new ones: `old` picks them, `reads` names every new field the rule consumes. */
  readonly derived: readonly { old: RegExp; reads: RegExp; value(old: string, read: (name: string) => ArrayLike<number>, newNames: readonly string[]): number[] }[];
  /** New fields with no old counterpart. */
  readonly added: readonly RegExp[];
}
/** R-2 (37 → 38): a ship's systems fields move from its body (`space.ships.<i>.*`) to its systems record. */
const MOVED_TO_SYSTEMS = /^space\.ships\.(\d+)\.(hull|rooms|shields|shieldClock|laserCharge|laserHold|fireHeld|lock|magazine|magazineClock|shots|laserHits|layersStripped|missilesLaunched|missileHits|missilesLost)$/;
/** The schema migrations, keyed by the baseline's SIM_VERSION. A version with no entry maps every field to itself. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  37: {
    change: 'R-2: N-ship space and the per-ship systems record',
    rename(old) { const m = MOVED_TO_SYSTEMS.exec(old); return m ? `ship.systems.${m[1]}.${m[2]}` : undefined; },
    // The old per-ship missile slot (presence, then the flight) is the pool entry that ship owns, wherever it sits.
    derived: [{
      old: /^space\.missiles\.\d+$/, reads: /^space\.missiles\.\d+\.(active|owner|flight)$/,
      value(old, read, names) {
        const owner = Number(old.split('.')[2]);
        for (const name of names) {
          const k = /^space\.missiles\.(\d+)\.active$/.exec(name)?.[1];
          if (k !== undefined && read(name)[0] === 1 && read(`space.missiles.${k}.owner`)[0] === owner) return [1, ...Array.from(read(`space.missiles.${k}.flight`))];
        }
        return [0, 0, 0, 0, 0, 0, 0, 0];
      }
    }],
    added: [/^space\.ships\.length$/, /^space\.ships\.\d+\.active$/, /^space\.missiles\.\d+\.(active|owner)$/, /^ship\.systems\.\d+\.(cls|target)$/]
  },
  /** H-2 (38 → 39): the round module joins after repair; no oracle run sends rematch or a non-default helmPlayer. */
  38: { change: 'H-2: duel rounds', rename: () => undefined, derived: [], added: [/^round\.(round|helmPlayer|baseTick|decidedTick)$/] }
};

/** The duel's named canonical fields after SIM_VERSION, in flattenDuel order: `<module id>.<field name>`, with the
 *  interior expanded into `interior.<sector canonical field>`. */
export function duelSchema(d: DuelState): { names: string[]; counts: number[] } {
  const names: string[] = [], counts: number[] = [];
  for (const { module, state } of DUEL_MODULES) {
    const m = module as SimModule<unknown>;
    if (m.id === 'interior') {
      for (const f of canonicalFields(d.interior.layout, d.interior.playerCount)) { names.push(`interior.${f.name}`); counts.push(f.count); }
      continue;
    }
    for (const f of m.fields(state(d))) { names.push(`${m.id}.${f.name}`); counts.push(f.count); }
  }
  return { names, counts };
}

/** The offset of the interior's version value in the flattened values (after the leading SIM_VERSION word); throws if the schema has none. */
export function versionOffset(names: readonly string[], counts: readonly number[]): number {
  let o = 0;
  for (let k = 0; k < names.length; k++) { if (names[k] === 'interior.$simVersion') return o; o += counts[k]!; }
  throw new Error('the duel schema has no interior.$simVersion field: the version cannot be checked');
}

/** How the current values become the baseline's named values: `build` returns them in the baseline's order. */
export interface AliasPlan { problems: string[]; build(values: ArrayLike<number>): Float64Array }

/** The alias table from the baseline's fields to the current ones (spec §9): renames, derived fields, identity for
 *  every name that did not change, version fields left out on both sides. */
export function aliasPlan(oldNames: readonly string[], oldCounts: readonly number[], newNames: readonly string[], newCounts: readonly number[], migration?: Migration): AliasPlan {
  const problems: string[] = [], at = new Map<string, { offset: number; count: number }>();
  let offset = 0;
  newNames.forEach((name, k) => { at.set(name, { offset, count: newCounts[k]! }); offset += newCounts[k]!; });
  const targeted = new Map<string, string>(), consumed = new Set<string>();
  const steps: ((values: ArrayLike<number>, out: number[]) => void)[] = [];
  oldNames.forEach((old, k) => {
    if (VERSION_FIELDS.includes(old)) return;
    const count = oldCounts[k]!;
    const rule = migration?.derived.find((d) => d.old.test(old));
    if (rule) {
      const reads = newNames.filter((n) => rule.reads.test(n));
      for (const n of reads) consumed.add(n);
      steps.push((values, out) => {
        const read = (name: string): ArrayLike<number> => {
          const f = at.get(name);
          if (!f) throw new Error(`derived ${old} reads ${name}, which is not a current field`);
          return Array.prototype.slice.call(values, f.offset, f.offset + f.count) as number[];
        };
        const v = rule.value(old, read, reads);
        if (v.length !== count) throw new Error(`derived ${old}: ${v.length} values, the baseline has ${count}`);
        out.push(...v);
      });
      return;
    }
    const name = migration?.rename(old) ?? old, f = at.get(name);
    if (!f) { problems.push(`old field ${old} is unmapped`); return; }
    const before = targeted.get(name);
    if (before !== undefined) problems.push(`new field ${name} is mapped from two old fields (${before} and ${old})`);
    targeted.set(name, old);
    if (f.count !== count) { problems.push(`old field ${old} has ${count} values, its new field ${name} ${f.count}`); return; }
    steps.push((values, out) => { for (let i = 0; i < f.count; i++) out.push(values[f.offset + i]!); });
  });
  for (const name of consumed) {
    const from = targeted.get(name);
    if (from !== undefined) problems.push(`new field ${name} is read by a derived rule and also mapped from old field ${from}`);
  }
  for (const name of newNames) {
    if (VERSION_FIELDS.includes(name) || targeted.has(name) || consumed.has(name)) continue;
    if (!migration?.added.some((p) => p.test(name))) problems.push(`new field ${name} is neither mapped nor declared added`);
  }
  return { problems, build(values) { const out: number[] = []; for (const s of steps) s(values, out); return Float64Array.from(out); } };
}

// A 32-bit FNV-style word mixer: each step is a bijection of the running value, so one differing word always changes it.
const F = new Float64Array(1), W = new Uint32Array(F.buffer), PRIME = 0x01000193, SEED = 0x811c9dc5;
function mixValue(h: number, v: number): number {
  F[0] = v === 0 ? 0 : v;
  h = Math.imul(h ^ W[0]!, PRIME) >>> 0;
  return Math.imul(h ^ W[1]!, PRIME) >>> 0;
}
function mixText(text: string): string {
  let h = SEED;
  for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), PRIME) >>> 0;
  return h.toString(16).padStart(8, '0');
}
const plain = (_key: string, value: unknown): unknown => (ArrayBuffer.isView(value) ? Array.from(value as unknown as ArrayLike<number>) : value);
const hex = (h: number): string => h.toString(16).padStart(8, '0');

/**
 * Run one duel to its end (or the gate cap), recording every tick. `names` / `counts` are the schema the record is
 * kept in (the baseline's, or the current one for a baseline); `plan` turns the current values into it. `schemaOf`
 * (tests only) replaces duelSchema; a schema that does not name every flattened value throws.
 */
export function recordRun(spec: OracleRunSpec, schema?: { names: readonly string[]; counts: readonly number[]; migration?: Migration },
  schemaOf: (d: DuelState) => { names: string[]; counts: number[] } = duelSchema): { run: OracleRun; problems: string[]; hashes?: string[] } {
  const d = createDuel(CUTTER, spec.seed), pair = createScriptedPair(spec.seed), t = createTelemetry(d);
  try {
    const now = schemaOf(d), target = schema ?? now;
    const plan = aliasPlan(target.names, target.counts, now.names, now.counts, schema?.migration);
    const kept = target.names.map((n, k) => ({ n, c: target.counts[k]! })).filter((f) => !VERSION_FIELDS.includes(f.n));
    const versionAt = versionOffset(now.names, now.counts);
    const flatCount = now.counts.reduce((a, b) => a + b, 0), chains = kept.map(() => SEED), perTick: string[] = [], hashes: string[] = [];
    if (plan.problems.length === 0) while (d.tactical.outcome === Outcome.Running && d.interior.tick < (spec.cap ?? CAP_TICKS)) {
      const input = spec.crew === 'scripted' ? scriptedInput(pair, d) : passiveInput(d);
      const results = stepDuelTick(d, input);
      recordTick(t, d, input);
      const all = flattenDuel(d);
      // The schema must name every flattened value (the leading SIM_VERSION aside), or trailing values would drop out of every digest.
      if (flatCount !== all.length - 1) throw new Error(`${spec.id} tick ${d.interior.tick}: the duel schema names ${flatCount} values, flattenDuel writes ${all.length - 1} after SIM_VERSION`);
      if (all[0] !== SIM_VERSION || all[1 + versionAt] !== SIM_VERSION) throw new Error(`${spec.id} tick ${d.interior.tick}: a version value is not SIM_VERSION`);
      const values = plan.build(all.subarray(1));
      let h = SEED, i = 0;
      kept.forEach((f, k) => {
        let c = chains[k]!;
        for (let j = 0; j < f.c; j++, i++) { h = mixValue(h, values[i]!); c = mixValue(c, values[i]!); }
        chains[k] = c;
      });
      if (i !== values.length) throw new Error(`${spec.id}: ${values.length} values for a ${i}-value schema`);
      if (d.interior.tick % DUEL_GOLDEN_EVERY === 0) hashes.push(hashDuel(d));   // the duel golden's checkpoint cadence
      perTick.push(hex(h) + mixText(JSON.stringify([results, d.tactical.events, d.events])) + mixText(JSON.stringify(t, plain)));
    }
    return { problems: plan.problems, hashes, run: { id: spec.id, names: kept.map((f) => f.n), counts: kept.map((f) => f.c), ticks: d.interior.tick, outcome: d.tactical.outcome, perTick, chains: chains.map(hex) } };
  } finally { disposeDuel(d); }
}

function gitHead(): string {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

/** The baseline: every run in the current schema. */
export function oracleTrace(): OracleTrace {
  let golden: DuelGoldenCheckpoints | undefined;
  const runs = ORACLE_RUNS.map((spec) => {
    const r = recordRun(spec);
    if (spec.id === GOLDEN_RUN_ID) golden = { simVersion: SIM_VERSION, seed: spec.seed, every: DUEL_GOLDEN_EVERY, ticks: r.run.ticks, outcome: r.run.outcome, hashes: r.hashes ?? [] };
    return r.run;
  });
  if (!golden) throw new Error(`ORACLE_RUNS has no ${GOLDEN_RUN_ID} run: the baseline cannot be tied to the duel golden`);
  return { simVersion: SIM_VERSION, cwd: repoRoot(), head: gitHead(), runs, golden };
}

/** Why the baseline does not record the behaviour the stored duel golden pins, or undefined when it does. */
export function goldenRefusal(was: OracleTrace, stored: DuelGoldenCheckpoints | undefined): string | undefined {
  if (!stored) return `no stored duel golden at ${DUEL_GOLDEN}: the baseline cannot be tied to it`;
  if (stored.simVersion !== was.simVersion) return `the duel oracle baseline is at sim version ${was.simVersion}, the stored ${DUEL_GOLDEN} at ${stored.simVersion}: the baseline must be recorded at the stored golden's version`;
  const g = was.golden;
  if (!g || !Array.isArray(g.hashes)) return `the duel oracle baseline (HEAD ${was.head}) records no duel golden checkpoints: re-record the duel oracle baseline (\`duel-oracle.ts baseline\`) at the stored golden's commit`;
  if (g.simVersion !== stored.simVersion || g.seed !== stored.seed || g.every !== stored.every) return `the duel oracle baseline's golden run (version ${g.simVersion}, seed ${g.seed}, every ${g.every}) is not the stored golden's (version ${stored.simVersion}, seed ${stored.seed}, every ${stored.every})`;
  const n = Math.max(g.hashes.length, stored.hashes.length);
  for (let at = 0; at < n; at++) if (g.hashes[at] !== stored.hashes[at]) return `the duel oracle baseline does not record what ${DUEL_GOLDEN} pins: first checkpoint difference at tick ${(at + 1) * g.every} (an unblessed same-version change before the baseline?)`;
  if (g.ticks !== stored.ticks || g.outcome !== stored.outcome) return `the duel oracle baseline's golden run ended at tick ${g.ticks} with outcome ${g.outcome}, ${DUEL_GOLDEN} at tick ${stored.ticks} with outcome ${stored.outcome}`;
  return undefined;
}

export const oracleCounts = (t: OracleTrace): string => `${t.runs.length} runs, ${t.runs.reduce((n, r) => n + r.ticks, 0)} ticks, ${t.runs[0]?.names.length ?? 0} named fields per tick`;

/** Every difference between a baseline run and the same run re-recorded in the baseline's schema. */
export function runDifferences(was: OracleRun, now: OracleRun): string[] {
  const problems: string[] = [];
  if (was.ticks !== now.ticks || was.outcome !== now.outcome) problems.push(`${was.id}: ended at tick ${now.ticks} with outcome ${now.outcome}, the baseline at tick ${was.ticks} with outcome ${was.outcome}`);
  const first = was.perTick.findIndex((p, k) => p !== now.perTick[k]);
  if (first >= 0) {
    const a = was.perTick[first]!, b = now.perTick[first] ?? '';
    const parts = (['fields', 'results and events', 'telemetry'] as const).filter((_, k) => a.slice(8 * k, 8 * k + 8) !== b.slice(8 * k, 8 * k + 8));
    const fields = was.names.filter((_, k) => was.chains[k] !== now.chains[k]);
    problems.push(`${was.id}: first difference at tick ${first + 1} (${parts.join(', ') || 'missing'})${fields.length > 0 ? `; fields that differ during the run: ${fields.slice(0, 12).join(', ')}${fields.length > 12 ? ', …' : ''}` : ''}`);
  }
  return problems;
}

/** Compare a baseline with the current code (pure apart from `rerun`). `mode` 'bump' requires SIM_VERSION to be the
 *  baseline's plus 1 and applies MIGRATIONS[baseline]; 'same' requires the same version and no migration. */
export function judgeDuelOracle(was: OracleTrace | undefined, rerun: (spec: OracleRunSpec, schema: { names: readonly string[]; counts: readonly number[]; migration?: Migration }) => { run: OracleRun; problems: string[] },
  root: string, mode: 'bump' | 'same', version = SIM_VERSION, migrations: Readonly<Record<number, Migration>> = MIGRATIONS, stored?: DuelGoldenCheckpoints): VersionOnlyResult {
  if (!was) return { ok: false, message: `no duel oracle baseline at ${ORACLE_FILE}: run \`duel-oracle.ts baseline\` before the change` };
  if (was.cwd !== root) return { ok: false, message: `the duel oracle baseline was recorded from ${was.cwd} (HEAD ${was.head}), not from ${root}: record it again here` };
  if (mode === 'bump' && version !== was.simVersion + 1) return { ok: false, message: `the duel oracle baseline is at sim version ${was.simVersion}; a bump must be to ${was.simVersion + 1}, not ${version}` };
  if (mode === 'same' && version !== was.simVersion) return { ok: false, message: `the duel oracle baseline is at sim version ${was.simVersion}, the code at ${version}: use \`check\` for a bump` };
  // A bump re-blesses duel-1.json, so the baseline must record exactly what the stored golden pins.
  if (mode === 'bump') { const g = goldenRefusal(was, stored); if (g) return { ok: false, message: g }; }
  const migration = mode === 'bump' ? migrations[was.simVersion] : undefined, problems: string[] = [];
  const specs = new Map(ORACLE_RUNS.map((s) => [s.id, s]));
  if (was.runs.map((r) => r.id).join(',') !== ORACLE_RUNS.map((s) => s.id).join(',')) problems.push('the baseline records other runs than ORACLE_RUNS');
  for (const run of was.runs) {
    const spec = specs.get(run.id);
    if (!spec) continue;
    const now = rerun(spec, { names: run.names, counts: run.counts, migration });
    if (now.problems.length > 0) { problems.push(...now.problems.map((p) => `${run.id}: ${p}`)); break; }
    problems.push(...runDifferences(run, now.run));
  }
  const ticks = was.runs.reduce((n, r) => n + r.ticks, 0);
  if (problems.length > 0) return { ok: false, message: `duel migration oracle FAILED (baseline HEAD ${was.head}):\n${problems.join('\n')}` };
  const how = migration ? `through the ${was.simVersion} → ${version} alias table (${migration.change})` : 'field for field';
  return { ok: true, message: `duel oracle: ${was.runs.length} runs, ${ticks} ticks, ${was.runs[0]?.names.length ?? 0} named fields, results, events and telemetry identical at every tick ${how}, sim version ${was.simVersion} → ${version} (baseline HEAD ${was.head})` };
}

const readBaseline = (): OracleTrace | undefined => existsSync(ORACLE_FILE) ? JSON.parse(readFileSync(ORACLE_FILE, 'utf8')) as OracleTrace : undefined;

const readStoredGolden = (): DuelGoldenCheckpoints | undefined => existsSync(DUEL_GOLDEN) ? JSON.parse(readFileSync(DUEL_GOLDEN, 'utf8')) as DuelGoldenCheckpoints : undefined;

/** The bump proof `npm run bless` re-runs: the recorded baseline, tied to the stored duel golden, against the current
 *  code through MIGRATIONS. */
export function verifyDuelOracle(): VersionOnlyResult { return judgeDuelOracle(readBaseline(), recordRun, repoRoot(), 'bump', SIM_VERSION, MIGRATIONS, readStoredGolden()); }
/** The same-version proof for a refactor that must not change the duel at all. */
export function verifyDuelUnchanged(): VersionOnlyResult { return judgeDuelOracle(readBaseline(), recordRun, repoRoot(), 'same'); }
