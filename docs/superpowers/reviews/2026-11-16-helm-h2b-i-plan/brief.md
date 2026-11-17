## Role
<!-- reuse -->

FTLite is the owner's deterministic TypeScript/Electron/Pixi space game, keyboard and mouse only. The Helm demo is a two-character duel; H-2a (merged, master 0903ed5 and later) made it a networked duel over loopback and LAN with one player per machine, rounds and rematches (SIM 39), per-round playtest records and a two-process duel smoke. H-2b adds the internet path, the playtest report and latency measurement, in two plans executed in order: i (telemetry and report) and ii (the internet candidate). Fresh subagents execute each plan task by task, verbatim; anything left to 'check at execution' is a defect. Both were prototyped and re-extracted into a fresh worktree from master ca06a62, reproducing the prototype byte for byte with every gate passing (some after load reruns). The deployed signalling service is still SIM 35; the redeploy and every real internet or two-machine run are owner-only. Review it on its merits.

The subject is plan i: the hidden RTC window labels the route lan/internet from the selected ICE candidate pair and sends it with the RTT once a second; main answers `online:link-stats`, the preload exposes `online.linkStats()`; the guest's records get `transport` and `rttMs`; an F3 latency overlay (online only, its own module); Single player writes `session: 'solo'` records; `scripts/duel-playtest-report.ts` and a "Helm demo" section in docs/gates.md; the duel smoke checks the labels, saves F3 screenshots and copies both machines' records for the report.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-16-helm-h2b-i-telemetry-report.md` at commit `f81d9b1`, worktree `C:/Users/djuar/FTLite`, branch `master`. It executes against master as it stands.
- The spec: `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` section 8 (L294-L330), section 9 (L331-L367), section 10 (L368-L435), section 11 (L436-L445). The Helm demo spec's section 16 rule: `docs/superpowers/specs/2026-11-14-helm-demo-design.md` (grep `4 of 5`).
- The H-2a-iii plan's deferrals: `docs/superpowers/plans/2026-11-16-helm-h2a-iii-online-app.md` Decisions 5, 6, 14 and "After H-2a-iii".
- The code it changes: the hidden RTC window and transport files Task 1 names, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/app/duel/{onlineDuel,runtime,duelMode}.ts`, `src/renderer/src/net/duelRecord.ts`, `scripts/network/duel-app-smoke.ts`, `docs/gates.md`.
- The run dir `docs/superpowers/reviews/2026-11-16-helm-h2b-i-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1. Every `replace:` block must occur exactly once in its file as it stands at that point of the plan.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. (Claude) **Privacy.** Records, the report, logs and screenshots must never contain tokens, codes, addresses or ICE candidates (spec section 8). Does the link-stats path carry only a label and an RTT? Is the peer-reflexive rule (a private address -> lan) computed without exporting the address?
6. (Claude) **The new IPC channel** (`online:link-stats`) and preload method: sender checks, shape validation, no widening of the page's powers.
7. (Claude) **The report.** Does it print the section 16 rule verbatim and evaluate it as the spec says (three sessions each with at least 4 of 5 yes, one non-owner pair; median round 3-5 min; both outcomes; laser and missiles above 0 every round; planet under 30 s extra; latency table and fallback checks)? Is the rooms-not-room-seed deviation sound: can two rooms be merged or one split?
8. (Claude) **F3 and solo records.** Live median/p95 correct; solo records don't change Single player's behaviour; the overlay's move to React (for UI-ii) is plausible.

## Reading manifest

- `docs/superpowers/plans/2026-11-16-helm-h2b-i-telemetry-report.md`, whole: Scope L26, Global Constraints L36, Decisions L54, File structure L99, Task 1 L116, Task 2 L792, Task 3 L1469, Task 4 L1873, Task 5 L1988. Read the Decisions and each task's Interfaces first.
- The spec sections listed above.
- `src/renderer/src/net/duelRecord.ts`, `src/renderer/src/app/duel/onlineDuel.ts`, `src/main/network/duelRecords.ts`, the transport window files Task 1 names, `src/preload/index.ts`.

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
  - it changes a duel rule, a hash, or sector behaviour;
  - it leaks a secret (TURN credentials, tokens, codes, addresses or ICE candidates) into a record, report, log, screenshot or tracked file;
  - it would deploy, push or destroy someone else's work.
- **P1**:
  - a task will fail at execution (compile, import, missing interface, wrong signature, a `replace:` block that does not occur exactly once);
  - a spec requirement is missing or contradicted without saying so;
  - a test or smoke passes for the wrong reason, or the report computes the section 16 evaluation wrongly;
  - a new IPC/preload surface lacks validation;
  - Single player or the online duel breaks.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
