# Round 3 response (spec revised)

Reviewed `round-3.json` against the subject at `a18602c`. 1 new finding accepted, 0 rejected, 0 deferred. Codex confirmed R1-F1, R1-F4, R1-F6, R1-F7, R2-F2, R2-F3, R2-F4 and R2-F5 resolved. R1-F2 and R2-F1 remain open on the same point as R3-F1 and are fixed with it.

## R3-F1 [P1]: Lifecycle presence records need an explicit player target (with R1-F2, R2-F1)

Confirmed. The lifecycle `JournalControl` (`authority/core.ts:L18`) carries `source`, `order`, `ordinal` and `control`, with no player. A binding holds a `players` array (`core.ts:L192-L202`), and one link carries two players in solo (§11a). §8 now defines `LifecyclePresence = { kind: 'presence'; players: number[]; present: boolean }` as a new member of the lifecycle control union beside `LifecyclePause`, with `players` set to the binding's full list in ascending order. `JournalControl.control` widens to `LifecyclePause | LifecyclePresence`. Replay applies the recorded `players` and never consults transport bindings.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-14-helm-demo-design.md

<!-- end -->
