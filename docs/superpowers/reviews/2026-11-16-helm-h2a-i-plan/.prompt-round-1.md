## Role
<!-- reuse -->

FTLite is the owner's deterministic TypeScript/Electron/Pixi space game. The Helm demo is a two-character duel (Helm flies, Weapons shoots), playable as Single player on one machine; H-2 makes it a networked duel with one player per machine, the host's utility process as the authority and every renderer (the host's included) a stream client. H-2a, loopback and LAN, is split into three plans executed in order: i (rounds and the contracts, SIM_VERSION 39), ii (the headless online stack, proved over the loopback), iii (the application: main process, menu, renderer session, smokes). Fresh subagents will execute each plan task by task, verbatim; anything left to 'check at execution' is a defect. All three were prototyped together and re-extracted into fresh worktrees, which reproduced the prototype byte for byte with every gate passing. Review it on its merits.

The subject is plan i. It makes the duel a series of rounds inside one authority run: a decided round is an end card that keeps ticking; `rematch` starts the next round in place on the next tick from the following round seed. A hashed `round` module carries `round`, `helmPlayer`, `baseTick`, `decidedTick`. It adds the `records` hook to the authority core, `DuelInit.helmPlayer`, the wire's `rematch`/`round` event/reasons, the widened summary, two bounded validation caches with an in-place `restoreDuelSnapshot`, and bumps SIM_VERSION 38 to 39 through the bless guard (baselines at 38 first, sector check version-only, duel oracle `MIGRATIONS[38]`), then adds a rematch golden with `--fresh`.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-16-helm-h2a-i-rounds-and-contracts.md` at commit `22dfe97`, worktree `C:/Users/djuar/FTLite`, branch `master`. It executes against master as it stands.
- The spec: `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` §2 (L32-L62), §4 (L119-L153), §5 (L154-L179), §7 (L214-L293), §8 (L294-L330), §11 (L436-L445).
- The code it changes: `src/renderer/src/sim/duel/` (snapshot, state, modules, step, telemetry, summary), `src/renderer/src/authority/` (rules, core, duelRules, duelCheckpoint, replay), `src/renderer/src/net/{contracts,codec}.ts`, `src/renderer/src/sim/{replay,tuning}.ts`, `src/network/modes/duel.ts`, `scripts/golden/duelOracle.ts`, `scripts/bless-golden.ts`, `scripts/determinism/bless.ts`.
- The run dir `docs/superpowers/reviews/2026-11-16-helm-h2a-i-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1. Every `replace:` block must occur exactly once in its file as it stands at that point of the plan.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. (Claude) **Rules and determinism.** Does round 1 of a fresh duel step exactly as today (the oracle's `MIGRATIONS[38]` must catch any change)? Is the next round's in-place build (`Object.assign` after disposing the interior) free of stale references, aliasing and ECS reuse? Is the tick-stamp audit (Decision 4) complete: could any other tick-stamped field make round n+1 differ from a fresh duel?
6. (Claude) **The end card.** Are the decided-step results (Decision 6) exactly the spec's §7 table, including the first-rematch-wins rule, away players, `stale-tick`, and the cue clearing? Can a decided round ever advance the sim or the accumulator?
7. (Claude) **The checkpoint validator and caches.** Can a forged or out-of-range round module (round, helmPlayer, baseTick, decidedTick) pass validation? Are the caches bounded, keyed soundly (Decision 9's object key), and unable to return a stale validity for a different seed or layout? Is `restoreDuelSnapshot` equivalent to a fresh load at every tick?
8. (Claude) **The bless sequence.** Are both baselines recorded at 38 before any sim change, the bump proved, and the rematch golden added alone with `--fresh` without re-blessing the others? Is the rematch golden read by the guard (`duelVersionFromText`)?
9. (Claude) **The widened summary and the wire** match spec §8 exactly; the codec's `ModeWire.events` hook keeps the sector's wire byte-identical.

## Reading manifest

- `docs/superpowers/plans/2026-11-16-helm-h2a-i-rounds-and-contracts.md`, whole: Scope L21, Global Constraints L31, Decisions L46, File structure L64, Task 1 L82, Task 2 L676, Task 3 L1226, Task 4 L2721, Task 5 L2978. Read the Decisions and each task's Interfaces first.
- The spec sections listed above.
- `src/renderer/src/sim/duel/{snapshot,state,modules,step,telemetry,summary}.ts`, `src/renderer/src/authority/{rules,core,duelRules,duelCheckpoint}.ts`, `src/renderer/src/net/codec.ts`, `scripts/golden/duelOracle.ts`, `scripts/bless-golden.ts`.

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
