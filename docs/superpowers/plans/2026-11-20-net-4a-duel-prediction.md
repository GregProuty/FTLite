# Net-4a Duel Prediction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The online duel client draws a second, predicted `DuelState` (`P`), the confirmed replica (`C`) stepped ahead to "now" with the real `stepDuelTick`. Your own ship, character and console then answer on the next local tick, and the picture keeps moving through lost updates. No simulation rule, golden or `SIM_VERSION` changes.

**Architecture:** There are three layers.

- **Wire.** Every publication carries each player's latched held input. This is a schema version bump for both modes.
- **Predictor.** A new headless module, `clientControl/duelPredictor.ts`, owns `P`. It keeps an input log of this seat's local ticks. On each publication it either verifies `P` by hash and input content, or restores `P` from the snapshot and re-steps it.
- **Session and view.** The online duel session drives local ticks at 60 Hz from elapsed time and feeds the predictor. The view source draws `P`, except for three things: other players' characters (interpolated from `C`), the end card, outcome and one-shot sounds (from `C`), and effects (still from `C`'s counters, placed at `P`'s positions). The hand-written local guesses are then deleted.

**Tech Stack:** TypeScript and Vitest. The sim is in `src/renderer/src/sim`, the client side in `src/renderer/src/clientControl`, and the app in `src/renderer/src/app/duel`. The Net-3 stream is in `src/network`. Use PowerShell or Git Bash on Windows.

**Spec:** `docs/superpowers/specs/2026-11-19-net-4a-duel-prediction-design.md`, converged at 8f2a86f8. Section numbers below (§) are the spec's.

## Global Constraints

- **Do not change:**
  - Any sim rule, golden, `tests/fixtures/determinism-v2.json` or `SIM_VERSION`. It stays 63 (`src/renderer/src/sim/tuning.ts`; the W-4 merge 90cd5825 moved it from 62 after the spec was written).
  - The host's work, beyond adding `held` to each publication.
- **Duel only.** The sector predicts nothing. It carries `held` on the wire and ignores it.
- **Schema versions move in pairs**, or hosting fails (`createHostRuntime` compares them):
  - Duel: `src/network/modes/duel.ts` `schemaVersion` and `DUEL_SCHEMA_VERSION` in `src/network/online/onlineDuel.ts`, both 2 → 3.
  - Sector: `src/network/modes/sector.ts` `schemaVersion` and the literal in `sectorCompatibility` in `src/network/online/onlineSector.ts`, both 1 → 2.
- **`src/renderer/src/clientControl` is in the deterministic module graph** (`tests/boundary.test.ts`). The rules there:
  - No `performance` or `Date`.
  - No import of `app/`, `render/` or `input/`.
  - Math only from `abs ceil floor round min max sign imul sqrt`.
  - No `**`.
  - The predictor measures no time. The session times its calls.
- **Constants:**

  | Constant | Value | Meaning |
  |---|---|---|
  | `PREDICT_MAX_TICKS` | `30` | 500 ms |
  | `PREDICT_SLACK_TICKS` | `2` | §3.4 step 3 |
  | `PREDICT_HASH_EVERY` | `3` | Must equal `STATE_CADENCE_TICKS`; a test pins it |
  | Local tick | `1000 / 60` ms | At most `LOCAL_TICKS_MAX = 4` per pump; the rest are dropped |

- **Never predicted:** `setPaused`, `rematch` and `presence`. They go to the authority only.
- **Code style:** follow the codebase.
  - Comments name the spec section, e.g. `// Net-4a §3.4: ...`.
  - Write dense one-line helpers where the surrounding file does.
- **Commits:** end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Run commands from the repository root:**

  | What | Command |
  |---|---|
  | One test file | `npx vitest run tests/<file>.test.ts` |
  | Types | `npm run typecheck` (= `tsc -b`) |
  | Whole suite | `npm test` |

## File map

| File | Change | Task |
|---|---|---|
| `src/renderer/src/net/contracts.ts` | `PublishedState.held` | 1 |
| `src/renderer/src/net/codec.ts` | publication schema `held` + length refine | 1 |
| `src/renderer/src/authority/core.ts` | `publishCompletedState` writes `held` | 1 |
| `src/network/modes/duel.ts`, `src/network/online/onlineDuel.ts` | schema 3 | 1 |
| `src/network/modes/sector.ts`, `src/network/online/onlineSector.ts` | schema 2 | 1 |
| tests and scripts that build publication literals | add `held` | 1 |
| `scripts/determinism/duelRestore.ts` (new), `browser.ts`, `run.ts`, `protocol.ts` | G2 across engines | 2 |
| `tests/predictionRestore.test.ts` (new) | G2 on Node | 2 |
| `tests/helpers/impairedLink.ts` (new), `tests/impairedLink.test.ts` (new) | the latency and loss rig | 3 |
| `tests/helpers/onlineDuel.ts` | a `link` factory option | 3 |
| `src/renderer/src/clientControl/streamClient.ts` | `neutralize` returns its sequence | 4 |
| `src/renderer/src/clientControl/duelPredictor.ts` (new), `tests/duelPredictor.test.ts` (new) | the predictor | 4 |
| `tests/helpers/predictedSeat.ts` (new), `tests/predictionGates.test.ts` (new) | G1, G3, G5 | 5 |
| `src/renderer/src/render/duel/crewOverride.ts` (new) | where a character is drawn | 6 |
| `src/renderer/src/app/duel/onlineSource.ts`, `scene.ts` (interface only) | the source draws `P` | 6 |
| `tests/duelOnlineView.test.ts`, `tests/crewOverride.test.ts` (new) | | 6 |
| `src/renderer/src/app/duel/onlineDuel.ts`, `tests/onlineDuelSession.test.ts` | local ticks, input log, predictor | 7 |
| `src/renderer/src/app/duel/scene.ts`, `duelAudio.ts`, `src/renderer/src/render/duel/interiorView.ts`, `tests/predictionAudio.test.ts` (new) | confirmed outcome, sounds, override | 8 |
| `onlineDuel.ts`, `onlineSource.ts`, `tests/crewHelmOnline.test.ts`, `tests/duelOnlineView.test.ts`, `tests/onlineDuelSession.test.ts` | the hand-written predictions go | 9 |
| `src/renderer/src/render/duel/latencyOverlay.ts`, `src/renderer/src/net/duelRecord.ts`, `onlineDuel.ts`, tests | figures | 10 |
| `tests/predictionCorrections.test.ts` (new), `scripts/measure-prediction.ts` (new) | G4, G6, the §2 tables | 11 |
| `docs/superpowers/research/2026-11-20-net-4a.md` (new) | build report | 12 |

---

### Task 1: The publication carries every player's held input

§3.2. Today `PublishedState` has no `held`. Without it the Weapons seat predicts right 0.1% of the time (§2 item 3).

**Files:**
- Modify: `src/renderer/src/net/contracts.ts:169-175` (`PublishedState`)
- Modify: `src/renderer/src/net/codec.ts:201-206` (the `state` schema inside `messageSchemaFor`)
- Modify: `src/renderer/src/authority/core.ts:281-283` (`publishCompletedState`)
- Modify: `src/network/modes/duel.ts:19`, `src/network/online/onlineDuel.ts:19`, `src/network/modes/sector.ts:20`, `src/network/online/onlineSector.ts:31`
- Modify (fixtures that build publication literals, found by `npm run typecheck` and by failing tests):
  - `tests/netCodec.test.ts`, `tests/sectorStream.test.ts`, `tests/snapshotV2.test.ts`, `tests/authorityRecovery.test.ts`, `tests/crewOfFourWire.test.ts`, `tests/duelProducers.test.ts`, `tests/onlineDuel.test.ts:25`
  - `scripts/profile-duel-publication.ts:37`, `scripts/profile-publication.ts`, `scripts/spike-asteroids-iii-idle.ts:46`
- Create: `tests/publicationHeld.test.ts`

**Interfaces:**
- Produces: `PublishedState<S>.held: readonly HeldInput[]`, one per player, in player order. Task 4 reads it as `DuelPublication.held`.

- [ ] **Step 1: Write the failing test**

Create `tests/publicationHeld.test.ts`:

```ts
// Net-4a §3.2: every publication carries each player's held input as the authority latched it, the codec checks its
// length against the crew, and both modes' schema versions moved together (duel 3, sector 2).
import { describe, expect, it } from 'vitest';
import { duelPublicationSchema } from '../src/renderer/src/net/codec';
import { duelMode } from '../src/network/modes/duel';
import { sectorMode } from '../src/network/modes/sector';
import { DUEL_SCHEMA_VERSION, duelCompatibility } from '../src/network/online/onlineDuel';
import { sectorCompatibility } from '../src/network/online/onlineSector';
import { onlineDuel } from './helpers/onlineDuel';

describe('the publication carries held input (Net-4a §3.2)', () => {
  it('each seat\'s latched held input is in the next publication, optional fields included; the partner\'s stays neutral', () => {
    const w = onlineDuel(3), a = w.connect(0), b = w.connect(1);
    w.tick(2);
    a.client.held(0, { moveX: 1, moveY: 0, interactHeld: false, throttleHeld: 1, rcsX: -1 });
    w.tick(6);   // latched on the next tick, then out on the next cadence tick (every third)
    const p = b.client.publication()!;
    expect(p.held).toHaveLength(2);
    expect(p.held[0]).toEqual({ moveX: 1, moveY: 0, interactHeld: false, throttleHeld: 1, rcsX: -1 });
    expect(p.held[1]).toEqual({ moveX: 0, moveY: 0, interactHeld: false });
  });
  it('a pause clears held input before the paused publication', () => {
    const w = onlineDuel(3), a = w.connect(0);
    w.connect(1);
    w.tick(2);
    a.client.held(0, { moveX: 1, moveY: 0, interactHeld: false });
    w.tick(6);
    a.client.command(0, { kind: 'setPaused', paused: true });
    w.tick(6);
    const p = a.client.publication()!;
    expect(p.phase).toBe('paused');
    expect(p.held[0]).toEqual({ moveX: 0, moveY: 0, interactHeld: false });
  });
  it('the codec refuses a held array that is not one per player', () => {
    const w = onlineDuel(3), a = w.connect(0);
    w.tick(3);
    const good = structuredClone(a.client.publication()!) as unknown as { held: unknown[] };
    expect(() => duelPublicationSchema.parse(good)).not.toThrow();
    expect(() => duelPublicationSchema.parse({ ...good, held: good.held.slice(0, 1) })).toThrow();
    expect(() => duelPublicationSchema.parse({ ...good, held: undefined })).toThrow();
  });
  it('schema versions moved in pairs: duel 3, sector 2', () => {
    expect([duelMode.schemaVersion, DUEL_SCHEMA_VERSION, duelCompatibility().schemaVersion]).toEqual([3, 3, 3]);
    expect([sectorMode.schemaVersion, sectorCompatibility(2).schemaVersion]).toEqual([2, 2]);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/publicationHeld.test.ts`
Expected: FAIL. `p.held` is undefined, and the versions are `[2, 2, 2]` and `[1, 1]`.

- [ ] **Step 3: Implement**

In `src/renderer/src/net/contracts.ts`, add to `PublishedState` after `eventSequence: number;`:

```ts
  /** Net-4a §3.2: each player's held input as the authority has latched it when the publication is made, one per player.
   *  On a publication made right after a tick (every cadence one) it is what that tick used. */
  held: readonly HeldInput[];
```

In `src/renderer/src/net/codec.ts`, change the `state` schema. `held` is the held-input schema already defined above it in `messageSchemaFor`:

```ts
const state = z.object({
  runId: text, tick: uint, publicationSequence: positive, snapshot, hash: text, phase: z.enum(['running', 'paused', 'ended', 'error']),
  pauseOwner: player.nullable(), controlRevision: uint, pauseReason: text.nullable(), lagTicks: uint, tickTimeMs: seconds.nullable(),
  commandHighWater: z.array(uint).min(1).max(playerLimit), heldHighWater: z.array(uint).min(1).max(playerLimit), auxiliaryHighWater: z.array(uint).min(1).max(playerLimit), eventSequence: uint,
  held: z.array(held).min(1).max(playerLimit)   // Net-4a §3.2
}).strict().refine((value) => [value.commandHighWater, value.heldHighWater, value.auxiliaryHighWater, value.held]
  .every((water) => water.length === (value as { snapshot: { header: { playerCount: number } } }).snapshot.header.playerCount), 'publication watermarks and held input must cover every player');
```

In `src/renderer/src/authority/core.ts` `publishCompletedState`, append `held` to the publication literal:

```ts
      commandHighWater: highWater(), heldHighWater: [...heldSequences], auxiliaryHighWater: [...auxiliarySequences], eventSequence,
      held: held.map((h) => ({ ...h })) };   // Net-4a §3.2: what the tick just run used (a pause clears it before its publication)
```

Change the versions:
- `src/network/modes/duel.ts`: `schemaVersion: 3`.
- `src/network/online/onlineDuel.ts`: `export const DUEL_SCHEMA_VERSION = 3;`.
- `src/network/modes/sector.ts`: `schemaVersion: 2`.
- `src/network/online/onlineSector.ts`: `schemaVersion: 2` in `sectorCompatibility`.

- [ ] **Step 4: Fix every publication literal**

Run: `npm run typecheck`
Every error naming a missing `held` is a publication literal. Add `held` as an array of neutral inputs, one per player, next to `eventSequence`. For two players:

```ts
held: [{ moveX: 0, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }]
```

For `n` players write `Array.from({ length: n }, () => ({ moveX: 0, moveY: 0, interactHeld: false }))`.

Some tests slice the watermark arrays to make a short publication: `tests/crewOfFourWire.test.ts:113` loops `for (const k of ['commandHighWater', 'heldHighWater', 'auxiliaryHighWater'])`. Add `'held'` to that list, so the publication is short in every field it checks.

In `tests/onlineDuel.test.ts:25`, change `schemaVersion: 2` to `schemaVersion: 3`.

Some tests host a real mode with an identity literal, and `createHostRuntime` refuses a version that differs from the definition. Change each such literal to read the definition:
- `tests/encounterMode.test.ts:39`: `schemaVersion: mode.schemaVersion`.
- `tests/sessionCapture.test.ts:213-221`: the `modeId: 'sector', schemaVersion: 1` literal becomes `schemaVersion: sectorMode.schemaVersion`; import `sectorMode` from `../src/network/modes/sector`.

Then run `grep -rn "modeId: 'sector', schemaVersion: 1\|modeId: 'duel', schemaVersion: 2" tests` and fix every hit that hosts a real mode the same way. A literal for a made-up mode (`'counter'`, `'opaque'`, `'sector-copy'`) is left alone.

Then run `npx vitest run tests/netCodec.test.ts tests/sectorStream.test.ts tests/snapshotV2.test.ts tests/authorityRecovery.test.ts tests/crewOfFourWire.test.ts tests/duelProducers.test.ts tests/onlineDuel.test.ts tests/encounterMode.test.ts`. A JSON literal the compiler cannot see fails here with a zod error naming `held`; add `held` to it the same way.

`scripts/golden/authority-trace.ts` lists fields explicitly and does not need `held`. Leave it and the goldens alone.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run tests/publicationHeld.test.ts tests/netCodec.test.ts tests/sectorStream.test.ts tests/snapshotV2.test.ts tests/authorityRecovery.test.ts tests/crewOfFourWire.test.ts tests/duelProducers.test.ts tests/onlineDuel.test.ts tests/encounterMode.test.ts tests/sessionCapture.test.ts tests/golden.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/authority/core.ts src/network/modes/duel.ts src/network/modes/sector.ts src/network/online/onlineDuel.ts src/network/online/onlineSector.ts tests scripts/profile-duel-publication.ts scripts/profile-publication.ts scripts/spike-asteroids-iii-idle.ts
git commit -m "net-4a(wire): publications carry every player's held input; duel schema 3, sector 2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Restore, then step, is exact (G2)

§4.1 and gate G2. The property is that a state restored from a snapshot steps exactly as the state it was saved from. The prediction rests on it, so it is pinned on Node in the suite, and on Chromium and Firefox in the cross-engine run.

**Files:**
- Create: `scripts/determinism/duelRestore.ts`
- Modify: `scripts/determinism/browser.ts`, `scripts/determinism/run.ts`, `scripts/determinism/protocol.ts:29-38`
- Create: `tests/predictionRestore.test.ts`

**Interfaces:**
- Produces: `duelRestoreCheck(digest: string, options?: { seed?: number; ticks?: number; bursts?: boolean }): { checks: number; finalHash: string }`. It throws on the first tick whose restored copy differs.

- [ ] **Step 1: Write the failing test**

Create `tests/predictionRestore.test.ts`:

```ts
// Net-4a §4.1, gate G2: from a snapshot at every third tick of a scripted duel, a restored copy stepped 12 ticks with the
// straight run's inputs equals the straight run, quiet and with the Asteroids-iii bursts (a burst every 5 s).
import { describe, expect, it } from 'vitest';
import { duelRestoreCheck } from '../scripts/determinism/duelRestore';

/** Snapshots at ticks 0, 3, ..., each with 12 ticks after it inside the run. */
const CHECKS = Math.floor((1800 - 12) / 3) + 1;   // 597
describe('restore, then step, is exact (Net-4a G2)', () => {
  it('quiet: every third tick for 30 s', () => {
    expect(duelRestoreCheck(__GAMEPLAY_CONTENT_DIGEST__, { seed: 3, ticks: 1800 }).checks).toBe(CHECKS);
  });
  it('busy: a burst every 5 s, every third tick for 30 s', () => {
    expect(duelRestoreCheck(__GAMEPLAY_CONTENT_DIGEST__, { seed: 2, ticks: 1800, bursts: true }).checks).toBe(CHECKS);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/predictionRestore.test.ts`
Expected: FAIL, with "Failed to resolve import ../scripts/determinism/duelRestore".

- [ ] **Step 3: Write the check**

Create `scripts/determinism/duelRestore.ts`. The bursts are applied by a deterministic function of the state before each step: `burstStep` breaks the biggest belt rock on every tick that is a multiple of 300. The straight run and the restored copy therefore both apply them.

```ts
// Net-4a §4.1, gate G2 (spec 2026-11-19-net-4a-duel-prediction-design §6): restore, then step, is exact. A scripted
// Cutter duel is run straight, its inputs and hashes kept; at every third tick a copy is restored in place from that
// tick's snapshot and stepped 12 ticks with the same inputs, and its hash must equal the straight run's. `bursts` breaks
// the biggest belt rock every 300 ticks inside the step function both runs use (a deterministic function of the state),
// so the Asteroids-iii pieces are covered. Run by tests/predictionRestore.test.ts on Node and by the cross-engine run.
import cutter from '../../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { hashDuel } from '../../src/renderer/src/sim/duel/hash';
import { createScriptedPair, scriptedInput } from '../../src/renderer/src/sim/duel/scripted';
import { loadDuelSnapshot, restoreDuelSnapshot, saveDuelSnapshot, type DuelSnapshot } from '../../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../../src/renderer/src/sim/duel/state';
import { stepDuelTick, type DuelInput } from '../../src/renderer/src/sim/duel/step';
import { breakRock } from '../../src/renderer/src/sim/tactical/rockBreak';
import { beginRockTick, rockAlive, rockAt } from '../../src/renderer/src/sim/tactical/rocks';

const CUTTER = parseShip(cutter);
/** The largest live belt rock, or −1 (tests/helpers/rockStress.ts's biggestBelt, inlined: this file is bundled for browsers). */
function biggestBelt(d: DuelState): number {
  const t = d.tactical; let best = -1;
  for (let k = 0; k < t.map.beltCount; k++) if (rockAlive(t, k) && (best < 0 || rockAt(t, k).r > rockAt(t, best).r)) best = k;
  return best;
}
/** A torpedo-style burst of the biggest live belt rock, toward the planet (spike-asteroids-iii-idle's script-side burst). */
export function burstRock(d: DuelState): void {
  const t = d.tactical, k = biggestBelt(d);
  if (k >= 0) { const a = rockAt(t, k); breakRock(t, k, -a.x, -a.y, 'torpedo', 0, 'burst'); beginRockTick(t); }
}
/** A step function that, every `every` ticks (0: never), bursts the biggest belt rock first. A deterministic function
 *  of the state, so a straight run and a restored copy (or the predictor, through its `step` option) burst alike. */
export function burstStep(every: number) {
  return (d: DuelState, input: DuelInput): void => {
    if (every > 0 && d.interior.tick > 0 && d.interior.tick % every === 0) burstRock(d);
    stepDuelTick(d, input);
  };
}
export function duelRestoreCheck(digest: string, options: { seed?: number; ticks?: number; bursts?: boolean } = {}): { checks: number; finalHash: string } {
  const seed = options.seed ?? 3, ticks = options.ticks ?? 1800, step = burstStep(options.bursts ? 300 : 0);
  const d = createDuel(CUTTER, seed), pair = createScriptedPair(seed);
  const inputs: DuelInput[] = [], hashes: string[] = [hashDuel(d)], snaps = new Map<number, DuelSnapshot>();
  let copy: DuelState | null = null, checks = 0;
  try {
    for (let k = 0; k < ticks; k++) {
      if (k % 3 === 0) snaps.set(k, saveDuelSnapshot(d, digest));
      const input = scriptedInput(pair, d);
      inputs.push(structuredClone(input));
      step(d, input);
      hashes.push(hashDuel(d));
    }
    for (const [k, snap] of snaps) {
      if (k + 12 > ticks) continue;
      if (!copy) copy = loadDuelSnapshot(CUTTER, snap, digest); else restoreDuelSnapshot(copy, snap, digest);
      for (let j = 0; j < 12; j++) step(copy, inputs[k + j]!);
      const got = hashDuel(copy), want = hashes[k + 12]!;
      if (got !== want) throw Error(`duel restore at tick ${k} differs after 12 ticks: ${got} != ${want}`);
      checks++;
    }
    return { checks, finalHash: hashes[ticks]! };
  } finally { disposeDuel(d); if (copy) disposeDuel(copy); }
}
```

If the scripted round ends before 1800 ticks, the duel keeps stepping in its decided state (`stepDecided`), and that is still a valid check.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/predictionRestore.test.ts`
Expected: PASS. If it throws "differs", that is a real §4.1 violation in the sim. Stop and report it; do not work around it in the predictor.

- [ ] **Step 5: Add the check to the cross-engine run**

In `scripts/determinism/protocol.ts`, `receiveBrowser`:
- Type the promise value as `{ engine: string; report: Report; duelRestore: { checks: number; finalHash: string } }`.
- Extend the malformed check with `|| typeof value?.duelRestore?.finalHash !== 'string' || typeof value?.duelRestore?.checks !== 'number'`.

In `scripts/determinism/browser.ts`, add `import { duelRestoreCheck } from './duelRestore';`. Then replace the final `report(...)` in `main` with:

```ts
  const duelRestore = duelRestoreCheck(__GAMEPLAY_CONTENT_DIGEST__, { seed: 2, ticks: 1800, bursts: true });   // Net-4a G2
  report({ engine: window.determinism?.engine ?? navigator.userAgent, report: actual, duelRestore });
```

In `scripts/determinism/run.ts`:
- Import `duelRestoreCheck`.
- After `compareReports(fixture.expected, expected);` add:

  ```ts
    const duelExpected = duelRestoreCheck(digest, { seed: 2, ticks: 1800, bursts: true });   // Net-4a G2 on Node
    console.log(`Node: duel restore ${duelExpected.checks} checks PASS (${duelExpected.finalHash})`);
  ```

- Inside the engine loop, after `compareReports(expected, result.report);` add:

  ```ts
      if (result.duelRestore.checks !== duelExpected.checks || result.duelRestore.finalHash !== duelExpected.finalHash) throw Error(`${engine}: duel restore differs from Node (${JSON.stringify(result.duelRestore)})`);
  ```

- In the engine log line, append ``; duel restore ${result.duelRestore.checks} checks``.

- [ ] **Step 6: Run the cross-engine check**

Run: `npm run test:determinism`
Expected:
- Node, Chromium and Firefox print PASS, each with a "duel restore 597 checks" part.
- Firefox may print a "not found" status if it is not installed. Record that in the report.

- [ ] **Step 7: Commit**

```bash
git add scripts/determinism/duelRestore.ts scripts/determinism/browser.ts scripts/determinism/run.ts scripts/determinism/protocol.ts tests/predictionRestore.test.ts
git commit -m "net-4a(G2): restore-then-step pinned on Node and across engines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The impaired link rig

§6 asks for `tests/helpers/impairedLink.ts`, built on `linkPair.ts`. It has a seeded delay, jitter and loss per direction on a fake clock. Reliable packets are delayed but never lost. It also has outage windows.

**Files:**
- Create: `tests/helpers/impairedLink.ts`
- Create: `tests/impairedLink.test.ts`
- Modify: `tests/helpers/onlineDuel.ts:24-61` (a `link` option)

**Interfaces:**
- Produces:

```ts
export interface Direction { delayMs: number; jitterMs?: number; loss?: number; outages?: readonly { from: number; to: number }[]; keep?(sentAt: number): boolean }
export interface ImpairedOptions { seed: number; now(): number; up: Direction; down: Direction }   // up: guest → host, down: host → guest
export function impairedPair(peer: string, options: ImpairedOptions): LinkPair & { stats(): { sent: number; dropped: number; delivered: number } }
```

  `flush()` delivers every packet whose due time is at most `now()` and returns the count.
- Produces: the `onlineDuel(seed, { link?: (peer: string) => LinkPair })` option. When it is given, `connect` uses `options.link(\`seat-${seat}\`)` instead of `linkPair(...)`.

- [ ] **Step 1: Write the failing test**

Create `tests/impairedLink.test.ts`:

```ts
// Net-4a §6: the impaired link: each direction's delay, seeded jitter and loss on a fake clock; reliable packets are
// delayed in order and never lost; an outage holds reliable packets to its end and drops unreliable ones.
import { describe, expect, it } from 'vitest';
import { impairedPair } from './helpers/impairedLink';

const bytes = (n: number) => new Uint8Array([n]);
function rig(down: Parameters<typeof impairedPair>[1]['down']) {
  let now = 0;
  const pair = impairedPair('t', { seed: 9, now: () => now, up: { delayMs: 0 }, down });
  const got: { kind: string; n: number; at: number }[] = [];
  pair.guest.link.onMessage((kind, b) => got.push({ kind, n: b[0]!, at: now }));
  return { pair, got, advance(ms: number) { now += ms; pair.flush(); }, send(kind: 'reliable-ordered' | 'unreliable-latest', n: number) { pair.host.link.send(kind, bytes(n)); } };
}

describe('the impaired link (Net-4a §6)', () => {
  it('delays each direction by its delay; nothing arrives early', () => {
    const r = rig({ delayMs: 50 });
    r.send('unreliable-latest', 1); r.advance(49);
    expect(r.got).toEqual([]);
    r.advance(1);
    expect(r.got).toEqual([{ kind: 'unreliable-latest', n: 1, at: 50 }]);
  });
  it('reliable packets keep their order under jitter; unreliable ones may reorder', () => {
    const r = rig({ delayMs: 40, jitterMs: 30 });
    for (let n = 0; n < 50; n++) { r.send('reliable-ordered', n); r.advance(1); }
    r.advance(200);
    expect(r.got.map((g) => g.n)).toEqual(Array.from({ length: 50 }, (_, n) => n));
  });
  it('loss drops only unreliable packets, seeded: the same seed drops the same ones', () => {
    const a = rig({ delayMs: 10, loss: 0.3 }), b = rig({ delayMs: 10, loss: 0.3 });
    for (const r of [a, b]) { for (let n = 0; n < 100; n++) { r.send('unreliable-latest', n); r.send('reliable-ordered', 100 + n); } r.advance(20); }
    expect(a.got).toEqual(b.got);
    expect(a.got.filter((g) => g.kind === 'reliable-ordered')).toHaveLength(100);
    const lost = 100 - a.got.filter((g) => g.kind === 'unreliable-latest').length;
    expect(lost).toBeGreaterThan(15); expect(lost).toBeLessThan(45);
  });
  it('an outage drops unreliable packets sent in it and holds reliable ones to its end', () => {
    const r = rig({ delayMs: 10, outages: [{ from: 100, to: 300 }] });
    r.advance(150); r.send('unreliable-latest', 1); r.send('reliable-ordered', 2);
    r.advance(100);
    expect(r.got).toEqual([]);
    r.advance(100);
    expect(r.got).toEqual([{ kind: 'reliable-ordered', n: 2, at: 350 }]);
  });
  it('keep(sentAt) false drops an unreliable packet whatever the loss draw', () => {
    const r = rig({ delayMs: 10, keep: (at) => at !== 5 });
    r.advance(5); r.send('unreliable-latest', 1); r.advance(1); r.send('unreliable-latest', 2); r.advance(20);
    expect(r.got.map((g) => g.n)).toEqual([2]);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/impairedLink.test.ts`
Expected: FAIL, because `./helpers/impairedLink` does not exist.

- [ ] **Step 3: Implement**

Create `tests/helpers/impairedLink.ts`:

```ts
// The latency and loss harness Net-0 asked of Net-4 (Net-4a spec §6): two Link ends like linkPair's, but each packet is
// due at its send time plus the direction's delay plus a seeded jitter in [−jitter, +jitter]. Unreliable packets are
// lost with probability `loss` (seeded), or when `keep(sentAt)` says false, or when sent inside an outage. Reliable
// packets are never lost: each is due no earlier than the one sent before it in its direction (in order), and one
// that would fall inside an outage is due at the outage's end plus the delay. flush() delivers what is due by now().
import type { ChannelKind, Link } from '../../src/renderer/src/net/contracts';
import { createRng, nextFloat } from '../../src/shared/rng';
import type { LinkPair } from './linkPair';

export interface Direction { delayMs: number; jitterMs?: number; loss?: number; outages?: readonly { from: number; to: number }[]; keep?(sentAt: number): boolean }
export interface ImpairedOptions { seed: number; now(): number; up: Direction; down: Direction }
interface Packet { kind: ChannelKind; bytes: Uint8Array; due: number; order: number }

export function impairedPair(peer: string, options: ImpairedOptions): LinkPair & { stats(): { sent: number; dropped: number; delivered: number } } {
  const rng = createRng(options.seed >>> 0);
  let order = 0, sent = 0, dropped = 0, delivered = 0, closed = false;
  const reasons: string[] = [];
  const inOutage = (d: Direction, t: number) => (d.outages ?? []).find((o) => t >= o.from && t < o.to) ?? null;
  function end(name: string, dir: Direction) {
    const messages = new Set<(kind: ChannelKind, bytes: Uint8Array) => void>(), closes = new Set<(reason: string) => void>();
    const queue: Packet[] = [];
    let lastReliableDue = -Infinity;
    const link: Link = { peer: `${peer}:${name}`, caps: { unreliable: true, maxDatagram: 16088, hidesPeerIp: true, p2p: false },
      send(kind, bytes) {
        if (closed) return;
        sent++;
        const now = options.now(), jitter = dir.jitterMs ? (nextFloat(rng) * 2 - 1) * dir.jitterMs : 0, outage = inOutage(dir, now);
        if (kind === 'unreliable-latest') {
          const lost = (dir.loss ?? 0) > 0 && nextFloat(rng) < dir.loss!;
          if (outage || lost || (dir.keep && !dir.keep(now))) { dropped++; return; }
          queue.push({ kind, bytes: bytes.slice(), due: now + Math.max(0, dir.delayMs + jitter), order: order++ });
          return;
        }
        let due = Math.max(lastReliableDue, now + Math.max(0, dir.delayMs + jitter));
        const late = inOutage(dir, due - dir.delayMs) ?? outage;
        if (late) due = Math.max(due, late.to + dir.delayMs);
        lastReliableDue = due;
        queue.push({ kind, bytes: bytes.slice(), due, order: order++ });
      },
      onMessage(cb) { messages.add(cb); return () => { messages.delete(cb); }; },
      onClose(cb) { closes.add(cb); return () => { closes.delete(cb); }; },
      close(reason) { closeBoth(reason); },
      stats: () => ({ rttMs: 1, lossPct: 0, relayed: false, bufferedBytes: 0 }) };
    return { link, outbox: [] as { kind: ChannelKind; bytes: Uint8Array }[], reasons, queue, closed: () => closed,
      receive(kind: ChannelKind, bytes: Uint8Array) { if (!closed) for (const cb of [...messages]) cb(kind, bytes); },
      fireClose(reason: string) { for (const cb of [...closes]) cb(reason); } };
  }
  // up: guest → host (the guest end sends with the up direction); down: host → guest.
  const host = end('host', options.down), guest = end('guest', options.up);
  function closeBoth(reason: string) {
    if (closed) return; closed = true; reasons.push(reason); host.queue.length = 0; guest.queue.length = 0;
    host.fireClose(reason); guest.fireClose(reason);
  }
  return {
    host, guest,
    flush() {
      let n = 0, moved = true;
      while (moved && !closed) {
        moved = false;
        const now = options.now();
        for (const [from, to] of [[host, guest], [guest, host]] as const) {
          from.queue.sort((a, b) => a.due - b.due || a.order - b.order);
          while (from.queue.length && from.queue[0]!.due <= now && !closed) { const p = from.queue.shift()!; to.receive(p.kind, p.bytes); n++; delivered++; moved = true; }
        }
      }
      return n;
    },
    close: closeBoth,
    stats: () => ({ sent, dropped, delivered })
  } as LinkPair & { stats(): { sent: number; dropped: number; delivered: number } };
}
```

In `tests/helpers/onlineDuel.ts`:
- Add `link?: (peer: string) => LinkPair` to the options type.
- In `connect`, replace `const pair = linkPair(\`seat-${seat}\`, options.drop);` with:

  ```ts
      const pair = options.link ? options.link(`seat-${seat}`) : linkPair(`seat-${seat}`, options.drop);
  ```

- `flush` keeps calling `s.pair.flush()`. An impaired pair returns 0 once nothing more is due, so the `while (moved)` loop ends.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/impairedLink.test.ts tests/onlineDuelSession.test.ts tests/publicationHeld.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/helpers/impairedLink.ts tests/impairedLink.test.ts tests/helpers/onlineDuel.ts
git commit -m "net-4a(rig): the impaired link (delay, jitter, loss, outages) on a fake clock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The predictor

§3.1, §3.3 (the predictor's half) and §3.4, plus the reset rules and the cap. This is the whole headless module.

**Files:**
- Create: `src/renderer/src/clientControl/duelPredictor.ts`
- Modify: `src/renderer/src/clientControl/streamClient.ts:196-205` (`neutralize` returns the sequence it sent)
- Create: `tests/duelPredictor.test.ts`

**Interfaces:**
- Consumes: `DuelPublication` (`clientControl/duelClient.ts`) with `held` from Task 1.
- Produces:

```ts
export const PREDICT_MAX_TICKS = 30, PREDICT_SLACK_TICKS = 2, PREDICT_HASH_EVERY = 3, PREDICT_LOG_MAX = 600, PREDICT_WAITING_MAX = 64;
export interface LocalInput { heldSequence: number | null; held: HeldInput; commands: readonly CommandEnvelope<DuelCommand>[] }
export interface PredictedBody { x: number; y: number; h: number }
export interface PredictedBodies { ships: PredictedBody[]; missiles: (PredictedBody | null)[]; crew: { x: number; y: number }[] }
export interface PredictionStats {
  verified: number; resimulated: number; resets: number;
  /** P's tick minus the confirmed tick. */ lead: number;
  /** The last confirm's measured target (§3.4 step 3, before the slack and the clamp) and P's tick before it. */ measured: number; standing: number;
  /** The last re-simulation that left P on the tick it stood on: the own ship's (slot 0) move in u, this seat's character's in tiles; null after any other confirm. */
  correction: { ship: number; character: number } | null;
}
export interface DuelPredictorOptions { seat: number; contentDigest: string; resolveLayout: ResolveLayout;
  /** The measuring script's busy rig only (scripts/measure-prediction.ts): the step function; default stepDuelTick. */
  step?(d: DuelState, input: DuelInput): void }
export interface DuelPredictor {
  confirm(publication: DuelPublication, confirmed: DuelState): 'verified' | 'resimulated' | 'reset';
  tick(entry: LocalInput): boolean;
  state(): DuelState | null;
  /** True while P is predicting: its last publication was running and undecided. */
  active(): boolean;
  /** The bodies before P's newest step (§3.3, §3.6); never null while state() is not. */
  before(): PredictedBodies | null;
  /** The hash recorded for P at `tick`, or null (G1's check; read it before confirm). */
  hashAt(tick: number): string | null;
  stats(): PredictionStats;
  dispose(): void;
}
export function createDuelPredictor(options: DuelPredictorOptions): DuelPredictor;
```

- `confirm` takes the confirmed replica `C` as a second argument. That is how it knows whether the round is decided (§3.4's third reset rule) without loading the snapshot twice. Everything else comes from the publication.
- Produces `StreamClient.neutralize(player): number | null`, the held sequence it sent, or null. Task 7 logs it.

- [ ] **Step 1: Write the failing tests**

Create `tests/duelPredictor.test.ts`. Publications are built by hand from a live `DuelState` that plays the authority. That pins the log logic exactly.

```ts
// Net-4a §3.3, §3.4: the duel predictor, against hand-built publications from a duel playing the authority: P runs
// ahead with this seat's input, verifies when the authority used the same inputs, re-simulates when the partner's held
// input changed, anchors on the held watermark, keeps commands until the command watermark passes them, resets on a
// pause, a new round or a decided round, and never stands more than PREDICT_MAX_TICKS past the confirmed tick.
import { afterEach, describe, expect, it } from 'vitest';
import { createDuelPredictor, heldKey, PREDICT_HASH_EVERY, PREDICT_MAX_TICKS, type LocalInput } from '../src/renderer/src/clientControl/duelPredictor';
import type { DuelPublication } from '../src/renderer/src/clientControl/duelClient';
import type { CommandEnvelope, DuelCommand, HeldInput } from '../src/renderer/src/net/contracts';
import { STATE_CADENCE_TICKS } from '../src/network/state/sender';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__, N = (): HeldInput => ({ moveX: 0, moveY: 0, interactHeld: false });
const live: DuelState[] = [];
afterEach(() => { for (const d of live.splice(0)) disposeDuel(d); });
/** The authority: a seated Cutter duel, seat 0 the crew Helm. step(held) runs one tick with these held inputs and commands. */
function authority(seed = 4, cls?: number) {
  const d = createSeatedDuel(CUTTER, seed, 0, 2, cls); live.push(d);
  let revision = 0, sequence = 0, phase: 'running' | 'paused' = 'running';
  const last: HeldInput[] = [N(), N()], water = { held: [0, 0], command: [0, 0] };
  return { d, water,
    step(held: HeldInput[], commands: CommandEnvelope<DuelCommand>[] = []) { last.splice(0, 2, ...held.map((h) => ({ ...h }))); stepDuelTick(d, { held, commands: commands.map((c) => ({ ...c, requestedTick: d.interior.tick })) }); },
    pause(p: boolean) { phase = p ? 'paused' : 'running'; revision++; },
    publication(): DuelPublication {
      const snapshot = saveDuelSnapshot(d, DIGEST);
      return { runId: 'r', tick: d.interior.tick, publicationSequence: ++sequence, snapshot, hash: snapshot.header.hash, phase, pauseOwner: null, controlRevision: revision,
        pauseReason: phase === 'paused' ? 'player' : null, lagTicks: 0, tickTimeMs: null, commandHighWater: [...water.command], heldHighWater: [...water.held], auxiliaryHighWater: [0, 0],
        eventSequence: 0, held: phase === 'paused' ? [N(), N()] : last.map((h) => ({ ...h })) };
    },
    confirmed(): DuelState { const c = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST); live.push(c); return c; }
  };
}
const predictor = () => createDuelPredictor({ seat: 0, contentDigest: DIGEST, resolveLayout: () => CUTTER });
const entry = (heldSequence: number | null, held: HeldInput = N(), commands: CommandEnvelope<DuelCommand>[] = []): LocalInput => ({ heldSequence, held, commands });
const cmd = (sequence: number, command: DuelCommand): CommandEnvelope<DuelCommand> => ({ runId: 'r', id: { player: 0, sequence }, requestedTick: 0, command });

describe('the duel predictor (Net-4a §3.3, §3.4)', () => {
  it('hashes on the cadence ticks', () => { expect(PREDICT_HASH_EVERY).toBe(STATE_CADENCE_TICKS); });
  it('the first publication resets: P is the confirmed state, active, no lead', () => {
    const a = authority(), p = predictor();
    expect(p.state()).toBeNull();
    expect(p.confirm(a.publication(), a.confirmed())).toBe('reset');
    expect(hashDuel(p.state()!)).toBe(hashDuel(a.d));
    expect([p.active(), p.stats().lead, p.before() !== null]).toEqual([true, 0, true]);
    p.dispose();
  });
  it('runs ahead one tick per local tick and verifies when the authority ran the same inputs (constant delay of 6 ticks)', () => {
    const a = authority(), p = predictor(), held = { ...N(), throttleHeld: 1 };
    p.confirm(a.publication(), a.confirmed());
    const results: string[] = [];
    // Local tick L sends held sequence L; the authority latches it 6 ticks later (a 100 ms one-way trip).
    for (let L = 1; L <= 60; L++) {
      expect(p.tick(entry(L, held))).toBe(true);
      a.step([L > 6 ? held : N(), N()]);
      if (L > 6) a.water.held[0] = L - 6;
      if (a.d.interior.tick % 3 === 0) results.push(p.confirm(a.publication(), a.confirmed()));
    }
    // Before the first acknowledgement P had no lead and ran this seat's input early: re-simulations; then the lead is
    // built (6 ticks) and every publication verifies.
    expect(results.slice(-10)).toEqual(Array(10).fill('verified'));
    expect(p.stats().lead).toBe(6);
    p.dispose();
  });
  it('re-simulates when the partner\'s held input changed inside the window, and lands on the authority\'s state', () => {
    const a = authority(), p = predictor();
    p.confirm(a.publication(), a.confirmed());
    for (let L = 1; L <= 30; L++) { p.tick(entry(L)); a.step([N(), N()]); a.water.held[0] = L; if (a.d.interior.tick % 3 === 0) p.confirm(a.publication(), a.confirmed()); }
    for (let L = 31; L <= 33; L++) { p.tick(entry(L)); a.step([N(), { ...N(), moveX: 1 }]); a.water.held[0] = L; }
    expect(p.confirm(a.publication(), a.confirmed())).toBe('resimulated');
    expect(hashDuel(p.state()!)).toBe(hashDuel(a.d));   // lead 0 here: P stands on the confirmed tick
    p.dispose();
  });
  it('a command stays in P from its local tick on, through publications that acknowledge its held frame before the command runs', () => {
    // The Valkyrn's Helm takes the throttle command (the Cutter's crew Helm holds W/S instead). Held frames reach the
    // authority 3 ticks after they are sent; the throttle command, on the reliable channel, runs 5 ticks after.
    const a = authority(4, ShipClass.Valkyrn), p = predictor(), seen: number[] = [];
    p.confirm(a.publication(), a.confirmed());
    for (let L = 1; L <= 30; L++) {
      p.tick(entry(L, N(), L === 10 ? [cmd(1, { kind: 'throttle', level: 2 })] : []));
      a.step([N(), N()], L === 15 ? [cmd(1, { kind: 'throttle', level: 2 })] : []);
      a.water.held[0] = Math.max(0, L - 3); a.water.command[0] = L >= 15 ? 1 : 0;
      if (a.d.interior.tick % 3 === 0) p.confirm(a.publication(), a.confirmed());
      if (L >= 10) seen.push(p.state()!.throttle);
    }
    expect(seen.every((t) => t === 2)).toBe(true);   // never flickers back while in flight
    expect(a.d.throttle).toBe(2);   // and the authority applied it once
    p.dispose();
  });
  it('never stands more than PREDICT_MAX_TICKS past the confirmed tick: tick() is false there and logs the entry', () => {
    const a = authority(), p = predictor();
    p.confirm(a.publication(), a.confirmed());
    const T = a.d.interior.tick;
    for (let L = 1; L <= PREDICT_MAX_TICKS; L++) expect(p.tick(entry(L))).toBe(true);
    expect(p.tick(entry(PREDICT_MAX_TICKS + 1))).toBe(false);
    expect(p.state()!.interior.tick).toBe(T + PREDICT_MAX_TICKS);
    p.dispose();
  });
  it('a pause resets and stops stepping; the resume resets and starts again from it', () => {
    const a = authority(), p = predictor();
    p.confirm(a.publication(), a.confirmed());
    p.tick(entry(1)); a.step([N(), N()]);
    a.pause(true);
    expect(p.confirm(a.publication(), a.confirmed())).toBe('reset');
    expect([p.active(), p.tick(entry(2))]).toEqual([false, false]);
    a.pause(false);
    expect(p.confirm(a.publication(), a.confirmed())).toBe('reset');
    expect([p.active(), p.tick(entry(3))]).toEqual([true, true]);
    p.dispose();
  });
  it('a decided round is a reset every publication: P is the confirmed state and does not step', () => {
    const a = authority(), p = predictor();
    p.confirm(a.publication(), a.confirmed());
    a.d.tactical.outcome = Outcome.CrewWins; a.d.decidedTick = a.d.interior.tick;
    expect(p.confirm(a.publication(), a.confirmed())).toBe('reset');
    expect([p.active(), p.tick(entry(1))]).toEqual([false, false]);
    expect(hashDuel(p.state()!)).toBe(hashDuel(a.d));
    p.dispose();
  });
  it('a different seed (a new round) replaces P', () => {
    const a = authority(4), b = authority(5), p = predictor();
    p.confirm(a.publication(), a.confirmed());
    const first = p.state();
    expect(p.confirm(b.publication(), b.confirmed())).toBe('reset');
    expect(p.state()).not.toBe(first);
    expect(p.state()!.tactical.seed).toBe(b.d.tactical.seed);
    p.dispose();
  });
  it('the input key sees every held field: a partner\'s new reticle or selection alone is a different input (R1-F7)', () => {
    const base = { ...N(), weaponSel: 0, turretAim: 4000 };
    for (const changed of [{ ...base, turretAim: 4001 }, { ...base, weaponSel: 1 }, { ...base, torpHeading: 3 }, { ...base, gunHeld: true }])
      expect(heldKey(changed)).not.toBe(heldKey(base));
    expect(heldKey({ ...base })).toBe(heldKey(base));
  });
  it('records the hash of P on cadence ticks only', () => {
    const a = authority(), p = predictor();
    p.confirm(a.publication(), a.confirmed());
    const T = a.d.interior.tick;
    for (let L = 1; L <= 6; L++) p.tick(entry(L));
    for (let k = T + 1; k <= T + 6; k++) expect(p.hashAt(k) !== null).toBe(k % 3 === 0);
    p.dispose();
  });
});
```

These tests start at the seated start's tick, `createSeatedDuel(CUTTER, seed)`. `a.d.interior.tick % 3` decides which publications are cadence ones, exactly as the authority's `onStateCadence` does.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/duelPredictor.test.ts`
Expected: FAIL, because `duelPredictor` does not exist.

- [ ] **Step 3: Make `neutralize` return its sequence**

In `src/renderer/src/clientControl/streamClient.ts`, change `neutralize`:

```ts
    neutralize(player: PlayerId): number | null {
      // Focus loss stops the ordinary producer. Neutralization only needs a
      // confirmed publication and shares its held sequence with the producer.
      // Net-4a §3.3: the sequence sent, so the session logs the frame as a neutral entry; null when none was sent.
      if (disposed || !publication || !owned.includes(player) || !heldSequences.has(player)) return null;
      const sequence = heldSequences.get(player) + 1;
      if (!Number.isSafeInteger(sequence)) { link.close('held-sequence-exhausted'); return null; }
      heldSequences.set(player, sequence);
      link.send('reliable-ordered', codec.encodeMessage({ kind: 'held', frame: { runId: options.runId, player, tick: publication.tick, sequence,
        held: { moveX: 0, moveY: 0, interactHeld: false } } }));
      return sequence;
    },
```

The callers in `app/onlineSession.ts` ignore the return value, which is fine.

- [ ] **Step 4: Write the predictor**

Create `src/renderer/src/clientControl/duelPredictor.ts`:

```ts
// Net-4a (spec 2026-11-19-net-4a-duel-prediction-design §3.1, §3.3, §3.4): the duel client's predicted state P. P is the
// confirmed replica stepped ahead with the real stepDuelTick: every other player's held input carried forward from the
// latest publication, this seat's from its input log. Each publication either verifies P (the hash P recorded at the
// confirmed tick equals the publication's, the inputs P used after it equal the ones the log now maps there, and P stands
// on the target) or restores P from the snapshot and re-steps it to the target. Headless and clock-free: it is inside
// the deterministic module graph (tests/boundary.test.ts); the session times its calls.
import type { CommandEnvelope, DuelCommand, HeldInput } from '../net/contracts';
import type { ResolveLayout } from '../authority/rules';
import type { DuelPublication } from './duelClient';
import { Position } from '../sim/components';
import { flattenDuel } from '../sim/duel/hash';
import { loadDuelSnapshot, restoreDuelSnapshot } from '../sim/duel/snapshot';
import { disposeDuel, type DuelState } from '../sim/duel/state';
import { stepDuelTick, type DuelInput } from '../sim/duel/step';
import { CREW_SLOT, missileOf, Outcome } from '../sim/tactical/state';
import { hashF64 } from '../../../shared/hash';

/** §3.4: the most ticks P stands past the confirmed tick (500 ms, the old UNACKED_MAX). */
export const PREDICT_MAX_TICKS = 30;
/** §3.4 step 3: within this many ticks of the measured target, P's own tick is the target (one tick of jitter moves no clock). */
export const PREDICT_SLACK_TICKS = 2;
/** P's hash is recorded on ticks a cadence publication can fall on: STATE_CADENCE_TICKS (pinned by tests/duelPredictor.test.ts). */
export const PREDICT_HASH_EVERY = 3;
/** Bounds while publications stop: the log keeps at most 10 s of local ticks, and at most this many commands wait. */
export const PREDICT_LOG_MAX = 600, PREDICT_WAITING_MAX = 64;

export interface LocalInput { heldSequence: number | null; held: HeldInput; commands: readonly CommandEnvelope<DuelCommand>[] }
export interface PredictedBody { x: number; y: number; h: number }
export interface PredictedBodies { ships: PredictedBody[]; missiles: (PredictedBody | null)[]; crew: { x: number; y: number }[] }
export interface PredictionStats {
  verified: number; resimulated: number; resets: number; lead: number; measured: number; standing: number;
  correction: { ship: number; character: number } | null;
}
export interface DuelPredictorOptions { seat: number; contentDigest: string; resolveLayout: ResolveLayout; step?(d: DuelState, input: DuelInput): void }
export interface DuelPredictor {
  confirm(publication: DuelPublication, confirmed: DuelState): 'verified' | 'resimulated' | 'reset';
  tick(entry: LocalInput): boolean;
  state(): DuelState | null;
  active(): boolean;
  before(): PredictedBodies | null;
  hashAt(tick: number): string | null;
  stats(): PredictionStats;
  dispose(): void;
}

type Command = CommandEnvelope<DuelCommand>;
interface Entry { local: number; heldSequence: number | null; held: HeldInput; commands: Command[] }
/** One step P took: the inputs it used (by content) and, on a cadence tick, its hash after. Keyed by the tick it produced. */
interface Step { key: string; hash: string | null }
const neutral = (): HeldInput => ({ moveX: 0, moveY: 0, interactHeld: false });
/** Every HeldInput field (W-4's weaponSel and turretAim included); the check below fails to compile if one is missing. */
const HELD_KEYS = ['moveX', 'moveY', 'interactHeld', 'face', 'aim', 'gunHeld', 'torpHeading', 'weaponSel', 'turretAim', 'throttleHeld', 'rcsX', 'rcsY'] as const;
type MissingHeldKey = Exclude<keyof HeldInput, (typeof HELD_KEYS)[number]>;
const heldKeysComplete: [MissingHeldKey] extends [never] ? true : never = true;
void heldKeysComplete;
export const heldKey = (h: HeldInput): string => HELD_KEYS.map((k) => (h[k] === undefined ? '' : String(h[k]))).join(',');
/** The inputs of one step by content: every player's held input and the commands' ids and bodies (not their stamped tick). */
const inputKey = (held: readonly HeldInput[], commands: readonly Command[]): string =>
  `${held.map(heldKey).join('|')}#${commands.map((c) => `${c.id.player}:${c.id.sequence}:${JSON.stringify(c.command)}`).join(';')}`;
function bodies(d: DuelState): PredictedBodies {
  const t = d.tactical;
  return { ships: t.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc })),
    missiles: t.ships.map((_, i) => { const m = missileOf(t, i); return m ? { x: m.x, y: m.y, h: m.heading + m.headingAcc } : null; }),
    crew: d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! })) };
}

export function createDuelPredictor(options: DuelPredictorOptions): DuelPredictor {
  const { seat } = options, step = options.step ?? ((d: DuelState, input: DuelInput) => { stepDuelTick(d, input); });
  let p: DuelState | null = null, predicting = false, local = 0, offset = 0, confirmedTick = 0, revision = -1;
  let held: HeldInput[] = [], log: Entry[] = [], waiting: Command[] = [], prior: PredictedBodies | null = null;
  const steps = new Map<number, Step>();
  const stats: PredictionStats = { verified: 0, resimulated: 0, resets: 0, lead: 0, measured: 0, standing: 0, correction: null };
  const withOwn = (own: HeldInput): HeldInput[] => held.map((h, k) => (k === seat ? own : h));
  /** One step of P from its tick with `own` in this seat's slot (§3.3); requestedTick is P's tick, as the authority restamps. */
  function advance(own: HeldInput, commands: readonly Command[]): void {
    const d = p!, at = d.interior.tick, input = withOwn(own), stamped = commands.map((c) => ({ ...c, requestedTick: at }));
    prior = bodies(d);
    step(d, { held: input, commands: stamped });
    const tick = d.interior.tick;
    steps.set(tick, { key: inputKey(input, stamped), hash: tick % PREDICT_HASH_EVERY === 0 ? hashF64(flattenDuel(d)) : null });
  }
  /** §3.4 step 2: what tick k (the step that produces k) uses: the entry of local tick k − offset; past the newest, its held input and no commands. */
  function planned(k: number): { own: HeldInput; commands: Command[] } {
    const first = log[0], e = first ? log[k - offset - first.local] : undefined;
    if (e && e.local === k - offset) return { own: e.held, commands: e.commands };
    const newest = log[log.length - 1];
    return { own: newest ? newest.held : held[seat] ?? neutral(), commands: [] };
  }
  function reset(publication: DuelPublication, decided: boolean): 'reset' {
    const h = publication.snapshot.header;
    const matches = !!p && h.layoutId === p.interior.layout.id && h.layoutHash === p.interior.derived.layoutHash && h.seed === p.tactical.seed && h.playerCount === p.interior.playerCount && h.crewClass === p.crewClass;
    if (p && matches) restoreDuelSnapshot(p, publication.snapshot, options.contentDigest);
    else { if (p) disposeDuel(p); p = null; p = loadDuelSnapshot(options.resolveLayout(h.layoutId), publication.snapshot, options.contentDigest); }
    log = []; waiting = []; steps.clear(); steps.set(publication.tick, { key: '', hash: publication.hash });
    prior = bodies(p); revision = publication.controlRevision; offset = publication.tick - local;
    predicting = publication.phase === 'running' && !decided;
    stats.resets++; stats.correction = null; stats.lead = 0; stats.measured = stats.standing = publication.tick;
    return 'reset';
  }
  return {
    confirm(publication, confirmed) {
      const T = publication.tick, h = publication.snapshot.header;
      confirmedTick = T; held = publication.held.map((x) => ({ ...x }));
      const decided = confirmed.tactical.outcome !== Outcome.Running;
      const replaced = !p || h.seed !== p.tactical.seed || h.layoutId !== p.interior.layout.id || h.layoutHash !== p.interior.derived.layoutHash || h.playerCount !== p.interior.playerCount || h.crewClass !== p.crewClass;
      if (replaced || !predicting || decided || publication.phase !== 'running' || publication.controlRevision !== revision) return reset(publication, decided);
      const d = p!;
      // Step 1: the anchor (the newest entry whose held frame the authority has latched) gives the measured offset;
      // with none, the last mapping is kept. Commands leave the log only by the command watermark.
      const hw = publication.heldHighWater[seat] ?? 0, cw = publication.commandHighWater[seat] ?? 0;
      let anchored = offset, anchor = -1;
      for (let i = log.length - 1; i >= 0; i--) { const s = log[i]!.heldSequence; if (s !== null && s <= hw) { anchored = T - log[i]!.local; anchor = i; break; } }
      for (const e of log) e.commands = e.commands.filter((c) => c.id.sequence > cw);
      waiting = waiting.filter((c) => c.id.sequence > cw);
      // Step 3: the target: T plus the local ticks after the anchor's; P's own tick when within the slack; clamped.
      const measured = T + Math.max(0, local - (T - anchored)), standing = d.interior.tick;
      let target = Math.abs(standing - measured) <= PREDICT_SLACK_TICKS ? standing : measured;
      target = Math.max(T, Math.min(T + PREDICT_MAX_TICKS, target));
      stats.measured = measured; stats.standing = standing;
      // The mapping from now on: the newest local tick is the target (plan deviation 1). It is the anchor's offset unless
      // the slack or the cap applied; tick() steps entry L to L + offset, so verify and tick() always agree.
      offset = target - local;
      // Plan deviation 2: an entry leaves the log only once acknowledged (at or before the anchor), so a later held
      // watermark can still anchor on it; entries the mapping puts at or before T stay with their command lists emptied.
      // Either way their commands not yet run move to the first entry after T in the mapping, or wait for the next one.
      const cut = T - offset, carried: Command[] = [];
      if (anchor >= 0) for (const e of log.splice(0, anchor + 1)) carried.push(...e.commands);
      for (const e of log) if (e.local <= cut) { carried.push(...e.commands); e.commands = []; }
      if (carried.length) {
        const next = log.find((e) => e.local > cut);
        if (next) next.commands = [...carried, ...next.commands]; else waiting = [...waiting, ...carried].slice(-PREDICT_WAITING_MAX);
      }
      for (const k of [...steps.keys()]) if (k < T) steps.delete(k);
      // Step 4: verified when P passed through T with the authority's hash, used the planned inputs since, and stands on the target.
      const at = steps.get(T);
      let ok = !!at && at.hash === publication.hash && standing === target;
      for (let k = T + 1; ok && k <= target; k++) { const s = steps.get(k), plan = planned(k); ok = !!s && s.key === inputKey(withOwn(plan.own), plan.commands); }
      if (ok) { stats.verified++; stats.correction = null; stats.lead = standing - T; return 'verified'; }
      // Step 5: restore and step to the target with the planned inputs.
      const ship = d.tactical.ships[CREW_SLOT]!, sx = ship.x, sy = ship.y, eid = d.interior.crew[seat], cx = eid === undefined ? 0 : Position.x[eid]!, cy = eid === undefined ? 0 : Position.y[eid]!;
      restoreDuelSnapshot(d, publication.snapshot, options.contentDigest);
      steps.clear(); steps.set(T, { key: '', hash: publication.hash });
      prior = bodies(d);
      for (let k = T + 1; k <= target; k++) { const plan = planned(k); advance(plan.own, plan.commands); }
      const after = d.tactical.ships[CREW_SLOT]!, dx = after.x - sx, dy = after.y - sy;
      const ex = eid === undefined ? 0 : Position.x[eid]! - cx, ey = eid === undefined ? 0 : Position.y[eid]! - cy;
      stats.correction = target === standing ? { ship: Math.sqrt(dx * dx + dy * dy), character: Math.sqrt(ex * ex + ey * ey) } : null;
      stats.resimulated++; stats.lead = target - T;
      return 'resimulated';
    },
    tick(input) {
      if (!p || !predicting) return false;
      const e: Entry = { local: ++local, heldSequence: input.heldSequence, held: { ...input.held }, commands: [...waiting.splice(0), ...input.commands] };
      log.push(e);
      if (log.length > PREDICT_LOG_MAX) { const old = log.shift()!; log[0]!.commands = [...old.commands, ...log[0]!.commands]; }
      if (p.interior.tick >= confirmedTick + PREDICT_MAX_TICKS) return false;
      advance(e.held, e.commands);
      stats.lead = p.interior.tick - confirmedTick;
      return true;
    },
    state: () => p,
    active: () => !!p && predicting,
    before: () => (p ? prior : null),
    hashAt: (tick) => steps.get(tick)?.hash ?? null,
    stats: () => ({ ...stats, correction: stats.correction ? { ...stats.correction } : null }),
    dispose() { if (p) disposeDuel(p); p = null; predicting = false; log = []; waiting = []; steps.clear(); prior = null; }
  };
}
```

How this follows the spec, so a reviewer can check it:
- **Local tick numbers.** The predictor numbers local ticks itself (`local`, one per `tick()` while predicting). They are contiguous, so `planned` indexes the log directly.
- **When `tick()` steps.** It steps with its own entry, as §3.3 says. `planned` is used only when verifying and re-simulating (§3.4 steps 2 and 4).
- **The measured target** is `T + (local − (T − anchored))`, which is at least `T`, as §3.4 step 3 says.
- **The correction** is reported only when the re-simulation left `P` on the tick it stood on. Building the lead after a reset is not a correction (G4).

**Plan deviation 1 (from §3.4 step 1).** After each confirm, the mapping `offset` is `target − local`: the newest local tick maps to the tick `P` will stand on. The spec keeps the anchor's offset even when the slack keeps `P` where it stood. Two things break that way:
- `tick()` steps each entry on `P`'s own clock, while `planned` maps it on the anchor's. Once the two differ by one or two ticks, every publication re-simulates while the input changes.
- A command carried to an entry the anchor maps beyond the target is never stepped until a later re-simulation reaches it. It vanishes from `P` for up to 50 ms, which is the flicker §3.4 forbids.

With `offset = target − local` both mappings are one. This equals the anchor's offset whenever neither the slack nor the cap applied. Under the slack the authority's tick for an entry is estimated one or two ticks off, which §3.4's "Step 2 is an estimate" already allows. Commands still leave only by `cw`. Record this deviation in the build report.

**Plan deviation 2 (from §3.4 step 1, review R1-F1).** The spec drops every entry at or before `T − offset`. That rule can never build a lead. After a reset, `P` stands about on `T` at each publication, so the cut is about the newest local tick and the whole log goes. The entry the authority will acknowledge one round trip later is therefore gone before its `heldHighWater` arrives. No anchor is ever found, the measured target equals `P`'s tick, and the lead stays at 0.

Here an entry leaves the log only once acknowledged: at or before the anchor, or by `PREDICT_LOG_MAX`. An entry the mapping puts at or before `T` is kept for anchoring, and its commands move to the first entry after `T`. `planned` indexes by `local`, so the kept older entries do not disturb it.

The spec's own §3.4 step 1 has the same gap, so record this deviation in the build report too. The test "runs ahead one tick per local tick and verifies" pins it. It confirms each publication right after the authority's tick, with `P` standing on that tick, as on the wire after a reset, and it requires the lead to reach the 6-tick delay.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run tests/duelPredictor.test.ts tests/boundary.test.ts tests/onlineDuelSession.test.ts`
Expected: PASS. The boundary test now covers `duelPredictor.ts`, so `Math.abs`, `Math.max`, `Math.min` and `Math.sqrt` are the only Math it may use.

In "runs ahead ... and verifies", the first `results` are resets and re-simulations while the lead builds. If the last 10 are not all `'verified'`, print `p.stats()` at each confirm and compare `measured` with `standing`. With a constant 6-tick delay they must be equal once the lead is built. If not, the anchor or offset is off by one.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/clientControl/duelPredictor.ts src/renderer/src/clientControl/streamClient.ts tests/duelPredictor.test.ts
git commit -m "net-4a(predictor): P stepped ahead from the confirmed state, verified by hash or re-simulated

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The latency gates G1, G3 and G5

These gates run on the real stack: authority, stream binding, impaired link, remote client and predictor. A test-side seat runs local ticks in step with the authority's tick.

**Files:**
- Create: `tests/helpers/predictedSeat.ts`
- Create: `tests/predictionGates.test.ts`

**Interfaces:**
- Consumes: `onlineDuel(seed, { link })` (Task 3), `impairedPair` (Task 3) and `createDuelPredictor` (Task 4).
- Produces:

  ```ts
  predictedSeat(world: ReturnType<typeof onlineDuel>, seat: number, input: (local: number, view: DuelState) => { held: HeldInput; commands: DuelCommand[] })
  ```

  It returns `{ predictor, local(): number, step(): { stepped: boolean; confirms: Confirm[] }, results: Confirm[] }`. A `Confirm` is `{ result, tick, hashBefore: string | null, hash: string, standing, measured, correction }`.

- [ ] **Step 1: Write the seat helper**

Create `tests/helpers/predictedSeat.ts`:

```ts
// Net-4a §6: a predicting seat on the headless online duel. Each step() is one local tick, run right after the
// authority's tick (both at 60 Hz on the world's clock): confirm any new publication (reading the hash P recorded at its
// tick first), then this seat's input for the local tick goes out (a held frame, then its commands) and into the predictor.
import { createDuelPredictor, type DuelPredictor } from '../../src/renderer/src/clientControl/duelPredictor';
import type { CommandEnvelope, DuelCommand, HeldInput } from '../../src/renderer/src/net/contracts';
import type { DuelState } from '../../src/renderer/src/sim/duel/state';
import { resolveCutter } from './duelAuthority';
import type { onlineDuel } from './onlineDuel';

export interface Confirm { result: 'verified' | 'resimulated' | 'reset'; tick: number; hashBefore: string | null; hash: string; standing: number; measured: number; correction: { ship: number; character: number } | null }
export function predictedSeat(world: ReturnType<typeof onlineDuel>, seat: number, input: (local: number, view: DuelState) => { held: HeldInput; commands: DuelCommand[] }) {
  const s = world.seats[seat]!, predictor: DuelPredictor = createDuelPredictor({ seat, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: resolveCutter });
  let seen = 0, local = 0;
  const results: Confirm[] = [];
  return { predictor, results, local: () => local,
    step(): { stepped: boolean; confirms: Confirm[] } {
      const confirms: Confirm[] = [], p = s.client.publication(), c = s.client.state();
      if (p && c && p.publicationSequence !== seen) {
        seen = p.publicationSequence;
        const hashBefore = predictor.hashAt(p.tick), result = predictor.confirm(p, c), st = predictor.stats();
        const r: Confirm = { result, tick: p.tick, hashBefore, hash: p.hash, standing: st.standing, measured: st.measured, correction: st.correction };
        confirms.push(r); results.push(r);
      }
      local++;
      const view = predictor.state() ?? c;
      if (!view || s.client.commandStatus(seat).state === 'waiting-state') return { stepped: false, confirms };
      const want = input(local, view), heldSequence = s.client.held(seat, want.held), commands: CommandEnvelope<DuelCommand>[] = [];
      for (const command of want.commands) { const id = s.client.command(seat, command); if (id) commands.push({ runId: world.runId, id, requestedTick: 0, command }); }
      const stepped = predictor.tick({ heldSequence, held: heldSequence === null ? { moveX: 0, moveY: 0, interactHeld: false } : want.held, commands });
      return { stepped, confirms };
    },
    dispose() { predictor.dispose(); } };
}
```

- [ ] **Step 2: Write the failing gate tests**

Create `tests/predictionGates.test.ts`:

```ts
// Net-4a gates G1, G3 and G5 (spec §6) on the real stack: the duel authority, the stream binding, the impaired link,
// the remote client and the predictor. Seat 0 flies the Cutter's crew Helm; seat 1 sits at Weapons. Round trips are
// split evenly between the two directions. Every run starts after a 1 s warm-up (both seats synced and their first held
// frames acknowledged), so the publications checked are steady-state ones.
import { beforeEach, describe, expect, it } from 'vitest';
import type { DuelCommand, HeldInput } from '../src/renderer/src/net/contracts';
import { PREDICT_MAX_TICKS } from '../src/renderer/src/clientControl/duelPredictor';
import { impairedPair, type Direction } from './helpers/impairedLink';
import { onlineDuel } from './helpers/onlineDuel';
import { predictedSeat, type Confirm } from './helpers/predictedSeat';

const N = (): HeldInput => ({ moveX: 0, moveY: 0, interactHeld: false });
type Input = (local: number) => { held: HeldInput; commands: DuelCommand[] };
const constant = (held: HeldInput): Input => () => ({ held, commands: [] });
/** This seat's input changing: the crew Helm's throttle and thrusters in a 40-tick pattern. */
const changing: Input = (L) => ({ held: { ...N(), throttleHeld: L % 40 < 20 ? 1 : -1, rcsX: L % 13 < 6 ? 1 : 0 }, commands: [] });
/** A run: both seats on impaired links with the given directions, `ticks` local ticks after a 60-tick warm-up. */
function run(o: { seed?: number; rttMs: number; loss?: number; jitterMs?: number; ticks: number; me: Input; partner: Input; down?: Partial<Direction>; up?: Partial<Direction> }) {
  const w = onlineDuel(o.seed ?? 3, { link: (peer) => impairedPair(peer, { seed: peer.length * 7 + 1, now: () => w.nowMs(),
    up: { delayMs: o.rttMs / 2, jitterMs: o.jitterMs, loss: o.loss, ...o.up }, down: { delayMs: o.rttMs / 2, jitterMs: o.jitterMs, loss: o.loss, ...o.down } }) });
  w.connect(0); w.connect(1);
  const me = predictedSeat(w, 0, (L) => o.me(L)), partner = predictedSeat(w, 1, (L) => o.partner(L));
  const out = { w, me, steps: [] as { stepped: boolean; confirms: Confirm[]; at: number }[] };
  for (let k = 0; k < 60 + o.ticks; k++) {
    w.tick();
    const r = me.step(); partner.step();
    if (k >= 60) out.steps.push({ ...r, at: w.nowMs() });
  }
  return out;
}
const confirms = (r: ReturnType<typeof run>) => r.steps.flatMap((s) => s.confirms).filter((c) => c.tick % 3 === 0);
// Each run is seconds of synchronous CPU on the full stack (R1-F10): yield a macrotask before each so vitest's worker RPC
// is answered (as tests/duelOnline.test.ts does), and give every case 120 s.
beforeEach(() => new Promise<void>((resolve) => setImmediate(resolve)));
const SLOW = { timeout: 120_000 };

describe('G1: exact when inputs are known (Net-4a §6)', SLOW, () => {
  for (const rttMs of [0, 50, 150, 300]) for (const loss of [0, 0.02, 0.05]) {
    it(`(a) every input constant, ${rttMs} ms round trip, ${loss * 100}% loss: P's hash at the confirmed tick is the publication's`, () => {
      const r = run({ rttMs, loss, ticks: 600, me: constant({ ...N(), throttleHeld: 1 }), partner: constant(N()) });
      const c = confirms(r).filter((x) => x.result !== 'reset');
      expect(c.length).toBeGreaterThan(100);
      for (const x of c) if (x.hashBefore !== null) expect(x.hashBefore).toBe(x.hash);
      // A re-simulation only when the target moved more than the slack (the lead being built, or held frames lost in a row).
      for (const x of c) if (x.result === 'resimulated') expect(Math.abs(x.standing - x.measured)).toBeGreaterThan(2);
      console.log(`G1a ${rttMs} ms ${loss * 100}%: verified ${c.filter((x) => x.result === 'verified').length}, re-simulated ${c.filter((x) => x.result === 'resimulated').length}`);
    });
  }
  it('(b) this seat\'s input changing, constant delay, no loss, one frame per tick: the same', () => {
    const r = run({ rttMs: 100, ticks: 600, me: changing, partner: constant(N()) });
    const c = confirms(r).filter((x) => x.result !== 'reset');
    for (const x of c) if (x.hashBefore !== null) expect(x.hashBefore).toBe(x.hash);
    for (const x of c) if (x.result === 'resimulated') expect(Math.abs(x.standing - x.measured)).toBeGreaterThan(2);
  });
  it('(c) changing under jitter and loss: once it stops, publications verify again within one lead plus two publications', () => {
    const stopAt = 300, r = run({ rttMs: 150, jitterMs: 20, loss: 0.05, ticks: 600, me: (L) => (L - 60 < stopAt ? changing(L) : constant({ ...N(), throttleHeld: 1 })(L)), partner: constant(N()) });
    const after = r.steps.slice(stopAt + 9 + 6).flatMap((s) => s.confirms).filter((x) => x.tick % 3 === 0);
    const share = after.filter((x) => x.result === 'verified').length / Math.max(1, after.length);
    console.log(`G1c verified share after the input stopped: ${(share * 100).toFixed(1)}%`);
    expect(after.slice(0, 1).every((x) => x.result !== 'reset')).toBe(true);
    expect(after.some((x) => x.result === 'verified')).toBe(true);
  });
});

describe('G3: answers at once (Net-4a §6)', SLOW, () => {
  for (const rttMs of [50, 150, 400]) it(`a change in this seat's held input steps P on the next local tick at ${rttMs} ms`, () => {
    const r = run({ rttMs, ticks: 300, me: changing, partner: constant(N()) });
    expect(r.steps.every((s) => s.stepped)).toBe(true);
  });
  it('at 600 ms P never passes T + PREDICT_MAX_TICKS, and some local ticks do not step', () => {
    const r = run({ rttMs: 600, ticks: 300, me: changing, partner: constant(N()) });
    expect(r.steps.some((s) => !s.stepped)).toBe(true);
    expect(r.me.predictor.stats().lead).toBeLessThanOrEqual(PREDICT_MAX_TICKS);
  });
});

describe('G5: rides out loss (Net-4a §6)', SLOW, () => {
  /** 10% publication loss, at most three in a row, none within 60 ms of the outage's edges. */
  function keep(outage: { from: number; to: number }) {
    let run = 0, k = 0;
    return (at: number): boolean => {
      if (Math.abs(at - outage.from) < 60 || Math.abs(at - outage.to) < 60) { run = 0; return true; }
      const drop = ((k++ * 2654435761) >>> 0) % 10 === 0 && run < 3;
      run = drop ? run + 1 : 0; return !drop;
    };
  }
  const start = 60 * 1000 / 60 + 5000;   // the outage begins 5 s into the checked run
  for (const c of [
    { name: '(a) 50 ms, publications out 300 ms, frames still arriving', rttMs: 50, downOut: 300, upOut: 0 },
    { name: '(b) 150 ms, publications out 200 ms', rttMs: 150, downOut: 200, upOut: 0 },
    { name: '(c) 50 ms, both directions out 200 ms', rttMs: 50, downOut: 200, upOut: 200 }
  ]) it(`${c.name}: tick() never returns false; the first publication after corrects within G4's bound`, () => {
    const down = { from: start, to: start + c.downOut }, up = { from: start, to: start + c.upOut };
    const r = run({ rttMs: c.rttMs, ticks: 1200, me: changing, partner: constant(N()), down: { outages: [down], keep: keep(down) }, up: c.upOut ? { outages: [up] } : {} });
    expect(r.steps.every((s) => s.stepped)).toBe(true);
    const first = r.steps.filter((s) => s.at > down.to).flatMap((s) => s.confirms)[0]!;
    if (first.correction) { expect(first.correction.ship).toBeLessThanOrEqual(5); expect(first.correction.character).toBeLessThanOrEqual(0.5); }
  });
  it('(d) 150 ms, publications out 500 ms: tick() is false only while P stands at T + PREDICT_MAX_TICKS, then resumes', () => {
    const down = { from: start, to: start + 500 };
    const r = run({ rttMs: 150, ticks: 1200, me: changing, partner: constant(N()), down: { outages: [down], keep: keep(down) } });
    const stalled = r.steps.filter((s) => !s.stepped);
    expect(stalled.length).toBeGreaterThan(0);
    for (const s of stalled) expect(s.at).toBeGreaterThan(down.from);
    expect(r.steps.at(-1)!.stepped).toBe(true);
  });
});
```

- [ ] **Step 3: Run the gates**

Run: `npx vitest run tests/predictionGates.test.ts`
Expected: PASS, with the G1a and G1c figures printed.

A failure here is a predictor bug or a rig bug, not a reason to loosen a gate. To find it:

- **G1(a) at 0 ms.** Each held frame reaches the authority in the same `w.tick()` flush, so the anchor offset is 0 or 1. Print `x.standing` and `x.measured` at each confirm.
- **A G1 hash mismatch with constant inputs.** One cause is the predictor stepping before the authority has latched the partner's first frame. The warm-up covers that. Another is a command the seat sends. The constant inputs send none.
- **G3 at 400 ms** needs a lead of 24 ticks plus up to 3 for the cadence, which is under 30. If a step returns false, check `stats().lead`.

Fix the predictor in `duelPredictor.ts`, with a new failing case in `tests/duelPredictor.test.ts` first. Commit the fix with this task.

- [ ] **Step 4: Commit**

```bash
git add tests/helpers/predictedSeat.ts tests/predictionGates.test.ts src/renderer/src/clientControl/duelPredictor.ts tests/duelPredictor.test.ts
git commit -m "net-4a(G1,G3,G5): prediction gates on the impaired link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The view source draws P

§3.6 and §3.7: the source draws `P`'s bodies blended over local ticks. It interpolates other players' characters from `C`. It gives the scene the confirmed state, and it places effects at `P`'s positions.

**Files:**
- Create: `src/renderer/src/render/duel/crewOverride.ts`
- Create: `tests/crewOverride.test.ts`
- Modify: `src/renderer/src/app/duel/onlineSource.ts` (whole file, below)
- Modify: `src/renderer/src/app/duel/scene.ts:61-98` (the interface gains `crewOverride?` and `confirmed?`)
- Modify: `tests/duelOnlineView.test.ts` (new cases)

**Interfaces:**
- Consumes: `PredictedBodies` (Task 4).
- Produces, in `render/duel/crewOverride.ts`:

  ```ts
  export interface CrewOverride { at: readonly ({ x: number; y: number } | null)[]; prev: readonly ({ x: number; y: number } | null)[]; alpha: number }
  export function crewDrawAt(pid: number, x: number, y: number, crewPrev: readonly ({ x: number; y: number } | undefined)[], alpha: number, override: CrewOverride | null): { x: number; y: number }
  export function crewPresentation(override: CrewOverride | null): PresentationPoint[] | undefined
  ```

  `crewDrawAt` works in tiles.
- Produces, in `onlineSource.ts`:
  - `export interface PredictionView { active(): boolean; state(): DuelState | null; before(): PredictedBodies | null; alpha(): number }`
  - `OnlineDuelSourceDeps.prediction?: PredictionView`
  - `export function placeEvents(events: readonly ViewEvent[], t: TacticalState): ViewEvent[]`
  - The source's `crewOverride(): CrewOverride | undefined` and `confirmed(): DuelState`.
- Produces, on `DuelViewSource`: `crewOverride?(): CrewOverride | undefined; confirmed?(): DuelState;`.

- [ ] **Step 1: Write the failing tests**

Create `tests/crewOverride.test.ts`:

```ts
// Net-4a §3.6: where a character is drawn: an overridden one (another player online) blended from its confirmed
// previous to its confirmed latest position by the gap alpha; any other from crewPrev by the view's alpha.
import { describe, expect, it } from 'vitest';
import { crewDrawAt, crewPresentation, type CrewOverride } from '../src/renderer/src/render/duel/crewOverride';

const o: CrewOverride = { at: [null, { x: 4, y: 2 }], prev: [null, { x: 2, y: 2 }], alpha: 0.25 };
describe('crew override (Net-4a §3.6)', () => {
  it('an overridden character blends its confirmed positions by the gap alpha, ignoring the predicted ones', () => {
    expect(crewDrawAt(1, 9, 9, [{ x: 0, y: 0 }, { x: 0, y: 0 }], 0.9, o)).toEqual({ x: 2.5, y: 2 });
  });
  it('this seat\'s own character blends crewPrev to the predicted position by the view alpha', () => {
    expect(crewDrawAt(0, 3, 1, [{ x: 1, y: 1 }], 0.5, o)).toEqual({ x: 2, y: 1 });
    expect(crewDrawAt(0, 3, 1, [], 0.5, null)).toEqual({ x: 3, y: 1 });
  });
  it('gives the crew layer a presentation point for each overridden character only', () => {
    expect(crewPresentation(o)).toEqual([{ id: 'crew:1', x: 2.5, y: 2, generation: 'online' }]);
    expect(crewPresentation(null)).toBeUndefined();
  });
});
```

Then add to `tests/duelOnlineView.test.ts`, inside a new `describe`, and add `placeEvents` to its import from `onlineSource`:

```ts
describe('the online source draws the prediction (Net-4a §3.6, §3.7)', () => {
  /** A prediction view over `p`, with `before` the bodies P had before its newest step. */
  function prediction(p: DuelState, before: { ships: { x: number; y: number; h: number }[]; missiles: null[]; crew: { x: number; y: number }[] }, alpha = 0.5) {
    let on = true;
    return { view: { active: () => on, state: () => p, before: () => before, alpha: () => alpha }, off() { on = false; } };
  }
  it('while active: duel is P, prev and crewPrev are P\'s before-bodies, alpha is the local one; confirmed() is the replica', () => {
    const live = createSeatedDuel(CUTTER, 3), c = confirmed(); c.publish(live);
    const p = loadDuelSnapshot(CUTTER, saveDuelSnapshot(live, DIGEST), DIGEST);
    try {
      for (let k = 0; k < 6; k++) stepDuelTick(p, { held: [], commands: [] });
      const before = { ships: [{ x: 1, y: 2, h: 3 }, { x: 4, y: 5, h: 6 }], missiles: [null, null], crew: [{ x: 7, y: 8 }, { x: 9, y: 10 }] };
      const pr = prediction(p, before, 0.25), s = createOnlineDuelSource({ client: c.client, seat: 0, now: () => 0, viewport: { w: 1280, h: 720 }, prediction: pr.view });
      s.observe();
      expect(s.duel).toBe(p);
      expect([s.prev, s.crewPrev, s.alpha()]).toEqual([before.ships, before.crew, 0.25]);
      expect(s.confirmed()).toBe(c.client.state());
      pr.off();
      expect(s.duel).toBe(c.client.state());
    } finally { disposeDuel(p); disposeDuel(live); c.dispose(); }
  });
  it('crewOverride: this seat\'s slot is null; the partner from the confirmed publications with the gap alpha', () => {
    const live = createSeatedDuel(CUTTER, 3), c = confirmed(); c.publish(live);
    const p = loadDuelSnapshot(CUTTER, saveDuelSnapshot(live, DIGEST), DIGEST);
    try {
      const pr = prediction(p, { ships: [], missiles: [], crew: [] }), s = createOnlineDuelSource({ client: c.client, seat: 0, now: () => 0, viewport: { w: 1280, h: 720 }, prediction: pr.view });
      s.observe();
      for (let k = 0; k < 3; k++) stepDuelTick(live, { held: [], commands: [] });
      c.publish(live); s.observe();
      const o = s.crewOverride()!;
      expect(o.at[0]).toBeNull(); expect(o.prev[0]).toBeNull();
      expect(o.at[1]).not.toBeNull(); expect(o.prev[1]).not.toBeNull();
    } finally { disposeDuel(p); disposeDuel(live); c.dispose(); }
  });
  it('placeEvents: beams and sparks at P\'s ships; a missile ending where it was', () => {
    const t = createTacticalState(1);
    t.ships[0]!.x = 100; t.ships[0]!.y = 50; t.ships[1]!.x = 400; t.ships[1]!.y = 50;
    const out = placeEvents([
      { kind: 'laser', ship: 0, hit: true, stripped: false, room: 0, x1: 0, y1: 0, x2: 0, y2: 0 },
      { kind: 'contact', ship: 0, body: 'asteroid', x: 0, y: 0 },
      { kind: 'gunHit', ship: 1, room: -1, stripped: false, hull: false, level: false, x: 0, y: 0 },
      { kind: 'missileEnd', ship: 0, cause: 'expired', target: -1, room: -1, x: 7, y: 8 }
    ] as ViewEvent[], t);
    expect(out[0]).toMatchObject({ x1: 100, y1: 50, x2: 400, y2: 50 });
    expect(out[1]).toMatchObject({ x: 100, y: 50 });
    expect(out[2]).toMatchObject({ x: 400, y: 50 });
    expect(out[3]).toMatchObject({ x: 7, y: 8 });
  });
});
```

`createTacticalState` takes the arguments it takes today. Check how this file already calls it and match that.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/crewOverride.test.ts tests/duelOnlineView.test.ts`
Expected: FAIL, because `crewOverride` does not exist and `placeEvents` is not exported.

- [ ] **Step 3: Write `crewOverride.ts`**

Create `src/renderer/src/render/duel/crewOverride.ts`:

```ts
// Net-4a §3.6: other players' characters are drawn from the confirmed state, one publication gap behind (Net-0 §3.4),
// while the ship world and this seat's own character are drawn from the prediction. The override gives each other
// character its confirmed latest (`at`) and previous (`prev`) position and the gap alpha; this seat's slot is null.
import type { PresentationPoint } from '../../../../network/state/timeline';

export interface CrewOverride { at: readonly ({ x: number; y: number } | null)[]; prev: readonly ({ x: number; y: number } | null)[]; alpha: number }
const clamp = (a: number): number => Math.max(0, Math.min(1, a));
/** Where character `pid` is drawn, in tiles: its override's blend when it has one, else (x, y) blended from crewPrev by alpha. */
export function crewDrawAt(pid: number, x: number, y: number, crewPrev: readonly ({ x: number; y: number } | undefined)[], alpha: number, override: CrewOverride | null): { x: number; y: number } {
  const at = override?.at[pid];
  if (at) { const was = override!.prev[pid] ?? at, a = clamp(override!.alpha); return { x: was.x + (at.x - was.x) * a, y: was.y + (at.y - was.y) * a }; }
  const was = crewPrev[pid];
  return was ? { x: was.x + (x - was.x) * alpha, y: was.y + (y - was.y) * alpha } : { x, y };
}
/** The crew layer's presentation points (crewSprites' `crew:<pid>` ids, tiles) for the overridden characters; none without an override. */
export function crewPresentation(override: CrewOverride | null): PresentationPoint[] | undefined {
  if (!override) return undefined;
  const out: PresentationPoint[] = [];
  override.at.forEach((at, pid) => { if (at) { const p = crewDrawAt(pid, at.x, at.y, [], 1, override); out.push({ id: `crew:${pid}`, x: p.x, y: p.y, generation: 'online' }); } });
  return out;
}
```

- [ ] **Step 4: Extend the scene's interface**

In `src/renderer/src/app/duel/scene.ts`, add `import type { CrewOverride } from '../../render/duel/crewOverride';`. Then add to `DuelViewSource`, after `takeRefusals?`:

```ts
  /** Net-4a §3.6: other players' characters drawn from the confirmed state (online, while predicting); absent: none. */
  crewOverride?(): CrewOverride | undefined;
  /** Net-4a §3.6: the confirmed state, for the end card, the outcome and the one-shot sounds. Absent (Single player): `duel`. */
  confirmed?(): DuelState;
```

- [ ] **Step 5: Rewrite the source**

In `src/renderer/src/app/duel/onlineSource.ts`:

1. Add imports:

   ```ts
   import type { PredictedBodies } from '../../clientControl/duelPredictor';
   import type { CrewOverride } from '../../render/duel/crewOverride';
   ```

2. Add after `ConfirmedDuel`:

```ts
/** Net-4a §3.6: the session's prediction. While active() the source draws state() blended from before() by alpha(); otherwise
 *  (no running undecided round, no predictor) it draws the confirmed replica, one gap behind, as before. */
export interface PredictionView { active(): boolean; state(): DuelState | null; before(): PredictedBodies | null; alpha(): number }

/** Net-4a §3.7: each effect from the confirmed counters, drawn at the prediction's positions: a beam from the firing ship in
 *  P to its target in P (a hit) or to range along its heading in P (a miss); a round fired, or a contact, at the named ship;
 *  a gun or pew hit at the target (the event's ship); a missile ending where the missile last was. */
export function placeEvents(events: readonly ViewEvent[], t: TacticalState): ViewEvent[] {
  return events.map((e): ViewEvent => {
    if (e.kind === 'laser') {
      const s = t.ships[e.ship]!;
      if (e.hit) { const g = t.ships[t.systems[e.ship]!.target]!; return { ...e, x1: s.x, y1: s.y, x2: g.x, y2: g.y }; }
      return { ...e, x1: s.x, y1: s.y, x2: s.x + hx(s.heading) * LASER_RANGE, y2: s.y + hy(s.heading) * LASER_RANGE };
    }
    if (e.kind === 'pewFire' || e.kind === 'contact' || e.kind === 'gunHit' || e.kind === 'pewHit') { const s = t.ships[e.ship]!; return { ...e, x: s.x, y: s.y }; }
    return e;
  });
}
```

3. Change `OnlineDuelSourceDeps` to `{ client: ConfirmedDuel; seat: number; now(): number; viewport: Viewport; prediction?: PredictionView }`.

4. In `createOnlineDuelSource`:
   - Rename the confirmed interpolation bodies throughout the function: `prev` → `cPrev`, `missilePrev` → `cMissilePrev`, `crewPrev` → `cCrewPrev`.
   - After `const duel = ...`, replace it with:

```ts
  const predicted = (): DuelState | null => (deps.prediction?.active() ? deps.prediction.state() : null);
  const predictedBodies = (): PredictedBodies | null => (predicted() ? deps.prediction!.before() : null);
  /** The confirmed replica: every member that predicts by hand today keeps reading it until Task 9 removes the hand-written guesses. */
  const replica = (): DuelState => client.state()!;
  const duel = (): DuelState => predicted() ?? replica();
  const viewAlpha = (): number => (predicted() ? deps.prediction!.alpha() : frameAlpha);
```

   - **Only the drawing switches to P in this task** (R1-F2): the `duel` and `seed` getters, `prev`, `missilePrev`, `crewPrev`, `alpha`, `drainEvents`, `crewOverride` and the cameras in `frame`. Every other member of the source that calls `duel()` today is changed to call `replica()`: `epoch`, `view`, `axes`, `thrMille`, `turret`, `helmVent`, `throttle`, `helmAxes` and `crewHelm`'s callers. W-4's `turret()` hand prediction (`predictTurret` over `unackedFrames`) and `gunModeBase` therefore behave exactly as today until Task 9, and the existing session tests that read `turret()`, `thrMille()` and `helmVent()` still pass in Tasks 6 to 8.

   - Change the getters and members:

```ts
    get prev() { return predictedBodies()?.ships ?? cPrev; },
    get missilePrev() { return predictedBodies()?.missiles ?? cMissilePrev; },
    get crewPrev() { return predictedBodies()?.crew ?? cCrewPrev; },
    ...
    alpha: viewAlpha,
    /** Net-4a §3.6: the confirmed replica (end card, outcome, one-shot sounds). */
    confirmed: (): DuelState => client.state()!,
    /** Net-4a §3.6: every other player's character from the confirmed publications, one gap behind; this seat's slot null. */
    crewOverride: (): CrewOverride | undefined => (predicted() && latest
      ? { at: latest.crew.map((c, pid) => (pid === seat ? null : c)), prev: cCrewPrev.map((c, pid) => (pid === seat ? null : c)), alpha: frameAlpha }
      : undefined),
    drainEvents() { const out = events; events = []; const p = predicted(); return p ? placeEvents(out, p.tactical) : out; },
```

   - In `frame(dt, keys, pointer)`: change `const d = client.state(); if (!d) return;` to `if (!client.state()) return; const d = duel();`. Keep the `frameAlpha` computation as it is: it is the confirmed gap's alpha, which `crewOverride` uses. Change the camera loop to blend with the view's bodies and alpha:

```ts
      for (const c of [cameras.helm, cameras.weapons, cameras.science]) {
        if (c.follow === 'missile' && !missileOf(d.tactical, 0)) followBody(c, 'ship');
        const target = c.follow === 'missile' ? interpolatedMissile(d.tactical, source.missilePrev, viewAlpha(), 0) : followTarget(d.tactical, source.prev, viewAlpha(), c.follow);
        updateCamera(c, deps.viewport, dt, target);
      }
```

   - Add `confirmed(): DuelState; crewOverride(): CrewOverride | undefined;` to the source's declared type (the `DuelViewSource & { ... }` block).

`observe()` keeps working on the confirmed replica (`client.state()`) exactly as today: `gapEvents`, `latest` and the arrival gaps. The round-change camera reset also stays on the confirmed round.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run tests/crewOverride.test.ts tests/duelOnlineView.test.ts tests/crewHelmOnline.test.ts tests/crewSeats.test.ts tests/onlineDuelSession.test.ts && npm run typecheck`
Expected: PASS. Without a `prediction` the source behaves exactly as before, so the existing tests pass unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/render/duel/crewOverride.ts src/renderer/src/app/duel/onlineSource.ts src/renderer/src/app/duel/scene.ts tests/crewOverride.test.ts tests/duelOnlineView.test.ts
git commit -m "net-4a(view): the online source draws the prediction; others' characters and effects from confirmed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The session runs local ticks and feeds the predictor

§3.3 on the session side, and §3.4's disposal rules. The session gets:
- a local tick clock driven by elapsed time;
- one log entry per local tick, producing or not;
- the predictor, owned with the stream client and confirmed on every new publication;
- the source wired to it.

The hand-written guesses stay until Task 9.

**Files:**
- Modify: `src/renderer/src/app/duel/onlineDuel.ts` (the session)
- Modify: `tests/onlineDuelSession.test.ts`: the stub publishes full `DuelPublication`s; new cases.

**Interfaces:**
- Consumes: `createDuelPredictor` and `LocalInput` (Task 4), `PredictionView` (Task 6), and `neutralize(): number | null` (Task 4).
- Produces: `export const LOCAL_TICK_MS = 1000 / 60, LOCAL_TICKS_MAX = 4;` from `onlineDuel.ts`. Task 10 reads the session's `confirmSamples` and `tickSamples`.

- [ ] **Step 1: The stub publishes real publications**

In `tests/onlineDuelSession.test.ts`, replace `interface Pub` and `stubClient`'s `publish`. The predictor needs a validated snapshot, its hash, every watermark and `held`.

```ts
import type { DuelPublication } from '../src/renderer/src/clientControl/duelClient';
type Pub = DuelPublication;
```

Inside `stubClient`, add `let revision = 0, lastPhaseSeen = 'running';`, then:

```ts
    publish(d: DuelState, phase = 'running', pause: { reason: string | null; owner: number | null } = { reason: null, owner: null }, water: { command?: number[]; held?: number[]; heldInput?: HeldInput[] } = {}) {
      const snapshot = saveDuelSnapshot(d, DIGEST), next = loadDuelSnapshot(CUTTER, snapshot, DIGEST);
      if (replica) disposeDuel(replica);
      replica = next; sequence++;
      if (phase !== lastPhaseSeen) { revision++; lastPhaseSeen = phase; }   // a pause or a resume is a control change
      const n = d.interior.playerCount, zeros = Array<number>(n).fill(0);
      pub = { runId: 'c'.repeat(32), tick: d.interior.tick, publicationSequence: sequence, snapshot, hash: snapshot.header.hash, phase: phase as Pub['phase'],
        pauseOwner: pause.owner, controlRevision: revision, pauseReason: pause.reason, lagTicks: 0, tickTimeMs: null,
        commandHighWater: water.command ?? zeros, heldHighWater: water.held ?? zeros, auxiliaryHighWater: zeros, eventSequence: 0,
        held: water.heldInput ?? Array.from({ length: n }, () => ({ moveX: 0, moveY: 0, interactHeld: false })) };
    },
```

The old stub's `tick` was `sequence * 3`. It is now the duel's own tick, which the predictor requires. Run the file once (`npx vitest run tests/onlineDuelSession.test.ts`). Any case that compared against `pub.tick` or counted on `heldHighWater` being `[0, 0]` must now pass `water` explicitly; do it per case. Do not change what a case asserts.

- [ ] **Step 2: Write the failing session tests**

Add to `tests/onlineDuelSession.test.ts`:

```ts
describe('the session predicts (Net-4a §3.3, §3.6)', () => {
  it('one local tick per 1000/60 ms: a 50 ms pump sends three held frames; a 200 ms pump runs at most LOCAL_TICKS_MAX', () => {
    const r = rig(0), c = r.attach();
    const before = c.helds().length;
    r.pump(50);
    expect(c.helds().length - before).toBe(3);
    const mid = c.helds().length;
    r.pump(200);
    expect(c.helds().length - mid).toBe(4);
    r.dispose();
  });
  it('the first tick of a pump takes the presses; the later ones repeat its held input with no commands', () => {
    const r = rig(1, undefined, undefined, undefined, ShipClass.ValkyrnLaser), c = r.attach();   // seat 1 at the ValkyrnLaser's Weapons: Space charges the laser (the Cutter's Hound-style Weapons seat ignores Space)
    const before = c.commands().length;
    r.key('keydown', 'Space'); r.key('keyup', 'Space'); r.pump(50);
    expect(c.commands().slice(before).filter((x) => x.kind === 'laserCharge')).toHaveLength(1);
    r.dispose();
  });
  it('the scene draws P ahead of the confirmed replica; confirmed() is the replica', () => {
    const r = rig(0), c = r.attach();
    for (let k = 0; k < 5; k++) r.pump();
    session_frame(r);
    const src = h.source as unknown as { duel: DuelState; confirmed(): DuelState };
    expect(src.duel.interior.tick).toBeGreaterThan(c.publication()!.tick);
    expect(src.confirmed()).toBe(c.state());
    r.dispose();
  });
  it('an unfocused window\'s prediction keeps stepping (its entries are neutral)', () => {
    const r = rig(0), c = r.attach();
    r.session.setFocused(false);
    for (let k = 0; k < 4; k++) r.pump();
    session_frame(r);
    expect((h.source as unknown as { duel: DuelState }).duel.interior.tick).toBe(c.publication()!.tick + 5);
    r.dispose();
  });
  it('a link close drops the prediction: the frozen copy is drawn', () => {
    const r = rig(0); r.attach();
    for (let k = 0; k < 3; k++) r.pump();
    r.closeLink(); session_frame(r);
    const src = h.source as unknown as { duel: DuelState; confirmed(): DuelState };
    expect(src.duel).toBe(src.confirmed());
    r.dispose();
  });
});
/** One drawn frame (the mocked scene records the source it was given). */
function session_frame(r: ReturnType<typeof rig>): void { r.session.frame(); }
```

The `unfocused` case expects `publication tick + 5`. The attach's syncing pump runs one tick and the four pumps run four more. If the rig's `attach()` runs a different number of pumps after the publish, count them and adjust the expected lead; the point is that it grows while unfocused. Import `DuelState` if the file does not already. It does: `type DuelState` comes from `state`.

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npx vitest run tests/onlineDuelSession.test.ts`
Expected: the new cases FAIL. One pump still sends one frame, and `h.source.duel` is the replica.

- [ ] **Step 4: Wire the session**

In `src/renderer/src/app/duel/onlineDuel.ts`:

1. Add imports:

   ```ts
   import { createDuelPredictor, type DuelPredictor, type LocalInput } from '../../clientControl/duelPredictor';
   ```

   Also add `CommandEnvelope` to the `../../net/contracts` import.

2. Add module constants after `UNACKED_MAX`:

```ts
/** Net-4a §3.3: the local tick (60 a second, as the authority's tick driver) and the most one pump runs; the rest are dropped. */
export const LOCAL_TICK_MS = 1000 / 60, LOCAL_TICKS_MAX = 4;
const neutral = (): HeldInput => ({ moveX: 0, moveY: 0, interactHeld: false });
```

3. Add session state next to the other `let`s:

```ts
  // Net-4a §3.3, §3.4: the predictor (owned with the stream client), the last publication it was given, the local tick
  // clock, this tick's commands (collected by send), a neutralize's held sequence for the next entry, and the timings (§3.10).
  let predictor: DuelPredictor | null = null, confirmedSequence = 0, clockBase: number | null = null, localDone = 0, lastLocalAt = 0;
  let collected: CommandEnvelope<DuelCommand>[] | null = null, neutralSequence: number | null = null;
  const confirmSamples: number[] = [], tickSamples: number[] = [];
  const keep = (list: number[], ms: number): void => { list.push(ms); if (list.length > LIVE_SAMPLES) list.shift(); };
```

4. In `send`, after the `commandStamps` line:

```ts
    // Net-4a §3.3: this local tick's commands go into its log entry; setPaused, rematch and presence are never predicted.
    if (id && collected && command.kind !== 'setPaused' && command.kind !== 'rematch' && command.kind !== 'presence') collected.push({ runId: descriptor.runId, id, requestedTick: 0, command });
```

5. In `stopInput`, replace `client.neutralize(descriptor.seatId);` with:

   ```ts
   const s = client.neutralize(descriptor.seatId); if (s !== null) neutralSequence = s;   // Net-4a §3.3: the next entry carries it
   ```

6. In `release`, after `client?.dispose(); client = null;`, add `predictor?.dispose(); predictor = null; confirmedSequence = 0;`.

   §3.4 also disposes the predictor when the link closes, before any `release`. Change the attach's close handler to:

   ```ts
   offClose = link.onClose(() => { freeze(); stopInput(); linkClosed = true; predictor?.dispose(); predictor = null; confirmedSequence = 0; });
   ```

   Without this, `pump` keeps stepping a hidden `P` to the cap after a close (R1-F12).

7. In `observe`, after `if (!p || !d) return;`:

```ts
    if (predictor && p.publicationSequence !== confirmedSequence) {   // Net-4a §3.4: verify, else re-simulate, else reset
      confirmedSequence = p.publicationSequence;
      const t0 = deps.now(); predictor.confirm(p, d); keep(confirmSamples, deps.now() - t0);
    }
```

8. Rename the body of `pump` after `observe(); pollLink();` into a new function `produce(): LocalInput`. Change its exits as follows; every other line stays as it is.
   - `if (!client || linkClosed || !d || !p || !descriptor || !synced || !focused || blocked) { if (producing) stopInput(); return idle(); }`
   - The leave prompt: `if (leaveConfirm.open || keys.leave) { producing = true; const s = client.held(me, neutral()); neutralSource(); return s === null ? idle() : { heldSequence: s, held: neutral(), commands: [] }; }`
   - `if (p.phase !== 'running') { neutralSource(); return idle(); }`
   - Right before `if (decided) { ... } else play(...)`, add `collected = [];`.
   - Replace `const sequence = client.held(me, decided ? { moveX: 0, moveY: 0, interactHeld: false } : held);` with `const sent = decided ? neutral() : held, sequence = client.held(me, sent);`.
   - At the end, after `producing = true;`:

     ```ts
     const commands = collected; collected = null;
     return sequence === null ? idle() : { heldSequence: sequence, held: sent, commands };
     ```

   - The function starts with `let k = keyboard.sample();` and keeps every line up to there.

   Then write the new `pump`, `repeat` and `idle`:

```ts
  /** Net-4a §3.3: a not-producing local tick: neutral, no commands, and the sequence of a neutralize sent since, if any. */
  function idle(): LocalInput { const s = neutralSequence; neutralSequence = null; return { heldSequence: s, held: neutral(), commands: [] }; }
  /** A later local tick of the same pump: the first's held input again, no presses and no commands, its own held frame. */
  function repeat(first: LocalInput): LocalInput {
    if (first.heldSequence === null || !client || !descriptor || !producing) return idle();
    const s = client.held(descriptor.seatId, first.held);
    return s === null ? idle() : { heldSequence: s, held: first.held, commands: [] };
  }
  function pump(): void {
    if (disposed) return;
    observe(); pollLink();
    // Net-4a §3.3: local ticks by elapsed time, 60 a second; the first pump runs one; at most LOCAL_TICKS_MAX per pump.
    const now = deps.now();
    if (clockBase === null) { clockBase = now - LOCAL_TICK_MS; localDone = 0; }
    const due = Math.floor((now - clockBase) / LOCAL_TICK_MS + 1e-6);
    let n = due - localDone;
    if (n > LOCAL_TICKS_MAX) { localDone = due - LOCAL_TICKS_MAX; n = LOCAL_TICKS_MAX; }
    let first: LocalInput | null = null;
    for (let i = 0; i < n; i++) {
      localDone++; lastLocalAt = clockBase + localDone * LOCAL_TICK_MS;
      const entry: LocalInput = first ? repeat(first) : produce();
      first ??= entry;
      if (predictor) { const t0 = deps.now(); predictor.tick(entry); keep(tickSamples, deps.now() - t0); }
    }
  }
```

   `pump` is also called when no tick is due (`n === 0`). It then only observes and polls. The keyboard keeps its presses and the map requests stay queued for the next due tick.

9. In `attach`, after `client = createDuelRemoteClient(...)`:

```ts
      predictor = createDuelPredictor({ seat: next.seatId, contentDigest: deps.contentDigest, resolveLayout: deps.resolveLayout });   // Net-4a §3.4: one per client
```

   Then pass the prediction to the source:

```ts
      source = createOnlineDuelSource({ client: { state, publication, live }, seat: next.seatId, now: deps.now, viewport: { w: INTERNAL_W, h: INTERNAL_H },
        prediction: { active: () => !linkClosed && (predictor?.active() ?? false), state: () => predictor?.state() ?? null, before: () => predictor?.before() ?? null,
          alpha: () => Math.max(0, Math.min(1, (deps.now() - lastLocalAt) / LOCAL_TICK_MS)) } });
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run tests/onlineDuelSession.test.ts tests/duelOnlineView.test.ts tests/crewHelmOnline.test.ts && npm run typecheck`
Expected: PASS. The in-flight throttle, heading and mode cases still pass, because those guesses are still in place.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/app/duel/onlineDuel.ts tests/onlineDuelSession.test.ts
git commit -m "net-4a(session): local ticks by elapsed time, an input log entry each, the predictor fed and drawn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Scene, interior and audio read confirmed where §3.6 says

The rule is simple: nothing that cannot be taken back comes from `P`. That covers the kill flash, the outcome, the console's "decided" hiding and the one-shot sounds. Other players' characters come from the override.

**Files:**
- Modify: `src/renderer/src/app/duel/scene.ts` (`draw`)
- Modify: `src/renderer/src/app/duel/duelAudio.ts` (`DuelAudioFrame`, `frame`)
- Modify: `src/renderer/src/render/duel/interiorView.ts` (`draw` gains an override)
- Create: `tests/predictionAudio.test.ts`

**Interfaces:**
- Consumes: `DuelViewSource.confirmed?()` and `crewOverride?()` (Task 6); `crewDrawAt` and `crewPresentation` (Task 6).
- Produces: `DuelAudioFrame.confirmed?: DuelState; confirmedCrew?: CrewLife`.
- Produces: `InteriorView.draw(..., hover, override?: CrewOverride | null)`, a new last parameter.

- [ ] **Step 1: Write the failing audio test**

Create `tests/predictionAudio.test.ts`:

```ts
// Net-4a §3.6: the audio's one-shot watchers (the outcome's cue, a torpedo's launch) read the confirmed state; a
// prediction that decides the round early plays nothing until the confirmed state does.
import { describe, expect, it } from 'vitest';
import { createDuelAudio } from '../src/renderer/src/app/duel/duelAudio';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { NO_AXES, Outcome } from '../src/renderer/src/sim/tactical/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
describe('one-shot sounds from the confirmed state (Net-4a §3.6)', () => {
  it('the victory cue waits for the confirmed outcome, not the predicted one', () => {
    const c = createSeatedDuel(CUTTER, 3), p = loadDuelSnapshot(CUTTER, saveDuelSnapshot(c, DIGEST), DIGEST);
    const cues: string[] = [], audio = createDuelAudio({ play: (cue) => cues.push(cue), sounds() {}, status() {} });
    const life = { health: [100, 100], downed: [false, false] };
    const frame = () => audio.frame({ duel: p, confirmed: c, events: [], axes: NO_AXES, paused: false, pan: () => 0, me: 0, crew: life, confirmedCrew: life, dt: 1 / 60 });
    try {
      frame();
      stepDuelTick(p, { held: [], commands: [] }); stepDuelTick(c, { held: [], commands: [] });
      p.tactical.outcome = Outcome.CrewWins; frame();
      expect(cues).toEqual([]);
      c.tactical.outcome = Outcome.CrewWins; frame();
      expect(cues).toEqual(['victory']);
    } finally { disposeDuel(c); disposeDuel(p); }
  });
});
```

`crew` is a `CrewLife`. If its type differs from `{ health: number[]; downed: boolean[] }`, build it with `crewLife(c)` from `src/renderer/src/render/duel/healFxModel.ts`, which the scene uses.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/predictionAudio.test.ts`
Expected: FAIL. The first `frame()` after the predicted win plays 'victory', and TypeScript reports `confirmed` as an unknown property.

- [ ] **Step 3: Implement the audio**

In `src/renderer/src/app/duel/duelAudio.ts`:
- Add to `DuelAudioFrame`:

  ```ts
    /** Net-4a §3.6: the confirmed state and its crew, which the one-shot watchers read online (absent: `duel`, `crew`). */
    confirmed?: DuelState; confirmedCrew?: CrewLife;
  ```

- In `frame`, read the watchers from it. Replace the lines that compute `st`, `ins`, `life`, `flying` and `mood` with:

```ts
      const t = f.duel.tactical, w = f.confirmed ?? f.duel, wt = w.tactical, ev = duelEventSounds(f.events, f.pan);
      const st = duelStateSounds(duelWatch, { tick: wt.tick, round: w.round, outcome: wt.outcome, missiles: wt.missiles }, f.pan);
      duelWatch = st.watch;
      const ins = interiorSounds(inside, interiorAudioView(w.interior, wt.tick));   // Net-4a §3.6: one-shot, so confirmed
      inside = ins.watch;
      ...
      const alarm = fireAlarm(lastAlarm, ins.ignited, clock), life = crewLifeSounds(crewWatch, { tick: wt.tick, round: w.round, downed: (f.confirmedCrew ?? f.crew).downed });
      ...
      const flying = wt.missiles.some((m) => m.active && m.owner === CREW), launched = flying && !crewFlying;
      ...
      const mood = duelMood({ running: wt.outcome === OUTCOME_RUNNING, won: wt.outcome === OUTCOME_CREW_WINS, hostile: f.hostile !== false, scanning: wt.scan.contact >= 0, known: wt.known.some((k) => k >= 1), fires: ins.fires });
```

The heartbeat, the hiss, the lock tone's data and the hum keep reading `t` and `f.crew`, the prediction. Those are continuous sounds (§3.6).

- [ ] **Step 4: Implement the scene and the interior**

In `src/renderer/src/app/duel/scene.ts`, `draw`:
- In the `epoch === null` first-frame branch, use `lastOutcome = (source.confirmed?.() ?? source.duel).tactical.outcome;`.
- After `const d = source.duel, ...`, add:

  ```ts
  const c = source.confirmed?.() ?? d;   // Net-4a §3.6: the outcome and the one-shots
  ```

- Change `consoleHidden(d, overlay, source.running())` to `consoleHidden(c, overlay, source.running())`.
- Change the kill block:

```ts
      if (lastOutcome === Outcome.Running && c.tactical.outcome !== Outcome.Running && (c.tactical.systems[enemySlot]?.hull ?? 1) <= 0) {
        const e = interpolatedShip(d.tactical, source.prev, alpha, enemySlot);
        pushKill(fx, e.x, e.y, e.h);
      }
      lastOutcome = c.tactical.outcome;
```

- Add to `sound.frame({...})`: `confirmed: c, confirmedCrew: crewLife(c),`.
- In the interior call, pass the override: `interior.draw(d, source.crewPrev, alpha, dt, events, frozen ? 0 : dt, { camera: source.interiorCamera, active: source.active() }, options.pointer?.() ?? null, source.crewOverride?.() ?? null);`.

In `src/renderer/src/render/duel/interiorView.ts`:
- Import `crewDrawAt`, `crewPresentation` and `type CrewOverride` from `./crewOverride`.
- Add `override?: CrewOverride | null` as the last parameter of `draw` in the `InteriorView` interface and in the implementation (default `null`).
- Health bars and labels: replace the per-character position line inside `for (const c of o.crew)` with:

  ```ts
  const at = crewDrawAt(c.pid, c.x / TILE_PX, c.y / TILE_PX, crewPrev, alpha, override), x = at.x * TILE_PX, y = at.y * TILE_PX;
  ```

- Sprites: change `crew.draw(st, alpha, undefined, bob);` to `crew.draw(st, alpha, crewPresentation(override), bob);`.

The zoom camera follows `zoom.active`, this seat's own character, which is never overridden, so that block stays.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run tests/predictionAudio.test.ts tests/audioDuel.test.ts tests/crewOverride.test.ts tests/onlineDuelSession.test.ts && npm run typecheck`
Expected: PASS. Single player passes no `confirmed` and no override, so its sounds and drawing are unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/app/duel/scene.ts src/renderer/src/app/duel/duelAudio.ts src/renderer/src/render/duel/interiorView.ts tests/predictionAudio.test.ts
git commit -m "net-4a(scene): outcome, kill flash and one-shot sounds from confirmed; others' characters from the override

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The hand-written predictions go

§3.9. `P` holds every unacknowledged input now. The session's decisions read `P`, and the in-flight holds, the throttle ramp, the local vent and `UNACKED_MAX` are deleted. Kept: the always-send rule for shots, and NO CHARGE from the authority's `unavailable` answer.

**Files:**
- Modify: `src/renderer/src/app/duel/onlineDuel.ts`
- Modify: `src/renderer/src/app/duel/onlineSource.ts`
- Modify: `tests/crewHelmOnline.test.ts`, `tests/duelOnlineView.test.ts`, `tests/onlineDuelSession.test.ts`

**Interfaces:**
- Removed from `OnlineDuelSource`: `thrMille`, `helmVent`, `unacked`, `throttleBase` and `gunModeBase` (W-4). The scene falls back to `d.thrMille`, `d.helmVent` and `source.throttle()`. All of these are now `P`'s. `turret(slot)` stays, and reads `P`'s turret.
- Removed from `onlineDuel.ts`: `UNACKED_MAX`, and W-4's in-flight holds `gunModeSent` and `lockSent`.
- All the members Task 6 left on `replica()` move to `duel()`, so they read `P` while predicting.

- [ ] **Step 1: Rewrite the tests that pin the removed pieces**

In `tests/crewHelmOnline.test.ts`, replace the `describe('the online source\'s prediction (spec §3, §6)', ...)` block with:

```ts
describe('the crew Helm online reads the prediction (Net-4a §3.9)', () => {
  it('thrMille and the vent are the drawn state\'s own fields: no local ramp on top', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.thrMille = 100;
      const s = source(d, 0);
      s.observe(); s.sent({ ...NONE, throttleHeld: 1, rcsX: 1 });
      expect((s as { thrMille?: unknown }).thrMille).toBeUndefined();
      expect((s as { helmVent?: unknown }).helmVent).toBeUndefined();
      expect(s.axes()).toEqual(crewAxes(d, { ...NONE, throttleHeld: 1, rcsX: 1 }));   // the sim's own function on the drawn state
    } finally { disposeDuel(d); }
  });
});
```

In `tests/duelOnlineView.test.ts`, the case "the Helm seat flies the replica throttle; throttle() is the session base, else the replica" becomes:

```ts
  it('the Helm seat\'s throttle() is the drawn state\'s throttle', () => {
    const live = createSeatedDuel(CUTTER, 3, 0, 2, ShipClass.Valkyrn), c = confirmed(); c.publish(live);
    try {
      const s = createOnlineDuelSource({ client: c.client, seat: 0, now: () => 0, viewport: { w: 1280, h: 720 } });
      s.observe();
      expect(s.throttle()).toBe(c.client.state()!.throttle);
      expect((s as { throttleBase?: unknown }).throttleBase).toBeUndefined();
    } finally { disposeDuel(live); c.dispose(); }
  });
```

Keep its other assertions that do not use `throttleBase` or `unacked`.

In `tests/onlineDuelSession.test.ts`, the `describe('the online Helm throttle (Artemis spec §5.4)', ...)` block becomes the version below. Acknowledgement is now by publication (`water.command`), not by results.

```ts
describe('the online Helm throttle reads the prediction (Artemis spec §5.4, Net-4a §3.9)', () => {
  const tap = (r: ReturnType<typeof rig>, code: string): void => { r.key('keydown', code); r.key('keyup', code); r.pump(); };
  const throttles = (c: Stub) => c.commands().filter((x) => x.kind === 'throttle');
  it('two W presses inside one round trip move two notches (P holds the first); S steps down from P', () => {
    const r = rig(0, undefined, undefined, undefined, ShipClass.Valkyrn), c = r.attach();
    tap(r, 'KeyW'); tap(r, 'KeyW');
    expect(throttles(c)).toEqual([{ kind: 'throttle', level: 1 }, { kind: 'throttle', level: 2 }]);
    tap(r, 'KeyS');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 1 });
    r.dispose();
  });
  it('a throttle the authority ran and refused (the watermark passed it, the state without it) falls back to the replica level', () => {
    const r = rig(0, undefined, undefined, undefined, ShipClass.Valkyrn), c = r.attach();
    tap(r, 'KeyW'); tap(r, 'KeyW');                                       // 1, then 2, both in P
    c.publish(r.d, 'running', undefined, { command: [c.ids.at(-1)!.sequence, 0] }); r.pump();   // both run, both refused: throttle still 0
    tap(r, 'KeyW');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 1 });
    r.dispose();
  });
  it('a new round starts from the replica\'s throttle', () => {
    const r = rig(0, undefined, undefined, undefined, ShipClass.Valkyrn), c = r.attach();
    tap(r, 'KeyW'); tap(r, 'KeyW');
    nextRound(r.d); c.publish(r.d, 'running', undefined, { command: [c.ids.at(-1)!.sequence, 0] }); r.pump();
    tap(r, 'KeyW');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 1 });
    r.dispose();
  });
});
```

Delete every case whose subject is the removed mechanism:
- Anything asserting `UNACKED_MAX`, `unacked`, or "the result for the level in flight".
- "a sit, a re-attach and a noop result each clear the level in flight".
- "a stand and a new round clear the level in flight". The new-round case above replaces it.

The W-4 cases in `tests/onlineDuelSession.test.ts` that pin a hand prediction are rewritten against `P`:

- **"the source's turret(0) follows the reticle at MAN traverse while gunMode is in flight, then the replica's again"** becomes:

```ts
  it("R puts pew pew on MAN in P at once, so its turret slews toward the reticle; a publication that ran the gunMode with the gun still AUTO takes it back", () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    const src = () => h.sources.at(-1) as unknown as { turret(slot: 0 | 1): number; duel: DuelState };
    const h0 = c.state()!.tactical.ships[0].heading, want = (h0 * 256 + 2000) % 65536;
    h.sceneOpts[0]!.requests!.reticle(want); r.pump(); r.session.frame();
    expect(src().turret(0)).toBe(0);   // AUTO
    r.key('keydown', 'KeyR'); r.key('keyup', 'KeyR'); r.pump(); r.pump(); r.pump(); r.session.frame();
    expect(src().duel.tactical.systems[0].pewManual).toBe(true);   // P holds the gunMode
    expect(src().turret(0)).toBeGreaterThan(0);   // and slews toward +2000 (MAN traverse)
    const id = c.ids[c.commands().map((x) => x.kind).lastIndexOf('gunMode')]!;
    c.publish(r.d, 'running', undefined, { command: [0, id.sequence] }); r.pump(); r.session.frame();   // run and refused: the replica is still AUTO
    expect(src().duel.tactical.systems[0].pewManual).toBe(false);
    r.dispose();
  });
```

- **"the prediction reads the selected gun's own mode: pew pew's MAN in flight does not move the autocannon's turret"**: keep its steps. Replace each `src().turret(1)` expectation with the state's own:
  - `expect(src().duel.tactical.systems[0].gunManual).toBe(false)` before the second R;
  - `expect(src().duel.tactical.systems[0].gunManual).toBe(true)` after it;
  - `expect(src().turret(1)).toBeGreaterThan(0)` after two more pumps.

  The exact 341-a-frame multiple goes: the sim's slew, not `predictTurret`, moves `P`.
- **"two E presses before a replica arrives step the target room twice (lockSent); it clears on the result, a new round and a stand"**:
  - Keep the two-presses assertion. `P` holds the first `laserLock`, so the second E steps from it.
  - Replace "clears on the result" with a publication `{ command: [0, <the last laserLock's sequence>] }` whose state (`r.d`, unchanged) keeps the replica's lock. The next E then steps from the replica's lock.
  - The new-round and stand parts keep their assertions.
- **"a MANUAL flight: no gunHeld, no pewFire, then the selection returns; the turret is not predicted while it flies"**: keep every assertion about what is sent and about `weaponSel`. Delete the two `turret(0)` expectations: what `P`'s turret does during a flight is the sim's rule.
- **"blur drops the local prediction: the vent and thrMille fall back to the replica state"**: delete it. Blur now sends neutral entries and `P` steps with them; Task 7's "an unfocused window's prediction keeps stepping" covers it.
- **"R sends gunMode for the selected gun; a second R before the result flips back (from gunModeSent for that slot)"**: keep its assertions and rename it "(from P)". `P` holds the first toggle.

Which `publish` water index is the Weapons seat's: `rig(1)` is seat 1, so its command watermark is the second entry, `{ command: [0, sequence] }`.

For the heading, laser-mode and torpedo-mode cases ("from the mode in flight, else the replica's", "a clear asked for while a heading is in flight is sent", "A held at the Helm clears the base"):
- Keep the assertions about what is sent.
- Rename each to say "from P".
- Run them. They pass because `P` holds the toggle.
- If one fails because it relied on a result clearing the base, rewrite it the throttle way: acknowledge by `water.command` in a publication.

- [ ] **Step 2: Run the rewritten tests and watch them fail**

Run: `npx vitest run tests/crewHelmOnline.test.ts tests/duelOnlineView.test.ts tests/onlineDuelSession.test.ts`
Expected: FAIL, because `thrMille`, `helmVent` and `throttleBase` still exist, and the refused-throttle case builds on the in-flight 2.

- [ ] **Step 3: Remove the pieces**

In `src/renderer/src/app/duel/onlineDuel.ts`:
- Delete:
  - the `UNACKED_MAX` export;
  - `throttleSent`, `headingSent`, `laserModeSent`, `torpModeSent`, `gunModeSent` and `lockSent`, with every assignment and reset of them (in `play`, `observe`, the top of `produce`, and `attach`);
  - both `source?.gunModeBase(...)` loops;
  - `lastHeldSequence`;
  - the `source?.unacked(...)` line;
  - both `source?.throttleBase(...)` lines.
- Keep `torpHold` and its resets. It is the MANUAL torpedo's held heading, not a prediction. Its round reset moves to `if (d && d.round !== torpRound) { torpRound = d.round; torpHold = -1; }`, with a new `let torpRound = -1`.
- `neutralSource()` becomes `function neutralSource(): void { source?.sent(neutral()); }`.
- In `produce`, the console decisions read the prediction, but the round's outcome does not (§3.6, R1-F8). Change `const d = client?.state(), p = client?.publication();` to:

  ```ts
  const c = client?.state(), d = predictor?.state() ?? c, p = client?.publication();
  ```

  Then:
  - The early-return guard tests `!c` where it tested `!d`.
  - `decided` is `c.tactical.outcome !== Outcome.Running`.
  - `leavePromptKeys(leaveConfirm, c, p.phase, k.presses)` reads `c`.
  - The decided branch (`if (decided) { if (k.presses.confirm > 0) send({ kind: 'rematch' }); }`) is unchanged and is driven by `c`.

  Every other read (`seatOf`, `crewHelmSeat`, `houndWeaponsSeat`, `refusal`, `canCharge`, `canLaunch`, the W-4 `flightFrame` and the round resets on `d.round`) takes `d`, `P`. A predicted kill therefore never neutralizes input or opens the leave prompt ahead of the authority.
- In `play`, use the prediction's own fields:
  - `throttleRequest(d.throttle, p, k.throttleTo, throttleCap(d.tactical.systems[0]!))`, then `if (level !== null) send({ kind: 'throttle', level });`.
  - The heading dedupe at both seats becomes `heading !== d.holdHeading`. The crew Helm's `if (k.fireHeld) headingSent = ...` and the Helm's two `if (turning) headingSent = ...` lines go. `P` already cleared the hold on the ticks A/D or auto-face were held.
  - `let manual = sys.laserManual;` and `if (...) { manual = !manual; send({ kind: 'laserMode', manual }); }`.
  - `let torpManual = sys.torpManual;` and `if (p.torpMode % 2 === 1) { torpManual = !torpManual; send({ kind: 'torpMode', manual: torpManual }); }`.
  - The `sit` and `stand` branches keep `torpHold = -1;`, W-4's selection resets (`weaponSel = 0; lastGunSel = 0; triggerPrev = false; flight = NO_FLIGHT; triggerLive = false;`) and the `send`.
  - W-4's Hound Weapons branch:
    - E/Q step from `sys0.lock`; `sendLock` loses its `lockSent` assignment.
    - `modeRequests([sys0.pewManual, sys0.gunManual, sys0.torpManual], weaponSel, p, k.modeTaps)`; the two sends lose their `gunModeSent` and `torpModeSent` assignments.
    - The held frame's trigger reads `d.tactical.systems[0].gunManual` where it read `gunModeSent[1]`.
- In `observe`, the result loop keeps:
  - the `pewSent`, `laserSent` and `torpSent` NO CHARGE and NO TORPEDOES lines;
  - the command latency stamps.

  Delete its four `...Sent = null` lines.

In `src/renderer/src/app/duel/onlineSource.ts`:
- Delete `unackedFrames`, `shownThrottle`, `gunModeShown`, `thrMille`, `helmVent`, `unacked`, `throttleBase` and `gunModeBase` (from the object and from its declared type).
- `turret` reads `P`'s own turret, which the sim slews toward the held `turretAim`:

  ```ts
      turret: (slot: 0 | 1): number => { const s = duel().tactical.systems[0]; return slot === 0 ? s.pewTurret : s.gunTurret; },   // Net-4a §3.9: P's turret
  ```

- Delete the now-unused imports: `rampTicks`, `heldAxis`, `engineBars`, `throttleFloor`, `throttleCap`, `ventOf`, `noVent`, `HelmVent`, `predictTurret`. Keep `houndWeaponsSeat` if anything else still uses it.
- Replace every remaining `replica()` call (from Task 6) with `duel()`, then delete `replica`.
- If `predictTurret` in `app/duel/weaponsSeat.ts` has no other caller (`grep -rn predictTurret src`), delete it and its test cases.
- Change `axes` to:

```ts
    axes: (): Axes => {   // Artemis spec §5.3; Net-4a §3.9: the sim's own axes for this seat's held input, on the drawn state
      const d = duel();
      if (crewHelm(d)) return crewAxes(d, sentHeld);
      return seatOf(d, seat) === 'helm' && d.tactical.outcome === Outcome.Running ? { turn: heldTurn(d, sentHeld), thrust: throttleThrust(d.throttle) } : NO_AXES;
    },
```

- `throttle: () => duel().throttle,`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/crewHelmOnline.test.ts tests/duelOnlineView.test.ts tests/onlineDuelSession.test.ts tests/crewSeats.test.ts tests/predictionGates.test.ts && npm run typecheck`
Expected: PASS. Then `grep -rn "UNACKED_MAX\|throttleSent\|headingSent\|laserModeSent\|torpModeSent\|gunModeSent\|lockSent\|gunModeBase\|unackedFrames" src tests` must print nothing.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/onlineSource.ts tests/crewHelmOnline.test.ts tests/duelOnlineView.test.ts tests/onlineDuelSession.test.ts
git commit -m "net-4a(cleanup): the in-flight holds, throttle ramp and local vent go; the session reads P

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Figures: F3 and the playtest record

§3.10.
- **F3** shows the lead (ticks and ms), the verified share, the re-simulation p99 and the last correction.
- **The record** gains an optional `prediction` block. Its `version` stays 1.

**Files:**
- Modify: `src/renderer/src/render/duel/latencyOverlay.ts` (`LatencyOverlayModel`, `latencyOverlayLines`)
- Modify: `src/renderer/src/net/duelRecord.ts` (type, schema, `fineFigure`)
- Modify: `src/renderer/src/app/duel/onlineDuel.ts` (`record`, `frame`, per-round samples)
- Modify: `tests/onlineDuelSession.test.ts`, plus `tests/duelRecord.test.ts` if it exists, else the record cases in `tests/onlineDuelSession.test.ts`

**Interfaces:**
- Produces: `export interface PredictionFigures { leadTicks: number; verifiedShare: number | null; resimP99Ms: number | null; correction: number | null }` and `LatencyOverlayModel.prediction?: PredictionFigures | null`.
- Produces: `DuelPlaytestRecord.prediction?: { lead: LatencyFigure; verifiedShare: number | null; correction: LatencyFigure; resimP99Ms: number | null }` and `export function fineFigure(samples: readonly number[]): LatencyFigure`, which rounds to 0.001 instead of 0.1.

- [ ] **Step 1: Write the failing tests**

Add to `tests/onlineDuelSession.test.ts`, near the F3 cases:

```ts
describe('prediction figures (Net-4a §3.10)', () => {
  it('F3 shows the prediction line: lead in ticks and ms, the verified share, re-simulation p99 and the last correction', () => {
    expect(latencyOverlayLines({ transport: 'internet', held: latencyFigure([]), command: latencyFigure([]), rttMs: 80,
      prediction: { leadTicks: 9, verifiedShare: 0.966, resimP99Ms: 0.84, correction: 0.12 } }).at(-1))
      .toBe('PRED LEAD 9 (150 MS)  OK 97%  RESIM 0.84 MS  FIX 0.12 U');
    expect(latencyOverlayLines({ transport: 'lan', held: latencyFigure([]), command: latencyFigure([]), rttMs: null }).some((l) => l.startsWith('PRED'))).toBe(false);
  });
  it('a round\'s record carries the prediction block, validated, version still 1', async () => {
    const r = rig(0), c = r.attach();
    for (let k = 0; k < 9; k++) r.pump();
    c.publish(r.d); r.pump();
    c.events.push(roundEvent(0)); r.pump();
    const rec = r.records.at(-1)!;
    expect(rec.version).toBe(1);
    expect(rec.prediction).toBeDefined();
    expect(rec.prediction!.lead.count).toBeGreaterThan(0);
    expect(() => duelRecordSchema.shape.prediction.unwrap().parse(rec.prediction)).not.toThrow();   // roundEvent's summary is partial, so only the new block is validated
    r.dispose();
  });
});
```

- Import `latencyOverlayLines` from `../src/renderer/src/render/duel/latencyOverlay`, and `latencyFigure` and `duelRecordSchema` from `../src/renderer/src/net/duelRecord`.
- `roundEvent(0)`'s record is `{ round, seed }` only, so the strict summary schema would refuse the whole record. The test validates only the `prediction` block.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/onlineDuelSession.test.ts`
Expected: FAIL, because there is no PRED line and no `prediction`.

- [ ] **Step 3: Implement**

In `src/renderer/src/render/duel/latencyOverlay.ts`, add:

```ts
/** Net-4a §3.10: the prediction's figures. */
export interface PredictionFigures { leadTicks: number; verifiedShare: number | null; resimP99Ms: number | null; correction: number | null }
```

Add `prediction?: PredictionFigures | null` to `LatencyOverlayModel`. In `latencyOverlayLines`, build the array as today, then:

```ts
  const p = m.prediction;
  if (p) lines.push(`PRED LEAD ${p.leadTicks} (${Math.round(p.leadTicks * 1000 / 60)} MS)  OK ${p.verifiedShare === null ? '?' : `${Math.round(p.verifiedShare * 100)}%`}  RESIM ${p.resimP99Ms === null ? '?' : p.resimP99Ms.toFixed(2)} MS  FIX ${p.correction === null ? '0' : p.correction.toFixed(2)} U`);
  return lines;
```

`render/` may use any Math.

In `src/renderer/src/net/duelRecord.ts`:
- Add the type field to `DuelPlaytestRecord`:

  ```ts
    /** Net-4a §3.10: the round's prediction: the lead (ticks), the verified share, the own-ship corrections (u) and the re-simulation p99. */
    prediction?: { lead: LatencyFigure; verifiedShare: number | null; correction: LatencyFigure; resimP99Ms: number | null };
  ```

- Add to `duelRecordSchema`'s object:

  ```ts
  prediction: z.object({ lead: figure, verifiedShare: z.number().min(0).max(1).nullable(), correction: figure, resimP99Ms: ms.nullable() }).strict().optional()
  ```

- Add:

```ts
/** As latencyFigure, rounded to 0.001: the corrections are fractions of a unit. */
export function fineFigure(samples: readonly number[]): LatencyFigure {
  const s = samples.filter((v) => v >= 0 && v <= DUEL_RECORD_MAX_MS).sort((a, b) => a - b);
  if (!s.length) return { count: 0, median: null, p95: null, max: null };
  const rank = (q: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]!, round = (v: number) => Math.round(v * 1000) / 1000;
  return { count: s.length, median: round(rank(0.5)), p95: round(rank(0.95)), max: round(s[s.length - 1]!) };
}
```

In `src/renderer/src/app/duel/onlineDuel.ts`:

1. Import `fineFigure`. Add the round's samples:

   ```ts
   const roundLead: number[] = [], roundCorrection: number[] = [], roundResim: number[] = [], liveResim: number[] = []; let roundVerified = 0, roundConfirms = 0;   // liveResim: F3's recent re-simulation times (R1-F12)
   ```

2. Replace `observe`'s confirm block (from Task 7) with:

```ts
    if (predictor && p.publicationSequence !== confirmedSequence) {   // Net-4a §3.4: verify, else re-simulate, else reset
      confirmedSequence = p.publicationSequence;
      const t0 = deps.now(), result = predictor.confirm(p, d), ms = deps.now() - t0, st = predictor.stats();
      keep(confirmSamples, ms);
      // §3.10: the round's figures. A reset (a pause, a new or decided round) is not a prediction.
      const bound = (list: number[], v: number): void => { list.push(v); if (list.length > 4096) list.shift(); };
      if (result !== 'reset') { roundConfirms++; if (result === 'verified') roundVerified++; bound(roundLead, st.lead); }
      if (result === 'resimulated') { bound(roundResim, ms); keep(liveResim, ms); if (st.correction) bound(roundCorrection, st.correction.ship); }
    }
```

3. Add a helper next to `keep`:

   ```ts
   const p99 = (xs: readonly number[]): number | null => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.ceil(0.99 * s.length) - 1)]! * 1000) / 1000; };
   ```

   In `record`, add to `r`:

   ```ts
   ...(roundConfirms > 0 ? { prediction: { lead: latencyFigure(roundLead), verifiedShare: roundVerified / roundConfirms, correction: fineFigure(roundCorrection), resimP99Ms: p99(roundResim) } } : {}),
   ```

   After `heldSamples.length = 0; ...`, add `roundLead.length = 0; roundCorrection.length = 0; roundResim.length = 0; roundVerified = 0; roundConfirms = 0;`.

4. In `frame`, pass the live figures to `latencyOverlayLines`:

   ```ts
      const ps = predictor?.stats(), checked = ps ? ps.verified + ps.resimulated : 0;
      if (debug.on()) deps.latency?.frame(latencyOverlayLines({ transport: transport(), held: latencyFigure(liveHeld), command: latencyFigure(liveCommand), rttMs,
        prediction: ps ? { leadTicks: ps.lead, verifiedShare: checked ? ps.verified / checked : null, resimP99Ms: p99(liveResim), correction: ps.correction?.ship ?? null } : null }));
   ```

   This replaces the existing `if (debug.on()) ...` line. Its `else deps.latency?.clear();` stays.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/onlineDuelSession.test.ts tests/latencyOverlay.test.ts tests/duelRecord.test.ts && npm run typecheck`
Expected: PASS. If `tests/latencyOverlay.test.ts` or `tests/duelRecord.test.ts` do not exist, drop them from the command.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/render/duel/latencyOverlay.ts src/renderer/src/net/duelRecord.ts src/renderer/src/app/duel/onlineDuel.ts tests
git commit -m "net-4a(figures): F3 prediction line and the record's prediction block

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: G4 small corrections, and the measuring script (G6 and §2)

- **G4** runs in the suite, on the scripted pair over the impaired link.
- **G6** runs in a script. It is a timing gate on the owner's desktop and does not belong in a flaky suite. The same script prints §2's tables.

**Files:**
- Create: `tests/predictionCorrections.test.ts`
- Create: `scripts/measure-prediction.ts`

**Interfaces:**
- Consumes: `predictedSeat` (Task 5), `burstStep` (Task 2) and `createDuelPredictor` with `step` (Task 4).

- [ ] **Step 1: Write the G4 test**

Create `tests/predictionCorrections.test.ts`:

```ts
// Net-4a gate G4: the scripted pair over the impaired link at 50 to 200 ms round trip: the own-ship correction p95 at
// most 1 u and max at most 5 u; this seat's own character corrected by at most half a tile (Net-0's gate). Each seat's
// script reads that seat's own predicted view, as a player reads the screen.
import { beforeEach, describe, expect, it } from 'vitest';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { impairedPair } from './helpers/impairedLink';
import { onlineDuel } from './helpers/onlineDuel';
import { predictedSeat } from './helpers/predictedSeat';

const p95 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]! : 0; };
beforeEach(() => new Promise<void>((resolve) => setImmediate(resolve)));   // R1-F10, as tests/duelOnline.test.ts
describe('G4: small corrections (Net-4a §6)', { timeout: 300_000 }, () => {
  for (const rttMs of [50, 100, 200]) it(`scripted pair at ${rttMs} ms: own ship p95 <= 1 u, max <= 5 u; character <= 0.5 tile`, () => {
    const w = onlineDuel(5, { link: (peer) => impairedPair(peer, { seed: 11, now: () => w.nowMs(), up: { delayMs: rttMs / 2, jitterMs: 5 }, down: { delayMs: rttMs / 2, jitterMs: 5 } }) });
    w.connect(0); w.connect(1);
    const pairs = [createScriptedPair(5), createScriptedPair(5)];
    const seats = [0, 1].map((seat) => predictedSeat(w, seat, (_L, view) => {
      const input = scriptedInput(pairs[seat]!, view);
      return { held: input.held[seat] ?? { moveX: 0, moveY: 0, interactHeld: false }, commands: input.commands.filter((c) => c.id.player === seat).map((c) => c.command) };
    }));
    for (let k = 0; k < 60 * 60; k++) { w.tick(); for (const s of seats) s.step(); }
    for (const s of seats) {
      const ship = s.results.flatMap((r) => (r.correction ? [r.correction.ship] : [])), character = s.results.flatMap((r) => (r.correction ? [r.correction.character] : []));
      console.log(`G4 ${rttMs} ms: ${ship.length} corrections, ship p95 ${p95(ship).toFixed(3)} max ${Math.max(0, ...ship).toFixed(3)}, character max ${Math.max(0, ...character).toFixed(3)}`);
      expect(p95(ship)).toBeLessThanOrEqual(1);
      expect(Math.max(0, ...ship)).toBeLessThanOrEqual(5);
      expect(Math.max(0, ...character)).toBeLessThanOrEqual(0.5);
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/predictionCorrections.test.ts`
Expected: PASS, with the figures printed.

A failing max is either a predicted break that was then averted (§3.7), or a rig artefact: the scripted pair reads `P`, so its own decisions change with `P`. Before touching the predictor, print the tick and both positions of the worst correction. The gate is the spec's. Do not loosen it here; report the failure in the build report and to the owner.

- [ ] **Step 3: Write the measuring script**

Create `scripts/measure-prediction.ts`:
- **Part A** prints §2's tables.
- **Part B** is G6.

Both runs step through `burstStep(every)` from Task 2, so a busy run's bursts are part of the step. The restored copies in part A and the predictor in part B (through its `step` option) burst exactly as the straight run does.

```ts
// Net-4a (spec 2026-11-19-net-4a-duel-prediction-design §2, gate G6): the measurement of §2 as a committed tool, and the
// cost gate. Part A, per run (quiet; busy, a burst every 10 s; busy, every 5 s): a scripted Cutter duel for 3600 ticks
// after a 600-tick opening. At every third tick a copy is restored and stepped 12 ticks ahead with only what one seat's
// client could know: its own held input and commands on every tick, its partner's held input as of the saved tick. It is
// compared value for value with the straight run: the share exactly right per seat, the own-ship error when wrong (p95,
// max), and the checks with any rock wrong. The state packet estimate: values changed in three ticks × 12 bytes + 734.
// Part B (G6): the busy-every-5-s run fed to the real predictor 12 ticks ahead of each publication: one local tick (a
// step plus its hash) p99 <= 0.8 ms; one publication (verify, or restore and 12 ticks) p99 <= 4 ms. --force-resim
// perturbs the partner's published held input so every publication re-simulates (the worst case). Exit 1 on a G6 miss.
//   npx tsx scripts/measure-prediction.ts [--force-resim] [--json <path>]
import { writeFileSync } from 'node:fs';
import { computeContentDigest } from '../build/contentDigest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuelPredictor } from '../src/renderer/src/clientControl/duelPredictor';
import type { DuelPublication } from '../src/renderer/src/clientControl/duelClient';
import type { CommandEnvelope, DuelCommand, HeldInput } from '../src/renderer/src/net/contracts';
import { flattenDuel } from '../src/renderer/src/sim/duel/hash';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { loadDuelSnapshot, restoreDuelSnapshot, saveDuelSnapshot, type DuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import type { DuelInput } from '../src/renderer/src/sim/duel/step';
import { rockAlive, rockAt, rockSlots } from '../src/renderer/src/sim/tactical/rocks';
import { burstStep } from './determinism/duelRestore';

(globalThis as Record<string, unknown>).__GAMEPLAY_CONTENT_DIGEST__ = computeContentDigest(process.cwd());
const digest = computeContentDigest(process.cwd()), CUTTER = parseShip(cutter), OPENING = 600, TICKS = 3600, AHEAD = 12;
const pct = (xs: readonly number[], q: number): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]! : 0; };
const N = (): HeldInput => ({ moveX: 0, moveY: 0, interactHeld: false });
/** What part A compares besides the flat values: ship 0 and every rock slot (alive, x, y). */
interface Probe { x: number; y: number; rocks: number[] }
function probe(d: DuelState): Probe {
  const t = d.tactical, rocks: number[] = [];
  for (let r = 0; r < rockSlots(t); r++) { const a = rockAt(t, r); rocks.push(rockAlive(t, r) ? 1 : 0, a.x, a.y); }
  return { x: t.ships[0]!.x, y: t.ships[0]!.y, rocks };
}
const sameValues = (a: Float64Array, b: Float64Array): boolean => { if (a.length !== b.length) return false; for (let v = 0; v < a.length; v++) if (a[v] !== b[v]) return false; return true; };

/** One straight run: every tick's input, a snapshot every third tick after the opening, and each later tick's flat values and probe. */
function straight(seed: number, burstEvery: number) {
  const step = burstStep(burstEvery), d = createDuel(CUTTER, seed), pair = createScriptedPair(seed);
  const inputs: DuelInput[] = [], snaps = new Map<number, DuelSnapshot>(), flats = new Map<number, Float64Array>(), probes = new Map<number, Probe>();
  const live: number[] = [], packet: number[] = [];
  let prev3: Float64Array | null = null;
  for (let k = 0; k < OPENING + TICKS + AHEAD; k++) {
    if (k >= OPENING && k % 3 === 0) snaps.set(k, saveDuelSnapshot(d, digest));
    const input = scriptedInput(pair, d); inputs.push(structuredClone(input)); step(d, input);
    const tick = k + 1;
    if (tick > OPENING) {
      const flat = flattenDuel(d); flats.set(tick, flat); probes.set(tick, probe(d));
      let n = 0; for (let r = 0; r < rockSlots(d.tactical); r++) if (rockAlive(d.tactical, r)) n++; live.push(n);
      if (tick % 3 === 0) {
        if (prev3) { let changed = 0; for (let v = 0; v < flat.length; v++) if (flat[v] !== prev3[v]) changed++; packet.push(changed * 12 + 734); }
        prev3 = flat;
      }
    }
  }
  return { d, inputs, snaps, flats, probes, live, packet, step };
}

function partA(name: string, seed: number, burstEvery: number) {
  const run = straight(seed, burstEvery);
  const row: Record<string, unknown> = { run: name, freeRocks: Math.round(run.live.reduce((a, b) => a + b, 0) / run.live.length),
    packetMedianKB: (pct(run.packet, 0.5) / 1024).toFixed(1), packetMaxKB: (Math.max(...run.packet) / 1024).toFixed(1) };
  for (const seat of [0, 1]) {
    let right = 0, total = 0, rocksWrong = 0, copy: DuelState | null = null;
    const err: number[] = [];
    for (const [k, snap] of run.snaps) {
      if (k + AHEAD > OPENING + TICKS) continue;
      if (!copy) copy = loadDuelSnapshot(CUTTER, snap, digest); else restoreDuelSnapshot(copy, snap, digest);
      const partner = run.inputs[k - 1]!.held[1 - seat] ?? N();   // the partner's held input as of the saved tick
      for (let j = 0; j < AHEAD; j++) {
        const t = run.inputs[k + j]!;
        run.step(copy, { held: [0, 1].map((p) => (p === seat ? t.held[p] ?? N() : partner)), commands: t.commands.filter((c) => c.id.player === seat) });
      }
      total++;
      if (sameValues(flattenDuel(copy), run.flats.get(k + AHEAD)!)) { right++; continue; }
      const got = probe(copy), want = run.probes.get(k + AHEAD)!;
      err.push(Math.hypot(got.x - want.x, got.y - want.y));
      if (got.rocks.length !== want.rocks.length || got.rocks.some((v, i) => v !== want.rocks[i])) rocksWrong++;
    }
    if (copy) disposeDuel(copy);
    row[seat === 0 ? 'helmRight' : 'weaponsRight'] = `${((right / total) * 100).toFixed(1)}%`;
    row[seat === 0 ? 'helmErrP95' : 'weaponsErrP95'] = pct(err, 0.95).toFixed(2);
    row[seat === 0 ? 'helmErrMax' : 'weaponsErrMax'] = Math.max(0, ...err).toFixed(2);
    row[seat === 0 ? 'helmRocksWrong' : 'weaponsRocksWrong'] = rocksWrong;
  }
  disposeDuel(run.d);
  return row;
}

function partB(forceResim: boolean) {
  const run = straight(9, 300), tickMs: number[] = [], pubMs: number[] = [];
  const predictor = createDuelPredictor({ seat: 0, contentDigest: digest, resolveLayout: () => CUTTER, step: run.step });
  // Seat 0's commands get positive sequences in the order the predictor sees them; the watermark of publication k is the
  // largest sequence among seat 0's commands the straight run had stepped before tick k.
  const sequenceAt: number[] = []; let nextId = 0;
  for (let j = 0; j < run.inputs.length; j++) { for (const c of run.inputs[j]!.commands) if (c.id.player === 0) nextId++; sequenceAt[j + 1] = nextId; }
  const publication = (k: number): DuelPublication => {
    const snapshot = run.snaps.get(k)!, held = run.inputs[k - 1]!.held.map((h) => ({ ...(h ?? N()) }));
    if (forceResim) held[1] = { ...held[1]!, moveX: (k / 3) % 2 === 0 ? 1 : -1 };
    return { runId: 'm', tick: k, publicationSequence: k, snapshot, hash: snapshot.header.hash, phase: 'running', pauseOwner: null, controlRevision: 0, pauseReason: null,
      lagTicks: 0, tickTimeMs: null, commandHighWater: [sequenceAt[k] ?? 0, 0], heldHighWater: [k, 0], auxiliaryHighWater: [0, 0], eventSequence: 0, held };
  };
  const confirmed = loadDuelSnapshot(CUTTER, run.snaps.get(OPENING)!, digest);
  predictor.confirm(publication(OPENING), confirmed);
  let id = sequenceAt[OPENING] ?? 0;
  // Local tick L sends the input that produced tick L (inputs[L − 1]) with held sequence L: the authority used it on tick L.
  for (let L = OPENING + 1; L <= OPENING + TICKS; L++) {
    const t = run.inputs[L - 1]!, commands: CommandEnvelope<DuelCommand>[] = t.commands.filter((c) => c.id.player === 0).map((c) => ({ ...c, id: { player: 0, sequence: ++id } }));
    const t0 = performance.now(); predictor.tick({ heldSequence: L, held: t.held[0] ?? N(), commands }); tickMs.push(performance.now() - t0);
    const k = L - AHEAD;
    if (k > OPENING && run.snaps.has(k)) {
      restoreDuelSnapshot(confirmed, run.snaps.get(k)!, digest);
      const t1 = performance.now(); predictor.confirm(publication(k), confirmed); pubMs.push(performance.now() - t1);
    }
  }
  const s = predictor.stats(); predictor.dispose(); disposeDuel(confirmed); disposeDuel(run.d);
  return { tickP99: pct(tickMs, 0.99), pubP99: pct(pubMs, 0.99), verified: s.verified, resimulated: s.resimulated, liveRocksMax: Math.max(...run.live) };
}

const force = process.argv.includes('--force-resim'), at = process.argv.indexOf('--json'), json = at >= 0 ? process.argv[at + 1] : undefined;
const a = [partA('quiet', 4, 0), partA('busy, a burst every 10 s', 4, 600), partA('busy, a burst every 5 s', 4, 300)];
console.table(a);
const b = partB(force);
console.log(`G6 (${force ? 'every publication re-simulated' : 'natural'}): one local tick p99 ${b.tickP99.toFixed(3)} ms (<= 0.8), one publication p99 ${b.pubP99.toFixed(3)} ms (<= 4), verified ${b.verified}, re-simulated ${b.resimulated}, live rocks max ${b.liveRocksMax}`);
if (json) writeFileSync(json, JSON.stringify({ a, b }, null, 2));
if (b.tickP99 > 0.8 || b.pubP99 > 4) process.exitCode = 1;
```

Notes on part B:
- **The anchor is exact.** Held sequence `L` is the input that produced tick `L`, and the publication of `k` has `heldHighWater` `k`.
- **The predictor stands 12 ticks ahead** of every publication. A re-simulation is therefore a restore plus 12 ticks, the case G6 names.
- **The burst rates** are multiples of 300 ticks: 600 is every 10 s and 300 is every 5 s.
- **`sequenceAt`** counts seat 0's commands in the order the loop re-numbers them. The re-numbering starts after the opening's count, so the watermark of publication `k` covers exactly the commands stepped before tick `k`.
- **If `.superpowers/net-4a/` does not exist**, create it before running with `--json`.

- [ ] **Step 4: Run the script**

Run: `npx tsx scripts/measure-prediction.ts --json .superpowers/net-4a/measure.json` and `npx tsx scripts/measure-prediction.ts --force-resim`
Expected:
- The §2 table prints. The Helm seat is about 97% right and the Weapons seat 67 to 81%. Rocks wrong is 0. (These are §2's figures; differences are reported, not gated.)
- G6 prints within its limits in both modes, and the exit code is 0.
- If the busy run's live rock maximum is far below 240, report it; G6 names "about 240 live rocks".

- [ ] **Step 5: Commit**

```bash
git add tests/predictionCorrections.test.ts scripts/measure-prediction.ts
git commit -m "net-4a(G4,G6): correction gate in the suite; the measuring script prints §2 and the cost gate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Nothing else moved (G7), and the build report

**Files:**
- Create: `docs/superpowers/research/2026-11-20-net-4a.md`

- [ ] **Step 1: Run the full gates**

Run each and keep the output:
- `npm run typecheck`
- `npm test`
- `npm run test:determinism`
- `npm run test:duel-app-runtime`
- `git diff master --stat -- tests/golden tests/fixtures/determinism-v2.json src/renderer/src/sim/tuning.ts`

Expected:
- Everything passes.
- The last command prints nothing: no golden, fixture or `SIM_VERSION` changed.
- `grep -n "SIM_VERSION =" src/renderer/src/sim/tuning.ts` still shows 63.

If `test:duel-app-runtime` fails on the schema version, the two pairs of Task 1 did not move together. Check `createHostRuntime`'s comparison.

- [ ] **Step 2: Write the build report**

Create `docs/superpowers/research/2026-11-20-net-4a.md` with these sections:

1. **What was built**: one paragraph per task, with its commit.
2. **Gates**: a table of gate, target, measured, and pass or fail.
   - G1: the verified and re-simulated counts per round trip and loss, from the test output.
   - G2: Node, Chromium and Firefox.
   - G3.
   - G4: the per-RTT lines.
   - G5.
   - G6: both modes.
   - G7: the commands above.
   - G8: "owner playtest, open".
3. **The §2 tables as measured now**, next to the spec's.
4. **Deviations from the plan or spec**, each with its reason.
5. **Open for the owner**: the two-human internet playtest (G8), where F3 shows the PRED line and the record carries `prediction`. If corrections are visible, the next step is §3.8's 100 ms offset.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/research/2026-11-20-net-4a.md
git commit -m "net-4a(report): gates G1-G7 measured; G8 is the owner's playtest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage

| Spec | Task |
|---|---|
| §3.1 two states, the predictor's interface | 4 (`confirm` takes `C` too, for the decided check; `active`, `before` and `hashAt` added) |
| §3.2 `held` on the publication, codec length check, schema 3 and 2 in pairs | 1 |
| §3.3 local ticks by time, at most 4, an entry per tick, producing and not, neutral frames logged, the first tick takes the presses | 7 (session), 4 (predictor half) |
| §3.3 the step's held and commands, requestedTick, body capture, hashes on cadence ticks | 4 |
| §3.4 anchor, trim, commands only by `c`, target with slack and clamp, verify, re-simulate, reset rules, dispose with the client | 4, 7 |
| §3.5 lost updates | 5 (G5) |
| §3.6 the view table, `crewOverride`, `confirmed` | 6, 8 |
| §3.7 effects on confirmed counters at P's positions | 6 (`placeEvents`), 8 (kill flash and one-shots from `C`) |
| §3.8 no smoothing yet | nothing built; report |
| §3.9 the hand-written predictions go; tests rewritten | 9 |
| §3.10 timings, F3, record block | 7 (samples), 10 |
| §4 the rock work's four properties | 2 (G2 pins 4.1 and 4.2 for today's arrays), the boundary test (4.4); 4.3 is Asteroids-iv's |
| §6 impaired link and G1-G8 | 3, 5, 2, 11, 12 |
| `scripts/measure-prediction.ts` | 11 |
