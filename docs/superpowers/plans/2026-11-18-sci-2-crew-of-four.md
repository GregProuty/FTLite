# Sci-2: a crew of two, three or four online — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an online duel be played by a crew of 2, 3 or 4 (the host picks it, default 3), with empty seats standing idle aboard, a crew list on every readout, a SCIENCE badge in the interior and a three-player playtest checklist, while every two-player run stays byte-identical.

**Architecture:** The duel gets a crew size `n` (2..4) fixed for the run: `createDuel` builds n Recruits, and every value indexed by player (presence, health loops, telemetry, the per-player summary values, the checkpoint's ledger arrays, the producers, the stream client) becomes n long, while every value about the two ships stays two long. The snapshot header's `playerCount` carries n and the snapshot, init and checkpoint validate against it; the codecs are built once with player limit 4. The host action carries the crew size to the room's capacity, the init's `playerCount` is the capacity, and an empty seat gets the existing away steward. SIM_VERSION goes 51 → 52 as a version-only step first (Task 1, blessed); Tasks 2 and 3 widen the sim and the wire and prove with the duel oracle and the canonical trace that every recorded (two-player) run is unchanged at 52. Then the network, the host path, and the views.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), PixiJS 8 (interior view), React 19 + zustand 5 (UI overlay and menu), Vitest 3.2 (+ jsdom and @testing-library/react for `.tsx`), zod 3 (wire, init, checkpoint and record schemas), Electron + electron-vite.

**Spec:** `docs/superpowers/specs/2026-11-18-sci-2-crew-of-four-design.md`, Parts A and B (§1 to §7, §9, §10). **Part C (§8, late join) is out of scope by the owner's decision (2026-11-18): no task changes anything under `services/signalling`.** Precedents: `docs/superpowers/plans/2026-11-17-sci-1-science-scans.md` (format, the oracle proofs) and the Feel-ii version-only bump `4adf893e` (`chore(sim): SIM_VERSION 51 for Feel-ii (version bump alone, blessed)`, five files).

**Branch and worktree:** all work happens in the git worktree `.worktrees/sci-2` on branch `sci-2`, made from master `72d02aa7` or later. The controller creates it with its `node_modules` and `services/signalling/node_modules` junctions; executors do not create it. Every command below runs from the worktree root `C:\Users\djuar\FTLite\.worktrees\sci-2`. Record each baseline (Step 1 of Tasks 1 to 3) in that same worktree, because the baselines check their `cwd`.

## Global Constraints

- **SIM_VERSION 51 → 52, version-only (spec §4.6).** Before Task 1 run `git grep -n "SIM_VERSION = " -- src/renderer/src/sim/tuning.ts`; if it does not read `src/renderer/src/sim/tuning.ts:7:export const SIM_VERSION = 51;`, stop: master moved and every version number here must move with it.
  - **Task 1:** `SIM_VERSION = 52` and nothing else in `src/`; no `MIGRATIONS` entry (at n = 2 the field list is unchanged). Bless; `npx tsx scripts/golden/canonical-trace.ts check` and `npx tsx scripts/golden/duel-oracle.ts check` prove every run unchanged.
  - **Tasks 2 and 3 (the sim and the wire widen):** each records both baselines at 52 first and ends with `npx tsx scripts/golden/duel-oracle.ts same` and `npx tsx scripts/golden/canonical-trace.ts same` passing. Nothing is re-blessed after Task 1. If either `same` fails, a two-player run changed: find it and fix it; never bless past it and never add a `MIGRATIONS` entry to hide it (spec §3: "Two-player runs are byte-identical").
- **Generated files come only from `npm run bless`:** `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`. Never edit them by hand. Never pass `--fresh`.
- **Gates:** `tests/duelGates.test.ts` bands are never edited and nothing is retuned. If a gate fails, stop and report the numbers (each seed's `telemetryLine` and the aggregate summary line); the owner decides.
- **The rule for n (spec §3):** a duel crew is `n` ∈ {2, 3, 4}, fixed for the run. Every value indexed by player is n long; values about the two ships stay two long. At n = 2 every widened value has today's length, names and order.
- **Stays two-player (spec §2.4, §2.5):** Single player (two characters, Tab switches; `app/duel/runtime.ts`), the scripted pair (`sim/duel/scripted.ts`'s `pid < 2` loops) and the headless gates.
- **Exact names and values:** `DUEL_CREW_MIN = 2`, `DUEL_CREW_MAX = 4`, `type DuelCrew = 2 | 3 | 4` (`sim/duel/state.ts`); `type DuelCrewSize = 2 | 3 | 4` (`src/shared/onlineSession.ts`); the duel host action `{ type: 'host'; mode: 'duel'; capacity: DuelCrewSize }`; menu default crew `3`; `READOUT_ROWS = 23`; crew-list statuses `DOWNED`, `AWAY`, `HELM`, `WEAPONS`, `SCIENCE`, `REPAIRING`, `ON FOOT` in that precedence; crew-row label `P<k>` (k is 1-based); lobby seat labels (duel only) `P<k>: EMPTY`, `JOINED`, `READY`, `DISCONNECTED`; badge kind `'science'`, label `SCIENCE`, tint always `normal`, after WEAPONS and before MEDBAY.
- **Out of scope:** `services/signalling` (Part C); the Engineering console (Eng-1); bots in empty seats; more than four players; Single-player crew sizes other than two.
- **Git:** never `git add -A`, `git add .` or `git stash`; stage files by name (the main checkout has unrelated dirty files). Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; the commands below pass that footer as a second `-m`. Files are UTF-8.
- **Test commands:** targeted `npx vitest run <files>`; `npx tsc -b`; the full suite `npx vitest run --maxWorkers=4`, always after `npx electron-vite build` (tests/onlineRecoveryInstrumentation reads `out/`). Never run two vitest processes at once. The sim files `tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts` and `tests/gate-*.test.ts` can time out under load: rerun a failing one alone before calling it a failure.
- Comments follow the codebase's style: a header comment citing the spec section on each new file; doc comments on exports; cite "Sci-2 spec §x" on changed lines that need a reason.

## Decisions where the spec leaves room, and where the code forces a choice

1. **The version step comes first and alone** (Task 1), as Feel-ii did (`4adf893e`). The widening lands after it at 52 and is proved by the oracle's `same` mode, which is stricter than a bump (no alias table at all). No `MIGRATIONS[51]` is added: the field names at n = 2 are today's (`present.0`, `present.1`, the interior at playerCount 2).
2. **`DUEL_PLAYERS` is removed.** The sim's bounds are `DUEL_CREW_MIN`/`DUEL_CREW_MAX` in `sim/duel/state.ts`. The codec module uses `MAX_PLAYERS` (`src/shared/intent.ts:2`, already imported by `net/codec.ts`; equal to `ROOM_MAX_PLAYERS`, `src/shared/roomSession.ts:4`) so `net/` does not import the sim's state; Task 3 pins `DUEL_CREW_MAX === MAX_PLAYERS === ROOM_MAX_PLAYERS` in a test.
3. **The interior layout cache stays one entry per layout object**, holding `Derived` and a small per-crew map of `{ interiorCount, tickOffset }` from `canonicalFields(layout, n)`. That is the spec's "keyed by layout and n" (§4.2) while `LAYOUT_CACHE_MAX` and `duelCacheProbe().layouts` keep their meaning.
4. **"Crew above the layout's spawn count" (spec §4.1, §9) cannot come from a parsed layout:** `schema.ts:24` requires `spawns: z.array(tile).min(4)`. `createDuel` checks the crew and the spawn count before it allocates anything, so the test uses a hand-made copy of the Cutter with two spawns.
5. **REPAIRING in the crew list is read from the state alone** (spec §5.2: "the readout derives the list from the duel state and `me`"): a present, conscious, standing character for whom `r = repairInReach(d, pid) >= 0` (in reach of a repair point that needs work) **and the work has started**: `d.repair[r] > 0`, or the point's interior room has extinguish progress (`d.interior.rooms.fireRepair[p.room] > 0` for the point `p` with `p.tacticalRoom === r`). Standing at a damaged point without working reads ON FOOT. This is the state-only form of the old online rule (progress, not mere reach; plan review R1-F4); it can read REPAIRING for a crewmate standing at a point someone else has part-repaired, which is accepted. The old single-player rule (the partner's held E) and the old online rule (repair progress since the last publication) go with `otherStatus()`; their tests are replaced.
6. **A crew row is `{ label: 'P<k>', value: <status> }`**; DOWNED carries `emphasis: 'alert'` and the WARN tint, AWAY the DIM value tint, the rest plain. At n = 2 the readout is one row shorter than today (one crew row replaces OTHER + status). Measured on today's Hound: the interior list is 20 rows fresh and 21 with a torpedo inbound (the file's comment says 22); with the crew list it is 20 at n = 2 and 22 at n = 4. `READOUT_ROWS` goes to 23 as the spec says. The only code that depends on it is `ui/duel/ReadoutPanel.tsx:46` (the row cap, which derives the panel height) and `tests/crtBezel.test.ts:59` (the tallest-panel fit check), which re-run.
7. **Spec contradiction, §9 "the SCIENCE badge (and none on the Cutter)":** the Cutter has a Science station (`cutter.json`: `science` at tile 20,7; every layout has exactly seven stations, one per kind, `schema.ts:35`), so `d.science >= 0` on both layouts and both get the badge. The test checks the badge on the Hound (tile 9,5) and on the Cutter, and the "omitted when `d.science < 0`" branch by setting `d.science = -1` on a built duel.
8. **The host action and the preload:** `OnlinePreloadApi.host(room)` takes `{ mode: 'duel'; capacity: DuelCrewSize } | { mode: 'sector'; capacity: number }` (required). `MenuState.crew` (default 3) is the menu store's choice; `actions.setCrew(crew)` sets it and `actions.host(crew = menu().crew)` sends it. Task 5 lands the store and the action, Task 8 the buttons.
9. **Start's `helmPlayer` widens to a seat id 0..3** in `validateOnlineAction` (`seatId`), `OnlinePreloadApi.start`, `helmPlayerOf`, `DuelChoice` and the mode adapter; main's `duelInit` refuses a `helmPlayer` that is not a seat of the room, and `validateDuelInit` one that is not below `playerCount`.
10. **`validateDuelMirror(mirror, capacity?)`** checks `init.playerCount === capacity` when a capacity is given, as `validateSectorMirror` does (`src/main/network/onlineSector.ts:23`; the spec cites `:24`), and the duel adapter passes the capacity through (today `onlineModes.ts:33` drops it).
11. **A replica of another crew size is a load, not a restore:** `restoreDuelSnapshot` refuses a header whose `playerCount` differs from the duel's, and the stream client's `replica.matches` compares it.
12. **The stream client** (`clientControl/duelClient.ts`) keeps `held`/`next` arrays of `DUEL_CREW_MAX` and bounds `heldSequences.has` by the crew size of the latest accepted publication (`header.playerCount`); `replica.playerCount` is the replica's `interior.playerCount`.
13. **The wire's per-player summary values** (`repairsFinished`, `repairsStarted`, `walkingTicks`, `repairingTicks`, in the end record, the round event, the checkpoint's telemetry and the playtest record) become `z.array(uint).min(2).max(4)`; the ship pairs stay `z.tuple([uint, uint])`. The codec does not know n (spec §4.3); the snapshot header, the init and the checkpoint enforce it.
14. **The producers take `playerCount`** (`createDuelProducers({ ..., playerCount })`, from `init.playerCount` in `src/network/modes/duel.ts`) and throw `invalid duel producer` outside 2..4.
15. **Line numbers checked against master `72d02aa7`** (after Feel-ii `0c32e9c5`): every spec citation holds except `onlineSector.ts:24` (the capacity check is `:23`) and `menuState.ts:81-84` (that is `seatLabel`; `isDuel` is `:86`). The grep of spec §3 also found these two-player sites the spec does not list, all widened here: `sim/duel/health.ts:15,63` (`PLAYERS = 2`, `revivers`), `sim/duel/step.ts:51,68-69,106-107,127,133,138,166,181,261-264`, `sim/duel/telemetry.ts:56,69,75,77,87,135-146`, `sim/duel/summary.ts:12-45`, `sim/duel/modules.ts:20,43`, `authority/duelRules.ts:31,34`, `app/duel/soloRecorder.ts:11,13`, `app/duel/scene.ts:59,61`, `render/duel/situationModel.ts:21,107`, `render/duel/readoutModel.ts:55,118`, `render/duel/interiorView.ts:71,83` (the DOWNED and REVIVED label pools, length 2), `src/main/network/onlineModes.ts:18,33`, `src/preload/index.ts:35`, `src/shared/onlineSession.ts:29,82,149-161`, and the test helpers `tests/helpers/onlineDuel.ts:19-46`, `tests/helpers/duelAuthority.ts:19-21`, `tests/helpers/liveDuel.ts:15`. `src/network/modes/encounterMode.ts:106,115` is already n-generic. `runtime.ts:244,275,354` and `scripted.ts:226,278-321` stay two (Single player and the bots).
16. **The service already holds four** (cited, not changed): `services/signalling/src/index.ts:31-32` and `directory.ts:47` accept capacity 1..4; `room/auth.ts:18` assigns the first unclaimed seat; `room/signals.ts:84` allows three live guest links; `room/lifecycle.ts:36` (Start) and `ui/menuState.ts:93` (`startAllowed`) ignore unclaimed seats.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/renderer/src/sim/tuning.ts` | modify (T1) | SIM_VERSION 52 |
| `src/renderer/src/sim/duel/state.ts` | modify (T2) | `DUEL_CREW_MIN/MAX`, `DuelCrew`, `createDuel(layout, seed, helmPlayer, crew)`, `present: boolean[]`, `helmPlayer: number` |
| `src/renderer/src/sim/duel/step.ts`, `health.ts`, `telemetry.ts`, `summary.ts`, `modules.ts` | modify (T2) | every per-player loop, admission, rematch copy, loss rule, accumulator and summary at n |
| `src/renderer/src/net/duelRecord.ts`, `src/renderer/src/app/duel/soloRecorder.ts` | modify (T2) | the playtest record's seat, Helm player and per-player values |
| `src/renderer/src/sim/duel/snapshot.ts` | modify (T3) | header `playerCount` 2..4, the per-crew layout fields, the round offset, load and restore at n |
| `src/renderer/src/authority/duelCheckpoint.ts`, `duelRules.ts` | modify (T3) | init `playerCount`/`helmPlayer`, checkpoint arrays and ledger at n, the rules' crew |
| `src/renderer/src/net/codec.ts` | modify (T3) | per-player summary arrays, the publication schema at 4 |
| `src/network/modes/duelProducers.ts`, `duel.ts`, `duelStream.ts`, `src/renderer/src/clientControl/duelClient.ts` | modify (T4) | n producers and stewards, codecs at 4, the client sized from the publication |
| `src/shared/onlineSession.ts`, `src/preload/index.ts`, `src/main/network/onlineSession.ts`, `onlineDuel.ts`, `onlineModes.ts`, `src/renderer/src/ui/menuState.ts`, `ui/actions.ts` | modify (T5) | the host action's crew, the room capacity, the init and mirror checks, the menu store's crew |
| `src/renderer/src/app/duel/onlineSource.ts`, `onlineDuel.ts`, `scene.ts`, `render/duel/consoleModel.ts`, `sitModel.ts`, `situationModel.ts`, `interiorView.ts`, `interiorModel.ts` | modify (T6) | seat ids 0..n−1, the sit tracker at n, the interior label pools, the SCIENCE badge |
| `src/renderer/src/render/duel/readoutModel.ts`, `app/duel/runtime.ts`, `onlineSource.ts`, `scene.ts` | modify (T7) | `crewStatus`, `crewRows`, `READOUT_ROWS` 23; `OtherStatus`/`otherStatus()` removed |
| `src/renderer/src/ui/menu/HostForm.tsx`, `MenuButton.tsx`, `styles.ts`, `ui/menuState.ts` | modify (T8) | the CREW 2/3/4 choice, the duel seat labels |
| `docs/playtest-duel.md` (create), `docs/playtest.md` | T9 | the three-player checklist and its pointer |
| `tests/helpers/duelSeat.ts`, `liveDuel.ts`, `duelAuthority.ts`, `onlineDuel.ts` | modify (T2, T3, T4) | `standAtStation`; crew-sized helpers |
| `tests/crewOfFour.test.ts` (T2), `tests/crewOfFourWire.test.ts` (T3), `tests/duelOnlineCrew.test.ts` (T4), `tests/crewSeats.test.ts` (T6), `tests/crewList.test.ts` (T7) | create | the new behaviour, one file per task |

---

### Task 1: SIM_VERSION 51 → 52 alone, blessed

**Files:**
- Modify: `src/renderer/src/sim/tuning.ts:7`
- Regenerated by `npm run bless`: `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SIM_VERSION === 52` for every later task (the snapshot header, the init's `simVersion` literal, the checkpoint, and the room compatibility all read it).

- [ ] **Step 1: Record both baselines at SIM_VERSION 51, before anything changes**

Check: `git grep -n "SIM_VERSION = " -- src/renderer/src/sim/tuning.ts` prints `src/renderer/src/sim/tuning.ts:7:export const SIM_VERSION = 51;`.

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 51: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs; written to <temp>\trace.json`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `duel oracle baseline at sim version 51: <R> runs, <T> ticks, <F> named fields per tick; written to <temp>\duel-oracle.json`, exit 0. Note `<R>`, `<T>` and `<F>` for Step 3.

- [ ] **Step 2: The version**

`src/renderer/src/sim/tuning.ts` line 7 becomes:

```ts
export const SIM_VERSION = 52;
```

Nothing else in `src/` changes in this task, and `scripts/golden/duelOracle.ts`'s `MIGRATIONS` is not touched.

- [ ] **Step 3: Both proofs before the bless**

Run: `npx tsx scripts/golden/canonical-trace.ts check`
Expected: `per-tick canonical trace identical, sim version 51 → 52: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs (baseline HEAD <sha>)`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts check`
Expected: `duel oracle: <R> runs, <T> ticks, <F> named fields, results, events and telemetry identical at every tick field for field, sim version 51 → 52 (baseline HEAD <sha>)`, exit 0, with Step 1's `<R>`, `<T>` and `<F>`.

- [ ] **Step 4: Bless (the guard re-runs both proofs), then check the sector golden**

Run: `npm run bless`
Expected, exit 0 (the hashes are new; the counts, ticks and outcomes are master's):
```
blessed tests/golden/basic.json: 120 checkpoints, final <hex>
blessed tests/golden/duel-1.json: 30 checkpoints, 18155 ticks, outcome 1, final <hex>
blessed tests/fixtures/determinism-v2.json: sim version 51 → 52, <n> samples and <m> boundaries unchanged apart from the version and hashes
blessed tests/golden/duel-rematch.json: 55 checkpoints, rematch on tick 18155, rounds 18155 ticks outcome 1 then 15320 ticks outcome 1, final <hex>
```

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0.

- [ ] **Step 5: The duel suites, then the full suite at 52**

Run: `npx vitest run tests/duelGolden.test.ts tests/duelRematchGolden.test.ts tests/duelGates.test.ts tests/duelOracle.test.ts tests/golden.test.ts tests/duelCheckpoint.test.ts tests/duelSnapshot.test.ts`
Expected: PASS.

Run: `npx tsc -b`, then `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: no type errors; the build succeeds; every test file PASS.

- [ ] **Step 6: Commit**

`git status --short` must list exactly the five files below as modified (plus the main checkout's unrelated untracked files, which are not in this worktree).

```bash
git add src/renderer/src/sim/tuning.ts tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/fixtures/determinism-v2.json
git commit -m "chore(sci-2): SIM_VERSION 51 -> 52 alone, blessed (canonical trace and duel oracle prove every run unchanged per tick)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The sim at n: createDuel's crew, presence, health, telemetry, the summary and the record

**Files:**
- Modify: `src/renderer/src/sim/duel/state.ts` (constants, `DuelState`, `createDuel`), `src/renderer/src/sim/duel/step.ts` (attendant, repairPhase, startRound, stepDecided, the presence admission, the intents), `src/renderer/src/sim/duel/health.ts`, `src/renderer/src/sim/duel/telemetry.ts`, `src/renderer/src/sim/duel/summary.ts`, `src/renderer/src/sim/duel/modules.ts` (presence fields, round helmPlayer), `src/renderer/src/net/duelRecord.ts`, `src/renderer/src/app/duel/soloRecorder.ts`
- Modify (test helper): `tests/helpers/duelSeat.ts` (add `standAtStation`)
- Modify (tsc under `noUncheckedIndexedAccess`, plan review R1-F1): `tests/helpers/scriptedDuel.ts:78` and `tests/duelTelemetry.test.ts:84`
- Create: `tests/crewOfFour.test.ts`

**Interfaces:**
- Consumes: Task 1's SIM_VERSION 52; `createSimState(layout, playerCount, seed, characters)` (`sim/state.ts:106`); `RECRUIT` (`sim/characters`); `flag` (`sim/module.ts:32`); `revivers`, `isDowned` (`sim/duel/health.ts`).
- Produces:
  ```ts
  // sim/duel/state.ts
  export const DUEL_CREW_MIN = 2, DUEL_CREW_MAX = 4;
  export type DuelCrew = 2 | 3 | 4;
  // DuelState: present: boolean[] (n long); helmPlayer: number (0..n−1)
  export function createDuel(layout: ShipLayout, seed: number, helmPlayer?: number, crew?: number): DuelState;   // crew defaults to 2
  // sim/duel/telemetry.ts: DuelTelemetry.players: PlayerTelemetry[]; prev.work, prev.seat, prev.lastConsole: number[] (all n long)
  // sim/duel/summary.ts: DuelEndSummary.repairsFinished, repairsStarted, walkingTicks, repairingTicks: readonly number[] (n long)
  // net/duelRecord.ts: DuelPlaytestRecord.seat, helmPlayer: number (0..3); soloDuelRecord(summary, { seat: number; helmPlayer: number; startedAtIso; pauses })
  // tests/helpers/duelSeat.ts
  export function standAtStation(d: DuelState, pid: number, station: number): void;
  ```

- [ ] **Step 1: Baselines at 52**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline` — Expected: `baseline at sim version 52: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs; written to <temp>\trace.json`, exit 0.
Run: `npx tsx scripts/golden/duel-oracle.ts baseline` — Expected: `duel oracle baseline at sim version 52: <R> runs, <T> ticks, <F> named fields per tick; written to <temp>\duel-oracle.json`, exit 0.

- [ ] **Step 2: The test helper**

`tests/helpers/duelSeat.ts` (it writes no semicolons at line ends; keep its style): add `import { Position } from '../../src/renderer/src/sim/components'` to its imports at the top, and append:

```ts
/** Put pid's character, standing, on station `station`'s console tile: in reach of a sit there (Sci-1's test idiom). */
export function standAtStation(d: DuelState, pid: number, station: number): void {
  const tile = d.interior.derived.stationTile[station]!, w = d.interior.derived.width, eid = d.interior.crew[pid]!
  Position.x[eid] = (tile % w) + 0.5; Position.y[eid] = Math.floor(tile / w) + 0.5
}
```

- [ ] **Step 3: Write the failing test**

Create `tests/crewOfFour.test.ts`:

```ts
// Sci-2 (spec 2026-11-18-sci-2-crew-of-four §3, §4.1, §7, §9 Sim): a duel crew of 2, 3 or 4. createDuel builds n
// Recruits at the layout's spawns, all present and standing; presence is admitted for players 0..n−1; a third player
// sits at Science and scans, a fourth takes a free console; the round is lost when every one of the n characters is
// down (away ones included); health, telemetry and the summary run to n; a rematch keeps the crew and its presence.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { validateDuelRecord, soloDuelRecord } from '../src/renderer/src/net/duelRecord';
import { Health, Life, LifeState, Position, Seated } from '../src/renderer/src/sim/components';
import { roomAt } from '../src/renderer/src/sim/grid';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { revivers } from '../src/renderer/src/sim/duel/health';
import { presenceModule } from '../src/renderer/src/sim/duel/modules';
import { createDuel, disposeDuel, DUEL_CREW_MAX, DUEL_CREW_MIN, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { duelEndSummary, duelRoundRecord } from '../src/renderer/src/sim/duel/summary';
import { createTelemetry, recordTick } from '../src/renderer/src/sim/duel/telemetry';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { SCAN_RATE_SCIENCE } from '../src/renderer/src/sim/tactical/tuning';
import { standAtStation } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const HOUND = parseShip(hound);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const input = (d: DuelState, commands: DuelEnvelope[] = []) => ({ held: Array.from({ length: d.interior.playerCount }, () => NONE), commands });
const step = (d: DuelState, commands: DuelEnvelope[] = []) => stepDuelTick(d, input(d, commands));
/** At 0 health a conscious character goes down in the next step's health phase. */
const down = (d: DuelState, pid: number): void => { Health.cur[d.interior.crew[pid]!] = 0; };
const downedEvents = (d: DuelState): number[] => d.events.flatMap((e) => (e.kind === 'downed' ? [e.player] : []));

describe('createDuel with a crew (spec §4.1)', () => {
  it('the bounds are 2 and 4; the Hound has four spawns, 13..16,7 in room Q', () => {
    expect([DUEL_CREW_MIN, DUEL_CREW_MAX]).toEqual([2, 4]);
    expect(HOUND.spawns.slice(0, 4)).toEqual([[13, 7], [14, 7], [15, 7], [16, 7]]);
  });
  for (const crew of [3, 4]) it(`a crew of ${crew}: ${crew} Recruits at the spawns in player order, all standing, conscious and present`, () => {
    const d = createDuel(HOUND, 5, 0, crew);
    try {
      expect(d.interior.playerCount).toBe(crew);
      expect(d.present).toEqual(Array(crew).fill(true));
      expect(d.interior.crew.map((eid) => [Position.x[eid], Position.y[eid]])).toEqual(HOUND.spawns.slice(0, crew).map(([x, y]) => [x + 0.5, y + 0.5]));
      const q = d.interior.derived.roomIndex.get('Q');
      expect(d.interior.crew.map((eid) => roomAt(d.interior, Position.x[eid]!, Position.y[eid]!))).toEqual(Array(crew).fill(q));
      expect(d.interior.crew.map((eid) => [Seated.station[eid], Life.state[eid]])).toEqual(Array(crew).fill([-1, LifeState.Conscious]));
      expect(presenceModule.fields(d).map((f) => f.name)).toEqual(Array.from({ length: crew }, (_, p) => `present.${p}`));
    } finally { disposeDuel(d); }
  });
  it('throws for a crew outside 2..4, a crew above the spawn count, or a Helm player outside the crew', () => {
    for (const crew of [1, 5, 2.5]) expect(() => createDuel(HOUND, 5, 0, crew), `crew ${crew}`).toThrow(/invalid duel crew/);
    const twoSpawns = { ...CUTTER, spawns: CUTTER.spawns.slice(0, 2) };   // a parsed layout always has 4 (Decision 4)
    expect(() => createDuel(twoSpawns, 5, 0, 3)).toThrow(/spawns/);
    expect(() => createDuel(HOUND, 5, 3, 3)).toThrow(/helm player/);
    const d = createDuel(HOUND, 5, 3, 4);
    try { expect(d.helmPlayer).toBe(3); expect(Seated.station[d.interior.crew[3]!]).toBe(-1); } finally { disposeDuel(d); }   // seats nobody
  });
});

describe('presence and seats at n (spec §4.1, §7)', () => {
  it('presence is admitted for players 0..n−1 and malformed beyond', () => {
    const d = createDuel(HOUND, 5, 0, 4), two = createDuel(HOUND, 5), three = createDuel(HOUND, 5, 0, 3);
    try {
      expect(step(d, [cmd(d, 2, { kind: 'presence', present: false }), cmd(d, 3, { kind: 'presence', present: false })]).map((r) => r.status)).toEqual(['applied', 'applied']);
      expect(d.present).toEqual([true, true, false, false]);
      expect(step(two, [cmd(two, 2, { kind: 'presence', present: false })])[0]).toMatchObject({ status: 'rejected', reason: 'malformed' });
      expect(step(three, [cmd(three, 3, { kind: 'presence', present: false })])[0]).toMatchObject({ status: 'rejected', reason: 'malformed' });
      expect([two.present, three.present]).toEqual([[true, true], [true, true, true]]);
    } finally { disposeDuel(d); disposeDuel(two); disposeDuel(three); }
  });
  it('a third player sits at Science and scans at the Science rate; a fourth takes the free Weapons console and tunes', () => {
    const d = createDuel(HOUND, 5, 0, 4);
    try {
      standAtStation(d, 0, d.nav); standAtStation(d, 2, d.science); standAtStation(d, 3, d.weapons);
      expect(step(d, [cmd(d, 0, { kind: 'sit', station: d.nav }), cmd(d, 2, { kind: 'sit', station: d.science }), cmd(d, 3, { kind: 'sit', station: d.weapons })]).map((r) => r.status))
        .toEqual(['applied', 'applied', 'applied']);
      expect([d.nav, d.science, d.weapons].map((s) => d.interior.stations.occupant[s])).toEqual([0, 2, 3]);
      const r = step(d, [cmd(d, 2, { kind: 'contactScan', contact: 0 }), cmd(d, 3, { kind: 'laserFrequency', freq: 2 }), cmd(d, 1, { kind: 'laserFrequency', freq: 1 })]);
      expect(r.map((x) => [x.id.player, x.reason ?? x.status])).toEqual([[1, 'not-at-weapons'], [2, 'applied'], [3, 'applied']]);
      expect(d.tactical.scan).toMatchObject({ contact: 0, by: d.science, rate: SCAN_RATE_SCIENCE });
      expect(d.tactical.systems[0].freq).toBe(2);
    } finally { disposeDuel(d); }
  });
  it('two players race to one console: the first admitted sits (today\'s rule)', () => {
    const d = createDuel(HOUND, 5, 0, 3);
    try {
      standAtStation(d, 1, d.weapons); standAtStation(d, 2, d.weapons);
      step(d, [cmd(d, 2, { kind: 'sit', station: d.weapons }), cmd(d, 1, { kind: 'sit', station: d.weapons })]);
      expect(d.interior.stations.occupant[d.weapons]).toBe(2);
    } finally { disposeDuel(d); }
  });
});

describe('health at n (spec §4.1)', () => {
  it('the round is lost when all three are down, one of them away; not while one stands', () => {
    const d = createDuel(HOUND, 5, 0, 3), e = createDuel(HOUND, 5, 0, 3);
    try {
      d.present[2] = false;
      for (const pid of [0, 1, 2]) down(d, pid);
      step(d);
      expect(downedEvents(d)).toEqual([0, 1, 2]);
      expect(d.tactical.outcome).toBe(Outcome.EnemyWins);
      down(e, 0); down(e, 1); step(e);
      expect(downedEvents(e)).toEqual([0, 1]);
      expect(e.tactical.outcome).toBe(Outcome.Running);
    } finally { disposeDuel(d); disposeDuel(e); }
  });
  it('the health loops reach player 3; only present characters revive', () => {
    const d = createDuel(HOUND, 5, 0, 4);
    try {
      down(d, 3); step(d);
      expect(downedEvents(d)).toEqual([3]);
      const e3 = d.interior.crew[3]!, e2 = d.interior.crew[2]!;
      Position.x[e2] = Position.x[e3]!; Position.y[e2] = Position.y[e3]!;
      expect(revivers(d, 3)).toContain(2);
      d.present[2] = false;
      expect(revivers(d, 3)).not.toContain(2);
    } finally { disposeDuel(d); }
  });
});

describe('telemetry, the summary and the record at n (spec §4.1, §4.3)', () => {
  it('the per-player accumulator and summary values are n long; the ship pairs stay two', () => {
    const d = createDuel(HOUND, 5, 0, 3), t = createTelemetry(d);
    try {
      expect([t.players.length, t.prev.work.length, t.prev.seat.length, t.prev.lastConsole.length]).toEqual([3, 3, 3, 3]);
      for (let k = 0; k < 10; k++) { const i = input(d); stepDuelTick(d, i); recordTick(t, d, i); }
      expect(t.players.map((p) => p.walkingTicks)).toEqual([10, 10, 10]);
      const s = duelEndSummary(t);
      expect([s.repairsStarted.length, s.repairsFinished.length, s.walkingTicks, s.repairingTicks.length]).toEqual([3, 3, [10, 10, 10], 3]);
      expect([s.laserReleases.length, s.terminal.length, s.missileLosses.length]).toEqual([2, 2, 2]);
    } finally { disposeDuel(d); }
  });
  it('the playtest record takes seats 0..3 and n-long per-player values', () => {
    const d = createDuel(HOUND, 5, 2, 3), t = createTelemetry(d);
    try {
      d.tactical.systems[1].hull = 0;   // the first step decides the round for the crew
      const i = input(d); stepDuelTick(d, i); recordTick(t, d, i);
      const record = soloDuelRecord(duelRoundRecord(duelEndSummary(t), 0, d.tactical.seed, 0), { seat: 2, helmPlayer: 2, startedAtIso: '2026-11-18T00:00:00Z', pauses: 0 });
      expect(validateDuelRecord(record).summary.walkingTicks).toHaveLength(3);
      expect(() => validateDuelRecord({ ...record, seat: 4 })).toThrow();
      expect(() => validateDuelRecord({ ...record, helmPlayer: 4 })).toThrow();
      expect(() => validateDuelRecord({ ...record, summary: { ...record.summary, laserHits: [0, 0, 0] } })).toThrow();
    } finally { disposeDuel(d); }
  });
});

describe('rounds at n (spec §4.1, §7)', () => {
  it('a rematch keeps the crew size, the Helm player and an empty seat away; presence beyond n is malformed on the end card', () => {
    const d = createDuel(HOUND, 5, 2, 3);
    try {
      d.present[2] = false; d.tactical.systems[1].hull = 0;
      step(d);
      expect(d.tactical.outcome).toBe(Outcome.CrewWins);
      const r = step(d, [cmd(d, 0, { kind: 'rematch' }), cmd(d, 3, { kind: 'presence', present: true })]);
      expect(r.map((x) => [x.id.player, x.reason ?? x.status])).toEqual([[0, 'applied'], [3, 'malformed']]);
      expect([d.round, d.interior.playerCount, d.helmPlayer, d.present]).toEqual([1, 3, 2, [true, true, false]]);
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npx vitest run tests/crewOfFour.test.ts`
Expected: FAIL. `DUEL_CREW_MIN` and `DUEL_CREW_MAX` are not exported from `sim/duel/state`, and `createDuel`'s fourth argument is ignored (a crew of 3 builds two characters).

- [ ] **Step 5: The state**

`src/renderer/src/sim/duel/state.ts`:

After the imports add:

```ts
/** Sci-2 spec §3: a duel crew is 2, 3 or 4 players, fixed for the run. Every value indexed by player is n long. */
export const DUEL_CREW_MIN = 2, DUEL_CREW_MAX = 4;
export type DuelCrew = 2 | 3 | 4;
```

In `interface DuelState` replace

```ts
  /** Whether each player is at the keyboard (spec §8 "present or away"). */
  present: [boolean, boolean];
```

with

```ts
  /** Whether each player is at the keyboard (spec §8 "present or away"), n long (Sci-2 spec §4.1), all true at creation. */
  present: boolean[];
```

and in the round module's line replace `round: number; helmPlayer: 0 | 1; baseTick: number; decidedTick: number;` with `round: number; helmPlayer: number; baseTick: number; decidedTick: number;`, adding to that member's doc comment: `helmPlayer is a player id 0..n−1 (Sci-2 spec §4.1).`

Replace the doc comment and first lines of `createDuel`, up to and including the `createSimState` line, with:

```ts
/**
 * A duel on `layout` (the Hound in the app; the Cutter in older tests): `crew` trait-free Recruits (2..4, Sci-2 spec §4.1;
 * no XP is ever awarded, since xpSystem never runs), every door held open, every player standing at the layout's spawns in
 * player order with every console free (start-aboard spec §1; `helmPlayer` is kept for the round module and the wire but
 * seats no one), and a tactical state from the same seed whose map must validate. Round 0, beginning on tick 0, the
 * throttle at STOP. Throws if the crew, the Helm player, the map or a repair point is invalid, so a bad seed or layout
 * fails loudly; the crew checks run before anything is allocated.
 */
export function createDuel(layout: ShipLayout, seed: number, helmPlayer = 0, crew: number = DUEL_CREW_MIN): DuelState {
  if (!Number.isInteger(crew) || crew < DUEL_CREW_MIN || crew > DUEL_CREW_MAX) throw new Error(`invalid duel crew ${String(crew)}`);
  if (crew > layout.spawns.length) throw new Error(`duel layout ${layout.id} has ${layout.spawns.length} spawns, too few for a crew of ${crew}`);
  if (!Number.isInteger(helmPlayer) || helmPlayer < 0 || helmPlayer >= crew) throw new Error(`invalid duel helm player ${String(helmPlayer)}`);
  const tactical = createTacticalState(seed);
  const problems = validateMap(tactical.map);
  if (problems.length > 0) throw new Error(`invalid duel map for seed ${seed}: ${problems[0]}`);
  const interior = createSimState(layout, crew, seed, Array<number>(crew).fill(RECRUIT));
```

In its return, replace `present: [true, true],` with `present: Array<boolean>(crew).fill(true),`.

- [ ] **Step 6: The step**

`src/renderer/src/sim/duel/step.ts`:

After `function seated(...)` (L60) add:

```ts
/** A player id of this duel's crew (Sci-2 spec §4.1): an integer 0..n−1. */
function validPlayer(d: DuelState, pid: number): boolean { return Number.isInteger(pid) && pid >= 0 && pid < d.interior.playerCount; }
```

In `attendant` (L51) replace `d.present[pid as 0 | 1]` with `d.present[pid]`.

In `repairPhase` replace the loop header and its first line (L68-69) with:

```ts
  for (let pid = 0; pid < d.interior.playerCount; pid++) {
    if (!d.present[pid] || !conscious(d, pid) || seated(d, pid) || !(held[pid] ?? NO_HELD).interactHeld) continue;
```

In `startRound` replace the first two lines (L106-107) with:

```ts
  const next = createDuel(d.interior.layout, followingSeed(d.tactical.seed), d.helmPlayer, d.interior.playerCount);
  next.present = d.present.slice();   // Sci-2 spec §7: an empty seat stays away in the next round
```

In `stepDecided` replace `const presentBefore = [d.present[0], d.present[1]];` with `const presentBefore = d.present.slice();`, replace `else if (!presentBefore[e.id.player as 0 | 1]) result(e, 'unavailable');` with `else if (!presentBefore[e.id.player]) result(e, 'unavailable');`, and replace the presence check line

```ts
      if ((e.id.player !== 0 && e.id.player !== 1) || typeof c.present !== 'boolean') { result(e, 'malformed'); continue; }
```

with

```ts
      if (!validPlayer(d, e.id.player) || typeof c.present !== 'boolean') { result(e, 'malformed'); continue; }
```

In `stepDuelTick` replace `const away = (e: DuelEnvelope): boolean => !d.present[e.id.player as 0 | 1];` with `const away = (e: DuelEnvelope): boolean => !d.present[e.id.player];`, and replace the presence check line in the seat phase

```ts
    if ((e.id.player !== 0 && e.id.player !== 1) || typeof e.command.present !== 'boolean') { result(e, 'malformed'); continue; }
```

with

```ts
    if (!validPlayer(d, e.id.player) || typeof e.command.present !== 'boolean') { result(e, 'malformed'); continue; }
```

Replace the intents (L261-264) with:

```ts
  const intents: Intent[] = Array.from({ length: st.playerCount }, (_, pid) => {
    const h = input.held[pid] ?? NO_HELD;
    return d.present[pid] ? { ...NEUTRAL_INTENT, moveX: h.moveX, moveY: h.moveY } : { ...NEUTRAL_INTENT };
  });
```

In `stepDuelTick`'s doc comment replace `the both-down loss` with `the all-down loss`; in `healthPhase(d, hits);`'s trailing comment replace `both down loses the round` with `every character down loses the round`.

- [ ] **Step 7: Health**

`src/renderer/src/sim/duel/health.ts`:

Header line 3-4: replace `If both characters are down at\n// once the round is lost` so it reads `If every character is down at\n// once (Sci-2 spec §4.1: all n, away ones included) the round is lost`.

Replace `const PLAYERS = 2;` with:

```ts
/** The crew size n (Sci-2 spec §4.1): every health loop runs over all n characters. */
const crewSize = (d: DuelState): number => d.interior.playerCount;
```

Replace every `pid < PLAYERS` and `o < PLAYERS` with `pid < crewSize(d)` and `o < crewSize(d)` (every `pid < PLAYERS`: one in `applyHitDamage` and five in `healthPhase`, plus `o < PLAYERS` in `revivers`). In `revivers` replace `!d.present[o as 0 | 1]` with `!d.present[o]`. Replace the loss line

```ts
  if (down === PLAYERS && d.tactical.outcome === Outcome.Running) d.tactical.outcome = Outcome.EnemyWins;   // a round already decided this tick stands
```

with

```ts
  if (down === crewSize(d) && d.tactical.outcome === Outcome.Running) d.tactical.outcome = Outcome.EnemyWins;   // a round already decided this tick stands
```

and in `healthPhase`'s doc comment replace `and the both-down loss` with `and the all-down loss`.

- [ ] **Step 8: Telemetry**

`src/renderer/src/sim/duel/telemetry.ts`:

- L19: `/** \`downed\`: the crew ship only, every character down at once (duel-health spec §1.5, owner 2026-11-17; Sci-2: all n). */`
- `interface DuelTelemetry`: `players: PlayerTelemetry[];` with the comment `/** One per player, n long (Sci-2 spec §4.1). */` above it, and `prev: { counters: number[][]; grace: [Int32Array, Int32Array]; work: number[]; seat: number[]; lastConsole: number[] };`
- Replace the `seats` arrow (L69) with:

```ts
const seats = (d: DuelState): number[] => d.interior.crew.map((eid) => Seated.station[eid]!);
```

- In `createTelemetry` replace the `players:` line and the `prev:` line with:

```ts
    players: d.interior.crew.map(() => ({ repairsStarted: 0, repairsFinished: 0, walkingTicks: 0, repairingTicks: 0 })),
```

```ts
    prev: { counters: counters(d), grace: [new Int32Array(d.tactical.ships[0].graceUntil), new Int32Array(d.tactical.ships[1].graceUntil)], work: d.interior.crew.map(() => -1), seat, lastConsole: seat },
```

(`lastConsole: seat` stays the same array as today: the first recordTick reads index pid before it writes index pid, so sharing it changes nothing.)

- In `attendant` (L87) replace `d.present[pid as 0 | 1]` with `d.present[pid]`.
- Replace the repairs block (L135-147) with:

```ts
  const work = d.interior.crew.map(() => -1);
  for (const e of d.events) {
    if (e.kind === 'repairWork') work[e.player] = e.room;
    else if (e.kind === 'repairDone') for (const p of e.players) t.players[p]!.repairsFinished++;   // fire work and fires out are not repairs
  }
  const seat = seats(d);
  for (let pid = 0; pid < d.interior.playerCount; pid++) {
    const p = t.players[pid]!;
    if (work[pid]! >= 0 && work[pid] !== t.prev.work[pid]) p.repairsStarted++;
    if (seat[pid]! < 0) { if (work[pid]! >= 0) p.repairingTicks++; else p.walkingTicks++; }
    if (seat[pid]! >= 0 && t.prev.seat[pid]! < 0) { if (t.prev.lastConsole[pid]! >= 0 && seat[pid] !== t.prev.lastConsole[pid]) t.consoleSwaps++;   // a first sit is not a swap (start-aboard spec §1)
      t.prev.lastConsole[pid] = seat[pid]!; }
  }
```

- L160-161 comment: replace `when both\n  // characters were down` so it reads `when every\n  // character was down`.

- [ ] **Step 9: The summary**

`src/renderer/src/sim/duel/summary.ts`:

- Header line 2-3: replace `per-player pairs are [player 0, player 1]` with `per-player values are one per player, n long (Sci-2 spec §4.3)`.
- Replace `type Pair = readonly [number, number];` with:

```ts
type Pair = readonly [number, number];
/** One value per player, n long (Sci-2 spec §4.3); the ship pairs stay two. */
type PerPlayer = readonly number[];
```

- In `interface DuelEndSummary` replace `readonly repairsFinished: Pair;` with `readonly repairsFinished: PerPlayer;` and `readonly repairsStarted: Pair; readonly walkingTicks: Pair; readonly repairingTicks: Pair;` with `readonly repairsStarted: PerPlayer; readonly walkingTicks: PerPlayer; readonly repairingTicks: PerPlayer;`.
- Add the import `import type { DuelTelemetry, MissileLoss, PlayerTelemetry, TerminalCause } from './telemetry';` (replacing the existing one) and after the `pair` arrow add:

```ts
const perPlayer = (t: DuelTelemetry, f: (p: PlayerTelemetry) => number): PerPlayer => Object.freeze(t.players.map(f));
```

- In `duelEndSummary` replace `const ship = (i: 0 | 1) => t.ships[i], player = (i: 0 | 1) => t.players[i];` with `const ship = (i: 0 | 1) => t.ships[i];`, replace `repairsFinished: pair((i) => player(i).repairsFinished),` with `repairsFinished: perPlayer(t, (p) => p.repairsFinished),`, and replace the last property line with:

```ts
    repairsStarted: perPlayer(t, (p) => p.repairsStarted), walkingTicks: perPlayer(t, (p) => p.walkingTicks), repairingTicks: perPlayer(t, (p) => p.repairingTicks)
```

(The key order of the object is unchanged.)

- [ ] **Step 10: The modules**

`src/renderer/src/sim/duel/modules.ts`: replace `fields: () => PRESENCE,` in `presenceModule` with `fields: (d) => presenceFields(d.interior.playerCount),` and replace the `const PRESENCE ...` line with:

```ts
/** One flag per player, `present.0` .. `present.(n−1)` (Sci-2 spec §4.1), built once per crew size. */
const PRESENCE_BY_CREW = new Map<number, ModuleField<DuelState>[]>();
function presenceFields(n: number): ModuleField<DuelState>[] {
  let fields = PRESENCE_BY_CREW.get(n);
  if (!fields) {
    fields = Array.from({ length: n }, (_, p) => flag<DuelState>(`present.${p}`, (d) => d.present[p]!, (d, v) => { d.present[p] = v; }));
    PRESENCE_BY_CREW.set(n, fields);
  }
  return fields;
}
```

In `ROUND` replace `scalar('helmPlayer', (d) => d.helmPlayer, (d, v) => { d.helmPlayer = v as 0 | 1; }),` with `scalar('helmPlayer', (d) => d.helmPlayer, (d, v) => { d.helmPlayer = v; }),`.

- [ ] **Step 11: The playtest record and the solo recorder**

`src/renderer/src/net/duelRecord.ts`:

- In `interface DuelPlaytestRecord` replace `seat: 0 | 1; helmPlayer: 0 | 1; seed: number; round: number; startedAtIso: string;` with `seat: number; helmPlayer: number; seed: number; round: number; startedAtIso: string;` and add above it `/** \`seat\` and \`helmPlayer\` are player ids 0..3 (Sci-2 spec §4.3). */`.
- After `const pair = z.tuple([uint, uint]);` add `const crew = z.array(uint).min(2).max(4);   // Sci-2 spec §4.3: one per player, n long`.
- In `summary` replace `repairsFinished: pair,` with `repairsFinished: crew,` and `repairsStarted: pair, walkingTicks: pair, repairingTicks: pair,` with `repairsStarted: crew, walkingTicks: crew, repairingTicks: crew,`.
- In `duelRecordSchema` replace `seat: z.union([z.literal(0), z.literal(1)]), helmPlayer: z.union([z.literal(0), z.literal(1)]),` with `seat: z.number().int().min(0).max(3), helmPlayer: z.number().int().min(0).max(3),`.
- In `soloDuelRecord`'s signature replace `at: { seat: 0 | 1; helmPlayer: 0 | 1; startedAtIso: string; pauses: number }` with `at: { seat: number; helmPlayer: number; startedAtIso: string; pauses: number }`.

`src/renderer/src/app/duel/soloRecorder.ts`: replace `active(): 0 | 1;` with `active(): number;` and `helmPlayer(): 0 | 1;` with `helmPlayer(): number;`.

- [ ] **Step 12: Run the tests and the typecheck**

Run: `npx vitest run tests/crewOfFour.test.ts tests/duelModules.test.ts tests/duelRounds.test.ts tests/duelHealth.test.ts tests/duelTelemetry.test.ts tests/duelSnapshot.test.ts tests/duelCheckpoint.test.ts tests/codecModeWire.test.ts tests/onlineDuel.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors. If a site still narrows to `0 | 1` (for example a `as 0 | 1` cast on `present`, `players` or `lastConsole` not listed above), widen it to `number` the same way and list it in the commit message.

- [ ] **Step 12b: The two test files that index `players`**

`DuelTelemetry.players` is now `PlayerTelemetry[]`, so a literal index is `possibly undefined` under `noUncheckedIndexedAccess` (`tests/**` is in `tsc -b`). In `tests/helpers/scriptedDuel.ts` L78 (`telemetryLine`) write every `t.players[0].` as `t.players[0]!.` and every `t.players[1].` as `t.players[1]!.` (the line's text is unchanged, so the gate output is too). In `tests/duelTelemetry.test.ts` L84 write `t.players[1]!.repairsStarted`. Run `npx tsc -b` again: no errors.

- [ ] **Step 13: Prove every two-player run unchanged at 52, and the gates**

Run: `npx tsx scripts/golden/duel-oracle.ts same`
Expected: `duel oracle: <R> runs, <T> ticks, <F> named fields, results, events and telemetry identical at every tick field for field, sim version 52 → 52 (baseline HEAD <sha>)`, exit 0.

Run: `npx tsx scripts/golden/canonical-trace.ts same`
Expected: `per-tick canonical trace unchanged at sim version 52: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs (baseline HEAD <sha>)`, exit 0.

Run: `npx vitest run tests/duelGolden.test.ts tests/duelRematchGolden.test.ts tests/duelGates.test.ts tests/duelOracle.test.ts`
Expected: PASS (no re-bless: the goldens are unchanged).

- [ ] **Step 14: The full suite**

Run: `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: every test file PASS.

- [ ] **Step 15: Commit**

```bash
git add src/renderer/src/sim/duel/state.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/health.ts src/renderer/src/sim/duel/telemetry.ts src/renderer/src/sim/duel/summary.ts src/renderer/src/sim/duel/modules.ts src/renderer/src/net/duelRecord.ts src/renderer/src/app/duel/soloRecorder.ts tests/helpers/duelSeat.ts tests/helpers/scriptedDuel.ts tests/duelTelemetry.test.ts tests/crewOfFour.test.ts
git commit -m "feat(sci-2): the duel sim at a crew of 2, 3 or 4 (createDuel crew, presence, health and the all-down loss, telemetry, summary and record n long; the oracle proves every two-player run unchanged at 52)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The snapshot, the init, the checkpoint and the codec at n

**Files:**
- Modify: `src/renderer/src/sim/duel/snapshot.ts`, `src/renderer/src/authority/duelCheckpoint.ts`, `src/renderer/src/authority/duelRules.ts:31,34`, `src/renderer/src/net/codec.ts` (`duelSummaryShape`, `duelPublicationSchema`), `src/renderer/src/clientControl/duelClient.ts:8,17,45` (its two `DUEL_PLAYERS` uses only; Task 4 does the rest of the file)
- Modify (test helpers): `tests/helpers/liveDuel.ts:15` (codec at 4), `tests/helpers/duelAuthority.ts:19-21` (`duelInit`'s crew)
- Create: `tests/crewOfFourWire.test.ts`

**Interfaces:**
- Consumes: Task 2's `DUEL_CREW_MIN`, `DUEL_CREW_MAX`, `DuelCrew`, `createDuel(layout, seed, helmPlayer, crew)`, n-long telemetry.
- Produces:
  ```ts
  // sim/duel/snapshot.ts: DUEL_PLAYERS removed. The header's playerCount is n (2..4, ≤ the layout's spawns).
  export interface DuelRoundValues { round: number; helmPlayer: number; baseTick: number; decidedTick: number; outcome: number }
  export function duelRoundOf(snapshot: DuelSnapshot): DuelRoundValues;   // the round module at 1 + space + n + 3
  // loadDuelSnapshot builds createDuel(layout, seed, 0, header.playerCount); restoreDuelSnapshot refuses another crew size
  // authority/duelCheckpoint.ts
  export interface DuelInit { runId: string; layoutId: string; layoutHash: string; simVersion: number; contentDigest: string; seed: number; playerCount: DuelCrew; helmPlayer: number }
  // tests/helpers/duelAuthority.ts
  export function duelInit(seed: number, runId?: string, helmPlayer?: number, layout?: ShipLayout, playerCount?: DuelCrew): DuelInit;
  ```

- [ ] **Step 1: Baselines at 52**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline` and `npx tsx scripts/golden/duel-oracle.ts baseline` (expected output as in Task 2 Step 1).

- [ ] **Step 2: The test helpers**

`tests/helpers/liveDuel.ts`: replace `const codec = duelCodec(2);` with `const codec = duelCodec(DUEL_CREW_MAX);   // Sci-2: a crew-3 or crew-4 publication decodes` and add `import { DUEL_CREW_MAX } from '../../src/renderer/src/sim/duel/state';`.

`tests/helpers/duelAuthority.ts`: replace the `duelInit` function with:

```ts
export function duelInit(seed: number, runId = `duel-${seed}`, helmPlayer = 0, layout = CUTTER, playerCount: DuelCrew = 2): DuelInit {
  return { runId, layoutId: layout.id, layoutHash: deriveLayout(layout).layoutHash, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed, playerCount, helmPlayer };
}
```

and add `import type { DuelCrew } from '../../src/renderer/src/sim/duel/state';`. Change `modeDuelInit`'s `helmPlayer: 0 | 1 = 0` to `helmPlayer = 0`.

- [ ] **Step 3: Write the failing test**

Create `tests/crewOfFourWire.test.ts`:

```ts
// Sci-2 (spec 2026-11-18-sci-2-crew-of-four §4.2, §4.3, §9 Snapshot/checkpoint/wire): the duel snapshot, the init, the
// checkpoint and the codec at a crew of 3 and 4. The header's playerCount is the crew, validated in 2..4 and against the
// interior; the round module sits after n presence flags; the checkpoint's per-player arrays and ledger are n long; the
// codec admits players 0..3 and carries n-long per-player values while the ship pairs stay two.
import { describe, expect, it } from 'vitest';
import { validateDuelCheckpoint, type DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import { validateDuelPublication } from '../src/renderer/src/clientControl/duelClient';
import { duelCodec } from '../src/renderer/src/net/codec';
import { MAX_PLAYERS } from '../src/shared/intent';
import { ROOM_MAX_PLAYERS } from '../src/shared/roomSession';
import { hashF64 } from '../src/shared/hash';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { duelRoundOf, duelSeedFacts, loadDuelSnapshot, restoreDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot, type DuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, DUEL_CREW_MAX } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { duelEndSummary, duelRoundRecord } from '../src/renderer/src/sim/duel/summary';
import { createTelemetry, recordTick } from '../src/renderer/src/sim/duel/telemetry';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { liveDuel } from './helpers/liveDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE = { moveX: 0, moveY: 0, interactHeld: false };
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const rehash = (s: DuelSnapshot): DuelSnapshot => { s.header.hash = hashF64(Float64Array.from(s.values)); return s; };
/** A crew-n Hound duel a few ticks in, its last player away. */
function crewDuel(n: number, helmPlayer = 0) {
  const d = createDuel(DUEL_LAYOUT, 5, helmPlayer, n);
  stepDuelTick(d, { held: [], commands: [{ runId: 'duel', id: { player: n - 1, sequence: 1 }, requestedTick: 0, command: { kind: 'presence', present: false } }] });
  for (let k = 0; k < 4; k++) stepDuelTick(d, { held: [], commands: [] });
  return d;
}

describe('the bounds agree (Decision 2)', () => {
  it('the duel crew limit is the room limit and the codec module\'s', () => {
    expect([DUEL_CREW_MAX, MAX_PLAYERS, ROOM_MAX_PLAYERS]).toEqual([4, 4, 4]);
  });
});

describe('the duel snapshot at n (spec §4.2)', () => {
  for (const n of [3, 4]) it(`a crew of ${n}: the header carries it, it validates, loads and restores to the same hash`, () => {
    const d = crewDuel(n);
    try {
      const snap = saveDuelSnapshot(d, DIGEST);
      expect(snap.header.playerCount).toBe(n);
      expect(validateDuelSnapshot(DUEL_LAYOUT, JSON.parse(JSON.stringify(snap)), DIGEST).header.playerCount).toBe(n);
      const r = loadDuelSnapshot(DUEL_LAYOUT, JSON.parse(JSON.stringify(snap)), DIGEST);
      try {
        expect([r.interior.playerCount, hashDuel(r)]).toEqual([n, hashDuel(d)]);
        expect(r.present).toEqual([...Array(n - 1).fill(true), false]);
        stepDuelTick(d, { held: [], commands: [] });
        restoreDuelSnapshot(r, validateDuelSnapshot(DUEL_LAYOUT, saveDuelSnapshot(d, DIGEST), DIGEST), DIGEST);
        expect(hashDuel(r)).toBe(hashDuel(d));
      } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
  it('refuses a header crew outside 2..4 or one that disagrees with the values; a replica of another crew is a load', () => {
    const d = crewDuel(3), two = createDuel(DUEL_LAYOUT, 5);
    try {
      const snap = saveDuelSnapshot(d, DIGEST), withCount = (n: number) => { const s = structuredClone(snap); s.header.playerCount = n; return s; };
      for (const n of [1, 5, 2.5]) expect(() => validateDuelSnapshot(DUEL_LAYOUT, withCount(n), DIGEST), `playerCount ${n}`).toThrow(/player count is invalid/);
      for (const n of [2, 4]) expect(() => validateDuelSnapshot(DUEL_LAYOUT, withCount(n), DIGEST), `playerCount ${n} on a crew of 3`).toThrow();
      const space = duelSeedFacts(5).spaceLength, interiorAt = 1 + space + 3 + 3 + 4 + 2;
      for (const k of [5, 9]) { const s = structuredClone(snap); s.values[interiorAt + k] = 2; expect(() => validateDuelSnapshot(DUEL_LAYOUT, rehash(s), DIGEST), `interior[${k}] = 2`).toThrow(); }
      expect(() => restoreDuelSnapshot(two, validateDuelSnapshot(DUEL_LAYOUT, snap, DIGEST), DIGEST)).toThrow(/load it instead/);
    } finally { disposeDuel(d); disposeDuel(two); }
  });
  it('duelRoundOf reads the round module after n presence flags; the Helm player is a seat of the crew', () => {
    const d = crewDuel(3, 2);
    try {
      const snap = saveDuelSnapshot(d, DIGEST);
      expect(duelRoundOf(snap)).toMatchObject({ round: 0, helmPlayer: 2, baseTick: 0, decidedTick: -1, outcome: 0 });
      const helmAt = 1 + duelSeedFacts(5).spaceLength + 3 + 3 + 1;
      expect(snap.values[helmAt]).toBe(2);
      const bad = structuredClone(snap); bad.values[helmAt] = 3;
      expect(() => validateDuelSnapshot(DUEL_LAYOUT, rehash(bad), DIGEST)).toThrow(/helm player/);
    } finally { disposeDuel(d); }
  });
});

describe('the init and the checkpoint at n (spec §4.3)', () => {
  it('a crew-3 checkpoint validates with n-long arrays and an n-player ledger; any other length or crew is refused', () => {
    const live = liveDuel(duelInit(5, 'crew-3', 0, DUEL_LAYOUT, 3));
    live.tick(30);
    const cp = JSON.parse(JSON.stringify(live.core.captureCheckpoint())) as DuelCheckpoint;
    expect([cp.init.playerCount, cp.snapshot.header.playerCount, cp.commandHighWater.length, cp.heldHighWater.length, cp.held.length, cp.admissionCounts.length]).toEqual([3, 3, 3, 3, 3, 3]);
    expect(cp.modeMemory.telemetry.players).toHaveLength(3);
    const check = (value: unknown) => validateDuelCheckpoint(JSON.parse(JSON.stringify(value)), DIGEST, resolveCutter);
    expect(() => check(cp)).not.toThrow();
    const t = cp.modeMemory.telemetry;
    for (const [what, bad] of [
      ['init crew 2', { ...cp, init: { ...cp.init, playerCount: 2 } }],
      ['init crew 5', { ...cp, init: { ...cp.init, playerCount: 5 } }],
      ['helm player 3', { ...cp, init: { ...cp.init, helmPlayer: 3 } }],
      ['two command watermarks', { ...cp, commandHighWater: cp.commandHighWater.slice(0, 2) }],
      ['two held frames', { ...cp, held: cp.held.slice(0, 2), heldHighWater: cp.heldHighWater.slice(0, 2) }],
      ['pause owner 3', { ...cp, pauseOwner: 3 }],
      ['two telemetry players', { ...cp, modeMemory: { ...cp.modeMemory, telemetry: { ...t, players: t.players.slice(0, 2) } } }],
      ['two seat copies', { ...cp, modeMemory: { ...cp.modeMemory, telemetry: { ...t, prev: { ...t.prev, seat: t.prev.seat.slice(0, 2) } } } }]
    ] as const) expect(() => check(bad), what).toThrow();
  });
  it('a crew-3 publication passes the duel publication validation', () => {
    const live = liveDuel(duelInit(5, 'crew-3-pub', 0, DUEL_LAYOUT, 3));
    live.tick(6);
    const state = [...live.sent].reverse().find((m) => m.kind === 'state');
    expect(state).toBeDefined();
    const p = validateDuelPublication(JSON.parse(JSON.stringify((state as { state: unknown }).state)), { resolveLayout: resolveCutter, contentDigest: DIGEST });
    expect([p.snapshot.header.playerCount, p.commandHighWater.length]).toEqual([3, 3]);
  });
});

describe('the duel codec at n (spec §4.3)', () => {
  it('admits players 0..3 at limit 4, refuses them at limit 2; per-player values n long, ship pairs two', () => {
    const command = (player: number) => raw({ kind: 'command', envelope: { runId: 'r', id: { player, sequence: 1 }, requestedTick: 0, command: { kind: 'stand' } } });
    expect(duelCodec(DUEL_CREW_MAX).decodeMessage(command(3))).toMatchObject({ kind: 'command' });
    expect(() => duelCodec(DUEL_CREW_MAX).decodeMessage(command(4))).toThrow();
    expect(() => duelCodec(2).decodeMessage(command(2))).toThrow();
    const d = createDuel(DUEL_LAYOUT, 5, 0, 3), t = createTelemetry(d);
    try {
      for (let k = 0; k < 3; k++) { const i = { held: [NONE, NONE, NONE], commands: [] }; stepDuelTick(d, i); recordTick(t, d, i); }
      const record = duelRoundRecord(duelEndSummary(t), 0, 5, 0);
      const round = (r: unknown) => ({ kind: 'event' as const, event: { runId: 'r', eventSequence: 1, tick: 3, payload: { kind: 'round', record: r } as never } });
      const codec = duelCodec(DUEL_CREW_MAX);
      expect(codec.decodeMessage(codec.encodeMessage(round(record)))).toEqual(round(record));
      for (const [what, bad] of [['a 3-long ship pair', { ...record, laserHits: [0, 0, 0] }], ['a 5-long player list', { ...record, walkingTicks: [0, 0, 0, 0, 0] }], ['a 1-long player list', { ...record, repairsStarted: [0] }]] as const)
        expect(() => codec.decodeMessage(raw(round(bad))), what).toThrow();
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npx vitest run tests/crewOfFourWire.test.ts`
Expected: FAIL. `saveDuelSnapshot` writes `playerCount: 2` for a crew of 3, and `validateDuelSnapshot` refuses it (`player count is invalid`).

- [ ] **Step 5: The snapshot**

`src/renderer/src/sim/duel/snapshot.ts`:

- Header comment line 2: after `presence,` insert ` (n flags, Sci-2 spec §4.2)`.
- Replace `import { createDuel, disposeDuel, type DuelState } from './state';` with `import { createDuel, disposeDuel, DUEL_CREW_MAX, DUEL_CREW_MIN, type DuelState } from './state';`.
- Delete `export const DUEL_PLAYERS = 2;`. In `DuelSnapshotHeader`'s comment replace `and the player count (2)` with `and the player count, the crew size n in 2..4 (Sci-2 spec §4.2)`.
- Replace `interface LayoutEntry ...` with:

```ts
/** A crew size's interior shape on a layout: the canonical value count and the tick's offset (canonicalFields(layout, n)). */
interface CrewEntry { interiorCount: number; tickOffset: number }
/** One per layout object (Sci-2 Decision 3): its Derived, and the interior shape of each crew size seen, built once. */
interface LayoutEntry { id: string; layoutHash: string; derived: Derived; crews: Map<number, CrewEntry> }
```

- Replace the body of `layoutEntry` with:

```ts
  return remember(layoutCache, layout, LAYOUT_CACHE_MAX, () => {
    const derived = deriveLayout(layout);
    return { id: layout.id, layoutHash: derived.layoutHash, derived, crews: new Map() };
  });
}
/** The interior's shape at crew size n on this layout, from the layout's entry (Sci-2 spec §4.2). */
function crewEntry(lay: LayoutEntry, layout: ShipLayout, n: number): CrewEntry {
  let c = lay.crews.get(n);
  if (!c) {
    const fields: readonly CanonicalField[] = canonicalFields(layout, n), last = fields[fields.length - 1]!;
    c = { interiorCount: last.offset + last.count, tickOffset: fields.find((f) => f.name === 'tick')!.offset };
    lay.crews.set(n, c);
  }
  return c;
```

(keep the function's closing brace; `layoutEntry`'s own closing `}` is the one shown above.)

- Replace `DuelRoundValues` and `duelRoundOf` with:

```ts
/** The round module's values and the outcome, read from a validated snapshot (H-2 spec §7); `helmPlayer` is a player id. */
export interface DuelRoundValues { round: number; helmPlayer: number; baseTick: number; decidedTick: number; outcome: number }
export function duelRoundOf(snapshot: DuelSnapshot): DuelRoundValues {
  const e = seedEntry(snapshot.header.seed), v = snapshot.values, at = 1 + e.spaceLength + snapshot.header.playerCount + 3;   // after n presence flags and 3 repair values
  return { round: v[at]!, helmPlayer: v[at + 1]!, baseTick: v[at + 2]!, decidedTick: v[at + 3]!, outcome: v[e.fieldOffsets.get('outcome')!]! };
}
```

- In `saveDuelSnapshot` replace `playerCount: DUEL_PLAYERS,` with `playerCount: d.interior.playerCount,`.
- In `validateDuelSnapshot`:
  - Replace `if (h.playerCount !== DUEL_PLAYERS) throw new Error('duel snapshot player count is invalid');` with:

```ts
  // Sci-2 spec §4.2: the crew size, an integer in 2..4 and no more than the layout's spawns; everything after derives from it.
  const n = h.playerCount;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < DUEL_CREW_MIN || n > DUEL_CREW_MAX || n > layout.spawns.length) throw new Error('duel snapshot player count is invalid');
  const crew = crewEntry(lay, layout, n);
```

  - Replace `const space = seed.spaceLength, roundAt = 1 + space + 2 + 3, helmAt = roundAt + 4, interiorAt = helmAt + 2;` with:

```ts
  const space = seed.spaceLength, repairAt = 1 + space + n, roundAt = repairAt + 3, helmAt = roundAt + 4, interiorAt = helmAt + 2;
```

  - Replace `if (values.length !== interiorAt + lay.interiorCount)` with `if (values.length !== interiorAt + crew.interiorCount)`.
  - Replace `const v = values[k]!, presence = k < 1 + space + 2;` with `const v = values[k]!, presence = k < repairAt;`.
  - Replace the round module comment's `the Helm player 0 or 1` with `the Helm player a seat of the crew (0..n−1)`, and `if (helm !== 0 && helm !== 1) throw` with `if (!Number.isInteger(helm) || helm < 0 || helm >= n) throw`.
  - Replace `validateCanonicalValues(layout, derived, DUEL_PLAYERS, interior);` with `validateCanonicalValues(layout, derived, n, interior);`, and `if (interior[5] !== DUEL_PLAYERS || interior[9] !== DUEL_PLAYERS)` with `if (interior[5] !== n || interior[9] !== n)`.
  - Replace `const interiorTick = values[interiorAt + lay.tickOffset];` with `const interiorTick = values[interiorAt + crew.tickOffset];`.
  - In the returned header replace `playerCount: DUEL_PLAYERS,` with `playerCount: n,`.
- In `loadDuelSnapshot` replace `const d = createDuel(layout, snap.header.seed);` with `const d = createDuel(layout, snap.header.seed, 0, snap.header.playerCount);   // the round module's helmPlayer is written back`.
- In `restoreDuelSnapshot` replace the layout/seed line with:

```ts
  if (h.layoutId !== d.interior.layout.id || h.layoutHash !== d.interior.derived.layoutHash || h.seed !== d.tactical.seed || h.playerCount !== d.interior.playerCount)
    throw new Error('duel snapshot is for another layout, seed or crew: load it instead');
```

- [ ] **Step 6: The init and the checkpoint**

`src/renderer/src/authority/duelCheckpoint.ts`:

- Replace the snapshot import with `import { duelRoundOf, duelSeedFacts, validateDuelSnapshot, type DuelSnapshot } from '../sim/duel/snapshot';` and add `import { DUEL_CREW_MAX, DUEL_CREW_MIN, type DuelCrew } from '../sim/duel/state';`.
- Replace the `DuelInit` doc and line with:

```ts
/** `seed` is round 0's; `playerCount` the crew size (Sci-2 spec §4.3); `helmPlayer` a seat of the crew (since start aboard it seats nobody). */
export interface DuelInit { runId: string; layoutId: string; layoutHash: string; simVersion: number; contentDigest: string; seed: number; playerCount: DuelCrew; helmPlayer: number }
```

- After `const two = ...` add:

```ts
/** A per-player list (Sci-2 spec §4.3): 2..4 long here, exactly the init's crew in validateDuelCheckpoint. */
const crewList = <T extends z.ZodTypeAny>(item: T) => z.array(item).min(DUEL_CREW_MIN).max(DUEL_CREW_MAX);
```

- In `duelInitSchema` replace `playerCount: z.literal(DUEL_PLAYERS),` and the `helmPlayer:` line with:

```ts
  playerCount: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  helmPlayer: z.number().int().min(0).max(DUEL_CREW_MAX - 1)
```

- In `duelMemorySchema` replace `players: two(playerTelemetry),` with `players: crewList(playerTelemetry),` and in its `prev` replace `work: two(int), seat: two(int), lastConsole: two(int)` with `work: crewList(int), seat: crewList(int), lastConsole: crewList(int)`.
- In `checkpointSchema` replace `z.array(uint).length(DUEL_PLAYERS)` (both: `commandHighWater`, `heldHighWater`) with `crewList(uint)`, `.max(DUEL_PLAYERS * 256)` with `.max(DUEL_CREW_MAX * 256)`, `z.array(uint.max(16)).length(DUEL_PLAYERS)` with `crewList(uint.max(16))`, `uint.max(DUEL_PLAYERS - 1).nullable()` with `uint.max(DUEL_CREW_MAX - 1).nullable()`, and `z.array(held).length(DUEL_PLAYERS)` with `crewList(held)`.
- In `validateDuelInit` after the `incompatible duel` line add:

```ts
  if (init.playerCount > layout.spawns.length) throw new Error('incompatible duel');   // Sci-2 spec §4.1: a spawn per player
  if (init.helmPlayer >= init.playerCount) throw new Error(`invalid duel helm player ${init.helmPlayer} for a crew of ${init.playerCount}`);
```

- In `validateDuelCheckpoint` replace `const ledger = createLedger([0, 1], DUEL_PLAYERS, duelCodec);` with:

```ts
  // Sci-2 spec §4.3: the snapshot's crew is the init's, and every per-player array is that long.
  const n = cp.init.playerCount, memory = cp.modeMemory.telemetry;
  if (cp.snapshot.header.playerCount !== n
    || [cp.commandHighWater, cp.admissionCounts, cp.heldHighWater, cp.held, memory.players, memory.prev.work, memory.prev.seat, memory.prev.lastConsole].some((a) => a.length !== n)
    || cp.recentResults.length > n * 256 || (cp.pauseOwner !== null && cp.pauseOwner >= n)) throw new Error('inconsistent duel checkpoint player count');
  const ledger = createLedger(Array.from({ length: n }, (_, p) => p), n, duelCodec);
```

`src/renderer/src/authority/duelRules.ts`:
- L31: `create(init, resolveLayout) { const duel = createDuel(resolveLayout(init.layoutId), init.seed, init.helmPlayer, init.playerCount); return session(duel, createTelemetry(duel)); },`
- L34: `playerCount: (s) => s.duel.interior.playerCount,   // Sci-2 spec §4.3: the run's crew`

- [ ] **Step 7: The codec**

`src/renderer/src/net/codec.ts`:
- In `duelSummaryShape` replace `const pair = z.tuple([uint, uint]);` with:

```ts
  const pair = z.tuple([uint, uint]), crew = z.array(uint).min(2).max(MAX_PLAYERS);   // Sci-2 spec §4.3: per-player values n long, ship pairs two
```

  and in its return replace `repairsFinished: pair,` with `repairsFinished: crew,` and `repairsStarted: pair, walkingTicks: pair, repairingTicks: pair` with `repairsStarted: crew, walkingTicks: crew, repairingTicks: crew`. Its doc comment gains: `Per-ship values are pairs; per-player values one per player (Sci-2).`
- Replace `export const duelPublicationSchema = messageSchemaFor(2, duelWire).publicationSchema;` with:

```ts
/** Object validation of a duel publication, as validatePublication is for the sector; built at the room limit, the crew
 *  size is the snapshot header's (Sci-2 spec §4.3). */
export const duelPublicationSchema = messageSchemaFor(MAX_PLAYERS, duelWire).publicationSchema;
```

(and delete the old one-line comment above it).

`src/renderer/src/clientControl/duelClient.ts` (`DUEL_PLAYERS` is gone): replace the snapshot import with `import { DUEL_SNAPSHOT_FORMAT, loadDuelSnapshot, restoreDuelSnapshot, validateDuelSnapshot, type DuelSnapshot } from '../sim/duel/snapshot';`, the state import with `import { disposeDuel, DUEL_CREW_MAX, type DuelState } from '../sim/duel/state';`, `const codec = duelCodec(DUEL_PLAYERS);` with `const codec = duelCodec(DUEL_CREW_MAX);`, and `playerCount: () => DUEL_PLAYERS` with `playerCount: (d) => d.interior.playerCount`.

- [ ] **Step 7b: The duel mode's refused crew size**

`tests/duelMode.test.ts` L134 asserts a `playerCount: 3` init is refused; at Sci-2 it is valid on the Hound (four spawns). Replace `playerCount: 3` there with `playerCount: 5` (still refused), and add after it:

```ts
    expect(duel.command({ kind: 'start', initBytes: encode({ ...duelInit(1), playerCount: 3 }) }).ok).toBe(true);   // Sci-2: a crew of three starts
```

(if the test's mode object is not named `duel` or its start command differs, mirror the L134 call exactly with only `playerCount` changed and `.toBe(true)`).

- [ ] **Step 8: Run the tests and the typecheck**

Run: `npx vitest run tests/crewOfFourWire.test.ts tests/crewOfFour.test.ts tests/duelSnapshot.test.ts tests/duelCheckpoint.test.ts tests/duelRounds.test.ts tests/codecModeWire.test.ts tests/duelModules.test.ts tests/duelMode.test.ts tests/duelProducers.test.ts tests/duelOnline.test.ts tests/onlineDuel.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors. `git grep -n "DUEL_PLAYERS" -- src tests scripts` prints nothing.

- [ ] **Step 9: Prove every two-player run unchanged at 52, and the gates**

Run: `npx tsx scripts/golden/duel-oracle.ts same` and `npx tsx scripts/golden/canonical-trace.ts same` (expected output as in Task 2 Step 13).

Run: `npx vitest run tests/duelGolden.test.ts tests/duelRematchGolden.test.ts tests/duelGates.test.ts tests/duelOracle.test.ts`
Expected: PASS.

- [ ] **Step 10: The full suite**

Run: `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: every test file PASS.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/sim/duel/snapshot.ts src/renderer/src/authority/duelCheckpoint.ts src/renderer/src/authority/duelRules.ts src/renderer/src/net/codec.ts src/renderer/src/clientControl/duelClient.ts tests/helpers/liveDuel.ts tests/helpers/duelAuthority.ts tests/duelMode.test.ts tests/crewOfFourWire.test.ts
git commit -m "feat(sci-2): the duel snapshot, init, checkpoint and codec at a crew of 2, 3 or 4 (header playerCount, per-crew interior shape, n-long ledger and arrays; the oracle proves every two-player run unchanged at 52)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 4: The producers, the stream and the client at n; three seats online

**Files:**
- Modify: `src/network/modes/duelProducers.ts`, `src/network/modes/duel.ts:15,20`, `src/network/modes/duelStream.ts:56,63`, `src/renderer/src/clientControl/duelClient.ts`
- Modify (test helper): `tests/helpers/onlineDuel.ts`
- Test updates: `tests/duelProducers.test.ts:88,114,141` (add `playerCount: 2`)
- Create: `tests/duelOnlineCrew.test.ts`

**Interfaces:**
- Consumes: Task 3's `DuelInit.playerCount`, the snapshot header's `playerCount`, `duelInit(seed, runId, helmPlayer, layout, playerCount)`; Task 2's `standAtStation`, `DUEL_CREW_MIN/MAX`, `DuelCrew`.
- Produces:
  ```ts
  // src/network/modes/duelProducers.ts
  interface DuelProducerOptions { authority: Authority<DuelTypes>; runId: string; contentDigest: string; playerCount: number; pause(reason: string): void }
  export function createDuelProducers(options: DuelProducerOptions): { attachHuman(...); beforeControls(); beforeTick(); controllers(); stewards(); dispose() };   // throws 'invalid duel producer' for playerCount outside 2..4
  // tests/helpers/onlineDuel.ts
  export interface Seat { seat: number; pair: LinkPair; client: ReturnType<typeof createDuelRemoteClient>; detach(): void; origin: AttachmentOrigin }
  export function onlineDuel(seed: number, options?: { helmPlayer?: number; runId?: string; drop?: (k: number) => boolean; restore?: DuelCheckpoint; crew?: DuelCrew; place?: (d: DuelState) => void }): { ...; connect(seat: number, origin?: AttachmentOrigin): Seat; ... };
  ```

- [ ] **Step 1: The test helper**

`tests/helpers/onlineDuel.ts`:
- Add imports: `import type { DuelCrew, DuelState } from '../../src/renderer/src/sim/duel/state';` and `import { CUTTER } from './scriptedDuel';`.
- Replace `export interface Seat { seat: 0 | 1; ...` with `export interface Seat { seat: number; pair: LinkPair; client: ReturnType<typeof createDuelRemoteClient>; detach(): void; origin: AttachmentOrigin }`.
- Replace the `onlineDuel` signature and its first line with:

```ts
/** `crew` (Sci-2): the run's crew size, 2 by default, a restore's from its init; `place` changes the fresh duel after the
 *  old seated start and before the core sees it (a third player put at a console). */
export function onlineDuel(seed: number, options: { helmPlayer?: number; runId?: string; drop?: (k: number) => boolean; restore?: DuelCheckpoint; crew?: DuelCrew; place?: (d: DuelState) => void } = {}) {
  const runId = options.runId ?? `online-${seed}`, contentDigest = __GAMEPLAY_CONTENT_DIGEST__, crew = options.restore?.init.playerCount ?? options.crew ?? 2;
```

- In `rules.create` replace `seatDuelCrew(session.duel); return session;` with `seatDuelCrew(session.duel); options.place?.(session.duel); return session;`.
- Replace the `producers = createDuelProducers({ authority, runId, contentDigest, pause: ...` line's object with `{ authority, runId, contentDigest, playerCount: crew, pause: (reason) => request?.({ paused: true, reason }) }`.
- Replace `else authority.start(duelInit(seed, runId, options.helmPlayer ?? 0));` with `else authority.start(duelInit(seed, runId, options.helmPlayer ?? 0, CUTTER, crew));`.
- Replace `const seats: (Seat | undefined)[] = [undefined, undefined];` with `const seats: (Seat | undefined)[] = Array.from({ length: crew });` and `function connect(seat: 0 | 1, origin` with `function connect(seat: number, origin`.

`tests/duelProducers.test.ts` L88, L114, L141: in each `createDuelProducers({ authority, runId: 'r', contentDigest: DIGEST, pause: ... })` add `playerCount: 2, ` after `contentDigest: DIGEST, `.

- [ ] **Step 2: Write the failing test**

Create `tests/duelOnlineCrew.test.ts`:

```ts
// Sci-2 (spec 2026-11-18-sci-2-crew-of-four §4.4, §7, §9 Online): a crew of three online through the duel producers and
// one streamed receive-time client per seat (the H-2 two-seat harness widened). A human attaches at seat 2, sits at
// Science and scans, and every replica is the authority's state; an empty seat gets the away steward's presence false at
// the first running boundary; a dropped seat 2 is stewarded and rejoins; the producers seat players 0..n−1 only.
import { describe, expect, it } from 'vitest';
import type { DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { hashF64 } from '../src/shared/hash';
import { createDuelProducers } from '../src/network/modes/duelProducers';
import { standAtStation } from './helpers/duelSeat';
import { linkPair } from './helpers/linkPair';
import { onlineDuel } from './helpers/onlineDuel';

const peerLost = (rig: ReturnType<typeof onlineDuel>) => rig.captures.filter((c) => c.cause === 'pause' && c.checkpoint.pauseReason === 'peer-lost');

describe('a crew of three online (spec §4.4)', () => {
  it('a human at seat 2 sits at Science and scans; every replica is the authority\'s state', () => {
    const rig = onlineDuel(2, { crew: 3, place: (d) => standAtStation(d, 2, d.science) });
    const seats = [rig.connect(0), rig.connect(1), rig.connect(2)];
    rig.tick(3);
    expect(seats.map((s) => s.client.commandStatus(s.seat).state)).toEqual(['ready', 'ready', 'ready']);
    const science = rig.session().duel.science;
    expect(seats[2]!.client.command(2, { kind: 'sit', station: science })).not.toBeNull();
    rig.tick(6);
    expect(rig.session().duel.interior.stations.occupant[science]).toBe(2);
    expect(seats[2]!.client.command(2, { kind: 'contactScan', contact: 0 })).not.toBeNull();
    rig.tick(6);
    expect(rig.session().duel.tactical.scan).toMatchObject({ contact: 0, by: science });
    rig.tick(200);
    expect(rig.session().duel.tactical.known[0]).toBe(1);   // Level 1: 900 units at 5 a tick from the Science console
    // Paused, the authority stops stepping, so every replica settles on the authority's state.
    expect(seats[0]!.client.command(0, { kind: 'setPaused', paused: true })).not.toBeNull();
    rig.tick(10);
    const cp = rig.authority.checkpoint([]) as DuelCheckpoint, hash = hashF64(Float64Array.from(cp.snapshot.values));
    expect(cp.snapshot.header.playerCount).toBe(3);
    for (const s of seats) { expect(s.client.publication()!.hash).toBe(hash); expect(hashDuel(s.client.state()!)).toBe(hash); }
    expect(seats[2]!.client.publication()!.heldHighWater).toHaveLength(3);
  });
  it('a crew-3 start with seat 2 empty: the steward\'s presence false is applied and present[2] is false in the next publication', () => {
    const rig = onlineDuel(2, { crew: 3 }), a = rig.connect(0), b = rig.connect(1);
    rig.tick(6);
    const cp = rig.authority.checkpoint([]) as DuelCheckpoint;
    const presence = cp.recentResults.find((r) => r.envelope.id.player === 2 && r.envelope.command.kind === 'presence');
    expect(presence?.envelope.command).toEqual({ kind: 'presence', present: false });
    expect(presence?.result.status).toBe('applied');
    expect(rig.session().duel.present).toEqual([true, true, false]);
    rig.tick(3);
    for (const s of [a, b]) expect(s.client.state()!.present).toEqual([true, true, false]);
    expect(rig.producers.stewards()).toEqual([{ player: 2, done: true, lost: false, pending: false }]);
    expect(peerLost(rig)).toEqual([]);   // a seat empty from the start is no lost peer
    expect(a.client.publication()!.phase).toBe('running');
  });
  it('a dropped seat 2 is stewarded with a peer-lost pause, then rejoins present after the resume', () => {
    const rig = onlineDuel(2, { crew: 3 }), a = rig.connect(0), b = rig.connect(1), c = rig.connect(2);
    rig.tick(3); c.detach(); rig.tick(6);
    expect(peerLost(rig)).toHaveLength(1);
    expect(rig.session().duel.present).toEqual([true, true, false]);
    const again = rig.connect(2);
    rig.tick(2);
    expect(again.client.commandStatus(2).state).toBe('ready');
    expect(rig.producers.stewards()).toEqual([]);   // the steward retired
    expect(again.client.command(2, { kind: 'presence', present: true })).not.toBeNull();
    rig.tick(10);
    a.client.command(0, { kind: 'setPaused', paused: false }); rig.tick(4);
    expect(rig.session().duel.present).toEqual([true, true, true]);
    void b;
  });
  it('the producers seat players 0..n−1 only, and take a crew of 2..4', () => {
    const two = onlineDuel(2), three = onlineDuel(3, { crew: 3 });
    const link = () => linkPair('extra').host.link;
    expect(() => two.producers.attachHuman(link(), [2], { admissionPolicy: 'receive-time' })).toThrow('invalid duel producer');
    expect(() => three.producers.attachHuman(link(), [3], { admissionPolicy: 'receive-time' })).toThrow('invalid duel producer');
    for (const playerCount of [1, 5]) expect(() => createDuelProducers({ authority: two.authority, runId: 'r', contentDigest: __GAMEPLAY_CONTENT_DIGEST__, playerCount, pause: () => {} }), `crew ${playerCount}`).toThrow('invalid duel producer');
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/duelOnlineCrew.test.ts`
Expected: FAIL. The producers ignore `playerCount` (`PLAYERS = 2`): `attachHuman(..., [2], ...)` throws `invalid duel producer` for the crew-3 rig, and the clients decode at limit 2.

- [ ] **Step 4: The producers**

`src/network/modes/duelProducers.ts`:
- Header line 1-2: replace `The duel's producers are its\n// two humans;` so it reads `The duel's producers are its\n// n humans (Sci-2 spec §4.4: n = init.playerCount, 2..4);`.
- Add `import { DUEL_CREW_MAX, DUEL_CREW_MIN } from '../../renderer/src/sim/duel/state';`.
- Replace `interface DuelProducerOptions { authority: Authority<DuelTypes>; runId: string; contentDigest: string; pause(reason: string): void }` with:

```ts
interface DuelProducerOptions { authority: Authority<DuelTypes>; runId: string; contentDigest: string; playerCount: number; pause(reason: string): void }
```

- Replace `const PLAYERS = 2;\nconst codec = duelCodec(PLAYERS);` with `const codec = duelCodec(DUEL_CREW_MAX);   // Sci-2 spec §4.3: built once at the room limit`.
- Replace the first three lines of `createDuelProducers`'s body (through `const desired ...`) with:

```ts
  const { authority, runId, contentDigest, playerCount } = options;
  if (!Number.isInteger(playerCount) || playerCount < DUEL_CREW_MIN || playerCount > DUEL_CREW_MAX) throw Error('invalid duel producer');
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest });
  const desired: (Human | undefined)[] = Array.from({ length: playerCount });   // Sci-2: a seat with no human gets the steward (an empty seat at Start)
```

- In `boundary` replace `for (let player = 0; player < PLAYERS; player++)` with `for (let player = 0; player < playerCount; player++)`.
- In `attachHuman` replace `p >= PLAYERS` with `p >= playerCount`.

`src/network/modes/duel.ts`:
- Add `import { DUEL_CREW_MAX } from '../../renderer/src/sim/duel/state';`; replace `const decode = duelCodec(2);` with `const decode = duelCodec(DUEL_CREW_MAX);`.
- Replace the `producers:` line with:

```ts
  producers: ({ authority, init, contentDigest, pause }) => createDuelProducers({ authority, runId: init.runId, contentDigest, playerCount: init.playerCount, pause }),
```

`src/network/modes/duelStream.ts`: add `import { DUEL_CREW_MAX } from '../../renderer/src/sim/duel/state';` and replace both `duelCodec(2)` (L56, L63) with `duelCodec(DUEL_CREW_MAX)`.

- [ ] **Step 5: The client**

`src/renderer/src/clientControl/duelClient.ts`:
- (Task 3 already imports `DUEL_CREW_MAX`, builds `const codec = duelCodec(DUEL_CREW_MAX);` and sets `playerCount: (d) => d.interior.playerCount`.)
- Replace `const held = [0, 0], next = [1, 1];` with:

```ts
  // Sci-2 spec §4.4: room for the largest crew; `crew` is the latest accepted publication's crew size.
  const held = Array<number>(DUEL_CREW_MAX).fill(0), next = Array<number>(DUEL_CREW_MAX).fill(1);
  let crew = 0;
```

- Replace `matches: (d, h) => h.layoutId === d.interior.layout.id && h.layoutHash === d.interior.derived.layoutHash && h.seed === d.tactical.seed,` with:

```ts
      matches: (d, h) => h.layoutId === d.interior.layout.id && h.layoutHash === d.interior.derived.layoutHash && h.seed === d.tactical.seed && h.playerCount === d.interior.playerCount,
```

- Replace the `heldSequences:` and `onAccepted` lines with:

```ts
    heldSequences: { has: (p) => Number.isInteger(p) && p >= 0 && p < crew, get: (p) => held[p]!, set: (p, v) => { held[p] = v; } },
    onAccepted(_replica, publication) {
      crew = publication.snapshot.header.playerCount;
      for (let p = 0; p < crew; p++) next[p] = Math.max(next[p]!, publication.commandHighWater[p]! + 1);
    }
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run tests/duelOnlineCrew.test.ts tests/duelProducers.test.ts tests/duelMode.test.ts tests/duelOnline.test.ts tests/duelOnlineView.test.ts tests/onlineDuelSession.test.ts tests/crewOfFourWire.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 7: The full suite**

Run: `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: every test file PASS.

- [ ] **Step 8: Commit**

```bash
git add src/network/modes/duelProducers.ts src/network/modes/duel.ts src/network/modes/duelStream.ts src/renderer/src/clientControl/duelClient.ts tests/helpers/onlineDuel.ts tests/duelProducers.test.ts tests/duelOnlineCrew.test.ts
git commit -m "feat(sci-2): duel producers, stream and client at a crew of 2, 3 or 4 (an empty seat gets the away steward; three seats online agree with the authority)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The host path: the crew in the host action, the room capacity, the init, the mirror and the menu store

**Files:**
- Modify: `src/shared/onlineSession.ts` (`DuelCrewSize`, `OnlineAction`, `validateOnlineAction`, `OnlinePreloadApi.host/start`), `src/preload/index.ts:35`, `src/main/network/onlineSession.ts:421`, `src/main/network/onlineDuel.ts`, `src/main/network/onlineModes.ts:18,33`, `src/renderer/src/ui/menuState.ts` (`MenuState.crew`, `INITIAL_MENU`, `helmPlayerOf`), `src/renderer/src/ui/actions.ts` (`setCrew`, `host`)
- Test updates: `tests/onlineSessionContract.test.ts:38,41`, `tests/onlineDuel.test.ts:18-19,24-33,68-72`, `tests/onlineBridge.test.ts:88`, `tests/uiActions.test.ts:14-20`, `tests/menu.test.tsx:73`

**Interfaces:**
- Consumes: Task 3's `validateDuelInit`, `validateDuelCheckpoint`, `DuelInit.playerCount`; `DUEL_CREW_MIN/MAX`, `DuelCrew` (Task 2).
- Produces:
  ```ts
  // src/shared/onlineSession.ts
  export type DuelCrewSize = 2 | 3 | 4;
  //   OnlineAction: | { type: 'host'; mode: 'duel'; capacity: DuelCrewSize } | { type: 'start'; helmPlayer?: number }
  //   OnlinePreloadApi.host(room: { mode: 'duel'; capacity: DuelCrewSize } | { mode: 'sector'; capacity: number }); start(helmPlayer?: number)
  // src/main/network/onlineDuel.ts
  export interface DuelChoice { helmPlayer: number }
  export function validateDuelMirror(mirror: SessionMirror, capacity?: number): void;
  // src/renderer/src/ui/menuState.ts: MenuState.crew: DuelCrewSize (INITIAL_MENU 3); helmPlayerOf(status): number
  // src/renderer/src/ui/actions.ts: setCrew(crew: DuelCrewSize): void; host(crew?: DuelCrewSize): void   // defaults to menu().crew
  ```

- [ ] **Step 1: Write the failing tests**

`tests/onlineSessionContract.test.ts`:
- In the accepted list (L38) replace `{type:'host',mode:'duel'}` with `{type:'host',mode:'duel',capacity:2}, {type:'host',mode:'duel',capacity:3}, {type:'host',mode:'duel',capacity:4}`, and `{type:'start',helmPlayer:1}` with `{type:'start',helmPlayer:1}, {type:'start',helmPlayer:2}, {type:'start',helmPlayer:3}`.
- In the rejected list (L41) replace `{type:'host',mode:'duel',capacity:2}` with `{type:'host',mode:'duel'}, {type:'host',mode:'duel',capacity:1}, {type:'host',mode:'duel',capacity:5}, {type:'host',mode:'duel',capacity:2.5}, {type:'host',mode:'duel',capacity:3,extra:1}`, and `{type:'start',helmPlayer:2}` with `{type:'start',helmPlayer:4}, {type:'start',helmPlayer:1.5}, {type:'start',helmPlayer:-1}`.

`tests/onlineDuel.test.ts`:
- Replace `room` (L18-19) with:

```ts
function room(runId = '0000beef' + 'b'.repeat(24), capacity = 2): RoomSnapshot { return { roomId: 'a'.repeat(32), runId, joinCode: 'ABCDEFGH', capacity, hostSeatId: 0,
  hostGeneration: 1, rosterRevision: 1, phase: 'lobby', compatibility: duelCompatibility(), seats: Array.from({ length: capacity }, (_, seatId) => ({ seatId, seatGeneration: 1, occupied: true, connected: true, ready: false })) }; }
```

- In the first test replace `expect(() => duelInit({ ...snapshot, capacity: 3 })).toThrow();` with `expect(() => duelInit(room(undefined, 1))).toThrow();   // a crew is 2..4`. Rename the test `'a duel room is the Hound at duel schema version 2, round 0 seeded from its runId'`.
- After the first test add:

```ts
  it('a duel room holds a crew of 2, 3 or 4 (Sci-2 spec §4.5): the init carries it and the Helm player is a seat of it', () => {
    for (const crew of [2, 3, 4] as const) {
      const snapshot = room(undefined, crew);
      expect(duelInit(snapshot)).toMatchObject({ playerCount: crew, helmPlayer: 0 });
      expect(duelInit(snapshot, { helmPlayer: crew - 1 }).helmPlayer).toBe(crew - 1);
      expect(() => duelInit(snapshot, { helmPlayer: crew }), `helm ${crew} of ${crew}`).toThrow();
    }
  });
  it('validateDuelMirror refuses a mirror whose init is not the room\'s crew size; the adapter passes the capacity', () => {
    const snapshot = room(undefined, 3), init = duelInit(snapshot), live = liveDuel(init, hunterDown);
    live.tick(40);
    const bytes = new TextEncoder().encode(JSON.stringify(live.core.captureCheckpoint()));
    const mirror = { bytes, metadata: { version: 1 as const, protocolVersion: 2 as const, roomId: snapshot.roomId, runId: snapshot.runId, compatibility: snapshot.compatibility,
      hostGeneration: 1, checkpointSequence: 1, capturedTick: live.tickNow(), payloadSha256: createHash('sha256').update(bytes).digest('hex') } };
    expect(() => validateDuelMirror(mirror)).not.toThrow();
    expect(() => validateDuelMirror(mirror, 3)).not.toThrow();
    expect(() => validateDuelMirror(mirror, 2)).toThrow();
    expect(() => validateModeMirror(mirror, 3)).not.toThrow();
    expect(() => validateModeMirror(mirror, 4)).toThrow();
  });
```

- Replace the `'Host creates a two-seat duel room; ...'` test's first three lines (L68-71) with:

```ts
  it('Host creates a duel room for the crew size chosen; Join tries the duel compatibility only', async () => {
    const o = owner();
    expect(await o.session.dispatch({ type: 'host', mode: 'duel' } as never)).toEqual({ ok: false, code: 'invalid-action' });   // a duel host action carries its crew
    expect(await o.session.dispatch({ type: 'host', mode: 'duel', capacity: 3 })).toEqual({ ok: false, code: 'unavailable' });
    expect(o.create.mock.calls).toEqual([[duelCompatibility(), 3]]);
```

`tests/onlineBridge.test.ts` L88: replace `native.exposed.online.host()` with `native.exposed.online.host({ mode: 'duel', capacity: 3 })`.

`tests/uiActions.test.ts`: replace the `'Host creates the duel room (no capacity) ...'` test's name and its `actions.host(); expect(host).toHaveBeenCalledWith();` part with:

```ts
  it('Host creates the duel room for the menu\'s crew (default 3, Sci-2 spec §4.5) and enters the session; Join trims, upper-cases and deduplicates', async () => {
    const host = vi.fn(async () => ({ ok: true as const })), join = vi.fn(() => new Promise<never>(() => {}));
    const { store, deps, actions } = makeUi({ api: { host, join } });
    actions.setStatus({ ...idle, actions: ['host', 'join', 'reconnect'] });
    expect(store.getState().menu.crew).toBe(3);
    actions.openMultiplayer(); actions.openHost(); actions.host();
    expect(host).toHaveBeenCalledWith({ mode: 'duel', capacity: 3 }); expect(deps.online).toHaveBeenCalledOnce(); expect(store.getState().menu.page).toBe('session');
    await flush(); actions.setCrew(2); expect(store.getState().menu.crew).toBe(2);
    actions.host(); expect(host).toHaveBeenLastCalledWith({ mode: 'duel', capacity: 2 });
    await flush(); actions.host(4); expect(host).toHaveBeenLastCalledWith({ mode: 'duel', capacity: 4 });
    await flush(); actions.home(); expect(store.getState().menu.page).toBe('home');
```

(the test's Join lines that follow stay as they are).

`tests/menu.test.tsx` L74: replace `expect(host).toHaveBeenCalledWith();` with `expect(host).toHaveBeenCalledWith({ mode: 'duel', capacity: 3 });`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/onlineSessionContract.test.ts tests/onlineDuel.test.ts tests/uiActions.test.ts`
Expected: FAIL. `{type:'host',mode:'duel',capacity:3}` is not a valid action, `duelInit` refuses capacity 3, and `menu.crew` is undefined.

- [ ] **Step 3: The shared action**

`src/shared/onlineSession.ts`:
- After the `OnlineMode` type add:

```ts
/** A duel room's crew size (Sci-2 spec §2.1): the host picks 2, 3 or 4. */
export type DuelCrewSize = 2 | 3 | 4;
```

- Replace `| { type: 'host'; mode: 'duel' }` with `| { type: 'host'; mode: 'duel'; capacity: DuelCrewSize }`, and the `start` member with:

```ts
  /** `helmPlayer`: the duel host's own seat (spec §2; Sci-2: 0..3), 0 when absent; the sector ignores it. */
  | { type: 'start'; helmPlayer?: number }
```

- In `validateOnlineAction` replace the `case 'host':` line's duel branch `value.mode === 'duel' ? rtcKeys(value, ['type', 'mode'])` with:

```ts
    case 'host': return value.mode === 'duel' ? rtcKeys(value, ['type', 'mode', 'capacity']) && (value.capacity === 2 || value.capacity === 3 || value.capacity === 4)
```

  and the `case 'start':` line with:

```ts
    case 'start': return rtcKeys(value, ['type']) || rtcKeys(value, ['type', 'helmPlayer']) && seatId(value.helmPlayer);
```

- In `OnlinePreloadApi` replace the `host` doc and line with:

```ts
  /** Host a duel room for a crew of 2, 3 or 4 (Sci-2 spec §4.5); `{ mode: 'sector', capacity }` is the test-only sector entry (spec §10). */
  host(room: { mode: 'duel'; capacity: DuelCrewSize } | { mode: 'sector'; capacity: number }): Promise<OnlineResult>;
```

  and `start(helmPlayer?: 0 | 1): Promise<OnlineResult>;` with `start(helmPlayer?: number): Promise<OnlineResult>;`.

`src/preload/index.ts` L35:

```ts
    host: room => action(room?.mode === 'sector' ? { type: 'host', mode: 'sector', capacity: room.capacity } : { type: 'host', mode: 'duel', capacity: room?.capacity as DuelCrewSize }),
```

and add `type DuelCrewSize` to its `../shared/onlineSession` type imports. (An absent or bad capacity fails `validateOnlineAction` and returns `invalid-action`, as today's bad sector capacity does.)

- [ ] **Step 4: Main**

`src/main/network/onlineSession.ts` L421:

```ts
        const capacity = action.capacity;   // Sci-2 spec §4.5: a duel room holds the crew the host chose (2, 3 or 4)
```

`src/main/network/onlineDuel.ts`:
- Header line 2: after `the host's Helm choice` insert `, the crew size from the room's capacity (Sci-2 spec §4.5)`.
- Add `import { DUEL_CREW_MAX, DUEL_CREW_MIN, type DuelCrew } from '../../renderer/src/sim/duel/state';`.
- `export interface DuelChoice { helmPlayer: number }`
- Replace the body of `duelInit` after `const expected = duelCompatibility();` with:

```ts
  const crew = snapshot.capacity;
  if (!Number.isInteger(crew) || crew < DUEL_CREW_MIN || crew > DUEL_CREW_MAX || Object.entries(expected).some(([key, value]) => snapshot.compatibility[key as keyof RoomCompatibility] !== value)) throw onlineFault('incompatible');
  if (!Number.isInteger(choice.helmPlayer) || choice.helmPlayer < 0 || choice.helmPlayer >= crew) throw onlineFault('invalid-request');
  return validateDuelInit(DUEL_LAYOUT, { runId: snapshot.runId, layoutId: DUEL_LAYOUT.id, layoutHash: expected.layoutHash, simVersion: SIM_VERSION,
    contentDigest: expected.contentDigest, seed: duelRoomSeed(snapshot.runId, testSeed), playerCount: crew as DuelCrew, helmPlayer: choice.helmPlayer }, expected.contentDigest);
```

  (delete the old capacity, helmPlayer and return lines.)
- Replace `validateDuelMirror` with:

```ts
/** `capacity` (Sci-2 spec §4.5, as validateSectorMirror): the room's crew size, which the mirror's init must carry. */
export function validateDuelMirror(mirror: SessionMirror, capacity?: number): void {
  try {
    const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(mirror.bytes));
    const checkpoint = validateDuelCheckpoint(raw, __GAMEPLAY_CONTENT_DIGEST__, resolveLayout), m = mirror.metadata;
    if (capacity !== undefined && checkpoint.init.playerCount !== capacity || checkpoint.init.runId !== m.runId || checkpoint.snapshot.header.tick !== m.capturedTick
      || Object.entries(duelCompatibility()).some(([k, v]) => m.compatibility[k as keyof RoomCompatibility] !== v)) throw Error();
  } catch { throw onlineFault('save-invalid'); }
}
```

`src/main/network/onlineModes.ts`: L18 `init(snapshot: RoomSnapshot, choice?: { helmPlayer: number }): unknown;`; L33 `validateMirror: (mirror, capacity) => validateDuelMirror(mirror, capacity)`.

- [ ] **Step 5: The menu store and the action**

`src/renderer/src/ui/menuState.ts`:
- Change the type import to `import type { DuelCrewSize, OnlineErrorCode, OnlineStatus } from '../../../shared/onlineSession';`.
- In `MenuState` after `resetEpoch: number;` add:

```ts
  /** The duel crew the host form creates a room for (Sci-2 spec §5.3): 2, 3 or 4, default 3. */
  crew: DuelCrewSize;
```

- In `INITIAL_MENU` append `, crew: 3` before the closing `}`.
- Replace `helmPlayerOf` with:

```ts
export function helmPlayerOf(status: OnlineStatus): number {
  return status.ownSeat ?? 0;
}
```

`src/renderer/src/ui/actions.ts`:
- Change the type import to `import type { DuelCrewSize, OnlinePreloadApi, OnlineResult, OnlineStatus } from '../../../shared/onlineSession';`.
- Replace the `host()` doc and line with:

```ts
    /** The host form's crew choice (Sci-2 spec §5.3). */
    setCrew(crew: DuelCrewSize): void { setMenu({ crew }); },
    /** Multiplayer is the duel (H-2 spec §2): Host creates a duel room for `crew` players, the menu's choice by default (Sci-2 spec §4.5). */
    host(crew: DuelCrewSize = menu().crew): void { if (!menu().pending) void invoke(() => api().host({ mode: 'duel', capacity: crew })); },
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run tests/onlineSessionContract.test.ts tests/onlineDuel.test.ts tests/onlineBridge.test.ts tests/onlineIpc.test.ts tests/onlineCoordinator.test.ts tests/uiActions.test.ts tests/uiMenuState.test.ts tests/menu.test.tsx tests/onlineSector.test.ts tests/onlineMirrors.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 7: The full suite**

Run: `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: every test file PASS.

- [ ] **Step 8: Commit**

```bash
git add src/shared/onlineSession.ts src/preload/index.ts src/main/network/onlineSession.ts src/main/network/onlineDuel.ts src/main/network/onlineModes.ts src/renderer/src/ui/menuState.ts src/renderer/src/ui/actions.ts tests/onlineSessionContract.test.ts tests/onlineDuel.test.ts tests/onlineBridge.test.ts tests/uiActions.test.ts tests/menu.test.tsx
git commit -m "feat(sci-2): the duel host action carries the crew (2, 3 or 4) to the room capacity and the init; Start's Helm player is any seat; the mirror checks the crew; the menu store's crew (default 3)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Seat ids 0..n−1 in the app, the sit tracker at n, the interior label pools and the SCIENCE badge

**Files:**
- Modify: `src/renderer/src/app/duel/onlineSource.ts:91`, `src/renderer/src/app/duel/onlineDuel.ts:157,313`, `src/renderer/src/app/duel/scene.ts:59,221-222`, `src/renderer/src/render/duel/consoleModel.ts:41,68,80`, `src/renderer/src/render/duel/sitModel.ts:26-35`, `src/renderer/src/render/duel/readoutModel.ts:55`, `src/renderer/src/render/duel/situationModel.ts:21,107`, `src/renderer/src/render/duel/interiorView.ts:71,83`, `src/renderer/src/render/duel/interiorModel.ts:70-86`
- Test updates: `tests/stationBadges.test.ts`
- Create: `tests/crewSeats.test.ts`

**Interfaces:**
- Consumes: Task 3's crew snapshots (an online replica of a crew of 3 loads); `seatOf(d, pid)` (`app/duel/controls.ts:13`); `standAtStation` (Task 2); `drawIcon` accepts `'science'` (`render/roomIcons.ts:27`).
- Produces:
  ```ts
  // render/duel/sitModel.ts
  export interface SitTracker { seats: (SitSeat | null)[] }
  export function createSitTracker(): SitTracker;   // empty: it grows to the crew on the first frame
  export function trackSit(tr: SitTracker, active: number, seats: readonly (SitSeat | null)[]): boolean;
  // render/duel/consoleModel.ts: ConsoleModelInput.me: number; consoleStation(d: DuelState, me: number)
  // render/duel/interiorModel.ts: StationBadge.kind: 'navigation' | 'weapons' | 'science' | 'medbay'
  // app/duel/onlineSource.ts: OnlineDuelSourceDeps.seat: number; scene's DuelViewSource.active(): number; ReadoutInput.active: number
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/crewSeats.test.ts`:

```ts
// Sci-2 (spec 2026-11-18-sci-2-crew-of-four §5.1, §5.4, §9 UI): seat ids 0..n−1 in the app. A player in seat 2 has its own
// view and console station online, and its sit at Weapons is a sit (the card shows); the online source drives seat 2.
import { describe, expect, it } from 'vitest';
import { createOnlineDuelSource } from '../src/renderer/src/app/duel/onlineSource';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { consoleModel, consoleStation } from '../src/renderer/src/render/duel/consoleModel';
import { createSitTracker, resetSits, SIT_CARDS, sitCard, trackSit } from '../src/renderer/src/render/duel/sitModel';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { standAtStation } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
/** A crew-3 Cutter duel with player 2 sat at Weapons. */
function seat2AtWeapons(): DuelState {
  const d = createDuel(CUTTER, 5, 0, 3);
  standAtStation(d, 2, d.weapons);
  stepDuelTick(d, { held: [], commands: [{ runId: 'duel', id: { player: 2, sequence: 1 }, requestedTick: 0, command: { kind: 'sit', station: d.weapons } }] });
  return d;
}

describe('the sit tracker at n (spec §5.1)', () => {
  it('seat 2 sitting at Weapons is a sit, so the card shows; an unchanged seat is not', () => {
    resetSits();
    const tr = createSitTracker();
    expect(trackSit(tr, 2, [null, null, null])).toBe(false);
    expect(trackSit(tr, 2, [null, null, 'weapons'])).toBe(true);
    expect(trackSit(tr, 2, [null, null, 'weapons'])).toBe(false);
    expect(trackSit(tr, 0, ['helm', null, 'weapons'])).toBe(true);    // player 0's own seat went from none to the Helm: a sit
    expect(sitCard('weapons', 0, false)).toMatchObject({ seat: 'weapons', title: SIT_CARDS.weapons.title });
  });
});

describe('seat 2 online (spec §5.1)', () => {
  it('the console station and the online source follow seat 2', () => {
    const d = seat2AtWeapons();
    let replica: DuelState | null = null;
    try {
      expect(d.interior.stations.occupant[d.weapons]).toBe(2);
      expect(consoleStation(d, 2)).toBe('weapons');
      expect(consoleModel({ duel: d, me: 2, mode: 'online', hidden: false, held: NO_HELD_FLAGS, overlay: null })!.station).toBe('weapons');
      replica = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
      const client = { state: () => replica, publication: () => ({ publicationSequence: 1, tick: d.interior.tick, phase: 'running' }) };
      const source = createOnlineDuelSource({ client: client as never, seat: 2, now: () => 0, viewport: { w: 1280, h: 720 } });
      source.frame(1 / 60, null, null);
      expect([source.active(), source.view()]).toEqual([2, 'weapons']);
    } finally { disposeDuel(d); if (replica) disposeDuel(replica); }
  });
});
```

`tests/stationBadges.test.ts`:
- Rename the first test `'Helm, Weapons, Science and Medbay, each at its console tile, all normal on a fresh duel'` and replace its expectations with:

```ts
      expect(bs.map((b) => [b.kind, b.label, b.tint])).toEqual([['navigation', 'HELM', 'normal'], ['weapons', 'WEAPONS', 'normal'], ['science', 'SCIENCE', 'normal'], ['medbay', 'MEDBAY', 'normal']]);
      expect(bs[0]).toMatchObject({ station: d.nav, ...centre(20, 7) });
      expect(bs[1]).toMatchObject({ station: d.weapons, ...centre(19, 5) });
      expect(bs[2]).toMatchObject({ station: d.science, ...centre(9, 5) });
      expect(bs[3]).toMatchObject({ station: d.interior.derived.stationOfKind[StationKind.Medbay], ...centre(8, 1) });
```

- In the second test replace every four-badge tint expectation: `['normal', 'normal', 'normal']` → `['normal', 'normal', 'normal', 'normal']`, `['offline', 'normal', 'normal']` → `['offline', 'normal', 'normal', 'normal']`, `['normal', 'offline', 'normal']` → `['normal', 'offline', 'normal', 'normal']`, and `stationBadges(d)[2]!.tint` → `stationBadges(d)[3]!.tint`. Rename it `'Helm red at Engines 2 and Weapons red at Weapons 2, not at 1; Science always normal; the Medbay faint while it is offline'`.
- Add a third test (and `import cutter from '../src/renderer/src/sim/ship/cutter.json';`):

```ts
  it('SCIENCE on the Cutter too (it has a Science console, Sci-2 Decision 7), and no SCIENCE badge without one', () => {
    const d = createDuel(parseShip(cutter), 1);
    try {
      expect(stationBadges(d).map((b) => b.label)).toEqual(['HELM', 'WEAPONS', 'SCIENCE', 'MEDBAY']);
      d.science = -1;
      expect(stationBadges(d).map((b) => b.label)).toEqual(['HELM', 'WEAPONS', 'MEDBAY']);
    } finally { disposeDuel(d); }
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/crewSeats.test.ts tests/stationBadges.test.ts`
Expected: FAIL. `stationBadges` has no SCIENCE badge, and `trackSit` ignores index 2 (`tr.seats = [seats[0], seats[1]]`).

- [ ] **Step 3: The sit tracker**

`src/renderer/src/render/duel/sitModel.ts`: replace L26-35 (the `SitTracker` comment through `trackSit`) with:

```ts
/** Each character's Helm or Weapons seat last frame (null on foot or at Science), one per player of the crew (Sci-2 spec
 *  §5.1), so a sit is told from a Tab. Empty until the first frame. */
export interface SitTracker { seats: (SitSeat | null)[] }
export function createSitTracker(): SitTracker { return { seats: [] }; }
/** One frame (Feel-i review): true when the `active` character has just sat down at the Helm or Weapons, its own seat going
 *  from none to a console. A Tab to a character already seated is no sit (no card, no auto-frame). Records every seat. */
export function trackSit(tr: SitTracker, active: number, seats: readonly (SitSeat | null)[]): boolean {
  const sat = (tr.seats[active] ?? null) === null && (seats[active] ?? null) !== null;
  tr.seats = seats.slice();
  return sat;
}
```

`src/renderer/src/app/duel/scene.ts`:
- L59: `active(): number;`
- Replace L221-222 with:

```ts
      const sitOf = (pid: number): SitSeat | null => { const s = consoleStation(d, pid); return s === 'helm' || s === 'weapons' ? s : null; };
      const me = source.active(), sitSeat = sitOf(me), sat = trackSit(sits, me, Array.from({ length: d.interior.playerCount }, (_, pid) => sitOf(pid)));   // Sci-2 spec §5.1: every seat of the crew
```

- [ ] **Step 4: Seat types**

`src/renderer/src/render/duel/consoleModel.ts`:
- L41: `duel: DuelState; me: number; mode: 'single' | 'online'; hidden: boolean; held: HeldFlags; overlay: MapOverlayView | null;`
- L68: `export function consoleStation(d: DuelState, me: number): ConsoleStation {`
- L80: `otherSeat: i.mode === 'single' ? seatOf(d, i.me === 0 ? 1 : 0) : 'standing', mode: i.mode });   // the Tab target: Single player's other character only`

`src/renderer/src/render/duel/readoutModel.ts` L55: `active: number;`

`src/renderer/src/app/duel/onlineSource.ts` L91: `export interface OnlineDuelSourceDeps { client: ConfirmedDuel; seat: number; now(): number; viewport: Viewport }`

`src/renderer/src/app/duel/onlineDuel.ts`: L157 `seat: descriptor.seatId, helmPlayer: d.helmPlayer, ...` (drop `as 0 | 1`); L313 `seat: next.seatId,` (drop `as 0 | 1`).

`src/renderer/src/render/duel/situationModel.ts` L21 and L107: replace `d.present[pid as 0 | 1]` with `d.present[pid]`.

- [ ] **Step 5: The interior label pools**

`src/renderer/src/render/duel/interiorView.ts`: add `import { DUEL_CREW_MAX } from '../../sim/duel/state';` and replace `Array.from({ length: 2 }, () => {` in `crewLabels` (L71) and in `revivedLabels` (L83) with `Array.from({ length: DUEL_CREW_MAX }, () => {   // one per player of the largest crew (Sci-2 spec §7)`.

- [ ] **Step 6: The SCIENCE badge**

`src/renderer/src/render/duel/interiorModel.ts`: replace L70-86 (the `StationBadge` comment through `stationBadges`) with:

```ts
/** A working station's badge (start-aboard spec §2): the glyph kind, its label, the console tile's centre in ship pixels, and
 *  its tint: `offline` (red) when its system is off, `faint` when it does not work now, else `normal`. */
export interface StationBadge { station: number; kind: 'navigation' | 'weapons' | 'science' | 'medbay'; label: string; x: number; y: number; tint: 'normal' | 'offline' | 'faint' }

/** The Helm, Weapons, Science and Medbay badges, in that order (start-aboard spec §2; Sci-2 spec §5.4): Helm red at
 *  Engines 2, Weapons red at Weapons 2, Science always normal, the Medbay faint while it is not online. A layout without a
 *  Science or Medbay console has no badge for it. */
export function stationBadges(d: DuelState): StationBadge[] {
  const st = d.interior, w = st.derived.width, rooms = d.tactical.systems[0].rooms;
  const at = (station: number): { x: number; y: number } => { const t = st.derived.stationTile[station]!, tx = t % w; return { x: (tx + 0.5) * TILE_PX, y: ((t - tx) / w + 0.5) * TILE_PX }; };
  const out: StationBadge[] = [
    { station: d.nav, kind: 'navigation', label: 'HELM', ...at(d.nav), tint: rooms[Room.Engines] >= 2 ? 'offline' : 'normal' },
    { station: d.weapons, kind: 'weapons', label: 'WEAPONS', ...at(d.weapons), tint: rooms[Room.Weapons] >= 2 ? 'offline' : 'normal' }
  ];
  if (d.science >= 0) out.push({ station: d.science, kind: 'science', label: 'SCIENCE', ...at(d.science), tint: 'normal' });
  const mb = st.derived.stationOfKind[StationKind.Medbay]!;
  if (mb >= 0) out.push({ station: mb, kind: 'medbay', label: 'MEDBAY', ...at(mb), tint: medbayOnline(d) ? 'normal' : 'faint' });
  return out;
}
```

(`interiorView.ts` builds a plate, a glyph and a label per badge once per layout, so the fourth badge needs no view change.)

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npx vitest run tests/crewSeats.test.ts tests/stationBadges.test.ts tests/feelPresentation.test.ts tests/duelConsoleModel.test.ts tests/duelOnlineView.test.ts tests/duelHealthView.test.ts tests/duelModeAudio.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 8: The full suite**

Run: `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: every test file PASS.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/app/duel/onlineSource.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/scene.ts src/renderer/src/render/duel/consoleModel.ts src/renderer/src/render/duel/sitModel.ts src/renderer/src/render/duel/readoutModel.ts src/renderer/src/render/duel/situationModel.ts src/renderer/src/render/duel/interiorView.ts src/renderer/src/render/duel/interiorModel.ts tests/crewSeats.test.ts tests/stationBadges.test.ts
git commit -m "feat(sci-2): seats 0..n-1 in the app (console, sit card and auto-frame for seats 2 and 3), the interior label pools at four, and the SCIENCE badge" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The crew list readout

**Files:**
- Modify: `src/renderer/src/render/duel/readoutModel.ts` (`OtherStatus` and `ReadoutInput.other` removed; `crewStatus`, `crewRows`; `READOUT_ROWS` 23), `src/renderer/src/app/duel/runtime.ts:24,184-187,432-438` (`otherStatus` removed), `src/renderer/src/app/duel/onlineSource.ts:13,97,118,125,145-152` (`otherStatus` removed), `src/renderer/src/app/duel/scene.ts:19,61,271`
- Test updates: `tests/crtReadout.test.ts`, `tests/duelConsoleModel.test.ts`, `tests/duelFireView.test.ts`, `tests/duelHealthView.test.ts`, `tests/duelReadout.test.ts`, `tests/duelOnlineView.test.ts`, `tests/duelRuntime.test.ts`, `tests/scienceSeat.test.ts`, `tests/scienceConsole.test.ts`
- Create: `tests/crewList.test.ts`

**Interfaces:**
- Consumes: `seatOf`, `repairInReach` (`app/duel/controls.ts:13,21`); Task 6's `ReadoutInput.active: number`; Task 3's crew snapshots.
- Produces:
  ```ts
  // render/duel/readoutModel.ts
  export type CrewStatus = 'DOWNED' | 'AWAY' | 'HELM' | 'WEAPONS' | 'SCIENCE' | 'REPAIRING' | 'ON FOOT';
  export function crewStatus(d: DuelState, pid: number): CrewStatus;
  export function crewRows(d: DuelState, me: number): ReadoutRow[];   // one row per other player, in player order
  export interface ReadoutInput { duel: DuelState; mode: ReadoutMode; active: number; console?: boolean }
  export const READOUT_ROWS = 23;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/crewList.test.ts`:

```ts
// Sci-2 (spec 2026-11-18-sci-2-crew-of-four §5.2, §9 UI): the crew list. One row per other player, `P<k>  <status>`, the
// status by precedence DOWNED, AWAY, the console sat at, REPAIRING, ON FOOT; derived from the duel state and `me` alone,
// so Single player and every online seat read the same list. READOUT_ROWS holds the longest list at a crew of four.
import { describe, expect, it } from 'vitest';
import { Life, LifeState, Position } from '../src/renderer/src/sim/components';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { sitDown } from '../src/renderer/src/sim/stations';
import { placeMissile } from '../src/renderer/src/sim/tactical/state';
import { crewRows, crewStatus, readoutRows, READOUT_ROWS } from '../src/renderer/src/render/duel/readoutModel';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const pairs = (rows: { label: string; value: string }[]) => rows.map((r) => [r.label, r.value]);

describe('the crew list (spec §5.2)', () => {
  it('a crew of two (Single player): the one other character', () => {
    const d = createDuel(CUTTER, 5);
    try {
      expect(pairs(crewRows(d, 0))).toEqual([['P2', 'ON FOOT']]);
      sitDown(d.interior, 0, d.nav);
      expect(pairs(crewRows(d, 1))).toEqual([['P1', 'HELM']]);
    } finally { disposeDuel(d); }
  });
  it('a crew of three: every other player in order, an empty seat AWAY', () => {
    const d = createDuel(CUTTER, 5, 0, 3);
    try {
      sitDown(d.interior, 0, d.nav); d.present[2] = false;
      expect(pairs(crewRows(d, 1))).toEqual([['P1', 'HELM'], ['P3', 'AWAY']]);
      expect(pairs(crewRows(d, 2))).toEqual([['P1', 'HELM'], ['P2', 'ON FOOT']]);
    } finally { disposeDuel(d); }
  });
  it('a crew of four: the precedence DOWNED, AWAY, console, REPAIRING, ON FOOT', () => {
    const d = createDuel(CUTTER, 5, 0, 4);
    try {
      sitDown(d.interior, 1, d.weapons); sitDown(d.interior, 2, d.science);
      expect(pairs(crewRows(d, 0))).toEqual([['P2', 'WEAPONS'], ['P3', 'SCIENCE'], ['P4', 'ON FOOT']]);
      d.present[1] = false;
      expect(crewStatus(d, 1)).toBe('AWAY');                           // a seated away character reads AWAY
      Life.state[d.interior.crew[1]!] = LifeState.Downed;
      expect(crewStatus(d, 1)).toBe('DOWNED');                         // DOWNED before AWAY
      const p = d.points[0]!, w = d.interior.derived.width, e3 = d.interior.crew[3]!;
      Position.x[e3] = (p.tile % w) + 0.5; Position.y[e3] = Math.floor(p.tile / w) + 0.5;
      expect(crewStatus(d, 3)).toBe('ON FOOT');                        // at the point, nothing to repair
      d.tactical.systems[0].rooms[p.tacticalRoom] = 1;
      expect(crewStatus(d, 3)).toBe('ON FOOT');                        // in reach of a point that needs work, no work yet
      d.repair[p.tacticalRoom] = 1;
      expect(crewStatus(d, 3)).toBe('REPAIRING');                      // the repair has started
      expect(crewRows(d, 0).find((r) => r.label === 'P2')).toMatchObject({ value: 'DOWNED', emphasis: 'alert' });
    } finally { disposeDuel(d); }
  });
  it('an online replica reads the same list (seat 2 of a crew of three)', () => {
    const d = createDuel(CUTTER, 5, 0, 3);
    try {
      sitDown(d.interior, 0, d.nav);
      const r = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
      try { expect(pairs(crewRows(r, 2))).toEqual([['P1', 'HELM'], ['P2', 'ON FOOT']]); } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
  it('the readout carries the list after HEALTH; a crew of four is two rows longer than two and fits READOUT_ROWS (23)', () => {
    expect(READOUT_ROWS).toBe(23);
    const two = createDuel(CUTTER, 5), four = createDuel(CUTTER, 5, 0, 4);
    try {
      for (const d of [two, four]) placeMissile(d.tactical, 1, { ...d.tactical.ships[0], heading: 0, headingAcc: 0, age: 0 });   // TORPEDO INBOUND: the longest interior list
      const a = readoutRows({ duel: two, mode: 'interior', active: 0 }), b = readoutRows({ duel: four, mode: 'interior', active: 0 });
      expect(b.length).toBe(a.length + 2);
      expect(b.length).toBeLessThanOrEqual(READOUT_ROWS);
      const h = b.findIndex((r) => r.label === 'HEALTH');
      expect(b.slice(h + 1, h + 4).map((r) => r.label)).toEqual(['P2', 'P3', 'P4']);
      expect(b.map((r) => r.label)).not.toContain('OTHER');
    } finally { disposeDuel(two); disposeDuel(four); }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/crewList.test.ts`
Expected: FAIL. `crewRows` and `crewStatus` are not exported from `render/duel/readoutModel`.

- [ ] **Step 3: The readout**

`src/renderer/src/render/duel/readoutModel.ts`:
- Header lines 1-2: replace `the other character's status` with `the crew list (Sci-2 spec §5.2)`.
- Add `import { repairInReach, seatOf } from '../../app/duel/controls';` (as `consoleModel.ts` does).
- Replace `export type OtherStatus = ...;` with:

```ts
/** A crew row's status (Sci-2 spec §5.2), by precedence: DOWNED, AWAY, the console sat at, REPAIRING, ON FOOT. */
export type CrewStatus = 'DOWNED' | 'AWAY' | 'HELM' | 'WEAPONS' | 'SCIENCE' | 'REPAIRING' | 'ON FOOT';
```

- In `ReadoutInput` replace

```ts
  /** The player the keyboard drives; the other's status is shown. */
  active: number;
  other: OtherStatus;
```

with

```ts
  /** The player the keyboard drives (this seat online); every other player is a row of the crew list. */
  active: number;
```

- After `healthRow` add:

```ts
/** Player pid's status (Sci-2 spec §5.2), from the duel state alone: DOWNED; AWAY (a seated away character too); HELM,
 *  WEAPONS or SCIENCE, the console it sits at; REPAIRING, standing in reach of a repair point whose work has started
 *  (repairInReach plus progress, Sci-2 Decision 5); else ON FOOT. */
export function crewStatus(d: DuelState, pid: number): CrewStatus {
  if (Life.state[d.interior.crew[pid]!] === LifeState.Downed) return 'DOWNED';
  if (!d.present[pid]) return 'AWAY';
  const s = seatOf(d, pid);
  if (s !== 'standing') return s === 'helm' ? 'HELM' : s === 'weapons' ? 'WEAPONS' : 'SCIENCE';
  const r = repairInReach(d, pid);
  if (r < 0) return 'ON FOOT';
  const p = d.points.find((q) => q.tacticalRoom === r);
  return d.repair[r]! > 0 || (p !== undefined && d.interior.rooms.fireRepair[p.room]! > 0) ? 'REPAIRING' : 'ON FOOT';
}

/** The crew list (Sci-2 spec §5.2): one row per other player in player order, `P<k>` (1-based) and its status; DOWNED
 *  alert, AWAY dim. */
export function crewRows(d: DuelState, me: number): ReadoutRow[] {
  const out: ReadoutRow[] = [];
  for (let pid = 0; pid < d.interior.playerCount; pid++) {
    if (pid === me) continue;
    const s = crewStatus(d, pid);
    out.push(em(row(`P${pid + 1}`, s, DIM, s === 'DOWNED' ? WARN : s === 'AWAY' ? DIM : TEXT), s === 'DOWNED' ? 'alert' : null));
  }
  return out;
}
```

- In `readoutRows` replace `const d = input.duel, t = d.tactical, target = targetOf(t, 0), other = input.active === 0 ? 1 : 0;` with `const d = input.duel, t = d.tactical, target = targetOf(t, 0);`, and replace

```ts
  rows.push(healthRow(d, input.active));
  rows.push(row('OTHER', d.present[other] ? 'PRESENT' : 'AWAY', DIM, d.present[other] ? TEXT : DIM));
  rows.push(row('', input.other));
```

with

```ts
  rows.push(healthRow(d, input.active));
  rows.push(...crewRows(d, input.active));   // Sci-2 spec §5.2: one row per other player
```

- In the interior block replace `const crewed = (pid: number): boolean => pid >= 0 && d.present[pid as 0 | 1];` with `const crewed = (pid: number): boolean => pid >= 0 && !!d.present[pid];`.
- Replace the last two lines with:

```ts
/** Rows the readout pool holds (Sci-2 spec §5.2): the longest list (standing, Helm and Weapons empty, a torpedo inbound,
 *  a crew of four: three crew rows) is 22, with one to spare. */
export const READOUT_ROWS = 23;
```

- [ ] **Step 4: The sources and the scene**

`src/renderer/src/app/duel/runtime.ts`: delete `import type { OtherStatus } from '../../render/duel/readoutModel';` (L24); in `DuelRuntime` delete the two lines `/** The other character's status for the readouts (spec §7 item 9). */` and `otherStatus(): OtherStatus;`; delete the `otherStatus() { ... },` member (L432-438); change L9 to `import { Position } from '../../sim/components';` if `Life` and `LifeState` have no other use in the file (`git grep -n "Life" -- src/renderer/src/app/duel/runtime.ts` after the deletion).

`src/renderer/src/app/duel/onlineSource.ts`: delete `import type { OtherStatus } from '../../render/duel/readoutModel';` (L13) and the `otherStatus(): OtherStatus { ... },` member (L145-152). `prevRepair`, `workOf` and `latest.repair` then have no reader: delete `prevRepair` from the `let` at L97 (keep `events` and `sentHeld`), the line `prevRepair = latest ? latest.repair : workOf(d);` (L118), `repair: number[]` from `latest`'s type, `, repair: workOf(d)` from L125, and `workOf` (L43-…) if `git grep -n "workOf" -- src/renderer/src/app/duel/onlineSource.ts` shows no other use. Drop `Life, LifeState` and `repairInReach` from the imports if they have no other use in the file.

`src/renderer/src/app/duel/scene.ts`: L19 `import { readoutHelp, readoutRows } from '../../render/duel/readoutModel';`; delete `otherStatus(): OtherStatus;` (L61); L271:

```ts
        readout: { rows: readoutRows({ duel: d, mode: view, active: source.active(), console: onConsole }), help: onConsole ? [] : readoutHelp(view) },
```

- [ ] **Step 5: The existing readout tests**

Remove the `other:` argument from every `readoutRows` call in the tests:

```bash
sed -i -E "s/, other: '[A-Z ]+'//g" tests/crtReadout.test.ts tests/duelConsoleModel.test.ts tests/duelFireView.test.ts tests/duelHealthView.test.ts tests/duelReadout.test.ts tests/scienceConsole.test.ts tests/scienceSeat.test.ts
```

Then, by hand:
- `rt.otherStatus()` (plan review R1-F3): in `tests/duelRuntime.test.ts` L79, L107, L120, L175 and `tests/scienceSeat.test.ts` L88 replace `rt.otherStatus()` with `crewStatus(rt.duel, 1)` (the other player; use the pid the test's other character has if it is not 1) and map the expected value: `'STANDING BY'` → `'AWAY'`, `'AT HELM'` → `'HELM'`, `'AT WEAPONS'` → `'WEAPONS'`, `'AT SCIENCE'` → `'SCIENCE'`, `'WALKING'` → `'ON FOOT'`; where the call is an element of an array literal (L107, L120), replace that element. Add `import { crewStatus } from '../src/renderer/src/render/duel/readoutModel';` (or extend the existing import) to both files. Check after the sed that `git grep -n "other:" -- tests/scienceConsole.test.ts tests/scienceSeat.test.ts` shows no `readoutRows` argument left; remove any multi-word one the sed missed by hand.
- `tests/crtReadout.test.ts` L22 and L33: replace `['OTHER', '-'], ['AT WEAPONS', '-']` with `['P2', '-']`; L51-52: replace `marks(rows).slice(14)` with `marks(rows).slice(13)`.
- `tests/duelReadout.test.ts`: in the first test replace `['HEALTH', '100/100'], ['OTHER', 'PRESENT'], ['', 'AT WEAPONS']` with `['HEALTH', '100/100'], ['P2', 'ON FOOT']`; in the level test replace `expect(rows.length).toBe(14);` with `expect(rows.length).toBe(13);`; in the standing test replace `['HEALTH', '100/100'], ['OTHER', 'AWAY'], ['', 'AT WEAPONS'], ['OUTSIDE', '']` with `['HEALTH', '100/100'], ['P2', 'AWAY'], ['OUTSIDE', '']`; in `'every row and help line fits the 220-px column'` replace the double loop header and its first line

```ts
    for (const mode of ['helm', 'weapons', 'interior'] as ReadoutMode[]) for (const other of ['AT HELM', 'AT WEAPONS', 'WALKING', 'REPAIRING'] as const) {
      const rows = readoutRows({ duel: d, mode, active: 0, other });
```

  with

```ts
    for (const mode of ['helm', 'weapons', 'interior'] as ReadoutMode[]) {
      const rows = readoutRows({ duel: d, mode, active: 0 });
```

- `tests/duelHealthView.test.ts`: replace `expect(labels.slice(-3)).toEqual([['HEALTH', 'DOWNED'], ['OTHER', 'PRESENT'], ['', 'DOWNED']]);` with `expect(labels.slice(-2)).toEqual([['HEALTH', 'DOWNED'], ['P2', 'WEAPONS']]);`; replace the two tests `'the local runtime shows the other character DOWNED'` and `'the online source shows the other character DOWNED'` (L64-89) with:

```ts
  it('the crew list shows the other character DOWNED, on the duel and on an online replica (Sci-2 spec §5.2)', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      expect(crewStatus(d, 1)).toBe('WEAPONS');
      const e = d.interior.crew[1]!;
      Seated.station[e] = -1; d.interior.stations.occupant[d.weapons] = -1; Health.cur[e] = 0; Life.state[e] = LifeState.Downed;
      expect(crewStatus(d, 1)).toBe('DOWNED');
      const replica = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
      try { expect(crewRows(replica, 0).map((r) => [r.label, r.value])).toEqual([['P2', 'DOWNED']]); } finally { disposeDuel(replica); }
    } finally { disposeDuel(d); }
  });
```

  and add `crewRows, crewStatus` to its `readoutModel` import; its header comment's `OTHER DOWNED on the local and online sources` becomes `the crew list's DOWNED`.
- `tests/duelOnlineView.test.ts`: delete the test `'shows the other character REPAIRING only while a repair it stands at has progressed since the last publication'` (the crew list's REPAIRING is covered by `tests/crewList.test.ts`); in the header comment delete `the\n// online REPAIRING status,`.

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run tests/crewList.test.ts tests/crtReadout.test.ts tests/duelConsoleModel.test.ts tests/duelFireView.test.ts tests/duelHealthView.test.ts tests/duelReadout.test.ts tests/duelOnlineView.test.ts tests/duelRuntime.test.ts tests/scienceSeat.test.ts tests/scienceConsole.test.ts tests/crtBezel.test.ts tests/crewSeats.test.ts`
Expected: PASS. If `tests/crtBezel.test.ts` fails on the readout panel's height at 23 rows, stop and report the overflow (the panel's height is derived from the row count; nothing else depends on `READOUT_ROWS`, Decision 6).

Run: `npx tsc -b` — Expected: no errors. Run `git grep -n "OtherStatus\|otherStatus" -- src tests` — Expected: no output.

- [ ] **Step 7: The full suite**

Run: `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: every test file PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/render/duel/readoutModel.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/onlineSource.ts src/renderer/src/app/duel/scene.ts tests/crewList.test.ts tests/crtReadout.test.ts tests/duelConsoleModel.test.ts tests/duelFireView.test.ts tests/duelHealthView.test.ts tests/duelReadout.test.ts tests/duelOnlineView.test.ts tests/duelRuntime.test.ts tests/scienceSeat.test.ts tests/scienceConsole.test.ts
git commit -m "feat(sci-2): the crew list (one P<k> row per other player: DOWNED, AWAY, HELM/WEAPONS/SCIENCE, REPAIRING, ON FOOT) replaces OTHER; READOUT_ROWS 23" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The lobby: duel seat labels and the CREW 2 3 4 choice

**Files:**
- Modify: `src/renderer/src/ui/menuState.ts:81-86` (`seatLabel`), `src/renderer/src/ui/menu/HostForm.tsx`, `src/renderer/src/ui/menu/MenuButton.tsx`, `src/renderer/src/ui/menu/styles.ts`
- Test updates: `tests/uiMenuState.test.ts`, `tests/menu.test.tsx`

**Interfaces:**
- Consumes: Task 5's `MenuState.crew`, `actions.setCrew(crew)`, `actions.host(crew)`, `DuelCrewSize`.
- Produces: `MenuButton` gains `pressed?: boolean` (`aria-pressed`, the `BUTTON_ON` look); test ids `crew-2`, `crew-3`, `crew-4`, `crew-choice`; `seatLabel(status, pid)` duel labels `EMPTY`, `JOINED`, `READY`, `DISCONNECTED`.

- [ ] **Step 1: Write the failing tests**

`tests/uiMenuState.test.ts`: after `'labels seats and gates Start on ready, connected humans'` add:

```ts
  it('labels duel seats EMPTY, JOINED, READY and DISCONNECTED, and allows Start with an empty seat (Sci-2 spec §5.3)', () => {
    const seats = [{ seatId: 0, occupied: true, connected: true, ready: true }, { seatId: 1, occupied: true, connected: true, ready: false },
      { seatId: 2, occupied: true, connected: false, ready: false }, { seatId: 3, occupied: false, connected: false, ready: false }];
    const lobby: OnlineStatus = { ...idle, phase: 'lobby', role: 'host', ownSeat: 0, actions: ['start', 'ready'],
      snapshot: { capacity: 4, joinCode: 'ABCDEFGH', seats, compatibility: { modeId: 'duel' } } as never };
    expect([0, 1, 2, 3].map((pid) => seatLabel(lobby, pid))).toEqual([' P1: READY ', ' P2: JOINED ', ' P3: DISCONNECTED ', ' P4: EMPTY ']);
    expect(startAllowed(view({}, lobby))).toBe(false);   // a claimed seat must be connected and ready
    const ready = { ...lobby, snapshot: { ...lobby.snapshot!, seats: [seats[0]!, { ...seats[1]!, ready: true }, { seatId: 2, occupied: false, connected: false, ready: false }, seats[3]!] } } as OnlineStatus;
    expect(startAllowed(view({}, ready))).toBe(true);    // empty seats do not hold up the start
  });
```

`tests/menu.test.tsx`: replace the test `'offers the duel Host form (no capacity) and submits it'` with:

```tsx
  it('offers the duel Host form with the CREW choice (2 3 4, default 3) and submits the crew picked', () => {
    const host = vi.fn(async () => ({ ok: true as const })), join = vi.fn(() => new Promise<never>(() => {}));
    const { actions } = renderUi({ api: { host, join } });
    act(() => actions.setStatus({ ...idle, actions: ['host', 'join', 'reconnect'] }));
    click('multiplayer'); click('host');
    expect(screen.queryByTestId('capacity')).toBeNull(); expect(screen.getByTestId('host-form').querySelector('select')).toBeNull();
    expect(text('host-note')).toBe('A crew of two, three or four: Helm, Weapons and Science; a fourth works on foot. Empty seats stand idle aboard.');
    expect(text('crew-choice')).toContain('CREW');
    const pressed = () => ['crew-2', 'crew-3', 'crew-4'].map((id) => screen.getByTestId(id).getAttribute('aria-pressed'));
    expect(pressed()).toEqual(['false', 'true', 'false']);
    expect(document.activeElement).toBe(screen.getByTestId('create-room'));
    click('crew-2'); expect(pressed()).toEqual(['true', 'false', 'false']); expect(host).not.toHaveBeenCalled();   // a crew button never submits
    click('crew-4'); expect(pressed()).toEqual(['false', 'false', 'true']);
    fireEvent.submit(screen.getByTestId('host-form')); expect(host).toHaveBeenCalledWith({ mode: 'duel', capacity: 4 });
  });
```

and, in `"a duel lobby has no Swap seats ..."`, after `act(() => actions.setStatus(hostLobby));` add `expect(text('roster')).toContain('P1: READY'); expect(text('roster')).toContain('P2: READY');`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/uiMenuState.test.ts tests/menu.test.tsx`
Expected: FAIL. Duel seats read `Ready`/`Bot`, and there is no `crew-choice`.

- [ ] **Step 3: The labels**

`src/renderer/src/ui/menuState.ts`: replace `seatLabel` with:

```ts
/** A lobby seat's line. A duel seat (Sci-2 spec §5.3): EMPTY (no one has claimed it), JOINED (connected, not ready), READY,
 *  DISCONNECTED (claimed, not connected). The sector keeps its Bot labels. */
export function seatLabel(status: OnlineStatus, pid: number): string {
  const seat = status.snapshot?.seats.find((s) => s.seatId === pid);
  if (isDuel(status)) return ` P${pid + 1}: ${!seat?.occupied ? 'EMPTY' : !seat.connected ? 'DISCONNECTED' : seat.ready ? 'READY' : 'JOINED'} `;
  return ` P${pid + 1}: ${!seat?.occupied ? 'Bot' : !seat.connected ? 'Bot (human disconnected)' : seat.ready ? 'Ready' : 'Not ready'} `;
}
```

- [ ] **Step 4: The pressed button**

`src/renderer/src/ui/menu/styles.ts`: after `BUTTON_OFF` add:

```ts
/** A chosen option among buttons (Sci-2's CREW 2 3 4): the border colour filled. */
export const BUTTON_ON: CSSProperties = { ...BUTTON, background: '#52718d', color: '#05060a' };
```

`src/renderer/src/ui/menu/MenuButton.tsx`:

```tsx
// The menu's one button: a data-testid, the label, enabled or dimmed, and optionally pressed (one option of a choice);
// a submit button takes no click handler.
import { BUTTON, BUTTON_OFF, BUTTON_ON } from './styles';

export function MenuButton(props: { id: string; text: string; onClick?: () => void; enabled?: boolean; type?: 'button' | 'submit'; pressed?: boolean }) {
  const enabled = props.enabled ?? true, type = props.type ?? 'button';
  const style = !enabled ? BUTTON_OFF : props.pressed ? BUTTON_ON : BUTTON;
  return <button type={type} data-testid={props.id} disabled={!enabled} aria-pressed={props.pressed === undefined ? undefined : props.pressed} style={style} onClick={type === 'button' ? props.onClick : undefined}>{props.text}</button>;
}
```

- [ ] **Step 5: The host form**

`src/renderer/src/ui/menu/HostForm.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import type { DuelCrewSize } from '../../../../shared/onlineSession';
import { useActions, useUi } from '../context';
import { can } from '../menuState';
import { MenuButton } from './MenuButton';

const CREWS: readonly DuelCrewSize[] = [2, 3, 4];

/** Multiplayer is the duel (H-2 spec §2): Host creates a duel room for the crew picked here (Sci-2 spec §5.3: CREW 2 3 4,
 *  default 3), so the form is a note, the choice and Create room. */
export function HostForm() {
  const menu = useUi((s) => s.menu), online = useUi((s) => s.online), actions = useActions();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('[data-testid="create-room"]')?.focus(); }, []);
  return (
    <>
      <form ref={ref} data-testid="host-form" onSubmit={(e) => { e.preventDefault(); actions.host(menu.crew); }}>
        <p data-testid="host-note">A crew of two, three or four: Helm, Weapons and Science; a fourth works on foot. Empty seats stand idle aboard.</p>
        <div data-testid="crew-choice" role="group" aria-label="Crew">
          <span>CREW </span>
          {CREWS.map((n) => <MenuButton key={n} id={`crew-${n}`} text={String(n)} pressed={menu.crew === n} onClick={() => actions.setCrew(n)} enabled={!menu.pending} />)}
        </div>
        <MenuButton id="create-room" text="Create room" type="submit" enabled={can({ menu, online }, 'host')} />
      </form>
      <MenuButton id="back" text="Back" onClick={actions.back} enabled={!menu.pending} />
    </>
  );
}
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run tests/uiMenuState.test.ts tests/menu.test.tsx tests/uiActions.test.ts`
Expected: PASS. If a test lists every button id on the Host page (`buttonIds`), it now also has `crew-2`, `crew-3`, `crew-4` before `create-room`; update that list.

Run: `npx tsc -b` — Expected: no errors.

- [ ] **Step 7: The full suite**

Run: `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: every test file PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/ui/menuState.ts src/renderer/src/ui/menu/HostForm.tsx src/renderer/src/ui/menu/MenuButton.tsx src/renderer/src/ui/menu/styles.ts tests/uiMenuState.test.ts tests/menu.test.tsx
git commit -m "feat(sci-2): the lobby's duel seat labels (EMPTY, JOINED, READY, DISCONNECTED) and the host form's CREW 2 3 4 choice (default 3)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The three-player playtest checklist, and the whole branch verified

**Files:**
- Create: `docs/playtest-duel.md`
- Modify: `docs/playtest.md` (a one-line pointer after the "Replaces the Demo-i script" paragraph)

**Interfaces:**
- Consumes: everything above (the checklist describes the built game).
- Produces: the owner's three-player playtest checklist (spec §6).

- [ ] **Step 1: The checklist**

Create `docs/playtest-duel.md`:

```markdown
# Three-player duel playtest checklist (Helm, Weapons, Science)

Sci-2 (`docs/superpowers/specs/2026-11-18-sci-2-crew-of-four-design.md` §6). One online duel, three computers, one keyboard
and mouse each. Late join is not built: a seat empty at Start stays empty for the session. Don't coach during the first
fight. Tick each step as seen, and note anything that went wrong next to it. Severity: **crash/stuck** > **didn't
understand** > **boring or unfair** > **polish**.

Date:
Build (commit, and `sim 52` on the menu's version line on every computer):
Players (names):
Computers and network (LAN or internet):

## 1. Setup
- [ ] The same build on all three computers (the menu's version line matches).
- [ ] Host: Multiplayer, Host, CREW `3` (the default), Create room. Room code: ________
- [ ] The other two join with the code; the lobby shows `P1: READY`/`JOINED` and so on, one row per seat, no `EMPTY` seat left.
- [ ] Everyone presses Ready; the host presses Start. Time from Create room to the first frame: ____ s.

## 2. Roles
- [ ] Each player reads its notice (`TAKE A CONSOLE: E TO SIT`) and walks to a console without help.
- [ ] Who sat where: Helm ________  Weapons ________  Science ________
- [ ] Time to sit, each: Helm ____ s  Weapons ____ s  Science ____ s
- [ ] The SCIENCE badge marked the Science console in the interior (beside HELM, WEAPONS and MEDBAY).
- [ ] Each crew list (the readout, under HEALTH) shows the other two as `P<k>  HELM / WEAPONS / SCIENCE`.

## 3. The opening
- [ ] Science scanned the contact before the 30 s hold ran out. Time of the first scan: ____ s.
- [ ] Did anyone ambush (fire before the enemy turned hostile)? Who, and why?

## 4. Scans
- [ ] Level 1 completed (hull and shield shown). Time: ____ s.
- [ ] Level 2 completed (the rooms and the weak frequency shown). Time: ____ s.
- [ ] Science called out the weak frequency; Weapons tuned to it (A, B or C) and saw two layers strip on a hit.

## 5. The derelict
- [ ] Science scanned the derelict.
- [ ] Helm flew close and slow and salvaged it. Loot: ________
- [ ] It was trapped? (yes / no) What the crew said when it was:

## 6. The fight
- [ ] Who left their seat, when, and why (repair, fire, revive):
- [ ] Hull lost by the end: ____ / ____
- [ ] Fight length (first shot to the end card): ____ s. Outcome:

## 7. A rematch with seats swapped
- [ ] Rematch from the end card; everyone takes a different console than in round 1.
- [ ] Who sat where in round 2: Helm ________  Weapons ________  Science ________
- [ ] Anything that was easier or harder the second time:

## 8. After the game, ask each player (write their exact words)
- [ ] The questions of `docs/playtest.md` §6.
- [ ] Science: was there always something to do?
- [ ] Helm and Weapons: did Science's information change what you did?

## 9. A short four-player variant
- [ ] Host with CREW `4`; four computers join; Start.
- [ ] The fourth player works on foot: repairs, fires, revives, and takes any free console. What did they do, and was it fun?
- [ ] Each crew list shows three rows (`P<k>` for every other player).
- [ ] Optional: start a crew of 4 with one seat empty: its row reads `AWAY`, its character stands idle aboard and can be hurt.
```

- [ ] **Step 2: The pointer**

`docs/playtest.md`: after the paragraph that begins `Replaces the Demo-i script (2026-11-13).` add the line:

```markdown
For the online duel with three or four players (Helm, Weapons, Science, and a fourth on foot), use `docs/playtest-duel.md`.
```

- [ ] **Step 3: The whole branch, verified**

Run: `npx tsc -b` — Expected: no errors.
Run: `npx tsx scripts/golden/duel-oracle.ts baseline`, then `npx tsx scripts/golden/duel-oracle.ts same` — Expected: both exit 0 (a self-check that the oracle runs at 52 on the final code).
Run: `npx vitest run tests/duelGates.test.ts tests/duelGolden.test.ts tests/duelRematchGolden.test.ts tests/golden.test.ts` — Expected: PASS, with `tests/duelGates.test.ts` unchanged since master (`git diff master --stat -- tests/duelGates.test.ts` prints nothing).
Run: `git diff master --stat -- services/signalling` — Expected: no output (Part C is out of scope).
Run: `git grep -n "DUEL_PLAYERS\|OtherStatus\|otherStatus" -- src tests` — Expected: no output.
Run: `npx electron-vite build`, then `npx vitest run --maxWorkers=4` — Expected: every test file PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/playtest-duel.md docs/playtest.md
git commit -m "docs(sci-2): the three-player duel playtest checklist (setup, roles, the opening, scans, the derelict, the fight, a seat-swapped rematch, the questions, a four-player variant)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.** §2.1 (2..4, host picks): Tasks 2, 5, 8. §2.2 (the fourth on foot): no new code; Task 2's seat test and Task 9's variant. §2.3 (empty seats idle, no late join): Task 4 (the steward), Task 7 (AWAY). §2.4 (Single player two): untouched `runtime.ts` Tab, `createDuel`'s default crew 2. §2.5 (bots and gates two): untouched `scripted.ts`, gates unedited. §3 (the rule for n, the grep): Decision 15 lists every site; Tasks 2 to 7 widen them. §4.1: Task 2. §4.2: Task 3. §4.3: Tasks 2 (summary, record) and 3 (checkpoint, codec, init). §4.4: Task 4. §4.5: Task 5. §4.6: Task 1, with the `same` proofs in Tasks 2 and 3. §5.1: Task 6. §5.2: Task 7. §5.3: Tasks 5 (store) and 8 (UI). §5.4: Task 6. §5.5: unchanged (`onlineDuel.ts:172`). §6: Task 9. §7: crew bounds (Tasks 2, 3, 5), away character (Task 2's health test), the race (Task 2), rematch presence (Task 2), no index past n (Task 6's pools, Task 7's list). §8: out of scope. §9: Sim (Task 2), Snapshot/checkpoint/wire (Task 3), Two-player proof (Tasks 1 to 3), Online (Tasks 4, 5), UI (Tasks 5 to 8).

**Placeholders.** None: every code step shows the code; `<R>`, `<T>`, `<F>`, `<sha>`, `<hex>` are values the scripts print.

**Type consistency.** `DUEL_CREW_MIN/MAX` and `DuelCrew` (Task 2) are used by Tasks 3, 4, 5, 6; `DuelCrewSize` (Task 5) by Tasks 5 and 8; `createDuel(layout, seed, helmPlayer, crew)` throughout; `duelInit(seed, runId, helmPlayer, layout, playerCount)` (Task 3) by Task 4's helper; `standAtStation` (Task 2) by Tasks 4 and 6; `crewStatus`/`crewRows` (Task 7) only in Task 7's tests; `ReadoutInput.active: number` (Task 6) before `other` is removed (Task 7).
