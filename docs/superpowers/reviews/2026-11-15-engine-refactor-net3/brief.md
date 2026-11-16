## Role
<!-- reuse -->

The subject is FTLite's engine refactor spec, now corrected against the networking layer (Net-3) as it was actually merged to master at `a5b772f`. The spec was already refined over 5 rounds before the merge, from a read-only look at the unmerged branch. A post-merge review then found 12 places where it misdescribed the merged code. Those were corrected in commit `cdbb842`, and in the same commit the owner put PvP out of scope for now.

The corrected areas: §6 (the generic authority lifecycle, `EncounterRules` hooks, the mode command codec feeding the ledger, the duel snapshot codec as an R-1 deliverable, R-1 "over Net-3" scoped to the `hostRuntime` level), §10 (sender model, image metadata, event filtering, checkpoints and re-host, seats, zero-body bindings, bots, history segments; R-6 and projections deferred with PvP), R-0 (a `SIM_VERSION` bump to 37), and risk 0 (version skew).

R-0 and R-1 will next become an implementation plan executed by subagents. The standard: R-0 and R-1 must be specifiable without guessing, and every claim about the merged code must match master `a5b772f`.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-15-engine-refactor-design.md` at commit `cdbb842`, worktree `C:/Users/djuar/FTLite`, branch `master`. **Focus on the corrected parts:** §6 (L116-L201), §10 (L248-L293), the R-0 and R-1 rows of §12 (L311-L334), §13 risk 0, and the change log. The rest was refined before; only flag it if it now contradicts the corrected parts.
- The merged code:
  - `src/network/modes/{contracts,registry,sector,sectorStream,sectorProducers}.ts`;
  - `src/network/hostRuntime.ts`, `src/network/state/{imageCodec,sender,receiver}.ts`;
  - `src/utility/{authorityHost,utilityHost}.ts`, `src/shared/{netSession,hostProcessProtocol,roomSession}.ts`;
  - `src/main/network/{onlineSession,onlineSector,seatStore}.ts`;
  - `src/renderer/src/authority/{authority,core,ledger,checkpoint,replay}.ts`;
  - `src/renderer/src/net/{contracts,codec,receivePolicy}.ts`, `src/renderer/src/clientControl/commandOutbox.ts`;
  - `src/renderer/src/sim/duel/{state,step,commands,hash}.ts`, `src/renderer/src/sim/tactical/state.ts`;
  - `build/contentDigest.ts`.
- The parked branch `hash-completeness` (read with `git show hash-completeness:<path>`). It merges cleanly onto master.
- Binding owner answers: `docs/vision/thesis-grill.md` Q28 to Q31, including the 2026-11-15 amendment putting PvP out of scope.
- The run dir `docs/superpowers/reviews/2026-11-15-engine-refactor-net3/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. (Claude) **§6 against the merged code.**
   - Does the `EncounterRules` interface cover every call `authority/core.ts` makes into sector code? Look for any it misses.
   - Is the stated `createEncounterAuthority` surface and its deps exactly the merged `Authority` (`authority/authority.ts`)?
   - Is the `ModeHost` lifecycle described as `contracts.ts` defines it?
   - Is the ledger change (mode-injected command codec, results keeping `admission` and `already-processed`) buildable without breaking `commandOutbox` or the replay V2/V3/V4 semantics?
8. (Claude) **R-0 and R-1 scope and proof.**
   - Is the R-0 bump to SIM 37 compatible with the guarded version-only re-bless?
   - Is R-1's acceptance (start → captureCheckpoint → restore round trips at the `hostRuntime` level; the duel registered in `authorityHost.ts`; sector goldens byte-identical) achievable and observable?
   - Is the duel snapshot codec specified enough to plan, given the duel has no serialisation today and the 256 KiB `MAX_HOST_BYTES` limit?
9. (Claude) **PvP deferral.** Is everything PvP-only clearly marked as not built? Does anything still in scope (R-0 to R-5, R-7, R-8) depend on deferred R-6 pieces?

## Reading manifest

- `docs/superpowers/specs/2026-11-15-engine-refactor-design.md:L1-L362` (focus L116-L201, L248-L293, L311-L343, L351-L362)
- `git diff 737026b cdbb842 -- docs/superpowers/specs/2026-11-15-engine-refactor-design.md` (exactly what changed since the last converged review)
- `src/network/modes/contracts.ts`; `src/network/modes/sector.ts:L1-L100`; `src/network/modes/sectorStream.ts:L1-L130`; `src/network/hostRuntime.ts:L40-L110`
- `src/renderer/src/authority/authority.ts:L1-L80`; `authority/core.ts:L30-L130, L150-L300, L400-L470, L490-L616`; `authority/ledger.ts:L1-L60, L100-L180`; `authority/checkpoint.ts:L1-L70`
- `src/renderer/src/net/codec.ts:L50-L80`; `src/renderer/src/clientControl/commandOutbox.ts:L30-L66`
- `src/utility/authorityHost.ts`; `src/utility/utilityHost.ts:L40-L90`; `src/shared/netSession.ts:L1-L20`
- `src/renderer/src/sim/duel/{state,commands,hash}.ts`; `src/renderer/src/sim/tactical/state.ts:L90-L130`

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `node -e` arithmetic checks are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Grill Q28 to Q31 bind, with the 2026-11-15 amendment: PvP is out of scope for now; several ships and a capital ship stay in scope as co-op. Q29: the gravity-well fight with an FTL lock-on view. Q30: players move between ships. Q31: a tiered process.
- The refactor plugs into Net-3's mode layer and does not replace it. The online duel UI and session belong to H-2, not R-1.
- The spec's §2 non-goals are deliberate.
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
  - R-0 or R-1 cannot be built as written against the merged code;
  - the spec misdescribes a merged interface in a way that would break Net-3;
  - it violates a binding owner answer.
- **P1**: a plan writer would have to guess (an ambiguous rule, a false claim about the merged code, a contradiction), or an R-0/R-1 acceptance criterion cannot be observed.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
