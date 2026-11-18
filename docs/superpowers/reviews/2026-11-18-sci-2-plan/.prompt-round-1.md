## Role
<!-- reuse -->

An implementation plan for FTLite (Electron + PixiJS 8 + React/zustand UI + TypeScript strict, vitest; a deterministic lockstep/rollback networked duel with an authority host, replicas, snapshots, checkpoints, a duel oracle and goldens): Sci-2 Parts A and B, widening the duel from exactly two players to a crew of 2, 3 or 4 online (host picks, default 3), empty seats via the away steward, a crew list readout, a SCIENCE badge, lobby labels and a three-player playtest checklist. SIM_VERSION 51 -> 52 version-only. Part C (late join, service change) is OUT of scope. Each task is executed by a fresh subagent that sees only its task text plus Global Constraints, so each task must be self-contained, its code must compile against the real codebase, and its tests must be real.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-18-sci-2-crew-of-four.md` at commit `5e9be125`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The Sci-2 spec `docs/superpowers/specs/2026-11-18-sci-2-crew-of-four-design.md` (reviewed to convergence; Parts A and B are the requirements, Part C excluded), the Sci-1 plan `docs/superpowers/plans/2026-11-17-sci-1-science-scans.md` (format precedent), Sci-1 `docs/superpowers/specs/2026-11-17-science-scans-design.md`, start aboard `docs/superpowers/specs/2026-11-17-start-aboard-design.md`, the networked duel `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md`, and the Net-3 specs (`docs/superpowers/specs/2026-11-14-net-3-internet-sessions-design.md`, `2026-11-15-net-3c-signalling-service-design.md`, `2026-11-15-net-3e-recovery-internet-design.md`) for rooms, seats, tokens and reconnects.
- `src/renderer/src/sim/duel/` (state, step, modules, snapshot, scripted), `src/renderer/src/authority/` (duelCheckpoint, duelRules, core), `src/renderer/src/clientControl/` (duelClient), `src/renderer/src/net/` (codec, contracts), `src/main/network/` (onlineDuel, onlineModes, hostProcess), `src/shared/roomSession.ts`, `services/signalling/src/` (room/auth.ts, room.ts, directory.ts), `src/renderer/src/app/duel/` (onlineDuel, onlineSource, runtime, controls), `src/renderer/src/render/duel/` (readoutModel, interiorModel), `src/renderer/src/ui/menu/` (HostForm, SessionPage), and `tests/`.
- The run dir `C:/Users/djuar/FTLite/docs/superpowers/reviews/2026-11-18-sci-2-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
7. Spec coverage: every §4, §5, §6, §9 requirement of the spec (Parts A and B) maps to a task; nothing from Part C or services/signalling is planned.
8. Two-player byte-identity: Task 1's version-only bump and the oracle/canonical-trace proofs in later tasks; does the plan's sequencing keep every intermediate commit green (tsc, tests, oracle same) and are the bless steps placed right (scripts/golden/duelOracle.ts MIGRATIONS, npm run bless)?
9. Code correctness: do the code blocks compile against the real types (DuelState, createDuel callers, snapshot header, DuelInit, codec playerLimit, duelProducers, duelClient, OnlineApi.host, menuState)? Are all callers of changed signatures updated in the same task (tsc -b must pass per task)?
10. The plan's Decisions section: check each against the spec and code, especially REPAIRING redefined as 'in reach of a repair point that needs work' (spec says derived from duel state alone), the Cutter SCIENCE badge, the 2-spawn test layout, READOUT_ROWS 23.
11. Empty seats: how an unclaimed seat becomes away on every replica deterministically (away steward), and the crew-3-with-seat-2-empty test.
12. Test quality: tests assert real behaviour (not tautologies), crewOfFour/crewOfFourWire/duelOnlineCrew tests are runnable as written; gate bands untouched.

## Reading manifest

- docs/superpowers/plans/2026-11-18-sci-2-crew-of-four.md (the subject, ~2150 lines; read all)
- docs/superpowers/specs/2026-11-18-sci-2-crew-of-four-design.md (the requirements, ~125 lines)
- the code each task cites: src/renderer/src/sim/duel/ (state, step, modules, snapshot, health, scripted), src/renderer/src/authority/duelCheckpoint.ts, src/renderer/src/clientControl/duelClient.ts, src/renderer/src/net/codec.ts and duelStream.ts, src/main/network/onlineDuel.ts and onlineSession.ts, src/shared/onlineSession.ts, src/preload, src/renderer/src/app/duel/ (onlineSource, onlineDuel, sitModel, scene, duelProducers), src/renderer/src/render/duel/ (readoutModel, interiorModel, consoleModel), src/renderer/src/ui/menu/ (menuState, SessionPage, HostForm), scripts/golden/duelOracle.ts; open the cited line ranges
- tests/duelGates.test.ts (must not change)

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Crew 2, 3 or 4 online; host picks; default 3.
- The fourth player's Engineering console is a separate feature (Eng-1); in Sci-2 the fourth works on foot.
- The host may start with empty seats; an empty seat's character stands idle (away).
- Single player keeps two characters; bots and gates stay two-player.
- Part C late join is not built (owner, 2026-11-18); no services/signalling change.
- SIM_VERSION 51 -> 52 version-only; goldens only via npm run bless; gate bands never edited.

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

- **P0**: executing the plan as written would break determinism, the two-player recorded runs or the online replica, or a task cannot be completed (does not compile, tests cannot pass).
- **P1**: a task's code would not compile or its test would fail or pass vacuously, a caller of a changed signature left unupdated, a spec requirement with no task, a two-player assumption missed that breaks n > 2, a task that needs context from another task it does not state, or an intermediate commit that leaves the suite red.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
