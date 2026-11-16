## Role
<!-- reuse -->

The subject is the implementation plan for R-1a of FTLite's engine refactor: the generic authority. It does three things:
1. **The rules interface and the generic core.** It introduces `EncounterRules` and `sectorRules`, and turns the 616-line authority core and `createAuthority` into a generic core and authority over the rules. The ledger takes the mode's message codec. Replays become mode-aware (absent `mode` = sector), and the `ended` event carries a tagged `EndRecord` with the sector variant only.
2. **One command union and result type.** The duel reasons join the `COMMAND_REASONS` enum, and the duel envelope gains `runId`.
3. **The mode factory.** `defineEncounterMode` builds Net-3 `ModeDefinition`/`ModeHost`s, and `modes/sector.ts` becomes one call to it.

R-1a must be **behaviour-preserving for the sector game and for Net-3**:
- the sector goldens, replays (V2/V3/V4) and determinism fixture are byte-identical;
- the Net-3 host-runtime gate passes;
- the online/IPC paths are unchanged.

Fresh subagents will execute it task by task, verbatim. The plan was prototyped and re-extracted task by task on top of the reviewed R-0 plan. Review it on its merits.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-16-engine-r1a-generic-authority.md` at commit `e5aa9cc`, worktree `C:/Users/djuar/FTLite`, branch `master`. It runs after R-0 (`docs/superpowers/plans/2026-11-16-engine-r0-guards.md`, already reviewed).
- The spec: `docs/superpowers/specs/2026-11-15-engine-refactor-design.md` §6 (modules, `EncounterRules`, the lifecycle, commands, the duel snapshot, R-1 acceptance) and the R-1 row of §12.
- The merged code it rewrites:
  - `src/renderer/src/authority/{authority,core,ledger,checkpoint,replay}.ts`, `src/renderer/src/sim/replay.ts`;
  - `src/renderer/src/net/{contracts,codec,receivePolicy}.ts`, `src/renderer/src/clientControl/{commandOutbox,clientRun}.ts`;
  - `src/network/modes/{contracts,registry,sector,sectorStream,sectorProducers}.ts`, `src/network/hostRuntime.ts`;
  - `src/utility/{authorityHost,utilityHost}.ts`;
  - `src/renderer/src/sim/duel/commands.ts`;
  - `build/contentDigest.ts`, `tests/boundary.test.ts`, and the network boundary test (find it).
- **Concurrency note:** another session is actively reviewing and editing netcode on master (commits `refine(netcode-claude): …`). Flag any R-1a step that will predictably conflict with files that session touches. Check `git log --oneline -15 -- src/renderer/src/authority src/network src/main/network`.
- The run dir `docs/superpowers/reviews/2026-11-15-engine-r1a-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. (Claude) **Behaviour preservation.** Compare the plan's generic `core.ts` against master's line by line for behaviour:
   - admission and the ledger, the input-tick window, held input;
   - the session lease gate (bootstrap pause, fence, `resetPausedEpoch`);
   - checkpoint capture and cadence, safe points, crash records;
   - segment rotation, the watchdog and seal;
   - publication and the reliable/unreliable choice;
   - results routed to their owner, callouts, cues, the ended event;
   - disposal.

   Anything changed beyond renaming through the rules hooks is a P0 or P1.
6. (Claude) **Wire compatibility.**
   - Do the codec changes (one `CommandResult`, the enlarged reasons enum, the `EndRecord` wrapper, the `mode` field in replays, `runId` on the duel envelope) keep every byte the sector and Net-3 produce today identical?
   - The tagged `EndRecord` changes the `ended` event's shape: is the online client (`clientRun`, renderer online session) updated, and is room compatibility via the content digest handled?
7. (Claude) **Determinism and boundaries.** The new files' placement against `tests/boundary.test.ts` and the network boundary test; no banned Math or APIs in guarded roots.
8. (Claude) **Tests that pass for the wrong reason,** especially any test that compares the generic core only against itself instead of against master's behaviour or the goldens.

## Reading manifest

- `docs/superpowers/plans/2026-11-16-engine-r1a-generic-authority.md:L1-L4390` (Scope L23, Global Constraints L30, Decisions L43, File structure L59, Task 1 L83, Task 2 L2369, Task 3 L4044, After L4376). Read the Decisions and Task interfaces first, then the code blocks for core, ledger, codec, replay and the mode factory.
- `docs/superpowers/specs/2026-11-15-engine-refactor-design.md` §6 (`grep -n "## 6"`) and the R-1 row
- `src/renderer/src/authority/core.ts` (master; compare with the plan's version); `authority/authority.ts`; `authority/ledger.ts`; `authority/replay.ts`
- `src/renderer/src/net/codec.ts`; `net/contracts.ts`
- `src/network/modes/sector.ts`; `src/network/modes/contracts.ts`; `src/network/hostRuntime.ts:L40-L110`
- `git log --oneline -15 -- src/renderer/src/authority src/network src/main/network`

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
- The refactor plugs into Net-3's mode layer and does not replace it; the sector game and Net-3 behaviour must be unchanged.
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
  - it changes sector or Net-3 behaviour or wire bytes;
  - it breaks determinism;
  - it would destroy someone else's work.
- **P1**:
  - a task will fail at execution;
  - a spec requirement is missing or contradicted without saying so;
  - a behaviour-preservation proof is too weak to catch a real regression;
  - a test passes for the wrong reason.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
