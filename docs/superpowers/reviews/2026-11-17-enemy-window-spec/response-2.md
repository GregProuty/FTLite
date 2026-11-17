# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `c41b082f`. 3 accepted, 0 rejected, 0 deferred; all 12 round-1 IDs confirmed resolved.

## R2-F1 [P2]: ContactView drops the hatch colour that roomLook returns

Confirmed: tacticalLayer.ts uses a different hatch colour for crew and enemy. §6.4 now gives each room `hatch: { colour; segments } | null`, and the §8 model test checks the colour against roomLook.

## R2-F2 [P2]: The per-frame order of click, sync, reserveRight and the console view is circular as written

Confirmed against scene.ts L110-L133. §6.5 now lists six ordered steps: hidden and station, click and pickShip, sync, tactical input with reserveRight, the models, then the frame.

## R2-F3 [P2]: The key intercept rule contradicts itself for T, and it never says where the intercept gets the station and target

Confirmed. §6.2 now gives one rule per key, `sync` records shown, station and target in the §6.1 table, and §8 adds the controller test.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-17-enemy-ship-window-design.md

<!-- end -->
