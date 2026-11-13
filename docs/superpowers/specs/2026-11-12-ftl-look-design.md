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

- [ ] Tests as above.
- [ ] Visual check by Claude: menus readable at a glance, FTL-style doors closed, open and sealed, the bigger enemy window with the reticle on each room.
- [ ] Manual, the user: readable from the couch; looks closer to FTL.

## 7. Amendments

(Filled during implementation.)
