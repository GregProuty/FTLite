# Sectors, Fuel and the Pursuit (Loop-i) Design

Status: 2026-11-12. From the user's direction after two FTL design transcripts: "I want to match their game loop as closely as possible before play testing and branching off into a more unique game." This is FTL-loop item 1, the biggest gap. FTL's real loop is route choice under a clock: visit as many beacons as you dare for scrap and loot before the rebel fleet catches you, then reach the exit. The fleet is the roguelike "hunger clock"; a mod that removed it showed players the game falls apart without it. FTLite today visits exactly one node per column of a single 8-column map, so there is no route trade-off.

## 1. Sectors

- A run is `SECTORS` (3) sectors. Each sector has its own map of `SECTOR_COLUMNS` (6) columns: column 0 is the arrival beacon, the last column is the **exit**, and the middle columns hold 2 to 4 beacons each (today: 2 or 3; up to 4 lets sideways routes matter). The node index stride becomes 4 (`column * 4 + node`).
- Map edges: today's forward edges (each beacon reaches at least one beacon in the next column, every beacon has an incoming edge), **plus sideways edges**: in a middle column, every beacon is joined to the beacons directly above and below it. Sideways jumps let a crew visit extra beacons, at the cost of fuel and time.
- Generation draws only from `rng.map`, in a fixed order: per sector, the column counts, the forward edges, then the node types (today's draws per middle beacon, plus the new Empty type in section 4). The sideways edges need no draws.
- Jumping from the exit starts the next sector: a new map, the pursuit reset (section 3), `sector += 1`, and arrival at column 0. Jumping from the last sector's exit wins the run (until the final battle, a later feature).
- Every sector guarantees one shop, as today's map does.
- **Depth** replaces the old column in every rule that scales with progress: `depth = sector × SECTOR_COLUMNS + column` (0 to 17). Scrap rewards (Demo-ix), enemy hull and shield scaling, and score use depth wherever they used `run.column`.

## 2. Fuel

- New run field `fuel`, starting at `FUEL_START` (8). Every jump costs 1: forward, sideways, or to the next sector.
- With no fuel, the Navigation card offers **Wait for help** instead of destinations. It takes `WAIT_SECONDS` (20), advances the pursuit one step (section 3), then one `rng.loot` draw: with `WAIT_FUEL_CHANCE` (0.6) a passing trader gives 2 fuel; otherwise nothing, and you can wait again.
- Sources: destroying an enemy gives `1 + nextInt(rng.loot, 2)` fuel (1 or 2); a cleared asteroid field gives 1; events may give or take fuel (text and outcomes are a content task, not this feature); shops sell fuel (`Fuel +2`, `FUEL_COST` 12 scrap).
- The HUD clock card shows `FUEL 6`; the Navigation card shows the fuel left after the chosen jump.

## 3. The pursuit

- New run field `pursuit`: the column the pursuing fleet has reached in the current sector, a real number. It starts at `PURSUIT_START` (−1.5) on arrival in a sector and advances `PURSUIT_STEP` (0.75) after every jump and every wait. With these values a crew gets about eight jumps per sector before the fleet reaches the exit column: five forward and about three to spare for sideways exploration.
- A beacon is **overrun** when its column is at or behind `floor(pursuit)`. Arriving at an overrun beacon, or the pursuit overrunning the beacon you are at, triggers a **pursuit fight**: the normal encounter rules (Demo-vi), with an elite enemy (`PURSUIT_HULL_MULT` 1.5 times hull, fire interval × 0.75), no scrap or fuel reward, and contact after `ENCOUNTER_START` as usual. Only one pursuit fight per beacon visit.
- Overrun beacons lose their own content (no event, shop or asteroid field).
- The map panel draws the fleet front as a red band across the overrun columns. The Navigation rows mark overrun destinations `FLEET`.
- Name in the game: **the Pursuit** (original; not FTL's "Rebel fleet").

## 4. Beacon types

- Adds **Empty** (`NodeType.Empty = 4`): a quiet beacon with nothing but the per-jump scrap. FTL has plenty of empty beacons, which makes the good ones worth hunting.
- Middle-beacon draw thresholds (one draw each, as today): Shop 0.15, Event 0.25, Asteroid 0.15, Empty 0.15, else Hazard (0.30). The guaranteed shop stays.
- The exit beacon is a Hazard (a fight on the way out) except in the last sector, where it stays quiet until the final battle exists.

## 5. Bots

- The captain bot (pid 0) picks destinations as today: the lowest forward destination. It never jumps sideways, never waits unless out of fuel (then always waits), and treats an overrun destination as a last resort. Gates should still win; record their new end ticks.

## 6. State and versions

New run fields: `sector`, `fuel`, `pursuit`, `pursuitFought` (0/1 for the current beacon), and `waitUntilTick` (−1 none). The map arrays become stride 4. All are flattened. `SIM_VERSION` 24 (after Coop-ii's 23). The golden is re-blessed once.

## 7. Tests

- Map: per sector, 6 columns, 1 / 2–4 / 1 beacons, forward-edge invariants as today, sideways edges between vertical neighbours in middle columns, one guaranteed shop; draws only from `rng.map`, deterministic per seed.
- Jumps: forward, sideways and sector jumps each cost 1 fuel; with 0 fuel only Wait is offered; Wait takes 20 s, advances the pursuit, then the 0.6 / 2 fuel draw.
- Pursuit: starts at −1.5, +0.75 per jump and wait; overrun by `floor`; arriving at an overrun beacon, or being overrun where you stand, starts one elite fight with no rewards; overrun beacons lose their content.
- Rewards: fuel from kills (1 or 2) and fields (1); the shop's fuel row; depth-based scrap and enemy scaling.
- Victory after the last sector's exit; the old 8-column victory gone.
- HUD: `FUEL n`, the Navigation card's fuel after the jump, `FLEET` marks, the red band on the map, Wait for help.
- Snapshot round trip and hash for every new field; version 23 rejected.
- Gates: every gate, re-recorded with causes; jump and run gates follow the new victory rule; no floor lowered.

## 8. Gate

- [ ] Section 7 tests; golden re-blessed once; gate figures recorded.
- [ ] Visual check by Claude: the sector map with sideways routes, the fleet band, `FUEL`, a sector jump, Wait for help.
- [ ] Manual, the user: does the route choice feel like FTL (greed against the clock)?

## 9. Amendments

(Filled during review and implementation.)
