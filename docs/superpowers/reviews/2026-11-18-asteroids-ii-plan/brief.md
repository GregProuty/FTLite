## Role
<!-- reuse -->

The subject is an implementation plan for a playable spike (billiard-physics destructible asteroids) in a deterministic game sim (TypeScript, fixed 60 Hz tick, hashed state, snapshots). Fresh subagents will execute it task by task, each seeing only its own task, so any task that would fail to compile, call a name that does not exist with the assumed shape, contradict the converged spec, or leave something to "check at execution" is a defect. Tests it writes must be able to pass against the real helpers and must cover the risky paths (fixed orders, slot reuse, determinism).

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-18-asteroids-ii.md` at commit `07d22040`, worktree `C:/Users/djuar/FTLite/.worktrees/asteroids-ii`, branch `spike/asteroids-ii`.
- The spec it implements (converged, fixed): `docs/superpowers/specs/2026-11-18-asteroids-ii-design.md`.
- The code it changes: `src/renderer/src/sim/tactical/` (rocks, weapons, missiles, contacts, duel, state, physics, tuning, predict, science), `src/renderer/src/sim/duel/step.ts`, `src/renderer/src/net/codec.ts`, `src/renderer/src/render/tactical/` (fxModel, tacticalModel, tacticalLayer), `src/renderer/src/app/duel/` (contactController, scene, duelMode), `src/renderer/src/ui/duel/WeaponsStation.tsx`, `src/renderer/src/render/duel/consoleModel.ts`, `src/renderer/src/audio/`, and the tests under `tests/`.
- The run dir `docs/superpowers/reviews/2026-11-18-asteroids-ii-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. Line of sight vs born pieces: the plan keeps `lineOfSight` (used by `laserEligible`) blind to the born mask while `firstBlocker` skips born slots, so for one tick a fresh piece can block an enemy shot without being the rock that shot hits. Should `lineOfSight` skip born slots too, for consistency? Judge against spec §6.2.
6. Eviction dust is indistinguishable from break dust in the events (plan deviation list), which inflates the break shake and the §9.4 break count. Is a distinct cause (for example `by: 'evict'` or a flag) needed?
7. Hash/snapshot/clone/validation wiring of the new system fields and counters (Task 1): does the plan touch every place spike i had to touch for the pool (flatten length, key guard, snapshot validation, image codec), with real paths?
8. The fixed orders of spec §3.3 (live outer loop, processed and born masks, damage-then-breaks) and §4.2 (blast list taken before the direct hit's pieces): are they encoded exactly, and tested?
9. Task 10 (duelGates then the two-step bless to SIM 53) and Task 11 (the p99 gate and the conditional grid): are the commands real (`package.json` scripts, `scripts/` files) and the steps executable without judgement calls the plan leaves open?

## Reading manifest

- `docs/superpowers/plans/2026-11-18-asteroids-ii.md:L1-L3936` the subject (tasks start at L98, L543, L1125, L1415, L1754, L2048, L2272, L2504, L2902, L3288, L3386, L3742; self-review L3900)
- `docs/superpowers/specs/2026-11-18-asteroids-ii-design.md:L1-L386` the spec
- `src/renderer/src/sim/tactical/rocks.ts:L1-L179` the current rock pool
- `src/renderer/src/sim/tactical/weapons.ts:L1-L197` laser and torpedo rules
- `src/renderer/src/sim/tactical/missiles.ts:L1-L128` homing and missile contacts
- `src/renderer/src/sim/tactical/contacts.ts:L1-L64` ship contacts
- `src/renderer/src/sim/tactical/duel.ts:L1-L46` tick order
- `src/renderer/src/sim/tactical/state.ts:L1-L248` state, systems, events
- `src/renderer/src/sim/tactical/physics.ts:L1-L79` flight paths
- `src/renderer/src/sim/duel/step.ts:L1-L273` command validation and folding
- `src/renderer/src/net/codec.ts:L1-L265` command schema
- `src/renderer/src/render/tactical/fxModel.ts:L1-L166` view fx
- `src/renderer/src/render/tactical/tacticalModel.ts:L1-L476` map model and pickContact
- `src/renderer/src/app/duel/contactController.ts:L1-L141` pick-up controller
- `src/renderer/src/app/duel/scene.ts:L1-L294` scene click wiring
- `package.json` scripts (bless, typecheck, test:duel-app-runtime)

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff`, `npm run typecheck` are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Weapons stay the existing charging burst laser and homing torpedo; no new weapon in this spike.
- Billiards physics: hits push rocks, pieces fly fast with the hit's push, rocks bounce off rocks by mass.
- Torpedoes blow rocks into many pieces with an area blast.
- Rock-on-rock collisions damage both rocks.
- Rocks can be targeted on purpose (drop a weapon on a rock) and are also hit by accident.
- Pieces hurt everyone (crew, Hunter, torpedoes), scaled by speed and size; the blast pushes ships but does not damage them.
- A spike built on top of spike i (`spike/asteroids`); single player is the gate; online fx and Hunter rock-awareness are out of scope; not merged to master.

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

- **P0**: the plan is unexecutable as a whole, or would break determinism of hashed state, or violates a fixed decision.
- **P1**: a task will fail at execution (tsc, a missing interface, a wrong signature, a test that cannot pass against the real helpers), a task contradicts the spec without a stated justification, a task consumes something a later task produces, or a risky path the spec names is untested.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
