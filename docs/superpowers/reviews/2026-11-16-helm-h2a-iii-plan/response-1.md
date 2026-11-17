# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at `22dfe97`. 6 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Single player writes no 'solo' playtest record, and the plan does not say it is deferring this

Confirmed: nothing in the plan writes a `session: 'solo'` record, and the local runtime has no telemetry accumulator. Taken as a stated deviation: Decision 14 and a Scope "Not in H-2a" line move Single player's records to H-2b, beside the report script that reads them; the Goal and the "After H-2a-iii" note say so. The owner is told.

## R1-F2 [P2]: The online end-card leave prompt survives a rematch from the partner

Confirmed. The Escape/Enter handling is an exported pure `leavePromptKeys` in `onlineDuel.ts` that closes the prompt unless the round is decided, the phase is running and the round is the one the prompt opened on, before it reads Escape. A `tests/duelOnlineView.test.ts` case opens the prompt on a decided replica, publishes the next round, and checks Escape sends `setPaused(true)` with no prompt.

## R1-F3 [P2]: The record's latency figures are wrong or skewed

Confirmed (`src/network/portLink.ts` returns `rttMs: 0`). Records carry `rttMs: null` (the schema admits it), stated beside Decision 5; `attach()` clears `heldStamps` and `commandStamps`; pauses and disconnects are per-round deltas; samples above `DUEL_RECORD_MAX_MS` are dropped rather than invalidating the record.

## R1-F4 [P2]: The build-mismatch error text the spec asks for is not written

Confirmed against `sessionMenu.ts`. Task 1 Step 7 replaces `ERRORS['incompatible']` with the spec's wording, and the sessionMenu test asserts the full text (its old `toContain('compatible')` would have failed).

## R1-F5 [P3]: A deliberate Leave shows 'CONNECTION LOST — RECONNECTING'

Confirmed. The banner reads `LEAVING…` for the saving, idle and ended phases, keyed on the phase so the menu's Leave button is covered too.

## R1-F6 [P3]: The rewritten rematch pointer test passes whether or not the Enter frame's drag and wheel are dropped

Confirmed. The test asserts the active Helm camera's centre, zoom and follow right after the press frame, before any tick.

## Also changed

- The full-suite count in Task 4 is 3463 (plan ii's three new tests plus this round's one).

## Files changed

- docs/superpowers/plans/2026-11-16-helm-h2a-iii-online-app.md

<!-- end -->
