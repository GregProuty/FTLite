# Engine Refactor R-0: Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The engine refactor's guards go in before any layer moves. The SimState completeness test from branch `hash-completeness` merges, together with that branch's fuller duel hash (the interior's whole canonical flatten). That hash changes the duel golden, so `SIM_VERSION` goes 36 → 37, through the guarded version-only re-bless: a per-tick canonical trace recorded *before* the bump must match one recorded after it before anything is blessed. `npm run bless` becomes the one command that regenerates every pinned artifact (the sector golden, the duel golden and the determinism fixture), and the immutable `net1a-baseline.json` oracle leaves the default suite for an opt-in historical check, `npm run bless -- --baseline`.

**Architecture:** Tests, scripts and one constant:
- the merge brings `src/renderer/src/sim/canonicalFields.ts` (`NOT_SNAPSHOTTED`), `sim/duel/hash.ts` (the interior's whole flatten), `tests/simStateCompleteness.test.ts` and the re-blessed `tests/golden/duel-1.json`;
- `scripts/bless-golden.ts` stages `basic.json`, `duel-1.json` and the determinism fixture's expectations (through the new `scripts/determinism/bless.ts`, which replaces `rebless-version.ts`) in memory and writes them only when all three are valid; the version-only guard runs whenever any of the three is stored at another version (`scripts/golden/blessGuard.ts`: `blessRefusal` over every stored version, `writeAllOrNothing`); `--baseline` runs the new `scripts/golden/baselineCheck.ts` and writes nothing;
- `scripts/golden/versionOnly.ts` gains `verifyUnchanged()` and `canonical-trace.ts` its `same` mode, the per-tick proof the R-1 refactors use at an unchanged version;
- `tests/netParity.test.ts` and `tests/golden.test.ts` stop reading `net1a-baseline.json`;
- `sim/tuning.ts`: `SIM_VERSION` 36 → 37.

**Nothing touches `authority/`, `net/`, `network/`, `app/` or `render/`, and no gameplay changes.**

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2, tsx, Electron 37 (the cross-engine determinism check). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-engine-refactor-design.md` §7 (hashing and the goldens) and the R-0 row of §12.

## Scope

- **Task 1:** merge `hash-completeness` (the completeness guard and the fuller duel hash).
- **Task 2:** one bless command for every pinned artifact; `net1a-baseline.json` retired to `--baseline`; the `same` mode of the canonical trace.
- **Task 3:** `SIM_VERSION` 37 through the guarded version-only re-bless; the full suite and the cross-engine determinism check.
- **Not here:** everything in R-1 (`2026-11-16-engine-r1a-generic-authority.md`, `2026-11-16-engine-r1b-duel-mode.md`).

## Global Constraints

- Determinism guard (`tests/boundary.test.ts`): the sim may only use `Math.abs`, `ceil`, `floor`, `round`, `min`, `max`, `sign`, `imul` and `sqrt`; no platform globals; randomness only through `src/shared/rng.ts`. This plan changes no sim code beyond the merge and the constant.
- Generated files are never hand-written. `tests/golden/basic.json`, `tests/golden/duel-1.json` and `tests/fixtures/determinism-v2.json` come only from `npm run bless`. `tests/fixtures/net1a-baseline.json` and `tests/fixtures/net1a-gates.json` are never written.
- **Never discard working-tree changes.** No step runs `git checkout`, `git restore`, `git stash` or `git clean`: the owner and other sessions keep uncommitted work in this checkout (today, netcode files under `src/main/network/`, `src/renderer/src/main.ts` and `tests/online*.test.ts`), and this plan touches none of those files. Every check that writes evidence writes it under the git-ignored `out/`.
- **Commands need no shell features.** Every `Run:` line works as written in Windows PowerShell 5.1 and in Git Bash. The canonical trace keeps its baseline in `<os tmpdir>/ftlite-canonical-trace/`.
- Commit with explicit paths only (`git add <paths>`), never `git add -A` or `git add .`: the owner keeps unrelated uncommitted files in this checkout. End every commit message with the Co-Authored-By trailer your own session instructs.
- Run single test files with `npx vitest run <file>`. The full suite is `npm test`; it reads the built `out/` (build first). Typecheck is `npm run typecheck`.
- Known flakes: `tests/authorityBoundary.test.ts` and `tests/run.test.ts` can time out under full-suite load; rerun one alone if it fails. `tests/onlineAppRuntime.test.ts` ("bounds an unresolved actual observer-build") fails in a git worktree outside the main checkout (it fails on pristine master there too); it passes in the main checkout.
- Line endings: write files with LF. The repository normalises on commit and the content digest normalises line endings.

## Decisions the plan makes inside the spec

Each is the recommendation, taken under the standing order; the owner can overturn any of them.

1. **What `npm run bless` regenerates** **(rec.)**: `basic.json`, `duel-1.json` and the expectations (not the schedules) of `determinism-v2.json`, **all or nothing** (Codex plan review, P0): the three are computed and validated in memory, and none is written unless all three staged. **A version change is in progress whenever any of the three is stored at a version other than `SIM_VERSION`** (read from `basic.json`'s and `duel-1.json`'s `simVersion` and the fixture's checkpoints), so a half-finished earlier bless that left `basic.json` at the new version still triggers the guard. A version change is then refused unless the per-tick canonical comparison, re-run just before staging, is identical; on a bump the determinism fixture's checkpoints move to the new version and the write is refused unless every canonical field except `$simVersion`, every sample's place and all 404 result/event boundaries are unchanged. A same-version bless (a deliberate gameplay change) re-executes the fixture's schedules and writes the new expectations, as it does the goldens. `scripts/determinism/rebless-version.ts` is folded into it and deleted. `net1a-gates.json` is not a bless artifact: it pins the eight gate families and stays as it is.
2. **`--baseline`** **(rec.)**: `npm run bless -- --baseline` writes nothing. It re-runs the 19 pinned `net1a-baseline.json` scenarios (observations, decisions and summary, ignoring only the recorded SIM 34 in the summary) and the golden replay's 60-tick projections, prints one line and exits 0, or names each first difference and exits 1. The prototype checked that it bites: with `CREW_SPEED` 4 → 4.001 it named every scenario at tick 1 (`crew[0].x`). The default suite no longer reads the file: the scenario loop, the "short scripts" assertions and the projection test move out; the projection code's own tests stay, with a synthetic oracle for the corruption check.
3. **The R-1 refactor check** **(rec.)**: `canonical-trace.ts same` compares the per-tick canonical trace at an *unchanged* version and exits 1 on the first differing tick. R-1 records the baseline before it changes the authority and runs `same` after; R-0 only adds the mode.
4. **The version bump's proof** (spec §7 and the R-0 row): the bump changes no sector tick. The prototype's `check` reported `per-tick canonical trace identical, sim version 36 → 37: golden 7200 ticks, determinism-v2 108000 ticks in 19 runs`, and `golden` found 14,531 differing leaves in `basic.json`, all of them version, digest or hash. The duel golden keeps its 26 checkpoints, 15,772 ticks and outcome 1; only its hashes move (the fuller hash, then the version). A second `npm run bless` at version 37 regenerated all three files byte for byte; with `duel-1.json` alone set back to 36 it refused (`refusing to bless a SIM_VERSION bump (36 → 37)`) and wrote nothing.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/canonicalFields.ts`, `src/renderer/src/sim/duel/hash.ts`, `tests/simStateCompleteness.test.ts`, `tests/duelGolden.test.ts`, `tests/golden/duel-1.json` | **From the merge** (branch `hash-completeness`) |
| `scripts/golden/baselineCheck.ts` | **Create:** `checkNet1aBaseline(contentDigest)`, the historical check |
| `scripts/determinism/bless.ts` | **Create:** `blessDeterminismFixture(contentDigest)`, `fixtureVersion` |
| `scripts/determinism/rebless-version.ts` | **Delete** (folded into `bless.ts`) |
| `scripts/bless-golden.ts` | **Replace:** writes all three artifacts; `--baseline` |
| `scripts/golden/versionOnly.ts`, `scripts/golden/canonical-trace.ts` | **Replace:** `verifyUnchanged` and the `same` mode |
| `scripts/golden/blessGuard.ts`, `tests/blessGuard.test.ts` | **Replace:** `blessRefusal` over every artifact's stored version; `writeAllOrNothing`; their tests |
| `tests/netParity.test.ts`, `tests/golden.test.ts` | **Replace:** no longer read `net1a-baseline.json` |
| `src/renderer/src/sim/tuning.ts` | **Replace:** `SIM_VERSION` 36 → 37 (only change) |
| `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/fixtures/determinism-v2.json` | **Generated** in Task 3 |

---

### Task 1: Merge `hash-completeness`

**Files:**
- From the branch: `src/renderer/src/sim/canonicalFields.ts`, `src/renderer/src/sim/duel/hash.ts`, `tests/simStateCompleteness.test.ts`, `tests/duelGolden.test.ts`, `tests/golden/duel-1.json`

**Interfaces:**
- Produces: `NOT_SNAPSHOTTED: Readonly<Record<string, string>>` (`sim/canonicalFields.ts`); `flattenDuel` = `SIM_VERSION`, the tactical flatten, presence and repair, then `flatten(d.interior)`.

- [ ] **Step 1: Merge the branch**

The branch is two commits on Net-3's merge and merges without conflicts.

```bash
git merge --no-ff hash-completeness -m "merge: hash-completeness, the SimState completeness guard and the fuller duel hash (engine refactor R-0)"
```

(End the message with your session's Co-Authored-By trailer.)

- [ ] **Step 2: Run the guard and the duel golden**

Run: `npx vitest run tests/simStateCompleteness.test.ts tests/duelGolden.test.ts`
Expected: PASS, 15 tests in 2 files (the branch re-blessed `duel-1.json` for its hash at SIM 36). The completeness test's "catches a member added without a canonical field or an exclusion" case is the R-0 proof that an added field fails it.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

---

### Task 2: One bless command; `net1a-baseline` retired to `--baseline`

**Files:**
- Create: `scripts/golden/baselineCheck.ts`, `scripts/determinism/bless.ts`
- Modify (whole file): `scripts/bless-golden.ts`, `scripts/golden/versionOnly.ts`, `scripts/golden/canonical-trace.ts`, `scripts/golden/blessGuard.ts`, `tests/blessGuard.test.ts`, `tests/netParity.test.ts`, `tests/golden.test.ts`
- Delete: `scripts/determinism/rebless-version.ts`

**Interfaces:**
- Consumes: `scenarios`, `runScenario`, `firstDifference`, `projectGameplay` (`tests/helpers/gameplayTrace.ts`); `runSemanticReplay`; `executeFixture`, `packFixture`, `unpackFixture` (`scripts/determinism/fixture.ts`); `firstDifference` (`scripts/determinism/protocol.ts`); `blessRefusal`, `verifyVersionOnly`.
- Produces: `checkNet1aBaseline(contentDigest: string): { ok: boolean; message: string }`; `DETERMINISM_FIXTURE`, `fixtureVersion(fixture: Fixture): number`, `storedFixtureVersion(): number`, `stageDeterminismFixture(contentDigest: string): { content: string; message: string }` (writes nothing); `blessRefusal({ storedVersions, currentVersion, verify, versionOnly? })`; `interface StagedArtifact { path; stage(): { content; message } }`; `writeAllOrNothing(artifacts, write): string[]`; `verifyUnchanged(): VersionOnlyResult`; the CLI modes `canonical-trace.ts same` and `bless-golden.ts --baseline`.

- [ ] **Step 1: Move the default suite off the pinned baseline**

Replace the whole of `tests/netParity.test.ts` with:

```ts
import { createCardUiState } from '../src/renderer/src/clientControl/cardController';
import { targetRef, scienceTargetSlot } from '../src/renderer/src/sim/debrisTargets';
import { describe, expect, it } from 'vitest';
import { Health } from '../src/renderer/src/sim/components';
import { makeState, placeDebris, placeEnemy } from './helpers/sim';
import { ENEMY_WEAPONS_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { firstDifference, projectGameplay } from './helpers/gameplayTrace';
// tests/fixtures/net1a-baseline.json is a retired historical oracle (engine refactor R-0): no default test reads it.
// `npm run bless -- --baseline` re-runs its pinned scenarios on demand. These tests keep the projection itself honest.

describe('independent Net-1a baseline oracle', () => {
  it('reports exact health and RNG paths at the changed tick', () => {
    const s = makeState(); s.tick = 17;
    const expected = projectGameplay(s); Health.cur[s.crew[0]!] = Health.cur[s.crew[0]!]! - 1;
    expect(firstDifference(expected, projectGameplay(s))).toEqual({ tick: 17, field: 'crew[0].health' });
    Health.cur[s.crew[0]!] = Health.cur[s.crew[0]!]! + 1; s.rng.combat.s ^= 1;
    expect(firstDifference(expected, projectGameplay(s))).toEqual({ tick: 17, field: 'rng.combat.s' });
  });
  it('ignores only client UI memory, keeping the weapon selector', () => {
    const s = makeState(), expected = projectGameplay(s);
    const ui = createCardUiState('test', s.playerCount); ui.stations.push({ rowKey: 'evade:0', page: 'upgrades' }); ui.groupBar.push(true);
    expect(firstDifference(expected, projectGameplay(s))).toBeNull();
    s.weapons.selector = 2;
    expect(firstDifference(expected, projectGameplay(s))?.field).toBe('weapons.selector');
  });
  it('retains stable selected targets, enemy room identity and selector while nulling system/SWAP rows', () => {
    const s = makeState(); const w = s.derived.stationOfKind[StationKind.Weapons]!, sc = s.derived.stationOfKind[StationKind.Science]!;
    placeDebris(s, 0, 10000, 1, 99); placeDebris(s, 1, 10000, 1, 100);
    s.weapons.target = { kind: 'object', stableId: 99 }; s.science.target = targetRef(s, 1);
    const expected = projectGameplay(s);
    expect((expected.weapons as Record<string, unknown>).target).toEqual({ kind: 'debris', stableId: 99 });
    expect((expected.science as Record<string, unknown>).target).toEqual({ kind: 'debris', stableId: 100 });
    s.weapons.target = { kind: 'object', stableId: 100 };
    expect(firstDifference(expected, projectGameplay(s))?.field).toBe('weapons.target.stableId');
    placeEnemy(s); s.weapons.target = { kind: 'enemy', stableId: s.enemy.stableId, room: 0 };
    expect((projectGameplay(s).weapons as Record<string, unknown>).target).toEqual({ kind: 'enemy-room', stableId: s.enemy.stableId, room: 0 });
    for (const cursor of [-1, -2]) { s.science.target = targetRef(s, cursor); expect((projectGameplay(s).science as Record<string, unknown>).target).toBeNull(); }
  });
  it('detects deliberate corruption of the stored oracle independently of execution', () => {
    const s = makeState(), expected = [{ tick: 0, state: projectGameplay(s) }];
    const actual = structuredClone(expected);
    (actual[0]!.state as Record<string, unknown>).hull = -123;
    expect(firstDifference(expected, actual)).toEqual({ tick: 0, field: '[0].state.hull' });
  });
});
```

Replace the whole of `tests/golden.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { encodeIntent, decodeIntent } from './helpers/legacyIntentCodec';
import type { ReplayV2 } from '../src/renderer/src/sim/replay';
import { runSemanticReplay } from './helpers/semanticReplay';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { LAYOUT } from './helpers/sim';
import { scriptedSemanticReplay } from './helpers/script';

const GOLDEN = 'tests/golden/basic.json';
const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as { replay: ReplayV2; hashes: string[]; finalHash: string };
const trace = golden.replay;
// Header-only fixture adaptation: source changes alter the digest, never canonical values or expected hashes.
trace.initial.header.contentDigest = __GAMEPLAY_CONTENT_DIGEST__;
trace.init.contentDigest = __GAMEPLAY_CONTENT_DIGEST__;
trace.checkpoint.init.contentDigest = __GAMEPLAY_CONTENT_DIGEST__;
trace.checkpoint.snapshot.header.contentDigest = __GAMEPLAY_CONTENT_DIGEST__;
const observations: number[] = [];
const result = runSemanticReplay(LAYOUT, trace, 60, __GAMEPLAY_CONTENT_DIGEST__, state => observations.push(state.tick));

describe('replay', () => {
  it('encode/decode round-trips an intent', () => {
    const i = { ...NEUTRAL_INTENT, moveX: 0.5, interactPressed: true, cancelPressed: true };
    expect(decodeIntent(encodeIntent(i))).toEqual(i);
  });
  it('matches the golden hashes (run `npm run bless` to update deliberately)', () => {
    expect(existsSync(GOLDEN)).toBe(true);
    const firstDiff = result.hashes.findIndex((h, i) => h !== golden.hashes[i]);
    expect(firstDiff, `first divergence at tick ${(firstDiff + 1) * 60}`).toBe(-1);
    expect(result.finalHash).toBe(golden.finalHash);
  });
  it('replays the whole semantic golden: 7200 ticks from a tick-0 snapshot (V2)', () => {
    expect(observations).toHaveLength(120);
    expect(trace.initial.header.tick).toBe(0);
    expect(trace.initial.values.length).toBeGreaterThan(0);
    expect(trace.version).toBe(2);
    expect(trace.frames.filter(frame => frame.action.kind === 'tick')).toHaveLength(7200);
  });
  it('rejects a replay from another sim version or layout hash', () => {
    const base = scriptedSemanticReplay(1, 1, 5);
    expect(() => runSemanticReplay(LAYOUT, { ...base, checkpoint: { ...base.checkpoint, snapshot: { ...base.initial, header: { ...base.initial.header, simVersion: 999 } } } })).toThrow(/sim version/);
    expect(() => runSemanticReplay(LAYOUT, { ...base, checkpoint: { ...base.checkpoint, snapshot: { ...base.initial, header: { ...base.initial.header, layoutHash: 'deadbeef' } } } })).toThrow(/snapshot layout does not match/);
    expect(() => runSemanticReplay(LAYOUT, base)).not.toThrow();
  });
});
```

Run: `npx vitest run tests/netParity.test.ts tests/golden.test.ts`
Expected: PASS, 8 tests in 2 files (5 net parity, 3 golden).

- [ ] **Step 2: The all-or-nothing guard, test first**

Replace the whole of `tests/blessGuard.test.ts` with:

```ts
import { describe, expect, it, vi } from 'vitest';
import { blessRefusal, writeAllOrNothing } from '../scripts/golden/blessGuard';

const ok = { ok: true, message: 'identical' }, bad = { ok: false, message: 'golden replay differs at tick 5' };

describe('the bless guard', () => {
  it('allows a version bump when the re-run comparison is ok', () => {
    expect(blessRefusal({ storedVersions: [35, 35, 35], currentVersion: 36, verify: () => ok })).toBeUndefined();
  });
  it('refuses a version bump when the comparison is not ok, quoting why', () => {
    expect(blessRefusal({ storedVersions: [35, 35, 35], currentVersion: 36, verify: () => bad })).toMatch(/differs at tick 5/);
  });
  it('refuses a version bump with no baseline (the comparison reports it)', () => {
    expect(blessRefusal({ storedVersions: [35, 35, 35], currentVersion: 36, verify: () => ({ ok: false, message: 'no baseline' }) })).toMatch(/no baseline/);
  });
  it('allows a same-version bless without running the comparison', () => {
    const verify = vi.fn(() => bad);
    expect(blessRefusal({ storedVersions: [36, 36, 36], currentVersion: 36, verify })).toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
  });
  it('a mixed state, one golden already at the new version and another artifact not, still requires the comparison', () => {
    for (const storedVersions of [[37, 36, 36], [37, 37, 36], [36, 37, 37], [37, undefined, 36]]) {
      const verify = vi.fn(() => bad);
      expect(blessRefusal({ storedVersions, currentVersion: 37, verify }), JSON.stringify(storedVersions)).toMatch(/36 → 37/);
      expect(verify).toHaveBeenCalledTimes(1);
    }
    expect(blessRefusal({ storedVersions: [37, 37, undefined], currentVersion: 37, verify: () => bad })).toBeUndefined();
  });
  it('a version-only re-bless always runs the comparison', () => {
    expect(blessRefusal({ storedVersions: [35], currentVersion: 36, verify: () => bad, versionOnly: true })).toBeDefined();
    expect(blessRefusal({ storedVersions: [35], currentVersion: 36, verify: () => ok, versionOnly: true })).toBeUndefined();
  });
});

describe('writing the pinned artifacts', () => {
  it('stages every artifact before writing any, in order', () => {
    const order: string[] = [], write = vi.fn((path: string) => { order.push(`write ${path}`); });
    const stage = (path: string) => ({ path, stage: () => { order.push(`stage ${path}`); return { content: path.toUpperCase(), message: `blessed ${path}` }; } });
    expect(writeAllOrNothing([stage('a'), stage('b'), stage('c')], write)).toEqual(['blessed a', 'blessed b', 'blessed c']);
    expect(order).toEqual(['stage a', 'stage b', 'stage c', 'write a', 'write b', 'write c']);
    expect(write).toHaveBeenCalledWith('b', 'B');
  });
  it('a failure while staging the third artifact writes nothing', () => {
    const write = vi.fn();
    const good = (path: string) => ({ path, stage: () => ({ content: 'x', message: path }) });
    expect(() => writeAllOrNothing([good('basic'), good('duel'), { path: 'fixture', stage: () => { throw new Error('not version-only: sample 3'); } }], write)).toThrow(/not version-only/);
    expect(write).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run tests/blessGuard.test.ts`
Expected: FAIL: writeAllOrNothing is not exported yet, and blessRefusal still reads one stored version.

Replace the whole of `scripts/golden/blessGuard.ts` with:

```ts
// The guards that keep `npm run bless` honest. This file is pure; scripts/bless-golden.ts injects the comparison and
// the file system.
// - blessRefusal: a SIM_VERSION change is in progress whenever ANY pinned artifact's stored version differs from the
//   current one (a half-finished earlier bless can leave them mixed). Then the per-tick canonical comparison
//   (versionOnly.ts) is re-run, so nothing from an earlier run is trusted, and the bless is allowed only when it is ok.
// - writeAllOrNothing: every artifact is staged (computed and validated) in memory before any file is written, so a
//   failure while staging any of them writes none.
import type { VersionOnlyResult } from './versionOnly';

/**
 * Returns undefined to allow the bless, or the refusal message. A bump (`versionOnly`, or any stored version different
 * from the current one) runs `verify` and is allowed only when it returns ok; a same-version bless (every artifact
 * already at the current version: a deliberate gameplay change) never calls it. An absent artifact (undefined) does
 * not count as a bump.
 */
export function blessRefusal(opts: { storedVersions: readonly (number | undefined)[]; currentVersion: number; verify: () => VersionOnlyResult; versionOnly?: boolean }): string | undefined {
  const { storedVersions, currentVersion, verify, versionOnly } = opts;
  const stale = storedVersions.filter((v): v is number => v !== undefined && v !== currentVersion);
  if (versionOnly !== true && stale.length === 0) return undefined;
  const r = verify();
  if (r.ok) return undefined;
  return `refusing to bless a SIM_VERSION bump (${[...new Set(stale)].join(', ') || '?'} → ${currentVersion}): the per-tick canonical comparison failed.\n${r.message}`;
}

export interface StagedArtifact { path: string; stage(): { content: string; message: string } }

/** Stage every artifact first; write them only when all staged. Returns the messages in order. */
export function writeAllOrNothing(artifacts: readonly StagedArtifact[], write: (path: string, content: string) => void): string[] {
  const staged = artifacts.map((a) => ({ path: a.path, ...a.stage() }));
  for (const s of staged) write(s.path, s.content);
  return staged.map((s) => s.message);
}
```

Run: `npx vitest run tests/blessGuard.test.ts`
Expected: PASS, 8 tests in 1 file, including "a mixed state, one golden already at the new version and another artifact not, still requires the comparison" and "a failure while staging the third artifact writes nothing".

- [ ] **Step 2b: Write the historical check and the determinism fixture's staging**

Create `scripts/golden/baselineCheck.ts`:

```ts
// The opt-in historical check of tests/fixtures/net1a-baseline.json (engine refactor spec §7, R-0). The fixture pins
// 19 gameplay scenarios recorded at SIM 34 as named projections; it is never re-blessed. It left the default suite in
// R-0: its role as the independent gameplay oracle passes to the per-tick canonical trace (versionOnly.ts) and, from
// R-4, to the pre-refactor oracle. Run it with `npm run bless -- --baseline`, which writes nothing.
import { readFileSync } from 'node:fs';
import starter from '../../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import type { ReplayV2 } from '../../src/renderer/src/sim/replay';
import { firstDifference, projectGameplay, runScenario, scenarios } from '../../tests/helpers/gameplayTrace';
import { runSemanticReplay } from '../../tests/helpers/semanticReplay';

const BASELINE = 'tests/fixtures/net1a-baseline.json';
const GOLDEN = 'tests/golden/basic.json';
type Observation = { tick: number; state: Record<string, unknown> };
type Scenario = ReturnType<typeof runScenario>;

export interface BaselineResult { ok: boolean; message: string }

/** Every pinned scenario re-run against its stored observations, plus the semantic golden replay's 60-tick projections. */
export function checkNet1aBaseline(contentDigest: string): BaselineResult {
  const pinned = JSON.parse(readFileSync(BASELINE, 'utf8')) as { scenarios: Scenario[] }, problems: string[] = [];
  for (const spec of scenarios) {
    const expected = pinned.scenarios.find((s) => s.name === spec.name);
    if (!expected) { problems.push(`${spec.name}: missing from ${BASELINE}`); continue; }
    const actual = runScenario(spec, contentDigest), diff = firstDifference(expected.observations, actual.observations);
    if (diff) { problems.push(`${spec.name}: first difference at tick ${diff.tick}, ${diff.field}`); continue; }
    // The pinned summary records SIM 34; only that version field may differ.
    const rest = firstDifference({ ...expected, summary: { ...expected.summary, simVersion: 0 } }, { ...actual, summary: { ...actual.summary, simVersion: 0 } });
    if (rest) problems.push(`${spec.name}: ${rest.field || 'scenario'} differs at tick ${rest.tick}`);
  }
  const replay = (JSON.parse(readFileSync(GOLDEN, 'utf8')) as { replay: ReplayV2 }).replay;
  replay.initial.header.contentDigest = replay.init.contentDigest = contentDigest;
  replay.checkpoint.init.contentDigest = replay.checkpoint.snapshot.header.contentDigest = contentDigest;
  const observations: Observation[] = [];
  try {
    runSemanticReplay(parseShip(starter), replay, 60, contentDigest, (state) => observations.push({ tick: state.tick, state: projectGameplay(state) }));
    const golden = pinned.scenarios.find((s) => s.name === 'golden-2026-four-7200')!.observations.filter((o) => o.tick > 0);
    const diff = firstDifference(golden, observations);
    if (diff) problems.push(`${GOLDEN} replay: first difference at tick ${diff.tick}, ${diff.field}`);
  } catch (error) { problems.push(`${GOLDEN} replay: ${String(error)}`); }
  if (problems.length > 0) return { ok: false, message: `net1a-baseline differs at sim version ${SIM_VERSION}:\n${problems.join('\n')}` };
  return { ok: true, message: `net1a-baseline: ${scenarios.length} scenarios and the golden replay's ${observations.length} projections match (sim version ${SIM_VERSION})` };
}
```

Create `scripts/determinism/bless.ts`:

```ts
// The determinism fixture's part of `npm run bless` (engine refactor spec §7, R-0: one command blesses every pinned
// artifact). tests/fixtures/determinism-v2.json keeps its checked-in schedules; only its expectations are rewritten.
// - Same SIM_VERSION (a deliberate gameplay change, like a same-version golden bless): re-execute the schedules and
//   write the new expectations.
// - A SIM_VERSION bump: move every recorded checkpoint to the current version (init, snapshot header and the
//   snapshot's flattened version value), re-execute, and refuse unless the new expectations differ from the old only
//   in the version: every canonical field but `$simVersion`, every sample's place and every result/event boundary
//   unchanged. The caller (scripts/bless-golden.ts) has already passed the per-tick canonical guard for a bump.
// Nothing here writes: the caller stages this with the goldens and writes all three only when every one is valid.
import { readFileSync } from 'node:fs';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { executeFixture, packFixture, unpackFixture, type Fixture } from './fixture';
import { firstDifference } from './protocol';

export const DETERMINISM_FIXTURE = 'tests/fixtures/determinism-v2.json';

/** The sim version the fixture's checkpoints record (they must all agree). */
export function fixtureVersion(fixture: Fixture): number {
  const from = fixture.runs[0]!.checkpoint.init.simVersion;
  for (const run of fixture.runs) {
    const cp = run.checkpoint;
    if (cp.init.simVersion !== from || cp.snapshot.header.simVersion !== from || cp.snapshot.values[0] !== from) throw Error(`${cp.init.runId}: mixed sim versions`);
  }
  return from;
}

/** The sim version the stored fixture records. */
export function storedFixtureVersion(): number {
  return fixtureVersion(unpackFixture(JSON.parse(readFileSync(DETERMINISM_FIXTURE, 'utf8')) as Fixture));
}

/** The fixture with re-executed expectations, as file content, and its summary line. Throws on a bump that is not version-only. */
export function stageDeterminismFixture(contentDigest: string): { content: string; message: string } {
  const old = unpackFixture(JSON.parse(readFileSync(DETERMINISM_FIXTURE, 'utf8')) as Fixture), from = fixtureVersion(old);
  const fixture = structuredClone(old);
  for (const run of fixture.runs) {
    const cp = run.checkpoint;
    cp.init.simVersion = cp.snapshot.header.simVersion = SIM_VERSION;
    cp.snapshot.values[0] = SIM_VERSION;
  }
  fixture.expected = executeFixture(fixture, contentDigest, false);
  const was = old.expected, now = fixture.expected;
  if (from !== SIM_VERSION) {
    if (was.samples.length !== now.samples.length) throw Error(`sample count changed: ${was.samples.length} → ${now.samples.length}`);
    now.samples.forEach((s, i) => {
      const o = was.samples[i]!, { $simVersion: a, ...oldFields } = o.fields, { $simVersion: b, ...newFields } = s.fields;
      const place = firstDifference({ ...o, hash: '', fields: oldFields }, { ...s, hash: '', fields: newFields }, `sample ${i}`);
      if (place) throw Error(`not version-only: ${place}`);
      if (a !== from || b !== SIM_VERSION) throw Error(`sample ${i}: $simVersion ${String(a)} → ${String(b)}`);
    });
    const boundaries = firstDifference(was.boundaries, now.boundaries, 'boundaries');
    if (boundaries) throw Error(`not version-only: ${boundaries}`);
  }
  return { content: JSON.stringify(packFixture(fixture)), message: from === SIM_VERSION
    ? `blessed ${DETERMINISM_FIXTURE}: sim version ${SIM_VERSION}, ${now.samples.length} samples and ${now.boundaries.length} boundaries re-executed`
    : `blessed ${DETERMINISM_FIXTURE}: sim version ${from} → ${SIM_VERSION}, ${now.samples.length} samples and ${now.boundaries.length} boundaries unchanged apart from the version and hashes` };
}
```

- [ ] **Step 3: Make `npm run bless` the one command, and add the trace's `same` mode**

Replace the whole of `scripts/bless-golden.ts` with:

```ts
// `npm run bless`: the one command that regenerates every pinned artifact (engine refactor spec §7, R-0):
//   tests/golden/basic.json (the sector golden), tests/golden/duel-1.json (the duel golden) and the expectations of
//   tests/fixtures/determinism-v2.json. If ANY of them is stored at a version other than the current SIM_VERSION, a
//   version change is in progress, and the bless is refused unless the per-tick canonical comparison
//   (scripts/golden/versionOnly.ts, re-run here) proves it version-only; a same-version bless is a deliberate gameplay
//   change. All three are computed and validated in memory first and written only when every one is staged, so a
//   failure writes nothing and a re-run still sees the old versions. tests/fixtures/net1a-baseline.json is a retired
//   historical oracle and is never written: `npm run bless -- --baseline` only checks it and writes nothing.
//   tests/fixtures/net1a-gates.json is never written.
import { computeContentDigest } from '../build/contentDigest';
import { writeFileSync, mkdirSync, existsSync, openSync, readSync, closeSync, readFileSync } from 'node:fs';
import { blessRefusal, writeAllOrNothing } from './golden/blessGuard';
import { verifyVersionOnly } from './golden/versionOnly';
import { checkNet1aBaseline } from './golden/baselineCheck';
import { DETERMINISM_FIXTURE, stageDeterminismFixture, storedFixtureVersion } from './determinism/bless';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { runSemanticReplay } from '../tests/helpers/semanticReplay';
import { scriptedSemanticReplay } from '../tests/helpers/script';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { DUEL_GOLDEN, DUEL_GOLDEN_EVERY, DUEL_GOLDEN_SEED, runDuel } from '../tests/helpers/scriptedDuel';

const BASIC = 'tests/golden/basic.json';
const contentDigest = computeContentDigest(process.cwd());
if (process.argv.includes('--baseline')) {
  const r = checkNet1aBaseline(contentDigest);
  if (!r.ok) { console.error(r.message); process.exit(1); }
  console.log(r.message);
  process.exit(0);
}

/** basic.json is large; its simVersion is in the first bytes. */
function basicVersion(): number | undefined {
  if (!existsSync(BASIC)) return undefined;
  const fd = openSync(BASIC, 'r'), buf = Buffer.alloc(4096);
  try { return Number(/"simVersion":(\d+)/.exec(buf.toString('utf8', 0, readSync(fd, buf, 0, buf.length, 0)))?.[1] ?? NaN) || undefined; } finally { closeSync(fd); }
}
const duelVersion = (): number | undefined => existsSync(DUEL_GOLDEN) ? (JSON.parse(readFileSync(DUEL_GOLDEN, 'utf8')) as { simVersion: number }).simVersion : undefined;
const stored = [basicVersion(), duelVersion(), existsSync(DETERMINISM_FIXTURE) ? storedFixtureVersion() : undefined];
const refusal = blessRefusal({ storedVersions: stored, currentVersion: SIM_VERSION, verify: verifyVersionOnly });
if (refusal) { console.error(refusal); process.exit(1); }

const messages = writeAllOrNothing([
  { path: BASIC, stage() {
    const replay = scriptedSemanticReplay(2026, 4, 60 * 120, contentDigest);   // 2 minutes, 4 players
    const { hashes, finalHash } = runSemanticReplay(parseShip(starter), replay, 60, contentDigest);
    return { content: JSON.stringify({ replay, hashes, finalHash }), message: `blessed ${BASIC}: ${hashes.length} checkpoints, final ${finalHash}` };
  } },
  // The duel golden (H-0c-ii-a spec §6): the scripted pair at one seed, a hash every DUEL_GOLDEN_EVERY ticks.
  { path: DUEL_GOLDEN, stage() {
    const duel = runDuel(DUEL_GOLDEN_SEED, 'scripted', undefined, DUEL_GOLDEN_EVERY), t = duel.telemetry;
    return { content: JSON.stringify({ simVersion: SIM_VERSION, seed: DUEL_GOLDEN_SEED, outcome: t.outcome, ticks: t.ticks, finalHash: duel.finalHash, every: DUEL_GOLDEN_EVERY, hashes: duel.hashes }, null, 2) + '\n',
      message: `blessed ${DUEL_GOLDEN}: ${duel.hashes.length} checkpoints, ${t.ticks} ticks, outcome ${t.outcome}, final ${duel.finalHash}` };
  } },
  // The determinism fixture's expectations (version-only checked on a bump).
  { path: DETERMINISM_FIXTURE, stage: () => stageDeterminismFixture(contentDigest) }
], (path, content) => { mkdirSync('tests/golden', { recursive: true }); writeFileSync(path, content); });
for (const line of messages) console.log(line);
```

Replace the whole of `scripts/golden/versionOnly.ts` with:

```ts
// Version-independent per-tick comparison for a SIM_VERSION bump (H-0c-ii-a plan, Task 4). The sector goldens hash
// SIM_VERSION, and the independent gameplay checks sample only every 60 ticks, so a bump alone cannot prove that
// nothing between samples changed. This replays every sector replay the goldens record, hashing the canonical
// flattened state at EVERY tick with the version value (flatten index 0) zeroed:
//   - the golden replay `npm run bless` writes (scriptedSemanticReplay(2026, 4, 7200) on the starter layout);
//   - every schedule of tests/fixtures/determinism-v2.json (its checkpoints moved to the current SIM_VERSION first).
// No side effects on import. canonical-trace.ts is the CLI; bless-golden.ts calls verifyVersionOnly() right before it
// writes. verifyUnchanged() is the same comparison for a refactor that keeps SIM_VERSION (engine refactor R-1): the
// per-tick canonical trace must be identical at the same version.
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeContentDigest } from '../../build/contentDigest';
import { hashF64 } from '../../src/shared/hash';
import { flatten } from '../../src/renderer/src/sim/flatten';
import starter from '../../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import type { SimState } from '../../src/renderer/src/sim/state';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { runSemanticReplay } from '../../tests/helpers/semanticReplay';
import { scriptedSemanticReplay } from '../../tests/helpers/script';
import { actions, coreFor, unpackFixture, type Fixture } from '../determinism/fixture';

export const dir = join(tmpdir(), 'ftlite-canonical-trace');
export const TRACE_FILE = join(dir, 'trace.json');
export const basicCopy = join(dir, 'basic-before.json');
const FIXTURE = 'tests/fixtures/determinism-v2.json';
export interface Trace { simVersion: number; golden: string[]; determinism: Record<string, string[]> }
export interface VersionOnlyResult { ok: boolean; message: string }

/** The canonical hash of a state with the version value zeroed. */
function canonical(state: SimState): string {
  const v = Float64Array.from(flatten(state));
  v[0] = 0;
  return hashF64(v);
}

export function trace(): Trace {
  const digest = computeContentDigest(process.cwd()), golden: string[] = [];
  runSemanticReplay(parseShip(starter), scriptedSemanticReplay(2026, 4, 60 * 120, digest), 1, digest, (state) => golden.push(canonical(state)));
  const fixture = unpackFixture(JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture), determinism: Record<string, string[]> = {};
  for (const run of fixture.runs) {
    const cp = run.checkpoint, out: string[] = [];
    cp.init.simVersion = cp.snapshot.header.simVersion = SIM_VERSION;
    cp.snapshot.values[0] = SIM_VERSION;
    const h = coreFor(run, digest);
    try {
      for (const action of actions(run)) {
        h.core.replayFrame({ tick: h.state.tick, eventSequenceBefore: h.core.cursors().eventSequence, action, results: [], events: [] });
        if (action.kind === 'tick') out.push(canonical(h.state));
      }
    } finally { h.core.dispose(); }
    determinism[cp.init.runId] = out;
  }
  return { simVersion: SIM_VERSION, golden, determinism };
}

export const counts = (t: Trace): string => {
  const runs = Object.values(t.determinism);
  return `golden ${t.golden.length} ticks, determinism-v2 ${runs.reduce((n, r) => n + r.length, 0)} ticks in ${runs.length} runs`;
};

export function firstDiff(a: readonly string[] | undefined, b: readonly string[] | undefined): number {
  if (!a || !b) return 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i;
  return -1;
}

/**
 * Re-run the per-tick comparison now: the pre-bump baseline in the temp folder against a fresh trace of the current
 * code. Not ok when there is no baseline, when the baseline is already at the current SIM_VERSION (stale), or when any
 * tick differs. Nothing is trusted from an earlier run.
 */
export function verifyVersionOnly(): VersionOnlyResult {
  if (!existsSync(TRACE_FILE)) return { ok: false, message: `no baseline at ${TRACE_FILE}: run \`canonical-trace.ts baseline\` before the bump` };
  const was = JSON.parse(readFileSync(TRACE_FILE, 'utf8')) as Trace, now = trace();
  if (was.simVersion === now.simVersion) return { ok: false, message: `the baseline is already at sim version ${now.simVersion}: it is stale or SIM_VERSION was not bumped` };
  const problems = differences(was, now);
  if (problems.length > 0) return { ok: false, message: `NOT version-only, bless nothing:\n${problems.join('\n')}` };
  return { ok: true, message: `per-tick canonical trace identical, sim version ${was.simVersion} → ${now.simVersion}: ${counts(now)}` };
}

function differences(was: Trace, now: Trace): string[] {
  const problems: string[] = [];
  const g = firstDiff(was.golden, now.golden);
  if (g >= 0) problems.push(`golden replay differs at tick ${g + 1}`);
  for (const runId of new Set([...Object.keys(was.determinism), ...Object.keys(now.determinism)])) {
    const k = firstDiff(was.determinism[runId], now.determinism[runId]);
    if (k >= 0) problems.push(`determinism-v2 ${runId} differs at its tick ${k + 1}`);
  }
  return problems;
}

/**
 * The refactor check: the baseline in the temp folder, recorded before a change that keeps SIM_VERSION, against a
 * fresh trace of the current code. Not ok when there is no baseline, when the version moved, or when any tick differs.
 */
export function verifyUnchanged(): VersionOnlyResult {
  if (!existsSync(TRACE_FILE)) return { ok: false, message: `no baseline at ${TRACE_FILE}: run \`canonical-trace.ts baseline\` before the change` };
  const was = JSON.parse(readFileSync(TRACE_FILE, 'utf8')) as Trace, now = trace();
  if (was.simVersion !== now.simVersion) return { ok: false, message: `the baseline is at sim version ${was.simVersion}, the code at ${now.simVersion}: use \`check\` for a bump` };
  const problems = differences(was, now);
  if (problems.length > 0) return { ok: false, message: `canonical trace CHANGED:\n${problems.join('\n')}` };
  return { ok: true, message: `per-tick canonical trace unchanged at sim version ${now.simVersion}: ${counts(now)}` };
}
```

Replace the whole of `scripts/golden/canonical-trace.ts` with:

```ts
// CLI for the version-independent per-tick check on a SIM_VERSION bump (H-0c-ii-a plan, Task 4). The comparison itself
// is verifyVersionOnly() in versionOnly.ts, which `npm run bless` re-runs right before it writes.
// Usage (no shell features needed; the temp folder comes from os.tmpdir()):
//   npx tsx scripts/golden/canonical-trace.ts baseline   before the bump: records the trace and a copy of basic.json
//   npx tsx scripts/golden/canonical-trace.ts check      after the bump, before any bless: exits 1 unless identical
//   npx tsx scripts/golden/canonical-trace.ts golden     after `npm run bless`: basic.json differs only in version,
//                                                        content digest and hashes
//   npx tsx scripts/golden/canonical-trace.ts same       after a refactor that keeps SIM_VERSION: exits 1 unless the
//                                                        per-tick trace equals the baseline (engine refactor R-1)
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basicCopy, counts, dir, trace, TRACE_FILE, verifyUnchanged, verifyVersionOnly } from './versionOnly';

const GOLDEN = 'tests/golden/basic.json';

const mode = process.argv[2];
if (mode === 'baseline') {
  mkdirSync(dir, { recursive: true });
  const t = trace();
  writeFileSync(TRACE_FILE, JSON.stringify(t));
  copyFileSync(GOLDEN, basicCopy);
  console.log(`baseline at sim version ${t.simVersion}: ${counts(t)}; written to ${TRACE_FILE}`);
} else if (mode === 'check') {
  const r = verifyVersionOnly();
  if (!r.ok) { console.error(r.message); process.exit(1); }
  console.log(r.message);
} else if (mode === 'same') {
  const r = verifyUnchanged();
  if (!r.ok) { console.error(r.message); process.exit(1); }
  console.log(r.message);
} else if (mode === 'golden') {
  if (!existsSync(basicCopy)) throw Error(`no copy of ${GOLDEN} at ${basicCopy}: run the baseline before the bump`);
  const a: unknown = JSON.parse(readFileSync(basicCopy, 'utf8')), b: unknown = JSON.parse(readFileSync(GOLDEN, 'utf8')), diffs: string[] = [];
  const walk = (x: unknown, y: unknown, p: string): void => {
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], `${p}.${k}`);
      return;
    }
    diffs.push(p);
  };
  walk(a, b, '');
  const other = diffs.filter((p) => !/(simVersion|contentDigest|\.values\.0|\.hash|^\.hashes\.\d+|^\.finalHash)$/.test(p));
  console.log(`${GOLDEN}: ${diffs.length} leaves differ, ${other.length} outside version, digest and hashes`);
  if (other.length > 0) { console.error(other.slice(0, 10).join('\n')); process.exit(1); }
} else throw Error('usage: npx tsx scripts/golden/canonical-trace.ts baseline|check|golden|same');
```

```bash
git rm -q scripts/determinism/rebless-version.ts
```

- [ ] **Step 4: Run the historical check (it writes nothing)**

Run: `npm run bless -- --baseline`
Expected: the last line is `net1a-baseline: 19 scenarios and the golden replay's 120 projections match (sim version 36)`, exit 0 (about 4 s).

- [ ] **Step 5: Run the touched tests and typecheck**

Run: `npx vitest run tests/netParity.test.ts tests/golden.test.ts tests/blessGuard.test.ts tests/determinismHarness.test.ts`
Expected: PASS, 30 tests in 4 files.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/golden/baselineCheck.ts scripts/determinism/bless.ts scripts/bless-golden.ts scripts/golden/versionOnly.ts scripts/golden/canonical-trace.ts scripts/golden/blessGuard.ts tests/blessGuard.test.ts tests/netParity.test.ts tests/golden.test.ts
git commit -q -m "build(golden): one bless command for every pinned artifact; net1a-baseline retired to --baseline (engine refactor R-0)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 3: `SIM_VERSION` 37 through the guarded version-only re-bless

**Files:**
- Modify (whole file): `src/renderer/src/sim/tuning.ts`
- Generated: `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/fixtures/determinism-v2.json`

**Interfaces:**
- Produces: `SIM_VERSION = 37`.

- [ ] **Step 1: Record the per-tick canonical trace before the bump**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 36: golden 7200 ticks, determinism-v2 108000 ticks in 19 runs` and the trace file's path, exit 0 (about 10 s).

- [ ] **Step 2: Bump the version**

Replace the whole of `src/renderer/src/sim/tuning.ts` with:

```ts
// Every gameplay constant. All are hypotheses until playtested (spec §13).
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const HAZARD_EVERY = 5;                 // hazards run every 5th tick (12 Hz)
export const HAZARD_DT = DT * HAZARD_EVERY;
export const O2_K = 6;                         // oxygen diffusion rate (per second, per unit conductance)
export const SIM_VERSION = 37;
export const TELEMETRY_KEEP = 50;   // game-over records kept in localStorage (spec 4-ii section 7)
export const REPAIR_FIRE = 0, REPAIR_BREACH = 1, REPAIR_POWER = 2;   // indices into telemetry.repairs (spec 4-ii section 5)
export const ACCEPTANCE_MINUTES = 20;   // default soak length for npm run acceptance
export const HULL_MAX = 100;
export const HEALTH_MAX = 100;
export const CREW_SPEED = 4;      // tiles per second
export const CREW_HALF = 0.3;     // AABB half-extent in tiles (must stay < 0.5, see ship schema reachability)
export const MOVE_EPS = 1e-6;
export const DOOR_ZONE = 1.0;          // Chebyshev distance (tiles) from a door tile's centre that holds it open
export const DOOR_CLOSE_DELAY = 1.0;   // seconds after the zone is clear
export const PASSAGE_OPEN = 1;
export const PASSAGE_CLOSED = 0.05;
export const PASSAGE_SEALED = 0.01;       // lowered further by Doors skill in increment 3
export const PASSAGE_BREACH = 0.1;        // a breach is a hole, not an open door (12-tile room half-life ~14 s)
export const AIRLOCK_PASSAGE = 3 * PASSAGE_OPEN;  // an open airlock is a wide hatch to vacuum: at PASSAGE_OPEN the leak of three closed doors held a burning room at 10% and the fire never died; 3 is the largest value that leaves the cutter's kEff unchanged (spec Demo-vii amendment 12)
export const BREATH_RATE = 0.01;          // oxygen units per second per living crew member
export const FIRE_O2_RATE = 0.02;         // oxygen units per second per unit of fire intensity
export const O2_SNAP_EPS = 1e-9;
export const FIRE_GROW_FRAC = 0.2;     // fire grows while room oxygen fraction is above this
export const FIRE_SHRINK_FRAC = 0.1;   // fire shrinks while below this (B < A: no flicker)
export const FIRE_GROW_RATE = 0.5;     // intensity per second
export const FIRE_SHRINK_RATE = 1.0;   // intensity per second
export const FIRE_CAP = 16;
export const FIRE_START = 1;
export const FIRE_SPREAD_P = 0.0012;   // per hazard tick per burning edge at passage 1 (~7% per 5 s; spec Demo-vi section 3, was 0.0027)
export const FIRE_DAMAGE = 3;           // health per second while in a burning room (the Medbay heals, increment 2a-i)
export const O2_DAMAGE = 6;             // health per second below SUFFOCATE_FRAC
export const SUFFOCATE_FRAC = 0.1;
export const BLEEDOUT_TIME = 30;        // seconds Downed before Dead
export const BLEED_HAZARD_MULT = 2;     // bleed-out speed in fire or low oxygen
export const REVIVE_HEALTH_FRAC = 0.3;
export const REACH = 1.5;               // tiles from crew centre to the nearest point of the target tile
export const REPAIR_TIME_FIRE = 6;      // seconds for one repairer
export const REPAIR_TIME_BREACH = 8;
export const REVIVE_TIME = 4;
export const SPAWN_FIRST = 15;          // seconds until the first spawned hazard once awake (a hazard gate; the game's first jump re-arms the director, spec Loop-i section 4b)
export const SPAWN_INTERVAL = 30;       // seconds between spawned hazards
export const SPAWN_JITTER = 0.2;        // ±fraction of the interval
export const SPAWN_CAP = 3;             // max simultaneous fires + breaches + failed stations

// Power (increment 2a-i)
export const REACTOR_CAPACITY = 10;                 // bars, including Engineering's reserved one
export const STATION_MAX = [2, 3, 2, 1, 3, 2, 1] as const;   // by StationKind: Nav, Wpn, Sci, Eng, LS, Med, Doors (sum 14 > capacity: choices are forced)

export const OUTPUT_SLOW = 0.5, OUTPUT_FAST = 1.0;   // station output multiplier at skill 0..10 via lerp((skill + 10) / 20)
export const REPAIR_TIME_POWER = 6;                 // seconds for one repairer
export const STICK_EDGE_THRESHOLD = 0.5;
export const STICK_REPEAT_TICKS = 8;                // ~130 ms

// Life Support and Medbay (increment 2a-i)
export const INJECT_FRAC = 0.06;          // per second of room volume at full output (starter allocation, unmanned: 2/3 x 0.75 x 0.06 = 0.03, the old stub rate)
export const LS_SEATED_BONUS = 0.5;
export const MEDBAY_HEAL = 4;             // health per second at full output
export const MEDBAY_SEATED_BONUS = 0.5;
export const SPAWN_WEIGHTS = { fire: 1, breach: 1, power: 1, debris: 2 } as const;   // intervals in this order (total 5; fire 2 -> 1, spec Demo-vi section 3)
export const FIRE_SPAWN_CAP = 2;        // the director picks no fire while this many rooms burn; spread, overheats and impacts are not capped (spec Demo-vi section 3)

// Debris (increment 2a-ii)
export const DEBRIS_SLOTS = 8;                        // never reached: SPAWN_CAP counts in-flight debris
export const DEBRIS_FLIGHT = 30, DEBRIS_FLIGHT_JITTER = 6;             // seconds from spawn to impact, +/- jitter
export const SCIENCE_LEAD_UNMANNED = 4;               // seconds of warning with Science unoccupied or offline
export const SCIENCE_LEAD_BASE = 12, SCIENCE_LEAD_SCALE = 16;          // seated lead = base + scale x output (18 s at level 1, 24 s at level 2, skill 0)
export const BEAM_CHARGE_TIME = 4;                    // seconds at output 1 (8 s at level 2, skill 0, on the Skiff; spec Demo-xiii section 4: was 6, a 12 s Pulse)
export const EVADE_BASE = 0.20, EVADE_SCALE = 0.40;                    // evasion chance = base + scale x output
export const DEBRIS_HULL_DAMAGE = 8;                  // of HULL_MAX per impact
export const DEBRIS_CREW_DAMAGE = 20;                 // of HEALTH_MAX per Conscious crew member in the hit room

// Overdrive, heat and coolant (increment 2b-i)
export const STATION_OVERDRIVE = 1;                   // extra level above STATION_MAX for every kind except Engineering
export const HEAT_MAX = 240;                          // integer heat units
export const HEAT_RISE = 2;                           // per hazard tick while overdriven (10 s to max unassisted)
export const HEAT_COOL_UNIT = 1;                      // per coolant unit per hazard tick (1 unit: 20 s; 2 units: hold)
export const HEAT_COOL_IDLE = 4;                      // per hazard tick while not overdriven (5 s from max to 0)
export const COOLANT_POOL = 4;                        // shared units, never consumed
export const COOLANT_MAX_PER_STATION = 2;
export const OVERHEAT_FIRE_CHANCE = 0.5;              // rng.hazards, one draw per overheat
export const FIRE_HEAT_MAX = 6;                       // heat per hazard tick a full fire adds to each online station in its room (spec Demo-xi section 5)
export const FIRE_HEAT_FULL = 8;                      // fire intensity at which the fire heat is full; below it, proportional

// Scanning, frequencies and torpedoes (increment 2b-ii)
export const FREQ_COUNT = 3;
export const SCAN_TIME = 6;                           // seconds at output 1 (16 / 8 / 5.3 s at Science levels 1 / 2 / 3)
/** The Science officer's system scan (spec Demo-x-b section 3): seconds at output 1 (scaled by the output like SCAN_TIME); each finding's chance 0.45 + 0.15 per Science level, capped; the card lists the results for SCAN_RESULT_SECONDS, the notice for SCAN_NOTICE_SECONDS. */
export const SYSTEM_SCAN_TIME = 8, SCAN_DETECT_BASE = 0.45, SCAN_DETECT_SKILL = 0.15, SCAN_DETECT_MAX = 0.95, SCAN_RESULT_SECONDS = 10, SCAN_NOTICE_SECONDS = 5;
/** Hidden things drawn with the map (spec Demo-x-b section 3): an ambusher at an Empty (AMBUSH_CHANCE) or Event (AMBUSH_EVENT_CHANCE) beacon arrives AMBUSH_DELAY s after arrival, warned AMBUSH_WARN s ahead when undetected; a detected one arrives with its shields down FIRST_STRIKE_SECONDS. A cache at an Empty beacon (CACHE_CHANCE) holds CACHE_FUEL fuel (one loot draw below CACHE_FUEL_CHANCE) or scrapCache scrap. */
export const AMBUSH_CHANCE = 0.5, AMBUSH_EVENT_CHANCE = 0.2, AMBUSH_DELAY = 30, AMBUSH_WARN = 3, FIRST_STRIKE_SECONDS = 10, CACHE_CHANCE = 0.4, CACHE_FUEL = 2, CACHE_FUEL_CHANCE = 0.5;
/** A cache's scrap: 20 at depth 0 to 40 at the last depth (17), rounded. */
export const scrapCache = (depth: number): number => 20 + Math.round(20 * depth / (SECTORS * SECTOR_COLUMNS - 1));
export const BEAM_MATCH_BASE = 0.65, BEAM_MATCH_SCALE = 0.30;   // beam tuned to the object's frequency
export const BEAM_MISS_BASE = 0.15, BEAM_MISS_SCALE = 0.10;     // beam on any other frequency
export const TORP_HIT_BASE = 0.85, TORP_HIT_SCALE = 0.10;       // homing: frequency does not matter
export const TORP_START = 3, TORP_CAP = 6;
export const TORP_LOAD_TIME = 10;                     // seconds at output 1 to move one from stock into the tube
export const TORP_REGEN_TIME = 90;                    // seconds per stock unit while Weapons is online
/** Loot weapons (spec Loop-iii sections 1-3): two extra slots, the Weapons level each needs to charge, the ion disable, the kill drop chance (the table is in weaponDefs.ts). */
export const WEAPON_SLOTS = 2, ION_SECONDS = 10, WEAPON_DROP_CHANCE = 0.25;
export const SLOT_LEVELS: readonly number[] = [2, 4];

// Skills and XP (increment 3-i)
export const SKILL_COUNT = 6, SKILL_MAX = 10;
export const XP_THRESHOLDS = [0, 240, 600, 1080, 1680, 2400, 3240, 4200, 5280, 6480, 7800] as const;   // cumulative productive seconds per level
export const XP_RATE = 1;                              // per productive second
export const XP_PER_SHOT = 10;                         // Weapons, per shot taken
export const XP_PER_EVADE_ROLL = 5;                    // Navigation, per evasion roll
export const PRODUCTIVE_WINDOW_TICKS = 300;            // 5 s: a change keeps Engineering or Doors productive this long
export const REPAIR_SKILL_GAIN = 0.06;                 // repair speed 1 + gain x level
export const HEAT_COOL_SKILL = 0.2;                    // extra cooling per unit: floor(0.2 x level)
export const SEAL_SKILL = 0.05;                        // sealed passage x (1 - 0.05 x level)
export const BONUS_BAR_LEVELS = 4;                     // one bonus bar per 4 Engineering levels while seated

// Characters (increment 3-ii): Assets and Complications as multipliers on existing formulas
export const TRAIT_REPAIR_MULT = 1.25;        // Quick Hands
export const TRAIT_SLOW_SPEED = 0.85;         // Heavy Boots
export const TRAIT_FAST_SPEED = 1.2;          // Sprinter
export const TRAIT_COOLING_BONUS = 1;         // Cool Head, per coolant unit while seated at Engineering
export const TRAIT_FIRE_DAMAGE = 1.5;         // Flammable
export const TRAIT_O2_DAMAGE = 0.5;           // Iron Lungs
export const TRAIT_XP_MULT = 0.75;            // Slow Learner
export const TRAIT_BLEEDOUT = 0.6;            // Frail

// Director (increment 4-i)
export const STRESS_PERIOD = 5;                        // seconds between stress recomputes
export const STRESS_WEIGHTS = { fire: 0.25, breach: 0.30, power: 0.20, debris: 0.20, downed: 0.40, enemy: 0.30, boarder: 0.35 } as const;
export const STRESS_RISE = 0.5, STRESS_FALL = 0.15;    // smoothing per period; the fall is halved while a hazard is unattended
export const PEAK_LEVEL = 0.7, RELAX_LEVEL = 0.25;
export const SUSTAIN_SECONDS = 10, FADE_TIMEOUT = 30, RELAX_MIN = 30, RELAX_MAX = 60, STALL_SECONDS = 60;
export const SPAWN_INTERVAL_MIN = 10;                  // seconds; the escalated interval never goes below this
export const ESCALATION_RATE = 0.1;                    // per minute: interval = SPAWN_INTERVAL / (1 + rate x minutes)
export const CREW_INTERVAL_MULT = [1.5, 1.4, 1, 1] as const;   // spawn and fire interval multiplier by crew size, indexed players - 1 (spec Demo-i section 5)
export const SPAWN_CAP_MAX = 6, CAP_MINUTES = 4;        // +1 cap per 4 minutes up to the max
export const BUDGET_BASE = 3, BUDGET_GROWTH = 0.5;      // spawns per Build Up cycle: (base + growth x minutes) x playerScale
export const WEIGHT_MINUTES = 4;                       // power and debris weights grow every 4 minutes
export const ROUTE_BONUS = 2, ROUTE_IDLE_SECONDS = 60;  // routing toward consoles idle longer than this (3-4 players)
export const SINCE_CAP = 36000;                        // ticks: sinceProductive counters stop at 10 minutes

// Enemy ship (Combat-i)
export const ENCOUNTER_FIRST = 210, ENCOUNTER_MAX = 120;   // seconds: the hazard gates' first arrival (the game has no timed first enemy since Loop-i section 4b), stay (survival-gate fallback, spec Combat-i section 13; first pass 180); one enemy per node, no cooldown (spec Demo-vi section 2)
export const NEVER = 2147483647;                      // a tick that never comes: no further arrival at this node
export const ENCOUNTER_START = 8, ENCOUNTER_REWARD_HULL = 8, ENCOUNTER_BOOST = 4, ENCOUNTER_NOTICE_SECONDS = 8, ENCOUNTER_SPAWN_MULT = 2;   // spec Demo-vi: seconds from a Hazard-node arrival to contact, hull for a win, drive charge multiplier after a win, notice seconds, director interval multiplier while fighting
export const SHOT_BREACH_FIRST = 0.25;                 // a Shot impact tries a breach first below this roll, else a fire first (debris 0.5; spec Demo-vi section 3)
export const ENEMY_HULL = 100, ENEMY_FIRST_SHOT = 5;
export const ENEMY_FIRE_INTERVAL = 20, ENEMY_FIRE_MIN = 6, ENEMY_FIRE_JITTER = 0.2;   // escalation shares ESCALATION_RATE and CREW_INTERVAL_MULT (survival-gate fallback, spec Combat-ii section 13; first pass 15)
export const ENEMY_SHOTS_MAX = 1;                      // shots in flight at once (survival-gate fallback, spec Combat-i section 13; first pass 2)
export const ENEMY_SHOT_FLIGHT = 10, ENEMY_SHOT_JITTER = 2;   // seconds (debris is 30 +/- 6)
export const ENEMY_SHOT_HULL_DAMAGE = 10;              // spec Demo-xiii section 4, amendment 5: 4 -> 10, an ignored first enemy costs 20 hull a minute (the lever, not the interval); debris is 8; crew damage shared (survival-gate fallback, spec Combat-i section 13; first pass 6)
export const ENEMY_BEAM_BASE = 0.70, ENEMY_BEAM_SCALE = 0.30;   // engines-up chance 0.70 at output 0.5 after ENEMY_EVADE; was 0.55 before Combat-ii
export const ENEMY_BEAM_DAMAGE = 15, ENEMY_TORP_DAMAGE = 35;
/** FTL-style ship combat (spec Demo-i section 11.2): shield layers by column, recharge seconds per layer, hull per column, aim and console-failure chances, the flee at a hull fraction with its delay, the surrender bounty. */
export const ENEMY_SHIELD_LAYERS: readonly number[] = [1, 1, 1, 2, 2, 2, 2, 2], SHIELD_RECHARGE_TIME = 6, ENEMY_HULL_PER_COLUMN = 10, ENEMY_AIM_CHANCE = 0.6, ENEMY_SHOT_SYSTEM_CHANCE = 0.5;
export const ENEMY_SHOT_CREW_DAMAGE = 12;                // of HEALTH_MAX per Conscious crew member in the room a shot hits (survival-gate lever 2 after aimed shots, Demo-i gate (spec section 12); debris stays 20)
export const ENEMY_FLEE_FRAC = 0.25, ENEMY_FLEE_DELAY = 8;
/** The enemy interior (spec Demo-viii section 2b): rooms (0 Weapons, 1 Engines, 2 Shields, 3 Piloting, 4 Hold), the problem-draw thresholds after a hit, timer seconds, damage per second. */
export const ENEMY_ROOMS = 5, ENEMY_HIT_FIRE = 0.35, ENEMY_HIT_BREACH = 0.15, ENEMY_FIRE_SECONDS = 15, ENEMY_BREACH_SECONDS = 20, ENEMY_FIRE_HULL_DPS = 0.3, ENEMY_FIRE_SYS_DPS = 1.5, ENEMY_BREACH_HULL_DPS = 0.2;
export const ENEMY_SYS_HP = 30, ENEMY_SYS_REPAIR = 45, ENEMY_EVADE = 0.15;   // subsystem health, seconds to self-repair, beam threshold penalty while its Piloting is up (spec Combat-ii section 8; Demo-x-c section 4: Piloting, not the engines)

// Boarders (Boarders-i)
export const BOARDER_SLOTS = 4;
export const BOARDING_FIRST_SMALL = 330, ENCOUNTER_FIRST_SMALL = 270;   // seconds: the hazard gates' first party / first encounter for crews of two or fewer (spec Demo-i section 5; the game itself waits for the first jump, Loop-i section 4b)
export const BOARDING_FIRST = 240, BOARDING_COOLDOWN = 180, BOARDING_JITTER = 0.2;   // seconds: the hazard gates' first party, gap after the last kill (x jitter)
export const BOARDING_PARTY = 2;
export const BOARDER_O2_DPS = O2_DAMAGE, BOARDER_FIRE_DPS = FIRE_DAMAGE;                   // boarders suffocate and burn like the crew, below SUFFOCATE_FRAC (spec Demo-ix section 1)
export const BOARDER_HEALTH = 60, BOARDER_DPS = 6;                                   // health; damage per second to the focused crew member before Combat defence
export const CREW_MELEE_DPS = 8, COMBAT_GAIN = 0.06, COMBAT_DEFENCE = 0.04;          // crew damage per second at level 0; x(1 + gain x level); damage taken x(1 - defence x level)
export const BOARDER_MOVE = 8, BOARDER_SABOTAGE = 15;                                // seconds between moves while alone; seconds alone with an online console before it fails
export const XP_PER_KILL = 20;                                                       // Combat XP to the killer
export const HEALTH_EPS = 1e-9;                                                      // health below this snaps to 0 (melee arithmetic, spec Boarders-i section 2)

// Sector map and jumps (Run-i)
export const EDGE_CHANCE = 0.5;                                                     // chance of each candidate forward edge
/** Sectors (spec Loop-i section 1): sectors per run, columns per sector map (0 the arrival beacon, the last the exit), beacons per middle column, the node index stride (column x 4 + node). */
export const SECTORS = 3, SECTOR_COLUMNS = 6, MIDDLE_MIN = 2, MIDDLE_MAX = 4, NODE_STRIDE = 4;
/** Fuel (spec Loop-i section 2): the start, one per jump; the shop's +2 for 12 scrap; Wait for help's seconds, chance and gift; a kill gives KILL_FUEL_MIN + nextInt(loot, 2), a cleared field FIELD_FUEL. */
export const FUEL_START = 8, FUEL_COST = 12, SHOP_FUEL = 2, WAIT_SECONDS = 20, WAIT_FUEL_CHANCE = 0.6, WAIT_FUEL = 2, KILL_FUEL_MIN = 1, FIELD_FUEL = 1;
/** The Pursuit (spec Loop-i section 3): the fleet front's column on arrival in a sector and its step per jump and per wait; the elite pursuit enemy's hull and fire-interval multipliers. */
export const PURSUIT_START = -1.5, PURSUIT_STEP = 0.75, PURSUIT_HULL_MULT = 1.5, PURSUIT_FIRE_MULT = 0.75;
export const WARDEN_HULL_MULT = 1.5, WARDEN_FIRE_MULT = 0.7, WARDEN_SHIELD_EXTRA = 1;   // the Warden at the final beacon (spec Loop-iv section 2): x the final depth's hull, x the fire interval, layers over the depth's maximum
export const JUMP_CHARGE_TIME = 60;                                                 // seconds from arrival to a ready drive
export const BOARDING_AFTER_JUMP = 120;                                             // seconds after a jump before a party can arrive (no draw); the enemy follows the node type (ENCOUNTER_START, spec Demo-vi section 2)

// Events and shops (Run-ii)
export const SHOP_CHANCE = 0.15, EVENT_CHANCE = 0.25, ASTEROID_CHANCE = 0.15, EMPTY_CHANCE = 0.05;   // node type draw thresholds (map stream, after the edges), else Hazard (0.40) (spec Loop-i section 4: Shop 0.25 -> 0.15, Empty new; Demo-x-b section 2: Empty 0.15 -> 0.05; column 1 is all Hazard without a draw, column 2 has no Empty)
/** Asteroid fields (spec Demo-viii section 1): seconds between field rocks (one hazards draw per re-arm, +/- jitter), the rock flight, how long the field spawns, the extra seconds before it clears (every rock has landed), the reward. */
export const FIELD_INTERVAL = 6, FIELD_JITTER = 0.2, FIELD_FLIGHT = 10, FIELD_FLIGHT_JITTER = 2, FIELD_SECONDS = 60, FIELD_CLEAR_EXTRA = 12;   // FIELD_INTERVAL 4 -> 6 (amendment A2)
/** A field rock hits weaker than debris (spec Demo-viii amendment A1: 15 rocks x 8 hull sank the duo gate's ship): hull, and half the debris crew damage. */
export const ROCK_BREACH_FIRST = 0.75;   // a rock impact tries a breach first below this roll (amendment A4; debris 0.5)
export const FIELD_ROCK_HULL = 3, FIELD_ROCK_CREW = Math.floor(DEBRIS_CREW_DAMAGE / 2);
/** Scrap rewards grow with the column at the moment they are paid (spec Demo-ix section 2): a base plus a per-column step. */
export const scrapPerJump = (column: number): number => 10 + 4 * column;     // paid on arrival, after the jump advanced the column (amendment B8)
export const scrapEnemy = (column: number): number => 20 + 6 * column;
export const scrapSurrender = (column: number): number => 15 + 4 * column;
export const scrapBoarder = (column: number): number => 8 + 2 * column;
export const scrapField = (column: number): number => 15 + 5 * column;       // an asteroid field cleared (Demo-viii)
export const EVENT_SCRAP_SCALE = 0.15;   // event scrap amounts are written for depth 0 and multiplied by 1 + EVENT_SCRAP_SCALE x depth (spec Loop-v section 1)
export const SHOP_HULL = 25, SHOP_HULL_COST = 30, SHOP_TORPEDOES = 2, SHOP_TORPEDOES_COST = 20;
// Upgrades from the Engineering console (Loop-ii): the next level costs BASE + STEP x the levels owned
export const UPGRADE_MAX = 3, UPGRADE_BASE = 30, UPGRADE_STEP = 15;           // levels above STATION_MAX per kind: 30, 45, 60 scrap
export const REACTOR_BONUS_MAX = 5, REACTOR_BASE = 25, REACTOR_STEP = 10;     // reactor bars above REACTOR_CAPACITY: 25, 35, 45, 55, 65 scrap
// Progression and permadeath (Run-iii)
export const SCORE_NODE = 100, SCORE_VICTORY = 500, SCORE_ENEMY = 20, SCORE_BOARDER = 5;
export const UNLOCK_SCRAP = 30, UNLOCK_TORPEDOES = 2;
export const QUIRK_COUNT = 6;
export const QUIRK_PASSAGE_MULT = 2, QUIRK_HEAT_RISE = 1, QUIRK_DOOR_DELAY_MULT = 2, QUIRK_DEBRIS_OFFSET = -2, QUIRK_LEAD_OFFSET = 4, QUIRK_CHARGE_MULT = 1.25;

// HUD budgets (spec Demo-i sections 3 and 4): characters per card and notice line, pixels at 16 px m5x7 (measured from the TTF advance table)
export const CONSOLE_LINE_MAX = 40;   // characters per console-card line (308 px card at about 6.25 px per character, spec Demo-vii section 1)
export const LOBBY_LINE_MAX = 90, NOTICE_LINE_MAX = 64, LOBBY_PX_MAX = 560, NOTICE_PX_MAX = 400;
// Working together (spec Coop-i sections 1 and 2)
export const SHIELD_ROTATE = 30;      // seconds between enemy shield re-tunes while its shields system is up; 20 -> 30 (amendment C14): a level-1 scan takes 16 s, which left 4 s to lock and fire
export const LOCK_SECONDS = 8;        // a Science lock on the shield frequency
export const LOCK_HIT_BONUS = 0.15;   // added to the beam hit threshold under a lock while a layer is up
export const TEAM_MULT = 1.25;        // each holder's rate when two or more hold Interact on one target

export const HIT_FLASH_TICKS = 12;   // ticks the HUD enemy silhouette flashes after our last hit (spec Demo-ii section 4); read only by the HUD model, not hashed
export const EVADE_WINDOW = 1.0;     // seconds of an evasive manoeuvre: impacts inside it roll twice the evade chance (spec Coop-ii section 1)
export const EVADE_COOLDOWN = 6;     // seconds after the manoeuvre before Navigation can start another
export const EVADE_CAP = 0.8;        // the doubled chance is capped here (amendment D1)
export const CARRY_SPEED_MULT = 0.8;  // a crew member carrying a torpedo moves at this fraction of their speed (spec Coop-ii section 2)
export const VOTE_SECONDS = 15;      // an open event resolves by this time at the latest (spec Coop-ii section 3)
export const VOTE_SETTLE = 1;        // once every conscious player has a valid vote, it resolves after this long without a change, so the last voter can still switch (spec Coop-ii amendment D11)
export const CONFIRM_SECONDS = 5;    // a second officer's Confirm must come this soon after the pilot's jump (spec Coop-ii section 3)
```

Run: `npx vitest run tests/golden.test.ts tests/duelGolden.test.ts tests/determinismHarness.test.ts`
Expected: FAIL in all 3 files: the stored artifacts are at version 36 (the golden hashes differ and the fixture's snapshots report "snapshot sim version does not match").

- [ ] **Step 3: Prove the bump version-only, before blessing anything**

Run: `npx tsx scripts/golden/canonical-trace.ts check`
Expected: `per-tick canonical trace identical, sim version 36 → 37: golden 7200 ticks, determinism-v2 108000 ticks in 19 runs`, exit 0. **If it exits 1 ("NOT version-only, bless nothing"), stop**: something besides the version changed sector gameplay.

- [ ] **Step 4: Bless every pinned artifact**

Run: `npm run bless`
Expected, the last three lines (about 20 s; the bless re-runs the comparison itself, then stages all three artifacts before writing any):
```
blessed tests/golden/basic.json: 120 checkpoints, final fdf43ba3
blessed tests/golden/duel-1.json: 26 checkpoints, 15772 ticks, outcome 1, final c973118a
blessed tests/fixtures/determinism-v2.json: sim version 36 → 37, 1800 samples and 404 boundaries unchanged apart from the version and hashes
```

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: 14531 leaves differ, 0 outside version, digest and hashes`, exit 0.

- [ ] **Step 5: Run the golden, determinism and guard tests**

Run: `npx vitest run tests/golden.test.ts tests/duelGolden.test.ts tests/determinismHarness.test.ts tests/simStateCompleteness.test.ts tests/netParity.test.ts tests/boundary.test.ts`
Expected: PASS, 146 tests in 6 files.

- [ ] **Step 6: Typecheck, build and run the full suite**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: exit 0 (the suite reads `out/`).

Run: `npm test`
Expected: every file passes, 3,081 tests in 219 files at master 3f6a38b: the merge adds `tests/simStateCompleteness.test.ts`, and the 19 scenario tests, the short-script test and the projection test that read `net1a-baseline.json` leave the default suite (see the known flakes in Global Constraints).

- [ ] **Step 7: The cross-engine determinism check**

Run: `npm run test:determinism -- --output-dir=out/r0-determinism`
Expected: exit 0, with `1800 canonical samples, 404 result/event boundaries PASS` for Node and `1800 samples PASS` for Electron (and Firefox where it is installed) (about 60 s). The output-dir flag (read by scripts/determinism/run.ts) sends its evidence logs to the git-ignored out/ folder instead of the tracked default under .superpowers/sdd/, so this step leaves git status unchanged: no step of this plan restores, checks out or stashes anything, and only the files each commit names change.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/sim/tuning.ts tests/golden/basic.json tests/golden/duel-1.json tests/fixtures/determinism-v2.json
git commit -q -m "feat(sim): SIM_VERSION 37 for the fuller duel hash, re-blessed version-only by the one bless command (engine refactor R-0)"
```

(End the message with your session's Co-Authored-By trailer.)

---

## After R-0

- **R-1a** (`2026-11-16-engine-r1a-generic-authority.md`) records `npx tsx scripts/golden/canonical-trace.ts baseline` at version 37 before it touches the authority, and proves the refactor with `same`.
- **Version skew** (spec risk 0): master is now SIM 37; the deployed Net-3 candidate is SIM 35. Rooms made by the deployed package do not admit master builds; the owner redeploys before the H-2 playtest.
- **`docs/gates.md`** still says normal tests compare against `net1a-baseline.json`; its §Net-1a paragraph can say "on demand, `npm run bless -- --baseline`" when the docs are next edited.
