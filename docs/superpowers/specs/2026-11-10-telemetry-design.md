# Telemetry and Acceptance (Increment 4-ii) — Design

Status: approved 2026-11-10 under the autonomous feature loop (`docs/roadmap.md` item 4); every open choice took the recommended option; amended 2026-11-11 from the two Codex spec reviews (`research/codex-review-telemetry-spec-1.md`, `-2.md`). Parent: `2026-11-09-foundation-design.md` §7 (session flow: game-over summary), §10 (Acceptance: the observable questions), §11 item 4 (session telemetry log; the acceptance playtest can be run). Builds on 4-i (the director), 3-ii (characters, the game-over skill summary) and 3-i (productive predicates). With it the foundation's Increment 4 closes and the Foundation sub-project is complete.

## 1. Goal

Make every run measurable. The sim keeps a small set of **telemetry counters** as authoritative state (so they are deterministic, snapshotted and reproducible from a replay): time to the first Downed and the first Dead crew member and who it was, how long each station was manned, each player's longest idle stretch, hazards spawned per type, impacts, shots and hits, evasion rolls and evasions, repairs completed, the stress peak and phase entries. A pure `telemetryRecord(state, seed)` turns them into the **session record** the foundation's acceptance observables ask for; the session writes it when a run ends, the game-over screen shows the headline figures above the skill gains, and a headless `npm run acceptance` prints the records for the default seed set at 1, 2 and 4 players.

**What the headless run can and cannot answer.** The bot (`botIntent`) moves, repairs and revives; it never sits at a console. The headless runs are therefore **automated telemetry soaks**: they answer "time to first death", "longest idle per player", "how the run ended" and the hazard, impact and repair counts for an unmanned-console crew, and they prove the pipeline end to end. They cannot answer the foundation §10 questions that need station choices ("was a station choice useful", "task clarity"); those stay with the **human acceptance playtest**, which the game-over summary and the stored records now instrument. A station-operating bot is deferred (§12).

**Out of scope:** uploading or aggregating records anywhere (they stay on the machine), charts, a replay viewer, any gameplay change, a console-operating bot.

## 2. Decisions taken (recommended options)

| Question | Decision |
|---|---|
| Where counters live | In `SimState` (`state.telemetry`), updated by the systems that own the events and by a `telemetrySystem` at the end of `step()`; flattened and hashed; `SIM_VERSION = 9`. A session-side observer would be simpler but would lose the counters on snapshot load and could not be exercised headlessly. |
| What "idle" means | A player tick is **active** when, at the end of the tick, the crew member is seated at an online station, **or** the crew member added repair or revive progress during the tick. Everything else is idle, including walking, standing about, and being Downed or Dead (the foundation measures the travel burden and nothing-to-do stretches together). Activity during the tick wins over the final life state (§5). |
| Time to first death | Two figures, each with the crew member: the tick and player of the first Downed transition and of the first Dead transition (tick −1 and pid −1 if none). The acceptance summary reports both. |
| Event time convention | An event counter stores `state.tick` as it stands while the event's tick is processed (before `step()` increments it). Reported seconds are the **completed duration at the end of that tick**, `(t + 1) / TICK_HZ`, so an event on the ending tick reads the same as `durationSeconds` and an event during tick 0 reads `1/TICK_HZ` (0.0 s after rounding). |
| Record format | A flat JSON object (`TelemetryRecord`), one per run, with seconds rather than ticks and station and crew names rather than indices. The app appends it to a capped list in `localStorage` under `ftlite-telemetry` (last 50 runs) through a new `deps.saveTelemetry`; the append logic is a small injectable helper (`app/telemetryStore.ts`) so it can be tested. |
| Game-over screen | Four headline lines above the skill gains: run length and end reason, first down and first death, stations never manned, longest idle per crew member. `hud.ts` allocates eight summary rows (today four). |
| Acceptance script | `scripts/acceptance.ts` (`npm run acceptance [minutes] [seeds...]`): runs the default crew with the bot at 1, 2 and 4 players, seeds 1 to 3, 20 sim minutes each (or until the run ends), and prints one table row per run plus the record JSON on request. Its core is a pure function in `src/renderer/src/sim/acceptance.ts`, and the CLI orchestration is itself a function with injected runner and printer so a test can check the argument handling. |

## 3. Architecture

| Module | Responsibility |
|---|---|
| `sim/telemetry.ts` (new) | `telemetrySystem(state)` (per-tick: manned ticks, idle streaks, first down/death from life-state edges); `telemetryRecord(state, seed): TelemetryRecord`; the `TelemetryRecord` type; `eventSeconds(tick)` and `durationSeconds(ticks)`. |
| `sim/interact.ts` | sets `scratch.activeThisTick[pid] = 1` when a player adds repair progress, and for the **arbitrated reviver** when they add revive progress (set before `reviveCrew` resets the progress, so the completion tick counts); increments `telemetry.repairs[kind]` when a repair completes. |
| `sim/director.ts` | increments `telemetry.spawns[type]` on a successful spawn and `telemetry.phaseEntries[phase]` in `enterPhase`; `updateStress` raises `telemetry.maxStress`. |
| `sim/debris.ts`, `sim/weapons.ts` | impacts, evasion rolls, evasions; shots and hits (§5 for the exact increment points). |
| `sim/crew.ts` | nothing new: the Downed/Dead edges are detected in `telemetrySystem` by comparing each crew member's life state with the previous tick's (`telemetry.prevLife`). |
| `sim/step.ts` | `telemetrySystem` runs last, after `crewSystem` and before `state.tick++`, so it sees the tick's final life states and the run-end flag and stores the event tick's own index. |
| `sim/bot.ts` (moved from `tests/helpers/bot.ts`, unchanged) | the acceptance crew; imports only sim modules, so the boundary test accepts it; `tests/helpers/bot.ts` becomes a re-export so existing tests are untouched. |
| `sim/acceptance.ts` (new) | `runAcceptance({ players, seed, minutes, characters })` → `TelemetryRecord`; `acceptanceTable(records)` (the text table, pure); `runAcceptanceCli(argv, run = runAcceptance, print = console.log)` (argument parsing and orchestration, pure given its injected functions). |
| `scripts/acceptance.ts` (new) | `runAcceptanceCli(process.argv.slice(2))`. `package.json` gains `"acceptance": "tsx scripts/acceptance.ts"`. |
| `app/telemetryStore.ts` (new) | `appendTelemetry(storage, record, keep = TELEMETRY_KEEP)` over a `{ getItem, setItem }` storage; the recovery rules of §7. |
| `app/session.ts`, `main.ts` | on the tick a run ends, `deps.saveTelemetry?.(telemetryRecord(state, seed))`; `main.ts` wires `saveTelemetry` to `appendTelemetry(localStorage, record)`. |
| `render/hudModel.ts`, `hud.ts` | headline lines in `summary`; eight summary rows. |
| `sim/state.ts`, `flatten.ts`, `tuning.ts` | the `telemetry` block, `SIM_VERSION = 9`, `TELEMETRY_KEEP = 50`. |

## 4. Authoritative state

```ts
telemetry: {
  firstDownTick: number;  firstDownPid: number;     // -1 until a crew member first becomes Downed; the player who did
  firstDeathTick: number; firstDeathPid: number;    // -1 until one first becomes Dead; the player who did
  mannedTicks: Int32Array;      // per StationKind: ticks ending with an occupant at an online station
  idleRun: Int32Array;          // per player: current idle streak in ticks
  longestIdle: Int32Array;      // per player: longest idle streak so far
  prevLife: Uint8Array;         // per player: life state at the end of the previous tick (for edge detection)
  spawns: Int32Array;           // per HazardType: successful director spawns
  impacts: number;              // debris impacts that hit the hull
  evadeRolls: number; evasions: number;
  shots: number; hits: number;  // weapon shots taken (beam or torpedo, hit or miss) and hits
  repairs: Int32Array;          // fire, breach, power repairs completed (any crew member)
  maxStress: number;            // highest smoothed stress seen
  phaseEntries: Int32Array;     // per Phase: times entered (Build Up counts its initial entry)
};
scratch.activeThisTick: Uint8Array;   // per player, not snapshotted; set by interactSystem, read by telemetrySystem
```

Everything except `scratch` is flattened in a `telemetry` manifest section after `director` (the nine scalars first, in the order above, then the arrays in the order above), snapshotted and hashed. `SIM_VERSION` becomes 9; version-8 snapshots are rejected. Initial values: −1 for the four tick/pid scalars, 0 elsewhere, `prevLife` all Conscious, `phaseEntries[BuildUp] = 1`.

## 5. Counting rules

`telemetrySystem` is the last system in `step()`, after `crewSystem` and before `state.tick++`. It runs on the ending tick too (`crewSystem` sets `ended`, and `step()` returns early only on the *next* call), so the ending tick's transitions and counters are captured; every later `step()` call returns at once and leaves the counters unchanged.

**Final-state samples.** `mannedTicks` and the seated half of the activity rule are sampled at the end of the tick, after `downCrew` has cleared seating and `shedPower` has changed station availability. So a seated operator who is downed during the tick (debris in the room, oxygen) does not count as manning that tick and, unless they added repair or revive progress earlier in the tick, that tick is idle for them. A shot or an evasion roll made earlier in such a tick is still counted by its event counter (those are observed where they happen).

- For each station `i` with `occupant >= 0` and `stationOnline`: `mannedTicks[kind] += 1`.
- For each player: `active = (Seated.station >= 0 && stationOnline(that station)) || scratch.activeThisTick[pid]`; if active `idleRun = 0`, else `idleRun += 1` and `longestIdle = max(longestIdle, idleRun)`. **Mixed case:** a player who added repair or revive progress and then became Downed in the same tick is active for that tick (activity during the tick takes precedence over the final life state); from the next tick on they are idle until revived.
- Life edges, scanned in pid order: if `prevLife !== Downed && life === Downed && firstDownTick < 0` → `firstDownTick = tick, firstDownPid = pid`; if `prevLife !== Dead && life === Dead && firstDeathTick < 0` → `firstDeathTick = tick, firstDeathPid = pid`; then `prevLife = life`. Two crew members transitioning on the same tick: the lower pid is recorded (pid order is the tie-break). A Conscious → Dead jump in one tick (none exists today) would set both.
- `maxStress` is updated inside `updateStress` (so it tracks every recompute), not here.

**Event counters**, each at the one place the event happens:

- `director.attemptSpawn` success → `spawns[type]++`; `enterPhase` → `phaseEntries[phase]++`.
- `debris.resolveImpact`: when Navigation is online and occupied a roll happens → `evadeRolls++`; if it evades → `evasions++` and the function returns (no impact); otherwise, and when no roll happens, the hull takes damage → `impacts++` (so `impacts = rolls − evasions + unrolled impacts`).
- `weapons.fireWeapon`: `shots++` **once**, after whichever weapon branch has passed its readiness check and consumed its readiness (torpedo unloaded or charge reset), beside the `lastShotTick` stamp, so a fired miss counts and a rejected attempt (offline, unoccupied, no warned target, no charge, no torpedo) does not; `hits++` inside the hit branch, before `removeDebris`.
- `interact`: a completed fire/breach/power repair → `repairs[0|1|2]++` (once, even with two holders: the completing holder increments and later holders see the hazard already gone); any tick a player adds repair progress → `scratch.activeThisTick[pid] = 1`; revive progress sets it only for the arbitrated reviver, including the completion tick (set before `reviveCrew` resets `reviveProgress`). The scratch array is cleared at the top of `step()` with the other scratch.

## 6. The record

```ts
interface TelemetryRecord {
  version: 1; simVersion: number; seed: number; playerCount: number; characters: string[];
  endReason: 'hull' | 'crew' | 'running';      // 'running' when the record is taken from a run that has not ended
  durationSeconds: number;                     // ticks completed / TICK_HZ
  firstDown: { who: string; seconds: number } | null;    // eventSeconds(firstDownTick), characters[firstDownPid]
  firstDeath: { who: string; seconds: number } | null;
  stationsNeverManned: string[];               // STATION_NAMES of kinds present on the ship (derived.stationOfKind >= 0) with mannedTicks 0, in StationKind order
  mannedSeconds: Record<string, number>;       // by station name, kinds present on the ship only
  longestIdleSeconds: number[];                // per player
  spawns: { fire: number; breach: number; power: number; debris: number };
  impacts: number; evadeRolls: number; evasions: number; shots: number; hits: number;
  repairs: { fire: number; breach: number; power: number };
  maxStress: number; phaseEntries: { buildUp: number; sustainPeak: number; peakFade: number; relax: number };
  skills: number[][];                           // per player, six levels
}
```

`telemetryRecord(state, seed)` is **pure**: it reads `state` without mutating it and every array or object in the record is freshly allocated (mutating the record never touches the state). `durationSeconds = state.tick / TICK_HZ`; `eventSeconds(t) = (t + 1) / TICK_HZ`; both rounded to one decimal. Station kinds whose console is not on the ship appear in neither `stationsNeverManned` nor `mannedSeconds`.

## 7. Session, storage and HUD

- `SessionDeps.saveTelemetry?: (record: TelemetryRecord) => void`. In `frame()`, where the run end is detected (`state.ended` after `step`), the session calls it once with `telemetryRecord(state, seed)` before switching to `gameover`. A sim fault does not produce a record. A session without `saveTelemetry` ends normally.
- `appendTelemetry(storage, record, keep)`: read `storage.getItem('ftlite-telemetry')`; parse it; **if the key is missing, the JSON does not parse, or the parsed value is not an array, start from an empty history** (malformed data is replaced, never allowed to block later records); append the record; keep the **newest `keep`** (drop from the front); write back. A storage access or write failure (`getItem`/`setItem` throwing, as in private mode or a full quota) is swallowed and the function returns without effect, like the crash store.
- `HudModel.summary` in `gameover` becomes: `Survived 7:32  HULL LOST` (mm:ss of `durationSeconds`; `CREW LOST` for the crew reason), `First down: Okoro 3:10   First death: none`, `Never manned: Doors, Medbay` (or `Every station manned`), `Longest idle: Okoro 95 s, Lindqvist 40 s`, then the per-crew skill lines from 3-ii (one per player, so four players give eight lines). `hud.ts` allocates **eight** summary rows at the same spacing (today `summaryRows` has four, which would silently hide the skill lines).

## 8. Acceptance run

`runAcceptance({ players, seed, minutes, characters = DEFAULT_CHARACTERS })` creates a state with `createSimState`, steps it with `botIntent` for every player until exactly `round(minutes × 60 × TICK_HZ)` ticks have been completed or the run ends (whichever first), and returns `telemetryRecord(state, seed)`. It applies no survival cheat (unlike the director soak, which resets hull and health every tick): a run that ends early reports its real `endReason` and `durationSeconds`, and `tick === budget` with `endReason 'running'` otherwise. It is deterministic: the same arguments give a deep-equal record.

`acceptanceTable(records)` renders one header line and one line per record: `players seed ended-at reason first-down first-death never-manned longest-idle spawns impacts hits/shots`.

`runAcceptanceCli(argv, run, print)`: `argv[0]` is minutes (default `ACCEPTANCE_MINUTES`), the rest are seeds (default `[1, 2, 3]`); it calls `run` for players `[1, 2, 4]` × seeds in that order (nine calls by default, three for `npm run acceptance 1 1`), with no duplicate combinations, then `print(acceptanceTable(records))`; with `--json` it also prints each record as JSON. Bad arguments (non-numeric, minutes ≤ 0) print a usage line and return without running.

## 9. Tuning

```ts
SIM_VERSION = 9
TELEMETRY_KEEP = 50        // records kept in localStorage
ACCEPTANCE_MINUTES = 20    // default soak length for npm run acceptance
```

## 10. Testing

All under node, no pixi. New: `tests/telemetry.test.ts`, `tests/acceptance.test.ts`, `tests/telemetryStore.test.ts`. Extended: `tests/session.test.ts`, `tests/hud.test.ts`, `tests/snapshot.test.ts`, `tests/boundary.test.ts` (nothing to relax; `sim/bot.ts` is simply walked).

- **Counters:** `mannedTicks` counts only while an occupant sits at an online station (a failed station with a stale occupant byte does not count); `idleRun` resets on a seated tick, on a repair tick and on a revive tick (the reviver only: the second crew member standing beside the Downed one stays idle), and counts while walking, standing, Downed and Dead; `longestIdle` is the maximum streak (two streaks of 30 and 50 ticks give 50); the **mixed case**: a crew member adds repair progress and is downed by debris in the same tick → that tick active, the next idle; `firstDownTick`/`firstDownPid` and `firstDeathTick`/`firstDeathPid` are set once, on the transition tick, hold the lower pid when two crew members transition on the same tick, and are never overwritten by a later crew member; **ending-tick capture through `step()`:** a solo run whose player is downed on tick `t` ends on that tick with `firstDownTick === t`, `firstDownPid === 0`, `mannedTicks` for their station unchanged by that tick, and `idleRun` incremented; three further `step()` calls leave every telemetry field unchanged; a seated operator downed on the ending tick is a separate fixture asserting the same final-state rule; `spawns` per type through pinned director rolls; `impacts`, `evadeRolls`, `evasions` through pinned combat rolls (an evaded object counts a roll and an evasion but no impact; an unrolled impact counts no roll); `shots` and `hits` for a beam hit, a beam miss (shots 1, hits 0), a torpedo hit, and a rejected attempt with no charge (shots unchanged); `repairs` for each kind when completed, once even with two holders; `maxStress` follows the highest smoothed value; `phaseEntries` starts `[1, 0, 0, 0]` and counts each `enterPhase`; `scratch.activeThisTick` is cleared every step.
- **Record:** `telemetryRecord` on a crafted state gives the exact fields (names, seconds rounding with `eventSeconds` at tick 0 → 0.0 and `durationSeconds` for a 90-tick run → 1.5, `firstDown`/`firstDeath` null and populated, `endReason` mapping for hull, crew and running, `skills` from the levels); **the present-on-the-ship filter:** a layout missing a station kind lists it in neither `stationsNeverManned` nor `mannedSeconds`, while a present kind with zero manned ticks is listed; **purity:** the state's hash is unchanged after the call and mutating the returned arrays and objects does not change the state or a second call's result; the record is JSON-serialisable (`JSON.parse(JSON.stringify(r))` deep-equals it).
- **Snapshot and hash:** round trip of every telemetry field with non-default values; mutating each field alone changes the hash; version-8 rejection; **continuation:** a two-player run is saved with a positive `idleRun` in progress and one crew member Downed while the other is Conscious, then continued through a new longest streak and the Downed member's bleed-out; the test asserts those events occurred in the continued stretch (`longestIdle` grew, `firstDeathTick` set) and that every telemetry field and the final hash equal the uninterrupted run's.
- **Storage (`appendTelemetry` with an injected storage):** missing key → a one-element array; an existing array of two → three, in order; fifty existing → fifty-one appended becomes fifty with the oldest dropped and the new one last; malformed JSON and a non-array root (`{}`, `42`) → replaced by a one-element array; a throwing `getItem` and a throwing `setItem` → no throw, no write beyond the attempt.
- **Session:** two separate end cases through the harness, which collects records beside `crashes`: **hull loss** (`hull = 0`) saves exactly one record with `endReason 'hull'`, **crew loss** (the solo player downed) saves exactly one record with `endReason 'crew'`, both with `playerCount 1`, `seed DEFAULT_SEED`, and not again on the game-over frames; a sim fault calls `saveCrash` but not `saveTelemetry`; a session without `saveTelemetry` still ends normally.
- **HUD:** the four headline lines in `gameover` with the stated formats (`mm:ss`, `none`, `Every station manned`, `CREW LOST`) followed by the skill lines; `summary` stays `null` outside `gameover`; the model test for four players asserts eight lines in order.
- **Acceptance (`runAcceptance` against an independent oracle):** the test builds its own loop (`createSimState`, `botIntent`, `step`, `telemetryRecord`) for `{ players: 2, seed: 1, minutes: 0.5 }` and asserts deep equality with `runAcceptance`'s record; running state → `durationSeconds 30` and `endReason 'running'`, `playerCount 2`, `characters ['Okoro', 'Lindqvist']`; an early-ending fixture (a seed and minutes pair the implementer finds that ends, or a 1-player run long enough to down the bot; the pair is recorded in the test) → `endReason` not `'running'` and `durationSeconds < budget`; the same call twice is deep-equal; `players: 1` and `players: 4` produce the right crew lists; custom `characters` appear in the record.
- **CLI (`runAcceptanceCli` with a recording `run` and `print`):** no arguments → nine calls in players-major order `(1,1) (1,2) (1,3) (2,1) …` with minutes 20; `['1', '1']` → three calls with minutes 1 and seed 1; the printed table has a header and one row per record with the players, seed, reason and hits/shots columns holding the record's values; a bad argument prints usage and makes no calls.
- **Boundary:** `sim/bot.ts` passes the boundary test; `tests/helpers/bot.ts` is a re-export and the existing tests still pass unchanged.
- **Golden replay:** re-blessed once (version 9, the telemetry block) with the cause recorded; counters change no behaviour, so the hash differs only through the new fields.

## 11. Gate

Added to `docs/gates.md` as "Increment 4-ii" (closing the foundation's Increment 4 and the Foundation sub-project):

- The telemetry, acceptance, store, session, HUD and snapshot tests pass; typecheck and build pass; `npm run acceptance 1 1` (one minute, seed 1) prints three rows (1, 2 and 4 players) without error.
- Manual, **four players**: a game over shows exactly eight summary lines in order (run length and reason, first down/first death, never manned, longest idle, then four skill lines), all visible and evenly spaced; `localStorage['ftlite-telemetry']` holds the run's record afterwards (DevTools console).
- The automated soak observables (time to first down and death, longest idle per player, how each run ended, spawns and impacts) are produced by `npm run acceptance` and recorded in `docs/gates.md` once for seeds 1 to 3 at 1, 2 and 4 players (table pasted in by the implementer of the docs task), labelled as unmanned-console soaks; the station-choice and task-clarity questions of foundation §10 remain for the human playtest.

## 12. Open questions deferred

- A console-operating bot (sit, scan, fire, evade) so the headless soak can also report station use: add when the human playtest shows a station question the records cannot settle.
- Per-station "productive seconds" in the record (the director already counts idle ticks per console): add if a playtest asks "was Science ever useful", not before.
- Exporting records to a file: later, with the run structure (roadmap items 8 to 10).
