# Ledger: ui-ii-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P2 | The ASCII-only glyph atlas drops the online duel's '…' and '—' banner glyphs | fixed:R1 | 0 | GLYPH_CHARS adds the two non-ASCII banner chars; advances measured per char; coverage test; probe samples include both banners; Task 4 greps duel strings for non-ASCII |
| R1-F2 | P2 | The two calibration constants cannot correct anchored heights or horizontal placement | fixed:R1 | 0 | Deviation 3 and glyphs.ts: GLYPH_LINE_H (anchor height) and GLYPH_X_OFFSET (origin) added; GLYPH_X_PAD clipping only; calibration order in Task 5 Step 3 |
| R1-F3 | P2 | The ?uiperf=1 counter does not measure the React commit in the build it runs on | fixed:R1 | 0 | perf.ts rewritten: flushSync around the sink write (render+commit+layout effects), no Profiler, windowStats + written test, uiperf reached by page.goto |
| R1-F4 | P2 | Task 0's prerequisite check uses a branch that no longer exists | fixed:R1 | 0 | Task 0 uses -i grep for the merge, 0903ed5^2 diff, and greps the quoted signatures |
| R1-F5 | P2 | Spec §8's render-count test for the duel panels is missing, and the omission is not listed as a deviation | fixed:R1 | 0 | uiDuel.test.tsx gains a sharing/memo render-count case and a zero-commit equal-view check |
| R1-F6 | P2 | The probe's halves cannot match pixel for pixel: the renderer's stage stays visible, and sample extents are unchecked | fixed:R1 | 0 | startUiProbe hides stage children and draws one background; probe test checks full extents and character coverage; GLYPH_CHARS split per size |
| R1-F7 | P3 | The `git grep "duel/endScreen"` check will match docs, including this plan | fixed:R1 | 0 | git grep scoped to src tests scripts |
| R1-F8 | P3 | A tactical-layer test still names the removed texts, and Step 8 does not list it | fixed:R1 | 0 | Step 8 renames the duelWeaponsView reset case |
| R1-F9 | P3 | The readout pips' 1-px border is not scaled with the stage | fixed:R1 | 0 | pip border uses a scaled hairline like Panel |
| R1-F10 | P3 | uiMenuState.test has one layout expectation, not two | fixed:R1 | 0 | names the single layout assertion in uiMenuState.test.ts |
