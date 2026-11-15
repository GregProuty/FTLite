## Role
<!-- reuse -->

The subject is an implementation plan for H-0c-ii-a of FTLite's Helm demo: the headless gates. It has four tasks:
1. Per-tick repair events and a telemetry accumulator in the deterministic duel sim.
2. A scripted Helm and gunner pair with BFS walking to repairs.
3. The ten-seed parent §16 gate test, a telemetry script and the tuning that meets the gates (`SHIP_HULL` 30 → 40).
4. The `SIM_VERSION` 35 → 36 bump with `flattenDuel` including it, the sector goldens and the determinism-v2 fixture re-blessed version-only, and a duel golden.

Fresh subagents will execute it task by task, verbatim, with no other context. Anything left to "check at execution" is therefore a defect:
- every interface consumed must exist on master with the assumed shape;
- every code block must compile under strict TypeScript and obey the determinism guard;
- every test must pass against the code given;
- the bless steps must produce exactly what the plan states;
- the sector game's behaviour must be unchanged (version-only re-bless).

The plan's code and tuning were prototyped and the plan was re-extracted task by task; review it on its merits.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-15-helm-h0c-ii-a-headless-gates.md` at commit `8b28cba`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec: `docs/superpowers/specs/2026-11-15-helm-h0c-ii-a-headless-gates-design.md` (refined over 5 rounds). The parent is `docs/superpowers/specs/2026-11-14-helm-demo-design.md`, §13 and §16.
- The code it builds on:
  - `src/renderer/src/sim/duel/*` and `src/renderer/src/sim/tactical/*`;
  - `src/shared/rng.ts`, `src/renderer/src/sim/tuning.ts` and `sim/flatten.ts`;
  - `tests/golden.test.ts`, `tests/replayV2.test.ts` and `tests/golden/`;
  - `tests/fixtures/determinism-v2.json` and its capture script under `scripts/determinism/`;
  - `package.json` (`bless`), `tests/helpers/determinismGuard.ts` and `tests/boundary.test.ts`;
  - `tests/duelReadout.test.ts`, which the hull change touches.
- The run dir `docs/superpowers/reviews/2026-11-15-helm-h0c-ii-a-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. (Claude) **Determinism:** the new sim files (`scripted.ts`, `telemetry.ts`, the repair-event change) must use only `Math.abs/ceil/floor/round/min/max/sign/imul/sqrt`, no `Date`/`performance`, randomness only via `shared/rng`, and no imports from app/render/authority/headless. The plan's orbit-tilt decision avoids trig; verify every expression.
6. (Claude) **Behaviour unchanged where it must be:**
   - the repair events must not change repair behaviour or the duel hash;
   - the pair must send only commands the duel step admits;
   - `SHIP_HULL` 30 → 40 is the only game-number change, and the plan must list everything it touches: the readout test, any other test pinning 30, and H-1b screens.
7. (Claude) **The re-bless:**
   - does the plan's diff step really prove version-only for `tests/golden/basic.json`?
   - does the new `scripts/determinism/rebless-version.ts` guard (all canonical fields except `$simVersion`, all samples and boundaries unchanged) actually fail on any gameplay change?
   - are `net1a-baseline.json` and `net1a-gates.json` untouched, with their projection checks still asserting?
   - is the duel golden generated reproducibly by a stated command?
8. (Claude) **The gate test:** does it assert exactly the §16 gates as the spec transcribes them? Check the per-seed split with a 60 s timeout, and that no seed can be dropped or skipped. Check the terminal-cause attribution (planet-contact end before tick 1800), and the cap.
9. (Claude) **Telemetry correctness:**
   - baits from per-body `graceUntil` diffs;
   - repair start and finish semantics (the plan counts a finish per level cleared);
   - the idle predicate;
   - "in arc" defined without line of sight (a plan decision); check whether that contradicts the spec's gunner release rule, which requires line of sight.
10. (Claude) **Tests that pass for the wrong reason.**

## Reading manifest

- `docs/superpowers/plans/2026-11-15-helm-h0c-ii-a-headless-gates.md:L1-L2234` the subject (Scope L22, Global Constraints L30, Decisions L42, File structure L112, Task 1 L134, Task 2 L974, Task 3 L1370, Task 4 L1780, After L2228)
- `docs/superpowers/specs/2026-11-15-helm-h0c-ii-a-headless-gates-design.md` (whole, about 140 lines)
- `src/renderer/src/sim/duel/step.ts`, `state.ts`, `hash.ts`, `tuning.ts`
- `src/renderer/src/sim/tactical/state.ts:L1-L90`, `duel.ts`, `contacts.ts`, `weapons.ts`, `missiles.ts`, `hunter.ts` (`pursuitTurn`), `predict.ts`, `geometry.ts`, `grid.ts`, `map.ts`, `tuning.ts`
- `src/shared/rng.ts`; `src/renderer/src/sim/tuning.ts:L1-L20`; `sim/flatten.ts:L40-L60`
- `tests/golden.test.ts`, `tests/replayV2.test.ts` (heads); `ls scripts/determinism tests/fixtures tests/golden`
- `tests/helpers/determinismGuard.ts`
- `grep -rn "30/30\|SHIP_HULL" src tests | head`

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `node -e` arithmetic checks are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined H-0c-ii-a spec and its parent are the authority. That includes the §16 gates, the scripted pair for tests only (Q15) and walking repair (Q27). The (rec.) choices were taken under the owner's standing order and may be questioned only with evidence of a defect.
- H-0c-ii-a must not touch `authority/`, `net/contracts.ts`, `app/` or `render/` (except a test that pins a tuning value). It must not change sector behaviour beyond the version number.
- Determinism rules apply to the guarded roots (sim, authority, net, clientControl, events, shared).
- Commits by explicit path only; the owner keeps unrelated uncommitted files in the checkout.

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

- **P0**: the plan is unexecutable as a whole, makes the sim nondeterministic, changes sector behaviour beyond the version number, or lets the re-bless hide a gameplay change.
- **P1**: a task will fail at execution (tsc error, missing interface, wrong signature, a test that cannot pass as written, a bless step that produces something else). Also: a spec requirement is missing or contradicted without saying so, a gate is not asserted as specified, or a test passes for the wrong reason.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
