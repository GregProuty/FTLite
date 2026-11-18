## Role
<!-- reuse -->

The subject is a design spec for an "own ship window" on the FTLite duel consoles (Helm, Weapons, Science, Flight): a small FTL-style window, top left, drawing the crew's own ship interior (rooms, fire, damage, crew dots, hull, shields) to mirror the existing enemy contact window on the right. It will become an implementation plan that fresh subagents execute task by task, then TypeScript/React code in an Electron + web game. Anything an implementer would have to guess, or any interface the spec names that the code does not have with that shape, is a defect.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-18-own-ship-window-design.md` at commit `7808ab16`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The pattern it copies: the enemy ship window spec `docs/superpowers/specs/2026-11-17-enemy-ship-window-design.md` and its code (manifest).
- Codebase: `src/renderer/src/render/duel/`, `src/renderer/src/ui/duel/`, `src/renderer/src/app/duel/scene.ts`, `src/renderer/src/render/tactical/`, `src/renderer/src/sim/duel/`.
- The run dir `docs/superpowers/reviews/2026-11-18-own-ship-window-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. Layout fit: does OWN_SHIP (x = STATUS.x + STATUS.w + EDGE, y 42, 240x170) actually clear the status table, TABS, the station blocks, FLIGHT, SIDE and CONTACT, and does it sit over anything else drawn on consoles (the top status sentence at y 12, the Weapons info line at y 44, `infoBand` in scene.ts, SitCard, Banners, TargetingLine)?
8. Online play: does every input the model needs (d.interior.derived.roomTiles, d.points, crew positions, tactical systems) exist on an online client's DuelState, and is the state-diff fire flash right there?
9. The arrow slide rule (spec §3): is it implementable on edgePoint / the tactical view input as described, and does it cover arrows at the window's corner?
10. Fit math: interior grid size source (derived.width and height), fractional tile sizes and crispEdges, and whether crewHealthMarks positions (TILE_PX ship pixels) map correctly into the box.
11. Whether reusing roomLook (whose CREW_LOOKS are tuned for the map's 3-room hull) reads correctly on interior room tiles, and whether a damaged room's "damage" polygon is well defined for non-rectangular rooms.

## Reading manifest

- `docs/superpowers/specs/2026-11-18-own-ship-window-design.md:L1-L125`: the subject.
- `src/renderer/src/render/duel/consoleLayout.ts:L1-L41`: all console rects and reserves.
- `src/renderer/src/render/duel/contactModel.ts:L1-L193`: the contact window's model (roomLook use, hatch, fit).
- `src/renderer/src/ui/duel/ContactWindow.tsx:L1-L161`: the component to copy.
- `src/renderer/src/ui/duel/DuelUi.tsx:L1-L60`: screen composition.
- `src/renderer/src/ui/views.ts:L1-L27`: DuelUiView.
- `src/renderer/src/render/duel/interiorModel.ts:L1-L88`: tile to px, crewHealthMarks, interiorOverlay.
- `src/renderer/src/render/tactical/crtTheme.ts:L1-L40`: CRT ramp, blink, roomLook.
- `src/renderer/src/sim/duel/fire.ts:L1-L63`: pointBurning, extinguishProgress.
- `src/renderer/src/sim/duel/state.ts:L1-L80`: DuelState, points, events.
- `src/renderer/src/render/duel/readoutModel.ts:L100-L140`: hull alert rule and fire rows.
- `src/renderer/src/app/duel/scene.ts:L160-L309`: per-frame build, reserves, contactModel call.
- `src/renderer/src/render/tactical/tacticalModel.ts:L110-L130` and `:L250-L262`: tactical view input and edgePoint.
- `src/renderer/src/audio/interiorSounds.ts:L1-L60`: the state-diff ignited count the flash mirrors.
- `src/renderer/src/render/duel/sitModel.ts:L40-L60`: frameZoom reserves.

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The drawing is the real interior shrunk (every room), not the 3-room hull silhouette.
- Own ship window on the LEFT (top left, right of the status table); enemy window on the RIGHT, unchanged in size.
- Small windows, styled like the enemy contact window (amber CRT).
- Shown on Helm, Weapons, Science and Flight consoles; not on the SHIP tab.
- No sim change (SIM_VERSION and golden unchanged).

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

- **P0**: the design cannot work as a whole (e.g. the data it needs does not exist on the client, or the window cannot fit the screen without breaking an existing console).
- **P1**: an interface the spec names does not exist with that shape, a requirement two implementers would build differently, a contradiction, or an ordinary-play case (online client, Flight seat, reset, no contact open) left unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
