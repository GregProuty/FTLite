## Role
<!-- reuse -->

The subject is an implementation plan (UI-ii of FTLite's React UI layer) that fresh subagents will execute task by task. Each subagent sees only its own task's text. So any interface the plan consumes that does not exist with the assumed shape, any code that would not compile or whose test would not pass as written, and any step left to "figure out at execution" is a defect. The plan moves the duel's and the flight view's screen-space Pixi panels (readout, end card, pause banners, online notice, tactical zoom/scale/snap-hint overlay, feel panel) to React on a new "pixel stage". It must keep the same rectangles, glyphs and tints, change no sim or network behaviour, and keep every Electron smoke passing unchanged.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-16-ui-ii-react-duel-ui.md` at commit `25a22b9`, worktree `C:\Users\djuar\FTLite`, branch `master`.
- The spec it implements: `docs/superpowers/specs/2026-11-16-react-ui-layer-design.md` (§1, §2, §3, §4, §6, §8, §9).
- The code it builds on:
  - UI-i, merged on master: `src/renderer/src/ui/` (`menuState.ts`, `store.ts`, `actions.ts`, `context.tsx`, `RegionBoundary.tsx`, `UiRoot.tsx`, `mount.tsx`, `useNow.ts`, `menu/Menu.tsx`) and `tests/helpers/uiStore.ts`, `tests/uiBoundary.test.ts`.
  - The Pixi views it replaces, on master: `src/renderer/src/render/duel/readoutPanel.ts`, `render/duel/readoutModel.ts`, `render/duel/interiorModel.ts`, `render/tactical/tacticalLayer.ts`, `render/tactical/tacticalModel.ts`, `render/tactical/feelPanel.ts`, `render/tactical/feelModel.ts`, `render/theme.ts`, `render/panel.ts`, `render/letterbox.ts`, `render/assets.ts`.
  - **H-2a-iii's files, which the plan is written against.** They are not on master yet, so read them from the H-2a-iii worktree. That worktree may be mid-merge with master, so its `main.ts` may already contain UI-i's code. The files: `C:\Users\djuar\FTLite\.worktrees\h2a-iii\src\renderer\src\app\duel\scene.ts`, `...\app\duel\duelMode.ts`, `...\app\duel\onlineDuel.ts`, `...\app\duel\flightMode.ts`, `...\render\duel\endScreen.ts`, `...\main.ts`, and its tests `C:\Users\djuar\FTLite\.worktrees\h2a-iii\tests\duelReadout.test.ts` and `...\tests\tacticalLayer.test.ts`.
- The run dir `docs/superpowers/reviews/2026-11-16-ui-ii-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Arithmetic in the tests.** Recompute every expected number in the plan's tests: `boxCss`/`edge` rounding, Bar fill widths, atlas cell offsets, the readout/end-card/banner/overlay/feel positions. Compare them with the plan's own implementation code and with today's Pixi code. A test whose expectation disagrees with its implementation is a P1.
6. **zustand and React hazards in the plan's code:**
   - the generic `createSink` typing and its computed-key `setState`
   - `useUi((s) => s.layout)` re-render scope
   - `PixelText`'s effect dependencies and canvas sizing
   - `RegionBoundary` with `fallback={null}`
   - `UiRoot` mounting order and z-index relative to the menu strip
7. **The scene mapping (Task 4, Step 2)** against H-2a-iii's `scene.ts` `draw` and its callers' `SceneOverlay` values (`duelMode.ts`, `onlineDuel.ts`). Do the interior, tactical and notice banners show in exactly today's cases? Does `overlayView` reach the sink only in map views?
8. **What the deletions break.** Every importer of `readoutPanel.ts`, `endScreen.ts` and `feelPanel.ts`, and every user of `TacticalLayerOptions.pauseText` and of the layer's removed texts, in src, tests and scripts on master and on the h2a-iii worktree. Also any test that builds `OnlineDuelDeps`, `DuelModeDeps`, `FlightModeDeps` or `createDuelScene`.
9. **Smokes:** does H-2a-iii's duel application smoke (`scripts/network/duel-app-smoke.ts` and `duel-app-observer.ts` in the h2a-iii worktree) read anything from the Pixi texts or `document.body.innerText` that moves into canvases?
10. **Controller's low-confidence items:**
    - whether Chromium's `measureText().fontBoundingBoxAscent` plus `fillText` at that baseline is a sound starting point for parity with Pixi 8's `BitmapFont.install`
    - whether `document.fonts.check('16px m5x7')` holds after Pixi's `Assets.load` of the font (`render/assets.ts`)
    - whether the probe's `FTLITE_MODE=uiprobe` launch works with how `src/main/index.ts` reads `FTLITE_MODE` (check it)
    - whether Task 5's perf counter design actually measures the React commit

## Reading manifest

- `docs/superpowers/plans/2026-11-16-ui-ii-react-duel-ui.md:L1-L1235`: the subject.
- `docs/superpowers/specs/2026-11-16-react-ui-layer-design.md:L1-L360`: the spec.
- `src/renderer/src/ui/menuState.ts:L1-L94`, `src/renderer/src/ui/store.ts:L1-L19`, `src/renderer/src/ui/UiRoot.tsx:L1-L10`, `src/renderer/src/ui/mount.tsx:L1-L12`, `src/renderer/src/ui/RegionBoundary.tsx:L1-L16`, `src/renderer/src/ui/context.tsx:L1-L14`, `src/renderer/src/ui/actions.ts:L1-L103`, `src/renderer/src/ui/menu/Menu.tsx:L1-L53`.
- `tests/helpers/uiStore.ts:L1-L40`, `tests/uiBoundary.test.ts:L1-L60`, `tests/uiMenuState.test.ts:L90-L110`.
- `src/renderer/src/render/duel/readoutPanel.ts:L1-L52`, `src/renderer/src/render/duel/readoutModel.ts:L1-L40`, `src/renderer/src/render/duel/interiorModel.ts:L1-L15`, `src/renderer/src/render/tactical/feelPanel.ts:L1-L40`, `src/renderer/src/render/tactical/feelModel.ts:L1-L80`, `src/renderer/src/render/tactical/tacticalModel.ts:L45-L65`, `src/renderer/src/render/tactical/tacticalModel.ts:L285-L300`, `src/renderer/src/render/tactical/tacticalLayer.ts:L36-L80`, `src/renderer/src/render/tactical/tacticalLayer.ts:L200-L229`.
- `src/renderer/src/render/theme.ts:L1-L75`, `src/renderer/src/render/panel.ts:L1-L20`, `src/renderer/src/render/letterbox.ts:L1-L7`, `src/renderer/src/render/assets.ts:L20-L40`, `src/renderer/src/app/duel/mode.ts:L1-L20`, `src/main/index.ts` (grep `FTLITE_MODE`).
- `C:\Users\djuar\FTLite\.worktrees\h2a-iii\src\renderer\src\app\duel\scene.ts:L1-L101`, `...\app\duel\duelMode.ts:L1-L73`, `...\app\duel\onlineDuel.ts:L55-L238`, `...\app\duel\flightMode.ts:L1-L73`, `...\render\duel\endScreen.ts:L1-L49`, `...\main.ts:L1-L148`.
- `C:\Users\djuar\FTLite\.worktrees\h2a-iii\tests\duelReadout.test.ts:L1-L110`, `...\tests\tacticalLayer.test.ts:L1-L40`. Grep the h2a-iii worktree's `tests\` for `createDuelScene|startDuelMode|startFlightMode|createOnlineDuelSession|OnlineDuelDeps`.
- `C:\Users\djuar\FTLite\.worktrees\h2a-iii\scripts\network\duel-app-smoke.ts`, `...\duel-app-observer.ts`: grep for `innerText|text|BitmapText|readout|PAUSED|REMATCH`.

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are fine. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- React 19 + zustand 5 are the UI layer; all screen-space menu/UI items move to React; Pixi keeps world-space content.
- HUD text is drawn on canvases from a hard-edged m5x7 glyph atlas (spec §4), not as DOM webfont text.
- The readout panel, map overlay and banners no longer shake with the console views (spec §6, deliberate).
- No sim, authority or network behaviour change; golden hashes unchanged; Electron smokes unchanged.
- UI-ii is executed after H-2a-iii merges, against its scene.ts.

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

- **P0**: the plan is unexecutable as a whole, or it would change sim/network behaviour, golden hashes or smoke scripts.
- **P1**: a task will fail at execution (tsc, missing interface, wrong signature, a test whose expectation contradicts its own code), a rule is ambiguous in a way two implementers would build differently, a deletion breaks an importer the plan does not update, or a case hit in ordinary use is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
