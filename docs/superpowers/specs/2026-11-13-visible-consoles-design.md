# Visible Consoles and Plain Words (Demo-xii) Design

Status: 2026-11-13. From Claude's playtest (`docs/playtest-report-2026-11-13.md`), findings R1 to R5; roadmap item 31. Render and copy only: **no sim change**, so no SIM version bump and no golden re-bless.

## 1. R1: consoles you can see

- Today nothing on the ship marks a station; players walk around until a `Sit:` prompt appears.
- Draw a console at every station tile, FTL-style and original: a small desk against the tile's nearest wall (the side with a wall neighbour; if several, prefer the side facing away from the room's centre), about 0.6 tile wide and 0.3 tile deep, dark `0x2b3647` with a 1 px outline `0x1b1b1b`, and a screen strip on top.
- The screen strip shows the state: **free and online** lit in the room's system colour or amber `0xf5b942` (pick one rule and test it); **occupied** a dim version; **failed or unpowered** red `0xff5b4a`; a group console (the Skiff's Helm and Ops) draws one desk for the group.
- Pure model (`render/consoleModel.ts`): station tile, neighbours and state → rectangles and colours, tested like `doorModel` and `wallModel`. Drawn in the tile layer or a new layer under the crew.

## 2. R2: the lobby

- `Jump before the ship falls apart. Reach node 8 to win` becomes `Cross three sectors, then destroy the Warden`.
- The controls card keeps its lines but must stay true to the current game; check every line against the code (the jump agreement now works from a seat: `Events: everyone votes with Confirm. Jumps need a second Confirm` stays true).

## 3. R3: plain words

- Science footer `Lead 18s` → `Warning 18s` (it is how early incoming hazards are warned), or whatever the code shows the value means; the word must say what it is.
- The enemy hull row on Science, `Enemy 100% 117s S? [#]`: `S?` → `freq ?`, `S2` → `freq 2`, `S-` → `shields down`; the eta `117s` → `leaves 117s`; keep the layer bracket. If the row no longer fits the 420 px card at 2x (the hudFit test), drop the bracket first, then shorten `leaves` to `out`, never shrink the font.
- The player block's skills line `N0 E0 W0 S0 C0 R4`: show only skills above 0 with three-letter names (`Rep 4`, `Eng 3`), or `No skills yet` when all are 0.
- Shot and rock rows (`Shot Corridor 5s F?`): `F?` → `freq ?`, `F2` → `freq 2`, same fit rule.

## 4. R4: the evade row only when it means something

- The Navigation card's `EVADE: Confirm` row shows only while an enemy is present or an asteroid field is active; otherwise it is hidden (not disabled). Its other states (`EVADING`, `EVADE Ns`) show whenever they are active.
- This changes the Navigation row list: the B2 cursor rule (Demo-xi) keeps the cursor on its row. The sim's row builder is in `sim/run.ts`; if hiding the row there changes the sim, stop: hide it in the card model only, and keep the sim rows unchanged (the bots and tests read them).

## 5. R5: event colour in the threats panel

- The threats panel's `Event: <title>` row uses the default text colour (`TEXT`), not the warning red. Other non-threat rows (`Shop here`) likewise.

## 6. Tests and gate

- consoleModel: each state → colours; wall-side choice; a group draws one desk.
- Strings: the lobby line, the new footer, the enemy and shot rows, the skills line, all within the hudFit widths.
- Navigation card: no evade row at a calm beacon, a shop, an event; present with an enemy or a field.
- Threat row colour for events.
- Full suite and typecheck clean; gates untouched (render only).
- [x] Tests above (branch `consoles`: 1182 tests, typecheck clean, no golden change).
- [ ] Visual check by Claude: consoles visible on the Skiff and the cutter (free, occupied, failed), the new strings on screen.

## 7. Amendments (implementation, 2026-11-13)

1. **R1 screen rule: amber for every console.** The game has no per-system colours (the room glyphs are one grey), so the free and online screen is amber `0xf5b942` (theme `AMBER`) on every console. Occupied is amber at 45 % over the desk (`0x867145`); failed or unpowered is the theme's `WARN` `0xff5b4a`.
2. **R1 wall side and placement.** The nearest wall is measured by stepping from the station tile through its own room's floor in each direction until the first other tile: a `#` counts at that distance, a door or space means no wall that way. Ties go to the side facing away from the room's centroid, then north, east, south, west. Walls are drawn as a thin band in the middle of the wall tile, so when the wall is the neighbour tile the desk backs onto that band (it fills the wall tile's floor strip, `WALL_GAP` 11 px); with no adjacent wall (the cutter's Weapons, Medbay and Engineering stations sit on room-centre tiles) the desk stands at the station tile's edge on the chosen side. The screen strip is on the desk's wall edge. A console group is one desk, drawn at its first member; it is red only when no member is online (the seating rule), and occupied by the first member's occupant.
3. **R3 enemy row fit, per row.** The fit rule runs on every row as it is built, measured with `textPx` against the card's inner width (`CARD_INNER_W`, 404 px of the 420 px card): the full row, then without the layer bracket, then `out` for `leaves`; a third step was needed and added: the scan percentage goes (shields down with a scan running and a three-digit eta is still 414 px with `out`; the Science footer still reads `Scanning`). The common rows keep everything (`Enemy 100% leaves 117s freq ? [#]`). `FLEE Ns` replaces the eta as before. The plain debris rows (no `Shot`/`Rock` prefix) take `freq` too.
4. **R3 skills line.** Names `Nav Eng Wpn Sci Cmb Rep` (the power panel's short names, `Cmb` for Combat). Skills above 0 are listed highest first (ties in skill order, so `Rep 4 Eng 3`), as many as fit the player block (`BLOCK_INNER_W`, 292 px): three at level 10, four at single digits. All zeros read `No skills yet`.
5. **R4 hidden in the card model only.** Hiding the row in `navRows` would change the sim (the cursor tracking signature, the bots, the golden), so `sim/run.ts` is unchanged and the Navigation card filters the row (`evadeRowShown`): `EVADE: Confirm` shows while `enemy.present`, or at an asteroid beacon while the field encounter is `Fighting`; `EVADING` and `EVADE Ns` always show. The sim cursor can still wrap onto the hidden row; the card then shows the row with the cursor on it, so the highlight always matches what Confirm does. Skipping the row in the sim is the clean follow-up and needs a SIM version bump.
6. **R5.** `HudThreat` gains an optional `info` flag on the `Event:` and `Shop here` rows; `threatTint` gives `TEXT` for those, `WARN` for the rest.
7. **R2 card check.** Every other lobby line was checked against the code and kept: the bindings (`input/sources.ts`), sitting by Confirm, the hold-Interact repairs (a repaired console comes back on a bar only if the pool has one), Navigation listing events and shops, the callout keys, Science's lock, team work, the cutter's torpedo carry from the Lower Hold magazine and the Skiff's tabs line, and the vote and second-Confirm line.
8. **Left as they were (outside R3's list):** the threats panel's own `Debris: Bridge 5s F2` rows, the enemy window's `F2`, and the Weapons strip's `F1`/`F2`/`F3` selectors keep the `F` notation.

9. **Visual check, partial (box left open).** On the built app with two players (the Skiff): the four desks show against their walls with lit amber screens, distinct from the doors; the lobby goal line, `Warning 18s` and the skills lines (`Rep 4`, `Eng 3 Rep 1`) read on screen. A seated crew sprite covers its desk, so the dim occupied screen is hidden under the occupant. Not yet seen: the cutter (it needs three players) and a failed console's red screen.
