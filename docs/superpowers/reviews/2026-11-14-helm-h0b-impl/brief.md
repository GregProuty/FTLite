## Role
<!-- reuse -->

The subject is the implementation of H-0b of FTLite's Helm demo on branch `helm-h0b`: headless combat added to the deterministic tactical sim in `src/renderer/src/sim/tactical/` (shields and damaged rooms, laser charge-and-release with arcs, room lock and line of sight, hand-steered cruise missiles with their collision rows, the hunter AI flying the enemy ship through the same per-ship input, and the `stepDuel` tick). It will be merged to master and then wired into the authority, the Cutter interior and two networked screens (H-0c, H-1), so it must be correct against the spec, deterministic to the bit (replays and network sync depend on it), and tested on its risky paths. Anything a later milestone would have to rediscover or work around is a defect now.

## What to review

- THE SUBJECT (impl): `master...HEAD` at commit `4fac7ec`, worktree `C:/Users/djuar/FTLite/.worktrees/helm-h0b`, branch `helm-h0b`.
- The plan it implements: `docs/superpowers/plans/2026-11-14-helm-h0b-combat.md` (Codex-refined; its "Decisions the plan makes inside the spec" section lists the deliberate readings), and the spec `docs/superpowers/specs/2026-11-14-helm-demo-design.md` §4 (missile rows of the collision matrix), §5 (ships, shields, damage effects), §7 (laser, missiles, the Weapons state transitions table), §9 (hunter).
- The H-0a base it builds on (unchanged by this branch): `src/renderer/src/sim/tactical/{physics,contacts,map,grid,direction,predict}.ts`.
- The run dir `docs/superpowers/reviews/2026-11-14-helm-h0b-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec/plan.** Every behaviour the plan promised, present and right.
2. **The invariants named in the focus notes below.** Each one, traced through the diff.
3. **`tsc --noEmit` clean** (run it); lint if the project has it.
4. **Test adequacy** for the risky paths, and whether the tests actually exercise the diff.
5. **Anything the plan said to do that the diff does not.**
6. (Claude) **Determinism invariants:** no randomness except the hunter's one `nextInt` jitter draw on `state.rng`; fixed iteration orders; no `-0`/NaN leaking into state; `flattenTactical` covers every field that can affect a future tick (the flatten key guard test is the tripwire, but it does not cover `Missile`'s keys).
7. (Claude) **The §7 Weapons state transitions table**, row by row, in `weapons.ts` (`applyWeaponsInput`, `tickWeapons`, `laserFrozen`) and `missiles.ts`, including the same-tick orders inside `stepDuel` (`duel.ts`): commands before movement, missile contacts and expiry before weapon clocks.
8. (Claude) **Missile contacts against the §4 matrix** (`resolveMissiles`): order, the 60-tick own-ship exemption, room by impact point, missile against missile, expiry at the end of tick 480.
9. (Claude) **Hunter against §9** (`hunter.ts`): lead point and 30° rule, lookahead avoidance, jitter scheduling, lock rule, launch rule with the cooldown started only on a real launch (in `stepDuel`), the 18-tick trail, dead-astern `pursuitTurn`, the repair visit and which console it empties.
10. (Claude) **Known items already scheduled for H-0c by the final review; report them only if you find a correctness defect beyond what is stated here:** the hunter has no standoff distance and rams constantly (a spec gap to be fixed in §9 before tuning); `missileEnd`/`laser` events lack target and room fields and `missileHits` counts self-hits; the hunter's launch cooldown bookkeeping lives in `stepDuel`; there is no deep `cloneTactical` and the hunter's `Float64Array` trail needs explicit snapshot encoding.

## Reading manifest

- `git diff --name-only master...HEAD`: `src/renderer/src/sim/tactical/{duel,geometry,hash,hunter,missiles,state,tuning,weapons}.ts`, `tests/{tacticalDeterminism,tacticalGeometry,tacticalHunter,tacticalMissiles,tacticalWeapons}.test.ts`
- `src/renderer/src/sim/tactical/weapons.ts:L1-L90`, `missiles.ts:L1-L81`, `hunter.ts:L1-L90`, `duel.ts:L1-L30`, `geometry.ts:L1-L45`, `state.ts:L1-L101`, `hash.ts:L1-L31`, `tuning.ts:L60-L103` (the combat constants)
- `tests/tacticalWeapons.test.ts:L1-L147`, `tacticalMissiles.test.ts:L1-L192`, `tacticalHunter.test.ts:L1-L154`, `tacticalGeometry.test.ts:L1-L49`, `tacticalDeterminism.test.ts:L60-L85`
- `src/renderer/src/sim/tactical/physics.ts:L1-L80` (`gravityAccel`, `flyShip`) and `contacts.ts` (H-0a, called by `stepDuel`)
- `docs/superpowers/specs/2026-11-14-helm-demo-design.md:L67-L114` (§4 matrix, §5), `L131-L166` (§7 and the transitions table), `L195-L206` (§9)
- `docs/superpowers/plans/2026-11-14-helm-h0b-combat.md:L23-L50` (constraints and the plan's decisions)
- `tests/helpers/determinismGuard.ts` (allowed and banned constructs)

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff`, `npx tsc --noEmit`, `npx vitest run <single file>` and `node`/`npx tsx` scratch scripts outside the repo are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined spec is the authority; its *(start)* numbers are the values to use.
- The plan's "Decisions the plan makes inside the spec" (integer clocks, `ShipInput`, commands before movement, the hold timer running without Fire held, no missile drag, press-before-release in the hunter, abstract hunter repair, unhashed per-tick events, missile-missile both lost) were reviewed and accepted.
- H-0 is split into H-0a (merged), H-0b (this branch) and H-0c (interior, presence, commands, authority mode, scripted pair, telemetry, golden, SIM_VERSION, and the items in focus note 10).
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

- **P0**: nondeterminism, a crash or hang, or state corruption (a field that affects future ticks missing from the hash, a missile or ship left in an impossible state).
- **P1**: a spec or plan behaviour implemented wrongly or missing, a test that passes for the wrong reason or does not exercise what it claims, or a defect H-0c would have to work around.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
