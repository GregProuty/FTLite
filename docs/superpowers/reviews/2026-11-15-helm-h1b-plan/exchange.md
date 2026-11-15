# Codex review exchange: helm-h1b-plan

Subject: `docs/superpowers/plans/2026-11-15-helm-h1b-duel-screens.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: Claude.

---

# Round 1 (full, reviewing e51eb19, effort high, 362 s, 4050535 in / 3865088 cached / 17010 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Rapid Tab followed by X or E loses the seat command
The runtime can queue a stand or sit after Tab but before the next tick. The sim processes seat commands before the queued presence change, so it rejects the command because the newly active character is still away. · plan L2603-L2619 queues Tab presence and subsequent seat commands for the next tick; src/renderer/src/sim/duel/step.ts:L80-L96 validates sits and stands against presence before applying presence commands. The runtime tests put a tick between Tab and X (plan L2201-L2203). · At render rates above 60 fps, an ordinary quick Tab–X or Tab–E can silently lose the action until the key is released and pressed again. · Keep sit and stand edges pending until the Tab presence tick has run, then stamp and send them on the following tick. Add a scripted test with Tab and X or E sampled in separate frames before one tick.

### [P1] R1-F2 Shared arrow spreading changes the H-1a flight view
The replacement tactical model spreads off-screen arrows for every caller, including flight mode, although the review requires the flight view to retain its H-1a behavior. · plan L995-L1006 and L1062-L1067 add unconditional spreading; src/renderer/src/app/duel/flightMode.ts:L57-L60 calls that model with ship 0; the H-1a model returns arrows without spreading at src/renderer/src/render/tactical/tacticalModel.ts:L245-L253. · When the flight camera is panned so the ship and planet crowd one edge, their arrow positions change. · Apply spreading only for duel views, such as when the model input includes ship 1, and retain the original flight arrow positions.

### [P1] R1-F3 The repair acceptance test teleports to the target
No headless runtime test walks a character to a damaged room and then repairs it using scripted keys, as the H-1b acceptance spec requires. · spec L161 requires headless runtime coverage through scripted keys; plan L2201-L2208 uses put() to place the gunner beside the Weapons repair point, while plan L2217-L2224 tests walking separately without repair. · Both tests can pass while the walk-to-repair interaction is broken. · Add a runtime test that uses scripted WASD input to walk from a console to a Shields or Engines repair point, then holds E and verifies repair progress.

### [P2] R1-F4 Restart retains the previous seed's star field
The tactical layer is created once with the initial seed; restart only resets its drawings and never regenerates its seeded stars. · spec L55 requires view-owned caches to reset on restart, and spec L103 calls for a seeded star field; plan L1155-L1161 builds the stars once, plan L2977 passes the initial seed, and plan L3013-L3016 calls reset() without recreating the layer. · A duel restarted with seed + 1 displays stars generated for the old duel. · Recreate the tactical layer with runtime.seed on an epoch change, or add a reseed method that redraws its star field.

## Verified
- At fd651f7, createDuel, disposeDuel, stepDuelTick, DuelEnvelope and DuelResult have the shapes used by the plan (src/renderer/src/sim/duel/state.ts:L15-L57; src/renderer/src/sim/duel/step.ts:L17-L17,L71-L71; src/renderer/src/sim/duel/commands.ts:L5-L18).
- The predictor's shallow state copy is sufficient for flyMissile as written: flyMissile mutates only the copied missile, while touchesSolid reads the map and grid (plan L589-L600; src/renderer/src/sim/tactical/missiles.ts:L33-L44; src/renderer/src/sim/tactical/predict.ts:L10-L19).
- The interior layers expose the methods the plan calls, and the view uses a separate RenderMemory and a 1060-pixel fit band (plan L220-L233,L301-L339; src/renderer/src/render/tiles.ts:L11-L16; src/renderer/src/render/roomIcons.ts:L66-L69; src/renderer/src/render/memory.ts:L4-L19).
- The normal restart path disposes the old duel, resets sequences, input and interpolation state, preserves the pacer's pause-reason set, and creates a fresh driver (plan L2591-L2599; plan L2415-L2431).
- The planned main.ts retains the existing sector startup body, and package.json adds the duel script without removing the existing scripts (plan L3105-L3138,L3214-L3253; src/renderer/src/main.ts:L30-L63; package.json:L6-L19).

## Not verified
- Tests, typecheck, build and screenshots were not run: this review was read-only, and the request prohibits running the Jest suite.
- The review ledger is absent in this checkout. No review round was posted because file modification was prohibited.
- Narrow supporting reads outside the manifest covered seat validation, station power, panel return type and Cutter tile layout; no broader repository exploration was performed.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at the brief commit. 4 accepted (3 P1, 1 P2), 0 rejected, 0 deferred. All four were confirmed against the plan and the sim.

## R1-F1 [P1]: Rapid Tab followed by X or E loses the seat command

Confirmed: `stepDuelTick` checks sits and stands against presence before it applies the presence commands (`sim/duel/step.ts:L80-L96`). So a stand queued after Tab, but in the same tick, was rejected. The runtime now holds back a sit or stand queued after a Tab until the Tab's presence tick has run, and sends it on the next tick (plan decision 12). Two new runtime tests sample Tab then X, and Tab then E at a free console, in separate frames before one tick. Both fail without the fix and pass with it.

## R1-F2 [P1]: Shared arrow spreading changes the H-1a flight view

Confirmed. Spreading is now opt-in through `spreadArrows?: boolean` on the model input, and only the duel boot sets it (decision 18). A new test shows that without the option, the arrows keep H-1a's exact positions for the flight view's input.

## R1-F3 [P1]: The repair acceptance test teleports to the target

Confirmed. A new runtime test damages Engines, stands the gunner with X, and walks it with scripted A for 100 ticks west along row 6, through the one-tile doors at columns 6 and 4, into Engines. It then holds E, and repair progress rises by 10 × the solo rate.

## R1-F4 [P2]: Restart retains the previous seed's star field

Confirmed. The tactical layer gains `reseed(seed)`, which redraws the stars once in the same Graphics, and the duel boot calls it with `runtime.seed` on an epoch change. A new test checks that no display objects are added and that the same number of stars is drawn.

## Also changed

- Plan prose: decisions 12, 15 and 18, the Task 2 interfaces, the file table, scope and test counts.
- Re-verified by extracting the plan task by task into a fresh worktree at master. Each task's tests pass in order (3, 39, 23, 8, 30, 13) with a clean typecheck, and the files are byte-identical to the prototype. Full suite: 1,925 passed.

## Files changed

- docs/superpowers/plans/2026-11-15-helm-h1b-duel-screens.md

<!-- end -->

---

# Round 2 (delta, reviewing a1924bc, effort medium, 57 s, 247881 in / 184448 cached / 2709 out)

Verdict: ready

## Prior findings
- R1-F1: resolved — Seat commands queued after Tab are deferred until the presence tick completes, then sent on the next tick (plan L2642-L2672). The new tests sample Tab then X or E in separate frames before that tick (plan L2257-L2274).
- R1-F2: resolved — Arrow spreading is opt-in (plan L1091), and the duel boot enables it (plan L3110-L3114). The flight caller does not enable it (flightMode.ts:L57-L60).
- R1-F3: resolved — The new test walks the gunner from Weapons into Engines using scripted movement, then holds E and checks repair progress without repositioning the character (plan L2241-L2255).
- R1-F4: resolved — The layer redraws stars for a new seed in its existing Graphics (plan L1193-L1200, L1349-L1351), and the duel boot calls reseed on restart (plan L3098-L3101).

## Verified
- HEAD is a1924bc; git diff --check for the subject passed.
- The seat-command deferral matches the sim’s seat-before-presence order (step.ts:L80-L96; plan L2642-L2672).
- The changed arrow behavior leaves the flight caller’s model input unchanged (flightMode.ts:L57-L60; plan L1091).

## Not verified
- I did not run tests or typecheck; this was a read-only review of the plan.
- The named review-run files were inaccessible in this checkout, so I used the ledger and response supplied in the brief.

---

# Round 2 response (no subject change)

Reviewed `round-2.json`. No new findings. Codex confirmed R1-F1 to R1-F4 resolved. Verdict: ready.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

