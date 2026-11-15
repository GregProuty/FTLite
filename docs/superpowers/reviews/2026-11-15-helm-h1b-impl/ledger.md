# Ledger: helm-h1b-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Weapons queues commands the sim rejects | fixed:R1 | 0 | runtime gates laserCharge on canCharge and missileLaunch on canLaunch at tick time; release only after a sent press; charge never voided by a same-tick launch (sim order); tests for each unavailable state and F-then-release |
| R1-F2 | P1 | Tab can invalidate commands queued before the switch | fixed:R1 | 0 | Tab (and stand) drops the left character's pending lock/charge/launch; a sent charge needs no release (sim lets go of Fire when Weapons is unattended, weapons.ts:75); two-frame one-tick test |
| R1-F3 | P1 | Sampled pointer input survives Tab and restart | fixed:R1 | 0 | the frame's sampled pointer drag/wheel is discarded after a Tab or restart, and Tab resets the wheel accumulator; tests for both |
| R1-F4 | P1 | Three crowded arrows can overlap after spreading | fixed:R1 | 0 | spreadArrows places arrows monotonically along each edge with a minimum gap, clamped to the edge; tests for 3 and 4 clustered arrows |
| R1-F5 | P2 | Missile prediction starts from a different position than its glyph | fixed:R1 | 0 | missile path's first point is the interpolated glyph position; layer strokes from it; test at alpha < 1 |
