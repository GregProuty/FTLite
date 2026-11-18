# Sci-1: Science scans, the unidentified enemy and the derelict — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The duel's enemy starts as an unidentified contact in Patrol that turns hostile after 20 s (or at the first crew hit), a derelict with loot orbits the planet, the crew scans either contact (Level 1 and Level 2, fastest from a new Science console), Helm salvages the derelict by flying close and slow, and Weapons tunes the laser to A, B or C to strip two shield layers a hit on the enemy's weak frequency.

**Architecture:** A new tactical sim module `science` (after `ship`) holds round-relative time, hostility, what each contact is known to, the one ship scanner, Science's designation, the weak frequency and the derelict; `ship` gains each laser's `freq`. A new pure file `sim/tactical/science.ts` holds the scan admission effect, the hostility step, the scan progress step, the derelict's orbit (`derelictPos`) and the salvage step; `stepDuel` calls them after the weapon clocks, so the headless gates get them too. Three new duel commands (`contactScan`, `designate`, `laserFrequency`) are admitted in `stepDuelTick` after the throttle. SIM_VERSION goes 44 → 45 in two steps (spec §6.3): Task 1 bumps with every new field at a neutral value and proves every oracle run unchanged; Tasks 2 to 5 add the commands and the dormant rules and prove the runs unchanged at the same version; Task 6 turns the behaviour on and re-blesses at 45. Then the views: the map marks (unknown `?`, scan ring, designation, derelict, salvage ring), the Science seat and console, the re-keyed contact window (enemy or derelict, by level, with SCAN), the keys and clicks, the React pieces and the screenshots.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), PixiJS 8 (map layer), React 19 + zustand 5 (UI overlay), Vitest 3.2 (+ jsdom and @testing-library/react for `.tsx`), zod 3 (wire codec), Electron + Vite for the screenshots (gitignored harness under `.art/sci-shots/`).

**Spec:** `docs/superpowers/specs/2026-11-17-science-scans-design.md` (all of it; reviewed to convergence, `docs/superpowers/reviews/2026-11-17-science-scans-spec/ledger.md`). Precedents: `docs/superpowers/plans/2026-11-17-artemis-ii-throttle.md` (the two-step bless) and `docs/superpowers/plans/2026-11-17-enemy-ship-window.md` (the contact window and the screenshot harness).

**Branch and worktree:** all work happens in the git worktree `.worktrees/sci-1` on branch `sci-1`, made from master `6f2e0b0d` or later: from the repo root run `git worktree add .worktrees/sci-1 -b sci-1 master`, then give it the dependency junctions (memory: the worktree signalling junction) with `cmd /c mklink /J .worktrees\sci-1\node_modules node_modules` and `cmd /c mklink /J .worktrees\sci-1\services\signalling\node_modules services\signalling\node_modules`. Every command below runs from the worktree root `C:\Users\djuar\FTLite\.worktrees\sci-1`. Record each baseline (Step 1 of Tasks 1 to 6) in that same worktree, because the baselines check their `cwd`.

## Global Constraints

- **SIM_VERSION 44 → 45, in two steps (spec §6.3).** Master is at **44** (start-aboard, `69f34c27`). Before Task 1 run `git grep -n "SIM_VERSION = " -- src/renderer/src/sim/tuning.ts`; if it does not read `44`, stop: master moved and every version number here must move with it.
  - **Step 1 (Task 1):** `SIM_VERSION = 45`; every new field at a neutral value: `hostileAt` 0 and `hunter.mode` Hunt from the start, no new rng draws, the scan idle (`contact` −1, the other four 0), `designated` −1, `weakFreq` 0, every `freq` 0, the derelict at `orbitR` 700, `phase` 0, `loot` 0, `trapped` false, `salvage` 0, `salvaged` true. `MIGRATIONS[44] = { change: 'Sci-1: science scans', rename: () => undefined, derived: [], added: [/^science\./, /^ship\.systems\.\d+\.freq$/] }`. Bless; the canonical trace and the duel oracle prove every existing run unchanged.
  - **Between (Tasks 2 to 5):** the three commands, the Science seat, and the hostility, scan and salvage rules land dormant (the neutral values never trigger them, and no scripted run scans, designates or tunes). Each of these tasks records a baseline at 45 first and ends with `npx tsx scripts/golden/duel-oracle.ts same` and `npx tsx scripts/golden/canonical-trace.ts same` passing. Nothing is re-blessed.
  - **Step 2 (Task 6):** the draws, the Patrol start and the frequency strip go on; a same-version bless at 45, whose commit message gives the reason; the scripted-run pins are re-measured by the rule in Task 6.
- **Generated files come only from `npm run bless`:** `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`. Never edit them by hand. Never pass `--fresh`.
- **Sim trig:** only the heading tables (`dirBetween`, `hx`, `hy`, `wrapHeading` in `sim/tactical/direction.ts`). No `Math.sin`, `Math.cos`, `Math.atan2`, `Math.PI` or `**` in any sim file (the determinism guard, `tests/helpers/determinismGuard.ts`, allows only `abs ceil floor round min max sign imul sqrt`); 2π is the literal `6.283185307179586`.
- **Exact constants (spec §4):** `HOSTILE_AFTER_TICKS = 1200`; `SCAN_UNITS = [0, 900, 1800]`; `SCAN_RATE_SCIENCE = 5`; `SCAN_RATE_OTHER = 2`; `SALVAGE_RANGE = 60`; `SALVAGE_SPEED = 40` (u/s); `SALVAGE_TICKS = 300`; `TRAP_HULL = 3`; loot `Hull` +8 hull capped at the class hull (`LOOT_HULL = 8`), `Missiles` the magazine to the class magazine, `Shield` +1 layer up to class layers + 1. `orbitR = u <= 300 ? 700 + u : 1400 + (u − 301)` with `u = nextInt(rng, 501)`, so `orbitR` ∈ [700, 1000] ∪ [1400, 1599] (`DERELICT_NEAR_MIN 700`, `DERELICT_NEAR_MAX 1000`, `DERELICT_FAR_MIN 1400`, `DERELICT_FAR_MAX 1599`); the phase redraw clearance `DERELICT_SPAWN_CLEAR = 600` from either spawn, at most `DERELICT_PHASE_DRAWS = 16` phase draws in all, the last standing.
- **Draw order (spec §4.5), in `createTacticalState` right after `generateMap(rng)` and before anything else reads the rng:** (1) `weakFreq = nextInt(rng, 3)`; (2) `u = nextInt(rng, 501)`; (3) `phase = nextInt(rng, 256)` and its redraws; (4) `loot = nextInt(rng, 3)`; (5) `trapped = nextInt(rng, 3) === 0`.
- **Step order (spec §4.6), fixed:** think → weapon commands → fly → missiles fly → contacts → missile contacts → weapon clocks → hostility → scan progress (the crew input's `scanner`) → salvage → outcome → tick. Every round-relative rule reads `rt = state.tick − state.startTick` before `state.tick++`.
- **Admission (spec §5):** after the throttle loop: every `laserFrequency` in envelope order, then every `designate`, then every `contactScan`, each against the seats after the seat phase and each checked for `stale-tick` first; within a kind the last applied wins. No new reason strings. `crew.scanner = scan.contact < 0 || attendant(d, scan.by) >= 0`, computed after the `contactScan` loop.
- **Gates:** `tests/duelGates.test.ts` bands are never edited and nothing is retuned. If a gate fails after Task 6, stop and report the numbers (each seed's `telemetryLine` and the summary line the aggregate test prints); the owner decides.
- **Presentation:** CRT amber only, from the ramp in `src/renderer/src/render/tactical/crtTheme.ts` (`CRT.glass faint dim mid main hot`); meaning by brightness, solid vs dashed and two-state blinks (`blink(t, hz)`), never by hue. The spec's "alert colour" (§7.1) is `CRT.hot` blinking at `ALERT_BLINK_HZ`.
- **Git:** never `git add -A`, `git add .` or `git stash`; stage files by name (the main checkout has unrelated dirty files). Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; the commands below pass that footer as a second `-m`.
- **Test commands:** targeted `npx vitest run <files>`; `npx tsc -b`; the full suite `npx vitest run --maxWorkers=4` (the sim files `tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts` and `tests/gate-*.test.ts` can time out under load: rerun a failing one alone before calling it a failure).
- Comments follow the codebase's style: a header comment citing the spec section on each new file; doc comments on exports.

## Decisions where the spec leaves room, and where the code forces a choice

1. **`known` is one 2-value field named `known`** (its two values are the spec's `known.0` and `known.1`, in that order). `tests/duelModules.test.ts`'s completeness walker treats a numeric array as one member, so a `[number, number]` must be one vector field. The oracle names it `science.known` (covered by `/^science\./`).
2. **`derelict.trapped` and `derelict.salvaged` are booleans,** stored as module `flag` fields (0/1) and validated 0 or 1.
3. **`salvage` resets to 0 when the salvage completes,** so the salvage ring ("while `salvage > 0`") goes away; `salvaged` stays true.
4. **"Within 600" of a spawn redraws the phase when the distance is `< 600`.** The position at `rt = 0` is `dirBetween(phase, 0) · orbitR`, the formula `derelictPos` uses.
5. **The Patrol shield hold** in `tickWeapons` tests `i !== CREW_SLOT && classOf(state, i).ai === 'hunter'` instead of `hunterSlot` (weapons.ts cannot import duel.ts, which imports weapons.ts). In a duel both name slot 1.
6. **A crew missile turns the enemy hostile** when its `missileEnd` has `ship === CREW_SLOT`, `cause === 'ship'` and `target` the hunter slot.
7. **The draws live in `state.ts`** (a local `scienceDraws`), not in `science.ts`, so `state.ts` never imports `science.ts` (which imports `state.ts`).
8. **The hostility line is a readout row only on the consoles** (`readoutRows` with `console: true`), right after the `HUNTER` heading, so the interior's list stays the longest (`READOUT_ROWS` 22 unchanged). It is also a line in the enemy's contact window at Level 1 and 2. `HOSTILE` shows while `rt − hostileAt < 180`.
9. **The map's lock marker is hidden while the enemy is unknown** (there is no drawing to put it on).
10. **Layout (a deviation from spec §7.3's "no station block"):** the spec gives the hover readout and Science's key help no home, and the side column and the contact window are full, so Science gets a small station block. A fourth tab `SCIENCE` between WEAPONS and SHIP (`TABS_RIGHT` 308 → 408); the Weapons block 216 → 248 high for the frequency row (`stationTop('weapons')` 492 → 460); the contact window 360 → 420 high for its info lines; a Science block 96 high at the bottom left (`stationTop('science')` 612) with the hover readout and the key help.
11. **Keys:** Digit1, Digit2 and Digit3 set the keyboard's `freqTo` (0, 1, 2), like a console click; they are not new press actions. S and T on Science, and T on Helm and Weapons, go through the contact controller's key intercept (as T and Esc already do). On Science the controller takes S even with nothing selected, so S never becomes a throttle press there.
12. **The contact controller emits requests and the duel modes send them:** `takeRequests(): { designate: number | null; scan: 0 | 1 | null }` is drained once a frame by the local runtime and by the online session, which send a command only when the seat allows it and it would change something (as `throttleRequest` drops a request equal to its base). Esc on Science deselects and requests `designate −1`, as T's "none" does.
13. **`ContactSync` keeps its fields** (`target` is the enemy's slot, the crew laser's target; `active` reads a slot) and gains an optional `enemyKnown` (absent counts as 2), so the existing callers still compile.
14. **The online replica test (spec §10) runs at the snapshot path the online client uses:** an authority duel, and a replica restored by `restoreDuelSnapshot` from `saveDuelSnapshot` every 3 ticks, over a run with scans, designation, tuning and salvage.
15. **Unbuildable: "a layout without a Science console" (spec §6.1, §9).** `parseShip` requires exactly seven stations, one per kind (`src/renderer/src/sim/ship/schema.ts:35`), so every duel layout has one. `DuelState.science` still falls back to −1 and every rule checks `>= 0`, but no test can build such a layout.
16. **`UNCREWED_INPUT`, `IDLE_INPUT` and the hunter's input set `scanner: true`** (spec §4.6), so every test helper that spreads `IDLE_INPUT` and the gate bots are covered.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/renderer/src/sim/tactical/tuning.ts` | modify (T1) | the Sci-1 constants |
| `src/renderer/src/sim/tactical/state.ts` | modify (T1, T3, T6) | `HunterMode.Patrol`, `Contact`, `Loot`, `CONTACT_MAX_LEVEL`, `Scan`, `Derelict`, `idleScan`, the new TacticalState members, `ShipSystems.freq`; (T3) the three new DuelEvent kinds; (T6) the draws and the Patrol start |
| `src/renderer/src/sim/tactical/hash.ts` | modify (T1) | `freq` in the systems tail, `scienceModule`, `TACTICAL_MODULES`, `tacticalLength`, the clone's containers, validation |
| `src/renderer/src/sim/tactical/weapons.ts` | modify (T1, T3, T6) | `ShipInput.scanner`; (T3) the Patrol shield hold; (T6) the frequency strip |
| `src/renderer/src/sim/tactical/hunter.ts` | modify (T1, T3) | `scanner: true`; (T3) the Patrol branch |
| `src/renderer/src/sim/tactical/science.ts` | create (T2), extend (T3, T4, T5) | `scanCommand`; `roundTick`, `hostilityStep`; `scanStep`; `derelictPos`, `salvageStep` |
| `src/renderer/src/sim/tactical/duel.ts` | modify (T3, T4, T5) | the step order |
| `src/renderer/src/sim/duel/state.ts` | modify (T2) | `DuelState.science` |
| `src/renderer/src/sim/duel/step.ts` | modify (T1, T2) | `scanner: true` and `startTick` in `startRound`; (T2) the Science sit, the three admissions, `scanner` |
| `src/renderer/src/sim/duel/modules.ts` | modify (T1, T2) | `scienceModule` in `DUEL_MODULES`; (T2) `DUEL_NOT_SNAPSHOTTED.science` |
| `src/renderer/src/sim/duel/fire.ts`, `health.ts`, `telemetry.ts` | modify (T3) | skip the new event kinds |
| `src/renderer/src/net/contracts.ts`, `src/renderer/src/net/codec.ts` | modify (T2) | the three commands on the wire |
| `src/renderer/src/sim/tuning.ts` | modify (T1) | SIM_VERSION 45 |
| `scripts/golden/duelOracle.ts` | modify (T1) | `MIGRATIONS[44]` |
| `src/renderer/src/render/tactical/fxModel.ts`, `src/renderer/src/audio/duelSounds.ts` | modify (T3) | skip the new event kinds |
| `src/renderer/src/render/tactical/tacticalModel.ts`, `tacticalLayer.ts`, `weaponsModel.ts` | modify (T7) | the contact marks, the salvage ring, Science's lock ring, `pickContact`, the hidden lock marker |
| `src/renderer/src/app/duel/controls.ts`, `runtime.ts`, `onlineSource.ts`, `onlineDuel.ts`, `scene.ts`, `src/renderer/src/render/crt.ts`, `render/duel/readoutModel.ts`, `render/duel/consoleModel.ts`, `render/duel/consoleLayout.ts`, `src/renderer/src/ui/duel/TabStrip.tsx` | modify (T8) | the Science seat, view, camera and tab |
| `src/renderer/src/render/duel/scienceModel.ts` | create (T9) | `hostilityLine`, `hoverReadout`, `FREQ_NAMES`, `LOOT_NAMES`, `scanButton` |
| `src/renderer/src/render/duel/consoleModel.ts`, `consoleLayout.ts`, `readoutModel.ts` | modify (T9) | the Science panel, the frequency row, the hostility row, the layout |
| `src/renderer/src/app/duel/contactController.ts`, `src/renderer/src/render/duel/contactModel.ts` | modify (T10) | contact ids, Science, requests; the window by contact and level |
| `src/renderer/src/app/duel/input.ts`, `runtime.ts`, `onlineDuel.ts`, `duelMode.ts`, `scene.ts`, `src/renderer/src/ui/actions.ts` | modify (T11) | `freqTo`, `ConsoleInput.frequency`, `PointerSource.position`, requests to commands, the scene's pick, sync, hover and view |
| `src/renderer/src/ui/duel/ContactWindow.tsx`, `WeaponsStation.tsx`, `ScienceStation.tsx` (create), `DuelUi.tsx` | modify (T12) | SCAN and the info lines, the frequency row, the Science block |
| `docs/gates.md` | modify (T13) | the owner look-check entry |
| `tests/helpers/hostile.ts` | create (T3) | `makeHostile`, `patrol` |
| `tests/scienceState.test.ts`, `scienceCommands.test.ts`, `scienceHostility.test.ts`, `scienceScans.test.ts`, `scienceDerelict.test.ts`, `scienceFlow.test.ts`, `scienceMap.test.ts`, `scienceSeat.test.ts`, `scienceConsole.test.ts`, `scienceInput.test.ts`, `scienceUi.test.tsx` | create | the new behaviour, one file per task |

---

### Task 1: The science module and `freq` at neutral values; SIM_VERSION 44 → 45 alone, blessed

**Files:**
- Modify: `src/renderer/src/sim/tactical/tuning.ts` (append), `src/renderer/src/sim/tactical/state.ts` (HunterMode, new exports, ShipSystems, TacticalState, systemsFor, emptySystems, createTacticalState), `src/renderer/src/sim/tactical/hash.ts` (SYSTEMS_TAIL, scienceModule, TACTICAL_MODULES, flattenTactical doc, tacticalLength, cloneTacticalFromModule, systemsRules, topRules, validateTacticalValues), `src/renderer/src/sim/tactical/weapons.ts` (ShipInput, IDLE_INPUT, UNCREWED_INPUT), `src/renderer/src/sim/tactical/hunter.ts` (the input literal), `src/renderer/src/sim/duel/step.ts` (the crew literal, startRound), `src/renderer/src/sim/duel/modules.ts` (DUEL_MODULES), `src/renderer/src/sim/tuning.ts:7`, `scripts/golden/duelOracle.ts` (MIGRATIONS)
- Create: `tests/scienceState.test.ts`
- Test updates: `tests/duelModules.test.ts`, `tests/tacticalDeterminism.test.ts`, `tests/duelSnapshot.test.ts`, `tests/duelThrottle.test.ts`, `tests/duelRounds.test.ts`
- Regenerated by `npm run bless`: `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`

**Interfaces:**
- Consumes: `scalar`, `flag`, `vector`, `moduleLength`, `type ModuleField`, `type SimModule` (`src/renderer/src/sim/module.ts`); `aliasPlan`, `duelSchema`, `MIGRATIONS` (`scripts/golden/duelOracle.ts`); `saveDuelSnapshot`, `loadDuelSnapshot`, `validateDuelSnapshot` (`sim/duel/snapshot.ts`); `hashF64` (`src/shared/hash`).
- Produces:
  ```ts
  // sim/tactical/tuning.ts
  export const HOSTILE_AFTER_TICKS = 1200;
  export const SCAN_UNITS: readonly number[];              // [0, 900, 1800]
  export const SCAN_RATE_SCIENCE = 5, SCAN_RATE_OTHER = 2;
  export const SALVAGE_RANGE = 60, SALVAGE_SPEED = 40, SALVAGE_TICKS = 300, TRAP_HULL = 3, LOOT_HULL = 8;
  export const DERELICT_NEAR_MIN = 700, DERELICT_NEAR_MAX = 1000, DERELICT_FAR_MIN = 1400, DERELICT_FAR_MAX = 1599;
  export const DERELICT_SPAWN_CLEAR = 600, DERELICT_PHASE_DRAWS = 16;
  // sim/tactical/state.ts
  export const HunterMode: { Hunt: 0; Repair: 1; Patrol: 2 };
  export const Contact: { Enemy: 0; Derelict: 1 };
  export const Loot: { Hull: 0; Missiles: 1; Shield: 2 };
  export const CONTACT_MAX_LEVEL: readonly [number, number];   // [2, 1]
  export interface Scan { contact: number; level: number; progress: number; rate: number; by: number }
  export interface Derelict { orbitR: number; phase: number; loot: number; trapped: boolean; salvage: number; salvaged: boolean }
  export function idleScan(): Scan;                          // { contact: -1, level: 0, progress: 0, rate: 0, by: 0 }
  // ShipSystems gains  freq: number
  // TacticalState gains  startTick: number; hostileAt: number; known: [number, number]; scan: Scan; designated: number; weakFreq: number; derelict: Derelict
  // sim/tactical/weapons.ts: ShipInput gains  scanner: boolean
  // sim/tactical/hash.ts
  export const scienceModule: SimModule<TacticalState>;      // id 'science'
  export const TACTICAL_MODULES: readonly SimModule<TacticalState>[];   // [spaceModule, shipModule, scienceModule]
  // scripts/golden/duelOracle.ts: MIGRATIONS[44]
  ```

- [ ] **Step 1: Record both baselines at SIM_VERSION 44, before anything changes**

Check: `git grep -n "SIM_VERSION = " -- src/renderer/src/sim/tuning.ts` prints `src/renderer/src/sim/tuning.ts:7:export const SIM_VERSION = 44;`.

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 44: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs; written to <temp>\trace.json`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `duel oracle baseline at sim version 44: <R> runs, <T> ticks, <F> named fields per tick; written to <temp>\duel-oracle.json`, exit 0. Note `<R>`, `<T>` and `<F>` for Step 10.

- [ ] **Step 2: Write the failing test**

Create `tests/scienceState.test.ts`:

```ts
// Sci-1 (spec 2026-11-17-science-scans §6.2, §6.3 step 1): the science tactical module and each laser's freq, at their
// step-1 neutral values; their order, validation, clone and snapshot round trip; the 44 → 45 alias table. Task 6
// replaces the neutral-values test with the drawn values.
import { describe, expect, it } from 'vitest';
import { hashF64 } from '../src/shared/hash';
import { DUEL_MODULES } from '../src/renderer/src/sim/duel/modules';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { flattenTactical, scienceModule, shipModule, TACTICAL_MODULES } from '../src/renderer/src/sim/tactical/hash';
import { classOf, cloneTactical, CONTACT_MAX_LEVEL, createTacticalState, HunterMode, idleScan, Loot } from '../src/renderer/src/sim/tactical/state';
import { aliasPlan, duelSchema, MIGRATIONS } from '../scripts/golden/duelOracle';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const FIELDS = ['startTick', 'hostileAt', 'known', 'scan.contact', 'scan.level', 'scan.progress', 'scan.rate', 'scan.by', 'designated', 'weakFreq',
  'derelict.orbitR', 'derelict.phase', 'derelict.loot', 'derelict.trapped', 'derelict.salvage', 'derelict.salvaged'];

describe('the science module (spec §6.2)', () => {
  it('sits after ship in both module lists, names its fields in order, and owns the three commands', () => {
    expect(TACTICAL_MODULES.map((m) => m.id)).toEqual(['space', 'ship', 'science']);
    expect(DUEL_MODULES.map(({ module }) => module.id)).toEqual(['space', 'ship', 'science', 'presence', 'repair', 'round', 'helm', 'interior']);
    const st = createTacticalState(3);
    expect(scienceModule.fields(st).map((f) => f.name)).toEqual(FIELDS);
    expect(scienceModule.fields(st).map((f) => f.count)).toEqual([1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect([scienceModule.commands, scienceModule.reasons]).toEqual([[], []]);   // Task 2 fills both
    const ship = shipModule.fields(st).map((f) => f.name);
    for (const i of [0, 1]) expect(ship.indexOf(`systems.${i}.freq`)).toBe(ship.indexOf(`systems.${i}.lock`) + 1);
    expect(CONTACT_MAX_LEVEL).toEqual([2, 1]);
  });
  it('holds the step-1 neutral values (spec §6.3): Hunt and hostile from tick 0, the scan idle, freq 0, the derelict already salvaged', () => {
    const st = createTacticalState(3);
    expect({ startTick: st.startTick, hostileAt: st.hostileAt, mode: st.hunter.mode, known: st.known, scan: st.scan, designated: st.designated, weakFreq: st.weakFreq, derelict: st.derelict })
      .toEqual({ startTick: 0, hostileAt: 0, mode: HunterMode.Hunt, known: [0, 0], scan: idleScan(), designated: -1, weakFreq: 0,
        derelict: { orbitR: 700, phase: 0, loot: Loot.Hull, trapped: false, salvage: 0, salvaged: true } });
    expect(st.systems.map((y) => y.freq)).toEqual([0, 0]);
    expect(st.systems[1].shields).toBe(classOf(st, 1).shields.layers);
    expect(idleScan()).toEqual({ contact: -1, level: 0, progress: 0, rate: 0, by: 0 });
  });
  it('the clone builds fresh known, scan and derelict containers and copies every value', () => {
    const st = createTacticalState(3);
    st.known[0] = 1; st.scan.contact = 0; st.scan.level = 2; st.scan.progress = 40; st.scan.rate = 5; st.scan.by = 3; st.derelict.salvage = 7;
    const copy = cloneTactical(st);
    expect(flattenTactical(copy)).toEqual(flattenTactical(st));
    expect([copy.known === st.known, copy.scan === st.scan, copy.derelict === st.derelict]).toEqual([false, false, false]);
    copy.known[1] = 1; copy.scan.progress = 99; copy.derelict.salvaged = false;
    expect([st.known[1], st.scan.progress, st.derelict.salvaged]).toEqual([0, 40, true]);
  });
});

describe('the science fields in the snapshot (spec §6.2)', () => {
  it('a step-1 snapshot validates and restores; out-of-range values are refused even rehashed, and the edges are accepted', () => {
    const d = createDuel(CUTTER, 3);
    try {
      const snap = saveDuelSnapshot(d, DIGEST), at = new Map<string, number>();
      let k = 1;
      for (const m of TACTICAL_MODULES) for (const f of m.fields(d.tactical)) { at.set(f.name, k); k += f.count; }
      const r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(snap)), DIGEST);
      try { expect(hashDuel(r)).toBe(hashDuel(d)); } finally { disposeDuel(r); }
      const edit = (name: string, j: number, value: number) => { const s = structuredClone(snap); s.values[at.get(name)! + j] = value; s.header.hash = hashF64(Float64Array.from(s.values)); return s; };
      const bad: [string, number, number, RegExp][] = [
        ['hunter.mode', 0, 3, /hunter\.mode/], ['systems.1.shields', 0, 4, /systems\.1\.shields/], ['systems.0.freq', 0, 3, /systems\.0\.freq/], ['systems.1.freq', 0, -1, /systems\.1\.freq/],
        ['startTick', 0, -1, /startTick/], ['hostileAt', 0, -2, /hostileAt/], ['hostileAt', 0, 0.5, /hostileAt/], ['known', 0, 3, /known/], ['known', 1, 2, /known/],
        ['scan.contact', 0, 2, /scan\.contact/], ['scan.contact', 0, -2, /scan\.contact/], ['scan.level', 0, 3, /scan\.level/], ['scan.progress', 0, 0.5, /scan\.progress/],
        ['scan.rate', 0, 3, /scan\.rate/], ['scan.by', 0, -1, /scan\.by/], ['designated', 0, -2, /designated/], ['designated', 0, 2, /designated/], ['weakFreq', 0, 3, /weakFreq/],
        ['derelict.orbitR', 0, 699, /derelict\.orbitR/], ['derelict.orbitR', 0, 1200, /derelict\.orbitR/], ['derelict.orbitR', 0, 1600, /derelict\.orbitR/], ['derelict.orbitR', 0, 700.5, /derelict\.orbitR/],
        ['derelict.phase', 0, 256, /derelict\.phase/], ['derelict.loot', 0, 3, /derelict\.loot/], ['derelict.trapped', 0, 2, /derelict\.trapped/],
        ['derelict.salvage', 0, -1, /derelict\.salvage/], ['derelict.salvaged', 0, 2, /derelict\.salvaged/]
      ];
      for (const [name, j, value, error] of bad) expect(() => validateDuelSnapshot(CUTTER, edit(name, j, value), DIGEST), `${name}[${j}] = ${value}`).toThrow(error);
      const good: [string, number, number][] = [
        ['hunter.mode', 0, HunterMode.Patrol], ['systems.1.shields', 0, 3], ['systems.0.freq', 0, 2], ['hostileAt', 0, -1], ['known', 0, 2], ['known', 1, 1],
        ['scan.contact', 0, 1], ['scan.level', 0, 2], ['scan.rate', 0, 2], ['scan.rate', 0, 5], ['designated', 0, 1], ['weakFreq', 0, 2],
        ['derelict.orbitR', 0, 1000], ['derelict.orbitR', 0, 1400], ['derelict.orbitR', 0, 1599], ['derelict.phase', 0, 255], ['derelict.loot', 0, 2], ['derelict.trapped', 0, 1], ['derelict.salvaged', 0, 0]
      ];
      for (const [name, j, value] of good) expect(() => validateDuelSnapshot(CUTTER, edit(name, j, value), DIGEST), `${name}[${j}] = ${value}`).not.toThrow();
    } finally { disposeDuel(d); }
  });
});

describe('the 44 → 45 alias table (spec §6.3)', () => {
  it('declares the science module and every freq added, and maps every other field to itself', () => {
    const m = MIGRATIONS[44]!;
    expect(m.change).toBe('Sci-1: science scans');
    const d = createDuel(CUTTER, 1);
    try {
      const now = duelSchema(d), fresh = (n: string): boolean => /^science\./.test(n) || /^ship\.systems\.\d+\.freq$/.test(n);
      expect(now.names.filter(fresh)).toEqual([...FIELDS.map((f) => `science.${f}`), 'ship.systems.0.freq', 'ship.systems.1.freq'].sort((a, b) => now.names.indexOf(a) - now.names.indexOf(b)));
      const oldNames = now.names.filter((n) => !fresh(n)), oldCounts = now.counts.filter((_, i) => !fresh(now.names[i]!));
      expect(aliasPlan(oldNames, oldCounts, now.names, now.counts, m).problems).toEqual([]);
      expect(aliasPlan(oldNames, oldCounts, now.names, now.counts).problems).toContain('new field science.startTick is neither mapped nor declared added');
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/scienceState.test.ts`
Expected: FAIL. `scienceModule` is not exported from `sim/tactical/hash` (and `idleScan`, `Loot`, `CONTACT_MAX_LEVEL` from `sim/tactical/state`).

- [ ] **Step 4: The constants**

Append to `src/renderer/src/sim/tactical/tuning.ts`:

```ts

// Science (Sci-1 spec 2026-11-17-science-scans §4): the hostility clock, the scans, the derelict and its salvage.
export const HOSTILE_AFTER_TICKS = 1200;          // the enemy turns hostile on its own in the step of rt 1199 (20 s of Patrol)
/** Scan units to reach each level (index = level); Level 1 at 900, Level 2 at 1800. */
export const SCAN_UNITS: readonly number[] = [0, 900, 1800];
export const SCAN_RATE_SCIENCE = 5;               // units per tick from the Science console
export const SCAN_RATE_OTHER = 2;                 // from the Helm or Weapons console
export const SALVAGE_RANGE = 60;                  // the crew ship within this of the derelict ...
export const SALVAGE_SPEED = 40;                  // ... at most this fast relative to it (u/s) ...
export const SALVAGE_TICKS = 300;                 // ... for 5 s salvages it
export const TRAP_HULL = 3;                       // a trapped derelict costs this much hull
export const LOOT_HULL = 8;                       // Hull loot, capped at the class hull
/** The derelict's orbit bands, clear of the belt (BELT_INNER 1100 to BELT_OUTER 1300). */
export const DERELICT_NEAR_MIN = 700, DERELICT_NEAR_MAX = 1000, DERELICT_FAR_MIN = 1400, DERELICT_FAR_MAX = 1599;
/** Its phase is redrawn while it would start within this of either spawn, at most DERELICT_PHASE_DRAWS draws in all. */
export const DERELICT_SPAWN_CLEAR = 600, DERELICT_PHASE_DRAWS = 16;
```

- [ ] **Step 5: The state**

`src/renderer/src/sim/tactical/state.ts`:

Change the tuning import line to:

```ts
import { DERELICT_NEAR_MIN, HUNTER_MISSILE_COOLDOWN_TICKS, HUNTER_TRAIL_TICKS } from './tuning';
```

In `interface ShipSystems`, after the line `  laserCharge: number; laserHold: number; fireHeld: boolean; lock: number;` add:

```ts
  /** Sci-1 spec §4.4: the laser's tuned frequency 0..2 (A..C); only the crew's ever changes (laserFrequency). */
  freq: number;
```

Replace `export const HunterMode = { Hunt: 0, Repair: 1 } as const;` with:

```ts
/** Patrol (Sci-1 spec §4.2): before it turns hostile the enemy coasts, avoids threats, never fires and regains no shield. */
export const HunterMode = { Hunt: 0, Repair: 1, Patrol: 2 } as const;
```

After the `Outcome` line (`export const Outcome = { Running: 0, CrewWins: 1, EnemyWins: 2, Draw: 3 } as const;`) add:

```ts

/** Map contacts (Sci-1 spec §4): ids, not ship slots. The enemy is drawn and aimed through the hunter's slot; the
 *  derelict has no slot. */
export const Contact = { Enemy: 0, Derelict: 1 } as const;
/** The derelict's loot (spec §4.5). */
export const Loot = { Hull: 0, Missiles: 1, Shield: 2 } as const;
/** The highest level each contact can be known to: the enemy Level 2, the derelict Level 1. */
export const CONTACT_MAX_LEVEL: readonly [number, number] = [2, 1];
/** The ship's one scanner (spec §4.3): the contact and level it scans, its progress in scan units, its rate per tick and
 *  the station index it runs from. Idle: contact −1 and the other four 0. */
export interface Scan { contact: number; level: number; progress: number; rate: number; by: number }
/** The derelict (spec §4.5): its orbit radius and starting phase (a heading index), its loot, whether it is trapped,
 *  the salvage hold in ticks and whether it has been salvaged. */
export interface Derelict { orbitR: number; phase: number; loot: number; trapped: boolean; salvage: number; salvaged: boolean }
/** An idle scanner. */
export function idleScan(): Scan { return { contact: -1, level: 0, progress: 0, rate: 0, by: 0 }; }
```

In `interface TacticalState`, after `  events: DuelEvent[];` add:

```ts
  /** The science module (Sci-1 spec §4, §6.2). `startTick`: the tactical tick the round began on; every round-relative
   *  rule reads rt = tick − startTick. `hostileAt`: the rt the enemy turned hostile, −1 while it patrols. `known`: the
   *  level each contact is known to (Contact order). `scan`: the ship's scanner. `designated`: the contact Science
   *  points out, −1 none (no rule reads it). `weakFreq`: the enemy's weak shield frequency 0..2. `derelict`: the wreck. */
  startTick: number; hostileAt: number; known: [number, number]; scan: Scan; designated: number; weakFreq: number; derelict: Derelict;
```

In `systemsFor`, change `fireHeld: false, lock: Room.Shields,` to `fireHeld: false, lock: Room.Shields, freq: 0,`. In `emptySystems`, change `fireHeld: false, lock: 0,` to `fireHeld: false, lock: 0, freq: 0,`.

In `createTacticalState`, replace the return's last line `    hunter: hunterFor(map.spawns[0]), outcome: Outcome.Running, events: []` with:

```ts
    hunter: hunterFor(map.spawns[0]), outcome: Outcome.Running, events: [],
    // Sci-1 step 1 (spec §6.3): neutral values, no draws: hostile from the start, the scan idle, the derelict salvaged.
    startTick: 0, hostileAt: 0, known: [0, 0], scan: idleScan(), designated: -1, weakFreq: 0,
    derelict: { orbitR: DERELICT_NEAR_MIN, phase: 0, loot: Loot.Hull, trapped: false, salvage: 0, salvaged: true }
```

- [ ] **Step 6: The inputs**

`src/renderer/src/sim/tactical/weapons.ts`: in `interface ShipInput`, after `  missileLaunch: boolean;` add:

```ts
  /** Sci-1 spec §4.6: whether the station running the ship's scan is attended (true when no scan runs). The duel step
   *  computes it for the crew; every other input sets true. */
  scanner: boolean;
```

Replace the `IDLE_INPUT` and `UNCREWED_INPUT` lines with:

```ts
export const IDLE_INPUT: ShipInput = { helm: true, weapons: true, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false, scanner: true };
/** Nobody at either console: a ship nobody flies. */
export const UNCREWED_INPUT: ShipInput = { helm: false, weapons: false, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false, scanner: true };
```

(keep the `/** A crew that sits at both consoles and does nothing. */` comment above `IDLE_INPUT`; the `/** Nobody at either console ... */` comment shown is the existing one.)

`src/renderer/src/sim/tactical/hunter.ts`: replace `  const input: ShipInput = { helm, weapons, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false };` with:

```ts
  const input: ShipInput = { helm, weapons, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false, scanner: true };
```

`src/renderer/src/sim/duel/step.ts`: replace the crew literal (L169) with:

```ts
  const crew: ShipInput = { helm: helm >= 0, weapons: gunner >= 0, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false, scanner: true };
```

In `startRound`, replace `  next.tactical.hunter.lastLaunch += tick;` with:

```ts
  next.tactical.hunter.lastLaunch += tick;
  next.tactical.startTick = tick;   // Sci-1 spec §4.1: the round's rules read rt = tick − startTick; hostileAt is round-relative
```

- [ ] **Step 7: The module, the clone and the validation**

`src/renderer/src/sim/tactical/hash.ts`:

Replace the header's first sentence `declared as two\n// sim modules over the one TacticalState (engine refactor spec §5 and §6, R-2): \`space\` (the slots' bodies, the missile\n// pool, the hunter, the outcome) and \`ship\` (each slot's systems record).` by editing the comment so lines 1-4 read:

```ts
// Canonical flatten and hash of the tactical state (spec §4: same seed and inputs give the same hash), declared as three
// sim modules over the one TacticalState (engine refactor spec §5 and §6, R-2; Sci-1 spec §6.2): `space` (the slots'
// bodies, the missile pool, the hunter, the outcome), `ship` (each slot's systems record) and `science` (hostility, the
// scans, the designation, the weak frequency, the derelict). Flatten, unflatten, clone, validation and the
// completeness test all come from their field lists; flattenTactical is space, ship, science, the duel's order. The map is a
```

(the comment's remaining lines stay.)

Change the tuning import to:

```ts
import { DERELICT_FAR_MAX, DERELICT_FAR_MIN, DERELICT_NEAR_MAX, DERELICT_NEAR_MIN, HEADING_COUNT, HUNTER_TRAIL_TICKS, SCAN_RATE_OTHER, SCAN_RATE_SCIENCE } from './tuning';
```

Replace the `SYSTEMS_TAIL` declaration with:

```ts
const SYSTEMS_TAIL = ['shields', 'shieldClock', 'laserCharge', 'laserHold', 'fireHeld', 'lock', 'freq', 'magazine', 'magazineClock',
  'shots', 'laserHits', 'layersStripped', 'missilesLaunched', 'missileHits', 'missilesLost'] as const satisfies readonly (keyof ShipSystems)[];
```

Replace the block from `/** The tactical state's modules in canonical order. */` through the end of `tacticalLength` with:

```ts
/** The `science` module (Sci-1 spec §6.2): round-relative time and hostility, what each contact is known to, the ship's
 *  one scanner, Science's designation, the enemy's weak frequency and the derelict, in this order. */
const SCIENCE: ModuleField<TacticalState>[] = [
  scalar('startTick', (s) => s.startTick, (s, v) => { s.startTick = v; }),
  scalar('hostileAt', (s) => s.hostileAt, (s, v) => { s.hostileAt = v; }),
  vector('known', 2, (s) => s.known),
  ...(['contact', 'level', 'progress', 'rate', 'by'] as const).map((k) => scalar<TacticalState>(`scan.${k}`, (s) => s.scan[k], (s, v) => { s.scan[k] = v; })),
  scalar('designated', (s) => s.designated, (s, v) => { s.designated = v; }),
  scalar('weakFreq', (s) => s.weakFreq, (s, v) => { s.weakFreq = v; }),
  ...(['orbitR', 'phase', 'loot'] as const).map((k) => scalar<TacticalState>(`derelict.${k}`, (s) => s.derelict[k], (s, v) => { s.derelict[k] = v; })),
  flag('derelict.trapped', (s) => s.derelict.trapped, (s, v) => { s.derelict.trapped = v; }),
  scalar('derelict.salvage', (s) => s.derelict.salvage, (s, v) => { s.derelict.salvage = v; }),
  flag('derelict.salvaged', (s) => s.derelict.salvaged, (s, v) => { s.derelict.salvaged = v; })
];
export const scienceModule: SimModule<TacticalState> = {
  id: 'science',
  fields: () => SCIENCE,
  notSnapshotted: {},
  // Empty until Task 2 adds the three kinds to the codec (tests/duelModules.test.ts and duelCheckpoint.test.ts compare
  // the modules' kinds with the codec's).
  commands: [],
  reasons: []
};
/** The tactical state's modules in canonical order. */
export const TACTICAL_MODULES: readonly SimModule<TacticalState>[] = [spaceModule, shipModule, scienceModule];

/** The space, ship and science modules' values, −0 written as 0. */
export function flattenTactical(s: TacticalState): Float64Array {
  const out: number[] = [];
  for (const m of TACTICAL_MODULES) flattenModule(m, s, out);
  return Float64Array.from(out, (v) => (v === 0 ? 0 : v));
}
/** The number of values flattenTactical writes for this state's map and slots. */
export function tacticalLength(s: TacticalState): number { return TACTICAL_MODULES.reduce((n, m) => n + moduleLength(m, s), 0); }
```

In `cloneTacticalFromModule`, replace `hunter: { ...s.hunter, trail: new Float64Array(s.hunter.trail.length) }, events: s.events.map((e) => ({ ...e })) };` with:

```ts
    hunter: { ...s.hunter, trail: new Float64Array(s.hunter.trail.length) }, events: s.events.map((e) => ({ ...e })),
    known: [0, 0], scan: { ...s.scan }, derelict: { ...s.derelict } };   // fresh science containers; the values are written below
```

In `systemsRules`, replace `shields: within(0, most((c) => c.shields.layers)), ` with `shields: within(0, most((c) => c.shields.layers) + 1), freq: within(0, 2), ` (Sci-1 spec §4.5: Shield loot can reach class layers + 1).

In `topRules`, replace `'hunter.mode': within(HunterMode.Hunt, HunterMode.Repair),` with `'hunter.mode': within(HunterMode.Hunt, HunterMode.Patrol),` and replace the line `  'hunter.fireAt': (v) => Number.isInteger(v) && v >= -1, 'hunter.lastLaunch': int, 'hunter.trailHead': within(0, HUNTER_TRAIL_TICKS - 1), 'hunter.trail': any` with:

```ts
  'hunter.fireAt': (v) => Number.isInteger(v) && v >= -1, 'hunter.lastLaunch': int, 'hunter.trailHead': within(0, HUNTER_TRAIL_TICKS - 1), 'hunter.trail': any,
  // Sci-1 spec §6.2 (known is checked per value in validateTacticalValues).
  startTick: count, hostileAt: (v) => Number.isInteger(v) && v >= -1, 'scan.contact': within(-1, 1), 'scan.level': within(0, 2), 'scan.progress': count,
  'scan.rate': (v) => v === 0 || v === SCAN_RATE_OTHER || v === SCAN_RATE_SCIENCE, 'scan.by': count, designated: within(-1, 1), weakFreq: within(0, 2),
  'derelict.orbitR': (v) => Number.isInteger(v) && ((v >= DERELICT_NEAR_MIN && v <= DERELICT_NEAR_MAX) || (v >= DERELICT_FAR_MIN && v <= DERELICT_FAR_MAX)),
  'derelict.phase': within(0, HEADING_COUNT - 1), 'derelict.loot': within(0, 2), 'derelict.trapped': flagBit, 'derelict.salvage': count, 'derelict.salvaged': flagBit
```

In `validateTacticalValues`, replace `    } else { const rule = top[f.name]; if (rule && !slice.every(rule)) bad('out of range'); }` with:

```ts
    } else if (f.name === 'known') { if (!within(0, 2)(slice[0]!) || !within(0, 1)(slice[1]!)) bad('out of range'); }   // the enemy 0..2, the derelict 0..1
    else { const rule = top[f.name]; if (rule && !slice.every(rule)) bad('out of range'); }
```

`src/renderer/src/sim/duel/modules.ts`: change the import to `import { scienceModule, shipModule, spaceModule } from '../tactical/hash';`, and in `DUEL_MODULES` after the `shipModule` line add:

```ts
  { module: scienceModule as SimModule<never>, state: (d) => d.tactical, path: 'tactical' },
```

In the file's header comment, change `space (the ship slots' bodies, the\n// missile pool, the hunter), ship (each slot's systems record), presence,` so it reads `space (the ship slots' bodies, the\n// missile pool, the hunter), ship (each slot's systems record), science (Sci-1), presence,`.

- [ ] **Step 8: The version and the alias table**

`src/renderer/src/sim/tuning.ts` L7: `export const SIM_VERSION = 45;`

`scripts/golden/duelOracle.ts`: replace the `42:` entry's line and the `};` after it with:

```ts
  42: { change: 'Artemis-ii: helm throttle', rename: () => undefined, derived: [], added: [/^helm\.throttle$/] },
  /** Sci-1 (44 → 45): the science module joins after ship and every laser gains freq; no 44 oracle run scans, designates
   *  or tunes, and step 1's values are neutral, so every run is unchanged per tick. */
  44: { change: 'Sci-1: science scans', rename: () => undefined, derived: [], added: [/^science\./, /^ship\.systems\.\d+\.freq$/] }
};
```

- [ ] **Step 9: The existing tests that name every module, field and range**

`tests/duelModules.test.ts`:
- L15: `import { MISSILE_KEYS, flattenTactical, scienceModule, shipModule, spaceModule, TACTICAL_MODULES, unflattenTactical } from '../src/renderer/src/sim/tactical/hash';`
- L40: `const tacticalExcluded = { ...spaceModule.notSnapshotted, ...shipModule.notSnapshotted, ...scienceModule.notSnapshotted };`
- L53: `const changedFirst = (name: string, v: number): number => (/\.(active|released|fireHeld)$/.test(name) || /^derelict\.(trapped|salvaged)$/.test(name) || name.startsWith('present.') || name === 'hunter.working' ? 1 - v : v + 1);`
- L91: `for (const [m, s] of [[spaceModule, d.tactical], [shipModule, d.tactical], [scienceModule, d.tactical], [presenceModule, d], [repairModule, d], [helmModule, d], [interiorModule, d]] as const)`
- L96: rename the test to `'every space, ship, science, presence and repair field changes the duel hash; the interior is covered by its own flatten'`, and L101: `for (const { module, state } of DUEL_MODULES.slice(0, 5)) {`
- L128: rename the test to `'flatten is the modules in canonical order after SIM_VERSION: space, ship, science, presence, repair, round, helm, interior'`; replace L131-133 with:

```ts
      const space: number[] = [], ship: number[] = [], science: number[] = [];
      flattenModule(spaceModule, d.tactical, space); flattenModule(shipModule, d.tactical, ship); flattenModule(scienceModule, d.tactical, science);
      expect(Array.from(flattenTactical(d.tactical))).toEqual([...space, ...ship, ...science].map((v) => (v === 0 ? 0 : v)));
```

`tests/tacticalDeterminism.test.ts` L115-L116 and L121-L123: replace with

```ts
    expect(Object.keys(st.systems[0]).sort()).toEqual(['cls', 'fireHeld', 'freq', 'hull', 'laserCharge', 'laserHits', 'laserHold', 'layersStripped', 'lock', 'magazine', 'magazineClock', 'missileHits', 'missilesLaunched', 'missilesLost', 'rooms', 'shieldClock', 'shields', 'shots', 'target']);
    expect(Object.keys(st).sort()).toEqual(['derelict', 'designated', 'events', 'grid', 'hostileAt', 'hunter', 'known', 'map', 'missiles', 'outcome', 'rng', 'scan', 'seed', 'ships', 'startTick', 'systems', 'tick', 'weakFreq']);
```

and

```ts
    // Space: 6 header values; per slot active, 12 body scalars and one per graceUntil body; a pool entry of MISSILE_SLOT
    // per slot; hunter 7 scalars + its trail. Ship: per slot 18 scalars and the 3 rooms. Science (Sci-1): 17 values.
    expect(flattenTactical(st).length).toBe(6 + 2 * (13 + st.map.asteroids.length + 2) + 2 * MISSILE_SLOT + 7 + st.hunter.trail.length + 2 * 21 + 17);
```

`tests/duelSnapshot.test.ts` L79 and L82: `['systems.0.shields', 0, 3, /systems\.0\.shields/]` becomes `['systems.0.shields', 0, 4, /systems\.0\.shields/]`, and `['hunter.mode', 0, 2, /hunter\.mode/]` becomes `['hunter.mode', 0, 3, /hunter\.mode/]` (3 layers and Patrol are now valid).

`tests/duelThrottle.test.ts` L53: `expect(DUEL_MODULES.map(({ module }) => module.id)).toEqual(['space', 'ship', 'science', 'presence', 'repair', 'round', 'helm', 'interior']);`

`tests/duelRounds.test.ts` L115: `const stamps = /^(space\.tick|space\.ships\.\d+\.graceUntil|space\.hunter\.lastLaunch|science\.startTick|interior\.tick)$/, fireAt = 'space.hunter.fireAt';`

- [ ] **Step 10: The targeted tests, the typecheck, then both proofs before the bless**

Run: `npx vitest run tests/scienceState.test.ts tests/duelModules.test.ts tests/tacticalDeterminism.test.ts tests/duelSnapshot.test.ts tests/duelThrottle.test.ts tests/duelRounds.test.ts tests/tacticalWeapons.test.ts tests/tacticalHunter.test.ts tests/duelOracle.test.ts`
Expected: PASS (the goldens still read 44, so do not run the golden tests yet).

Run: `npx tsc -b`
Expected: no errors.

Run: `npx tsx scripts/golden/canonical-trace.ts check`
Expected: `per-tick canonical trace identical, sim version 44 → 45: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs (baseline HEAD <sha>)`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts check`
Expected: `duel oracle: <R> runs, <T> ticks, <F> named fields, results, events and telemetry identical at every tick through the 44 → 45 alias table (Sci-1: science scans), sim version 44 → 45 (baseline HEAD <sha>)`, exit 0, with Step 1's `<R>`, `<T>` and `<F>`. Any failure means step 1 changed the gameplay: find it and fix it. Never bless past a failing oracle.

- [ ] **Step 11: Bless (the guard re-runs both proofs), then check the sector golden**

Run: `npm run bless`
Expected, exit 0 (the hashes are new; the counts, ticks and outcomes are unchanged):
```
blessed tests/golden/basic.json: 120 checkpoints, final <hex>
blessed tests/golden/duel-1.json: 13 checkpoints, 8329 ticks, outcome 2, final <hex>
blessed tests/fixtures/determinism-v2.json: sim version 44 → 45, <n> samples and <m> boundaries unchanged apart from the version and hashes
blessed tests/golden/duel-rematch.json: 48 checkpoints, rematch on tick 8329, rounds 8329 ticks outcome 2 then 20802 ticks outcome 1, final <hex>
```

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0.

- [ ] **Step 12: The duel suites and the full suite at SIM_VERSION 45**

Run: `npx vitest run tests/scienceState.test.ts tests/duelGolden.test.ts tests/duelRematchGolden.test.ts tests/duelGates.test.ts tests/duelOracle.test.ts tests/golden.test.ts tests/tacticalSlots.test.ts tests/duelCheckpoint.test.ts`
Expected: PASS. Every pinned scripted number is unchanged at this step.

Run: `npx vitest run --maxWorkers=4`
Expected: PASS, every file.

- [ ] **Step 13: Commit**

```bash
git add src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/modules.ts src/renderer/src/sim/tuning.ts scripts/golden/duelOracle.ts tests/scienceState.test.ts tests/duelModules.test.ts tests/tacticalDeterminism.test.ts tests/duelSnapshot.test.ts tests/duelThrottle.test.ts tests/duelRounds.test.ts tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/fixtures/determinism-v2.json
git commit -m "chore(sci-1): SIM_VERSION 44 -> 45 alone with the science module and each laser's freq at neutral values, blessed (canonical trace and duel oracle prove every run unchanged per tick)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The three commands, their wire and admission, and the Science seat (dormant: the runs stay unchanged)

**Files:**
- Create: `src/renderer/src/sim/tactical/science.ts`, `tests/scienceCommands.test.ts`
- Modify: `src/renderer/src/net/contracts.ts` (DuelCommand), `src/renderer/src/net/codec.ts` (duelWire.commands), `src/renderer/src/sim/duel/state.ts` (DuelState, createDuel), `src/renderer/src/sim/duel/modules.ts` (DUEL_NOT_SNAPSHOTTED), `src/renderer/src/sim/duel/step.ts` (imports, DUEL_KINDS, the sit filter, the admissions, `scanner`)
- Test updates: `tests/duelModules.test.ts:144`, `tests/duelCheckpoint.test.ts:139`, `tests/duel.test.ts:44`, `tests/scienceState.test.ts` (the module's kinds); also `src/renderer/src/sim/tactical/hash.ts` (scienceModule's commands and reasons)

**Interfaces:**
- Consumes: Task 1's `Scan`, `CONTACT_MAX_LEVEL`, `SCAN_RATE_SCIENCE`, `SCAN_RATE_OTHER`, `TacticalState.known/scan/designated`, `ShipSystems.freq`, `ShipInput.scanner`; `attendant(d, station)` (local in `sim/duel/step.ts`); `sitDown(state, pid, i)` (`src/renderer/src/sim/stations.ts`); `duelCodec(2)` (`net/codec.ts`).
- Produces:
  ```ts
  // net/contracts.ts: DuelCommand gains
  //   | { kind: 'contactScan'; contact: number } | { kind: 'designate'; contact: number } | { kind: 'laserFrequency'; freq: number }
  // sim/duel/state.ts: DuelState gains  science: number   (the Science station index, or −1)
  // sim/tactical/science.ts
  export function scanCommand(t: TacticalState, contact: number, rate: number, by: number): 'applied' | 'noop';
  ```

- [ ] **Step 1: Baselines at 45**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline` — Expected: `baseline at sim version 45: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs; written to <temp>\trace.json`, exit 0.
Run: `npx tsx scripts/golden/duel-oracle.ts baseline` — Expected: `duel oracle baseline at sim version 45: <R> runs, <T> ticks, <F> named fields per tick; written to <temp>\duel-oracle.json`, exit 0.

- [ ] **Step 2: Write the failing test**

Create `tests/scienceCommands.test.ts`:

```ts
// Sci-1 (spec 2026-11-17-science-scans §5, §6.1): the three duel commands on the wire, their admission order and
// reasons against the seats, what a scan command does to the scanner, and the Science seat. Task 4 adds the progress.
import { describe, expect, it } from 'vitest';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import { duelCodec } from '../src/renderer/src/net/codec';
import { Position } from '../src/renderer/src/sim/components';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { DUEL_NOT_SNAPSHOTTED } from '../src/renderer/src/sim/duel/modules';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { scanCommand } from '../src/renderer/src/sim/tactical/science';
import { createTacticalState, Outcome } from '../src/renderer/src/sim/tactical/state';
import { SCAN_RATE_OTHER, SCAN_RATE_SCIENCE } from '../src/renderer/src/sim/tactical/tuning';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope =>
  ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = []) => stepDuelTick(d, { held: [NONE, NONE], commands });
const reasons = (r: ReturnType<typeof step>) => r.map((x) => [x.id.player, x.reason ?? x.status]);
/** A fresh duel (both standing) with each player seated where `seats` says (a station index, or −1 to stay standing). */
function seated(seats: [number | 'nav' | 'weapons' | 'science' | -1, number | 'nav' | 'weapons' | 'science' | -1]): DuelState {
  const d = createDuel(CUTTER, 5);
  seats.forEach((s, pid) => { if (s !== -1) sitDown(d.interior, pid, typeof s === 'number' ? s : d[s]); });
  return d;
}

describe('the Science seat (spec §6.1)', () => {
  it('DuelState.science is the layout\'s Science console, declared not snapshotted', () => {
    const d = createDuel(CUTTER, 5);
    try {
      expect(d.science).toBe(d.interior.derived.stationOfKind[StationKind.Science]);
      expect(d.science).toBeGreaterThanOrEqual(0);
      expect(DUEL_NOT_SNAPSHOTTED.science).toBe('the Science station index, from the layout');
    } finally { disposeDuel(d); }
  });
  it('a standing player in reach sits at Science; any other non-role console is still not-in-duel', () => {
    const d = createDuel(CUTTER, 5);
    try {
      const tile = d.interior.derived.stationTile[d.science]!, W = d.interior.derived.width, eid = d.interior.crew[1]!;
      Position.x[eid] = (tile % W) + 0.5; Position.y[eid] = Math.floor(tile / W) + 0.5;
      expect(step(d, [cmd(d, 1, { kind: 'sit', station: d.science })]).map((r) => r.status)).toEqual(['applied']);
      expect(d.interior.stations.occupant[d.science]).toBe(1);
      const medbay = d.interior.derived.stationOfKind[StationKind.Medbay]!;
      expect(step(d, [cmd(d, 0, { kind: 'sit', station: medbay })])[0]).toMatchObject({ status: 'rejected', reason: 'not-in-duel' });
    } finally { disposeDuel(d); }
  });
});

describe('laserFrequency (spec §5)', () => {
  it('stale-tick, then not-at-weapons, then malformed, then noop; the last applied wins', () => {
    const d = seated(['nav', 'weapons']);
    try {
      const r = step(d, [
        cmd(d, 1, { kind: 'laserFrequency', freq: 1 }, d.interior.tick + 1),
        cmd(d, 0, { kind: 'laserFrequency', freq: 1 }),
        cmd(d, 1, { kind: 'laserFrequency', freq: 3 }), cmd(d, 1, { kind: 'laserFrequency', freq: -1 }), cmd(d, 1, { kind: 'laserFrequency', freq: 0.5 }),
        cmd(d, 1, { kind: 'laserFrequency', freq: 0 }),
        cmd(d, 1, { kind: 'laserFrequency', freq: 2 }), cmd(d, 1, { kind: 'laserFrequency', freq: 1 })
      ]);
      expect(reasons(r)).toEqual([[0, 'not-at-weapons'], [1, 'stale-tick'], [1, 'malformed'], [1, 'malformed'], [1, 'malformed'], [1, 'noop'], [1, 'applied'], [1, 'applied']]);
      expect(d.tactical.systems.map((y) => y.freq)).toEqual([1, 0]);
    } finally { disposeDuel(d); }
  });
});

describe('designate (spec §5)', () => {
  it('stale-tick, then invalid-seat (only the Science attendant), then malformed, then noop; the last applied wins', () => {
    const d = seated(['nav', 'science']);
    try {
      const r = step(d, [
        cmd(d, 1, { kind: 'designate', contact: 0 }, d.interior.tick + 1),
        cmd(d, 0, { kind: 'designate', contact: 0 }),
        cmd(d, 1, { kind: 'designate', contact: 2 }), cmd(d, 1, { kind: 'designate', contact: -2 }),
        cmd(d, 1, { kind: 'designate', contact: -1 }),
        cmd(d, 1, { kind: 'designate', contact: 1 }), cmd(d, 1, { kind: 'designate', contact: 0 })
      ]);
      expect(reasons(r)).toEqual([[0, 'invalid-seat'], [1, 'stale-tick'], [1, 'malformed'], [1, 'malformed'], [1, 'noop'], [1, 'applied'], [1, 'applied']]);
      expect(d.tactical.designated).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('an away Science player is invalid-seat', () => {
    const d = seated(['nav', 'science']);
    try {
      step(d, [cmd(d, 1, { kind: 'presence', present: false })]);
      expect(step(d, [cmd(d, 1, { kind: 'designate', contact: 1 })])[0]).toMatchObject({ status: 'rejected', reason: 'invalid-seat' });
      expect(d.tactical.designated).toBe(-1);
    } finally { disposeDuel(d); }
  });
});

describe('contactScan (spec §5)', () => {
  it('stale-tick, then invalid-seat (standing), then malformed, then unavailable (fully known)', () => {
    const d = seated(['science', -1]);
    try {
      d.tactical.known = [2, 0];
      const r = step(d, [
        cmd(d, 1, { kind: 'contactScan', contact: 0 }, d.interior.tick + 1),
        cmd(d, 1, { kind: 'contactScan', contact: 1 }),
        cmd(d, 0, { kind: 'contactScan', contact: 2 }), cmd(d, 0, { kind: 'contactScan', contact: -1 }),
        cmd(d, 0, { kind: 'contactScan', contact: 0 }),
        cmd(d, 0, { kind: 'contactScan', contact: 1 })
      ]);
      expect(reasons(r)).toEqual([[0, 'malformed'], [0, 'malformed'], [0, 'unavailable'], [0, 'applied'], [1, 'stale-tick'], [1, 'invalid-seat']]);
      expect(d.tactical.scan).toMatchObject({ contact: 1, level: 1, rate: SCAN_RATE_SCIENCE, by: d.science });   // progress is Task 4's (scanStep runs in the admitting tick)
    } finally { disposeDuel(d); }
  });
  it('starts at the sender\'s station and rate: the Helm and Weapons at 2, Science at 5', () => {
    for (const [seat, rate] of [['nav', SCAN_RATE_OTHER], ['weapons', SCAN_RATE_OTHER], ['science', SCAN_RATE_SCIENCE]] as const) {
      const d = seated([seat, -1]);
      try {
        expect(step(d, [cmd(d, 0, { kind: 'contactScan', contact: 0 })])[0]!.status).toBe('applied');
        expect(d.tactical.scan).toMatchObject({ contact: 0, level: 1, rate, by: d[seat] });   // progress is Task 4's
      } finally { disposeDuel(d); }
    }
  });
  it('a decided round answers all three duel-decided', () => {
    const d = seated(['weapons', 'science']);
    try {
      d.tactical.systems[1].hull = 0; step(d);
      expect(d.tactical.outcome).toBe(Outcome.CrewWins);
      const r = step(d, [cmd(d, 0, { kind: 'laserFrequency', freq: 1 }), cmd(d, 1, { kind: 'designate', contact: 1 }), cmd(d, 1, { kind: 'contactScan', contact: 0 })]);
      expect(r.map((x) => x.reason)).toEqual(['duel-decided', 'duel-decided', 'duel-decided']);
    } finally { disposeDuel(d); }
  });
});

describe('scanCommand (spec §5): what an admitted scan does to the scanner', () => {
  it('starts idle; a repeat keeps the progress (noop); a faster station takes over; a slower never; the other contact aborts', () => {
    const t = createTacticalState(5);
    expect(scanCommand(t, 0, SCAN_RATE_OTHER, 7)).toBe('applied');
    expect(t.scan).toEqual({ contact: 0, level: 1, progress: 0, rate: 2, by: 7 });
    t.scan.progress = 100;
    expect(scanCommand(t, 0, SCAN_RATE_OTHER, 9)).toBe('noop');
    expect(t.scan).toEqual({ contact: 0, level: 1, progress: 100, rate: 2, by: 7 });
    expect(scanCommand(t, 0, SCAN_RATE_SCIENCE, 3)).toBe('applied');
    expect(t.scan).toEqual({ contact: 0, level: 1, progress: 100, rate: 5, by: 3 });
    expect(scanCommand(t, 0, SCAN_RATE_OTHER, 7)).toBe('noop');
    expect(scanCommand(t, 1, SCAN_RATE_OTHER, 7)).toBe('applied');
    expect(t.scan).toEqual({ contact: 1, level: 1, progress: 0, rate: 2, by: 7 });
    t.known[0] = 1;
    expect(scanCommand(t, 0, SCAN_RATE_SCIENCE, 3)).toBe('applied');
    expect(t.scan).toEqual({ contact: 0, level: 2, progress: 0, rate: 5, by: 3 });
  });
});

describe('the three commands on the wire (spec §5)', () => {
  it('round-trip any integer and refuse a missing, non-integer or non-numeric value, or an extra key', () => {
    const codec = duelCodec(2), envelope = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const c of [{ kind: 'contactScan', contact: 0 }, { kind: 'contactScan', contact: 7 }, { kind: 'designate', contact: -1 }, { kind: 'laserFrequency', freq: 2 }])
      expect(codec.decodeMessage(codec.encodeMessage(envelope(c)))).toEqual(envelope(c));
    for (const bad of [{ kind: 'contactScan' }, { kind: 'contactScan', contact: 0.5 }, { kind: 'designate', contact: '1' }, { kind: 'laserFrequency', freq: 1, extra: 1 }, { kind: 'laserFrequency', freq: Infinity }])
      expect(() => codec.encodeMessage(envelope(bad)), JSON.stringify(bad)).toThrow();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/scienceCommands.test.ts`
Expected: FAIL. `../src/renderer/src/sim/tactical/science` does not resolve.

- [ ] **Step 4: The scan command's effect**

Create `src/renderer/src/sim/tactical/science.ts`:

```ts
// The duel's science rules (Sci-1 spec 2026-11-17-science-scans §4, §5): what an admitted scan command does to the
// ship's one scanner. Tasks 3 to 5 of the plan add hostility, scan progress, the derelict's orbit and salvage. Sim
// code: the heading tables for trig, never Math.sin, Math.cos or Math.PI (the determinism guard).
import type { TacticalState } from './state';

/** A contactScan the duel step admitted (spec §5): scan the next level of `contact` at `rate` from station `by`. On the
 *  same contact and level the progress is kept: a faster station takes the scan over (applied), a slower or equal one
 *  is a noop (Artemis ignores a repeat click). Idle, or on the other contact, it starts afresh (that progress is lost). */
export function scanCommand(t: TacticalState, contact: number, rate: number, by: number): 'applied' | 'noop' {
  const level = t.known[contact]! + 1, s = t.scan;
  if (s.contact === contact && s.level === level) {
    if (rate <= s.rate) return 'noop';
    s.rate = rate; s.by = by;
    return 'applied';
  }
  s.contact = contact; s.level = level; s.progress = 0; s.rate = rate; s.by = by;
  return 'applied';
}
```

- [ ] **Step 5: The wire**

`src/renderer/src/net/contracts.ts`: in `DuelCommand`, after the `throttle` member (`  | { kind: 'throttle'; level: number }`) add:

```ts
  /** Sci-1 spec §5: scan the next level of a contact (0 the enemy, 1 the derelict) from the Helm, Weapons or Science. */
  | { kind: 'contactScan'; contact: number }
  /** Science points out a contact (−1 none, 0 or 1) for every screen. */
  | { kind: 'designate'; contact: number }
  /** Weapons tunes the crew laser to frequency 0..2 (A..C). */
  | { kind: 'laserFrequency'; freq: number }
```

`src/renderer/src/net/codec.ts`: in `duelWire.commands`, after `      z.object({ kind: z.literal('throttle'), level: z.number().finite() }).strict(),` add:

```ts
      z.object({ kind: z.literal('contactScan'), contact: z.number().int() }).strict(),
      z.object({ kind: z.literal('designate'), contact: z.number().int() }).strict(),
      z.object({ kind: z.literal('laserFrequency'), freq: z.number().int() }).strict(),
```

- [ ] **Step 6: The seat**

`src/renderer/src/sim/duel/state.ts`: in `interface DuelState`, replace `  nav: number; weapons: number;` with:

```ts
  nav: number; weapons: number;
  /** The Science console's station index (Sci-1 spec §6.1), or −1 when the layout has none. */
  science: number;
```

In `createDuel`, after the line `if (nav < 0 || weapons < 0) throw new Error('duel layout needs Navigation and Weapons consoles');` add:

```ts
    const science = interior.derived.stationOfKind[StationKind.Science] ?? -1;   // Sci-1 spec §6.1: the third seat
```

and change the return to:

```ts
    return { interior, tactical, present: [true, true], repair: [0, 0, 0], points, nav, weapons, science, events: [], round: 0, helmPlayer, baseTick: 0, decidedTick: -1, throttle: 0 };
```

`src/renderer/src/sim/duel/modules.ts`: in `DUEL_NOT_SNAPSHOTTED`, after the `weapons:` entry add `  science: 'the Science station index, from the layout',`.

- [ ] **Step 7: The admissions**

`src/renderer/src/sim/duel/step.ts`:

Change the imports `import { Outcome } from '../tactical/state';` to `import { CONTACT_MAX_LEVEL, Outcome } from '../tactical/state';`, and add after `import { stepDuel } from '../tactical/duel';`:

```ts
import { scanCommand } from '../tactical/science';
import { SCAN_RATE_OTHER, SCAN_RATE_SCIENCE } from '../tactical/tuning';
```

Replace `DUEL_KINDS` with:

```ts
const DUEL_KINDS = ['sit', 'stand', 'presence', 'laserLock', 'laserCharge', 'missileLaunch', 'rematch', 'throttle', 'contactScan', 'designate', 'laserFrequency'];
```

After the `attendant` function add:

```ts
/** The console (Navigation, Weapons or Science) pid is the present attendant of, or −1 (Sci-1 spec §5: who may scan). */
function scanStation(d: DuelState, pid: number): number {
  for (const s of [d.nav, d.weapons, d.science]) if (s >= 0 && attendant(d, s) === pid) return s;
  return -1;
}
```

Replace the `allowedSits` line with:

```ts
  const roleConsole = (station: number): boolean => station === d.nav || station === d.weapons || (d.science >= 0 && station === d.science);   // Sci-1 spec §6.1
  const allowedSits = sits.filter((e) => e.command.kind === 'sit' && roleConsole(e.command.station));
```

Directly before `  for (const e of input.commands) if (e.command.kind === 'rematch') result(e, 'duel-running');` insert:

```ts
  // Sci-1 (spec §5), against the seats as they now stand: every laserFrequency in envelope order, then every designate,
  // then every contactScan; each is checked for stale-tick first, and within a kind the last applied wins.
  const t = d.tactical, scientist = d.science >= 0 ? attendant(d, d.science) : -1;
  for (const e of input.commands) if (e.command.kind === 'laserFrequency') {
    const freq = e.command.freq;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (gunner < 0 || e.id.player !== gunner) { result(e, 'not-at-weapons'); continue; }
    if (!Number.isInteger(freq) || freq < 0 || freq > 2) { result(e, 'malformed'); continue; }
    if (freq === t.systems[0].freq) { result(e, undefined, 'noop'); continue; }
    t.systems[0].freq = freq; result(e);
  }
  for (const e of input.commands) if (e.command.kind === 'designate') {
    const c = e.command.contact;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (scientist < 0 || e.id.player !== scientist) { result(e, 'invalid-seat'); continue; }
    if (c !== -1 && c !== 0 && c !== 1) { result(e, 'malformed'); continue; }
    if (c === t.designated) { result(e, undefined, 'noop'); continue; }
    t.designated = c; result(e);
  }
  for (const e of input.commands) if (e.command.kind === 'contactScan') {
    const c = e.command.contact, station = scanStation(d, e.id.player);
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (station < 0) { result(e, 'invalid-seat'); continue; }
    if (c !== 0 && c !== 1) { result(e, 'malformed'); continue; }
    if (t.known[c]! >= CONTACT_MAX_LEVEL[c]!) { result(e, 'unavailable'); continue; }
    result(e, undefined, scanCommand(t, c, station === d.science ? SCAN_RATE_SCIENCE : SCAN_RATE_OTHER, station));
  }
  crew.scanner = t.scan.contact < 0 || attendant(d, t.scan.by) >= 0;   // spec §4.6: after admission, so a same-tick takeover keeps it
```

In the `stepDuelTick` doc comment, change `the Helm's throttle (Artemis spec §5.2);` to `the Helm's throttle (Artemis spec §5.2); laserFrequency, designate and contactScan (Sci-1 spec §5);`.

- [ ] **Step 8: The existing tests that list every kind and member**

`src/renderer/src/sim/tactical/hash.ts`, in `scienceModule`: replace `commands: [],` and `reasons: []` (and the two comment lines above them) with:

```ts
  commands: ['contactScan', 'designate', 'laserFrequency'],
  reasons: ['stale-tick', 'invalid-seat', 'not-at-weapons', 'malformed', 'unavailable']
```

`tests/scienceState.test.ts`: replace `expect([scienceModule.commands, scienceModule.reasons]).toEqual([[], []]);   // Task 2 fills both` with `expect([scienceModule.commands, scienceModule.reasons]).toEqual([['contactScan', 'designate', 'laserFrequency'], ['stale-tick', 'invalid-seat', 'not-at-weapons', 'malformed', 'unavailable']]);`.

`tests/duelModules.test.ts` L144: `expect(kinds).toEqual(['contactScan', 'designate', 'laserCharge', 'laserFrequency', 'laserLock', 'missileLaunch', 'presence', 'rematch', 'sit', 'stand', 'throttle']);`

`tests/duelCheckpoint.test.ts` L139: append to the `examples` object, after `throttle: { kind: 'throttle', level: 2 }`, the entries `, contactScan: { kind: 'contactScan', contact: 0 }, designate: { kind: 'designate', contact: 1 }, laserFrequency: { kind: 'laserFrequency', freq: 2 }`.

`tests/duel.test.ts` L44: `expect(Object.keys(createSeatedDuel(layout, 5)).sort()).toEqual(['baseTick', 'decidedTick', 'events', 'helmPlayer', 'interior', 'nav', 'points', 'present', 'repair', 'round', 'science', 'tactical', 'throttle', 'weapons']);`

- [ ] **Step 9: Run the tests and the typecheck**

Run: `npx vitest run tests/scienceCommands.test.ts tests/scienceState.test.ts tests/duelModules.test.ts tests/duelCheckpoint.test.ts tests/duel.test.ts tests/duelThrottle.test.ts tests/commandUnion.test.ts tests/codecModeWire.test.ts tests/duelControls.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 10: Prove every run unchanged at 45**

Run: `npx tsx scripts/golden/duel-oracle.ts same`
Expected: `duel oracle: <R> runs, <T> ticks, <F> named fields, results, events and telemetry identical at every tick <...>, sim version 45 → 45 (baseline HEAD <sha>)`, exit 0.

Run: `npx tsx scripts/golden/canonical-trace.ts same`
Expected: `per-tick canonical trace unchanged at sim version 45: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs (baseline HEAD <sha>)`, exit 0.

Run: `npx vitest run --maxWorkers=4`
Expected: PASS, every file.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/sim/tactical/science.ts src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/sim/duel/state.ts src/renderer/src/sim/duel/modules.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/tactical/hash.ts tests/scienceCommands.test.ts tests/scienceState.test.ts tests/duelModules.test.ts tests/duelCheckpoint.test.ts tests/duel.test.ts
git commit -m "feat(sci-1): contactScan, designate and laserFrequency on the wire and in the duel step; the Science seat (dormant: the oracle proves every run unchanged at 45)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Patrol and hostility (dormant at the neutral values)

**Files:**
- Create: `tests/helpers/hostile.ts`, `tests/scienceHostility.test.ts`
- Modify: `src/renderer/src/sim/tactical/state.ts` (DuelEvent), `src/renderer/src/sim/tactical/science.ts` (append), `src/renderer/src/sim/tactical/hunter.ts` (the Patrol branch), `src/renderer/src/sim/tactical/weapons.ts` (tickWeapons, imports), `src/renderer/src/sim/tactical/duel.ts` (the step), `src/renderer/src/sim/duel/fire.ts` (hitChance), `src/renderer/src/sim/duel/health.ts` (hitDamage), `src/renderer/src/sim/duel/telemetry.ts` (the event loop), `src/renderer/src/render/tactical/fxModel.ts` (pushEvents), `src/renderer/src/audio/duelSounds.ts` (duelEventSounds)

**Interfaces:**
- Consumes: Task 1's `HunterMode.Patrol`, `TacticalState.startTick/hostileAt`, `HOSTILE_AFTER_TICKS`; `threatAhead` (local in `hunter.ts`), `sideOf` (`geometry.ts`), `hunterSlot` (`duel.ts`).
- Produces:
  ```ts
  // sim/tactical/state.ts: DuelEvent gains
  //   | { kind: 'hostile'; cause: 'clock' | 'laser' | 'missile' } | { kind: 'scanDone'; contact: number; level: number } | { kind: 'salvage'; loot: number; trapped: boolean }
  // sim/tactical/science.ts
  export function roundTick(t: TacticalState): number;               // t.tick − t.startTick
  export function hostilityStep(t: TacticalState, hunter: number): void;
  // tests/helpers/hostile.ts
  export function makeHostile(st: TacticalState): TacticalState;     // hostile from 0, full enemy shields, crew freq off the weak one, derelict salvaged
  export function patrol(st: TacticalState): TacticalState;          // hostileAt −1, mode Patrol, enemy shields layers − 1, clock 0
  ```

- [ ] **Step 1: Baselines at 45**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline` and `npx tsx scripts/golden/duel-oracle.ts baseline` (expected output as in Task 2 Step 1).

- [ ] **Step 2: The test helper and the failing test**

Create `tests/helpers/hostile.ts`:

```ts
// Sci-1 test helpers (spec 2026-11-17-science-scans §4.1, §4.2, §4.4). makeHostile puts a tactical state in the world
// before Sci-1, for tests whose subject predates it: the enemy hostile from tick 0 (Hunt, full shields), the crew laser
// off the weak frequency (one layer a hit), and the derelict already salvaged. patrol puts a state in Patrol, as a round
// starts (one enemy shield layer down).
import { classOf, HunterMode, type TacticalState } from '../../src/renderer/src/sim/tactical/state';

export function makeHostile(st: TacticalState): TacticalState {
  st.hostileAt = 0; st.hunter.mode = HunterMode.Hunt;
  st.systems[1].shields = classOf(st, 1).shields.layers;
  st.systems[0].freq = (st.weakFreq + 1) % 3;
  st.derelict.salvaged = true; st.derelict.salvage = 0;
  return st;
}

export function patrol(st: TacticalState): TacticalState {
  st.hostileAt = -1; st.hunter.mode = HunterMode.Patrol;
  st.systems[1].shields = classOf(st, 1).shields.layers - 1; st.systems[1].shieldClock = 0;
  return st;
}
```

Create `tests/scienceHostility.test.ts`:

```ts
// Sci-1 (spec 2026-11-17-science-scans §4.1, §4.2, §4.6): Patrol and the turn to hostility, through stepDuel, on states
// put in Patrol by hand (the Patrol start itself is the plan's Task 6).
import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { hunterThink } from '../src/renderer/src/sim/tactical/hunter';
import { hostilityStep, roundTick } from '../src/renderer/src/sim/tactical/science';
import { classOf, createTacticalState, type DuelEvent, HunterMode, placeMissile, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { HOSTILE_AFTER_TICKS, LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT, tickWeapons, UNCREWED_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { makeHostile, patrol } from './helpers/hostile';

/** In Patrol: the crew at (−600, −300) facing east at the enemy 300 units east of it (in arc and range), both at rest. */
function facing(): TacticalState {
  const st = patrol(createTacticalState(5));
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
  return st;
}
const hostile = (st: TacticalState) => st.events.filter((e) => e.kind === 'hostile');
const crewLaserHit: DuelEvent = { kind: 'laser', ship: 0, hit: true, stripped: true, room: -1, x1: 0, y1: 0, x2: 0, y2: 0 };
const crewMissileOnHunter: DuelEvent = { kind: 'missileEnd', ship: 0, cause: 'ship', target: 1, room: 0, x: 0, y: 0 };

describe('the hostility clock (spec §4.1)', () => {
  it('turns hostile in the step of rt 1199 (cause clock); in Patrol every earlier step, firing nothing and regaining no layer', () => {
    const st = patrol(createTacticalState(5)), layers = classOf(st, 1).shields.layers;   // both on their spawn orbits
    for (let k = 0; k < HOSTILE_AFTER_TICKS - 1; k++) {
      stepDuel(st, UNCREWED_INPUT);
      expect([st.hostileAt, st.hunter.mode, hostile(st).length], `step ${k}`).toEqual([-1, HunterMode.Patrol, 0]);
    }
    const h = st.systems[1];
    expect([h.shots, h.missilesLaunched, h.laserCharge, h.fireHeld, h.shields, h.shieldClock]).toEqual([0, 0, 0, false, layers - 1, 0]);
    expect(roundTick(st)).toBe(HOSTILE_AFTER_TICKS - 1);
    stepDuel(st, UNCREWED_INPUT);
    expect([st.hostileAt, st.hunter.mode]).toEqual([HOSTILE_AFTER_TICKS - 1, HunterMode.Hunt]);
    expect(hostile(st)).toEqual([{ kind: 'hostile', cause: 'clock' }]);
    for (let k = 0; k < 300; k++) stepDuel(st, UNCREWED_INPUT);   // hostile now: Shields at level 0 regain a layer in 300 ticks
    expect(h.shields).toBe(layers);
  });
  it('reads rt from startTick, and a state at the step-1 neutral values never turns', () => {
    const st = patrol(createTacticalState(5));
    st.tick = 5000; st.startTick = 5000 - (HOSTILE_AFTER_TICKS - 1);
    stepDuel(st, UNCREWED_INPUT);
    expect(st.hostileAt).toBe(HOSTILE_AFTER_TICKS - 1);
    const neutral = makeHostile(createTacticalState(5));
    for (let k = 0; k < HOSTILE_AFTER_TICKS + 60; k++) { stepDuel(neutral, UNCREWED_INPUT); expect(hostile(neutral)).toEqual([]); }
    expect(neutral.hostileAt).toBe(0);
  });
});

describe('an ambush turns it hostile at once (spec §2.2, §4.1)', () => {
  it('a crew laser release that hits turns it that tick (cause laser), shields one below; a miss does not', () => {
    const st = facing(); st.tick = 300;
    st.systems[0].fireHeld = true; st.systems[0].laserCharge = LASER_CHARGE_UNITS;
    stepDuel(st, { ...IDLE_INPUT, laserCharge: false });
    expect([st.hostileAt, st.hunter.mode]).toEqual([300, HunterMode.Hunt]);
    expect(hostile(st)).toEqual([{ kind: 'hostile', cause: 'laser' }]);
    expect(st.systems[1].shields).toBe(classOf(st, 1).shields.layers - 2);   // it started one below and lost one
    const miss = facing(); miss.ships[0].heading = 192;   // facing away from it
    miss.systems[0].fireHeld = true; miss.systems[0].laserCharge = LASER_CHARGE_UNITS;
    stepDuel(miss, { ...IDLE_INPUT, laserCharge: false });
    expect(miss.events.some((e) => e.kind === 'laser' && e.ship === 0 && !e.hit)).toBe(true);
    expect(miss.hostileAt).toBe(-1);
  });
  it('a crew missile landing on it turns it hostile (cause missile)', () => {
    const st = facing();
    placeMissile(st, 0, { x: -322, y: -300, vx: 0, vy: 0, heading: 64, headingAcc: 0, age: 100 });
    stepDuel(st, UNCREWED_INPUT);
    expect(st.events.some((e) => e.kind === 'missileEnd' && e.ship === 0 && e.target === 1)).toBe(true);
    expect(hostile(st)).toEqual([{ kind: 'hostile', cause: 'missile' }]);
  });
  it('the cause precedence is laser, missile, clock; only the crew\'s hits count; once hostile it stays', () => {
    const both = facing(); both.events = [crewMissileOnHunter, crewLaserHit]; hostilityStep(both, 1);
    expect(hostile(both)).toEqual([{ kind: 'hostile', cause: 'laser' }]);
    const late = facing(); late.tick = HOSTILE_AFTER_TICKS - 1; late.events = [crewMissileOnHunter]; hostilityStep(late, 1);
    expect(hostile(late)).toEqual([{ kind: 'hostile', cause: 'missile' }]);
    const theirs = facing();
    theirs.events = [{ ...crewLaserHit, ship: 1 } as DuelEvent, { ...crewMissileOnHunter, ship: 1, target: 0 } as DuelEvent, { ...crewMissileOnHunter, cause: 'planet', target: -1 } as DuelEvent];
    hostilityStep(theirs, 1);
    expect([theirs.hostileAt, hostile(theirs)]).toEqual([-1, []]);
    const done = facing(); done.hostileAt = 50; done.hunter.mode = HunterMode.Hunt; done.events = [crewLaserHit]; hostilityStep(done, 1);
    expect([done.hostileAt, hostile(done)]).toEqual([50, []]);
    const none = facing(); none.events = [crewLaserHit]; hostilityStep(none, -1);
    expect(none.hostileAt).toBe(-1);   // no hunter slot: nothing to turn
  });
});

describe('Patrol behaviour (spec §4.2)', () => {
  it('hunterThink: weapons off, no lock, charge or launch, no repair; it coasts, and turns and thrusts away from a threat', () => {
    const st = facing(); st.systems[1].rooms[Room.Engines] = 2;
    const head = st.hunter.trailHead;
    expect(hunterThink(st, 1)).toEqual({ helm: true, weapons: false, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false, scanner: true });
    expect(st.hunter.mode).toBe(HunterMode.Patrol);   // a level-2 room starts no repair in Patrol
    expect(st.hunter.trailHead).toBe((head + 1) % (st.hunter.trail.length / 2));   // the trail ring still advances
    Object.assign(st.ships[1], { x: 0, y: -300, vx: 0, vy: 300, heading: 128 });   // diving at the planet
    const away = hunterThink(st, 1).axes;
    expect(away.thrust).toBe(1); expect(away.turn).not.toBe(0);
  });
  it('tickWeapons holds the hunter\'s shield clock at 0 in Patrol and leaves the crew\'s alone', () => {
    const st = facing(), layers = classOf(st, 1).shields.layers;
    st.systems[0].shields = 0;
    for (let k = 0; k < 400; k++) { tickWeapons(st, 0, IDLE_INPUT); tickWeapons(st, 1, UNCREWED_INPUT); }
    expect([st.systems[0].shields, st.systems[1].shields, st.systems[1].shieldClock]).toEqual([1, layers - 1, 0]);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/scienceHostility.test.ts`
Expected: FAIL. `hostilityStep` and `roundTick` are not exported from `sim/tactical/science`.

- [ ] **Step 4: The event kinds**

`src/renderer/src/sim/tactical/state.ts`: replace the last member of `DuelEvent` (the `missileEnd` line, ending `;`) with:

```ts
  | { kind: 'missileEnd'; ship: number; cause: 'ship' | 'planet' | 'asteroid' | 'edge' | 'expired' | 'missile'; target: number; room: number; x: number; y: number }
  /** Sci-1 spec §4.6: the enemy turned hostile this tick, and why (laser before missile before clock). */
  | { kind: 'hostile'; cause: 'clock' | 'laser' | 'missile' }
  /** A scan finished: `contact` is now known to `level`. */
  | { kind: 'scanDone'; contact: number; level: number }
  /** The derelict was salvaged: its loot, and whether it was trapped. */
  | { kind: 'salvage'; loot: number; trapped: boolean };
```

Every reader of the tactical events that assumed two kinds skips the new ones:
- `src/renderer/src/sim/duel/fire.ts` `hitChance`: make its first line `  if (e.kind !== 'laser' && e.kind !== 'missileEnd') return 0;   // Sci-1's hostile, scanDone and salvage are no hits` (before `if (e.room < 0) return 0;`).
- `src/renderer/src/sim/duel/health.ts` `hitDamage`: the same first line.
- `src/renderer/src/sim/duel/telemetry.ts`: in `for (const e of tac.events) {`, make the first line of the loop body `    if (e.kind !== 'laser' && e.kind !== 'missileEnd') continue;   // Sci-1's events are not weapons`.
- `src/renderer/src/render/tactical/fxModel.ts` `pushEvents`: change `    else fx.items.push({ kind: 'spark',` to `    else if (e.kind === 'contact') fx.items.push({ kind: 'spark',`.
- `src/renderer/src/audio/duelSounds.ts` `duelEventSounds`: change `    } else {` (the contact branch after the `missileEnd` branch) to `    } else if (e.kind === 'contact') {`.

If `npx tsc -b` then reports any other file reading a `DuelEvent` or `ViewEvent` member that the new kinds lack (`room`, `ship`, `target`, `body`, `x`), give that reader the same skip as its first statement and nothing else.

- [ ] **Step 5: The hostility step**

Append to `src/renderer/src/sim/tactical/science.ts`, and change its import line to `import { CREW_SLOT, HunterMode, type TacticalState } from './state';` plus `import { HOSTILE_AFTER_TICKS } from './tuning';`:

```ts

/** The round-relative tick (spec §4.1): ticks since the round began, read before the step's tick++. */
export function roundTick(t: TacticalState): number { return t.tick - t.startTick; }

/** Spec §4.1's hostility step, after the weapon clocks: while the enemy patrols, the first of the clock (the step of rt
 *  HOSTILE_AFTER_TICKS − 1), a crew laser release that hit, or a crew missile landing on the hunter slot turns it
 *  hostile for the round (Hunt) and pushes a hostile event, cause laser, then missile, then clock. */
export function hostilityStep(t: TacticalState, hunter: number): void {
  if (t.hostileAt >= 0 || hunter < 0) return;
  const rt = roundTick(t);
  const laser = t.events.some((e) => e.kind === 'laser' && e.ship === CREW_SLOT && e.hit);
  const missile = t.events.some((e) => e.kind === 'missileEnd' && e.ship === CREW_SLOT && e.cause === 'ship' && e.target === hunter);
  if (!laser && !missile && rt < HOSTILE_AFTER_TICKS - 1) return;
  t.hostileAt = rt; t.hunter.mode = HunterMode.Hunt;
  t.events.push({ kind: 'hostile', cause: laser ? 'laser' : missile ? 'missile' : 'clock' });
}
```

Update the file's header comment's second sentence to `Tasks 3 to 5 of the plan add hostility (here), scan progress, the derelict's orbit and salvage.`

- [ ] **Step 6: Patrol in the hunter and the shield clock**

`src/renderer/src/sim/tactical/hunter.ts`: in `hunterThink`, directly after the trail line (`  h.trail[2 * h.trailHead] = crew.x; h.trail[2 * h.trailHead + 1] = crew.y; h.trailHead = (h.trailHead + 1) % HUNTER_TRAIL_TICKS;`) insert:

```ts
  if (h.mode === HunterMode.Patrol) {   // Sci-1 spec §4.2: coast on its orbit, avoid threats; no repair, no weapons
    const threat = threatAhead(state, i);
    return { helm: true, weapons: false, axes: threat ? { turn: -sideOf(me.heading, threat.x - me.x, threat.y - me.y) || 1, thrust: 1 } : { turn: 0, thrust: 0 },
      steer: 0, laserLock: null, laserCharge: null, missileLaunch: false, scanner: true };
  }
```

(The unused `oldX`/`oldY` locals stay; TypeScript does not flag unused locals in this repo, and they are read below in Hunt.)

`src/renderer/src/sim/tactical/weapons.ts`: change `import { classOf, missileOf, Room, type Axes, type TacticalState } from './state';` to `import { classOf, CREW_SLOT, missileOf, Room, type Axes, type TacticalState } from './state';`. In `tickWeapons`, replace `  if (s.shields >= c.shields.layers) s.shieldClock = 0;` with:

```ts
  const patrolling = state.hostileAt < 0 && i !== CREW_SLOT && c.ai === 'hunter';   // Sci-1 spec §4.2: no layer regained in Patrol
  if (s.shields >= c.shields.layers || patrolling) s.shieldClock = 0;
```

- [ ] **Step 7: The step order**

`src/renderer/src/sim/tactical/duel.ts`: add `import { hostilityStep } from './science';` after the `./physics` import. Replace the doc comment's first sentence with `Order, fixed (Sci-1 spec §4.6): think (the hunter reads the state as it stands), weapon commands (every active ship, in slot order), ships fly, missiles fly, ship contacts, missile contacts, weapon clocks, hostility, outcome, tick.` After `  for (let i = 0; i < n; i++) if (state.ships[i]!.active) tickWeapons(state, i, inputs[i]!);` add:

```ts
  hostilityStep(state, hunter);
```

- [ ] **Step 8: Run the tests and the typecheck**

Run: `npx vitest run tests/scienceHostility.test.ts tests/tacticalHunter.test.ts tests/tacticalWeapons.test.ts tests/duelFire.test.ts tests/duelHealth.test.ts tests/duelTelemetry.test.ts tests/duelAudio.test.ts tests/duelWeaponsView.test.ts tests/determinismGuard.test.ts tests/boundary.test.ts`
Expected: PASS (the determinism guard and the boundary test now also cover `sim/tactical/science.ts`).

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 9: Prove every run unchanged at 45**

Run: `npx tsx scripts/golden/duel-oracle.ts same` and `npx tsx scripts/golden/canonical-trace.ts same` (expected output as in Task 2 Step 10), then `npx vitest run --maxWorkers=4` (PASS).

- [ ] **Step 10: Commit**

```bash
git add tests/helpers/hostile.ts tests/scienceHostility.test.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/science.ts src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/duel.ts src/renderer/src/sim/duel/fire.ts src/renderer/src/sim/duel/health.ts src/renderer/src/sim/duel/telemetry.ts src/renderer/src/render/tactical/fxModel.ts src/renderer/src/audio/duelSounds.ts
git commit -m "feat(sci-1): Patrol and the turn to hostility (clock, laser hit, missile), the hostile/scanDone/salvage event kinds (dormant at the neutral values)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Stage any other file Step 4's rule touched, by name.)

---

### Task 4: Scan progress (dormant: no run scans)

**Files:**
- Create: `tests/scienceScans.test.ts`
- Modify: `src/renderer/src/sim/tactical/science.ts` (append `scanStep`), `src/renderer/src/sim/tactical/duel.ts` (the step)

**Interfaces:**
- Consumes: Task 1's `idleScan`, `SCAN_UNITS`; Task 2's admission and `crew.scanner`; Task 3's `scanDone` event kind.
- Produces:
  ```ts
  // sim/tactical/science.ts
  export function scanStep(t: TacticalState, scanner: boolean): void;
  ```

- [ ] **Step 1: Baselines at 45** — `npx tsx scripts/golden/canonical-trace.ts baseline` and `npx tsx scripts/golden/duel-oracle.ts baseline` (as in Task 2 Step 1).

- [ ] **Step 2: Write the failing test**

Create `tests/scienceScans.test.ts`:

```ts
// Sci-1 (spec 2026-11-17-science-scans §4.3, §4.6, §10 Scans): scan progress through the duel step: the exact times from
// each console, a repeat, a faster seat taking over (also in the tick the slower seat's player stands), switching
// contacts, leaving or going away from the seat, known and scanDone.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { sitDown } from '../src/renderer/src/sim/stations';
import { scanStep } from '../src/renderer/src/sim/tactical/science';
import { Contact, createTacticalState, idleScan } from '../src/renderer/src/sim/tactical/state';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = []) => stepDuelTick(d, { held: [NONE, NONE], commands });
const scan = (contact: number): DuelCommand => ({ kind: 'contactScan', contact });
/** A fresh duel with player 0 at `a` and player 1 at `b`; the crew hull is huge so the long timing runs cannot end the round. */
function crew(a: 'nav' | 'weapons' | 'science', b: 'nav' | 'weapons' | 'science'): DuelState {
  const d = createDuel(CUTTER, 5);
  sitDown(d.interior, 0, d[a]); sitDown(d.interior, 1, d[b]);
  d.tactical.systems[0].hull = 10_000;
  return d;
}
/** Send `contactScan` from pid, then step until `known[contact]` reaches `level`; the steps taken, the admitting one included. */
function stepsToKnow(d: DuelState, pid: number, contact: 0 | 1, level: number): number {
  step(d, [cmd(d, pid, scan(contact))]);
  let n = 1;
  while (d.tactical.known[contact] !== level) { step(d); n++; if (n > 2000) throw new Error('the scan never finished'); }
  return n;
}

describe('scan times (spec §4.3)', () => {
  it('from Science: Level 1 in 180 steps and Level 2 in 360, each with one scanDone in its last step; then unavailable', () => {
    const d = crew('nav', 'science');
    try {
      expect(stepsToKnow(d, 1, Contact.Enemy, 1)).toBe(180);
      expect(d.tactical.events.filter((e) => e.kind === 'scanDone')).toEqual([{ kind: 'scanDone', contact: 0, level: 1 }]);
      expect(d.tactical.scan).toEqual(idleScan());
      expect(stepsToKnow(d, 1, Contact.Enemy, 2)).toBe(360);
      expect(stepsToKnow(d, 1, Contact.Derelict, 1)).toBe(180);
      expect(d.tactical.known).toEqual([2, 1]);
      expect(step(d, [cmd(d, 1, scan(0)), cmd(d, 1, scan(1))]).map((r) => r.reason)).toEqual(['unavailable', 'unavailable']);
    } finally { disposeDuel(d); }
  });
  it('from the Helm: Level 1 in 450 steps and Level 2 in 900; from Weapons the derelict in 450', () => {
    const d = crew('nav', 'weapons');
    try {
      expect(stepsToKnow(d, 0, Contact.Enemy, 1)).toBe(450);
      expect(stepsToKnow(d, 0, Contact.Enemy, 2)).toBe(900);
      expect(stepsToKnow(d, 1, Contact.Derelict, 1)).toBe(450);
    } finally { disposeDuel(d); }
  });
});

describe('who runs the scan (spec §4.3, §5)', () => {
  it('a repeat on the same contact and level is noop and keeps the progress', () => {
    const d = crew('nav', 'science');
    try {
      step(d, [cmd(d, 1, scan(0))]);
      for (let k = 1; k < 50; k++) step(d);
      expect(d.tactical.scan.progress).toBe(250);
      expect(step(d, [cmd(d, 1, scan(0))])[0]!.status).toBe('noop');
      expect(d.tactical.scan.progress).toBe(255);
    } finally { disposeDuel(d); }
  });
  it('a faster seat takes the scan over at its rate and station, keeping the progress', () => {
    const d = crew('nav', 'science');
    try {
      step(d, [cmd(d, 0, scan(0))]);
      for (let k = 1; k < 100; k++) step(d);
      expect(d.tactical.scan).toEqual({ contact: 0, level: 1, progress: 200, rate: 2, by: d.nav });
      expect(step(d, [cmd(d, 1, scan(0))])[0]!.status).toBe('applied');
      expect(d.tactical.scan).toEqual({ contact: 0, level: 1, progress: 205, rate: 5, by: d.science });
      let n = 0;
      while (d.tactical.known[0] === 0) { step(d); n++; }
      expect(n).toBe(139);
    } finally { disposeDuel(d); }
  });
  it('the Helm player stands while Science takes over in the same tick: the scan continues at Science\'s rate', () => {
    const d = crew('nav', 'science');
    try {
      step(d, [cmd(d, 0, scan(0))]);
      for (let k = 1; k < 100; k++) step(d);
      expect(step(d, [cmd(d, 0, { kind: 'stand' }), cmd(d, 1, scan(0))]).map((r) => r.status)).toEqual(['applied', 'applied']);
      expect(d.tactical.scan).toEqual({ contact: 0, level: 1, progress: 205, rate: 5, by: d.science });
    } finally { disposeDuel(d); }
  });
  it('the scanning seat emptied (a stand, or going away) cancels the scan in that tick; its progress is lost', () => {
    for (const leave of [{ kind: 'stand' }, { kind: 'presence', present: false }] as const) {
      const d = crew('nav', 'science');
      try {
        step(d, [cmd(d, 1, scan(1))]);
        for (let k = 1; k < 30; k++) step(d);
        step(d, [cmd(d, 1, leave)]);
        expect(d.tactical.scan, leave.kind).toEqual(idleScan());
        expect(d.tactical.known).toEqual([0, 0]);
      } finally { disposeDuel(d); }
    }
  });
  it('a scan of the other contact aborts this one; its first progress step is in the admitting tick', () => {
    const d = crew('nav', 'science');
    try {
      step(d, [cmd(d, 1, scan(0))]);
      for (let k = 1; k < 50; k++) step(d);
      step(d, [cmd(d, 1, scan(1))]);
      expect(d.tactical.scan).toEqual({ contact: 1, level: 1, progress: 5, rate: 5, by: d.science });
      expect(d.tactical.known).toEqual([0, 0]);
    } finally { disposeDuel(d); }
  });
});

describe('scanStep (spec §4.3)', () => {
  it('idle does nothing; an unattended scanner goes idle; otherwise it advances and finishes at its level\'s units', () => {
    const t = createTacticalState(5);
    scanStep(t, false); expect(t.scan).toEqual(idleScan());
    t.scan = { contact: 1, level: 1, progress: 895, rate: 5, by: 3 };
    scanStep(t, true);
    expect([t.known, t.scan, t.events]).toEqual([[0, 1], idleScan(), [{ kind: 'scanDone', contact: 1, level: 1 }]]);
    t.events = []; t.scan = { contact: 0, level: 1, progress: 10, rate: 2, by: 0 };
    scanStep(t, false);
    expect([t.scan, t.events]).toEqual([idleScan(), []]);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/scienceScans.test.ts`
Expected: FAIL. `scanStep` is not exported from `sim/tactical/science`.

- [ ] **Step 4: The progress step**

`src/renderer/src/sim/tactical/science.ts`: change the imports to `import { CREW_SLOT, HunterMode, idleScan, type TacticalState } from './state';` and `import { HOSTILE_AFTER_TICKS, SCAN_UNITS } from './tuning';`, and append:

```ts

/** Spec §4.3's progress step, after hostility: a running scan advances by its rate while the station running it is
 *  attended (`scanner`, the crew input's), or goes idle when it is not; at its level's units the contact becomes known to
 *  that level, a scanDone event is pushed and the scanner goes idle. */
export function scanStep(t: TacticalState, scanner: boolean): void {
  const s = t.scan;
  if (s.contact < 0) return;
  if (!scanner) { Object.assign(s, idleScan()); return; }
  s.progress += s.rate;
  if (s.progress < SCAN_UNITS[s.level]!) return;
  t.known[s.contact as 0 | 1] = s.level;
  t.events.push({ kind: 'scanDone', contact: s.contact, level: s.level });
  Object.assign(s, idleScan());
}
```

`src/renderer/src/sim/tactical/duel.ts`: change the science import to `import { hostilityStep, scanStep } from './science';`, add `scan progress (the crew input's scanner),` after `hostility,` in the doc comment, and after `  hostilityStep(state, hunter);` add:

```ts
  scanStep(state, crew.scanner);
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run tests/scienceScans.test.ts tests/scienceCommands.test.ts tests/scienceHostility.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Prove every run unchanged at 45** — `npx tsx scripts/golden/duel-oracle.ts same`, `npx tsx scripts/golden/canonical-trace.ts same` (as in Task 2 Step 10), then `npx vitest run --maxWorkers=4` (PASS).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tactical/science.ts src/renderer/src/sim/tactical/duel.ts tests/scienceScans.test.ts
git commit -m "feat(sci-1): scan progress in the duel step: 180/360 steps from Science, 450/900 from the Helm or Weapons; takeover, abort and cancel (dormant: no run scans)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The derelict's orbit and salvage (dormant: the neutral derelict is already salvaged)

**Files:**
- Create: `tests/scienceDerelict.test.ts`
- Modify: `src/renderer/src/sim/tactical/science.ts` (append `derelictPos`, `salvageStep`), `src/renderer/src/sim/tactical/duel.ts` (the step)

**Interfaces:**
- Consumes: Task 1's `Derelict`, `Loot`, `SALVAGE_RANGE`, `SALVAGE_SPEED`, `SALVAGE_TICKS`, `TRAP_HULL`, `LOOT_HULL`; Task 3's `roundTick` and `salvage` event; `circularSpeed` (`sim/tactical/map.ts`), `dirBetween`, `wrapHeading` (`sim/tactical/direction.ts`), `DT`, `HEADING_COUNT` (`sim/tactical/tuning.ts`).
- Produces:
  ```ts
  // sim/tactical/science.ts
  export function derelictPos(t: TacticalState): { x: number; y: number; vx: number; vy: number };
  export function salvageStep(t: TacticalState): void;
  ```

- [ ] **Step 1: Baselines at 45** — `npx tsx scripts/golden/canonical-trace.ts baseline` and `npx tsx scripts/golden/duel-oracle.ts baseline` (as in Task 2 Step 1).

- [ ] **Step 2: Write the failing test**

Create `tests/scienceDerelict.test.ts`:

```ts
// Sci-1 (spec 2026-11-17-science-scans §4.5, §9, §10 Derelict): the derelict's orbit (table trig, the circular speed,
// prograde) and salvage: the hold counts only within range and speed, resets when either fails, completes on the 300th
// step once, applies each loot, and a trap costs 3 hull and can decide the round. The hunter's slot is switched off in
// these states so nothing shoots during the long holds.
import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { circularSpeed } from '../src/renderer/src/sim/tactical/map';
import { derelictPos, salvageStep } from '../src/renderer/src/sim/tactical/science';
import { classOf, createTacticalState, type Derelict, Loot, Outcome, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { DT, SALVAGE_TICKS } from '../src/renderer/src/sim/tactical/tuning';
import { tickWeapons, UNCREWED_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { makeHostile } from './helpers/hostile';

function wreck(over: Partial<Derelict> = {}): TacticalState {
  const st = makeHostile(createTacticalState(5));
  Object.assign(st.derelict, { orbitR: 900, phase: 40, loot: Loot.Hull, trapped: false, salvage: 0, salvaged: false }, over);
  st.ships[1].active = false;   // no hunter: hostility and the enemy's weapons stay out of the salvage
  return st;
}
/** n steps with the crew ship put onto the derelict (its place and velocity, plus dv on x) before each. */
function hold(st: TacticalState, n: number, dv = 0): void {
  for (let k = 0; k < n; k++) {
    const p = derelictPos(st);
    Object.assign(st.ships[0], { x: p.x, y: p.y, vx: p.vx + dv, vy: p.vy });
    stepDuel(st, UNCREWED_INPUT);
  }
}
/** One salvage step that completes the hold, after `prep`. */
function finish(over: Partial<Derelict>, prep: (st: TacticalState) => void = () => {}): TacticalState {
  const st = wreck({ ...over, salvage: SALVAGE_TICKS - 1 });
  prep(st);
  const p = derelictPos(st);
  Object.assign(st.ships[0], { x: p.x, y: p.y, vx: p.vx, vy: p.vy });
  salvageStep(st);
  return st;
}

describe('derelictPos (spec §4.5)', () => {
  it('stays on its orbit at the circular speed, tangential, moving one tick of its velocity per tick', () => {
    const st = wreck({ orbitR: 1450, phase: 200 }), v = circularSpeed(1450);
    for (const rt of [0, 1, 600, 5999, 54000]) {
      st.tick = rt;
      const p = derelictPos(st);
      expect(Math.hypot(p.x, p.y), `radius at ${rt}`).toBeCloseTo(1450, 6);
      expect(Math.hypot(p.vx, p.vy), `speed at ${rt}`).toBeCloseTo(v, 6);
      expect(Math.abs(p.x * p.vx + p.y * p.vy) / (1450 * v), `tangential at ${rt}`).toBeLessThan(0.02);
      st.tick = rt + 1;
      const q = derelictPos(st);
      expect(Math.hypot(q.x - p.x, q.y - p.y) / (v * DT), `step at ${rt}`).toBeCloseTo(1, 1);
      expect((q.x - p.x) * p.vx + (q.y - p.y) * p.vy, `along its velocity at ${rt}`).toBeGreaterThan(0);
    }
  });
  it('starts at its phase (heading 64 is due east) and reads rt from startTick', () => {
    const st = wreck({ orbitR: 800, phase: 64 });
    const p = derelictPos(st);
    expect(p.x).toBeCloseTo(800, 6); expect(p.y).toBeCloseTo(0, 6);
    st.tick = 5000; st.startTick = 5000;
    expect(derelictPos(st)).toEqual(p);
  });
});

describe('salvage (spec §4.5)', () => {
  it('counts each step within 60 and 40 u/s, resets when either fails, and salvages on the 300th, once (unscanned: a gamble)', () => {
    const st = wreck({ loot: Loot.Hull }); st.systems[0].hull = 30;
    hold(st, 100); expect(st.derelict.salvage).toBe(100);
    hold(st, 1, 50); expect(st.derelict.salvage).toBe(0);                  // 50 u/s relative: too fast
    hold(st, 10); expect(st.derelict.salvage).toBe(10);
    const p = derelictPos(st);
    Object.assign(st.ships[0], { x: p.x + 100, y: p.y, vx: p.vx, vy: p.vy }); stepDuel(st, UNCREWED_INPUT);
    expect(st.derelict.salvage).toBe(0);                                    // 100 away: out of range
    hold(st, SALVAGE_TICKS - 1);
    expect([st.derelict.salvage, st.derelict.salvaged]).toEqual([SALVAGE_TICKS - 1, false]);
    hold(st, 1);
    expect([st.derelict.salvage, st.derelict.salvaged, st.systems[0].hull, st.known[1]]).toEqual([0, true, 38, 0]);
    expect(st.events.filter((e) => e.kind === 'salvage')).toEqual([{ kind: 'salvage', loot: Loot.Hull, trapped: false }]);
    hold(st, 60);
    expect([st.derelict.salvage, st.systems[0].hull]).toEqual([0, 38]);
    expect(st.events.filter((e) => e.kind === 'salvage')).toEqual([]);
  });
  it('applies each loot: Hull +8 capped at the class hull, Missiles to a full magazine, Shield +1 up to layers + 1', () => {
    const c = classOf(createTacticalState(5), 0);
    expect(finish({ loot: Loot.Hull }, (st) => { st.systems[0].hull = 20; }).systems[0].hull).toBe(28);
    expect(finish({ loot: Loot.Hull }, (st) => { st.systems[0].hull = c.hull - 3; }).systems[0].hull).toBe(c.hull);
    expect(finish({ loot: Loot.Missiles }, (st) => { st.systems[0].magazine = 1; }).systems[0].magazine).toBe(c.slots.missile.magazine);
    expect(finish({ loot: Loot.Shield }, (st) => { st.systems[0].shields = 0; }).systems[0].shields).toBe(1);
    expect(finish({ loot: Loot.Shield }, (st) => { st.systems[0].shields = c.shields.layers; }).systems[0].shields).toBe(c.shields.layers + 1);
    expect(finish({ loot: Loot.Shield }, (st) => { st.systems[0].shields = c.shields.layers + 1; }).systems[0].shields).toBe(c.shields.layers + 1);
  });
  it('the extra Shield layer is kept but never regained above the class layers', () => {
    const st = finish({ loot: Loot.Shield }), layers = classOf(st, 0).shields.layers;
    expect(st.systems[0].shields).toBe(layers + 1);
    for (let k = 0; k < 1000; k++) tickWeapons(st, 0, UNCREWED_INPUT);
    expect([st.systems[0].shields, st.systems[0].shieldClock]).toEqual([layers + 1, 0]);
  });
  it('a trap costs 3 hull after the loot, with a salvage event saying so; at 2 hull it decides the round in that step', () => {
    const st = finish({ loot: Loot.Missiles, trapped: true }, (s) => { s.systems[0].hull = 10; });
    expect(st.systems[0].hull).toBe(7);
    expect(st.events).toContainEqual({ kind: 'salvage', loot: Loot.Missiles, trapped: true });
    const dead = wreck({ loot: Loot.Missiles, trapped: true, salvage: SALVAGE_TICKS - 1 }); dead.systems[0].hull = 2;
    hold(dead, 1);
    expect([dead.systems[0].hull, dead.outcome]).toEqual([0, Outcome.EnemyWins]);
  });
  it('a decided round runs no salvage, and an already salvaged derelict counts nothing', () => {
    const st = wreck(); st.outcome = Outcome.CrewWins;
    hold(st, 5); expect(st.derelict.salvage).toBe(0);
    const done = wreck({ salvaged: true }); hold(done, 5); expect(done.derelict.salvage).toBe(0);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/scienceDerelict.test.ts`
Expected: FAIL. `derelictPos` is not exported from `sim/tactical/science`.

- [ ] **Step 4: The orbit and the salvage step**

`src/renderer/src/sim/tactical/science.ts`: replace the imports with

```ts
import { dirBetween, wrapHeading } from './direction';
import { circularSpeed } from './map';
import { classOf, CREW_SLOT, HunterMode, idleScan, Loot, type TacticalState } from './state';
import { DT, HEADING_COUNT, HOSTILE_AFTER_TICKS, LOOT_HULL, SALVAGE_RANGE, SALVAGE_SPEED, SALVAGE_TICKS, SCAN_UNITS, TRAP_HULL } from './tuning';
```

and append:

```ts

/** 2π, as a literal: Math.PI is outside the determinism guard's allowlist. */
const TWO_PI = 6.283185307179586;

/** The derelict's place and velocity at the state's round-relative tick (spec §4.5): it circles the planet at the origin
 *  clockwise at radius orbitR and the circular speed, starting at heading `phase`; table trig only. */
export function derelictPos(t: TacticalState): { x: number; y: number; vx: number; vy: number } {
  const { orbitR, phase } = t.derelict, v = circularSpeed(orbitR);
  const wh = ((v / orbitR) * DT * HEADING_COUNT) / TWO_PI, a = phase + wh * roundTick(t), i = Math.floor(a), f = a - i;
  const [ux, uy] = dirBetween(wrapHeading(i), f), [px, py] = dirBetween(wrapHeading(i + HEADING_COUNT / 4), f);   // prograde, as spawnAt
  return { x: ux * orbitR, y: uy * orbitR, vx: px * v, vy: py * v };
}

/** The derelict's loot on the crew's systems (spec §4.5). */
function applyLoot(t: TacticalState, loot: number): void {
  const sys = t.systems[CREW_SLOT], c = classOf(t, CREW_SLOT);
  if (loot === Loot.Hull) sys.hull = Math.min(c.hull, sys.hull + LOOT_HULL);
  else if (loot === Loot.Missiles) sys.magazine = c.slots.missile.magazine;
  else sys.shields = Math.min(c.shields.layers + 1, sys.shields + 1);   // one layer over the class layers, never regained
}

/** Spec §4.5's salvage step, after the scan step: while the derelict is not salvaged, the crew ship within SALVAGE_RANGE
 *  of it and at most SALVAGE_SPEED relative to its velocity adds one to the hold, anything else resets it. At
 *  SALVAGE_TICKS it is salvaged (the hold back to 0): the loot applies, then a trap costs TRAP_HULL hull (floor 0, so the
 *  outcome check that follows can end the round), and a salvage event is pushed. Needs no scan and no seated Helm. */
export function salvageStep(t: TacticalState): void {
  const dr = t.derelict;
  if (dr.salvaged) return;
  const s = t.ships[CREW_SLOT], p = derelictPos(t), dx = s.x - p.x, dy = s.y - p.y, wx = s.vx - p.vx, wy = s.vy - p.vy;
  if (dx * dx + dy * dy > SALVAGE_RANGE * SALVAGE_RANGE || wx * wx + wy * wy > SALVAGE_SPEED * SALVAGE_SPEED) { dr.salvage = 0; return; }
  if (++dr.salvage < SALVAGE_TICKS) return;
  dr.salvage = 0; dr.salvaged = true;
  applyLoot(t, dr.loot);
  if (dr.trapped) { const sys = t.systems[CREW_SLOT]; sys.hull = Math.max(0, sys.hull - TRAP_HULL); }
  t.events.push({ kind: 'salvage', loot: dr.loot, trapped: dr.trapped });
}
```

Update the header comment's second sentence to `Hostility, scan progress, the derelict's orbit and salvage follow; stepDuel calls the three steps in that order (spec §4.6).`

`src/renderer/src/sim/tactical/duel.ts`: change the import to `import { hostilityStep, salvageStep, scanStep } from './science';`, add `salvage,` after `scan progress (the crew input's scanner),` in the doc comment, and after `  scanStep(state, crew.scanner);` add:

```ts
  salvageStep(state);
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run tests/scienceDerelict.test.ts tests/scienceScans.test.ts tests/scienceHostility.test.ts tests/determinismGuard.test.ts tests/boundary.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Prove every run unchanged at 45** — `npx tsx scripts/golden/duel-oracle.ts same`, `npx tsx scripts/golden/canonical-trace.ts same` (as in Task 2 Step 10), then `npx vitest run --maxWorkers=4` (PASS).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tactical/science.ts src/renderer/src/sim/tactical/duel.ts tests/scienceDerelict.test.ts
git commit -m "feat(sci-1): the derelict's orbit (table trig) and salvage: close and slow for 5 s, Hull/Missiles/Shield loot, the trap (dormant: the neutral derelict is salvaged)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The behaviour on: the draws, the Patrol start and the frequency strip; a same-version bless at 45

**Files:**
- Modify: `src/renderer/src/sim/tactical/state.ts` (imports, `scienceDraws`, createTacticalState), `src/renderer/src/sim/tactical/weapons.ts` (fireLaser)
- Create: `tests/scienceFlow.test.ts`
- Modify tests: `tests/scienceState.test.ts` (the neutral-values test becomes the drawn-values test), `tests/tacticalHunter.test.ts`, `tests/tacticalWeapons.test.ts`, `tests/tacticalMissiles.test.ts`, `tests/disabledSystems.test.ts`, `tests/tacticalSlots.test.ts:52`
- Re-measured pins: `tests/duelCheckpoint.test.ts:21, 24` and its summary expectation, `tests/duelModules.test.ts:80, 82`, `tests/duelSnapshot.test.ts:69, 74` and the round case `[2, 5157, /base tick/]`, `tests/tacticalSlots.test.ts:154`, and (only if it fails) `tests/duelOracle.test.ts:83`'s tick
- Regenerated by `npm run bless`: `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, and `tests/golden/basic.json` / `tests/fixtures/determinism-v2.json` if it rewrites them

**Interfaces:**
- Consumes: Tasks 1 to 5 (every science rule); `createRng`, `nextInt` (`src/shared/rng.ts`); `generateMap`, `MapDef` (`sim/tactical/map.ts`); `dirBetween` (`sim/tactical/direction.ts`); `makeHostile`, `patrol` (`tests/helpers/hostile.ts`); `saveDuelSnapshot`, `loadDuelSnapshot`, `validateDuelSnapshot`, `restoreDuelSnapshot` (`sim/duel/snapshot.ts`); `createSeatedDuel` (`tests/helpers/duelSeat.ts`).
- Produces: no new exports. Behaviour: every new round starts in Patrol (`hostileAt` −1, the enemy one shield layer down) with drawn `weakFreq` and derelict; a crew laser on the weak frequency strips `min(2, shields)` layers.

- [ ] **Step 1: A sector baseline at 45, to prove the sector untouched**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 45: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs; written to <temp>\trace.json`, exit 0.

- [ ] **Step 2: Write the failing tests**

In `tests/scienceState.test.ts`, add to the imports:

```ts
import { createRng, nextInt } from '../src/shared/rng';
import { dirBetween } from '../src/renderer/src/sim/tactical/direction';
import { generateMap } from '../src/renderer/src/sim/tactical/map';
```

and replace the whole test `it('holds the step-1 neutral values (spec §6.3): ...', () => { ... });` with:

```ts
  it('draws the weak frequency and the derelict right after the map, in order (spec §4.5), and starts in Patrol one layer down', () => {
    const weak = new Set<number>(), loot = new Set<number>(), bands = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const st = createTacticalState(seed), rng = createRng(seed), map = generateMap(rng);
      const weakFreq = nextInt(rng, 3), u = nextInt(rng, 501), orbitR = u <= 300 ? 700 + u : 1400 + (u - 301);
      const near = (phase: number): boolean => map.spawns.some((s) => {
        const [ux, uy] = dirBetween(phase, 0), dx = ux * orbitR - s.x, dy = uy * orbitR - s.y;
        return dx * dx + dy * dy < 600 * 600;
      });
      let phase = nextInt(rng, 256), draws = 1;
      while (draws < 16 && near(phase)) { phase = nextInt(rng, 256); draws++; }
      const lootDrawn = nextInt(rng, 3), trapped = nextInt(rng, 3) === 0;
      expect({ weakFreq: st.weakFreq, derelict: st.derelict }, `seed ${seed}`).toEqual({ weakFreq, derelict: { orbitR, phase, loot: lootDrawn, trapped, salvage: 0, salvaged: false } });
      expect(st.rng.s, `seed ${seed}: nothing else reads the rng at creation`).toBe(rng.s);
      expect((orbitR >= 700 && orbitR <= 1000) || (orbitR >= 1400 && orbitR <= 1599), `seed ${seed}: orbit ${orbitR} clear of the belt`).toBe(true);
      expect(!near(phase) || draws === 16, `seed ${seed}: 600 clear of both spawns unless all 16 draws were near`).toBe(true);
      expect({ mode: st.hunter.mode, hostileAt: st.hostileAt, startTick: st.startTick, known: st.known, scan: st.scan, designated: st.designated, shields: st.systems.map((y) => y.shields), freq: st.systems.map((y) => y.freq) }, `seed ${seed}`)
        .toEqual({ mode: HunterMode.Patrol, hostileAt: -1, startTick: 0, known: [0, 0], scan: idleScan(), designated: -1, shields: [classOf(st, 0).shields.layers, classOf(st, 1).shields.layers - 1], freq: [0, 0] });
      weak.add(weakFreq); loot.add(lootDrawn); bands.add(orbitR <= 1000 ? 'near' : 'far');
    }
    expect([weak.size, loot.size, bands.size]).toEqual([3, 3, 2]);
  });
```

Also replace the file's header comment's last sentence (`Task 6 replaces the neutral-values test with the drawn values.`) with `Since Task 6 the creation test checks the drawn values and the Patrol start.`, and remove `Loot` from the `sim/tactical/state` import (it is no longer used).

Create `tests/scienceFlow.test.ts`:

```ts
// Sci-1 (spec 2026-11-17-science-scans §3, §4.4, §10): the round with the behaviour on: Patrol again after a rematch,
// the frequency strip, snapshots in Patrol and after Shield loot, an online-style replica restored from the authority's
// snapshots agreeing with it over a run with scans, designation, tuning and salvage, and a scripted enemy that fires
// nothing before it turns hostile.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { loadDuelSnapshot, restoreDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { sitDown } from '../src/renderer/src/sim/stations';
import { derelictPos } from '../src/renderer/src/sim/tactical/science';
import { classOf, createTacticalState, HunterMode, Outcome } from '../src/renderer/src/sim/tactical/state';
import { DERELICT_NEAR_MAX, HOSTILE_AFTER_TICKS, LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { createSeatedDuel } from './helpers/duelSeat';
import { makeHostile } from './helpers/hostile';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = []) => stepDuelTick(d, { held: [NONE, NONE], commands });
/** Player 1 at Weapons, the crew at (−600, −300) facing the enemy 300 east, the laser full and held, the enemy at 2 layers. */
function gunnery(): DuelState {
  const d = createDuel(CUTTER, 5), t = d.tactical;
  sitDown(d.interior, 1, d.weapons);
  Object.assign(t.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(t.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
  t.systems[0].fireHeld = true; t.systems[0].laserCharge = LASER_CHARGE_UNITS; t.systems[1].shields = 2;
  return d;
}

describe('the round (spec §3, §4.1)', () => {
  it('a rematch starts round 2 in Patrol, and Patrol again lasts exactly 1200 steps', () => {
    const d = createSeatedDuel(CUTTER, 3);
    try {
      d.tactical.systems[1].hull = 0; step(d);
      expect(d.tactical.outcome).toBe(Outcome.CrewWins);
      step(d, [cmd(d, 0, { kind: 'rematch' })]);
      expect([d.round, d.tactical.startTick, d.tactical.hostileAt, d.tactical.hunter.mode]).toEqual([1, d.baseTick, -1, HunterMode.Patrol]);
      let n = 0;
      while (d.tactical.hostileAt < 0 && n <= HOSTILE_AFTER_TICKS) { step(d); n++; }
      expect([n, d.tactical.hostileAt]).toEqual([HOSTILE_AFTER_TICKS, HOSTILE_AFTER_TICKS - 1]);
      expect(d.tactical.events).toContainEqual({ kind: 'hostile', cause: 'clock' });
    } finally { disposeDuel(d); }
  });
  it('a scripted duel\'s enemy fires and launches nothing before it turns hostile', () => {
    const d = createSeatedDuel(CUTTER, 1), pair = createScriptedPair(1);
    try {
      while (d.tactical.hostileAt < 0 && d.tactical.outcome === Outcome.Running) {
        stepDuelTick(d, scriptedInput(pair, d));
        if (d.tactical.hostileAt < 0) expect([d.tactical.systems[1].shots, d.tactical.systems[1].missilesLaunched]).toEqual([0, 0]);
      }
      expect(d.tactical.hostileAt).toBeGreaterThanOrEqual(0);
    } finally { disposeDuel(d); }
  });
});

describe('the laser frequency (spec §4.4)', () => {
  it('a release tuned to the weak frequency in the same tick strips 2 layers; 1 when only 1 is up; off it 1', () => {
    const d = gunnery(), t = d.tactical;
    try {
      step(d, [cmd(d, 1, { kind: 'laserFrequency', freq: t.weakFreq }), cmd(d, 1, { kind: 'laserCharge', held: false })]);
      expect([t.systems[0].freq, t.systems[1].shields, t.systems[0].layersStripped]).toEqual([t.weakFreq, 0, 2]);
    } finally { disposeDuel(d); }
    const one = gunnery();
    try {
      one.tactical.systems[1].shields = 1; one.tactical.systems[0].freq = one.tactical.weakFreq;
      step(one, [cmd(one, 1, { kind: 'laserCharge', held: false })]);
      expect([one.tactical.systems[1].shields, one.tactical.systems[0].layersStripped]).toEqual([0, 1]);
    } finally { disposeDuel(one); }
    const off = gunnery();
    try {
      off.tactical.systems[0].freq = (off.tactical.weakFreq + 1) % 3;
      step(off, [cmd(off, 1, { kind: 'laserCharge', held: false })]);
      expect([off.tactical.systems[1].shields, off.tactical.systems[0].layersStripped]).toEqual([1, 1]);
    } finally { disposeDuel(off); }
  });
  it('the hunter\'s laser strips one layer whatever its freq', () => {
    const st = makeHostile(createTacticalState(5));
    Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
    Object.assign(st.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
    st.systems[1].freq = st.weakFreq; st.systems[1].fireHeld = true; st.systems[1].laserCharge = LASER_CHARGE_UNITS;
    applyWeaponsInput(st, 1, { ...IDLE_INPUT, laserCharge: false });
    expect(st.systems[0].shields).toBe(classOf(st, 0).shields.layers - 1);
  });
});

describe('snapshots with the behaviour on (spec §10 Snapshots)', () => {
  it('a snapshot in Patrol (rt 600) and one after Shield loot both validate and restore to the same hash', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      for (let k = 0; k < 600; k++) step(d);
      expect(d.tactical.hostileAt).toBe(-1);
      for (const label of ['patrol', 'shield loot']) {
        if (label === 'shield loot') { d.tactical.systems[0].shields = classOf(d.tactical, 0).shields.layers + 1; d.tactical.derelict.salvaged = true; }
        const r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(saveDuelSnapshot(d, DIGEST))), DIGEST);
        try { expect(hashDuel(r), label).toBe(hashDuel(d)); } finally { disposeDuel(r); }
      }
    } finally { disposeDuel(d); }
  });
  it('a replica restored from the authority every 3 ticks agrees with it over a run with scans, designation, tuning and salvage', () => {
    const seed = Array.from({ length: 20 }, (_, k) => k + 1).find((s) => createTacticalState(s).derelict.orbitR <= DERELICT_NEAR_MAX)!;   // a wreck inside the belt
    const auth = createDuel(CUTTER, seed), replica = createDuel(CUTTER, seed);
    try {
      sitDown(auth.interior, 0, auth.weapons); sitDown(auth.interior, 1, auth.science);
      for (let k = 0; k < 900; k++) {
        const commands: DuelEnvelope[] = [];
        if (k === 2) commands.push(cmd(auth, 1, { kind: 'contactScan', contact: 0 }));
        if (k === 5) commands.push(cmd(auth, 1, { kind: 'designate', contact: 1 }));
        if (k === 7) commands.push(cmd(auth, 0, { kind: 'laserFrequency', freq: 2 }));
        if (k === 200) commands.push(cmd(auth, 1, { kind: 'contactScan', contact: 1 }));
        if (k >= 400 && k < 720) { const p = derelictPos(auth.tactical); Object.assign(auth.tactical.ships[0], { x: p.x, y: p.y, vx: p.vx, vy: p.vy }); }   // hold the crew on the wreck
        step(auth, commands);
        if (k % 3 === 2) {
          const snap = validateDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(saveDuelSnapshot(auth, DIGEST))), DIGEST);
          restoreDuelSnapshot(replica, snap, DIGEST);
          expect(hashDuel(replica), `tick ${k}`).toBe(hashDuel(auth));
        }
      }
      expect([auth.tactical.known, auth.tactical.designated, auth.tactical.systems[0].freq, auth.tactical.derelict.salvaged]).toEqual([[1, 1], 1, 2, true]);
    } finally { disposeDuel(auth); disposeDuel(replica); }
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/scienceState.test.ts tests/scienceFlow.test.ts`
Expected: FAIL: the drawn-values test (still the neutral values), the rematch test (`hostileAt` 0, not −1), the strip test (one layer).

- [ ] **Step 4: The draws and the Patrol start**

`src/renderer/src/sim/tactical/state.ts`:

Replace the imports' first and last lines so the import block reads:

```ts
import { createRng, nextInt, type RngState } from '../../../../shared/rng';
import { DUEL_CLASSES, SHIP_CLASSES, type ShipClassDef } from './defs';
import { dirBetween } from './direction';
import { buildGrid, type BroadPhase } from './grid';
import { generateMap, type MapDef, type Spawn } from './map';
import { cloneTacticalFromModule } from './hash';
import { DERELICT_FAR_MIN, DERELICT_NEAR_MIN, DERELICT_PHASE_DRAWS, DERELICT_SPAWN_CLEAR, HEADING_COUNT, HUNTER_MISSILE_COOLDOWN_TICKS, HUNTER_TRAIL_TICKS } from './tuning';
```

Before `createTacticalState` add:

```ts
/** Sci-1 spec §4.5's draws, in order, from the tactical rng right after the map: the enemy's weak frequency; the
 *  derelict's orbit (u ≤ 300 the near band 700..1000, else the far band 1400..1599); its phase, redrawn while it would
 *  start within DERELICT_SPAWN_CLEAR of either spawn, at most DERELICT_PHASE_DRAWS draws in all (the last stands); its
 *  loot; whether it is trapped (one in three). */
function scienceDraws(rng: RngState, map: MapDef): { weakFreq: number; derelict: Derelict } {
  const weakFreq = nextInt(rng, 3), u = nextInt(rng, 501);
  const orbitR = u <= 300 ? DERELICT_NEAR_MIN + u : DERELICT_FAR_MIN + (u - 301);
  const near = (phase: number): boolean => map.spawns.some((s) => {
    const [ux, uy] = dirBetween(phase, 0), dx = ux * orbitR - s.x, dy = uy * orbitR - s.y;   // derelictPos at rt 0
    return dx * dx + dy * dy < DERELICT_SPAWN_CLEAR * DERELICT_SPAWN_CLEAR;
  });
  let phase = nextInt(rng, HEADING_COUNT);
  for (let draws = 1; draws < DERELICT_PHASE_DRAWS && near(phase); draws++) phase = nextInt(rng, HEADING_COUNT);
  const loot = nextInt(rng, 3), trapped = nextInt(rng, 3) === 0;
  return { weakFreq, derelict: { orbitR, phase, loot, trapped, salvage: 0, salvaged: false } };
}
```

Replace the body of `createTacticalState` from `  const rng = createRng(seed);` to its closing `}` with:

```ts
  const rng = createRng(seed);
  const map = generateMap(rng);
  const science = scienceDraws(rng, map);   // Sci-1 spec §4.5: right after the map, before anything else reads the rng
  const bodies = map.asteroids.length + slots, extra = Array.from({ length: slots - 2 });
  const enemy = systemsFor(DUEL_CLASSES[1]!, 0);
  enemy.shields = SHIP_CLASSES[enemy.cls]!.shields.layers - 1;   // Sci-1 spec §4.1: it patrols one layer down
  return {
    tick: 0, seed, rng, map, grid: buildGrid(map.asteroids, map.rMap),
    ships: [shipAt(map.spawns[0], bodies), shipAt(map.spawns[1], bodies), ...extra.map(() => emptyShip(bodies))],
    systems: [systemsFor(DUEL_CLASSES[0]!, 1), enemy, ...extra.map(emptySystems)],
    missiles: [emptyMissile(), emptyMissile(), ...extra.map(emptyMissile)],
    hunter: { ...hunterFor(map.spawns[0]), mode: HunterMode.Patrol }, outcome: Outcome.Running, events: [],
    // Sci-1 (spec §4): the round starts with the enemy unidentified and in Patrol, the scanner idle.
    startTick: 0, hostileAt: -1, known: [0, 0], scan: idleScan(), designated: -1, weakFreq: science.weakFreq, derelict: science.derelict
  };
}
```

Update `createTacticalState`'s doc comment to end `... (R-5's encounters fill them). The round starts in Patrol with the science draws (Sci-1 spec §4.1, §4.5).`

- [ ] **Step 5: The frequency strip**

`src/renderer/src/sim/tactical/weapons.ts` `fireLaser`: replace `    if (bs.shields > 0) { bs.shields--; bs.shieldClock = 0; as.layersStripped++; stripped = true; }` with:

```ts
    if (bs.shields > 0) {   // Sci-1 spec §4.4: the crew laser tuned to the weak frequency strips 2 layers (as many as are up)
      const n = i === CREW_SLOT && as.freq === state.weakFreq ? Math.min(2, bs.shields) : 1;
      bs.shields -= n; bs.shieldClock = 0; as.layersStripped += n; stripped = true;
    }
```

- [ ] **Step 6: The existing tests whose subject predates Sci-1**

These fixtures build a state and test the enemy's Hunt behaviour, its full shields or a one-layer strip, so they start from `makeHostile` (import it with `import { makeHostile } from './helpers/hostile';`):
- `tests/tacticalHunter.test.ts`: in `facing()` `const st = makeHostile(createTacticalState(5));`; at L99 `const st = makeHostile(createTacticalState(seed));`; at L113 `const st = makeHostile(createTacticalState(5)), d0 = ...` (keep the rest of the line); at L206 `const run = (): string => { const st = makeHostile(createTacticalState(9)); for ...`; at L210 `const st = makeHostile(createTacticalState(9));`.
- `tests/tacticalWeapons.test.ts`, `tests/tacticalMissiles.test.ts`, `tests/disabledSystems.test.ts`: in each `duel()` fixture, `const st = makeHostile(createTacticalState(5));`.
- `tests/tacticalSlots.test.ts` L52: `expect(st.systems.map((y) => [y.hull, y.shields, y.magazine])).toEqual([[SHIP_HULL, SHIELD_LAYERS, MAGAZINE], [SHIP_HULL, SHIELD_LAYERS - 1, MAGAZINE]]);   // Sci-1: the enemy patrols one layer down`

- [ ] **Step 7: Run the science tests, the fixtures and the typecheck**

Run: `npx vitest run tests/scienceState.test.ts tests/scienceFlow.test.ts tests/scienceHostility.test.ts tests/scienceScans.test.ts tests/scienceDerelict.test.ts tests/scienceCommands.test.ts tests/tacticalHunter.test.ts tests/tacticalWeapons.test.ts tests/tacticalMissiles.test.ts tests/disabledSystems.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 8: The sector is untouched**

Run: `npx tsx scripts/golden/canonical-trace.ts same`
Expected: `per-tick canonical trace unchanged at sim version 45: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs (baseline HEAD <sha>)`, exit 0.

- [ ] **Step 9: The same-version bless (a deliberate gameplay change)**

Run: `npm run bless`
Expected: exit 0, with four `blessed ...` lines; the duel lines show new tick counts and hashes; the determinism line reads `sim version 45, <n> samples and <m> boundaries re-executed`.

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0.

Run: `git status --short tests/golden tests/fixtures`
Expected: `tests/golden/duel-1.json` and `tests/golden/duel-rematch.json` modified; `tests/golden/basic.json` and `tests/fixtures/determinism-v2.json` may be; nothing else.

- [ ] **Step 10: Re-measure the scripted-run pins**

Write this scratch script to `.tsout/sci-1-measure.ts` (`.tsout/` is git-ignored; delete the script after this step):

```ts
// Scratch (Sci-1 plan Task 6 Step 10): seed 7's first split tick from 5000 and its decision, and seed 1's seated
// scripted run length, both from the old seated start the pinned tests use.
import { CUTTER } from '../tests/helpers/scriptedDuel';
import { createSeatedDuel } from '../tests/helpers/duelSeat';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { Outcome } from '../src/renderer/src/sim/tactical/state';

function run(seed: number, from: number) {
  const d = createSeatedDuel(CUTTER, seed), pair = createScriptedPair(seed);
  let split = -1, ticks = 0;
  while (d.tactical.outcome === Outcome.Running) {
    stepDuelTick(d, scriptedInput(pair, d)); ticks++;
    const t = d.tactical;
    if (split < 0 && d.interior.tick >= from && t.missiles.filter((m) => m.active).length === 1 && t.systems[0].rooms.some((r) => r > 0) && d.repair.some((r) => r > 0)) split = d.interior.tick;
  }
  const out = { split, ticks, decided: d.decidedTick, outcome: d.tactical.outcome };
  disposeDuel(d);
  return out;
}
const s7 = run(7, 5000), s1 = run(1, 0);
console.log(`seed 7: split ${s7.split}, decided on tick ${s7.decided}, outcome ${s7.outcome}; seed 1 seated scripted: ${s1.ticks} ticks, outcome ${s1.outcome}`);
```

Run: `npx tsx .tsout/sci-1-measure.ts`
Expected: `seed 7: split <S>, decided on tick <D>, outcome <o>; seed 1 seated scripted: <N> ticks, outcome <p>`. If `<S>` is `-1`, no tick from 5000 has the three conditions: stop and report (the tests need another seed or start tick, which is the controller's decision).

Apply the numbers (the duel-fire, duel-health, disable-systems and Artemis-ii merges re-pinned these by the same rule):
- `tests/duelCheckpoint.test.ts` L24: `const SEED = 7, SPLIT = <S>;`. In L21's comment put `<D>` first and restate the outcome word (crew loss, crew win or draw) from the measured `<o>`, then `(<old> before Sci-1, SIM_VERSION 45; ...` before the existing history.
- `tests/duelModules.test.ts` L80 and L82: `played(7, <S>)` and `'seed 7 tick <S> has a missile in flight'`.
- `tests/duelSnapshot.test.ts` L69 and L75: `scriptedDuel(7, <S>)` and `'one missile in flight at seed 7 tick <S>'`; in the round-module cases replace `[2, 5157, /base tick/]` with `[2, <S + 1>, /base tick/]`.
- `tests/tacticalSlots.test.ts` L155: `expect(ticks).toBe(<N>)`, and extend its comment with `; 16268 before Sci-1`.
- Run `npx vitest run tests/duelCheckpoint.test.ts`. If its `toMatchObject` on the end summary fails, copy the received `outcome`, `terminal` and the six counters from the failure diff into the expectation (the passing run's `console.log` prints the same summary).
- Run `npx vitest run tests/duelOracle.test.ts`. If only the `first difference at tick 26` expectation fails, replace `26` with the tick in the received message.

Delete `.tsout/sci-1-measure.ts`.

- [ ] **Step 11: The gates and the full suite**

Run: `npx vitest run tests/duelGolden.test.ts tests/duelRematchGolden.test.ts tests/duelGates.test.ts tests/duelOracle.test.ts tests/duelCheckpoint.test.ts tests/duelModules.test.ts tests/duelSnapshot.test.ts tests/tacticalSlots.test.ts tests/duelFire.test.ts tests/duelHealth.test.ts tests/duelRounds.test.ts tests/duelScripted.test.ts tests/duelTelemetry.test.ts`
Expected: PASS. **`tests/duelGates.test.ts` is a gate, not a pin.** If a seed fails or the median leaves 180 to 300 s, do not tune anything and do not edit the bands: stop and report every seed's `telemetryLine` and the summary line to the controller (the owner decides).

Run: `npx vitest run --maxWorkers=4`
Expected: PASS. The only edits allowed to an existing test here are Step 6's, Step 10's pins, and this one rule: when a test outside the science files fails because its state now starts in Patrol (its assertion is about the enemy firing, launching, repairing, recharging or holding full shields, or a crew hit stripping exactly one layer), insert `makeHostile(<that test's TacticalState>)` (for a duel, `makeHostile(d.tactical)`) right after the state is created, importing it from `./helpers/hostile`, and name each such test in the report. Any other failure is a defect in this task: find its cause, or stop and report it.

- [ ] **Step 12: Commit**

```bash
git add src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/weapons.ts tests/scienceState.test.ts tests/scienceFlow.test.ts tests/tacticalHunter.test.ts tests/tacticalWeapons.test.ts tests/tacticalMissiles.test.ts tests/disabledSystems.test.ts tests/tacticalSlots.test.ts tests/duelCheckpoint.test.ts tests/duelModules.test.ts tests/duelSnapshot.test.ts tests/golden/duel-1.json tests/golden/duel-rematch.json
git add tests/golden/basic.json tests/fixtures/determinism-v2.json tests/duelOracle.test.ts
git commit -m "feat(sci-1): the round starts with the enemy unidentified in Patrol, the weak frequency and the derelict drawn, and the tuned laser strips two layers; goldens re-blessed at SIM_VERSION 45 (deliberate gameplay change: spec 2026-11-17-science-scans §6.3 step 2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The second `git add` stages those files only if they changed; it is harmless otherwise. Stage by name any test Step 11's rule touched.

---

### Task 7: The map: unknown markers, scan rings, the designation, the derelict, the salvage ring, `pickContact`

**Files:**
- Modify: `src/renderer/src/render/tactical/tacticalModel.ts` (imports, draw types, input, the ships loop, the marks, `pickContact`, `LOOT_NAMES`), `src/renderer/src/render/tactical/tacticalLayer.ts` (the marks Graphics and text pools, drawing them), `src/renderer/src/render/tactical/weaponsModel.ts` (the lock marker), `src/renderer/src/app/duel/scene.ts` (`contacts: true`)
- Create: `tests/scienceMap.test.ts`

**Interfaces:**
- Consumes: `derelictPos` (Task 5), `Contact`, `TacticalState.known/scan/designated/derelict` (Task 1), `SCAN_UNITS`, `SALVAGE_TICKS`; `pickShip`, `pickRadius`, `interpolatedShip`, `drawnScale` (`tacticalModel.ts`); `blink`, `CRT`, `ALERT_BLINK_HZ`, `CRT_RAMP` (`crtTheme.ts`).
- Produces:
  ```ts
  // render/tactical/tacticalModel.ts
  export const LOOT_NAMES: readonly ['HULL', 'MISSILES', 'SHIELD'];
  export interface ContactMarkDraw { contact: 0 | 1; x: number; y: number; r: number; unknown: boolean; wreck: boolean; label: string | null; alert: string | null; scan: number | null; designated: boolean }
  export interface SalvageDraw { x: number; y: number; r: number; fill: number }
  export interface LockRingDraw { x: number; y: number; r: number }
  // TacticalDraw gains  marks?: ContactMarkDraw[]; salvage?: SalvageDraw | null; lockRing?: LockRingDraw | null
  // TacticalModelInput: console 'helm' | 'weapons' | 'science'; contacts?: boolean (the duel's scene sets true)
  export function pickContact(input: Pick<TacticalModelInput, 'state' | 'prev' | 'alpha' | 'camera' | 'viewport'>, p: Point): 0 | 1 | null;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/scienceMap.test.ts`:

```ts
// Sci-1 (spec 2026-11-17-science-scans §7.1, §7.2): the console map's contact marks (an unknown contact is a plain `?`,
// the scan ring, Science's designation, the derelict's wreck mark and label, the salvage ring, Science's rotating ring
// on the laser's target), pickContact, and the lock marker hidden on an unknown enemy; the layer draws them in the
// amber ramp only and allocates nothing per frame.
import { describe, expect, it } from 'vitest';
import { BitmapText, Container, Graphics } from 'pixi.js';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { CRT_RAMP } from '../src/renderer/src/render/tactical/crtTheme';
import { createFx } from '../src/renderer/src/render/tactical/fxModel';
import { createTacticalLayer } from '../src/renderer/src/render/tactical/tacticalLayer';
import { pickContact, tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { combatModel } from '../src/renderer/src/render/tactical/weaponsModel';
import { derelictPos } from '../src/renderer/src/sim/tactical/science';
import { createTacticalState, Loot, NO_AXES, type TacticalState } from '../src/renderer/src/sim/tactical/state';

const vp = { w: 1280, h: 720 };
/** The camera on the enemy at zoom 0.5 (the enemy at the screen centre), the duel's contact marks on. */
const input = (st: TacticalState, over: Partial<TacticalModelInput> = {}): TacticalModelInput => ({
  state: st, prev: [], alpha: 1, camera: createCamera(st.ships[1].x, st.ships[1].y, 0.5), viewport: vp, console: 'weapons', axes: NO_AXES,
  ships: [0, 1], paused: false, reserveRight: 0, contacts: true, ...over
});
const onDerelict = (st: TacticalState): Partial<TacticalModelInput> => { const p = derelictPos(st); return { camera: createCamera(p.x, p.y, 0.5) }; };
const onCrew = (st: TacticalState): Partial<TacticalModelInput> => ({ camera: createCamera(st.ships[0].x, st.ships[0].y, 0.5) });
const mark = (st: TacticalState, contact: 0 | 1, over: Partial<TacticalModelInput> = {}) => tacticalModel(input(st, over)).marks!.find((m) => m.contact === contact);

describe('the enemy on the map (spec §7.1)', () => {
  it('unknown: no silhouette, a plain ? mark; at Level 1 the silhouette and a bare mark; without the duel flag, as before', () => {
    const st = createTacticalState(4);
    expect(tacticalModel(input(st)).ships.map((s) => s.index)).not.toContain(1);
    expect(mark(st, 0)).toMatchObject({ contact: 0, x: 640, y: 360, unknown: true, wreck: false, label: null, alert: null, scan: null, designated: false });
    st.known[0] = 1;
    expect(tacticalModel(input(st)).ships.map((s) => s.index)).toContain(1);
    expect(mark(st, 0)).toMatchObject({ unknown: false });
    st.known[0] = 0;
    const plain = tacticalModel(input(st, { contacts: false }));
    expect(plain.ships.map((s) => s.index)).toContain(1);
    expect(plain.marks).toBeUndefined();
  });
  it('the scan ring is the scanner\'s progress on that contact; the designation marks the designated contact', () => {
    const st = createTacticalState(4);
    st.scan = { contact: 0, level: 1, progress: 450, rate: 5, by: 3 };
    expect(mark(st, 0)!.scan).toBeCloseTo(0.5, 9);
    st.designated = 0;
    expect(mark(st, 0)!.designated).toBe(true);
    st.scan = { contact: 1, level: 1, progress: 225, rate: 5, by: 3 }; st.designated = 1;
    expect(mark(st, 1, onDerelict(st))).toMatchObject({ scan: 0.25, designated: true });
    expect(mark(st, 0)).toMatchObject({ scan: null, designated: false });
  });
  it('the map lock marker is hidden while the enemy is unknown (duel flag), shown at Level 1', () => {
    const st = createTacticalState(4), combat = (s: TacticalState) => combatModel({ ...input(s), missilePrev: [null, null], steer: 0, fx: createFx() });
    expect(combat(st).lock).toBeNull();
    st.known[0] = 1;
    expect(combat(st).lock).not.toBeNull();
  });
  it('Science\'s slow ring sits on the laser\'s target; no other console draws it', () => {
    const st = createTacticalState(4);
    const ring = tacticalModel(input(st, { console: 'science' })).lockRing!;
    expect([ring.x, ring.y]).toEqual([640, 360]); expect(ring.r).toBeGreaterThan(10);
    expect(tacticalModel(input(st)).lockRing).toBeNull();
  });
});

describe('the derelict on the map (spec §7.1)', () => {
  it('unknown at Level 0; at Level 1 a wreck with DERELICT and its loot, TRAPPED when trapped, SALVAGED once done', () => {
    const st = createTacticalState(4);
    Object.assign(st.derelict, { loot: Loot.Shield, trapped: true, salvaged: false });
    expect(mark(st, 1, onDerelict(st))).toMatchObject({ x: 640, y: 360, unknown: true, wreck: false, label: null, alert: null });
    st.known[1] = 1;
    expect(mark(st, 1, onDerelict(st))).toMatchObject({ unknown: false, wreck: true, label: 'DERELICT SHIELD', alert: 'TRAPPED' });
    st.derelict.trapped = false; st.derelict.loot = Loot.Missiles;
    expect(mark(st, 1, onDerelict(st))).toMatchObject({ label: 'DERELICT MISSILES', alert: null });
    st.derelict.salvaged = true;
    expect(mark(st, 1, onDerelict(st))).toMatchObject({ label: 'DERELICT SALVAGED', alert: null });
  });
  it('the salvage ring fills round the crew ship while the hold counts, and goes once salvaged', () => {
    const st = createTacticalState(4);
    st.derelict.salvage = 150;
    const s = tacticalModel(input(st, onCrew(st))).salvage!;
    expect([s.x, s.y, s.fill]).toEqual([640, 360, 0.5]);
    st.derelict.salvage = 0;
    expect(tacticalModel(input(st, onCrew(st))).salvage).toBeNull();
    st.derelict.salvage = 150; st.derelict.salvaged = true;
    expect(tacticalModel(input(st, onCrew(st))).salvage).toBeNull();
  });
});

describe('pickContact (spec §7.2)', () => {
  it('the enemy by pickShip, the derelict at derelictPos within the same radius, the nearer of the two, or null', () => {
    const st = createTacticalState(4);
    expect(pickContact(input(st), { x: 640, y: 360 })).toBe(0);
    expect(pickContact(input(st, onDerelict(st)), { x: 640, y: 360 })).toBe(1);
    expect(pickContact(input(st), { x: 640 + 300, y: 360 + 300 })).toBeNull();
    const p = derelictPos(st);
    Object.assign(st.ships[1], { x: p.x + 20, y: p.y });   // 10 px right of the wreck at zoom 0.5
    const both = input(st, onDerelict(st));
    expect(pickContact(both, { x: 641, y: 360 })).toBe(1);
    expect(pickContact(both, { x: 649, y: 360 })).toBe(0);
  });
});

/** Every colour drawn: each Graphics' fill and stroke, and each visible BitmapText's tint (as tests/crtColours.test.ts). */
function colours(root: Container): Set<number> {
  const out = new Set<number>();
  const walk = (o: Container): void => {
    if (o instanceof Graphics) for (const ins of o.context.instructions) if (ins.action === 'fill' || ins.action === 'stroke') out.add(ins.data.style.color);
    if (o instanceof BitmapText && o.visible) out.add(Number(o.tint));
    for (const k of o.children) walk(k as Container);
  };
  walk(root);
  return out;
}
const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);

describe('the layer draws the marks in the amber ramp (CRT map spec section 2)', () => {
  it('every mark kind at two blink phases, only ramp colours; 60 frames allocate nothing', () => {
    const st = createTacticalState(4);
    st.known[1] = 1; Object.assign(st.derelict, { trapped: true, salvage: 120 }); st.scan = { contact: 1, level: 1, progress: 300, rate: 5, by: 3 }; st.designated = 1;
    const p = derelictPos(st);
    Object.assign(st.ships[0], { x: p.x + 30, y: p.y }); Object.assign(st.ships[1], { x: p.x - 60, y: p.y + 40 });   // all three on screen
    const d = tacticalModel(input(st, { ...onDerelict(st), console: 'science' }));
    expect([d.marks!.length, d.salvage !== null, d.lockRing !== null]).toEqual([2, true, true]);
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
    for (const t of [0, 0.3]) {
      layer.draw(d, null, t);
      for (const colour of colours(layer.container)) expect(CRT_RAMP, `${colour.toString(16)} at ${t}`).toContain(colour);
    }
    const n0 = count(layer.container);
    for (let k = 0; k < 60; k++) layer.draw(d, null, k / 7);
    expect(count(layer.container)).toBe(n0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/scienceMap.test.ts`
Expected: FAIL. `pickContact` is not exported (and `contacts` is not a TacticalModelInput member).

- [ ] **Step 3: The model**

`src/renderer/src/render/tactical/tacticalModel.ts`:

Change the imports:

```ts
import { derelictPos } from '../../sim/tactical/science';
import { Contact, CREW_SLOT, missileOf, targetOf, type Axes, type TacticalState } from '../../sim/tactical/state';
import { HEADING_COUNT, R_MAP, SALVAGE_TICKS, SCAN_UNITS, SHIP_RADIUS } from '../../sim/tactical/tuning';
```

After `export interface OverlayDraw ...` add:

```ts
/** The derelict's loot as the map and the contact window name it (Loot order). */
export const LOOT_NAMES = ['HULL', 'MISSILES', 'SHIELD'] as const;
/** Sci-1 spec §7.1: one map contact's mark. `unknown` (Level 0): a plain `?`, no silhouette or shield ring. `wreck`: the
 *  derelict at Level 1, with its `label` and, trapped, the `alert`. `r`: the radius of its scan ring and designation
 *  bracket. `scan`: the scanner's progress 0..1 while it scans this contact, else null. */
export interface ContactMarkDraw { contact: 0 | 1; x: number; y: number; r: number; unknown: boolean; wreck: boolean; label: string | null; alert: string | null; scan: number | null; designated: boolean }
/** The salvage hold as a ring round the crew ship, filled 0..1 over SALVAGE_TICKS. */
export interface SalvageDraw { x: number; y: number; r: number; fill: number }
/** Science's slow rotating ring on the crew laser's target (Artemis). */
export interface LockRingDraw { x: number; y: number; r: number }
```

In `interface TacticalDraw`, after `  stars: Point;` add:

```ts
  /** Sci-1 (only with `contacts`): the contact marks, the salvage ring, Science's lock ring. */
  marks?: ContactMarkDraw[]; salvage?: SalvageDraw | null; lockRing?: LockRingDraw | null;
```

In `interface TacticalModelInput`, replace `  console: 'helm' | 'weapons';` with:

```ts
  console: 'helm' | 'weapons' | 'science';
  /** The duel's contacts (Sci-1 spec §7.1): hide an unknown enemy's silhouette and draw the marks. The flight view leaves it off. */
  contacts?: boolean;
```

In `tacticalModel`, make the first line of the ships loop body (`for (const i of input.ships) {`) this guard:

```ts
    if (input.contacts && i !== CREW_SLOT && i === targetOf(state, CREW_SLOT) && state.known[Contact.Enemy] === 0) continue;   // unknown: a ? mark only
```

Directly before `  const units = [...SCALE_STEPS]` add:

```ts
  // Sci-1 spec §7.1: the contact marks, the salvage ring and Science's ring, in the duel only.
  let marks: ContactMarkDraw[] | undefined, salvage: SalvageDraw | null = null, lockRing: LockRingDraw | null = null;
  if (input.contacts) {
    marks = [];
    const sc = state.scan, scanOf = (c: number): number | null => (sc.contact === c ? Math.min(1, sc.progress / SCAN_UNITS[sc.level]!) : null);
    const enemy = targetOf(state, CREW_SLOT), ringR = SHIP_RADIUS * 2.2 * drawnScale(z);
    if (state.ships[enemy]?.active && input.ships.includes(enemy)) {
      const b = interpolatedShip(state, prev, alpha, enemy), p = toS(b.x, b.y), unknown = state.known[Contact.Enemy] === 0;
      if (onScreen(b.x, b.y, SHIP_RADIUS * 3)) {
        marks.push({ contact: Contact.Enemy, x: p.x, y: p.y, r: unknown ? 14 : Math.max(14, ringR), unknown, wreck: false, label: null, alert: null, scan: scanOf(Contact.Enemy), designated: state.designated === Contact.Enemy });
        if (input.console === 'science') lockRing = { x: p.x, y: p.y, r: Math.max(18, ringR + 6) };
      }
    }
    const w = derelictPos(state), dr = state.derelict, known = state.known[Contact.Derelict] >= 1;
    if (onScreen(w.x, w.y, 40)) {
      const p = toS(w.x, w.y);
      marks.push({ contact: Contact.Derelict, x: p.x, y: p.y, r: 14, unknown: !known, wreck: known, label: known ? `DERELICT ${dr.salvaged ? 'SALVAGED' : LOOT_NAMES[dr.loot] ?? ''}` : null,
        alert: known && dr.trapped && !dr.salvaged ? 'TRAPPED' : null, scan: scanOf(Contact.Derelict), designated: state.designated === Contact.Derelict });
    }
    if (dr.salvage > 0 && !dr.salvaged && input.ships.includes(CREW_SLOT)) salvage = { x: ownS.x, y: ownS.y, r: Math.max(16, ringR), fill: Math.min(1, dr.salvage / SALVAGE_TICKS) };
  }
```

Replace the return's first line `    grid: gridDraw(cam, vp), contours, edge, planet, asteroids, ships, helm, arrows,` with:

```ts
    grid: gridDraw(cam, vp), contours, edge, planet, asteroids, ships, helm, arrows,
    ...(marks ? { marks, salvage, lockRing } : {}),
```

After `pickShip` add:

```ts

/** Sci-1 spec §7.2: the contact under a map click, or null: the enemy by pickShip, the derelict at derelictPos within
 *  the same pickRadius; the nearer of the two wins. */
export function pickContact(input: Pick<TacticalModelInput, 'state' | 'prev' | 'alpha' | 'camera' | 'viewport'>, p: Point): 0 | 1 | null {
  const r = pickRadius(input.camera.zoom), slot = pickShip(input, p);
  let best: 0 | 1 | null = null, bestD = Infinity;
  if (slot !== null) {
    const b = interpolatedShip(input.state, input.prev, input.alpha, slot), s = worldToScreen(input.camera, input.viewport, b.x, b.y);
    best = Contact.Enemy; bestD = Math.hypot(s.x - p.x, s.y - p.y);
  }
  const w = derelictPos(input.state), s = worldToScreen(input.camera, input.viewport, w.x, w.y), dd = Math.hypot(s.x - p.x, s.y - p.y);
  if (dd <= r && dd < bestD) best = Contact.Derelict;
  return best;
}
```

`src/renderer/src/render/tactical/weaponsModel.ts`: add `Contact` to its `sim/tactical/state` import, and replace `  if (onScreen(enemyS, SHIP_RADIUS * 2 * z + 40)) {` with:

```ts
  if (!(input.contacts && state.known[Contact.Enemy] === 0) && onScreen(enemyS, SHIP_RADIUS * 2 * z + 40)) {   // Sci-1: no lock mark on an unknown contact
```

- [ ] **Step 4: The layer**

`src/renderer/src/render/tactical/tacticalLayer.ts`:

Change the crtTheme import to `import { ALERT_BLINK_HZ, blink, CRT, DAMAGE_BLINK_HZ, DASH, DOT, DOT_GAP, ENEMY_BLINK_HZ, GAP, HATCH_ANGLE, HATCH_SPACING, roomLevel, roomLook } from './crtTheme';` and the tacticalModel import to add `type ContactMarkDraw`.

After `const GRID_LABELS = 12, RING_LABELS = 12, ARROWS = 4;` add:

```ts
/** Sci-1: the contact marks (at most the enemy and the derelict); Science's ring turns at this many radians a second;
 *  the designation bracket pulses at this rate. */
const MARKS = 2, LOCK_RING_SPEED = 0.8, DESIGNATE_PULSE_HZ = 1;
```

Replace the Graphics line and the two after it with:

```ts
  const bg = new Graphics(), stars = new Graphics(), grid = new Graphics(), contours = new Graphics(), bodies = new Graphics(), arcs = new Graphics(), ships = new Graphics(), marks = new Graphics(), helm = new Graphics(), combat = new Graphics(), overlay = new Graphics();
  bloom.addChild(bg, stars, grid, contours, bodies, arcs, ships, marks, helm, combat, overlay);
  const drawn = [grid, contours, bodies, arcs, ships, marks, helm, combat, overlay, lockBar];
```

After the `arrowText` pool line add:

```ts
  const markQ = Array.from({ length: MARKS }, () => mk(FONT_SIZE, CRT.dim, 0.5, 0.5));
  const markLabel = Array.from({ length: MARKS }, () => mk(FONT_NATIVE, CRT.mid, 0, 0.5));
  const markAlert = Array.from({ length: MARKS }, () => mk(FONT_NATIVE, CRT.hot, 0, 0.5));
```

and change `const texts = [...cols, ...rows, ...ring, ...arrowText, lockText, info];` to `const texts = [...cols, ...rows, ...ring, ...arrowText, ...markQ, ...markLabel, ...markAlert, lockText, info];`.

Before `  return {` (the layer object) add:

```ts
  /** Four corner brackets of half-size r about (x, y). */
  function bracket(g: Graphics, x: number, y: number, r: number, alpha: number): void {
    const k = r * 0.45;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
      g.moveTo(x + sx * r, y + sy * (r - k)).lineTo(x + sx * r, y + sy * r).lineTo(x + sx * (r - k), y + sy * r).stroke({ width: 2, color: CRT.hot, alpha });
  }
  /** Sci-1 spec §7.1: the contact marks, the salvage ring and Science's ring, then their text. */
  function drawMarks(d: TacticalDraw, t: number): void {
    const list: readonly ContactMarkDraw[] = d.marks ?? [];
    for (const m of list) {
      if (m.unknown) marks.circle(m.x, m.y, 9).stroke({ width: 1, color: CRT.dim });
      if (m.wreck) {   // a broken hull: two offset plates and a spar
        marks.rect(m.x - 7, m.y - 3, 8, 6).stroke({ width: 1, color: CRT.mid });
        marks.rect(m.x + 3, m.y - 7, 5, 4).stroke({ width: 1, color: CRT.mid });
        marks.moveTo(m.x + 1, m.y + 3).lineTo(m.x + 7, m.y + 7).stroke({ width: 1, color: CRT.mid });
      }
      if (m.scan !== null) {
        marks.circle(m.x, m.y, m.r).stroke({ width: 1, color: CRT.faint });
        if (m.scan > 0) marks.moveTo(m.x, m.y - m.r).arc(m.x, m.y, m.r, -Math.PI / 2, -Math.PI / 2 + m.scan * 2 * Math.PI).stroke({ width: 2, color: CRT.main });
      }
      if (m.designated) bracket(marks, m.x, m.y, m.r + 6, blink(t, DESIGNATE_PULSE_HZ) ? 1 : 0.45);
    }
    const s = d.salvage ?? null;
    if (s) {
      marks.circle(s.x, s.y, s.r).stroke({ width: 1, color: CRT.faint });
      marks.moveTo(s.x, s.y - s.r).arc(s.x, s.y, s.r, -Math.PI / 2, -Math.PI / 2 + s.fill * 2 * Math.PI).stroke({ width: 2, color: CRT.hot });
    }
    const lr = d.lockRing ?? null;
    if (lr) for (let k = 0; k < 4; k++) {
      const a = t * LOCK_RING_SPEED + (k * Math.PI) / 2;
      marks.moveTo(lr.x + Math.cos(a) * lr.r, lr.y + Math.sin(a) * lr.r).arc(lr.x, lr.y, lr.r, a, a + Math.PI / 4).stroke({ width: 1, color: CRT.mid });
    }
    fill(markQ, list.filter((m) => m.unknown).map((m) => ({ text: '?', x: m.x, y: m.y })));
    fill(markLabel, list.flatMap((m) => (m.label ? [{ text: m.label, x: m.x + m.r + 6, y: m.y - 6 }] : [])));
    fill(markAlert, list.flatMap((m) => (m.alert ? [{ text: m.alert, x: m.x + m.r + 6, y: m.y + 10 }] : [])));
    const alertTint = blink(t, ALERT_BLINK_HZ) ? CRT.hot : CRT.main;
    for (const a of markAlert) a.tint = alertTint;
  }
```

In `draw`, after `      for (const s of d.ships) drawShip(ships, s, t);` add `      drawMarks(d, t);`.

`src/renderer/src/app/duel/scene.ts`: in the map `input` object, after `ships: [0, 1], paused: overlay.layerPaused,` insert `contacts: true,`.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run tests/scienceMap.test.ts tests/crtColours.test.ts tests/tacticalModel.test.ts tests/tacticalLayer.test.ts tests/duelWeaponsView.test.ts tests/contactScene.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/render/tactical/weaponsModel.ts src/renderer/src/app/duel/scene.ts tests/scienceMap.test.ts
git commit -m "feat(sci-1): the map's contact marks: an unknown ? contact, the scan ring, the designation, the derelict and its label, the salvage ring, Science's ring; pickContact" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The Science seat in the app: seat, view, camera, tab and readout mode

**Files:**
- Modify: `src/renderer/src/app/duel/controls.ts` (Seat, seatOf, consoleInReach), `src/renderer/src/app/duel/runtime.ts` (DuelView, cameras, view, otherStatus, play, frame), `src/renderer/src/app/duel/onlineSource.ts` (cameras, otherStatus, frame), `src/renderer/src/app/duel/onlineDuel.ts` (play, the notice), `src/renderer/src/app/duel/scene.ts` (DuelViewSource.cameras), `src/renderer/src/render/crt.ts` (CrtView), `src/renderer/src/render/duel/readoutModel.ts` (ReadoutMode, OtherStatus, the heading, readoutHelp), `src/renderer/src/render/duel/consoleModel.ts` (ConsoleStation, consoleTabs, consoleModel's reach), `src/renderer/src/render/duel/consoleLayout.ts` (TABS_RIGHT, STATION.h.science, stationTop), `src/renderer/src/ui/duel/TabStrip.tsx` (ORDER), `src/renderer/src/app/uiProbe.ts` (the fixture's tabs)
- Create: `tests/scienceSeat.test.ts`
- Test updates: `tests/uiConsole.test.tsx:21, 25` (the tab literals), `tests/duelConsoleModel.test.ts:31` (TABS_RIGHT) and `:106` (becomes `toEqual({ helm: 'locked', weapons: 'locked', science: 'locked', ship: 'current' })`)

**Interfaces:**
- Consumes: Task 2's `DuelState.science`; `sitDown`, `standUp` (`sim/stations.ts`).
- Produces:
  ```ts
  // app/duel/controls.ts
  export type Seat = 'helm' | 'weapons' | 'science' | 'standing';
  // app/duel/runtime.ts
  export type DuelView = 'helm' | 'weapons' | 'science' | 'interior';
  // DuelRuntime.cameras and DuelViewSource.cameras: { helm: Camera; weapons: Camera; science: Camera }
  // render/duel/consoleModel.ts
  export type ConsoleStation = 'helm' | 'weapons' | 'science' | 'ship';
  // render/duel/readoutModel.ts: ReadoutMode adds 'science'; OtherStatus adds 'AT SCIENCE'
  // render/duel/consoleLayout.ts: STATION.h.science = 96; stationTop(s: 'helm' | 'weapons' | 'science'); TABS_RIGHT = 408
  // render/crt.ts: CrtView adds 'science'
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/scienceSeat.test.ts`:

```ts
// Sci-1 (spec 2026-11-17-science-scans §6.1, §7.3): the Science seat in the app: seatOf and the console station, the
// reach to sit, the tab strip, the console model, the runtime's view, camera and partner status, the readout mode and
// the CRT.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position } from '../src/renderer/src/sim/components';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { sitDown, standUp } from '../src/renderer/src/sim/stations';
import { consoleInReach, seatOf } from '../src/renderer/src/app/duel/controls';
import { emptyPresses, NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { consoleModel, consoleStation, consoleTabs } from '../src/renderer/src/render/duel/consoleModel';
import { STATION, stationTop, TABS, TABS_RIGHT } from '../src/renderer/src/render/duel/consoleLayout';
import { readoutHelp, readoutRows } from '../src/renderer/src/render/duel/readoutModel';
import { crtActive } from '../src/renderer/src/render/crt';

const CUTTER = parseShip(cutter), HOUND = parseShip(hound);

describe('the Science seat (spec §6.1)', () => {
  it('seatOf and consoleStation name Science on the Cutter and on the Hound (whose Science shares a console group)', () => {
    for (const layout of [CUTTER, HOUND]) {
      const d = createDuel(layout, 5);
      try {
        sitDown(d.interior, 0, d.science);
        expect([seatOf(d, 0), consoleStation(d, 0)], layout.id).toEqual(['science', 'science']);
        standUp(d.interior, 0);
        expect(seatOf(d, 0)).toBe('standing');
      } finally { disposeDuel(d); }
    }
  });
  it('consoleInReach offers the free Science console from its tile, and not once it is taken', () => {
    const d = createDuel(CUTTER, 5);
    try {
      const tile = d.interior.derived.stationTile[d.science]!, W = d.interior.derived.width, eid = d.interior.crew[0]!;
      Position.x[eid] = (tile % W) + 0.5; Position.y[eid] = Math.floor(tile / W) + 0.5;
      expect(consoleInReach(d, 0)).toBe(d.science);
      sitDown(d.interior, 1, d.science);
      expect(consoleInReach(d, 0)).toBe(-1);
    } finally { disposeDuel(d); }
  });
});

describe('the Science console (spec §7.3)', () => {
  it('the tab strip has four tabs; a Science seat lights SCIENCE, and standing in reach opens it to E', () => {
    expect(TABS_RIGHT).toBe(TABS.x + 4 * TABS.w + 3 * TABS.gap);
    expect(consoleTabs({ seat: 'science', reach: null, repairNear: false, otherSeat: 'standing', mode: 'online' }))
      .toEqual({ tabs: { helm: 'locked', weapons: 'locked', science: 'current', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' } });
    expect(consoleTabs({ seat: 'standing', reach: 'science', repairNear: false, otherSeat: 'helm', mode: 'single' }))
      .toEqual({ tabs: { helm: 'open', weapons: 'locked', science: 'open', ship: 'current' }, tabActions: { helm: 'switch', weapons: null, science: 'interact', ship: null } });
  });
  it('the console model at Science: no Helm or Weapons block, the side column with SNAP', () => {
    const d = createDuel(CUTTER, 5);
    try {
      sitDown(d.interior, 0, d.science);
      expect(consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: { zoomText: 'ZOOM 0.50', scaleBar: { px: 50, units: 100 }, snapHint: false } }))
        .toMatchObject({ station: 'science', helm: null, weapons: null, side: { zoom: '0.50', free: false, snapLabel: 'SNAP' } });
    } finally { disposeDuel(d); }
  });
  it('the Science block sits at the bottom left, 96 high', () => {
    expect(STATION.h.science).toBe(96);
    expect(stationTop('science')).toBe(720 - 12 - 96);
  });
  it('the readout mode science: a SCIENCE heading off the console, its key help, and the CRT on', () => {
    const d = createDuel(CUTTER, 5);
    try {
      expect(readoutRows({ duel: d, mode: 'science', active: 0, other: 'AT SCIENCE' })[0]!.label).toBe('SCIENCE');
      expect(readoutHelp('science')).toEqual(['S SCAN   T NEXT CONTACT', 'CLICK A CONTACT: DESIGNATE', 'X STAND   TAB SWITCH', 'WHEEL - =  ZOOM   C SNAP', 'ESC PAUSE']);
      expect(crtActive('science')).toBe(true);
    } finally { disposeDuel(d); }
  });
});

describe('the runtime at Science', () => {
  it('a Science seat views science with its own camera; the partner reads AT SCIENCE', () => {
    const rt = createDuelRuntime({
      now: () => 0, scheduler: { schedule: () => () => {} }, seed: 5, viewport: { w: 1280, h: 720 }, layout: CUTTER,
      sampleKeys: () => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() }),
      samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 })
    });
    try {
      sitDown(rt.duel.interior, 0, rt.duel.science);
      expect(rt.view()).toBe('science');
      expect(rt.cameras.science).not.toBe(rt.cameras.helm);
      rt.frame(1 / 60);
      standUp(rt.duel.interior, 0); sitDown(rt.duel.interior, 0, rt.duel.nav); sitDown(rt.duel.interior, 1, rt.duel.science);
      expect(rt.otherStatus()).toBe('AT SCIENCE');
    } finally { rt.dispose(); }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/scienceSeat.test.ts`
Expected: FAIL (`seatOf` returns `standing` at Science; TypeScript-only members like `cameras.science` are undefined).

- [ ] **Step 3: The seat**

`src/renderer/src/app/duel/controls.ts`: replace `export type Seat = 'helm' | 'weapons' | 'standing';` and `seatOf` with:

```ts
export type Seat = 'helm' | 'weapons' | 'science' | 'standing';

/** Where player pid's character is: seated at Navigation (the Helm), at Weapons, at Science (Sci-1 spec §6.1), or standing. */
export function seatOf(d: DuelState, pid: number): Seat {
  const station = Seated.station[d.interior.crew[pid]!]!;
  return station === d.nav ? 'helm' : station === d.weapons ? 'weapons' : d.science >= 0 && station === d.science ? 'science' : 'standing';
}
```

In `consoleInReach`, replace `  for (const i of [d.nav, d.weapons]) {` with `  for (const i of [d.nav, d.weapons, d.science]) {` and make the loop body's first line `    if (i < 0) continue;   // a layout without a Science console`. Change its doc comment's first sentence to `The free role console (Navigation, Weapons or Science) player pid can sit at now, or −1:`.

- [ ] **Step 4: The view, the cameras and the partner status**

`src/renderer/src/app/duel/runtime.ts`:
- `export type DuelView = 'helm' | 'weapons' | 'science' | 'interior';`
- in `interface DuelRuntime`: `  readonly cameras: { readonly helm: Camera; readonly weapons: Camera; readonly science: Camera };`
- the `let prev ... cameras = { helm: createCamera(), weapons: createCamera() };` declaration: `cameras = { helm: createCamera(), weapons: createCamera(), science: createCamera() };`
- `freshCameras`: `const freshCameras = (): void => { const s = d.tactical.ships[0]; cameras = { helm: createCamera(s.x, s.y), weapons: createCamera(s.x, s.y), science: createCamera(s.x, s.y) }; };`
- `otherStatus`: `      if (s !== 'standing') return s === 'helm' ? 'AT HELM' : s === 'weapons' ? 'AT WEAPONS' : 'AT SCIENCE';`
- in `play`, after the Helm branch's closing `}` (the one that ends `      return k;\n    }` after `throttleRequest`) add:

```ts
    if (seat === 'science') {   // Sci-1 spec §7.3: the requests arrive in Task 11; C snaps the Science camera back
      if (p.camera > 0) snapBack(cameras.science);
      return k;
    }
```

- in `frame`: `      const view = seatOf(d, active), cam = view === 'helm' ? cameras.helm : view === 'weapons' ? cameras.weapons : view === 'science' ? cameras.science : null;` and `      for (const c of [cameras.helm, cameras.weapons, cameras.science]) {`.

`src/renderer/src/app/duel/onlineSource.ts`:
- `  let cameras = { helm: createCamera(), weapons: createCamera(), science: createCamera() };`
- in `observe`'s new-round branch: `const s = t.ships[0]; cameras = { helm: createCamera(s.x, s.y), weapons: createCamera(s.x, s.y), science: createCamera(s.x, s.y) }; cameraInput.reset(); resetInteriorCamera(interiorCamera);`
- `otherStatus`: `      if (s !== 'standing') return s === 'helm' ? 'AT HELM' : s === 'weapons' ? 'AT WEAPONS' : 'AT SCIENCE';`
- in `frame`: `      const view = seatOf(d, seat), cam = view === 'helm' ? cameras.helm : view === 'weapons' ? cameras.weapons : view === 'science' ? cameras.science : null;` and `      for (const c of [cameras.helm, cameras.weapons, cameras.science]) {`.

`src/renderer/src/app/duel/onlineDuel.ts`:
- the notice: `      notice = seatOf(d, descriptor.seatId) === 'helm' ? 'YOU: HELM' : seatOf(d, descriptor.seatId) === 'weapons' ? 'YOU: WEAPONS' : seatOf(d, descriptor.seatId) === 'science' ? 'YOU: SCIENCE' : 'TAKE A CONSOLE: E TO SIT';` (keep the trailing comment and `noticeUntil = ...` on the same line as now).
- in `play`, after the Helm branch's `      return;\n    }` add:

```ts
    if (seat === 'science') {   // Sci-1 spec §7.3 (the requests arrive in Task 11)
      if (p.camera > 0 && source) snapBack(source.cameras.science);
      return;
    }
```

`src/renderer/src/app/duel/scene.ts`: in `DuelViewSource`, `  readonly cameras: { readonly helm: Camera; readonly weapons: Camera; readonly science: Camera };`.

`src/renderer/src/render/crt.ts`: `export type CrtView = 'helm' | 'weapons' | 'science' | 'interior' | 'flight';` and the comment above it `/** The views a CRT can show: the duel's four views and the dev flight view. */`.

- [ ] **Step 5: The readout, the console and the tab**

`src/renderer/src/render/duel/readoutModel.ts`:
- `export type ReadoutMode = 'helm' | 'weapons' | 'science' | 'interior';`
- `export type OtherStatus = 'AT HELM' | 'AT WEAPONS' | 'AT SCIENCE' | 'WALKING' | 'REPAIRING' | 'DOWNED' | 'STANDING BY';`
- the view heading: `    ...(input.console ? [] : [heading(input.mode === 'helm' ? 'HELM' : input.mode === 'weapons' ? 'WEAPONS' : input.mode === 'science' ? 'SCIENCE' : 'ON FOOT', AMBER)]),`
- in `readoutHelp`, after the `weapons` line add:

```ts
  if (mode === 'science') return ['S SCAN   T NEXT CONTACT', 'CLICK A CONTACT: DESIGNATE', 'X STAND   TAB SWITCH', 'WHEEL - =  ZOOM   C SNAP', 'ESC PAUSE'];
```

`src/renderer/src/render/duel/consoleLayout.ts`:
- `export const TABS_RIGHT = TABS.x + 4 * TABS.w + 3 * TABS.gap;   // HELM, WEAPONS, SCIENCE, SHIP (Sci-1)`
- `export const STATION = { x: 12, w: 300, h: { helm: 200, weapons: 216, science: 96 } } as const;`
- `export function stationTop(s: 'helm' | 'weapons' | 'science'): number { return INTERNAL_H - EDGE - STATION.h[s]; }`

`src/renderer/src/render/duel/consoleModel.ts`:
- `export type ConsoleStation = 'helm' | 'weapons' | 'science' | 'ship';`
- `consoleTabs`: its input type `reach: 'helm' | 'weapons' | 'science' | null`, and its two records:

```ts
  const tabs: Record<ConsoleStation, TabState> = { helm: 'locked', weapons: 'locked', science: 'locked', ship: 'locked' };
  const tabActions: Record<ConsoleStation, KeyAction | null> = { helm: null, weapons: null, science: null, ship: null };
```

- in `consoleModel`, the reach: `reach: c < 0 ? null : c === d.nav ? 'helm' : c === d.weapons ? 'weapons' : 'science',`

`src/renderer/src/ui/duel/TabStrip.tsx`: `const ORDER: readonly [ConsoleStation, string][] = [['helm', 'HELM'], ['weapons', 'WEAPONS'], ['science', 'SCIENCE'], ['ship', 'SHIP']];` and the header comment `HELM, WEAPONS, SCIENCE, SHIP`.

`src/renderer/src/app/uiProbe.ts`: in `consoleFixture`, the two `tabs` literals gain `science: 'locked'` after `weapons` and the two `tabActions` literals gain `science: null` after `weapons`.

`tests/uiConsole.test.tsx` L21 and L25: the same additions to `weaponsConsole`'s and `helmConsole`'s `tabs` and `tabActions` literals.

`tests/duelConsoleModel.test.ts` L31: `expect(TABS_RIGHT).toBe(408);`

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run tests/scienceSeat.test.ts tests/duelControls.test.ts tests/duelConsoleModel.test.ts tests/uiConsole.test.tsx tests/duelReadout.test.ts tests/duelRuntime.test.ts tests/duelOnlineView.test.ts tests/onlineDuelSession.test.ts tests/crtBezel.test.ts tests/uiCrt.test.tsx`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/app/duel/controls.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/onlineSource.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/scene.ts src/renderer/src/render/crt.ts src/renderer/src/render/duel/readoutModel.ts src/renderer/src/render/duel/consoleModel.ts src/renderer/src/render/duel/consoleLayout.ts src/renderer/src/ui/duel/TabStrip.tsx src/renderer/src/app/uiProbe.ts tests/scienceSeat.test.ts tests/uiConsole.test.tsx tests/duelConsoleModel.test.ts
git commit -m "feat(sci-1): the Science seat in the app: seatOf, the reach to sit, the SCIENCE tab, the science view and its camera, AT SCIENCE, the readout mode" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The console's science contents: the hostility line, the hover readout, the SCAN state, the frequency row and the layout

**Files:**
- Create: `src/renderer/src/render/duel/scienceModel.ts`, `tests/scienceConsole.test.ts`
- Modify: `src/renderer/src/render/duel/consoleModel.ts` (WeaponsPanel, SciencePanel, ConsoleView, ConsoleModelInput, consoleModel), `src/renderer/src/render/duel/readoutModel.ts` (the hostility row, the crew SHIELD pips), `src/renderer/src/render/duel/consoleLayout.ts` (STATION.h.weapons, CONTACT.h), `src/renderer/src/app/uiProbe.ts` (the fixture's new fields)
- Test updates: `tests/uiConsole.test.tsx:21-25` (the ConsoleView literals), `tests/duelConsoleModel.test.ts:33, 43` (the pinned layout numbers)

**Interfaces:**
- Consumes: `roundTick` (Task 3); `CONTACT_MAX_LEVEL`, `Contact` (Task 1); `HOSTILE_AFTER_TICKS`, `SCAN_UNITS`; `TICK_HZ` (`src/renderer/src/sim/tuning.ts`); `screenToWorld`, `type Camera`, `type Point`, `type Viewport` (`render/tactical/camera.ts`); `bearingDeg` (`render/tactical/weaponsModel.ts`); `LOOT_NAMES` (Task 7).
- Produces:
  ```ts
  // render/duel/scienceModel.ts
  export { LOOT_NAMES } from '../tactical/tacticalModel';
  export const FREQ_NAMES: readonly ['A', 'B', 'C'];
  export const HOSTILE_SHOWN_TICKS = 180;
  export interface HostilityLine { text: string; alert: boolean }
  export function hostilityLine(t: TacticalState): HostilityLine | null;
  export function hoverReadout(cam: Camera, vp: Viewport, from: Point, cursor: Point | null): string | null;
  export interface ScanButton { label: string; enabled: boolean; progress: number | null }
  export function scanButton(t: TacticalState, contact: 0 | 1, station: 'helm' | 'weapons' | 'science'): ScanButton;
  // render/duel/consoleModel.ts
  // WeaponsPanel gains  freq: number; weakFreq: number | null   (weakFreq only after enemy Level 2)
  export interface SciencePanel { hover: string | null }
  // ConsoleView gains  science: SciencePanel | null;  ConsoleModelInput gains  hover?: string | null
  // render/duel/consoleLayout.ts: STATION.h.weapons = 248 (stationTop('weapons') 460); CONTACT.h = 420
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/scienceConsole.test.ts`:

```ts
// Sci-1 (spec 2026-11-17-science-scans §7.1, §7.2, §7.3, §7.4): the hostility line, the hover readout, the SCAN button
// state, the Weapons frequency row and the Science panel in the console model, the consoles' readout row, and the layout.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { sitDown } from '../src/renderer/src/sim/stations';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { consoleModel } from '../src/renderer/src/render/duel/consoleModel';
import { CONTACT, STATION, stationTop, STATUS } from '../src/renderer/src/render/duel/consoleLayout';
import { readoutRows } from '../src/renderer/src/render/duel/readoutModel';
import { FREQ_NAMES, hostilityLine, hoverReadout, LOOT_NAMES, scanButton } from '../src/renderer/src/render/duel/scienceModel';
import { LINE, PAD } from '../src/renderer/src/render/theme';

const CUTTER = parseShip(cutter);
const OVERLAY = { zoomText: 'ZOOM 0.50', scaleBar: { px: 50, units: 100 }, snapHint: false };

describe('the hostility line (spec §7.1)', () => {
  it('INCOMING SCAN (blinking) before Level 1; HOSTILE IN n s after; HOSTILE for 3 s once hostile; then nothing', () => {
    const t = createTacticalState(5);   // Patrol from rt 0
    expect(hostilityLine(t)).toEqual({ text: 'INCOMING SCAN', alert: true });
    t.known[0] = 1; t.tick = 600;
    expect(hostilityLine(t)).toEqual({ text: 'HOSTILE IN 10 s', alert: false });
    t.tick = 1199;
    expect(hostilityLine(t)).toEqual({ text: 'HOSTILE IN 1 s', alert: false });
    t.hostileAt = 300; t.tick = 300;
    expect(hostilityLine(t)).toEqual({ text: 'HOSTILE', alert: true });
    t.tick = 479; expect(hostilityLine(t)?.text).toBe('HOSTILE');
    t.tick = 480; expect(hostilityLine(t)).toBeNull();
  });
});

describe('the hover readout (spec §7.3)', () => {
  it('bearing in whole degrees clockwise from map up, range rounded to 10, from the crew ship to the cursor', () => {
    const cam = createCamera(0, 0, 1), vp = { w: 1280, h: 720 };
    expect(hoverReadout(cam, vp, { x: 0, y: 0 }, { x: 740, y: 360 })).toBe('BRG 090 RNG 100');
    expect(hoverReadout(createCamera(0, 0, 0.12), vp, { x: 0, y: 0 }, { x: 640, y: 360 - 174 })).toBe('BRG 000 RNG 1450');
    expect(hoverReadout(cam, vp, { x: 0, y: 0 }, { x: 640 - 3, y: 360 + 3 })).toBe('BRG 225 RNG 0');
    expect(hoverReadout(cam, vp, { x: 0, y: 0 }, null)).toBeNull();
  });
});

describe('the SCAN button (spec §7.2)', () => {
  it('names the next level, (SLOW) off Science, SCANNED when fully known; the progress while the scanner is on it', () => {
    const t = createTacticalState(5);
    expect(scanButton(t, 0, 'science')).toEqual({ label: 'SCAN 1', enabled: true, progress: null });
    expect(scanButton(t, 0, 'helm')).toEqual({ label: 'SCAN 1 (SLOW)', enabled: true, progress: null });
    t.known[0] = 1; t.scan = { contact: 0, level: 2, progress: 900, rate: 5, by: 3 };
    expect(scanButton(t, 0, 'weapons')).toEqual({ label: 'SCAN 2 (SLOW)', enabled: true, progress: 0.5 });
    expect(scanButton(t, 1, 'science')).toEqual({ label: 'SCAN 1', enabled: true, progress: null });
    t.known = [2, 1];
    expect(scanButton(t, 0, 'science')).toEqual({ label: 'SCANNED', enabled: false, progress: null });
    expect(scanButton(t, 1, 'helm')).toEqual({ label: 'SCANNED', enabled: false, progress: null });
    expect([FREQ_NAMES, LOOT_NAMES]).toEqual([['A', 'B', 'C'], ['HULL', 'MISSILES', 'SHIELD']]);
  });
});

describe('the console model (spec §7.3, §7.4)', () => {
  it('Weapons gets the tuned frequency and, after enemy Level 2 only, the weak one; Science gets its hover line', () => {
    const d = createDuel(CUTTER, 5);
    try {
      sitDown(d.interior, 0, d.weapons);
      d.tactical.systems[0].freq = 2;
      const model = (hover?: string | null) => consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: OVERLAY, ...(hover === undefined ? {} : { hover }) })!;
      expect(model().weapons).toMatchObject({ freq: 2, weakFreq: null });
      d.tactical.known[0] = 1; expect(model().weapons!.weakFreq).toBeNull();
      d.tactical.known[0] = 2; expect(model().weapons!.weakFreq).toBe(d.tactical.weakFreq);
      expect(model().science).toBeNull();
      const sci = createDuel(CUTTER, 5);
      try {
        sitDown(sci.interior, 0, sci.science);
        const m = consoleModel({ duel: sci, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: OVERLAY, hover: 'BRG 090 RNG 100' })!;
        expect([m.station, m.science, m.weapons, m.helm]).toEqual(['science', { hover: 'BRG 090 RNG 100' }, null, null]);
        expect(consoleModel({ duel: sci, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: OVERLAY })!.science).toEqual({ hover: null });
      } finally { disposeDuel(sci); }
    } finally { disposeDuel(d); }
  });
  it('the consoles\' readout carries the hostility line right after the HUNTER heading; the plain readout does not', () => {
    const d = createDuel(CUTTER, 5);
    try {
      const labels = readoutRows({ duel: d, mode: 'helm', active: 0, other: 'WALKING', console: true }).map((r) => r.label);
      expect(labels[labels.indexOf('HUNTER') + 1]).toBe('INCOMING SCAN');
      expect(readoutRows({ duel: d, mode: 'helm', active: 0, other: 'WALKING' }).map((r) => r.label)).not.toContain('INCOMING SCAN');
      const row = readoutRows({ duel: d, mode: 'helm', active: 0, other: 'WALKING', console: true }).find((r) => r.label === 'INCOMING SCAN')!;
      expect(row.emphasis).toBe('alert');
      d.tactical.systems[0].shields = 3;   // the Shield loot's extra layer shows as a third pip
      expect(readoutRows({ duel: d, mode: 'helm', active: 0, other: 'WALKING', console: true }).find((r) => r.label === 'SHIELD')!.pips).toMatchObject({ n: 3, max: 3 });
    } finally { disposeDuel(d); }
  });
});

describe('the layout (spec §7.3, §7.4)', () => {
  it('the Weapons block is 248 high, the contact window 420, the Science block 96; the status table still ends above the Weapons block', () => {
    expect([STATION.h.weapons, stationTop('weapons'), CONTACT.h, STATION.h.science, stationTop('science')]).toEqual([248, 460, 420, 96, 612]);
    const d = createDuel(CUTTER, 5);
    try {
      d.tactical.systems[0].rooms = [2, 1, 1];
      const rows = readoutRows({ duel: d, mode: 'weapons', active: 0, other: 'AT HELM', console: true });
      expect(STATUS.y + PAD + LINE * rows.length + PAD).toBeLessThanOrEqual(stationTop('weapons'));
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/scienceConsole.test.ts`
Expected: FAIL. `../src/renderer/src/render/duel/scienceModel` does not resolve.

- [ ] **Step 3: The science presentation helpers**

Create `src/renderer/src/render/duel/scienceModel.ts`:

```ts
// The science presentation helpers (Sci-1 spec 2026-11-17-science-scans §7): the hostility line every console shows,
// the Science console's hover readout, the frequency and loot names and the SCAN button's state. Pure: no Pixi, no React.
import { roundTick } from '../../sim/tactical/science';
import { CONTACT_MAX_LEVEL, Contact, type TacticalState } from '../../sim/tactical/state';
import { HOSTILE_AFTER_TICKS, SCAN_UNITS } from '../../sim/tactical/tuning';
import { TICK_HZ } from '../../sim/tuning';
import { screenToWorld, type Camera, type Point, type Viewport } from '../tactical/camera';
import { bearingDeg } from '../tactical/weaponsModel';

export { LOOT_NAMES } from '../tactical/tacticalModel';
/** The laser frequencies, 0..2. */
export const FREQ_NAMES = ['A', 'B', 'C'] as const;
/** HOSTILE shows this long after the turn (spec §7.1: 3 s). */
export const HOSTILE_SHOWN_TICKS = 180;

export interface HostilityLine { text: string; alert: boolean }
/** Spec §7.1: while it patrols, INCOMING SCAN (blinking) before the enemy is known to Level 1, then HOSTILE IN n s with
 *  n = ceil((1200 − rt) / 60); once hostile, HOSTILE (blinking) for 3 s; then nothing. */
export function hostilityLine(t: TacticalState): HostilityLine | null {
  const rt = roundTick(t);
  if (t.hostileAt < 0) return t.known[Contact.Enemy] >= 1 ? { text: `HOSTILE IN ${Math.ceil((HOSTILE_AFTER_TICKS - rt) / TICK_HZ)} s`, alert: false } : { text: 'INCOMING SCAN', alert: true };
  return rt - t.hostileAt < HOSTILE_SHOWN_TICKS ? { text: 'HOSTILE', alert: true } : null;
}

/** Spec §7.3: `BRG 327 RNG 1450` from the crew ship `from` to the cursor (internal px): the bearing in whole degrees
 *  clockwise from map up, the range in world units rounded to 10. Null without a cursor. */
export function hoverReadout(cam: Camera, vp: Viewport, from: Point, cursor: Point | null): string | null {
  if (!cursor) return null;
  const w = screenToWorld(cam, vp, cursor.x, cursor.y), dx = w.x - from.x, dy = w.y - from.y;
  return `BRG ${String(bearingDeg(dx, dy)).padStart(3, '0')} RNG ${Math.round(Math.hypot(dx, dy) / 10) * 10}`;
}

export interface ScanButton { label: string; enabled: boolean; progress: number | null }
/** Spec §7.2: the SCAN button for `contact` on `station`: `SCAN n` with the next level, ` (SLOW)` off Science, or
 *  SCANNED when the contact is fully known; the scanner's progress 0..1 while it is on this contact. */
export function scanButton(t: TacticalState, contact: 0 | 1, station: 'helm' | 'weapons' | 'science'): ScanButton {
  const known = t.known[contact];
  if (known >= CONTACT_MAX_LEVEL[contact]) return { label: 'SCANNED', enabled: false, progress: null };
  const progress = t.scan.contact === contact ? Math.min(1, t.scan.progress / SCAN_UNITS[t.scan.level]!) : null;
  return { label: `SCAN ${known + 1}${station === 'science' ? '' : ' (SLOW)'}`, enabled: true, progress };
}
```

- [ ] **Step 4: The console model, the readout and the layout**

`src/renderer/src/render/duel/consoleModel.ts`:
- add `import { Contact, missileOf } from '../../sim/tactical/state';` in place of `import { missileOf } from '../../sim/tactical/state';`
- replace the `WeaponsPanel` line with:

```ts
/** `freq`: the crew laser's tuned frequency 0..2; `weakFreq`: the enemy's weak one, shown only after a Level 2 scan (Sci-1 spec §7.4). */
export interface WeaponsPanel { lock: number; charge: ReadoutRow; magazine: string; canLaunch: boolean; missileFlying: boolean; fireHeld: boolean; held: HeldFlags; freq: number; weakFreq: number | null }
/** The Science block (Sci-1 spec §7.3): the hover readout, or null with no cursor over the map. */
export interface SciencePanel { hover: string | null }
```

- in `interface ConsoleView`, after `  weapons: WeaponsPanel | null;` add `  science: SciencePanel | null;`
- in `interface ConsoleModelInput`, after the `throttle?` member add:

```ts
  /** Science's hover readout this frame (Sci-1 spec §7.3), from the scene; null or absent with no cursor. */
  hover?: string | null;
```

- in `consoleModel`, replace the `weapons` construction's object with `{ lock: sys.lock, charge: chargeRow(d), magazine: `${sys.magazine}/${MAGAZINE}`, canLaunch: canLaunch(t, 0), missileFlying: flying, fireHeld: held.fire, held, freq: sys.freq, weakFreq: t.known[Contact.Enemy] >= 2 ? t.weakFreq : null }`, and replace the return with:

```ts
  const science = station === 'science' ? { hover: i.hover ?? null } : null;
  return { station, tabs, tabActions, helm, weapons, science, side };
```

`src/renderer/src/render/duel/readoutModel.ts`:
- add `import { hostilityLine } from './scienceModel';`
- the crew SHIELD row: `    { ...row('SHIELD'), pips: { n: crewSys.shields, max: Math.max(SHIELD_LAYERS, crewSys.shields), colour: CREW_SHIP }, emphasis: 'crew' }   // Shield loot can add a layer (Sci-1 spec §4.5)`
- after `  rows.push(em(heading('HUNTER', ENEMY_SHIP), 'enemy'));` add:

```ts
  const hostile = input.console ? hostilityLine(t) : null;   // Sci-1 spec §7.1: the consoles' hostility line
  if (hostile) rows.push(em(heading(hostile.text, WARN), hostile.alert ? 'alert' : 'warn'));
```

`src/renderer/src/render/duel/consoleLayout.ts`:
- `export const STATION = { x: 12, w: 300, h: { helm: 200, weapons: 248, science: 96 } } as const;   // Weapons gains the frequency row (Sci-1 spec §7.4)`
- `export const CONTACT = { x: INTERNAL_W - EDGE - 300, y: SIDE.y + SIDE_H + EDGE, w: 300, h: 420 } as const;` and its comment `... directly below the side column, ending at y 570 (Sci-1: room for the info lines).`

`src/renderer/src/app/uiProbe.ts`: in `consoleFixture`, the `base` literal's `weapons` object gains `, freq: 0, weakFreq: null` after `held: NO_HELD_FLAGS`, and `base` gains `science: null,` after `helm: null,`.

`tests/uiConsole.test.tsx`: the same two additions to `weaponsConsole` (L21-23).

`tests/duelConsoleModel.test.ts`: L33 `expect(stationTop('helm')).toBe(508); expect(stationTop('weapons')).toBe(460);`, and in the contact window test `expect(CONTACT).toEqual({ x: 968, y: 150, w: 300, h: 420 });`.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run tests/scienceConsole.test.ts tests/scienceSeat.test.ts tests/duelConsoleModel.test.ts tests/duelReadout.test.ts tests/duelHealthView.test.ts tests/uiConsole.test.tsx tests/crtReadout.test.ts tests/contactModel.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/duel/scienceModel.ts src/renderer/src/render/duel/consoleModel.ts src/renderer/src/render/duel/readoutModel.ts src/renderer/src/render/duel/consoleLayout.ts src/renderer/src/app/uiProbe.ts tests/scienceConsole.test.ts tests/uiConsole.test.tsx tests/duelConsoleModel.test.ts
git commit -m "feat(sci-1): the console's science contents: the hostility line, the hover readout, the SCAN state, the Weapons frequency row data, the Science panel and the layout" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The contact window re-keyed on contacts: the controller (Science, T, S, requests) and the model by contact and level

**Files:**
- Modify: `src/renderer/src/app/duel/contactController.ts` (rewrite), `src/renderer/src/render/duel/contactModel.ts` (rewrite of the model), `src/renderer/src/app/duel/scene.ts` (pickContact, sync, the contact model call), `src/renderer/src/ui/actions.ts` (`contact.scan`), `src/renderer/src/ui/duel/ContactWindow.tsx` (null shields and hull)
- Rewrite tests: `tests/contactController.test.ts`, `tests/contactModel.test.ts`
- Test updates: `tests/contactWindow.test.tsx` (the `contactOf` helper, the mock, one test removed), `tests/contactScene.test.ts:59-65`, `tests/onlineDuelSession.test.ts` (two `state()` expectations), `tests/uiActions.test.ts:168-180` (the contact mock)

**Interfaces:**
- Consumes: Task 7's `pickContact`; Task 9's `hostilityLine`, `scanButton`, `FREQ_NAMES`, `LOOT_NAMES`, `type ScanButton`; `derelictPos`; `Contact`, `SALVAGE_TICKS`, `HUNTER_MISSILE_COOLDOWN_TICKS`; `ALERT_BLINK_HZ`, `CRT` (`crtTheme.ts`).
- Produces:
  ```ts
  // app/duel/contactController.ts
  export type ContactId = 0 | 1;
  export interface ContactState { contact: ContactId; aim: boolean }
  export interface ContactSync { shown: boolean; station: ConsoleStation | null; target: number; active: (slot: number) => boolean; epoch: number; enemyKnown?: number }
  export interface ContactRequests { designate: number | null; scan: ContactId | null }
  export interface ContactController { state(); click(contact: ContactId | null); toggle(); close(); arm(); cancelAim(); escape(): boolean; scan(); sync(s: ContactSync): boolean; pick(room, lock); intercept(code: string): boolean; takeRequests(): ContactRequests }
  export type ContactActions = Pick<ContactController, 'close' | 'arm' | 'cancelAim' | 'pick' | 'scan'>;
  // render/duel/contactModel.ts
  export interface ContactLine { text: string; tint: number; bar: number | null }
  export interface ContactView { contact: 0 | 1 | null; title: string; shields: { up: number; of: number } | null; hull: { value: number; fill: number } | null;
    box: { x: number; y: number; w: number; h: number }; outline: number[]; rooms: ContactRoom[]; lockRoom: number | null;
    weapons: null | { laser: ContactLaser; missile: { magazine: number } }; aim: boolean; scan: ScanButton | null; lines: ContactLine[] }
  export interface ContactModelInput { state: TacticalState; contact: 0 | 1 | null; aim: boolean; station: 'helm' | 'weapons' | 'science'; t: number; weapons: Pick<WeaponsPanel, 'charge'> | null }
  export function contactModel(i: ContactModelInput): ContactView | null;
  // ui/actions.ts: actions.contact gains  scan(): void
  ```

- [ ] **Step 1: Rewrite the two test files (they fail until Step 3)**

Replace `tests/contactController.test.ts` with:

```ts
// Enemy ship window spec §3, §5, §6.1, §6.2; Sci-1 spec §7.2, §7.3: the contact window's local state keyed on contact
// ids (0 the enemy, 1 the derelict), its closing rules, Science's selection and requests, and its key intercept.
import { describe, expect, it, vi } from 'vitest';
import { createContactController, type ContactSync } from '../src/renderer/src/app/duel/contactController';

const live = (over: Partial<ContactSync> = {}): ContactSync => ({ shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0, ...over });
const none = { designate: null, scan: null };

describe('Helm and Weapons (enemy ship window spec §3, Sci-1 spec §7.2)', () => {
  it('a map click opens, a click on the other contact switches (disarmed), a click on the shown one closes; null does nothing', () => {
    const c = createContactController(); c.sync(live());
    c.click(null); expect(c.state()).toBeNull();
    c.click(0); expect(c.state()).toEqual({ contact: 0, aim: false });
    c.arm(); c.click(1); expect(c.state()).toEqual({ contact: 1, aim: false });
    c.click(1); expect(c.state()).toBeNull();
    expect(c.takeRequests()).toEqual(none);
  });
  it('T cycles enemy, derelict, closed', () => {
    const c = createContactController(); c.sync(live({ station: 'helm' }));
    c.toggle(); expect(c.state()).toEqual({ contact: 0, aim: false });
    c.toggle(); expect(c.state()).toEqual({ contact: 1, aim: false });
    c.toggle(); expect(c.state()).toBeNull();
    expect(c.takeRequests()).toEqual(none);
  });
  it('arm toggles the aim only on the enemy at Level 1 or more; a no-op on the derelict and on an unknown enemy', () => {
    const c = createContactController(); c.sync(live({ enemyKnown: 0 }));
    c.click(0); c.arm(); expect(c.state()).toEqual({ contact: 0, aim: false });
    c.sync(live({ enemyKnown: 1 })); c.arm(); expect(c.state()).toEqual({ contact: 0, aim: true });
    c.arm(); expect(c.state()).toEqual({ contact: 0, aim: false });
    c.arm(); c.cancelAim(); expect(c.state()).toEqual({ contact: 0, aim: false });
    c.click(1); c.arm(); expect(c.state()).toEqual({ contact: 1, aim: false });
  });
  it('escape disarms, then closes, then returns false', () => {
    const c = createContactController(); c.sync(live());
    c.click(0); c.arm();
    expect(c.escape()).toBe(true); expect(c.state()).toEqual({ contact: 0, aim: false });
    expect(c.escape()).toBe(true); expect(c.state()).toBeNull();
    expect(c.escape()).toBe(false);
  });
  it('SCAN requests a scan of the shown contact, once per take; nothing with no contact shown', () => {
    const c = createContactController(); c.sync(live());
    c.scan(); expect(c.takeRequests()).toEqual(none);
    c.click(1); c.scan(); c.scan();
    expect(c.takeRequests()).toEqual({ designate: null, scan: 1 });
    expect(c.takeRequests()).toEqual(none);
  });
});

describe('the closing rules in sync (enemy ship window spec §3)', () => {
  it('returns whether the window is shown; clears when the console is not shown', () => {
    const c = createContactController();
    expect(c.sync(live())).toBe(false);
    c.click(0); expect(c.sync(live())).toBe(true);
    c.arm(); expect(c.sync(live({ shown: false, station: null }))).toBe(false); expect(c.state()).toBeNull();
    c.click(0); expect(c.sync(live({ shown: false, station: 'ship' }))).toBe(false); expect(c.state()).toBeNull();
  });
  it('clears the enemy contact when its slot (the laser target) is inactive; the derelict stays', () => {
    const c = createContactController(); c.sync(live());
    c.click(0); expect(c.sync(live({ active: (slot) => slot !== 1 }))).toBe(false); expect(c.state()).toBeNull();
    c.click(1); expect(c.sync(live({ active: (slot) => slot !== 1 }))).toBe(true); expect(c.state()).toEqual({ contact: 1, aim: false });
  });
  it('clears on a new epoch (the first sync only records it)', () => {
    const c = createContactController();
    c.click(0); expect(c.sync(live({ epoch: 3 }))).toBe(true);
    expect(c.sync(live({ epoch: 3 }))).toBe(true);
    expect(c.sync(live({ epoch: 4 }))).toBe(false); expect(c.state()).toBeNull();
  });
  it('a station change disarms and keeps the window open; the enemy falling below Level 1 disarms', () => {
    const c = createContactController();
    c.sync(live({ station: 'helm' })); c.click(0); c.arm();
    expect(c.sync(live({ station: 'helm' }))).toBe(true); expect(c.state()).toEqual({ contact: 0, aim: true });
    expect(c.sync(live({ station: 'weapons' }))).toBe(true); expect(c.state()).toEqual({ contact: 0, aim: false });
    c.arm(); expect(c.sync(live({ enemyKnown: 0 }))).toBe(true); expect(c.state()).toEqual({ contact: 0, aim: false });
  });
});

describe('pick (enemy ship window spec §5)', () => {
  it('calls lock only while armed, then disarms and keeps the window open', () => {
    const c = createContactController(), lock = vi.fn(); c.sync(live());
    c.click(0); c.pick(2, lock); expect(lock).not.toHaveBeenCalled();
    c.arm(); c.pick(2, lock);
    expect(lock).toHaveBeenCalledTimes(1); expect(lock).toHaveBeenCalledWith(2);
    expect(c.state()).toEqual({ contact: 0, aim: false });
  });
});

describe('Science (Sci-1 spec §7.3)', () => {
  it('a click selects (no toggle) and requests designate; T cycles enemy, derelict, none, requesting each', () => {
    const c = createContactController(); c.sync(live({ station: 'science' }));
    c.click(1); expect(c.state()).toEqual({ contact: 1, aim: false });
    c.click(1); expect(c.state()).toEqual({ contact: 1, aim: false });
    expect(c.takeRequests()).toEqual({ designate: 1, scan: null });
    c.toggle(); expect(c.state()).toBeNull(); expect(c.takeRequests()).toEqual({ designate: -1, scan: null });
    c.toggle(); expect(c.state()).toEqual({ contact: 0, aim: false }); expect(c.takeRequests()).toEqual({ designate: 0, scan: null });
    c.toggle(); expect(c.state()).toEqual({ contact: 1, aim: false }); expect(c.takeRequests()).toEqual({ designate: 1, scan: null });
  });
  it('is shown with nothing selected; never aims; Esc deselects (designate −1), then declines so Esc pauses', () => {
    const c = createContactController();
    expect(c.sync(live({ station: 'science' }))).toBe(true);
    c.click(0); c.arm(); expect(c.state()).toEqual({ contact: 0, aim: false });
    c.takeRequests();
    expect(c.intercept('Escape')).toBe(true); expect(c.state()).toBeNull();
    expect(c.takeRequests()).toEqual({ designate: -1, scan: null });
    expect(c.intercept('Escape')).toBe(false);
  });
  it('the close button deselects and requests designate −1', () => {
    const c = createContactController(); c.sync(live({ station: 'science' }));
    c.click(0); c.takeRequests(); c.close();
    expect([c.state(), c.takeRequests()]).toEqual([null, { designate: -1, scan: null }]);
  });
});

describe('the key intercept (enemy ship window spec §6.2, Sci-1 spec §7.2, §7.3)', () => {
  it('takes KeyT on Helm, Weapons and Science while the console is shown, cycling', () => {
    for (const station of ['helm', 'weapons', 'science'] as const) {
      const c = createContactController(); c.sync(live({ station }));
      expect(c.intercept('KeyT'), station).toBe(true); expect(c.state()).toEqual({ contact: 0, aim: false });
      expect(c.intercept('KeyT')).toBe(true); expect(c.state()).toEqual({ contact: 1, aim: false });
      expect(c.intercept('KeyT')).toBe(true); expect(c.state()).toBeNull();
    }
  });
  it('declines KeyT before any frame, on a hidden console, on the SHIP console and on the interior view', () => {
    const c = createContactController();
    expect(c.intercept('KeyT')).toBe(false);
    c.sync(live({ shown: false, station: null })); expect(c.intercept('KeyT')).toBe(false);
    c.sync(live({ shown: false, station: 'ship' })); expect(c.intercept('KeyT')).toBe(false);
    c.sync(live({ shown: false, station: 'weapons' })); expect(c.intercept('KeyT')).toBe(false);
    expect(c.state()).toBeNull();
  });
  it('takes KeyS on Science only: a scan request of the selection, and taken even with nothing selected', () => {
    const c = createContactController(); c.sync(live({ station: 'science' }));
    expect(c.intercept('KeyS')).toBe(true); expect(c.takeRequests()).toEqual(none);
    c.click(1); c.takeRequests();
    expect(c.intercept('KeyS')).toBe(true); expect(c.takeRequests()).toEqual({ designate: null, scan: 1 });
    const h = createContactController(); h.sync(live({ station: 'helm' })); h.click(0);
    expect(h.intercept('KeyS')).toBe(false);
  });
  it('takes Escape only while shown with a contact: disarm, then close; declines every other code', () => {
    const c = createContactController();
    c.sync(live()); expect(c.intercept('Escape')).toBe(false);
    c.click(0); c.sync(live()); c.arm();
    expect(c.intercept('Escape')).toBe(true); expect(c.state()).toEqual({ contact: 0, aim: false });
    expect(c.intercept('Escape')).toBe(true); expect(c.state()).toBeNull();
    expect(c.intercept('Escape')).toBe(false);
    c.click(0); c.sync(live());
    for (const code of ['KeyE', 'KeyQ', 'Space', 'Tab', 'KeyW', 'Enter', 'KeyS', 'Digit1']) expect(c.intercept(code), code).toBe(false);
    expect(c.state()).toEqual({ contact: 0, aim: false });
  });
});
```

Replace `tests/contactModel.test.ts` with:

```ts
// Enemy ship window spec §4.2, §6.4; Sci-1 spec §7.2: the contact window's view model by contact and level: the unknown
// contact, the enemy at Level 1 (rooms outlined, labels ?, no damage) and Level 2 (today's window plus the readings),
// the derelict, Science with nothing selected.
import { describe, expect, it } from 'vitest';
import { contactModel, type ContactModelInput, type ContactView } from '../src/renderer/src/render/duel/contactModel';
import { CONTACT_BOX } from '../src/renderer/src/render/duel/consoleLayout';
import { blink, CRT, DAMAGE_BLINK_HZ, roomLook } from '../src/renderer/src/render/tactical/crtTheme';
import { derelictPos } from '../src/renderer/src/sim/tactical/science';
import { classOf, createTacticalState, Loot, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { TEXT } from '../src/renderer/src/render/theme';

const charge = { label: 'CHARGE', value: '40%', labelTint: TEXT, valueTint: TEXT, bar: { fill: 0.4, colour: TEXT } };
const model = (state: TacticalState, over: Partial<ContactModelInput> = {}): ContactView | null =>
  contactModel({ state, contact: 0, aim: false, station: 'weapons', t: 0, weapons: { charge }, ...over });
const known = (level: number): TacticalState => { const st = createTacticalState(4); st.known[0] = level; return st; };
const pointsOf = (v: ContactView): number[] => [...v.outline, ...v.rooms.flatMap((r) => [...r.points, ...(r.hatch?.segments ?? []), r.centre.x, r.centre.y])];

describe('the enemy at Level 2 (enemy ship window spec §4.2)', () => {
  it('the title, the shields and hull, the box and the room labels', () => {
    const st = known(2); st.systems[1].shields = 1; st.systems[1].hull = 10;
    const v = model(st)!, cls = classOf(st, 1);
    expect([v.contact, v.title]).toEqual([0, 'ENEMY SHIP']);
    expect(v.shields).toEqual({ up: 1, of: cls.shields.layers });
    expect(v.hull).toEqual({ value: 10, fill: 10 / cls.hull });
    expect(v.box).toEqual(CONTACT_BOX);
    expect(v.rooms.map((r) => r.label)).toEqual(['WEAP', 'SHLD', 'ENG']);
  });
  it('the outline, rooms, hatch and centres lie inside the box with 8 px padding; the outline fills one axis', () => {
    const st = known(2); st.systems[1].rooms = [1, 1, 1];
    const v = model(st)!, b = v.box, pts = pointsOf(v);
    for (let k = 0; k < pts.length; k += 2) {
      expect(pts[k]!, `x ${k}`).toBeGreaterThanOrEqual(b.x + 8 - 1e-9); expect(pts[k]!, `x ${k}`).toBeLessThanOrEqual(b.x + b.w - 8 + 1e-9);
      expect(pts[k + 1]!, `y ${k}`).toBeGreaterThanOrEqual(b.y + 8 - 1e-9); expect(pts[k + 1]!, `y ${k}`).toBeLessThanOrEqual(b.y + b.h - 8 + 1e-9);
    }
    const xs = v.outline.filter((_, k) => k % 2 === 0), ys = v.outline.filter((_, k) => k % 2 === 1);
    expect(Math.max(Math.max(...xs) - Math.min(...xs) - (b.w - 16), Math.max(...ys) - Math.min(...ys) - (b.h - 16))).toBeCloseTo(0, 6);
    expect(v.rooms[0]!.centre.x).toBeGreaterThan(v.rooms[2]!.centre.x);   // nose right
  });
  it('each room\'s look is roomLook(false, level, phase) in both blink phases; the lock room is the crew\'s lock', () => {
    const st = known(2); st.systems[1].rooms = [0, 1, 2]; st.systems[0].lock = 2;
    for (const t of [0, 0.3]) {
      const v = model(st, { t })!, phase = blink(t, DAMAGE_BLINK_HZ);
      v.rooms.forEach((r, k) => {
        const look = roomLook(false, k as 0 | 1 | 2, phase);
        expect({ fill: r.fill, stroke: r.stroke, hatch: r.hatch?.colour ?? null }, `room ${k} at ${t}`).toEqual({ fill: look.fill, stroke: look.stroke, hatch: look.hatch });
      });
      expect(v.lockRoom).toBe(2);
    }
  });
  it('Weapons: LASER is the station\'s charge row, lit while armed; MISSILE the magazine. The Helm: no weapon list, no aim', () => {
    const st = known(2), v = model(st, { aim: true })!;
    expect(v.weapons).toEqual({ laser: { label: 'CHARGE', value: '40%', fill: 0.4, lit: true, enabled: true, note: null }, missile: { magazine: st.systems[0].magazine } });
    expect(v.aim).toBe(true);
    const h = model(st, { station: 'helm', weapons: null, aim: true })!;
    expect([h.weapons, h.aim]).toEqual([null, false]);
  });
  it('the readings: the weak frequency, the enemy laser\'s charge, MISSILE READY or RELOADING; SCANNED', () => {
    const st = known(2); st.hostileAt = 0; st.tick = 1000;   // hostile long ago: no hostility line
    st.weakFreq = 1; st.systems[1].laserCharge = classOf(st, 1).slots.laser.chargeUnits / 2;
    const v = model(st)!;
    expect(v.lines).toEqual([{ text: 'WEAK FREQ B', tint: CRT.main, bar: null }, { text: 'ENEMY LASER', tint: CRT.main, bar: 0.5 }, { text: 'MISSILE READY', tint: CRT.main, bar: null }]);
    expect(v.scan).toEqual({ label: 'SCANNED', enabled: false, progress: null });
    st.systems[1].magazine = 0;
    expect(model(st)!.lines[2]!.text).toBe('RELOADING');
  });
});

describe('the enemy below Level 2 (Sci-1 spec §7.2)', () => {
  it('Level 0: UNKNOWN CONTACT, no drawing, no weapon list, SCAN 1 (SLOW) at Weapons', () => {
    expect(model(known(0))).toMatchObject({ contact: 0, title: 'UNKNOWN CONTACT', shields: null, hull: null, outline: [], rooms: [], lockRoom: null, weapons: null, aim: false,
      scan: { label: 'SCAN 1 (SLOW)', enabled: true, progress: null }, lines: [] });
  });
  it('Level 1: the outline with ? labels and no damage looks, no lock mark; pips, hull, the hostility line; SCAN 2', () => {
    const st = known(1); st.systems[1].rooms = [2, 2, 2]; st.tick = 600;
    const v = model(st, { station: 'science', weapons: null })!;
    expect(v.rooms.map((r) => r.label)).toEqual(['?', '?', '?']);
    for (const r of v.rooms) expect({ fill: r.fill, stroke: r.stroke, hatch: r.hatch }).toEqual({ fill: roomLook(false, 0, 0).fill, stroke: roomLook(false, 0, 0).stroke, hatch: null });
    expect([v.lockRoom, v.shields !== null, v.hull !== null]).toEqual([null, true, true]);
    expect(v.lines).toEqual([{ text: 'HOSTILE IN 10 s', tint: CRT.main, bar: null }]);
    expect(v.scan).toEqual({ label: 'SCAN 2', enabled: true, progress: null });
  });
  it('null for an inactive enemy', () => {
    const st = known(2); st.ships[1].active = false;
    expect(model(st)).toBeNull();
  });
});

describe('the derelict and no selection (Sci-1 spec §7.2, §7.3)', () => {
  it('Level 0: UNKNOWN CONTACT and SCAN 1; Level 1: DERELICT with its loot, TRAPPED blinking, the range and the hint with the hold', () => {
    const st = createTacticalState(4);
    expect(model(st, { contact: 1, station: 'science', weapons: null })).toMatchObject({ contact: 1, title: 'UNKNOWN CONTACT', scan: { label: 'SCAN 1' }, weapons: null });
    st.known[1] = 1; Object.assign(st.derelict, { loot: Loot.Shield, trapped: true, salvage: 150, salvaged: false });
    const p = derelictPos(st), range = Math.round(Math.hypot(p.x - st.ships[0].x, p.y - st.ships[0].y) / 10) * 10;
    const v = model(st, { contact: 1, station: 'helm', weapons: null, t: 0.3 })!;
    expect([v.title, v.shields, v.hull, v.outline, v.weapons]).toEqual(['DERELICT', null, null, [], null]);
    expect(v.lines).toEqual([
      { text: 'LOOT SHIELD', tint: CRT.main, bar: null }, { text: 'TRAPPED', tint: CRT.hot, bar: null },
      { text: `RANGE ${range}`, tint: CRT.main, bar: null }, { text: 'CLOSE TO 60, MATCH SPEED', tint: CRT.mid, bar: 0.5 }
    ]);
    expect(model(st, { contact: 1, station: 'helm', weapons: null, t: 0 })!.lines[1]!.tint).toBe(CRT.main);   // the other blink phase
    expect(v.scan).toEqual({ label: 'SCANNED', enabled: false, progress: null });
    st.derelict.salvaged = true;
    expect(model(st, { contact: 1, station: 'helm', weapons: null })!.lines.map((l) => l.text)).toEqual(['SALVAGED', `RANGE ${range}`]);
  });
  it('Science with nothing selected: NO CONTACT SELECTED; Helm and Weapons with nothing: no window', () => {
    expect(model(createTacticalState(4), { contact: null, station: 'science', weapons: null })).toMatchObject({ contact: null, title: 'NO CONTACT SELECTED', scan: null, lines: [], rooms: [] });
    expect(model(createTacticalState(4), { contact: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/contactController.test.ts tests/contactModel.test.ts`
Expected: FAIL (the old controller's state has `ship`; the old model takes `ship` and has no `lines`).

- [ ] **Step 3: The controller**

Replace `src/renderer/src/app/duel/contactController.ts` with:

```ts
// The contact window's state (enemy ship window spec §3, §5, §6.1; Sci-1 spec §7.2, §7.3): which map contact the window
// shows (a contact id: 0 the enemy, 1 the derelict) and whether the laser aim is armed, and the requests Science's
// clicks and keys and the SCAN button make (designate, scan). Pure and local to one player's screen: the duel modes
// turn the requests into commands. One controller per duel mode, beside the keyboard; the scene drives `click` and
// `sync` each frame, the UI actions drive the rest, and `intercept` is the keyboard's hook for Esc, T and S, reading
// what the last `sync` recorded.
import type { ConsoleStation } from '../../render/duel/consoleModel';

export type ContactId = 0 | 1;
export interface ContactState { contact: ContactId; aim: boolean }
/** One frame's facts for the closing rules: `shown` is the console shown on a map view (Helm, Weapons or Science);
 *  `station` the console's station, null while it is hidden; `target` the enemy's ship slot (the crew laser's target);
 *  `active` whether a slot's ship is active; `epoch` the round; `enemyKnown` the enemy's scan level (absent: 2). */
export interface ContactSync { shown: boolean; station: ConsoleStation | null; target: number; active: (slot: number) => boolean; epoch: number; enemyKnown?: number }
/** What the clicks and keys asked the duel mode to send since the last take: a designation (−1, 0 or 1) and a scan. */
export interface ContactRequests { designate: number | null; scan: ContactId | null }
export interface ContactController {
  state(): ContactState | null;
  /** A map click: on Helm or Weapons open on the contact, switch to it (disarmed), or close when it is the shown one; on
   *  Science select it and request designate. null does nothing. */
  click(contact: ContactId | null): void;
  /** T: Helm and Weapons cycle enemy, derelict, closed; Science cycles enemy, derelict, none and requests designate. */
  toggle(): void;
  /** The window's X: closes it (on Science deselects and requests designate −1). */
  close(): void;
  /** LASER: toggles the aim while the enemy is shown at Level 1 or more, never on Science; a no-op on the derelict. */
  arm(): void;
  cancelAim(): void;
  /** Esc: disarms if armed, else closes (on Science deselects); true when it took something, false when nothing is open. */
  escape(): boolean;
  /** SCAN (the window's button; S on Science): request a scan of the shown contact. */
  scan(): void;
  /** The closing rules, once per frame: clears when not shown, on a new epoch, and the enemy contact when its slot is
   *  inactive; disarms on a station change and when the enemy is below Level 1. Records the frame for `intercept`.
   *  Returns whether the window is shown (always on Science while shown, even with nothing selected). */
  sync(s: ContactSync): boolean;
  /** A room click while armed: `lock(room)` (the console lock path), then disarm; the window stays open. */
  pick(room: number, lock: (room: number) => void): void;
  /** The keyboard's intercept: true takes the key. Escape while shown with a contact; KeyT while shown on Helm, Weapons
   *  or Science; KeyS while shown on Science; everything else false. */
  intercept(code: string): boolean;
  /** The requests since the last take, then cleared. */
  takeRequests(): ContactRequests;
}
/** What the UI's actions forward to (ui/actions.ts setContact). */
export type ContactActions = Pick<ContactController, 'close' | 'arm' | 'cancelAim' | 'pick' | 'scan'>;

export function createContactController(): ContactController {
  let st: ContactState | null = null, designate: number | null = null, scanned: ContactId | null = null;
  // What the last sync recorded (the last drawn frame).
  let allowed = false, station: ConsoleStation | null = null, epoch: number | null = null, enemyKnown = 2;
  const science = (): boolean => station === 'science';
  const select = (next: ContactId | null): void => { st = next === null ? null : { contact: next, aim: false }; designate = next ?? -1; };
  const c: ContactController = {
    state: () => st,
    click(contact) {
      if (contact === null) return;
      if (science()) { select(contact); return; }
      st = st && st.contact === contact ? null : { contact, aim: false };
    },
    toggle() {
      const next: ContactId | null = st === null ? 0 : st.contact === 0 ? 1 : null;
      if (science()) select(next); else st = next === null ? null : { contact: next, aim: false };
    },
    close() { if (science()) select(null); else st = null; },
    arm() { if (st && st.contact === 0 && enemyKnown >= 1 && !science()) st = { ...st, aim: !st.aim }; },
    cancelAim() { if (st?.aim) st = { ...st, aim: false }; },
    escape() {
      if (!st) return false;
      if (st.aim) st = { ...st, aim: false };
      else if (science()) select(null);
      else st = null;
      return true;
    },
    scan() { if (st) scanned = st.contact; },
    sync(s) {
      if (epoch !== null && s.epoch !== epoch) st = null;                        // a new round
      enemyKnown = s.enemyKnown ?? 2;
      if (st && (!s.shown || (st.contact === 0 && !s.active(s.target)))) st = null;   // hidden, SHIP, paused, decided, or the enemy is gone
      if (st?.aim && station !== null && s.station !== station) st = { ...st, aim: false };   // a station change disarms
      if (st?.aim && enemyKnown < 1) st = { ...st, aim: false };
      allowed = s.shown; station = s.station; epoch = s.epoch;
      return allowed && (st !== null || station === 'science');
    },
    pick(room, lock) {
      if (!st?.aim) return;
      lock(room);
      st = { ...st, aim: false };
    },
    intercept(code) {
      if (code === 'Escape') return allowed && st !== null ? c.escape() : false;
      if (!allowed) return false;
      if (code === 'KeyT' && (station === 'helm' || station === 'weapons' || station === 'science')) { c.toggle(); return true; }
      if (code === 'KeyS' && science()) { c.scan(); return true; }
      return false;
    },
    takeRequests() { const out = { designate, scan: scanned }; designate = null; scanned = null; return out; }
  };
  return c;
}
```

- [ ] **Step 4: The model**

In `src/renderer/src/render/duel/contactModel.ts`, replace everything from the header comment through the end of the file except `contactFit` (keep `contactFit` exactly as it is) with the following, placing `contactFit` where the comment marks it:

```ts
// The contact window's view model (enemy ship window spec §4.2, §6.4; Sci-1 spec §7.2): one map contact by contact id
// and scan level, as screen-ready data in internal px: the title and the SCAN button; for the enemy at Level 1 or more
// its shields, hull, outline and rooms fitted to the drawing box (labels and damage looks only at Level 2), the laser's
// lock room (Level 2) and the Weapons station's weapon list; and the info lines (the hostility line, Level 2's readings,
// the derelict's loot, trap, range and salvage hint). `t` is the scene's presentation clock, so the window blinks with
// the map frame for frame; React draws only what this returns.
import { derelictPos } from '../../sim/tactical/science';
import { classOf, Contact, CREW_SLOT, missileOf, targetOf, type TacticalState } from '../../sim/tactical/state';
import { HUNTER_MISSILE_COOLDOWN_TICKS, SALVAGE_TICKS } from '../../sim/tactical/tuning';
import { ALERT_BLINK_HZ, blink, CRT, DAMAGE_BLINK_HZ, HATCH_ANGLE, HATCH_SPACING, roomLevel, roomLook } from '../tactical/crtTheme';
import { hatchSegments } from '../tactical/dashModel';
import { HULLS, hullFor, roomCentre } from '../tactical/hullModel';
import { CONTACT_BOX } from './consoleLayout';
import type { WeaponsPanel } from './consoleModel';
import { FREQ_NAMES, hostilityLine, LOOT_NAMES, scanButton, type ScanButton } from './scienceModel';

/** The room labels, rooms[0] Weapons, rooms[1] Shields, rooms[2] Engines (the lock buttons' words). */
export const ROOM_LABELS = ['WEAP', 'SHLD', 'ENG'] as const;
/** Internal px kept clear between the outline and the drawing box's edges. */
export const CONTACT_PAD = 8;

export interface ContactRoom {
  label: string;
  /** roomCentre in window space: where the label and the lock mark sit. */
  centre: { x: number; y: number };
  /** The room polygon, flat [x, y, ...] in internal px. */
  points: number[];
  fill: number | null; stroke: number;
  /** Null when roomLook gives no hatch; else its colour and flat segment endpoints [x1, y1, x2, y2, ...]. */
  hatch: { colour: number; segments: number[] } | null;
}
export interface ContactLaser { label: string; value: string; fill: number; lit: boolean; enabled: boolean; note: string | null }
/** One info line under the drawing: its text, its resolved ramp colour (an alert blinks hot and main), and a bar 0..1. */
export interface ContactLine { text: string; tint: number; bar: number | null }
export interface ContactView {
  /** The shown contact, or null on Science with nothing selected. */
  contact: 0 | 1 | null;
  title: string;
  /** The enemy at Level 1 or more; null otherwise. */
  shields: { up: number; of: number } | null;
  hull: { value: number; fill: number } | null;
  /** The drawing box in internal px (CONTACT_BOX). */
  box: { x: number; y: number; w: number; h: number };
  /** The enemy's outline and rooms at Level 1 or more; empty otherwise. */
  outline: number[];
  rooms: ContactRoom[];
  /** The crew laser's lock room, at Level 2. */
  lockRoom: number | null;
  /** Weapons only, the enemy at Level 1 or more: LASER (the station block's charge row) and MISSILE (not aimable). */
  weapons: null | { laser: ContactLaser; missile: { magazine: number } };
  /** The aim is armed (Weapons only). */
  aim: boolean;
  /** The SCAN button; null with nothing selected. */
  scan: ScanButton | null;
  lines: ContactLine[];
}
export interface ContactModelInput {
  state: TacticalState;
  /** The shown contact (0 the enemy, 1 the derelict), or null (Science with nothing selected). */
  contact: 0 | 1 | null;
  aim: boolean;
  station: 'helm' | 'weapons' | 'science';
  /** Presentation seconds, for the blinks. */
  t: number;
  /** The Weapons station block's panel (its charge row), or null elsewhere. */
  weapons: Pick<WeaponsPanel, 'charge'> | null;
}

// (contactFit stays here, unchanged.)

const line = (text: string, tint: number = CRT.main, bar: number | null = null): ContactLine => ({ text, tint, bar });

export function contactModel(i: ContactModelInput): ContactView | null {
  const { state } = i, box = { x: CONTACT_BOX.x, y: CONTACT_BOX.y, w: CONTACT_BOX.w, h: CONTACT_BOX.h };
  const alert = blink(i.t, ALERT_BLINK_HZ) ? CRT.hot : CRT.main;
  const bare = (contact: 0 | 1 | null, title: string, lines: ContactLine[] = []): ContactView => ({
    contact, title, shields: null, hull: null, box, outline: [], rooms: [], lockRoom: null, weapons: null, aim: false,
    scan: contact === null ? null : scanButton(state, contact, i.station), lines
  });
  if (i.contact === null) return i.station === 'science' ? bare(null, 'NO CONTACT SELECTED') : null;
  if (i.contact === Contact.Derelict) {
    if (state.known[Contact.Derelict] < 1) return bare(Contact.Derelict, 'UNKNOWN CONTACT');
    const dr = state.derelict, p = derelictPos(state), crew = state.ships[CREW_SLOT];
    const range = Math.round(Math.hypot(p.x - crew.x, p.y - crew.y) / 10) * 10;
    const lines = [line(dr.salvaged ? 'SALVAGED' : `LOOT ${LOOT_NAMES[dr.loot] ?? ''}`)];
    if (dr.trapped && !dr.salvaged) lines.push(line('TRAPPED', alert));
    lines.push(line(`RANGE ${range}`));
    if (!dr.salvaged) lines.push(line('CLOSE TO 60, MATCH SPEED', CRT.mid, dr.salvage > 0 ? Math.min(1, dr.salvage / SALVAGE_TICKS) : null));
    return bare(Contact.Derelict, 'DERELICT', lines);
  }
  const slot = targetOf(state, CREW_SLOT), body = state.ships[slot];   // the enemy is drawn through the hunter's slot
  if (!body || !body.active) return null;
  const level = state.known[Contact.Enemy];
  if (level < 1) return bare(Contact.Enemy, 'UNKNOWN CONTACT');
  const sys = state.systems[slot]!, cls = classOf(state, slot), crewSys = state.systems[CREW_SLOT], full = level >= 2;
  const hull = hullFor(false), shape = HULLS[hull], at = contactFit(shape.outline, box);
  const place = (poly: readonly number[]): number[] => {
    const out: number[] = [];
    for (let k = 0; k + 1 < poly.length; k += 2) { const q = at(poly[k]!, poly[k + 1]!); out.push(q.x, q.y); }
    return out;
  };
  const phase = blink(i.t, DAMAGE_BLINK_HZ);
  const rooms: ContactRoom[] = shape.rooms.map((poly, r) => {
    const look = roomLook(false, full ? roomLevel(sys.rooms[r] ?? 0) : 0, phase), points = place(poly), c = roomCentre(hull, r);   // Level 1: no damage
    return {
      label: full ? ROOM_LABELS[r] ?? '' : '?', centre: at(c.f, c.s), points, fill: look.fill, stroke: look.stroke,
      hatch: look.hatch === null ? null : { colour: look.hatch, segments: hatchSegments(points, HATCH_SPACING, HATCH_ANGLE) }
    };
  });
  const weapons = i.station === 'weapons' && i.weapons
    ? { laser: { label: i.weapons.charge.label, value: i.weapons.charge.value, fill: i.weapons.charge.bar?.fill ?? 0, lit: i.aim, enabled: true, note: null }, missile: { magazine: crewSys.magazine } }
    : null;
  const lines: ContactLine[] = [], hostile = hostilityLine(state);
  if (hostile) lines.push(line(hostile.text, hostile.alert ? alert : CRT.main));
  if (full) {   // Level 2's readings (presentation of the hunter's existing state)
    lines.push(line(`WEAK FREQ ${FREQ_NAMES[state.weakFreq] ?? ''}`));
    lines.push(line('ENEMY LASER', CRT.main, Math.min(1, sys.laserCharge / cls.slots.laser.chargeUnits)));
    const ready = sys.magazine > 0 && missileOf(state, slot) === null && state.tick - state.hunter.lastLaunch >= HUNTER_MISSILE_COOLDOWN_TICKS;
    lines.push(line(ready ? 'MISSILE READY' : 'RELOADING'));
  }
  return {
    contact: Contact.Enemy, title: 'ENEMY SHIP',
    shields: { up: sys.shields, of: cls.shields.layers },
    hull: { value: sys.hull, fill: Math.max(0, Math.min(1, sys.hull / cls.hull)) },
    box, outline: place(shape.outline), rooms, lockRoom: full ? crewSys.lock : null, weapons, aim: i.aim && weapons !== null,
    scan: scanButton(state, Contact.Enemy, i.station), lines
  };
}
```

- [ ] **Step 5: The scene, the actions and the window's null fields**

`src/renderer/src/app/duel/scene.ts`:
- the tacticalModel import: `import { pickContact, tacticalModel, type PrevBody } from '../../render/tactical/tacticalModel';` (pickShip is no longer used here)
- the state import: `import { Contact, CREW_SLOT, Outcome, type Axes } from '../../sim/tactical/state';`
- the click: `        contact.click(pickContact({ state: d.tactical, prev: source.prev, alpha, camera: source.cameras[view], viewport }, click));`
- the sync: `        ? contact.sync({ shown: aimable, station, target: d.tactical.systems[CREW_SLOT]!.target, active: (slot) => d.tactical.ships[slot]?.active === true, epoch: source.epoch(), enemyKnown: d.tactical.known[Contact.Enemy] })`
- the contact model call: `        ? contactModel({ state: d.tactical, contact: open.contact, aim: open.aim, station, t, weapons: consoleView?.weapons ?? null })`

(`view` there is narrowed by `aimable` to a map view, as before.)

`src/renderer/src/ui/actions.ts`: in `contactActions`, after the `pick` member add `,\n    scan: (): void => contactInput?.scan()`, and extend its comment: `SCAN asks the controller for a scan request (Sci-1 spec §7.2).`

`src/renderer/src/ui/duel/ContactWindow.tsx`: wrap the shield pips block (`{Array.from({ length: contact.shields.of }, ...)}`) as `{contact.shields && Array.from({ length: contact.shields.of }, (_, k) => ( ... ))}` with `contact.shields!.up` inside written as `contact.shields.up` (TypeScript narrows it), and wrap the three HULL elements (the `HULL` PixelText, the `Bar`, the value PixelText) in `{contact.hull && (<> ... </>)}`. Task 12 rewrites the component; this step only keeps it compiling.

- [ ] **Step 6: The tests that name the old keys**

`tests/contactWindow.test.tsx`:
- replace `contactOf` with:

```ts
const contactOf = (station: 'helm' | 'weapons', aim: boolean): ContactView => {
  const st = createTacticalState(4); st.known[0] = 2;   // Sci-1: the full window is Level 2
  return contactModel({ state: st, contact: 0, aim, station, t: 0, weapons: station === 'weapons' ? { charge } : null })!;
};
```

- in `mount`, `const c = { close: vi.fn(), arm: vi.fn(), cancelAim: vi.fn(), pick: vi.fn(), scan: vi.fn() };`
- delete the test `it('a ship that is not the laser\'s target: LASER disabled and NOT TARGETED', ...)` (after the re-key the enemy contact is always the laser's target slot; `enabled` stays in the model for a later multi-ship encounter).

`tests/contactScene.test.ts`, first test: after `      expect(r.rt.view()).toBe('weapons');` add `      r.rt.duel.tactical.known[0] = 2;   // Sci-1: the full window needs the enemy at Level 2`, and change `expect(r.contact.state()).toEqual({ ship: 1, aim: false });` to `expect(r.contact.state()).toEqual({ contact: 0, aim: false });`.

`tests/onlineDuelSession.test.ts`, in `'with input blocked or the window unfocused, Escape and T are not taken by the window'`: both `expect(contact.state()).toEqual({ ship: 1, aim: false });` become `expect(contact.state()).toEqual({ contact: 1, aim: false });` (its `show` clicks contact 1, the derelict).

`tests/uiActions.test.ts`, in `'forward to the controller set with setContact; ...'`: the mock becomes `const c = { close: vi.fn(), arm: vi.fn(), cancelAim: vi.fn(), pick: vi.fn((room: number, l: (r: number) => void) => l(room)), scan: vi.fn() };`, the forwarding line becomes `actions.contact.close(); actions.contact.arm(); actions.contact.cancelAim(); actions.contact.pick(2); actions.contact.scan();`, and the count expectation becomes `expect([c.close.mock.calls.length, c.arm.mock.calls.length, c.cancelAim.mock.calls.length, c.pick.mock.calls.length, c.scan.mock.calls.length]).toEqual([1, 1, 1, 1, 1]);`. Add `actions.contact.scan();` to the no-op line before `setContact`.

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npx vitest run tests/contactController.test.ts tests/contactModel.test.ts tests/contactWindow.test.tsx tests/contactScene.test.ts tests/onlineDuelSession.test.ts tests/duelModeDispose.test.ts tests/uiActions.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/app/duel/contactController.ts src/renderer/src/render/duel/contactModel.ts src/renderer/src/app/duel/scene.ts src/renderer/src/ui/actions.ts src/renderer/src/ui/duel/ContactWindow.tsx tests/contactController.test.ts tests/contactModel.test.ts tests/contactWindow.test.tsx tests/contactScene.test.ts tests/onlineDuelSession.test.ts tests/uiActions.test.ts
git commit -m "feat(sci-1): the contact window re-keyed on contacts (enemy or derelict, by scan level), Science's selection and requests, T cycling, S scanning" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Keys, clicks and the scene: 1/2/3, S and T by station, SCAN, designate on a Science click, the hover readout

**Files:**
- Modify: `src/renderer/src/app/duel/input.ts` (ConsoleInput, KeySample, FREQ_CODES, frequencyRequest, the keyboard, PointerSource.position), `src/renderer/src/ui/actions.ts` (`console.frequency`), `src/renderer/src/app/duel/runtime.ts` (deps, play, frame), `src/renderer/src/app/duel/onlineDuel.ts` (play, pump, the scene's pointer), `src/renderer/src/app/duel/duelMode.ts` (the runtime's requests, the scene's pointer), `src/renderer/src/app/duel/scene.ts` (DuelSceneOptions.pointer, the window on all three consoles, the hover)
- Create: `tests/scienceInput.test.ts`
- Test updates: `tests/uiConsole.test.tsx:32` and `tests/uiActions.test.ts:171` (the ConsoleInput mocks gain `frequency`), and append to `tests/onlineDuelSession.test.ts`

**Interfaces:**
- Consumes: Task 10's `ContactController.takeRequests`, `ContactRequests`, `scan()`; Task 9's `hoverReadout`; Task 7's `pickContact`, `interpolatedShip`; `CONTACT_MAX_LEVEL`.
- Produces:
  ```ts
  // app/duel/input.ts
  export interface ConsoleInput { press(action: KeyAction): void; hold(code: HoldCode, on: boolean): void; lock(room: number): void; throttle(level: number): void; frequency(freq: number): void }
  // KeySample gains  freqTo?: number | null
  export const FREQ_CODES: Readonly<Record<string, number>>;          // Digit1 0, Digit2 1, Digit3 2
  export function frequencyRequest(base: number, to: number | null | undefined): number | null;
  // PointerSource gains  position(): { x: number; y: number } | null
  // app/duel/runtime.ts: DuelRuntimeDeps gains  takeContactRequests?(): ContactRequests
  // app/duel/scene.ts: DuelSceneOptions gains  pointer?: () => { x: number; y: number } | null
  // ui/actions.ts: actions.console gains  frequency(freq: number): void
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/scienceInput.test.ts`:

```ts
// Sci-1 (spec 2026-11-17-science-scans §7.2, §7.3, §7.4): keys 1/2/3 and the console's frequency buttons, the pointer's
// position, the local runtime turning the contact controller's requests and the frequency into commands, and the scene
// at Science (the window always shown, the hover readout, a map click on the wreck designating it).
import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { createDuelKeyboard, createPointerSource, emptyPresses, frequencyRequest, type EventSource, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { createContactController } from '../src/renderer/src/app/duel/contactController';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import { sitDown } from '../src/renderer/src/sim/stations';
import { derelictPos } from '../src/renderer/src/sim/tactical/science';

const layout = parseShip(cutter), vp = { w: 1280, h: 720 };
const LIVE = { banner: null, layerPaused: false, end: null };
function fakeTarget() {
  const l = new Map<string, ((e: never) => void)[]>();
  return {
    addEventListener(t: string, fn: (e: never) => void) { l.set(t, [...(l.get(t) ?? []), fn]); },
    removeEventListener() {},
    fire(t: string, e: object) { for (const fn of l.get(t) ?? []) fn(e as never); }
  };
}
const key = (code: string, repeat = false) => ({ code, repeat, preventDefault() {} });

describe('the frequency keys and buttons (spec §7.4)', () => {
  it('1, 2 and 3 ask for A, B and C once per sample; repeats do not; the console button asks too; clear and clearUi drop it', () => {
    const t = fakeTarget(), kb = createDuelKeyboard(t as unknown as EventSource);
    t.fire('keydown', key('Digit2'));
    expect(kb.sample().freqTo).toBe(1); expect(kb.sample().freqTo).toBeNull();
    t.fire('keydown', key('Digit3', true)); expect(kb.sample().freqTo).toBeNull();
    t.fire('keydown', key('Digit1')); t.fire('keydown', key('Digit3')); expect(kb.sample().freqTo).toBe(2);
    kb.ui.frequency(0); expect(kb.sample().freqTo).toBe(0);
    kb.ui.frequency(1); kb.clearUi(); expect(kb.sample().freqTo).toBeNull();
    t.fire('keydown', key('Digit1')); kb.clear(); expect(kb.sample().freqTo).toBeNull();
    kb.destroy();
  });
  it('frequencyRequest: a whole 0..2 that differs from the base, else null', () => {
    expect([frequencyRequest(0, 2), frequencyRequest(2, 2), frequencyRequest(0, null), frequencyRequest(0, undefined), frequencyRequest(0, 3), frequencyRequest(0, 1.5), frequencyRequest(1, 0)])
      .toEqual([2, null, null, null, null, null, 0]);
  });
});

describe('the pointer position (spec §7.3)', () => {
  it('is the last pointer position in internal px, null before any, and a sample does not clear it', () => {
    const t = fakeTarget(), p = createPointerSource(t as unknown as EventSource, (cx, cy) => ({ x: cx / 2, y: cy / 2 }));
    expect(p.position()).toBeNull();
    t.fire('pointermove', { clientX: 100, clientY: 50, button: 0, buttons: 0, preventDefault() {} });
    expect(p.position()).toEqual({ x: 50, y: 25 });
    p.sample(); expect(p.position()).toEqual({ x: 50, y: 25 });
    p.destroy();
  });
});

/** The local runtime on a fake clock with a contact controller, as tests/duelRuntime.test.ts drives it. */
function rig() {
  let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
  const tasks: { at: number; cb: () => void }[] = [], contact = createContactController();
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: vp, layout,
    scheduler: { schedule(delay, cb) { const t = { at: now + delay, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses(), freqTo: null }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    takeContactRequests: () => contact.takeRequests()
  });
  /** A frame, one tick of wall time, a frame: requests drained by the first frame go out on exactly that tick. */
  const tick = (): void => { rt.frame(1 / 60); now += 1000 / 60; tasks.sort((a, b) => a.at - b.at); while (tasks[0] && tasks[0].at <= now) tasks.shift()!.cb(); rt.frame(1 / 60); };
  const freq = (f: number): void => { keys = { ...keys, freqTo: f }; };
  const at = (station: 'helm' | 'weapons' | 'science') => contact.sync({ shown: true, station, target: 1, active: () => true, epoch: 0, enemyKnown: rt.duel.tactical.known[0] });
  const kinds = (): string[] => rt.lastResults().map((r) => `${r.status}`);
  tick();   // the solo start: player 1 goes away on tick 0
  return { rt, contact, tick, freq, at, kinds };
}

describe('the requests to commands (spec §5, §7.2, §7.3)', () => {
  it('Science: a selection sends designate once; S sends contactScan at Science\'s rate; a repeat of the held value is not sent', () => {
    const r = rig(), d = r.rt.duel;
    try {
      sitDown(d.interior, 0, d.science); r.at('science');
      r.contact.click(1); r.tick();
      expect([d.tactical.designated, r.kinds()]).toEqual([1, ['applied']]);
      r.contact.click(1); r.tick();
      expect(r.kinds()).toEqual([]);
      expect(r.contact.intercept('KeyS')).toBe(true); r.tick();
      expect(r.kinds()).toEqual(['applied']);
      expect(d.tactical.scan).toMatchObject({ contact: 1, level: 1, rate: 5, by: d.science });
      r.contact.toggle(); r.tick();   // derelict → none
      expect(d.tactical.designated).toBe(-1);
    } finally { r.rt.dispose(); }
  });
  it('the Helm: the window\'s SCAN sends a slow scan; standing, a SCAN request is dropped', () => {
    const r = rig(), d = r.rt.duel;
    try {
      r.at('helm'); r.contact.click(0); r.contact.scan(); r.tick();   // standing
      expect(r.kinds()).toEqual([]);
      sitDown(d.interior, 0, d.nav); r.at('helm');
      r.contact.scan(); r.tick();
      expect(d.tactical.scan).toMatchObject({ contact: 0, level: 1, rate: 2, by: d.nav });
    } finally { r.rt.dispose(); }
  });
  it('Weapons: 1/2/3 (or a button) send laserFrequency only when it changes the tuned frequency', () => {
    const r = rig(), d = r.rt.duel;
    try {
      sitDown(d.interior, 0, d.weapons);
      r.freq(2); r.tick();
      expect([d.tactical.systems[0].freq, r.kinds()]).toEqual([2, ['applied']]);
      r.freq(2); r.tick();
      expect(r.kinds()).toEqual([]);
    } finally { r.rt.dispose(); }
  });
});

describe('the scene at Science (spec §7.2, §7.3)', () => {
  it('shows the window with nothing selected and the hover readout; a click on the wreck selects and designates it', () => {
    const r = rig(), d = r.rt.duel, clicks: { x: number; y: number }[] = [];
    const assets: GameAssets = { has: () => false, texture: (n) => { throw new Error(`no texture ${n}`); }, animation: (n) => { throw new Error(`no animation ${n}`); },
      nineSlice: (n) => { throw new Error(`no nine-slice ${n}`); }, missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7' };
    const renderer = { app: { stage: new Container() }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL, crt: () => 'off' as const };
    const store = createUiStore({ onlineAvailable: false } as never);
    const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store), contact: r.contact, takeClick: () => clicks.shift() ?? null, pointer: () => ({ x: 900, y: 300 }) });
    try {
      sitDown(d.interior, 0, d.science); r.tick();
      const cam = r.rt.cameras.science; cam.zoom = cam.targetZoom = cam.zoomFrom = 0.12;
      scene.draw(r.rt, 1 / 60, LIVE);
      const v = store.getState().duel!;
      expect([v.console?.station, v.contact?.title]).toEqual(['science', 'NO CONTACT SELECTED']);
      expect(v.console?.science?.hover).toMatch(/^BRG \d{3} RNG \d+$/);
      const w = derelictPos(d.tactical);
      clicks.push(worldToScreen(cam, vp, w.x, w.y)); scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.contact.state()).toEqual({ contact: 1, aim: false });
      expect(store.getState().duel?.contact?.title).toBe('UNKNOWN CONTACT');
      r.tick();
      expect(d.tactical.designated).toBe(1);
    } finally { scene.dispose(); r.rt.dispose(); }
  });
});
```

Append to `tests/onlineDuelSession.test.ts` (after its last `describe`; it uses that file's `rig`, `h` and the stub client; add `import { sitDown, standUp } from '../src/renderer/src/sim/stations';` to its imports):

```ts
describe('Science and the frequency online (Sci-1 spec §5, §7.3, §7.4)', () => {
  const contactOf = (): ContactController => (h.sceneOpts.at(-1) as unknown as { contact: ContactController }).contact;
  it('at Science a selection sends designate, S sends contactScan; at Weapons Digit2 sends laserFrequency 1', () => {
    const r = rig(1);
    standUp(r.d.interior, 1); sitDown(r.d.interior, 1, r.d.science);
    const c = r.attach(), contact = contactOf();
    contact.sync({ shown: true, station: 'science', target: 1, active: () => true, epoch: 0 });
    contact.click(1); r.pump();
    expect(c.commands().filter((x) => x.kind === 'designate')).toEqual([{ kind: 'designate', contact: 1 }]);
    r.key('keydown', 'KeyS'); r.key('keyup', 'KeyS'); r.pump();
    expect(c.commands().filter((x) => x.kind === 'contactScan')).toEqual([{ kind: 'contactScan', contact: 1 }]);
    r.dispose();
    const w = rig(1), cw = w.attach();   // the seated start: player 1 at Weapons
    w.key('keydown', 'Digit2'); w.key('keyup', 'Digit2'); w.pump();
    expect(cw.commands().filter((x) => x.kind === 'laserFrequency')).toEqual([{ kind: 'laserFrequency', freq: 1 }]);
    w.dispose();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/scienceInput.test.ts tests/onlineDuelSession.test.ts`
Expected: FAIL (`frequencyRequest` is not exported; `kb.ui.frequency` is not a function).

- [ ] **Step 3: The keyboard, the console input and the pointer**

`src/renderer/src/app/duel/input.ts`:
- `export interface ConsoleInput { press(action: KeyAction): void; hold(code: HoldCode, on: boolean): void; lock(room: number): void; throttle(level: number): void; frequency(freq: number): void }` and its comment `What a console click can do (spec §6.2): a press edge, a held code, a direct lock request, a throttle notch, or a laser frequency (Sci-1 spec §7.4).`
- in `interface KeySample`, after `throttleTo?` add:

```ts
  /** The last laser frequency asked for since the previous sample (Digit1..3, or a console button), or null (Sci-1 spec §7.4). */
  freqTo?: number | null;
```

- after `PRESS_CODES` add:

```ts
/** Sci-1 spec §7.4: keys 1, 2 and 3 tune the laser to A, B and C (the duel modes read them at Weapons only). */
export const FREQ_CODES: Readonly<Record<string, number>> = { Digit1: 0, Digit2: 1, Digit3: 2 };
```

- after `throttleRequest` add:

```ts
/** The frequency a frame asks for (Sci-1 spec §7.4): `to` when it is a whole 0..2 that differs from `base`, else null. */
export function frequencyRequest(base: number, to: number | null | undefined): number | null {
  return to === undefined || to === null || !Number.isInteger(to) || to < 0 || to > 2 || to === base ? null : to;
}
```

- in `createDuelKeyboard`: `let presses = emptyPresses(), lockTo: number | null = null, throttleTo: number | null = null, freqTo: number | null = null;`; in `down`, after the line `    else if (opts.intercept?.(e.code)) { taken.add(e.code); return; }   // ...` add `    if (!e.repeat && FREQ_CODES[e.code] !== undefined) freqTo = FREQ_CODES[e.code]!;`; `clearUi` and `clear` also set `freqTo = null`; `consoleInput` gains `    frequency(freq) { freqTo = freq; }` (after `throttle`); in `sample`, `const out: KeySample = { moveX: x / len, moveY: y / len, interactHeld: has(INTERACT_HELD), fireHeld: held.fire, presses, held, lockTo, throttleTo, freqTo };` and `presses = emptyPresses(); lockTo = null; throttleTo = null; freqTo = null;`.
- in `interface PointerSource`, after `takeClick` add:

```ts
  /** The last pointer position in internal px, or null before any (Sci-1 spec §7.3: Science's hover readout). Not cleared. */
  position(): { x: number; y: number } | null;
```

and in `createPointerSource`'s returned object, after `takeClick` add `    position: () => (x !== null && y !== null ? { x, y } : null),`.

`src/renderer/src/ui/actions.ts`: in `consoleActions`, after `throttle` add `,\n    frequency: (freq) => consoleInput?.frequency(freq)`.

`tests/uiConsole.test.tsx` L32: `const input = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), throttle: vi.fn(), frequency: vi.fn() };`
`tests/uiActions.test.ts` L171: `actions.setConsole({ press: vi.fn(), hold: vi.fn(), lock, throttle: vi.fn(), frequency: vi.fn() });`

- [ ] **Step 4: The runtime and the online session send the requests**

`src/renderer/src/app/duel/runtime.ts`:
- imports: `import { CONTACT_MAX_LEVEL, createTacticalState, missileOf, NO_AXES, Outcome, type Axes, type Missile, type TacticalState } from '../../sim/tactical/state';`, add `frequencyRequest` to the `./input` import, and add `import type { ContactRequests } from './contactController';`
- in `interface DuelRuntimeDeps`, after `onRound?` add:

```ts
  /** The contact window's requests since the last frame (Sci-1 spec §7.2, §7.3): designate and scan, sent by seat. */
  takeContactRequests?(): ContactRequests;
```

- replace `isConsoleCommand` with:

```ts
/** The commands only a seated console's player sends (Weapons, the Helm's throttle, Sci-1's three): a Tab or a stand drops them. */
const isConsoleCommand = (c: DuelCommand): boolean => isWeaponsCommand(c) || c.kind === 'throttle' || c.kind === 'laserFrequency' || c.kind === 'designate' || c.kind === 'contactScan';
const NO_REQUESTS: ContactRequests = { designate: null, scan: null };
```

- after `throttleBase` add:

```ts
  /** The active player's latest queued designation and laser frequency, else the sim's (as throttleBase). */
  const designateBase = (): number => { const c = [...pending].reverse().find((x) => x.player === active && x.command.kind === 'designate')?.command; return c && c.kind === 'designate' ? c.contact : d.tactical.designated; };
  const freqBase = (): number => { const c = [...pending].reverse().find((x) => x.player === active && x.command.kind === 'laserFrequency')?.command; return c && c.kind === 'laserFrequency' ? c.freq : d.tactical.systems[0].freq; };
```

- `function play(k: KeySample, requests: ContactRequests): KeySample {`; after the stand line (`    if (p.stand > 0) { ... return k; }`) add:

```ts
    // Sci-1 spec §5: a scan from any of the three consoles, unless that contact is fully known.
    if (requests.scan !== null && d.tactical.known[requests.scan] < CONTACT_MAX_LEVEL[requests.scan]) queue({ kind: 'contactScan', contact: requests.scan });
```

- replace Task 8's Science branch with:

```ts
    if (seat === 'science') {   // Sci-1 spec §7.3: the window's selection designates; C snaps the Science camera back
      if (requests.designate !== null && requests.designate !== designateBase()) queue({ kind: 'designate', contact: requests.designate });
      if (p.camera > 0) snapBack(cameras.science);
      return k;
    }
```

- in the Weapons part, after the `k.lockTo` line add:

```ts
    const freq = frequencyRequest(freqBase(), k.freqTo);   // 1/2/3 or a console button (Sci-1 spec §7.4)
    if (freq !== null) queue({ kind: 'laserFrequency', freq });
```

- in `frame`, after `      lastHeld = k.held ?? NO_HELD_FLAGS;` add `      const requests = deps.takeContactRequests?.() ?? NO_REQUESTS;   // drained every frame; dropped while paused or ended`, and change `k = play(k);` to `k = play(k, requests);`.

`src/renderer/src/app/duel/onlineDuel.ts`:
- imports: change `import { missileOf } from '../../sim/tactical/state';` to `import { CONTACT_MAX_LEVEL, missileOf } from '../../sim/tactical/state';`, add `frequencyRequest` to the `./input` import, and change the contact controller import to `import { createContactController, type ContactActions, type ContactRequests } from './contactController';`
- `  function play(k: KeySample, d: DuelState, me: number, requests: ContactRequests): void {`; after its stand line add:

```ts
    if (requests.scan !== null && d.tactical.known[requests.scan] < CONTACT_MAX_LEVEL[requests.scan]) send({ kind: 'contactScan', contact: requests.scan });   // Sci-1 spec §5
```

- replace Task 8's Science branch with:

```ts
    if (seat === 'science') {   // Sci-1 spec §7.3
      if (requests.designate !== null && requests.designate !== d.tactical.designated) send({ kind: 'designate', contact: requests.designate });
      if (p.camera > 0 && source) snapBack(source.cameras.science);
      return;
    }
```

- after the `k.lockTo` line add:

```ts
    const freq = frequencyRequest(d.tactical.systems[0].freq, k.freqTo);   // Sci-1 spec §7.4
    if (freq !== null) send({ kind: 'laserFrequency', freq });
```

- in `pump`, `    const k = keyboard.sample(), requests = contact.takeRequests();` and `    else play(k, d, me, requests);`
- in `attach`'s `createDuelScene` options, after `takeClick: ...` add `,\n        pointer: () => (focused && !blocked ? pointer.position() : null)`.

`src/renderer/src/app/duel/duelMode.ts`: in `createDuelRuntime({...})` add `takeContactRequests: () => contact.takeRequests(),` after `sampleKeys: ..., samplePointer: ...,`; in `createDuelScene(renderer, {...})` add `pointer: () => pointer.position()` after `takeClick`.

- [ ] **Step 5: The scene**

`src/renderer/src/app/duel/scene.ts`:
- imports: add `import { hoverReadout } from '../../render/duel/scienceModel';` and change the tacticalModel import to `import { interpolatedShip, pickContact, tacticalModel, type PrevBody } from '../../render/tactical/tacticalModel';`
- in `DuelSceneOptions`, after `takeClick?` add:

```ts
  /** The pointer's last position in internal px, or null (Sci-1 spec §7.3: Science's hover readout). */
  pointer?: () => { x: number; y: number } | null;
```

- replace `      const aimable = view !== 'interior' && (station === 'helm' || station === 'weapons');` with `      const onMap = view !== 'interior' && (station === 'helm' || station === 'weapons' || station === 'science');   // Sci-1 spec §7.2: the window on all three` and rename `aimable` to `onMap` in the click condition and in `sync({ shown: ... })`.
- before `const consoleView = consoleModel(...)` add:

```ts
      // Sci-1 spec §7.3: Science's hover readout, from the crew ship's drawn position to the cursor.
      const hover = station === 'science' && view !== 'interior'
        ? hoverReadout(source.cameras[view], viewport, interpolatedShip(d.tactical, source.prev, alpha, CREW_SLOT), options.pointer?.() ?? null)
        : null;
```

  and pass it: `consoleModel({ duel: d, me: source.active(), mode: source.mode, hidden, held: source.uiHeld(), overlay: overlayView, throttle: source.throttle(), hover })`.
- replace the contact view construction with:

```ts
      const contactView = shown && station !== null && station !== 'ship'   // Science's window shows with nothing selected
        ? contactModel({ state: d.tactical, contact: open?.contact ?? null, aim: open?.aim ?? false, station, t, weapons: consoleView?.weapons ?? null })
        : null;
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run tests/scienceInput.test.ts tests/onlineDuelSession.test.ts tests/contactScene.test.ts tests/duelRuntime.test.ts tests/duelInputMerge.test.ts tests/duelInput.test.ts tests/uiConsole.test.tsx tests/uiActions.test.ts tests/duelMode.test.ts tests/duelModeDispose.test.ts tests/duelOnlineView.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/app/duel/input.ts src/renderer/src/ui/actions.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/scene.ts tests/scienceInput.test.ts tests/onlineDuelSession.test.ts tests/uiConsole.test.tsx tests/uiActions.test.ts
git commit -m "feat(sci-1): keys and clicks: 1/2/3 tune the laser, S scans and T cycles on Science, SCAN on every console, a Science click designates, the hover readout; both duel modes send the commands" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The React pieces: SCAN and the info lines, the frequency row, the Science block

**Files:**
- Modify: `src/renderer/src/ui/duel/ContactWindow.tsx` (rewrite of its body), `src/renderer/src/ui/duel/WeaponsStation.tsx` (the frequency row), `src/renderer/src/ui/duel/DuelUi.tsx` (the Science block)
- Create: `src/renderer/src/ui/duel/ScienceStation.tsx`, `tests/scienceUi.test.tsx`

**Interfaces:**
- Consumes: Task 10's `ContactView` (`contact`, nullable `shields`/`hull`, `scan`, `lines`), `actions.contact.scan`; Task 9's `WeaponsPanel.freq/weakFreq`, `SciencePanel`, `FREQ_NAMES`, `STATION.h.science`, `stationTop('science')`; Task 11's `actions.console.frequency`.
- Produces: `ScienceStation({ science }: { science: SciencePanel })`. DOM hooks: buttons `console-contact-scan`, `console-freq-0`, `console-freq-1`, `console-freq-2`; the weak marker `[data-ui-weak-freq]`; the Science block's panel text.

- [ ] **Step 1: Write the failing test**

Create `tests/scienceUi.test.tsx`:

```tsx
// @vitest-environment jsdom
// Sci-1 (spec 2026-11-17-science-scans §7.2, §7.3, §7.4): the contact window's SCAN button and info lines for the
// unknown enemy, the derelict and Science with nothing selected; the Weapons frequency row; the Science block.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { contactModel, type ContactView } from '../src/renderer/src/render/duel/contactModel';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { createTacticalState, Loot } from '../src/renderer/src/sim/tactical/state';
import { TEXT } from '../src/renderer/src/render/theme';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const btn = (name: string) => document.querySelector(`[data-testid="console-${name}"]`) as HTMLElement | null;
const texts = () => Array.from(document.querySelectorAll('canvas')).map((e) => e.dataset.text);
const charge = { label: 'CHARGE', value: '40%', labelTint: TEXT, valueTint: TEXT, bar: { fill: 0.4, colour: TEXT } };
const frame = (console: ConsoleView | null, contact: ContactView | null): DuelUiView => ({ readout: { rows: [], help: [] }, end: null,
  banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console, contact });
function mount(view: DuelUiView) {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  const c = { close: vi.fn(), arm: vi.fn(), cancelAim: vi.fn(), pick: vi.fn(), scan: vi.fn() };
  const input = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), throttle: vi.fn(), frequency: vi.fn() };
  ui.actions.setContact(c); ui.actions.setConsole(input);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  act(() => duel.frame(view));
  return { c, input };
}
const weapons: ConsoleView = {
  station: 'weapons', tabs: { helm: 'locked', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
  helm: null, weapons: { lock: 1, charge, magazine: '4/4', canLaunch: true, missileFlying: false, fireHeld: false, held: NO_HELD_FLAGS, freq: 1, weakFreq: 2 }, science: null,
  side: { zoom: '0.50', free: false, snapLabel: 'CAMERA' }
};

describe('the contact window (spec §7.2)', () => {
  it('an unknown enemy: UNKNOWN CONTACT, no drawing, no LASER; SCAN 1 (SLOW) calls scan', () => {
    const st = createTacticalState(4), { c } = mount(frame(null, contactModel({ state: st, contact: 0, aim: false, station: 'weapons', t: 0, weapons: { charge } })));
    expect(texts()).toContain('UNKNOWN CONTACT');
    expect(document.querySelector('[data-ui-contact-box]')).toBeNull();
    expect(btn('contact-laser')).toBeNull();
    expect(texts()).toContain('SCAN 1 (SLOW)');
    fireEvent.pointerDown(btn('contact-scan')!, { button: 0 });
    expect(c.scan).toHaveBeenCalledTimes(1);
  });
  it('the derelict at Level 1: its loot, TRAPPED, the range, the hint; SCANNED is disabled', () => {
    const st = createTacticalState(4); st.known[1] = 1; Object.assign(st.derelict, { loot: Loot.Shield, trapped: true, salvage: 0, salvaged: false });
    const { c } = mount(frame(null, contactModel({ state: st, contact: 1, aim: false, station: 'helm', t: 0, weapons: null })));
    for (const t of ['DERELICT', 'LOOT SHIELD', 'TRAPPED', 'CLOSE TO 60, MATCH SPEED', 'SCANNED']) expect(texts(), t).toContain(t);
    expect(texts().some((t) => /^RANGE \d+$/.test(t ?? ''))).toBe(true);
    expect(btn('contact-scan')!.dataset.uiButton).toBe('disabled');
    fireEvent.pointerDown(btn('contact-scan')!, { button: 0 });
    expect(c.scan).not.toHaveBeenCalled();
  });
  it('Science with nothing selected: the title only, no close and no SCAN button', () => {
    mount(frame(null, contactModel({ state: createTacticalState(4), contact: null, aim: false, station: 'science', t: 0, weapons: null })));
    expect(texts()).toContain('NO CONTACT SELECTED');
    expect([btn('contact-close'), btn('contact-scan')]).toEqual([null, null]);
  });
  it('the enemy at Level 2 at Weapons: the drawing, LASER, and the readings below the weapon rows', () => {
    const st = createTacticalState(4); st.known[0] = 2; st.weakFreq = 2;
    mount(frame(null, contactModel({ state: st, contact: 0, aim: false, station: 'weapons', t: 0, weapons: { charge } })));
    expect(document.querySelector('[data-ui-contact-box]')).not.toBeNull();
    expect(btn('contact-laser')).not.toBeNull();
    for (const t of ['ENEMY SHIP', 'WEAP', 'WEAK FREQ C', 'ENEMY LASER', 'MISSILE READY', 'SCANNED']) expect(texts(), t).toContain(t);
  });
});

describe('the Weapons frequency row (spec §7.4)', () => {
  it('A B C buttons, the tuned one lit, the weak one marked; a click asks for its frequency', () => {
    const { input } = mount(frame(weapons, null));
    expect(['freq-0', 'freq-1', 'freq-2'].map((n) => btn(n)?.dataset.uiButton)).toEqual(['idle', 'lit', 'idle']);
    expect(document.querySelector('[data-ui-weak-freq]')?.getAttribute('data-ui-weak-freq')).toBe('C');
    fireEvent.pointerDown(btn('freq-0')!, { button: 0 });
    expect(input.frequency).toHaveBeenCalledWith(0);
    cleanup();
    mount(frame({ ...weapons, weapons: { ...weapons.weapons!, weakFreq: null } }, null));
    expect(document.querySelector('[data-ui-weak-freq]')).toBeNull();
  });
});

describe('the Science block (spec §7.3)', () => {
  it('shows the hover readout, a placeholder without a cursor, and the key help', () => {
    const science: ConsoleView = { ...weapons, station: 'science', weapons: null, science: { hover: 'BRG 327 RNG 1450' }, side: { zoom: '0.50', free: false, snapLabel: 'SNAP' } };
    mount(frame(science, null));
    for (const t of ['SCIENCE', 'BRG 327 RNG 1450', 'CLICK: SELECT   S: SCAN   T: NEXT']) expect(texts(), t).toContain(t);
    cleanup();
    mount(frame({ ...science, science: { hover: null } }, null));
    expect(texts()).toContain('BRG --- RNG ---');
  });
});
```

(`data-ui-button` is the Button's look: `disabled`, `lit`, `hover` or `idle`, `src/renderer/src/ui/stage/Button.tsx:38`.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/scienceUi.test.tsx`
Expected: FAIL (no `console-contact-scan`, no `console-freq-0`, no Science block).

- [ ] **Step 3: The contact window**

Replace the body of `ContactWindow` in `src/renderer/src/ui/duel/ContactWindow.tsx` (from `export const ContactWindow = memo(...` to the end) with the following, and add `Fragment` to the `react` import:

```tsx
/** The info lines' row height (Sci-1 spec §7.2): text, then the line's bar under it. */
const LINE_H = 20;

export const ContactWindow = memo(function ContactWindow({ contact }: { contact: ContactView }) {
  const actions = useActions(), l = useUi((s) => s.layout);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const b = contact.box, x0 = CONTACT.x + 8, right = CONTACT.x + CONTACT.w - 8, top = CONTACT.y;
  const statusY = top + 34, laserY = top + 270, missileY = top + 306, barX = x0 + 104;
  const linesY = contact.weapons ? top + 336 : top + 270, drawn = contact.outline.length > 0;
  const aiming = contact.aim && contact.weapons !== null;
  /** A client position to internal px: the inverse of boxCss on the stage (which starts below the session strip). */
  const toInternal = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const stageTop = Math.round(l.stripHeight * l.dpr) / l.dpr;
    return { x: (e.clientX - l.offsetX) / l.scale, y: (e.clientY - stageTop - l.offsetY) / l.scale };
  };
  const roomAt = (p: { x: number; y: number }): number => contact.rooms.findIndex((r) => pointInPolygon(p.x, p.y, r.points));
  const hover = aiming && pointer ? roomAt(pointer) : -1;
  const lock = contact.lockRoom === null ? null : contact.rooms[contact.lockRoom]?.centre ?? null;
  const laser = contact.weapons?.laser ?? null, scan = contact.scan;
  const rootDown = (e: ReactPointerEvent<HTMLDivElement>): void => { e.preventDefault(); if (e.button === 2) actions.contact.cancelAim(); };
  const boxDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    e.preventDefault();
    if (e.button === 2) { actions.contact.cancelAim(); return; }
    if (e.button !== 0 || !aiming) return;
    const room = roomAt(toInternal(e));
    if (room >= 0) actions.contact.pick(room);   // a click on no room does nothing; the aim stays armed
  };
  const boxStyle = { position: 'absolute' as const, ...boxCss(b.x, b.y, b.w, b.h, l), overflow: 'hidden' as const };
  return (
    <>
      <div data-ui-contact="" onPointerDown={rootDown} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop} onWheel={swallow}
        style={{ position: 'absolute', boxSizing: 'border-box', ...boxCss(CONTACT.x, CONTACT.y, CONTACT.w, CONTACT.h, l), pointerEvents: 'auto' }} />
      <Panel x={CONTACT.x} y={CONTACT.y} w={CONTACT.w} h={CONTACT.h} />
      <PixelText text={contact.title} x={x0} y={top + 8} size={FONT_NATIVE} tint={CRT.main} />
      {contact.contact !== null && <Button name="contact-close" label="X" x={right - 24} y={top + 6} w={24} h={20} onPress={() => actions.contact.close()} />}
      {scan && <Button name="contact-scan" label={scan.label} x={right - 24 - 6 - 132} y={top + 6} w={132} h={20} disabled={!scan.enabled} onPress={() => actions.contact.scan()} />}
      {scan?.progress != null && <Bar x={x0} y={top + 28} w={right - x0} h={3} fill={scan.progress} colour={CRT.main} />}
      {contact.shields && (
        <>
          <PixelText text="SHLD" x={x0} y={statusY} size={FONT_NATIVE} tint={CRT.mid} />
          {Array.from({ length: contact.shields.of }, (_, k) => (
            <Box key={k} x={x0 + 40 + k * 12} y={statusY + 4} w={8} h={8} attrs={{ 'data-ui-contact-pip': k < contact.shields!.up ? 'up' : 'down' }}
              style={k < contact.shields!.up ? { background: hex(CRT.main) } : { border: `1px solid ${hex(CRT.mid)}` }} />
          ))}
        </>
      )}
      {contact.hull && (
        <>
          <PixelText text="HULL" x={x0 + 120} y={statusY} size={FONT_NATIVE} tint={CRT.mid} />
          <Bar x={x0 + 156} y={statusY + 6} w={80} h={6} fill={contact.hull.fill} colour={CRT.main} />
          <PixelText text={String(contact.hull.value)} x={right} y={statusY} size={FONT_NATIVE} tint={CRT.main} anchorX={1} />
        </>
      )}
      {drawn && (
        <svg data-ui-contact-box="" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} preserveAspectRatio="none" shapeRendering="crispEdges"
          style={{ ...boxStyle, pointerEvents: 'auto', cursor: aiming ? 'none' : 'default' }}
          onPointerMove={(e) => setPointer(toInternal(e))} onPointerLeave={() => setPointer(null)} onPointerDown={boxDown}
          onContextMenu={stop} onMouseDown={stop} onAuxClick={stop} onWheel={swallow}>
          <polygon points={polyPoints(contact.outline)} fill={hex(CRT.glass)} stroke={hex(CRT.main)} strokeWidth={1} />
          {contact.rooms.map((r, k) => (
            <g key={k} data-ui-contact-room={r.label}>
              <polygon points={polyPoints(r.points)} fill={r.fill === null ? 'none' : hex(r.fill)} stroke={hex(r.stroke)} strokeWidth={1} />
              {r.hatch && <path d={segPath(r.hatch.segments)} stroke={hex(r.hatch.colour)} strokeWidth={1} fill="none" />}
            </g>
          ))}
        </svg>
      )}
      {contact.rooms.map((r, k) => {
        const w = Math.ceil(textPx(r.label, 1)), h = FONT_NATIVE, pad = 2;
        return (
          <Box key={k} x={Math.round(r.centre.x - w / 2) - pad} y={Math.round(r.centre.y - h / 2) - pad} w={w + 2 * pad} h={h + 2 * pad}
            attrs={{ 'data-ui-contact-label-bg': r.label }} style={{ background: hex(CRT.glass) }} />
        );
      })}
      {contact.rooms.map((r, k) => (
        <PixelText key={k} text={r.label} x={r.centre.x} y={r.centre.y} size={FONT_NATIVE} tint={CRT.hot} anchorX={0.5} anchorY={0.5} />
      ))}
      {drawn && (
        <svg data-ui-contact-marks="" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} preserveAspectRatio="none" style={{ ...boxStyle, pointerEvents: 'none' }}>
          {hover >= 0 && (
            <g data-ui-contact-hover="">
              <polygon points={polyPoints(contact.rooms[hover]!.points)} fill="none" stroke={hex(CRT.glass)} strokeWidth={3} />
              <polygon points={polyPoints(contact.rooms[hover]!.points)} fill="none" stroke={hex(CRT.hot)} strokeWidth={1} />
            </g>
          )}
          {lock && (
            <g data-ui-contact-lock="">
              <path d={brackets(lock.x, lock.y)} stroke={hex(CRT.glass)} strokeWidth={3} fill="none" />
              <path d={brackets(lock.x, lock.y)} stroke={hex(CRT.hot)} strokeWidth={1} fill="none" />
            </g>
          )}
          {aiming && pointer && (
            <g data-ui-contact-reticle="">
              <circle cx={pointer.x} cy={pointer.y} r={RETICLE_R} stroke={hex(CRT.glass)} strokeWidth={3} fill="none" />
              <path d={ticks(pointer.x, pointer.y)} stroke={hex(CRT.glass)} strokeWidth={3} fill="none" />
              <circle cx={pointer.x} cy={pointer.y} r={RETICLE_R} stroke={hex(CRT.hot)} strokeWidth={1} fill="none" />
              <path d={ticks(pointer.x, pointer.y)} stroke={hex(CRT.hot)} strokeWidth={1} fill="none" />
            </g>
          )}
        </svg>
      )}
      {contact.weapons && laser && (
        <>
          <Button name="contact-laser" label="LASER" x={x0} y={laserY} w={96} h={24} lit={laser.lit} disabled={!laser.enabled} onPress={() => actions.contact.arm()} />
          <PixelText text={laser.note ?? laser.label} x={barX} y={laserY + 2} size={FONT_NATIVE} tint={CRT.mid} />
          {laser.note === null && <PixelText text={laser.value} x={right} y={laserY + 2} size={FONT_NATIVE} tint={CRT.main} anchorX={1} />}
          <Bar x={barX} y={laserY + 20} w={right - barX} h={4} fill={laser.fill} colour={CRT.main} />
          <PixelText text="MISSILE" x={x0} y={missileY} size={FONT_NATIVE} tint={CRT.dim} />
          <PixelText text={`MAG ${contact.weapons.missile.magazine}`} x={barX} y={missileY} size={FONT_NATIVE} tint={CRT.dim} />
          <PixelText text="STEER A/D" x={right} y={missileY} size={FONT_NATIVE} tint={CRT.dim} anchorX={1} />
        </>
      )}
      {contact.lines.map((ln, k) => (
        <Fragment key={k}>
          <PixelText text={ln.text} x={x0} y={linesY + k * LINE_H} size={FONT_NATIVE} tint={ln.tint} />
          {ln.bar !== null && <Bar x={x0} y={linesY + k * LINE_H + 14} w={right - x0} h={3} fill={ln.bar} colour={CRT.main} />}
        </Fragment>
      ))}
    </>
  );
});
```

Update the file's header comment: after its first sentence add `Sci-1 spec §7.2: the window shows a contact id at its scan level (the unknown contact and the derelict have no drawing), a SCAN button with its progress, and info lines under the drawing.`

- [ ] **Step 4: The frequency row and the Science block**

`src/renderer/src/ui/duel/WeaponsStation.tsx`: add `import { FREQ_NAMES } from '../../render/duel/scienceModel';`, and before the closing `</>` add:

```tsx
      <PixelText text="FREQ" x={x0} y={y0 + 206} size={FONT_NATIVE} tint={main} />
      {FREQ_NAMES.map((label, f) => <Button key={f} name={`freq-${f}`} label={label} x={x0 + 52 + f * 56} y={y0 + 202} w={52} h={24}
        lit={weapons.freq === f} onPress={() => actions.console.frequency(f)} />)}
      {weapons.weakFreq !== null && <Box x={x0 + 52 + weapons.weakFreq * 56 + 41} y={y0 + 196} w={7} h={7} attrs={{ 'data-ui-weak-freq': FREQ_NAMES[weapons.weakFreq] ?? '' }}
        style={{ background: hex(crt ? CRT.hot : AMBER), transform: 'rotate(45deg)' }} />}
      <PixelText text="1/2/3" x={right} y={y0 + 206} size={FONT_NATIVE} tint={dim} anchorX={1} />
```

(The weak marker is spec §7.4's `◆`, drawn as a rotated 7 px square: the m5x7 atlas has no `◆` glyph, `src/renderer/src/ui/glyphs.ts` GLYPH_CHARS is printable ASCII plus `…—`.) Extend the header comment: `Sci-1 spec §7.4: the frequency row, A B C with the tuned one lit and the weak one marked after a Level 2 scan.`

Create `src/renderer/src/ui/duel/ScienceStation.tsx`:

```tsx
// The Science station block (Sci-1 spec 2026-11-17-science-scans §7.3): the map and the contact window are the Science
// console's controls, so the block holds only the hover readout (bearing and range from the crew ship to the cursor)
// and the key help, at the bottom left.
import { memo } from 'react';
import type { SciencePanel } from '../../render/duel/consoleModel';
import { STATION, stationTop } from '../../render/duel/consoleLayout';
import { DIM, FONT_NATIVE, FONT_SIZE, TEXT } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useCrt } from '../stage/CrtContext';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

export const ScienceStation = memo(function ScienceStation({ science }: { science: SciencePanel }) {
  const { crt } = useCrt(), top = stationTop('science'), x0 = STATION.x + 8, dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT;
  return (
    <>
      <Panel x={STATION.x} y={top} w={STATION.w} h={STATION.h.science} />
      <PixelText text="SCIENCE" x={x0} y={top + 6} size={FONT_NATIVE} tint={dim} />
      <PixelText text={science.hover ?? 'BRG --- RNG ---'} x={x0} y={top + 24} size={FONT_SIZE} tint={main} />
      <PixelText text="CLICK: SELECT   S: SCAN   T: NEXT" x={x0} y={top + 66} size={FONT_NATIVE} tint={dim} />
    </>
  );
});
```

`src/renderer/src/ui/duel/DuelUi.tsx`: add `import { ScienceStation } from './ScienceStation';` and after the `WeaponsStation` line add `          {duel.console?.science && <ScienceStation science={duel.console.science} />}`; extend the header comment's last sentence with `; Sci-1 adds the Science block.`

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run tests/scienceUi.test.tsx tests/contactWindow.test.tsx tests/uiConsole.test.tsx tests/uiDuel.test.tsx tests/uiCrt.test.tsx tests/uiBoundary.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/ui/duel/ContactWindow.tsx src/renderer/src/ui/duel/WeaponsStation.tsx src/renderer/src/ui/duel/ScienceStation.tsx src/renderer/src/ui/duel/DuelUi.tsx tests/scienceUi.test.tsx
git commit -m "feat(sci-1): the contact window's SCAN button and info lines, the Weapons frequency row with the weak marker, the Science block with the hover readout" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Verify, take the screenshots, record the gate

**Files:**
- Create (gitignored, never committed): `.art/sci-shots/index.html`, `.art/sci-shots/main.ts`, `.art/sci-shots/vite.config.mjs`, `.art/sci-shots/shot.cjs`, `.art/sci-shots/all.mjs`
- Modify: `docs/gates.md` (insert the gate section)
- Output (outside the repo): `C:\Users\djuar\FTLite-shots\sci-1\*.png`

**Interfaces:**
- Consumes: `createDuelScene(renderer, { seed, pauseText, ui, contact, pointer })`, `type DuelViewSource` (scene.ts: `duel, seed, prev, missilePrev, crewPrev, cameras { helm, weapons, science }, interiorCamera, epoch, active, view, otherStatus, axes, steer, alpha, paused, drainEvents, mode, running, uiHeld, throttle`); `createContactController()` (`sync`, `click`); `createUiActions(...).setContact / setConsole`; `createUiStore`, `setCrtSetting`, `setLayout`; `createDuelSink`; `mountUi`; `createDuel`; `sitDown`; `derelictPos`; `createCamera`; `createInteriorCamera`; `NO_HELD_FLAGS`.
- Produces: the totals, seven screenshots, the gate entry.

- [ ] **Step 1: Full suite and build.** (On an idle machine; several minutes.)

Run: `npm run build 2>&1 | tail -2`
Expected: the last line reports a successful build (`✓ built in ...`).

Run: `npx vitest run 2>&1 | tail -8`
Expected: 0 failed. Write down the totals (test files and tests). Rerun a timed-out sim file alone before calling it a failure; any other failure: stop and report.

Run: `npx tsc -b; echo "tsc exit=$?"`
Expected: `tsc exit=0` and no other output.

Run: `grep -n "SIM_VERSION =" src/renderer/src/sim/tuning.ts; npx vitest run tests/golden.test.ts tests/duelGolden.test.ts tests/duelRematchGolden.test.ts tests/boundary.test.ts tests/uiBoundary.test.ts 2>&1 | tail -3`
Expected: `7:export const SIM_VERSION = 45;`; the five files pass.

- [ ] **Step 2: Write the screenshot harness** (all under `.art/sci-shots/`, which `.gitignore` covers through `.art/`: `git check-ignore -v .art/sci-shots/main.ts` prints a `.gitignore:18:.art/` line). The harness stages one duel per shot and pins the contact window and the scan through the controller and the state directly.

`.art/sci-shots/index.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>FTLite Sci-1 shots</title>
    <style>html,body{margin:0;padding:0;background:#000;overflow:hidden}</style>
  </head>
  <body>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`.art/sci-shots/main.ts`:

```ts
// Sci-1 visual check harness (gitignored, never committed): the real duel scene and React UI on a staged duel.
// ?shot=science|unknown|derelict|freq|salvage&crt=subtle|full
//   science: player 0 at Science, the enemy known to Level 1 and scanned to Level 2 half way, designated; the window on
//            the enemy, the hover readout at (900, 300), Science's ring on the enemy.
//   unknown: player 1 at Weapons, the enemy unknown (a ? on the map), the window open on it (UNKNOWN CONTACT, SCAN 1 (SLOW)).
//   derelict: player 0 at the Helm 300 from the wreck, known to Level 1, trapped, Shield loot; the window on it.
//   freq: player 1 at Weapons, the enemy at Level 2 (weak frequency marked), tuned to B; the window on the enemy.
//   salvage: player 0 at the Helm on the wreck, the hold half full (the salvage ring and the hint's bar).
import hound from '../../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { createDuel } from '../../src/renderer/src/sim/duel/state';
import { sitDown } from '../../src/renderer/src/sim/stations';
import { derelictPos } from '../../src/renderer/src/sim/tactical/science';
import { Loot } from '../../src/renderer/src/sim/tactical/state';
import { loadAssets } from '../../src/renderer/src/render/assets';
import { createRenderer } from '../../src/renderer/src/render/renderer';
import { computeLetterbox } from '../../src/renderer/src/render/letterbox';
import { parseCrt } from '../../src/renderer/src/render/crt';
import { createCamera } from '../../src/renderer/src/render/tactical/camera';
import { createInteriorCamera } from '../../src/renderer/src/render/duel/interiorCamera';
import { createDuelScene, type DuelViewSource } from '../../src/renderer/src/app/duel/scene';
import { createContactController } from '../../src/renderer/src/app/duel/contactController';
import { NO_HELD_FLAGS } from '../../src/renderer/src/app/duel/input';
import { createUiStore, setCrtSetting, setLayout } from '../../src/renderer/src/ui/store';
import { createUiActions } from '../../src/renderer/src/ui/actions';
import { createDuelSink } from '../../src/renderer/src/ui/sinks';
import { mountUi } from '../../src/renderer/src/ui/mount';
import { INTERNAL_H, INTERNAL_W } from '../../src/shared/resolution';

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search), shot = q.get('shot') ?? 'science';
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  const store = createUiStore({ onlineAvailable: false }), crt = parseCrt(q.get('crt'));
  renderer.setCrt(crt); setCrtSetting(store, crt);
  const actions = createUiActions({ store, single() {}, online() {}, pause() {} });
  const uiRoot = document.createElement('div'); uiRoot.id = 'ui'; document.body.append(uiRoot);
  await mountUi({ el: uiRoot, store, actions, menu: false });
  renderer.resize(window.innerWidth, window.innerHeight);
  const lb = computeLetterbox(window.innerWidth, window.innerHeight, INTERNAL_W, INTERNAL_H);
  setLayout(store, { scale: lb.scale, offsetX: lb.offsetX, offsetY: lb.offsetY, dpr: window.devicePixelRatio || 1 });
  const d = createDuel(parseShip(hound), 7), t = d.tactical, own = t.ships[0], foe = t.ships[1];
  foe.x = own.x + 240; foe.y = own.y - 170; foe.heading = 40;
  const seat = shot === 'unknown' || shot === 'freq' ? { pid: 1 as const, station: d.weapons, view: 'weapons' as const }
    : shot === 'science' ? { pid: 0 as const, station: d.science, view: 'science' as const } : { pid: 0 as const, station: d.nav, view: 'helm' as const };
  sitDown(d.interior, seat.pid, seat.station);
  let focus = { x: own.x + 120, y: own.y - 85 }, contactId: 0 | 1 = 0;
  if (shot === 'science') { t.known = [1, 0]; t.scan = { contact: 0, level: 2, progress: 900, rate: 5, by: d.science }; t.designated = 0; }
  if (shot === 'freq') { t.known = [2, 0]; t.systems[0].freq = 1; }
  if (shot === 'derelict' || shot === 'salvage') {
    t.known = [0, 1]; Object.assign(t.derelict, { loot: Loot.Shield, trapped: true, salvage: shot === 'salvage' ? 150 : 0, salvaged: false });
    const w = derelictPos(t);
    Object.assign(own, { x: w.x + (shot === 'derelict' ? 300 : 0), y: w.y, vx: w.vx, vy: w.vy });
    focus = { x: w.x + 150, y: w.y }; contactId = 1;
  }
  const contact = createContactController();
  actions.setContact(contact);
  actions.setConsole({ press() {}, hold() {}, lock(room) { t.systems[0].lock = room; }, throttle() {}, frequency(f) { t.systems[0].freq = f; } });
  const scene = createDuelScene(renderer, { seed: 7, pauseText: 'PAUSED', ui: createDuelSink(store), contact, pointer: () => (shot === 'science' ? { x: 900, y: 300 } : null) });
  const cam = () => createCamera(focus.x, focus.y, 0.5);
  const source: DuelViewSource = {
    duel: d, seed: 7, prev: [], missilePrev: [], crewPrev: [],
    cameras: { helm: cam(), weapons: cam(), science: cam() }, interiorCamera: createInteriorCamera(),
    epoch: () => 0, active: () => seat.pid, view: () => seat.view, otherStatus: () => 'STANDING BY',
    axes: () => ({ turn: 0, thrust: 0 }), steer: () => 0, alpha: () => 1, paused: () => false, drainEvents: () => [],
    mode: 'single', running: () => true, uiHeld: () => NO_HELD_FLAGS, throttle: () => 0
  };
  contact.sync({ shown: true, station: seat.view, target: 1, active: () => true, epoch: 0, enemyKnown: t.known[0] });
  contact.click(contactId);   // open the window on the staged contact (on Science this selects it)
  renderer.app.ticker.add((tk) => { scene.draw(source, tk.deltaMS / 1000, { banner: null, layerPaused: false, end: null }); });
  (window as unknown as { shotReady: boolean }).shotReady = true;
}
main().catch((e) => { console.error(String(e?.stack ?? e)); document.body.textContent = String(e?.stack ?? e); (window as unknown as { shotFailed: boolean; shotReady: boolean }).shotFailed = true; (window as unknown as { shotReady: boolean }).shotReady = true; });
```

`.art/sci-shots/vite.config.mjs`:

```js
// Serves the Sci-1 visual check harness with the repo's public/ assets (gitignored, never committed).
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const repo = resolve(import.meta.dirname, '..', '..');
export default defineConfig({
  root: import.meta.dirname,
  publicDir: resolve(repo, 'public'),
  envDir: false,
  esbuild: { jsx: 'automatic' },
  define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify('sci-1-shots'), __FTLITE_BUILD__: JSON.stringify({ version: 'shots', rev: 'shots' }) },
  server: { port: 5299, strictPort: true, fs: { allow: [repo, resolve(repo, '..', '..')] } }
});
```

(The second `fs.allow` entry is the main checkout, which `node_modules` junctions to from the worktree.)

`.art/sci-shots/shot.cjs`:

```js
// Electron screenshot of the harness at an emulated viewport (gitignored, never committed).
// SHOT = "url|width|height|out.png|extraWaitMs".
const { app, BrowserWindow } = require('electron');
const { appendFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const log = (m) => appendFileSync(join(__dirname, 'shot.log'), `${new Date().toISOString()} ${m}\n`);
process.on('uncaughtException', (e) => { log(`uncaught ${e.stack}`); app.exit(1); });
const [url, w, h, out, extra] = (process.env.SHOT || '').split('|');
const width = Number(w), height = Number(h);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width, height, useContentSize: true, show: true, backgroundColor: '#000000', webPreferences: { backgroundThrottling: false } });
    win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) log(`page: ${message}`); });
    await win.loadURL('about:blank');   // emulating before any page is loaded crashes the renderer
    const dbg = win.webContents.debugger; dbg.attach('1.3');
    await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await win.loadURL(url);
    for (let k = 0; k < 300; k++) { if (await win.webContents.executeJavaScript('window.shotReady === true')) break; await new Promise((r) => setTimeout(r, 100)); }
    if (await win.webContents.executeJavaScript('window.shotFailed === true')) { log('failed page'); app.exit(1); return; }
    await new Promise((r) => setTimeout(r, 2500 + Number(extra || 0)));
    const shot = await dbg.sendCommand('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(out, Buffer.from(shot.data, 'base64'));
    log(`wrote ${out} (${width}x${height})`);
    app.quit();
  } catch (e) { log(`failed ${e.stack}`); app.exit(1); }
});
```

`.art/sci-shots/all.mjs`:

```js
// Takes the Sci-1 screenshots (gitignored, never committed). usage: node .art/sci-shots/all.mjs <electron.exe> <out dir>
// Needs the harness server running: npx vite --config .art/sci-shots/vite.config.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [electron, outDir] = process.argv.slice(2);
if (!electron || !outDir) { console.error('usage: node .art/sci-shots/all.mjs <electron.exe> <out dir>'); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const shots = [
  ['shot=science&crt=subtle', 1920, 1080, 'science.png', 0],
  ['shot=science&crt=full', 1920, 1080, 'science-full.png', 0],
  ['shot=unknown&crt=subtle', 1920, 1080, 'unknown-enemy.png', 0],
  ['shot=derelict&crt=subtle', 1920, 1080, 'derelict.png', 0],
  ['shot=freq&crt=subtle', 1920, 1080, 'weapons-frequency.png', 0],
  ['shot=salvage&crt=subtle', 1920, 1080, 'salvage.png', 0],
  ['shot=science&crt=subtle', 1280, 720, 'science-720.png', 0]
];
let failed = 0;
for (const [query, w, h, name, extra] of shots) {
  const out = resolve(outDir, name);
  const env = { ...process.env, SHOT: `http://localhost:5299/?${query}|${w}|${h}|${out}|${extra}` }; delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(electron, [join(import.meta.dirname, 'shot.cjs')], { env, stdio: 'ignore', timeout: 90000 });
  const ok = r.status === 0 && existsSync(out) && statSync(out).size > 1000;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (${w}x${h}) exit ${r.status}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Take the screenshots.**

Check the port is free: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5299 -State Listen -ErrorAction SilentlyContinue | Measure-Object | % Count"` prints `0` (if not, stop and report; never stop a process you did not start).

Start the harness server in the background and keep it running: `npx vite --config .art/sci-shots/vite.config.mjs`. Wait for `Local: http://localhost:5299/`.

Then (Electron needs a desktop session; if the tool sandbox blocks GUI processes, run without the sandbox):

```bash
E=node_modules/electron/dist/electron.exe; [ -f "$E" ] || E=/c/Users/djuar/FTLite/node_modules/electron/dist/electron.exe
mkdir -p /c/Users/djuar/FTLite-shots/sci-1
rm -f .art/sci-shots/shot.log; node .art/sci-shots/all.mjs "$E" "C:/Users/djuar/FTLite-shots/sci-1"; grep -v wrote .art/sci-shots/shot.log
```

Expected: seven `ok   <name> (<w>x<h>) exit 0` lines, and no `page:`, `failed` or `uncaught` lines from the `grep`.

Stop the harness: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5299 -State Listen -ErrorAction SilentlyContinue | % { Stop-Process -Id $_.OwningProcess -Force }; Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | ? { $_.CommandLine -like '*sci-shots*shot.cjs*' } | % { Stop-Process -Id $_.ProcessId -Force }"`; then the port count command above prints `0`.

- [ ] **Step 4: Look at the screenshots** (Read each PNG) and write pass/fail per item in the report:
- `science.png`: the SCIENCE tab lit among four; no station block but the Science block at the bottom left with `BRG nnn RNG nnnn`; the contact window open on the enemy at Level 1 (rooms outlined, labels `?`, no hatching, pips and hull, `HOSTILE IN n s`), the SCAN button reading `SCAN 2` with a half-full progress bar; on the map the enemy silhouette with a half scan ring, the pulsing designation bracket and Science's four-arc ring.
- `science-full.png`: the same, still readable under the full CRT glow.
- `unknown-enemy.png`: on the Weapons map the enemy is a plain `?` mark with no silhouette, no shield ring and no lock marker; the window reads `UNKNOWN CONTACT` with `SCAN 1 (SLOW)` and no drawing or LASER row; the readout has `INCOMING SCAN` after the HUNTER heading.
- `derelict.png`: the wreck mark with `DERELICT SHIELD` and a blinking `TRAPPED`; the window reads `DERELICT`, `LOOT SHIELD`, `TRAPPED`, `RANGE 300`, `CLOSE TO 60, MATCH SPEED`, the SCAN button `SCANNED` greyed.
- `weapons-frequency.png`: the Weapons block's `FREQ` row with A, B (lit), C and the small diamond over the weak one, `1/2/3` at the right; the window at Level 2 with `WEAK FREQ x`, `ENEMY LASER` and its bar, `MISSILE READY`.
- `salvage.png`: a hot ring filling half way round the crew ship; the hint's bar half full in the window.
- `science-720.png`: the Science block, the four tabs and the contact window do not overlap at 1280×720.
- Only amber.
Do not change product code in this task; report any failure as DONE_WITH_CONCERNS with the file name and what you see.

- [ ] **Step 5: The gate and commit.** In `docs/gates.md`, insert immediately before the line `## Helm demo (Helm spec §16; H-2 spec §8 to §11)`:

```markdown
## Sci-1: Science scans, the unidentified enemy and the derelict (2026-11-17)

Spec `docs/superpowers/specs/2026-11-17-science-scans-design.md`; plan `docs/superpowers/plans/2026-11-17-sci-1-science-scans.md`.

- [x] Automated (Sci-1): `npx vitest run` passes, including the science module and its validation, the three commands and their admission, Patrol and hostility (clock, laser, missile, rematch), the scan times 180/360/450/900 with takeover and cancel, the derelict's orbit and salvage with each loot and the trap, the frequency strip, the snapshots and the replica, the map marks and pickContact, the Science seat and console, the re-keyed contact window, the keys and clicks, and the React pieces; `npx tsc -b` clean; SIM_VERSION 45, goldens blessed in two steps; the duel gates in band. Measured: TOTALS.
- [ ] Manual (owner): look at `C:\Users\djuar\FTLite-shots\sci-1\`, then play a Single player duel on the Hound: walk to the Ops console (Science), click the enemy and press S twice; watch `INCOMING SCAN` turn into `HOSTILE IN n s` and the enemy turn hostile at 20 s; T to the derelict, S to scan it, then sit at the Helm and fly close and slow for 5 s to salvage; at Weapons press 1, 2 or 3 to the weak frequency and see two layers go per hit. Does the unknown `?` contact read as unidentified? Do the scan ring, the designation and Science's ring read on the amber CRT? Is the salvage hint clear enough to fly by?
```

Replace `TOTALS` with Step 1's totals (for example `N tests in M files, tsc clean, build ok`). Then:

```bash
git add docs/gates.md
git commit -m "docs(sci-1): the gate" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Report** the totals, the Step 1 checks, the screenshot list with Step 4's pass/fail per item, and any test Task 6 Step 11's rule touched.

---

## Self-review against the spec

- **§1-§2 owner decisions:** unidentified enemy turning hostile at 20 s (Tasks 3, 6); ambush by laser hit or missile (Task 3); Science chooses contact and depth, Level 1 then 2 (Tasks 2, 4, 10, 11); the derelict with scan-revealed cargo and trap and close-and-slow salvage (Tasks 5, 7, 10); Level 2's rooms, weapon state and weak frequency, no hostility delay (Task 10); A/B/C tuning stripping 2 layers (Tasks 2, 6, 11, 12); Science a third console, Helm and Weapons scanning slower (Tasks 2, 8, 11); Artemis-style click to select, SCAN, plain unknown markers, the selection shown to all, hover bearing and range (Tasks 7, 9, 10, 11, 12); CRT amber (Global Constraints; Tasks 7, 12, 13).
- **§3 the round:** Patrol at the start and after a rematch (Task 6), the three causes and permanence (Task 3), outcome unchanged and the derelict not a ship slot (Tasks 3, 5: `stepDuel`'s outcome reads ship slots only).
- **§4.1:** `startTick` set in `startRound` (Task 1), `hostileAt` −1 and Patrol at creation (Task 6), the hostility step and its precedence (Task 3), the 1200-step timing and the rematch (Tasks 3, 6).
- **§4.2:** the Patrol branch of `hunterThink` and the shield hold in `tickWeapons` (Task 3).
- **§4.3:** `known`, the one scanner, the units and rates, the progress step, the exact times, the scan continuing past hostility (it is not touched by the hostility step), `designated` (Tasks 1, 2, 4).
- **§4.4:** `weakFreq`, `freq`, the strip and `layersStripped`, the hunter unchanged (Tasks 1, 6).
- **§4.5:** the derelict fields, the draws in order with the band and the redraws (Task 6), `derelictPos` with table trig (Task 5), no collisions (it is in no contact or missile loop), each loot and the trap and the salvage step (Task 5).
- **§4.6:** `ShipInput.scanner` and its computation after admission (Tasks 1, 2), the fixed step order (Tasks 3, 4, 5), the three event kinds (Task 3).
- **§5:** the three commands, their admission order and reasons, `stale-tick` first, last applied wins, the noop rules, `DUEL_KINDS`, `duelWire.commands` and the module's `commands` (Tasks 1, 2).
- **§6.1:** `DuelState.science` and `DUEL_NOT_SNAPSHOTTED` (Task 2), `sit` at Science and `consoleInReach` and `Seat` (Tasks 2, 8), two players unchanged (no presence or helmPlayer change).
- **§6.2:** the module, its field order, `freq` after `lock`, the clone's fresh containers, every validation rule (Task 1). `known` is one 2-value field (Decision 1).
- **§6.3:** step 1 with the neutral values and `MIGRATIONS[44]`, the oracle proof and bless (Task 1); dormant rules proved unchanged (Tasks 2-5); step 2 re-blessed at 45 with the reason (Task 6).
- **§7.1:** the `?` marker, `UNKNOWN CONTACT`, the hostility line with its three states (Tasks 7, 9, 10), the scan ring and the designation bracket on every map and Science's ring (Task 7), the derelict mark and labels (Task 7), the salvage ring (Task 7).
- **§7.2:** the controller re-keyed on contact ids with `pickContact` nearest-wins (Tasks 7, 10), shown on all three consoles (Task 11), the enemy closing through the hunter slot and the aim disarming on a change of contact (Task 10), T cycling per station (Task 10), SCAN with its labels and progress (Tasks 9, 10, 12), the enemy's three levels and the derelict's lines (Task 10), the aim needing Level 1 and enemy-only (Task 10).
- **§7.3:** the Science station and tab (Task 8), the always-shown window (Tasks 10, 11), click selects and designates (Tasks 10, 11), the hover readout (Tasks 9, 11, 12), S and T and Esc on Science (Tasks 10, 11).
- **§7.4:** the frequency row, keys 1-3 and the weak marker (Tasks 9, 11, 12).
- **§8 architecture:** every listed file is in the file structure table and a task.
- **§9 edge cases:** `unavailable` and `SCANNED` (Tasks 2, 9); salvage at level 0 (Task 5); no salvage or scan in a decided round (Task 5); `Shield` loot at 0 and at full (Task 5); no Science layout — unbuildable (Decision 15); a Patrol-launched missile landing in Patrol or after (Task 3: only `hostileAt < 0` turns); a miss does not turn it (Task 3).
- **§10 tests:** each group has a file: hostility (scienceHostility, scienceFlow), scans (scienceScans, scienceCommands), frequency (scienceCommands, scienceFlow), derelict (scienceDerelict, scienceState), seats (scienceCommands, scienceSeat), snapshots (scienceState, scienceFlow), views (scienceMap, scienceConsole, contactModel, contactController, scienceInput, scienceUi), screens (Task 13), goldens and gates (Tasks 1, 6).
- **Placeholders:** the only open values are measured ones with a written rule (the oracle's `<R>`, `<T>`, `<F>`, the bless hashes, Task 6's `<S>`, `<D>`, `<N>`), as in the Artemis-ii plan.
- **Type consistency:** `ContactId`/`0 | 1`, `ContactRequests { designate; scan }`, `ScanButton { label; enabled; progress }`, `ContactLine { text; tint; bar }`, `SciencePanel { hover }`, `WeaponsPanel.freq/weakFreq`, `DuelView`/`Seat`/`ConsoleStation` with `'science'`, `cameras.science`, `scanCommand(t, contact, rate, by)`, `hostilityStep(t, hunter)`, `scanStep(t, scanner)`, `salvageStep(t)`, `derelictPos(t)`, `roundTick(t)` are used with the same names and types in every task that consumes them.
