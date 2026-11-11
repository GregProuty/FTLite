# Telemetry and Acceptance (Increment 4-ii) — Design

Status: approved 2026-11-10 under the autonomous feature loop (`docs/roadmap.md` item 4); every open choice took the recommended option. Parent: `2026-11-09-foundation-design.md` §7 (session flow: game-over summary), §10 (Acceptance: the observable questions), §11 item 4 (session telemetry log; the acceptance playtest can be run). Builds on 4-i (the director), 3-ii (characters, the game-over skill summary) and 3-i (productive predicates). With it the foundation's Increment 4 closes and the Foundation sub-project is complete.

## 1. Goal

Make every run measurable. The sim keeps a small set of **telemetry counters** as authoritative state (so they are deterministic, snapshotted and reproducible from a replay): time to the first Downed and the first Dead crew member, how long each station was manned, each player's longest idle stretch, hazards spawned per type, impacts, shots and hits, evasion rolls and evasions, repairs completed, the stress peak and phase entries. A pure `telemetryRecord(state, seed)` turns them into the **session record** the foundation's acceptance observables ask for; the session writes it when a run ends, the game-over screen shows the headline figures above the skill gains, and a headless `npm run acceptance` prints the records for the default seed set at 1, 2 and 4 players so the acceptance questions ("time to first death, stations never manned, longest idle per player, how each run ended") can be answered without a playtest.

**Out of scope:** uploading or aggregating records anywhere (they stay on the machine), charts, a replay viewer, any gameplay change.

## 2. Decisions taken (recommended options)

| Question | Decision |
|---|---|
| Where counters live | In `SimState` (`state.telemetry`), updated by the systems that own the events and by a `telemetrySystem` at the end of `step()`; flattened and hashed; `SIM_VERSION = 9`. A session-side observer would be simpler but would lose the counters on snapshot load and could not be exercised headlessly. |
| What "idle" means | A player tick is **active** when the crew member is seated at an online station, or added repair or revive progress this tick. Everything else is idle, including walking, standing about, and being Downed or Dead (the foundation measures the travel burden and nothing-to-do stretches together). |
| Time to first death | Two figures: the tick of the first Downed transition and of the first Dead transition (−1 if none). The acceptance summary reports both. |
| Record format | A flat JSON object (`TelemetryRecord`), one per run, with seconds rather than ticks and station and crew names rather than indices. The app appends it to a capped list in `localStorage` under `ftlite-telemetry` (last 50 runs) through a new `deps.saveTelemetry`. |
| Game-over screen | Four headline lines above the skill gains: run length and end reason, first down and first death, stations never manned, longest idle per crew member. The summary area grows to eight rows. |
| Acceptance script | `scripts/acceptance.ts` (`npm run acceptance [minutes] [seeds...]`): runs the default crew with the bot at 1, 2 and 4 players, seeds 1 to 3, 20 sim minutes each (or until the run ends), and prints one table row per run plus the record JSON on request. Its core is a pure function in `src/renderer/src/sim/acceptance.ts` so a test can run a short version. |

## 3. Architecture

| Module | Responsibility |
|---|---|
| `sim/telemetry.ts` (new) | `telemetrySystem(state)` (per-tick: manned ticks, idle streaks, first down/death from life-state edges, stress peak); `telemetryRecord(state, seed): TelemetryRecord`; the `TelemetryRecord` type; `secondsOf(ticks)`. |
| `sim/interact.ts` | sets `scratch.activeThisTick[pid] = 1` when a player adds repair or revive progress; increments `telemetry.repairs[kind]` when a repair completes. |
| `sim/director.ts` | increments `telemetry.spawns[type]` on a successful spawn and `telemetry.phaseEntries[phase]` in `enterPhase`; `updateStress` raises `telemetry.maxStress`. |
| `sim/debris.ts`, `sim/weapons.ts` | impacts, evasion rolls, evasions; shots and hits. |
| `sim/crew.ts` | nothing new: the Downed/Dead edges are detected in `telemetrySystem` by comparing each crew member's life state with the previous tick's (`telemetry.prevLife`). |
| `sim/step.ts` | `telemetrySystem` runs last, after `crewSystem`, so it sees the tick's final life states and the run-end flag. |
| `sim/acceptance.ts` (new) | `runAcceptance({ players, seed, minutes, characters })` → `TelemetryRecord` using the test bot (moved from `tests/helpers/bot.ts` to `src/renderer/src/sim/bot.ts` so both the script and the tests can import it; the sim boundary allows it since it imports only sim modules). |
| `scripts/acceptance.ts` (new) | CLI wrapper printing a table. `package.json` gains `"acceptance": "tsx scripts/acceptance.ts"`. |
| `app/session.ts`, `main.ts` | on the tick a run ends, `deps.saveTelemetry?.(telemetryRecord(state, seed))`; `main.ts` keeps the last 50 records in `localStorage`. |
| `render/hudModel.ts`, `hud.ts` | headline lines in `summary`; eight summary rows. |
| `sim/state.ts`, `flatten.ts`, `tuning.ts` | the `telemetry` block, `SIM_VERSION = 9`, `TELEMETRY_KEEP = 50`. |

## 4. Authoritative state

```ts
telemetry: {
  firstDownTick: number;        // -1 until a crew member first becomes Downed
  firstDeathTick: number;       // -1 until one first becomes Dead
  mannedTicks: Int32Array;      // per StationKind: ticks with an occupant at an online station
  idleRun: Int32Array;          // per player: current idle streak in ticks
  longestIdle: Int32Array;      // per player: longest idle streak so far
  prevLife: Uint8Array;         // per player: life state at the end of the previous tick (for edge detection)
  spawns: Int32Array;           // per HazardType: successful director spawns
  impacts: number;              // debris impacts that hit the hull
  evadeRolls: number; evasions: number;
  shots: number; hits: number;  // weapon shots taken and hits
  repairs: Int32Array;          // fire, breach, power repairs completed (any crew member)
  maxStress: number;            // highest smoothed stress seen
  phaseEntries: Int32Array;     // per Phase: times entered (Build Up counts its initial entry)
};
scratch.activeThisTick: Uint8Array;   // per player, not snapshotted; set by interactSystem, read by telemetrySystem
```

Everything except `scratch` is flattened in a `telemetry` manifest section after `director` (scalars first, then the arrays in the order above), snapshotted and hashed. `SIM_VERSION` becomes 9; version-8 snapshots are rejected. Initial values: −1 for the two ticks, 0 elsewhere, `prevLife` all Conscious, `phaseEntries[BuildUp] = 1`.

## 5. Counting rules

`telemetrySystem` (last system in `step()`, after `crewSystem`, and it runs on the ending tick too since `crewSystem` only sets `ended` for the next step):

- For each station `i` with `occupant >= 0` and `stationOnline`: `mannedTicks[kind] += 1`.
- For each player: `active = Seated.station >= 0 && stationOnline(that station) || scratch.activeThisTick[pid]`; if active `idleRun = 0`, else `idleRun += 1` and `longestIdle = max(longestIdle, idleRun)`.
- Life edges: if `prevLife !== Downed && life === Downed && firstDownTick < 0` → `firstDownTick = tick`; if `prevLife !== Dead && life === Dead && firstDeathTick < 0` → `firstDeathTick = tick`; then `prevLife = life`.
- `maxStress` is updated inside `updateStress` (so it tracks every recompute), not here.

Event counters, each at the one place the event happens: `director.attemptSpawn` success → `spawns[type]++`; `enterPhase` → `phaseEntries[phase]++`; `debris.resolveImpact`: a Navigation roll → `evadeRolls++`, an evasion → `evasions++`, an unevaded impact → `impacts++`; `weapons.fireWeapon`: a shot taken → `shots++`, a hit → `hits++`; `interact`: a completed fire/breach/power repair → `repairs[0|1|2]++`, and any tick a player adds repair or revive progress → `scratch.activeThisTick[pid] = 1` (the scratch array is cleared at the top of `step()` with the other scratch).

## 6. The record

```ts
interface TelemetryRecord {
  version: 1; simVersion: number; seed: number; playerCount: number; characters: string[];
  endReason: 'hull' | 'crew' | 'running';      // 'running' when the record is taken from a run that has not ended
  durationSeconds: number;
  timeToFirstDownSeconds: number | null; timeToFirstDeathSeconds: number | null;
  stationsNeverManned: string[];               // STATION_NAMES of kinds present on the ship with mannedTicks 0
  mannedSeconds: Record<string, number>;       // by station name
  longestIdleSeconds: number[];                // per player
  spawns: { fire: number; breach: number; power: number; debris: number };
  impacts: number; evadeRolls: number; evasions: number; shots: number; hits: number;
  repairs: { fire: number; breach: number; power: number };
  maxStress: number; phaseEntries: { buildUp: number; sustainPeak: number; peakFade: number; relax: number };
  skills: number[][];                           // per player, six levels
}
```

`telemetryRecord(state, seed)` is pure. Seconds are `ticks / TICK_HZ` rounded to one decimal.

## 7. Session, storage and HUD

- `SessionDeps.saveTelemetry?: (record: TelemetryRecord) => void`. In `frame()`, where the run end is detected (`state.ended` after `step`), the session calls it once with `telemetryRecord(state, seed)` before switching to `gameover`. A sim fault does not produce a record.
- `main.ts`: `saveTelemetry` reads `localStorage['ftlite-telemetry']` (a JSON array or missing), appends, trims to the last `TELEMETRY_KEEP` (50), writes back; failures are swallowed like the crash store.
- `HudModel.summary` in `gameover` becomes: `Survived 7:32  HULL LOST` (mm:ss), `First down: Okoro 3:10   First death: none`, `Never manned: Doors, Medbay` (or `Every station manned`), `Longest idle: Okoro 95 s, Lindqvist 40 s`, then the per-crew skill lines from 3-ii. `hud.ts` draws up to eight summary rows (the four extra at the same spacing).

## 8. Acceptance run

`runAcceptance({ players, seed, minutes, characters = DEFAULT_CHARACTERS })` creates a state, steps it with `botIntent` for every player until `minutes × 60 × TICK_HZ` ticks or the run ends, and returns `telemetryRecord(state, seed)`. `scripts/acceptance.ts` runs players `[1, 2, 4]` × seeds `[1, 2, 3]` for 20 minutes by default and prints a table: `players seed ended-at reason first-down first-death never-manned longest-idle spawns impacts hits/shots`. The bot moves to `src/renderer/src/sim/bot.ts` unchanged (it imports only sim modules; `tests/helpers/bot.ts` re-exports it so existing tests are untouched).

## 9. Tuning

```ts
SIM_VERSION = 9
TELEMETRY_KEEP = 50        // records kept in localStorage
ACCEPTANCE_MINUTES = 20    // default soak length for npm run acceptance
```

## 10. Testing

All under node, no pixi. New: `tests/telemetry.test.ts`, `tests/acceptance.test.ts`. Extended: `tests/session.test.ts`, `tests/hud.test.ts`, `tests/snapshot.test.ts`.

- **Counters:** `mannedTicks` counts only while an occupant sits at an online station (a failed station with a stale occupant byte does not count); `idleRun` resets on a seated tick and on a repair tick and on a revive tick, and counts while walking, standing, Downed and Dead; `longestIdle` is the maximum streak (two streaks of 30 and 50 ticks give 50); `firstDownTick` and `firstDeathTick` are set once, on the transition tick, and never overwritten by a second crew member; `spawns` per type through pinned director rolls; `impacts`, `evadeRolls`, `evasions` through pinned combat rolls (an evaded object counts a roll and an evasion but no impact); `shots` and `hits` for a beam hit, a beam miss and a torpedo hit; `repairs` for each kind when completed, once even with two holders; `maxStress` follows the highest smoothed value; `phaseEntries` starts `[1, 0, 0, 0]` and counts each `enterPhase`; `scratch.activeThisTick` is cleared every step.
- **Record:** `telemetryRecord` on a crafted state gives the exact fields (names, seconds rounding, `stationsNeverManned` from zero `mannedTicks`, `endReason` mapping for hull, crew and running, `skills` from the levels); the record is JSON-serialisable (`JSON.parse(JSON.stringify(r))` deep-equals it).
- **Snapshot and hash:** round trip of every telemetry field with non-default values; mutating each field alone changes the hash; version-8 rejection; a run saved mid-run and continued matches the uninterrupted run's counters.
- **Session:** `saveTelemetry` is called exactly once when the solo player dies, with `endReason 'crew'`, `playerCount 1`, `seed DEFAULT_SEED`, and not again on the game-over frames; a sim fault calls `saveCrash` but not `saveTelemetry`; a session without `saveTelemetry` still ends normally.
- **HUD:** the four headline lines in `gameover` with the stated formats (`mm:ss`, `none`, `Every station manned`) followed by the skill lines; `summary` stays `null` outside `gameover`.
- **Acceptance:** `runAcceptance({ players: 2, seed: 1, minutes: 0.5 })` returns a record with `durationSeconds` 30 (or less if the run ended), `playerCount 2`, `characters ['Okoro', 'Lindqvist']`, well-formed arrays; `players: 1` and `players: 4` produce the right crew lists; the script module's table formatter renders one line per record (unit-tested as a pure function).
- **Boundary:** `sim/bot.ts` passes the boundary test (it imports only sim modules); `tests/helpers/bot.ts` becomes a re-export.
- **Golden replay:** re-blessed once (version 9, the telemetry block) with the cause recorded; counters change no behaviour, so the hash differs only through the new fields.

## 11. Gate

Added to `docs/gates.md` as "Increment 4-ii" (closing the foundation's Increment 4 and the Foundation sub-project):

- The telemetry, acceptance, session, HUD and snapshot tests pass; typecheck and build pass; `npm run acceptance 1 1` (one minute, seed 1) prints three rows (1, 2 and 4 players) without error.
- Manual, two players: a game over shows the four headline lines above the skill gains; `localStorage['ftlite-telemetry']` holds the run's record afterwards (DevTools console).
- Acceptance observables for the foundation's §10 questions are produced by `npm run acceptance` and recorded in `docs/gates.md` once for seeds 1 to 3 at 1, 2 and 4 players (table pasted in by the implementer of the docs task).

## 12. Open questions deferred

- Per-station "productive seconds" in the record (the director already counts idle ticks per console): add if a playtest asks "was Science ever useful", not before.
- Exporting records to a file: later, with the run structure (roadmap items 8 to 10).
