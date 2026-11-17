## Role
<!-- reuse -->

The subject is the implementation of H-2b-i, the telemetry and report part of FTLite's networked Helm duel, built on H-2a (merged: the online duel over loopback and LAN, SIM 39, per-round playtest records). FTLite is the owner's deterministic TypeScript/Electron/Pixi space game, keyboard and mouse only. H-2b-i adds:
- the link figures: the hidden RTC window labels the selected ICE pair's route (`lan`, `internet` or null; a hidden-address remote prflx is `lan` only on a direct attempt with no ICE servers) and sends `{route, rttMs}` once a second, only with a real RTT; main answers `online:link-stats`; the preload exposes `online.linkStats()`;
- the guest's records carry `transport` and a per-round median `rttMs`; the host stays `loopback` with its own link RTT;
- an F3 latency overlay (online only, its own module);
- Single player's `session: 'solo'` records;
- `scripts/duel-playtest-report.ts` (rooms chained by round index and seed; the section 16 rule verbatim and its evaluation; live targets scoped to the checklist's rooms; the planet extra; the latency table and fallback checks; a blank checklist; solo reported separately) and a "Helm demo" section in docs/gates.md;
- the duel smoke checks the labels, saves F3 screenshots and copies both machines' records for the report.

Built task by task from the twice-reviewed plan, each task reviewed. Verified: full suite 265 files, 3861 tests; determinism and host runtime PASS; the duel smoke PASS 3/3 (guest `lan`, host `loopback`, report runs clean with no addresses); the sector online-app smoke PASS. Review it on its merits, as the final whole-branch review.

## What to review

- THE SUBJECT: the diff cf3eb60..HEAD on branch `h2b-i`, worktree `C:/Users/djuar/FTLite/.worktrees/h2b-i`. You have no git, so read the prepared diff `C:/Users/djuar/FTLite/.worktrees/h2b-i/.superpowers/sdd/h2b-i-impl-review.diff` (commit list, stat, full diff with 10 lines of context). Current files are in the worktree.
- The plan: `docs/superpowers/plans/2026-11-16-helm-h2b-i-telemetry-report.md`; its Decisions (L54 to "## File structure") are binding.
- The spec: `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` section 8 (L294-L330) and section 9 (L331-L367); the section 16 rule in `docs/superpowers/specs/2026-11-14-helm-demo-design.md`.
- Minor items the task reviews left for this review to triage: (a) `src/network/rtc/peer.ts`: `route`/`rtt` keep their last values when a later stats sample has no selected pair; (b) a host with several peers shows whichever peer reported last; (c) the F3 overlay stops updating (rather than hiding) if the online state disappears; (d) `duelMode.ts`'s solo `record()` wiring (pause counting, startedAtIso) is untested; (e) two rooms from the same round-0 seed (a replayed test seed) share a room key in the report; (f) fallback checks 1 and 3 run over all rooms, not the checklist's scope; (g) the F3 overlay overlaps the map's grid labels at the top left (cosmetic).
- The run dir: `docs/superpowers/reviews/2026-11-16-helm-h2b-i-impl/` in the worktree.

## What to check, in priority order

1. **Correctness against the plan.** Does the code do what the plan's Decisions say? Cite both.
2. **Bugs.** Wrong labels or figures, stale values, per-round resets, a record written twice or never, crashes on inputs the code accepts.
3. **Privacy and security.** No candidate, address, token or room code leaves the RTC window or reaches a record, the report, a log or the overlay; the `online:link-stats` channel validates its sender, frame and shape; the preload surface is not widened.
4. **Tests.** Do the tests exercise the changed paths, and would they fail if the code were wrong?
5. (Claude) **The report's logic**: the section 16 evaluation, the live targets, the fallback checks, room chaining. Triage minors (e) and (f).
6. (Claude) **Single player unchanged** apart from writing solo records. Triage (d).
7. (Claude) Triage minors (a)-(c) and (g).

## Reading manifest

- `C:/Users/djuar/FTLite/.worktrees/h2b-i/.superpowers/sdd/h2b-i-impl-review.diff`: read it in ranges; the stat is at the top.
- `src/network/rtc/{route,peer,controller}.ts`, `src/main/network/onlineSession.ts` (linkStats), `src/main/network/onlineIpc.ts`, `src/preload/index.ts`
- `src/renderer/src/app/duel/{onlineDuel,latencyOverlay,runtime,duelMode}.ts`, `src/renderer/src/net/duelRecord.ts`
- `scripts/duel-playtest-report.ts`, `scripts/duel-playtest-model.ts`, `scripts/network/duel-app-smoke.ts`
- the plan's Decisions (L54 up to "## File structure")

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
  - a candidate, address, token or room code reaches a record, report, log or the overlay;
  - determinism broken or host/client hashes can disagree;
  - Single player or the online duel broken.
- **P1**:
  - a bug in a changed path;
  - a plan Decision not met;
  - the report evaluates the section 16 rule or a fallback check wrongly;
  - a test that passes for the wrong reason;
  - a security check missing on the new channel.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
