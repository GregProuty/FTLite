# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `b32aa43`. 9 accepted, 0 rejected, 0 deferred. The spec was rewritten.

## R1-F1 [P1]: The palette plan contradicts itself

Confirmed (buildPalette.ts:L42-45 counts each pack + rectangle once; the two crate rectangles at x 122 and 153 were new). Section 1 now uses only rectangles that art/import.json already lists. The two new crates are dropped; the holds use the two lockers and the small crate. palette.json must stay byte-identical, and a test checks that countColours is unchanged.

## R1-F2 [P1]: The seats and couch face sideways

Confirmed against the sheet: the tall variants are the side views. Section 1 now uses the landscape seats (16,88,25,15) and couch (88,88,23,15), both with their backs at the top, and records where each sprite's back is. The plan checks each by eye.

## R1-F3 [P1]: Excluding breach and airlock tiles did nothing

Confirmed: schema.ts:L94 and L101 make both wall tiles. Section 3 now excludes the floor tiles that are 4-neighbours of a breach site or an airlock.

## R1-F4 [P1]: The magazine tile is not excluded

Confirmed (cutter.json magazine at 6,9). The magazine tile and its 4-neighbours are now excluded. The Cutter's Lower Hold becomes undressed, which section 3 states.

## R1-F5 [P1]: Props would draw above the grade and fires

Confirmed (renderer.ts:L72-73, effects.ts:L25,L51). Props now get their own layer directly after the tiles in both views, so everything else draws over them. It rebuilds on its key and does not depend on consoleArt.

## R1-F6 [P2]: propSlots is underspecified

Confirmed. Section 3 now gives the return type, the ascending hash order with ties by tile index, and names assigned in take order. A separate propCandidates exposes step 1 for testing.

## R1-F7 [P2]: The lamp would draw over a prop

Confirmed (gradeModel.ts:L100-105). Each room's lamp tile is now excluded. The Aft Store becomes undressed, which section 3 states.

## R1-F8 [P3]: The starter ship is not mentioned

Confirmed. Section 3 says the starter's Crew Quarters and Medbay are dressed, and the roomKind test covers the starter.

## R1-F9 [P3]: The cache ignores room names

Confirmed (derived.ts:L72-83). The cache key is now layoutHash plus the joined room names and systems.

## Also changed

- The hold list now uses two lockers and the crate; the pinned Cutter result is stated (Crew Quarters 2, Galley 3, Upper Hold 1, Lower Hold and Aft Store 0).

## Files changed

- docs/superpowers/specs/2026-11-17-art-iii-set-dressing-design.md

<!-- end -->
