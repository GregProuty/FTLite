# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `90a57d1`. 12 accepted, 0 rejected, 0 deferred. Duel-fire has now merged at SIM_VERSION 40 (master 90a57d1), so Artemis-ii takes 40 → 41.

## R1-F1 [P1]: Held console buttons can stick when their button unmounts

Confirmed. runtime.ts calls clearKeys only on Tab and newRound (L300, L317), and X does not clear it (L325). §3 now releases a hold on unmount. §6.2 clear() also runs on any change of the drawn console's station and when it becomes null. §7 restates this.

## R1-F2 [P1]: Press counts add, held flags OR does not produce today's fire edges

Confirmed. runtime.ts L336-339 acts on edges only. §6.2 now makes the keyboard the single merge point. It has two held sets; fireDown and fireUp come from transitions of the merged Space state; the axes come from the merged codes. §8 tests the interleavings.

## R1-F3 [P1]: Online tab rules use own and partner seat

Confirmed. controls.ts L29-39 checks both consoles for any pid. §6.3 now defines tabs by occupancy, with the same rules in both modes. A tab is open only with consoleInReach and repairInReach < 0. In single player there is also the Tab-to-other-character case.

## R1-F4 [P1]: SIM_VERSION bump cannot be blessed as written

Confirmed. blessGuard.ts L17-20 and duelOracle.ts MIGRATIONS (keyed by the baseline version). §5.6 now has the two-step bless with MIGRATIONS[40], the same pattern as duel-fire (e123424, then efa0a5b).

## R1-F5 [P1]: Predicted path, flame, telemetry and scripted prediction read held W/S

Confirmed. runtime.ts L275, onlineSource.ts L132, tacticalModel.ts L267/L273. §5.3 defines axes() from throttleThrust(d.throttle) in both sources and restates the telemetry rule. §5.5 makes hazardAway predict with the throttle.

## R1-F6 [P1]: Scripted pair's reference value

Confirmed. §5.5 now compares against d.throttle on each seated tick.

## R1-F7 [P1]: Online latest queued level

Confirmed. onlineDuel.ts sends straight away (L104-108). §5.4 defines throttleSent with its clearing rules, and §8 tests two presses in one round trip.

## R1-F8 [P2]: Admission and module placement

Confirmed. §5.1 adds helmModule after round, with its reasons. §5.2 adds the DUEL_KINDS membership, the check order and the noop status in the result helper. The snapshot carries the field through the module flatten.

## R1-F9 [P2]: Station block does not fit at FONT_SIZE

Confirmed. theme.ts L22/L28. §2 now fixes the text sizes (FONT_NATIVE for labels), makes the station 300 wide, and draws only ASCII, with boxes for the bars and the throttle column.

## R1-F10 [P2]: Map reserve and interior overlap

Confirmed. scene.ts L95 and weaponsModel.ts L88. §2 replaces reserveRight with reserve {left 228, right 156} for the arrows and the notice centre, and leaves the flight view unchanged. INTERIOR_BAND's top moves to 42 and the no-op y-42 readout rule is dropped.

## R1-F11 [P2]: Click wiring names missing interfaces

Confirmed. main.ts builds the actions before the modes exist. §6.2 adds actions.console with a setConsole slot that the modes fill. §6.1 adds DuelViewSource seat/uiHeld/throttle and defines paused.

## R1-F12 [P3]: Button focus rules

Confirmed. §3 now has no tabIndex, and calls preventDefault on pointerdown, mousedown, contextmenu and auxclick for any button.

## Also changed

- §2 status table width set to READOUT_W (204); a layout test asserts the status table ends above the station block.

## Files changed

- docs/superpowers/specs/2026-11-17-artemis-consoles-design.md

<!-- end -->
