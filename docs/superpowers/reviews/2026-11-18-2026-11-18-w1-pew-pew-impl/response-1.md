# Round 1 response (implementation revised, commit 4fe086bd)

Reviewed `round-1.json` against the subject at `ee5986b9`. 5 accepted, 0 rejected, 1 deferred.

## R1-F1 [P2]: onWeaponsMap's status-table rect is one PAD (8 px) shorter than the drawn panel, so its bottom strip fires the pew

Confirmed: ReadoutPanel.tsx:46-47 draws the status panel 3·PAD + LINE·n high, and onWeaponsMap used 2·PAD + LINE·n. Fix: one exported height helper in readoutModel.ts (`statusPanelHeight` / `readoutPanelHeight`) is now used by both ReadoutPanel.tsx and onWeaponsMap, so they cannot drift, and a pewInput test at y = STATUS.y + height − 1 queues no pew.

## R1-F2 [P2]: Online, the pew is gated by the lagging replica's charge: valid clicks just after a recharge are dropped, and the fourth fast click gets no NO CHARGE

Confirmed: onlineDuel.ts `play` refused from the replica's `pewReady`. I chose the simpler fix over prediction:
- Online no longer refuses NO CHARGE locally. NO GUNNER and NO PEW, which do not depend on lagging charge, still refuse locally.
- The click is always sent, and the authority decides.
- An 'unavailable' or rejected result for a pewFire this seat sent, tracked by sequence in `pewSent`, shows NO CHARGE.
- New online play-path tests are in onlineDuelSession.test.ts.

Single player keeps its local refusal.

## R1-F3 [P2]: The Valkyrn gate passes but swung from 9 crew wins to 3, with a median 3.1 s above the 180 s floor

Confirmed. The swing is reported to the owner as an explicit W-1 outcome in the merge summary and the status memory. tests/duelGates.test.ts's Valkyrn aggregate gate now also requires at least 1 crew win in 10 (currently 3), so a further swing fails loudly.

## R1-F4 [P3]: A click over a console block at Weapons still goes to contact.click (it can open or close the contact window)

Confirmed: scene.ts fell through to contact.click. At the Weapons map, contact.click now runs only with a weapon card picked up or for a click inside CONTACT while the window is shown; otherwise the click is dropped. Helm, Science and Flight are unchanged. A new contactScene test puts the enemy marker under a block, and Task 8's picked-card and contact-open tests still pass.

## R1-F5 [P3]: The pew cone is drawn at PEW_HALF while the clamp uses pewDef.arcSteps

Confirmed. weaponsModel.ts now derives the half-angle from `pewDef.arcSteps / AIM_STEPS`, and one pewViews assertion moved to the 59.996° value.

## R1-F6 [P3]: Online, a torpedo the pew shoots down is reported as 'expired', so it plays no explosion sound (Single player does)

Deferred: this is a cosmetic online sound gap. Telling a shot-down torpedo from an expired one on the replica needs cause inference from the round pool, which is a separate change. It goes into the follow-up list, together with the online strip sound.

## Also changed

- (nothing)

## Files changed

- src/renderer/src/app/duel/flightPointer.ts
- src/renderer/src/app/duel/onlineDuel.ts
- src/renderer/src/app/duel/scene.ts
- src/renderer/src/render/duel/readoutModel.ts
- src/renderer/src/render/tactical/weaponsModel.ts
- src/renderer/src/ui/duel/ReadoutPanel.tsx
- tests/contactScene.test.ts
- tests/duelGates.test.ts
- tests/onlineDuelSession.test.ts
- tests/pewInput.test.ts
- tests/pewViews.test.ts

<!-- end -->
