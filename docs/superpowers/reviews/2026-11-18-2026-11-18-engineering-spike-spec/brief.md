## Role
<!-- reuse -->

The subject is a spike spec for the Engineering role in FTLite's networked co-op duel. It will become an implementation plan, and fresh subagents will build that plan into a deterministic, networked TypeScript sim (lockstep hashes, snapshots, goldens) and an amber CRT HUD. The spec must be unambiguous enough that two implementers would build the same sim rules and the same commands. It must also be honest about what the existing codebase already offers: the duel's interior is a sector `SimState`, but only some of the sector systems run in the duel today. A spike can leave tuning loose, but not rules, ownership or determinism.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-18-engineering-spike-design.md` at commit `b2fb869a`, worktree `C:\Users\djuar\FTLite`, branch `master`.
- Conventions it should follow: `docs/superpowers/specs/2026-11-17-destructible-asteroids-spike.md` (spike format), `docs/superpowers/specs/2026-11-17-duel-fire-design.md` (duel fire rules), `docs/superpowers/specs/2026-11-17-crt-map-design.md` (CRT look).
- Codebase: the duel sim `src/renderer/src/sim/duel/`, the tactical sim `src/renderer/src/sim/tactical/`, and the sector hazards, power and heat code in `src/renderer/src/sim/` that the spec proposes to reuse.
- The run dir `docs/superpowers/reviews/2026-11-18-2026-11-18-engineering-spike-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. Reuse claims (§4). Does the sector hazard code (oxygenStep, fireStep, lifeSupportInjection, the door system's auto open and close, airlocks, breaches) actually run correctly on the duel interior? Look for dependencies on sector-only state: stations online, the Doors console fail-safe, the skill or quirk lookups, `run`, and the HAZARD_EVERY cadence against the duel step order in duel/step.ts.
8. Damage to bars (§2). Is the mapping from tactical Room damage (0..2, capped at 2) to lost bars complete? Check Shields at 4 max with damage capped at 2, the overdrive slot, and whether "effective bars" can go negative. Also check the Hunter's repair and laser-lock logic, which reads `rooms`.
9. Ship-view authority (§5, §6). The sim cannot see a player's screen, yet the spec says commands are accepted "from any player whose screen shows the ship view". Is that rule implementable, and do §5 and §7 agree on it?
10. Fire (§4). Does the duel's fire model (DUEL_FIRE_GROW, extinguish units, the damage cadence) survive alongside the sector fireStep (spread, oxygen burn, shrink) without the two double-stepping one room?
11. Rate tables (§2, §3). Is "today's level-0 value at the round-start bars, +25 % per bar" fully defined for every system and bar count, including 0 and overdrive? Check this for every table, including the shield layer cap and the scan rates.

## Reading manifest

- docs/superpowers/specs/2026-11-18-engineering-spike-design.md:L1-L157, the subject
- src/renderer/src/sim/duel/state.ts:L1-L106, DuelState and createDuel (doors forced HeldOpen)
- src/renderer/src/sim/duel/step.ts:L1-L275, the duel step order, repairPhase, commands, the phases after stepDuel
- src/renderer/src/sim/duel/modules.ts:L1-L124, the duel module list and field contract
- src/renderer/src/sim/duel/fire.ts:L1-L63, duel fire
- src/renderer/src/sim/duel/health.ts:L1-L126, duel health
- src/renderer/src/sim/duel/tuning.ts:L1-L42, duel repair and fire numbers, repair points
- src/renderer/src/sim/duel/commands.ts:L1-L12, the duel commands
- src/renderer/src/sim/hazards/oxygen.ts:L1-L127, the oxygen flow, passageFor, roomVenting
- src/renderer/src/sim/hazards/fire.ts:L1-L38, igniteRoom, extinguishRoom, fireStep
- src/renderer/src/sim/hazards/breach.ts:L1-L24, breaches
- src/renderer/src/sim/hazards/lifeSupport.ts:L1-L13, life support injection
- src/renderer/src/sim/doors.ts:L1-L101, the door system, cycleDoor, airlocks, the fail-safe
- src/renderer/src/sim/grid.ts:L1-L52, DoorState
- src/renderer/src/sim/heat.ts:L1-L58, the heat and coolant rules
- src/renderer/src/sim/power.ts:L1-L107, the sector power pool
- src/renderer/src/sim/step.ts:L1-L80, the sector step and hazard cadence
- src/renderer/src/sim/tuning.ts:L1-L90, the hazard, fire, oxygen and heat tuning
- src/renderer/src/sim/tactical/state.ts:L14-L60, Room, ShipSystems
- src/renderer/src/sim/tactical/weapons.ts:L40-L162, the laser charge, magazine and shield tables in use
- src/renderer/src/sim/tactical/physics.ts:L55-L79, ENGINE_FACTOR use
- src/renderer/src/sim/tactical/hunter.ts:L60-L115, the Hunter's repair and lock logic reading rooms
- src/renderer/src/sim/tactical/tuning.ts:L40-L140, the tactical tables
- src/renderer/src/sim/tactical/defs.ts:L1-L76, the ship class defs (chargeRate, shields)
- src/renderer/src/sim/ship/hound.json, the Hound layout (rooms, breachSites, airlocks, stations)
- src/renderer/src/ui/views.ts:L1-L60, the ship HUD view model hook
- src/renderer/src/ui/duel/TabStrip.tsx:L1-L30, the SHIP tab

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- FTL reactor bars shared between systems, not Artemis's independent sliders.
- One overdrive bar per system, with heat and a shared coolant pool on top.
- No Engineering terminal or seat. Anyone in the ship view uses the HUD to move power, cycle coolant and click doors and airlocks, and remote door clicks are allowed.
- The ship-view HUD uses the amber CRT style of the consoles.
- Oxygen per room, breaches that leak, airlocks that vent and put out fires, health loss below 25 % air, and fire spreading through open doors.
- Five systems: Shields 4, Weapons 3, Engines 3, Sensors 2, Oxygen 2. A reactor of 8 bars.
- It is a spike on its own branch, not merged until the owner plays it.

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

- **P0**: the spike cannot be built as specified. For example, a core rule depends on something the sim cannot know, or the design breaks lockstep determinism.
- **P1**: a rule two implementers would build differently, a reuse claim that is false against the code, a case hit in ordinary play that is unhandled, or two sections that contradict each other.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
