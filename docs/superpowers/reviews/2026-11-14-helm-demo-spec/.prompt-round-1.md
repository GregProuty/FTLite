## Role
<!-- reuse -->

The subject is the design spec for FTLite's Helm demo: a two-player networked duel in which one player flies a ship around a planet's gravity well (direct stick, real momentum) and the other runs Weapons (laser with arcs and room lock, hand-steered cruise missiles), each seated at a console with its own ship-centred map view, and who stand up into the existing FTL-style ship interior to walk to damaged rooms and repair them. The spec will next become an implementation plan (milestones H-0 to H-2) executed against this TypeScript/Electron codebase, whose simulation is deterministic and runs inside the Net-1 authority. The standard: a plan writer must be able to turn every section into tasks without guessing, every rule must be deterministic and testable, and every claim about the existing code (interfaces, modules, layouts, tuning) must match the source.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-14-helm-demo-design.md` at commit `2a7e6ba`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- Binding owner answers it must conform to: `docs/vision/thesis-grill.md` Q11 to Q27 (the grill wins where the spec disagrees), and the gospel `docs/vision/napkin.md`.
- The codebase areas the spec reuses: the Net-1 contracts and authority (`src/renderer/src/net/contracts.ts`, `src/renderer/src/authority/core.ts`), the sector sim's interior systems (`src/renderer/src/sim/step.ts`, `movement.ts`, `stations.ts`, `interact.ts`, `doors.ts`, `commands.ts`, `state.ts`, `tuning.ts`) and the Cutter layout (`src/renderer/src/sim/ship/cutter.json`).
- The run dir `docs/superpowers/reviews/2026-11-14-helm-demo-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. (Claude) **The interior reuse (spec §8, §13).** The spec runs a subset of the sector sim's `SimState` systems inside the duel. Check whether those systems (movement, doors, sit/stand, interact) can actually run without the systems the spec switches off (director, power, hazards, events), and whether the "duel-only system list" is specified well enough to plan.
8. (Claude) **Input routing.** The spec routes held axes by seat (standing walks, seated at Navigation flies, seated at Weapons steers a missile) and calls sit, stand and Interact "today's interaction commands". Check against `contracts.ts` and `commands.ts`: in the code, `interactHeld` is part of `HeldInput`, and `sit`/`stand` are commands. Is the spec's description accurate and unambiguous?
9. (Claude) **Physics numbers.** Are the stated values self-consistent (GM 2.5e6 with ε 20 giving a circular orbit at r = 250 of about 100 u/s; pull "about 2 u/s² at the belt and 0.3 at the edge"; terminal speed "about 800 u/s" from 120 u/s² and drag 0.15)? Flag any that are arithmetically wrong.
10. (Claude) **The hunter's fairness.** The enemy has no interior and repairs abstractly with a fixed walk allowance; the crew's repair time depends on the real walk. Is this specified precisely enough (when the timer starts, what the enemy can do meanwhile) to implement and test?
11. (Claude) **The Cutter claims.** Separate rooms for Navigation, Weapons and Engineering, "about 25 tiles" bow to stern, "about 6 s" at 4 tiles/s, no console groups, other consoles as scenery. Verify against `cutter.json` and the station code.
12. (Claude) **Determinism and Net-3 readiness.** Float64 physics with a heading table, rng.tactical, the mode switch in the authority, and per-seat command validation: anything that would break replay, hashing, or the Net-1 rules.

## Reading manifest

- `docs/superpowers/specs/2026-11-14-helm-demo-design.md:L1-L309` the subject (sections: §2 L17, §3 L51, §4 L67, §5 L80, §6 L102, §7 L118, §8 L141, §9 L155, §10 L167, §11 L204, §13 L226, §15 L247, §16 L258, §17 L271, §18 L282)
- `docs/vision/thesis-grill.md:L111-L300` the binding answers Q11 to Q27
- `docs/vision/napkin.md:L1-L21` the gospel
- `src/renderer/src/net/contracts.ts:L1-L105` `Link`, `HeldInput`, `HeldFrame`, command envelopes
- `src/renderer/src/authority/core.ts:L1-L60` the authority core, typed to `SimState`
- `src/renderer/src/sim/step.ts:L1-L67` the sector step and its system order
- `src/renderer/src/sim/commands.ts:L40-L100` `sit` and `stand` commands and their validation
- `src/renderer/src/sim/movement.ts:L1-L69` crew movement
- `src/renderer/src/sim/stations.ts:L1-L65` sit, stand, station online
- `src/renderer/src/sim/interact.ts:L60-L164` interaction targets and repair progress
- `src/renderer/src/sim/doors.ts:L1-L101` door behaviour
- `src/renderer/src/sim/power.ts:L1-L30` station failure and repair
- `src/renderer/src/sim/state.ts:L1-L130` `SimState` and `createSimState`
- `src/renderer/src/sim/tuning.ts:L10-L60` `CREW_SPEED`, `REACH`, `REPAIR_TIME_POWER`; `tuning.ts:L210-L225` `TEAM_MULT`
- `src/renderer/src/sim/ship/cutter.json:L460-L582` the Cutter's stations, spawns and airlocks (rooms are above)

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff`, `node -e` for arithmetic checks are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Exactly two players, Helm and Weapons, on two computers over the network; no bots in seats (Q15, Q15b).
- Arcade flight with real momentum and gravity, mild drag, stabilise assist; direct stick (Q12, Q18).
- Planet: gravity plus a damaging wall (Q16). Enemy: a blunt hunter under the same rules (Q17).
- Laser with arcs and room lock; hand-steered cruise missiles; the laser cannot fire while a missile flies (Q13, Q19, Q19b). FTL shield layers; missiles bypass shields (Q20).
- A large zoomable map with one planet, an asteroid belt with gaps and loose clusters; follow camera with pan and snap back (Q23 to Q23c).
- Until Net-3 the owner playtests alone, switching with Tab (Q24).
- Both consoles are ship-centred map views of one shared map, in a minimal vector style (Q25, Q26).
- Away from a console, players see the FTL-style interior and walk to damaged rooms to repair them; this is in the demo (Q27).
- Acceptance is the five-question checklist plus telemetry (Q22).

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

- **P0**: the design cannot be built as written: a binding owner answer is violated, the sim cannot be deterministic, or the core loop (fly, shoot, leave the console, repair) does not work end to end.
- **P1**: a plan writer would have to guess: a rule two implementers would build differently, a claim about the codebase that is false, a contradiction between sections, a number that is arithmetically wrong, or a state hit in ordinary play that is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
