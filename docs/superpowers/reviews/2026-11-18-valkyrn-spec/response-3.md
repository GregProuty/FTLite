# Round 3 response (spec revised)

Reviewed `round-3.json` against the subject at `1a5f16ac`. 1 accepted, 0 rejected, 0 deferred. The reviewer resolved R1-F3, R1-F10 and R2-F1.

## R3-F1 [P2]: The Room line's frame and anchors

Confirmed. §7.2 swept the round's absolute segment, but the Room rule used a relative-motion line with unpinned anchors, so the two frames could disagree.

§7.2 now uses the sweep's own frame:
- The line is the infinite line through the round's old and new positions on the hit tick.
- The point is that line's closest point to the enemy's post-move centre.
- That offset is projected on the enemy's post-move heading.
- The sweep hit the circle, so this line meets it by construction.

§10 adds the same tests with the Hunter at full thrust.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md

<!-- end -->
