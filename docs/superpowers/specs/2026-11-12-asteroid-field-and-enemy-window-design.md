# Asteroid Fields and the Enemy Ship Window (Demo-viii) Design

Status: 2026-11-12. The user: "add an asteroid field type. also i want FTL style ship combat where the other ship appears in its own window". Parents: Run-i (map, node types), Demo-vi (encounters), Demo-vii (visible asteroids and shots), Combat-i/ii and Demo-i section 11 (enemy, weapons, shields), Demo-ii (enemy panel).

Foundation spec section 12 still applies: no FTL art. The enemy ship, its rooms and every icon are original drawings.

## 1. Asteroid field nodes (sim)

**Node type.** `NodeType.Asteroid = 3`. `assignNodeTypes` keeps one map-stream draw per middle-column node and maps it as: `u < SHOP_CHANCE` (0.25) Shop; `< SHOP + EVENT` with `EVENT_CHANCE` lowered to **0.25** Event; `< SHOP + EVENT + ASTEROID_CHANCE` (**0.15**) Asteroid; else Hazard (0.35). The guaranteed-shop rule is unchanged. The draw count does not change, so map shapes stay the same and only types shift; the gates are re-recorded.

**Encounter.** An asteroid field uses the Demo-vi encounter states with no enemy:
- On the jump in, `encounter = 1`, `enemy.nextArrivalTick = NEVER`, and the field starts `ENCOUNTER_START` (8) seconds later: `encounter = 2`, `encounterTick = tick`.
- While `encounter === 2` at an Asteroid node, the field spawns one debris object every `FIELD_INTERVAL` seconds (4, jittered ±20% with one `rng.hazards` draw per re-arm), flight `FIELD_FLIGHT` (10 ± 2 s) instead of `DEBRIS_FLIGHT`, through the existing `spawnObject` path (same draws per object). A full debris table skips that spawn (no draw).
- New run state: `fieldNextTick` (−1 when no field), flattened after the Demo-vi run fields; `SIM_VERSION 20`.
- Spawning stops `FIELD_SECONDS` (60) after the field starts. The field is **cleared** `FIELD_SECONDS + 12` seconds after it starts (every field rock has landed or missed by then): `encounter = 3`, `encountersWon += 1`, reward `FIELD_REWARD_SCRAP` (20) scrap and `driveBoost = 1`. Jumping out earlier sets `encounter = 4`, no reward; field rocks still in flight are cleared by the jump as today.
- The director's interval doubling while `encounter === 2` applies to fields too.

**Notices** (Demo-vi rule order): pending field within 8 s: `Asteroid field ahead`; fighting: none extra (the threats panel lists every warned rock); won: `FIELD CLEARED   +20 scrap` and `Drive charging fast`; over: `Left the field`.

**Map and Navigation.** The map panel draws an asteroid node as an original glyph (three small irregular rocks); the Navigation rows name it `Asteroid field`.

## 2. The enemy ship window (render, plus three sim fields)

**Placement.** While an enemy is present (and during its arrival and exit animations) the right column below the threats panel, x 1032..1272 and y 114..456 (240 × 342), shows the enemy window. It replaces the Demo-ii enemy panel (removed) and covers the map panel. The map panel shows instead while any player is seated at Navigation (as FTL opens its map to jump). Our ship's world band is unchanged.

**The enemy ship** is drawn top-down, bow pointing up, in an original style matching ours (flat floors, dark walls), from a fixed layout in `render/enemyShipLayout.ts`: three system rooms (Weapons, Engines, Shields) and two plain rooms joined by doors, about 7 × 11 tiles at 20 px. Each system room carries its glyph (from `roomIcons`) and a health bar of `ENEMY_SYS_HP`; a destroyed system's room turns red with a repair countdown (`sysRepairTick`).

**Around the ship:**
- the shield bubble: one ellipse per layer up to the maximum, lit layers bright, missing ones faint; a shimmer flash when a layer is stripped or absorbs a shot; none while the shields system is down;
- the hull as segmented pips along the top (one pip per 10% of `maxHull`), the frequency `F<n>` beside it once scanned;
- the weapon charge bar along the bottom (red past 80%), hidden while the weapons system is down;
- one status line: `ENEMY`, `ENGINES DOWN`, `FLEEING 12s` or `SURRENDERS: Confirm to accept` (the latter if the surrender offer is open; use the existing state).

**Targeting.** While a player sits at Weapons, the window draws a reticle on the room their cursor targets (a system row → that room; the hull row → the whole ship outline) using the existing `isEnemySlot`/`enemySystemOf` mapping. The Weapons card rows are unchanged.

**Shots between the ships** (render-only motion, sim facts as below):
- *Our shots.* New sim fields `weapons.lastShotTick` (−1), `weapons.lastShotTarget` (enemy system index, or −1 for the hull) and `weapons.lastShotResult` (0 miss, 1 shield layer stripped, 2 hull or system hit), written by `fireWeapon` at the moment it resolves, flattened with the weapons block (SIM_VERSION 20). The renderer draws a bolt (beam: a cyan line pulse; torpedo: a small bright projectile) from our Weapons room to the target room in the window over 0.4 s, then: miss → it passes the ship and fades; stripped → shield shimmer; hit → a burst and a red flash on the room. Resolution stays instant in the sim; the bolt is cosmetic.
- *Enemy shots.* The Demo-vii shot path now starts at the enemy window's Weapons room instead of the right edge of the world band (only `projectilePath` for `ObjectKind.Shot` changes), so incoming bolts visibly leave the enemy ship.

**Arrival and exit.** On arrival the window slides in from the right over 0.5 s. Destroyed: the ship breaks into 4–6 drifting pieces with bursts over 1.2 s, then the window closes. Fled or surrendered-and-left: the ship accelerates upward out of the window over 0.8 s. A jump closes it at once.

**Model and view.** All layout and state-to-picture logic lives in a pure `render/enemyWindowModel.ts` (unit tested, no Pixi): room rectangles, which glyph and tint each room gets, pip count, the status line, the reticle target, the shot bolt endpoints and phase for a given tick. `render/enemyWindow.ts` draws it, reusing Graphics objects (no per-frame allocation that is never destroyed).

## 3. Tests

- Node types: the thresholds; the draw count is unchanged (same map edges for a seed as before); the guaranteed shop still holds.
- Field: a jump to an Asteroid node gives no enemy and starts the field at +8 s; rocks spawn every 4 s ± 20% with the shorter flight; spawning stops at 60 s; the field clears at 72 s with +20 scrap, `driveBoost`, `encountersWon + 1`; jumping out early gives `encounter 4` and no reward; a full debris table skips a spawn without a draw.
- Notices for the field states.
- Snapshot round trip and hash for `fieldNextTick` and the three weapons fields; version 19 rejected.
- `fireWeapon` writes the three fields for a miss, a stripped layer and a hit, for the beam and the torpedo.
- `enemyWindowModel`: the five rooms inside the window; the destroyed-system tint and countdown; pips for a hull fraction; each status line; the reticle for a system row and the hull row; bolt endpoints and phases; the enemy-shot origin at the window's Weapons room.
- Gates re-recorded (node types shift): survival, duo, boarding, cutter, jump, run and `npm run acceptance 5 1`; no floor lowered; the golden re-blessed once (SIM_VERSION 20).

## 4. Gate

- [ ] Section 3 tests; golden re-blessed once; gate figures recorded with the cause.
- [ ] Visual check by Claude in the app: the enemy window during a fight (shields, pips, charge, reticle with a player at Weapons, our bolt hitting, an enemy shot leaving the window); the map replacing it while someone sits at Navigation; an asteroid field notice and rocks; nothing overlapping.
- [ ] Manual, the user: combat reads like FTL's two-window fight; asteroid fields feel like a distinct node.

## 5. Amendments

(Filled during review and implementation.)
