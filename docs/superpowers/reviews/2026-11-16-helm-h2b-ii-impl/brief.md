## Role
<!-- reuse -->

The subject is the implementation of H-2b-ii, the internet candidate for FTLite's networked Helm duel, built on H-2a (the online duel, SIM 39) and H-2b-i (telemetry and the playtest report), both merged. FTLite is the owner's deterministic TypeScript/Electron/Pixi space game. H-2b-ii:
- the internet report and candidate manifest take `sim` from SIM_VERSION (39); the report checks the duel evidence (`duel` for a local pair, `deviceDuel` for each machine of a two-machine run, records with held+command > 0, guest transport rules under forced relay, matching seeds, unique process ids);
- only out/main, out/preload and out/renderer are packaged;
- the internet smoke first runs a duel pair through the real menu (X then E in round 1), then the sector pair through the test-only entry; the manual `--role=host|guest` two-machine path does its duel half through the menu and its sector half through `host-sector`/`join-sector`; the guest reads the room code from `--join-code-file` (deleted after reading; never logged);
- the gates subsection and the two-machine procedure are documented; the plan's packaging command is quoted for PowerShell 5.1.

Nothing is deployed; the deployed and forced-relay runs, the two-machine runs and the playtests are owner-only after the redeploy (the deployed service is still SIM 35). Verified: candidate built (worker bundle dry run, origin embedded once), packaged, audited (sim 39, 50 artifacts); local verification PASS against local workerd including the duel half (guest `lan`, host `loopback`, samples in both records); full suite 280 files, 3994 tests; host runtime, duel smoke, sector online-app smoke (second try, known load flake) and determinism PASS. Review it on its merits, as the final whole-branch review.

## What to review

- THE SUBJECT: the diff 69c2e06..HEAD on branch `h2b-ii`, worktree `C:/Users/djuar/FTLite/.worktrees/h2b-ii`. You have no git, so read the prepared diff `C:/Users/djuar/FTLite/.worktrees/h2b-ii/.superpowers/sdd/h2b-ii-impl-review.diff` (commit list, stat, full diff with 10 lines of context). Current files are in the worktree.
- The plan: `docs/superpowers/plans/2026-11-16-helm-h2b-ii-internet-candidate.md`; its Decisions (L44 to "## File structure") are binding.
- The spec: `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` section 10 (L368-L435) and section 11 (L436-L445).
- Minor items the task reviews left for this review to triage: (a) the deviceDuel seed comparison would pass if both seeds were undefined (safe only because parseRun requires deviceDuel for single-device runs); (b) the manifest's console message still says "exact out bytes"; (c) a join-code file written but not read before a failure is never removed; (d) the local pair's single 180 s budget covers three preparation builds, the duel and the sector run, with untested headroom; (e) duelRun's `until` waits read `a.speed` and the last observation's publications without null guards; (f) deviceDuelRun's 20 s waits for the other machine's effect.
- The run dir: `docs/superpowers/reviews/2026-11-16-helm-h2b-ii-impl/` in the worktree.

## What to check, in priority order

1. **Correctness against the plan.** Does the code do what the plan's Decisions say? Cite both.
2. **No deploy, no secrets.** No step deploys, pushes or needs credentials; no room code, token, TURN credential, address or candidate reaches stdout, logs, reports, the manifest or the package.
3. **Packaging.** Could restricting the package to the three out/ folders drop something the app loads at runtime?
4. **Bugs and robustness** in the smoke's duel half and the two-machine path. Triage minors (c)-(f).
5. **Tests.** Do the report's reject cases each hit a distinct check? Triage (a) and (b).
6. (Claude) **The owner-only steps** in docs/gates.md and the two-machine procedure: are they exact, ordered and runnable as written in Windows PowerShell 5.1?

## Reading manifest

- `C:/Users/djuar/FTLite/.worktrees/h2b-ii/.superpowers/sdd/h2b-ii-impl-review.diff`: read it in ranges; the stat is at the top.
- `scripts/network/internet-app-smoke.ts`, `scripts/network/internet-app-report.ts`, `scripts/network/candidate-manifest.ts` (or wherever the diff puts the manifest), `electron-builder.yml`
- `docs/gates.md` (the H-2b-ii subsection), `docs/superpowers/prompts/2026-11-15-net-3e-two-machine-playtest.md`
- the plan's Decisions (L44 up to "## File structure")

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
  - a step deploys, pushes, or leaks a room code, token, credential, address or candidate;
  - the package drops something the app needs at runtime;
  - sector or duel behaviour changed.
- **P1**:
  - a bug in the smoke or report that makes a gate pass for the wrong reason or fail spuriously;
  - a plan Decision not met;
  - an owner-only step that cannot be run as written.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
