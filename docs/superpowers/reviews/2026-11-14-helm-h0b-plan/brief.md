## Role
<!-- reuse -->

The subject is an implementation plan for H-0b of FTLite's Helm demo: headless combat added to the deterministic tactical sim in `src/renderer/src/sim/tactical/` (shields and damaged rooms, a laser with arcs, room lock and charge-and-release, hand-steered cruise missiles with their collision rows, a hunter AI that flies the enemy ship through the same per-ship input, and a `stepDuel` tick). Fresh subagents will execute it task by task, verbatim, with no other context, so anything left to "check at execution" is a defect: every interface consumed must exist on the current branch with the assumed shape, every code block must compile under the repo's strict TypeScript and pass the determinism guard, every test must pass against the code given, and the plan must faithfully implement the spec sections it claims, stating any deviation.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-14-helm-h0b-combat.md` at commit `f5da2df`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec it implements: `docs/superpowers/specs/2026-11-14-helm-demo-design.md` §5 (ships, shields, damage effects), §7 (laser, missiles, and the "Weapons state transitions" table), §9 (hunter), and the missile rows of the §4 collision matrix. Spec §8 (interior, presence) and §13 (duel step with commands) are H-0c, not this plan; check the split is coherent.
- The code it builds on: H-0a's tactical sim, merged on master: `src/renderer/src/sim/tactical/{tuning,state,hash,physics,contacts,direction,grid,map,predict}.ts` and `tests/tactical*.test.ts`; `src/shared/rng.ts`; the determinism guard (`tests/boundary.test.ts`, `tests/helpers/determinismGuard.ts`).
- The run dir `docs/superpowers/reviews/2026-11-14-helm-h0b-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. (Claude) **The §7 Weapons state transitions table.** Trace every row against `applyWeaponsInput`, `tickWeapons` and `laserFrozen`: press, full release, partial release, commands while a missile flies, launch, missile end (including "a frozen full charge resumes its hold timer"), unattended, re-attended. Plan decision 4 (the hold timer runs without Fire held) is the riskiest reading.
6. (Claude) **The hunter against spec §9.** Lead point, 30° thrust rule, lookahead avoidance (what "comes within body radius + 30" means), jitter scheduling and its single rng draw, lock rule, missile launch and the 18-tick trail, and the repair visit (priority, walk then work, one level, which console is empty, hits do not interrupt). Also whether `hunterThink` mutating hunter state before `stepDuel` applies inputs causes any ordering bug.
7. (Claude) **Missile contacts against the §4 matrix**: order (statics and edge, then ships by id, then the other missile), the 60-tick own-ship exemption, room by impact point, and the double-end path when two missiles collide.
8. (Claude) **Determinism**: anything order-dependent, any `-0`/NaN path, and whether `flattenTactical` covers every field that affects future ticks (the flatten key guard test is the tripwire).
9. (Claude) **Decision 1's integer clocks** (laser 9,600 units at 40/25/16 per tick; shields 900 units at 3/2/0) against spec §5 and §7a timings.

## Reading manifest

- `docs/superpowers/plans/2026-11-14-helm-h0b-combat.md:L1-L1257` the subject (Scope L13, Global Constraints L23, Decisions L36, File structure L50, Task 1 L65, Task 2 L427, Task 3 L952, After L1254)
- `docs/superpowers/specs/2026-11-14-helm-demo-design.md:L67-L114` spec §4 collision matrix and §5 ships
- `docs/superpowers/specs/2026-11-14-helm-demo-design.md:L131-L166` spec §7 weapons and the transitions table
- `docs/superpowers/specs/2026-11-14-helm-demo-design.md:L195-L206` spec §9 hunter
- `src/renderer/src/sim/tactical/state.ts` whole file (current H-0a version the plan replaces)
- `src/renderer/src/sim/tactical/hash.ts` whole file (current H-0a version the plan replaces)
- `src/renderer/src/sim/tactical/tuning.ts` whole file (the plan appends to it)
- `src/renderer/src/sim/tactical/physics.ts:L1-L80` `gravityAccel`, `flyShip`
- `src/renderer/src/sim/tactical/contacts.ts` whole file `resolveContacts`
- `src/renderer/src/sim/tactical/direction.ts`, `grid.ts` whole files
- `tests/tacticalDeterminism.test.ts` whole file (the plan edits line 4 and the flatten key guard)
- `src/shared/rng.ts:L1-L25`
- `tests/helpers/determinismGuard.ts` the allowed and banned constructs

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff`, `node -e` for arithmetic checks, and `npx tsc --noEmit` on scratch copies outside the repo are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined spec `docs/superpowers/specs/2026-11-14-helm-demo-design.md` is the authority; its *(start)* numbers are the values to use.
- H-0 is split into H-0a (merged), H-0b (this plan: headless combat and the hunter) and H-0c (interior link, presence, commands, authority mode, scripted pair, golden, SIM_VERSION).
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

- **P0**: the plan is unexecutable as a whole, or produces a nondeterministic sim.
- **P1**: a task will fail at execution (tsc error, missing interface, wrong signature, a test that cannot pass as written), a spec requirement H-0b claims is missing or contradicted, or a combat or hunter rule is implemented differently from the spec without saying so.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
