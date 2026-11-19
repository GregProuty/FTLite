# Codex review exchange: 2026-11-18-w1-pew-pew-impl

Subject: `public/assets/manifest.json src/renderer/src/app/controlsList.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/flightPointer.ts src/renderer/src/app/duel/mapRequests.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/onlineSource.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/scene.ts src/renderer/src/audio/duelSounds.ts src/renderer/src/audio/soundBank.ts src/renderer/src/net/codec.ts src/renderer/src/net/contracts.ts src/renderer/src/render/duel/consoleLayout.ts src/renderer/src/render/duel/consoleModel.ts src/renderer/src/render/duel/readoutModel.ts src/renderer/src/render/duel/shipHudModel.ts src/renderer/src/render/duel/sitModel.ts src/renderer/src/render/duel/situationModel.ts src/renderer/src/render/tactical/fxModel.ts src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/render/tactical/weaponsModel.ts src/renderer/src/sim/duel/scripted.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/summary.ts src/renderer/src/sim/duel/telemetry.ts src/renderer/src/sim/tactical/defs.ts src/renderer/src/sim/tactical/duel.ts src/renderer/src/sim/tactical/gun.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/tactical/missiles.ts src/renderer/src/sim/tactical/pew.ts src/renderer/src/sim/tactical/science.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tuning.ts src/renderer/src/ui/duel/WeaponsStation.tsx tests/contactScene.test.ts tests/duelCheckpoint.test.ts tests/duelConsoleModel.test.ts tests/duelModules.test.ts tests/duelReadout.test.ts tests/duelScripted.test.ts tests/duelSnapshot.test.ts tests/duelTelemetry.test.ts tests/feelPresentation.test.ts tests/fixtures/determinism-v2.json tests/ftlTargeting.test.ts tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/helpers/hostile.ts tests/pewCharge.test.ts tests/pewCommands.test.ts tests/pewHunter.test.ts tests/pewInput.test.ts tests/pewRounds.test.ts tests/pewUi.test.tsx tests/pewViews.test.ts tests/scienceConsole.test.ts tests/settingsAndControls.test.ts tests/shipHudModel.test.ts tests/tacticalDeterminism.test.ts tests/tacticalHunter.test.ts tests/tacticalSlots.test.ts tests/valkyrnClasses.test.ts tests/valkyrnOnline.test.ts tests/valkyrnRounds.test.ts` (impl). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing ee5986b9, effort high, 425 s, 4771377 in / 4580778 cached / 33319 out)

Verdict: ready with P2s

## Findings

### [P2] R1-F1 onWeaponsMap's status-table rect is one PAD (8 px) shorter than the drawn panel, so its bottom strip fires the pew
The status table is drawn 3 PADs plus LINE×n high, but onWeaponsMap excludes only 2 PADs plus LINE×n. A left click in the bottom 8 px of the drawn status table (including its border) counts as the open map and fires the pew. · diff L189 (flightPointer.ts onWeaponsMap): `h: PAD + LINE * Math.min(statusRows, READOUT_ROWS) + PAD`. ui/duel/ReadoutPanel.tsx:46-47: with placement 'status' h = 0, so `helpY = PAD + LINE * n + PAD, height = helpY + h * HELP_LINE + PAD`, which is 3·PAD + LINE·n. ReadoutPanel.tsx:50 draws the Panel at that height. render/theme.ts:28 has PAD = 8. · Plan decision 8 and focus item 8 say a click on the status table is a console click and never a shot. The strip is small but sits on the visible panel, and the pewInput test only checks points well inside the table. · Export one status-panel height helper from ReadoutPanel or readoutModel (3·PAD + LINE·min(n, READOUT_ROWS) in status placement). Use it in both ReadoutPanel and onWeaponsMap. Add a pewInput case at y = STATUS.y + height − 1.

### [P2] R1-F2 Online, the pew is gated by the lagging replica's charge: valid clicks just after a recharge are dropped, and the fourth fast click gets no NO CHARGE
The online client decides NO CHARGE from the confirmed replica, which runs behind the authority. While the charge is refilling, the replica shows less than the authority has. For about one link delay after a third is back, a click is refused locally with NO CHARGE and never sent, even though the authority would fire it. Mashing therefore refills more slowly online than in Single player. Just after a burst it goes the other way: the replica still shows charge, so a fourth click is sent and the authority answers 'unavailable'. The client only times command results and never shows a refusal from them, so that empty click shows no NO CHARGE. · diff L325-330 (onlineDuel.ts play): `const why = refusal(d, 'pew'); if (why) source?.refuse('pew', why); else send(...)`, where d is the replica (`client?.state()`, diff L341). situationModel.ts refusal 'pew' (diff L1134-1137) reads `pewReady(t, CREW_SLOT)` on that state. Results are only stamped (onlineDuel.ts ~L183: `if (result.status === 'applied') sample(...)`). The authority's refusal is step.ts diff L1620 `if (!pewReady(d.tactical, 0)) { result(e, 'unavailable'); ... }`. · Mashing at the recharge edge is the core loop of a 3-shot skill weapon. Spec §1 says an empty click gives NO CHARGE and §5 tests '3 rapid fires succeed and the fourth is refused'. Online that holds only by luck of timing, and valid shots are silently delayed by the link delay. · Predict locally: keep a count of pewFire commands sent but not yet seen in the replica (by sequence, as throttleSent and headingSent do). Gate on replica charge minus those sends, and do not refuse while the replica's next third is due within the measured link delay (or send anyway in that window). Also map an 'unavailable' result for a pewFire this seat sent to `source.refuse('pew', 'NO CHARGE')`. Add an online play-path test, which is also the known missing test.

### [P2] R1-F3 The Valkyrn gate passes but swung from 9 crew wins to 3, with a median 3.1 s above the 180 s floor
Through Decision 11 the Hunter's pew also fires at the Valkyrn, which spec §6 lists as out of scope. After Task 6 the Valkyrn gate records 7 Hunter wins in 10, against 1 before W-1, with a median of 183.1 s. The gate asserts only that the median is 180-300 s and the Hunter wins at least once, so it passes. But the solo test ship's balance has changed a lot, and any later Hunter knob change can push the median under 180 s. · tuning.ts diff L2810-2817: VALKYRN_HULL comment 'median 229.8 s, 9 crew wins, 1 Hunter win … W-1 … with the Hunter's pew at hull 30 the Valkyrn median was 109.7 s, 10 Hunter wins'. Gate results at diff L2861/L2866/L2873: 'Valkyrn median 183.1 s, 7 Hunter wins'. tests/duelGates.test.ts:58-64 has no crew-win floor. · Under the fixed decision the crew must still win the duel gates, and the Valkyrn ships were meant to be untouched by this part. A 70% Hunter win rate against the solo ship regresses that ship, and the 3 s headroom makes the gate fragile for W-2 and W-3 tuning. · Bring this to the owner as an explicit W-1 outcome in the ledger or status notes rather than leaving it in a tuning comment. Optionally add a crew-win floor (at least 1 of 10) to the Valkyrn aggregate gate so a further swing fails loudly.

### [P3] R1-F4 A click over a console block at Weapons still goes to contact.click (it can open or close the contact window)
When pewClick is false only because the click is over the tab strip, side column, status table or Weapons block, the scene falls through to `contact.click(pickContact(...))`. A click over a block with the enemy marker drawn beneath it opens the window. Plan decision 8 says the window opens at Weapons only by T and the cards. A click on empty space passes null, which may close an open window. · diff L650-657 (scene.ts): `if (pewClick && click) {...} else if (contact && click && onMap && station !== 'flight') contact.click(pickContact(...))`. Plan L35, decision 8. · Behaviour at Weapons is now mixed: the map is the pew, but the console blocks act on the hidden map under them. This is the known open minor. · At `station === 'weapons' && view === 'weapons'`, call contact.click only when a weapon is picked up (aimWeapon() non-null) or the click is inside CONTACT while the window is shown. Otherwise drop the click.

### [P3] R1-F5 The pew cone is drawn at PEW_HALF while the clamp uses pewDef.arcSteps
The cone edges use the constant PEW_HALF (exactly 60°). The aim line and the sim clamp use the class's arcSteps (10922 fine steps, about 59.996°, and per def). Today the gap is under a pixel, but the cone would stop matching the clamp if a class's arcSteps were tuned. · weaponsModel.ts diff L1388: `half: PEW_HALF`. L1391 uses `clampAim(heading, ..., pewDef.arcSteps)`. defs.ts diff L1831: `arcSteps: PEW_ARC_STEPS`. · One source of truth for what the player sees and what the sim does. This is the known open minor. · `half: (pewDef.arcSteps / AIM_STEPS) * 2 * Math.PI`.

### [P3] R1-F6 Online, a torpedo the pew shoots down is reported as 'expired', so it plays no explosion sound (Single player does)
The online gap events rebuild every missile ending without a hit as cause 'expired', and duelEventSounds skips 'expired' endings. A crew or Hunter torpedo shot down by a pew round is therefore silent online. Single player sees cause 'shot' and plays explosionCrunch at 0.6. Online pewHit events also always carry stripped false and hull false, so a shield strip online plays the metal hit, not the shield sound. · onlineSource.ts diff L406: `cause: hit ? 'ship' : 'expired'`. duelSounds.ts diff L720: `if (e.cause === 'edge' || e.cause === 'expired') continue;`. diff L414: online pewHit has `stripped: false, hull: false`. · Single player and online sound different for point defence, one of the pew's three roles. · In gapEvents, when the other ship's pewHits did not rise but a missile ended near a pew round, or more simply when the ending missile was inside pew range of an active pew round in the replica, emit cause 'shot'. Otherwise give non-hit endings a neutral cause that plays the 0.6 crunch. Document the strip limitation.

## Verified
- Sim arithmetic: pew.ts (diff L2404-2535), hunter.ts hunterPew/aimError (L2283-2318) and scripted.ts gunnerPew (L1507-1522) use only + − × ÷, Math.floor/abs/max/sqrt (via lead and segmentEntry), heading tables (dirBetween, hx, hy, nearestHeading) and nextInt on state.rng. No trig or ** in sim. fineHeadingOf, which uses atan2, is in render/tacticalModel.ts (L1259-1262), outside the guard. tests/helpers/determinismGuard.ts:3 allowlist checked.
- clampAim (L2438-2442) works in fine-heading space about heading·256 with an integer modular wrap, and firePew rejects non-integer or out-of-range aims (L2460). step.ts builds crew.pewAim = aim·256 + aimAcc only after validAim (L1618-1621), so the sim never sees a float angle.
- Admission: pewFire is in DUEL_KINDS and last in WEAPON_ORDER (diff L1573-1576). The order is stale-tick → not-at-weapons → unavailable (no pew class) → malformed → noop (second in a tick) → unavailable (NO CHARGE). Nothing changes crew pewCharge between admission and firePew: hunterThink touches only the Hunter, firePew is last in applyWeaponsInput (L2945) after the `!input.weapons` return (weapons.ts:144), and tickPew runs later in tickWeapons (L2962). Every peer admits identically and the result matches the effect.
- Codec: duelWire has `pewFire {aim: int, aimAcc: int}` strict (diff L806), and DuelCommand has the field (L834). authority/duelRules.ts is generic over the duel codec and step (duelRules.ts:37-38), so it needed no change. shipModule.commands lists pewFire (hash.ts diff L2116).
- State hashing, clone and validation: pewCharge/pewShots/pewHits are in SYSTEMS_TAIL, pewBurst/pewClock in HUNTER_HEAD, and the PEW_POOL pool in spaceFields after the gun pool (diff L2013, L2028, L2093). The clone builds a fresh pew pool (L2138). Validation bounds pewCharge per slot class via clsOf, with cls read first in SYSTEMS_HEAD (L2209-2211). Pew pool entries get the same free-entry, owner and age checks with the age bound at the longest pew life, 30 (L2200, L2232). pewBurst is bounded 0..max shots and pewClock 0..HUNTER_PEW_GAP, which covers the stored maximum of 20 (L2175).
- Rounds: stepPew (L2495-2523) moves straight with no gravity on the spawn tick, ends at age ≥ lifeTicks (30 moves, about 450 u) and sweeps rock → planet → other torpedo → other ship with strict <, so ties go in spec order. It skips its own ship and own torpedo (L2509, L2515). A torpedo is ended through missiles.ts shootDown with cause 'shot' (L2383-2386). pewHit strips one layer (shieldClock and gunWear set to 0) or costs def.hull, and never touches rooms (L2477-2485). placeRound with the pool parameter keeps the gun's deterministic pick (L1944-1949).
- Ordering in stepDuel: stepPew runs after stepRounds and before tickWeapons and the outcome check (duel.ts diff L1910-1918), so a pew kill decides the round in the same tick. Hostility counts crew pewShots with cause 'pew' between gun and missile (science.ts L2557-2560).
- Hunter AI: hunterPew runs only when hostile and Weapons is attended (L2333, L2352, L2363). Defence comes first: a crew torpedo within HUNTER_PD_RANGE and inside the cone gets one nextInt roll a tick, 1 in HUNTER_PD_ODDS = round(1/(0.3·DT)) = 200 (L2302, tuning L2876). Attack needs PEW_RANGE, the cone and an active crew ship. Bursts are def.shots rounds HUNTER_PEW_GAP apart and start only on a full charge (L2309-2316). Lead uses the target's own velocity because rounds do not inherit velocity (pewLead L2528-2535). The seeded error is ±HUNTER_PEW_ERROR_STEPS, wrapped (L2283-2285).
- Controller deviations: HUNTER_PEW is the crew PEW with rechargeTicks 120 (defs L1834). Its snapshot bound and the full-charge start come from the slot's own class (state.ts L2718, hash L2166-2169). The hull ×1.75 touches only sim/tactical/tuning.ts SHIP_HULL/HUNTER_HULL/VALKYRN_HULL. A grep of src finds SHIP_HULL used only in defs.ts and shipHudModel.ts, with no sector code; sector HULL_MAX (sim/tuning.ts) is unchanged. HULL_PER_SEGMENT = 70/20 = 3.5 keeps 20 segments for the Cutter (ceil(70/3.5)) and gives 16 for the Valkyrn. readoutModel reads hull from classOf (readoutModel.ts:116), with no hard-coded 40 or 70 in render (grep).
- Telemetry and records: 'pew' is inserted in TERMINAL_CAUSES between gun and missile, which keeps old records' order valid (summary.ts diff L1647). The codec, duelRecord and duelCheckpoint schemas all derive from TERMINAL_CAUSES (codec.ts:99, duelRecord.ts:27, duelCheckpoint.ts:45). A 'shot' torpedo loss is folded into the 'missile' MissileLoss key (telemetry diff L1710). No service code enumerates the causes (grep of services).
- Input: the scene fires the pew only when station and view are 'weapons', the round is running, the layer is not paused, no weapon card is picked up, the class has a pew, and onWeaponsMap is true (diff L650-655). Helm (L662), Flight (L669) and Science keep their paths. takeClick is the left button only (input.ts:227). The TargetingLine cancels a pick-up only on the right button (TargetingLine.tsx:42), so a left click with a card up keeps its old meaning. The aim is the bearing from the interpolated own-ship position to the clicked world point. Single player (runtime.ts diff L533-537) and online (onlineDuel.ts diff L326-330) split it identically into `floor(pew/256)` and `pew % 256`, and both sit in the Weapons branch after the helm, science and flight returns (runtime.ts:388-441, onlineDuel.ts:223-251).
- UI: the PEW row sits on top of the Weapons block, which grows 216→244 so the cards keep their screen place through PEW_ROW_H (consoleLayout diff L859-873, WeaponsStation diff L3028-3044). Pips come from pewPips per def.rechargeTicks (consoleModel L943-948). The NO CHARGE refusal reads 'PEW: …' (L3064). 1 and 2 still pick only the laser and torpedo. sfx.pew takes laserSmall 3 and 4 and the laser keeps 0-2 (soundBank L758-762). Help text, the sit card and the Settings row are updated (readoutModel L994, sitModel L1072, controlsList L105).
- SIM_VERSION goes 53→54 once (sim/tuning.ts diff L2975-2976). The goldens were re-blessed at the same version (commit f4e9f437).

## Not verified
- I did not run tsc, vitest or the determinism suite, as instructed. The claims that the duel gates hold (Hound median 224.1 s, 7/3; Valkyrn 183.1 s) come from the tuning comments, not my own run.
- I did not read sim/duel/snapshot.ts or sim/snapshotValidation.ts (not in the diff). I assumed the duel snapshot flattens and validates the tactical state through the module fields and validateTacticalValues, as the hash.ts header says.
- I did not read sim/tactical/lead.ts (interceptTime, nearestHeading). I assumed they are pre-existing sim code under the determinism guard.
- I did not check the online requestedTick stamping for pewFire. It uses the same send() path as the other weapon commands.
- Outside the manifest I read, to check the findings: ui/duel/ReadoutPanel.tsx:36-51 and render/theme.ts PAD/LINE (status height); runtime.ts:280-427 and onlineDuel.ts:212-251 (branch placement); input.ts click handling; TargetingLine.tsx listeners; tests/duelGates.test.ts assertions; greps for hull constants, TERMINAL_CAUSES and services.
- I did not inspect the regenerated goldens, manifest.json or the test bodies beyond their test names, so the tests' internal assertions are unverified.

---

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

---

