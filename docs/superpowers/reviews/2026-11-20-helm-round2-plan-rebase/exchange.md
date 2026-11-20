# Codex review exchange: helm-round2-plan-rebase

Subject: `docs/superpowers/plans/2026-11-20-helm-round2.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing de138abb, effort medium, 229 s, 2521571 in / 2421963 cached / 15826 out)

Verdict: ready

## Findings

### [P3] R1-F1 Task 8's run list leaves out the two blip tests that drive the real runtime and scene through a Hound Helm sit
Task 8 changes `runtime.ts` (the crew Helm branch, the stale frame, the held frame) and `scene.ts` (the right button and the goal). Two tests that master added or changed build `createDuelRuntime` plus `createDuelScene` on the Hound and draw frames: `engineeringFog.test.ts` sits the crew at the Helm and checks the zoom, and `sensorsBlipReadout.test.ts` checks the drawn OUTSIDE strip. Neither is in Task 8's Step 8 run list. They are only in Task 10's. · plan L2583 (Task 8 Step 8 run list); plan L3189 (Task 10 Step 6, the only task that runs them); tests/engineeringFog.test.ts:L135-L168 (`seatDuelCrew(rt.duel); rt.frame(...)`, then `scene.draw`, `rt.cameras.helm.targetZoom`); tests/sensorsBlipReadout.test.ts:L86-L108 (runtime and scene on `hound`). Task 13 changes `SIT_CARDS.helm`, and tests/sensorsBlipReadout.test.ts:L81-L82 calls `sitCard('helm', …)`, but Task 13's run list (plan L3556) leaves this file out too. · Both tests should still pass. The zoom on a sit, `sitCardBelow` and the ENEMY row do not depend on Task 8's or Task 13's edits, and the card tests read only `.top`. But a break caused by Task 8 would only show up two tasks later, in Task 10, and be blamed on the wrong task. · Add `tests/engineeringFog.test.ts tests/sensorsBlipReadout.test.ts` to Task 8 Step 8's `npx vitest run` line, and `tests/sensorsBlipReadout.test.ts` to Task 13 Step 5's.

## Verified
- Nothing is left over from the old base: grepping the plan for `62`, `02b1ef81` and `6aad809e` finds no match. Every mention of a version reads 63 at the base and 63 → 64 for the bump (plan L9, L18, L31, L101, L3580, L3593-L3606, L3688-L3762).
- SIM_VERSION is 63 at the base: src/renderer/src/sim/tuning.ts:L7 reads `export const SIM_VERSION = 63;`, which is what Task 1 Step 1 and Task 14 Step 1 expect.
- `basic.json` header: `simVersion` 63 and `finalHash` `f616991e` (tests/golden/basic.json:L1). This matches plan L3593.
- `duel-1.json`: simVersion 63, outcome 2, 9641 ticks, finalHash def3825f, and 16 hashes (tests/golden/duel-1.json:L2-L24). This matches plan L3594.
- `duel-rematch.json`: rematchTick 9641; rounds of 9641 ticks (outcome 2) and 6131 ticks (outcome 2); finalHash daaf236a; 26 hashes (tests/golden/duel-rematch.json:L5-L47). This matches plan L3596.
- Task 4's puffs: the quoted comment, the `if (vt && … || vt.boosted)` line and the `if (vt.boosted) {…}` line are verbatim at src/renderer/src/render/tactical/tacticalModel.ts:L533-L541, inside the stated range 533-542.
- Task 11's model: the `HelmDraw` steer doc and `steer?: … | null }` are at tacticalModel.ts:L92-L93, the `velocity:` line is verbatim at L576, `CircleDraw` exists (L65) and `classOf` is imported (L7).
- Task 11's layer: the quoted `line.length = 0; line.push(hd.origin.x, …)` and `segments(helm, dashLine(…), 2, CRT.main, 0.9);` are at src/renderer/src/render/tactical/tacticalLayer.ts:L341-L342, on the `helm` graphics.
- Task 11's test: `ShipClass.Valkyrn` exists (src/renderer/src/sim/tactical/defs.ts:L160), and `createTacticalState(5, 2, cls)` is the shape engineeringFog.test.ts:L127 already uses.
- Task 8's `scene.ts` edits: the right-button block is verbatim at scene.ts:L313-L317 (its `if` runs to L322), the goal line is verbatim at L409-L410, and `crewSeat` is in scope (L266).
- Task 10's `scene.ts` anchors: the `consoleModel({ duel: d, … thrMille: source.thrMille?.() ?? d.thrMille, …` call is at scene.ts:L454, and `const vent = source.helmVent?.() ?? d.helmVent;` is at L381.
- Task 10's readout: `if (!crewed(helm)) rows.push(em(row('', 'COASTING', DIM, WARN), 'alert'));` is verbatim at src/renderer/src/render/duel/readoutModel.ts:L159. It sits under the HELM row (L158) and before WEAPONS (L160) and ENEMY (L162-L171).
- Decision 19, readout: the blip's ENEMY row stays one row (readoutModel.ts:L162-L167, with the comment 'One row either way'). Every count-only `readoutRows` call in the scene uses mode 'weapons', which has no OUTSIDE strip (scene.ts:L302, L308, L376). The drawn call passes `fog` (L462). So a THRUST/COASTING row that stays one row cannot change any count. Task 10's readout test passes no `fog` (plan L3051-L3053).
- Decision 19, layer: the blip is drawn in the contours pass (tacticalLayer.ts:L262-L265) and its arrow at L186. Every `sensorsBlipLayer` frame has `helm: null` (tests/sensorsBlipLayer.test.ts:L15), and its CIRCLE ink is alpha 0.7 where the ring's is alpha 0.9, so the ring cannot match CIRCLE or add display objects in those tests. CRT.mid is in the ramp.
- Decision 19, sit card: `sitCardBelow` (scene.ts:L181-L183) depends only on fog and positions. It is applied at L471, and Task 13 does not touch it. The blip tests read only `sitCard('helm', …).top` (tests/sensorsBlipReadout.test.ts:L81-L82).
- Kind (a) fallout from the blip: valkyrnViews.test.ts pins no helm draw shape, no velocity, puff or COASTING value (grep: only `helmArc` at L82, L93). No test deep-equals a `HelmDraw` (grep `.helm).toEqual` finds no match), so the new `velocityRing` key breaks no equality. Every blip test file the plan names exists (tests/sensorsBlipMap, sensorsBlipLayer, sensorsBlipReadout, engineeringFog, valkyrnViews).
- `boosted` in tests outside Task 4's kind (a) list (w4Auto.test.ts:L96, snapshot.test.ts:L503) is unrelated prose, not the vent field.
- The renumbered Decision 20 (refill ticks) is cited by number nowhere else, so no reference went stale. Task 5's pin `29 + 239` is at plan L1614.
- The six earlier review fixes survive: R1-F1 (Task 1's ancestor and code-equality check, now against 2c4f7c5d, plan L127-L128); R1-F2 and R1-F3 (crewOfFourWire L64 in Task 2, plan L206/L432; duelThrottle in Task 3, plan L457); R1-F4 (seed search over 1..4000 before tick 5000, plan L3644-L3663); R1-F5 (now Decision 20, plan L81); R1-F6 (`engines(d, 4)` after the repair, plan L509-L536).
- `KeySample.throttleDown` and `throttleTap` are optional (plan L34, L2103-L2106), so the blip tests' KeySample literals still typecheck after Task 7.

## Not verified
- The commit message of 1b0103a8 (`git log -1 --format=%B`) and the `basic.json` line '120 checkpoints'. I had no git access (Read, Grep and Glob only) and did not count checkpoints in the single-line basic.json. Only `finalHash f616991e` and `simVersion 63` were confirmed.
- Whether Task 1 Step 1's `git diff --quiet 2c4f7c5d HEAD -- src tests scripts package.json` passes. I could not list the files changed by the commits after 2c4f7c5d (96c5824b, b3e2e1d8, de138abb). Their subjects say they touch the plan and the review brief only. The untracked files in the snapshot are under docs/superpowers/reviews/, outside the checked paths.
- The full `git diff 02b1ef81 2c4f7c5d` for leadModel.ts, fogModel.ts and sim/tuning.ts. The plan quotes no text from leadModel.ts or fogModel.ts, and quotes only line 7 of tuning.ts, which I checked.
- Whether the canonical-trace and bless scripts print lines word for word as Task 14 and Task 15 expect at version 63. I did not run or read scripts/golden/*. The re-base changed only the version numbers in those lines.
- Whether the tests pass. I ran no tests, as instructed.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `de138abb`. 1 accepted, 0 rejected, 0 deferred. No prior IDs (round 1). Verdict "ready".

## R1-F1 [P3]: Task 8's run list leaves out the two blip tests that drive the real runtime and scene through a Hound Helm sit

Confirmed. `tests/engineeringFog.test.ts:L138-L146` builds `createDuelRuntime` on the Hound and seats the crew with `seatDuelCrew`. `tests/sensorsBlipReadout.test.ts:L81-L82` calls `sitCard('helm', …)`, and Task 13 changes `SIT_CARDS.helm`. Task 8 Step 8's run line now adds both files. Task 13 Step 5's adds `tests/sensorsBlipReadout.test.ts`.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-20-helm-round2.md

<!-- end -->

---

