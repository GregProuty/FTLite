# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `25a22b9`. 10 accepted, 0 rejected, 0 deferred; no prior IDs.

## R1-F1 [P2]: The ASCII-only glyph atlas drops the online duel's '…' and '—' banner glyphs

Confirmed: onlineDuel.ts L193 has 'LEAVING…' and 'CONNECTION LOST — RECONNECTING'. Rather than guessing hmtx advances in theme.ts, the atlas now measures each character's advance with `measureText` (as Pixi's dynamic font does) and stores `atlas.advance`. `GLYPH_CHARS` is ASCII plus `…—` (97). PixelText sizes and places glyphs by the atlas's advances (`atlasTextWidth`). A coverage test checks the scene's banner and end-card strings, the probe samples include both banners, and Task 4 greps the duel sources for any other non-ASCII character.

## R1-F2 [P2]: The two calibration constants cannot correct anchored heights or horizontal placement

Confirmed: `GLYPH_X_PAD` never moved the origin and `cellH` had no knob. Added `GLYPH_LINE_H` (null = measured; used for `cellH`, so for anchors) and `GLYPH_X_OFFSET` (applied to the drawn origin). `GLYPH_X_PAD` is documented as clipping only. Deviation 3 and Task 5 Step 3 give the calibration order: Y offset on anchorY 0 samples, line height on anchorY 0.5/1, then X offset.

## R1-F3 [P2]: The ?uiperf=1 counter does not measure the React commit in the build it runs on

Confirmed: Profiler's onRender does not run in production builds, and actualDuration excludes layout effects. perf.ts now wraps the sink's write in `flushSync`, so render, commit and layout effects run inside the timed region. It has no Profiler, plus a pure `windowStats` and a written `tests/uiPerf.test.ts`. The probe script reaches the flag with `page.goto` on the loaded URL.

## R1-F4 [P2]: Task 0's prerequisite check uses a branch that no longer exists

Confirmed: h2a-iii was merged at 0903ed5 and its branch was deleted. Task 0 now uses `git log -i --grep "merge h2a-iii"`, `git diff 0903ed5^2 master`, and greps for the quoted signature, the interface and the `scene.draw(` calls.

## R1-F5 [P2]: Spec §8's render-count test for the duel panels is missing, and the omission is not listed as a deviation

Confirmed. uiDuel.test.tsx gains a case that frames a view, then a view whose only change is a readout value. It asserts that memoised overlay, banners and end consumers rendered once, and that a third, deep-equal view makes zero store commits.

## R1-F6 [P2]: The probe's halves cannot match pixel for pixel: the renderer's stage stays visible, and sample extents are unchecked

Confirmed: renderer.ts's stage children, including the starfield, stay visible. startUiProbe now hides every stage child and draws one full background rect. The probe test checks each sample's full horizontal and vertical extent within its half and the character coverage, and the GLYPH_CHARS lines are split per size to fit.

## R1-F7 [P3]: The `git grep "duel/endScreen"` check will match docs, including this plan

Confirmed. Scoped to `-- src tests scripts`.

## R1-F8 [P3]: A tactical-layer test still names the removed texts, and Step 8 does not list it

Confirmed (tests/duelWeaponsView.test.ts L213). Step 8 now renames the case and keeps its assertion.

## R1-F9 [P3]: The readout pips' 1-px border is not scaled with the stage

Confirmed. The pip border uses a scaled, device-rounded hairline, the same rule as Panel's border.

## R1-F10 [P3]: uiMenuState.test has one layout expectation, not two

Confirmed. The plan now names the one layout assertion.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-ui-ii-react-duel-ui.md

<!-- end -->
