## Role
<!-- reuse -->

The subject is the implementation of R-1a of FTLite's engine refactor, the generic authority. It is on branch `engine-r1a` and has three parts:
1. **The generic authority.** It adds:
   - `EncounterRules` and `sectorRules`;
   - a generic core and `createEncounterAuthority`, with `createAuthority` delegating to it;
   - the mode's message codec in the ledger;
   - mode-aware replays;
   - a tagged `EndRecord` (sector variant only).
2. **One command union and result type.** The duel's reasons are appended to `COMMAND_REASONS`, and the duel aliases become the shared types.
3. **The mode factory.** `defineEncounterMode` is added in `src/network/modes/encounterMode.ts`, and `sector.ts` becomes one call to it.

The sector game and Net-3 must behave exactly as before. The implementers verified that:
- the full suite passes, except a known worktree-only flake;
- the canonical trace and a pre-refactor authority-boundary trace are unchanged (both recorded on master before any change);
- the Net-3 host-runtime gate passes;
- cross-engine determinism passes.

The work was built from the reviewed plan `docs/superpowers/plans/2026-11-16-engine-r1a-generic-authority.md`. Review it on its merits.

## What to review

- THE SUBJECT: the diff `8755199...HEAD` on branch `engine-r1a`, worktree `C:/Users/djuar/FTLite/.worktrees/engine-r1a`. The pre-refactor code is `git show 8755199:<path>`.
- The plan: `docs/superpowers/plans/2026-11-16-engine-r1a-generic-authority.md`. Its Decisions at L45-L58 are binding.
- The spec: `docs/superpowers/specs/2026-11-15-engine-refactor-design.md` §6 and the R-1 row of §12.
- The run dir: `docs/superpowers/reviews/2026-11-16-engine-r1a-impl/`.

## What to check, in priority order

1. **Correctness against the plan.** Does the code do what the plan's Decisions say? Cite both.
2. **Bugs.** Wrong logic, missed branches, crashes on inputs the code accepts.
3. **Tests.** Do the tests exercise the changed paths, and would they fail if the code were wrong?
4. **Boundaries.** Determinism rules for guarded roots (`tests/boundary.test.ts`), and the network boundary (`tests/networkBoundary.test.ts`).
5. (Claude) **Behaviour preservation of the generic core.** Compare `src/renderer/src/authority/core.ts` against `git show 8755199:src/renderer/src/authority/core.ts`. Cover:
   - admission, the ledger, the input-tick window, held input;
   - the lease gate;
   - checkpoints and safe points, crash records;
   - segment rotation, the watchdog and seal;
   - publication;
   - result routing, callouts, cues, the ended event;
   - disposal.
6. (Claude) **The factory.** Does `defineEncounterMode` reproduce master's `src/network/modes/sector.ts` exactly? Cover ownership, payload limits, producers, `checkpoint()` and `captureCheckpoint`, start and restore, error messages, and utility identity.
7. (Claude) **Wire compatibility.** The intended changes are the `ended` event's mode tag and the appended reasons. Are all other sector and Net-3 bytes unchanged? Is every reader of `ended` updated (`clientRun`, the renderer online session, `app/session.ts`)?
8. (Claude) **Readiness for a second mode.** Does any sector-specific assumption remain in the generic core, ledger, replays or factory that would break the duel in R-1b? Cover typing holes such as `codecFor<S>` not tying `S` to the wire's snapshot header, and unchecked casts.
9. (Claude) **Proof gaps.** The authority trace has no scenario reaching `ended`. Is that a real gap given the unit tests?

## Reading manifest

- `git diff --stat 8755199...HEAD`
- `src/renderer/src/authority/{core,authority,rules,sectorRules,ledger,replay}.ts` and `git show 8755199:src/renderer/src/authority/core.ts`
- `src/network/modes/{encounterMode,sector}.ts` and `git show 8755199:src/network/modes/sector.ts`
- `src/renderer/src/net/{contracts,codec}.ts` (diff only)
- `scripts/golden/authority-trace.ts`
- `git diff 8755199...HEAD -- tests` (which existing tests changed)
- plan L45-L58 (Decisions)

Read by range (`sed -n`), not whole files, except the authority and mode files listed above. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `node -e` arithmetic checks are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined engine refactor spec and the reviewed R-1a plan are the authority. The refactor plugs into Net-3's mode layer and does not replace it. PvP is out of scope. The online duel UI is H-2.
- The sector and Net-3 behaviour must be unchanged. Generated goldens and fixtures are not written.
- Never checkout, restore, stash or clean in the main checkout. Commits are made by explicit path only.

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
  - sector or Net-3 behaviour or wire bytes changed beyond the intended tag and reasons;
  - determinism broken;
  - someone else's work destroyed.
- **P1**:
  - a bug in a changed path;
  - a plan Decision is not met;
  - an existing caller is broken;
  - a proof too weak to catch a real regression;
  - a test passing for the wrong reason;
  - a defect that will break R-1b's second mode.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
