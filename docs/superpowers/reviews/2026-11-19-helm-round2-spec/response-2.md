# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `ad7e3488`. 3 accepted, 0 rejected, 0 deferred. The reviewer confirmed all twelve round 1 fixes as resolved (R1-F1 to R1-F12); the verdict is "ready".

## R2-F1 [P3]: The power module's snapshot offset moves with the three new helm values, and the spec does not say so

Confirmed: `sim/duel/snapshot.ts` L151 computes `powerAt = helmAt + 3` with a comment that the helm module holds three values. §8 now says the helm module holds six values and `powerAt` becomes `helmAt + 6`, with every offset after it following.

## R2-F2 [P3]: NO GAS replaces the first hint line, but the new hint layout moves Q/E GAS to the second

Confirmed against §6.1's new lines and `HelmStation.tsx` L117-L118. §3.3 now shows `NO GAS` in place of the second hint line, the one that names the gas keys. §6.1 states each line's control set for the crew Helm: the first for `throttle`, the second for `turn` and `gas`, and notes the crew Helm no longer raises `heading` or `auto-face`.

## R2-F3 [P3]: The predicted latch's 'until throttleHeld has been 0 on a sample' has no start point

Confirmed. §7 now says the sample is one taken since the cut was sent or, with no cut in flight, since the replica's `thrCut` was first seen set, and that the record is cleared with `cutSent`.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-19-helm-round2-design.md

<!-- end -->
