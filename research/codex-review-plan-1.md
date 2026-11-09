1. **P1 — Component storage is shared across independent worlds. Task 5, Steps 3–4.** Every world gets its own entity index, but `Position`, `Health`, `Life`, etc. are module-global arrays. Creating a second state overwrites the first state’s crew; stepping either moves both. This invalidates the determinism, snapshot-continuation, and frame-batching tests. Component storage must belong to each state, or entity IDs must be globally disjoint.

2. **P1 — The bless script breaks typechecking. Task 1, Step 2; Task 15, Step 3.** `tsconfig.node.json` includes `scripts/**/*`, so `bless-golden.ts` pulls renderer/sim files and `tests/helpers/script.ts` into that composite project without listing them in `include` (**TS6307**). Its JSON import also requires the missing `resolveJsonModule`.

3. **P1 — Lifecycle integration breaks earlier tests. Task 11, Step 3; Tasks 7 and 9, Step 1.** `crewSystem` ends every zero-player state immediately. Consequently, the breach test’s 30-second run stops at tick 1 with oxygen **11.5**, contradicting its expectation of **<6**. The door test with one Downed crew member likewise ends before its close timer expires. These system tests need a harness that keeps stepping independently of run termination.

4. **P1 — The survival gate fails even after the prescribed tuning fallback. Task 20, Steps 1–2.** With the supplied bot and defaults, seeds **1 and 2** end at approximately **229s and 248s**. Applying all three suggested changes still leaves seed **1** ending at approximately **202s**. Step 2’s tuning recipe does not achieve the required five-minute gate.

5. **P2 — The oxygen residual test cannot pass. Task 8, Step 1.** It empties room A but leaves its corridor neighbour full and their door Closed, which still leaks. The next step supplies approximately **0.025** oxygen to A, so A neither snaps to zero nor increments `residual`.

6. **P2 — Crew tests contradict the damage tuning. Task 11, Step 1.** Starting at 1 HP, two ticks of `8/60` damage leave **0.733 HP**, not Downed. In the accelerated-bleed test, the supposedly surviving teammate also stands in the burning spawn room: they become Downed at **12.5s**, ending the run before the original casualty dies at 15s.

7. **P2 — Reach expectations are wrong. Task 12, Step 1.**
   - At the default spawn, the nearest point of door `(2,7)` is exactly **1.5 tiles** away, so `confirmTarget` returns Door, contradicting `None`.
   - In the three-player revive test, P1 is **2 tiles** from the casualty and cannot qualify. P2 correctly wins, contradicting the expected reviver PID `0`.

8. **P2 — Layout identity does not protect snapshots or hashes. Task 4, Step 6; Task 5, Step 5; Task 14, Step 3.** `layoutHash` omits room ordering, edge endpoints, breach-room associations, stations, and spawns; `hashState` omits layout identity entirely. Reversing `rooms` preserves `layoutHash`, allowing snapshot loading to attach oxygen/fire values to different rooms. This violates §4’s canonical-state and restore guarantees.

9. **P2 — Keyboard taps disappear before reaching the edge queue. Task 17, Step 3.** Keyboard sources retain only currently held keys. A keydown followed by keyup between polls leaves no evidence for `DeviceManager`, so the pressed edge vanishes. Task 16’s synthetic-frame test does not exercise this §6 requirement.

10. **P2 — Interpolation uses the beginning of the whole catch-up batch. Task 18, Step 4; Task 19, Step 4.** `recordPrev` runs once before all ticks. After several ticks, rendering interpolates across the entire batch instead of between the final two ticks, causing incorrect positions and visible jumps.

11. **P2 — HUD test has a rounding contradiction. Task 19, Steps 1 and 3.** The test expects `DOWNED 12s` for `12.4`, while the implementation uses `Math.ceil` and produces `DOWNED 13s`.

Verification: static review and in-memory execution of extracted simulation snippets with a minimal ECS stub. Full dependency-backed TypeScript/Vitest checks were not run. No files changed.