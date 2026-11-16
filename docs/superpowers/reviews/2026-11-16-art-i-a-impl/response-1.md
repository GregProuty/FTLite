# Round 1 response (fixes in 16d4add)

Reviewed `round-1.json` against the branch at `a74bcaf`. 4 accepted, 0 rejected, 0 deferred. All four repeat minors recorded in the task reviews (progress.md L276-L278); the reviewer found no P0 or P1.

## R1-F1 [P2]: art:import crashes on a corrupt pack and lets duplicate outputs overwrite each other

Confirmed: importCore called `readPng` inside validation with no catch, and only checked the paid/ prefix. In 16d4add an unreadable pack becomes a problem line, a repeated resolved output path becomes a problem line, and each has a test asserting the message and that nothing was written. The existing multi-problem test was given distinct output paths so its expected list is unchanged.

## R1-F2 [P2]: the tie-break test cannot fail, and the packing test checks only size

Confirmed: `createRemap([0x808080, 0x808080])` passes for either winner. `nearestIndex(labs, lab)` is now exported (strict `<`, first index wins) and tested on an exact tie in both orders. The packing test gives frames distinct palette colours and asserts the top-left pixel of cells (0,0), (1,0) and (0,1).

## R1-F3 [P3]: floor-art sub-textures leak on rebuild; the door-floor skip is untested

Confirmed: tiles.ts destroyed the sprites with no options. They are now destroyed with their textures but not the shared source. tileLayer.test asserts the exact sprite count and that door tiles get no floor fill when floor art is on.

## R1-F4 [P3]: the shadowing test never builds the paid-over-free case

Confirmed. A free raw/ entry and a paid entry both binding `house.floor.0` are now refused in paidManifest.test.

## Also changed

- (nothing)

## Files changed

- scripts/art/importCore.ts
- src/renderer/src/render/tiles.ts
- tests/artImport.test.ts
- tests/paidManifest.test.ts
- tests/tileLayer.test.ts

<!-- end -->
