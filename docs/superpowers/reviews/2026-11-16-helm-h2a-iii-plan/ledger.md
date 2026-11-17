# Ledger: helm-h2a-iii-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Single player writes no 'solo' playtest record, and the plan does not say it is deferring this | fixed:R1 | 0 | Stated deviation: Decision 14 and a Scope Not-in-H-2a line move Single player solo records to H-2b beside the report script |
| R1-F2 | P2 | The online end-card leave prompt survives a rematch from the partner: input is frozen in the new round, and Escape then pauses both machines | fixed:R1 | 0 | Exported pure leavePromptKeys closes the prompt unless decided, running and the same round; pump uses it; duelOnlineView test covers rematch then Escape -> setPaused |
| R1-F3 | P2 | The record's latency figures are wrong or skewed: rttMs is always 0, held stamps survive re-attach, and pause/disconnect counts are cumulative | fixed:R1 | 0 | rttMs null (Decisions 5-6); attach clears heldStamps/commandStamps; pauses/disconnects per round; DUEL_RECORD_MAX_MS drops oversize samples |
| R1-F4 | P2 | The build-mismatch error text the spec asks for is not written | fixed:R1 | 0 | Task 1 Step 7 replaces ERRORS.incompatible with the build-mismatch text; sessionMenu test asserts the full text |
| R1-F5 | P3 | A deliberate Leave shows 'CONNECTION LOST — RECONNECTING' until the menu returns home | fixed:R1 | 0 | Banner shows LEAVING… for saving/idle/ended phases; CONNECTION LOST otherwise |
| R1-F6 | P3 | The rewritten rematch pointer test passes whether or not the Enter frame's drag and wheel are dropped | fixed:R1 | 0 | Test asserts the Helm camera centre, zoom and follow right after the press frame, before any tick |
