# The Two-Player Ship (Demo-x-a) Design

Status: 2026-11-12. The user, after a two-player playtest: "I want a new starting ship that is for two players. The Stations will have a pilot/weapons station as in combined. And a science/engineering/doors station. and lets get rid of the loading torpedos for that ship, it will auto load." And: "Basically Im trying to make this fun now, for a 2 player demo. I want to find the core gameplay loop and build on top of that."

## 1. Combined consoles

- A ship layout may declare **console groups**: `consoleGroups: [{ tile: [x, y], kinds: ["navigation", "weapons"] }, ...]`. Each listed kind's station sits on that one tile (the schema's one-station-per-tile rule is relaxed for group members only). Kinds not in a group keep their own console as today.
- **Sitting** at a group console seats the player at every kind in the group: each of those stations has that player as its occupant, so manning rules hold for all of them at once (Navigation evasion counts while the same officer fires Weapons).
- **The card has tabs.** The console card shows a tab bar on its top row: `HELM | WEAPONS`, or `SCIENCE | ENGINEERING | DOORS`. Pressing Up from the first row moves onto the tab bar; Left/Right there switch the active tab; Down returns to the rows. All other input goes to the active tab's station, exactly as that station's own console works today. The active tab is a per-station-group field, flattened, reset to the first tab on sitting.
- Standing, being downed and a failed station follow today's rules per kind: if one kind in the group fails or loses power, only that tab is offline (shown `OFFLINE` on its tab), and the officer stays seated on the others.

## 2. The ship: the Skiff

- A new layout `skiff.json`, original, smaller than the cutter (about 18 × 9 tiles), for two players:
  - **Bridge** (front): the Helm console group (Navigation + Weapons);
  - **Ops**: the Ops console group (Science + Engineering + Doors);
  - **Medbay**, **Life Support** (Oxygen), **Engines/Reactor** as rooms with their own systems; Life Support and Medbay stations keep their own consoles (passive systems, rarely visited);
  - two or three corridors or small rooms between them, so fires and breaches have somewhere to spread;
  - two airlocks (Demo-vii), breach sites in most rooms;
  - **no magazine**, so torpedoes load themselves (Coop-ii's no-magazine rule).
- Room-type glyphs and the flat tile look as on the cutter. The ship is drawn larger than the cutter, because it is smaller in tiles.
- Starting power allocation suits two people: Helm and Ops powered, Life Support and Medbay powered, spare bars for Engineering to route.

## 3. Which ship flies

- With one or two players joined, the run uses the Skiff; with three or four, the cutter. The lobby line under the title names it: `Ship: Skiff (2 crew)`.
- `starter.json` stays for tests and gates.

## 4. Tests and gates

- Schema: console groups, the relaxed tile rule, validation (unknown kinds, a kind in two groups, a group tile not in a room).
- Seating at a group sets every member's occupant; tabs switch by Up onto the bar and Left/Right; input reaches only the active tab's station; one kind failing leaves the others working; standing clears all.
- The Skiff parses; every station reachable; torpedoes auto-load; airlocks valid.
- A new `gate-skiff` (two bots, three seeds, the calm start then the sector run as in gate-duo) with a recorded floor; the cutter, starter and existing gates unchanged.
- Snapshot round trip with the tab field; SIM version bumped once and the golden re-blessed once (the starter is unchanged, so only the version moves the hash).

## 5. Gate

- [ ] Tests and gates as above.
- [ ] Visual check by Claude: the Skiff, both group consoles with their tabs, a tab switch, a torpedo loading itself.
- [ ] Manual, the user: two players each own one console and are busy.

## 6. Amendments

(Filled during implementation.)
