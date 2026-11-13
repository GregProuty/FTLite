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
- [x] Tests above (1221 tests, 1203 before; typecheck clean on both configs).
- [x] Visual check by Claude: a stripped shot's reason, a matched hit, the marked selector (2026-11-13, amendment 12).

## 5. Amendments (2026-11-13, implementation on branch `gunner-ui`)

1. **One sim fact, flattened.** The selector a shot was fired with and a volley's total damage are not in the existing last-shot fields (the gunner can cycle the selector inside the 3 s, and a Burst's two shots may both land), so `weapons.lastShotSelector` and `weapons.lastShotDamage` (hull damage dealt, 0 on a miss or strip) are added after `lootBought` in the flatten order. Written by `fireWeapon` and `fireLoot`, read by nothing in the sim. SIM_VERSION 33 -> 34, golden re-blessed once (0661052e -> 0a644af3).
2. **The selector form.** `Pulse freq 1 [2] 3  Torp`: brackets mark the enemy's known frequency, the selection stays lit amber, a bracketed selector that is not selected is green. Before the scan, while an enemy's shields stand, a last item `freq ?`. The fit rule (as Demo-xii): too wide for 404 px drops the word `freq` (`Pulse 1 [2] 3 ...`), then `freq ?` becomes `?`; never a smaller font. The widest case, two Missile Pods unscanned, reads `Pulse 1 2 3 Missile Missile Torp ?` (370 px).
3. **Known means scanned.** A lock needs a scan and a re-tune clears both, so `enemy.scanned` is the test. With the enemy's shield system down the frequency does not matter: no `freq ?` and no `Match`; the brackets still show once scanned.
4. **`Match freq N`.** On the second footer line after the stock, amber, only while a Pulse selector (not the torpedo, not a loot slot) is off the known frequency, the shields stand and no lock runs (under a lock the line reads `LOCKED` as before: the lock tunes every beam).
5. **Where the result shows on the card.** The shot result takes the second footer line for its 3 s (in place of the stock, `LOCKED` or `Match`); green for a hit, amber for a strip, white for a miss. The first footer line (the Pulse charge and the tube) stays.
6. **The result strings, in full.** `Hit: Shields room -15`; the hull room reads `Hit: Hold -15`; `Torpedo: Shields room -35`; a loot weapon by its short name with the volley total (`Burst: Piloting room -20`; any damage counts as a hit even when the volley's last shot missed); `Shield stripped (freq 1, needs 2)`, `Shield stripped (freq unknown)`, `Shield stripped (freq 2)` in the rare case the scan now reads the fired frequency (a re-tune and a re-scan inside the 3 s); a loot laser strip `Shield stripped (Heavy needs a lock)` (loot lasers have no frequency of their own, Loop-iii section 1); the ion cannon `Ion: shield stripped`, `Ion: Weapons room off 10s`, `Ion: Hold, no effect`; a debris kill `Hit: target destroyed` / `Torpedo: target destroyed`; `Missed`. All fit both the card (404 px) and the enemy window (384 px); the longest is 342 px.
7. **The enemy window line.** The window has room for two lines under the charge bar (status at 292, problem at 314, frame 340), so the shot result takes the problem line's place for its 3 s, then the problem (`Fire: Shields`) returns. Only shots at an enemy room show there; a debris shot shows on the card only.
8. **The corner.** `freq 2  45s` (two spaces before the re-tune countdown), `freq 2` with the shields down.
9. **The threats panel.** `Shot: Bridge 7s freq 2`, `Debris: Bridge 5s freq 2`. One row overflows the panel's 364 px: `Debris: Forward Corridor 99s freq 3` (cutter, 378 px); the fit rule drops the `Debris:` label (the cards' debris rows carry none) to `Forward Corridor 99s freq 3`. `objectThreatText` holds the rule; hudFit checks every kind in every room.
10. **The old glyph count.** The Loop-iii test held the strip to `CONSOLE_LINE_MAX` (40 glyphs); `Pulse freq 1  2  3  Missile  Missile  Torp` is 42 glyphs but 400 px. The check is now the pixel fit rule (`rowPx <= CARD_INNER_W`), as hudFit does.
11. **Gates.** The new fields are written only, so no gate moves; measured on the branch: `gate-skiff` min health 60.9 / 25.3 / 67.8, min hull 54 / 42 / 90, shots 22 / 7 / 19, hits 17 / 3 / 14; `gate-duo` 27.2 / 57.5 / 57.7, min hull 20 / 68 / 58, shots 14 / 15 / 21, hits 10 / 10 / 17 (both identical to Demo-xiii's final figures); every other gate passes with its pinned figures. No floor moved.
12. **Visual check (Claude, 2026-11-13).** The built app driven with real keys on the Skiff to the first fight (P1 on the Weapons tab, P2 at Science); the scan was set through a temporary, uncommitted state hook. Seen: an unscanned strip (`Pulse freq 1 2 3 Torp freq ?`, footer and window `Shield stripped (freq unknown)` in amber); scanned (`Pulse freq 1 [2] 3 Torp`, `Stock 3/6  Match freq 2`, the corner `freq 2`); a strip on freq 1 (`Shield stripped (freq 1, needs 2)` on both); the selector moved to `[2]` and a matched hit (`Hit: Hold -15` in green on both, the enemy 100% -> 86%).
