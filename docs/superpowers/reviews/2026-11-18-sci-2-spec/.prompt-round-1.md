## Role
<!-- reuse -->

A design spec for FTLite (Electron + PixiJS 8 + React/zustand UI + TypeScript, vitest; a deterministic lockstep/rollback networked duel with an authority host, replicas, snapshots, checkpoints and a Cloudflare signalling service): Sci-2 widens the duel from exactly two players to a crew of 2, 3 or 4 online (host picks), allows starting with empty seats, replaces the partner status with a crew list, adds a SCIENCE station badge and a three-player playtest checklist, and (Part C, needs a service redeploy) lets a newcomer take an empty seat mid-run. Single player keeps two characters. It will become an implementation plan executed by fresh subagents, so every interface it names must exist or be explicitly new, and every rule must be unambiguous, deterministic and testable.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-18-sci-2-crew-of-four-design.md` at commit `2fededc0`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- Sci-1 `docs/superpowers/specs/2026-11-17-science-scans-design.md`, start aboard `docs/superpowers/specs/2026-11-17-start-aboard-design.md`, the networked duel `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md`, and the Net-3 specs (`docs/superpowers/specs/2026-11-14-net-3-internet-sessions-design.md`, `2026-11-15-net-3c-signalling-service-design.md`, `2026-11-15-net-3e-recovery-internet-design.md`) for rooms, seats, tokens and reconnects.
- `src/renderer/src/sim/duel/` (state, step, modules, snapshot, scripted), `src/renderer/src/authority/` (duelCheckpoint, duelRules, core), `src/renderer/src/clientControl/` (duelClient), `src/renderer/src/net/` (codec, contracts), `src/main/network/` (onlineDuel, onlineModes, hostProcess), `src/shared/roomSession.ts`, `services/signalling/src/` (room/auth.ts, room.ts, directory.ts), `src/renderer/src/app/duel/` (onlineDuel, onlineSource, runtime, controls), `src/renderer/src/render/duel/` (readoutModel, interiorModel), `src/renderer/src/ui/menu/` (HostForm, SessionPage), and `tests/`.
- The run dir `docs/superpowers/reviews/2026-11-18-sci-2-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. Two-player byte-identity: does widening per-player state to n keep the two-player flattened state, hash and snapshot identical (field names, counts, order)? Is a version-only bump with no MIGRATIONS entry correct per scripts/golden/duelOracle.ts, or does the oracle need an entry (e.g. if presence fields or header layout change)?
8. Every place the duel assumes two players: grep `DUEL_PLAYERS`, `0 | 1`, `[0, 1]`, `[boolean, boolean]`, `1 - helmPlayer`, `pid < 2`, `capacity !== 2`, `duelCodec(2)`, `playerCount: z.literal` across sim, authority, clientControl, net, main and app. Does the spec name them all or give a rule that finds them?
9. Online room flow: how the host creates the room (capacity), how seats/ready/start work today (src/shared/roomSession.ts, SessionPage.tsx, startAllowed), whether 'start with empty seats' is possible without a service change, and how an unclaimed seat's character becomes 'away' at start (who sends that presence, and is it deterministic on every replica?).
10. Part C late join: check services/signalling/src/room/auth.ts join rules and seat claiming; is the described change complete (seat assignment, roster, socket tickets, checkpoint/recovery), and is it truly independent of Parts A and B?
11. The readout crew list: rows needed for 4 crew vs READOUT_ROWS and the console layout; OtherStatus users (runtime, onlineSource); single player.
12. The scripted pair and gates stay two-player: any code path that would now build a crew of n for bots or gates?

## Reading manifest

- docs/superpowers/specs/2026-11-18-sci-2-crew-of-four-design.md (the subject, ~100 lines)
- src/renderer/src/sim/duel/state.ts, step.ts, modules.ts, snapshot.ts (whole files; grep scripted.ts for two-player bookkeeping)
- src/renderer/src/authority/duelCheckpoint.ts, duelRules.ts; src/renderer/src/clientControl/duelClient.ts; src/renderer/src/net/codec.ts (grep duelCodec, playerLimit)
- src/main/network/onlineDuel.ts, onlineModes.ts (grep capacity); src/shared/roomSession.ts
- services/signalling/src/room/auth.ts, room.ts (join), directory.ts (reserveRoom capacity)
- src/renderer/src/ui/menu/HostForm.tsx, SessionPage.tsx; src/renderer/src/ui/actions.ts (host)
- src/renderer/src/render/duel/readoutModel.ts, interiorModel.ts (badges); src/renderer/src/app/duel/runtime.ts, onlineSource.ts, onlineDuel.ts (grep otherStatus, seat, 0 | 1)
- scripts/golden/duelOracle.ts (MIGRATIONS, the version rule)

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
- Late join (Part C) changes the deployed signalling service and needs the owner's approval to redeploy.

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

- **P0**: the spec would break determinism, the two-player recorded runs or the online replica, or cannot be built as a whole.
- **P1**: an interface the spec relies on does not exist and is not declared new, a two-player assumption the spec misses that would break n > 2, a rule two implementers would build differently, a contradiction with the existing room/seat/presence flow, or an untestable acceptance criterion.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
