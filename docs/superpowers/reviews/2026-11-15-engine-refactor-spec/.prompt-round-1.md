## Role
<!-- reuse -->

The subject is the design spec for FTLite's engine refactor. FTLite is the owner's custom-engine co-op space game, moving toward "Outlaw Crew": mini-game consoles, an open world, outlaw careers, 1 to 16 players including PvP. The spec restructures one-ship-per-run `SimState` into layers:
- Campaign;
- Session;
- an Encounter holding N `ShipState`s and a shared `Space`.

On top of that it adds:
- a per-ship crew table with controllers;
- one combat model, in which the tactical layer and the interiors share one systems record per ship;
- a generic authority over `EncounterRules`, plugged into Net-3's `ModeDefinition`/`ModeHost` layer;
- module-derived flatten and hash;
- telemetry out of the hash;
- a versioned campaign save;
- per-crew state projections for PvP;
- content and tool seams.

It is staged as milestones R-0 to R-8. It will next become implementation plans executed by subagents. Nothing is built until Codex's Net-3 branch merges.

The standard:
- every section must turn into tasks without guessing;
- every claim about existing code must match the source on master or on `codex/net-3` (read-only);
- the staging must keep the game shippable at every step, with each refactor provably behaviour-preserving where it claims to be;
- it must stay consistent with the owner's binding grill answers.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-15-engine-refactor-design.md` at commit `470b515`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- Binding owner answers: `docs/vision/thesis-grill.md` Q28 to Q31 (and Q11 to Q27); the direction `docs/superpowers/specs/2026-11-13-outlaw-crew-direction.md`.
- Code on master: `src/renderer/src/sim/{state,step,components,canonicalFields,flatten,snapshot,hash}.ts`, `sim/tactical/*`, `sim/duel/*`, `sim/ship/schema.ts`, `net/contracts.ts`, `authority/{authority,core,ledger}.ts`, `build/contentDigest.ts`, `scripts/bless-golden.ts`, `tests/golden.test.ts`.
- Net-3 as built, read-only through `git show codex/net-3:<path>`: `src/network/modes/{contracts,registry,sector}.ts`, `src/network/state/{imageCodec,sender,receiver}.ts`, `src/network/hostRuntime.ts`, `src/renderer/src/authority/{core,ledger}.ts` on that branch. Do not check out or modify the branch.
- Branch `hash-completeness` (unmerged, read with `git show hash-completeness:<path>`): `tests/simStateCompleteness.test.ts` and `NOT_SNAPSHOTTED` in `src/renderer/src/sim/canonicalFields.ts`. It found no unhashed SimState fields today.
- The run dir `docs/superpowers/reviews/2026-11-15-engine-refactor-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. (Claude) **Fit with Net-3 as built.**
   - Does `EncounterRules` sit correctly inside `ModeDefinition`/`ModeHost` (start/restore from bytes, attach, checkpoint, pause)?
   - Do partitions and per-crew projections fit `StateImage` (`values` Float64Array + `metadata`) and the delta sender (equal-length baseline)?
   - Does anything in §6 or §10 contradict how Net-3's ledger, input-tick window or admission policy work?
8. (Claude) **Staging and proofs.**
   - Is each R-milestone independently shippable?
   - Are the "golden-neutral" and "unchanged" claims (R-2, R-3) achievable?
   - Is the §9 named-field equivalence proof sound and buildable? Consider field moves, the stable-id and crew-table change, and bitECS retirement.
   - Does R-1 (the generic authority) really leave the sector goldens unchanged?
9. (Claude) **Determinism.** Module-derived canonical order; the missile pool; N-ship arrays; moving crew rows between ships while preserving stable ids; per-ship random streams. Is the canonical order defined so it can't drift?
10. (Claude) **PvP projections.** Is "no rival interior or random-number state without lock-on" enforceable as specified? What do projections do to the per-tick hash and desync checks: a client can't verify a hash of state it doesn't receive?
11. (Claude) **Scope and order.** Is anything missing for 16 players, PvP or ship transfers (Q28 to Q30)? Is anything over-built against the spec's own non-goals? Is the milestone order right given that H-2 (the networked duel playtest) waits on R-1 and R-2?

## Reading manifest

- `docs/superpowers/specs/2026-11-15-engine-refactor-design.md:L1-L239` the subject (§1 L11, §2 L34, §3 L54, §4 L70, §5 L82, §6 L99, §7 L139, §8 L147, §9 L160, §10 L171, §11 L183, §12 L200, §13 L223, §14 L230)
- `docs/vision/thesis-grill.md` from `## Q27` to the end (Q27 to Q31)
- `src/renderer/src/sim/state.ts:L1-L170`; `sim/step.ts:L25-L70`; `sim/canonicalFields.ts:L1-L80`; `sim/flatten.ts:L40-L90`; `sim/snapshot.ts:L85-L130`
- `src/renderer/src/sim/tactical/state.ts:L1-L130`; `sim/duel/{state,step,hash}.ts`
- `src/renderer/src/authority/authority.ts:L1-L80`; `authority/core.ts:L1-L60, L120-L260`
- `git show codex/net-3:src/network/modes/contracts.ts`, `:src/network/modes/sector.ts | head -90`, `:src/network/state/imageCodec.ts | head -60`, `:src/network/state/sender.ts | head -60`
- `git show hash-completeness:tests/simStateCompleteness.test.ts | head -60`

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `node -e` arithmetic checks are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Grill Q28 to Q31 bind:
  - 16 players means one capital ship or several ships, including PvP;
  - the gravity-well fight is the combat, with an FTL lock-on view of a target;
  - players can move between ships;
  - a tiered process with the owner's playtest as the gameplay gate.
- Nothing is built until Net-3 merges. The refactor plugs into Net-3's mode layer and does not replace it.
- Non-goals in spec §2 are deliberate: no general ECS, plugin loader or scripting; no continuously simulated galaxy; no lockstep or host migration; no variable-length hashed lists; no tick-snapshot migrations; no 16-seat arrays; no porting the legacy sector run.
- (rec.) choices were taken under the owner's standing order and may be questioned only with evidence of a defect. Do not ask for an owner decision.

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
  - the design cannot be built as written;
  - it violates a binding owner answer;
  - it contradicts Net-3 as built in a way that forces Net-3 to be redone;
  - it claims a behaviour-preserving step that cannot be proved.
- **P1**: a plan writer would have to guess (an ambiguous rule, a false claim about the code, a contradiction), or a milestone cannot be shipped or verified on its own.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
