## Role
<!-- reuse -->

The subject is the implementation of H-2a-i, the first of three plans for FTLite's networked Helm duel (H-2a, loopback and LAN). FTLite is the owner's deterministic TypeScript/Electron/Pixi space game. H-2a-i makes the duel a series of rounds inside one authority run and readies its contracts for the network:
- a decided round is an end card that keeps ticking; `rematch` starts the next round in place on the next tick, from the following round seed, with the init's Helm player;
- a hashed `round` module (`round`, `helmPlayer`, `baseTick`, `decidedTick`), validated in the snapshot and checkpoint (with `MAX_DUEL_ROUNDS` = 1024 and `2*round <= baseTick`);
- the authority core's `records` hook and one `round` record per decided round; the telemetry accumulator restarts per round and freezes on the decision;
- `DuelInit.helmPlayer`; the duel wire's `rematch`, `round` event (through `ModeWire.events`), reasons `duel-running`/`duel-decided`, the widened end summary;
- two bounded validation caches and an in-place `restoreDuelSnapshot`; the publication budget script;
- SIM_VERSION 38 to 39 through the bless guard (both baselines recorded at 38 first; sector canonical trace version-only; duel oracle identical through `MIGRATIONS[38]`), then a rematch golden added with `--fresh`.

Built task by task from the twice-reviewed plan, each task reviewed. Verified by the implementers and controller: blessed basic 128b3c62, duel-1 0e111f7a, rematch 5dab688c (all as prototyped); full suite 240 files, 3403 tests pass; determinism PASS on Node, Electron, Firefox; host runtime PASS; the sector online-app smoke passed twice (it failed twice under load, and the unchanged base also fails it intermittently at the same step). Review it on its merits, as the final whole-branch review.

## What to review

- THE SUBJECT: the diff b19761a..HEAD (d15c705) on branch `h2a-i`, worktree `C:/Users/djuar/FTLite/.worktrees/h2a-i`. You have no git, so read the prepared diff `C:/Users/djuar/FTLite/.worktrees/h2a-i/.superpowers/sdd/h2a-i-impl-review.diff` (commit list, stat, full diff with 10 lines of context). It excludes the generated `tests/golden/*.json` and `tests/fixtures/*.json`; the bless guard proves them. Current files are in the worktree; read them directly.
- The plan: `docs/superpowers/plans/2026-11-16-helm-h2a-i-rounds-and-contracts.md`; its Decisions (L46 to "## File structure") are binding.
- The spec: `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` §4, §5, §7, §8.
- The run dir: `docs/superpowers/reviews/2026-11-16-helm-h2a-i-impl/` in the worktree.

## What to check, in priority order

1. **Correctness against the plan.** Does the code do what the plan's Decisions say? Cite both.
2. **Bugs.** Wrong logic, missed branches, crashes or hangs on inputs the code accepts (forged snapshots and checkpoints included).
3. **Tests.** Do the tests exercise the changed paths, and would they fail if the code were wrong?
4. **Boundaries.** Determinism rules for guarded roots (`tests/boundary.test.ts`); `sim/` imports nothing from `authority/`, `clientControl/`, `app/`, `render/`.
5. (Claude) **Round 1 unchanged.** Does a fresh duel's first round step exactly as before (is `MIGRATIONS[38]` the only difference the oracle allowed)? Does the in-place next round leave any stale reference, alias or reused ECS entity?
6. (Claude) **The end card and records.** Results per Decision 6; no sim or accumulator advance while decided; exactly one round record per decided round; no repeated cues.
7. (Claude) **Validation and caches.** Can a forged round module pass? Can a cache return a stale validity? Is `restoreDuelSnapshot` equivalent to a fresh load?
8. (Claude) **The bless guard.** Can any pinned artifact, the rematch golden included, be re-blessed without proof?

## Reading manifest

- `C:/Users/djuar/FTLite/.worktrees/h2a-i/.superpowers/sdd/h2a-i-impl-review.diff`: read it in ranges; the stat is at the top.
- `src/renderer/src/sim/duel/{snapshot,seeds,step,state,modules,telemetry,summary}.ts`
- `src/renderer/src/authority/{core,rules,duelRules,duelCheckpoint}.ts`, `src/renderer/src/net/codec.ts`
- `scripts/golden/duelOracle.ts`, `scripts/bless-golden.ts`
- the plan's Decisions (L46 up to "## File structure")

Read by range, not whole files, except the files listed above. Do not explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are the only tools; use the prepared diff instead of git. Never run the test suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined H-2 spec (`docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md`) is the authority; the Helm demo spec and the engine refactor spec stand behind it.
- Keyboard and mouse only; no gamepads, no couch (shared-screen) play. The main menu is Single player / Multiplayer (Host, Join) / Settings.
- The sector and Net-3 behaviour must be unchanged except where the H-2 spec changes it. Generated files (goldens, determinism fixture) come only from `npm run bless`.
- Determinism rules apply to the guarded roots.
- Commits are made by explicit path only. Never checkout, restore, stash or clean in the main checkout: other sessions work there.

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

- **P0**:
  - a duel rule changed beyond the spec's rounds, or sector behaviour changed;
  - determinism broken or host/client hashes can disagree;
  - a golden can be re-blessed without proof;
  - a restore or validation that can silently diverge or hang;
  - Single player (the H-1 duel) broken.
- **P1**:
  - a bug in a changed path;
  - a plan Decision not met;
  - a proof too weak to catch a real regression;
  - a test passing for the wrong reason.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
