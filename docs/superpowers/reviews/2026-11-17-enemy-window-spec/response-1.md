# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `a8b6ff73`. 12 accepted, 0 rejected, 0 deferred. Each claim was checked against the cited code (input.ts, scene.ts, sinks.ts, views.ts, consoleLayout.ts, actions.ts, Stage.tsx, duelMode.ts) before fixing; sections 3-8 of the spec were rewritten.

## R1-F1 [P1]: T and Esc cannot go through createDuelKeyboard().ui; that object only carries React clicks into the keyboard

Confirmed against the cited code. §6.2: new createDuelKeyboard opts.intercept(code) consulted before PRESS_CODES; both modes pass it; tests in input.test

## R1-F2 [P1]: Esc is taken by a window that may be invisible: the console is hidden while paused, but the window state is never cleared on pause

Confirmed against the cited code. §3 defines shown (contact set, console non-null, helm/weapons); sync clears contact whenever hidden (any pause, banner, end, decided, SHIP, new epoch); Esc only taken while shown

## R1-F3 [P1]: The data path for the contact model is unspecified: React has no tactical state, the scene cannot read the store

Confirmed against the cited code. §6.4-6.5: scene owns a ContactController option, builds contactModel and ships DuelUiView.contact; hover computed in React from view polygons

## R1-F4 [P1]: The map left-click has no consumer: the pointer sample is drained inside the runtime and the online source, not where pickShip can run

Confirmed against the cited code. §6.2: pointer source takeClick() separate from sample(); scene option takeClick; scene runs pickShip on the frame's camera and calls controller.click; online drops while unfocused/blocked

## R1-F5 [P1]: The enemy damage table is not shareable today; it is inline in the Pixi closure

Confirmed against the cited code. §6.3: new pure roomLook(crew, level, phase) export in crtTheme.ts; drawShip refactored to call it; crtColours test pins the table

## R1-F6 [P1]: Window placement wording contradicts itself and the layout test

Confirmed against the cited code. §4.1: new CONTACT export (968,150,300x360) and SIDE_H; reserveRight grows to 324 while shown; layout test lists the elements

## R1-F7 [P2]: Window pointer handling: Stage is pointer-events none, and 'right-click anywhere' has no channel on the map

Confirmed against the cited code. §6.6: window root pointer-events auto, prevents contextmenu/mousedown/auxclick, swallows wheel; §5 cancel is right-click on the window only, map right-click keeps the drag

## R1-F8 [P2]: The blink clock is unnamed; React's CRT clock and the map's clock are out of phase

Confirmed against the cited code. §6.4: t is the scene's performance.now()/1000 passed to layer.draw; view ships resolved colours, React does not blink

## R1-F9 [P2]: The map prints no ship slot label, so the title row's 'same label the map prints' is undefined

Confirmed against the cited code. §4.2 title row is ENEMY SHIP plus close; slot-label wording dropped

## R1-F10 [P2]: A station change from Weapons to Helm (Tab in single player) leaves the aim state undefined

Confirmed against the cited code. §3 Station change: any station change disarms, window stays open; via sync's station edge; controller test

## R1-F11 [P2]: Several 'component' tests exercise app-layer behaviour a .tsx component test cannot reach

Confirmed against the cited code. §8 split: controller, model, tacticalModel pickShip, crtColours, input, scene, online and component tests

## R1-F12 [P3]: The hit radius is not quite the cull radius it claims to match

Confirmed against the cited code. §3 hit radius max(16, 2*SHIP_RADIUS*z, 1.9*SHIP_RADIUS*drawnScale(z)), non-crew active slots only, nearest wins

## Also changed

- Sections 4.2 (drawing box 276x200, 8 px padding), 6.1 controller method table and 6.6 actions are new detail needed by the fixes.

## Files changed

- docs/superpowers/specs/2026-11-17-enemy-ship-window-design.md

<!-- end -->
