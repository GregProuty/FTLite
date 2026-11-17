# Start aboard and station badges (2026-11-17)

Owner request, 2026-11-17: "for the demo, have the players start in the ship. And lets make it more obvious which station
is which. use the icons as indicators. right now its pretty much just weapons, helm and medical." Online Tab between the
Helm and Weapons views was asked for, then dropped by the owner; it is out of scope.

## 1. Start aboard (sim, SIM_VERSION 43 → 44)

- `createDuel` no longer seats anyone. Both characters stand where the interior spawns them: the layout's spawn tiles in
  order (the Hound: room Q, tiles 13,7 for player 0 and 14,7 for player 1), one door aft of the cockpit (room B), where
  the Helm (20,7) and Weapons (19,5) consoles are. A player walks in and presses E to sit, as after a stand today.
- Every round starts this way, the rematch's fresh interior included.
- `helmPlayer` stays in the state, the hash, the snapshot, the rematch and the wire, unchanged in format. It no longer
  seats anyone, so the lobby's Swap seats has no effect in play; removing it is a follow-up, not this change.
- The throttle starts at STOP as today, so the ship coasts until someone takes the Helm. Nothing else in the rules changes.
- Single player: you start as player 0, standing, on the SHIP view; player 1 stands away at its spawn, and Tab takes it
  as today.
- Online, the sync notice reads `TAKE A CONSOLE: E TO SIT` when this seat is standing (it still reads `YOU: HELM` or
  `YOU: WEAPONS` after a reattach to a seated character). An away partner on foot reads `STANDING BY` in the readout,
  in single player and online, rather than `WALKING`.
- Telemetry: a player's first sit in a round is not a console swap; only a sit at a different console than their last is.
- The scripted pair already walks to its own console and sits when unseated, so the goldens move without a script change.
- Bless procedure: baselines recorded at 43, bump to 44 alone and bless, then the change and a same-version bless.

## 2. Station badges (view only)

In the duel interior, each of the three working stations gets a badge on its console tile, so the ship reads at a glance:

| Station | Glyph (existing `drawIcon` kind) | Label | Red (offline) when | Faint when |
|---|---|---|---|---|
| Helm (Navigation console) | `navigation` | `HELM` | Engines at 2 | never |
| Weapons | `weapons` | `WEAPONS` | Weapons at 2 | never |
| Medbay | `medbay` | `MEDBAY` | never | the Medbay is not online |

- The badge is a dark plate (ink, alpha 0.7, rounded, 32 px) centred on the console tile with the glyph at 22 px in
  `TEXT`, `WARN` when offline, or `DIM` when faint. It sits over the desks and under the crew, so a seated character
  covers its own badge.
- The label is drawn on top of everything in the world (never washed by the lights), centred under the plate, in the
  badge's colour on a dark backing: twice the native font size over the whole-ship fit, so it reads at a glance, and
  native once the interior is zoomed in, so it stays inside the cockpit. The backing's width comes from m5x7's fixed
  advance (6 px a character at native size), not from measuring text, which needs a canvas the node tests lack.
- The generic room-centre glyphs for `navigation` and `medbay` are not drawn in the duel interior (they would duplicate the
  badges; the Hound's Navigation room centre is the Helm tile). The other room glyphs are unchanged.
- The existing amber outline on a free Helm or Weapons console stays as the "sit here" cue.
- Model: `stationBadges(d)` in `render/duel/interiorModel.ts` returns `{ station, kind, label, x, y, tint }` per badge,
  tint `'normal' | 'offline' | 'faint'`; the view only draws it.

## 3. Tests and gates

- Unit: `createDuel` leaves both standing at the spawns with every console free; a rematch's round does the same.
- Unit: `stationBadges` gives the three badges at their console tiles, red at level 2 for Weapons and Engines, faint while
  the Medbay is offline.
- Tests that assumed a seated start seat their players explicitly through a test helper (`seatDuelCrew`), or press E as
  a player would; no test asserting the old seating is kept as a rule.
- Gates: `npx tsc -b`, `npm test`, `npm run test:duel-app-runtime`, and screenshots of the solo start and the cockpit.
