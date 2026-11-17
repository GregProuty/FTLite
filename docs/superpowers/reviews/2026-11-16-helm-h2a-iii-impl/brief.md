## Role
<!-- reuse -->

The subject is the implementation of H-2a-iii, the last of three plans for FTLite's networked Helm duel over loopback and LAN, built on H-2a-i (rounds, SIM 39) and H-2a-ii (the headless online stack), both merged. FTLite is the owner's deterministic TypeScript/Electron/Pixi space game, keyboard and mouse only. Two machines, one player each, fly the duel from the menu:
- main process: the online mode adapter (`src/main/network/onlineModes.ts`), the duel's online mode (`onlineDuel.ts`: compatibility, room init and seed, the guest's committed-start check, the mirror check), the session through the adapter with the attachment origin, the sector forms behind a test-only gate (unpackaged + `FTLITE_SECTOR_ONLINE_TEST=1`), `FTLITE_DUEL_TEST_SEED` (unpackaged only), the playtest record log (`duelRecords.ts`, the `duel:record` channel);
- the menu: Host (two-seat duel room, code shown), Join, Swap seats; the preload's host/join/start/recordDuel;
- the renderer: the duel scene from a `DuelViewSource` (`app/duel/scene.ts`, keeping Art-i-b's interior feel), Single player on it with the rematch, the online view source and session (`onlineSource.ts`, `onlineDuel.ts`), the router's session wrapper (`app/onlineModeSession.ts`);
- the smokes: the sector's on the test-only entry, and a new two-process duel application smoke.

Built task by task from the twice-reviewed plan, each task reviewed. Verified: full suite 253 files, 3549 tests (a rerun; the first run had the known director-soak load flake); determinism and host runtime PASS; the duel smoke PASS 3/3; the recovery smoke PASS; the sector online-app smoke PASS 1 of 3 (it is intermittently flaky on master too, at join/play under load; one failure here was at the cancel step that now uses the new `join-sector` entry). Review it on its merits, as the final whole-branch review.

## What to review

- THE SUBJECT: the diff 6aa656f..HEAD on branch `h2a-iii`, worktree `C:/Users/djuar/FTLite/.worktrees/h2a-iii`. You have no git, so read the prepared diff `C:/Users/djuar/FTLite/.worktrees/h2a-iii/.superpowers/sdd/h2a-iii-impl-review.diff` (commit list, stat, full diff with 10 lines of context). Current files are in the worktree.
- The plan: `docs/superpowers/plans/2026-11-16-helm-h2a-iii-online-app.md`; its Decisions (L37 to "## File structure") are binding, Decision 14 (solo records moved to H-2b) and 15 (Art-i-b carried into the scene) included.
- The spec: `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` §2, §3, §7, §8, §10; the menu spec `docs/superpowers/specs/2026-11-16-main-menu-kbm-design.md`.
- Minor items the task reviews left for this review to triage: (a) `reconnect`/`retry` with a saved sector seat credential picks the sector adapter without checking `sectorTestEntry` (`src/main/network/onlineSession.ts` ~L403, L430-432); (b) `duel:record` has no append rate limit (`src/main/index.ts`); (c) on link close the online session keeps `client` set until the next `setStatus`, so "CONNECTION LOST — RECONNECTING" may not show, and never if main pushes no phase from the release list (`src/renderer/src/app/duel/onlineDuel.ts` ~L189, L205, L211); (d) online Enter on the end card resends `rematch` on every press (the authority answers duplicates `noop`); (e) Single player sends live held axes on the end card (ignored by the sim); (f) why the sector online-app smoke failed at the cancel step through `join-sector` (`scripts/network/online-app-smoke.cjs`, `online-app-smoke.ts`).
- The run dir: `docs/superpowers/reviews/2026-11-16-helm-h2a-iii-impl/` in the worktree.

## What to check, in priority order

1. **Correctness against the plan.** Does the code do what the plan's Decisions say? Cite both.
2. **Bugs.** Races between leave, re-attach, link close and scene teardown; wrong banners; input sent on the wrong seat; crashes on inputs the code accepts.
3. **Security.** The sector gate and the test seed only unpackaged; the `duel:record` channel (sender check, strict schema, 8 KiB cap, path from the local date only); the preload surface; the guest's committed-start and mirror checks. Triage minors (a) and (b).
4. **Tests.** Do the tests exercise the changed paths? Did any edited test lose an assertion?
5. (Claude) **Single player unchanged** apart from the rematch: Tab, M to the menu when paused or on the end card, Art-i-b's interior feel (Decision 15).
6. (Claude) **The online session** (Decisions 7-9): presence first after every full-state ACK, quantised held input every pump, commands gated by the confirmed replica, focus loss neutralises without pausing, the frozen view, Escape/Enter on the end card, the leave prompt across a rematch, Leave. Triage minors (c)-(e).
7. (Claude) **The smokes** prove what they claim, and clean only their own temporary roots. Triage minor (f).

## Reading manifest

- `C:/Users/djuar/FTLite/.worktrees/h2a-iii/.superpowers/sdd/h2a-iii-impl-review.diff`: read it in ranges; the stat is at the top.
- `src/main/network/{onlineModes,onlineDuel,duelRecords,onlineSession}.ts`, `src/main/index.ts` (the IPC handlers and the test-only entries), `src/preload/index.ts`, `src/shared/onlineSession.ts`
- `src/renderer/src/app/duel/{scene,duelMode,runtime,onlineSource,onlineDuel}.ts`, `src/renderer/src/app/onlineModeSession.ts`, `src/renderer/src/render/sessionMenu.ts`, `src/renderer/src/net/duelRecord.ts`
- `scripts/network/{duel-app-smoke,duel-app-observer,online-app-smoke}.ts`, `scripts/network/online-app-smoke.cjs`
- the plan's Decisions (L37 up to "## File structure")

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
  - sector behaviour changed beyond the spec's gate and action shapes;
  - determinism broken or host/client hashes can disagree;
  - a renderer can write outside the record log, or the sector/test-seed gates open in a packaged build;
  - Single player (the H-1 duel) broken.
- **P1**:
  - a bug in a changed path (disconnect, rejoin, rematch, pause, leave included);
  - a plan Decision not met;
  - a smoke or test that passes for the wrong reason;
  - a security check missing on a new channel.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
