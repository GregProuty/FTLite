# Ledger: artemis-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Held console buttons can stick when their button unmounts (pause, X stand, view change) | fixed:R1 | 0 | §3 hold releases on unmount; §6.2 clear() also on console station change or null (stand, sit, pause, end card, round); §7 |
| R1-F2 | P1 | "Press counts add, held flags OR" does not produce today's fire edges or movement axes | fixed:R1 | 0 | §6.2 keyboard is the merge point: two held sets, fire edges on merged Space transitions, move axes from merged codes |
| R1-F3 | P1 | Online tab rules use 'own seat' and 'partner's seat', but either player may sit at either console | fixed:R1 | 0 | §6.3 tabs by occupancy, same in both modes, open requires consoleInReach and repairInReach<0; single player also Tab to the other character's console |
| R1-F4 | P1 | Artemis-ii's SIM_VERSION bump cannot be blessed as written: the duel oracle requires per-tick identical runs | fixed:R1 | 0 | §5.6 two-step bless: bump alone with MIGRATIONS[40] added /^helm\.throttle$/, then same-version deliberate bless |
| R1-F5 | P1 | Drawn predicted path, thrust flame, telemetry and the scripted pair's prediction still read held W/S after the throttle | fixed:R1 | 0 | §5.3 runtime/online axes() from throttleThrust(d.throttle); telemetry manoeuvre rule restated; §5.5 hazardAway predicts with throttle |
| R1-F6 | P1 | Scripted pair's 'whenever its wanted thrust changes' has no reference value, and the kept throttle makes it diverge | fixed:R1 | 0 | §5.5 scripted Helm sends throttle when wanted level differs from d.throttle each seated tick |
| R1-F7 | P1 | Online W/S 'from the latest queued level' has no queue to read | fixed:R1 | 0 | §5.4 base: local pending else d.throttle; online throttleSent {level, sequence} cleared on result/attach/round/stand/sit; §8 test |
| R1-F8 | P2 | Throttle admission and state placement are underspecified against the duel module contract | fixed:R1 | 0 | §5.1 helmModule after round, reasons; §5.2 DUEL_KINDS, check order, noop status in result helper; snapshot via module flatten |
| R1-F9 | P2 | Station block content does not fit 248 px at FONT_SIZE; button text size and glyphs are unspecified | fixed:R1 | 0 | §2 text sizes (FONT_NATIVE labels), ASCII only, boxes for bars; station 300 wide; status = READOUT_W |
| R1-F10 | P2 | Map reserve and interior overlap not addressed when the readout moves left | fixed:R1 | 0 | §2 reserve {left,right} 228/156, arrows and notice centred on span, flight unchanged; INTERIOR_BAND top 42, y-42 readout rule dropped |
| R1-F11 | P2 | Click wiring and view-model inputs name interfaces the app does not have | fixed:R1 | 0 | §6.2 actions.console + setConsole slot set by modes; §6.1 DuelViewSource seat/uiHeld/throttle; paused defined |
| R1-F12 | P3 | Button focus and pointer rules are partly self-defeating | fixed:R1 | 0 | §3 no tabIndex; preventDefault on pointerdown/mousedown/contextmenu/auxclick for any button |
