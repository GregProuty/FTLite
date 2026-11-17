# Enemy ship window (FTL-style targeting) — design

Date: 2026-11-17. Status: approved by the owner in chat ("this looks right"). Tier: views/feel (presentation only).

## 1. Goal

Bring back FTL's enemy-ship panel for the duel. The Weapons officer clicks the enemy on the tactical map. A window opens with a large map of the enemy ship's rooms. They click LASER, the cursor becomes a targeting reticle, and they click the room to target. The Helm can open the same window to see the enemy, but cannot aim. Everything is drawn in the CRT amber style.

This is the first piece of the future **Science** role: clicking things on the system map and scanning them. So the window is built as a general *contact window* about one map contact, here a ship. Later Science work adds other contacts and a scan action to the same window. This spec builds only the ship contact and the laser aim (YAGNI).

## 2. Owner decisions (fixed)

- **Laser only.** Only the laser is aimed from the window. The missile keeps its hand steering (A/D) and shows in the window as not aimable.
- **Aiming only sets the target.** Clicking a room sets the laser's lock room, exactly like the WEAP/SHLD/ENG buttons and E/Q do today. Firing stays on FIRE / Space. There is no auto-fire.
- **Presentation only.**
  - No sim change: `SIM_VERSION` stays 42 and the goldens don't change.
  - The aim goes through the existing lock command, `actions.console.lock(room)`, so it behaves the same in single player and online.
- **CRT style** for now. The window, the room drawing and the reticle use the CRT amber ramp (`CRT` in `render/tactical/crtTheme.ts`).

## 3. Opening and closing

- **Where.** On the Weapons and Helm console views (`duel.console.station` is `'weapons'` or `'helm'`), a left-click on an enemy ship on the tactical map opens the window for that ship.
  - A hit is a click within the ship's drawn size: the same radius the map uses to cull it, `SHIP_RADIUS * 1.9 * drawnScale(z)` on screen, with a minimum of 16 internal px.
  - The window doesn't open from the SHIP station view or from the flight view.
- **`T` key.** `T` toggles the window for the crew ship's current laser target, `systems[crew].target`. This helps when the enemy is small or off screen. `T` is unused today.
- **Closing.** The window closes on:
  - its ✕ button;
  - `Esc`, which first cancels an active aim (§5) and closes only on a second press. `Esc` is the duel's pause key (`app/duel/input.ts` maps `Escape` to `pause`). While the window is open it takes `Esc`, and the press doesn't pause. With the window closed, `Esc` pauses as today, in single player and online.
  - a left-click on the same ship on the map;
  - `T` again;
  - leaving the console view (switching to the SHIP tab or ending the duel);
  - the shown ship becoming inactive (destroyed).

  A left-click on a different enemy ship switches the window to that ship.
- **The game keeps running.** The window isn't modal. The map, keys and console buttons all keep working. Clicks on the window are consumed by the window and never reach the map.
- **Local to each player.** Whether the window is open, its ship and the aim state belong to that player's screen. They are never sent over the network.

## 4. The window

The window is a bezelled CRT panel. It sits over the right part of the map area, inside the console reserve (`CONSOLE_RESERVE`), under the side column. It mustn't cover the tab strip, the station block or the crew ship at the map centre. The exact rectangle is fixed in the plan and checked by a layout test: it lies inside the map area and overlaps no console element.

Contents, top to bottom:

1. **Title row:** `ENEMY SHIP` (the contact window's ship kind), then the ship's slot label (the same label the map prints), then the ✕ button.
2. **Status row:**
   - shield pips (filled = layers up, out of the class's layers);
   - a `HULL` bar with the hull value, in the same bar style as the status table.
3. **Ship drawing:**
   - **Outline.** The enemy's hull outline from `hullModel.ts` (`HULLS[hullFor(false)]`, the drone scout), scaled to fill the drawing box and pointing right (nose +x). The outline is drawn in the enemy look from the map (glass fill, `main` stroke).
   - **Rooms.** Each of the three rooms is drawn with:
     - its polygon;
     - a label at `roomCentre`: `WEAP`, `SHLD` or `ENG`;
     - its damage level 0/1/2. The damage uses the same enemy damage table and blink as `tacticalLayer.ts` `drawShip`, so the window and the map always agree.
   - **Lock mark.** The crew laser's lock room (`systems[crew].lock`) carries a reticle mark, but only while the shown ship is the crew's laser target. It moves at once when the lock changes, from the window, the buttons or E/Q.
4. **Weapon list (Weapons station only):**
   - **`LASER`:** charge bar and state (the same `label`/`value` as the station block). It is clickable.
   - **`MISSILE`:** `MAG n` and `STEER A/D`, greyed and not clickable.
   - **Wrong ship.** If the shown ship isn't the crew's laser target, LASER is disabled and the row reads `NOT TARGETED`. Today's duel has one enemy, so in practice this never shows.

The **Helm** sees items 1 to 3 only: no weapon list, and clicking rooms does nothing.

## 5. Aiming

1. **Arm.** Clicking LASER (Weapons only, enabled) arms the aim. LASER shows lit.
2. **Reticle.** While the aim is armed and the pointer is over the window's ship drawing, the system cursor is hidden and an amber reticle is drawn at the pointer. The reticle is a CRT `hot` ring with four ticks, about 20 internal px. Outside the drawing the normal cursor shows.
3. **Hover.** The room under the pointer (point-in-polygon on the room's polygon in window space, using `pointInPolygon`) is highlighted: its stroke is `hot`.
4. **Pick.**
   - Left-clicking a room calls `actions.console.lock(room)` and disarms the aim. The window stays open.
   - Left-clicking inside the drawing but outside any room does nothing; the aim stays armed.
5. **Cancel.** Right-click anywhere, `Esc`, clicking LASER again, or closing the window disarms the aim without changing the lock.

The WEAP/SHLD/ENG buttons, E/Q and the map's lock marker are unchanged and stay in step with the window, because they all read and write the same lock.

## 6. Architecture

- **Pure model** (`render/duel/contactModel.ts`, new). Its inputs are the tactical state, the crew slot, the station, the window state (shown ship, aim armed, hover point) and the time used for blinks. It produces the window's draw data:
  - title, shields, hull;
  - room polygons in window space, with each room's damage look and label;
  - the lock-mark room;
  - the weapon rows with enabled/lit/greyed;
  - the hovered room.

  It also exports `pickShip(...)`, the map click → ship slot or null, from the same ship positions and scales as `tacticalModel.ts`.
- **Window state** sits in the local UI store: `contact: { ship: number; aim: boolean } | null`. It is per screen and not part of the sim or the network messages.
- **React component** (`ui/duel/ContactWindow.tsx`, new). It draws the panel, rows and buttons with the existing stage parts (`Panel`, `PixelText`, `Bar`, `Button`). It draws the ship and rooms as SVG polygons inside the CRT glow (`CrtGlow`), so the CRT filter and scanlines apply as they do to the other console overlays. Pointer events on the drawing do the hover, pick and cancel.
- **Map click.** A left-click on the map area while a console view is shown calls `pickShip`; a hit opens or switches the window. The pointer source in `app/duel/input.ts` gains a left-click sample (position at pointerdown, button 0). Right/middle drag is unchanged.
- **Keys.** `T` and `Esc` go through the duel keyboard's UI handling (`createDuelKeyboard().ui`), like the other console keys.

## 7. Errors and edge cases

- The shown ship is destroyed or inactive: the window closes and the aim disarms.
- The station changes to SHIP, or the duel ends: the window closes.
- The lock is changed elsewhere while the aim is armed: the mark follows; the aim stays armed.
- The crew laser is offline (Weapons room damaged): LASER can still be armed and a room picked. The lock is a target choice, not a shot, as it is with the buttons today.
- Window resize or letterbox: the hit tests use internal pixels (the existing `toInternal` mapping), so they're unaffected.

## 8. Testing

- **Unit (`tests/contactModel.test.ts`):**
  - room polygons sit inside the drawing box;
  - room damage looks match the map's table for levels 0/1/2 on both blink phases;
  - the lock mark appears only when the shown ship is the laser target;
  - the hovered room comes from point-in-polygon;
  - the Helm gets no weapon rows;
  - LASER is disabled for a non-target ship;
  - `pickShip` hits within the drawn radius and misses outside it.
- **Component (`tests/contactWindow.test.tsx`):**
  - a map click on the enemy opens the window;
  - `T` toggles it;
  - LASER arms, and clicking the SHLD room calls `lock(1)` and disarms;
  - right-click and `Esc` cancel without calling `lock`;
  - `Esc` again closes;
  - with the window open, `Esc` doesn't pause; with it closed, `Esc` still pauses;
  - Helm has no weapon list and room clicks do nothing;
  - the window closes on the SHIP tab.
- **Layout test:** the window rectangle is inside the map area and overlaps no console element.
- **Unchanged guards:** `SIM_VERSION` 42 and the goldens.
- **Screenshots:** with the `.art/shots` harness, take Weapons with the window open (idle, aim armed over a room, after a pick), Helm with the window open, and both blink phases with a damaged room. Add the owner look check to `docs/gates.md`.

## 9. Out of scope

- Missile room targeting.
- Auto-fire.
- Scanning and other contact kinds (later Science work).
- A non-CRT look.
- Changing the map's own lock marker.
