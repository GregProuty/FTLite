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

(Filled during implementation.)
