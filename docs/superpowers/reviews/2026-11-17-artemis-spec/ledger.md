# Ledger: artemis-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Held console buttons can stick when their button unmounts (pause, X stand, view change) | resolved | 0 | §3 hold releases on unmount; §6.2 clear() also on console station change or null (stand, sit, pause, end card, round); §7; confirmed R2 |
| R1-F2 | P1 | "Press counts add, held flags OR" does not produce today's fire edges or movement axes | resolved | 0 | §6.2 keyboard is the merge point: two held sets, fire edges on merged Space transitions, move axes from merged codes; confirmed R2 |
| R1-F3 | P1 | Online tab rules use 'own seat' and 'partner's seat', but either player may sit at either console | resolved | 0 | §6.3 tabs by occupancy, same in both modes, open requires consoleInReach and repairInReach<0; single player also Tab to the other character's console; confirmed R2 |
| R1-F4 | P1 | Artemis-ii's SIM_VERSION bump cannot be blessed as written: the duel oracle requires per-tick identical runs | resolved | 0 | §5.6 two-step bless: bump alone with MIGRATIONS[40] added /^helm\.throttle$/, then same-version deliberate bless; confirmed R2 |
| R1-F5 | P1 | Drawn predicted path, thrust flame, telemetry and the scripted pair's prediction still read held W/S after the throttle | resolved | 1 | §5.5 hazardAway predicts with pair.axes.turn and throttleThrust(d.throttle); confirmed R3 |
| R1-F6 | P1 | Scripted pair's 'whenever its wanted thrust changes' has no reference value, and the kept throttle makes it diverge | resolved | 0 | §5.5 scripted Helm sends throttle when wanted level differs from d.throttle each seated tick; confirmed R2 |
| R1-F7 | P1 | Online W/S 'from the latest queued level' has no queue to read | resolved | 0 | §5.4 base: local pending else d.throttle; online throttleSent {level, sequence} cleared on result/attach/round/stand/sit; §8 test; confirmed R2 |
| R1-F8 | P2 | Throttle admission and state placement are underspecified against the duel module contract | resolved | 1 | §5.1 snapshot.ts helmAt=roundAt+4, interiorAt=helmAt+1, integer -1..4 check; §8 rejection test; confirmed R3 |
| R1-F9 | P2 | Station block content does not fit 248 px at FONT_SIZE; button text size and glyphs are unspecified | resolved | 0 | §2 text sizes (FONT_NATIVE labels), ASCII only, boxes for bars; station 300 wide; status = READOUT_W; confirmed R2 |
| R1-F10 | P2 | Map reserve and interior overlap not addressed when the readout moves left | resolved | 0 | §2 reserve {left,right} 228/156, arrows and notice centred on span, flight unchanged; INTERIOR_BAND top 42, y-42 readout rule dropped; confirmed R2 |
| R1-F11 | P2 | Click wiring and view-model inputs name interfaces the app does not have | resolved | 0 | §6.2 actions.console + setConsole slot set by modes; §6.1 DuelViewSource seat/uiHeld/throttle; paused defined; confirmed R2 |
| R1-F12 | P3 | Button focus and pointer rules are partly self-defeating | resolved | 0 | §3 no tabIndex; preventDefault on pointerdown/mousedown/contextmenu/auxclick for any button; confirmed R2 |
| R2-F1 | P1 | The revision dropped the wire step: the duel codec would reject every online throttle command | resolved | 0 | §5.2 Wire paragraph: contracts + codec z.number().finite(), sim answers malformed; step 1; §8 codec test; confirmed R3 |
| R2-F2 | P2 | clear() on every console change now empties the physical keyboard too, and the new Space-transition rule makes an auto-repeat count a fireDown | resolved | 0 | §6.2 clear() only Tab/restart/blur; clearUi() on console change; repeat keydown never counts fireDown; §8 tests; confirmed R3 |
| R2-F3 | P3 | `HeldFlags` is named as a type but does not exist and is not defined | resolved | 0 | §6.1 HeldFlags defined inline, new in app/duel/input.ts; confirmed R3 |
| R3-F1 | P3 | §5.1 names the wrong path for validateDuelSnapshot | fixed:R3 | 0 | §5.1 path sim/duel/snapshot.ts, round tuple roundAt..helmAt, throttle values[helmAt] |
