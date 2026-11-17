# Ledger: art-ii-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Console sprites are padded grid cells, so centring and quarter-turning them misplaces the art | fixed:R1 | 0 | s2 one one-frame output per console sprite bound by name; centre anchor, quarter turns about centre, top-left on whole art pixel |
| R1-F2 | P1 | The crew foot anchor is 'measured at load', but the assets API has no pixel access, and 'per sheet' is ambiguous | fixed:R1 | 0 | s1 measured offline: LIMEZU_FOOT_ROW 31, LIMEZU_HEAD_ROW 7 constants; anchor y = 32/32; no load-time measuring |
| R1-F3 | P1 | The palette builder is to be 'ported' from a script that is not in the repo, with no requirement to reproduce the committed palette | fixed:R1 | 0 | s4 algorithm written out (k = 48 - kept, init, 12 Lloyd, mapping, overrides file contents); TS builder canonical; build regenerates palette + import; owner-local git-diff-empty check |
| R1-F4 | P1 | The 'down' console strip is said to use the failed role, but today's strip is WARN red and the new failed role is khaki | fixed:R1 | 0 | s2 consoleArt drops the strip/cursor; s4 overrides failed to #e06715 so failed tiles read as fault |
| R1-F5 | P1 | Blasts need assets and the hit signal in the same module, and no module has both today | fixed:R1 | 0 | s3 interiorFeel owns blasts: optional blasts animations option, plain Sprites framed from clock.t, removed at end |
| R1-F6 | P2 | Blast placement, size, count and cap are underspecified | fixed:R1 | 0 | s3 one blast per hit room at centroid rounded to 2; duel at the smoke tile; spark per opened breach; 2x, anchor .5; shared cap 4; under flash |
| R1-F7 | P2 | The cursor blink and down strip, placed from the desk rectangle, will land at arbitrary spots on the console art and may be hidden under it | fixed:R1 | 0 | s2 no strip or cursor with consoleArt; sprites in a child container at index 0 under fixtures |
| R1-F8 | P2 | The carried torpedo at y-30 will sit on a LimeZu character's chest or head | fixed:R1 | 0 | s1 carry offset (31-7)*2+6 = 54 with crewArt; plan checks callouts |
| R1-F9 | P2 | Downed pose: the pivot, turn direction and reset are unspecified | fixed:R1 | 0 | s1 +90 deg clockwise about centre, anchor .5/.5 at crew position, restored otherwise; tested |
| R1-F10 | P2 | The seated facing needs the console's wall side, which the crew layer does not have | fixed:R1 | 0 | s1 pure stationSides(state) from consoles(), cached by layoutHash; s-wall overlap accepted |
| R1-F11 | P2 | Paid manifest entries for LimeZu and Pimen lack the store URLs, dates and the Pimen credit the validator requires | fixed:R1 | 0 | s5 per-pack source URL, retrieved 2026-11-16, credit lines; Maru/Pimen terms an owner check in gates.md |
| R1-F12 | P3 | The `console.<kind>` naming and the console layer's signature are unstated | fixed:R1 | 0 | s2 console.<STATION_IDS id>; createConsoleLayer(assets), both call sites |
