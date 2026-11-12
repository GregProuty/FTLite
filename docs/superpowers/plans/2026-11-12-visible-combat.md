# Visible Combat and Sound (Demo-ii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repaired consoles come back powered when the reactor can spare a bar, the enemy is drawn with its shield ring and weapon bar, and seven synthesized cues give the ship a voice, per `docs/superpowers/specs/2026-11-12-visible-combat-design.md`.

**Architecture:** Task 1 changes the sim (`repairStation`, `enemy.lastHitTick`, SIM_VERSION 17) and re-blesses; Task 2 adds the pure HUD model pieces (`unpowered`, `enemy` block, `enemyLabel`) and the Pixi enemy panel; Task 3 adds the pure cue detector, the session hook, the synth and the main-process wiring; Task 4 is docs. The spec's exact values and strings are binding; the tasks below point at them.

**Tech Stack:** TypeScript ~5.8, vitest 3 (node), Pixi 8.19 (hud.ts/enemyPanel.ts), Web Audio (app/audio.ts only). No new dependencies.

## Global Constraints

- `tests/boundary.test.ts` green; sim files ASCII; `hudModel.ts` pixi-free; every test under node; `app/audio.ts` is the only file that touches `AudioContext`, and it works with none present.
- Sim (exact): `repairStation` clears `failed` and `repair`, then for every kind except Engineering sets `level = powerPool(state) >= 1 ? 1 : 0` (Engineering keeps its level). `enemy.lastHitTick: number` (initial −1 in the state literal; `arrive` sets −1; `damageEnemy` sets `state.tick`; the shield-strip branch of `fireWeapon` sets `state.tick`; `leave` sets −1; the test helper `placeEnemy` sets −1). Flatten order of the enemy section becomes: `present, hull, stableId, nextArrivalTick, nextShotTick, departTick, sysHp[3], sysRepairTick[3], shieldFreq, scanned, scan, maxHull, shieldLayers, shieldRecharge, shotArmTick, fleeing, surrenderIntact, lastHitTick` (`ENEMY_FIELDS = 22`), mirrored in `unflatten`; hashed. The repair rule alone changes no shape; the new field requires `SIM_VERSION = 17` (version-16 snapshots rejected). No draws added. Golden re-blessed **once**, in Task 1, after the gates (cause: version 17 and the repair rule).
- HUD model (exact, spec §3-§4): `HudStation.unpowered` and `EngineeringPanel.rows[].unpowered`; `HudModel.enemy` block built from the state as §4 writes it, `null` without an enemy; `enemyLabel(e)` = `FLEE ${fleeSeconds}s` while `fleeSeconds > 0`, else `ENGINES DOWN` while `enginesDown`, else `ENEMY`; `HIT_FLASH_TICKS 12`. Card line 4 = `Hold Interact next to a fire, a breach, a failed console or a downed friend. Repaired consoles need a bar`.
- Enemy panel (exact, spec §4): 120 × 100 at top-left `(INTERNAL_W − 360, 4)`, visible only with an enemy; silhouette polygon 56 × 24 centred (60, 40), `DIM`/`WARN` on `hitFlash`; rings centred (60, 40) with radii (30, 24) and (36, 30), 2 px, `TEXT` up / `FAINT` down, none while `shieldsDown`; weapon bar 100 × 6 at (10, 80), `WARN` at `>= 0.8`, hidden while `weaponsDown`; hull bar 100 × 4 at (10, 90); label at (6, 2).
- Cues (exact, spec §5): `CueCounters` field sources; `audioCues` order `alarm, impact, shot, hit, ready, jump, victory, defeat`, at most one of each, edges as written; the session computes cues once after the tick loop in the running branch inside the `try`; `prevCounters` reset in `start()`; `playCue?` optional dep. Synth table and `MASTER_GAIN 0.25`; `unlock()` guarded; `main.ts` wiring; `webPreferences.autoplayPolicy: 'no-user-gesture-required'`.
- Gates: survival, duo, boarding, jump, run and the acceptance soak re-run in Task 1 and recorded (cause: repairs return powered). The acceptance live test in `tests/acceptance.test.ts` asserts the **four-player** record's `nodesReached >= 2` today: change it to `>= 3`, run the test; if it passes keep 3, if it fails revert to 2 and record the four-player row's `nodesReached` and the reason (the two-player floor stays 3).
- Commits: imperative, `feat:`/`test:`/`docs:`, ending `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. `npm run typecheck`, `npm test`, `npm run build` at the end of every task.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/{power,enemy,weapons,state,flatten,tuning}.ts`, `tests/helpers/sim.ts` | Task 1. |
| `src/renderer/src/render/{hudModel,hud}.ts`, `src/renderer/src/render/enemyPanel.ts` (new) | Task 2. |
| `src/renderer/src/app/audioCues.ts` (new), `src/renderer/src/app/audio.ts` (new), `src/renderer/src/app/session.ts`, `src/renderer/src/main.ts`, `src/main/index.ts` | Task 3. |
| `docs/gates.md`, the spec, `docs/roadmap.md`, `docs/playtest.md` (step 4's `See:` mentions the `OFF` tag) | Task 4. |

---

### Task 1: Powered repairs and the hit stamp (sim)

**Files:** modify `power.ts`, `enemy.ts`, `weapons.ts`, `state.ts`, `flatten.ts`, `tuning.ts`, `tests/helpers/sim.ts`, `tests/power.test.ts`, `tests/combat.test.ts` (or `tests/enemy.test.ts`), `tests/snapshot.test.ts`, `tests/gate-*.test.ts` only if a fixture pins the old repair level, `tests/golden/basic.json` (re-bless).

- [ ] **Step 0: Baseline.** Record the five gates' figures and `npm run acceptance 5 1` rows (temporary logs, then `git checkout`).
- [ ] **Step 1: Tests (RED).** Repair: `failStation(s, wpn)` then `repairStation(s, wpn)` with a free bar → `level 1, failed 0`; with the pool empty → `level 0` (empty the pool first: loop over every non-Engineering station index in order calling `shiftBar(s, i, 1)` until it returns false for all, then `expect(powerPool(s)).toBe(0)`; the starter's seven consoles can hold 14 bars against a 10-bar reactor, so this terminates with the pool at 0); Engineering keeps its level; a scripted sequence that fails and repairs each console in turn (seeds 1-3) keeps `powerUsed(s) <= powerCapacity(s)` after every repair; the existing power tests that pin "comes back at level 0" are updated to the pool rule (name them in the report). `lastHitTick`: −1 after `placeEnemy`; `=== state.tick` after `damageEnemy(s, ENEMY_SLOT, 15)` (the shared stamp), after a shield strip through `fireWeapon` (reuse the strip fixture of `tests/combat.test.ts`), and after a torpedo hit (`w.selector = Weapon.Torpedo; w.torpedoLoaded = 1; fireWeapon` with a seeded hit as the combat tests do); −1 after `leave`; round-trips and changes the hash; version-16 rejection.
- [ ] **Step 2: Implement.** `power.ts repairStation`; `state.ts` field (`lastHitTick: -1`) and `SIM_VERSION 17` in tuning; `flatten.ts` `ENEMY_FIELDS 22` with put/get after `surrenderIntact`; `enemy.ts`: `arrive` sets −1, `leave` clears, `damageEnemy` stamps `state.tick`; `weapons.ts` strip path stamps `state.tick`; `tests/helpers/sim.ts placeEnemy` sets −1.
- [ ] **Step 3: Gates, soak, re-bless.** Re-run the five gates and the acceptance soak with temporary logs; record before/after per seed; retry the four-player floor at 3 in `tests/acceptance.test.ts` (keep 2 if it fails, record why); `npm run bless` once; `npm test`, `npm run typecheck`, `npm run build`.
- [ ] **Step 4: Commit** `feat: a repaired console comes back with one bar when the reactor can spare it; the enemy remembers its last hit for the HUD; SIM_VERSION 17 (golden re-blessed)`.

---

### Task 2: HUD model and the enemy panel

**Files:** modify `hudModel.ts`, `hud.ts`, `tests/hud.test.ts`; create `render/enemyPanel.ts`.

- [ ] **Step 1: Tests (RED)** per spec §7 "HUD" and "Enemy block": `unpowered` cases; card line 4 exact and `<= 90`; `enemy` null without an enemy; the §7 block after one strip at column 5 with `hitFlash` true on the strip tick and false 12 ticks later; `enemyLabel` cases; any whole-model deep-equal test gains `enemy: null`.
- [ ] **Step 2: Implement.** `hudModel.ts`: the two `unpowered` flags, the `enemy` block in the returned model, `enemyLabel`, the card line; `hud.ts`: the Engineering console rows print `OFF` for `unpowered` rows (status). `enemyPanel.ts` exports `createEnemyPanel(): { root: Container; update(e: HudModel['enemy']): void }`: `hud.ts`'s `createHud` calls it once, adds `root` to the HUD `parent` at `(INTERNAL_W − 360, 4)`, and `hud.update(m)` calls `panel.update(m.enemy)` every frame (`root.visible = !!e`; `Graphics` cleared and redrawn per update; cheap at this size). Drawing and placement have no automated test (as for every `hud.ts` placement): they are the manual gate; the model and `enemyLabel` are tested.
- [ ] **Step 3: Verify and commit** `feat: the enemy is drawn: a silhouette with its shield ring, weapon bar and hull bar; Engineering rows mark unpowered consoles OFF; the card says repaired consoles need a bar`.

---

### Task 3: Cues, session hook, synth, wiring

**Files:** create `app/audioCues.ts`, `app/audio.ts`; modify `app/session.ts`, `main.ts`, `src/main/index.ts`, `tests/session.test.ts`; create `tests/audioCues.test.ts`.

- [ ] **Step 1: Tests (RED)** per spec §7 "Cues" (the exact before/after pairs and the full-set order) and "Session": the harness gains `const cues: Cue[] = []`, passes `playCue: (c) => { cues.push(c); }` to `createSession`, and returns `cues`; the seven session cases as the spec lists them (the two-alarm-sources case uses `armSpawn` plus `boarders.nextArrivalTick = tick + 1`, not two `armSpawn` calls, which would only reset one timer).
- [ ] **Step 2: Implement.** `audioCues.ts` (`Cue`, `CueCounters`, `cueCounters`, `audioCues`); `session.ts`: `playCue?` dep, `prevCounters` reset in `start()`, and the detection placed **after the `for` loop over ticks and inside the same `try`**, not inside the `if (state.ended)` branch (so the ending frame emits every cue of that frame including the terminal one, and game-over frames, which never enter the running branch, emit nothing); `audio.ts` (`createAudio` with the synth table, `MASTER_GAIN`, guarded `unlock`, no-op without `AudioContext`); `main.ts` wiring and the unlock listeners; `src/main/index.ts` adds `autoplayPolicy: 'no-user-gesture-required'` inside the existing `webPreferences` object.
- [ ] **Step 3: Verify and commit** `feat: seven synthesized audio cues (alarm, impact, shot, hit, ready, jump, victory, defeat) from a pure cue detector over the run's counters; the session plays them once per edge`.

---

### Task 4: Docs

- [ ] Append the spec's §8 gate section to `docs/gates.md` using only the figures Task 1's report recorded (before/after per seed for the five gates, the acceptance rows, the four-player floor outcome, the golden hash; no invented values), the manual row unchecked. Append `## 10. Amendments from the plan` to the spec recording: the version bump to 17 is for `lastHitTick` (the repair rule alone would not bump it); the exact flatten order; the two-alarm-sources session fixture replacing "two spawns"; the enemy panel's ownership (`createEnemyPanel` called by `createHud`, updated per frame); the pool-emptying test technique; any fixture arithmetic corrected and any gate drift observed. `docs/playtest.md` step 4's `See:` adds "a repaired console comes back with one bar, or reads OFF until Engineering gives it one". `docs/roadmap.md` item 12 → `in review`. Verify and commit `docs: Demo-ii gate figures, amendments, playtest and roadmap`.
