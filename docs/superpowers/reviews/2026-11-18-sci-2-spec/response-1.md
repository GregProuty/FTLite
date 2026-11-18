# Round 1 response (spec revised)

Reviewed `round-1.json` against the spec at `2fededc0`. 12 accepted, 0 rejected, 0 deferred. The spec was rewritten around one rule (§3: every per-player value is n long; ship values stay two) with every cited site listed.

## R1-F1 [P1]: Network and client layers fixed at two
Confirmed at the cited lines (duelProducers.ts:27-28,112; duelStream.ts:56,63; codec.ts:239; duelClient.ts:17-48; duelCheckpoint.ts:99). Spec 4.3/4.4: codecs built once at playerLimit 4 with each site named; producers, client and ledger sized to n; online test attaches seat 2.

## R1-F2 [P1]: Empty seat away contradiction
Confirmed. Spec 4.4: every character created present; the away steward sends presence false at the first running boundary; test added.

## R1-F3 [P1]: Crew-down loss and health loops
Confirmed health.ts:15 PLAYERS = 2. Spec 4.1: all n downed (away included) loses, byte-identical at n = 2; loops to playerCount; tests.

## R1-F4 [P1]: Snapshot offsets and restore
Confirmed snapshot.ts:77,95,129,140,160-183 and step.ts:107,127. Spec 4.2 and 4.1 cover each.

## R1-F5 [P1]: Telemetry and records
Confirmed. Spec 4.1/4.3: per-player telemetry, mode memory and summary tuples n long; record seat 0..3.

## R1-F6 [P1]: Host crew path
Confirmed onlineSession.ts:20,78,421 and onlineDuel.ts:35. Spec 4.5.

## R1-F7 [P2]: App seat types
Confirmed sitModel.ts:27-33 bug for seat 2+. Spec 5.1.

## R1-F8 [P2]: Crew list
Spec 5.2: precedence DOWNED, AWAY, console, REPAIRING, ON FOOT; READOUT_ROWS 23; OtherStatus removed.

## R1-F9 [P2]: Lobby labels
Confirmed menuState.ts:81-84,93 and lifecycle.ts:36. Spec 5.3.

## R1-F10 [P3]: Science badge
Confirmed roomIconModel.ts:6 has 'science'. Spec 5.4.

## R1-F11 [P3]: helmPlayer
Confirmed actions.ts:105. Spec 4.1: Start keeps the host seat, widened.

## R1-F12 [P3]: Part C presence wording
Spec 8 reworded per onlineDuel.ts:171 and duelProducers.ts.

## Also changed

- Whole spec reorganised (§3 rule, §4 Part A by layer, §5 Part B, §8 Part C).

## Files changed

- docs/superpowers/specs/2026-11-18-sci-2-crew-of-four-design.md

<!-- end -->
