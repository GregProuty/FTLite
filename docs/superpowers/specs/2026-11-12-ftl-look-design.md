# The FTL Look: Readable Menus, FTL-Style Doors, a Bigger Enemy Ship and Room Targeting (Demo-x-c) Design

Status: 2026-11-12. The user after a two-player playtest: "i want the doors to look more like the FTL doors. And the weapons need to be able to target individual rooms/ systems in the enemy ship, and lets make sure the enemy ship is big enough on screen. also the font/color in the menus is unreadable. lets increase the font and change the colors to look better. just look at how FTL does it."

Foundation spec section 12 still holds: we copy FTL's layout and colour logic, not its art.

## 1. Readable menus (FTL's logic: dark panels, light text, one accent)

- Today's panels are a light blue-grey fill with white and grey text: low contrast. New theme, in one module (`render/theme.ts`) that every panel, card and overlay reads:
  - panel fill `0x141a24` at 0.94 alpha, a 2 px border `0x6f86a6`, and a 1 px inner highlight `0x2b3647`;
  - text `0xf2f5fa`; secondary text `0xa9b6c8` (never darker); headings and the selected row in amber `0xf5b942`; warnings `0xff5b4a`; good news `0x8fe06a`; power bars green `0x6fd44e` (on), dark `0x2a3340` (off), red when failed;
  - the selected row gets a dark amber bar behind it (`0x4a3a14`), not just a `>` mark.
- **Bigger text.** The bitmap font draws at an integer scale large enough to read from a couch: at least 1.5× today's size for cards, notices and the event card (pick the font size that gives a whole-pixel scale of the font's native height), and the lobby. Panels grow to fit; anything that no longer fits gets a layout change, not a smaller font. Check every card at its longest content.
- The contrast rule: every text colour on its panel must have a contrast ratio of at least 4.5 : 1 (a test computes it for the theme's pairs).

## 2. FTL-style doors

- Doors are drawn as a door in the wall line, not a full grey tile: two panels that meet in the middle of the gap, each a third of a tile thick, in amber `0xd9a441` with a dark `0x1b1b1b` outline and a slim centre seam. Opening slides the two panels apart into the walls (the existing door animation drives the slide). Sealed doors are drawn in red-orange `0xc8502d` with a short bar across the seam. Held-open doors (Demo-vii) show their panels retracted with an amber tick on the frame. Airlocks keep their own look but in the same panel style.
- The wall tile around a door stays the wall colour, so a doorway reads as a gap in the wall with a door in it, as in FTL.

## 3. A bigger enemy ship

- The world band narrows from x 256–1024 to x 256–864. The right column becomes x 872–1272 (400 wide): the threats panel on top (400 × 100), then the enemy window, now **400 × 340**, at y 114. The enemy ship is drawn at about 1.6× its current tile size. The map panel and the player cards follow the new column width.
- Our ship still fits the narrower band (the cutter at about 21 px per tile, the Skiff larger).

## 4. Targeting rooms in the enemy ship

- The Weapons card's targets for the enemy become its **rooms**: Weapons, Engines, Shields, Bridge, Hold (all five), plus incoming debris and shots as today. Up/Down walks them in the window's order (top to bottom), and the reticle in the enemy window marks the targeted room.
- The Bridge becomes a system room: **Piloting**. While its health is above 0 the enemy can evade our shots (today's `ENEMY_EVADE` applies only while its Piloting is up, not its Engines); its engines still drive fleeing and withdrawal. The Hold stays a plain room (hull damage, fires, breaches).
- Hits keep today's rules: system damage to the room's system, hull damage, interior fires and breaches (Demo-viii).
- The card row reads `Shields room  100%` (system health), `Hold` for the plain room.

## 5. Tests

- Theme constants and the contrast ratios; panel sizes fit their longest content at the new font size (model-level width checks).
- Door drawing model: closed, opening, open, sealed, held states map to panel offsets and colours.
- Layout: the world band and right column rectangles; nothing overlaps (rectangle checks).
- Targeting: five rooms in order; the reticle; Piloting gates evasion; Hold hits; existing combat tests updated with reasons.
- SIM version bumped once if the sim changes (Piloting does); golden re-blessed once; gates re-recorded; no floor lowered.

## 6. Gate

- [x] Tests as above (1133 tests).
- [x] Visual check by Claude (2026-11-12, see `docs/gates.md`): menus readable at a glance, FTL-style doors closed, open and sealed, the bigger enemy window with the reticle on each room.
- [ ] Manual, the user: readable from the couch; looks closer to FTL.

## 7. Amendments

1. **One font scale, 2x, everywhere in the HUD.** m5x7 is native at 16 px, so the smallest whole-pixel scale of at least 1.5x is 2 (32 px; `LINE` 24). Every card, block, notice, panel, the lobby, the summary, the credits, the map and the enemy window draw at 2x. The event card's title and choices were already 2x and stay there (3x would not fit a 36-character label in the band); its status and help lines go from 1x to 2x. The lobby and game-over banner goes from 2x to 3x.
2. **Everything was re-laid out to fit, with no smaller font** (`render/hudLayout.ts`; `tests/hudFit.test.ts` measures every string at its longest with the font's real advances from its hmtx table):
   - console cards are 420 wide (was 308) in three slots above the blocks (x 8, 430, 852; a fourth player shares the third slot), nine lines plus the tab bar: the Weapons and Navigation footers take two lines (`weaponsFooterLines`, `navigationFooterLines`);
   - the clock card has five lines (`HULL 100   FUEL 8`, `SECTOR 1/3  node 1/6`, `TIME 300s`, the director, the quirk); the time left the first line;
   - the power rows use short names (Nav, Wpn, Sci, Eng, Life, Med, Door) next to their glyphs, as FTL's power bars do;
   - the player block shows `P1 Okoro` and the health bar on line 1, the prompts, and the skills on line 4 (the vote replaces the skills while an event is open; the HP number became the bar alone);
   - a console group's Sit prompt shortens long member names (`Sit: Sci + Eng + Doors`); an offline tab reads `DOORS!` in red on the tab bar (the model's `tabText` keeps `DOORS OFFLINE`);
   - the enemy threat is two rows: `Enemy 64% shields 1/1` (or `shields DOWN`, `FLEEING`) and `Down: weapons engines`;
   - the Science ship row drops the weapon charge (`W80%`): the charge is the enemy window's bar;
   - the event notice's choice line uses the short labels whenever the full ones pass 608 px (`noticeChoices` takes the HUD's fit test); four events gained short labels; the shop line says `Torps +2 (20)`; a system scan notice too wide for one line splits at its first comma;
   - the clock, power and threat panels hide behind the lobby and game-over cards, whose 3x banner spans the screen.
3. **The world band is y 60-356** as well as x 256-864, so the console cards (top at y 360) never cover the ship; every ship still fits (the cutter at 21 px a tile, the starter at 24, the Skiff at 32).
4. **The enemy ship is redrawn bow-left on 11 x 7 tiles of 32 px** (was bow-up on 7 x 11 of 20): a portrait ship cannot be 1.6x larger in a 340 px tall window, a landscape one can. The rooms keep their neighbours (the layout is the old one turned a quarter), the bow faces our ship, and Piloting gets its own crew member and console. Window order top to bottom, ties left to right: Hold, Weapons, Piloting, Engines, Shields.
5. **The Hold slot is the old hull row**: `ENEMY_SLOT` now names the Hold (hull damage, its own fires and breaches); the hull row's Bridge-or-Hold room draw is gone, so a Hold hit makes one combat draw fewer. Science keeps one row for the ship (`warnedTargets(state, false)`) with the old hull-row text, scan and lock; the Weapons card's Hold row reads `Hold  hull 64%` (the spec's `Hold` plus the hull it hits).
6. **A grouped Helm shows the map only on its Helm tab.** On the Skiff the Helm and Weapons share one seat, so before this change the map replaced the enemy window for the whole fight and the gunner never saw the reticle (`navigatorAtHelm`).
7. **Doors:** the door tile shows floor around the two panels (the doorway is a gap in the wall line); airlock panels carry dark stripes and open onto space. The enemy window's doors use the same amber panels.
8. **Known limit:** with three or four players seated, the third slot's card (x 852-1272, top y 360) covers the bottom of the enemy window (to y 454). Two-player play, the Skiff's case, is clear.
