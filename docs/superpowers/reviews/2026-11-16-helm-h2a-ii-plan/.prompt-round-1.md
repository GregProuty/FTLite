## Role
<!-- reuse -->

FTLite is the owner's deterministic TypeScript/Electron/Pixi space game. The Helm demo is a two-character duel (Helm flies, Weapons shoots), playable as Single player on one machine; H-2 makes it a networked duel with one player per machine, the host's utility process as the authority and every renderer (the host's included) a stream client. H-2a, loopback and LAN, is split into three plans executed in order: i (rounds and the contracts, SIM_VERSION 39), ii (the headless online stack, proved over the loopback), iii (the application: main process, menu, renderer session, smokes). Fresh subagents will execute each plan task by task, verbatim; anything left to 'check at execution' is a defect. All three were prototyped together and re-extracted into fresh worktrees, which reproduced the prototype byte for byte with every gate passing. Review it on its merits.

The subject is plan ii. It makes the client stack mode-generic: a generic stream client (`createStreamClient`) with the sector's `createClientRun` rebuilt on it (signature and behaviour unchanged) and a duel stream client keeping a `DuelState` replica restored in place; a mode remote client with the sector's and duel's on it; a duel producer manager with an away steward (`presence {present:false}` for a seat with no human) and a peer-lost pause after that presence is applied; and a ten-seed loopback test of two remote duel clients flying the scripted pair at 20 Hz.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-16-helm-h2a-ii-online-stack.md` at commit `22dfe97`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- **It executes after plan i is merged.** Plan i (`docs/superpowers/plans/2026-11-16-helm-h2a-i-rounds-and-contracts.md`) is not on master yet; an interface plan ii consumes from plan i is verified against plan i's text (its Interfaces blocks and code), and everything else against master.
- The spec: `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` §3 (L63-L118), §4 (L119-L153), §6 (L180-L213), §10 (L368-L435), §11 (L436-L445).
- The code it changes: `src/renderer/src/clientControl/clientRun.ts` (replaced), `src/network/modes/{sectorStream,duelStream,encounterMode,duel}.ts`, `src/shared/hostProcessProtocol.ts`, `tests/networkBoundary.test.ts`.
- The run dir `docs/superpowers/reviews/2026-11-16-helm-h2a-ii-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1. Every `replace:` block must occur exactly once in its file as it stands at that point of the plan.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. (Claude) **Sector behaviour unchanged.** The sector's `createClientRun` and its remote client are replaced by wrappers over generic cores. Compare the old and new code line by line (order of replica, card reconcile, vote executions, watermarks, outbox, queueing; Decisions 1-2): could any ordering or held-sequence change alter what the sector sends or shows? Will the listed sector suites really pass unedited?
6. (Claude) **The steward and the peer-lost pause.** Per spec §6: the pause waits for the presence result; if already paused, presence is deferred and no pause; a rejected presence retries once then pauses; a later human clears the debt; a `'local'` or no-origin attachment never pauses. Find any path where a lost peer never pauses, pauses twice, or pauses before presence is applied, or where a reconnecting human races the steward.
7. (Claude) **The duel client.** Sequence allocation (Decision 4: never rewound, null when the outbox is full), one validation per publication (Decision 3): can an unvalidated snapshot ever reach `restoreDuelSnapshot`? Is the replica correct across reconnect and full-state resync, and across a rematch's round change?
8. (Claude) **The ten-seed test** proves what it claims (both replicas hash as the authority, journal replay, no `stale-tick`, round records match) and is not satisfied vacuously.

## Reading manifest

- `docs/superpowers/plans/2026-11-16-helm-h2a-ii-online-stack.md`, whole: Scope L17, Global Constraints L27, Decisions L38, File structure L51, Task 1 L69, Task 2 L577, Task 3 L1049, Task 4 L1580, Task 5 L1738.
- Plan i, for the interfaces it produces: its Decisions (L46-L62) and each task's Interfaces block (grep `**Interfaces:**`).
- The spec sections listed above.
- `src/renderer/src/clientControl/clientRun.ts` (whole), `src/network/modes/{sectorStream,duelStream,encounterMode,duel}.ts`, `src/shared/hostProcessProtocol.ts`.

Read by range, not whole files, except where a line above says whole. Do not explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are the only tools. Never run the test suite (it can hang).
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
  - the plan is unexecutable as a whole;
  - it changes a duel rule or sector behaviour the spec does not change;
  - it breaks determinism or a host/client hash agreement;
  - it lets a golden be re-blessed without proof;
  - it would destroy someone else's work.
- **P1**:
  - a task will fail at execution (compile, import, missing interface, wrong signature, a `replace:` block that does not occur exactly once);
  - a spec requirement is missing or contradicted without saying so;
  - a test passes for the wrong reason, or the risky path is untested;
  - a case hit in ordinary play (disconnect, rejoin, rematch, pause) is unhandled;
  - Single player (the H-1 duel) or the sector's online path breaks.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
