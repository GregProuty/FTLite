## Role
<!-- reuse -->

The subject is the implementation of H-2a-ii, the second of three plans for FTLite's networked Helm duel (H-2a, loopback and LAN), built on H-2a-i (merged: rounds, SIM 39). FTLite is the owner's deterministic TypeScript/Electron/Pixi space game. H-2a-ii is the headless online stack, proved over the loopback before any application work:
- a generic stream client (`clientControl/streamClient.ts`); the sector's `createClientRun` rebuilt on it with signature and behaviour unchanged; a duel stream client (`duelClient.ts`) keeping a `DuelState` replica restored in place, allocating its own command and held sequences;
- a mode remote client (`network/modes/remoteClient.ts`) with the sector's and the duel's remote clients on it; one validation per received duel publication;
- a duel producer manager (`network/modes/duelProducers.ts`): an away steward for a seat with no human (`presence {present:false}` once), and a `peer-lost` pause for a lost remote peer only after that presence is applied; the attachment origin;
- a ten-seed test of two remote duel clients flying the scripted pair at 20 Hz, plus rematch, reconnect and round-context tests.

Built task by task from the twice-reviewed plan, each task reviewed. Task 3's review found the peer-lost debt surviving a human who takes the seat and a steward retry reusing its rejected sequence; both were fixed (b69ac2d) with tests that fail without the fix. The ten-seed file now yields a macrotask per seed (vitest worker RPC timeout). Verified: full suite 251 files, 3519 tests; determinism PASS (Node, Electron, Firefox); host runtime PASS; sector online-app smoke PASS. Review it on its merits, as the final whole-branch review.

## What to review

- THE SUBJECT: the diff 409a1e3..HEAD on branch `h2a-ii`, worktree `C:/Users/djuar/FTLite/.worktrees/h2a-ii`. You have no git, so read the prepared diff `C:/Users/djuar/FTLite/.worktrees/h2a-ii/.superpowers/sdd/h2a-ii-impl-review.diff` (commit list, stat, full diff with 10 lines of context). Current files are in the worktree.
- The plan: `docs/superpowers/plans/2026-11-16-helm-h2a-ii-online-stack.md`; its Decisions (L38 to "## File structure") are binding.
- The spec: `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` §3, §4, §6, §10.
- Minor items the task reviews left for this review to triage: (a) the remote duel path no longer runs `checkedPublication`'s identity checks (`publication.tick === snapshot.header.tick`, `publication.hash === hashF64(values)`), and `validateDuelPublication` does not repeat them (`src/network/modes/duelStream.ts`, `clientControl/duelClient.ts`); (b) the `clientRun.ts` wrapper keeps `publication`/`voteExecutions` after an internal core dispose (no behaviour impact claimed); (c) a steward presence sent before another player's pause re-pauses `peer-lost` on resume, untested.
- The run dir: `docs/superpowers/reviews/2026-11-16-helm-h2a-ii-impl/` in the worktree.

## What to check, in priority order

1. **Correctness against the plan.** Does the code do what the plan's Decisions say? Cite both.
2. **Bugs.** Wrong logic, missed branches, races on disconnect/reconnect/rematch, crashes on inputs the code accepts.
3. **Tests.** Do the tests exercise the changed paths, and would they fail if the code were wrong?
4. **Boundaries.** Determinism rules (`tests/boundary.test.ts`) and the network boundary (`tests/networkBoundary.test.ts`).
5. (Claude) **Sector unchanged.** Compare the removed `clientRun.ts` and `sectorStream.ts` code with the generic cores: any reorder of replica, card reconcile, vote executions, watermarks, outbox, results, queueing, or close order?
6. (Claude) **The steward state machine** (spec §6, Decisions 5-7), including the b69ac2d fix: any path where a lost peer never pauses, pauses twice, pauses before presence is applied, or a local/no-origin attachment pauses?
7. (Claude) **Validation.** Can an unvalidated or inconsistent duel publication reach the replica? Triage minor (a).
8. (Claude) **The ten-seed proof** is not satisfied vacuously.

## Reading manifest

- `C:/Users/djuar/FTLite/.worktrees/h2a-ii/.superpowers/sdd/h2a-ii-impl-review.diff`: read it in ranges; the stat is at the top.
- `src/renderer/src/clientControl/{streamClient,duelClient,clientRun}.ts`
- `src/network/modes/{remoteClient,sectorStream,duelStream,duelProducers,encounterMode,duel}.ts`
- `tests/duelProducers.test.ts`, `tests/duelOnline.test.ts`, `tests/helpers/onlineDuel.ts`
- the plan's Decisions (L38 up to "## File structure")

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
  - sector behaviour or wire changed;
  - determinism broken or host/client hashes can disagree;
  - an unvalidated snapshot can reach the replica;
  - Single player (the H-1 duel) broken.
- **P1**:
  - a bug in a changed path (disconnect, rejoin, rematch, pause included);
  - a plan Decision not met;
  - a proof too weak to catch a real regression;
  - a test passing for the wrong reason.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
