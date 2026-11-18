## Role
<!-- reuse -->

The subject is the finished implementation of the Valkyrn, a solo test ship for FTLite, a deterministic TypeScript/Electron/Pixi 8 game with a React + zustand UI and vitest. The Valkyrn plays the same Hunter duel as the Hound, with a crew of one at a combined Helm+Weapons "Flight" seat: mouse aim, a fixed minigun with heat and a lead pip, and torpedoes. The owner will merge it to master and use it to test new features alone. The standard: every spec behaviour present and right; the Hound's behaviour unchanged (its tick counts, outcomes and gates; only state hashes moved at SIM 53); determinism (only + − × ÷ and sqrt in the sim); and the app working for both ships.

## What to review

- THE SUBJECT (impl): `master...HEAD` at commit `717e3e63`, worktree `C:/Users/djuar/FTLite/.worktrees/valkyrn`, branch `valkyrn`.
- The spec it implements: `docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md` (§12 records the as-built tuning).
- The three plans it executed, in order:
  - `docs/superpowers/plans/2026-11-18-valkyrn-i-sim.md`
  - `docs/superpowers/plans/2026-11-18-valkyrn-ii-ship-and-views.md`
  - `docs/superpowers/plans/2026-11-18-valkyrn-iii-pilot-gate.md`
- The whole diff is prepared at `.superpowers/review/valkyrn-impl.diff`. It is the commit list, the stat, and `git diff -U8 master...HEAD`, without goldens, fixtures, generated credits and the spec. Read it by range; it is 8517 lines.
- Codebase areas:
  - `src/renderer/src/sim/tactical/` (gun, weapons, hash, state, defs, tuning, lead)
  - `src/renderer/src/sim/duel/` (step, state, snapshot, telemetry, scripted, scriptedPilot)
  - `src/renderer/src/sim/ship/` (schema, fleet, valkyrn.json)
  - `src/renderer/src/authority/`, `src/renderer/src/net/`
  - `src/renderer/src/app/duel/` (runtime, input, controls)
  - `src/renderer/src/render/duel/`, `src/renderer/src/render/tactical/`
  - `src/renderer/src/ui/`
  - `tests/`
- The run dir `docs/superpowers/reviews/2026-11-18-valkyrn-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec/plan.** Every behaviour the plan promised, present and right.
2. **The invariants named in the focus notes below.** Each one, traced through the diff.
3. **`tsc --noEmit` clean.** You cannot run tools beyond Read/Grep/Glob. The controller reports that `npx tsc -b` is clean, and that the full vitest suite (378 files, 5003 tests) and the two-process duel app smoke pass. Check types by reading where a finding depends on them.
4. **Test adequacy** for the risky paths, and whether the tests actually exercise the diff.
5. **Anything the plan said to do that the diff does not.**
6. **Hound unchanged.** Any branch where a Hound or Cutter run (crew 2–4, `shipClass` absent) could now take a different path in the sim, the authority or the app runtime. Examples:
   - a new guard that changes Hound control flow;
   - prediction that now differs from the authority (`stateAxes`, `sentAxes`, `heldTurn`);
   - layout-hash changes;
   - online checkpoint validation that now refuses a valid Hound snapshot.
7. **Crew of one in the app.** At crew 1, check each of these:
   - Tab, the seat swap, the sit card, standing up;
   - the unattended Helm (both in prediction and in the authority);
   - the solo record;
   - the controls list.
   Also check that online play still refuses crew 1.
8. **Gun sim.** The firing order, heat, the round pool, the sweep and the room by closest approach (spec §7). Every gun field must be covered in the hash, the snapshot, the validator and the clone. `aim` and `gunHeld` must be in the codec, checkpoint and replay, and cleared on expiry and pause.
9. **Null laser.** Every `slots.laser` reader in `src/renderer/src` guards null. The laser-fit class `valkyrnLaser` must work end to end: the picker, the switch, `createDuel`'s `cls`, the snapshot `crewClass`.
10. **Lead pip.** `render/duel/leadModel.ts` and `sim/tactical/lead.ts` must agree. A target that cannot be hit must give `null` and no NaN. The pip, crosshair and heat-bar views must use only the CRT amber ramp.
11. **Scripted pilot** (`sim/duel/scriptedPilot.ts`). Check that:
    - it is deterministic: no rng, no wall clock, no trig;
    - its pilot-only `firmGoals` deviation (goal tiles inside the reach) is sound;
    - the gate in `tests/duelGates.test.ts` is additive and does not touch the Hound bands.
12. **Tuning.** `GUN_HITS_PER_HULL` went from 3 to 12, outside the plan's listed sweep, and §12 records why. Check that:
    - every test and view that assumed 3 now derives the value from `GUN.*`;
    - `hitModel` and `pushGunHits` still give correct feedback;
    - nothing still hard-codes 3.
13. **UI boundary.** UI and audio must not import runtime values from the sim. The no-ship-id-literal test's allowed-file list must match spec §3.2. The parity test must hold as spec §3.3 defines it.
14. **Settings.** The `soloShip` and `valkyrnLaserFit` settings must persist, and an older settings file must still load.

## Reading manifest

- `.superpowers/review/valkyrn-impl.diff:L1-L8517`: the whole branch diff (the commit list, then the stat from about L22, then hunks).
- `docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md:L1-L395`: the spec. Key sections:
  - §3: L27-L61
  - §4.4: L103-L124
  - §5.1: L145-L163
  - §6: L164-L208
  - §7: L209-L272
  - §10: L290-L321
  - §12: L327-L395
- `docs/superpowers/plans/2026-11-18-valkyrn-i-sim.md:L1-L2609`: Part i plan (Decisions near the top).
- `docs/superpowers/plans/2026-11-18-valkyrn-ii-ship-and-views.md:L1-L2462`: Part ii plan.
- `docs/superpowers/plans/2026-11-18-valkyrn-iii-pilot-gate.md:L1-L1024`: Part iii plan.
- The source files the diff names. Read them in this worktree, by range, where the hunks lack context.

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are fine. Never run the test suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The Valkyrn plays the same game: the Hunter duel in the gravity-well map.
- Mouse aim: the nose turns toward the cursor. W/S is the throttle, the left mouse button fires the minigun, the right mouse button launches a missile.
- The Valkyrn has a walkable interior built from the 2-Minute Tabletop Valkyrn deck plan. The paid art stays out of git.
- A fixed minigun with a lead pip (no gimbal).
- Feature parity with the Hound; ships differ only in data.
- Single player only for now; Multiplayer stays on the Hound.
- One combined Helm+Weapons seat; a crew of one.
- The Valkyrn takes SIM 53 (after Sci-2's 52). The goldens moved only through the bless procedure. Hound tick counts, outcomes and duelGates numbers are unchanged.
- The gate bands are fixed: the Valkyrn median round is 3–5 min, and the Hunter wins ≥ 1 of 10. Tuning moves constants, never bands.

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

- **P0**: the change breaks determinism, replay or online play, changes the Hound's behaviour or goldens, or leaves the Valkyrn unplayable.
- **P1**: a spec behaviour is missing or wrong, a case hit in ordinary play is unhandled (a crash, a stuck input, a wrong hit or a wrong room), a hashed field is not covered, or a test claims to cover a risky path but does not exercise it.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
