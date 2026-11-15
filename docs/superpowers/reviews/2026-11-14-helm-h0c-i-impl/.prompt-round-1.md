## Role
<!-- reuse -->

The subject is the implementation of H-0c-i of FTLite's Helm demo on branch `helm-h0c`: follow-ups to the tactical combat sim (telemetry fields on events, admission predicates, `cloneTactical`, the hunter's standoff) and a new headless `src/renderer/src/sim/duel/` module that joins today's sector-run interior (`SimState` for the FTL-style Cutter: sit, stand, walk, hold Interact to repair) to the tactical duel through `stepDuelTick` (spec §13). It will be merged to master and then wired into the authority and two networked screens (H-0c-ii, H-1), so it must be correct against the spec, deterministic to the bit, and tested on its risky paths; anything a later milestone would have to rediscover or work around is a defect now. It deliberately does not touch `net/contracts.ts` or `authority/`.

## What to review

- THE SUBJECT (impl): `master...HEAD` at commit `2a49539`, worktree `C:/Users/djuar/FTLite/.worktrees/helm-h0c`, branch `helm-h0c`.
- The plan: `docs/superpowers/plans/2026-11-14-helm-h0c-i-duel-step.md` (Codex-refined; its "Decisions the plan makes inside the spec" lists the deliberate readings), and the spec `docs/superpowers/specs/2026-11-14-helm-demo-design.md` §8 (interior, present or away, repair points and repair), §9 (hunter, including the Standoff bullet), §13 (duel phase list, command allowlist, inputs), §17 risk 7.
- The sector code the duel reuses unchanged: `src/renderer/src/sim/{state,commands,stations,interact,movement,grid,components,characters,stationKinds,step}.ts`, `sim/ship/{schema,derived}.ts`, `sim/ship/cutter.json`, `src/shared/intent.ts`; types in `src/renderer/src/net/contracts.ts`.
- The run dir `docs/superpowers/reviews/2026-11-14-helm-h0c-i-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec/plan.** Every behaviour the plan promised, present and right.
2. **The invariants named in the focus notes below.** Each one, traced through the diff.
3. **`tsc --noEmit` clean** (run it); lint if the project has it.
4. **Test adequacy** for the risky paths, and whether the tests actually exercise the diff.
5. **Anything the plan said to do that the diff does not.**
6. (Claude) **Reusing the sector interior without the sector step:** `stepDuelTick` resets scratch itself and calls only `applyInteractionCommands` (sits at the two role consoles), `applyConsoleCommand` (stands), the duel's own repair phase and `movementSystem`; `doorSystem`, `crewSystem`, hazards, power, director never run. Trace anything those functions read or write that a skipped system would normally maintain, the module-level component arrays, `shedPower`, and the interior's `tick`/`ended`.
7. (Claude) **§13 phase order and command semantics:** seat phase (sits batch, stands, presence; away players cannot sit or stand), tactical admission after the seat phase in the fixed lock→charge→launch order with last-wins, reject reasons, the held-axis mapping (thrust = −moveY), repair before movement, then `stepDuel`, then the interior tick; exactly one result per command.
8. (Claude) **Repair:** same room plus `REACH`, whole units (960; 4 solo, 5 each for a team), progress kept through release and hits, cleared at level 0, the gunner's zero-walk Weapons repair.
9. (Claude) **Determinism and the duel hash:** every field the duel can change and that affects future ticks is in `flattenDuel`; `createDuel` validates the map first and disposes the interior on failure; `cloneTactical` is complete.
10. (Claude) **Known items already scheduled for H-0c-ii; report them only if you find a correctness defect beyond what is stated:** moving `DuelCommand` into the shared command union and codec (with the new reasons); lifecycle presence controls; the authority `duel` mode and `setPaused` handling; interior deep copy and snapshot encoding; per-tick repair events for telemetry; the scripted crew pair; §16 gates and tuning; the golden replay and `SIM_VERSION`.

## Reading manifest

- `git diff --name-only master...HEAD`: `src/renderer/src/sim/duel/{commands,hash,state,step,tuning}.ts`, `src/renderer/src/sim/tactical/{hunter,missiles,state,tuning,weapons}.ts`, `tests/{duel,tacticalDeterminism,tacticalHunter,tacticalMissiles,tacticalWeapons}.test.ts`
- `src/renderer/src/sim/duel/step.ts:L1-L127`, `state.ts:L1-L57`, `hash.ts:L1-L16`, `commands.ts:L1-L18`, `tuning.ts:L1-L16`; `tests/duel.test.ts:L1-L256`
- `src/renderer/src/sim/tactical/hunter.ts` (the standoff branch), `weapons.ts` (predicates, laser event), `missiles.ts` (missileEnd target/room), `state.ts` (`cloneTactical`, `DuelEvent`)
- `src/renderer/src/sim/step.ts:L1-L67` (the sector step the duel does not call: scratch reset list, system order)
- `src/renderer/src/sim/commands.ts:L20-L130`, `stations.ts:L1-L65`, `movement.ts:L1-L69`, `interact.ts:L1-L60`, `grid.ts:L1-L52`, `state.ts:L60-L160`
- `docs/superpowers/specs/2026-11-14-helm-demo-design.md:L167-L206` (§8, §9), `L267-L287` (§13), `L321-L332` (§17)
- `docs/superpowers/plans/2026-11-14-helm-h0c-i-duel-step.md:L28-L62` (constraints and the plan's decisions)

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff`, `npx tsc --noEmit`, `npx vitest run <single file>` and `node`/`npx tsx` scratch scripts outside the repo are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined spec is the authority; its *(start)* numbers are the values to use; §9's standoff bullet is part of it.
- The plan's "Decisions the plan makes inside the spec" (local duel commands, seat-phase order, fixed lock→charge→launch order, thrust = −moveY, whole-unit repair, doors held open with `doorSystem` not run, only the listed interior systems run, the duel hash's scope, the standoff numbers) were reviewed and accepted.
- H-0c is split into H-0c-i (this branch) and H-0c-ii (the items in focus note 10), after Codex's Net-3 merges.
- Determinism rules from Net-1: Float64 with + − × ÷ and sqrt only in the sim; the existing AST guard is the enforcement.

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

- **P0**: nondeterminism, a crash or hang, state corruption, or a change that breaks the sector run.
- **P1**: a spec or plan behaviour implemented wrongly or missing, a test that passes for the wrong reason or does not exercise what it claims, or a defect H-0c-ii would have to work around.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
