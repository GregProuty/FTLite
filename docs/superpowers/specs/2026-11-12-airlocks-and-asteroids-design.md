# Airlocks, Remote Venting and Visible Asteroids (Demo-vii) Design

Status: 2026-11-12. The user: "the ship still needs doors to the outside, and a player in the door control room should be able to remotely open them to let out all the O2 to put out fires strategically. also if the 'breaches' are being caused by asteroids in an asteroid encounter, we should show them flying at the ship and impacting." Parent: foundation spec (doors, oxygen, fire), 2a-ii (debris), Combat-i (enemy shots), Demo-iii (cutter).

Debris is a random director hazard, not a node or encounter type; it hits rooms and makes fires or breaches (2a-ii). This spec makes it visible. An asteroid-field node type is out of scope.

## 1. Airlocks (sim)

**Layout.** The ship schema gains an optional `airlocks: [{ room, tile }]` (default empty). The tile must be a `#` wall tile orthogonally adjacent to a tile of `room`, and the tile on the far side must be out of bounds or a space character (the outer hull). Validated like breach sites (no two on one tile), included in the layout hash. `cutter.json` gets four: Dorsal Airlock `T` at (12,0), Ventral Airlock `X` at (12,12), Engines `E` at (0,6) and Forward Corridor `F` at (24,4); the implementer verifies each against the rule and adjusts coordinates if needed (amendment). `starter.json` gets none, so every gate and the golden scripted run keep their mechanics.

**State.** `airlocks.open: Uint8Array` (one per airlock, 0 closed), flattened after the doors block, initially 0. `SIM_VERSION 19`, version-18 snapshots rejected; the golden is re-blessed once.

**Solid.** An airlock tile stays solid for movement whether open or not: nobody walks out into space.

**Venting.** In `oxygenStep`, an open airlock vents its room into space exactly like an active breach site of width 1, with passage `AIRLOCK_PASSAGE` (= `PASSAGE_OPEN`) in place of `PASSAGE_BREACH`, inside the same proportional-scaling demand. The vented amount counts in the same oxygen counter as breach venting. Fire needs no change: once the room's oxygen fraction falls below `FIRE_SHRINK_FRAC` the fire dies on its own, and crew left inside take the existing suffocation damage. That trade-off is the strategy.

**Held-open doors.** `DoorState` gains `HeldOpen: 3`: an interior door the Doors console holds open. It behaves as `Open` for movement, oxygen (`passageFor` gives `PASSAGE_OPEN`) and fire spread, and `doorSystem` leaves it alone. Every rule that tests `=== DoorState.Open` is checked and updated to count HeldOpen as open (renderer door animation included). Without this only rooms with an airlock could be vented; with it, players open a path from a burning room to an airlock, as in FTL.

**Doors console.** The cursor runs over the interior doors (today's order), then the airlocks, wrapping. Confirm on an interior door cycles Auto (Closed/Open) → Held open → Sealed → Auto. Confirm on an airlock toggles it. Remote commands obey the same online rule as today's remote seal. When the Doors station is offline (unpowered or failed), every airlock closes and every held-open door returns to Auto: a fail-safe, so a power loss cannot leave the ship venting. The local Interact at a door is unchanged: Sealed → Auto, anything else → Sealed, deferred while a crew member stands in the doorway.

**HUD.** The Doors console card, today almost empty, shows:
- the selected item, e.g. `Door  Weapons / Aft Passage` or `Airlock  Engines`;
- its state: `Auto`, `Held open`, `Sealed`, `Airlock closed` or `AIRLOCK OPEN`;
- the Confirm action: `Hold open`, `Seal`, `Release`, `Open airlock` or `Close airlock`;
- `Open airlocks: N` when N > 0.

Every line fits the card. The threats panel lists `Airlock open: <room>` for each open airlock. In the world, the selected door or airlock gets the existing cursor highlight (add one if doors have none). An airlock is drawn on its hull tile as a door in amber (closed: two amber leaves; open: a dark gap with oxygen particles streaming outward while its room holds more than 1% oxygen). A held-open door is drawn open with a small amber bar across its frame.

**Bots.** Bots never open airlocks or hold doors. Their door handling and cursor use must still work with the longer cursor list.

## 2. Visible asteroids and shots (render only, no sim change)

Pure motion math lives in `render/projectileModel.ts` (unit tested); drawing in `render/projectiles.ts`, a layer above the ship and below the HUD. Positions are internal pixels through `worldFit`.

- **Asteroids** (debris objects): visible for their last `ASTEROID_SHOW_SECONDS` (6) of flight, travelling in a straight line from outside the world band to the centre of their target room, arriving exactly at `impactTick`. The entry side and angle come deterministically from `stableId`: top, bottom or front (right), never from behind the ship (left). Each is an irregular grey-brown polygon 14 to 22 px wide, also shaped from `stableId`, spinning slowly, with a faint dust trail.
- **Enemy shots**: visible for their last `SHOT_SHOW_SECONDS` (1.2), from the right edge of the world band to the target room's centre: a bright orange-red bolt with a short trail.
- **Outcome**, judged when the object leaves the debris table:
  - **hit** (its room's existing impact marker equals the tick it vanished; if shots do not set that marker, infer a hit from a hull drop that tick, without changing the sim): a burst of 8 to 12 fragments, the existing room flash, and a world-layer screen shake of 4 px for an asteroid or 3 px for a shot, decaying over 0.25 s;
  - **gone before its impact tick** (shot down or cleared): a small grey puff where it was, no shake;
  - **at its impact tick with no hit** (evaded): it keeps flying past the room along its line and fades over 0.6 s.
- The renderer keeps its own small map of tracked objects keyed by `stableId`; a jump, a new run or a snapshot load clears it.
- Nothing in this layer feeds back into the sim; determinism and the golden hash are untouched by section 2.

## 3. Tests

- Schema: a valid airlock; rejected when not on a hull `#`, not adjacent to its room, or duplicated; the cutter's four load; the starter has none.
- Venting: an open airlock drains its room below `FIRE_SHRINK_FRAC` and the fire goes out; total oxygen plus vented stays conserved; a closed airlock vents nothing; the airlock tile is solid open or closed.
- Held open: stays open with nobody near; counts as open in `passageFor` and fire spread; the remote cycle Auto → Held → Sealed → Auto; local Interact from held-open seals.
- Console: the cursor walks the doors, then the airlocks, then wraps; Confirm toggles an airlock; offline closes every airlock and releases every held door.
- Snapshot round trip and hash include `airlocks.open` and HeldOpen; version 18 rejected.
- HUD model: the Doors card strings for every state and their widths; the `Airlock open:` threat line.
- `projectileModel`: the position at `impactTick` is the room centre; at the start of the window it lies outside the world band; the entry side is never the left; the same `stableId` gives the same path; the evade path continues past the centre; the visibility windows (6 s, 1.2 s).
- Every gate keeps its mechanics (the starter has no airlocks): figures should be identical; the golden is re-blessed once (version only).

## 4. Gate

- [ ] Section 3 tests; golden re-blessed once; every gate figure recorded.
- [ ] Visual check by Claude in the app: open the Engines airlock from Door Control and watch a fire go out with the oxygen; an asteroid flying in and hitting; an enemy shot.
- [ ] Manual, the user: venting feels like a deliberate tactical choice, and the asteroids read as the cause of breaches and fires.

## 5. Amendments

### Codex spec review, 2026-11-12 (research/codex-review-demo-vii-spec.md): all ten findings resolved here; these rules override the sections above where they differ.

1. **HeldOpen in `doorSystem`.** For every interior door: Sealed → skip; a pending `sealRequested` completes when the tile clears (HeldOpen included); then HeldOpen → skip (crew proximity never rewrites it and no close timer runs). Local Interact (`toggleSeal`) on HeldOpen behaves as on any non-sealed door: seal now, or request the seal while someone stands in the doorway; the door stays HeldOpen until the seal lands.
2. **Fail-safe order.** Remote hold and airlock commands are accepted only while the Doors station is online, queued in `consoleSystem` and applied at the end of it (ascending index: local toggles, then door cycles, then airlock toggles). The fail-safe runs at the start of `doorSystem` (after `consoleSystem`, before oxygen): if the Doors station is offline, every airlock closes and every HeldOpen door becomes Closed with a zero close timer. A command on the tick the station goes offline is therefore undone the same tick, before any oxygen moves. Today's remote seal keeps its current behaviour (no online check added).
3. **Cursor encoding.** The Doors cursor `c` is in `[0, doorEdges.length + airlockCount)`: `c < doorEdges.length` selects door edge `doorEdges[c]`, otherwise airlock `c − doorEdges.length`; −1 when both are empty. A shared helper resolves `c` to `{ kind: 'door', edge } | { kind: 'airlock', index }` and is used by the console, the HUD model and the selection outline in `effects.ts` (which today indexes `doorEdges[c]` and would read past the end). Bots do not use this cursor.
4. **Airlock validation.** The far side is the hull tile's neighbour opposite the adjacent room tile; it must be out of bounds or `' '`. Exactly one orthogonal neighbour may be a tile of `room`. No two airlocks on one tile, and no airlock on a breach-site tile (edges are `+` tiles, so they cannot collide).
5. **Cutter airlocks, verified:** T (12,0) above room tile (12,1), space above; X (12,12) below (12,11), out of bounds below; E (0,6) left of (1,6), out of bounds left; F (24,4) above (24,5), space above.
6. **Movement.** `solidAt` treats HeldOpen as passable (via the shared `doorIsOpen`).
7. **Vent order.** Airlock venting is a separate pass after the breach-site pass, in ascending airlock index, sharing the per-room demand and scale; vented amounts go to `o2Counters.vented`. A room with an open airlock receives no life-support injection, like a breached room.
8. **Impact outcome, accepted ambiguity.** Shots and debris both set `rooms.impactTick` in `resolveImpact` on a hit; an evade does not. The renderer calls a vanished object a hit when its room's `impactTick >= ` the object's `impactTick`. Two objects resolving in one room on the same tick, one hit and one evaded, would both draw as hits: rare and cosmetic, accepted rather than adding sim state. No hull-drop inference.
9. **Removal reason.** When a tracked object is absent, the renderer compares the current `state.tick` with the object's `impactTick`: `tick >= impactTick` means it resolved at impact (a hit or an evade, by rule 8); otherwise it was shot down (a puff). A run reset, a jump (node change) or a snapshot load (the tick goes backwards or jumps by more than 2 s) clears the map with no effects.
10. **Evade path.** An evaded object keeps the velocity it arrived with and fades linearly from alpha 1 to 0 over 0.6 s after its `impactTick`, then is dropped.

### Implementation, 2026-11-12: deviations found while executing the plan.

11. **Layout hash.** The airlock block (the count, then room and tile per airlock) is pushed into the layout-hash codes after the breach sites only when the layout has airlocks; the header codes are unchanged. Pushing the count into the header unconditionally (the plan's Task 1 step 4) would have changed the starter's layout hash, which the plan's step 5 requires to stay untouched. Cutter amendment 5 holds with one correction: above T (12,0) is out of bounds (row 0 is the top row), not a space.
12. **`AIRLOCK_PASSAGE = 3 × PASSAGE_OPEN`, not `PASSAGE_OPEN`.** With the airlock at passage 1, an open Engines airlock with Engines' three doors closed drained the room to exactly 10 % and stopped: the three closed doors (0.05 each) leak in from neighbours that life support keeps near 0.8, so the room settles at 0.12 / (0.15 + P) of full, which is above `FIRE_SHRINK_FRAC` for P ≤ 1.05. Measured (cutter, seed 1, quiet): fraction 0.100 from 20 s on, the fire held at 0.96 intensity for the whole 120 s; with E–a held open as well, 0.12 and the fire held at 4.9. Passage 3 is the largest value that leaves the cutter's `kEff` at 4.390243902439026 (Dorsal and Ventral Airlock bind exactly: volume 3, one door, one site, one airlock). Measured at 3: Engines below 10 % in 1.7 s and the fire out at 3.2 s (Leaky Seals: 2.3 s and 3.8 s); a fire in Oxygen with Oxygen–Engines held open goes out at 8.5 s. Known limit: a room with three or more other closed doors cannot be routed out (the Aft Passage with E–a held open settles at 0.13 and keeps burning at 3.4), and a two-hop route (Weapons through the Aft Passage) does not drain at all. The test now also covers Leaky Seals and the routed Oxygen case.
13. **Local and remote on one tick.** A door in both the local toggle set and the remote cycle set gets both, in amendment 2's order: a sealed door unsealed by a crew member's Interact and cycled from the console on the same tick ends Held open (Sealed → Closed → Held open). The existing Doors-console tests were updated to the cycle (two Confirms now reach Sealed online).
14. **The cycle with a pending seal.** A door whose seal is pending (`sealRequested`, someone in the doorway) counts as Sealed in the cycle: Confirm cancels the request and returns it to Auto, and the card shows `Release`. Offline, an airlock Confirm does nothing and does not stamp `lastDoorToggleTick`; the card shows no action and the console row reads `Doors offline`.
15. **Card budget.** No per-card character constant existed; `CONSOLE_LINE_MAX = 40` (308 px card at about 6.25 px per m5x7 character) is added beside the other HUD budgets. The longest cutter line is `Door  Forward Corridor / Door Control` (37). The card's action row reads `Confirm: <action>`.
16. **No runtime snapshot load.** The app saves a snapshot only into a crash report and never loads one, so `Renderer.reset()` (already present, called by `session.start`) now also clears the projectile layer; `shouldReset` covers jumps and time jumps. The projectile layer is a stage container between the world and the HUD (internal pixels), shaken together with the world. `evadePos` takes the show window as a fourth argument (it needs the arrival velocity).
17. **Selection outline.** The Doors selection outline is drawn just outside the selected tile (3 px, pulsing) so it stays visible on an airlock's amber leaves (found in the visual check).
18. **Asteroid entry margin.** Top and bottom entries start 12 px outside the world band (not 32): from 32 px out an asteroid crossed the two notice lines above the ship (found in the visual check). Shots and front entries keep 32 px.

19. **Cycle order, after the implementation (2026-11-12, Claude).** The online remote cycle is Auto → Sealed → Held open → Auto, not Auto → Held open → Sealed. Venting a room with several doors works only when its other doors are sealed (cutter Aft Passage, held to Engines with the Engines airlock open: other doors closed, the room settles at 13% oxygen and keeps burning; other doors sealed, the fire is out in 7 s). Sealing is therefore the common command and stays one press, as it was before Demo-vii. The card's labels follow: Auto shows `Seal`, Sealed or a pending seal shows `Hold open`, Held open shows `Release`.
