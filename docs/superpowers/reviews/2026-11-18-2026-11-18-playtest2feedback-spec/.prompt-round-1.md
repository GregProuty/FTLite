## Role
<!-- reuse -->

The subject is a design spec for a spike: the Helm's flight in FTLite's two-player duel. It covers a held throttle that ramps, mouse steering with a gas-boosted turn, Newtonian flight for the crew ship, cold gas thrusters, and the Helm splitting its power between ENGINE and COMPRESSOR. It will become an implementation plan that fresh subagents execute task by task, and then deterministic sim code. That code must stay bit-identical on Node, Electron and Firefox, and it runs both locally and online with one authority. Any rule two implementers would build differently, and any interface the spec assumes but the codebase lacks, is a defect.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-18-playtest2feedback-design.md` at commit `f5acc6b8`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- Neighbouring specs it must stay consistent with:
  - `docs/superpowers/specs/2026-11-18-engineering-spike-design.md` §9-§10 (Engines bars and the throttle cap);
  - `docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md` §3-§4 (the manual torpedo flies like the Helm; `HeldInput` gains fields).
- Code under `src/renderer/src/`:
  - sim/duel: `throttle.ts`, `step.ts`, `modules.ts`, `scripted.ts`, `snapshot.ts`;
  - sim/tactical: `physics.ts`, `tuning.ts`, `defs.ts`;
  - net: `contracts.ts`, `codec.ts`;
  - app/duel: `input.ts`, `runtime.ts`, `onlineDuel.ts`;
  - ui: `ui/duel/HelmStation.tsx`.
- The run dir `docs/superpowers/reviews/2026-11-18-2026-11-18-playtest2feedback-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. **Thrust quantisation.** `flyShip` quantises thrust to quarters (physics.ts L31). Does the spec deal with a continuous per-mille throttle, and with `predictPath` sharing `flyShip`?
8. **One flight tuning for every ship.** `stepFlight` takes one `FlightTuning` for all ships (physics.ts L66-L67), and the stabilise/skid state lives on `Ship`. Is §2's per-slot `CREW_FLIGHT` specified well enough to build?
9. **The top speed cap (§2).** Is the "drop the component past 400" rule exact and deterministic, including the thruster push and the reverse thrust?
10. **Gas and the compressor (§4).** Ordering between venting and refill within a tick, the `rcsY`-first rule, the sixtieths accumulator, and the integer bounds for snapshot validation.
11. **Removing the `throttle` command.** Its consumers are scripted.ts L318-L320, runtime.ts L229-L345 and HelmStation. Does the spec cover everything the removal breaks, including the client-side prediction of `throttleBase` and the Valkyrn's `helmHoldsUnattended` path?
12. **The online path.** Held fields are optional with a default of 0. Ramp state comes from held input. Does a lost or late held frame on the online authority produce a sensible throttle?
13. **Mouse steering and the boost (§4a).** Reuses `HeldInput.aim`, `heldAim`, `aimTurn` and `helmTurn` (step.ts L90-L116) and the runtime's `steer` (runtime.ts L500-L510). Check the boosted turn's dead band against `aimTurn` and `headingTurn`, the new `Axes.turnBoost` against `flyShip`, and that the Valkyrn is unaffected.
14. **Consistency with Engineering §10.2.** That section caps the throttle by Engines bars, and the merge note says whichever spike merges second reconciles. Is the stand-in budget of 4 consistent with Engineering's start of 3 Engines bars?

## Reading manifest

- `docs/superpowers/specs/2026-11-18-playtest2feedback-design.md:L1-L307`: the subject, all of it.
- `docs/superpowers/specs/2026-11-18-engineering-spike-design.md:L294-L385`: Engineering amendments §9.1 and §10.1-§10.2.
- `docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md:L95-L150`: the manual torpedo and the held-input fields.
- `src/renderer/src/sim/tactical/physics.ts:L1-L70`: `flyShip`, `stepFlight`, stabilise, drag and thrust quantisation.
- `src/renderer/src/sim/tactical/tuning.ts:L30-L70`: `THRUST`, `REVERSE_FRACTION`, `DRAG`, `STABILISE`, `FlightTuning`, `ENGINE_FACTOR`.
- `src/renderer/src/sim/tactical/defs.ts:L80-L100`: ship class flight parameters.
- `src/renderer/src/sim/duel/throttle.ts:L1-L25`: throttle levels and `throttleThrust`.
- `src/renderer/src/sim/duel/modules.ts:L50-L80`: the helm module and its fields.
- `src/renderer/src/sim/duel/step.ts:L20-L40`, `src/renderer/src/sim/duel/step.ts:L86-L130`, `src/renderer/src/sim/duel/step.ts:L215-L302`: `DUEL_KINDS`, `helmTurn`, throttle/heading admission and the crew's axes.
- `src/renderer/src/sim/duel/scripted.ts:L95-L110`, `src/renderer/src/sim/duel/scripted.ts:L300-L330`: the scripted crew's throttle use.
- `src/renderer/src/sim/duel/snapshot.ts:L140-L160`: helm values in the snapshot.
- `src/renderer/src/net/contracts.ts:L30-L40`, `src/renderer/src/net/contracts.ts:L80-L100`: `HeldInput` and the duel commands.
- `src/renderer/src/net/codec.ts:L145-L155`: the held-input zod schema.
- `src/renderer/src/app/duel/input.ts:L55-L80`, `src/renderer/src/app/duel/input.ts:L195-L210`: `helmAxes`, `throttleRequest`, the wheel.
- `src/renderer/src/app/duel/runtime.ts:L200-L240`, `src/renderer/src/app/duel/runtime.ts:L310-L350`, `src/renderer/src/app/duel/runtime.ts:L490-L515`: sent axes, `throttleBase`, console commands, the held aim/steer.
- `src/renderer/src/ui/duel/HelmStation.tsx:L1-L73`: today's Helm console.

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and read-only `node -e` arithmetic are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Scope is the Helm only. The Weapons-control notes go to a later pew pew amendment.
- Crew ship: no drag and no stabilise. Gravity stays. The Hunter keeps its drag.
- The throttle ramps slowly while W/S is held and returns fast to 0 when released. The range is −25 % to +100 %.
- Cold gas thrusters push relative to the ship: A/D, Q/E and ←/→ port and starboard, ↑/↓ fore and aft. Holding a key gives a steady push, and a tank is refilled by a compressor.
- Holding the left mouse button steers the ship toward the cursor. A/D no longer turn the crew ship.
- Gas boosts turns: a turn with gas in the tank is faster and spends gas. Without gas, it runs at the normal rate.
- The Valkyrn keeps its own controls.
- The Helm splits its bars between ENGINE (each bar is 25 % of throttle cap) and COMPRESSOR (the refill rate), the way Weapons splits its bars. The stand-in budget is 4 until Engineering lands.
- Spike rules: nothing merges until the owner plays it.

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

- **P0**: the spike cannot be built as specified as a whole, or it would break determinism or the online authority.
- **P1**: a rule is ambiguous in a way two implementers would build differently, an interface the spec relies on doesn't exist in the shape assumed, an acceptance check is untestable, or a case hit in ordinary play is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
