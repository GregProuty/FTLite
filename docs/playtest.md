# Couch playtest checklist (the Skiff, two players)

Replaces the Demo-i script (2026-11-13). Claude's own playtest and its findings: `docs/playtest-report-2026-11-13.md`.

Date:
Players (who sat where):
Build (commit):
Seed (shown on the summary):
Screen and distance:
Devices (keyboard / pads):

Run `npm run dev`. Don't coach during the first fight. Tick each step as seen, and note anything that went wrong next to it. Severity: **crash/stuck** > **didn't understand** > **boring or unfair** > **polish**.

## 1. Start
- [ ] Both join (E, Enter / A); the lobby says `Ship: Skiff (2 crew)`; Confirm starts.
- [ ] Each player finds their seat without help: Helm in the Bridge (front), Ops in the room with the eye. Time to sit: ____ s.
- [ ] Each player switches tabs (Up from the top row, Left/Right).

## 2. First beacon and first jump
- [ ] The Ops officer runs `Scan system` and reads the result.
- [ ] Time spent waiting before the first jump: ____ s.
- [ ] The Helm picks a node and the other player agrees. Did it jump with both seated? (Known blocker B1.)

## 3. First fight
- [ ] Both know what the enemy is doing (the threat panel, the window).
- [ ] The gunner targets a room on purpose (which? why?) and fires the Pulse and the torpedo.
- [ ] The Ops officer scans the shield, the gunner matches the frequency.
- [ ] Someone leaves their seat for a fire or a breach. Who, and why?
- [ ] Surrender offered? What did you choose?
- [ ] Hull lost: ____. Fight length: ____ s.

## 4. Between fights
- [ ] An event: both players vote. Did the Ops officer get a vote? (Known blocker B3.)
- [ ] A shop: what did you buy, and who chose? Did the cursor stay on the shop rows? (Known blocker B2.)
- [ ] Engineering: move a power bar; buy an upgrade from the Upgrades page.
- [ ] A loot weapon: equip it, fire it.
- [ ] Boarders: who fought them, did venting or sealing doors help?

## 5. The run
- [ ] A sector exit; fuel never ran out (or: what happened when it did).
- [ ] The pursuit: did you notice it closing in?
- [ ] The Warden: reached? Won? What killed you if not?

## 6. After the run, ask each player (write their exact words)
1. What killed us?
2. Which choice mattered most?
3. Where did you wait with nothing to do?
4. What would you do differently next run?
5. Would you play again right now? (yes / no)

## 7. Separately
- [ ] Swap seats and play the first fight again.
- [ ] Three or four players on the Cutter: carrying torpedoes, separate stations.
- [ ] Unplug a pad mid-run; alt-tab out and back.
