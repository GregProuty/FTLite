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
- [ ] Tests above.
- [ ] Visual check by Claude: consoles visible on the Skiff and the cutter (free, occupied, failed), the new strings on screen.
