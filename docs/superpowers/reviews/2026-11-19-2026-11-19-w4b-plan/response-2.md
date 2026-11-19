# Round 2 response (plan revised to rev after 0f820aff)

Reviewed `round-2.json` against the subject at `0f820aff`. 4 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F1 to R1-F9 resolved.

## R2-F1 [P1]: Task 7's online case assumes heading 0

Confirmed: map.ts L57-L59 and L72-L73 seed the spawn heading. The case now reads `c.state()!.tactical.ships[0].heading`, aims `(h0 * 256 + 2000) % 65536`, and asserts `0 < p <= 2000` in steps of 455 (or exactly 2000).

## R2-F2 [P2]: Task 10's commit names the wrong file for rung 4

Confirmed: the first-seated-tick case is in duelScripted.test.ts. The placeholder now names it. A note says w4Loadout is always committed and that its range pin changes only for rung 2.

## R2-F3 [P3]: The w4Autocannon rewrite names the wrong lines

Confirmed against the W-4a plan's w4Autocannon (`gaps()` at L567-L571; the heat case asserts no interval). The rewrite now names `gaps()` and the direct TRIGGER calls. The heat-and-lock case sets MAN with no re-pin.

## R2-F4 [P3]: Stale Placeholders bullet

Confirmed. It now says every test body is written in full, and it names the rigs.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md

<!-- end -->
