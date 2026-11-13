# The Two-Player Ship (Demo-x-a) Design

Status: 2026-11-12; implemented on branch `skiff` (amendments in section 6). The user, after a two-player playtest: "I want a new starting ship that is for two players. The Stations will have a pilot/weapons station as in combined. And a science/engineering/doors station. and lets get rid of the loading torpedos for that ship, it will auto load." And: "Basically Im trying to make this fun now, for a 2 player demo. I want to find the core gameplay loop and build on top of that."

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

- [x] Tests and gates as above (2026-11-12; figures in `docs/gates.md`).
- [x] Visual check by Claude: the Skiff, both group consoles with their tabs, a tab switch, a torpedo loading itself.
- [ ] Manual, the user: two players each own one console and are busy.

## 6. Amendments

Made during implementation (2026-11-12):

1. **Schema form.** Group members still list their own station entry (room, tile, allocation); each member's tile must equal its group's tile. A group needs at least two kinds; a kind may sit in one group only; the group tile must be a floor tile of a room; an ungrouped station may not share a group's tile. The layout hash covers the groups only when a layout has any, so the starter and the cutter keep their hashes.
2. **The seat follows the active tab.** `Seated.station` is the active tab's station, so every per-station reader (the card, the bot, telemetry, callouts) sees the tab the officer is working; sitting at a group always seats at its first tab, whichever member the Confirm picked. The flattened per-group state is the tab and a tab-bar flag (`groups.tab`, `groups.bar`); a ship without groups adds no values.
3. **"First row" per kind.** Up enters the tab bar from Navigation's first selectable row, the first Weapons or Science list entry (or an empty list), Engineering row 0 (power page) or the first Upgrades row, the first Doors item, and any row of an offline tab. Elsewhere Up moves the cursor as before. Left/Right on the bar wrap. On the bar the stick and Confirm go to the bar only.
4. **An offline tab keeps its occupant.** When one member fails or reaches zero bars while another member is online, the officer stays seated at every member, the offline one included (every consumer already checks that a station is online), so a repaired or re-powered tab is manned again at once. An offline tab takes no input except the way to the bar. Only when every member is offline does the officer stand. Seating needs one member online.
5. **The Skiff.** 18 x 9: Bridge (Helm group at 16,4), Ops (Ops group at 12,3; room glyph Science), a corridor, Life Support, Medbay, Engines (glyph Engineering, an airlock aft), Reactor and a Hold (the ventral airlock); a breach site in every room. Allocation Navigation 1, Weapons 2, Science 1, Engineering 1, Doors 1, Life Support 1, Medbay 1 (8 of 10, two spare bars). Life Support 1 rather than the starter's 2: the bot figures were identical at 1 and 2 on all six seeds tried.
6. **Drawn larger.** The world fit already caps the scale at 1, so the Skiff draws at scale 1 against the cutter's 0.83 with no renderer change; scaling past 1 was not done (non-integer scaling of the pixel art).
7. **Torpedoes on the Helm.** Because the Helm officer occupies Weapons on every tab, the tube loads (and the Pulse Laser charges) while the officer flies.
8. **Card and lobby.** The tab bar is an extra row on top of the card (the card grows one row); `>` marks the active tab in gold while the stick is on the bar; an offline tab reads `WEAPONS OFFLINE` in red. The Sit prompt names the group (`Sit: Helm + Weapons`, `Sit: Science + Engineering + Doors`). The lobby shows `Ship: Skiff (2 crew)` (or `Ship: Cutter (4 crew)` with three or four joined) on the row under the title, and on the Skiff the controls card's torpedo line becomes `Helm: evade as a hit lands. Up from the top row, Left/Right: tabs`.
9. **The gate floor.** `gate-skiff` is gate-duo's loop on the Skiff (no jump-charge pin; the captain bot flies from the Helm group). Its floor is 14, just under the observed minimum 15.0 (seed 2), not gate-duo's 25: traced, an enemy hit at 208 s sets Ops on fire and the healthier bot fights it alone from 52.6 to 15.0 while the hurt one (19.0, below the bots' retreat health) keeps out. The bots never switch tabs.
10. **Known left-overs.** The Doors console's door-selection outline shows whenever the Ops officer is seated, on any tab. The three consoles on the Ops tile each roll separately when an enemy shot lands in Ops.

