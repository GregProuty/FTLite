# Codex review: Run-iii implementation (2026-11-11)

1. **Low — [tests/progression.test.ts:69](C:/Users/djuar/FTLite/tests/progression.test.ts:69):** The torpedo test does not exercise the cap: `TORP_START + 2` is 5, below `TORP_CAP` 6, so it would pass if the cap were removed. **Fix:** Set the pre-bonus stock to at least `TORP_CAP - 1`, apply the bonus, and assert the result is `TORP_CAP`.

All other requested categories: none.