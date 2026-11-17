## Role
<!-- reuse -->

The subject is an implementation plan (Artemis-ii) that adds a set-and-forget Helm throttle to a deterministic fixed-tick duel sim: a new duel module and command, quarter-step thrust in flight physics, the scripted AI pair, a two-step SIM_VERSION bump with golden re-bless, and the app/UI input paths (local and online). Fresh subagents will execute each task verbatim, seeing only their task, so a consumed interface that does not exist with the assumed shape, code that will not compile, a test that cannot pass against the real helpers, or a bless step that the guard will refuse is a defect.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-17-artemis-ii-throttle.md` at commit `38f9d57c`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec: `docs/superpowers/specs/2026-11-17-artemis-consoles-design.md` §4.2, §5, §6, §8 (its SIM_VERSION numbers are stale; master is at 42, so the plan's 42→43 and MIGRATIONS[42] are correct).
- The Artemis-i code already merged (app/duel/input.ts, runtime.ts, onlineDuel.ts, onlineSource.ts, scene.ts, render/duel/consoleModel.ts, ui/duel/HelmStation.tsx, ui/actions.ts).
- The run dir `docs/superpowers/reviews/2026-11-17-artemis-ii-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. The step-1 bless: with admission able to set d.throttle but nothing reading it and no scripted run sending it, will the duel migration oracle (scripts/golden/duelOracle.ts, blessGuard.ts, bless-golden.ts) really see every run unchanged per tick with MIGRATIONS[42] adding /^helm\.throttle$/? Is the module order / flatten / snapshot offset change consistent (modules.ts, snapshot.ts, checkpoint code, duelModules test contract)?
6. Step-2: flyShip quarter quantisation leaves the hunter and the flight dev view bit-identical; the scripted pair change and telemetry rule; the plan's handling of pinned test numbers that change after the bless (is the procedure executable, not a placeholder?).
7. Online throttleSent bookkeeping against the real client API (client.command return value, takeResults shape, attach/new-round hooks in onlineDuel.ts).
8. W/S as press edges in the duel Helm view only: the flight dev view (flightMode.ts) and walking in the interior (held WASD moves the standing character) must keep working.

## Reading manifest

- docs/superpowers/plans/2026-11-17-artemis-ii-throttle.md:L1-L1530 (subject)
- docs/superpowers/specs/2026-11-17-artemis-consoles-design.md (§4.2, §5, §6, §8)
- src/renderer/src/sim/duel/modules.ts, state.ts, step.ts, snapshot.ts, scripted.ts, telemetry.ts, commands.ts; src/renderer/src/sim/tactical/physics.ts, state.ts, tuning.ts; src/renderer/src/sim/tuning.ts
- src/renderer/src/net/contracts.ts:L60-L100, src/renderer/src/net/codec.ts (duelWire)
- scripts/bless-golden.ts, scripts/golden/blessGuard.ts, scripts/golden/duelOracle.ts, and `git show --stat 702146bd 5044177f` (the last two-step bless) 
- src/renderer/src/app/duel/input.ts, runtime.ts, onlineDuel.ts, onlineSource.ts, scene.ts, flightMode.ts, controls.ts
- src/renderer/src/render/duel/consoleModel.ts, src/renderer/src/ui/duel/HelmStation.tsx, src/renderer/src/ui/actions.ts, src/renderer/src/render/duel/readoutModel.ts (readoutHelp)
- network/modes/duelStream.ts (the online client: command(), takeResults())
- tests/duelModules.test.ts, tests/duelSnapshot.test.ts, tests/duelCheckpoint.test.ts, tests/duelScripted.test.ts, tests/uiConsole.test.tsx, tests/onlineDuelSession.test.ts (harnesses)

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` are fine. Never run the test suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Layout only from Artemis; our amber CRT skin and m5x7 pixel text stay; no Artemis art copied.
- Panels are clickable, and every keyboard control keeps working.
- The Helm gets a set-and-forget throttle (a sim change); W/S nudge it; turning stays held on A/D and two mouse buttons.
- Weapons shows today's mechanics only (laser charge/fire, missile launch/magazine/steer, lock rooms); no new weapons.
- A top tab strip HELM / WEAPONS / SHIP, clickable where allowed.
- This is a first pass; the owner will tweak the look afterwards.
- The throttle is a sim change: SIM_VERSION 42 -> 43 in two steps (bump alone, then a same-version gameplay bless), as duel-fire, duel-health and disable-systems did.

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

- **P0**: the plan as a whole cannot be executed, or it would break determinism (an unblessable or unsound bless), the online duel, or keyboard play.
- **P1**: a task will fail at execution (tsc, a missing interface, a wrong signature, a test that cannot pass against the real helpers), a task contradicts the spec without saying so, or a case hit in ordinary play is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
