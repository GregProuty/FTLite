# The Gunner Sees the Frequency (Demo-xiv) Design

Status: 2026-11-13. From the playtest addendum (`docs/playtest-report-2026-11-13.md`, T1 to T4). The frequency hook (Science finds the enemy's shield frequency, Weapons matches it) is the core co-op moment of a fight, and today the gunner cannot see it.

## 1. The Weapons card shows the frequency

- Once the enemy's frequency is known to the crew (scanned, or a lock running), the Weapons card's selector row marks the matching beam selector: `Pulse F1 [F2] F3 Torp` becomes `Pulse freq 1 [2] 3  Torp`-style or similar within the card width; pick a form that fits 404 px at 2x and test it. Before a scan, the row reads as today plus `freq ?`.
- If the selected beam does not match the known frequency, the Weapons footer says `Match freq 2` in amber.

## 2. Every shot says what it did

- The last shot's result shows for 3 s on the Weapons card's footer and as a small line under the enemy window's status: `Hit: Shields room -15`, `Shield stripped (freq 1, needs 2)`, `Shield stripped (freq unknown)`, `Missed`, `Torpedo: Shields room -35`. Use the sim's existing last-shot fields (`weapons.lastShotTick`, `lastShotTarget`, `lastShotResult`, `lastShotKind`) and add nothing to the sim unless a needed fact is missing; if it is, add it flattened (SIM bump and one bless).

## 3. One notation

- `F1`/`F2`/`F3` become `freq 1/2/3` (or the selector form chosen in section 1) everywhere a player reads it: the Weapons selector row, the enemy window's corner (`F2 1s` -> `freq 2  1s`), the threats panel's debris rows. Fit rule as Demo-xii: never shrink the font.

## 4. Tests and gate

- Card model: the marked selector, `Match freq N`, `freq ?`; the shot-result strings for each result kind; the enemy window line; every string within the hudFit widths.
- Full suite and typecheck; gates untouched unless the sim changed (then SIM bump, one bless, gates re-recorded, no floor lowered).
- [ ] Tests above.
- [ ] Visual check by Claude: a stripped shot's reason, a matched hit, the marked selector.
