## Role
<!-- reuse -->

The subject is Part i (the sim) of the implementation plan for FTLite's Engineering spike. Fresh subagents with no other context will execute it task by task on branch `spike/engineering` in the worktree `.worktrees/engineering`. They will build reactor bars, overdrive heat and coolant, oxygen, breaches, fire, doors, the throttle cap, three weapons (pew pew, beam, torpedo) and sensor fog gates into a deterministic, networked TypeScript duel sim: lockstep hashes, snapshots, goldens and an oracle. Anything left to "check at execution" counts as a defect. So does a quoted edit that doesn't match the real source, and so does a test that can't pass against the helpers that exist.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-18-engineering-spike-i-sim.md` at commit `d25a9b13`, worktree `C:\Users\djuar\FTLite`, branch `master`. The plan is executed later from a worktree made from this master.
- The spec it implements: `docs/superpowers/specs/2026-11-18-engineering-spike-design.md` (§2 to §8, and the amendments §9 and §10, which override earlier sections where they differ).
- Its sibling, Part ii, consumes Part i's names: `docs/superpowers/plans/2026-11-18-engineering-spike-ii-hud.md` (read only its Interfaces and Consumes lines).
- Codebase: `src/renderer/src/sim/duel/`, `src/renderer/src/sim/tactical/`, `src/renderer/src/sim/hazards/`, `src/renderer/src/sim/doors.ts`, `src/renderer/src/net/contracts.ts`, `src/renderer/src/net/codec.ts`, `scripts/golden/`, `tests/`.
- The run dir `docs/superpowers/reviews/2026-11-18-engineering-spike-i-sim-plan-v2/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. Quoted edits. Every "replace this text" or "after this line" must match master exactly once. Spot-check the large ones in Tasks 2, 4, 5, 6, 7, 9b and 10 against the real files.
6. Determinism and the golden procedure. The SIM 54→55 bump, the blesses, and the oracle and trace modes (`same` and others): does each step's proof actually hold? A same-version bless after a behaviour change may be refused by `scripts/golden/`. Check what the scripts allow.
7. The handling of existing tests that break, Decision on skips and bands. Is it concrete enough that an executor knows exactly which tests to change or skip, and how to find the rest?
8. The pew pew second laser slot (Task 9b). Check the hash, snapshot, validator and clone coverage of every new ShipSystems field, `tests/duelModules.test.ts`'s coverage rule, and that the Hunter's behaviour is byte-identical.
9. Step order and rng.hazards draw order (spec §7 step list) as implemented in Tasks 5 to 7, and the clamp placements.
10. The fog gates (Task 10). Is "seen" computed from state available at admission? Does the scripted gunner or pilot ever send a command the new gates refuse? `runDuel` throws on a refused scripted command.

11. This is a second refine run after two changes to the plan. **Master moved:** asteroids-ii merged at SIM 54, adding rocks, `rockLock`, torpedo blasts and laser chips, so the spike now bumps 54→55, and every quoted edit was re-anchored. **Amendment 3 (spec §11):** pew pew is now the W-1 weapon, built elsewhere. The plan drops the pew pew laser barrel, and pew pew's slot holds bars with no effect. Check that no pew pew remnant survives, that the re-anchored quotes match current master, and that the bots' first-tick bar move (pew to beam) always applies.

## Reading manifest

- docs/superpowers/plans/2026-11-18-engineering-spike-i-sim.md:L1-L3411, the subject (read Global Constraints and Decisions L1-L163 fully, then each task)
- docs/superpowers/specs/2026-11-18-engineering-spike-design.md:L1-L420, the spec (§9 and §10 near the end override earlier text)
- src/renderer/src/sim/duel/step.ts:L1-L300, the duel step and admission
- src/renderer/src/sim/duel/state.ts:L1-L120, createDuel
- src/renderer/src/sim/duel/modules.ts:L1-L124, the module list
- src/renderer/src/sim/duel/snapshot.ts:L1-L215, the duel snapshot offsets
- src/renderer/src/sim/duel/fire.ts:L1-L63 and src/renderer/src/sim/duel/health.ts:L1-L126
- src/renderer/src/sim/duel/scripted.ts:L1-L323, the scripted pair that runDuel drives
- src/renderer/src/sim/tactical/state.ts:L1-L260, ShipSystems, systemsFor, events
- src/renderer/src/sim/tactical/weapons.ts:L1-L200, the laser, magazine and shields
- src/renderer/src/sim/tactical/hash.ts:L1-L260, the ship module fields, validator and clone
- src/renderer/src/sim/tactical/duel.ts:L1-L80, stepDuel
- src/renderer/src/sim/tactical/physics.ts:L1-L79 and src/renderer/src/sim/tactical/predict.ts:L1-L80
- src/renderer/src/sim/tactical/science.ts:L1-L90 and src/renderer/src/sim/tactical/hunter.ts:L1-L140
- src/renderer/src/sim/hazards/oxygen.ts:L1-L127, src/renderer/src/sim/hazards/fire.ts:L1-L38, src/renderer/src/sim/doors.ts:L1-L101
- src/renderer/src/net/contracts.ts:L60-L140 and src/renderer/src/net/codec.ts:L90-L160, the command union and the schemas
- scripts/golden/ (list it, then read duelOracle.ts and the bless entry for the mode rules)
- tests/duelModules.test.ts, tests/duelGates.test.ts (heads only)

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `npx tsc --noEmit -p tsconfig.web.json` are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Spec §9, §10 and §11 (owner amendments; §11 makes pew pew the W-1 weapon, with no pew pew in this spike): station budgets; Engines 1 bar = 25 % throttle, starting at 3; Weapons up to 9 bars across pew pew (a burst laser), the beam (today's laser, unchanged) and the torpedo, at 1 to 3 bars each, starting pew 1 and torpedo 1; reactor 10; sensor range, fog of war and ghosts.
- FTL reactor bars, plus one overdrive bar per system with heat and a shared pool of 8 coolant.
- No Engineering terminal. Anyone in the ship view uses the HUD, and remote door clicks are allowed.
- It's a spike on its own branch with SIM 54→55 on the branch only. It is not merged until the owner plays it.
- The command names `shipPower`, `shipCoolant`, `shipDoor`, `shipAirlock` and `weaponPower` (the sector already owns `power` and `coolant`).

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

- **P0**: the plan is unexecutable as a whole, or breaks lockstep determinism.
- **P1**: a task will fail at execution (tsc, a missing interface, a wrong signature, a quoted edit that doesn't match the source, a test that can't pass), a rule is ambiguous in a way two executors would build differently, or the plan contradicts the spec without saying so.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
