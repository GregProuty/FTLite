## Role
<!-- reuse -->

The subject is the implementation of Art-i-b on branch `art-i-b`: a presentation-only light-and-feel pass on FTLite's ship interior renderer (Electron + PixiJS 8.19 + TypeScript, vitest), wired into both the sector ship view and the Helm duel interior. It adds a colour grade (ambient, a red alert pulse, a per-room vacuum tint), posterised additive lights, a seeded pooled particle emitter and its sources (fire, sparks, venting, breach debris, crew working), impact feel (white flash, whole-art-pixel shake, 60 ms hitstop, lingering smoke, a feel setting with F9 in dev), ambient life (console cursor blink, room lamps, wall-vent steam, a parallax starfield), and console desks on the art-pixel grid. It replaces the old projectile shake, the red impact flash, the red low-O2 tint and the vent-puff sprite. It will be merged to master and shown to the owner as a look-and-feel check. It must match its spec and plan, keep the deterministic sim untouched, and introduce no regressions in either mode.

## What to review

- THE SUBJECT (impl): the range `0a8b6d1...HEAD` (head `f3927b7`), worktree `C:\Users\djuar\FTLite\.worktrees\art-i-b`, branch `art-i-b`. The full diff (excluding package-lock.json) is prepared at `.superpowers/sdd/art-i-b-branch.diff` (2690 lines); read it there instead of running git.
- The spec: `docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md` (sections 5-8; 1-4 were Art-i-a).
- The plan: `docs/superpowers/plans/2026-11-16-art-i-b-light-and-feel.md` (Decisions 1-19, Tasks 1-10, spec notes).
- Per-task reviews approved every task; their minor notes are in `C:/Users/djuar/FTLite/.superpowers/sdd/progress.md` (the section headed "Art-i-b"). Triage them: say which, if any, must be fixed before merge.
- The run dir `docs/superpowers/reviews/2026-11-16-art-i-b-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec/plan.** Every behaviour the plan promised, present and right.
2. **The invariants named in the focus notes below.** Each one, traced through the diff.
3. **`tsc --noEmit` clean** (run it); lint if the project has it.
4. **Test adequacy** for the risky paths, and whether the tests actually exercise the diff.
5. **Anything the plan said to do that the diff does not.**
6. **Determinism boundary:** nothing under src/renderer/src/sim/, authority/, src/network or src/shared changed; the particle generator is seeded from the layout hash and never the sim RNG; the presentation clock and hitstop never touch the sim tick or interpolation; nothing writes sim state.
7. **Cross-module integration:** the sector Renderer (renderer.ts: grade, lights, starfield, shake applied to world + projectiles + callouts, reset clearing seenImpact and the feel, paused parameter from session.ts and onlineSession.ts, feel()/setFeel()) and the duel (interiorView.ts order, events from duelMode's single drain, presentDt from runtime.paused(), scene shake zero only while the interior shows, destroy order and restart). Check both modes for the same hit not being double-counted or lost and for lifetime/leaks across runs and layout changes.
8. **Visible regressions:** what was removed (old shake, red flash, red low-O2 tint, vent puffs) has a replacement in every case where it used to show; the grade never tints crew, consoles or hazards; repair labels and markers stay above the lights; the alert pulse and vacuum stack sensibly with the duel's damage tint; the shake holds during pause (noted by a task review).
9. **Performance:** 600 pre-created sprites per interior, per-frame allocations in interiorFeel and particleLayer, the gradeCover mask rebuild only on layout change.
10. **The feel setting:** localStorage 'ftlite-feel' full/reduced/off, try/catch reads, F9 only under import.meta.env.DEV, saved on change, installed after each createRenderer.
11. **Leftover dead code:** ventRotation (now unused in src), the palette roles lowO2 and impact (now unread). Say whether to remove now or later.

## Reading manifest

- .superpowers/sdd/art-i-b-branch.diff:L1-L2690 — the whole branch diff (read by range)
- docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md — sections 5-8 and Testing
- docs/superpowers/plans/2026-11-16-art-i-b-light-and-feel.md:L1-L120 — header, constraints, decisions, file structure; L3020-L3044 spec notes and self-review
- C:/Users/djuar/FTLite/.superpowers/sdd/progress.md — the Art-i-b section at the end (task minors)
- src/renderer/src/render/renderer.ts, interiorFeel.ts, particles/*.ts, gradeModel.ts, lightsModel.ts, impactModel.ts, presentClock.ts, feel.ts, effects.ts, crewSprites.ts, consoleModel.ts, consoleLayer.ts, projectiles.ts, duel/interiorView.ts — current files
- src/renderer/src/app/duel/duelMode.ts, app/feelBoot.ts, app/session.ts, app/onlineSession.ts, main.ts — wiring
- tests/ files named in the diff

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are fine. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Scope is the ship interior only (sector ship view and the duel interior walk); not the tactical view, HUD or menus.
- 16 px art at 2x on the 32 px tile; one house palette; light from the top-left.
- Presentation only: no sim, command, snapshot or authority change; SIM_VERSION and goldens unchanged.
- The new shake replaces the sector shake and the duel interior shake; the white flash replaces the red impact flash; the vacuum tint replaces the red low-O2 tint.
- Feel setting: no menu UI; F9 in dev builds only.
- The plan's stated deviations and decisions (refined in docs/superpowers/reviews/2026-11-16-art-i-b-plan, converged) are accepted.

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

- **P0**: the change breaks the game (a crash, a blank interior, a frozen render loop) or changes the deterministic sim (SIM_VERSION, goldens, sim RNG or sim state).
- **P1**: a promised behaviour is missing or wrong, a visible regression in ordinary play (either mode), a leak or unbounded growth across runs, a test that cannot catch the defect it claims to, or a silent deviation from the spec or plan.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
