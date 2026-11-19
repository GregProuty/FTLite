## Role
<!-- reuse -->

The subject is a design spec for a playable spike (a second prototype of destructible, billiard-physics asteroids) in a deterministic lockstep/snapshot game sim (TypeScript, fixed 60 Hz tick, hashed state). It will become an implementation plan that fresh subagents execute task by task, then code on branch `spike/asteroids-ii`. It must be precise enough that two implementers would build the same rules: every formula, order of operations, and edge case that touches hashed sim state must be unambiguous and deterministic, and every acceptance item must be checkable.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-18-asteroids-ii-design.md` at commit `cff7d494`, worktree `C:/Users/djuar/FTLite/.worktrees/asteroids-ii`, branch `spike/asteroids-ii`.
- Spike i's report it builds on: `docs/superpowers/research/2026-11-17-asteroid-spike.md`, and spike i's spec `docs/superpowers/specs/2026-11-17-destructible-asteroids-spike.md`.
- The sim code it extends: `src/renderer/src/sim/tactical/` (rocks, weapons, missiles, contacts, duel, state, tuning) and the duel command step `src/renderer/src/sim/duel/step.ts`; the view effects `src/renderer/src/render/tactical/fxModel.ts`; the contact/targeting UI controller `src/renderer/src/app/duel/contactController.ts`.
- The run dir `docs/superpowers/reviews/2026-11-18-asteroids-ii-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. Determinism: every new rule that writes hashed state (rock pool, system fields, counters) must have a fixed order and use only the math the sim guard allows (find the guard in `tests/boundary.test.ts`). Check that the spec's formulas (fan angles, rotations, `floor` in the hull cost) fit it.
8. The grid invariant (spec §3.1): seeded rocks go static to moving one way; check every place the spec makes a rock move or reuses a slot keeps "a grid hit counts only while its slot is still kind 1" correct, including a seeded slot reused for a piece.
9. Pair resolution order in §3.3 (moving vs static via the grid, moving vs moving via the scan, "skip a pair already resolved"): is it well defined when a static rock becomes moving mid-pass, or when a break inside the pass writes new pieces into slots?
10. Rock targets (§6): slot reuse and clearing, the interaction with `laserLock` / `torpLock` / `designate` and the existing `target` field, and what the UI does when the contact window is open.
11. Ship-rock two-body contact (§5.1): does it change existing ship-vs-static behaviour that current tests rely on (beyond the expected re-bless), and is the "a kind-1 rock wakes only above 40 u/s" rule consistent with the bounce impulse applied to it?
12. The acceptance proxies of §9.4 and the cost budget of §9.5: checkable as written?

## Reading manifest

- `docs/superpowers/specs/2026-11-18-asteroids-ii-design.md:L1-L287` the subject
- `docs/superpowers/research/2026-11-17-asteroid-spike.md:L1-L191` spike i's results and recommendation
- `src/renderer/src/sim/tactical/rocks.ts:L1-L179` the rock pool, broad phase, breaking, stepRocks, firstBlocker
- `src/renderer/src/sim/tactical/weapons.ts:L60-L197` laser eligibility, rock target, shoot, burst, fire rules
- `src/renderer/src/sim/tactical/missiles.ts:L1-L128` homing, landing, missile contacts (rock hit)
- `src/renderer/src/sim/tactical/contacts.ts:L1-L64` ship contacts with planet, rocks, ships
- `src/renderer/src/sim/tactical/duel.ts:L1-L46` the tick order
- `src/renderer/src/sim/tactical/state.ts:L30-L246` systems fields, events, state, init
- `src/renderer/src/sim/tactical/tuning.ts:L1-L142` constants
- `src/renderer/src/sim/duel/step.ts:L1-L245` command validation and folding into ShipInput
- `src/renderer/src/render/tactical/fxModel.ts:L1-L95` view effects and shake
- `src/renderer/src/app/duel/contactController.ts:L1-L140` pick-up and targeting controller

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` are fine. Never run the Jest suite (it can hang).
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

- **P0**: the spike cannot be built as specified (a rule contradicts itself or the codebase so the sim cannot stay deterministic, or a fixed decision is violated).
- **P1**: a rule is ambiguous in a way two implementers would build differently in hashed state, an ordering or slot-reuse case hit in ordinary play is unhandled, an interface the spec relies on does not exist and the spec does not say it is new, or an acceptance item cannot be checked.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
