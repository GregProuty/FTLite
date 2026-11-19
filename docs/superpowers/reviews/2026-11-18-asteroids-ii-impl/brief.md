## Role
<!-- reuse -->

The subject is the implementation of a playable spike (billiard-physics destructible asteroids) in a deterministic TypeScript game sim (fixed 60 Hz tick, hashed state, snapshots, goldens) plus its UI, view effects and sounds. It is not merged to master; the owner will play it in single player and decide. It must still be correct: the sim must stay deterministic (same inputs → same hashes, save/restore safe), every rule must match the converged spec and plan, the UI must send the right commands, and the tests must actually exercise the risky paths.

## What to review

- THE SUBJECT (impl): the range `9e0a0b35...HEAD` (HEAD `8cd4d314`), worktree `C:/Users/djuar/FTLite/.worktrees/asteroids-ii`, branch `spike/asteroids-ii`. The code diff (src, scripts, changed tests; golden/fixture/result JSON excluded) is prepared in the run dir as `impl.diff`, with a per-file line index in `impl-index.txt`.
- The spec it implements: `docs/superpowers/specs/2026-11-18-asteroids-ii-design.md` (converged; §3.4's fan 2-piece threshold was later tuned from 25 to 13 after the §9.4 feel proxy failed 1/10, noted in the spec).
- The plan: `docs/superpowers/plans/2026-11-18-asteroids-ii.md` (its "Deviations and clarifications" list near the top is binding).
- The spike's own report: `docs/superpowers/research/2026-11-18-asteroid-spike-ii.md`.
- The run dir `docs/superpowers/reviews/2026-11-18-asteroids-ii-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec/plan.** Every behaviour the plan promised, present and right.
2. **The invariants named in the focus notes below.** Each one, traced through the diff.
3. **`tsc --noEmit` clean** (the controller runs `npm run typecheck`; you cannot run commands, so judge types by reading).
4. **Test adequacy** for the risky paths, and whether the tests actually exercise the diff.
5. **Anything the plan said to do that the diff does not.**
6. Determinism of hashed state: every sim write in `src/renderer/src/sim/` uses only the approved math (+ − × ÷, abs, ceil, floor, round, min, max, sign, imul, sqrt; no Math.sin/cos/random, no Date) in a fixed order; the transient masks `rockBorn`/`rockDone` are never hashed, never snapshotted, fresh in a clone, and cleared at the start of every `stepDuel` tick; nothing in a tick depends on a mask left over from an earlier tick.
7. Slot reuse: a rock slot cleared or rewritten in a tick (break, dust, eviction) is never hit, pushed or contacted again that tick as if it were the old rock; rock targets (`laserRock`, `torpRock`, `torpRockFlying`) clear on every clear/rewrite path; `graceUntil` for a reused slot is reset.
8. Fixed orders: `stepRocks` (all motion, then the live outer contact loop with processed/born skips, damage-then-breaks a first), the blast (list taken once before the direct hit's pieces), ship contacts (wake test first; non-woken static = today's contact exactly; single-ship flight paths unchanged).
9. The `rockLock` command: validation order, folding after room locks and before `stepBurst`, the effective torpRock for `missileLaunch` admission in both `sim/duel/step.ts` and `app/duel/runtime.ts` (the runtime pre-filter has no seat check — does that ever make an admission result disagree with what the sim does?).
10. Known minor notes from the per-task reviews, for you to triage (flag any you judge worse than minor): `tests/rockContacts.test.ts` once-per-pair test cannot catch a double resolution; `tests/rockShips.test.ts` momentum test uses equal masses (r 30 = SHIP_MASS) so a swapped inverse mass passes; ram damage on a non-woken static rock at vc in (30, 40] has no hp assertion; `fx.items` uncapped in a big cascade; the online duel's `canLaunch(d.tactical, 0)` ignores a same-tick `rockLock`; `IDLE_INPUT`/`UNCREWED_INPUT` share a `rockLock` object literal; `weaponsModel.ts` uses `systems[0]` instead of `CREW_SLOT`; `laserDiggable` is dead behind `AUTO_DIG = false`.
11. View code: rock fx and sounds are view-only (nothing hashed), on the CRT colour ramp, with `evicted` and `rock: −1` dust not treated as breaks (no shake, no crunch, no break count); a laser shot that struck a rock shows no MISS callout.

## Reading manifest

- `docs/superpowers/reviews/2026-11-18-asteroids-ii-impl/impl-index.txt:L1-L70` where each file starts in impl.diff
- `docs/superpowers/reviews/2026-11-18-asteroids-ii-impl/impl.diff:L1611-L2970` the sim changes (step.ts, contacts, duel, geometry, hash, hunter, missiles, rockBlast, rockBreak, rockContacts, rockTuning, rockWeapons, rocks, state, weapons, tuning) — read first
- `docs/superpowers/reviews/2026-11-18-asteroids-ii-impl/impl.diff:L600-L1610` app and render changes (runtime, scene, input, onlineDuel, rockFx, fxModel, hitModel, tacticalModel, tacticalLayer, consoleModel, situationModel)
- `docs/superpowers/reviews/2026-11-18-asteroids-ii-impl/impl.diff:L2970-L4837` tests and helpers
- `docs/superpowers/reviews/2026-11-18-asteroids-ii-impl/impl.diff:L1-L600` scripts and remaining files
- `docs/superpowers/specs/2026-11-18-asteroids-ii-design.md:L1-L400` the spec
- `docs/superpowers/plans/2026-11-18-asteroids-ii.md:L1-L100` the plan's global constraints, deviations and file structure (consult task sections only for a specific doubt)
- `src/renderer/src/sim/tactical/rockBreak.ts:L1-L200`, `src/renderer/src/sim/tactical/rockContacts.ts:L1-L120`, `src/renderer/src/sim/tactical/rockBlast.ts:L1-L80`, `src/renderer/src/sim/tactical/contacts.ts:L1-L140` full current files when a hunk is cut off

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob only (you cannot run commands). Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner (and, where marked, by the controller under the owner's standing order to take recommendations) and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Weapons stay the existing charging burst laser and homing torpedo; no new weapon in this spike.
- Billiards physics: hits push rocks, pieces fly fast with the hit's push, rocks bounce off rocks by mass; rock-on-rock collisions damage both rocks.
- Torpedoes blow rocks into many pieces with an area blast; the blast pushes ships but does not damage them.
- Rocks can be targeted on purpose (drop a weapon on a rock) and are also hit by accident; AUTO_DIG off.
- Pieces hurt everyone, scaled by speed and size; a non-woken static rock costs hull 1 as today.
- Controller: the fan 2-piece threshold is r ≥ 13 (tuned from 25 after the feel proxy); SIM_VERSION 53 on the branch only.
- Spike only: single player is the gate; online rock fx and Hunter rock-awareness are out of scope; not merged to master.

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

- **P0**: the sim can desync or diverge (non-deterministic hashed state, save/restore breaks), or a fixed decision is violated.
- **P1**: a rule behaves differently from the spec/plan in ordinary play, a slot-reuse or ordering case corrupts state, the UI sends a wrong or missing command, or a risky path the spec names has no test that would catch its regression.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
