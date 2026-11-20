## Role
<!-- reuse -->

The subject is an implementation plan for Net-4a, client-side prediction by re-simulation for an online two-player game duel (a deterministic 60 Hz TypeScript simulation, a host authority, and Net-3 delta-coded state streams). Fresh subagents will execute it task by task, with only their own task's text in front of them. Code in the plan that would not compile, an interface it consumes that does not exist with that shape, a test that cannot pass against the helpers that really exist, or a predictor rule that gives the wrong state is a defect. "Check at execution" is not an acceptable answer to any of these.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-20-net-4a-duel-prediction.md` at commit `50b28e6b`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec it implements: `docs/superpowers/specs/2026-11-19-net-4a-duel-prediction-design.md`. It converged after 3 refine rounds. The plan names one deviation (Task 4, "Plan deviation 1"), which must be judged on its merits.
- The codebase areas the plan touches, listed in the manifest.
- The run dir `docs/superpowers/reviews/2026-11-20-net-4a-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Predictor correctness (Task 4).** Trace `confirm` and `tick`:
   - the anchor and offset;
   - the trim, with commands leaving only by `commandHighWater`;
   - the target, its slack and clamp;
   - verify by hash and input keys;
   - the re-simulation;
   - the reset rules.

   Look for a case where `P` loses or double-applies a command, perpetually re-simulates under steady conditions, or steps past the cap. Plan deviation 1 (`offset = target - local`) needs particular scrutiny.
6. **Task 4's hand-built tests.** Do the numbers come out as the assertions claim? Check "runs ahead ... verifies" (lead 6, the last 10 verified) and the command test (throttle stays 2 from L=10). Check too whether the Valkyrn `throttle` command applies immediately in `stepDuelTick`.
7. **The gate tests in Task 5 and the corrections test in Task 11.** Is their arithmetic right: warm-up, lead, the slices? Can the onlineDuel helper with an impaired link actually be driven this way (clock, flush and sync)? Is the G5 `keep` logic right?
8. **The session rewrite (Task 7).** Does it keep every once-per-pump behaviour, given that the old `pump` body becomes `produce`? Are early returns, `producing` and `stopInput` handled? Does it break the existing session tests' rig (`rig().pump` advances 1000/60 ms)?
9. **Task 9's removal.** Is anything still referenced, and do the rewritten tests express the real behaviour?
10. **The measuring script (Task 11).** Does it compile against the real APIs: `scriptedInput`'s envelope shape, `rockAt`/`rockSlots`/`rockAlive`, and the predictor's `step` option?
11. **Boundary rules.** `clientControl` is guarded by `tests/boundary.test.ts`: there must be no forbidden Math and no import of app/render/input.

## Reading manifest

Plan sections:

| Range | What it is |
|---|---|
| `docs/superpowers/plans/2026-11-20-net-4a-duel-prediction.md:L1-L82` | header, constraints, file map |
| `...:L83-L227` | Task 1 |
| `...:L228-L387` | Task 2 |
| `...:L388-L576` | Task 3 |
| `...:L577-L995` | Task 4 |
| `...:L996-L1187` | Task 5 |
| `...:L1188-L1436` | Task 6 |
| `...:L1437-L1673` | Task 7 |
| `...:L1674-L1811` | Task 8 |
| `...:L1812-L1964` | Task 9 |
| `...:L1965-L2122` | Task 10 |
| `...:L2123-L2342` | Task 11 |
| `...:L2343-L2410` | Task 12 and coverage |

The spec, `docs/superpowers/specs/2026-11-19-net-4a-duel-prediction-design.md`:

| Range | What it is |
|---|---|
| `:L46-L184` | design §3 |
| `:L203-L218` | gates §6 |

Code (all under `src/renderer/src/` unless stated):

| Range | What it is |
|---|---|
| `net/contracts.ts:L32-L202` | HeldInput, PublishedState, commands |
| `net/codec.ts:L156-L218` | `messageSchemaFor`, publication schema |
| `authority/core.ts:L276-L295` | `publishCompletedState` |
| `authority/core.ts:L314-L333` | `acceptHeld`, expiry |
| `authority/core.ts:L433-L475` | pause, `executeTick` |
| `clientControl/streamClient.ts:L196-L205` | `neutralize` |
| `clientControl/duelClient.ts:L1-L81` | `DuelPublication`, client `held`/`command` |
| `src/network/modes/duelStream.ts:L1-L70` | image metadata carries the publication |
| `src/network/state/sender.ts:L13-L16` | `STATE_CADENCE_TICKS` |
| `src/network/modes/duel.ts:L17-L24`, `src/network/modes/sector.ts:L18-L26` | mode definitions |
| `src/network/online/onlineDuel.ts:L17-L25`, `src/network/online/onlineSector.ts:L28-L33` | schema version pairs |
| `sim/duel/step.ts:L39-L41` | `DuelInput` |
| `sim/duel/step.ts:L182-L186` | `crewAxes` |
| `sim/duel/step.ts:L271-L280` | `stepDuelTick` |
| `sim/duel/snapshot.ts:L114-L118` | save |
| `sim/duel/snapshot.ts:L208-L230` | load and restore |
| `sim/duel/hash.ts:L13-L24` | `flattenDuel`, `hashDuel` |
| `sim/duel/scripted.ts:L367-L425` | `scriptedInput` and its envelopes |
| `sim/tactical/rockBreak.ts:L119` | `breakRock` signature |
| `sim/tactical/rocks.ts` | `rockAt`, `rockAlive`, `rockSlots`, `beginRockTick`; grep the exports |
| `sim/tactical/state.ts:L303-L312` | `missileOf`; grep `CREW_SLOT`, `Outcome`, `NO_AXES`, `createTacticalState` |
| `sim/rng.ts` | `createRng`, `nextFloat` exports, as `sim/duel/scripted.ts` imports them |
| `app/duel/onlineDuel.ts:L1-L469` | the session (whole file; Tasks 7, 9, 10) |
| `app/duel/onlineSource.ts:L1-L218` | the view source (Tasks 6, 9) |
| `app/duel/scene.ts:L61-L98` | DuelViewSource |
| `app/duel/scene.ts:L225-L262` | draw head |
| `app/duel/scene.ts:L355-L405` | events, kill, sound, interior call |
| `app/duel/duelAudio.ts:L1-L74` | audio frame |
| `render/duel/interiorView.ts:L42-L50` | interface |
| `render/duel/interiorView.ts:L113-L130`, `:L176-L182`, `:L205-L212` | crew positions |
| `render/crewSprites.ts:L28`, `:L53-L59`, `:L71-L73` | presentation points |
| `src/network/state/timeline.ts:L1` | PresentationPoint |
| `render/duel/latencyOverlay.ts:L1-L20` | overlay lines |
| `net/duelRecord.ts:L1-L80` | record and schema |

Tests and scripts:

| Range | What it is |
|---|---|
| `tests/helpers/onlineDuel.ts:L1-L61` | headless online rig |
| `tests/helpers/linkPair.ts:L1-L39` | link pair |
| `tests/helpers/duelSeat.ts:L1-L25` | seated duel |
| `tests/helpers/duelAuthority.ts:L17-L22` | `resolveCutter`, `duelInit` |
| `tests/helpers/scriptedDuel.ts:L1-L62` | CUTTER, runDuel |
| `tests/onlineDuelSession.test.ts:L1-L144` | stub client and rig |
| `tests/onlineDuelSession.test.ts:L500-L570` | throttle cases |
| `tests/duelOnlineView.test.ts:L1-L60`, `:L185-L218` | view source tests |
| `tests/crewHelmOnline.test.ts:L1-L57` | crew Helm online tests |
| `tests/boundary.test.ts:L1-L30`, `tests/helpers/determinismGuard.ts:L1-L40` | the deterministic guard |
| `scripts/determinism/run.ts:L1-L80`, `scripts/determinism/browser.ts`, `scripts/determinism/protocol.ts:L29-L38` | cross-engine run |
| `scripts/spike-asteroids-iii-idle.ts:L60-L80` | how a burst is applied today |

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are fine. Never run the test suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Duel only. The sector gets no predictor.
- One predicted timeline for the ship world. Other players' characters are interpolated from confirmed (spec §3.6).
- Effects stay on confirmed counters (spec §3.7). Early effects for your own shots are left for later.
- No sim rule, golden, determinism fixture or SIM_VERSION (62) changes.
- The publication carries `held`, with duel schema 2→3 and sector 1→2 moved in pairs.
- PREDICT_MAX_TICKS 30, a slack of 2, at most 4 local ticks per pump, 60 Hz local ticks.

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

- **P0**: the plan is unexecutable as a whole, or the predictor as written would draw a wrong state persistently: it loses or double-applies commands, never verifies under steady conditions, or desyncs.
- **P1**: a task will fail at execution (tsc, a missing interface, a wrong signature, a test that cannot pass as written), a predictor rule would mispredict in ordinary use, a spec requirement has no task, or an unstated deviation from the spec.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
