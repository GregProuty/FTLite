# Codex review exchange: own-ship-window-spec

Subject: `docs/superpowers/specs/2026-11-18-own-ship-window-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing f368ce40, effort high, 415 s, 2679692 in / 2575492 cached / 33763 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The scene gate `station !== null && station !== 'ship'` shows the window on the SHIP tab for a seated player
In scene.ts, `station` is the seat, not the tab. A player seated at Helm, Weapons or Flight who Tabs to SHIP (view === 'interior') still has station 'helm', 'weapons' or 'flight'. Under the spec's rule the model is built and OwnShipWindow draws over the full interior. That breaks the fixed decision 'not on the SHIP tab'. It also breaks spec L16 'or in the standing interior view'. · spec L16, L90-91; scene.ts:L178 `const station = hidden ? null : consoleStation(d, source.active())`; consoleModel.ts:L87-89 (consoleStation returns the seat), L96-97 (only consoleModel maps `shipView` to 'ship'); scene.ts:L179 and L282 (the contact window avoids this through `onMap`/`shown`, which require view !== 'interior') · Two implementers will copy the stated rule literally and ship the window on the SHIP tab for seated players. The component test only checks null vs non-null, so the case is never caught. · Gate on the drawn view: build ownShip only when `onMap` (view !== 'interior' and station in helm/weapons/science/flight), or equivalently `consoleView !== null && consoleView.station !== 'ship'`. Add a scene/model test: seated at Helm with view 'interior' gives ownShip null.

### [P1] R1-F2 Map objects under the window are hidden and get no off-screen arrow
The spec keeps the arrow reserve rectangle unchanged and only slides arrows that edgePoint has already placed. edgePoint returns null for any point inside the inset rect. That rect starts at x 256 and y 72, so most of OWN_SHIP (x 228-468, y 42-212) lies inside the 'on screen' area. An enemy, torpedo or planet drawn under the window is covered and gets no arrow. The sit-down auto-frame can put the enemy right there: frameZoom allows the enemy up to FRAME_MARGIN 110 from the top and 228+110 from the left, so screen (338-468, 110-212) is reachable. · spec L49-53; tacticalModel.ts:L256-258 (null inside l = reserveLeft+28, t = reserveTop+28); scene.ts:L266 (reserveLeft CONSOLE_RESERVE.left = 228 = OWN_SHIP.x, reserveTop STATUS_RESERVE 44); consoleLayout.ts:L31, L41; sitModel.ts:L9 (FRAME_MARGIN 110), L48-51; scene.ts:L240 (frameZoom with CONSOLE_RESERVE only) · The Helm's job is to point at the enemy. After a sit-down framing of an enemy up and to the left, the enemy can vanish under the new window with no arrow. The contact window avoids this because its rect is inside the reserve (CONTACT_RESERVE), so things under it get arrows. · In tacticalModel's `arrow()`, when edgePoint returns null but the screen point is inside `avoid` grown by ARROW_MARGIN, emit an arrow on the avoid rect's outer edge (bottom edge at y = OWN_SHIP.y+h+ARROW_MARGIN, or right edge at x = OWN_SHIP.x+w+ARROW_MARGIN, whichever is nearer along the ray). Also have the sit framing keep the enemy out of OWN_SHIP, e.g. frameZoom gains an optional top-left avoid, or `up` is reduced for dx<0. Add tests for both.

### [P1] R1-F3 Slide rule conflicts with spreadArrows, and the corner case is undefined
(a) The slide runs 'after edgePoint places an arrow', which is before spreadArrows (scene sets spreadArrows: true). For a top-edge group whose mean is right of middle, spreadArrows runs dir = -1 and sets each arrow to min(v, prev - gap). That can push a slid arrow at x 496 back to ≤ 496 - gap, inside the window. If the slide instead ran after the spread, every slid arrow would land on the same x 496 or y 240 and overlap. (b) edgePoint returns no edge. At the corner (x = 256, y = 72) a point is both a 'top-edge' and a 'left-edge' arrow, so it is unclear whether it moves right or down. (c) spreadArrows' bounds (lo = reserveLeft+m for top groups, top = reserveTop+m for side groups) know nothing of `avoid`. · spec L50-53; tacticalModel.ts:L256-262 (returns {x,y,angle} only), L271-298 (grouping by y === top, lo = reserveLeft + m, the dir < 0 path at L289), L377-388 (spread after all arrows are pushed); scene.ts:L266 (spreadArrows: true) · Implementers will order these differently. Some orderings leave arrows on the window, which is what the rule exists to prevent. The corner is the likeliest spot for the ship or planet arrow. · State that `avoid` is applied inside both functions. In `arrow()`, classify the edge by which term of edgePoint's min won (or have edgePoint return `edge`), and treat a corner as top, sliding right. Pass `avoid` to spreadArrows so the top group's lower bound is max(lo, avoid.x+avoid.w+m) and the left group's upper bound is max(top, avoid.y+avoid.h+m). Add tests: a corner arrow; two arrows sliding to the same point; a slid arrow plus a far-right arrow on the top edge after spreading.

### [P1] R1-F4 Fire and damage looks overlap: in practice every burning room is also damaged, and the spec gives no draw order
An ignition needs a hit with room ≥ 0, and that only happens after the same hit raised the room's level (weapons.ts L99-100; missiles.ts L93). So a burning room is always at level ≥ 1. The spec puts the fire's CRT.hot in `tiles[].fill` and draws damage polygons over the tiles (L87-88). Level 1's CRT.mid fill and level 2 phase 0's CRT.glass fill then cover the fire. Level 2 phase 1 fills CRT.hot, which is the fire colour, at the same 2 Hz (DAMAGE_BLINK_HZ = ALERT_BLINK_HZ = 2). Fire and Level 2 therefore look the same. The off phase of the fire blink is never named. Also, L25-26 calls `roomLook(true, …)` 'the contact window's damage look', but the contact window uses `roomLook(false, …)` (ENEMY_LOOKS). CREW_LOOKS level 0 has stroke CRT.glass, which would erase the CRT.main outline on the three point rooms if a level-0 entry is emitted. · spec L25-28, L67-70, L87-88, L114-116; crtTheme.ts:L14, L27-31, L38; contactModel.ts:L169 (roomLook(false, …)); fire.ts:L24, L37-38; weapons.ts:L98-101; missiles.ts:L93 · The window exists so players notice fire (spec L8-9). As written, the common case (a burning, damaged room) shows the damage look, or a blink identical to Level 2. Implementers will also disagree on precedence and on level-0 entries. · Say that a burning room draws the fire look only: skip its damage entry, or draw fire after damage, and name the off-phase colour (e.g. CRT.mid). Pick a fire look different from Level 2, e.g. a solid hot fill with a glass hatch, or a different rate. Emit `damage` entries only for level ≥ 1. Say explicitly whether CREW_LOOKS or ENEMY_LOOKS is meant, and fix the 'contact window's look' wording. Add a test: burning at level 1 and level 2 yields the fire look and no damage polygon.

### [P2] R1-F5 The contact window's header layout does not fit 240 × 34 px
'Frame and header copy the contact window's look' and 'SHLD pips as the contact window draws them' would copy the contact window's offsets. Those offsets put the status row at top+34, which is exactly OWN_SHIP_BOX.y (OWN_SHIP.y+34), so the row sits on the drawing. The HULL bar runs from x0+156 for 80 px, ending at OWN_SHIP.x+244, past the 240 px window. The spec gives no row y, no x offsets, and no layout for the HULL value. · spec L17-21, L44; ContactWindow.tsx:L44-45 (x0 = +8, right = w-8, statusY = top+34), L80-91 (pips at x0+40+k*12, HULL label at x0+120, bar at x0+156 w 80, value right-aligned at `right`); theme.ts:L22 (FONT_NATIVE 16) · Two implementers will pack the header differently, and a literal copy overlaps the box and overflows the frame. · Give the header rows: e.g. title at top+4, with SHLD pips and HULL bar plus value on one row at top+18, and their x offsets (e.g. pips at x0+36, HULL label at x0+100, bar at x0+136 w 56, value right-aligned at w-8). Alternatively, move OWN_SHIP_BOX down and recompute its height. Add a component test that every header element lies inside OWN_SHIP and above OWN_SHIP_BOX.y.

### [P2] R1-F6 The hull alert blink has no resolved colour in the view, which contradicts 'React does no blinking'
L20-21 makes the HULL value an inverse alert block blinking at ALERT_BLINK_HZ. L84-85 says the model resolves colours and blinks with `t` so React does no blinking. But `hull` carries only `alert: boolean`, so the component would have to blink by itself or draw a steady block. · spec L20-21, L66, L84-85; contactModel.ts:L113 (the contact pattern resolves the alert blink to a tint in the model) · Implementers will split here: one blinks in React with its own clock, which drifts from the map's blinks; another never blinks. · Have `hull` carry the resolved look, e.g. `{ value, fill, alert: boolean, lit: boolean }` or `{ valueTint, blockTint }`, from blink(t, ALERT_BLINK_HZ). Test both phases.

### [P2] R1-F7 Edge rule: §2 and §4 disagree about walls; damage polygon and fire bar are undefined for non-rectangular rooms
In the real layouts, rooms never touch each other. They are separated by '#' wall tiles and '+' door tiles, and neither is a room tile. Read literally, §2 ('borders another room or open space') emits almost no edges. §4 ('neighbour is not in the same room') outlines every room. Whether walls or doorways are drawn is not stated, so doorways become invisible gaps. `damage.points` is a single polygon and the fire bar runs 'along its bottom edge', but the spec never says how either comes from roomTiles. Every current room is rectangular, but the schema allows any shape. · spec L23-24, L67-70, L78-79; derived.ts:L7, L38-44 (walls and doors skipped, roomTiles per room); hound.json:L7-21 (rooms walled apart, '+' doors); valkyrn.json:L11-17 · There are two possible readings of the outline rule, and implementers will build the damage and fire geometry differently, e.g. per-tile rects, a bounding box or a traced outline. · Keep §4's rule and reword §2 to match ('every side whose neighbour is not a tile of the same room'). State that walls and doors are not drawn, or draw door tiles in CRT.dim. Define the damage polygon as the room's tile bounding rectangle (all rooms are rectangles today; assert that in a test), and the fire bar as that rectangle's bottom 2 px. Say whether a `fires` entry exists at progress 0.

### [P2] R1-F8 A crew dot is invisible in a burning room
Crew dots are 3×3 CRT.hot squares. A burning room's fill is CRT.hot in the lit phase. The crew who are fighting the fire stand in that room, so their dots disappear half the time. A 3×3 'hollow' dot is a single 1 px hole and barely reads. · spec L27-29; crtTheme.ts:L6 · Whether someone is on the fire is the next thing a seated player wants to know after seeing it. · Draw each dot with a 1 px CRT.glass ring (5×5 glass, then 3×3 hot), or draw dots CRT.glass on burning tiles. Draw downed crew as a 5×5 hollow square or an X. Test the dot's colour on a burning room in the lit phase.

### [P2] R1-F9 The Flight seat's pointer rule does not exclude the new window
Valkyrn §6.2's onFlightMap treats the tab strip, side column, Helm block, FLIGHT block and the shown CONTACT as not open map. The spec does not add OWN_SHIP to that list, so on the Flight seat the nose follows the pointer over the own ship window (or its last position at the window's edge). · spec L33-34; flightPointer.ts:L10-24 (BLOCKS, CONTACT check); scene.ts:L216-221 · This is an ordinary Flight-seat case. Moving the mouse onto the window to look at the fire should not steer the ship, just as the contact window does not. · Add OWN_SHIP to flightPointer's BLOCKS, which are always shown on consoles, and add a test to the flightPointer suite.

### [P2] R1-F10 The sit card and banners can overlap the window; the layout test does not cover them
The sit card is centred at sitCardCx = (228 + 1280 - 156)/2 = 676. The Weapons title 'WEAPONS: CLICK A WEAPON, THEN A ROOM' is 209 font px × 2 = 418 px, plus 2 × 14 padding = 446 px, so the card starts at x 453. That is under OWN_SHIP's right edge at 468, at y 76-152 (top variant) and 164-240 ('under'). Banners centre at the same cx at y 80 and 130, so any notice wider than about 416 px crosses x 468. · spec L47-48, L120-121; SitCard.tsx:L16-30 (SIT_CARD_TOP_Y 76, SIT_CARD_UNDER_Y 164, sitCardCx); sitModel.ts:L17; theme.ts:L31-37 (advance widths); Banners.tsx:L18-20; DuelUi.tsx:L51-52 · Question 7 of the review asks for exactly this. The overlap is small but real at Weapons, and the spec's layout test would pass anyway. · Either centre the sit card and banners in the band right of OWN_SHIP when they draw above y 212 (cx = (OWN_SHIP.x+OWN_SHIP.w+EDGE + 1280 - CONSOLE_RESERVE.right)/2), or accept and document the overlap and draw order. Add the sit cards' top and under rects to the layout test.

### [P3] R1-F11 The flash baseline leaves out the alarm's freshness guard and does not say when tracking runs
The spec copies the fire alarm's state diff 'for the same reason' but re-baselines only on the first frame and on reset. interiorSounds also re-baselines when the tick goes backwards, jumps by more than HIT_FRESH_TICKS, or the array length changes, which covers resyncs and a link coming back. The spec also does not say whether the burning set updates on frames where ownShip is not built (SHIP tab, paused). If it updates only while the window is built, sitting down in a burning ship flashes. · spec L95-98; interiorSounds.ts:L33-35; scene.ts:L165-171 (epoch reset), L254 (frozen copy) · A stale or rewound online copy could give false flashes, and implementers will choose different update conditions. · Track the set every drawn frame whatever the view. Re-baseline with no flash on the first frame, on an epoch change, and when d.tactical.tick is not fresh against the last frame (the same HIT_FRESH_TICKS rule).

### [P3] R1-F12 DuelUiView field shape and a name collision
Every other optional DuelUiView member is declared `?: … | null`. The spec makes `ownShip: OwnShipView | null` required, which forces every existing DuelUiView literal in the tests to change. In §4, 'Tile `t` → (t % w, …)' reuses `t`, which is the model's time parameter, and `w`, which is the box width. · spec L61, L77, L90; views.ts:L13-24 · This causes avoidable churn across the tests and confusion when the tile helper is written inside ownShipModel. · Declare `ownShip?: OwnShipView | null`. Rename the tile index to `k` and the grid width to `gw` in the fit text.

## Verified
- Layout clearances: OWN_SHIP = x 228-468, y 42-212 (READOUT_W 204, readoutModel.ts:L27; consoleLayout.ts:L9). It clears TABS (y 8-34, L7), every station top (helm 508, weapons 492, science 612, L10-11), FLIGHT (y 542, L21), SIDE (x 1136, L27) and CONTACT (x 968, L33).
- Top status sentence: y 12 at FONT_SIZE, with descenders to y 38 (theme.ts:L25), above OWN_SHIP.y 42. The Weapons info line (y 44, weaponsModel.ts:L118) is centred at 592 or 676, and 'BRG 123  RNG 456  TORP OUT' is about 149 px wide, so its left end (≈517) clears x 468 even though infoBand.left is 408 (weaponsModel.ts:L120-123, L166, L177).
- Grid data exists: derived.width and derived.height (derived.ts:L7); roomTiles per room excludes walls and doors (derived.ts:L38-44). Hound is 23×15, which fits the 224×128 box at a whole 8 px tile (184×120). Valkyrn is 19×7 at 11 px, so the fractional branch never triggers on current ships.
- Online client inputs: the client's DuelState comes from createDuel and restoreDuelSnapshot writes the interior back (snapshot.ts:L201-219), so derived, points, rooms.fire, fireRepair and crew positions are present. d.events is cleared on restore (snapshot.ts:L219), which confirms the spec's reason for a state-diff flash.
- pointBurning and extinguishProgress take (d, p) and return the shapes the spec uses (fire.ts:L15-18). Ignitions happen only on point rooms (fire.ts:L36-38), so diffing only d.points rooms is enough.
- The hull alert rule matches the readout: hull <= max/4 (readoutModel.ts:L120). Shields and hull come from systems[CREW_SLOT] and classOf (readoutModel.ts:L116-121; contactModel.ts:L186-187).
- crewHealthMarks gives ship-local px, Position × TILE_PX (interiorModel.ts:L39-45), so box coordinates are origin + mark × s / TILE_PX. The tile index decode matches interiorOverlay (interiorModel.ts:L54).
- polyPoints and segPath exist as module-private consts in ContactWindow.tsx:L27-28, so moving them to svgPaths.ts is a pure refactor. hatchSegments is available (contactModel.ts:L11, L172).
- A ContactWindow component test harness exists (tests/contactWindow.test.tsx).

## Not verified
- Whether the pointer source's event target is the canvas, i.e. whether pointer moves over the window's div reach flightPointer or leave a stale point. I did not open the runtime wiring beyond input.ts:L207-249. The Flight finding holds either way.
- Whether Position.x and Position.y are tile centres or tile corners (it decides whether crew dots need a +0.5 tile offset). I did not read sim/components or the movement system.
- Which banner notice strings exist and how wide they are at scale 2. I only computed the threshold (about 416 px).
- Whether an online client ever rewinds tactical.tick (prediction or rollback), which would make the missing freshness guard matter more.
- I read files outside the manifest to check findings: consoleModel.ts L14-99, flightPointer.ts, input.ts L195-254, derived.ts L1-48, hound.json, valkyrn.json, weapons.ts L88-105, snapshot.ts L200-220, SitCard.tsx and Banners.tsx (grep), weaponsModel.ts (grep), theme.ts L20-44.

---

# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `f368ce40`. 12 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: The scene gate shows the window on the SHIP tab for a seated player

Confirmed. scene.ts:L178 `station` is the seat (consoleStation), and L179 `onMap` adds `view !== 'interior'`. Spec §4 now builds `ownShip` only when `onMap`, and §2 says it does not show on the SHIP view whether standing or seated. §6 adds a scene test.

## R1-F2 [P1]: Map objects under the window are hidden and get no off-screen arrow

Confirmed. tacticalModel.ts:L256-258 returns null inside the inset rect, which contains most of OWN_SHIP. §3 now uses the object's screen point when edgePoint returns null; if it falls inside A, the arrow is placed on A's boundary. frameZoom gains an avoid cap for up-left enemies. Tests are in §6.

## R1-F3 [P1]: Slide rule conflicts with spreadArrows, and the corner case is undefined

Confirmed (tacticalModel.ts:L271-298). The "slide" is replaced by ray entry into A at k = max(kx, ky); a corner counts as the right edge. ArrowDraw.edge tags these arrows. spreadArrows takes avoid: avoid-edge groups spread along their own edge, and the top/left groups' bounds exclude A.

## R1-F4 [P1]: Fire and damage looks overlap

Confirmed (crtTheme.ts:L27-31; contactModel.ts:L169 uses ENEMY_LOOKS). §2 now defines an own-ship look table in ownShipModel instead of roomLook. Fire overrides damage, damage never uses CRT.hot, and fire never hatches. The off phase is CRT.mid. Tests are in §6.

## R1-F5 [P2]: The contact window's header layout does not fit 240 × 34 px

Confirmed (ContactWindow.tsx:L44-91). §2 gives explicit row y values and x offsets inside 240 px, and OWN_SHIP_BOX moves to y+40 with h-48. The component test checks that the header sits above the box.

## R1-F6 [P2]: Hull alert blink has no resolved colour

Confirmed. `hull.block` carries the resolved CRT.hot / CRT.main phase, and it is tested.

## R1-F7 [P2]: Edge rule contradiction; non-rectangular rooms

Confirmed (derived.ts walls and doors are not room tiles). The §2 and §4 rule is unified: walls and doors are not drawn. A room's rect is its tile bounding box, and a test asserts every shipped layout's rooms are rectangles. The fire bar shows only when progress > 0.

## R1-F8 [P2]: Crew dot invisible in a burning room

Confirmed. Dots are now 3×3 hot in a 5×5 glass square. A downed crew member is a 5×5 hot outline.

## R1-F9 [P2]: Flight pointer does not exclude the window

Confirmed (app/duel/flightPointer.ts:L11 BLOCKS). OWN_SHIP joins BLOCKS, and it is tested.

## R1-F10 [P2]: Sit card and banners can overlap

Confirmed. The overlap is about 15 px at most. §3 sets the draw order (sit card and banners on top) and documents the overlap as accepted, since both are transient.

## R1-F11 [P3]: Flash baseline missing freshness guard

Confirmed (interiorSounds.ts:L33-35). The watch updates every drawn frame and re-baselines on the first frame, on an epoch reset, and on a stale tick (HIT_FRESH_TICKS, render/impactModel.ts:L14). The helper is pure and tested.

## R1-F12 [P3]: DuelUiView field shape and a name collision

Confirmed (views.ts:L13-24). The field is now `ownShip?: … | null`, the tile index is renamed `k` and the grid width `gw`.

## Also changed

- Grid height named as `d.interior.derived.height` (sim/ship/derived.ts:L7).

## Files changed

- docs/superpowers/specs/2026-11-18-own-ship-window-design.md

<!-- end -->

---

