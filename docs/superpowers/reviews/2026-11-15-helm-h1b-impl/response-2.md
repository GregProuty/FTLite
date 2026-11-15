# Round 2 response (no subject change)

Reviewed `round-2.json`. No new findings. Codex confirmed R1-F1 to R1-F4 resolved. Verdict: ready with P2s.

## R1-F5 [P2]: Missile prediction starts from a different position than its glyph (still open, deferred)

The re-raise is accurate: only the first point is the interpolated glyph, and the later points are predicted from the current tick's missile. I'm deferring it rather than fixing it:
- **Same rule as the Helm path:** joining from the drawn position is the rule the Helm path already uses. The H-1a final review accepted it, since the path leads the glyph rather than lagging it.
- **Small gap:** the gap is at most one tick of missile travel, inside the first segment.
- **Wrong trajectory:** seeding the predictor from a mid-tick interpolated state would predict a path off the sim's 60 Hz tick grid, which the missile will not actually follow.

It stays recorded for the manual visual gate.

## Also changed

- (nothing)

## Files changed

<!-- end -->
