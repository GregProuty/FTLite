## Role
<!-- reuse -->

The subject is an implementation plan (UI-iii of FTLite's React UI layer) that fresh subagents will execute task by task. Each subagent sees only its own task's text. So any interface the plan consumes that does not exist with the assumed shape, any code that would not compile or whose test would not pass as written, and any rule left vague enough that two implementers would port `hud.ts` differently is a defect. The plan moves the whole sector HUD (`render/hud.ts`, `render/mapPanel.ts`) from Pixi to React on the pixel stage UI-ii built. It must keep `hudLayout.ts`'s rectangles and `hud.ts`'s rules exactly, change no sim or network behaviour, and keep every Electron smoke passing unchanged.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-16-ui-iii-react-sector-hud.md` at commit `b151a88`, worktree `C:\Users\djuar\FTLite`, branch `master`.
- The spec: `docs/superpowers/specs/2026-11-16-react-ui-layer-design.md` (§1, §2, §3, §4, §7, §8).
- The code it ports and builds on, all on master:
  - `src/renderer/src/render/hud.ts` (the Pixi HUD, the source of truth for every rule)
  - `render/mapPanel.ts`, `render/hudModel.ts`, `render/hudLayout.ts`, `render/theme.ts`, `render/panel.ts`, `render/roomIcons.ts`, `render/roomIconModel.ts`, `render/fallback.ts`, `render/assetNames.ts`, `render/assets.ts`, `render/enemyWindow.ts`, `render/enemyWindowModel.ts`, `render/renderer.ts`
  - `app/session.ts`, `app/onlineSession.ts`, `main.ts`, `app/uiProbe.ts`
  - UI-ii's `ui/` (`stage/*`, `sinks.ts`, `perf.ts`, `views.ts`, `menuState.ts`, `store.ts`, `UiRoot.tsx`, `mount.tsx`, `probe/*`)
  - the tests `tests/hudSlots.test.ts`, `tests/helpers/sim.ts` and `tests/uiBoundary.test.ts`
- The run dir `docs/superpowers/reviews/2026-11-16-ui-iii-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces? (Task 4 Step 3 knowingly defers the "after" shots to Task 5; check that ordering.)
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Port fidelity.** Compare each component spec in Task 3 (SidePanels, MapPanel, Headline, SummaryCard, PlayerBlock, ConsoleCard via `consoleRows`, EventCardView, Credits, the Hud order) line by line against `hud.ts` and `mapPanel.ts`: positions, tints, conditions, visibility rules and draw order. List every rule the plan states differently or omits.
6. **The code given verbatim** (Task 2: `images.ts`, `rowLayout.ts`, `Row.tsx`, `CellRow.tsx`, `Icon.tsx`, `app/uiImages.ts`; Task 1 snippets):
   - Does it type-check against the real modules (`fallback.ts`'s exports, `ASSET_NAMES`'s shape, `IconKind`, `CellColumns`, UI-ii's `createSink` and `UiPerf`, Pixi 8.19's `extract.base64` options)?
   - Do the tests' expectations match the code? Recompute `rowLayout`'s numbers and `CellRow`'s cell colours.
7. **No Pixi in the UI graph.** Would any value import from `ui/**` reach pixi.js after the plan (`hudModel.ts` and its imports, `roomIconModel.ts`, `fallback.ts`, `assetNames.ts`, `enemyWindowModel.ts`, `mapModel.ts`)?
8. **Deletions.** Every importer of `hud.ts`, `mapPanel.ts`, `panel.ts`, `Renderer.hud` and `createHud`, in src, tests and scripts.
9. **The fixtures (Task 4).** Can a real `SimState` be built in the renderer as the plan says (`createSimState(parseShip(cutter), 4, 7)`)? Can `buildHudModel` run with `{ mode: 'couch', ui }` and those contexts? Do `import.meta.env.DEV` guards in `buildHudModel` throw?
10. **Controller's low-confidence items:**
    - `extract.base64` on a Sprite of a sheet-frame texture: does it return only the frame?
    - CSS `mask-image` with a data URL in Electron 37
    - The SVG `crispEdges` circles against Pixi's `antialias: false` circles
    - Whether a 60 Hz `replaceEqualDeep` over the full `HudModel` meets the budget
    - The two smokes that show the sector HUD (`online-app`, `online-recovery`): do they read any HUD text through the DOM or Pixi?

## Reading manifest

- `docs/superpowers/plans/2026-11-16-ui-iii-react-sector-hud.md:L1-L682`: the subject.
- `docs/superpowers/specs/2026-11-16-react-ui-layer-design.md:L1-L380`.
- `src/renderer/src/render/hud.ts:L1-L293`, `src/renderer/src/render/mapPanel.ts:L1-L61`, `src/renderer/src/render/hudLayout.ts:L1-L50`, `src/renderer/src/render/theme.ts:L1-L75`, `src/renderer/src/render/panel.ts:L1-L20`.
- `src/renderer/src/render/hudModel.ts:L1-L60`, `src/renderer/src/render/hudModel.ts:L100-L210`, `src/renderer/src/render/hudModel.ts:L240-L280`, `src/renderer/src/render/hudModel.ts:L355-L380`, `src/renderer/src/render/hudModel.ts:L515-L570`.
- `src/renderer/src/render/roomIcons.ts:L1-L84`, `src/renderer/src/render/roomIconModel.ts:L1-L38`, `src/renderer/src/render/fallback.ts:L1-L21`, `src/renderer/src/render/assetNames.ts:L1-L30`, `src/renderer/src/render/assets.ts:L1-L96`, `src/renderer/src/render/enemyWindow.ts:L1-L40`, `src/renderer/src/render/enemyWindowModel.ts` (grep `export const WINDOW`), `src/renderer/src/render/renderer.ts:L1-L95`.
- `src/renderer/src/app/session.ts:L20-L45`, `src/renderer/src/app/session.ts:L170-L190`, `src/renderer/src/app/onlineSession.ts:L20-L30`, `src/renderer/src/app/onlineSession.ts:L95-L112`, `src/renderer/src/main.ts:L1-L196`, `src/renderer/src/app/uiProbe.ts:L1-L35`.
- `src/renderer/src/ui/sinks.ts:L1-L24`, `src/renderer/src/ui/perf.ts`, `src/renderer/src/ui/menuState.ts`, `src/renderer/src/ui/store.ts`, `src/renderer/src/ui/UiRoot.tsx`, `src/renderer/src/ui/mount.tsx`, `src/renderer/src/ui/stage/` (`Box.tsx`, `Bar.tsx`, `Panel.tsx`, `PixelText.tsx`, `Stage.tsx`, `color.ts`, `geometry.ts`), `src/renderer/src/ui/probe/mountProbe.tsx`.
- `tests/hudSlots.test.ts:L1-L40`, `tests/helpers/sim.ts:L1-L40`, `tests/uiBoundary.test.ts:L1-L60`, `src/renderer/src/sim/state.ts:L100-L115`.
- `scripts/network/online-app-smoke.ts`, `scripts/network/online-recovery-smoke.ts`: grep for `text|innerText|HULL|POWER|hud`.
- `node_modules/pixi.js/lib/rendering/renderers/shared/extract/ExtractSystem.d.ts` (or wherever `base64` is declared): the options type. This is the one allowed read under node_modules.

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are fine. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/` (except the one Pixi declaration named in the manifest), `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- React 19 + zustand 5 are the UI layer; all screen-space menu/UI items move to React; Pixi keeps world-space content (callouts, enemy window, floor room icons, tactical scene).
- HUD text is `PixelText` from the hard-edged m5x7 atlas (crisper than today's soft Pixi text; positions and shapes must match).
- No sim, authority or network behaviour change; golden hashes unchanged; Electron smokes unchanged.

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
- **P1**: a task will fail at execution (tsc, missing interface, wrong signature, a test whose expectation contradicts its own code), a HUD rule is ported differently from hud.ts or left ambiguous, a deletion breaks an importer the plan does not update, or a case hit in ordinary use is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
