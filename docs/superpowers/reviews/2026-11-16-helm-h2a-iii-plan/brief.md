## Role
<!-- reuse -->

FTLite is the owner's deterministic TypeScript/Electron/Pixi space game. The Helm demo is a two-character duel (Helm flies, Weapons shoots), playable as Single player on one machine; H-2 makes it a networked duel with one player per machine, the host's utility process as the authority and every renderer (the host's included) a stream client. H-2a, loopback and LAN, is split into three plans executed in order: i (rounds and the contracts, SIM_VERSION 39), ii (the headless online stack, proved over the loopback), iii (the application: main process, menu, renderer session, smokes). Fresh subagents will execute each plan task by task, verbatim; anything left to 'check at execution' is a defect. All three were prototyped together and re-extracted into fresh worktrees, which reproduced the prototype byte for byte with every gate passing. Review it on its merits.

The subject is plan iii. Two machines, one player each, fly the duel from the menu: Multiplayer > Host creates a two-seat duel room and shows its code, Join enters it, the host can Swap seats before Start. Every renderer is a stream client drawing the Single player screens from published state at 20 Hz. Rounds rematch with Enter; Escape pauses (and on the end card asks to leave); a lost partner pauses and a rejoin resumes. Each decided round writes a playtest record on each machine. The sector's online path stays behind a test-only entry (`FTLITE_SECTOR_ONLINE_TEST=1`), and a new two-process Electron smoke proves the duel through the real menu.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-16-helm-h2a-iii-online-app.md` at commit `22dfe97`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- **It executes after plans i and ii are merged.** Neither is on master yet; an interface plan iii consumes from them is verified against their text (`docs/superpowers/plans/2026-11-16-helm-h2a-i-rounds-and-contracts.md`, `docs/superpowers/plans/2026-11-16-helm-h2a-ii-online-stack.md`: their Interfaces blocks and code), and everything else against master.
- The spec: `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` §2 (L32-L62), §3 (L63-L118), §7 (L214-L293), §8 (L294-L330), §10 (L368-L435), §11 (L436-L445). The menu spec: `docs/superpowers/specs/2026-11-16-main-menu-kbm-design.md`.
- The code it changes: `src/main/network/onlineSession.ts`, `src/main/index.ts`, `src/shared/onlineSession.ts`, `src/preload/index.ts`, `src/renderer/src/render/sessionMenu.ts`, `src/renderer/src/render/duel/endScreen.ts`, `src/renderer/src/app/duel/{duelMode,runtime}.ts`, `src/renderer/src/main.ts`, `scripts/network/online-app-smoke.{cjs,ts}`, `scripts/network/online-recovery-smoke.ts`, and the tests listed in its File structure.
- The run dir `docs/superpowers/reviews/2026-11-16-helm-h2a-iii-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1. Every `replace:` block must occur exactly once in its file as it stands at that point of the plan.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. (Claude) **Security and the sector gate.** The sector forms must be refused unless an unpackaged build has `FTLITE_SECTOR_ONLINE_TEST=1`; `FTLITE_DUEL_TEST_SEED` must only work unpackaged. Is the new `duel:record` IPC channel validated (schema, 8 KiB cap, path built only from the local date, no renderer-controlled path)? Any new preload surface that widens what a page can do?
6. (Claude) **The online session.** Per spec §3/§7 and Decisions 7-9: presence sent first after every full-state ACK; held input every pump, quantised; commands gated by the confirmed replica; focus loss neutralises without pausing; the frozen "CONNECTION LOST" view; Escape/Enter on the end card; Leave. Find races between leave, re-attach, link close and the scene teardown (the menu work had a Leave race).
7. (Claude) **Single player.** It moves onto the shared scene and gains the rematch: does every H-1 mechanic (Tab between characters, M to the menu when paused or on the end card) still work, and are the duelRuntime/duelReadout test edits faithful rather than weakened?
8. (Claude) **The duel smoke.** Does it really prove the seven checks through the real menu? Is the forced-end seed (2277, decided at tick 1471 with no flight input) robust, or can ordinary timing jitter break it? Does it clean only its own temp roots and never kill Electron or workerd globally?
9. (Claude) **The test edits** in the sector session suites (Decision 2's stated deviation) change only action shapes and the flag, nothing they assert.

## Reading manifest

- `docs/superpowers/plans/2026-11-16-helm-h2a-iii-online-app.md`, whole: Scope L17, Global Constraints L26, Decisions L37, File structure L55, Task 1 L73, Task 2 L1643, Task 3 L2924, Task 4 L3384.
- Plans i and ii, for the interfaces they produce: their Decisions and each task's Interfaces block (grep `**Interfaces:**`).
- The spec sections listed above.
- `src/main/network/onlineSession.ts`, `src/shared/onlineSession.ts`, `src/preload/index.ts`, `src/renderer/src/render/sessionMenu.ts`, `src/renderer/src/app/duel/{duelMode,runtime}.ts`, `src/main/index.ts` (grep the IPC handlers), `scripts/network/online-app-smoke.cjs`.

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
