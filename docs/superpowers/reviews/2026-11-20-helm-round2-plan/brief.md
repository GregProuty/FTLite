## Role
<!-- reuse -->

The subject is an implementation plan for FTLite's two-player duel, "Helm round 2": the crew Helm of the Hound (`CUTTER_CLASS`, a `newtonianHelm` class) gets a throttle that stays where it is left (−500..1000), a tap of S (or W in reverse) that cuts it through a new `throttleCut` command with a hashed `thrCut` latch, 50 % reverse, drag and stabilise back (acting under thrust), a fixed turn rate with the gas boost removed, a cold gas charge (`gas`, `gasIdle`), and the right-click heading and Space auto-face removed from the player's crew Helm; plus the console, map ring, settings, hints, the scripted Helm's cut, and the SIM_VERSION bless and bump 62 → 63. Fresh subagents will execute it task by task, verbatim, on branch `helm-round2` cut from `02b1ef81` (W-4 weapons controls merged with master). So any code block, test, anchor or command that does not match the code at that commit, or that leaves a choice to "check at execution", is a defect.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-20-helm-round2.md` at commit `ad9a1447`, worktree `C:/Users/djuar/FTLite/.worktrees/helm-round2`, branch `helm-round2`.
- The spec it implements, which converged after two review rounds and wins on intent: `docs/superpowers/specs/2026-11-19-helm-round2-design.md`. The spec quotes code from an older master (eaf84426, SIM 61); the tree has moved since (W-4 rewrote parts of `scripted.ts`, `step.ts`, `input.ts`, `runtime.ts`, `onlineDuel.ts`; Asteroids-iii landed). The plan's "Decisions" section records where it departs from the spec's letter.
- The code: everything under `src/renderer/src/` (`sim/duel/`, `sim/tactical/`, `app/duel/`, `app/settingsStore.ts`, `app/controlsList.ts`, `render/duel/`, `render/tactical/`, `ui/duel/`, `net/`) and `tests/` in this worktree. This worktree IS the tree the plan builds on; read the code here, not in the main checkout.
- The run dir `docs/superpowers/reviews/2026-11-20-helm-round2-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **The latch and its order inside `crewHelm`** (spec §2.3): clear, ramp, clamp; the cut's own tick counts; `throttleCut` admitted in its own loop after `heading`'s, against post-seat-phase seats, with `invalid-seat` / `unavailable` / `noop`. Does `crewAxes` (with its new `cut` parameter, Decision 6) fly exactly what `crewHelm` flies, gas included?
6. **The gas charge's tick arithmetic** (spec §3.3): spend order fore/aft then port/starboard, the idle count, the refill on `gasIdle === 30`. The plan's author was unsure of "full 240 ticks after that": check the test's tick counts against the rule as the spec writes it.
7. **Online prediction** (spec §7, Decision 7): `cutSent`, the new `source.cutBase()`, the predicted latch's release record and its start point, and their order within a pump. Can a late held frame still saying S be handled as the spec requires? Is every reset (result, new round, sit, stand, attach) present?
8. **The scripted Helm** (spec §5, Task 6): the cut before any stand from the crew Helm, "holds nothing", every command admitted, and the gate rule (only `CREW_SPEED_SLACK`, `AVOID_TICKS`, `EVADE_RANGE`, `ORBIT_MIN`, `ORBIT_MAX` may move; Decision 12's `CREW_` twins for the shared ones). Is the BLOCKED path concrete?
9. **Bit-identity of the Hunter and the Valkyrn** (spec §8): `stabiliseUnderThrust` absent for every other ship, the heading step without `× boost`, the velocity ring gated to newtonianHelm (Decision 13), shared constants that change (`RCS_THRUST` 70: who else reads it?). Any change that would move `tests/valkyrnIdentity.test.ts` or `tests/w4HunterIdentity.test.ts` digests is a P0.
10. **The bless and bump tasks (14, 15)** against the repo's pattern and the W-4c lesson that `golden.test.ts` cannot go red on a source-only change (verify by the basic.json digest diff and blessGuard). Are the commands real (`package.json` scripts, `scripts/bless-golden.ts`)?
11. **Kind (a) fallout**: tests the plan's changes break (boost readers, `THR_RETURN`, `CREW_FLIGHT` pins, 400 u/s cap, `RefusedControl` members, hint strings, `HELM` list pins, `powerAt` offsets, AUTO-FACE button tests). Grep for any the plan's lists miss.
12. **The author's own low-confidence list:** Decision 1's pixel rows come from theme.ts's glyph-metric comment, not a render; the Single player `tap()` helper's three ticks and `rt.frame` running no tick when time does not move; the low-power climb's assumption (30 u/s² beats gravity and drag at 300 u over 5 s: check the planet's gravity constant); the repair-driven stand test's seat assumptions; `crewThrusters` push tests now multiplied by a drag factor under `toBeCloseTo(…, 9)`; Task 14 Step 2's assumption that the sector canonical trace never runs tactical flight.

## Reading manifest

- `docs/superpowers/plans/2026-11-20-helm-round2.md:L1-L192`: header, Global Constraints, Decisions, spec coverage, Task 1 and the report skeleton.
- `docs/superpowers/plans/2026-11-20-helm-round2.md:L193-L1790`: Tasks 2 (state, L193), 3 (throttle and cut, L433), 4 (flight, L967), 5 (gas, L1510).
- `docs/superpowers/plans/2026-11-20-helm-round2.md:L1791-L2949`: Tasks 6 (scripted, L1791), 7 (keyboard, L1968), 8 (Single player, L2177), 9 (online, L2580).
- `docs/superpowers/plans/2026-11-20-helm-round2.md:L2950-L3827`: Tasks 10 (console, L2950), 11 (map, L3186), 12 (settings, L3282), 13 (hints, L3441), 14 (bless, L3553), 15 (bump, L3668), 16 (final, L3731).
- `docs/superpowers/specs/2026-11-19-helm-round2-design.md:L1-L400`: the spec.
- `src/renderer/src/sim/duel/` (`step.ts`, `helmFlight.ts`, `tuning.ts`, `modules.ts`, `snapshot.ts`, `hash.ts`, `state.ts`, `scripted.ts`, `telemetry.ts`), `src/renderer/src/sim/tactical/` (`physics.ts`, `tuning.ts`, `defs.ts`): read the ranges the plan's tasks quote.
- `src/renderer/src/app/duel/` (`input.ts`, `runtime.ts`, `onlineDuel.ts`, `onlineSource.ts`, `scene.ts`, `duelAudio.ts`), `src/renderer/src/app/settingsStore.ts`, `src/renderer/src/app/controlsList.ts`, `src/renderer/src/app/main.ts`: the ranges the plan's tasks quote.
- `src/renderer/src/render/duel/` (`situationModel.ts`, `readoutModel.ts`, `sitModel.ts`), `src/renderer/src/render/tactical/` (`tacticalModel.ts`, `tacticalLayer.ts`), `src/renderer/src/ui/duel/HelmStation.tsx`, `src/renderer/src/net/contracts.ts` and the codec: the ranges quoted.
- `tests/`: grep for the files the plan names (`crewFlight`, `duelModules`, `duelGates`, `duelScripted`, `valkyrnIdentity`, `w4HunterIdentity`, `duelSnapshot`, `golden`, the input and runtime tests) and their helpers.
- `package.json` (scripts) and `scripts/bless-golden.ts`: the bless and check commands.

Read by range, not whole files. Do not explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are the tools. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Everything the spec's §1 owner calls and §11 judgement calls decide: A / D turn; drag 0.15 and stabilise 80 for the Hound, acting under thrust; a fixed turn rate; the cold gas as a shared charge (720, spend 8, wait 30, refill 3, push 70 u/s²); the right-click heading and Space auto-face (and the AUTO-FACE button) leave the player's crew Helm; the throttle stays where it is left, an unattended Helm keeps it; a tap is judged against the throttle at keydown; the latch; reverse 50 %; the bots keep auto-face.
- The build sits on W-4 + master (`02b1ef81`, SIM 62) and bumps SIM once, 62 → 63, with the repo's bless pattern.
- The Hunter, the Valkyrn and its Flight seat, and the non-newtonian Helm are unchanged and stay bit-identical.
- Spec §5's gate rule: only the scripted Helm's five named constants may move to fix a per-seed gate; never the Hunter's knobs or the gate bands. The aggregate band stays `it.skip`.
- The fence tests are never edited.

## Output format (strict)
<!-- reuse -->

Your final message is validated against a JSON Schema; it must be a single JSON object and nothing else:

```
{ "verdict":      "changes requested" | "ready with P2s" | "ready",
  "findings":     [ { "severity": "P0"|"P1"|"P2"|"P3", "title": "<one line>",
                      "claim": "<what is wrong>", "evidence": "<subject L<n>, file:L<n>>",
                      "why": "<why it matters>", "fix": "<concrete fix>" } ],
  "prior":        [ { "id": "R<N>-F<k>", "result": "resolved" | "withdrawn" | "still open",
                      "note": "<for still open: what is still wrong, with new evidence>" } ],
  "verified":     [ "<what you checked and found correct, with citations>" ],
  "not_verified": [ "<what you could not verify and why>" ] }
```

Findings ordered by severity then importance. Do not invent IDs; new findings have no ID (the responder assigns `R<N>-F<k>` in array order). `prior` lists exactly the awaited IDs given to you, once each, and nothing else. In round 1 `prior` is empty.

## Severities
<!-- reuse -->

- **P0**: the plan is unexecutable as a whole, or executing it as written would break determinism, the online authority, or the Hunter/Valkyrn bit-identity.
- **P1**: a task will fail at execution as written (typecheck, a missing or differently shaped interface, a quoted anchor the branch does not have, a test that cannot pass), a spec rule missing or built differently without a stated reason, or a step ambiguous in a way two implementers would build differently.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
