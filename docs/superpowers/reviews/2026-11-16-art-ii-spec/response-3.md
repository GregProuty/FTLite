# Round 3 response (spec revised)

Reviewed `round-3.json` against the subject at `0b246ae`. 1 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F7, R2-F1 and R2-F2 as resolved.

## R3-F1 [P3]: -WALL_GAP is literally right only for a north wall

Confirmed against consoleModel.ts:L47-L50, where the turn maps s and e to T + WALL_GAP. Section 2 now names the line as the outer edge of the turned `deskPicture(side, flush).desk` rectangle and gives its value for each side.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-16-art-ii-bought-art-design.md

<!-- end -->
