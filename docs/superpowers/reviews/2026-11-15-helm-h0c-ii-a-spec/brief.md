## Role
<!-- reuse -->

The subject is the design spec for H-0c-ii-a of FTLite's Helm demo: the headless gates. It covers four things:
- a deterministic scripted Helm and gunner pair that duels the hunter and walks to repairs;
- per-duel telemetry, with repair events added to the duel step;
- the parent spec §16 telemetry gates over seeds 1 to 10, with the tuning that meets them;
- the duel golden replay, and the single `SIM_VERSION` bump with sector goldens re-blessed for the version number only.

It splits off from H-0c-ii because the duel's authority wiring waits for Codex's Net-3; this part does not. It will next become an implementation plan executed by subagents against this TypeScript codebase. The standard:
- every section must turn into tasks without guessing;
- every claim about existing code (duel step, tactical sim, hunter, goldens, determinism guard, RNG helpers, any pathfinder) must match the source;
- it must stay consistent with the parent spec and the owner's grill answers.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-15-helm-h0c-ii-a-headless-gates-design.md` at commit `2b0c188`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The parent spec: `docs/superpowers/specs/2026-11-14-helm-demo-design.md`: §8 interior and repair, §9 hunter, §13 architecture (scripted pair, telemetry, versioning), §15 milestones, §16 acceptance. Also the binding owner answers in `docs/vision/thesis-grill.md` Q11 to Q27.
- The code it builds on:
  - `src/renderer/src/sim/duel/{state,step,commands,tuning,hash}.ts`;
  - `src/renderer/src/sim/tactical/{state,duel,weapons,missiles,hunter,predict,tuning,hash}.ts`;
  - `src/renderer/src/sim/tuning.ts` (`SIM_VERSION`) and `sim/flatten.ts`;
  - the sim RNG helpers and any interior pathfinding used by sector bots or headless playtests (grep `src/renderer/src/sim` and `src/renderer/src/headless`);
  - `tests/golden.test.ts`, `tests/replayV2.test.ts`, `tests/golden/`, `tests/helpers/determinismGuard.ts`, `tests/boundary.test.ts`.
- The run dir `docs/superpowers/reviews/2026-11-15-helm-h0c-ii-a-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. (Claude) **The split:** is everything in H-0c-ii-a truly buildable without Net-3, i.e. without touching `authority/`, `net/contracts.ts` or the command union? Does the `SIM_VERSION` bump and re-bless plan conflict with anything the sector goldens or the boundary tests require?
8. (Claude) **The scripted pair:**
   - whether it can live under `sim/duel/` and obey the determinism guard;
   - whether a seeded RNG helper exists to give it its own stream;
   - whether the sim has an interior pathfinder to reuse;
   - whether its repair behaviour (stand, walk, hold Interact, walk back, sit) is achievable with today's duel step rules (away/present, seat phase before presence, repair reach);
   - whether its rules are specified well enough to be deterministic and reviewable.
9. (Claude) **Telemetry and the repair events:**
   - is every telemetry item derivable from state diffs and events as described (the "bait" definition, "Weapons had nothing to do")?
   - does adding `d.events` change hashing, the golden or behaviour?
10. (Claude) **The gates:**
    - are the §16 gates transcribed exactly?
    - is the test runtime rule workable?
    - is the tuning scope (game numbers before the pair's numbers) clear, and does the plan have what it needs to justify each changed number?
11. (Claude) **Versioning:** the bump and re-bless procedure against how the existing golden tests and `flatten.ts` work, and the Net-3 conflict note.

## Reading manifest

- `docs/superpowers/specs/2026-11-15-helm-h0c-ii-a-headless-gates-design.md:L1-L100` the subject (§1 L5, §2 L20, §3 L27, §4 L45, §5 L62, §6 L74, §7 L81, §8 L91)
- `docs/superpowers/specs/2026-11-14-helm-demo-design.md:L170-L206` parent §8 and §9; `L267-L287` §13; `L298-L320` §15 and §16
- `src/renderer/src/sim/duel/step.ts`, `state.ts`, `tuning.ts`, `hash.ts`
- `src/renderer/src/sim/tactical/state.ts:L1-L90`, `duel.ts`, `hunter.ts`, `tuning.ts`
- `src/renderer/src/sim/tuning.ts:L1-L20`; `src/renderer/src/sim/flatten.ts` (head)
- `grep -rn "createRng\|function bfs\|pathTo\|findPath" src/renderer/src/sim src/renderer/src/headless | head`
- `tests/golden.test.ts` (head), `tests/replayV2.test.ts` (head), `ls tests/golden`
- `tests/helpers/determinismGuard.ts`

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `node -e` arithmetic checks are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The parent spec and grill Q11 to Q27 bind. That includes the §16 gates (median 3 to 5 min, both outcomes, both weapons every duel, no planet-contact end under 30 s, same-seed hash and golden). The scripted pair is for tests only and never a seat (Q15). Repair is by walking (Q27).
- Standing order: decisions the owner has not settled are taken as Claude's recommendation and marked (rec.). The spec's (rec.) choices are fair game for findings, but do not ask for an owner decision.
- The duel's authority mode (H-0c-ii-b) waits for Codex's Net-3. H-0c-ii-a must not touch `authority/` or `net/contracts.ts`.
- Determinism rules apply to the guarded roots (sim, authority, net, clientControl, events, shared).

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

- **P0**: the design cannot be built as written, violates a binding owner answer, needs Net-3 or an authority/contracts change, or would break the sector game or its goldens beyond the version number.
- **P1**: a plan writer would have to guess (an ambiguous rule, a false claim about the code, a contradiction with the parent spec), or a gate or telemetry item is not computable as described.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
