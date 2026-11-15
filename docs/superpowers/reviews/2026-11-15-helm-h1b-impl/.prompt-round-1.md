## Role
<!-- reuse -->

The subject is the implementation of H-1b of FTLite's Helm demo: the solo duel screens. It is about to merge to master, and it is what the owner will first play solo. It adds:
- a `?mode=duel` launch mode (env `FTLITE_MODE`, `npm run dev:duel`);
- a local runtime around the merged duel sim (`stepDuelTick`), with Tab switching between two characters with presence (player 1 starts away);
- the Weapons console view, with laser charge, steerable missiles and a missile-path predictor;
- the FTL-style Cutter interior view for walking and repair;
- readouts with both hulls, effects (beams, bursts, sparks, shake, trails), and an end screen with restart.

The standard:
- correct against the refined H-1 spec and the plan;
- the client only sends commands the sim admits in ordinary play;
- no stuck input after Tab, blur or pause;
- restart leaves no stale state;
- no leaks, and no regression in the sector game or the H-1a flight view.

## What to review

- THE SUBJECT (impl): the diff `master...HEAD` on branch `helm-h1b`, worktree `C:/Users/djuar/FTLite/.worktrees/helm-h1b` (`git diff master...HEAD`). It has 8 commits:
  - 6 plan tasks;
  - `7069dcb`: the duel controls mirror the sim's conscious and console-online checks;
  - `8e7394c`: the Weapons camera follows the missile's interpolated position.
- The spec: `docs/superpowers/specs/2026-11-14-helm-h1-views-design.md` (H-1b = §11's second row; §4, §5, §7, §8, §10, §12) and the plan `docs/superpowers/plans/2026-11-15-helm-h1b-duel-screens.md` (Decisions section; Codex-reviewed; the code follows it except the two fixes).
- The run dir `docs/superpowers/reviews/2026-11-15-helm-h1b-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec and plan.** Does the diff do what the subject promises?
2. **Bugs:** off-by-one errors, unhandled error paths, races, lost or duplicated work, resource leaks.
3. **Consistency with existing patterns** in the surrounding code.
4. **Test coverage of the risky paths**, and tests that pass for the wrong reason.
5. (Claude) **Duel commands against the sim** (`app/duel/runtime.ts` with `sim/duel/step.ts`, `sim/duel/commands.ts`):
   - requestedTick and sequences;
   - the tick-0 solo presence;
   - Tab presence on one tick, with a sit or stand held back until after the presence tick;
   - the E rule (sit only when no repair is in reach);
   - the lock cycle, charge and release, and launch;
   - the blur release of a held charge;
   - any command sent in ordinary play that the sim rejects.
6. (Claude) **Pause, end and restart:**
   - the pause-reason set, with a pause disposing the tick driver and resume creating a fresh one;
   - Escape before pump; presses dropped while paused;
   - stepping stops at the outcome, and the end screen length is the end tick;
   - Enter restart: `disposeDuel` once, seed+1, a fresh driver, solo start reapplied;
   - the boot (`app/duel/duelMode.ts`) rebuilding view caches on an epoch change (interior view rebuilt, layer reseeded, fx and trails reset).
7. (Claude) **The views:**
   - the interior view's reuse of the interior layers and its fit;
   - the damage overlay and progress ring;
   - the Weapons model (arcs, lock marker on both consoles);
   - the missile-path predictor (no mutation of live state, stops per the spec contract);
   - effects and shake wiring; the readout strip semantics (crewed only when a present character sits);
   - no display objects created per frame.
8. (Claude) **The sector game and the H-1a flight view unchanged:** `main.ts` mode switch, `package.json`, the refactored flight runtime (shared pacer and camera input), the opt-in `spreadArrows`, and `tacticalLayer.reset()`.

## Reading manifest

- `git -C C:/Users/djuar/FTLite/.worktrees/helm-h1b diff master...HEAD --stat` then the diff per file.
- `src/renderer/src/app/duel/runtime.ts`, `duelMode.ts`, `controls.ts`, `input.ts`, `mode.ts`, `flightMode.ts`
- `src/renderer/src/render/duel/*.ts`; `src/renderer/src/render/tactical/{missilePath,fxModel,weaponsModel,tacticalModel,tacticalLayer}.ts`
- `src/renderer/src/sim/duel/{step,commands,state,tuning}.ts`, `sim/tactical/{missiles,weapons,duel}.ts` (unchanged; the rules the client must match)
- `src/renderer/src/authority/tickDriver.ts` (unchanged)
- `src/renderer/src/main.ts`, `package.json` against `git show master:<path>`
- tests: `tests/duelRuntime.test.ts`, `duelControls.test.ts`, `duelWeaponsView.test.ts`, `duelInterior.test.ts`, `duelReadout.test.ts`, `flightRuntime.test.ts`
- spec `docs/superpowers/specs/2026-11-14-helm-h1-views-design.md` (whole, about 185 lines)

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `node -e` arithmetic checks are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined H-1 spec and the Codex-reviewed H-1b plan are the authority. Their (rec.) choices were taken under the owner's standing order and may be questioned only with evidence of a defect.
- Solo play: one person Tabs between two characters with presence (grill Q24). Standing up shows the FTL-style interior, and players walk to repair (Q27).
- No change to `net/contracts.ts`, `authority/`, the duel or tactical sim's behaviour, or sector behaviour. The duel's authority mode is H-0c-ii, and the survival tuning (passive crew dies in about 90 s) is a known open item for it.
- Determinism rules apply to the guarded roots (sim, authority, net, clientControl, events, shared). Render, app and input code is outside them.
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

- **P0**: breaks the sector game or the flight view, changes sim behaviour, or crashes the duel mode at startup or restart.
- **P1**: a real bug in ordinary solo play (stuck input, a command the sim rejects in ordinary play, stale state after restart, a leak, wrong drawing), a spec or plan requirement missing or contradicted without saying so, or a test that passes for the wrong reason on a risky path.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
