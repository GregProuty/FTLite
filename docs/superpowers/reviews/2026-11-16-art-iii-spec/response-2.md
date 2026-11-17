# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `c32ca60`. 1 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F1 to R1-F9 as resolved.

## R2-F1 [P1]: The 66-unit locker crosses the Upper Hold's south wall, and no crate is ever drawn

Confirmed: the Upper Hold is one tile deep (cutter.json rows 3-4), and consolePlacement makes a north-flush locker 66 units deep. I fixed it two ways:
- **Crate first.** The hold list now starts with the crate: crate, locker a, crate, locker b.
- **Fit rule.** Section 3 has a new step 4. A name fits a candidate only if its depth beyond the wall face is no more than the room's floor depth away from that wall. A candidate takes the first unused name that fits, and names that fit nowhere are not drawn.

The outcomes are restated: the Upper Hold gets 1 crate and the Skiff Hold 1 crate. The tests now pin the names, and a new check confirms no prop crosses another wall's face.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-17-art-iii-set-dressing-design.md

<!-- end -->
