# Engine Refactor R-1b: The Duel Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The duel becomes the second registered Net-3 mode on R-1a's generic authority. It moves onto the sim module contract (space, presence, repair and the interior wrapper), with a completeness test; it gains a snapshot codec and a checkpoint (a header with `mapHash`, stored and regenerated values, validation on restore, and its telemetry accumulator saved as mode memory); its end is a frozen `DuelEndSummary` in a mode-tagged `EndRecord`; its replays name their mode and re-run to the same hash; and `authorityHost.ts` registers it. The continuation proof (N ticks, checkpoint, restore, M more equals N + M uninterrupted, end summary included), the size test and start → captureCheckpoint → restore round trips at the `hostRuntime` level are its acceptance. **The duel's gameplay does not change:** its golden passes unedited.

**Architecture:**
- `sim/module.ts` (new): `SimModule<S>`, `ModuleField<S>` and the derived `flattenModule`, `unflattenModule`, `moduleLength`.
- `sim/tactical/hash.ts`: the `space` module; `flattenTactical` is derived from its fields, in the H-0 order; `unflattenTactical`, `tacticalLength`.
- `sim/duel/modules.ts` (new): the `presence`, `repair` and `interior` modules, `DUEL_MODULES`, `DUEL_NOT_SNAPSHOTTED`. `sim/duel/hash.ts`: `flattenDuel` from the modules; `mapHash`.
- `sim/duel/snapshot.ts` (new): `saveDuelSnapshot`, `validateDuelSnapshot`, `loadDuelSnapshot`. `sim/duel/summary.ts` (new): `DuelEndSummary`, `duelEndSummary`.
- `authority/duelCheckpoint.ts` (new): the duel's init, checkpoint and mode-memory schemas. `authority/duelRules.ts` (new): `duelRules`, `DuelTypes`, `DuelSession`.
- `net/codec.ts`: the duel's wire (`duelCodec`, `duelPublicationSchema`) and the duel `EndRecord` variant; `net/contracts.ts`: the variant's type.
- `authority/replay.ts`: `runModeReplay` picks the rules by the replay's mode.
- `network/modes/streamBinding.ts` (new): the host side of a streamed attachment, moved unchanged out of `sectorStream.ts` and parametrised by the mode. `network/modes/duelStream.ts` (new): the duel's publication ↔ state-image adapter and stream binding. `network/modes/duel.ts` (new): `duelMode`, one `defineEncounterMode` call. `utility/authorityHost.ts` registers it.

**No online duel UI and no main-process or renderer online wiring** (`main/network/onlineSector.ts`, the renderer's `app/onlineSession.ts`, room compatibility): that is H-2. A utility initialised as `duel` runs it; nothing yet starts one.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2, tsx, zod 3, Electron 37. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-engine-refactor-design.md` §6 (sim modules; `tick`, `EndRecord` and layout resolution; the duel's snapshot format; R-1 acceptance; commands) and the R-1 row of §12. Follows `2026-11-16-engine-r1a-generic-authority.md`.

## Scope

- **Task 1:** the sim module contract and the duel on it (space, presence, repair, interior), with the completeness test.
- **Task 2:** the duel snapshot codec: header, stored and regenerated values, validation.
- **Task 3:** the duel rules, checkpoint, end summary and codec; mode-aware replay lookup; the continuation proof, replays and the size test.
- **Task 4:** the duel's stream adapter and its registration as a Net-3 mode; the hostRuntime round trips; the gates.
- **Not in R-1:** the history ring (R-8); the online duel UI (H-2); bots for the duel.

## Global Constraints

- Determinism guard (`tests/boundary.test.ts`): `sim/module.ts`, `sim/duel/modules.ts`, `snapshot.ts`, `summary.ts`, `authority/duelRules.ts` and `duelCheckpoint.ts` fall under it: only `Math.abs`, `ceil`, `floor`, `round`, `min`, `max`, `sign`, `imul` and `sqrt`; no platform globals; randomness only through `src/shared/rng.ts`. Files under `sim/` import nothing from `authority/`, `clientControl/`, `app/` or `render/`.
- The network boundary (`tests/networkBoundary.test.ts`): `modes/streamBinding.ts`, `modes/duel.ts` and `modes/duelStream.ts` join the mode files that may import renderer code.
- **The duel's gameplay and the sector must not change.** `tests/golden/duel-1.json`, `tests/golden/basic.json` and `tests/fixtures/*` are not written; the duel golden passes unedited, which proves the module-derived `flattenDuel` writes the same values in the same order.
- **Never discard working-tree changes.** No step runs `git checkout`, `git restore`, `git stash` or `git clean`: the owner and other sessions keep uncommitted work in this checkout (today, netcode files under `src/main/network/`, `src/renderer/src/main.ts` and `tests/online*.test.ts`), and this plan touches none of those files. Every check that writes evidence writes it under the git-ignored `out/`.
- **Commands need no shell features.** Every `Run:` line works as written in Windows PowerShell 5.1 and in Git Bash.
- Commit with explicit paths only (`git add <paths>`), never `git add -A` or `git add .`. End every commit message with the Co-Authored-By trailer your own session instructs.
- Run single test files with `npx vitest run <file>`. The full suite is `npm test` (it reads the built `out/`; build first). Typecheck is `npm run typecheck`.
- Known flakes: `tests/authorityBoundary.test.ts` and `tests/run.test.ts` can time out under full-suite load; rerun one alone. `tests/onlineAppRuntime.test.ts` ("bounds an unresolved actual observer-build") fails in a git worktree outside the main checkout, on pristine master too; it passes in the main checkout.
- Line endings: write files with LF.

## Decisions the plan makes inside the spec

Each is the recommendation, taken under the standing order; the owner can overturn any of them.

1. **The module contract's shape** **(rec.)**: a module declares `fields(s)` (each `{ name, count, read, write }`), `notSnapshotted` (member path → reason), `commands` and `reasons`. Fields carry a writer as well as a reader, so restore is derived from the same declaration as flatten and hash, and nothing is hand-listed twice. The spec's `create(init, rng)` is left out for now: the duel is still created by `createDuel`, and R-4/R-5, which move creation into the modules, add it. A field list may depend on the state's shape (the map's asteroid count sizes `graceUntil`), never its values, and is cached per shape.
2. **The duel's modules** (spec §6, R-1 stage): `space` (today's `TacticalState`), `presence`, `repair` and `interior` (the Cutter `SimState`, one field through the sector's `flatten` / validated `unflatten`), in that order after `SIM_VERSION`: exactly the hash-completeness order, so the duel golden is unchanged. `points`, `nav`, `weapons` and `events` are the duel's declared not-snapshotted members; `map`, `grid` and `events` are the space module's. The map's asteroid count stays a field (as in H-0) and is an identity check on restore: writing a different count throws.
3. **The snapshot header** (a spec refinement): the spec's `{ snapshotFormat: 1, simVersion, contentDigest, layoutId, layoutHash, seed, mapHash }` plus `tick` and `playerCount` (the generic core and Net-3's publication read them from every snapshot) and `hash`, the `hashDuel` of the stored values, which the restored duel must reproduce (the spec's "the hash recorded in the checkpoint").
4. **Validation before allocation** **(rec.)**: `validateDuelSnapshot` checks the header keys and versions, digest, layout, seed, the map (regenerated from the seed with `createTacticalState`, which builds no interior; it must pass `validateMap`, and its `mapHash` must equal the header's), the value count, the interior's canonical values (the sector's `validateCanonicalValues`), the interior and tactical ticks against the header, and the header's hash over the values. `loadDuelSnapshot` then creates a fresh duel from the seed (the map, grid, repair points and `Derived` regenerated), writes every module back, and requires equal ticks and `hashDuel` equal to the header's.
5. **`mapHash`** (spec §6): `hashF64` over the planet's x, y and r, each asteroid's x, y and r in index order, the belt count, the cluster sizes, the gaps, and both spawns' x, y, vx, vy and heading, with −0 written as 0; cached per map.
6. **Mode memory and controller memory** **(rec.)**: the duel has no bots in R-1, so its `botControllers` is always `[]`. Its telemetry accumulator is `modeMemory: { version: 1, telemetry }` (typed arrays as number arrays), validated by zod, consistent with the snapshot (its tick count equals the snapshot's tick; `graceUntil` copies have the map's body count), and restored with the duel. A restore without it is refused.
7. **`DuelEndSummary`** (spec §6): `{ outcome, ticks, terminal: [causes, causes], laserReleases, laserHits, missilesLaunched, missileHits, repairsFinished }`, deeply frozen, computed once when the outcome leaves Running. Per-ship pairs are [crew ship, enemy ship]; `missileHits` sums the accumulator's hits by room; `repairsFinished` is per player (the accumulator counts repairs per player). The codec checks each cause array is in the accumulator's order without repeats. A restored ended duel recomputes the same summary from its restored accumulator.
8. **The duel's other hooks** **(rec.)**: `tick` is the interior tick; `safePointKey` is constant (the duel has no visits; its end is still a safe point through the core); `callouts` returns none; the cues are `impact` (the crew ship hit), `shot` (a crew laser release), `hit` (the enemy hit) and `victory` or `defeat` when the outcome leaves Running, in the shared cue order.
9. **Producers** **(rec.)**: humans only. A vacant duel player sends nothing; bots for the duel are later work.
10. **The stream adapter** **(rec.)**: the host side of a streamed attachment moved, unchanged, from `sectorStream.ts` to `streamBinding.ts`, parametrised by the mode's image converter, codec, notification stream and label; the sector's stream, streams, packets and close reasons are byte-identical (its tests run unedited). The duel's images carry the canonical values with the rest of the publication as metadata, on `duel-notification` for results and events. The duel's remote client is H-2.
11. **Replays pick their rules by mode** (spec §6): `runModeReplay(value, contentDigest, resolveLayout)` looks the mode up (`sector`, `duel`); `runReplay` stays the sector entry point for its callers.
12. **The proofs' scenarios** (found by the prototype): the continuation proof uses seed 7, the scripted pair's 8,832-tick crew loss: 6,000 ticks, a checkpoint carried through JSON bytes and the duel validator, a restore into a new core, then the remaining 2,832; the per-tick hashes and the end summaries equal the uninterrupted run's (`{"outcome":2,"ticks":8832,"terminal":[["missile"],[]],"laserReleases":[11,28],"laserHits":[2,28],"missilesLaunched":[2,5],"missileHits":[0,5],"repairsFinished":[7,9]}`). Inputs enter the generic core as journal frames, as a binding's would. The size test's largest state (both missiles in flight, every room at level 2, mid-repair, a full accumulator) encodes to 8,548 bytes (8.3 KiB of the 256 KiB `MAX_HOST_BYTES`), 1,018 values.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/module.ts` | **Create:** the module contract and its derived flatten / unflatten |
| `src/renderer/src/sim/tactical/hash.ts` | **Replace:** the `space` module; `flattenTactical`, `unflattenTactical`, `tacticalLength` from it |
| `src/renderer/src/sim/duel/modules.ts` | **Create:** `presenceModule`, `repairModule`, `interiorModule`, `DUEL_MODULES`, `DUEL_NOT_SNAPSHOTTED` |
| `src/renderer/src/sim/duel/hash.ts` | **Replace:** `flattenDuel` from the modules; `mapHash` |
| `src/renderer/src/sim/duel/snapshot.ts` | **Create:** the duel snapshot format and its validation |
| `src/renderer/src/sim/duel/summary.ts` | **Create:** `DuelEndSummary`, `duelEndSummary`, `TERMINAL_CAUSES` |
| `src/renderer/src/authority/duelCheckpoint.ts` | **Create:** `DuelInit`, `DuelCheckpoint`, `DuelMemory`, the schemas and validators |
| `src/renderer/src/authority/duelRules.ts` | **Create:** `duelRules`, `DuelTypes`, `DuelSession` |
| `src/renderer/src/net/codec.ts`, `src/renderer/src/net/contracts.ts` | **Replace:** the duel wire and the duel `EndRecord` variant |
| `src/renderer/src/authority/replay.ts` | **Replace:** `runModeReplay` |
| `src/renderer/src/app/session.ts` | **Replace:** applies only a sector end record (one line) |
| `src/network/modes/streamBinding.ts` | **Create:** `createModeStreamBinding`, `encodeModeNotification`, `modeInputIdentity` |
| `src/network/modes/sectorStream.ts` | **Replace:** its host binding is `createModeStreamBinding` |
| `src/network/modes/duelStream.ts` | **Create:** `duelPublicationToImage`, `imageToDuelPublication`, `createDuelStreamBinding` |
| `src/network/modes/duel.ts` | **Create:** `duelMode` |
| `src/utility/authorityHost.ts` | **Replace:** registers `duelMode` |
| `tests/duelModules.test.ts`, `tests/duelSnapshot.test.ts`, `tests/duelCheckpoint.test.ts`, `tests/duelMode.test.ts`, `tests/helpers/duelAuthority.ts` | **Create:** the tests and their core driver |
| `tests/networkBoundary.test.ts` | **Replace:** three more mode files (only change) |

---

### Task 1: The sim module contract and the duel on it

**Files:**
- Create: `src/renderer/src/sim/module.ts`, `src/renderer/src/sim/duel/modules.ts`, `tests/duelModules.test.ts`
- Modify (whole file): `src/renderer/src/sim/tactical/hash.ts`, `src/renderer/src/sim/duel/hash.ts`

**Interfaces:**
- Consumes: `flatten`, `unflatten`, `canonicalFields`, `validateCanonicalValues`; `TacticalState`, `Ship`, `Missile`; `HUNTER_TRAIL_TICKS`; `COMMAND_REASONS`.
- Produces:
  - `module.ts`: `interface ModuleField<S> { name; count; read(s, out); write(s, values, offset) }`; `interface SimModule<S, K> { id; fields(s); notSnapshotted; commands; reasons }`; `scalar`, `flag`, `vector`; `moduleLength`, `flattenModule`, `unflattenModule`.
  - `tactical/hash.ts`: `MISSILE_SLOT` (8); `spaceModule: SimModule<TacticalState>`; `flattenTactical`, `tacticalLength`, `unflattenTactical(s, values, offset = 0): number`, `hashTactical`.
  - `duel/modules.ts`: `presenceModule`, `repairModule`, `interiorModule: SimModule<DuelState>`; `DUEL_NOT_SNAPSHOTTED`; `DUEL_MODULES: { module; state(d); path }[]`; `flattenDuelModules`, `duelModulesLength`, `unflattenDuelModules`.
  - `duel/hash.ts`: `flattenDuel`, `hashDuel` (same values as before); `mapHash(map: MapDef): string`.

- [ ] **Step 1: Record the per-tick canonical trace before anything changes (the sector's reference for this plan)**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 37: golden 7200 ticks, determinism-v2 108000 ticks in 19 runs` and the trace file's path, exit 0.

- [ ] **Step 2: Write the failing test**

Create `tests/duelModules.test.ts`:

```ts
// The duel on the sim module contract (engine refactor spec §6, R-1b): every member of the duel's state is a module's
// canonical field or on its declared not-snapshotted list; a member added to any module without either fails here; every
// field moves the hash; the modules' commands and reasons are the duel codec's kinds and members of COMMAND_REASONS.
import { describe, expect, it } from 'vitest';
import { COMMAND_REASONS } from '../src/renderer/src/net/contracts';
import { flatten } from '../src/renderer/src/sim/flatten';
import { flattenModule, unflattenModule, type SimModule } from '../src/renderer/src/sim/module';
import { DUEL_MODULES, DUEL_NOT_SNAPSHOTTED, interiorModule, presenceModule, repairModule } from '../src/renderer/src/sim/duel/modules';
import { flattenDuel, hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { flattenTactical, spaceModule, unflattenTactical } from '../src/renderer/src/sim/tactical/hash';
import { cloneTactical, createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { CUTTER } from './helpers/scriptedDuel';

const isGroup = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !ArrayBuffer.isView(v) && (Array.isArray(v) ? v.some((x) => typeof x !== 'number') : Object.getPrototypeOf(v) === Object.prototype);
/** Dotted paths of every member under `root` that is neither a field name nor excluded. A numeric array is one member;
 *  any other array (ships, missile slots, presence flags) is walked by index. */
function uncovered(root: object, names: ReadonlySet<string>, excluded: Readonly<Record<string, string>>, skip: ReadonlySet<string> = new Set()): string[] {
  const missing: string[] = [];
  const walk = (obj: Record<string, unknown>, prefix: string): void => {
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key, value = obj[key];
      if (names.has(path) || path in excluded || skip.has(path)) continue;
      if (isGroup(value)) walk(value, path); else missing.push(path);
    }
  };
  walk(root as Record<string, unknown>, '');
  return missing;
}
const names = <S>(m: SimModule<S>, s: S) => new Set(m.fields(s).map((f) => f.name));
const duelNames = (d: DuelState) => new Set([presenceModule, repairModule, interiorModule].flatMap((m) => [...names(m, d)]));
function played(seed: number, ticks: number): DuelState {
  const d = createDuel(CUTTER, seed), pair = createScriptedPair(seed);
  for (let k = 0; k < ticks; k++) stepDuelTick(d, scriptedInput(pair, d));
  return d;
}

describe('the duel modules (spec §6 module contract)', () => {
  it('every TacticalState member is a space field or declared not snapshotted, for several maps', () => {
    for (const seed of [1, 7, 42]) {
      const s = createTacticalState(seed);
      expect(uncovered(s, names(spaceModule, s), spaceModule.notSnapshotted), `seed ${seed}`).toEqual([]);
    }
  });
  it('every DuelState member is a presence, repair or interior field, the space module\'s tactical state, or declared', () => {
    const d = createDuel(CUTTER, 1);
    try { expect(uncovered(d, duelNames(d), DUEL_NOT_SNAPSHOTTED, new Set(['tactical']))).toEqual([]); } finally { disposeDuel(d); }
  });
  it('catches a member added to a module without a field or an exclusion', () => {
    const d = createDuel(CUTTER, 1);
    try {
      (d.tactical as unknown as Record<string, unknown>).newThing = 1;
      (d.tactical.ships[0] as unknown as Record<string, unknown>).newCounter = 0;
      (d.tactical.hunter as unknown as Record<string, unknown>).newTimer = 3;
      (d as unknown as Record<string, unknown>).newFlag = true;
      expect(uncovered(d.tactical, names(spaceModule, d.tactical), spaceModule.notSnapshotted)).toEqual(['ships.0.newCounter', 'hunter.newTimer', 'newThing']);
      expect(uncovered(d, duelNames(d), DUEL_NOT_SNAPSHOTTED, new Set(['tactical']))).toEqual(['newFlag']);
    } finally { disposeDuel(d); }
  });
  it('every exclusion names a real member and is not also a field', () => {
    const d = createDuel(CUTTER, 1);
    try {
      for (const [m, s] of [[spaceModule, d.tactical], [presenceModule, d], [repairModule, d], [interiorModule, d]] as const)
        for (const path of Object.keys(m.notSnapshotted)) { expect(s, path).toHaveProperty(path.split('.')); expect(names(m as SimModule<object>, s).has(path)).toBe(false); }
      for (const path of Object.keys(DUEL_NOT_SNAPSHOTTED)) { expect(d, path).toHaveProperty(path.split('.')); expect(duelNames(d).has(path)).toBe(false); }
    } finally { disposeDuel(d); }
  });
  it('every space, presence and repair field changes the duel hash; the interior is covered by its own flatten', () => {
    const d = played(2, 900);
    try {
      const base = hashDuel(d);
      for (const { module, state } of DUEL_MODULES.slice(0, 3)) {
        const m = module as SimModule<unknown>, s = state(d);
        for (const f of m.fields(s)) {
          if (f.name === 'map.asteroids.length') continue;   // an identity check, never written (next test)
          const values: number[] = []; f.read(s, values);
          const changed = [...values]; changed[0] = f.name.startsWith('missiles.') || f.name.startsWith('present.') || f.name.endsWith('released') || f.name.endsWith('fireHeld') || f.name === 'hunter.working' ? 1 - changed[0]! : changed[0]! + 1;
          f.write(s, changed, 0);
          expect(hashDuel(d), `${m.id}.${f.name}`).not.toBe(base);
          f.write(s, values, 0);
          expect(hashDuel(d), `${m.id}.${f.name} restored`).toBe(base);
        }
      }
      d.interior.rooms.fire[0] = 0.5; expect(hashDuel(d)).not.toBe(base);
    } finally { disposeDuel(d); }
  });
  it('the asteroid count is an identity check against the regenerated map, and an empty missile slot holds only zeros', () => {
    const s = createTacticalState(1), values = Array.from(flattenTactical(s));
    values[3] = values[3]! + 1;
    expect(() => unflattenTactical(createTacticalState(1), values)).toThrow(/asteroid count/);
    const slot = spaceModule.fields(s).find((f) => f.name === 'missiles.0')!;
    expect(() => slot.write(s, [0, 1, 0, 0, 0, 0, 0, 0], 0)).toThrow(/empty slot/);
  });
  it('flatten is the modules in canonical order after SIM_VERSION, unchanged from the hash-completeness order', () => {
    const d = played(1, 600);
    try {
      expect(Array.from(flattenDuel(d))).toEqual([SIM_VERSION, ...flattenTactical(d.tactical), d.present[0] ? 1 : 0, d.present[1] ? 1 : 0, ...d.repair, ...flatten(d.interior)]);
      const copy = cloneTactical(d.tactical), fresh = createTacticalState(1);
      expect(unflattenTactical(fresh, flattenTactical(copy))).toBe(flattenTactical(copy).length);
      expect(flattenTactical(fresh)).toEqual(flattenTactical(copy));
      const out: number[] = []; flattenModule(presenceModule, d, out);
      expect(unflattenModule(presenceModule, d, out, 0)).toBe(2);
    } finally { disposeDuel(d); }
  });
  it('the modules own the duel\'s command kinds (setPaused is the core\'s), and their reasons are enum members', () => {
    const kinds = DUEL_MODULES.flatMap(({ module }) => [...module.commands]).sort();
    expect(kinds).toEqual(['laserCharge', 'laserLock', 'missileLaunch', 'presence', 'sit', 'stand']);
    for (const { module } of DUEL_MODULES) for (const reason of module.reasons) expect(COMMAND_REASONS, `${module.id}: ${reason}`).toContain(reason);
  });
});
```

Run: `npx vitest run tests/duelModules.test.ts`
Expected: FAIL: the file does not load (`../src/renderer/src/sim/module` does not exist yet).

- [ ] **Step 3: The contract, the space module and the duel's modules**

Create `src/renderer/src/sim/module.ts`:

```ts
// The sim module contract (engine refactor spec §6). Each part of an encounter declares its canonical fields in a
// fixed order; flatten, hash, snapshot and restore are derived from those declarations, and the completeness test
// requires every member of the module's state to be a field or on its declared not-snapshotted list. R-1 puts the
// duel on it (space, presence, repair and the interior wrapper); R-2, R-4 and R-5 move the rest.

/** One canonical field: `count` values read in order, written back in the same order. */
export interface ModuleField<S> {
  readonly name: string;
  readonly count: number;
  read(s: S, out: number[]): void;
  /** Write `count` values starting at `values[offset]`. Throws on a value the state cannot hold. */
  write(s: S, values: ArrayLike<number>, offset: number): void;
}

export interface SimModule<S, K extends string = string> {
  readonly id: string;
  /** The canonical fields in order. The list may depend on the state's shape (the map's asteroid count), never on its values. */
  fields(s: S): readonly ModuleField<S>[];
  /** Members of S outside the canonical fields, by dotted path, each with the reason it is not snapshotted. */
  readonly notSnapshotted: Readonly<Record<string, string>>;
  /** The command kinds this module owns. */
  readonly commands: readonly K[];
  /** The rejection reasons its commands may return. */
  readonly reasons: readonly string[];
}

/** A scalar field read and written through a getter and setter. */
export function scalar<S>(name: string, get: (s: S) => number, set: (s: S, v: number) => void): ModuleField<S> {
  return { name, count: 1, read: (s, out) => { out.push(get(s)); }, write: (s, values, offset) => { set(s, values[offset]!); } };
}
/** A boolean field, written as 1 or 0. */
export function flag<S>(name: string, get: (s: S) => boolean, set: (s: S, v: boolean) => void): ModuleField<S> {
  return { name, count: 1, read: (s, out) => { out.push(get(s) ? 1 : 0); }, write: (s, values, offset) => { set(s, values[offset]! !== 0); } };
}
/** A fixed-length numeric array field (a tuple or typed array whose length is part of the state's shape). */
export function vector<S>(name: string, count: number, get: (s: S) => { length: number; [k: number]: number }): ModuleField<S> {
  return {
    name, count,
    read(s, out) { const a = get(s); if (a.length !== count) throw new Error(`${name}: length ${a.length}, declared ${count}`); for (let k = 0; k < count; k++) out.push(a[k]!); },
    write(s, values, offset) { const a = get(s); if (a.length !== count) throw new Error(`${name}: length ${a.length}, declared ${count}`); for (let k = 0; k < count; k++) a[k] = values[offset + k]!; }
  };
}

/** The number of values a module writes for this state. */
export function moduleLength<S>(m: SimModule<S>, s: S): number {
  let n = 0; for (const f of m.fields(s)) n += f.count; return n;
}
/** Append the module's canonical values, checking each field writes exactly its declared count. */
export function flattenModule<S>(m: SimModule<S>, s: S, out: number[]): void {
  for (const f of m.fields(s)) {
    const before = out.length; f.read(s, out);
    if (out.length - before !== f.count) throw new Error(`${m.id}.${f.name}: wrote ${out.length - before} values, declared ${f.count}`);
  }
}
/** Write the module's values back from `values[offset]`; returns the offset after them. */
export function unflattenModule<S>(m: SimModule<S>, s: S, values: ArrayLike<number>, offset: number): number {
  for (const f of m.fields(s)) {
    if (offset + f.count > values.length) throw new Error(`${m.id}.${f.name}: values end early`);
    f.write(s, values, offset); offset += f.count;
  }
  return offset;
}
```

Replace the whole of `src/renderer/src/sim/tactical/hash.ts` with:

```ts
// Canonical flatten and hash of the tactical state (spec §4: same seed and inputs give the same hash), now declared as
// the `space` sim module (engine refactor spec §6): flatten, unflatten and the completeness test all come from its
// field list. The map is a pure function of the seed, so only its asteroid count is flattened. Per-tick events are
// outputs, reset every tick, and not hashed. −0 is written as 0. The field order is the H-0 order, unchanged.
import { hashF64 } from '../../../../shared/hash';
import { flag, flattenModule, moduleLength, scalar, unflattenModule, vector, type ModuleField, type SimModule } from '../module';
import { HUNTER_TRAIL_TICKS } from './tuning';
import type { Missile, Ship, TacticalState } from './state';

/** Values per missile slot: a presence flag, then x, y, vx, vy, heading, headingAcc, age (zeros when empty). */
export const MISSILE_SLOT = 8;

/** A ship's scalar fields in canonical order; `rooms` comes after `hull` and `graceUntil` closes the ship. */
const SHIP_HEAD = ['x', 'y', 'vx', 'vy', 'heading', 'headingAcc', 'hull'] as const;
const SHIP_TAIL = ['planetHits', 'asteroidHits', 'shipHits', 'released', 'skidBudget', 'skidSign',
  'shields', 'shieldClock', 'laserCharge', 'laserHold', 'fireHeld', 'lock', 'magazine', 'magazineClock',
  'shots', 'laserHits', 'layersStripped', 'missilesLaunched', 'missileHits', 'missilesLost'] as const;
const SHIP_FLAGS = new Set<string>(['released', 'fireHeld']);
const MISSILE_KEYS = ['x', 'y', 'vx', 'vy', 'heading', 'headingAcc', 'age'] as const;
const HUNTER_HEAD = ['mode', 'room', 'timer', 'working', 'fireAt', 'lastLaunch', 'trailHead'] as const;

type Numeric<T> = { [K in keyof T]: T[K] extends number | boolean ? K : never }[keyof T];
function shipField(i: 0 | 1, key: Numeric<Ship>): ModuleField<TacticalState> {
  const name = `ships.${i}.${key}`;
  return SHIP_FLAGS.has(key) ? flag(name, (s) => s.ships[i][key] as boolean, (s, v) => { (s.ships[i] as unknown as Record<string, boolean>)[key] = v; })
    : scalar(name, (s) => s.ships[i][key] as number, (s, v) => { (s.ships[i] as unknown as Record<string, number>)[key] = v; });
}
function missileField(i: 0 | 1): ModuleField<TacticalState> {
  return {
    name: `missiles.${i}`, count: MISSILE_SLOT,
    read(s, out) { const m = s.missiles[i]; if (!m) { for (let k = 0; k < MISSILE_SLOT; k++) out.push(0); return; } out.push(1, m.x, m.y, m.vx, m.vy, m.heading, m.headingAcc, m.age); },
    write(s, values, offset) {
      const present = values[offset]!;
      if (present !== 0 && present !== 1) throw new Error(`missiles.${i}: presence ${present}`);
      if (present === 0) { for (let k = 1; k < MISSILE_SLOT; k++) if (values[offset + k] !== 0) throw new Error(`missiles.${i}: empty slot holds values`); s.missiles[i] = null; return; }
      const m = {} as Missile;
      MISSILE_KEYS.forEach((key, k) => { m[key] = values[offset + 1 + k]!; });
      s.missiles[i] = m;
    }
  };
}

const cache = new Map<number, ModuleField<TacticalState>[]>();
/** The field list for a map with `asteroids` asteroids (graceUntil holds asteroids + 2 bodies). */
function tacticalFields(asteroids: number): ModuleField<TacticalState>[] {
  let fields = cache.get(asteroids);
  if (fields) return fields;
  fields = [
    scalar('tick', (s) => s.tick, (s, v) => { s.tick = v; }),
    scalar('seed', (s) => s.seed, (s, v) => { s.seed = v; }),
    scalar('rng.s', (s) => s.rng.s, (s, v) => { s.rng.s = v; }),
    scalar('map.asteroids.length', (s) => s.map.asteroids.length, (s, v) => { if (v !== s.map.asteroids.length) throw new Error(`asteroid count ${v} does not match the map (${s.map.asteroids.length})`); }),
    scalar('outcome', (s) => s.outcome, (s, v) => { s.outcome = v; })
  ];
  for (const i of [0, 1] as const) {
    for (const key of SHIP_HEAD) fields.push(shipField(i, key));
    fields.push(vector(`ships.${i}.rooms`, 3, (s) => s.ships[i].rooms));
    for (const key of SHIP_TAIL) fields.push(shipField(i, key));
    fields.push(vector(`ships.${i}.graceUntil`, asteroids + 2, (s) => s.ships[i].graceUntil));
  }
  fields.push(missileField(0), missileField(1));
  for (const key of HUNTER_HEAD) fields.push(key === 'working'
    ? flag('hunter.working', (s) => s.hunter.working, (s, v) => { s.hunter.working = v; })
    : scalar(`hunter.${key}`, (s) => s.hunter[key] as number, (s, v) => { (s.hunter as unknown as Record<string, number>)[key] = v; }));
  fields.push(vector('hunter.trail', 2 * HUNTER_TRAIL_TICKS, (s) => s.hunter.trail));
  cache.set(asteroids, fields);
  return fields;
}

/** The `space` module: today's TacticalState (spec §3), in the H-0 canonical order. */
export const spaceModule: SimModule<TacticalState> = {
  id: 'space',
  fields: (s) => tacticalFields(s.map.asteroids.length),
  notSnapshotted: {
    map: 'regenerated from the seed by generateMap; the duel snapshot checks its mapHash',
    grid: 'the broad-phase grid, rebuilt from the map',
    events: 'per-tick events for the views, cleared every tick'
  },
  commands: ['laserLock', 'laserCharge', 'missileLaunch'],
  reasons: ['not-at-weapons', 'missile-in-flight', 'malformed', 'stale-tick', 'unavailable']
};

export function flattenTactical(s: TacticalState): Float64Array {
  const out: number[] = [];
  flattenModule(spaceModule, s, out);
  return Float64Array.from(out, (v) => (v === 0 ? 0 : v));
}
/** The number of values flattenTactical writes for this state's map. */
export function tacticalLength(s: TacticalState): number { return moduleLength(spaceModule, s); }
/** Write tactical values back into a state made from the same seed (same map); returns the offset after them. */
export function unflattenTactical(s: TacticalState, values: ArrayLike<number>, offset = 0): number { return unflattenModule(spaceModule, s, values, offset); }

export function hashTactical(s: TacticalState): string { return hashF64(flattenTactical(s)); }
```

Create `src/renderer/src/sim/duel/modules.ts`:

```ts
// The duel on the sim module contract (engine refactor spec §6, R-1): space (the tactical state), presence, repair and
// the interior wrapper, in canonical order after SIM_VERSION. flattenDuel, the duel snapshot and its restore all come
// from this list; tests/duelModules.test.ts holds every DuelState and TacticalState member to a field or an exclusion.
import { flatten, unflatten } from '../flatten';
import { validateCanonicalValues } from '../snapshotValidation';
import { canonicalFields } from '../canonicalFields';
import { flag, flattenModule, moduleLength, unflattenModule, vector, type ModuleField, type SimModule } from '../module';
import { spaceModule } from '../tactical/hash';
import type { DuelState } from './state';

/** Who is at the keyboard (spec §8 "present or away"). */
export const presenceModule: SimModule<DuelState> = {
  id: 'presence',
  fields: () => PRESENCE,
  notSnapshotted: {},
  commands: ['presence'],
  reasons: ['stale-tick', 'malformed']
};
const PRESENCE: ModuleField<DuelState>[] = [0, 1].map((p) => flag(`present.${p}`, (d) => d.present[p as 0 | 1], (d, v) => { d.present[p as 0 | 1] = v; }));

/** Repair progress per tactical Room, in REPAIR_UNITS. */
export const repairModule: SimModule<DuelState> = {
  id: 'repair',
  fields: () => REPAIR,
  notSnapshotted: {},
  commands: [],
  reasons: []
};
const REPAIR: ModuleField<DuelState>[] = [vector('repair', 3, (d) => d.repair)];

/** The Cutter interior: today's SimState, through the sector snapshot path (flatten / unflatten, validated). */
export const interiorModule: SimModule<DuelState> = {
  id: 'interior',
  fields(d) {
    const fields = canonicalFields(d.interior.layout, d.interior.playerCount), last = fields[fields.length - 1]!, count = last.offset + last.count;
    return [{
      name: 'interior', count,
      read(s, out) { for (const v of flatten(s.interior)) out.push(v); },
      write(s, values, offset) {
        const slice = Array.from({ length: count }, (_, k) => values[offset + k]!);
        validateCanonicalValues(s.interior.layout, s.interior.derived, s.interior.playerCount, slice);
        unflatten(s.interior, Float64Array.from(slice));
      }
    }];
  },
  notSnapshotted: {},
  commands: ['sit', 'stand'],
  reasons: ['not-in-duel', 'unavailable', 'invalid-seat', 'stale-target', 'stale-tick']
};

/** The DuelState members that are not module state, each with its reason. */
export const DUEL_NOT_SNAPSHOTTED: Readonly<Record<string, string>> = {
  points: 'the repair points, resolved from the Cutter layout by createDuel',
  nav: 'the Navigation station index, from the layout',
  weapons: 'the Weapons station index, from the layout',
  events: 'per-tick repair events, cleared every tick'
};

/** The duel's modules in canonical order, each with the part of the DuelState it owns. */
export const DUEL_MODULES: readonly { module: SimModule<never>; state(d: DuelState): unknown; path: string }[] = [
  { module: spaceModule as SimModule<never>, state: (d) => d.tactical, path: 'tactical' },
  { module: presenceModule as SimModule<never>, state: (d) => d, path: '' },
  { module: repairModule as SimModule<never>, state: (d) => d, path: '' },
  { module: interiorModule as SimModule<never>, state: (d) => d, path: '' }
];

/** Every module's values after SIM_VERSION, in order. */
export function flattenDuelModules(d: DuelState, out: number[]): void {
  for (const { module, state } of DUEL_MODULES) flattenModule(module as SimModule<unknown>, state(d), out);
}
/** The number of values after SIM_VERSION. */
export function duelModulesLength(d: DuelState): number {
  let n = 0; for (const { module, state } of DUEL_MODULES) n += moduleLength(module as SimModule<unknown>, state(d)); return n;
}
/** Write every module's values back from `values[offset]`; returns the offset after them. */
export function unflattenDuelModules(d: DuelState, values: ArrayLike<number>, offset: number): number {
  for (const { module, state } of DUEL_MODULES) offset = unflattenModule(module as SimModule<unknown>, state(d), values, offset);
  return offset;
}
```

Replace the whole of `src/renderer/src/sim/duel/hash.ts` with:

```ts
// The duel hash: SIM_VERSION, then the duel's modules in canonical order (sim/duel/modules.ts): the whole tactical
// state, presence and repair progress, then the interior SimState's whole canonical flatten (spec §4: same seed and
// inputs give the same hash). Hashing the full interior flatten, not hand-picked fields, means any interior system the
// duel later turns on (fire, oxygen, power, ...) is covered automatically. SIM_VERSION comes first (H-0c-ii-a spec §6),
// so a version bump changes the duel hash as it does the sector one. Per-tick events (d.events) are derived and not
// hashed. The values are exactly the hash-completeness order; the duel golden pins them.
import { hashF64 } from '../../../../shared/hash';
import { SIM_VERSION } from '../tuning';
import type { MapDef } from '../tactical/map';
import { flattenDuelModules } from './modules';
import type { DuelState } from './state';

export function flattenDuel(d: DuelState): Float64Array {
  const out: number[] = [SIM_VERSION];
  flattenDuelModules(d, out);
  return Float64Array.from(out, (v) => (v === 0 ? 0 : v));   // flatten() already canonicalises the interior's −0
}

export function hashDuel(d: DuelState): string { return hashF64(flattenDuel(d)); }

const mapHashes = new WeakMap<MapDef, string>();
/** The map's identity (engine refactor spec §6): hashF64 over the planet (x, y, r), each asteroid's x, y and r in
 *  index order, the belt count, the cluster sizes, the gaps and both spawns (x, y, vx, vy, heading). */
export function mapHash(map: MapDef): string {
  let h = mapHashes.get(map);
  if (h === undefined) {
    const v: number[] = [map.planet.x, map.planet.y, map.planet.r];
    for (const a of map.asteroids) v.push(a.x, a.y, a.r);
    v.push(map.beltCount, ...map.clusterSizes, ...map.gaps);
    for (const s of map.spawns) v.push(s.x, s.y, s.vx, s.vy, s.heading);
    h = hashF64(Float64Array.from(v, (x) => (x === 0 ? 0 : x)));
    mapHashes.set(map, h);
  }
  return h;
}
```

- [ ] **Step 4: Run the module tests, the duel golden and the tactical determinism tests**

Run: `npx vitest run tests/duelModules.test.ts tests/duelGolden.test.ts tests/tacticalDeterminism.test.ts tests/duel.test.ts tests/duelGates.test.ts tests/boundary.test.ts`
Expected: PASS, 169 tests in 6 files. The duel golden passes unedited: the module-derived flatten writes the same values in the same order.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/module.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/duel/modules.ts src/renderer/src/sim/duel/hash.ts tests/duelModules.test.ts
git commit -q -m "feat(sim): the sim module contract; the duel's space, presence, repair and interior modules drive its flatten (engine refactor R-1b)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 2: The duel snapshot codec

**Files:**
- Create: `src/renderer/src/sim/duel/snapshot.ts`, `src/renderer/src/sim/duel/summary.ts`, `tests/duelSnapshot.test.ts`

**Interfaces:**
- Consumes: Task 1's `flattenDuel`, `hashDuel`, `mapHash`, `unflattenDuelModules`, `tacticalLength`; `createDuel`, `disposeDuel`; `createTacticalState`, `validateMap`; `canonicalFields`, `validateCanonicalValues`, `deriveLayout`; `DuelTelemetry`, `TerminalCause`.
- Produces:
  - `snapshot.ts`: `DUEL_SNAPSHOT_FORMAT` (1), `DUEL_PLAYERS` (2); `interface DuelSnapshotHeader { snapshotFormat; simVersion; contentDigest; tick; playerCount; layoutId; layoutHash; seed; mapHash; hash }`; `interface DuelSnapshot { header; values }`; `saveDuelSnapshot(d, contentDigest)`; `validateDuelSnapshot(layout, value, contentDigest)`; `loadDuelSnapshot(layout, value, contentDigest)`.
  - `summary.ts`: `TERMINAL_CAUSES`; `interface DuelEndSummary`; `duelEndSummary(t: DuelTelemetry): DuelEndSummary`.

- [ ] **Step 1: Write the failing test**

Create `tests/duelSnapshot.test.ts`:

```ts
// The duel snapshot (engine refactor spec §6, R-1b): the header with the map hash, the stored and regenerated
// values, and restore validation, at the sim level.
import { describe, expect, it } from 'vitest';
import { hashF64 } from '../src/shared/hash';
import { flattenDuel, hashDuel, mapHash } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
function scriptedDuel(seed: number, ticks: number) {
  const d = createDuel(CUTTER, seed), pair = createScriptedPair(seed);
  for (let k = 0; k < ticks && d.tactical.outcome === Outcome.Running; k++) stepDuelTick(d, scriptedInput(pair, d));
  return { d, pair };
}

describe('the duel snapshot (spec §6)', () => {
  it('stores flattenDuel under a header with the map hash, and restores to the same hash and the same future', () => {
    const { d, pair } = scriptedDuel(1, 1200);
    try {
      const snap = saveDuelSnapshot(d, DIGEST);
      expect(Object.keys(snap.header)).toEqual(['snapshotFormat', 'simVersion', 'contentDigest', 'tick', 'playerCount', 'layoutId', 'layoutHash', 'seed', 'mapHash', 'hash']);
      expect(snap.header).toMatchObject({ snapshotFormat: 1, tick: 1200, playerCount: 2, seed: 1, mapHash: mapHash(d.tactical.map), hash: hashDuel(d) });
      expect(snap.values).toEqual(Array.from(flattenDuel(d)));
      const r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(snap)), DIGEST), pairR = structuredClone(pair);
      try {
        expect(hashDuel(r)).toBe(hashDuel(d));
        expect(r.interior.tick).toBe(r.tactical.tick);
        for (let k = 0; k < 600; k++) { stepDuelTick(d, scriptedInput(pair, d)); stepDuelTick(r, scriptedInput(pairR, r)); expect(hashDuel(r)).toBe(hashDuel(d)); }
      } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
  it('regenerates the map, grid, repair points and Derived; never stores events', () => {
    const { d } = scriptedDuel(3, 300);
    try {
      const r = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
      try {
        expect(r.tactical.map).toEqual(d.tactical.map); expect(r.tactical.grid).toEqual(d.tactical.grid);
        expect(r.points).toEqual(d.points); expect(r.interior.derived.layoutHash).toBe(d.interior.derived.layoutHash);
        expect(r.events).toEqual([]); expect(r.tactical.events).toEqual([]);
      } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
  it('rejects a snapshot before allocating: format, version, digest, layout, map, count, ticks and hash', () => {
    const { d } = scriptedDuel(2, 120);
    try {
      const good = saveDuelSnapshot(d, DIGEST);
      const bad = (f: (s: typeof good) => void) => { const s = structuredClone(good); f(s); return s; };
      const rehash = (s: typeof good) => { s.header.hash = hashF64(Float64Array.from(s.values)); };
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { (s.header as { snapshotFormat: number }).snapshotFormat = 2; }), DIGEST)).toThrow(/format 2 not supported/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.header.simVersion = 1; }), DIGEST)).toThrow(/sim version/);
      expect(() => validateDuelSnapshot(CUTTER, good, 'f'.repeat(64))).toThrow(/content digest/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.header.layoutHash = 'deadbeef'; }), DIGEST)).toThrow(/layout does not match/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.header.mapHash = '00000000'; }), DIGEST)).toThrow(/map does not match its seed/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.header.seed = 3; }), DIGEST)).toThrow(/map does not match its seed/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.values.push(0); rehash(s); }), DIGEST)).toThrow(/length does not match/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.values[1] = s.values[1]! + 1; rehash(s); }), DIGEST)).toThrow(/ticks differ/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.values[10] = s.values[10]! + 0.5; }), DIGEST)).toThrow(/hash does not match its values/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { (s.header as unknown as Record<string, unknown>).extra = 1; }), DIGEST)).toThrow(/header fields/);
    } finally { disposeDuel(d); }
  });
});
```

Run: `npx vitest run tests/duelSnapshot.test.ts`
Expected: FAIL: the file does not load (`../src/renderer/src/sim/duel/snapshot` does not exist yet).

- [ ] **Step 2: The snapshot and the end summary**

Create `src/renderer/src/sim/duel/snapshot.ts`:

```ts
// The duel snapshot (engine refactor spec §6, an R-1 deliverable). The values are exactly flattenDuel: SIM_VERSION, the
// tactical state in flattenTactical's order, presence, repair, then the interior through the sector snapshot path.
// Regenerated, not stored: the map (from the seed, checked by mapHash), the broad-phase grid, the repair points and
// Derived (from the Cutter layout). Not stored: the per-tick events. Every check runs before any allocation, except
// the final one, which restores into a fresh duel and requires hashDuel to equal the hash the header records.
import { hashF64 } from '../../../../shared/hash';
import { canonicalFields } from '../canonicalFields';
import { deriveLayout } from '../ship/derived';
import type { ShipLayout } from '../ship/schema';
import { validateCanonicalValues } from '../snapshotValidation';
import { validateMap } from '../tactical/map';
import { createTacticalState } from '../tactical/state';
import { tacticalLength } from '../tactical/hash';
import { SIM_VERSION } from '../tuning';
import { flattenDuel, hashDuel, mapHash } from './hash';
import { unflattenDuelModules } from './modules';
import { createDuel, disposeDuel, type DuelState } from './state';

export const DUEL_SNAPSHOT_FORMAT = 1;
export const DUEL_PLAYERS = 2;
export interface DuelSnapshotHeader {
  snapshotFormat: typeof DUEL_SNAPSHOT_FORMAT; simVersion: number; contentDigest: string;
  /** The encounter tick (the interior and the tactical tick, which are always equal) and the player count (2). */
  tick: number; playerCount: number;
  layoutId: string; layoutHash: string; seed: number;
  /** hashF64 of the map's canonical values (mapHash), recomputed from the seed on restore. */
  mapHash: string;
  /** hashDuel of the stored state, which the restored duel must reproduce. */
  hash: string;
}
export interface DuelSnapshot { header: DuelSnapshotHeader; values: number[] }

const HEADER_KEYS = ['snapshotFormat', 'simVersion', 'contentDigest', 'tick', 'playerCount', 'layoutId', 'layoutHash', 'seed', 'mapHash', 'hash'];

export function saveDuelSnapshot(d: DuelState, contentDigest: string): DuelSnapshot {
  const values = Array.from(flattenDuel(d));
  return { header: { snapshotFormat: DUEL_SNAPSHOT_FORMAT, simVersion: SIM_VERSION, contentDigest, tick: d.interior.tick, playerCount: DUEL_PLAYERS,
    layoutId: d.interior.layout.id, layoutHash: d.interior.derived.layoutHash, seed: d.tactical.seed, mapHash: mapHash(d.tactical.map), hash: hashF64(Float64Array.from(values)) }, values };
}

/** Validate a portable duel snapshot without allocating a duel: header, versions, digest, layout, map, value count,
 *  the interior's canonical values, equal ticks, and the recorded hash over the values. Returns an owned copy. */
export function validateDuelSnapshot(layout: ShipLayout, value: unknown, contentDigest: string): DuelSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('duel snapshot must be an object');
  const snap = value as Record<string, unknown>;
  if (Object.keys(snap).sort().join(',') !== 'header,values') throw new Error('duel snapshot fields do not match');
  const h = snap.header as Record<string, unknown> | null;
  if (!h || typeof h !== 'object' || Object.keys(h).length !== HEADER_KEYS.length || HEADER_KEYS.some((k) => !Object.hasOwn(h, k))) throw new Error('duel snapshot header fields do not match');
  if (h.snapshotFormat !== DUEL_SNAPSHOT_FORMAT) throw new Error(`duel snapshot format ${String(h.snapshotFormat)} not supported (expected ${DUEL_SNAPSHOT_FORMAT})`);
  if (h.simVersion !== SIM_VERSION) throw new Error('duel snapshot sim version does not match');
  if (h.contentDigest !== contentDigest) throw new Error('duel snapshot content digest does not match');
  const derived = deriveLayout(layout);
  if (h.layoutId !== layout.id || h.layoutHash !== derived.layoutHash) throw new Error('duel snapshot layout does not match');
  if (h.playerCount !== DUEL_PLAYERS) throw new Error('duel snapshot player count is invalid');
  if (typeof h.tick !== 'number' || !Number.isSafeInteger(h.tick) || h.tick < 0) throw new Error('duel snapshot tick is invalid');
  if (typeof h.seed !== 'number' || !Number.isInteger(h.seed) || h.seed < 0 || h.seed > 0xffffffff) throw new Error('duel snapshot seed is invalid');
  if (typeof h.mapHash !== 'string' || typeof h.hash !== 'string') throw new Error('duel snapshot hashes are invalid');
  const tactical = createTacticalState(h.seed);   // the map and grid only: no interior allocation
  if (validateMap(tactical.map).length > 0) throw new Error('duel snapshot seed makes an invalid map');
  if (mapHash(tactical.map) !== h.mapHash) throw new Error('duel snapshot map does not match its seed');
  if (!Array.isArray(snap.values) || snap.values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('duel snapshot values must be finite numbers');
  const values = (snap.values as number[]).map((v) => (v === 0 ? 0 : v));
  const fields = canonicalFields(layout, DUEL_PLAYERS), last = fields[fields.length - 1]!, interiorCount = last.offset + last.count;
  const space = tacticalLength(tactical), interiorAt = 1 + space + 2 + 3;
  if (values.length !== interiorAt + interiorCount) throw new Error('duel snapshot length does not match the layout and map');
  if (values[0] !== SIM_VERSION) throw new Error('duel snapshot sim version does not match its values');
  if (values[2] !== h.seed) throw new Error('duel snapshot seed does not match its values');
  validateCanonicalValues(layout, derived, DUEL_PLAYERS, values.slice(interiorAt));
  const interiorTick = values[interiorAt + fields.find((f) => f.name === 'tick')!.offset];
  if (values[1] !== h.tick || interiorTick !== h.tick) throw new Error('duel snapshot interior and tactical ticks differ from the header');
  if (hashF64(Float64Array.from(values)) !== h.hash) throw new Error('duel snapshot hash does not match its values');
  return { header: { snapshotFormat: DUEL_SNAPSHOT_FORMAT, simVersion: SIM_VERSION, contentDigest, tick: h.tick, playerCount: DUEL_PLAYERS,
    layoutId: layout.id, layoutHash: derived.layoutHash, seed: h.seed, mapHash: h.mapHash, hash: h.hash }, values };
}

/** Construct a duel from a snapshot: a fresh duel from its seed, every module written back, then the restored state's
 *  ticks and hashDuel checked against the header. Releases the duel on any failure. */
export function loadDuelSnapshot(layout: ShipLayout, value: unknown, contentDigest: string): DuelState {
  const snap = validateDuelSnapshot(layout, value, contentDigest);
  const d = createDuel(layout, snap.header.seed);
  try {
    if (unflattenDuelModules(d, snap.values, 1) !== snap.values.length) throw new Error('duel snapshot length does not match');
    if (d.interior.tick !== d.tactical.tick) throw new Error('duel snapshot interior and tactical ticks differ');
    if (hashDuel(d) !== snap.header.hash) throw new Error('restored duel hash does not match the snapshot');
    return d;
  } catch (error) { disposeDuel(d); throw error; }
}
```

Create `src/renderer/src/sim/duel/summary.ts`:

```ts
// The duel's end summary (engine refactor spec §6): a plain, frozen value computed once when the duel ends, from the
// telemetry accumulator. Per-ship pairs are [crew ship, enemy ship]; repairsFinished is per player. `terminal` keeps the
// accumulator's per-ship cause arrays as they are (one tick can kill a ship several ways), each in TERMINAL_CAUSES
// order without duplicates, and empty for a ship that survived.
import type { DuelTelemetry, TerminalCause } from './telemetry';

/** The accumulator's order of terminal causes (telemetry.ts recordTick). */
export const TERMINAL_CAUSES: readonly TerminalCause[] = ['planet', 'asteroid', 'ship', 'laser', 'missile'];
type Pair = readonly [number, number];
export interface DuelEndSummary {
  readonly outcome: number; readonly ticks: number;
  readonly terminal: readonly [readonly TerminalCause[], readonly TerminalCause[]];
  readonly laserReleases: Pair; readonly laserHits: Pair; readonly missilesLaunched: Pair; readonly missileHits: Pair;
  readonly repairsFinished: Pair;
}

const pair = (f: (i: 0 | 1) => number): readonly [number, number] => Object.freeze([f(0), f(1)] as [number, number]);
export function duelEndSummary(t: DuelTelemetry): DuelEndSummary {
  const ship = (i: 0 | 1) => t.ships[i];
  return Object.freeze({
    outcome: t.outcome, ticks: t.ticks,
    terminal: Object.freeze([Object.freeze([...t.terminal[0]]), Object.freeze([...t.terminal[1]])] as [TerminalCause[], TerminalCause[]]),
    laserReleases: pair((i) => ship(i).laserReleases), laserHits: pair((i) => ship(i).laserHits),
    missilesLaunched: pair((i) => ship(i).missilesLaunched),
    missileHits: pair((i) => ship(i).missileHitsByRoom[0] + ship(i).missileHitsByRoom[1] + ship(i).missileHitsByRoom[2]),
    repairsFinished: pair((i) => t.players[i].repairsFinished)
  });
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/duelSnapshot.test.ts tests/duelModules.test.ts tests/boundary.test.ts`
Expected: PASS, 126 tests in 3 files.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/duel/snapshot.ts src/renderer/src/sim/duel/summary.ts tests/duelSnapshot.test.ts
git commit -q -m "feat(duel): the duel snapshot codec with its map-hash header, validated before allocation, and the end summary (engine refactor R-1b)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 3: The duel rules, checkpoint and codec; replays by mode

**Files:**
- Create: `src/renderer/src/authority/duelCheckpoint.ts`, `src/renderer/src/authority/duelRules.ts`, `tests/helpers/duelAuthority.ts`, `tests/duelCheckpoint.test.ts`
- Modify (whole file): `src/renderer/src/net/codec.ts`, `src/renderer/src/net/contracts.ts`, `src/renderer/src/authority/replay.ts`, `src/renderer/src/app/session.ts`

**Interfaces:**
- Consumes: R-1a's `EncounterRules`, `createEncounterCore`, `createEncounterAuthority`, `runEncounterReplay`, `replayMode`, `createLedger`, `jsonModeCodecs`; Task 2's snapshot and summary; `stepDuelTick`, `createTelemetry`, `recordTick`; `createScriptedPair`, `scriptedInput`.
- Produces:
  - `duelCheckpoint.ts`: `interface DuelInit { runId; layoutId; layoutHash; simVersion; contentDigest; seed; playerCount }`; `type DuelControllers = readonly never[]`; `interface DuelMemory { version: 1; telemetry }`; `type DuelCheckpoint`; `duelInitSchema`, `duelMemorySchema`; `encodeDuelMemory`, `decodeDuelMemory`; `validateDuelInit(layout, value, contentDigest)`; `validateDuelCheckpoint(value, contentDigest, resolveLayout)`.
  - `duelRules.ts`: `interface DuelSession { duel; telemetry; summary }`; `interface DuelTypes`; `duelRules: EncounterRules<DuelTypes>`.
  - `codec.ts`: `duelCodec: CommandCodec<DuelSnapshot>`; `duelPublicationSchema`; the `ended` record union gains `{ mode: 'duel', record: DuelEndSummary | null }`.
  - `contracts.ts`: `EndRecord` gains the duel variant.
  - `replay.ts`: `runModeReplay(value, contentDigest, resolveLayout, options?)`.
  - `tests/helpers/duelAuthority.ts`: `resolveCutter`, `duelInit(seed, runId?)`, `createDriver(seed)`, `duelCore(init, restored?)`, `stepScripted(h, driver)`, `throughBytes(cp)`.

- [ ] **Step 1: Write the failing test and its driver**

Create `tests/helpers/duelAuthority.ts`:

```ts
// A duel run through the generic authority core (engine refactor spec §6, R-1b): the scripted pair's held axes and
// commands enter as journal frames, exactly as a live binding's would, so the run exercises the ledger, the duel codec,
// the rules' step, cues, end record, snapshot and checkpoint. Shared by the duel snapshot, replay and size tests.
import { createEncounterCore } from '../../src/renderer/src/authority/core';
import { duelRules, type DuelTypes } from '../../src/renderer/src/authority/duelRules';
import type { DuelCheckpoint, DuelInit } from '../../src/renderer/src/authority/duelCheckpoint';
import type { CheckpointOf } from '../../src/renderer/src/authority/rules';
import type { CommandEnvelope, HeldInput } from '../../src/renderer/src/net/contracts';
import { createScriptedPair, scriptedInput, type ScriptedPair } from '../../src/renderer/src/sim/duel/scripted';
import { deriveLayout } from '../../src/renderer/src/sim/ship/derived';
import type { ReplayAction, ReplayFrame } from '../../src/renderer/src/sim/replay';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { CUTTER } from './scriptedDuel';

export const resolveCutter = (id: string) => { if (id !== CUTTER.id) throw Error('unknown duel layout'); return CUTTER; };
export function duelInit(seed: number, runId = `duel-${seed}`): DuelInit {
  return { runId, layoutId: CUTTER.id, layoutHash: deriveLayout(CUTTER).layoutHash, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed, playerCount: 2 };
}
const deps = (init: DuelInit) => ({ init, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: resolveCutter,
  clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash(record: { error: string }) { throw Error(record.error); } });

/** The producer side: the scripted pair plus the per-player sequences, held sequences and receive order it has used. */
export interface DuelDriver { pair: ScriptedPair; sequences: [number, number]; heldSequences: [number, number]; held: HeldInput[]; order: number }
export function createDriver(seed: number): DuelDriver {
  return { pair: createScriptedPair(seed), sequences: [0, 0], heldSequences: [0, 0], held: [0, 1].map(() => ({ moveX: 0, moveY: 0, interactHeld: false })), order: 0 };
}

export function duelCore(init: DuelInit, restored?: DuelCheckpoint) {
  const state = restored ? duelRules.restore(restored.snapshot, resolveCutter, restored.modeMemory) : duelRules.create(init, resolveCutter);
  const core = createEncounterCore(duelRules, deps(init), state, restored as CheckpointOf<DuelTypes> | undefined);
  return { core, state, init };
}
export type DuelCore = ReturnType<typeof duelCore>;

/** One tick: the pair reads the duel, its held axes and commands are admitted as one journal frame, then the tick runs.
 *  Returns the frames the core produced (admission, then tick). */
export function stepScripted(h: DuelCore, driver: DuelDriver): ReplayFrame[] {
  const tick = duelRules.tick(h.state), input = scriptedInput(driver.pair, h.state.duel), frames: ReplayFrame[] = [];
  const entries: Extract<ReplayAction, { kind: 'admission' }>['entries'] = [];
  for (const player of [0, 1] as const) {
    const next = input.held[player] ?? { moveX: 0, moveY: 0, interactHeld: false }, prev = driver.held[player]!;
    if (next.moveX === prev.moveX && next.moveY === prev.moveY && next.interactHeld === prev.interactHeld) continue;
    driver.held[player] = { ...next };
    entries.push({ binding: 1, players: [0, 1], order: ++driver.order, message: { kind: 'held', frame: { runId: h.init.runId, player, tick, sequence: ++driver.heldSequences[player], held: { ...next } } } });
  }
  const commands: CommandEnvelope[] = input.commands.map((e) => ({ runId: h.init.runId, id: { player: e.id.player, sequence: ++driver.sequences[e.id.player as 0 | 1] }, requestedTick: tick, command: e.command }));
  for (const envelope of commands) entries.push({ binding: 1, players: [0, 1], order: ++driver.order, message: { kind: 'command', envelope } });
  const run = (action: ReplayAction) => frames.push(h.core.replayFrame({ tick: duelRules.tick(h.state), eventSequenceBefore: h.core.cursors().eventSequence, action, results: [], events: [] }));
  if (entries.length) run({ kind: 'admission', entries });
  run({ kind: 'tick', input: { held: driver.held.map((x) => ({ ...x })), commands }, heldSequences: [...driver.heldSequences] });
  return frames;
}

/** A checkpoint carried through JSON bytes and the duel validator, as a re-host would see it. */
export function throughBytes(cp: unknown): DuelCheckpoint {
  return duelRules.validateCheckpoint(JSON.parse(JSON.stringify(cp)), __GAMEPLAY_CONTENT_DIGEST__, resolveCutter) as DuelCheckpoint;
}
```

Create `tests/duelCheckpoint.test.ts`:

```ts
// The duel checkpoint through the generic authority core (engine refactor spec §6, R-1b): the continuation proof with
// the end summary, duel replays, the size bound and checkpoint validation; and the duel codec's command kinds.
import { describe, expect, it } from 'vitest';
import { createEncounterAuthority } from '../src/renderer/src/authority/authority';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import { runModeReplay, replayMode } from '../src/renderer/src/authority/replay';
import { MAX_HOST_BYTES } from '../src/shared/netSession';
import type { DuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { jsonModeCodecs } from '../src/network/modes/encounterMode';
import { createDriver, duelCore, duelInit, resolveCutter, stepScripted, throughBytes, type DuelCore } from './helpers/duelAuthority';
import type { ReplayFrame } from '../src/renderer/src/sim/replay';
import type { CommandEnvelope } from '../src/renderer/src/net/contracts';
import { duelCodec } from '../src/renderer/src/net/codec';
import { DUEL_MODULES } from '../src/renderer/src/sim/duel/modules';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
/** Seed 7's scripted duel is a crew loss at tick 8832 (H-0c-ii-a decision 2), short enough to run to its end twice. */
const SEED = 7, SPLIT = 6000;
function runToEnd(h: DuelCore, driver: ReturnType<typeof createDriver>, hashes: string[], frames: ReplayFrame[] = [], until = Infinity) {
  while (!duelRules.terminal(h.state, h.init).ended && duelRules.tick(h.state) < until) {
    for (const frame of stepScripted(h, driver)) { frames.push(frame); if (frame.action.kind === 'tick') hashes.push(frame.after!.hash); }
  }
}

describe('the duel checkpoint through the generic core (spec §6)', () => {
  it('continuation proof: N ticks, checkpoint through bytes, restore, M ticks equals N + M uninterrupted, end summary included', () => {
    const reference = duelCore(duelInit(SEED)), referenceHashes: string[] = [];
    const split = duelCore(duelInit(SEED)), splitHashes: string[] = [], driver = createDriver(SEED);
    try {
      runToEnd(reference, createDriver(SEED), referenceHashes);
      runToEnd(split, driver, splitHashes, [], SPLIT);
      const cp = throughBytes(split.core.captureCheckpoint());
      expect(cp.snapshot.header.tick).toBe(SPLIT);
      expect(cp).toHaveProperty('modeMemory.version', 1);
      const resumed = duelCore(cp.init, cp);
      try {
        expect(duelRules.hash(resumed.state)).toBe(splitHashes.at(-1));
        runToEnd(resumed, driver, splitHashes);
        expect(splitHashes).toEqual(referenceHashes);
        const end = duelRules.terminal(reference.state, reference.init);
        expect(end.ended).toBe(true);
        expect(duelRules.terminal(resumed.state, resumed.init)).toEqual(end);
        expect(end.endRecord).toEqual({ mode: 'duel', record: { outcome: Outcome.EnemyWins, ticks: referenceHashes.length,
          terminal: expect.any(Array), laserReleases: expect.any(Array), laserHits: expect.any(Array), missilesLaunched: expect.any(Array), missileHits: expect.any(Array), repairsFinished: expect.any(Array) } });
        expect(Object.isFrozen(end.endRecord!.record)).toBe(true);
        expect(referenceHashes.length).toBeGreaterThan(SPLIT);
        console.log(`continuation proof: seed ${SEED}, ${SPLIT} + ${referenceHashes.length - SPLIT} ticks; summary ${JSON.stringify(end.endRecord!.record)}`);
      } finally { resumed.core.dispose(); }
    } finally { reference.core.dispose(); split.core.dispose(); }
  }, 120_000);
  it('a recorded duel replay re-runs to the same final hash; a live authority replay names its mode', () => {
    const h = duelCore(duelInit(5)), driver = createDriver(5), hashes: string[] = [], frames: ReplayFrame[] = [];
    try {
      const initial = h.core.captureCheckpoint();
      runToEnd(h, driver, hashes, frames, 1500);
      const replay = { version: 2, mode: 'duel', init: initial.init, initial: initial.snapshot, checkpoint: initial, frames };
      const result = runModeReplay(JSON.parse(JSON.stringify(replay)), DIGEST, resolveCutter);
      expect(result.hashes).toEqual(hashes);
      expect(result.hashes.at(-1)).toBe(duelRules.hash(h.state));
      expect(() => runModeReplay({ ...replay, mode: 'sector' }, DIGEST, resolveCutter)).toThrow();
    } finally { h.core.dispose(); }
    let now = 0;
    const live = createEncounterAuthority(duelRules, { contentDigest: DIGEST, resolveLayout: resolveCutter, clock: { nowMs: () => now },
      scheduler: { schedule: () => () => {} }, onCrash(r) { throw Error(r.error); } });
    try {
      live.start(duelInit(9));
      for (let k = 1; k <= 90; k++) { now = k * 1000 / 60 + 0.01; live.pump(); }
      const recorded = live.replay();
      expect(replayMode(recorded)).toBe('duel');
      const rerun = runModeReplay(JSON.parse(JSON.stringify(recorded)), DIGEST, resolveCutter), ticks = recorded.frames.filter((f) => f.action.kind === 'tick');
      expect(ticks.length).toBeGreaterThan(80);
      expect(rerun.hashes).toEqual(ticks.map((f) => f.after!.hash));
      expect((rerun.checkpoint.snapshot as DuelSnapshot).header.hash).toBe(live.checkpoint([]).snapshot.header.hash);
    } finally { live.dispose(); }
  }, 60_000);
  it('size: a checkpoint at the duel\'s largest state stays far under MAX_HOST_BYTES', () => {
    const h = duelCore(duelInit(1)), driver = createDriver(1);
    try {
      runToEnd(h, driver, [], [], 2400);
      const t = h.state.duel.tactical, third = 1 / 3;
      for (const [i, ship] of t.ships.entries()) { ship.rooms = [2, 2, 2]; ship.x += third; ship.y -= third; ship.vx = third * (i + 1); }
      t.missiles = [0, 1].map((i) => ({ x: 1234.567891234567 + i, y: -987.6543210987654, vx: third, vy: -third, heading: 17, headingAcc: third, age: 211 })) as typeof t.missiles;
      h.state.duel.repair = [959, 481, 7];
      const cp = h.core.captureCheckpoint(), bytes = jsonModeCodecs(duelRules, resolveCutter, 'duel').encodeCheckpoint(cp);
      expect(bytes.length).toBeLessThan(MAX_HOST_BYTES);
      expect(throughBytes(cp).snapshot.header.hash).toBe(duelRules.hash(h.state));
      console.log(`duel checkpoint at its largest state: ${bytes.length} bytes (${(bytes.length / 1024).toFixed(1)} KiB of ${MAX_HOST_BYTES / 1024} KiB), ${cp.snapshot.values.length} values`);
    } finally { h.core.dispose(); }
  });
  it('restore validation: a checkpoint whose telemetry, phase or seed disagrees is refused', () => {
    const h = duelCore(duelInit(4)), driver = createDriver(4);
    try {
      runToEnd(h, driver, [], [], 300);
      const cp = JSON.parse(JSON.stringify(h.core.captureCheckpoint()));
      expect(() => throughBytes({ ...cp, modeMemory: { ...cp.modeMemory, version: 2 } })).toThrow();
      expect(() => throughBytes({ ...cp, modeMemory: { ...cp.modeMemory, telemetry: { ...cp.modeMemory.telemetry, ticks: 299 } } })).toThrow(/telemetry/);
      expect(() => throughBytes({ ...cp, phase: 'ended' })).toThrow(/terminal phase/);
      expect(() => throughBytes({ ...cp, init: { ...cp.init, seed: 5 } })).toThrow(/seed/);
      expect(() => throughBytes({ ...cp, botControllers: [{}] })).toThrow();
      const { modeMemory: _memory, ...noMemory } = cp;
      expect(() => throughBytes(noMemory)).toThrow();
      expect(() => duelRules.restore(cp.snapshot, resolveCutter)).toThrow(/telemetry memory/);
    } finally { h.core.dispose(); }
  });
  it('the duel codec admits exactly the duel modules\' command kinds plus the core\'s setPaused', () => {
    const codec = duelCodec(2), envelope = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    const examples: Record<string, unknown> = { sit: { kind: 'sit', station: 0 }, stand: { kind: 'stand' }, presence: { kind: 'presence', present: true },
      laserLock: { kind: 'laserLock', room: 1 }, laserCharge: { kind: 'laserCharge', held: true }, missileLaunch: { kind: 'missileLaunch' } };
    const kinds = DUEL_MODULES.flatMap(({ module }) => [...module.commands]);
    expect(kinds.sort()).toEqual(Object.keys(examples).sort());
    for (const command of [...kinds.map((k) => examples[k]), { kind: 'setPaused', paused: true }]) expect(codec.decodeMessage(codec.encodeMessage(envelope(command)))).toEqual(envelope(command));
    for (const command of [{ kind: 'moveTo', tile: 3 }, { kind: 'fire', station: 0 }, { kind: 'presence' }]) expect(() => codec.encodeMessage(envelope(command))).toThrow();
  });
});
```

Run: `npx vitest run tests/duelCheckpoint.test.ts`
Expected: FAIL: the file does not load (`../src/renderer/src/authority/duelRules` does not exist yet).

- [ ] **Step 2: The duel's wire and end record**

Replace the whole of `src/renderer/src/net/contracts.ts` with:

```ts
import type { Snapshot } from '../sim/snapshot';
import type { TelemetryRecord } from '../sim/telemetry';
import type { DuelEndSummary } from '../sim/duel/summary';

export type PeerId = string;
export type RunId = string;
export type PlayerId = number; // bounded by the configured player limit, never an ECS entity ID
export type StationId = number;
export type ChannelKind = 'reliable-ordered' | 'unreliable-latest';
export type Unsubscribe = () => void;
export interface TransportCaps { unreliable: boolean; maxDatagram: number; hidesPeerIp: boolean; p2p: boolean }
export interface LinkStats { rttMs: number; lossPct: number; relayed: boolean; bufferedBytes: number }
export interface Link {
  readonly peer: PeerId;
  readonly caps: TransportCaps;
  send(kind: ChannelKind, bytes: Uint8Array): void;
  onMessage(cb: (kind: ChannelKind, bytes: Uint8Array) => void): Unsubscribe;
  onClose(cb: (reason: string) => void): Unsubscribe;
  stats(): LinkStats;
  close(reason: string): void;
}
export interface HostOpts { protocolVersion: number; contentDigest: string }
export interface Compatibility extends HostOpts { simVersion: number }
export interface Session {
  readonly links: readonly Link[];
  host(opts: HostOpts): Promise<{ joinCode: string }>;
  join(code: string, seatToken?: string): Promise<void>;
  onLink(cb: (link: Link) => void): Unsubscribe;
  onLinkLost(cb: (peer: PeerId) => void): Unsubscribe;
  close(reason: string): void;
}
export interface HeldInput { moveX: number; moveY: number; interactHeld: boolean }
export interface HeldFrame { runId: RunId; player: PlayerId; tick: number; sequence: number; held: HeldInput }
export interface LifecyclePause { paused: boolean; reason: string }
export interface CommandId { player: PlayerId; sequence: number }
export type TargetRef = { kind: 'object'; stableId: number } | { kind: 'enemy'; stableId: number; room: number };
export interface VisitRef { sector: number; beacon: number; arrivalTick: number }
export interface EventRef { visit: VisitRef; eventId: number }
export interface JumpRef { visit: VisitRef; requestedAtTick: number; destination: number }
export interface WeaponRef { selector: number; expectedWeaponId: number }
/** The sector's commands. `sit` and `stand` are shared with the duel. */
export type SectorCommand =
  | { kind: 'moveTo'; tile: number }
  | { kind: 'sit'; station: StationId }
  | { kind: 'stand' }
  | { kind: 'toggleDoorLocal'; edge: number }
  | { kind: 'doorCycle'; station: StationId; edge: number; mode: 'cycle' | 'seal' }
  | { kind: 'airlockToggle'; station: StationId; airlock: number }
  | { kind: 'power'; station: StationId; target: StationId; delta: -1 | 1 }
  | { kind: 'coolant'; station: StationId; target: StationId }
  | { kind: 'buyUpgrade'; station: StationId; system: number; expectedLevel: number }
  | { kind: 'buyReactor'; station: StationId; expectedBonus: number }
  | { kind: 'selectWeapon'; station: StationId; weapon: WeaponRef }
  | { kind: 'selectTarget'; station: StationId; target: TargetRef | null }
  | { kind: 'fire'; station: StationId; weapon: WeaponRef; target: TargetRef }
  | { kind: 'swapCargo'; station: StationId; slot: number; expectedCargo: number; expectedEquipped: number }
  | { kind: 'scan'; station: StationId; target: TargetRef }
  | { kind: 'systemScan'; station: StationId; visit: VisitRef }
  | { kind: 'lockFrequency'; station: StationId; enemyId: number }
  | { kind: 'vote'; event: EventRef; choice: number }
  | { kind: 'jumpAgree'; pending: JumpRef }
  | { kind: 'buy'; station: StationId; visit: VisitRef; item: number; expectedOffer: number }
  | { kind: 'jump'; station: StationId; visit: VisitRef; destination: number }
  | { kind: 'sectorJump'; station: StationId; visit: VisitRef }
  | { kind: 'wait'; station: StationId; visit: VisitRef }
  | { kind: 'evade'; station: StationId }
  | { kind: 'tab'; group: number; station: StationId }
  | { kind: 'setPaused'; paused: boolean };
/** The duel's commands (Helm demo spec §13). Each mode's codec admits only its own kinds (net/codec.ts). */
export type DuelCommand =
  | { kind: 'sit'; station: StationId }
  | { kind: 'stand' }
  | { kind: 'presence'; present: boolean }
  | { kind: 'laserLock'; room: number }
  | { kind: 'laserCharge'; held: boolean }
  | { kind: 'missileLaunch' }
  | { kind: 'setPaused'; paused: boolean };
/** The one command union (engine refactor spec §6): every mode's kinds; `setPaused` is the core's control. */
export type Command = SectorCommand | DuelCommand;
export interface CommandEnvelope<C extends Command = Command> { runId: RunId; id: CommandId; requestedTick: number; command: C }
/** The shared base reasons, then the duel's (spec §6: the enum is closed, so every module's reasons join it). */
export const COMMAND_REASONS = [
  'wrong-run', 'unowned', 'malformed', 'expected-sequence', 'stale-tick', 'over-capacity',
  'invalid-seat', 'stale-target', 'unavailable', 'unsupported', 'conflicting-duplicate',
  'not-in-duel', 'not-at-weapons', 'missile-in-flight'
] as const;
export type CommandReason = typeof COMMAND_REASONS[number];
/** The one result type for every mode. `already-processed` comes only from the ledger; `admission` is wire-only
 *  receive-time metadata (commandOutbox.ts) and never enters the ledger's result cache. */
export interface CommandResult {
  id: CommandId; tick: number; status: 'applied' | 'noop' | 'rejected' | 'already-processed'; reason?: CommandReason;
  admission?: { expectedSequence: number; disposition: 'terminal' | 'retryable' };
}
export type Admission = { status: 'queued' } | { status: 'duplicate' | 'rejected'; result: CommandResult };
export type ClientAuxMessage = { kind: 'callout'; runId: RunId; player: PlayerId; sequence: number; calloutKind: 'contextual' };
// Data-only event cue names shared with pure derivation.
export type Cue = 'alarm' | 'impact' | 'shot' | 'hit' | 'ready' | 'jump' | 'upgrade' | 'victory' | 'defeat' | 'callout';
/** The authority's end record, tagged on the wrapper by mode (spec §6). The sector record is unchanged; the duel's
 *  is its frozen end summary (null only if the duel ended without one). */
export type EndRecord = { mode: 'sector'; record: TelemetryRecord } | { mode: 'duel'; record: DuelEndSummary | null };
export interface AuthorityEvent {
  runId: RunId; eventSequence: number; tick: number;
  payload:
    | { kind: 'cue'; cue: Cue }
    | { kind: 'callout'; player: PlayerId; text: string; station: number | null }
    | { kind: 'pause'; paused: boolean; owner: PlayerId | null; reason: string }
    | { kind: 'ended'; record: EndRecord };
}
export interface PublishedState<S = Snapshot> {
  runId: RunId; tick: number; publicationSequence: number; snapshot: S; hash: string;
  phase: 'running' | 'paused' | 'ended' | 'error'; pauseOwner: PlayerId | null; controlRevision: number;
  pauseReason: string | null; lagTicks: number; tickTimeMs: number | null;
  // Highest admitted per-player IDs; zero means no input in that stream yet.
  commandHighWater: readonly number[]; heldHighWater: readonly number[]; auxiliaryHighWater: readonly number[]; eventSequence: number;
}
export type ClientMessage = { kind: 'held'; frame: HeldFrame } | { kind: 'command'; envelope: CommandEnvelope } | ClientAuxMessage;
export type AuthorityMessage<S = Snapshot> =
  | { kind: 'state'; state: PublishedState<S> }
  | { kind: 'result'; runId: RunId; result: CommandResult }
  | { kind: 'event'; event: AuthorityEvent };
export interface RunInit {
  runId: RunId; layoutId: string; layoutHash: string; simVersion: number; contentDigest: string; seed: number;
  playerCount: number; characters: readonly number[]; unlocked: readonly string[]; quirk?: number;
}
export interface MonotonicClock { nowMs(): number }
export interface Scheduler { schedule(delayMs: number, cb: () => void): Unsubscribe }

/** Durable authority envelope; no auxiliary request or presentation history. Generic over the mode's init, producer
 *  memory and snapshot; the defaults are the sector's. `modeMemory` is present only for a mode that keeps memory
 *  outside the hash (the duel's telemetry), so a sector checkpoint is unchanged. */
export interface Checkpoint<Init = RunInit, CM = import('../clientControl/cardController').CardUiState[], S = Snapshot> {
  checkpointVersion: 2; init: Init; snapshot: S;
  commandHighWater: number[];
  recentResults: { envelope: CommandEnvelope; result: CommandResult }[];
  admissionTick: number; admissionCounts: number[];
  eventSequence: number; publicationSequence: number; controlRevision: number;
  receiveOrder: number; lifecycleOrdinal: number;
  botControllers: CM; paused: boolean;
  phase: PublishedState['phase']; pauseOwner: number | null; pauseReason: string | null;
  heldHighWater: number[]; held: HeldInput[];
  modeMemory?: unknown;
}
```

Replace the whole of `src/renderer/src/net/codec.ts` with:

```ts
import { MAX_PLAYERS } from '../../../shared/intent';
import { z } from 'zod';
import { COMMAND_REASONS } from './contracts';
import type { AuthorityMessage, ClientMessage, PublishedState } from './contracts';
import type { Snapshot } from '../sim/snapshot';
import type { DuelSnapshot } from '../sim/duel/snapshot';

// Bounds are wire resource limits. Layout/catalog membership remains execution validation.
export const MAX_MESSAGE_BYTES = 65_536;
export const MAX_INDEX = 65_535;
// Validate homogeneous numeric storage in one bounded pass instead of allocating a
// Zod effects context for every scalar. Both endpoints still validate every value.
const finiteValues = z.custom<number[]>((value) => {
  if (!Array.isArray(value) || value.length > MAX_MESSAGE_BYTES) return false;
  for (const n of value) if (typeof n !== 'number' || !Number.isFinite(n)) return false;
  return true;
}, 'invalid snapshot values')
  .transform((values) => values.map((n) => n === 0 ? 0 : n));
/** The wire primitives every mode's command and snapshot-header schemas are built from. */
function primitives(playerLimit: number) {
  return {
    uint: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    positive: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    index: z.number().int().min(0).max(MAX_INDEX),
    player: z.number().int().min(0).max(playerLimit - 1),
    text: z.string().min(1).max(128),
    u32: z.number().int().min(0).max(4_294_967_295),
    playerCount: z.number().int().min(1).max(playerLimit)
  };
}
type Primitives = ReturnType<typeof primitives>;
type CommandOption = z.ZodDiscriminatedUnionOption<'kind'>;
/** What one mode adds to the shared message schema: its command kinds and its snapshot header. */
interface ModeWire { commands(p: Primitives): [CommandOption, ...CommandOption[]]; snapshotHeader(p: Primitives): z.ZodTypeAny }
const sectorWire: ModeWire = {
  commands({ uint, positive, index }) {
    const visit = z.object({ sector: index, beacon: index, arrivalTick: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER) }).strict();
    const target = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('object'), stableId: positive }).strict(),
      z.object({ kind: z.literal('enemy'), stableId: positive, room: index }).strict()
    ]);
    const weapon = z.object({ selector: index, expectedWeaponId: index }).strict();
    const eventRef = z.object({ visit, eventId: index }).strict();
    const jump = z.object({ visit, requestedAtTick: uint, destination: index }).strict();
    return [
      z.object({ kind: z.literal('moveTo'), tile: index }).strict(),
      z.object({ kind: z.literal('sit'), station: index }).strict(),
      z.object({ kind: z.literal('stand') }).strict(),
      z.object({ kind: z.literal('toggleDoorLocal'), edge: index }).strict(),
      z.object({ kind: z.literal('doorCycle'), station: index, edge: index, mode: z.enum(['cycle', 'seal']) }).strict(),
      z.object({ kind: z.literal('airlockToggle'), station: index, airlock: index }).strict(),
      z.object({ kind: z.literal('power'), station: index, target: index, delta: z.union([z.literal(-1), z.literal(1)]) }).strict(),
      z.object({ kind: z.literal('coolant'), station: index, target: index }).strict(),
      z.object({ kind: z.literal('buyUpgrade'), station: index, system: index, expectedLevel: index }).strict(),
      z.object({ kind: z.literal('buyReactor'), station: index, expectedBonus: index }).strict(),
      z.object({ kind: z.literal('selectWeapon'), station: index, weapon }).strict(),
      z.object({ kind: z.literal('selectTarget'), station: index, target: target.nullable() }).strict(),
      z.object({ kind: z.literal('fire'), station: index, weapon, target }).strict(),
      z.object({ kind: z.literal('swapCargo'), station: index, slot: index, expectedCargo: index, expectedEquipped: index }).strict(),
      z.object({ kind: z.literal('scan'), station: index, target }).strict(),
      z.object({ kind: z.literal('systemScan'), station: index, visit }).strict(),
      z.object({ kind: z.literal('lockFrequency'), station: index, enemyId: positive }).strict(),
      z.object({ kind: z.literal('vote'), event: eventRef, choice: index }).strict(),
      z.object({ kind: z.literal('jumpAgree'), pending: jump }).strict(),
      z.object({ kind: z.literal('buy'), station: index, visit, item: index, expectedOffer: index }).strict(),
      z.object({ kind: z.literal('jump'), station: index, visit, destination: index }).strict(),
      z.object({ kind: z.literal('sectorJump'), station: index, visit }).strict(),
      z.object({ kind: z.literal('wait'), station: index, visit }).strict(),
      z.object({ kind: z.literal('evade'), station: index }).strict(),
      z.object({ kind: z.literal('tab'), group: index, station: index }).strict(),
      z.object({ kind: z.literal('setPaused'), paused: z.boolean() }).strict()
    ];
  },
  snapshotHeader({ uint, positive, text, u32, playerCount }) {
    return z.object({
      formatVersion: positive, simVersion: positive, contentDigest: z.string().regex(/^[0-9a-f]{64}$/), tick: uint,
      rngStates: z.object({ hazards: u32, director: u32, combat: u32, loot: u32, cosmetic: u32, map: u32, quirk: u32 }).strict(),
      layoutId: text, layoutHash: text, playerCount, manifest: z.array(text).min(1).max(128)
    }).strict();
  }
};
/** The duel's wire (engine refactor spec §6): its own command kinds plus the core's setPaused, and the duel snapshot
 *  header (sim/duel/snapshot.ts). */
const duelWire: ModeWire = {
  commands({ index }) {
    return [
      z.object({ kind: z.literal('sit'), station: index }).strict(),
      z.object({ kind: z.literal('stand') }).strict(),
      z.object({ kind: z.literal('presence'), present: z.boolean() }).strict(),
      z.object({ kind: z.literal('laserLock'), room: index }).strict(),
      z.object({ kind: z.literal('laserCharge'), held: z.boolean() }).strict(),
      z.object({ kind: z.literal('missileLaunch') }).strict(),
      z.object({ kind: z.literal('setPaused'), paused: z.boolean() }).strict()
    ];
  },
  snapshotHeader({ uint, positive, text, u32, playerCount }) {
    return z.object({
      snapshotFormat: z.literal(1), simVersion: positive, contentDigest: z.string().regex(/^[0-9a-f]{64}$/), tick: uint, playerCount,
      layoutId: text, layoutHash: text, seed: u32, mapHash: z.string().regex(/^[0-9a-f]{8}$/), hash: z.string().regex(/^[0-9a-f]{8}$/)
    }).strict();
  }
};
const TERMINAL_CAUSES = ['planet', 'asteroid', 'ship', 'laser', 'missile'] as const;
function messageSchemaFor(playerLimit: number, wire: ModeWire = sectorWire) {
const prims = primitives(playerLimit);
const { uint, positive, index, player, text, u32 } = prims;
const axis = z.number().finite().min(-1).max(1).transform((n) => n === 0 ? 0 : n);
const id = z.object({ player, sequence: positive }).strict();
const held = z.object({ moveX: axis, moveY: axis, interactHeld: z.boolean() }).strict();
const frame = z.object({ runId: text, player, tick: uint, sequence: positive, held }).strict();
const commandSchema = z.discriminatedUnion('kind', wire.commands(prims));
const envelope = z.object({ runId: text, id, requestedTick: uint, command: commandSchema }).strict();
const result = z.object({ id, tick: uint, status: z.enum(['applied', 'noop', 'rejected', 'already-processed']), reason: z.enum(COMMAND_REASONS).optional(),
  admission: z.object({ expectedSequence: positive, disposition: z.enum(['terminal', 'retryable']) }).strict().optional()
}).strict();
const snapshot = z.object({ header: wire.snapshotHeader(prims), values: finiteValues }).strict();
const stringList = z.array(text).max(128);
const seconds = z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER);
const recordMap = z.record(text, seconds).refine((r) => Object.keys(r).length <= 128, 'too many entries');
const lifeEvent = z.object({ who: text, seconds }).strict().nullable();
const telemetry = z.object({
  version: z.literal(1), simVersion: positive, seed: u32, playerCount: z.number().int().min(1).max(playerLimit), characters: z.array(text).min(1).max(playerLimit),
  endReason: z.enum(['hull', 'crew', 'victory', 'running']), durationSeconds: seconds, firstDown: lifeEvent, firstDeath: lifeEvent,
  stationsNeverManned: stringList, mannedSeconds: recordMap, longestIdleSeconds: z.array(seconds).max(playerLimit),
  spawns: z.object({ fire: uint, breach: uint, power: uint, debris: uint }).strict(),
  impacts: uint, evadeRolls: uint, evasions: uint, shots: uint, hits: uint,
  repairs: z.object({ fire: uint, breach: uint, power: uint }).strict(), maxStress: seconds,
  phaseEntries: z.object({ buildUp: uint, sustainPeak: uint, peakFade: uint, relax: uint }).strict(),
  enemy: z.object({ met: uint, destroyed: uint, disables: uint, fled: uint, surrenders: uint, shieldHits: uint }).strict(),
  boarders: z.object({ parties: uint, killed: uint, vented: uint }).strict(),
  run: z.object({ nodesReached: uint, jumps: uint, columns: uint, scrap: z.object({ earned: uint, spent: uint }).strict(),
    events: uint, purchases: uint, upgrades: z.record(text, index).refine((r) => Object.keys(r).length <= 128, 'too many upgrades'),
    reactorBonus: index, quirk: text, unlocks: stringList }).strict(),
  teamwork: z.object({ lockedShots: uint, teamSeconds: seconds, revives: uint, timedEvades: uint, votesUnanimous: uint, votesSplit: uint }).strict(),
  score: seconds, skills: z.array(z.array(index).max(128)).max(playerLimit)
}).strict();
const pair = z.tuple([uint, uint]);
const causes = z.array(z.enum(TERMINAL_CAUSES)).max(TERMINAL_CAUSES.length)
  .refine((list) => list.every((c, k) => k === 0 || TERMINAL_CAUSES.indexOf(list[k - 1]!) < TERMINAL_CAUSES.indexOf(c)), 'terminal causes out of order or repeated');
const duelSummary = z.object({ outcome: z.number().int().min(0).max(3), ticks: uint, terminal: z.tuple([causes, causes]),
  laserReleases: pair, laserHits: pair, missilesLaunched: pair, missileHits: pair, repairsFinished: pair }).strict();
const payload = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cue'), cue: z.enum(['alarm', 'impact', 'shot', 'hit', 'ready', 'jump', 'upgrade', 'victory', 'defeat', 'callout']) }).strict(),
  z.object({ kind: z.literal('callout'), player, text: z.string().min(1).max(256), station: index.nullable() }).strict(),
  z.object({ kind: z.literal('pause'), paused: z.boolean(), owner: player.nullable(), reason: text }).strict(),
  z.object({ kind: z.literal('ended'), record: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('sector'), record: telemetry }).strict(),
    z.object({ mode: z.literal('duel'), record: duelSummary.nullable() }).strict()
  ]) }).strict()
]);
const state = z.object({
  runId: text, tick: uint, publicationSequence: positive, snapshot, hash: text, phase: z.enum(['running', 'paused', 'ended', 'error']),
  pauseOwner: player.nullable(), controlRevision: uint, pauseReason: text.nullable(), lagTicks: uint, tickTimeMs: seconds.nullable(),
  commandHighWater: z.array(uint).min(1).max(playerLimit), heldHighWater: z.array(uint).min(1).max(playerLimit), auxiliaryHighWater: z.array(uint).min(1).max(playerLimit), eventSequence: uint
}).strict().refine((value) => [value.commandHighWater, value.heldHighWater, value.auxiliaryHighWater]
  .every((water) => water.length === (value.snapshot.header as { playerCount: number }).playerCount), 'publication watermarks must cover every player');
const authorityEvent = z.object({ runId: text, eventSequence: positive, tick: uint, payload }).strict();
const messageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('held'), frame }).strict(),
  z.object({ kind: z.literal('command'), envelope }).strict(),
  z.object({ kind: z.literal('callout'), runId: text, player, sequence: positive, calloutKind: z.literal('contextual') }).strict(),
  z.object({ kind: z.literal('state'), state }).strict(),
  z.object({ kind: z.literal('result'), runId: text, result }).strict(),
  z.object({ kind: z.literal('event'), event: authorityEvent }).strict()
]);
return { messageSchema, commandSchema, publicationSchema: state };
}
/** One mode's byte codec for every message on a link: held frames, command envelopes, results, events and states. */
export interface MessageCodec<S = Snapshot> {
  encodeMessage(message: ClientMessage | AuthorityMessage<S>): Uint8Array;
  decodeMessage(bytes: Uint8Array): ClientMessage | AuthorityMessage<S>;
}
/** A mode's codec factory, by player limit (engine refactor spec §6: the ledger takes the mode's command codec). */
export type CommandCodec<S = Snapshot> = (playerLimit?: number) => MessageCodec<S>;
function codecFor<S>(wire: ModeWire): CommandCodec<S> {
  return (playerLimit = MAX_PLAYERS) => {
    if (!Number.isInteger(playerLimit) || playerLimit < 1 || playerLimit > 256) throw new Error('invalid player limit');
    const { messageSchema } = messageSchemaFor(playerLimit, wire);
    return {
      encodeMessage(message) {
        const bytes = new TextEncoder().encode(JSON.stringify(messageSchema.parse(message)));
        if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new Error('message exceeds byte limit');
        return bytes;
      },
      decodeMessage(bytes) {
        if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new Error('message exceeds byte limit');
        return messageSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))) as ClientMessage | AuthorityMessage<S>;
      }
    };
  };
}
/** The sector's codec; createMessageCodec and the module-level encodeMessage/decodeMessage are this codec. */
export const sectorCodec: CommandCodec<Snapshot> = codecFor<Snapshot>(sectorWire);
export function createMessageCodec(playerLimit = MAX_PLAYERS): MessageCodec<Snapshot> { return sectorCodec(playerLimit); }
/** The duel's codec: duel command kinds only, the duel snapshot header, and the same results and events. */
export const duelCodec: CommandCodec<DuelSnapshot> = codecFor<DuelSnapshot>(duelWire);
/** Object validation of a duel publication, as validatePublication is for the sector. */
export const duelPublicationSchema = messageSchemaFor(2, duelWire).publicationSchema;
export const commandSchema = messageSchemaFor(MAX_PLAYERS).commandSchema;
/** Object transport validation, independent of the unchanged local byte ceiling. */
export const publicationSchema = messageSchemaFor(MAX_PLAYERS).publicationSchema;
export function validatePublication(value: unknown): PublishedState { return publicationSchema.parse(value) as PublishedState; }
export const { encodeMessage, decodeMessage } = createMessageCodec();
export interface LatestMessageMetadata { key: string; sequence: number }
/** Framing policy lives above transport; sequences were stamped by the producer. */
export function latestMessageMetadata(bytes: Uint8Array): LatestMessageMetadata | null {
  if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new Error('message exceeds byte limit');
  // Transport only needs stream identity; the receiving codec validates the payload.
  const message: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!message || typeof message !== 'object') return null;
  const tagged = message as { kind?: unknown; frame?: unknown; state?: unknown };
  const value = tagged.kind === 'held' ? tagged.frame : tagged.kind === 'state' ? tagged.state : null;
  if (!value || typeof value !== 'object') return null;
  const data = value as { runId?: unknown; player?: unknown; sequence?: unknown; publicationSequence?: unknown };
  if (typeof data.runId !== 'string' || data.runId.length < 1 || data.runId.length > 128) return null;
  const sequence = tagged.kind === 'held' ? data.sequence : data.publicationSequence;
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 1) return null;
  if (tagged.kind === 'held') {
    if (typeof data.player !== 'number' || !Number.isInteger(data.player) || data.player < 0 || data.player >= MAX_PLAYERS) return null;
    return { key: `held:${data.runId}:${data.player}`, sequence };
  }
  if (tagged.kind === 'state') return { key: `state:${data.runId}`, sequence };
  return null;
}
```

Replace the whole of `src/renderer/src/app/session.ts` with:

```ts
import type { ShipLayout } from '../sim/ship/schema';
import type { SimState } from '../sim/state';
import { TICK_HZ } from '../sim/tuning';
import { createLocalRuntime } from './localRuntime';
import type { Scheduler, Unsubscribe } from '../net/contracts';
import { createDeviceManager, type SourceSample, type SlotInfo } from '../input/deviceManager';
import { NEUTRAL_FRAME, type InputFrame } from './intents';
import { createInputTimeline } from './inputTimeline';
import { buildHudModel, type HudModel } from '../render/hudModel';
import { EndReason } from '../sim/crew';
import { type TelemetryRecord } from '../sim/telemetry';
import { EMPTY_PROGRESS, applyRun, unlockNames, type Progress } from '../sim/progress';
import { DEFAULT_CHARACTERS } from '../sim/characters';
import { CUE_ORDER, type Cue } from '../events/audioCues';
import { calloutIcon } from '../events/callout';
import { bubbles, flashingKinds, type Callout, type Bubble } from '../render/calloutModel';
import { createCardUiState } from '../clientControl/cardController';

export const DEFAULT_SEED = 2026;
export const CREDITS_SCROLL_MS = 150;

export interface SessionDeps {
  /** The ship, or the ship for the run's player count (spec Demo-x-a section 3). */
  layout: ShipLayout | ((playerCount: number) => ShipLayout);
  sampleDevices(): SourceSample[];
  renderer: { reset(): void; recordPrev(s: SimState): void; draw(s: SimState, alpha: number, bubbles?: readonly Bubble[], ui?: import('../clientControl/cardController').CardUiState, presentation?: readonly import('../../../network/state/timeline').PresentationPoint[]): void } | null;
  hud: { update(m: HudModel): void } | null;
  now(): number;
  scheduler?: Scheduler;
  contentDigest?: string;
  authorityFactory?: (deps: import('../authority/authority').AuthorityDeps) => import('../authority/authority').Authority1a;
  saveCrash(payload: unknown): void;
  /** Called once with the run's record on the tick it ends (spec 4-ii section 7). */
  saveTelemetry?: (record: TelemetryRecord) => void;
  /** Whether a Confirm press may resume a paused session (false while the window is hidden or unfocused). */
  canResume?: () => boolean;
  credits?: readonly string[];
  /** Progress across runs (spec Run-iii section 6): read once at creation, written when a run ends. */
  loadProgress?: () => Progress;
  saveProgress?: (p: Progress) => void;
  /** Plays one audio cue (spec Demo-ii section 5); optional so tests and headless runs need no audio. */
  playCue?: (cue: Cue) => void;
}

export function createSession(deps: SessionDeps) {
  const dm = createDeviceManager();
  const lobbyUi = createCardUiState('lobby', 0);
  const credits = deps.credits ?? [];
  const LOBBY_MSG = 'Press Interact to join. Confirm: start. Cancel: credits';
  let progress: Progress = EMPTY_PROGRESS; try { progress = deps.loadProgress?.() ?? EMPTY_PROGRESS; } catch { progress = EMPTY_PROGRESS; }   // a throwing loader must not stop the session
  let newUnlocks: string[] = [];
  let phase: HudModel['phase'] = 'lobby';
  let message = LOBBY_MSG;
  let seed = DEFAULT_SEED;
  let state: SimState | null = null;
  let timeline: ReturnType<typeof createInputTimeline> | null = null;
  let slots: SlotInfo[] = [];
  let lastNow: number | null = null, runCounter = 0;
  let runtime: ReturnType<typeof createLocalRuntime> | null = null, cancelLobby: Unsubscribe | null = null;
  let disposed = false;
  const scheduler = deps.scheduler ?? { schedule: () => () => {} };
  const completedRuns = new Set<string>();
  const pendingCues = new Set<Cue>();
  let creditsOpen = false, creditsScroll = 0, scrollHold = 0, scrollDir = 0;
  let callouts: Callout[] = [];   // spec Coop-i section 3: app state only, never in Intent, replays or snapshots

  function scheduleLobby(): void {
    cancelLobby?.();
    if (!disposed && phase !== 'running' && phase !== 'paused') cancelLobby = scheduler.schedule(1000 / 120, () => { pump(); scheduleLobby(); });
  }
  function start(): void {
    cancelLobby?.(); runtime?.dispose(); deps.renderer?.reset();
    const playerCount = slots.filter((s) => s.status !== 'empty').length;
    const layout = typeof deps.layout === 'function' ? deps.layout(playerCount) : deps.layout;
    timeline = createInputTimeline(playerCount); newUnlocks = []; callouts = []; pendingCues.clear();
    phase = 'running'; message = '';
    runtime = createLocalRuntime({
      layout, playerCount, seed, characters: DEFAULT_CHARACTERS, unlocked: progress.unlocked,
      runId: `couch-${++runCounter}`, contentDigest: deps.contentDigest ?? __GAMEPLAY_CONTENT_DIGEST__,
      clock: { nowMs: deps.now }, scheduler, authorityFactory: deps.authorityFactory,
      beforeControls: sampleControls,
      frames: (_tick, deadline) => timeline!.consume(deadline),
      recordPrev: (view) => deps.renderer?.recordPrev(view),
      onPublication(view, publication) {
        state = view;
        if (phase === 'running' || phase === 'paused') {
          if (publication.phase === 'paused') { phase = 'paused'; message = 'PAUSED'; }
          else if (publication.phase === 'running') { phase = 'running'; message = publication.lagTicks > 0 ? `CATCHING UP (${publication.lagTicks} ticks)` : ''; }
        }
      },
      onEvent(event) {
        if (event.payload.kind === 'cue') { pendingCues.add(event.payload.cue); return; }
        if (event.payload.kind === 'callout') {
          const payload = event.payload;
          callouts = [...callouts.filter(c => c.pid !== payload.player && event.tick - c.tick < 3 * TICK_HZ), { pid: payload.player, tick: event.tick, text: payload.text, icon: calloutIcon(payload.text), flash: payload.station }].sort((a, b) => a.pid - b.pid);
          pendingCues.add('callout'); return;
        }
        if (event.payload.kind !== 'ended' || event.payload.record.mode !== 'sector' || completedRuns.has(event.runId)) return;
        completedRuns.add(event.runId);
        const record = event.payload.record.record;   // the sector's TelemetryRecord, tagged on the wrapper (engine refactor spec §6)
        const next = applyRun(progress, record); newUnlocks = next.unlocked.filter((id) => !progress.unlocked.includes(id)); progress = next;
        phase = 'gameover';
        message = `${state!.endReason === EndReason.Hull ? 'HULL LOST' : state!.endReason === EndReason.Victory ? 'VICTORY' : 'CREW LOST'} after ${Math.floor(state!.tick / TICK_HZ)}s. Confirm: same seed. Cancel: new seed.`;
        scheduleLobby();
        try { deps.saveTelemetry?.(record); } catch { /* Persistence cannot interrupt completion or cause a duplicate application. */ }
        try { deps.saveProgress?.(progress); } catch { /* Keep the once-applied in-memory profile when storage is unavailable. */ }
      },
      onCrash(record) { phase = 'error'; message = `Sim fault: ${record.error}. Crash data saved.`; deps.saveCrash(record); },
      draw(view, alpha) { deps.renderer?.draw(view, alpha, phase === 'running' || phase === 'paused' ? bubbles(view, callouts, view.tick) : [], runtime?.ui); }
    });
    state = runtime.state();
  }

  function anyPress(frames: { confirmPresses: number; cancelPresses: number }[], key: 'confirmPresses' | 'cancelPresses'): boolean {
    return frames.some((f) => f[key] > 0);
  }

  function doResume(reason?: string, player = 0): void {
    if (phase === 'paused') {
      if (reason) runtime?.requestLifecyclePause({ paused: false, reason });
      else runtime?.requestPause(false, player);
      phase = 'running'; message = ''; lastNow = null;
    }
  }

  function openCredits(): void { creditsOpen = true; creditsScroll = 0; scrollHold = 0; scrollDir = 0; }
  function closeCredits(): void { creditsOpen = false; }
  /** One line per CREDITS_SCROLL_MS while any active stick is held up or down; the first step in a new direction is immediate. */
  function scrollCredits(frames: readonly InputFrame[], deltaMs: number): void {
    let dir = 0;
    for (const f of frames) if (f.moveY > 0.5) { dir = 1; break; } else if (f.moveY < -0.5) { dir = -1; break; }
    const max = Math.max(0, credits.length - 1);
    const stepOnce = (): void => { creditsScroll = Math.max(0, Math.min(max, creditsScroll + dir)); };
    if (dir !== scrollDir) { scrollDir = dir; scrollHold = 0; if (dir !== 0) stepOnce(); return; }   // new direction: step now, hold from zero
    if (dir === 0) return;
    scrollHold += deltaMs;
    while (scrollHold >= CREDITS_SCROLL_MS) { scrollHold -= CREDITS_SCROLL_MS; stepOnce(); }
  }

  function sampleControls(): void {
      const now = deps.now();
      const deltaMs = lastNow === null ? 0 : Math.min(250, now - lastNow);
      lastNow = now;
      const wasActive = slots.map((s) => s.status === 'active');
      const { frames: raw, slots: s, joinedCount, callouts: calloutPresses } = dm.update(deps.sampleDevices(), phase === 'lobby' && !creditsOpen);
      // While the credits are open, a slot that became active this frame (a reclaim) gets no say this frame.
      const frames = creditsOpen ? raw.map((f, i) => (wasActive[i] && s[i]!.status === 'active') ? f : { ...NEUTRAL_FRAME }) : raw;
      slots = s;
      if (phase === 'paused' && anyPress(frames, 'confirmPresses') && (deps.canResume ?? (() => true))()) doResume(undefined, frames.findIndex((f) => f.confirmPresses > 0));
      if (phase === 'lobby') {
        if (creditsOpen) {
          if (anyPress(frames, 'cancelPresses') || anyPress(frames, 'confirmPresses')) closeCredits();   // Cancel wins; Confirm closes without starting
          else scrollCredits(frames, deltaMs);
        } else if (anyPress(frames, 'cancelPresses')) openCredits();
        else if (joinedCount > 0 && anyPress(frames, 'confirmPresses')) start();
      } else if (phase === 'running' && state && timeline) {
        timeline.sample(now, frames);
        const pressed = calloutPresses.flatMap((n, pid) => n > 0 ? [pid] : []);
        for (const pid of pressed) runtime?.callout(pid);
      } else if (phase === 'gameover') {
        if (anyPress(frames, 'cancelPresses')) { seed += 1; phase = 'lobby'; message = `New seed. ${LOBBY_MSG}`; }
        else if (anyPress(frames, 'confirmPresses')) { phase = 'lobby'; message = `Same seed. ${LOBBY_MSG}`; }
      }
  }
  function pump(): void {
    if (disposed) return;
    if (runtime && (phase === 'running' || phase === 'paused')) runtime.pump(); else sampleControls();
  }
  scheduleLobby();
  return {
    get phase() { return phase; }, get state() { return state; }, get seed() { return seed; }, get creditsOpen() { return creditsOpen; }, get callouts(): readonly Callout[] { return callouts; },
    pause(reason = 'suspend') { if (phase === 'running') { timeline?.neutralize(deps.now()); runtime?.requestLifecyclePause({ paused: true, reason }); phase = 'paused'; message = 'PAUSED'; } },
    resume(reason = 'resume') { doResume(reason); }, pump,
    dispose() { disposed = true; cancelLobby?.(); runtime?.dispose(); },
    frame() {
      for (const cue of CUE_ORDER) if (pendingCues.has(cue)) deps.playCue?.(cue); pendingCues.clear();
      if (phase !== 'error') runtime?.frame();
      deps.hud?.update(buildHudModel(phase === 'error' ? null : state, { mode: 'couch', ui: runtime?.ui ?? lobbyUi }, {
        slots, phase, message,
        credits: creditsOpen ? { lines: credits, scroll: creditsScroll } : null,
        progress: phase === 'gameover' || phase === 'lobby' ? { bestScore: progress.bestScore, runs: progress.runs, victories: progress.victories, newUnlocks: unlockNames(newUnlocks), unlocked: unlockNames(progress.unlocked) } : null,
        calloutFlash: state && phase === 'running' ? flashingKinds(callouts, state.tick) : [],
        callouts
      }));
    }
  };
}
```

- [ ] **Step 3: The duel's checkpoint and rules, and replays by mode**

Create `src/renderer/src/authority/duelCheckpoint.ts`:

```ts
// The duel's init, checkpoint and mode-memory schemas (engine refactor spec §6). The checkpoint is the generic
// authority envelope with the duel's init, the duel snapshot, no bot controllers, and `modeMemory`: the telemetry
// accumulator as its own versioned blob, outside the hash, restored with the duel so a restored duel's end summary
// equals an uninterrupted one's. Everything is validated before any allocation.
import { z } from 'zod';
import type { Checkpoint } from '../net/contracts';
import { duelCodec } from '../net/codec';
import { deriveLayout } from '../sim/ship/derived';
import type { ShipLayout } from '../sim/ship/schema';
import { DUEL_PLAYERS, validateDuelSnapshot, type DuelSnapshot } from '../sim/duel/snapshot';
import type { DuelTelemetry, MissileLoss, TerminalCause } from '../sim/duel/telemetry';
import { TERMINAL_CAUSES } from '../sim/duel/summary';
import { validateMap } from '../sim/tactical/map';
import { createTacticalState } from '../sim/tactical/state';
import { SIM_VERSION } from '../sim/tuning';
import { createLedger } from './ledger';
import type { ResolveLayout } from './rules';

export interface DuelInit { runId: string; layoutId: string; layoutHash: string; simVersion: number; contentDigest: string; seed: number; playerCount: number }
/** The duel has no bot producers in R-1, so its controller memory is always empty. */
export type DuelControllers = readonly never[];
/** The telemetry accumulator as JSON: its typed arrays as number arrays. */
export interface DuelMemory { version: 1; telemetry: Omit<DuelTelemetry, 'prev'> & { prev: Omit<DuelTelemetry['prev'], 'grace'> & { grace: [number[], number[]] } } }
export type DuelCheckpoint = Checkpoint<DuelInit, DuelControllers, DuelSnapshot> & { modeMemory: DuelMemory };

const uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const int = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const num = z.number().finite();
const stamp = z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER);
const text = z.string().min(1).max(128);
const two = <T extends z.ZodTypeAny>(item: T) => z.tuple([item, item]);
export const duelInitSchema = z.object({
  runId: text, layoutId: text, layoutHash: text, simVersion: z.literal(SIM_VERSION),
  contentDigest: z.string().regex(/^[0-9a-f]{64}$/), seed: uint.max(0xffffffff), playerCount: z.literal(DUEL_PLAYERS)
}).strict();
const causes = z.array(z.enum(TERMINAL_CAUSES as [TerminalCause, ...TerminalCause[]])).max(TERMINAL_CAUSES.length)
  .refine((list) => list.every((c, k) => k === 0 || TERMINAL_CAUSES.indexOf(list[k - 1]!) < TERMINAL_CAUSES.indexOf(c)), 'causes out of order or repeated');
const losses: Record<MissileLoss, typeof uint> = { planet: uint, asteroid: uint, edge: uint, expired: uint, own: uint, missile: uint };
const shipTelemetry = z.object({
  laserReleases: uint, laserHits: uint, laserMisses: uint, layersStripped: uint, missilesLaunched: uint,
  missileHitsByRoom: z.tuple([uint, uint, uint]), missileLosses: z.object(losses).strict(), planetContacts: uint, asteroidContacts: uint
}).strict();
const playerTelemetry = z.object({ repairsStarted: uint, repairsFinished: uint, walkingTicks: uint, repairingTicks: uint }).strict();
export const duelMemorySchema = z.object({
  version: z.literal(1),
  telemetry: z.object({
    ticks: uint, outcome: z.number().int().min(0).max(3), ships: two(shipTelemetry), players: two(playerTelemetry),
    baits: uint, consoleSwaps: uint, helmEmptyTicks: uint, weaponsEmptyTicks: uint, enemyInArcTicks: uint, weaponsIdleTicks: uint,
    terminal: two(causes),
    prev: z.object({ counters: two(z.tuple([uint, uint, uint, uint])), grace: two(z.array(int).max(65_536)), work: two(int), seat: two(int), lastConsole: two(int) }).strict(),
    manoeuvre: z.object({ tick: int, x: num, y: num }).strict()
  }).strict()
}).strict();

export function encodeDuelMemory(t: DuelTelemetry): DuelMemory {
  const copy = structuredClone(t);
  return { version: 1, telemetry: { ...copy, prev: { ...copy.prev, grace: [Array.from(t.prev.grace[0]), Array.from(t.prev.grace[1])] } } };
}
export function decodeDuelMemory(memory: DuelMemory): DuelTelemetry {
  const t = structuredClone(memory.telemetry);
  return { ...t, prev: { ...t.prev, grace: [Int32Array.from(t.prev.grace[0]), Int32Array.from(t.prev.grace[1])] } } as DuelTelemetry;
}

const held = z.object({ moveX: z.number().finite().min(-1).max(1), moveY: z.number().finite().min(-1).max(1), interactHeld: z.boolean() }).strict();
const checkpointSchema = z.object({
  checkpointVersion: z.literal(2), init: z.unknown(), snapshot: z.unknown(),
  commandHighWater: z.array(uint).length(DUEL_PLAYERS), recentResults: z.array(z.unknown()).max(DUEL_PLAYERS * 256),
  admissionTick: stamp, admissionCounts: z.array(uint.max(16)).length(DUEL_PLAYERS),
  eventSequence: uint, publicationSequence: uint, controlRevision: uint, receiveOrder: uint, lifecycleOrdinal: uint,
  botControllers: z.array(z.never()).max(0), paused: z.boolean(), phase: z.enum(['running', 'paused', 'ended']),
  pauseOwner: uint.max(DUEL_PLAYERS - 1).nullable(), pauseReason: text.nullable(), heldHighWater: z.array(uint).length(DUEL_PLAYERS),
  held: z.array(held).length(DUEL_PLAYERS), modeMemory: duelMemorySchema
}).strict();

export function validateDuelInit(layout: ShipLayout, value: unknown, contentDigest: string): DuelInit {
  const init = duelInitSchema.parse(value);
  if (init.contentDigest !== contentDigest || init.layoutId !== layout.id || init.layoutHash !== deriveLayout(layout).layoutHash) throw new Error('incompatible duel');
  if (validateMap(createTacticalState(init.seed).map).length > 0) throw new Error('invalid duel map for this seed');
  return init;
}

/** Validate the whole duel checkpoint envelope before allocation: init, snapshot, ledger cache, phase, memory. */
export function validateDuelCheckpoint(value: unknown, contentDigest: string, resolveLayout: ResolveLayout): DuelCheckpoint {
  if ((value as { checkpointVersion?: unknown } | null)?.checkpointVersion !== 2) throw new Error('unsupported checkpoint format');
  const cp = checkpointSchema.parse(value) as unknown as DuelCheckpoint;
  const layout = resolveLayout((cp.init as { layoutId?: string } | null)?.layoutId as string);
  cp.init = validateDuelInit(layout, cp.init, contentDigest);
  cp.snapshot = validateDuelSnapshot(layout, cp.snapshot, contentDigest);
  if (cp.snapshot.header.seed !== cp.init.seed) throw new Error('inconsistent duel checkpoint seed');
  const ended = cp.snapshot.values[1 + 4] !== 0;   // SIM_VERSION, then the space module's tick, seed, rng.s, asteroid count, outcome
  if (ended !== (cp.phase === 'ended')) throw new Error('inconsistent checkpoint terminal phase');
  if (cp.admissionTick > cp.snapshot.header.tick || cp.paused !== (cp.phase === 'paused')) throw new Error('inconsistent checkpoint');
  const ledger = createLedger([0, 1], DUEL_PLAYERS, duelCodec);
  ledger.restore({ commandHighWater: cp.commandHighWater, recentResults: cp.recentResults, admissionTick: cp.admissionTick, admissionCounts: cp.admissionCounts });
  for (const { envelope, result } of cp.recentResults) if (envelope.runId !== cp.init.runId || result.tick > cp.snapshot.header.tick) throw new Error('inconsistent checkpoint cache');
  const t = cp.modeMemory.telemetry, bodies = createTacticalState(cp.init.seed).map.asteroids.length + 2;
  if (t.prev.grace.some((g) => g.length !== bodies) || t.ticks !== cp.snapshot.header.tick) throw new Error('inconsistent duel telemetry');
  return structuredClone(cp);
}
```

Create `src/renderer/src/authority/duelRules.ts`:

```ts
// The duel's EncounterRules (engine refactor spec §6): the Helm duel behind the generic authority. The state is the
// duel plus its telemetry accumulator (mode memory, outside the hash) and the end summary, computed once at the end.
// `tick` is the interior tick; stepDuelTick advances it and the tactical tick together, and restore checks they agree.
import type { Cue, DuelCommand, CommandEnvelope } from '../net/contracts';
import { duelCodec } from '../net/codec';
import { assertSimStateLive } from '../sim/state';
import { hashDuel } from '../sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot, type DuelSnapshot } from '../sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../sim/duel/state';
import { stepDuelTick } from '../sim/duel/step';
import { duelEndSummary, type DuelEndSummary } from '../sim/duel/summary';
import { createTelemetry, recordTick, type DuelTelemetry } from '../sim/duel/telemetry';
import { Outcome } from '../sim/tactical/state';
import { decodeDuelMemory, encodeDuelMemory, validateDuelCheckpoint, validateDuelInit, type DuelControllers, type DuelInit, type DuelMemory } from './duelCheckpoint';
import type { EncounterRules } from './rules';

export interface DuelSession { duel: DuelState; telemetry: DuelTelemetry; summary: DuelEndSummary | null }
export interface DuelTypes { state: DuelSession; init: DuelInit; controllers: DuelControllers; snapshot: DuelSnapshot; cueBaseline: { outcome: number } }

function session(duel: DuelState, telemetry: DuelTelemetry): DuelSession {
  return { duel, telemetry, summary: duel.tactical.outcome !== Outcome.Running ? duelEndSummary(telemetry) : null };
}

export const duelRules: EncounterRules<DuelTypes> = {
  modeId: 'duel',
  validateInit: (value, contentDigest, resolveLayout) => validateDuelInit(resolveLayout((value as DuelInit | null)?.layoutId as string), value, contentDigest),
  create(init, resolveLayout) { const duel = createDuel(resolveLayout(init.layoutId), init.seed); return session(duel, createTelemetry(duel)); },
  dispose: (s) => disposeDuel(s.duel),
  assertLive: (s) => assertSimStateLive(s.duel.interior),
  playerCount: () => 2,
  tick: (s) => s.duel.interior.tick,
  step(s, input) {
    // The duel codec admits only duel kinds, and the core handles setPaused before the step.
    const duelInput = { held: input.held, commands: input.commands as readonly CommandEnvelope<DuelCommand>[] };
    const results = stepDuelTick(s.duel, duelInput);
    recordTick(s.telemetry, s.duel, duelInput);
    if (!s.summary && s.duel.tactical.outcome !== Outcome.Running) s.summary = duelEndSummary(s.telemetry);
    return results;
  },
  terminal: (s) => s.duel.tactical.outcome !== Outcome.Running ? { ended: true, endRecord: { mode: 'duel', record: s.summary } } : { ended: false, endRecord: null },
  safePointKey: () => 'duel',
  callouts: () => null,
  cueBaseline: (s) => ({ outcome: s.duel.tactical.outcome }),
  cues(prev, s) {
    const events = s.duel.tactical.events, outcome = s.duel.tactical.outcome, out: Cue[] = [];
    if (events.some((e) => (e.kind === 'laser' && e.ship === 1 && e.hit) || (e.kind === 'missileEnd' && e.cause === 'ship' && e.target === 0))) out.push('impact');
    if (events.some((e) => e.kind === 'laser' && e.ship === 0)) out.push('shot');
    if (events.some((e) => (e.kind === 'laser' && e.ship === 0 && e.hit) || (e.kind === 'missileEnd' && e.cause === 'ship' && e.target === 1))) out.push('hit');
    if (prev.outcome === Outcome.Running && outcome !== Outcome.Running) out.push(outcome === Outcome.CrewWins ? 'victory' : 'defeat');
    return out;
  },
  snapshot: (s, contentDigest) => saveDuelSnapshot(s.duel, contentDigest),
  restore(snapshot, resolveLayout, memory) {
    if (!memory) throw new Error('a duel restore needs its telemetry memory');
    const duel = loadDuelSnapshot(resolveLayout(snapshot.header.layoutId), snapshot, snapshot.header.contentDigest);
    return session(duel, decodeDuelMemory(memory as DuelMemory));
  },
  hash: (s) => hashDuel(s.duel),
  validateCheckpoint: validateDuelCheckpoint,
  commandCodec: duelCodec,
  initialControllers: () => [],
  memory: (s) => encodeDuelMemory(s.telemetry)
};
```

Replace the whole of `src/renderer/src/authority/replay.ts` with:

```ts
// Portable replays for any mode (engine refactor spec §6). A replay records its `mode`; absent means 'sector', so
// every V2/V3/V4 file recorded before R-1 parses unchanged. The mode's rules supply the checkpoint, snapshot and
// command validators. parseReplay and runReplay are the sector instances, kept for their callers.
import { z } from 'zod';
import { MAX_PLAYERS } from '../../../shared/intent';
import type { ShipLayout } from '../sim/ship/schema';
import type { CommandEnvelope, CommandResult } from '../net/contracts';
import type { SimState } from '../sim/state';
import { replayDataEqual, type Replay, type ReplayFrame } from '../sim/replay';
import { createEncounterCore } from './core';
import type { EncounterRules, EncounterTypes, ResolveLayout } from './rules';
import { sectorRules, type SectorTypes } from './sectorRules';
import { duelRules } from './duelRules';
export type { Replay, ReplayV2, ReplayV3, ReplayV4, ReplayFrame } from '../sim/replay';
const uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const players = z.array(uint.max(MAX_PLAYERS - 1)).max(MAX_PLAYERS).refine(a => new Set(a).size === a.length);
const held = z.object({ moveX: z.number().finite().min(-1).max(1), moveY: z.number().finite().min(-1).max(1), interactHeld: z.boolean() }).strict();
const action = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('admission'), entries: z.array(z.object({ binding: uint.min(1), players, order: uint.min(1), message: z.unknown(), admissionPolicy: z.literal('receive-time').optional(), effectiveTick: uint.optional() }).strict()).min(1).max(1024) }).strict(),
  z.object({ kind: z.literal('lifecycle'), order: uint.min(1), ordinal: uint.min(1), control: z.object({ paused: z.boolean(), reason: z.string().min(1).max(128) }).strict() }).strict(),
  z.object({ kind: z.literal('controls'), processedCount: uint.optional(), fenced: z.literal(true).optional() }).strict(),
  z.object({ kind: z.literal('tick'), input: z.object({ held: z.array(held).min(1).max(MAX_PLAYERS), commands: z.array(z.unknown()).max(256) }).strict(), heldSequences: z.array(uint).min(1).max(MAX_PLAYERS) }).strict(),
  z.object({ kind: z.literal('detach'), binding: uint.min(1), players }).strict(),
  z.object({ kind: z.literal('watchdog'), players: players.refine(p => p.length > 0) }).strict(),
  z.object({ kind: z.literal('cursor'), receiveOrder: uint }).strict(),
  z.object({ kind: z.literal('publish') }).strict(), z.object({ kind: z.literal('seal'), discardLifecycleResumes: z.literal(true).optional() }).strict()
]);
const frameSchema = z.object({ tick: uint, eventSequenceBefore: uint, action, results: z.array(z.unknown()).max(1024), events: z.array(z.object({ eventSequence: uint.min(1), tick: uint, kind: z.enum(['cue', 'pause', 'ended']) }).strict()).max(256),
  after: z.object({ tick: uint, hash: z.string().regex(/^[0-9a-f]{8}$/), phase: z.enum(['running', 'paused', 'ended', 'error']), eventSequence: uint, publicationSequence: uint, controlRevision: uint }).strict().optional()
}).strict();
/** Full validation occurs before constructing a simulation. No numeric-button fallback. */
export function parseReplay(layout: ShipLayout, value: unknown, contentDigest: string): Replay {
  return parseEncounterReplay(sectorRules, value, contentDigest, () => layout);
}
/** The mode a replay names: its `mode` field, or 'sector' when the field is absent. */
export function replayMode(value: unknown): string {
  const mode = (value as { mode?: unknown } | null)?.mode;
  return mode === undefined ? 'sector' : typeof mode === 'string' ? mode : '';
}
export function parseEncounterReplay<T extends EncounterTypes>(rules: EncounterRules<T>, value: unknown, contentDigest: string, resolveLayout: ResolveLayout): Replay<T> {
  const version = (value as { version?: unknown } | null)?.version;
  if (version !== 2 && version !== 3 && version !== 4) throw new Error('unsupported replay format (expected 2, 3 or 4)');
  if (replayMode(value) !== rules.modeId) throw new Error('replay mode does not match');
  const parsed = z.object({ version: z.union([z.literal(2), z.literal(3), z.literal(4)]), mode: z.string().min(1).max(64).optional(), init: z.unknown(), initial: z.unknown(), checkpoint: z.unknown(), frames: z.array(frameSchema).max(1_000_000) }).strict().parse(value);
  const { decodeMessage, encodeMessage } = rules.commandCodec();
  const checkpoint = rules.validateCheckpoint(parsed.checkpoint, contentDigest, resolveLayout);
  if (!replayDataEqual(parsed.init, checkpoint.init) || !replayDataEqual(parsed.initial, checkpoint.snapshot)) throw new Error('inconsistent replay baseline');
  let expectedTick = checkpoint.snapshot.header.tick;
  for (const frame of parsed.frames) {
    if (frame.tick !== expectedTick) throw new Error('invalid replay tick');
    frame.results = frame.results.map(result => {
      const decoded = decodeMessage(encodeMessage({ kind: 'result', runId: checkpoint.init.runId, result: result as CommandResult }));
      if (decoded.kind !== 'result') throw new Error('invalid replay result');
      if (version === 2 && decoded.result.admission !== undefined) throw new Error('v3 result in v2 replay');
      return decoded.result;
    });
    if (frame.action.kind === 'admission') for (const entry of frame.action.entries) {
      if (version === 2 && (entry.admissionPolicy !== undefined || entry.effectiveTick !== undefined)) throw new Error('v3 admission in v2 replay');
      if ((entry.admissionPolicy !== undefined) !== (entry.effectiveTick !== undefined) || (entry.effectiveTick !== undefined && entry.effectiveTick !== frame.tick)) throw new Error('invalid replay effective tick');
      const message = decodeMessage(encodeMessage(entry.message as Parameters<typeof encodeMessage>[0]));
      if (message.kind !== 'held' && message.kind !== 'command') throw new Error('replay contains nonsemantic message');
      entry.message = message;
      if (entry.players.some(p => p >= checkpoint.init.playerCount)) throw new Error('invalid replay player');
    }
    if (frame.action.kind === 'detach' && frame.action.players.some(p => p >= checkpoint.init.playerCount)) throw new Error('invalid replay detach');
    if (frame.action.kind === 'controls' && ((frame.action.processedCount !== undefined) !== (frame.action.fenced === true)
      || version !== 4 && frame.action.fenced)) throw Error('invalid replay control fence');
    if (frame.action.kind === 'seal' && frame.action.discardLifecycleResumes && version !== 4) throw Error('invalid replay fence seal');
    if (frame.action.kind === 'watchdog' && (version === 2 || frame.action.players.some(p => p >= checkpoint.init.playerCount))) throw new Error('invalid replay watchdog');
    if (frame.action.kind === 'tick') {
      expectedTick++;
      if (frame.action.input.held.length !== checkpoint.init.playerCount || frame.action.heldSequences.length !== checkpoint.init.playerCount) throw new Error('invalid replay held shape');
      frame.action.input.commands = frame.action.input.commands.map(envelope => {
        const message = decodeMessage(encodeMessage({ kind: 'command', envelope: envelope as CommandEnvelope }));
        if (message.kind !== 'command') throw new Error('invalid replay command');
        return message.envelope;
      });
    }
    if (frame.after && frame.after.tick !== expectedTick) throw new Error('invalid replay completion tick');
  }
  return { version: parsed.version, ...(parsed.mode !== undefined ? { mode: parsed.mode } : {}), init: checkpoint.init, initial: checkpoint.snapshot, checkpoint, frames: parsed.frames as ReplayFrame[] };
}
export interface ReplayOptions {
  /** Default false: avoid retaining a second journal for long replay runs. */
  retainFrames?: boolean;
  /** Default true; false lets onFrame/observe sample without accumulating traces. */
  retainTrace?: boolean;
  onFrame?(frame: Readonly<ReplayFrame>): void;
}
/** Runs the live admission/phase executor directly; no wall-clock debt or producer callbacks. */
export function runReplay(layout: ShipLayout, value: unknown, contentDigest: string, observe?: (state: SimState, frame: Readonly<ReplayFrame>) => void, options: ReplayOptions = {}) {
  return runEncounterReplay<SectorTypes>(sectorRules, value, contentDigest, () => layout, observe, options);
}
/** Every mode a replay may name, by mode id. */
const REPLAY_RULES: Readonly<Record<string, EncounterRules<EncounterTypes>>> = { sector: sectorRules as unknown as EncounterRules<EncounterTypes>, duel: duelRules as unknown as EncounterRules<EncounterTypes> };
/** Run a replay of any mode: its `mode` field (absent: sector) selects the rules. */
export function runModeReplay(value: unknown, contentDigest: string, resolveLayout: ResolveLayout, options: ReplayOptions = {}) {
  const rules = REPLAY_RULES[replayMode(value)];
  if (!rules) throw new Error('unknown replay mode');
  return runEncounterReplay(rules, value, contentDigest, resolveLayout, undefined, options);
}
export function runEncounterReplay<T extends EncounterTypes>(rules: EncounterRules<T>, value: unknown, contentDigest: string, resolveLayout: ResolveLayout, observe?: (state: T['state'], frame: Readonly<ReplayFrame>) => void, options: ReplayOptions = {}) {
  const replay = parseEncounterReplay(rules, value, contentDigest, resolveLayout);
  const state = rules.restore(replay.initial, resolveLayout, replay.checkpoint.modeMemory);
  const core = createEncounterCore(rules, { init: replay.init, contentDigest, resolveLayout, clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash(record) { throw new Error(record.error); } }, state, replay.checkpoint);
  const results: CommandResult[] = [], frames = [], hashes: string[] = [], events = [];
  try {
    for (const frame of replay.frames) {
      const actual = core.replayFrame(frame);
      if (frame.after && !replayDataEqual(actual.after, frame.after)) throw new Error(`replay outcome divergence at tick ${frame.tick}`);
      if (frame.after && !replayDataEqual(actual.results, frame.results)) throw new Error(`replay result divergence at tick ${frame.tick}`);
      if (frame.after && !replayDataEqual(actual.events, frame.events)) throw new Error(`replay event divergence at tick ${frame.tick}`);
      if (options.retainFrames) frames.push(actual);
      if (options.retainTrace !== false) {
        results.push(...actual.results); events.push(...actual.events);
        if (frame.action.kind === 'tick' && actual.after) hashes.push(actual.after.hash);
      }
      options.onFrame?.(actual);
      if (frame.action.kind === 'tick') observe?.(state, actual);
    }
    return { checkpoint: core.captureCheckpoint(), results, events, hashes, frames };
  } finally { core.dispose(); }
}
```

- [ ] **Step 4: Run the checkpoint tests: the continuation proof, replays, the size bound and validation**

Run: `npx vitest run tests/duelCheckpoint.test.ts tests/duelSnapshot.test.ts tests/encounterAuthority.test.ts tests/commandUnion.test.ts tests/netCodec.test.ts tests/replayV2.test.ts tests/replayV3.test.ts tests/boundary.test.ts`
Expected: PASS, 232 tests in 8 files (about 5 s for the checkpoint file). It prints `continuation proof: seed 7, 6000 + 2832 ticks; summary {"outcome":2,"ticks":8832,"terminal":[["missile"],[]],"laserReleases":[11,28],"laserHits":[2,28],"missilesLaunched":[2,5],"missileHits":[0,5],"repairsFinished":[7,9]}` and `duel checkpoint at its largest state: 8548 bytes (8.3 KiB of 256 KiB), 1018 values`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/authority/duelCheckpoint.ts src/renderer/src/authority/duelRules.ts src/renderer/src/authority/replay.ts src/renderer/src/net/codec.ts src/renderer/src/net/contracts.ts src/renderer/src/app/session.ts tests/helpers/duelAuthority.ts tests/duelCheckpoint.test.ts
git commit -q -m "feat(authority): the duel rules, checkpoint with telemetry memory, end summary record and mode-picked replays (engine refactor R-1b)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 4: The duel as a registered Net-3 mode

**Files:**
- Create: `src/network/modes/streamBinding.ts`, `src/network/modes/duelStream.ts`, `src/network/modes/duel.ts`, `tests/duelMode.test.ts`
- Modify (whole file): `src/network/modes/sectorStream.ts`, `src/utility/authorityHost.ts`, `tests/networkBoundary.test.ts`

**Interfaces:**
- Consumes: R-1a's `defineEncounterMode`, `jsonModeCodecs`, `EncounterProducers`; Task 3's `duelRules`, `DuelTypes`, `duelCodec`, `duelPublicationSchema`; Task 2's `validateDuelSnapshot`; Net-3's `createStateSender`, the image codec, `createHostRuntime`, `createUtilityHost`, `createModeRegistry`.
- Produces:
  - `streamBinding.ts`: `interface ModeStreamOptions<S> { clock; latestPayloadLimit; toImage; codec; notificationStream; label }`; `encodeModeNotification(codec, stream, label, message, floor, transportSequence)`; `modeInputIdentity(codec, label, bytes, channel)`; `createModeStreamBinding<S>(link, options)`.
  - `duelStream.ts`: `interface DuelValidationOptions { resolveLayout; contentDigest }`; `type DuelPublication`; `duelPublicationToImage`, `imageToDuelPublication`, `createDuelStreamBinding`.
  - `duel.ts`: `duelMode: ModeDefinition` (`modeId 'duel'`, `schemaVersion 1`).

- [ ] **Step 1: Write the failing test**

Create `tests/duelMode.test.ts`:

```ts
// The duel as a registered Net-3 mode (engine refactor spec §6, R-1b acceptance), at the hostRuntime and utility-host
// level of Net-3's host-smoke gate: start → captureCheckpoint → restore round trips reproduce identical hashes for the
// sector and the duel, attach and detach work over loopback ports, a streamed attachment publishes duel state images,
// and a utility initialised as 'duel' runs it. No main-process or renderer wiring (H-2).
import { describe, expect, it } from 'vitest';
import { createHostRuntime } from '../src/network/hostRuntime';
import { createModeRegistry } from '../src/network/modes/registry';
import { sectorMode } from '../src/network/modes/sector';
import { duelMode } from '../src/network/modes/duel';
import { duelPublicationToImage, imageToDuelPublication, type DuelPublication } from '../src/network/modes/duelStream';
import { createUtilityHost } from '../src/network/utilityHost';
import type { ModeDefinition, ModeHostDeps } from '../src/network/modes/contracts';
import type { HostCommandInput } from '../src/shared/netSession';
import { classifyStreamPacket, decodeState, decodeStatePacket } from '../src/network/state/imageCodec';
import { duelCodec } from '../src/renderer/src/net/codec';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { hashF64 } from '../src/shared/hash';
import { LAYOUT } from './helpers/sim';
import { ownTestCleanup } from './helpers/simLifetime';
import { portEndpoint } from './helpers/portEndpoint';
import { duelInit, resolveCutter } from './helpers/duelAuthority';

const encode = (x: unknown) => new TextEncoder().encode(JSON.stringify(x));
const decode = (x: Uint8Array) => JSON.parse(new TextDecoder().decode(x));
const codec = duelCodec(2);
function harness(mode: ModeDefinition) {
  let now = 0; const callbacks = new Set<() => void>();
  const deps: ModeHostDeps = { contentDigest: __GAMEPLAY_CONTENT_DIGEST__, clock: { nowMs: () => now },
    scheduler: { schedule: (_, cb) => { callbacks.add(cb); return () => { callbacks.delete(cb); }; } }, onCrash() {} };
  const runtime = createHostRuntime(createModeRegistry([sectorMode, duelMode]), deps, { modeId: mode.modeId, schemaVersion: mode.schemaVersion, simVersion: mode.simVersion, hostGeneration: 1 });
  ownTestCleanup(() => runtime.dispose());
  let id = 0;
  return { runtime, advance(t: number) { now = t; for (const cb of [...callbacks]) { callbacks.delete(cb); cb(); } },
    command(input: HostCommandInput) { return runtime.handle({ ...input, requestId: ++id, hostGeneration: 1 }); } };
}
const sectorInit = () => ({ runId: 'mode-sector', layoutId: LAYOUT.id, layoutHash: deriveLayout(LAYOUT).layoutHash, simVersion: SIM_VERSION,
  contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 7, playerCount: 1, characters: [0], unlocked: [] });
const ticks = (h: ReturnType<typeof harness>, from: number, n: number) => { for (let k = from + 1; k <= from + n; k++) h.advance(k * 1000 / 60 + 0.01); return from + n; };

describe('the duel mode over Net-3 (hostRuntime level)', () => {
  it.each([['sector', sectorMode, sectorInit()], ['duel', duelMode, duelInit(3, 'mode-duel')]] as const)('%s: start → captureCheckpoint → restore round trips reproduce identical hashes', async (_name, mode, init) => {
    const h = harness(mode);
    expect(h.command({ kind: 'start', initBytes: encode(init) }).ok).toBe(true);
    const at = ticks(h, 0, 120);
    const captured = await h.runtime.captureCheckpoint('periodic'), saved = decode(captured.bytes);
    expect(captured.capturedTick).toBe(saved.snapshot.header.tick);
    expect(saved.snapshot.header.tick).toBeGreaterThan(100);
    expect(h.command({ kind: 'restore', checkpointBytes: captured.bytes }).ok).toBe(true);
    const restored = h.command({ kind: 'checkpoint' });
    if (!restored.ok || !restored.checkpointBytes) throw Error('missing checkpoint');
    const again = decode(restored.checkpointBytes);
    expect(again.snapshot.values).toEqual(saved.snapshot.values);
    expect(hashF64(Float64Array.from(again.snapshot.values))).toBe(hashF64(Float64Array.from(saved.snapshot.values)));
    expect(again.phase).toBe('paused');
    if (mode === duelMode) { expect(again.snapshot.header.hash).toBe(saved.snapshot.header.hash); expect(again.modeMemory).toEqual(saved.modeMemory); }
    ticks(h, at, 30);   // the restored host stays paused, so no tick runs until a producer resumes it
    const still = h.command({ kind: 'checkpoint' });
    if (!still.ok || !still.checkpointBytes) throw Error('missing checkpoint');
    expect(decode(still.checkpointBytes).snapshot.values).toEqual(saved.snapshot.values);
  });
  it('attaches and detaches duel players over loopback ports: a duel command is applied and its result returns', () => {
    const h = harness(duelMode);
    h.command({ kind: 'start', initBytes: encode(duelInit(4, 'mode-duel')) });
    expect(() => h.runtime.attachPeer('third', [2], portEndpoint().port)).toThrow();
    const p = portEndpoint(), off = h.runtime.attachPeer('crew', [0, 1], p.port);
    ticks(h, 0, 5);
    p.receive({ version: 1, type: 'data', id: 1, kind: 'reliable-ordered', bytes: codec.encodeMessage({ kind: 'command', envelope: {
      runId: 'mode-duel', id: { player: 1, sequence: 1 }, requestedTick: 5, command: { kind: 'presence', present: false } } }) });
    ticks(h, 5, 2);
    const messages = p.sent.filter((x: any) => x.type === 'data').map((x: any) => codec.decodeMessage(x.bytes));
    expect(messages.find((m) => m.kind === 'state')).toBeDefined();
    expect(messages).toContainEqual(expect.objectContaining({ kind: 'result', result: expect.objectContaining({ id: { player: 1, sequence: 1 }, status: 'applied' }) }));
    p.receive({ version: 1, type: 'data', id: 2, kind: 'reliable-ordered', bytes: codec.encodeMessage({ kind: 'command', envelope: {
      runId: 'mode-duel', id: { player: 0, sequence: 1 }, requestedTick: 7, command: { kind: 'laserCharge', held: true } } }) });
    ticks(h, 7, 2);
    const later = p.sent.filter((x: any) => x.type === 'data').map((x: any) => codec.decodeMessage(x.bytes));
    expect(later).toContainEqual(expect.objectContaining({ kind: 'result', result: expect.objectContaining({ id: { player: 0, sequence: 1 }, status: 'rejected', reason: 'not-at-weapons' }) }));
    off(); expect(p.closed).toBe(true); expect(p.listeners).toBe(0);
    const q = portEndpoint(); h.runtime.attachPeer('crew', [0], q.port); expect(q.closed).toBe(false);
  });
  it('a streamed duel attachment publishes state images that decode to the authority\'s publication', () => {
    const h = harness(duelMode);
    h.command({ kind: 'start', initBytes: encode(duelInit(6, 'mode-duel')) });
    const p = portEndpoint(); h.runtime.attachPeer('crew', [0, 1], p.port, { streamed: true, latestPayloadLimit: 4096 });
    ticks(h, 0, 3);
    const packets = p.sent.filter((x: any) => x.type === 'data').map((x: any) => x.bytes as Uint8Array).filter((b) => classifyStreamPacket(b).stream === 'state');
    expect(packets.length).toBeGreaterThan(0);
    const image = decodeState(decodeStatePacket(packets[0]!)), options = { resolveLayout: resolveCutter, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ };
    const publication = imageToDuelPublication(image, options);
    expect(publication.runId).toBe('mode-duel');
    expect(publication.hash).toBe(hashF64(image.values));
    expect(publication.snapshot.header.hash).toBe(publication.hash);
    expect(imageToDuelPublication(duelPublicationToImage(publication, options), options)).toEqual(publication);
    const tampered: DuelPublication = { ...publication, snapshot: { ...publication.snapshot, values: publication.snapshot.values.map((v, k) => k === 7 ? v + 1 : v) } };
    expect(() => duelPublicationToImage(tampered, options)).toThrow();
  });
  it('the duel mode refuses a sector init and the sector mode a duel init, keeping the previous owner', () => {
    const duel = harness(duelMode), sector = harness(sectorMode);
    expect(duel.command({ kind: 'start', initBytes: encode(sectorInit()) }).ok).toBe(false);
    expect(sector.command({ kind: 'start', initBytes: encode(duelInit(1)) }).ok).toBe(false);
    expect(duel.command({ kind: 'start', initBytes: encode({ ...duelInit(1), playerCount: 3 }) }).ok).toBe(false);
    expect(duel.command({ kind: 'start', initBytes: encode(duelInit(1)) }).ok).toBe(true);
    expect(duel.command({ kind: 'restore', checkpointBytes: encode({ bad: true }) }).ok).toBe(false);
    expect(duel.command({ kind: 'checkpoint' }).ok).toBe(true);
  });
  it('a utility host initialised as the duel mode runs it (the authorityHost registry)', () => {
    const messages: any[] = [];
    const owner = createUtilityHost(createModeRegistry([sectorMode, duelMode]), { contentDigest: __GAMEPLAY_CONTENT_DIGEST__, clock: { nowMs: () => 0 },
      scheduler: { schedule: () => () => {} }, onCrash() {} }, m => messages.push(m));
    try {
      owner.receive({ kind: 'initialize', protocolVersion: 2, modeId: 'duel', schemaVersion: 1, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, hostGeneration: 3 }, []);
      owner.receive({ kind: 'command', command: { kind: 'start', requestId: 1, hostGeneration: 3, initBytes: encode(duelInit(2, 'utility-duel')) } }, []);
      owner.receive({ kind: 'command', command: { kind: 'checkpoint', requestId: 2, hostGeneration: 3 } }, []);
      const cp = decode(messages.at(-1).response.checkpointBytes);
      expect(cp.init.runId).toBe('utility-duel');
      expect(cp.snapshot.header).toMatchObject({ snapshotFormat: 1, seed: 2, tick: 0 });
    } finally { owner.dispose(); }
  });
});
```

Run: `npx vitest run tests/duelMode.test.ts`
Expected: FAIL: the file does not load (`../src/network/modes/duel` does not exist yet).

- [ ] **Step 2: The stream binding, the duel's adapter, the mode and its registration**

Create `src/network/modes/streamBinding.ts`:

```ts
// The host side of a streamed attachment for any encounter mode (engine refactor spec §6: each mode owns its stream
// publication adapter). Moved unchanged from the sector stream: the mode supplies how a publication becomes a Net-3
// StateImage, its message codec, its notification stream name and its error label.
import type { AttachOptions } from '../../renderer/src/authority/authority';
import type { AuthorityMessage, ChannelKind, Link, MonotonicClock, PublishedState } from '../../renderer/src/net/contracts';
import type { MessageCodec } from '../../renderer/src/net/codec';
import { classifyStreamPacket, createTransportSequence, decodeOpaquePacket, decodeStatePacket, inspectState, encodeOpaquePacket, MAX_RETAINED_IMAGES, type StateImage } from '../state/imageCodec';
import { createStateSender } from '../state/sender';

type Notification<S> = Extract<AuthorityMessage<S>, { kind: 'result' | 'event' }>;
export interface ModeStreamOptions<S> {
  clock: MonotonicClock; latestPayloadLimit: number;
  /** Validate a publication and turn it into a state image (throws on an invalid publication). */
  toImage(publication: PublishedState<S>): StateImage;
  codec: MessageCodec<S>;
  notificationStream: string;
  /** Prefix of every close reason and error, e.g. 'sector'. */
  label: string;
}

/** Mode-owned envelope preserves the original reliable codec bytes verbatim. */
export function encodeModeNotification<S>(codec: MessageCodec<S>, stream: string, label: string, message: Notification<S>, requiredPublicationSequence: number, transportSequence: number): Uint8Array {
  if (!Number.isSafeInteger(requiredPublicationSequence) || requiredPublicationSequence < 0) throw Error(`${label}-notification-floor`);
  const payload = codec.encodeMessage(message), body = new Uint8Array(9 + payload.length);
  body[0] = 1; new DataView(body.buffer).setFloat64(1, requiredPublicationSequence, true); body.set(payload, 9);
  return encodeOpaquePacket('state', stream, transportSequence, body);
}
export function modeInputIdentity<S>(codec: MessageCodec<S>, label: string, bytes: Uint8Array, channel: ChannelKind): { stream: string; channel: ChannelKind } {
  const message = codec.decodeMessage(bytes);
  if (message.kind === 'held') {
    const held = message.frame.held, neutral = held.moveX === 0 && held.moveY === 0 && !held.interactHeld;
    return { stream: `held:${message.frame.player}`, channel: neutral && channel === 'reliable-ordered' ? 'reliable-ordered' : 'unreliable-latest' };
  }
  if (message.kind === 'command' || message.kind === 'callout') return { stream: message.kind, channel: 'reliable-ordered' };
  throw Error(`${label}-input-direction`);
}

/** Trusted authority attachment. It owns stream controls, while the authority owns gameplay ingress. */
export function createModeStreamBinding<S>(link: Link, options: ModeStreamOptions<S>) {
  const { codec, label } = options;
  const nextTransportSequence = createTransportSequence(), messages = new Set<(kind: ChannelKind, bytes: Uint8Array) => void>();
  let closed = false, ready = false;
  const sentFulls = new Set<number>();
  const removers: (() => void)[] = [];
  const sender = createStateSender({ clock: options.clock, latestPayloadLimit: options.latestPayloadLimit, nextTransportSequence,
    send: (kind, bytes) => {
      if (closed) return;
      if (!ready && kind === 'reliable-ordered') {
        // Record before send: a synchronous transport can deliver the ACK and
        // subsequent input before this callback returns.
        sentFulls.add(inspectState(decodeStatePacket(bytes)).sequence);
        while (sentFulls.size > MAX_RETAINED_IMAGES) sentFulls.delete(sentFulls.values().next().value!);
      }
      link.send(kind, bytes);
    }, close: reason => link.close(reason) });
  function dispose(): void { if (closed) return; closed = true; ready = false; sentFulls.clear(); sender.dispose(); messages.clear(); for (const off of removers.splice(0)) { try { off(); } catch { /* release all subscriptions */ } } }
  const offClose = link.onClose(dispose);
  if (closed) offClose(); else removers.push(offClose);
  if (!closed) removers.push(link.onMessage((kind, bytes) => {
    if (closed) return;
    try {
      const metadata = classifyStreamPacket(bytes);
      if (metadata.class === 'control' && metadata.stream === 'state-control') {
        if (kind !== 'reliable-ordered') throw Error(`${label}-control-channel`);
        sender.receiveControl(bytes);
        if (!closed && !ready && sentFulls.has(sender.acknowledgedSequence())) { ready = true; sentFulls.clear(); }
        return;
      }
      if (metadata.class !== 'input') throw Error(`${label}-input-direction`);
      const payload = decodeOpaquePacket(bytes), expected = modeInputIdentity(codec, label, payload.bytes, kind);
      if (payload.stream !== expected.stream || kind !== expected.channel) throw Error(`${label}-input-channel`);
      if (!ready) return;
      for (const receive of [...messages]) { if (closed) break; receive(kind, payload.bytes); }
    } catch { link.close(`${label}-stream-invalid`); }
  }));
  const authorityLink: Link = { peer: link.peer, caps: link.caps, stats: () => link.stats(), close: reason => link.close(reason),
    onClose: cb => link.onClose(cb), onMessage(cb) { messages.add(cb); return () => { messages.delete(cb); }; },
    send() { throw Error(`${label}-stream-missing-sink`); } };
  const attachOptions: AttachOptions<S> = {
    publicationSink(publication, reliable) {
      if (closed) return;
      try { sender.publish(options.toImage(publication), reliable); } catch { link.close(`${label}-stream-invalid`); }
    },
    notificationSink(message, floor) {
      if (closed) return;
      try { link.send('reliable-ordered', encodeModeNotification(codec, options.notificationStream, label, message, floor, nextTransportSequence())); } catch { link.close(`${label}-stream-invalid`); }
    }
  };
  return { link: authorityLink, attachOptions, dispose, stats: sender.stats };
}
```

Replace the whole of `src/network/modes/sectorStream.ts` with:

```ts
import { createClientRun } from '../../renderer/src/clientControl/clientRun';
import type { AuthorityMessage, ChannelKind, Link, MonotonicClock, PublishedState } from '../../renderer/src/net/contracts';
import { decodeMessage, validatePublication, MAX_MESSAGE_BYTES, createMessageCodec } from '../../renderer/src/net/codec';
import { validateSnapshot } from '../../renderer/src/sim/snapshot';
import type { ShipLayout } from '../../renderer/src/sim/ship/schema';
import { Life, Position, Seated, Stable } from '../../renderer/src/sim/components';
import { CREW_SPEED, TICK_HZ } from '../../renderer/src/sim/tuning';
import { speedMult } from '../../renderer/src/sim/characters';
import { hashF64 } from '../../shared/hash';
import { classifyStreamPacket, createTransportSequence, decodeOpaquePacket, decodeStatePacket, inspectState, encodeOpaquePacket, imageBytes, MAX_IMAGE_BYTES, MAX_METADATA_BYTES, type StateImage } from '../state/imageCodec';
import { createStateReceiver } from '../state/receiver';
import { createModeStreamBinding, encodeModeNotification, modeInputIdentity } from './streamBinding';
import { createPresentationTimeline, type PresentationPoint, type PresentationTimelineOptions } from '../state/timeline';

export interface SectorValidationOptions { resolveLayout(id: string): ShipLayout; contentDigest?: string }
type Notification = Extract<AuthorityMessage, { kind: 'result' | 'event' }>;
const NOTIFICATION_STREAM = 'sector-notification';
const codec = createMessageCodec();
function identity(value: unknown): string {
  const text = JSON.stringify(value);
  return hashF64(Float64Array.from(text, c => c.charCodeAt(0)));
}
function epoch(publication: PublishedState): string {
  return identity([publication.runId, publication.snapshot.header.layoutId, publication.snapshot.header.layoutHash, publication.controlRevision, publication.phase]);
}
function checkedPublication(value: unknown, options: SectorValidationOptions): PublishedState {
  const publication: PublishedState = validatePublication(value);
  if (publication.tick !== publication.snapshot.header.tick || publication.hash !== hashF64(Float64Array.from(publication.snapshot.values))) throw Error('sector-state-identity');
  publication.snapshot = validateSnapshot(options.resolveLayout(publication.snapshot.header.layoutId), publication.snapshot, options.contentDigest);
  return publication;
}
/** No local byte-codec roundtrip: numeric canonical values go directly into the image. */
export function publicationToImage(value: PublishedState, options: SectorValidationOptions): StateImage {
  const publication = checkedPublication(value, options);
  const image: StateImage = { sequence: publication.publicationSequence, tick: publication.tick, epoch: epoch(publication),
    metadata: new TextEncoder().encode(JSON.stringify({ ...publication, snapshot: { header: publication.snapshot.header } })),
    values: Float64Array.from(publication.snapshot.values) };
  if (image.metadata.length > MAX_METADATA_BYTES || imageBytes(image) > MAX_IMAGE_BYTES) throw Error('sector-image-capacity');
  return image;
}
export function imageToPublication(image: StateImage, options: SectorValidationOptions): PublishedState {
  if (!(image.metadata instanceof Uint8Array) || image.metadata.length > MAX_METADATA_BYTES || !(image.values instanceof Float64Array)
    || typeof image.epoch !== 'string' || image.epoch.length > 128 || imageBytes(image) > MAX_IMAGE_BYTES) throw Error('sector-image-capacity');
  const metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(image.metadata));
  if (!metadata?.snapshot || Object.keys(metadata.snapshot).length !== 1 || !Object.hasOwn(metadata.snapshot, 'header')) throw Error('sector-image-metadata');
  const publication = checkedPublication({ ...metadata, snapshot: { header: metadata.snapshot.header, values: Array.from(image.values) } }, options);
  if (image.sequence !== publication.publicationSequence || image.tick !== publication.tick || image.epoch !== epoch(publication)) throw Error('sector-image-identity');
  return publication;
}

/** Mode-owned envelope preserves the original reliable codec bytes verbatim. */
export function encodeSectorNotification(message: Notification, requiredPublicationSequence: number, transportSequence: number): Uint8Array {
  return encodeModeNotification(codec, NOTIFICATION_STREAM, 'sector', message, requiredPublicationSequence, transportSequence);
}
function decodeNotification(packet: Uint8Array): { message: Notification; floor: number } {
  const { bytes, class: payloadClass, stream } = decodeOpaquePacket(packet);
  if (payloadClass !== 'state' || stream !== NOTIFICATION_STREAM || bytes.length <= 9 || bytes.length > 9 + MAX_MESSAGE_BYTES || bytes[0] !== 1) throw Error('sector-notification');
  const floor = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(1, true), message = decodeMessage(bytes.subarray(9));
  if (!Number.isSafeInteger(floor) || floor < 0 || message.kind !== 'result' && message.kind !== 'event') throw Error('sector-notification');
  return { message, floor };
}
function inputIdentity(bytes: Uint8Array, channel: ChannelKind): { stream: string; channel: ChannelKind } {
  return modeInputIdentity(codec, 'sector', bytes, channel);
}

/** Trusted authority attachment. It owns stream controls, while the authority owns gameplay ingress. */
export function createSectorStreamBinding(link: Link, options: SectorValidationOptions & { clock: MonotonicClock; latestPayloadLimit: number }) {
  return createModeStreamBinding(link, { clock: options.clock, latestPayloadLimit: options.latestPayloadLimit,
    toImage: publication => publicationToImage(publication, options), codec, notificationStream: NOTIFICATION_STREAM, label: 'sector' });
}

export interface SectorRemoteClientOptions extends SectorValidationOptions {
  runId: string; clock: MonotonicClock; presentation?: PresentationTimelineOptions;
}
export function createSectorRemoteClient(link: Link, owned: readonly number[], options: SectorRemoteClientOptions) {
  const nextTransportSequence = createTransportSequence(), presentation = createPresentationTimeline(options.presentation);
  let closed = false, disposed = false;
  const removers: (() => void)[] = [];
  const clientLink: Link = { peer: link.peer, caps: link.caps, stats: () => link.stats(), close: reason => link.close(reason),
    onClose: cb => link.onClose(cb), onMessage: () => () => {},
    send(kind, bytes) {
      if (closed) return;
      try { const expected = inputIdentity(bytes, kind); if (kind !== expected.channel) throw Error('sector-input-channel');
        link.send(kind, encodeOpaquePacket('input', expected.stream, nextTransportSequence(), bytes));
      } catch { link.close('sector-stream-invalid'); }
    }
  };
  const client = createClientRun(clientLink, owned, { ...options, admissionPolicy: 'receive-time', remoteStreaming: true });
  let previous: { tick: number; points: PresentationPoint[] } | undefined;
  const generations = new Map<string, number>();
  function present(publication: PublishedState): void {
    const state = client.state(); if (!state || closed) return;
    const targets = identity([state.weapons.target, state.science.target]);
    const points = state.crew.map((eid, player): PresentationPoint => {
      const id = `crew:${player}`, x = Position.x[eid]!, y = Position.y[eid]!, prior = previous?.points.find(point => point.id === id);
      const maxDistance = previous ? CREW_SPEED * speedMult(state, player) * Math.max(0, state.tick - previous.tick) / TICK_HZ + 1e-6 : Infinity;
      if (prior && Math.hypot(x - prior.x, y - prior.y) > maxDistance) generations.set(id, (generations.get(id) ?? 0) + 1);
      return { id, x, y, generation: `${Stable.id[eid]}:${Seated.station[eid]}:${Life.state[eid]}:${targets}:${generations.get(id) ?? 0}` };
    });
    presentation.push({ tick: state.tick, epoch: identity([epoch(publication), state.run.sector, state.run.node, state.run.arrivalTick]), paused: publication.phase !== 'running', points }, options.clock.nowMs());
    previous = { tick: state.tick, points };
  }
  const receiver = createStateReceiver({ clock: options.clock, nextTransportSequence,
    accept(image) {
      if (closed) return 'ignored';
      let publication: PublishedState;
      try { publication = imageToPublication(image, options); } catch { return 'rejected'; }
      const result = client.acceptPublication(publication);
      if (result === 'accepted' && !closed) present(publication);
      return result;
    },
    sendControl(bytes) {
      if (closed) return false;
      try { link.send('reliable-ordered', bytes); return !closed; } catch { link.close('sector-stream-invalid'); return false; }
    },
    onAcknowledged(image) { if (!closed) client.acknowledgePublication(image.sequence); },
    close: reason => link.close(reason)
  });
  function disconnect(): void {
    if (closed) return; closed = true; receiver.dispose(); client.dispose(); presentation.disconnect(); previous = undefined; generations.clear();
    for (const off of removers.splice(0)) { try { off(); } catch { /* release all subscriptions */ } }
  }
  const offClose = link.onClose(disconnect);
  if (closed) offClose(); else removers.push(offClose);
  if (!closed) removers.push(link.onMessage((kind, bytes) => {
    if (closed) return;
    try {
      const metadata = classifyStreamPacket(bytes);
      if (metadata.class === 'state' && metadata.stream === 'state') {
        const header = inspectState(decodeStatePacket(bytes));
        if (kind !== (header.kind === 'full' ? 'reliable-ordered' : 'unreliable-latest')) throw Error('sector-state-channel');
        receiver.receive(bytes); return;
      }
      if (kind !== 'reliable-ordered') throw Error('sector-notification-channel');
      const { message, floor } = decodeNotification(bytes); client.acceptNotification(message, floor);
    } catch { link.close('sector-stream-invalid'); }
  }));
  return { ...client, presentation, streamStats: receiver.stats,
    dispose() { if (disposed) return; disposed = true; disconnect(); presentation.dispose(); }
  };
}
```

Create `src/network/modes/duelStream.ts`:

```ts
// The duel's stream publication adapter (engine refactor spec §6), the equivalent of sectorStream: a duel publication
// becomes a Net-3 StateImage (its canonical values, with the rest of the publication as metadata) and back. The
// remote duel client and the online duel UI are H-2; R-1 owns the host side and the image round trip.
import type { Link, MonotonicClock, PublishedState } from '../../renderer/src/net/contracts';
import { duelCodec, duelPublicationSchema } from '../../renderer/src/net/codec';
import type { ResolveLayout } from '../../renderer/src/authority/rules';
import { validateDuelSnapshot, type DuelSnapshot } from '../../renderer/src/sim/duel/snapshot';
import { hashF64 } from '../../shared/hash';
import { imageBytes, MAX_IMAGE_BYTES, MAX_METADATA_BYTES, type StateImage } from '../state/imageCodec';
import { createModeStreamBinding } from './streamBinding';

export interface DuelValidationOptions { resolveLayout: ResolveLayout; contentDigest: string }
export type DuelPublication = PublishedState<DuelSnapshot>;
const NOTIFICATION_STREAM = 'duel-notification';

function identity(value: unknown): string {
  const text = JSON.stringify(value);
  return hashF64(Float64Array.from(text, c => c.charCodeAt(0)));
}
function epoch(publication: DuelPublication): string {
  return identity([publication.runId, publication.snapshot.header.layoutId, publication.snapshot.header.layoutHash, publication.controlRevision, publication.phase]);
}
function checkedPublication(value: unknown, options: DuelValidationOptions): DuelPublication {
  const publication = duelPublicationSchema.parse(value) as DuelPublication;
  if (publication.tick !== publication.snapshot.header.tick || publication.hash !== hashF64(Float64Array.from(publication.snapshot.values))) throw Error('duel-state-identity');
  publication.snapshot = validateDuelSnapshot(options.resolveLayout(publication.snapshot.header.layoutId), publication.snapshot, options.contentDigest);
  return publication;
}
export function duelPublicationToImage(value: DuelPublication, options: DuelValidationOptions): StateImage {
  const publication = checkedPublication(value, options);
  const image: StateImage = { sequence: publication.publicationSequence, tick: publication.tick, epoch: epoch(publication),
    metadata: new TextEncoder().encode(JSON.stringify({ ...publication, snapshot: { header: publication.snapshot.header } })),
    values: Float64Array.from(publication.snapshot.values) };
  if (image.metadata.length > MAX_METADATA_BYTES || imageBytes(image) > MAX_IMAGE_BYTES) throw Error('duel-image-capacity');
  return image;
}
export function imageToDuelPublication(image: StateImage, options: DuelValidationOptions): DuelPublication {
  if (!(image.metadata instanceof Uint8Array) || image.metadata.length > MAX_METADATA_BYTES || !(image.values instanceof Float64Array)
    || typeof image.epoch !== 'string' || image.epoch.length > 128 || imageBytes(image) > MAX_IMAGE_BYTES) throw Error('duel-image-capacity');
  const metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(image.metadata));
  if (!metadata?.snapshot || Object.keys(metadata.snapshot).length !== 1 || !Object.hasOwn(metadata.snapshot, 'header')) throw Error('duel-image-metadata');
  const publication = checkedPublication({ ...metadata, snapshot: { header: metadata.snapshot.header, values: Array.from(image.values) } }, options);
  if (image.sequence !== publication.publicationSequence || image.tick !== publication.tick || image.epoch !== epoch(publication)) throw Error('duel-image-identity');
  return publication;
}

/** The host side of a streamed duel attachment. */
export function createDuelStreamBinding(link: Link, options: DuelValidationOptions & { clock: MonotonicClock; latestPayloadLimit: number }) {
  return createModeStreamBinding<DuelSnapshot>(link, { clock: options.clock, latestPayloadLimit: options.latestPayloadLimit,
    toImage: publication => duelPublicationToImage(publication, options), codec: duelCodec(2), notificationStream: NOTIFICATION_STREAM, label: 'duel' });
}
```

Create `src/network/modes/duel.ts`:

```ts
// The duel mode (engine refactor spec §6): the second registered mode, one defineEncounterMode call over the duel
// rules. Its producers are the humans alone (the duel has no bots in R-1; a vacant player simply sends nothing), and its
// stream adapter is duelStream. The online duel UI and the main/renderer wiring are H-2.
import { duelRules, type DuelTypes } from '../../renderer/src/authority/duelRules';
import { duelCodec } from '../../renderer/src/net/codec';
import { SIM_VERSION } from '../../renderer/src/sim/tuning';
import { parseShip } from '../../renderer/src/sim/ship/schema';
import cutter from '../../renderer/src/sim/ship/cutter.json';
import { createDuelStreamBinding } from './duelStream';
import { defineEncounterMode, jsonModeCodecs, type EncounterProducers } from './encounterMode';
import type { ModeDefinition, Unsubscribe } from './contracts';

const CUTTER = parseShip(cutter);
function resolveLayout(id: string) { if (id !== CUTTER.id) throw Error('unknown duel layout'); return CUTTER; }
const decode = duelCodec();

export const duelMode: ModeDefinition = defineEncounterMode<DuelTypes>({
  modeId: 'duel', schemaVersion: 1, simVersion: SIM_VERSION, rules: duelRules, resolveLayout,
  codecs: jsonModeCodecs(duelRules, resolveLayout, 'duel'),
  producers({ authority }): EncounterProducers<DuelTypes> {
    const humans = new Set<Unsubscribe>();
    return {
      controllers: () => [], beforeControls() {}, beforeTick() {},
      attachHuman(link, players, options) {
        const off = authority.attach(link, players, options); humans.add(off);
        return () => { if (humans.delete(off)) off(); };
      },
      dispose() { for (const off of [...humans]) { humans.delete(off); off(); } }
    };
  },
  publication: (link, options) => createDuelStreamBinding(link, options),
  latestStreamKey(bytes) { const message = decode.decodeMessage(bytes); return message.kind === 'held' ? `held:${message.frame.player}` : 'state'; }
});
```

Replace the whole of `src/utility/authorityHost.ts` with:

```ts
import { performance } from 'node:perf_hooks';
import { randomBytes } from 'node:crypto';
import { createUtilityHost } from '../network/utilityHost';
import { createModeRegistry } from '../network/modes/registry';
import { sectorMode } from '../network/modes/sector';
import { duelMode } from '../network/modes/duel';
import { emitterPortEndpoint } from '../network/platformPort';

declare const __GAMEPLAY_CONTENT_DIGEST__: string;
const parent = process.parentPort;
if (!parent) throw Error('authority utility requires parent port');
const owner = createUtilityHost(createModeRegistry([sectorMode, duelMode]), {
  contentDigest: __GAMEPLAY_CONTENT_DIGEST__, clock: { nowMs: () => performance.now() },
  leaseClock: { nowMs: () => performance.now(), epochMs: () => Date.now() }, nonce: () => randomBytes(16).toString('hex'),
  scheduler: { schedule(delayMs, callback) { const timer = setTimeout(callback, delayMs); return () => clearTimeout(timer); } },
  onCrash() { /* generic controller owns bounded crash forwarding and disposal */ }
}, message => parent.postMessage(message));
parent.on('message', event => owner.receive(event.data,
  event.ports.map(port => emitterPortEndpoint(port, 'electron'))));
(parent as NodeJS.EventEmitter).on('close', () => { owner.dispose(); process.exit(0); });
process.on('exit', () => owner.dispose());
```

Replace the whole of `tests/networkBoundary.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { moduleSpecifiers } from './helpers/determinismGuard';

function walk(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(root, entry.name)) : entry.name.endsWith('.ts') ? [join(root, entry.name)] : []);
}
function forbiddenDependencies(source: string): string[] {
  const tree = ts.createSourceFile('boundary.ts', source, ts.ScriptTarget.Latest, true);
  const allowed = new Set<string>();
  for (const statement of tree.statements) if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly
    && ts.isStringLiteral(statement.moduleSpecifier) && /renderer\/src\/net\/(contracts|receivePolicy)$/.test(statement.moduleSpecifier.text)) allowed.add(statement.moduleSpecifier.text);
  return moduleSpecifiers(source).filter(specifier => !allowed.has(specifier)
    && (/renderer\//.test(specifier) || /(?:sector|tactical|bitecs|components|schema|snapshot)(?:[/.]|$)/.test(specifier)));
}
describe('generic host import boundary', () => {
  it.each([
    "import { createSimState } from '../renderer/src/sim/state';",
    "import type { Snapshot } from '../renderer/src/sim/snapshot';",
    "import { sectorMode } from './modes/sector';",
    "export { schema } from './tactical/schema';",
    "const ecs = require('bitecs');"
  ])('rejects a mode dependency even through a type/export/require: %s', source => {
    expect(forbiddenDependencies(source)).toHaveLength(1);
  });
  for (const file of [...walk('src/network').filter(file => !['modes/sector.ts', 'modes/sectorStream.ts', 'modes/sectorProducers.ts', 'modes/encounterMode.ts', 'modes/streamBinding.ts', 'modes/duel.ts', 'modes/duelStream.ts'].includes(relative('src/network', file).replaceAll('\\', '/'))),
    ...walk('src/main/network').filter(file => relative('src/main/network', file).replaceAll('\\', '/') !== 'onlineSector.ts')]) {
    it(`${relative(resolve('.'), resolve(file))} imports only generic runtime contracts`, () => {
      expect(forbiddenDependencies(readFileSync(file, 'utf8'))).toEqual([]);
    });
  }
});
```

- [ ] **Step 3: Run the mode tests and Net-3's tests**

Run: `npx vitest run tests/duelMode.test.ts tests/sectorStream.test.ts tests/modeHost.test.ts tests/sectorProducers.test.ts tests/sessionCapture.test.ts tests/utilityHost.test.ts tests/hostProcess.test.ts tests/encounterMode.test.ts tests/networkBoundary.test.ts`
Expected: PASS, 157 tests in 9 files. `tests/sectorStream.test.ts` runs unedited on the moved binding.

- [ ] **Step 4: The sector is still unchanged at every tick**

Run: `npx tsx scripts/golden/canonical-trace.ts same`
Expected: `per-tick canonical trace unchanged at sim version 37: golden 7200 ticks, determinism-v2 108000 ticks in 19 runs`, exit 0.

- [ ] **Step 5: Typecheck, the host-runtime gate, the full suite and the cross-engine check**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run test:host-runtime`
Expected: `ACTUAL host runtime PASS: Electron 37.10.3; 15 checks; 8/8 utility exits` (it builds the utility with both modes registered), exit 0.

Run: `npm test`
Expected: every file passes, 3,121 tests in 226 files at master cabc521 (28 more than after R-1a: the four new test files) (see the known flakes in Global Constraints). No file under `tests/golden/` or `tests/fixtures/` has changed.

Run: `npm run test:determinism -- --output-dir=out/r1b-determinism`
Expected: exit 0, with `1800 canonical samples, 404 result/event boundaries PASS` for Node and `1800 samples PASS` for Electron (and Firefox where it is installed). The output-dir flag (read by scripts/determinism/run.ts) sends its evidence logs to the git-ignored out/ folder instead of the tracked default under .superpowers/sdd/, so this step leaves git status unchanged apart from the files the commits name.

- [ ] **Step 6: Commit**

```bash
git add src/network/modes/streamBinding.ts src/network/modes/sectorStream.ts src/network/modes/duelStream.ts src/network/modes/duel.ts src/utility/authorityHost.ts tests/duelMode.test.ts tests/networkBoundary.test.ts
git commit -q -m "feat(network): the duel is a registered Net-3 mode with its stream adapter (engine refactor R-1b)"
```

(End the message with your session's Co-Authored-By trailer.)

---

## After R-1b

- **R-1 is complete headless:** the duel runs through the generic authority, checkpoints and restores at the `hostRuntime` and utility level, replays by mode, and a utility initialised as `duel` runs it.
- **H-2** wires the online duel: a remote duel client over `duelStream`, `main/network` and the renderer's online session choosing the mode, and room compatibility for the duel layout. A room's mode is fixed at creation (spec §6).
- **R-2** (N-ship space and the systems record) builds on the `space` module: its migration oracle compares the fields this plan named.
