## Role
<!-- reuse -->

The subject is an implementation plan for Part iii (the scripted Valkyrn pilot, the round-length gate and tuning): a sim-side lead helper, the pilot, the gate helper and sweep tool, the gate block in duelGates, the tuning procedure and an As-built section, and the final gates. It belongs to FTLite, a deterministic TypeScript/Electron/Pixi game. Fresh subagents will execute the plan verbatim, task by task. So any of these is a defect:
- a step that would not compile or pass against the code as it will stand;
- a name that differs from what a sibling part produces;
- anything left to be checked during execution.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-18-valkyrn-iii-pilot-gate.md` at commit `c18e5a2e`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- It implements the spec `docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md`, which converged after review. It is one of three parts executed in order on one branch: `docs/superpowers/plans/2026-11-18-valkyrn-i-sim.md`, `docs/superpowers/plans/2026-11-18-valkyrn-ii-ship-and-views.md`, `docs/superpowers/plans/2026-11-18-valkyrn-iii-pilot-gate.md`.
- It is built after Sci-2 merges. Sci-2's plan is `docs/superpowers/plans/2026-11-18-sci-2-crew-of-four.md`, and its in-progress code is in `.worktrees/sci-2/`.
- The run dir `docs/superpowers/reviews/2026-11-18-valkyrn-iii-pilot-gate-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. It consumes Part i's and Part ii's names (`docs/superpowers/plans/2026-11-18-valkyrn-i-sim.md`, `docs/superpowers/plans/2026-11-18-valkyrn-ii-ship-and-views.md`). Check them against those plans.
6. The refactor of `scripted.ts` (exports, the extracted `orbitSteer`) is claimed to be a pure refactor proved by `duel-oracle same`. Check that it is.
7. Pilot determinism: no rng, no wall clock, only sim inputs, inside the determinism guard.
8. Whether the gate can actually be reached by tuning only GUN_HITS_* and VALKYRN_HULL, and what happens if no swept value passes (the plan must stop and report, never loosen the bands).
9. The claim that tuning never moves a Hound golden: which code reads these constants?

## Reading manifest

- `docs/superpowers/plans/2026-11-18-valkyrn-iii-pilot-gate.md:L1-L982`: the subject
- `docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md:L1-L325`: the spec it implements
- `docs/superpowers/plans/2026-11-18-sci-2-crew-of-four.md:L1-L2176`: Sci-2, whose post-merge code shape this plan assumes
- `docs/superpowers/plans/2026-11-18-valkyrn-i-sim.md:L1-L2545`: a sibling part (for names consumed or produced)
- `docs/superpowers/plans/2026-11-18-valkyrn-ii-ship-and-views.md:L1-L2416`: a sibling part (for names consumed or produced)
- Code: read the files the subject's tasks name. Read them in the Sci-2 worktree `.worktrees/sci-2/` (branch sci-2, the closest thing to post-Sci-2 master) and in the main checkout for anything Sci-2 does not touch. Read by range.

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` are fine. Never run the test suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The Valkyrn plays the same game: the Hunter duel in the gravity-well map.
- Mouse aim: the nose turns toward the cursor; W/S throttle; left mouse minigun, right mouse missile.
- The Valkyrn has a walkable interior built from the 2-Minute Tabletop Valkyrn deck plan.
- A fixed minigun with a lead pip (no gimbal).
- Feature parity with the Hound; ships differ only in data.
- Single player only for now; Multiplayer stays on the Hound.
- One combined Helm+Weapons seat; a crew of one.
- The build follows Sci-2 (SIM 52), and the Valkyrn takes SIM 53. The goldens move only through the bless procedure (never `--fresh`). Hound tick counts, outcomes and duelGates numbers are unchanged.

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

- **P0**: the plan is unexecutable as a whole, or it would break determinism, replay or the Hound's existing behaviour or goldens.
- **P1**: a task will fail at execution (tsc, a missing interface, a wrong signature, a name that differs from a sibling part), a step is ambiguous in a way two executors would build differently, or a required spec behaviour or test is missing.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
