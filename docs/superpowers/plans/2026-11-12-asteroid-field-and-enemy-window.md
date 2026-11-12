# Asteroid Fields and the Enemy Ship Window (Demo-viii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Asteroid-field nodes; an FTL-style enemy ship window whose ship visibly burns, breaches and is crewed; shots drawn between the two ships.

**Architecture:** Sim: a node type and a field clock in `run`, three last-shot fields in `weapons`, two interior arrays in `enemy`, all flattened (SIM_VERSION 20). Render: a pure `enemyWindowModel` (state → picture data) and a Pixi `enemyWindow` layer drawn above the HUD panels in the right column; the projectile model takes the enemy-shot origin from the window model.

**Tech Stack:** TypeScript, Pixi 8.19, vitest (node). Run single files with `npx vitest run tests/<file>.test.ts`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-12-asteroid-field-and-enemy-window-design.md`. Section 5 Amendments override earlier text (I1–I5 and any later ones).
- `SIM_VERSION` 19 → 20; version-19 snapshots rejected; `npm run bless` exactly once, in Task 7.
- Values: `ASTEROID_CHANCE 0.15`, `EVENT_CHANCE 0.25` (was 0.35), `SHOP_CHANCE 0.25`; `FIELD_INTERVAL 4` ±20%, `FIELD_FLIGHT 10` ±2, `FIELD_SECONDS 60`, field clears at +72 s, `FIELD_REWARD_SCRAP 20`; `ENEMY_ROOMS 5` (0 Weapons, 1 Engines, 2 Shields, 3 Bridge, 4 Hold); `ENEMY_HIT_FIRE 0.35`, `ENEMY_HIT_BREACH 0.15`, `ENEMY_FIRE_SECONDS 15`, `ENEMY_BREACH_SECONDS 20`, `ENEMY_FIRE_HULL_DPS 0.3`, `ENEMY_FIRE_SYS_DPS 1.5`, `ENEMY_BREACH_HULL_DPS 0.2`. Window: x 1032, y 114, 240 × 342; slide-in 0.5 s, break-up 1.2 s, fly-out 0.8 s; our bolt 0.4 s.
- Gates are re-recorded (node types shift): record before (Task 1 step 1) and after (Task 7); no floor lowered; on a failure stop and report.
- No FTL art: the enemy ship, glyphs and crew figures are original drawings; the existing fire animation asset may be reused.
- Committed tests print nothing. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: The Asteroid node type

**Files:** `sim/run.ts` (`NodeType`, `assignNodeTypes`, `navRows`/`nodeLabel` text), `sim/tuning.ts`, `render/hudModel.ts` (map model: node kind), `render/mapPanel.ts`; Test: `tests/map.test.ts`, `tests/run.test.ts`

- [ ] **Step 1:** Record the gate figures (survival, duo, boarding, cutter, jump, run, `npm run acceptance 5 1`) to `.superpowers/sdd/demo-viii-gates-before.md`, then restore any temporary edits.
- [ ] **Step 2: Failing tests:** `assignNodeTypes` with a stub draw returns Shop below 0.25, Event below 0.5, Asteroid below 0.65, else Hazard; the map draw count for a seed is unchanged (same `edgeMask` and `colNodes` as before for seeds 1–3); the guaranteed shop still holds; the Navigation row for an asteroid node reads `Asteroid field`; the map model marks each node's type.
- [ ] **Step 3:** Run, expect FAIL.
- [ ] **Step 4: Implement**; map glyph: three small irregular rocks (original) inside the node circle for Asteroid nodes; Event and Shop keep today's look.
- [ ] **Step 5:** Run, PASS. Commit `feat: asteroid field nodes on the map`.

### Task 2: The field encounter

**Files:** `sim/run.ts` (`jumpShip`, run state), `sim/state.ts`, `sim/flatten.ts`, `sim/debris.ts` (`spawnObject` flight parameters: export a `spawnFieldRock`), `sim/step.ts` (call a new `fieldSystem` right after the director), `sim/tuning.ts` (SIM_VERSION 20), `render/hudModel.ts` (`runNotice`); Test: `tests/run.test.ts`, `tests/notice.test.ts`, `tests/snapshot.test.ts`

**Interfaces — Produces:** `run.fieldNextTick: number` (−1 none); `fieldSystem(state): void`; `spawnFieldRock(state): number`.

- [ ] **Step 1: Failing tests** (spec section 1 and section 3 field bullets): no enemy and field start at +8 s; spawns every 4 s ± 20% with one hazards draw per re-arm; the rock flight 10 ± 2 s; spawning stops at +60 s after the start; clear at +72 s with +20 scrap, `driveBoost 1`, `encountersWon + 1`, `encounter 3`; an early jump gives `encounter 4`, no reward, `fieldNextTick −1`; a full debris table skips the spawn and makes no draw; the notices `Asteroid field ahead`, `FIELD CLEARED   +20 scrap` / `Drive charging fast`, `Left the field`; the snapshot round trip with `fieldNextTick`; version 19 rejected.
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3: Implement.** The field start is the encounter's Pending → Fighting transition at `encounterTick + 8 s` (no enemy arrival involved); the clear time is computed from the start tick, not stored.
- [ ] **Step 4:** Run run, notice, snapshot, director, debris tests: PASS (golden fails on version only until Task 7).
- [ ] **Step 5:** Commit `feat: asteroid fields: a minute of incoming rocks, cleared for scrap and a fast drive`.

### Task 3: Our last shot, recorded

**Files:** `sim/weapons.ts` (`fireWeapon`), `sim/state.ts`, `sim/flatten.ts`; Test: `tests/weapons.test.ts`, `tests/torpedoes.test.ts`, `tests/snapshot.test.ts`

**Interfaces — Produces:** `weapons.lastShotTick` (−1), `weapons.lastShotTarget` (the cursor slot fired at: a debris slot, `ENEMY_SLOT` for the hull row, or an enemy system slot), `weapons.lastShotResult` (0 miss, 1 stripped, 2 hit), `weapons.lastShotKind` (0 beam, 1 torpedo).

Note: the spec names an enemy system index for the target; recording the cursor slot instead also covers shots at asteroids (a bolt to the rock). Record this as an implementation amendment.

- [ ] **Step 1: Failing tests:** each of beam miss, beam strip, beam hit on a system, beam hit on debris, torpedo hit, torpedo miss writes the four fields on the firing tick; a refused fire (no charge, no target) writes nothing; snapshot round trip.
- [ ] **Step 2–4:** FAIL, implement, PASS. Commit `feat: the sim records our last shot for the renderer`.

### Task 4: The enemy interior

**Files:** `sim/enemy.ts` (`damageEnemy`, `enemySystem`, `arrive`, `leave` guard), `sim/weapons.ts` (the draws after a hit), `sim/state.ts`, `sim/flatten.ts`, `sim/tuning.ts`; Test: `tests/enemy.test.ts`, `tests/combat.test.ts`, `tests/snapshot.test.ts`

**Interfaces — Produces:** `enemy.roomFire: Float64Array(5)`, `enemy.roomBreach: Float64Array(5)`; `enemyRoomOfHit(state, slot): number`; `interiorStep(state): boolean` (true when the enemy was destroyed this tick).

- [ ] **Step 1: Failing tests** (spec section 2b and amendments I1–I4): a system hit lands in its room; a hull hit lands in the Bridge or Hold by one combat draw; misses and strips make no extra draw; the fire threshold 0.35 and breach threshold 0.85 on the problem draw; a fire deals 0.3 hull and 1.5 system health per second and can bring a system to 0 with the self-repair and shield rules; a breach adds 0.2 hull per second and delays self-repair one tick per tick; timers expire; interior damage never voids a surrender; interior damage to 0 hull calls `leave(state, true)` once and is a kill with the win reward; no shot fires on the tick the enemy dies; a second `leave` call is a no-op; arrays cleared on arrive and leave; snapshot round trip and hash.
- [ ] **Step 2–4:** FAIL, implement (the interior step first in `enemySystem` for a present enemy), PASS: enemy, combat, weapons, snapshot.
- [ ] **Step 5:** Commit `feat: our hits start fires and breaches aboard the enemy, which burn its hull and systems`.

### Task 5: The enemy window model

**Files:** Create `render/enemyShipLayout.ts`, `render/enemyWindowModel.ts`; modify `render/projectileModel.ts` (the Shot origin); Test: create `tests/enemyWindowModel.test.ts`; extend `tests/projectileModel.test.ts`

**Interfaces — Produces:**
- `ENEMY_LAYOUT`: tile rows (about 7 × 11, bow up) and five room rectangles indexed as `ENEMY_ROOMS`, doors, the three console tiles.
- `enemyWindowModel(state, nowTick, anim): EnemyWindowView` where `EnemyWindowView = { visible; phase: 'arriving' | 'present' | 'destroyed' | 'leaving'; t: number; rooms: { rect; glyph | null; tint: 'normal' | 'damaged' | 'down'; hp: number | null; repairIn: number | null; fire: boolean; breach: boolean }[]; shield: { layers; max; down; flash }; hullPips: { lit; total }; frequency: string | null; charge: number | null; status: string; problem: string | null; reticle: { room: number } | { hull: true } | null; crew: { x; y; working: boolean }[]; bolt: { from; to; t; result; kind } | null }`, all in window pixels.
- `windowRoomCentre(room): { x; y }` in internal (screen) pixels, used by `projectilePath` for Shots (from the Weapons room).
- Status lines: `ENEMY`, `ENGINES DOWN`, `SURRENDERING 8s  hold fire` (a fleeing enemy with `surrenderIntact`), `FLEEING 8s`; problem line `FIRE: Shields` / `BREACH: Engines`, most recent first.

- [ ] **Step 1: Failing tests:** every room inside 240 × 342; tints and the repair countdown; pips at 0, 35%, 100% hull; each status line; the problem line; the reticle for a system slot and the hull slot while Weapons is seated, null otherwise; crew at their consoles, and the nearest one in a burning room; the bolt from our Weapons room to the target room (or the rock's position for a debris slot) with `t` over 0.4 s after `lastShotTick`, null after; a Shot's projectile origin equals the window's Weapons room centre.
- [ ] **Step 2–4:** FAIL, implement, PASS. Commit `feat: the enemy window model (pure)`.

### Task 6: The enemy window layer and the HUD

**Files:** Create `render/enemyWindow.ts`; modify `render/renderer.ts` (layer above the HUD, fed by state each frame, cleared by `reset()`), `render/hud.ts` (remove the enemy panel; the map panel visible only when no enemy window is shown or a player sits at Navigation), `render/hudModel.ts` (drop `HudEnemy` and `enemyBlock` if unused; keep the threat line); delete `render/enemyPanel.ts`; Test: `tests/hud.test.ts`, `tests/render.test.ts` (or the existing render-pure tests)

- [ ] **Step 1: Failing tests:** the HUD hides the map while the enemy window shows and no one is at Navigation, and shows it otherwise; the enemy panel is gone; the layer's draw makes no new Graphics per frame after the first (count children across 60 frames).
- [ ] **Step 2–4:** FAIL, implement the drawing (walls, floors, glyphs, the fire animation, breach holes, crew figures in an original enemy colour, shield ellipses, pips, charge bar, status and problem lines, the reticle, bolts and bursts, slide-in, break-up into 4–6 drifting pieces, fly-out), PASS; `npm run build`.
- [ ] **Step 5:** Commit `feat: the FTL-style enemy ship window`.

### Task 7: Gates, bless, docs, visual check

- [ ] **Step 1:** Re-run every gate and `npm run acceptance 5 1`; record before → after with the cause in the spec amendments and `docs/gates.md`; no floor lowered (stop and report on a failure).
- [ ] **Step 2:** `npm run bless` once (cause: SIM_VERSION 20, node types, fields, weapons and interior fields); `npm test`, `npm run typecheck`, `npm run build`.
- [ ] **Step 3: Visual check** with the Playwright driver (scratchpad `drive/`; `enc.mjs` waits for the first enemy at about 270 s with two players). Screenshot: the window during a fight; P2 seated at Weapons (find the cutter's weapons console tile in `cutter.json`) with the reticle, firing at least once (our bolt); an enemy shot leaving the window; a fire aboard the enemy if one starts; P1 seated at Navigation showing the map instead; nothing overlapping. An asteroid field needs a jump to one: if the first column offers none, note it and rely on the tests.
- [ ] **Step 4:** Spec amendments, `docs/gates.md` Demo-viii entry, roadmap item 18. Commit `docs: Demo-viii gate figures, amendments and visual check`.
