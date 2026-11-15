## Role
<!-- reuse -->

The subject is the design spec for H-1 of FTLite's Helm demo: the first playable screens (a dev flight view, the Helm and Weapons ship-centred tactical map views drawn with Pixi, the FTL-style Cutter interior when a character stands up, and a solo duel where one person Tabs between two characters), run by a local renderer-side runtime until the authority's duel mode lands. It will next become implementation plans (H-1a flight, H-1b duel) executed by subagents against this TypeScript/Electron/Pixi 8 codebase. The standard: every section must turn into tasks without guessing, every claim about existing code (renderer, input, tick driver, interior layers, duel and tactical sims) must match the source, and it must stay consistent with the parent spec and the owner's grill answers.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-14-helm-h1-views-design.md` at commit `aff9bf3`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The parent spec it must conform to: `docs/superpowers/specs/2026-11-14-helm-demo-design.md` (§6 flight and feel targets, §7 weapons and keys, §8 interior, §10 console map views and camera, §11a solo playtesting, §12 look, §15 milestones), and the binding owner answers `docs/vision/thesis-grill.md` Q11 to Q27.
- The code it builds on: `src/renderer/src/main.ts`, `render/renderer.ts`, `render/worldFit.ts`, `render/letterbox.ts`, the interior layers (`render/tiles.ts`, `effects.ts`, `roomIcons.ts`, `consoleLayer.ts`, `crewSprites.ts`, `boarderLayer.ts`, `memory.ts`), `render/theme.ts`, `render/panel.ts`, `input/sources.ts`, `input/deviceManager.ts`, `app/session.ts`, `app/localRuntime.ts`, `authority/tickDriver.ts`, `src/main/index.ts`, `package.json`; the sims `sim/duel/*` and `sim/tactical/*`; the boundary test `tests/boundary.test.ts` and `tests/helpers/determinismGuard.ts`.
- The run dir `docs/superpowers/reviews/2026-11-14-helm-h1-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. (Claude) **The key map (§5):** conflicts between contexts (E means sit, repair and next-lock; Q, X, C), whether every duel command and every parent §7 key has a binding, whether the E-press sit rule ("when no repair target is in reach") is well defined, and Tab presence semantics against parent §11a and the duel step's away rules (away players cannot sit or stand).
8. (Claude) **The local runtime (§4):** reuse of `createTickDriver`, interpolation, pause versus presence, restart and disposal, and that replacing it with the loopback authority in H-0c-ii is not blocked by any design choice here.
9. (Claude) **The interior view (§8):** whether the existing interior layers can really be composed outside `createRenderer` as described, and what sector-only state they read.
10. (Claude) **The tactical view (§6, §7):** camera numbers against parent §10a, the predicted-path and missile-path rules, grid labelling, contour computation, allocation-free drawing, and whether the model/layer split is specified well enough to test.
11. (Claude) **Scope and milestones (§11, §12):** is the H-1a/H-1b split coherent, and are the acceptance checks observable without a human?

## Reading manifest

- `docs/superpowers/specs/2026-11-14-helm-h1-views-design.md:L1-L156` the subject (§3 L26, §4 L37, §5 L52, §6 L82, §7 L91, §8 L108, §9 L121, §10 L125, §11 L132, §12 L141)
- `docs/superpowers/specs/2026-11-14-helm-demo-design.md:L115-L170` parent §6 and §7 (flight, feel targets, weapons, keys); `L207-L265` parent §10 to §12; `L297-L320` parent §15/§16
- `docs/vision/thesis-grill.md:L250-L300` Q24 to Q27
- `src/renderer/src/main.ts:L1-L61`; `render/renderer.ts:L1-L110`; `render/worldFit.ts`; `render/letterbox.ts`
- `src/renderer/src/input/sources.ts:L1-L80`; `input/deviceManager.ts:L1-L80`
- `src/renderer/src/app/localRuntime.ts:L1-L120`; `authority/tickDriver.ts:L1-L60`
- the interior layer constructors: `render/tiles.ts`, `effects.ts`, `roomIcons.ts`, `consoleLayer.ts`, `crewSprites.ts`, `boarderLayer.ts` (heads: signatures and what they read)
- `src/main/index.ts:L1-L60`; `package.json:L1-L25`
- `src/renderer/src/sim/duel/step.ts`, `state.ts`, `commands.ts`; `sim/tactical/predict.ts`, `physics.ts:L1-L40`, `missiles.ts`
- `tests/helpers/determinismGuard.ts` (what the boundary test rejects and where)

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `node -e` arithmetic checks are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The parent spec and grill Q11 to Q27 bind: two consoles with ship-centred minimal vector map views (Q25, Q26); standing up shows the FTL-style interior and players walk to repair (Q27); solo playtesting by switching stations with Tab until Net-3 (Q24); a large zoomable map with a follow camera, pan and snap back (Q23 to Q23c).
- Standing order: decisions not settled by the owner are taken as Claude's recommendation and marked (rec.); the spec's (rec.) choices are fair game for findings, but do not ask for an owner decision.
- The duel's authority mode (H-0c-ii) waits for Codex's Net-3; H-1 must not touch `authority/` or `net/contracts.ts`.
- Determinism rules apply to the guarded roots (sim, authority, net, clientControl, events, shared); render/app/input code is outside them.

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

- **P0**: the design cannot be built as written, violates a binding owner answer, or would break the sector game.
- **P1**: a plan writer would have to guess (an ambiguous rule, a key conflict, a false claim about the code, a contradiction with the parent spec), or a state hit in ordinary play is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
