# Pacing Fixes and the Science Officer's System Scan (Demo-x-b) Design

Status: 2026-11-12. The user's two-player playtest: "i didnt have anything to do in the first node. which makes sense. but i jumped to the next node, and nothing happened, and i jumped to the next node and nothing happened. And a was not able to jump past the first two nodes. so lets make sure we encounter a ship in one of those, and generally, not nothing. lets expand the science role, we need to be able to scan the system, and if theres a ship thats hiding or something it will see it. lets make this a percantage chance based on the skill of the officer."

## 1. What went wrong (reproduced in the sim on master, 2026-11-12)

- **Events closed silently.** An event opens a 15 s vote on arrival; with nobody voting it resolves to the safe choice ("Leave it"). To players who did not notice the top-of-screen line, nothing happened.
- **Empty and quiet beacons** in the first columns (Empty 15%, Event 25%, Shop 15%) meant the first jumps often held no fight.
- **The stuck jump.** On seed 2 the third jump failed because a random power failure had failed the Navigation console, standing the pilot up; jumps need a working Navigation. Nothing on screen said so.

## 2. Fixes

- **The first jump of each sector meets a ship.** Every beacon in column 1 of every sector is a Hazard (an enemy fight). Column 2 has no Empty beacons.
- **Fewer empty beacons.** Middle-column thresholds become Shop 0.15, Event 0.25, Asteroid 0.15, Empty 0.05, Hazard 0.40.
- **Events wait for the crew.** An event stays open until the first vote; the 15 s limit (and the 1 s settle) start then. Bots still vote on their first tick.
- **The event card.** An open event is shown as a large centred card over the world (FTL's event window): the title, the text, and the choices numbered `1.` `2.` `3.`, with each player's vote marked beside the choice, plus `Press Confirm to vote` for standing players and the Navigation rows for the seated officer. It closes when the event resolves.
- **The helm-offline warning.** While the Navigation station is failed or unpowered, a notice reads `HELM OFFLINE: repair Navigation to jump` (or the Helm tab's name on a group console), the Navigation card's jump rows read `Helm offline`, and the threats panel lists it first.

## 3. The Science officer's system scan

- **Scan the system.** At any beacon, the seated Science officer (or the Science tab of a group console) has a row `Scan system  (detect 62%)`. Confirm starts a scan lasting `SYSTEM_SCAN_TIME` (8 s at output 1, scaled like today's scans). One scan per beacon visit.
- **What a scan finds**, each with its own chance `p = SCAN_DETECT_BASE + SCAN_DETECT_SKILL × Science skill level` (0.45 + 0.15 per level, capped 0.95), one `rng.loot` draw each, shown on the card as a percentage:
  - **A hidden ship.** Some beacons hide an ambusher: Empty beacons with `AMBUSH_CHANCE` (0.5), Event beacons with 0.2, drawn when the map is made. An undetected ambusher arrives `AMBUSH_DELAY` (30 s) after arrival with surprise: its shots start charged and our crew gets the contact notice only 3 s before. A **detected** one is revealed: the notice `Hidden ship detected: cloaked raider`, the threats panel lists it, and the crew may jump away (if the drive is ready) or fight it with a first strike: it arrives with its shields down for 10 s.
  - **A hidden cache.** Empty beacons with `CACHE_CHANCE` (0.4) hide a cache (scrap 20–40 by depth, or 2 fuel). A detected cache is collected by the scan.
  - **Neighbouring beacons.** Each unvisited beacon reachable from here is revealed (its type shown on the map and in the Navigation rows) with chance p.
- **Results** are listed on the Science card for 10 s and summarized in a notice.
- Bots never scan; ambushers still find bot crews, so gates re-record.

## 4. State, tests, gates

- New fields: per-beacon `ambush` and `cache` (bits, drawn at map generation from `rng.map` after the types), per-beacon `revealed` bits, the scan's start tick and result. Flattened; SIM version bumped once; golden re-blessed once.
- Tests: column 1 all Hazard, column 2 no Empty, the new thresholds; events wait for the first vote; the card's model (title, text, numbered choices, vote marks); the helm-offline notice and rows; the scan's row, time, percentage, the three findings with their draws, one scan per visit; ambush timing undetected and detected (first strike); caches; neighbour reveals; gates re-recorded with causes; no floor lowered.

## 5. Gate

- [x] Tests and gates as above (`docs/gates.md`, Demo-x-b).
- [x] Visual check by Claude: the event card with two votes, the helm-offline warning, a system scan detecting a hidden ship.
- [ ] Manual, the user: something happens at every jump, and Science has a real job.

## 6. Amendments

Made during implementation (2026-11-12); none lowers a gate floor.

- **P1 Column 1 draws nothing.** Column 1's beacons are Hazard without a type draw, so the map stream makes one draw per node of columns 2 to 4 only; a draw in column 2 that falls in the Empty band (0.55 to 0.60) is a Hazard. The shop fallback (column 3 node 0) is unchanged.
- **P2 The helm-offline rows.** Every way-on row (the destinations and the exit's sector row) reads `Helm offline` and is disabled; a wait row is unchanged. A failed or unpowered console stands its officer up, so on this branch the rows are only seen by the model and the map; there is no group console here (that is Demo-x-a), so the Helm-tab wording is not implemented. The notice puts `HELM OFFLINE: repair Navigation to jump` over the first line of the ordinary notice, and drops the `JUMP READY` line while the helm is offline (nobody can take Navigation).
- **P3 The event's wait.** `eventOpenTick` is now the first vote's tick (-1 until then); it is set in the decision step once any vote stands, whether a standing press or the officer's row. An event nobody votes on stays open. The notice reads `EVENT: <title>   waiting for a vote` until then, then `vote Ns` as before.
- **P4 The card's words.** The status line reads `Waiting for the first vote`, then `Deciding in Ns`; the help line `Press Confirm to vote   Navigation officer: pick a row`; votes show as `< P1 P2` at the right of the choice in gold. The title, the text rows and the choices are drawn at twice the font size; the card sits 720 px wide from y 112 and ends above the seated console cards.
- **P5 The scan's row and cursor.** The row is the last row of the Science list. The Science cursor -1 (no target) is the row, so Up/Down cycle the targets and the row, and an officer with nothing warned can press Confirm at once; a new warning still pulls a cursor at -1 onto it. The scan runs while Science is online and occupied, wherever the cursor is; standing pauses it. The row reads `Scan system  (detect 60%)`, `Scanning system  45%`, then `System scanned`.
- **P6 Draws only for what is there.** The ship draw is made only for an ambusher still on its way; the cache draw only for a cache at this beacon; one draw per unknown reachable beacon in `reachable()` order (not visited, not charted, not a shop, the exit or an overrun column). A scan with nothing to find draws nothing, so it never tells the crew whether something was missed. A found cache takes a second `rng.loot` draw: below 0.5 it is 2 fuel, else scrap `20 + round(20 x depth / 17)`.
- **P7 The ambusher.** It is armed on arrival at an Empty or Event beacon that holds one (not overrun, not the final beacon) and spent then, so a return finds none; an event's fight or the Pursuit replaces it. Undetected, its first shot fires on the tick after it arrives and the notice `AMBUSH: a hidden ship decloaks!` shows only in the last 3 s. Detected, it arrives at the same tick with the usual first-shot clock, its shield layers at 0 and its shields system ionised for 10 s (the existing ion rule: no recharge, the re-tune clock held). Until it arrives the notice reads `Hidden ship detected: cloaked raider   contact Ns` over `Strike first: its shields will be down 10s` (or `Jump away, or strike first: shields down 10s` with a ready drive) and the threats panel lists `Hidden ship: contact Ns` after the helm line.
- **P8 The results.** The Science card lists three lines for 10 s (`Hidden ship detected: cloaked raider` or `No hidden ship found`; `Cache found: +28 scrap` / `+2 fuel` or `No cache found`; `Charted 2 beacons` or `No beacons charted`); the notice reads `SCAN: hidden ship detected, cache +28 scrap, 2 beacons charted` (or `SCAN: nothing found`) for 5 s, ranked after a pending jump, an open event and a purchase. `science.systemResult` holds the finding bits with the charted count from bit 3. A charted beacon shows its type on the map and in the Navigation rows; the marks clear at a sector jump.
- **P9 Gates.** The boarding gate's figure moved with the map, not with any floor: its captain bot's first jump now always meets a ship (see `docs/gates.md`).
