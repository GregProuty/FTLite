# Codex review: Run-iii plan 1a-r, progress/score/quirks code (2026-11-11)

1. **P2 — `progress.ts`, `applyRun`**: Filtering existing IDs through `UNLOCKS` correctly orders and deduplicates known unlocks, and evaluates eligibility against updated counters. It also silently drops unknown IDs already present in `p.unlocked`, though spec section 4 only calls for sanitizing IDs in the store. Preserve existing IDs while adding newly earned unlocks, or explicitly establish that `applyRun` must sanitize them.

2. **P2 — `progress.ts`, `applyStartBonuses`**: The mask bits match `UNLOCKS` order: scrap reserve `1`, torpedo rack `2`, veteran crew `4`. Veteran Repair XP uses `XP_THRESHOLDS[min(headStartLevel + 1, SKILL_MAX)]` as specified.

3. **P2 — `score.ts`, `runScore`**: The formula includes nodes, victory, scrap earned, enemies destroyed, and boarders killed with the specified weights. The plan does not include `telemetry.ts` among the permitted files, so I cannot verify the resulting record fields or their construction.

4. **P2 — plan Step 3, `progress.ts` imports**: `progress.ts → characters.ts` is not a runtime cycle through the path named in the plan: `characters.ts` imports `SimState` as a type only. `state.ts → progress.ts` and `state.ts → characters.ts` therefore do not create a runtime back edge.

5. **P2 — plan Step 3, `quirks.ts`**: The six quirk indices and their neutral returns align with the specified hooks and values. No defect found in the listed code.