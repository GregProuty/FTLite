# Airlocks, Remote Venting and Visible Asteroids (Demo-vii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Airlocks on the cutter's hull that the Doors console opens remotely to vent rooms, held-open interior doors to route the venting, a readable Doors card, and asteroids and enemy shots drawn flying in and hitting.

**Architecture:** Sim changes are confined to the ship schema and derived tables, door states, the oxygen step and the Doors console; all stay deterministic and snapshot-safe (SIM_VERSION 19). Projectiles are a render-only layer driven by the existing debris table, with pure motion math in a model module.

**Tech Stack:** TypeScript, zod, Pixi 8.19, vitest (node). Run single files with `npx vitest run tests/<file>.test.ts`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-12-airlocks-and-asteroids-design.md` (binding; section 5 Amendments records every deviation).
- `SIM_VERSION` 18 → 19; version-18 snapshots rejected; `npm run bless` exactly once, in Task 9.
- `starter.json` gets no airlocks: every gate keeps its mechanics; figures are recorded before (Task 1 step 1) and after (Task 9) and must match unless the amendment explains why.
- `DoorState` gains `HeldOpen: 3`. Every place that tests `DoorState.Open` uses a new helper `doorIsOpen(st)` (true for Open and HeldOpen) unless it deliberately means auto-open only.
- `AIRLOCK_PASSAGE = PASSAGE_OPEN`, `ASTEROID_SHOW_SECONDS = 6`, `SHOT_SHOW_SECONDS = 1.2`, shake 4 px (asteroid) / 3 px (shot) over 0.25 s, evade fade 0.6 s, fragments 8 to 12.
- Cutter airlocks: `T` (12,0), `X` (12,12), `E` (0,6), `F` (24,4), each a hull `#` adjacent to its room with space or out of bounds beyond.
- Committed tests print nothing. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Airlocks in the ship schema, derived tables and the cutter

**Files:**
- Modify: `src/renderer/src/sim/ship/schema.ts`, `src/renderer/src/sim/ship/derived.ts`, `src/renderer/src/sim/ship/cutter.json`
- Test: `tests/ship.test.ts`, `tests/cutter.test.ts`

**Interfaces — Produces:** layout field `airlocks: { room: string; tile: [number, number] }[]` (zod `.default([])`); `Derived.airlockRoom: Int16Array`, `Derived.airlockTile: Int32Array`, `Derived.airlockOfTile: Int16Array` (tile → airlock index, −1).

- [ ] **Step 1: Record the gate figures.** Run `npx vitest run tests/gate-survival.test.ts tests/gate-duo.test.ts tests/gate-boarding.test.ts tests/gate-cutter.test.ts tests/gate-jump.test.ts tests/gate-run.test.ts` with a temporary `process.stdout.write` of each figure line (the assertion messages already carry min health), save them to `.superpowers/sdd/airlocks-gates-before.md`, restore the test files.
- [ ] **Step 2: Failing tests** in `tests/ship.test.ts`:

```ts
describe('airlocks (spec Demo-vii section 1)', () => {
  const base = () => structuredClone(starterJson);   // the starter's JSON, imported as the existing tests do
  it('defaults to none and the starter has none', () => { expect(parseShip(base()).airlocks).toEqual([]); });
  it('keeps a valid airlock: an outer hull wall tile next to exactly one room, space or out of bounds beyond', () => {
    // Pick the tile from the starter rows: an outer-boundary '#' (row 0, the last row, column 0 or the last column) whose single
    // inward neighbour is a room tile. Do NOT use (2,10): it is interior and touches several rooms (Codex plan review 1).
    const s = base(); s.airlocks = [{ room: ROOM, tile: [TX, TY] }];
    expect(parseShip(s).airlocks).toEqual([{ room: ROOM, tile: [TX, TY] }]);   // fails today: zod strips the unknown key
  });
  it('rejects a tile that is not a wall, not next to its room, interior, or duplicated', () => { /* four parseShip throws with /airlock/ messages */ });
});
```

  and in `tests/cutter.test.ts`: the cutter parses with four airlocks in rooms T, X, E, F; `deriveLayout(cutter).kEff` equals the value without airlocks (4.390243902439026).
- [ ] **Step 3: Run, expect FAIL**: the preservation test fails because zod strips the unknown `airlocks` key today, and the rejection tests fail because nothing validates it. (The default-to-empty test may already pass; that is fine.)
- [ ] **Step 4: Implement.** Schema: `airlocks: z.array(z.object({ room: z.string().length(1), tile })).default([])`; in `superRefine`: unknown room; `at(tile) === '#'`; exactly one orthogonal neighbour is a tile of `room`; the neighbour opposite that room tile is out of bounds or `' '` (spec amendment 4); no duplicate tile and no tile shared with a breach site. Record the verified orientation of each cutter airlock (amendment 5) in a code comment beside the JSON loader test. Derived: fill the three arrays; push `airlockRoom, airlockTile` into the layout-hash codes (after the sites) and the count into the header codes; add `AIRLOCK_PASSAGE` per airlock to `maxCond` of its room. Cutter: add the four entries.
- [ ] **Step 5: Run, expect PASS**; also `npx vitest run tests/golden.test.ts` (unchanged: starter hash untouched).
- [ ] **Step 6: Commit** `feat: airlocks in the ship schema and four on the cutter`.

### Task 2: Airlock state, HeldOpen and snapshots

**Files:** `sim/grid.ts`, `sim/state.ts`, `sim/flatten.ts`, `sim/tuning.ts`; Test: `tests/snapshot.test.ts`, `tests/state.test.ts`

**Interfaces — Produces:** `DoorState.HeldOpen = 3`; `doorIsOpen(st: number): boolean` exported from `grid.ts`; `state.airlocks: { open: Uint8Array }`; `SIM_VERSION = 19`; `AIRLOCK_PASSAGE`.

- [ ] **Step 1: Failing tests:** a round trip preserves `airlocks.open` on a cutter state and a door in `HeldOpen`; the hash differs when one airlock flips; a version-18 snapshot is rejected; `doorIsOpen` true for Open and HeldOpen only.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** `FLATTEN_MANIFEST` gains `'airlocks'` after `'doors'`; the size formula adds the airlock count; put/get after the doors block. `solidAt` uses `!doorIsOpen(...)`.
- [ ] **Step 4: Run snapshot, state, golden** (golden now fails on the version only: expected until Task 9; note it, do not bless).
- [ ] **Step 5: Commit** `feat: airlock state, a held-open door state, SIM_VERSION 19`.

### Task 3: Door rules for HeldOpen

**Files:** `sim/doors.ts`, `sim/grid.ts` (`solidAt`, line 16, if Task 2 has not already switched it), `sim/hazards/oxygen.ts`, `sim/hazards/fire.ts` (via `passageFor`), `sim/bot.ts`, `sim/boarders.ts`, `render/doorAnim.ts` (`doorTarget`, line 5), `render/tiles.ts` (the open-jamb branch, line 43); Test: `tests/doors.test.ts`, `tests/oxygen.test.ts`, `tests/fire.test.ts`, `tests/movement.test.ts` (a crew member walks through a HeldOpen door), `tests/doorAnim.test.ts` (HeldOpen animates and draws as open)

- [ ] **Step 1: Failing tests:** a HeldOpen door with nobody near stays HeldOpen for 600 ticks; `passageFor` gives `PASSAGE_OPEN`; fire spreads across it at the open rate; local Interact (`toggleSeal`) on HeldOpen seals it, deferred while a crew member stands on the tile (the deferred request must still complete: `doorSystem` processes `sealRequested` before skipping HeldOpen); the Leaky Seals quirk multiplier does not apply to HeldOpen.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** `doorSystem`: after the sealRequested branch, `if (state === HeldOpen) continue`. `passageFor`: `doorIsOpen(st) → PASSAGE_OPEN`. Boarders and bots already test only `Sealed`: confirm with a test or a comment.
- [ ] **Step 4: Run doors, oxygen, fire, boarders, bot tests: PASS.**
- [ ] **Step 5: Commit** `feat: held-open doors stay open and count as open for movement, oxygen and fire`.

### Task 4: Venting through open airlocks

**Files:** `sim/hazards/oxygen.ts`; Test: `tests/oxygen.test.ts`

- [ ] **Step 1: Failing tests** (cutter state, quiet): open the Engines airlock with its doors closed: Engines' oxygen fraction falls below `FIRE_SHRINK_FRAC` within 30 s, and a fire started there reaches exactly 0 intensity (`state.rooms.fire[room] === 0`) after continued hazard steps (Codex plan review 6); `injected − breathed − burned − vented` conservation holds to the existing epsilon; a closed airlock vents nothing over 600 ticks; life support injects nothing into a room with an open airlock (as for a breached room); the airlock tile is solid open or closed (`solidAt`).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** a separate vent pass after the breach-site pass, in ascending airlock index (spec amendment 7): for each open airlock, `vent = k * AIRLOCK_PASSAGE * frac[room] * dt` into the same `demand` and, after scaling, `c.vented`. `roomBreached` (or a new `roomVenting`) covers open airlocks for the injection rule.
- [ ] **Step 4: Run oxygen, lifeSupport, fire: PASS.**
- [ ] **Step 5: Commit** `feat: an open airlock vents its room to space`.

### Task 5: Doors console commands and the fail-safe

**Files:** `sim/console.ts`, `sim/stations.ts` (cursor init), `sim/doors.ts`, `sim/state.ts` (scratch); Test: `tests/console.test.ts`

**Interfaces — Produces:** in `sim/doors.ts`: `doorsCursorCount(state): number` (= `doorEdges.length + airlockCount`) and `doorsCursorTarget(state, c): { kind: 'door'; edge: number } | { kind: 'airlock'; index: number } | null` (spec amendment 3); scratch sets `doorCycles: Set<number>` (remote, interior door edges) and `airlockToggles: Set<number>`, applied at the end of `consoleSystem` in ascending order: local `doorToggles`, then `doorCycles`, then `airlockToggles` (amendment 2). Routing of Confirm on an interior door (Codex plan review 3): while the Doors station is **offline**, Confirm keeps today's exact path (`doorToggles` → `toggleSeal`: Auto ↔ Sealed), so a sealed door can still be unsealed and an open one sealed with no power. While **online**, Confirm queues the door in `doorCycles`: Auto → HeldOpen → Sealed → Auto. Airlock commands are queued only while online. The fail-safe is the first thing `doorSystem` does. Add tests: offline Confirm unseals a sealed door and seals an auto door (today's behaviour); offline Confirm never produces HeldOpen.

- [ ] **Step 1: Failing tests:** the cursor walks every door, then every airlock, then wraps (both directions); Confirm on a door cycles Closed/Open → HeldOpen → Sealed → Closed; Confirm on an airlock toggles it; with the Doors station offline Confirm on an airlock or a hold does nothing; when the station goes offline (power to 0, or failed) every airlock closes and every HeldOpen door becomes Closed on that tick; the remote seal of today keeps its behaviour; `lastDoorToggleTick` updates on every command; starter (no airlocks) behaves exactly as before.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Seat init: cursor 0 when `doorsCursorCount > 0`, else −1. The fail-safe runs at the start of `doorSystem`.
- [ ] **Step 4: Run console, doors, bot, golden-free suites: PASS.**
- [ ] **Step 5: Commit** `feat: the Doors console holds doors open and works the airlocks; a power loss closes them`.

### Task 6: Doors card and threats (HUD model + HUD)

**Files:** `render/hudModel.ts`, `render/hud.ts`; Test: `tests/hud.test.ts`, `tests/notice.test.ts` or the existing HUD-model test file

**Interfaces — Produces:** `DoorsPanel = { kind: 'doors'; item: string; status: string; action: string; openAirlocks: number } | { kind: 'doors'; item: null }`.

- [ ] **Step 1: Failing tests:** model strings for each state (`Door  Weapons / Aft Passage`, `Airlock  Engines`; `Auto`, `Held open`, `Sealed`, `Airlock closed`, `AIRLOCK OPEN`; `Hold open`, `Seal`, `Release`, `Open airlock`, `Close airlock`); `Open airlocks: 2`; the threat line `Airlock open: Engines`; the local confirm prompt on a HeldOpen door is `Seal door`; every string within the card's character budget (use the constant the other cards use).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**; the card draws item, status and action on three console rows (status tinted WARN when `AIRLOCK OPEN`) and the footer carries `Open airlocks: N` or nothing.
- [ ] **Step 4: Run, PASS.**
- [ ] **Step 5: Commit** `feat: the Doors card shows the selection, its state and the Confirm action; open airlocks are threats`.

### Task 7: Drawing airlocks, held doors and the console cursor

**Files:** `render/tiles.ts`, `render/doorAnim.ts`, `render/effects.ts` (vent particles); Test: `tests/doorAnim.test.ts`, `tests/renderPure.test.ts`

- [ ] **Step 1: Failing pure tests:** `doorTarget(HeldOpen) === 1`; a pure helper `airlockDraw(state, k)` returns `{ open, venting }` (`venting` while its room's fraction > 0.01); a pure helper `doorsCursorTile(state)` returns the tile of the seated Doors operator's selection (door or airlock, through `doorsCursorTarget`), or −1. The existing outline in `effects.ts` (it indexes `doorEdges[cursor]` directly) switches to `doorsCursorTile`; a test seats the operator with the cursor on an airlock and checks the outline helper returns that airlock's tile.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement:** airlock closed = two amber leaves on the hull tile; open = dark gap plus outward particles (in the effects layer, direction away from the room); HeldOpen door = open jambs plus a 2 px amber bar; a pulsing outline on the cursor tile.
- [ ] **Step 4: Run, PASS; `npm run build`.**
- [ ] **Step 5: Commit** `feat: draw airlocks, held doors and the Doors console's selection`.

### Task 8: Visible asteroids and shots (render only)

**Files:** Create `render/projectileModel.ts`, `render/projectiles.ts`; modify `render/renderer.ts` and the place that loads snapshots into the running game (find it: `grep -rn "fromSnapshot\|loadSnapshot\|restore" src/renderer/src`); Test: create `tests/projectileModel.test.ts`; extend `tests/debris.test.ts`

Snapshot reset (Codex plan review 4): `Renderer` gains `reset(): void`, which clears the projectile map and any shake; the snapshot-load path calls it. `shouldReset` stays as the fallback for jumps and new runs. If the app has no snapshot-load path at runtime, say so in the amendments and keep `reset()` for the run-restart path.

Sim facts first (Codex plan review 5): before writing the layer, add two tests to `tests/debris.test.ts`: a Shot that hits sets `rooms.impactTick[room]` to the tick; a Debris object that is evaded (seat a navigator, force the evade roll) leaves `rooms.impactTick[room]` unchanged. If either fails, stop and report: the outcome rule depends on them.

**Interfaces — Produces:** `projectilePath(stableId, kind, roomCentre: {x,y}, band): { from: {x,y}; to: {x,y} }`; `projectilePos(path, impactTick, tick, showSeconds): {x,y} | null`; `outcomeOf(tickNow, impactTick, roomImpactTick): 'hit' | 'destroyed' | 'evaded'` judged on the first frame the object is absent: `tickNow < impactTick` → destroyed (shot down); else `roomImpactTick >= impactTick` → hit; else evaded (spec amendments 8 and 9; no hull-drop inference). `evadePos(path, impactTick, tick)` continues at the arrival velocity, with alpha `1 − (tick − impactTick) / 36` until 0 (amendment 10). `shouldReset(prevTick, tick, prevNode, node)`: true when the node changes, the tick goes backwards, or it jumps forward by more than 120 ticks.

- [ ] **Step 1: Failing tests** (pure): position at `impactTick` equals the room centre; at `impactTick − show × 60` it lies outside the world band; never enters from the left; deterministic for a `stableId`; evade continues past the centre along the line; windows 6 s and 1.2 s; `outcomeOf` for the three cases. Shots set `rooms.impactTick` in `resolveImpact` (debris.ts), so no sim change.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the model, then the layer: a `Map<stableId, tracked>`; asteroid polygon (shape seeded from `stableId`, 14–22 px, slow spin, dust trail), shot bolt with trail; fragments, puff, evade fade; shake applied to the `world` container's position after `worldFit` and decayed per frame; cleared on run reset, jump (node change) and snapshot load. Added between `effects.above` and the HUD.
- [ ] **Step 4: Run, PASS; `npm run build`.**
- [ ] **Step 5: Commit** `feat: asteroids and enemy shots fly in and hit, miss or burst`.

### Task 9: Gates, bless, docs, visual check

- [ ] **Step 1:** Re-run every gate; compare with `.superpowers/sdd/airlocks-gates-before.md`; any difference explained in the amendments (no floor lowered; on a failure, stop and report).
- [ ] **Step 2:** `npm run bless` once (cause: SIM_VERSION 19); `npm test`, `npm run typecheck`, `npm run build` all clean.
- [ ] **Step 3:** Visual check with the Playwright driver (scratchpad `drive/`, patterns in `doors.mjs` and `enc.mjs`): seat P1 at Door Control, cursor to the Engines airlock, open it, screenshot the card and the venting hull; an asteroid in flight if one comes within 3 minutes. Fix anything overlapping.
- [ ] **Step 4:** Spec amendments; `docs/gates.md` Demo-vii entry; roadmap item 17.
- [ ] **Step 5: Commit** `docs: Demo-vii gate figures, amendments and visual check`.
