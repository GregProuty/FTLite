## Role
<!-- reuse -->

The subject is the implementation plan for R-1b of FTLite's engine refactor: the duel as a second mode. It runs after R-0 and R-1a and has four tasks:
1. **The sim module contract** (`SimModule` with fields read and write) and the duel moved onto it: space, presence, repair and the interior. It ends with a module completeness test.
2. **The duel snapshot codec.** Its header includes `mapHash`, `tick`, `playerCount` and `hash`. It stores the interior and tactical values, regenerates the map, grid, repair points and `Derived`, and validates before allocating anything.
3. **The duel rules, checkpoint and codec, and mode-aware replays.**
   - The duel telemetry accumulator is saved as versioned mode memory, and the end record is a `DuelEndSummary` with per-ship terminal-cause arrays.
   - `runModeReplay` replays any mode.
   - It ends with a continuation proof (N ticks, checkpoint, restore, M ticks, identical to an uninterrupted run), a duel replay re-run, and a size test (measured at 8.3 KiB against the 256 KiB `MAX_HOST_BYTES`).
4. **The duel as a registered Net-3 mode.**
   - The host stream binding moves out of `sectorStream.ts`, and a `duelStream` is added.
   - `duelMode` is registered in `src/utility/authorityHost.ts`.
   - It ends with round trips at the `hostRuntime` and utility level. The online duel UI is H-2, not R-1b.

R-1b must leave the sector game and Net-3 behaviour unchanged, as proved by the authority-boundary trace and the canonical trace. The duel golden must not change: the module-derived `flattenDuel` writes the same values in the same order.

Fresh subagents will execute it task by task, verbatim. The plan was prototyped and re-extracted task by task on top of R-0 and R-1a. Review it on its merits.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-16-engine-r1b-duel-mode.md` at commit `b4a7a2c`, worktree `C:/Users/djuar/FTLite`, branch `master`. Prerequisites: R-0 and R-1a (`docs/superpowers/plans/2026-11-16-engine-r0-guards.md`, `...-r1a-generic-authority.md`, both reviewed). Interfaces R-1b consumes from them are defined in those plans, not on master yet.
- The spec: `docs/superpowers/specs/2026-11-15-engine-refactor-design.md` §6. That covers the module contract, the rules hooks, the `tick` rule, `EndRecord`/`DuelEndSummary`, layout resolution, and the duel snapshot (header, stored, regenerated and excluded fields, validation, continuation proof, size). Also §3 (canonical order) and the R-1 row.
- The code: `src/renderer/src/sim/duel/{state,step,commands,hash,telemetry,scripted,tuning}.ts`, `src/renderer/src/sim/tactical/{state,hash,map,grid,duel}.ts`, `src/renderer/src/sim/{flatten,snapshot,canonicalFields}.ts`, `src/network/modes/{sector,sectorStream,sectorProducers,contracts}.ts`, `src/network/hostRuntime.ts`, `src/utility/{authorityHost,utilityHost}.ts`, `src/shared/netSession.ts`, `src/renderer/src/app/duel/runtime.ts` (the H-1 local runtime, which must keep working), `tests/duelGolden.test.ts`, `tests/duelGates.test.ts`.
- **Concurrency note:** another session edits netcode on master. Flag any R-1b step that would predictably conflict with it (`git log --oneline -15 -- src/network src/main/network src/utility`).
- The run dir `docs/superpowers/reviews/2026-11-16-engine-r1b-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. (Claude) **Duel snapshot correctness.**
   - Does the codec store everything that affects future ticks: the tactical random-number state, hunter state, grace timers, missile ages, the interior including doors and seats, presence, repair, and the telemetry accumulator in mode memory?
   - Is anything stored that should be regenerated, or regenerated that depends on history?
   - Is `mapHash` computed and checked as the spec says?
   - Is validation done before any allocation?
   - Would the continuation proof catch a missing field? Check that its N and M put a missile in flight, damage rooms and include a repair at the checkpoint tick.
6. (Claude) **The module contract.** Is `flattenDuel`'s order unchanged (the duel golden must not move)? Does the completeness test cover every duel module's fields, and does it bite?
7. (Claude) **Net-3 integration.**
   - Is moving the stream binding out of `sectorStream.ts` really behaviour-preserving for the sector, given the authority trace and the host-runtime gate?
   - Is `duelMode` registered without disturbing the sector's utility identity?
   - Are the round trips at `hostRuntime` level real (`checkpoint()` sync bytes and `captureCheckpoint`)?
8. (Claude) **H-1 compatibility.** The local duel runtime (`app/duel/runtime.ts`, `npm run dev:duel`) must still work. Does any change to duel commands (`runId`, the reason enum) or to duel state break it, and does the plan update it?
9. (Claude) **Tests that pass for the wrong reason.**

## Reading manifest

- `docs/superpowers/plans/2026-11-16-engine-r1b-duel-mode.md:L1-L2470` (Scope L23, Global Constraints L32, Decisions L45, File structure L62, Task 1 L87, Task 2 L550, Task 3 L784, Task 4 L1880, After L2463)
- the R-1a plan's Interfaces/Produces lines: `grep -n "Produces\|Consumes" docs/superpowers/plans/2026-11-16-engine-r1a-generic-authority.md`
- spec §6 duel-snapshot and EndRecord paragraphs: `grep -n "duel needs a snapshot\|EndRecord\|DuelEndSummary\|mapHash" docs/superpowers/specs/2026-11-15-engine-refactor-design.md`
- `src/renderer/src/sim/duel/{state,hash,telemetry}.ts`; `sim/tactical/{state,hash,map}.ts`
- `src/network/modes/sectorStream.ts`; `src/utility/authorityHost.ts`; `src/network/hostRuntime.ts:L40-L110`
- `src/renderer/src/app/duel/runtime.ts:L1-L80`
- `git log --oneline -15 -- src/network src/main/network src/utility`

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `node -e` arithmetic checks are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined engine refactor spec is the authority. R-1 is "over Net-3" only at the `hostRuntime` level; the online duel UI is H-2. PvP is out of scope.
- The refactor plugs into Net-3's mode layer, and sector and Net-3 behaviour must be unchanged.
- Determinism rules apply to the guarded roots.
- Commits by explicit path only; never checkout, restore, stash or clean in the main checkout (another session works there).

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
  - the plan is unexecutable as a whole;
  - it changes sector or Net-3 behaviour, the duel golden, or wire bytes;
  - it breaks determinism or the H-1 duel;
  - a duel restore can silently diverge.
- **P1**:
  - a task will fail at execution;
  - a spec requirement is missing or contradicted without saying so;
  - a proof is too weak to catch a real regression;
  - a test passes for the wrong reason.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
