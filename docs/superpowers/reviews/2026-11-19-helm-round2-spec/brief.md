## Role
<!-- reuse -->

The subject is a design spec, Helm round 2, for FTLite's two-player duel: the crew ship's (the Hound's, `cutter` class, `newtonianHelm`) Helm station after a playtester's second round of notes and the owner's calls. It changes the held throttle (it stays where it is left; a tap of S cuts it; reverse 50 %; a faster ramp), brings drag and auto-stabilise back for the Hound, fixes the turn rate, turns the free cold gas thrusters into a charge that refills, removes the right-click heading hold and Space auto-face from the player's Helm, and adds a Settings value, hints and HUD marks. It will be turned into one implementation plan and executed task by task by fresh subagents. It must be exact enough that two implementers would build the same thing, it must match the code it describes, and it must keep the sim deterministic, the online authority in charge, and the Hunter and the Valkyrn bit-identical.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-19-helm-round2-design.md` at commit `8670f6ce`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec it amends: `docs/superpowers/specs/2026-11-18-playtest2feedback-design.md` (§2 flight, §3 throttle, §4 and §4a cold gas and the boosted turn, §5 the power split the owner later removed, §6 hints, §7 the wire and step order), and the owner's later decisions recorded in the code comments ("owner 2026-11-19").
- The source notes: `docs/superpowers/research/2026-11-19-ryan-notes-v2.md` (§1 and §3).
- The code under `src/renderer/src/` on master (the spec quotes master at eaf84426; no Helm file has changed since). Note the spec's §10: it will be built after another feature (W-4, on branch `w4-weapons-controls`) merges, and W-4 touches `scripted.ts`, `step.ts`, `input.ts`, `runtime.ts` and `onlineDuel.ts` for the Weapons seat. Judge this spec against master.
- The run dir `docs/superpowers/reviews/2026-11-19-helm-round2-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. **The throttle and the cut (§2).** `rampThrottle`, `rampTicks`, `crewThrust`, `throttleFloor`, `throttleCap` and `THR_MIN` / `THR_RAMP` / `THR_RETURN` in `sim/duel/helmFlight.ts` and `sim/duel/tuning.ts`; every reader of `THR_MIN`, `THR_RETURN` and `thrMille` (the step, `crewAxes`, snapshot validation, the scripted crew, telemetry, the console's throttle bar, the online prediction); whether a per-class `reverseFraction` exists on the class def as §2.2 assumes and what else reads `REVERSE_FRACTION`; the `throttleCut` command's admission against how `step.ts` admits Helm commands today (`throttle`, `heading`); the latch `thrCut`: is its set and clear rule complete (attended, unattended, a seat change, a new round, a pause), and does the stated reason (a late held frame after the cut) match how the authority applies held frames and commands.
8. **The tap (§2.3, §6.3).** Can `app/duel/input.ts` time a key press as described (what clock it has, how keydown, repeat and keyup reach it, the stale-key rule at a sit, `clear` and `clearUi`)? Where does the runtime see "the throttle when the key went down" in Single player and online? What happens with W and S both down, with a press shorter than one frame, and with a blur or a pause mid-press?
9. **Drag and stabilise (§3.1).** `flyShip`'s drag branch and `idle` expression in `sim/tactical/physics.ts`; `FlightTuning` and every literal of it (`CREW_FLIGHT`, `DEFAULT_FLIGHT`, test configurations); `flightFor`; the claim that every other ship's arithmetic is unchanged; the predicted path (`sim/tactical/predict.ts`) and anything that assumed the Hound has no drag or a 400 u/s cap (`MAX_SPEED`, the SLINGSHOT tag, the scripted Helm's `CREW_SPEED_SLACK`, tests).
10. **The fixed turn (§3.2).** Is the list of removed things and their readers complete (grep `turnBoost`, `boosted`, `RCS_TURN_BOOST`, `BOOST_FAR`, `BOOST_FACE_SIN`, `helmBoost`, and `HelmVent`'s members across `src`)? Is "a multiply by 1 is exact, so every other ship is unchanged" true for the Valkyrn's and the Hunter's heading step as written in `flyShip`?
11. **The gas charge (§3.3).** Is the spend / refill rule complete and deterministic (order of the two axes, opposite keys cancelling in the input, the refill delay, an empty charge with a key held, unattended)? Does `crewAxes` have what it needs to predict it? Where do the PORT / STBD buttons and the thruster keys enter, and can the `NO GAS` refusal be raised once per press there?
12. **What leaves the player's Helm (§4).** How the right button and Space reach the crew Helm today (`scene.ts`, `runtime.ts`, `onlineDuel.ts`, `HelmStation.tsx`), what else depends on them (the first-play goal glow, the refusal texts, the heading preview, the camera's pan exemption), and whether keeping `face` and `heading` in the sim for the bots and the other Helm is consistent with removing them from the app.
13. **The scripted Helm and the gates (§5).** Is "send `throttleCut` when it wants no thrust" buildable from `scripted.ts` (how the Helm branch emits held input and commands), does every command it would send pass admission, and is the gate rule concrete enough to plan?
14. **State, hash, snapshot and wire (§8).** Where `thrMille` lives in the duel module and snapshot validation, and whether the three new fields and the new command are fully placed (module fields, bounds, the codec, `DUEL_KINDS`, the authority's rules, checkpoints and replay schemas, `tests/duelModules.test.ts`).
15. **The fences.** Does anything here change the Hunter's or the Valkyrn's hashed values or behaviour (`RCS_THRUST` doubling, `HelmVent`, `Axes`, `FlightTuning`, `reverseFraction`, the removed constants)?
16. **Online (§7).** The local throttle prediction in `app/duel/onlineSource.ts` with the new ramp and the sent cut; what the seat shows between the cut being sent and its result; a refused cut.

Controller's own low-confidence items:

17. The claim that the Engines refusal for W / S is unchanged (§2.3) was not traced through `runtime.ts`.
18. §3.1's top-speed numbers (800 u/s at full throttle, 520 at 65 %) are thrust divided by drag, not measured.
19. §6.1 and §6.4's texts (the hint lines, the four-line sit card) were not measured against the console and the card.
20. §8 says the Valkyrn identity digests hash only the tactical state; check what `tests/valkyrnIdentity.test.ts` hashes and whether the Valkyrn's duel also carries the new `DuelState` fields in any pinned value.
21. Whether a seated but inactive Helm character in Single player counts as attended in `crewHelm` (§2.1, §3.3).

## Reading manifest

- `docs/superpowers/specs/2026-11-19-helm-round2-design.md:L1-L316`: the subject, all of it.
- `docs/superpowers/research/2026-11-19-ryan-notes-v2.md:L30-L76`: the notes' §3 Helm (and §1 at L20-L28).
- `docs/superpowers/specs/2026-11-18-playtest2feedback-design.md`: grep for §2 to §7 as needed.
- `src/renderer/src/sim/duel/helmFlight.ts:L1-L51`: the throttle's pure rules, `HelmVent`.
- `src/renderer/src/sim/duel/tuning.ts:L55-L75`: `THR_*`, `BOOST_FACE_SIN`.
- `src/renderer/src/sim/duel/step.ts:L120-L215`, `src/renderer/src/sim/duel/step.ts:L355-L400`, `src/renderer/src/sim/duel/step.ts:L440-L486`: `helmTurn`, `helmBoost`, `crewAxes`, `crewHelm`, the Helm commands' admission, the tick order.
- `src/renderer/src/sim/duel/state.ts:L60-L135`, `src/renderer/src/sim/duel/modules.ts:L55-L90`, `src/renderer/src/sim/duel/snapshot.ts:L170-L195`: `DuelState`, the duel module's fields, snapshot validation.
- `src/renderer/src/sim/tactical/physics.ts:L1-L115`: `flyShip`, `flightFor`, `shipEngineFactor`.
- `src/renderer/src/sim/tactical/tuning.ts:L55-L75`, `src/renderer/src/sim/tactical/tuning.ts:L185-L202`: `THRUST`, `REVERSE_FRACTION`, `DRAG`, `STABILISE`, `DEFAULT_FLIGHT`, `MAX_SPEED`, `RCS_*`, `BOOST_FAR`, `CREW_FLIGHT`.
- `src/renderer/src/sim/tactical/defs.ts:L100-L147`: the class defs (`reverseFraction`, `newtonianHelm`).
- `src/renderer/src/sim/tactical/state.ts`: grep for `Axes`, `FlightTuning`, `skidBudget`.
- `src/renderer/src/sim/tactical/predict.ts:L1-L45`: the predicted path.
- `src/renderer/src/sim/duel/scripted.ts:L30-L160`, `src/renderer/src/sim/duel/scripted.ts:L375-L424`: the scripted Helm (`helmAxes`, its constants, the Helm branch).
- `src/renderer/src/sim/duel/telemetry.ts:L125-L145`: the Helm activity term.
- `src/renderer/src/net/contracts.ts:L30-L120`, `src/renderer/src/net/codec.ts`: `HeldInput`, the duel commands and schemas (grep `throttle`, `heading`).
- `src/renderer/src/authority/`: grep for `throttle` and `heading` in `duelRules.ts`, `core.ts`, `checkpoint.ts`, `duelCheckpoint.ts`, `replay.ts`.
- `src/renderer/src/app/duel/input.ts:L1-L60`, `src/renderer/src/app/duel/input.ts:L115-L215`: the key tables, the handler, `KeySample`, the stale-key rule.
- `src/renderer/src/app/duel/runtime.ts:L395-L485`, `src/renderer/src/app/duel/runtime.ts:L570-L643`: the sit, the crew Helm branch, the held frame.
- `src/renderer/src/app/duel/onlineDuel.ts`: grep for `crewHelmSeat`, `heading`, `face`, `throttleHeld`, `sessionHeld`.
- `src/renderer/src/app/duel/onlineSource.ts:L130-L218`: `thrMille` prediction.
- `src/renderer/src/app/duel/scene.ts:L240-L420`: the map pointer (the right button, the steer), the goal glow.
- `src/renderer/src/ui/duel/HelmStation.tsx:L1-L126`: `CrewHelmStation`.
- `src/renderer/src/render/tactical/tacticalModel.ts:L395-L460`, `src/renderer/src/render/tactical/tacticalLayer.ts:L310-L335`: the puffs, the predicted path, the velocity line.
- `src/renderer/src/app/duel/duelAudio.ts`: grep for `boosted`.
- `src/renderer/src/render/duel/sitModel.ts:L1-L40`, `src/renderer/src/app/controlsList.ts:L1-L98`: the sit card and the controls list.
- `src/renderer/src/app/settingsStore.ts:L1-L42`, `src/renderer/src/ui/menu/Settings.tsx`: Settings and its page.
- `tests/`: grep for `THR_RETURN`, `THR_MIN`, `turnBoost`, `helmBoost`, `CREW_FLIGHT`, `RCS_THRUST` to see what pins today's rules; `tests/valkyrnIdentity.test.ts:L1-L60`.

Read by range, not whole files. Do not explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are the tools. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The six calls in the spec's §1: A and D turn the ship; drag and auto-stabilise come back for the Hound; a fixed turn rate with no boost; the cold gas is a shared charge that refills after the keys come up; the right-click heading hold and Space auto-face leave the player's Helm; the throttle stays, a tap of S cuts it, reverse is 50 %, 0 to full in about 1 s.
- The nine judgement calls in the spec's §11 (the owner approved them): an unattended Helm keeps its throttle; a tap is judged against the throttle at keydown; the latch; drag 0.15 and stabilise 80; stabilise acts under thrust; the gas numbers and no refill while a key is held; the AUTO-FACE button goes; the bots keep auto-face; built after W-4.
- The tap time is a Settings value (150 / 200 / 250 / 300 ms, default 200) and the tap is detected in the app.
- Q / E and the arrows are the thrusters.
- The Hunter and the Valkyrn stay bit-identical.
- The numbers are starting values; do not propose retuning them.

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

- **P0**: the feature cannot be built as specified as a whole, or it would break determinism, the online authority, or the Hunter/Valkyrn bit-identity.
- **P1**: a rule is ambiguous in a way two implementers would build differently, an interface the spec relies on does not exist on master in the shape assumed, a reader of something the spec removes or changes is missed and would break, an acceptance check is untestable, or a case hit in ordinary play is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
