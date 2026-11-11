# Codex review: Run-i spec half 1 (2026-11-11)

1. **High — §6, lines 76–80:** Victory is set inside `consoleSystem`, but `step()` continues. Boarders/environment can down the navigator; unchanged `crewSystem` then overwrites Victory with Crew/Hull. Downed crew can also bleed out after victory was declared. **Fix:** define terminal precedence and finalization; preserve the chosen result while running telemetry exactly once and incrementing the tick.

2. **Medium — §6, lines 72–78:** Clearing debris does not clear `science.scanning`. `removeDebris` only retargets; `leave` cancels scanning only when Science targets the enemy. With no enemy, an interrupted debris scan remains armed and can automatically scan a later target; snapshots preserve this. **Fix:** explicitly set `science.scanning = 0` on every jump.

3. **Medium — §6, lines 65–71:** Navigation checks readiness before `jumpStep`; Confirm on the tick that reaches charge 1 is discarded. Conversely, after a successful jump, `jumpStep` increments the reset charge during that same tick, so an end-of-tick snapshot contains `DT / JUMP_CHARGE_TIME`, not 0. **Fix:** specify these boundary semantics explicitly, or move charging before console input.

4. **Medium — §6, line 78:** The one/two director draws are exact only within `jumpShip`, not across its tick. Remaining console actions, hazards, director spawning, and aboard boarder movement can consume additional draws. Retained stress can immediately transition BuildUp to SustainPeak. **Fix:** scope the draw assertion to the function boundary and state that ordinary systems continue afterward.

5. **Low — §5, line 61:** The replay assertion omits its initial RNG state. `createRng(runSeed)` does not reproduce `rng.map`: `deriveStreams` seeds it from the sixth master draw. **Fix:** initialize the reference replay with `deriveStreams(seed).map`, independently count draws, and compare the resulting map and stream state.

6. **Low — §2, line 23; §4, line 49:** `nodesReached` counts jumps, so victory yields 7 while the headline denominator is 8. Sections 1–6 do not specify the conversion from this counter to the displayed node ordinal. **Fix:** define `nodesReached === column === jumps` and display `nodesReached + 1`, or count the starting node consistently.

7. **Low — §6, line 67:** “Confirm” leaves held-button behavior implicit. The real dispatch supplies edge-based `confirmPressed`; holding Confirm across readiness will never jump without another press. **Fix:** explicitly require a fresh Confirm edge after readiness, with no buffering, and specify that direction changes apply before Confirm.