## Role
<!-- reuse -->

The implementation (branch sci-2, 11 commits) of Sci-2 Parts A and B for FTLite (Electron + PixiJS 8 + React/zustand UI + TypeScript strict, vitest; a deterministic lockstep/rollback networked duel with an authority host, replicas, snapshots, checkpoints, a duel oracle and goldens): the duel widened from exactly two players to a crew of 2, 3 or 4 online (host picks, default 3), empty seats via the away steward, a crew list readout, a SCIENCE badge, lobby labels and the CREW 2 3 4 choice, a three-player playtest checklist. SIM_VERSION 51 -> 52 version-only; two-player runs byte-identical. Part C (late join, services/signalling) is out of scope. This is the final whole-branch review before merge: look for real bugs, especially in cross-task integration that per-task reviews could not see.

## What to review

- THE SUBJECT (impl): `c1c25e9f...HEAD (HEAD 9ac84441)` at commit `9ac84441`, worktree `C:/Users/djuar/FTLite/.worktrees/sci-2`, branch `sci-2`.
- The Sci-2 spec `docs/superpowers/specs/2026-11-18-sci-2-crew-of-four-design.md` (Parts A and B) and plan `docs/superpowers/plans/2026-11-18-sci-2-crew-of-four.md` (its Global Constraints and Decisions sections bind; both were reviewed to convergence).
- `src/renderer/src/sim/duel/`, `src/renderer/src/authority/`, `src/renderer/src/clientControl/duelClient.ts`, `src/renderer/src/net/`, `src/network/modes/` (duel, duelProducers, duelStream), `src/main/network/` (onlineDuel, onlineModes, onlineSession), `src/shared/onlineSession.ts`, `src/preload/index.ts`, `src/renderer/src/app/duel/`, `src/renderer/src/render/duel/`, `src/renderer/src/ui/` (menuState, actions, menu/HostForm, MenuButton), and `tests/`.
- The run dir `docs/superpowers/reviews/2026-11-18-sci-2-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec/plan.** Every behaviour the plan promised, present and right.
2. **The invariants named in the focus notes below.** Each one, traced through the diff.
3. **`tsc --noEmit` clean** (run it); lint if the project has it.
4. **Test adequacy** for the risky paths, and whether the tests actually exercise the diff.
5. **Anything the plan said to do that the diff does not.**
6. End-to-end crew flow: the menu's crew -> actions.host -> preload -> validateOnlineAction -> main onlineSession capacity -> duelInit playerCount -> createDuel crew -> producers playerCount -> snapshot header -> duelClient crew. Any link that still assumes 2 or drops the value?
7. Empty seats: an unclaimed seat at Start gets the away steward's presence false on every replica deterministically; the all-n-downed loss counts away characters; Start allowed with empty seats but not with a claimed seat that is not ready/connected.
8. Two-player byte-identity: any change that could alter a two-player run, snapshot or wire byte (field order, array lengths, codec limits, validation order) that the oracle might not cover (e.g. the online wire with the codec now built at limit 4: does a two-player publication encode identically?).
9. Remaining two-player assumptions: grep `0 | 1`, `[0, 1]`, `< 2`, `=== 2`, `1 - `, `PLAYERS`, `pair` in the changed areas and in callers of the changed APIs; what is intentionally kept two (Single player, scripted pair, gates, ship pairs) versus missed.
10. Recovery and rehost at n: checkpoint restore, the mirror check with capacity, a dropped seat rejoining; the crew-size mismatch paths.
11. The readout crew list (crewStatus precedence, REPAIRING rule in plan Decision 5) and READOUT_ROWS 23 fit at a crew of 4 on the console layouts.
12. Tests that pass vacuously, and test lines where a trailing comment swallowed a following statement (this happened once in the build).

## Reading manifest

- C:/Users/djuar/FTLite/.worktrees/sci-2/.superpowers/sdd/branch-c1c25e9f..9ac84441.diff (the whole branch diff, excluding regenerated goldens/fixtures; ~250 KB, read it in parts)
- docs/superpowers/specs/2026-11-18-sci-2-crew-of-four-design.md (requirements)
- docs/superpowers/plans/2026-11-18-sci-2-crew-of-four.md:L1-L70 (Global Constraints and Decisions)
- the changed files themselves for context around hunks, and their unchanged callers where a named risk needs it

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Crew 2, 3 or 4 online; host picks; default 3. The fourth works on foot (Eng-1 later).
- The host may start with empty seats; an empty seat's character stands idle (away). No late join (Part C out, owner 2026-11-18); no services/signalling change.
- Single player keeps two characters; bots and gates stay two-player; gate bands never edited.
- SIM_VERSION 51 -> 52 version-only; goldens only via npm run bless.
- The plan's Decisions section (e.g. REPAIRING = in reach plus started work; both ships get the SCIENCE badge; same-tick sits resolve in player-id order, today's rule).

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

- **P0**: the branch breaks determinism, a two-player recorded run or the online replica, or a crew of 3 or 4 cannot start or play online.
- **P1**: a real bug a playtest would hit (a crew-3/4 flow that fails, a wrong status, a replica divergence, a recovery path that refuses a valid state), a spec requirement not met, or a test that passes without exercising the change.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
