# Artemis-ii: the Helm's set-and-forget throttle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the duel's Helm a set-and-forget throttle of six notches (100, 75, 50, 25, STOP, REV). The ship keeps flying at the set level with no key held. W and S move it one notch, a click on a notch sets it, and A/D turning stays held.

**Architecture:** A new duel sim module `helm` owns one canonical integer, `DuelState.throttle` (−1..4). A new `throttle {level}` command sets it, admitted in `stepDuelTick` against the Helm attendant. `flyShip` quantises thrust to quarters, and the step flies the crew ship at `throttleThrust(d.throttle)` while the Helm is crewed. One pure module, `sim/duel/throttle.ts`, holds the levels, and the sim, the scripted pair and the app all read it. In the app, W and S become press edges in the duel keyboard. A console click is `ConsoleInput.throttle(level)`. The local runtime and the online session both turn these into `throttle` commands built on a local base level. The online base follows spec §5.4's `throttleSent` rule. `DuelViewSource.throttle()` is the level the console draws, and `axes()` follows the throttle, so the predicted path and the flame follow it too. SIM_VERSION is blessed in two steps: the bump alone with the oracle proof, then the gameplay change as a same-version bless.

**Tech Stack:** TypeScript 5.8, React 19 + zustand 5 (UI store), Pixi 8 (tactical layer), Vitest 3.2 + jsdom + @testing-library/react, zod 3 (wire codec).

**Spec:** `docs/superpowers/specs/2026-11-17-artemis-consoles-design.md`: §5 (all of it), §4.2 "Artemis-ii (the target)", §6.1 to §6.2 (`throttle(level)`, `throttleTo`, `DuelViewSource.throttle()`), and §8's Artemis-ii tests. Artemis-i (layout, tabs, clickable controls) is merged (ab75aa72). Its plan `docs/superpowers/plans/2026-11-17-artemis-i-consoles.md` is the house style this plan follows.

**Branch:** work on a branch `artemis-ii` from master `e39ce3f7` or later, in a worktree or not. Record the Task 1 and Task 2 baselines in the same working copy you bless from, because the baselines check their `cwd`.

## Global Constraints

- **SIM_VERSION 42 → 43.** Master is at **42**: duel-fire took 40, duel-health took 41, and disable-systems took 42 (`702146bd`, merged `e39ce3f7`). The spec's "40 → 41" is stale. Before Task 1, run `git grep -n "SIM_VERSION = " -- src/renderer/src/sim/tuning.ts`. If it does not read `42`, stop: master moved again, and every version number in this plan must move with it.
- **Oracle migration entry `MIGRATIONS[42]`**, keyed by the baseline's version: `{ change: 'Artemis-ii: helm throttle', rename: () => undefined, derived: [], added: [/^helm\.throttle$/] }`.
- **Two-step bless (spec §5.6), as duel-fire (e123424 then efa0a5b), duel-health (431c0e83 then 56380d49) and disable-systems (702146bd then 5044177f) did.** Step 1 is "bump alone": the module, the command, admission and the wire. No scripted run sends `throttle`, and nothing reads `d.throttle`, so every oracle run is unchanged per tick. Step 2 is the gameplay change, blessed at the same version (43).
- **Generated files come only from `npm run bless`:** `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`. Never edit them by hand. Never pass `--fresh`.
- **Levels (spec §5.1):** an integer in `−1..4`. −1 is reverse, 0 stop, and 1–4 are 25/50/75/100 %. `throttleThrust(l) = l < 0 ? −1 : l / 4`.
- **Module (spec §5.1):** `helmModule`, id `helm`, placed in `DUEL_MODULES` after `round` and before `interior`. It has one field, `throttle`, and command kinds `['throttle']`. Its reasons are exactly `['invalid-seat', 'malformed', 'stale-tick']`. `createDuel` sets the throttle to 0, so `startRound` (which builds through `createDuel`) resets it.
- **Snapshot (spec §5.1):** `helmAt = roundAt + 4; interiorAt = helmAt + 1`. The round tuple is `values.slice(roundAt, helmAt)`, and the throttle is `values[helmAt]`. A throttle that is not an integer in −1..4 is rejected.
- **Command (spec §5.2):** `{ kind: 'throttle'; level: number }` in `DuelCommand` and in `DUEL_KINDS`, so a decided round answers `duel-decided`. Admission runs after the seat phase, in this order: (1) `requestedTick !== tick` → rejected `stale-tick`; (2) the sender is not `attendant(d, d.nav)` → rejected `invalid-seat`; (3) the level is not an integer in −1..4 → rejected `malformed`; (4) `level === d.throttle` → `noop`; otherwise applied, and `d.throttle = level`. Within a tick, envelope order holds and the last applied command wins.
- **Wire (spec §5.2):** `z.object({ kind: z.literal('throttle'), level: z.number().finite() }).strict()` in `duelWire.commands`. The signalling service needs no redeploy.
- **Physics (spec §5.3):** `q = clamp(Math.round(thrust × 4), −4, 4) / 4`, with NaN as 0. Forward thrust is `q × cls.thrust × f`. Any negative `q` gives today's full reverse, `−cls.thrust × reverseFraction × f`. Idle is `turn === 0 && q === 0`. Whole axes (−1, 0, 1) must fly bit for bit as today.
- **Step (spec §5.3):** while the Helm is crewed, the crew axes are `{ turn: held moveX of the Helm attendant, thrust: throttleThrust(d.throttle) }`. An empty Helm coasts and keeps the level. Held moveY no longer thrusts in the duel.
- **Scripted pair (spec §5.5):** each tick its Helm is seated, the wanted level comes from the wanted thrust (1 → 4, 0 → 0, −1 → −1). It sends `throttle {level}` only when that differs from `d.throttle`. `hazardAway` predicts with `{ turn: pair.axes.turn, thrust: throttleThrust(d.throttle) }`.
- **Telemetry (spec §5.3):** the manoeuvre rule becomes "the Helm turns, or the throttle is not 0".
- **Keys and clicks (spec §5.4):** W and S are press-edge actions `throttleUp` and `throttleDown`. Auto-repeat is ignored, and both keys stay held keys too, for walking and the flight dev view. At the Helm each press asks for `base ± 1`, clamped to −1..4. A click asks for its notch. The local base is the latest pending `throttle` for the active player, else `d.throttle`. The online base is `throttleSent.level` while one is in flight, else the replica's `d.throttle`. The pending level is cleared when its result arrives (applied, noop or rejected), on attach, on a new round, and on stand and sit. The flight dev view keeps held W/S thrust.
- **Views (spec §5.3, §6.1):** `runtime.axes()` and `onlineSource.axes()` return `{ turn, thrust: throttleThrust(d.throttle) }` while crewed, else `NO_AXES`. Online reads the replica. `DuelViewSource.throttle()` is the level shown, which is the local base.
- **UI (spec §4.2):** six press buttons `console-throttle-100`, `-75`, `-50`, `-25`, `-stop`, `-rev`, top to bottom. The set notch is lit and has a `<` pointer. The notches from 25 up to the set one are filled. The Artemis-i THRUST/REV holds go. The turn holds stay. The station hint reads `W/S  THROTTLE`. The Helm help in the paused right-hand fallback reads `W/S THROTTLE   A/D TURN`.
- **Test commands:** `npx vitest run <files>`; `npx tsc -b`; the full suite `npx vitest run --maxWorkers=4`; determinism `npm run test:determinism`. Determinism rewrites tracked logs under `.superpowers/sdd/2026-11-14-net-1b-durability/task-5-logs/`; restore them with `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability/task-5-logs/` afterwards. Never `git add` anything outside each task's file list: the working tree has unrelated dirty files.
- Comments follow the codebase's style. Each new file gets a header comment that cites the spec section.

## Deviations from the spec (stated on purpose)

1. **Versions:** 42 → 43 and `MIGRATIONS[42]`, not the spec's 40 → 41 and `MIGRATIONS[40]` (see Global Constraints).
2. **`ConsoleView.helm.throttle: number`** replaces spec §6.1's `throttleShown` and `throttleSettable`. The Helm panel exists only on the Helm view, where the throttle can always be set, so `settable` would always be true. `HelmPanel.held` stays for the turn buttons. `ConsoleModelInput.throttle` is optional and defaults to `d.throttle`, so the existing model tests keep their input.
3. **`throttleSent` also records the round:** `{ level, sequence, round }`. The session clears it when the replica's round differs, without a second round tracker.
4. **A request equal to the base is not sent.** For example, W at 100 % or a click on the set notch. The sim would answer `noop`, so nothing is lost. The sim still answers `noop` for such a command, which the oracle and the admission tests cover.
5. **One pure helper does the arithmetic:** `throttleRequest(base, presses, to)` in `app/duel/input.ts` is used by the runtime and the online session. W and S pressed in one frame net out (each step is clamped), and a click in the same frame wins.
6. **`clampThrottle` rounds before it clamps** (NaN → 0), so a stray non-integer `throttleTo` still becomes a valid level, as spec §5.4's "clamped" asks.
7. **`axes()` is `NO_AXES` on the end card** in both sources, because a decided round has no physics. Before, held keys were neutral there. Now a set throttle would otherwise draw a flame on the end card.
8. **The local runtime drops a queued `throttle` on Tab and on stand,** as it already drops queued Weapons commands. Otherwise it would reach the sim after the seat empties and be rejected `invalid-seat`.
9. **The scripted Helm's held moveY is 0.** It no longer "holds W", which matches "held moveY no longer thrusts".
10. **Online source:** the session hands the base to the source each pump with a new `throttleBase(level | null)`, and `throttle()` returns it, or the replica's level when it is null. The source never sees the command stream.
11. **Step 2 re-measures the scripted-run-pinned test numbers** (seed 7's split tick, the duel golden's length, the checkpoint summary), as duel-fire and duel-health did. Their values cannot be known before the bless, so Task 2 gives the measuring script and the exact rule.
12. **The Electron check** (spec §8's look check) is run by the controller in Task 5 from a scratch playwright-core script outside the repo, as Artemis-i's was. It is not a committed smoke.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/renderer/src/sim/duel/throttle.ts` | create | the levels: `THROTTLE_MIN/MAX`, `validThrottle`, `throttleThrust`, `clampThrottle` |
| `src/renderer/src/sim/duel/state.ts` | modify | `DuelState.throttle`, 0 in `createDuel` |
| `src/renderer/src/sim/duel/modules.ts` | modify | `helmModule` after `round` |
| `src/renderer/src/sim/duel/step.ts` | modify | `throttle` admission, the `noop` result; (Task 2) the crew axes from the throttle |
| `src/renderer/src/sim/duel/snapshot.ts` | modify | `helmAt`, the throttle bound |
| `src/renderer/src/net/contracts.ts`, `src/renderer/src/net/codec.ts` | modify | the `throttle` command on the wire |
| `src/renderer/src/sim/tuning.ts` | modify | SIM_VERSION 43 |
| `scripts/golden/duelOracle.ts` | modify | `MIGRATIONS[42]` |
| `src/renderer/src/sim/tactical/physics.ts`, `src/renderer/src/sim/tactical/state.ts` | modify (Task 2) | quarter-thrust `flyShip`; the `Axes` comment |
| `src/renderer/src/sim/duel/scripted.ts`, `src/renderer/src/sim/duel/telemetry.ts` | modify (Task 2) | the scripted throttle; the manoeuvre rule |
| `src/renderer/src/app/duel/input.ts` | modify (Task 3) | `throttleUp`/`throttleDown`, `ConsoleInput.throttle`, `KeySample.throttleTo`, `throttleRequest` |
| `src/renderer/src/app/controlsList.ts`, `src/renderer/src/ui/actions.ts` | modify (Task 3) | the controls list rows; forward `throttle` |
| `src/renderer/src/app/duel/runtime.ts`, `onlineDuel.ts`, `onlineSource.ts`, `scene.ts` | modify (Task 3) | the throttle commands, `throttle()`, the axes |
| `src/renderer/src/render/duel/consoleModel.ts`, `readoutModel.ts` | modify (Task 4) | `HelmPanel.throttle`; the Helm help |
| `src/renderer/src/ui/duel/HelmStation.tsx` | modify (Task 4) | the six notch buttons |
| `src/renderer/src/app/uiProbe.ts` | modify (Task 4) | the Helm probe fixture's throttle |
| `tests/duelThrottle.test.ts` | create | the sim and wire tests |
| `tests/duelModules.test.ts`, `tests/duelCheckpoint.test.ts`, `tests/duelSnapshot.test.ts` | modify (Task 1) | the new module, kind and offset |
| `tests/duel.test.ts`, `tests/tacticalFlight.test.ts`, `tests/duelScripted.test.ts`, `tests/duelTelemetry.test.ts`, plus the pinned numbers in `tests/duelCheckpoint.test.ts`, `tests/duelModules.test.ts`, `tests/duelSnapshot.test.ts`, `tests/tacticalSlots.test.ts` | modify (Task 2) | the held-W tests become throttle tests; the re-measured numbers |
| `tests/duelInputMerge.test.ts`, `tests/duelRuntime.test.ts`, `tests/onlineDuelSession.test.ts`, `tests/duelOnlineView.test.ts` | modify (Task 3) | keyboard, runtime and online tests |
| `tests/uiConsole.test.tsx`, `tests/duelConsoleModel.test.ts` | modify (Tasks 3, 4) | the Helm block and its clicks |

---

### Task 1: The helm module, the throttle command and the wire; SIM_VERSION 42 → 43 alone, blessed

**Files:**
- Create: `src/renderer/src/sim/duel/throttle.ts`, `tests/duelThrottle.test.ts`
- Modify: `src/renderer/src/sim/duel/state.ts:35-53, 56-61, 82` (DuelState, the createDuel doc, the return), `src/renderer/src/sim/duel/modules.ts:1-4, 41-46, 77-84` (header, after ROUND, DUEL_MODULES), `src/renderer/src/sim/duel/step.ts:15-20, 28, 127-141, 178-179`, `src/renderer/src/sim/duel/snapshot.ts:1-3, 21-25, 128, 145, 151`, `src/renderer/src/net/contracts.ts:69-79`, `src/renderer/src/net/codec.ts:108-121`, `src/renderer/src/sim/tuning.ts:7`, `scripts/golden/duelOracle.ts:105-107`
- Test updates: `tests/duelModules.test.ts:9, 40, 62, 90, 127, 133, 143`, `tests/duelCheckpoint.test.ts:138-139`, `tests/duelSnapshot.test.ts:104`, `tests/duel.test.ts:41`
- Regenerated by `npm run bless`: `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`

**Interfaces:**
- Consumes: `scalar`, `ModuleField`, `SimModule`, `moduleLength` (`sim/module.ts:28, 45`); `attendant` (local in `step.ts:45`); `aliasPlan`, `duelSchema`, `MIGRATIONS` (`scripts/golden/duelOracle.ts:85, 111, 136`); `duelCodec` (`net/codec.ts:227`); `hashF64` (`src/shared/hash`).
- Produces:
  ```ts
  // sim/duel/throttle.ts
  export const THROTTLE_MIN = -1;
  export const THROTTLE_MAX = 4;
  export function validThrottle(level: unknown): boolean;
  export function throttleThrust(level: number): number;
  export function clampThrottle(level: number): number;
  // sim/duel/state.ts: DuelState gains  throttle: number
  // sim/duel/modules.ts
  export const helmModule: SimModule<DuelState>;   // id 'helm', fields ['throttle'], commands ['throttle']
  // net/contracts.ts: DuelCommand gains  | { kind: 'throttle'; level: number }
  // scripts/golden/duelOracle.ts: MIGRATIONS[42]
  ```

- [ ] **Step 1: Record both baselines at SIM_VERSION 42, before anything changes**

Check: `git grep -n "SIM_VERSION = " -- src/renderer/src/sim/tuning.ts` reads `export const SIM_VERSION = 42;`.

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 42: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs; written to <temp>\trace.json`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `duel oracle baseline at sim version 42: 21 runs, <T> ticks, 319 named fields per tick; written to <temp>\duel-oracle.json`, exit 0. Note `<T>` for Step 9.

- [ ] **Step 2: Write the failing test**

Create `tests/duelThrottle.test.ts`:

```ts
// Artemis-ii (spec 2026-11-17-artemis-consoles §5.1, §5.2, §5.6): the helm module's throttle, its command and wire, its
// snapshot bounds and the 42 → 43 alias table. Task 2 adds the flight (§5.3).
import { describe, expect, it } from 'vitest';
import { hashF64 } from '../src/shared/hash';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { DUEL_MODULES, helmModule } from '../src/renderer/src/sim/duel/modules';
import { moduleLength, type SimModule } from '../src/renderer/src/sim/module';
import { loadDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { clampThrottle, THROTTLE_MAX, THROTTLE_MIN, throttleThrust, validThrottle } from '../src/renderer/src/sim/duel/throttle';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { aliasPlan, duelSchema, MIGRATIONS } from '../scripts/golden/duelOracle';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope =>
  ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = [], held: HeldInput[] = [NONE, NONE]) => stepDuelTick(d, { held, commands });
const throttle = (level: number): DuelCommand => ({ kind: 'throttle', level });
/** The flattened offset of helm.throttle: after SIM_VERSION and every module before helm. */
function helmOffset(d: DuelState): number {
  let at = 1;
  for (const { module, state } of DUEL_MODULES) { if (module.id === 'helm') return at; at += moduleLength(module as SimModule<unknown>, state(d)); }
  throw new Error('no helm module');
}
// createDuel seats player 0 at the Helm (nav) and player 1 at Weapons.

describe('the throttle levels (Artemis spec §5.1, §5.3)', () => {
  it('are the integers −1..4; thrust is −1 for reverse and a quarter a notch forward; clamping rounds into range', () => {
    expect([THROTTLE_MIN, THROTTLE_MAX]).toEqual([-1, 4]);
    expect([-1, 0, 1, 2, 3, 4].map((v) => validThrottle(v))).toEqual(Array(6).fill(true));
    expect([-2, 5, 0.5, NaN, Infinity, '2', null].map((v) => validThrottle(v))).toEqual(Array(7).fill(false));
    expect([-1, 0, 1, 2, 3, 4].map(throttleThrust)).toEqual([-1, 0, 0.25, 0.5, 0.75, 1]);
    expect([-5, -1, 0, 2.4, 9, NaN, -0.2].map(clampThrottle)).toEqual([-1, -1, 0, 2, 4, 0, 0]);
    expect(Object.is(clampThrottle(-0.2), 0)).toBe(true);
  });
});

describe('the helm module (Artemis spec §5.1)', () => {
  it('sits after round and before interior, owns throttle, and its field moves the duel hash', () => {
    expect(DUEL_MODULES.map(({ module }) => module.id)).toEqual(['space', 'ship', 'presence', 'repair', 'round', 'helm', 'interior']);
    expect([helmModule.commands, helmModule.reasons]).toEqual([['throttle'], ['invalid-seat', 'malformed', 'stale-tick']]);
    const d = createDuel(CUTTER, 5);
    try {
      expect(d.throttle).toBe(0);
      const base = hashDuel(d);
      d.throttle = 2; expect(hashDuel(d)).not.toBe(base);
      d.throttle = 0; expect(hashDuel(d)).toBe(base);
    } finally { disposeDuel(d); }
  });
});

describe('the throttle command (Artemis spec §5.2)', () => {
  it('admits in order: stale-tick, then invalid-seat, then malformed, then noop, else applied', () => {
    const d = createDuel(CUTTER, 5);
    try {
      const r = step(d, [
        cmd(d, 1, throttle(9), d.interior.tick + 1),   // stale comes before the seat
        cmd(d, 1, throttle(9)),                        // Weapons is not the Helm: the seat comes before malformed
        cmd(d, 0, throttle(5)), cmd(d, 0, throttle(-2)), cmd(d, 0, throttle(0.5)), cmd(d, 0, throttle(NaN)),
        cmd(d, 0, throttle(0)),                        // already at 0
        cmd(d, 0, throttle(3))
      ]);
      expect(r.map((x) => [x.id.player, x.reason ?? x.status])).toEqual([
        [0, 'malformed'], [0, 'malformed'], [0, 'malformed'], [0, 'malformed'], [0, 'noop'], [0, 'applied'], [1, 'stale-tick'], [1, 'invalid-seat']
      ]);
      expect(d.throttle).toBe(3);
    } finally { disposeDuel(d); }
  });
  it('envelope order holds within a tick and the last applied level wins; a repeat of the new level is noop', () => {
    const d = createDuel(CUTTER, 5);
    try {
      expect(step(d, [cmd(d, 0, throttle(2)), cmd(d, 0, throttle(4)), cmd(d, 0, throttle(4))]).map((x) => x.status)).toEqual(['applied', 'applied', 'noop']);
      expect(d.throttle).toBe(4);
    } finally { disposeDuel(d); }
  });
  it('only the present Helm attendant may set it: an away Helm player and an empty Helm are invalid-seat', () => {
    const d = createDuel(CUTTER, 5);
    try {
      step(d, [cmd(d, 0, { kind: 'presence', present: false })]);
      expect(step(d, [cmd(d, 0, throttle(2))])[0]).toMatchObject({ status: 'rejected', reason: 'invalid-seat' });
      step(d, [cmd(d, 0, { kind: 'presence', present: true })]);
      expect(step(d, [cmd(d, 0, { kind: 'stand' })])[0]!.status).toBe('applied');
      expect(step(d, [cmd(d, 0, throttle(2))])[0]).toMatchObject({ status: 'rejected', reason: 'invalid-seat' });
      expect(d.throttle).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('is kept across stand and sit, answered duel-decided on the end card, and reset to 0 by a new round', () => {
    const d = createDuel(CUTTER, 5);
    try {
      step(d, [cmd(d, 0, throttle(3))]);
      expect(step(d, [cmd(d, 0, { kind: 'stand' })])[0]!.status).toBe('applied');
      expect(d.throttle).toBe(3);
      expect(step(d, [cmd(d, 0, { kind: 'sit', station: d.nav })])[0]!.status).toBe('applied');
      expect(d.throttle).toBe(3);
      d.tactical.systems[1].hull = 0; step(d);   // the hunter is down: the round is decided
      expect(d.tactical.outcome).toBe(Outcome.CrewWins);
      expect(step(d, [cmd(d, 0, throttle(1))])[0]).toMatchObject({ status: 'rejected', reason: 'duel-decided' });
      expect(d.throttle).toBe(3);
      step(d, [cmd(d, 0, { kind: 'rematch' })]);
      expect([d.round, d.throttle]).toEqual([1, 0]);
    } finally { disposeDuel(d); }
  });
});

describe('the throttle on the wire (Artemis spec §5.2)', () => {
  it('the duel codec round-trips any finite level and refuses a missing, non-numeric or infinite one, or an extra key', () => {
    const codec = duelCodec(2), envelope = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const level of [-1, 0, 4, 0.5, 9]) expect(codec.decodeMessage(codec.encodeMessage(envelope({ kind: 'throttle', level })))).toEqual(envelope({ kind: 'throttle', level }));
    for (const bad of [{ kind: 'throttle' }, { kind: 'throttle', level: '2' }, { kind: 'throttle', level: Infinity }, { kind: 'throttle', level: 1, extra: 1 }])
      expect(() => codec.encodeMessage(envelope(bad)), JSON.stringify(bad)).toThrow();
  });
});

describe('the throttle in the snapshot (Artemis spec §5.1)', () => {
  it('round-trips mid-throttle and refuses a level that is not an integer in −1..4, even rehashed', () => {
    const d = createDuel(CUTTER, 5);
    try {
      step(d, [cmd(d, 0, throttle(-1))]);
      const snap = saveDuelSnapshot(d, DIGEST), at = helmOffset(d);
      expect(snap.values[at]).toBe(-1);
      const r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(snap)), DIGEST);
      try { expect([r.throttle, hashDuel(r)]).toEqual([-1, hashDuel(d)]); } finally { disposeDuel(r); }
      for (const bad of [7, 0.5, -2]) {
        const s = structuredClone(snap); s.values[at] = bad; s.header.hash = hashF64(Float64Array.from(s.values));
        expect(() => validateDuelSnapshot(CUTTER, s, DIGEST), `throttle ${bad}`).toThrow(new RegExp(`throttle ${bad} is invalid`));
      }
    } finally { disposeDuel(d); }
  });
});

describe('the 42 → 43 alias table (Artemis spec §5.6)', () => {
  it('declares helm.throttle added, after the round module, and maps every other field to itself', () => {
    const m = MIGRATIONS[42]!;
    expect(m.change).toBe('Artemis-ii: helm throttle');
    const d = createDuel(CUTTER, 1);
    try {
      const now = duelSchema(d), k = now.names.indexOf('helm.throttle');
      expect(k).toBe(now.names.indexOf('round.decidedTick') + 1);
      const oldNames = now.names.filter((_, i) => i !== k), oldCounts = now.counts.filter((_, i) => i !== k);
      expect(aliasPlan(oldNames, oldCounts, now.names, now.counts, m).problems).toEqual([]);
      expect(aliasPlan(oldNames, oldCounts, now.names, now.counts).problems).toEqual(['new field helm.throttle is neither mapped nor declared added']);
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/duelThrottle.test.ts`
Expected: FAIL. `../src/renderer/src/sim/duel/throttle` does not resolve.

- [ ] **Step 4: Create `src/renderer/src/sim/duel/throttle.ts`**

```ts
// The Helm's throttle levels (Artemis spec 2026-11-17-artemis-consoles §5): one pure place that the sim (admission, the
// snapshot bounds, the step's thrust, the scripted pair) and the app (W/S, the notch clicks, the drawn prediction)
// share. −1 is reverse, 0 stop, and 1 to 4 are 25, 50, 75 and 100 % forward.
export const THROTTLE_MIN = -1;
export const THROTTLE_MAX = 4;

/** A level the helm module holds: an integer in −1..4. */
export function validThrottle(level: unknown): boolean {
  return typeof level === 'number' && Number.isInteger(level) && level >= THROTTLE_MIN && level <= THROTTLE_MAX;
}

/** The thrust axis a level flies at (spec §5.3): −1 for reverse, a quarter a notch forward. */
export function throttleThrust(level: number): number { return level < 0 ? -1 : level / 4; }

/** The nearest level to `level`: rounded, then clamped to −1..4. NaN and −0 give 0. */
export function clampThrottle(level: number): number {
  return Math.max(THROTTLE_MIN, Math.min(THROTTLE_MAX, Math.round(level))) || 0;
}
```

- [ ] **Step 5: The state, the module, the step's admission**

`src/renderer/src/sim/duel/state.ts`: in `interface DuelState`, after the line `round: number; helmPlayer: 0 | 1; baseTick: number; decidedTick: number;` (L52), add:

```ts
  /** The helm module (Artemis spec §5.1): the Helm's throttle level, an integer −1..4 (sim/duel/throttle.ts). Kept
   *  across stand and sit; 0 in a fresh duel, so a new round starts at STOP. */
  throttle: number;
```

In `createDuel`'s doc comment (L56-61), change `Round 0, beginning on tick 0.` to `Round 0, beginning on tick 0, the throttle at STOP.`. Change the return (L82) to:

```ts
    return { interior, tactical, present: [true, true], repair: [0, 0, 0], points, nav, weapons, events: [], round: 0, helmPlayer, baseTick: 0, decidedTick: -1, throttle: 0 };
```

`src/renderer/src/sim/duel/modules.ts`: in the header comment (L1-4), change `presence, repair, round (H-2 spec §7) and the interior` to `presence, repair, round (H-2 spec §7), helm (Artemis-ii) and the interior`. After the `ROUND` array (ends L46), add:

```ts

/** The Helm's throttle (Artemis spec §5.1): one canonical level, set by the `throttle` command (sim/duel/step.ts). */
export const helmModule: SimModule<DuelState> = {
  id: 'helm',
  fields: () => HELM,
  notSnapshotted: {},
  commands: ['throttle'],
  reasons: ['invalid-seat', 'malformed', 'stale-tick']
};
const HELM: ModuleField<DuelState>[] = [scalar('throttle', (d) => d.throttle, (d, v) => { d.throttle = v; })];
```

In `DUEL_MODULES` (L77-84), after the `roundModule` line, add:

```ts
  { module: helmModule as SimModule<never>, state: (d) => d, path: '' },
```

`src/renderer/src/sim/duel/step.ts`: add `import { validThrottle } from './throttle';` after the `./seeds` import (L18). Change `DUEL_KINDS` (L28) to:

```ts
const DUEL_KINDS = ['sit', 'stand', 'presence', 'laserLock', 'laserCharge', 'missileLaunch', 'rematch', 'throttle'];
```

In `stepDuelTick`, replace the running result helper (L139-141) with:

```ts
  const result = (env: DuelEnvelope, reason?: DuelReason, status: DuelResult['status'] = 'applied'): void => {
    results.push(reason ? { id: env.id, tick, status: 'rejected', reason } : { id: env.id, tick, status });
  };
```

After the weapons loop's closing `}` (L178) and before `for (const e of input.commands) if (e.command.kind === 'rematch') result(e, 'duel-running');` (L179), insert:

```ts
  // The Helm's throttle (Artemis spec §5.2), against the seats as they now stand: stale, then the Helm attendant, then
  // the level, then noop. Envelope order holds and the last applied level wins.
  for (const e of input.commands) if (e.command.kind === 'throttle') {
    const level = e.command.level;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (helm < 0 || e.id.player !== helm) { result(e, 'invalid-seat'); continue; }
    if (!validThrottle(level)) { result(e, 'malformed'); continue; }
    if (level === d.throttle) { result(e, undefined, 'noop'); continue; }
    d.throttle = level; result(e);
  }
```

In the `stepDuelTick` doc comment (L127-135), change `tactical commands validated against the seats after the seat phase and folded into the crew's ShipInput;` to `tactical commands validated against the seats after the seat phase and folded into the crew's ShipInput; the Helm's throttle (Artemis spec §5.2);`.

- [ ] **Step 6: The snapshot bound**

`src/renderer/src/sim/duel/snapshot.ts`: in the header (L1-3), change `presence, repair, the round (H-2 spec §7), then the interior` to `presence, repair, the round (H-2 spec §7), the helm throttle (Artemis-ii), then the interior`. Add `import { validThrottle } from './throttle';` after `import { createDuel, disposeDuel, type DuelState } from './state';` (L25). Replace L128 with:

```ts
  const space = seed.spaceLength, roundAt = 1 + space + 2 + 3, helmAt = roundAt + 4, interiorAt = helmAt + 1;
```

Change L145 to:

```ts
  const [round, helm, base, decided] = values.slice(roundAt, helmAt) as [number, number, number, number];
```

After L151 (the decided-tick check), add:

```ts
  // The helm module (Artemis spec §5.1): the throttle, an integer level in −1..4.
  const level = values[helmAt]!;
  if (!validThrottle(level)) throw new Error(`duel snapshot throttle ${level} is invalid`);
```

`duelRoundOf` (L93-96) is unchanged: the round module still starts at `1 + spaceLength + 2 + 3`.

- [ ] **Step 7: The wire, the version and the alias table**

`src/renderer/src/net/contracts.ts`: in `DuelCommand`, after `| { kind: 'missileLaunch' }` (L76), add:

```ts
  /** The Helm's throttle (Artemis spec §5.2): an integer level −1..4. Any finite number passes the codec, and the sim
   *  answers a bad one malformed. */
  | { kind: 'throttle'; level: number }
```

`src/renderer/src/net/codec.ts`: in `duelWire.commands` (L111-121), after `z.object({ kind: z.literal('missileLaunch') }).strict(),` add:

```ts
      z.object({ kind: z.literal('throttle'), level: z.number().finite() }).strict(),
```

Change the comment above `duelWire` (L108-109) to end `H-2 adds \`rematch\` and the \`round\` event; Artemis-ii adds \`throttle\`. */`.

`src/renderer/src/sim/tuning.ts` L7: `export const SIM_VERSION = 43;`

`scripts/golden/duelOracle.ts`: replace L105-107 (the H-2 doc comment, the `38:` entry line and the closing `};`) with:

```ts
  /** H-2 (38 → 39): the round module joins after repair; no 38 oracle run sends rematch or a non-default helmPlayer. */
  38: { change: 'H-2: duel rounds', rename: () => undefined, derived: [], added: [/^round\.(round|helmPlayer|baseTick|decidedTick)$/] },
  /** Artemis-ii (42 → 43): the helm module joins after round; no 42 oracle run sends throttle, so it stays 0. */
  42: { change: 'Artemis-ii: helm throttle', rename: () => undefined, derived: [], added: [/^helm\.throttle$/] }
};
```

- [ ] **Step 8: The existing tests that name every module, kind and offset**

`tests/duel.test.ts` L41: the sorted key list of `createDuel(...)` gains `'throttle'` between `'tactical'` and `'weapons'`.

`tests/duelModules.test.ts`:
- L9: add `helmModule` to the import list: `import { DUEL_MODULES, DUEL_NOT_SNAPSHOTTED, helmModule, interiorModule, presenceModule, repairModule, roundModule } from '../src/renderer/src/sim/duel/modules';`
- L40: `const duelNames = (d: DuelState) => new Set([presenceModule, repairModule, roundModule, helmModule, interiorModule].flatMap((m) => [...names(m, d)]));`
- L62: rename the test to `'every DuelState member is a presence, repair, round, helm or interior field, the tactical modules\' state, or declared'`.
- L90: `for (const [m, s] of [[spaceModule, d.tactical], [shipModule, d.tactical], [presenceModule, d], [repairModule, d], [helmModule, d], [interiorModule, d]] as const)`
- L127: rename to `'flatten is the modules in canonical order after SIM_VERSION: space, ship, presence, repair, round, helm, interior'`.
- L133: `..., d.round, d.helmPlayer, d.baseTick, d.decidedTick, d.throttle, ...flatten(d.interior)]);`
- L143: `expect(kinds).toEqual(['laserCharge', 'laserLock', 'missileLaunch', 'presence', 'rematch', 'sit', 'stand', 'throttle']);`

`tests/duelCheckpoint.test.ts` L139: add a throttle example, so that the line reads:

```ts
      laserLock: { kind: 'laserLock', room: 1 }, laserCharge: { kind: 'laserCharge', held: true }, missileLaunch: { kind: 'missileLaunch' }, rematch: { kind: 'rematch' }, throttle: { kind: 'throttle', level: 2 } };
```

`tests/duelSnapshot.test.ts` L104:

```ts
      const interiorAt = at + 5 + 4 + 1, fieldsAt = interiorAt;   // after presence, repair, the round module (H-2) and the helm module (Artemis-ii)
```

- [ ] **Step 9: Run the targeted tests and the typecheck (the goldens still read 42)**

Run: `npx vitest run tests/duelThrottle.test.ts tests/duelModules.test.ts tests/duelCheckpoint.test.ts tests/duelSnapshot.test.ts tests/duel.test.ts tests/duelRounds.test.ts tests/codecModeWire.test.ts tests/duelScripted.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 10: Both proofs before the bless**

Run: `npx tsx scripts/golden/canonical-trace.ts check`
Expected: `per-tick canonical trace identical, sim version 42 → 43: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs (baseline HEAD <sha>)`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts check`
Expected: `duel oracle: 21 runs, <T> ticks, 319 named fields, results, events and telemetry identical at every tick through the 42 → 43 alias table (Artemis-ii: helm throttle), sim version 42 → 43 (baseline HEAD <sha>)`, exit 0. `<T>` is Step 1's count. Any failure here means step 1 changed the gameplay. Find it and fix it. Never bless past a failing oracle.

- [ ] **Step 11: Bless (the guard re-runs both proofs), then check the sector golden**

Run: `npm run bless`
Expected, exit 0 (the hashes are new):
```
blessed tests/golden/basic.json: 120 checkpoints, final <hex>
blessed tests/golden/duel-1.json: 27 checkpoints, 16268 ticks, outcome 1, final <hex>
blessed tests/fixtures/determinism-v2.json: sim version 42 → 43, <n> samples and <m> boundaries unchanged apart from the version and hashes
blessed tests/golden/duel-rematch.json: 61 checkpoints, rematch on tick 16268, rounds 16268 ticks outcome 1 then 20903 ticks outcome 1, final <hex>
```

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0.

- [ ] **Step 12: The duel suites and the full suite at SIM_VERSION 43**

Run: `npx vitest run tests/duelThrottle.test.ts tests/duelGolden.test.ts tests/duelRematchGolden.test.ts tests/duelGates.test.ts tests/duelOracle.test.ts tests/golden.test.ts tests/tacticalSlots.test.ts tests/duelCheckpoint.test.ts`
Expected: PASS. Every pinned scripted number is unchanged at this step.

Run: `npx vitest run --maxWorkers=4`
Expected: PASS, every file.

- [ ] **Step 13: Commit**

```bash
git add src/renderer/src/sim/duel/throttle.ts src/renderer/src/sim/duel/state.ts src/renderer/src/sim/duel/modules.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/snapshot.ts src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/sim/tuning.ts scripts/golden/duelOracle.ts tests/duelThrottle.test.ts tests/duelModules.test.ts tests/duelCheckpoint.test.ts tests/duelSnapshot.test.ts tests/duel.test.ts tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/fixtures/determinism-v2.json
git commit -m "chore(artemis-ii): SIM_VERSION 42 -> 43 alone with the helm module, the throttle command and its wire, blessed (canonical trace and duel oracle prove every run unchanged per tick)"
```

End the commit message with a blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Use the same footer on every commit in this plan.

---

### Task 2: The gameplay change: quarter thrust, the throttle flies the ship, the scripted pair and telemetry; a same-version bless at 43

**Files:**
- Modify: `src/renderer/src/sim/tactical/physics.ts:27-52`, `src/renderer/src/sim/tactical/state.ts:95`, `src/renderer/src/sim/duel/step.ts:18-19, 181`, `src/renderer/src/sim/duel/scripted.ts:20-23, 57-58, 94-97, 291-295`, `src/renderer/src/sim/duel/telemetry.ts:14, 126-130`
- Test: append to `tests/duelThrottle.test.ts`; modify `tests/tacticalFlight.test.ts:134-148`, `tests/duel.test.ts:77-87`, `tests/duelScripted.test.ts:47, 50-51, 80`; append to `tests/duelTelemetry.test.ts`
- Re-measured pins: `tests/duelCheckpoint.test.ts:21, 24, 55-56`, `tests/duelModules.test.ts:79, 81`, `tests/duelSnapshot.test.ts:68, 74`, `tests/tacticalSlots.test.ts:154`
- Regenerated by `npm run bless`: the pinned files that it rewrites

**Interfaces:**
- Consumes: `throttleThrust`, `THROTTLE_MIN`, `THROTTLE_MAX` (Task 1); `predictPath` (`sim/tactical/predict.ts:22`); `engineFactor`, `gravityAccel`, `edgeAccel`, `flyShip` (`sim/tactical/physics.ts`); `hx`, `hy`, `wrapHeading` (`sim/tactical/direction.ts`); `CUTTER_CLASS`, `HUNTER_CLASS`, `ShipClassDef` (`sim/tactical/defs.ts`); `DEFAULT_FLIGHT`, `DT`, `THRUST`, `FlightTuning` (`sim/tactical/tuning.ts`).
- Produces: no new exports. Behaviour: `flyShip` quarter thrust; the duel's crew thrust comes from `d.throttle`; the scripted pair sends `throttle`.

- [ ] **Step 1: A sector baseline at 43, to prove the sector is untouched**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 43: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs; written to <temp>\trace.json`, exit 0.

- [ ] **Step 2: Write the failing tests**

In `tests/duelThrottle.test.ts`, add these imports to the top import block:

```ts
import { predictPath } from '../src/renderer/src/sim/tactical/predict';
import { edgeAccel, engineFactor, flyShip, gravityAccel } from '../src/renderer/src/sim/tactical/physics';
import { hx, hy, wrapHeading } from '../src/renderer/src/sim/tactical/direction';
import { CUTTER_CLASS, HUNTER_CLASS, type ShipClassDef } from '../src/renderer/src/sim/tactical/defs';
import { createTacticalState, type Axes, type Ship } from '../src/renderer/src/sim/tactical/state';
import { DEFAULT_FLIGHT, DT, THRUST, type FlightTuning } from '../src/renderer/src/sim/tactical/tuning';
```

Merge the `state` import with the existing `Outcome` import into one line: `import { createTacticalState, Outcome, type Axes, type Ship } from '../src/renderer/src/sim/tactical/state';`. Then append:

```ts
/** flyShip as it was at SIM_VERSION 42: both axes quantised by sign. A frozen reference, never to be changed. */
function flyShipBySign(s: Ship, axes: Axes, tuning: FlightTuning, engines = 0, cls: ShipClassDef = CUTTER_CLASS): void {
  const turn = Math.sign(axes.turn) || 0, thrust = Math.sign(axes.thrust) || 0;
  const f = engineFactor(cls, engines);
  s.headingAcc += turn * cls.turnStepsPerTick * f;
  while (s.headingAcc >= 1) { s.heading = wrapHeading(s.heading + 1); s.headingAcc -= 1; }
  while (s.headingAcc <= -1) { s.heading = wrapHeading(s.heading - 1); s.headingAcc += 1; }
  const h0 = hx(s.heading), h1 = hy(s.heading);
  const idle = turn === 0 && thrust === 0, px = -h1, py = h0;
  if (idle && !s.released) { const side = s.vx * px + s.vy * py; s.skidBudget = Math.abs(side); s.skidSign = Math.sign(side); }
  if (!idle) { s.skidBudget = 0; s.skidSign = 0; }
  s.released = idle;
  if (idle && s.skidBudget > 0 && tuning.stabilise > 0) {
    const cut = Math.min(s.skidBudget, tuning.stabilise * DT);
    s.vx -= s.skidSign * cut * px; s.vy -= s.skidSign * cut * py; s.skidBudget -= cut;
  }
  let ax = 0, ay = 0;
  if (tuning.gravity) { const [gx, gy] = gravityAccel(s.x, s.y); ax += gx; ay += gy; }
  if (tuning.edge) { const [ex, ey] = edgeAccel(s.x, s.y); ax += ex; ay += ey; }
  if (thrust > 0) { ax += h0 * cls.thrust * f; ay += h1 * cls.thrust * f; }
  else if (thrust < 0) { ax -= h0 * cls.thrust * cls.reverseFraction * f; ay -= h1 * cls.thrust * cls.reverseFraction * f; }
  s.vx += ax * DT; s.vy += ay * DT;
  const keep = 1 - tuning.drag * DT;
  s.vx *= keep; s.vy *= keep;
  s.skidBudget *= keep;
  s.x += s.vx * DT; s.y += s.vy * DT;
}

describe('quarter-thrust flight (Artemis spec §5.3)', () => {
  const start = (): Ship => ({ ...createTacticalState(3).ships[0], x: 900, y: -400, vx: 30, vy: 60, heading: 40, headingAcc: 0.25 });
  it('whole axes (the hunter, levels 4 and −1, the flight view) fly exactly as the sign-quantised flight did, for every class and Engines level', () => {
    for (const cls of [CUTTER_CLASS, HUNTER_CLASS]) for (const engines of [0, 1, 2]) for (const turn of [-1, 0, 1]) for (const thrust of [-1, 0, 1]) {
      const a = start(), b = start();
      for (let t = 0; t < 120; t++) { flyShip(a, { turn, thrust }, DEFAULT_FLIGHT, engines, cls); flyShipBySign(b, { turn, thrust }, DEFAULT_FLIGHT, engines, cls); }
      expect(a, `${cls.id} engines ${engines} turn ${turn} thrust ${thrust}`).toEqual(b);
    }
  });
  it('thrust is quantised to quarters: 0.5 is half the forward push, 0.3 flies as 0.25, 0.1 as none; any reverse is full reverse', () => {
    const NO_FIELD: FlightTuning = { gravity: false, edge: false, drag: 0, stabilise: DEFAULT_FLIGHT.stabilise };
    const push = (thrust: number): number => {
      const s: Ship = { ...createTacticalState(1).ships[0], x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0 };
      flyShip(s, { turn: 0, thrust }, NO_FIELD);
      return s.vy;
    };
    expect(push(1)).toBeCloseTo(-THRUST * DT, 12);
    expect(push(0.5)).toBeCloseTo(-0.5 * THRUST * DT, 12);
    expect(push(0.75)).toBeCloseTo(-0.75 * THRUST * DT, 12);
    expect(push(0.3)).toBe(push(0.25)); expect(push(0.9)).toBe(push(1)); expect(push(0.1)).toBe(push(0));
    expect(push(-0.25)).toBe(push(-1)); expect(push(-1)).toBeCloseTo(0.4 * THRUST * DT, 12);
    expect(push(NaN)).toBe(push(0));
  });
});

describe('the throttle flies the duel (Artemis spec §5.3)', () => {
  it('levels 4, 2 and −1 fly the held-thrust path 1, 0.5 and −1 tick for tick while the Helm is crewed', () => {
    for (const [level, thrust] of [[4, 1], [2, 0.5], [-1, -1]] as const) {
      const d = createDuel(CUTTER, 5);
      try {
        const path = predictPath(d.tactical, 0, { turn: 0, thrust }, 60, 1), s = d.tactical.ships[0];
        expect(path).toHaveLength(60);
        step(d, [cmd(d, 0, throttle(level))]);
        for (let k = 0; k < 60; k++) {
          if (k > 0) step(d);
          expect([level, k, s.x, s.y]).toEqual([level, k, path[k]!.x, path[k]!.y]);
        }
        expect([s.planetHits, s.asteroidHits, s.shipHits]).toEqual([0, 0, 0]);
      } finally { disposeDuel(d); }
    }
  });
  it('held W no longer thrusts; an empty Helm coasts and keeps its level, and the next pilot flies at it', () => {
    const d = createDuel(CUTTER, 5), coast = createDuel(CUTTER, 5);
    try {
      step(d, [], [{ moveX: 0, moveY: -1, interactHeld: false }, NONE]); step(coast);
      expect([d.tactical.ships[0].vx, d.tactical.ships[0].vy]).toEqual([coast.tactical.ships[0].vx, coast.tactical.ships[0].vy]);
      step(d, [cmd(d, 0, throttle(4))]);
      const s = d.tactical.ships[0], drift = predictPath(d.tactical, 0, { turn: 0, thrust: 0 }, 30, 1);
      expect(step(d, [cmd(d, 0, { kind: 'stand' })])[0]!.status).toBe('applied');
      for (let k = 0; k < 30; k++) { if (k > 0) step(d); expect([k, s.x, s.y]).toEqual([k, drift[k]!.x, drift[k]!.y]); }
      expect(d.throttle).toBe(4);
      const resume = predictPath(d.tactical, 0, { turn: 0, thrust: 1 }, 1, 1);
      expect(step(d, [cmd(d, 0, { kind: 'sit', station: d.nav })])[0]!.status).toBe('applied');
      expect([s.x, s.y]).toEqual([resume[0]!.x, resume[0]!.y]);
    } finally { disposeDuel(d); disposeDuel(coast); }
  });
});
```

Append to `tests/duelTelemetry.test.ts` (after its last `});`). It uses that file's `layout`, `cmd`, `step`, `createDuel`, `createTelemetry`, `BAIT_WINDOW_TICKS` and `SHIP_RADIUS`, which it already imports:

```ts

describe('a set throttle is a manoeuvre (Artemis spec §5.3)', () => {
  it('an enemy planet contact while the throttle is set counts as a bait; with the throttle back at STOP for the window it does not', () => {
    const bait = (levels: number[], wait: number): number => {
      const d = createDuel(layout, 5), t = createTelemetry(d), [s, e] = d.tactical.ships, p = d.tactical.map.planet;
      e.x = s.x + 500; e.y = s.y; e.vx = s.vx; e.vy = s.vy;                  // within 900 of the crew, far from the planet
      for (const level of levels) step(d, t, [cmd(d, 0, { kind: 'throttle', level })]);
      for (let k = 0; k < wait; k++) step(d, t);
      e.x = p.x - p.r - SHIP_RADIUS + 5; e.y = p.y; e.vx = 10; e.vy = 0;     // into the planet's far side
      step(d, t);
      expect(t.ships[1].planetContacts).toBe(1);
      return t.baits;
    };
    expect(bait([2], 0)).toBe(1);
    expect(bait([2, 0], BAIT_WINDOW_TICKS)).toBe(0);
  });
});
```

In `tests/tacticalFlight.test.ts`, replace the `describe('held axes are quantised by sign (Helm H-0a final review)', ...)` block's title and its `'an analog thrust gives the same velocity as full thrust'` test (L134 and L143-148) with:

```ts
describe('held axes are quantised: the turn by sign, the thrust to quarters (Helm H-0a final review; Artemis spec §5.3)', () => {
```

```ts
  it('an analog thrust flies as its nearest quarter, and any reverse as full reverse', () => {
    const fly = (thrust: number): Ship => { const s = ship({}); flyShip(s, { turn: 0, thrust }, FLIGHT_NO_FIELD); return s; };
    for (const [a, q] of [[0.3, 0.25], [0.6, 0.5], [0.9, 1], [-0.3, -1]] as const) {
      const x = fly(a), y = fly(q);
      expect([a, x.vx, x.vy]).toEqual([a, y.vx, y.vy]);
    }
  });
```

In `tests/duel.test.ts`, replace the test `'the Helm player’s held axes fly the ship: moveX +1 turns clockwise, W (moveY −1) thrusts along the nose'` (L77-87) with:

```ts
  it('the Helm player’s held moveX turns the ship clockwise and the throttle thrusts along the nose; held W does not (Artemis spec §5.3)', () => {
    const d = createDuel(layout, 5), s = d.tactical.ships[0], h0 = s.heading;
    step(d, [], [{ moveX: 1, moveY: 0, interactHeld: false }, NONE]);
    expect(s.heading).toBe((h0 + 1) % 256);                              // 1.78 steps per tick: one whole step on the first tick
    const coast = createDuel(layout, 5), thrust = createDuel(layout, 5), held = createDuel(layout, 5);
    step(coast); step(thrust, [cmd(thrust, 0, { kind: 'throttle', level: 4 })]); step(held, [], [{ moveX: 0, moveY: -1, interactHeld: false }, NONE]);
    const [a, b, w] = [coast.tactical.ships[0], thrust.tactical.ships[0], held.tactical.ships[0]];
    const dx = b.vx - a.vx, dy = b.vy - a.vy;                           // the velocity full throttle added this tick
    expect(dx * hx(b.heading) + dy * hy(b.heading)).toBeGreaterThan(0.99 * Math.hypot(dx, dy));
    expect(Math.hypot(dx, dy)).toBeGreaterThan(1.9);                     // about THRUST · dt = 2 u/s
    expect([w.vx, w.vy]).toEqual([a.vx, a.vy]);                         // held W coasts
    for (const x of [d, coast, thrust, held]) disposeDuel(x);
  });
```

In `tests/duelScripted.test.ts`, replace L50-51 (`const input = scriptedInput(pair, d);` and the `held[0]` expectation) with:

```ts
    const input = scriptedInput(pair, d);
    expect(input.held[0]).toEqual({ moveX: 1, moveY: 0, interactHeld: false });   // dead astern of the away direction: clockwise
    expect(input.commands.filter((e) => e.id.player === 0).map((e) => e.command)).toEqual([{ kind: 'throttle', level: 4 }]);   // and full throttle
```

Rename that test (L47) to `'the Helm turns away from the planet and sets full throttle when its predicted path meets it'`. Change L80 to:

```ts
    expect([...kinds].sort()).toEqual(['laserCharge', 'laserLock', 'missileLaunch', 'sit', 'stand', 'throttle']);
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/duelThrottle.test.ts tests/duelTelemetry.test.ts tests/tacticalFlight.test.ts tests/duel.test.ts tests/duelScripted.test.ts`
Expected: FAIL. These fail: `push(0.5)` gives the full push; the level 2 path is off; held W still thrusts; the scripted Helm sends no throttle; the throttle bait is 0. The frozen-copy test already passes.

- [ ] **Step 4: Quarter-thrust physics**

`src/renderer/src/sim/tactical/physics.ts`, in `flyShip`, replace L30-31 with:

```ts
  // Quantise the held axes (Artemis spec §5.3): the turn by sign, the thrust to quarters, so q is one of −1, −¾ … 1.
  // `|| 0` maps NaN and −0 to 0. Whole axes (the hunter, the flight view, levels 4 and −1) fly exactly as before.
  const turn = Math.sign(axes.turn) || 0, q = (Math.max(-4, Math.min(4, Math.round(axes.thrust * 4))) || 0) / 4;
```

Replace L40 `const idle = turn === 0 && thrust === 0, px = -h1, py = h0;` with `const idle = turn === 0 && q === 0, px = -h1, py = h0;`. Replace L51-52 with:

```ts
  if (q > 0) { const push = q * cls.thrust; ax += h0 * push * f; ay += h1 * push * f; }   // q = 1: push is cls.thrust exactly
  else if (q < 0) { ax -= h0 * cls.thrust * cls.reverseFraction * f; ay -= h1 * cls.thrust * cls.reverseFraction * f; }   // any reverse is full reverse
```

`src/renderer/src/sim/tactical/state.ts` L95: change the `Axes` comment to `/** Held axes for one ship: turn (+ clockwise) and thrust (+ forward). flyShip quantises the turn by sign and the thrust to quarters (NaN counts as 0; Artemis spec §5.3). */`.

- [ ] **Step 5: The step flies the throttle**

`src/renderer/src/sim/duel/step.ts`: change the throttle import to `import { throttleThrust, validThrottle } from './throttle';`. Replace L181:

```ts
  if (helm >= 0) crew.axes = { turn: (input.held[helm] ?? NO_HELD).moveX, thrust: throttleThrust(d.throttle) };   // Artemis spec §5.3: held moveX turns, the throttle thrusts; held moveY no longer does
```

- [ ] **Step 6: The scripted pair sets the throttle**

`src/renderer/src/sim/duel/scripted.ts`: after `import type { DuelInput } from './step';` (L24), add `import { THROTTLE_MAX, THROTTLE_MIN, throttleThrust } from './throttle';`. Change the `axes` doc (L57) to `/** The Helm's axes on the tick before. The avoidance prediction holds their turn, and flies the throttle's thrust. */`. Replace L94-97 (the `helmAxes` doc comment and its first two lines) with:

```ts
/** The Helm's axes (spec §3): avoid, then line up, then orbit. The hazard check predicts with the thrust the ship flies
 *  at this tick before any new command: the throttle's (Artemis spec §5.5). */
function helmAxes(pair: ScriptedPair, d: DuelState): Axes {
  const t = d.tactical, s = t.ships[0], e = t.ships[targetOf(t, 0)]!;
  const away = hazardAway(d, { turn: pair.axes.turn, thrust: throttleThrust(d.throttle) });
```

Replace the `if (seat === d.nav) { ... }` branch in `scriptedInput` (L291-295) with:

```ts
    if (seat === d.nav) {
      const axes = helmAxes(pair, d);
      pair.axes = axes;
      // Artemis spec §5.5: the throttle stands for the wanted thrust (1 → 4, 0 → 0, −1 → −1), sent only when it changes.
      const level = axes.thrust > 0 ? THROTTLE_MAX : axes.thrust < 0 ? THROTTLE_MIN : 0;
      if (level !== d.throttle) cmds[pid]!.push({ kind: 'throttle', level });
      held[pid] = { moveX: axes.turn, moveY: 0, interactHeld: false };
    } else if (seat === d.weapons) {
```

The `else if (seat === d.weapons)` line and everything after it stay as they are.

- [ ] **Step 7: Telemetry's manoeuvre rule**

`src/renderer/src/sim/duel/telemetry.ts`: change the comment at L14 to `/** A crew manoeuvre (the Helm turns, or its throttle is set: Artemis spec §5.3) counts toward a bait for this many ticks (spec §4). */`. Replace L126-130 with:

```ts
  const helm = attendant(d, d.nav);
  if (helm >= 0) {
    const turning = (input.held[helm]?.moveX ?? 0) !== 0;   // Artemis spec §5.3: the Helm turns, or the throttle is not 0
    if ((turning || d.throttle !== 0) && dist(crew.x, crew.y, enemy.x, enemy.y) <= BAIT_RANGE) { m.tick = tick; m.x = enemy.x; m.y = enemy.y; }
  }
```

- [ ] **Step 8: Run the new tests and the typecheck**

Run: `npx vitest run tests/duelThrottle.test.ts tests/duelTelemetry.test.ts tests/tacticalFlight.test.ts tests/tacticalSoloFlight.test.ts tests/tacticalHunter.test.ts tests/disabledSystems.test.ts tests/duel.test.ts tests/duelScripted.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 9: The sector is untouched**

Run: `npx tsx scripts/golden/canonical-trace.ts same`
Expected: `per-tick canonical trace unchanged at sim version 43: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs (baseline HEAD <sha>)`, exit 0.

- [ ] **Step 10: The same-version bless (a deliberate gameplay change)**

Run: `npm run bless`
Expected: exit 0, with four `blessed ...` lines. The determinism line reads `sim version 43, <n> samples and <m> boundaries re-executed`.

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0. basic.json may differ only in its content digest.

Run: `git status --short tests/golden tests/fixtures`
Expected: `tests/golden/duel-1.json` and `tests/golden/duel-rematch.json` are modified. `tests/golden/basic.json` may be modified (the digest only). `tests/fixtures/determinism-v2.json` may be modified. Nothing else.

- [ ] **Step 11: Re-measure the scripted-run pins**

The duel-fire, duel-health and disable-systems merges re-pinned these by the same rule. Write this scratch script to `.tsout/artemis-ii-measure.ts`. `.tsout/` is git-ignored. Delete the script after this step.

```ts
// Scratch (Artemis-ii plan Task 2 Step 11): seed 7's first split tick from 5000 and the run's decision.
import { CUTTER } from '../tests/helpers/scriptedDuel';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { Outcome } from '../src/renderer/src/sim/tactical/state';

const d = createDuel(CUTTER, 7), pair = createScriptedPair(7);
let split = -1;
while (d.tactical.outcome === Outcome.Running) {
  stepDuelTick(d, scriptedInput(pair, d));
  const t = d.tactical;
  if (split < 0 && d.interior.tick >= 5000 && t.missiles.filter((m) => m.active).length === 1 && t.systems[0].rooms.some((r) => r > 0) && d.repair.some((r) => r > 0)) split = d.interior.tick;
}
console.log(`seed 7: split ${split}, decided on tick ${d.decidedTick}, outcome ${d.tactical.outcome}`);
disposeDuel(d);
```

Run: `npx tsx .tsout/artemis-ii-measure.ts`
Expected: `seed 7: split <S>, decided on tick <D>, outcome <o>`. If `<S>` is `-1`, no tick from 5000 has the three conditions. Stop and report: the tests need another seed or start tick, and that is a decision for the controller.

Then apply the new numbers:
- `tests/duelCheckpoint.test.ts` L24: `const SEED = 7, SPLIT = <S>;`. In L21's comment, put `<D>` first, then `(<old> before Artemis-ii, SIM_VERSION 43; ...)` before the existing history.
- `tests/duelModules.test.ts` L79 and L81: `played(7, <S>)` and `'seed 7 tick <S> has a missile in flight'`.
- `tests/duelSnapshot.test.ts` L68 and L74: `scriptedDuel(7, <S>)` and `'one missile in flight at seed 7 tick <S>'`. At L117, the round-module case `[2, 5157, /base tick/]` is the old split plus 1 (it throws only because it is past the header tick): replace `5157` with `<S + 1>`.
- `tests/tacticalSlots.test.ts` L154: `expect(ticks).toBe(<duel-1.json ticks>)`. Read the number with `node -e "console.log(require('./tests/golden/duel-1.json').ticks)"`. Extend the comment with `; 16268 before Artemis-ii`.
- Run `npx vitest run tests/duelCheckpoint.test.ts`. If its `toMatchObject` on the summary (L55-56) fails, copy the received `outcome`, `terminal` and the six counters from the failure diff into the expectation. The `console.log` line prints the same summary on a pass.

- [ ] **Step 12: The duel suites and the full suite**

Run: `npx vitest run tests/duelGolden.test.ts tests/duelRematchGolden.test.ts tests/duelGates.test.ts tests/duelOracle.test.ts tests/duelCheckpoint.test.ts tests/duelModules.test.ts tests/duelSnapshot.test.ts tests/tacticalSlots.test.ts tests/duelFire.test.ts tests/duelHealth.test.ts tests/duelRounds.test.ts`
Expected: PASS. **`tests/duelGates.test.ts` is a gate, not a pin.** If a seed now fails, or the median leaves 180 to 300 s, do not tune anything. Stop and report the failing line (`telemetryLine`) to the controller.

Run: `npx vitest run --maxWorkers=4`
Expected: PASS. The only test edits allowed here are the pins from Step 11. Any other failure is a defect in this task: find its cause.

- [ ] **Step 13: Commit**

Delete `.tsout/artemis-ii-measure.ts`. Then:

```bash
git add src/renderer/src/sim/tactical/physics.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/scripted.ts src/renderer/src/sim/duel/telemetry.ts tests/duelThrottle.test.ts tests/duelTelemetry.test.ts tests/tacticalFlight.test.ts tests/duel.test.ts tests/duelScripted.test.ts tests/duelCheckpoint.test.ts tests/duelModules.test.ts tests/duelSnapshot.test.ts tests/tacticalSlots.test.ts tests/golden/duel-1.json tests/golden/duel-rematch.json
git add tests/golden/basic.json tests/fixtures/determinism-v2.json
git commit -m "feat(artemis-ii): the Helm throttle flies the ship: quarter thrust, held moveY no longer thrusts, the scripted pair sets the throttle, a set throttle is a manoeuvre (spec §5.3, §5.5); goldens re-blessed at SIM_VERSION 43"
```

The second `git add` stages those two files only if bless rewrote them. It is harmless if it did not.

---

### Task 3: Keys, clicks and the two sources: W/S notches, `ConsoleInput.throttle`, the runtime and the online session

**Files:**
- Modify: `src/renderer/src/app/duel/input.ts:1-45, 54-107`, `src/renderer/src/ui/actions.ts:40-46`, `src/renderer/src/app/controlsList.ts:18-32, 42`, `src/renderer/src/app/duel/runtime.ts:11-27, 187-213, 215, 281-283, 296-299, 315, 332-333, 356-415`, `src/renderer/src/app/duel/onlineDuel.ts:13, 28, 85-87, 112-116, 160-163, 170-177, 201-202, 240`, `src/renderer/src/app/duel/onlineSource.ts:9, 18, 83, 113-116, 134, 140`, `src/renderer/src/app/duel/scene.ts:33-61`
- Test: append to `tests/duelInputMerge.test.ts`, `tests/duelRuntime.test.ts`, `tests/onlineDuelSession.test.ts`, `tests/duelOnlineView.test.ts`; modify `tests/duelRuntime.test.ts:81`, `tests/onlineDuelSession.test.ts:7, 24-46`, `tests/uiConsole.test.tsx:32`

**Interfaces:**
- Consumes: `clampThrottle`, `throttleThrust` (Task 1); `CommandId` (`net/contracts.ts`); `client.command(player, command): CommandId | null` (`clientControl/duelClient.ts:53`); `client.takeResults(): CommandResult[]` (`clientControl/streamClient.ts:170`).
- Produces:
  ```ts
  // app/duel/input.ts
  export type KeyAction = ... | 'throttleUp' | 'throttleDown';   // KeyW, KeyS in PRESS_CODES
  export interface ConsoleInput { press(action: KeyAction): void; hold(code: HoldCode, on: boolean): void; lock(room: number): void; throttle(level: number): void }
  // KeySample gains  throttleTo?: number | null   (the last throttle(level) since the previous sample)
  export function throttleRequest(base: number, presses: Pick<Record<KeyAction, number>, 'throttleUp' | 'throttleDown'>, to: number | null | undefined): number | null;
  // app/duel/scene.ts: DuelViewSource gains  throttle(): number
  // app/duel/runtime.ts: DuelRuntime gains  throttle(): number
  // app/duel/onlineSource.ts: the source gains  throttle(): number;  throttleBase(level: number | null): void
  ```

- [ ] **Step 1: Write the failing tests**

Append to `tests/duelInputMerge.test.ts`, after adding `throttleRequest` to its import (`import { createDuelKeyboard, throttleRequest, type EventSource } from '../src/renderer/src/app/duel/input';`):

```ts

describe('the throttle keys and clicks (Artemis spec §5.4, §6.2)', () => {
  it('W and S are press edges (auto-repeat ignored) and still held keys', () => {
    const w = fakeWindow(), kb = createDuelKeyboard(w.target);
    w.down('KeyW'); w.down('KeyW', true); w.down('KeyW', true);
    let s = kb.sample(); expect([s.presses.throttleUp, s.presses.throttleDown, s.moveY]).toEqual([1, 0, -1]);
    w.up('KeyW'); w.down('KeyS');
    s = kb.sample(); expect([s.presses.throttleUp, s.presses.throttleDown, s.moveY]).toEqual([0, 1, 1]);
  });
  it('throttle(level) is last-wins for one sample, and clear and clearUi drop it', () => {
    const w = fakeWindow(), kb = createDuelKeyboard(w.target);
    kb.ui.throttle(2); kb.ui.throttle(4);
    expect(kb.sample().throttleTo).toBe(4); expect(kb.sample().throttleTo).toBeNull();
    kb.ui.throttle(1); kb.clearUi(); expect(kb.sample().throttleTo).toBeNull();
    kb.ui.throttle(1); kb.clear(); expect(kb.sample().throttleTo).toBeNull();
  });
  it('throttleRequest: a notch a press from the base, clamped at every step; a click wins; the base itself is no request', () => {
    const p = (throttleUp: number, throttleDown: number) => ({ throttleUp, throttleDown });
    expect(throttleRequest(0, p(1, 0), null)).toBe(1);
    expect(throttleRequest(3, p(3, 0), null)).toBe(4);
    expect(throttleRequest(0, p(0, 3), undefined)).toBe(-1);
    expect(throttleRequest(4, p(1, 0), null)).toBeNull();
    expect(throttleRequest(2, p(1, 1), null)).toBeNull();
    expect(throttleRequest(2, p(1, 0), 0)).toBe(0);
    expect(throttleRequest(2, p(0, 0), 2)).toBeNull();
    expect(throttleRequest(2, p(0, 0), 9)).toBe(4);
  });
});
```

In `tests/duelRuntime.test.ts`, change L81 `hold({ moveY: -1 }); tick();` to:

```ts
    hold({ moveY: -1 }); press('throttleUp', 'throttleUp', 'throttleUp', 'throttleUp'); tick();   // Artemis-ii: full throttle; held W no longer thrusts
```

Append to `tests/duelRuntime.test.ts`:

```ts

describe('the Helm throttle (Artemis spec §5.4)', () => {
  it('W and S step it a notch a press, clamped to −1..4, and it holds with no key down', () => {
    const { rt, press, tick, ticks } = rig();
    press('throttleUp'); tick();
    expect([rt.duel.throttle, rt.throttle(), rt.axes()]).toEqual([1, 1, { turn: 0, thrust: 0.25 }]);
    press('throttleUp', 'throttleUp', 'throttleUp', 'throttleUp'); tick();
    expect([rt.duel.throttle, rt.axes()]).toEqual([4, { turn: 0, thrust: 1 }]);
    ticks(10);
    expect(rt.duel.throttle).toBe(4);
    press('throttleDown'); tick();
    expect([rt.duel.throttle, rt.axes().thrust]).toEqual([3, 0.75]);
    for (let n = 0; n < 6; n++) { press('throttleDown'); tick(); }
    expect([rt.duel.throttle, rt.axes().thrust]).toEqual([-1, -1]);
    expect(rt.lastResults().some((r) => r.status === 'rejected')).toBe(false);
    rt.dispose();
  });
  it('two presses in two frames before one tick build on the queued level, not the confirmed one', () => {
    const { rt, press, tick } = rig();
    tick();
    press('throttleUp'); rt.frame(1 / 60); press('throttleUp'); rt.frame(1 / 60);
    expect([rt.duel.throttle, rt.throttle()]).toEqual([0, 2]);
    tick();
    expect([rt.duel.throttle, rt.throttle()]).toEqual([2, 2]);
    rt.dispose();
  });
  it('a notch click asks for its level at the Helm only; stand and sit keep the level, and the empty Helm coasts', () => {
    const { rt, hold, press, tick } = rig();
    hold({ throttleTo: 3 }); tick(); hold({ throttleTo: null });
    expect(rt.duel.throttle).toBe(3);
    press('stand'); tick();
    expect([rt.view(), rt.duel.throttle, rt.axes()]).toEqual(['interior', 3, { turn: 0, thrust: 0 }]);
    hold({ throttleTo: 1 }); tick(); hold({ throttleTo: null });   // standing: the click does nothing
    expect(rt.duel.throttle).toBe(3);
    press('interact'); tick();
    expect([rt.view(), rt.duel.throttle, rt.axes()]).toEqual(['helm', 3, { turn: 0, thrust: 0.75 }]);
    rt.dispose();
  });
  it('Tab drops a throttle the left Helm had queued, so nothing is rejected', () => {
    const { rt, press, tick } = rig();
    tick();
    press('throttleUp'); rt.frame(1 / 60); press('switch'); tick();
    expect(rt.lastResults().some((r) => r.status === 'rejected')).toBe(false);
    expect(rt.duel.throttle).toBe(0);
    rt.dispose();
  });
});
```

In `tests/onlineDuelSession.test.ts`, change L7 to `import type { CommandResult, DuelCommand, HeldInput } from '../src/renderer/src/net/contracts';`. In `stubClient` (L24-46), make three edits:
- Change the line `const sent: Sent[] = [], events: unknown[] = [], neutralized: number[] = [];` to:
  ```ts
  const sent: Sent[] = [], events: unknown[] = [], neutralized: number[] = [], results: CommandResult[] = [], ids: { player: number; sequence: number }[] = [];
  ```
- Change `sent, events, neutralized,` to `sent, events, neutralized, results, ids,`.
- Change the `command(...)` member to:
  ```ts
    command(player: number, command: DuelCommand) { sent.push({ kind: 'command', command }); const id = { player, sequence: ++commandSequence }; ids.push(id); return id; },
  ```
- Change `takeResults: () => [], takeEvents: () => events.splice(0),` to `takeResults: () => results.splice(0), takeEvents: () => events.splice(0),`.

Append to `tests/onlineDuelSession.test.ts`:

```ts

describe('the online Helm throttle (Artemis spec §5.4)', () => {
  const tap = (r: ReturnType<typeof rig>, code: string): void => { r.key('keydown', code); r.key('keyup', code); r.pump(); };
  const throttles = (c: Stub) => c.commands().filter((x) => x.kind === 'throttle');
  const lastThrottleId = (c: Stub) => c.ids[c.commands().map((x) => x.kind).lastIndexOf('throttle')]!;
  it('two W presses inside one round trip move two notches; S steps down from the level in flight', () => {
    const r = rig(0), c = r.attach();   // seat 0 flies the Helm
    tap(r, 'KeyW'); tap(r, 'KeyW');
    expect(throttles(c)).toEqual([{ kind: 'throttle', level: 1 }, { kind: 'throttle', level: 2 }]);
    tap(r, 'KeyS');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 1 });
    r.dispose();
  });
  it('a rejected throttle drops back to the replica level', () => {
    const r = rig(0), c = r.attach();
    tap(r, 'KeyW'); tap(r, 'KeyW');   // 1, then 2 on top of it
    c.results.push({ id: lastThrottleId(c), tick: 3, status: 'rejected', reason: 'invalid-seat' }); r.pump();
    tap(r, 'KeyW');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 1 });   // from the replica's 0, not from 2
    r.dispose();
  });
  it('only the result for the level in flight hands the base back to the replica; a notch click asks for its level', () => {
    let input: ConsoleInput | null = null;
    const r = rig(0, undefined, undefined, { setConsole: (i: ConsoleInput | null) => { input = i; } }), c = r.attach();
    tap(r, 'KeyW');
    const first = lastThrottleId(c);
    tap(r, 'KeyW');                                                       // 2 in flight
    c.results.push({ id: first, tick: 3, status: 'applied' }); r.d.throttle = 1; c.publish(r.d); r.pump();
    tap(r, 'KeyW');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 3 });   // still built on the 2 in flight
    c.results.push({ id: lastThrottleId(c), tick: 4, status: 'applied' }); r.d.throttle = 4; c.publish(r.d); r.pump();
    tap(r, 'KeyS');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 3 });   // from the replica's 4
    input!.throttle(-1); r.pump();
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: -1 });
    r.dispose();
  });
  it('a stand and a new round clear the level in flight', () => {
    const r = rig(0), c = r.attach();
    tap(r, 'KeyW');                                                       // 1 in flight
    tap(r, 'KeyX');                                                       // the stand clears it (the replica still shows the seat)
    tap(r, 'KeyW');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 1 });
    tap(r, 'KeyW');                                                       // 2 in flight
    nextRound(r.d); c.publish(r.d); r.pump();
    tap(r, 'KeyW');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 1 });   // the new round starts from the replica's 0
    r.dispose();
  });
});
```

Append to `tests/duelOnlineView.test.ts`:

```ts

describe('the online source follows the throttle (Artemis spec §5.3, §6.1)', () => {
  it('the Helm seat flies the replica throttle; throttle() is the session base, else the replica', () => {
    const d = createDuel(CUTTER, 3), c = confirmed();
    const source = createOnlineDuelSource({ client: c.client, seat: 0, now: () => 0, viewport: { w: 1280, h: 720 } });
    try {
      d.throttle = 2; c.publish(d); source.observe();
      source.sent({ moveX: 1, moveY: -1 });
      expect([source.axes(), source.throttle()]).toEqual([{ turn: 1, thrust: 0.5 }, 2]);
      source.throttleBase(4);
      expect([source.throttle(), source.axes().thrust]).toEqual([4, 0.5]);   // the drawn path follows the replica
      source.throttleBase(null);
      expect(source.throttle()).toBe(2);
      const gunner = createOnlineDuelSource({ client: c.client, seat: 1, now: () => 0, viewport: { w: 1280, h: 720 } });
      gunner.observe();
      expect(gunner.axes()).toEqual({ turn: 0, thrust: 0 });
    } finally { disposeDuel(d); c.dispose(); }
  });
});
```

In `tests/uiConsole.test.tsx` L32, change the input to `const input = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), throttle: vi.fn() };`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/duelInputMerge.test.ts tests/duelRuntime.test.ts tests/onlineDuelSession.test.ts tests/duelOnlineView.test.ts`
Expected: FAIL. `throttleRequest`, `kb.ui.throttle`, `rt.throttle` and `source.throttleBase` do not exist, and `presses.throttleUp` is undefined.

- [ ] **Step 3: The keyboard (`src/renderer/src/app/duel/input.ts`)**

Add `import { clampThrottle } from '../../sim/duel/throttle';` after the `Axes` import (L3). Replace L5-14 with:

```ts
/** Press-edge actions (spec §5 table). H-1a uses pause, camera and the zoom keys; H-1b adds the duel ones; Artemis-ii
 *  adds the Helm's throttle notches on W and S (spec 2026-11-17-artemis-consoles §5.4). */
export type KeyAction = 'interact' | 'prevLock' | 'fireDown' | 'fireUp' | 'launch' | 'stand' | 'switch' | 'pause' | 'camera' | 'zoomIn' | 'zoomOut' | 'confirm' | 'menu' | 'throttleUp' | 'throttleDown';

export const PRESS_CODES: Readonly<Record<string, KeyAction>> = {
  KeyE: 'interact', KeyQ: 'prevLock', Space: 'fireDown', KeyF: 'launch', KeyX: 'stand', Tab: 'switch', Escape: 'pause', KeyC: 'camera',
  Equal: 'zoomIn', NumpadAdd: 'zoomIn', Minus: 'zoomOut', NumpadSubtract: 'zoomOut', Enter: 'confirm', NumpadEnter: 'confirm', KeyM: 'menu',
  KeyW: 'throttleUp', KeyS: 'throttleDown'
};
/** The held keys: WASD movement (walk, the Helm's turn, the flight view's thrust and turn, steer), E held to repair,
 *  Space held to charge. W and S are also the throttle's press edges (PRESS_CODES). */
export const MOVE_CODES = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' } as const;
export const INTERACT_HELD = 'KeyE', FIRE_HELD = 'Space';
```

Replace the `ConsoleInput` line (L22) with:

```ts
/** What a console click can do (spec §6.2): a press edge, a held code, a direct lock request, or a throttle notch. */
export interface ConsoleInput { press(action: KeyAction): void; hold(code: HoldCode, on: boolean): void; lock(room: number): void; throttle(level: number): void }
```

In `KeySample`, after `lockTo?: number | null;`, add:

```ts
  /** The last console throttle request since the previous sample, or null (Artemis spec §6.2). */
  throttleTo?: number | null;
```

Replace `emptyPresses` (L38-40) with:

```ts
export function emptyPresses(): Record<KeyAction, number> {
  return { interact: 0, prevLock: 0, fireDown: 0, fireUp: 0, launch: 0, stand: 0, switch: 0, pause: 0, camera: 0, zoomIn: 0, zoomOut: 0, confirm: 0, menu: 0, throttleUp: 0, throttleDown: 0 };
}
```

Change `helmAxes`'s comment (L42) to `/** The flight dev view's held axes from a key sample: A/D turn (D clockwise), W thrusts forward, S reverses (W gives moveY −1). The duel's Helm thrusts by its throttle instead (Artemis spec §5.3). */`. After `helmAxes`, add:

```ts

/** The level a frame's throttle input asks for (Artemis spec §5.4), or null for none. Each W press moves it one notch up
 *  and each S press one down from `base`, clamped to −1..4 at every step. Then a console notch click (`to`) wins. A
 *  request equal to `base` is null, since the sim would answer noop. */
export function throttleRequest(base: number, presses: Pick<Record<KeyAction, number>, 'throttleUp' | 'throttleDown'>, to: number | null | undefined): number | null {
  const steps = presses.throttleUp - presses.throttleDown;
  let level = base;
  for (let n = 0; n < Math.abs(steps); n++) level = clampThrottle(level + Math.sign(steps));
  if (to !== undefined && to !== null) level = clampThrottle(to);
  return level === base ? null : level;
}
```

In `createDuelKeyboard`:
- Change `let presses = emptyPresses(), lockTo: number | null = null;` to `let presses = emptyPresses(), lockTo: number | null = null, throttleTo: number | null = null;`.
- Change `clearUi` and `clear` to:
  ```ts
  const clearUi = (): void => { ui.clear(); lockTo = null; throttleTo = null; };
  const clear = (): void => { keys.clear(); ui.clear(); presses = emptyPresses(); lockTo = null; throttleTo = null; };
  ```
- In `consoleInput`, change `lock(room) { lockTo = room; }` to `lock(room) { lockTo = room; },` and add `throttle(level) { throttleTo = level; }` after it.
- In `sample()`, change the `out` line and the reset line to:
  ```ts
      const out: KeySample = { moveX: x / len, moveY: y / len, interactHeld: has(INTERACT_HELD), fireHeld: held.fire, presses, held, lockTo, throttleTo };
      presses = emptyPresses(); lockTo = null; throttleTo = null;
  ```

- [ ] **Step 4: The UI actions and the controls list**

`src/renderer/src/ui/actions.ts`: in `consoleActions` (L42-46), change `lock: (room) => consoleInput?.lock(room)` to `lock: (room) => consoleInput?.lock(room),` and add `throttle: (level) => consoleInput?.throttle(level)` after it.

`src/renderer/src/app/controlsList.ts`: replace the line `  menu: 'Return to the main menu (paused or end screen)'` (L31) with:

```ts
  menu: 'Return to the main menu (paused or end screen)',
  throttleUp: 'At the Helm, throttle up a notch (it stays set)',
  throttleDown: 'At the Helm, throttle down a notch (to stop, then reverse)'
```

`DUEL_ACTION` is a `Record` over every `KeyAction` but `fireUp`, so these two entries are required for the typecheck. The rows list them as `W` and `S` from `PRESS_CODES`. Change the move row (L42) to:

```ts
  const duel: ControlRow[] = [{ keys: move, action: 'Walk; at the Helm, A/D turn; at Weapons, steer the missile' }];
```

- [ ] **Step 5: The local runtime (`src/renderer/src/app/duel/runtime.ts`)**

Add `import { throttleThrust } from '../../sim/duel/throttle';` after the `stepDuelTick` import (L13). Change the input import (L27) to:

```ts
import { accumulateWheel, emptyPresses, helmAxes, NO_HELD_FLAGS, throttleRequest, WHEEL_IDLE_MS, type HeldFlags, type KeySample, type PointerSample } from './input';
```

In `interface DuelRuntime`, replace the `axes(): Axes;` comment and declaration (L187-188) with:

```ts
  /** The Helm's axes the last tick flew: the held turn and the throttle's thrust (Artemis spec §5.3). Zero while the
   *  Helm is empty or the round is decided. The gunner's steering the last tick sent (zero while Weapons is empty). */
  axes(): Axes;
```

After `running(): boolean;` (L211), add:

```ts
  /** The Helm throttle level the console shows (Artemis spec §6.1): the active player's latest queued throttle, else the duel's. */
  throttle(): number;
```

After `isWeaponsCommand` (L215), add:

```ts
/** The commands only a seated console's player sends (Weapons and the Helm's throttle): a Tab or a stand drops them. */
const isConsoleCommand = (c: DuelCommand): boolean => isWeaponsCommand(c) || c.kind === 'throttle';
```

Replace L282 (`sentAxes = ...`) with:

```ts
    sentAxes = helm >= 0 && !ended() ? { turn: Math.sign(held[helm]!.moveX) || 0, thrust: throttleThrust(d.throttle) } : NO_AXES;   // Artemis spec §5.3
```

After `queue` (ends L299), add:

```ts
  /** The level the Helm builds on and shows (Artemis spec §5.4): the active player's latest queued throttle, else the sim's. */
  const throttleBase = (): number => {
    const last = [...pending].reverse().find((c) => c.player === active && c.command.kind === 'throttle')?.command;
    return last && last.kind === 'throttle' ? last.level : d.throttle;
  };
```

In `play()`, change both `pending = pending.filter((c) => !isWeaponsCommand(c.command));` (L315 and L332) to `pending = pending.filter((c) => !isConsoleCommand(c.command));`. Replace L333 with:

```ts
    if (seat === 'helm') {
      if (p.camera > 0) snapBack(cameras.helm);
      const level = throttleRequest(throttleBase(), p, k.throttleTo);   // W/S a notch, or a notch click (Artemis spec §5.4)
      if (level !== null) queue({ kind: 'throttle', level });
      return k;
    }
```

In the returned object, after `running: () => pacer.reasons.size === 0 && !ended(),` (L413), add `throttle: throttleBase,`.

- [ ] **Step 6: The online source (`src/renderer/src/app/duel/onlineSource.ts`)**

Change L9 to `import { missileOf, NO_AXES, Outcome, type Axes, type DuelEvent, type Missile, type TacticalState } from '../../sim/tactical/state';`. Change L18 to `import { NO_HELD_FLAGS, type HeldFlags, type KeySample, type PointerSample } from './input';`. Add `import { throttleThrust } from '../../sim/duel/throttle';` after the `DuelState` import (L7). Change L83 to `let uiHeld: HeldFlags = NO_HELD_FLAGS, shownThrottle: number | null = null;`. In the `source` type (L113-116), add `throttleBase(level: number | null): void;` after `heldFlags(flags: HeldFlags): void;`. Replace L134 with:

```ts
    axes: (): Axes => {   // Artemis spec §5.3: the held turn and the replica's throttle, while this seat flies a running round
      const d = duel();
      return seatOf(d, seat) === 'helm' && d.tactical.outcome === Outcome.Running ? { turn: Math.sign(sentHeld.moveX) || 0, thrust: throttleThrust(d.throttle) } : NO_AXES;
    },
```

After `running: () => client.publication()?.phase === 'running',` (L142), add:

```ts
    /** The level the console shows (Artemis spec §6.1): the session's level in flight, else the replica's. */
    throttle: () => shownThrottle ?? duel().throttle,
    /** The session's level in flight (spec §5.4's throttleSent), or null. */
    throttleBase(level) { shownThrottle = level; },
```

- [ ] **Step 7: The online session (`src/renderer/src/app/duel/onlineDuel.ts`)**

Change L13 to `import type { CommandId, DuelCommand, Link, Scheduler, Cue } from '../../net/contracts';`. Change L28 to `import { createDuelKeyboard, createPointerSource, emptyPresses, NO_HELD_FLAGS, throttleRequest, type ConsoleInput, type EventSource, type KeySample } from './input';`. After L88 (`let lastHeld = ...`), add:

```ts
  // Artemis spec §5.4: the throttle this seat last asked for, until its result comes back; the base W, S and the console build on.
  let throttleSent: { level: number; sequence: number; round: number } | null = null;
```

Replace `send` (L112-116) with:

```ts
  function send(command: DuelCommand): CommandId | null {
    if (!client || !descriptor) return null;
    const id = client.command(descriptor.seatId, command);
    if (id && command.kind !== 'presence') commandStamps.set(id.sequence, deps.now());
    return id;
  }
```

In `observe()`'s results loop (L160-163), make the first line of the loop body:

```ts
      if (throttleSent && result.id.player === descriptor.seatId && result.id.sequence === throttleSent.sequence) throttleSent = null;   // applied, noop or rejected: the replica is the base again
```

In `play()`, replace L172-177 (from the standing branch through the Helm line) with:

```ts
    if (seat === 'standing') {
      if (p.interact > 0 && repairInReach(d, me) < 0) { const c = consoleInReach(d, me); if (c >= 0) { throttleSent = null; send({ kind: 'sit', station: c }); } }
      return;
    }
    if (p.stand > 0) { if (chargePressed || d.tactical.systems[0].fireHeld) send({ kind: 'laserCharge', held: false }); chargePressed = false; throttleSent = null; send({ kind: 'stand' }); return; }
    if (seat === 'helm') {
      if (p.camera > 0 && source) snapBack(source.cameras.helm);
      const level = throttleRequest(throttleSent ? throttleSent.level : d.throttle, p, k.throttleTo);   // Artemis spec §5.4
      if (level !== null) { const id = send({ kind: 'throttle', level }); if (id) throttleSent = { level, sequence: id.sequence, round: d.round }; }
      return;
    }
```

In `pump()`, after `const d = client?.state(), p = client?.publication();` (L201), add:

```ts
    if (throttleSent && d && d.round !== throttleSent.round) throttleSent = null;   // a new round starts at STOP
    source?.throttleBase(throttleSent ? throttleSent.level : null);
```

At the end of `pump()` (after `play()` and the held send, before `producing = true;`), hand the base over again so a press shows this pump: `source?.throttleBase(throttleSent ? throttleSent.level : null);`.

In `attach()` (L240), add `throttleSent = null;` to the reset line, after `leaveConfirm = CLOSED_PROMPT;`.

- [ ] **Step 8: `DuelViewSource.throttle()` (`src/renderer/src/app/duel/scene.ts`)**

In `interface DuelViewSource` (L33-61), after `uiHeld(): HeldFlags;`, add:

```ts
  /** The Helm throttle level the console shows (Artemis spec §6.1): the local base of §5.4. */
  throttle(): number;
```

- [ ] **Step 9: Run the tests and the typecheck**

Run: `npx vitest run tests/duelInputMerge.test.ts tests/duelInput.test.ts tests/duelRuntime.test.ts tests/onlineDuelSession.test.ts tests/duelOnlineView.test.ts tests/onlineInput.test.ts tests/flightRuntime.test.ts tests/settingsAndControls.test.ts tests/uiConsole.test.tsx tests/duelHealthView.test.ts tests/interiorZoomScene.test.ts`
Expected: PASS. `tests/flightRuntime.test.ts` still flies held W at thrust 1, because the flight view reads held keys.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/app/duel/input.ts src/renderer/src/ui/actions.ts src/renderer/src/app/controlsList.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/onlineSource.ts src/renderer/src/app/duel/scene.ts tests/duelInputMerge.test.ts tests/duelRuntime.test.ts tests/onlineDuelSession.test.ts tests/duelOnlineView.test.ts tests/uiConsole.test.tsx
git commit -m "feat(artemis-ii): W/S throttle notches and console throttle clicks in Single player and online (throttleSent base), axes follow the throttle (spec §5.4, §6.1-6.2)"
```

---

### Task 4: The Helm station's throttle column

**Files:**
- Modify: `src/renderer/src/render/duel/consoleModel.ts:14, 25, 48-50`, `src/renderer/src/app/duel/scene.ts:133`, `src/renderer/src/ui/duel/HelmStation.tsx` (whole file), `src/renderer/src/render/duel/readoutModel.ts:129`, `src/renderer/src/app/uiProbe.ts:21`
- Test: `tests/uiConsole.test.tsx:11, 25-26, 53-59` and a new click test; append to `tests/duelConsoleModel.test.ts`

**Interfaces:**
- Consumes: `DuelViewSource.throttle()` and `ConsoleInput.throttle` (Task 3); `Button`, `Box`, `Panel`, `PixelText` (`ui/stage/*`); `STATION`, `stationTop` (`render/duel/consoleLayout.ts`).
- Produces:
  ```ts
  // render/duel/consoleModel.ts
  export interface HelmPanel { heading: number; speed: number; held: HeldFlags; throttle: number }
  export interface ConsoleModelInput { ...; throttle?: number }   // default: duel.throttle
  // ui/duel/HelmStation.tsx
  export const NOTCHES: readonly { label: string; level: number; name: string }[];
  ```

- [ ] **Step 1: Write the failing tests**

`tests/uiConsole.test.tsx`:
- L11: `import { STATION, STATUS, stationTop } from '../src/renderer/src/render/duel/consoleLayout';`
- In `helmConsole` (L25-26), change `helm: { heading: 55, speed: 142, held: { ...NO_HELD_FLAGS, up: true } }` to `helm: { heading: 55, speed: 142, held: NO_HELD_FLAGS, throttle: 2 }`.
- Replace the test `'on the Helm: THRUST, REV and turn holds; 100 lit while W is held'` (L53-59) with:

```ts
  it('on the Helm: six throttle notches, the set one lit with the pointer and 25 up to it filled; the turn holds; no THRUST or REV hold', () => {
    const { duel } = mount(); act(() => duel.frame(view(helmConsole)));
    for (const n of ['throttle-100', 'throttle-75', 'throttle-50', 'throttle-25', 'throttle-stop', 'throttle-rev', 'turn-left', 'turn-right']) expect([n, btn(n)]).not.toEqual([n, null]);
    expect([btn('thrust'), btn('reverse')]).toEqual([null, null]);
    expect(['100', '75', '50', '25', 'stop', 'rev'].map((n) => btn(`throttle-${n}`).dataset.uiButton)).toEqual(['idle', 'idle', 'lit', 'idle', 'idle', 'idle']);
    expect(['100', '75', '50', '25', 'STOP', 'REV'].map((l) => document.querySelector(`[data-ui-throttle="${l}"]`)?.getAttribute('data-ui-lit'))).toEqual(['0', '0', '1', '1', '0', '0']);
    expect(texts().filter((t) => t.text === '<' && t.x === STATION.x + 8 + 78).map((t) => t.y)).toEqual([stationTop('helm') + 6 + 18 + 2 * 26 + 2]);
    expect(find('W/S  THROTTLE')).toBeDefined();
    expect(btn('tab-weapons').dataset.uiButton).toBe('disabled'); expect(btn('snap').dataset.uiButton).toBe('lit');
  });
  it('at REV the pointer is on REV and nothing is filled; at 100 every forward notch is', () => {
    const { duel } = mount();
    const at = (throttle: number) => view({ ...helmConsole, helm: { ...helmConsole.helm!, throttle } });
    const filled = () => ['100', '75', '50', '25', 'STOP', 'REV'].map((l) => document.querySelector(`[data-ui-throttle="${l}"]`)?.getAttribute('data-ui-lit'));
    act(() => duel.frame(at(-1)));
    expect(filled()).toEqual(['0', '0', '0', '0', '0', '0']); expect(btn('throttle-rev').dataset.uiButton).toBe('lit');
    act(() => duel.frame(at(4)));
    expect(filled()).toEqual(['1', '1', '1', '1', '0', '0']); expect(btn('throttle-100').dataset.uiButton).toBe('lit');
  });
```

In the `describe('clicks reach the keyboard (spec §6.2)', ...)` block, add:

```ts
  it('a throttle notch asks for its level on the primary button only; the turn buttons hold A and D', () => {
    const { duel, input } = mount(); act(() => duel.frame(view(helmConsole)));
    for (const n of ['100', '75', '50', '25', 'stop', 'rev']) fireEvent.pointerDown(btn(`throttle-${n}`), { button: 0 });
    expect(input.throttle.mock.calls).toEqual([[4], [3], [2], [1], [0], [-1]]);
    fireEvent.pointerDown(btn('throttle-50'), { button: 2 });
    expect(input.throttle).toHaveBeenCalledTimes(6);
    fireEvent.pointerDown(btn('turn-left'), { button: 0 }); fireEvent.pointerUp(btn('turn-left'));
    expect(input.hold.mock.calls).toEqual([['KeyA', true], ['KeyA', false]]);
  });
```

`tests/duelConsoleModel.test.ts`: change the readoutModel import (L15) to `import { readoutHelp, readoutRows } from '../src/renderer/src/render/duel/readoutModel';` and append:

```ts

describe('the Helm throttle on the console (Artemis spec §4.2, §6.1)', () => {
  it('shows the level it is given (the local base), else the duel’s; the paused Helm help names the throttle', () => {
    const d = createDuel(layout, 5);
    try {
      expect(model(d)!.helm!.throttle).toBe(0);
      d.throttle = 3; expect(model(d)!.helm!.throttle).toBe(3);
      expect(model(d, { throttle: 4 })!.helm!.throttle).toBe(4);
      expect(readoutHelp('helm')[0]).toBe('W/S THROTTLE   A/D TURN');
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/uiConsole.test.tsx tests/duelConsoleModel.test.ts`
Expected: FAIL. There is no `console-throttle-*` button and no `helm.throttle`, and the help still reads `W/S THRUST`.

- [ ] **Step 3: The model, the scene and the help**

`src/renderer/src/render/duel/consoleModel.ts`:
- L14: `export interface HelmPanel { heading: number; speed: number; held: HeldFlags; throttle: number }`
- L25:
  ```ts
  export interface ConsoleModelInput {
    duel: DuelState; me: 0 | 1; mode: 'single' | 'online'; hidden: boolean; held: HeldFlags; overlay: MapOverlayView | null;
    /** The Helm throttle level to show (Artemis spec §6.1: the local base); the duel's own level when absent. */
    throttle?: number;
  }
  ```
- L48-50:
  ```ts
  const helm: HelmPanel | null = station === 'helm'
    ? { heading: ((Math.round((ship.heading / HEADING_COUNT) * 360) % 360) + 360) % 360, speed: Math.round(Math.hypot(ship.vx, ship.vy)), held, throttle: i.throttle ?? d.throttle }
    : null;
  ```

`src/renderer/src/app/duel/scene.ts` L133:

```ts
      const consoleView = consoleModel({ duel: d, me: source.active(), mode: source.mode, hidden, held: source.uiHeld(), overlay: overlayView, throttle: source.throttle() });
```

`src/renderer/src/render/duel/readoutModel.ts` L129: change `'W/S THRUST   A/D TURN'` to `'W/S THROTTLE   A/D TURN'`.

`src/renderer/src/app/uiProbe.ts` L21: change `helm: { heading: 55, speed: 142, held: { ...NO_HELD_FLAGS, up: true } }` to `helm: { heading: 55, speed: 142, held: NO_HELD_FLAGS, throttle: 2 }`.

- [ ] **Step 4: Replace `src/renderer/src/ui/duel/HelmStation.tsx`**

```tsx
// The Helm station block (spec 2026-11-17-artemis-consoles §4.2, Artemis-ii): the set-and-forget throttle (six press
// notches; the set one lit with a `<` pointer, and the notches from 25 up to it filled), heading and speed, and the turn
// buttons that hold A and D. W and S step the throttle a notch (§5.4); a notch click asks for its level.
import { Fragment, memo } from 'react';
import type { HelmPanel } from '../../render/duel/consoleModel';
import { STATION, stationTop } from '../../render/duel/consoleLayout';
import { AMBER, BAR_OFF, DIM, FONT_NATIVE, FONT_SIZE, TEXT } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useActions } from '../context';
import { Box } from '../stage/Box';
import { Button } from '../stage/Button';
import { hex } from '../stage/color';
import { useCrt } from '../stage/CrtContext';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

/** The notches top to bottom (spec §4.2): the label, the level the click asks for, the button's name. */
export const NOTCHES: readonly { label: string; level: number; name: string }[] = [
  { label: '100', level: 4, name: '100' }, { label: '75', level: 3, name: '75' }, { label: '50', level: 2, name: '50' },
  { label: '25', level: 1, name: '25' }, { label: 'STOP', level: 0, name: 'stop' }, { label: 'REV', level: -1, name: 'rev' }
];

export const HelmStation = memo(function HelmStation({ helm }: { helm: HelmPanel }) {
  const actions = useActions(), { crt } = useCrt();
  const top = stationTop('helm'), x0 = STATION.x + 8, y0 = top + 6, rx = STATION.x + 140, h = helm.held, set = helm.throttle;
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT;
  return (
    <>
      <Panel x={STATION.x} y={top} w={STATION.w} h={STATION.h.helm} />
      <PixelText text="THROTTLE" x={x0} y={y0} size={FONT_NATIVE} tint={dim} />
      {NOTCHES.map((n, k) => {
        const y = y0 + 18 + k * 26, filled = n.level >= 1 && n.level <= set;
        return (
          <Fragment key={n.name}>
            <Button name={`throttle-${n.name}`} label={n.label} x={x0} y={y} w={52} h={22} lit={n.level === set} onPress={() => actions.console.throttle(n.level)} />
            <Box x={x0 + 58} y={y} w={14} h={22} attrs={{ 'data-ui-throttle': n.label, 'data-ui-lit': filled ? '1' : '0' }}
              style={{ background: hex(filled ? (crt ? CRT.main : AMBER) : (crt ? CRT.faint : BAR_OFF)), border: `1px solid ${hex(dim)}` }} />
            {n.level === set && <PixelText text="<" x={x0 + 78} y={y + 2} size={FONT_SIZE} tint={main} />}
          </Fragment>
        );
      })}
      <Box x={STATION.x + 130} y={y0} w={1} h={186} style={{ background: hex(crt ? CRT.dim : BAR_OFF) }} />
      <PixelText text={`HDG ${String(helm.heading).padStart(3, '0')}`} x={rx} y={y0} size={FONT_NATIVE} tint={dim} />
      <PixelText text={`SPD ${helm.speed}`} x={rx} y={y0 + 18} size={FONT_SIZE} tint={main} />
      <Button name="turn-left" label="<" hint="A" x={rx} y={y0 + 52} w={70} h={24} lit={h.left} onHold={(on) => actions.console.hold('KeyA', on)} />
      <Button name="turn-right" label=">" hint="D" x={rx + 78} y={y0 + 52} w={70} h={24} lit={h.right} onHold={(on) => actions.console.hold('KeyD', on)} />
      <PixelText text="HOLD TO TURN" x={rx} y={y0 + 86} size={FONT_NATIVE} tint={dim} />
      <PixelText text="W/S  THROTTLE" x={rx} y={y0 + 156} size={FONT_NATIVE} tint={dim} />
    </>
  );
});
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run tests/uiConsole.test.tsx tests/duelConsoleModel.test.ts tests/uiProbe.test.ts tests/uiDuel.test.tsx tests/crtReadout.test.ts tests/duelReadout.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/duel/consoleModel.ts src/renderer/src/app/duel/scene.ts src/renderer/src/ui/duel/HelmStation.tsx src/renderer/src/render/duel/readoutModel.ts src/renderer/src/app/uiProbe.ts tests/uiConsole.test.tsx tests/duelConsoleModel.test.ts
git commit -m "feat(artemis-ii): the Helm station's six clickable throttle notches with the set-level pointer; W/S THROTTLE hints (spec §4.2)"
```

---

### Task 5: Final gates and the Electron throttle check (controller)

**Files:** none committed. The screenshots go to `C:\Users\djuar\FTLite-shots\artemis-ii\`.

- [ ] **Step 1: The full gates**

Run: `npx tsc -b`. Expected: no errors.
Run: `npx vitest run --maxWorkers=4`. Expected: PASS, every file.
Run: `npm run test:determinism`. Expected: PASS on every runtime. Then run `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability/task-5-logs/` to restore the logs it rewrote.

- [ ] **Step 2 (controller, not a subagent): the look and click check in Electron**

Build with `npx electron-vite build`. In a scratch folder outside the repo, `C:\Users\djuar\FTLite-shots\artemis-ii`, run `npm i playwright-core@1.48.2` (the visual-check method). Then save this as `check.mjs` there and run it with `node check.mjs`:

```js
// Artemis-ii look and click check (plan Task 5): the throttle flies the ship with no key held; W/S step it; stand and sit keep it.
import { _electron as electron } from 'playwright-core';
const shots = 'C:/Users/djuar/FTLite-shots/artemis-ii';
const app = await electron.launch({ executablePath: 'C:/Users/djuar/FTLite/node_modules/electron/dist/electron.exe', args: ['C:/Users/djuar/FTLite'] });
const page = await app.firstWindow();
const results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const text = (prefix) => page.locator(`canvas[data-text^="${prefix}"]`).first().getAttribute('data-text');
const speed = async () => Number((await text('SPD ')).slice(4));
const look = (name) => page.locator(`[data-testid="console-throttle-${name}"]`).getAttribute('data-ui-button');
await page.click('[data-testid="single-player"]');
await page.waitForSelector('[data-testid="console-throttle-75"]');
await page.screenshot({ path: `${shots}/helm-stop.png` });
check('starts at STOP', (await look('stop')) === 'lit');
const before = await speed();
await page.click('[data-testid="console-throttle-75"]');
await page.waitForTimeout(3000);   // no key is held
const after = await speed();
check('a 75 click flies the ship with no key held', (await look('75')) === 'lit' && after > before, `SPD ${before} -> ${after}`);
await page.screenshot({ path: `${shots}/helm-75.png` });
await page.keyboard.press('KeyW');
await page.waitForTimeout(200);
check('W steps up to 100', (await look('100')) === 'lit');
await page.keyboard.press('KeyS'); await page.keyboard.press('KeyS');
await page.waitForTimeout(200);
check('S twice steps down to 50', (await look('50')) === 'lit');
await page.click('[data-testid="console-tab-ship"]');   // stand (X)
await page.waitForTimeout(500);
await page.keyboard.press('KeyE');                       // sit again
await page.waitForSelector('[data-testid="console-throttle-50"]');
await page.waitForTimeout(300);
check('stand and sit keep the level', (await look('50')) === 'lit');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('the paused Helm help names the throttle', (await page.locator('canvas[data-text="W/S THROTTLE   A/D TURN"]').count()) > 0);
await page.screenshot({ path: `${shots}/helm-paused.png` });
await page.keyboard.press('Escape');
console.log(results.join('\n'));
await app.close();
```

Expected: six `PASS` lines. Also look at `helm-75.png` by eye: the 75 notch is lit with the `<` pointer, 25 to 75 are filled, the predicted path runs ahead of the ship, and a thrust flame shows. Record the results in the final report. A failure goes back to the matching task as a fix.
