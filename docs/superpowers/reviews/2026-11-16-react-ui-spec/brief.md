## Role
<!-- reuse -->

The subject is a design spec for moving FTLite's screen-space menu and UI (the DOM main menu and the Pixi BitmapText HUD and duel panels) to React 19 with one zustand 5 store, while Pixi keeps the game world. It will become three implementation plans (UI-i menu, UI-ii duel/flight UI, UI-iii sector HUD) that fresh subagents execute task by task. So any interface the spec names that the codebase does not have, any behaviour it says moves "line for line" that it misdescribes, and any rule two implementers would build differently is a defect. It must also not break the deterministic sim, the Electron smokes that drive the menu by native input on data-testids, or the HUD's pixel-crisp look.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-16-react-ui-layer-design.md` at commit `7a1213f`, worktree `C:\Users\djuar\FTLite`, branch `master`.
- Prior specs it must agree with: `docs/superpowers/specs/2026-11-16-main-menu-kbm-design.md` (the menu it ports), `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` (H-2, whose plans touch the same files).
- The renderer code it changes: `src/renderer/src/main.ts`, `src/renderer/src/render/` (sessionMenu, hud, mapPanel, panel, duel/, tactical/), `src/renderer/src/app/` (session, onlineSession, duel/duelMode, duel/flightMode), the build and test config.
- The run dir `docs/superpowers/reviews/2026-11-16-react-ui-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. **Inventory completeness.** The owner asked for "the refactor for all existing menu/ui items". Check §3's table against the code: is any screen-space UI missing or misassigned? Candidates to check include `tacticalLayer.ts`'s zoom, scale and hint texts, `interiorView.ts`, and `enemyWindow.ts`'s labels.
8. **Pixel parity claims (§4).** Is rounding each Box edge from `layout.scale` in JS, with m5x7 as a DOM webfont, really equivalent to the Pixi BitmapText path (`roundPixels`, nearest scaling, anchors)? Is the claim that `loadAssets` registers m5x7 in `document.fonts` true for Pixi 8's font loader? Is `renderer.extract.base64` usable for texture frames cut from sheets?
9. **Per-frame flow (§2).** Can `replaceEqualDeep` plus narrow selectors plus `React.memo` with one `setState` per frame really meet 1.5 ms median? Does zustand 5's `useSyncExternalStore` path cause tearing or extra renders here? Are selectors that return fresh objects (an infinite-loop hazard in zustand 5) addressed?
10. **The smokes (§8, decision 7).** Do native `click` and `insertText` on React-controlled inputs, and the keyboard-driven `capacity` select, behave the same as today's uncontrolled DOM? Check `scripts/network/online-app-smoke.cjs`.
11. **Input blocking and focus.** Is moving `inputBlocked` derivation to a store subscription in `main.ts` equivalent to `render()`'s call today, including at startup and on dispose?
12. **Order with H-2a (§9).** Is the claim that H-2a-i and H-2a-ii need only path touch-ups credible from those plans?
13. **Controller's low-confidence items:** the session strip and `reservedHeight` / ResizeObserver loop; the deliberate "readout no longer shakes" change; whether the `?mode=duel` / `?mode=flight` dev views mounting the UI is specified enough; whether `useNow(1000)` changes the visible countdown's update rate relative to today's per-frame write.

## Reading manifest

- `docs/superpowers/specs/2026-11-16-react-ui-layer-design.md:L1-L257`: the subject.
- `src/renderer/src/main.ts:L1-L123`: app boot, router, menu wiring, resize/strip, input blocking.
- `src/renderer/src/render/sessionMenu.ts:L1-L186`: the menu being ported.
- `src/renderer/src/render/hud.ts:L1-L293`: the Pixi sector HUD.
- `src/renderer/src/render/hudModel.ts:L134-L170`: HudModel shape.
- `src/renderer/src/render/theme.ts:L1-L75`, `src/renderer/src/render/hudLayout.ts:L1-L50`, `src/renderer/src/render/panel.ts:L1-L20`, `src/renderer/src/render/letterbox.ts:L1-L7`.
- `src/renderer/src/render/assets.ts:L1-L96`: font and texture loading.
- `src/renderer/src/render/renderer.ts:L1-L91`: stage layering, Renderer interface.
- `src/renderer/src/render/mapPanel.ts:L1-L61`, `src/renderer/src/render/enemyWindow.ts:L1-L40`, `src/renderer/src/render/callouts.ts:L1-L49`.
- `src/renderer/src/render/duel/readoutPanel.ts:L1-L52`, `src/renderer/src/render/duel/endScreen.ts:L1-L49`, `src/renderer/src/render/duel/interiorView.ts:L1-L73`, `src/renderer/src/render/tactical/feelPanel.ts:L1-L40`, `src/renderer/src/render/tactical/tacticalLayer.ts:L35-L80`, `src/renderer/src/render/tactical/tacticalLayer.ts:L200-L229`.
- `src/renderer/src/app/duel/duelMode.ts:L1-L117`, `src/renderer/src/app/duel/flightMode.ts:L1-L73`.
- `src/renderer/src/app/session.ts:L20-L45`, `src/renderer/src/app/session.ts:L170-L187`, `src/renderer/src/app/onlineSession.ts:L20-L30`, `src/renderer/src/app/onlineSession.ts:L95-L109`, `src/renderer/src/app/sessionRouter.ts:L1-L18`, `src/renderer/src/app/onlineBridge.ts:L1-L46`.
- `scripts/network/online-app-smoke.cjs:L170-L252`: the native-input menu driver.
- `tests/sessionMenu.test.ts:L1-L82`, `tests/mainMenu.test.ts:L1-L60`, `tests/boundary.test.ts:L1-L30`, `vitest.config.ts:L1-L12`, `electron.vite.config.ts:L1-L30`, `tsconfig.web.json:L1-L10`, `package.json:L1-L55`.
- `docs/superpowers/plans/2026-11-16-helm-h2a-iii-online-app.md:L1-L100`: H-2a-iii's scope (menu changes); grep the H-2a-i and H-2a-ii plans (`docs/superpowers/plans/2026-11-16-helm-h2a-i-rounds-and-contracts.md`, `docs/superpowers/plans/2026-11-16-helm-h2a-ii-online-stack.md`) for `sessionMenu|endScreen|readoutPanel|duelMode|hud.ts`.

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are fine. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- React is the menu/UI layer of the Electron renderer.
- zustand is the state library unless a clearly better option exists (the reviewer may argue one only with concrete evidence).
- All existing menu/UI items are in scope for the refactor.
- The UI updates from simulation changes and from other players' inputs.
- Keyboard and mouse only, no couch co-op, no gamepads; the menu is Single player / Multiplayer (Host, Join) / Settings (main-menu spec).
- No sim, authority or network behaviour change; golden hashes unchanged.

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

- **P0**: the design cannot work as a whole: it would change sim or network behaviour or golden hashes, break the Electron smokes by design, or rest on a platform capability that does not exist.
- **P1**: a plan task built from the spec would fail or diverge: an interface the spec names does not exist or has another shape, a behaviour "ported as is" is misdescribed, a rule is ambiguous in a way two implementers would build differently, a screen-space UI item is missing from the inventory, or a case hit in ordinary use (startup, resize, reconnect, missing assets) is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
