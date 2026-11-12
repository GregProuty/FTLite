# Codex review: Demo-i spec second pass, half 1 (2026-11-11)

1. **Medium — §4, line 42:** The shop’s second notice line exceeds the stated 64-character limit, so the width budget and test cannot both hold. **Fix:** shorten the line or raise the limit and recheck the panel fit. **First-pass #4 remains open.**

2. **Low — §4, line 47:** A 340 px line centered at 480 ends at x=650, leaving 78 px before the threat panel at x=728, not “at least 100 px.” **Fix:** correct the clearance claim or specify a narrower measured maximum width. **First-pass #4 remains open.**

3. **Low — §3, line 35:** The six lines are measured, but no maximum rendered width or fit criterion is specified; the 90-character limit alone does not guarantee they fit. **Fix:** record and enforce a pixel-width limit. **First-pass #3 remains open.**

4. **Low — §8, line 90:** The tests are asked to pin “the two exact” event and shop lines, but §8 does not give those expected literals. **Fix:** include the exact expected strings in §8 or point directly to §4’s literals as the source of truth.

**First-pass findings:** #1, #2, #5–#12 are resolved. #3 and #4 remain open as noted above.

The other requested checks look consistent: the HUD maps gamepad A/X/B to Interact/Confirm/Cancel; the progress line is at y=84, controls rows 2–7 at y=124–214, and player blocks begin at y=446; the crew multiplier index and first-arrival initialization are specified correctly; and the duo metric and lever stop rule are explicit.