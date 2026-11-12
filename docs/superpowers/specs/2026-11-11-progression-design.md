# Progression and Permadeath (Run-iii) Design

Status: approved 2026-11-11 under the autonomous feature loop (`docs/roadmap.md` item 10, the last of the ten); every open choice took the recommended option. Parent: `2026-11-09-foundation-design.md` §1 (sub-project 4), §4 (authoritative state, named RNG streams), §7 (session flow), §14 ("the ship as a character"). Builds on Run-i and Run-ii: the run block, scrap, the record and the acceptance table.

## 1. Goal

A run ends with a **score**; the score and a few milestones feed **unlocks** that persist on disk across runs as small starting bonuses; every run's ship has one **quirk**, a named flaw or virtue drawn from the seed that changes one rule for the whole run; and the game-over and lobby screens show the player's progress. **Permadeath** is stated as a rule: nothing of a run survives its end except the record and the unlocks it earns; there is no mid-run save or continue.

**Out of scope:** choosing which unlock to equip (every earned unlock applies); new characters; a run history screen beyond the lobby line; quirk selection or re-rolls; cloud or cross-machine progress; achievements beyond the three unlock milestones.

## 2. Options considered

- **Where progress lives:** (a) `localStorage` beside the telemetry history, through a tiny store in `app/` with a pure reducer in `sim/` **(recommended, chosen)**: same pattern as 4-ii, testable without a browser; (b) a file through the Electron main process: needs IPC and a schema; (c) in the telemetry history itself: fragile to the 50-record cap.
- **What unlocks are:** (a) three starting bonuses that all apply once earned **(chosen)**: no selection UI, visible on the first tick; (b) new characters: needs authored traits; (c) tuning multipliers: invisible.
- **Quirk source:** (a) a new seventh stream `quirk` appended to `STREAM_NAMES`, one draw at `createSimState` **(chosen)**: every existing stream keeps its seed; (b) the `cosmetic` stream: reserved for rendering; (c) chosen by the player: not "the ship as a character".
- **Score formula:** (a) nodes, victory, scrap and kills with fixed weights **(chosen)**: rewards progress and fighting, readable; (b) survival time only: today's score, flat; (c) a per-crew contribution: Run-iii is not the place for a leaderboard.

## 3. Score (`sim/score.ts`, pure)

`runScore(r: TelemetryRecord): number = 100 × r.run.nodesReached + (r.endReason === 'victory' ? 500 : 0) + r.run.scrap.earned + 20 × r.enemy.destroyed + 5 × r.boarders.killed`. A victory with 145 scrap earned and no kills scores `700 + 500 + 145 = 1345`. `TelemetryRecord` gains `score: number` (computed by `telemetryRecord` through `runScore` of the record so far; the record is still pure). Weights: `SCORE_NODE 100`, `SCORE_VICTORY 500`, `SCORE_ENEMY 20`, `SCORE_BOARDER 5`.

## 4. Progress on disk (`sim/progress.ts` pure, `app/progressStore.ts` storage)

```ts
interface Progress { version: 1; runs: number; victories: number; bestScore: number; bestNodes: number; unlocked: string[] }
```

`EMPTY_PROGRESS = { version: 1, runs: 0, victories: 0, bestScore: 0, bestNodes: 0, unlocked: [] }`. `applyRun(p, record): Progress` (pure, returns a new object): `runs + 1`; `victories + 1` on `'victory'`; `bestScore = max`, `bestNodes = max(nodesReached)`; then every unlock whose condition holds on the **new** progress and record is appended to `unlocked` in `UNLOCKS` order if absent. Unlocks (`UNLOCKS`, ids are stable strings):

| id | name | condition (after the run is counted) | start bonus |
|---|---|---|---|
| `scrap-reserve` | Scrap reserve | `runs >= 1` | the run starts with `UNLOCK_SCRAP = 30` scrap (`scrapEarned` counts it) |
| `torpedo-rack` | Torpedo rack | `bestNodes >= 4` | `torpedoStock = min(TORP_CAP, TORP_START + UNLOCK_TORPEDOES (2))` |
| `veteran-crew` | Veteran crew | `victories >= 1` | every crew member starts one Repair level higher: `xp[Repair] = XP_THRESHOLDS[level + 1]` where `level` is the head-start Repair level (0 for most), applied after `applyHeadStarts`, never above `SKILL_MAX` |

`progressStore.ts`: `PROGRESS_KEY = 'ftlite-progress'`; `loadProgress(storage): Progress` (missing, unparsable, wrong `version` or non-object → `EMPTY_PROGRESS`; arrays and numbers are validated: `unlocked` keeps only known ids, numbers default to 0); `saveProgress(storage, p)` (failures swallowed), both over the existing `RecordStorage` interface. `main.ts` wires `loadProgress: () => loadProgress(localStorage)` and `saveProgress: (p) => saveProgress(localStorage, p)` into the session (both optional deps; the tests' harness passes an in-memory storage).

## 5. Start bonuses and the quirk in the sim

`createSimState(layout, playerCount, seed, characters = DEFAULT_CHARACTERS, options: { unlocked?: readonly string[]; quirk?: number } = {})`.

- `run.startBonus: number` is a bitmask over `UNLOCKS` order (bit `i` set when `UNLOCKS[i].id` is in `options.unlocked`); the bonuses above are applied at creation in `UNLOCKS` order, after `applyHeadStarts`. Unknown ids are ignored. The bonuses change initial state only; nothing else reads `startBonus` except the record.
- `rng.quirk` is the **seventh** stream (`STREAM_NAMES = [..., 'map', 'quirk']`). `run.quirk = nextInt(rng.quirk, QUIRK_COUNT)` is drawn at creation **always** (one draw), then overridden by `options.quirk` when given (tests and the golden use the natural draw; the override exists for gates and fixtures). `QUIRK_COUNT = 6`.

Quirks (`sim/quirks.ts`): `QUIRKS: readonly { id: string; name: string; text: string }[]` and one pure hook per rule, each a multiplier or offset read at the constant's single use site:

| idx | name | rule | hook |
|---|---|---|---|
| 0 | Leaky Seals | a closed door passes twice the oxygen: `PASSAGE_CLOSED × 2` | `quirkPassageMult(state) = 2` at the closed-passage use site in `doors.ts`/oxygen |
| 1 | Hot Reactor | heat rises `HEAT_RISE + 1` per hazard tick while overdriven | `quirkHeatRise(state) = 1` added in `heatStep` |
| 2 | Sticky Doors | doors close after `DOOR_CLOSE_DELAY × 2` | `quirkDoorDelayMult(state) = 2` in `doors.ts` |
| 3 | Lucky Hull | debris takes `DEBRIS_HULL_DAMAGE − 2` hull (shots unchanged) | `quirkDebrisHullOffset(state) = −2` in `debrisSystem` |
| 4 | Twitchy Sensors | Science warning lead `+ 4` s | `quirkLeadOffset(state) = 4` in `scienceLead` |
| 5 | Old Drive | the jump drive charges in `JUMP_CHARGE_TIME × 1.25` s (75) | `quirkChargeMult(state) = 1.25` in `jumpStep` |

Each hook returns the neutral value (`1`, `0`) for every other quirk. No quirk makes a draw. `QUIRK_NAMES[idx]` is the name. The quirk is part of the snapshot (`run.quirk`) and the hash; `startBonus` likewise. Flatten: `run` gains `quirk, startBonus` after `upgrades` (`RUN_FIELDS += 2`); the rng section and the snapshot header grow by the `quirk` stream through `STREAM_NAMES`. `SIM_VERSION = 15`; version-14 snapshots are rejected.

## 6. Session flow and permadeath

- At `createSession`, `progress = deps.loadProgress?.() ?? EMPTY_PROGRESS`. The lobby message becomes `` `${LOBBY_MSG}   Runs ${runs}  Best ${bestScore}${unlocked.length ? `  Unlocked: ${names.join(', ')}` : ''}` `` (names from `UNLOCKS`), rebuilt whenever progress changes.
- `start()` passes `{ unlocked: progress.unlocked }` to `createSimState`.
- On the ending tick, after `saveTelemetry`: `progress = applyRun(progress, record)`; `deps.saveProgress?.(progress)`; the newly earned unlock names are kept for the summary (`newUnlocks`). The game-over banner is unchanged.
- Game-over summary (`HudModel.summary`): the headline's first line gains `  Score ${score}`; a new fifth line `Best ${bestScore}   Runs ${runs}   Victories ${victories}` and, when `newUnlocks` is non-empty, a sixth `Unlocked: ${names}`; the gains lines follow. `buildHudModel` gains an optional `progress: { bestScore, runs, victories, newUnlocks: string[] } | null` parameter (null today) so the model stays pure.
- The quirk is shown on the clock line: `` `HULL 100   TIME 0s   node 1/8   ${QUIRK_NAMES[quirk]}` `` (`HudModel.run` gains `quirk: string`, `''` without a state) and in the headline's second position: `Survived 7:32  VICTORY  Reached node 8 of 8  Score 1345`, then on the fifth line the quirk: `Ship: Old Drive`. (So the summary has up to seven lines before the gains; `hud.ts` has eight summary rows: raise to ten.)
- Permadeath, stated: a run's state is discarded at `start()`; the only data crossing a run end are the telemetry record and `Progress`. Crash snapshots are diagnostics, not saves.
- Record: `run` gains `quirk: string` (the name) and `unlocks: string[]` (ids from `startBonus`); `score` as §3. Acceptance table: column `score` appended after `scrap`.

## 7. Tuning (first pass)

`SCORE_*` as §3; `UNLOCK_SCRAP 30`, `UNLOCK_TORPEDOES 2`; `QUIRK_COUNT 6`; the quirk factors as §5 (`QUIRK_PASSAGE_MULT 2`, `QUIRK_HEAT_RISE 1`, `QUIRK_DOOR_DELAY_MULT 2`, `QUIRK_DEBRIS_OFFSET −2`, `QUIRK_LEAD_OFFSET 4`, `QUIRK_CHARGE_MULT 1.25`).

## 8. Tests (vitest, node)

- Score: `runScore` on hand-built records: the §3 example (1345), a hull loss at node 3 with 2 kills (`300 + 45 + 10 = 355` with scrap 45), zero for a fresh record; `telemetryRecord(...).score` equals `runScore` of the record.
- Progress: `applyRun` from `EMPTY_PROGRESS` with a hull-loss record at node 2 → `runs 1, victories 0, bestScore, bestNodes 2, unlocked ['scrap-reserve']`; a second run reaching node 5 adds `torpedo-rack`; a victory adds `veteran-crew`; order is `UNLOCKS` order regardless of which run earned what; no duplicates; `bestScore`/`bestNodes` are maxima; the input is not mutated. Store: round trip through an in-memory `RecordStorage`; missing key, malformed JSON, wrong version, unknown ids and non-numeric fields → sanitized; a throwing `setItem` is swallowed.
- Start bonuses: `createSimState(..., { unlocked: ['scrap-reserve', 'torpedo-rack', 'veteran-crew'] })` gives `scrap 30`, `scrapEarned 30`, `torpedoStock TORP_START + 2`, every crew member's Repair level one above their head start (Okoro 4, others 1), `startBonus 0b111`; an unknown id gives `startBonus 0` and no change; `torpedo-rack` alone at a stock already at `TORP_CAP` is capped; `veteran-crew` never exceeds `SKILL_MAX`.
- Quirk: `createSimState` makes exactly one `quirk` draw (`deriveStreams(seed).quirk` advanced by one `nextInt(…, QUIRK_COUNT)`), the six previous stream seeds are unchanged (the Run-i pins plus `map`), `options.quirk` overrides without changing the draw; each hook returns its value for its quirk and the neutral value otherwise; one behavioural test per quirk against a `{ quirk: k }` state and a `{ quirk: other }` control: (0) a closed door between a full and an empty room moves twice the oxygen in one hazard step; (1) one hazard tick of overdrive adds `HEAT_RISE + 1`; (2) a door stays open `2 × DOOR_CLOSE_DELAY` after the zone clears; (3) a debris impact costs 6 hull; (4) `scienceLead` is 4 s longer; (5) the charge after one tick is `DT / 75` and the ready tick is 4500.
- Snapshot: `run.quirk` and `run.startBonus` round trip and each changes the hash; the header carries `quirk`; version-14 rejected.
- Session (harness with an in-memory storage): the lobby message carries `Runs 0  Best 0` with empty progress; a run ending in a hull loss saves one record **and** one progress with `runs 1`, `unlocked ['scrap-reserve']`; the next `start()` creates a state with `scrap 30`; the summary carries `Score`, the `Best/Runs/Victories` line, `Ship: <quirk>` and `Unlocked: Scrap reserve`; with `loadProgress` returning a saved progress the lobby shows it. HUD: `clockLine` with the quirk name; the headline strings exact; `buildHudModel(..., progress)` null-safe.
- Gates: the survival and boarding gates now run with the seed's **natural quirk** (seed 1, 2 and 3 quirks recorded by name) and record their new figures against the Run-ii baseline; drift is attributed to the quirk and explained per seed; the Run-i lever list is re-authorised, in order, only for a seed whose crew-loss or hull-loss fails the gate. `gate-jump` and `gate-run` pass `{ quirk: QUIRK_NONE_FOR_GATES }` where that is the quirk index whose rule they do not exercise (use 3, Lucky Hull: no debris flies in those gates) so their end ticks stay 25200; both state why. Golden re-blessed once (version 15; the quirk stream and the two fields are hashed; the golden's natural quirk is recorded).
- Acceptance: `npm run acceptance 5 1` rows gain `score`.

## 9. Gate (`docs/gates.md`, entries start unchecked)

- [ ] `npm test` passes with the §8 tests; golden re-blessed once (natural quirk recorded).
- [ ] Survival and boarding gates pass on seeds 1-3 with each seed's quirk named and the figures recorded against the Run-ii baseline; levers recorded if any.
- [ ] `gate-jump` and `gate-run` pass at tick 25200 with the quirk override stated.
- [ ] `npm run acceptance 5 1`: three rows with `score`.
- [ ] Manual, two players: the lobby shows `Runs 0  Best 0`; the clock shows the quirk name; a lost run shows `Score`, the progress line, `Ship: <quirk>` and `Unlocked: Scrap reserve`; the next run starts with 30 scrap on the Navigation footer.
- [ ] `npm run typecheck`, `npm test`, `npm run build` pass on the final commit.

## 10. Known limitations

Every earned unlock applies with no choice; three unlocks and six quirks are a first authoring pass; progress is per machine and per browser profile (localStorage); clearing site data resets it.
