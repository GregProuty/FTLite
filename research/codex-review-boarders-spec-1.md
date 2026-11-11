# Codex review: Boarders-i spec half 1 (2026-11-11)

1. **High — §4 L51; §5 L67:** `aloneSince = -1` cannot distinguish “not alone” from “already sabotaged.” The next empty-room tick restarts the timer, allowing repeated sabotage during one visit, including after crew enter and leave. **Fix:** reserve `-2` for “sabotaged this visit”; preserve it until an actual room change and include it in snapshot continuation checks.

2. **Medium — §2 L21; §5 L67:** The decision requires 15 continuous seconds alone **with an online console**, but the algorithm starts timing even when every console is offline. Powering one up after 15 seconds causes immediate sabotage. **Fix:** define whether the timer measures solitude or continuous station eligibility; for the stated decision, reset it whenever no eligible online station exists.

3. **Medium — §5 L67:** “Lowest station index in the room” does not explicitly restrict selection to online stations. In room A, offline Navigation can precede online Doors; `failStation(state, i)` does not reject an offline station. **Fix:** select the lowest index satisfying both `stationRoom[i] === room` and `stationOnline(state, i)`.

4. **Medium — §5 L63:** “The fight starts at once” conflicts with returning immediately after arrival. That return skips boarder attacks, and crew already acted in `interactSystem`, so neither side fights on the arrival tick. It also delays starting solitude timing until the following tick. **Fix:** explicitly choose next-tick combat and timing, or process arrival-tick attacks and initialize solitude timing while suppressing movement and sabotage.

5. **Medium — §3 L35; §5 L66:** The Medbay explanation misstates system order: fire damage occurs in `crewSystem`, **after** healing. Lethal boarder damage calls `downCrew(state, pid)` **before** healing; Medbay skips Downed crew. **Fix:** state that only surviving Conscious targets heal that tick; lethal hits immediately stand the target, shed power, and remain Downed for lifecycle/telemetry sampling.

6. **Medium — §2 L25; §6 L82:** Adding boarder tiles before fire tiles does not establish priority. Existing `goalTiles` combines fire, breach, and power goals, and BFS chooses by distance; insertion order cannot prioritize boarders. **Fix:** return the boarder goal set before adding hazard goals, matching the existing downed-teammate early return.