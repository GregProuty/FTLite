## Role
<!-- reuse -->

The subject is a design spec for the Valkyrn, a second player ship in FTLite. FTLite is a deterministic TypeScript/Electron/Pixi game: a two-ship Hunter duel with a walkable FTL-style interior. The Valkyrn is the owner's solo test ship:
- the same duel, with every Hound feature, for one player;
- a combined Helm+Weapons "Flight" seat flown with the mouse;
- a fixed minigun with an Elite Dangerous-style lead pip.

The spec will become an implementation plan executed by fresh subagents. Treat each of these as a defect:
- any rule two implementers would build differently;
- any sim change that breaks determinism, replay or hash coverage;
- any interface the spec assumes but the codebase lacks.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md` at commit `c1c25e9f`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- It must conform to the Hound battlemap spec: `docs/superpowers/specs/2026-11-16-hound-battlemap-ship-design.md`.
- It builds after Sci-2 (crew of n online, SIM 51 -> 52): `docs/superpowers/specs/2026-11-18-sci-2-crew-of-four-design.md`.
- It builds on the feel and targeting specs:
  - `docs/superpowers/specs/2026-11-17-console-feel-design.md`
  - `docs/superpowers/specs/2026-11-18-feel-ii-design.md`
  - `docs/superpowers/specs/2026-11-17-ftl-targeting-design.md`
- Codebase areas:
  - `src/renderer/src/sim/tactical/` (defs, state, weapons, physics, missiles, hash)
  - `src/renderer/src/sim/duel/` (state, step, tuning, snapshot, hash)
  - `src/renderer/src/net/contracts.ts`
  - `src/renderer/src/app/duel/runtime.ts`
  - `src/renderer/src/render/battlemapModel.ts`
  - `src/renderer/src/sim/ship/hound.json`
- The run dir `docs/superpowers/reviews/2026-11-18-valkyrn-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. **The combined Flight seat (spec §5).**
   - Today `createDuel` rejects Navigation and Weapons in one console group, and the interior seats one occupant per station.
   - Does "sitting seats the character at both" fit the station/occupant model?
   - Is every "attended" check covered?
8. **The crew of one (spec §4.4).**
   - Today the duel state has `present: [boolean, boolean]`, two Recruits, and solo Tab logic in runtime.ts. Sci-2 makes n = 2..4.
   - Is extending to n = 1 specified enough: the health loss rule, revive, presence, Tab and the scripted crew?
9. **The minigun's sim state (spec §7).**
   - Check the pool, heat, wear counters, the Room-by-impact rule, and hash/snapshot coverage.
   - Check the online view rule (events derived from counters), even though the Valkyrn is single player only.
10. **Mouse aim (spec §6.2).** Check `aim` on the held input and how it interacts with `holdHeading`, A/D, auto-face and the "keeps the last bearing when standing" rule.
11. **The "no id literals" grep and the parity test (spec §3).** Are they implementable given existing code? Examples: `DUEL_REPAIR_POINTS` keyed by layout id, `battlemapModel` keyed by `hound`, the scripted crew.
12. **The developer laser switch (spec §8).** The class choice must be recorded in the duel's start data for replay.
13. **Tuning numbers** (heat, counters, class): check their arithmetic is internally consistent.

## Reading manifest

- `docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md:L1-L209`: the subject.
- `docs/superpowers/specs/2026-11-16-hound-battlemap-ship-design.md:L1-L83`: the Hound pattern the Valkyrn copies.
- `docs/superpowers/specs/2026-11-18-sci-2-crew-of-four-design.md:L1-L123`: crew of n.
- `src/renderer/src/sim/tactical/defs.ts:L1-L76`: ship classes and weapon defs.
- `src/renderer/src/sim/tactical/state.ts:L1-L242`: tactical state, systems and events.
- `src/renderer/src/sim/tactical/weapons.ts:L1-L162`: laser, torpedo and attended rules.
- `src/renderer/src/sim/tactical/tuning.ts:L1-L145`: numbers.
- `src/renderer/src/sim/duel/state.ts:L1-L98`: createDuel, the nav/weapons group check and `present`.
- `src/renderer/src/sim/duel/step.ts:L1-L273`: helmTurn, held input and attendance.
- `src/renderer/src/sim/duel/tuning.ts:L1-L42`: repair points by layout id.
- `src/renderer/src/net/contracts.ts:L25-L60`: HeldInput.
- `src/renderer/src/app/duel/runtime.ts:L240-L300`: solo presence and Tab.
- `src/renderer/src/render/battlemapModel.ts:L1-L40`: the Hound battlemap entry.
- `src/renderer/src/sim/ship/hound.json:L1-L231`: the Hound layout.

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` are fine. Never run the test suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Same game: the Hunter duel in the gravity-well map; not a new mode or waves.
- Mouse aim: the nose turns toward the cursor; W/S throttle; left mouse minigun, right mouse missile. Not keyboard turning.
- A walkable interior built from the 2-Minute Tabletop Valkyrn deck plan, like the Hound.
- A fixed minigun with a lead pip (no gimbal).
- Feature parity with the Hound (Science, Engineering, repair, fire, health, airlocks, enemy window, feel features, and future Hound features).
- Single player only for now; Multiplayer stays on the Hound.
- One combined Helm+Weapons seat on the Valkyrn.

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

- **P0**: the design cannot be built as written (a core rule contradicts the codebase or itself), or it would break determinism, replay or the Hound's existing behaviour.
- **P1**: a requirement two implementers would build differently, an interface the spec assumes that the codebase lacks without saying it must be added, a case hit in ordinary solo play left unhandled, or an untestable gate.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
