# Claude's playtest, 2026-11-13

Build: master d3da761 (the thin walls and boarder figures). Ship: the Skiff, two keyboard players (P1 WASD at the Helm, P2 arrows at Ops). Played in the real app through Playwright, pressing only the players' own keys, with screenshots and a state log every few seconds. Where a step would have taken minutes of waiting, the run was moved on with a debug hook. Those steps are marked **fixture** below. What a hook did is not evidence that the game gets there by itself.

Goal of the test: is this fun, and does it play like FTL, for two people on a couch?

## Verdict

The core is there and parts of it are already good: the sector map, the enemy window with its five targetable rooms, a torpedo opening a 35-hull hole and starting a fire in the enemy hold, the surrender offer ("hold fire 7s for +19 scrap"), the event card, and the shop. But on the Skiff, **three control-flow bugs stop two seated players from playing the loop at all**. And **two pacing problems drain the tension FTL runs on**. Fix those five before anything new.

## What I did, in order

1. **Lobby.** Joined both players, started. The lobby is eleven lines of rules, and one is wrong: "Reach node 8 to win" (the run is now three sectors and the Warden).
2. **Finding the consoles.** Nothing on the ship shows where a console is. I found the Helm and Ops seats from the layout file; a player has only the room glyphs and has to walk around until a `Sit:` prompt appears.
3. **Sitting.** Both group consoles seat correctly, and the tab bars read well (`HELM | WEAPONS`, `SCIENCE | ENGINEERING | DOORS`). The map appears beside the Helm card and is clear.
4. **The start beacon.** "Safe here. Jump when ready", but the drive reads 12% and needs about **60 s** to charge. The Science officer can scan the system (about 15 s), and then both players wait. This is the "nothing to do in the first node" the user reported, still there.
5. **The first jump: deadlock.** P1 picks a node and Confirms. The notice reads `Jump to Node 2a? (1/2)  Anyone standing: press Confirm to agree 4s`. P2 is seated, so P2's Confirm goes to the Science card, and the jump **cancels after 5 s**. With both players at their consoles the ship can never jump. Workaround: P2 stands (Cancel), presses Confirm, and sits again. (`run.ts:331`: the agreement counts only a standing Confirm, or a crew of one.)
6. **The first fight.** The enemy arrives about 8 s after the jump. P1 goes to the Weapons tab (Up, Right, Down). The target rows (`Hold hull 100%`, `Weapons room 100%`...) and the reticle in the enemy window are clear. Fired the torpedo: **35 hull and a fire in the enemy hold**, which then burned more hull. That is the best moment in the game so far. The Pulse fired blind on F3 (S? unknown) and hit for 15.
7. **Pace of the fight.** The Pulse recharges in about **12 s**. After 60 s the enemy was at 36%, its shield back up between shots, and **we had lost 8 hull**. Their shots set our Engines alight and breached the Corridor. Nobody moved, because both players were seated, and **the Engines fire burned at full size for over a minute with no effect on anything** (fire on our ship only drains oxygen and hurts crew who stand in it; it never damages systems or the hull, while fire on the enemy ship does both).
8. **The surrender (fixture: enemy hull set to 8).** `ENEMY SURRENDERS hold fire 7s for +19 scrap`, the enemy fled and the drive was ready at once. Good FTL decision moment.
9. **An event (fixture: column 1 set to Event, drive charged).** The card is clear ("A trader with fuel to swap and a cat asleep on the console", three numbered choices, `< P2` beside the vote). Problems: P2, standing after agreeing to the jump, **could not sit back down while the vote was open** (Confirm became a vote); and a seated Ops officer has no way to vote. The Helm officer effectively decides alone.
10. **After the event: the cursor jumped me sideways.** The choice rows vanished and the Navigation cursor stayed at its row number, now on `Node 2b ?` (a sideways move), so the next Confirm took us to the wrong beacon.
11. **A shop (fixture: column 1 set to Shop, scrap 120).** Clear list with prices, and the notice bar repeats it. Bought torpedoes and a Missile Pod. Then the same cursor bug: the Missile Pod row vanished and the cursor landed on `Node 3a ?`. **One more Confirm leaves the shop.** Only the Helm officer can buy; the Ops officer watches.
12. **Engineering.** The power page and the tab switch work and read well. Not tried: buying an upgrade.

## Findings, ranked

### Blockers: the loop does not work for two seated players

| # | Finding | Evidence | Proposed fix |
|---|---|---|---|
| B1 | A jump needs a second Confirm from a **standing** player; on the Skiff both players sit, so every jump cancels after 5 s. | Step 5; `run.ts:331` | Any other conscious player's Confirm agrees, seated or standing (the press goes to the jump, not to their card, while a jump is pending). |
| B2 | After a purchase or an event, the Navigation cursor keeps its row number while the rows above it disappear, so it lands on a jump row; the next Confirm jumps away. | Steps 10, 11 | When the row list changes, keep the cursor on the same item, or move it to the first row; never onto a jump row it was not on. |
| B3 | Only standing players and the Helm officer can vote in an event; a standing player cannot sit during a vote. The Ops officer has no voice. | Step 9 | While an event is open, every player votes from wherever they are: Up/Down moves their own mark on the event card, Confirm votes. Sitting stays possible. |

### Pacing: where the tension leaks out

| # | Finding | Evidence | Proposed fix |
|---|---|---|---|
| P1 | The calm start beacon makes the crew wait about 60 s with nothing to do. FTL lets you leave the first beacon at once. | Step 4 | The drive starts full at a sector's calm beacon. |
| P2 | Fire on our ship does not damage systems or the hull. An unattended fire is harmless unless someone stands in it, so the seated crew never has to get up. In FTL, fire burning a system is the main reason to leave your post. | Step 7; `hazards/fire.ts` has no system damage | Fire damages the room's station (failing it, as the enemy's fires do: `ENEMY_FIRE_SYS_DPS` 1.5/s), and a failed station needs a repair. This makes the Skiff's Ops room the hot spot it was meant to be. |
| P3 | Fights are slow and low-threat: a 12 s Pulse, the enemy shield back between shots, 8 hull lost in a minute. | Step 7 | After P2, re-time: Pulse about 8 s at level 2; the first enemy hits hard enough to cost 15 to 25 hull if ignored. Retune with the bots and the scripted gunner, never lowering a floor. |

### Readability and teaching

| # | Finding | Proposed fix |
|---|---|---|
| R1 | Consoles are invisible; you find a seat by walking until a prompt appears. | Draw a console glyph at every station tile (a desk with a screen, in the room's system colour), lit when free. |
| R2 | The lobby says "Reach node 8 to win". | "Cross three sectors and destroy the Warden." Cut the controls card to the five lines a new player needs. |
| R3 | Cryptic strings: `Lead 18s` on the Science card, `Enemy 100% 117s S? [#]`, the skill line `N0 E0 W0 S0 C0 R4`. | Spell them out: `Pursuit 18s behind`, `Enemy 100%  leaves 117s  shield freq ?`, skill names on a key press or only on level-up. |
| R4 | `EVADE: Confirm` shows at peaceful beacons, shops and events, where nothing can be evaded. | Show it only while an enemy or a field is present. |
| R5 | An event is listed in red in the threats panel (`Event: free trader`). | Use the default text colour for non-threats. |

## Good, keep it

- The sector map beside the Helm card: route, `?`, `$`, `!`, EXIT, pursuit.
- The enemy window: ship on its side, five rooms, reticle, shield ring, interior fires and breaches.
- The torpedo: a big, visible hit that starts a fire. Combat's best moment.
- The surrender and flee offer, with scrap on the line.
- The event card and the free trader's cat.
- Two console groups with tabs; the Skiff really does keep both players busy once B1 to B3 and P2 are fixed.
- Thin walls and boarder figures (this morning's change) read well.

## Not covered by this playtest

Boarders in a fight (only the figures were checked), buying an upgrade, a sector exit, the Warden (checked visually on 2026-11-12), crew death and revive, the Cutter with three or four players, gamepads, audio, and a whole run start to finish. The checklist in `docs/playtest.md` covers these for the human playtest.

## Recommended order

1. B1, B2, B3 (one small feature: "the Skiff's two seats").
2. P1 and P2 (start beacon, fire burns systems), then re-record the gates.
3. R1 to R5 (visible consoles, copy).
4. P3 combat tempo, then a second Claude playtest of a whole run, then the human playtest.
