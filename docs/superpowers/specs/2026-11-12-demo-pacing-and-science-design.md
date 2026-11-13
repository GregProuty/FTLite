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

- [ ] Tests and gates as above.
- [ ] Visual check by Claude: the event card with two votes, the helm-offline warning, a system scan detecting a hidden ship.
- [ ] Manual, the user: something happens at every jump, and Science has a real job.

## 6. Amendments

(Filled during implementation.)
