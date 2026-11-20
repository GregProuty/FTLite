## Role
<!-- reuse -->

The subject is a short design spec for FTLite's two-player duel: when the enemy ship is beyond the crew's sensor range, the crew's maps show a rough "blip" (a dotted circle redrawn every 2 s at a new guess) instead of today's exact last-seen ghost that fades away. It is drawing only: each client already holds the enemy's state and hides it, so the sim, the wire, the hash and the sim version must not change. It will become one small implementation plan executed by fresh subagents. It must be exact enough that two implementers would build the same thing, match the view code it describes, and leave every sim file untouched.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-19-sensors-blip-design.md` at commit `aa412784`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec it amends: `docs/superpowers/specs/2026-11-18-engineering-spike-design.md` §10.4 (the fog of war). Grep for "10.4".
- The source note: `docs/superpowers/research/2026-11-19-ryan-notes-v2.md` §5 (Sensors and fog of war).
- The code under `src/renderer/src/` on master.
- The run dir `docs/superpowers/reviews/2026-11-19-sensors-blip-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. **The ping rule (§2.3).** Is it exact: when a new ping is made (the first unseen frame, then each time `now` passes a multiple of the ping period), what "the ping's index" is and how the hash turns `epoch` and the index into two numbers in 0..1, what happens on the first unseen frame partway through a period, on a paused frame, when `now` jumps (a tab in the background), and when the enemy leaves and re-enters range within one period. Is `age` well defined for a ping made partway through a period?
8. **`stepFog` and its tracker (§2.1, §2.4).** Does `stepFog` have what the blip needs (the crew ship's position, the range, `now`, `epoch`), and is removing the enemy's ghost complete: every reader of `ghosts`, of `GhostKind` `'enemy'`, and of `seen.enemy` across `src/renderer/src` (the map model and layer, picking, the scene, the camera, effects and sounds, tests such as `tests/engineeringFog.test.ts`).
9. **Every place the unseen enemy is hidden or reported today.** The spec says several things stay unchanged (the contact window, the lock refusal, the situation line, picking, the camera, sparks and sounds, AUTO fire). Check each against the code, and look for any other reader that would now be wrong or would leak the exact position (the off-screen enemy arrow or edge marker, the minimap or grid dents for ships, the predicted-path contact test, the Science scan, the goal glow, the readout rows, the Valkyrn's Flight view, which the map model's comment says has no fog).
10. **The readout (§3).** How `render/duel/readoutModel.ts` gets its inputs today, whether it can be given the frame's fog view (or the ping's centre) without a sim change, in Single player and online, and whether "nearest 100" and the row text are exact.
11. **Drawing only.** Does anything in the spec need a sim, wire, hash or snapshot change after all? Is the view-side hash free of the sim's random source, and does the spec's "two clients need not agree" hold with how the fog is computed per client?
12. **Which maps.** §3 says "every console map that draws ghosts today (Helm, Weapons, Science, and the Valkyrn's Flight seat)". Check which views actually pass `fog` to the map model.

Controller's own low-confidence items:

13. Whether an enemy can be "active" yet absent in some round types (no enemy ship, the derelict-only start), and what `targetOf` returns then.
14. Whether `dashCircle` and a text glyph are available to the layer at the point the ghosts are drawn.

## Reading manifest

- `docs/superpowers/specs/2026-11-19-sensors-blip-design.md:L1-L129`: the subject, all of it.
- `docs/superpowers/research/2026-11-19-ryan-notes-v2.md:L112-L117`: the note.
- `docs/superpowers/specs/2026-11-18-engineering-spike-design.md`: grep for "10.4" and read that section.
- `src/renderer/src/render/tactical/fogModel.ts:L1-L44`: the fog tracker and `stepFog`.
- `src/renderer/src/sim/tactical/science.ts:L40-L65`: `sensorRange`, `pointSeen`, `shipSeen`, `contactSeen` (read only; the spec changes none).
- `src/renderer/src/render/tactical/tacticalModel.ts:L125-L190`, `src/renderer/src/render/tactical/tacticalModel.ts:L540-L665`: the model's fog input and draws, picking, the derelict mark, the ghosts.
- `src/renderer/src/render/tactical/tacticalLayer.ts:L236-L260`: the sensor ring and the ghosts' drawing.
- `src/renderer/src/render/tactical/weaponsModel.ts`: grep for `fog` (the enemy torpedo, rounds, the enemy arrow or goal).
- `src/renderer/src/render/duel/readoutModel.ts:L140-L187`: the OUTSIDE rows.
- `src/renderer/src/render/duel/contactModel.ts:L110-L130`, `src/renderer/src/render/duel/situationModel.ts`: grep for `NO CONTACT`, `CONTACT LOST`, `shipSeen`.
- `src/renderer/src/app/duel/scene.ts:L125-L165`, `src/renderer/src/app/duel/scene.ts:L240-L290`, `src/renderer/src/app/duel/scene.ts:L375-L440`: `fogEvents`, `stepFog`'s call, the camera's enemy framing, the models' inputs.
- `tests/engineeringFog.test.ts`, `tests/duelReadout.test.ts`: grep for `ghost`, `NO CONTACT`.

Read by range, not whole files. Do not explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are the tools. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- An enemy beyond sensor range shows as a rough blip, not nothing, and the blip never fades away for good.
- The blip is a circle with the enemy inside it when drawn; its radius starts about 150 u and grows with the distance beyond range to a cap of 600 u; it is redrawn every 2 s at a new guess and holds still in between.
- It hides heading, the enemy's torpedo and rounds; it cannot be clicked, locked or scanned; AUTO guns do not fire at it; a shot by hand is allowed.
- The readout reads `ENEMY  BLIP ~<n>` with the range rounded to the nearest 100.
- The enemy ship only: the derelict and the enemy's torpedo keep today's fading ghost.
- Drawing only: no sim, wire, hash or version change.
- The four judgement calls in the spec's §7.
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

- **P0**: the feature cannot be built as specified without a sim, wire or hash change, or it would leak the enemy's exact position in a way that defeats it.
- **P1**: a rule is ambiguous in a way two implementers would build differently, an interface the spec relies on does not exist on master in the shape assumed, a reader of the removed enemy ghost is missed and would break, an acceptance check is untestable, or a case hit in ordinary play is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
