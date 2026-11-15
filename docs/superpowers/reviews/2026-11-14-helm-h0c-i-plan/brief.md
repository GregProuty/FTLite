## Role
<!-- reuse -->

The subject is an implementation plan for H-0c-i of FTLite's Helm demo: (1) follow-ups to the merged tactical combat sim (telemetry fields on events, admission predicates, `cloneTactical`, the hunter's new standoff) and (2) a new headless `src/renderer/src/sim/duel/` module that joins the existing sector-run interior simulation (the FTL-style Cutter: sit, stand, walk, hold Interact to repair) to the tactical duel through a duel tick following spec §13. Fresh subagents will execute it task by task, verbatim, with no other context, so anything left to "check at execution" is a defect: every interface consumed must exist on master with the assumed shape, every code block must compile under strict TypeScript and pass the determinism guard, every test must pass against the code given, and the plan must implement the spec sections it claims, stating any deviation. It deliberately does not touch `net/contracts.ts` or `authority/` (Codex's Net-3 branch is changing them).

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-14-helm-h0c-i-duel-step.md` at commit `46c8c8d`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec: `docs/superpowers/specs/2026-11-14-helm-demo-design.md` §8 (interior, present or away, repair points and repair), §9 (hunter, including the **Standoff** bullet), §13 (duel phase list, command allowlist, inputs).
- The existing code it reuses unchanged: the sector interior (`src/renderer/src/sim/{state,commands,stations,interact,movement,grid,components,characters,stationKinds}.ts`, `sim/ship/{schema,derived}.ts`, `sim/ship/cutter.json`), `src/shared/intent.ts`, and the types in `src/renderer/src/net/contracts.ts`; and the merged tactical sim `src/renderer/src/sim/tactical/*`.
- The run dir `docs/superpowers/reviews/2026-11-14-helm-h0c-i-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. (Claude) **Reuse of the sector interior without the sector step.** `stepDuelTick` resets scratch itself, calls `applyInteractionCommands` (sits only, at the two role consoles), `applyConsoleCommand` (stands), `movementSystem`, and never runs `doorSystem`, `crewSystem`, hazards or the director. Check against the real code: does anything these functions read or write depend on a system that no longer runs (scratch fields, `stations.level`/`failed`, `shedPower`, interior `tick`/`ended`, `Life` state)? Are the module-level component arrays (`Position`, `Seated`, `Life`) safe for the duel's use?
6. (Claude) **The §13 phase order and command semantics** in `stepDuelTick`: seat phase order (sits batch, stands, presence), tactical admission after the seat phase, the last-wins rule, the held-axis mapping (thrust = −moveY), repair before movement, then `stepDuel`, then the interior tick. Stale-tick handling for every kind.
7. (Claude) **Repair** against spec §8: same-room plus `REACH`, solo and team rates in whole units (960 / 4 and 5), progress kept through release and hits, cleared at level 0, the gunner's zero-walk Weapons repair.
8. (Claude) **Determinism:** the duel hash covers every field the duel can change and that affects future ticks; no order or float hazards; `createDuel` throwing on a bad map or repair point.
9. (Claude) **The hunter standoff** against the new §9 bullet, and whether it changes any H-0b test expectations in a way the plan's replaced test files do not account for.

## Reading manifest

- `docs/superpowers/plans/2026-11-14-helm-h0c-i-duel-step.md:L1-L1897` the subject (Scope L13, Global Constraints L28, Decisions L39, File structure L63, Task 1 L80, Task 2 L1395, After L1887)
- `docs/superpowers/specs/2026-11-14-helm-demo-design.md:L167-L206` spec §8 and §9; `L267-L287` spec §13
- `src/renderer/src/sim/step.ts:L1-L67` the sector step the duel does not call (scratch reset list, system order)
- `src/renderer/src/sim/commands.ts:L1-L130` `commandResult`, `applyInteractionCommands`, `applyConsoleCommand`
- `src/renderer/src/sim/stations.ts:L1-L65`, `interact.ts:L1-L60`, `movement.ts:L1-L69`, `grid.ts:L1-L52`, `components.ts:L1-L20`, `characters.ts:L1-L40`
- `src/renderer/src/sim/state.ts:L1-L160` `SimState`, `createSimState`, `spawnCrew`
- `src/renderer/src/sim/ship/derived.ts:L1-L60` (`roomIndex`, `width`, `stationOfKind`)
- `src/renderer/src/net/contracts.ts:L1-L80` (`HeldInput`, `CommandEnvelope`, `CommandReason`, `RunId`)
- `src/shared/intent.ts:L1-L30`
- the merged tactical files the plan replaces: `src/renderer/src/sim/tactical/{state,weapons,missiles,hunter,tuning}.ts` and `tests/tactical{Weapons,Missiles,Hunter,Determinism}.test.ts` (diff them against the plan's replacements)

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff`, `node -e` for arithmetic checks, and `npx tsc --noEmit` on scratch copies outside the repo are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined spec is the authority; its *(start)* numbers are the values to use; §9's standoff bullet (`876de31`) is part of it.
- H-0c is split: H-0c-i (this plan: headless duel tick, no `net/contracts.ts` or `authority/` changes) and H-0c-ii (shared command union, lifecycle presence, authority mode, scripted pair, telemetry and §16 gates, golden replay, `SIM_VERSION`, interior deep copy and snapshots) after Codex's Net-3 merges.
- Determinism rules from Net-1: Float64 with + − × ÷ and sqrt only in the sim; the existing AST guard is the enforcement.
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

- **P0**: the plan is unexecutable as a whole, produces a nondeterministic sim, or breaks the sector run.
- **P1**: a task will fail at execution (tsc error, missing interface, wrong signature, a test that cannot pass as written), a spec requirement H-0c-i claims is missing or contradicted, a test that passes for the wrong reason, or a reuse of the sector interior that silently depends on a system the duel does not run.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
