# Codex review exchange: 2026-11-18-w2-manual-laser-impl

Subject: `docs/gates.md scripts/golden/duelOracle.ts src/renderer/src/app/controlsList.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/input.ts src/renderer/src/app/duel/mapRequests.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/onlineSource.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/scene.ts src/renderer/src/net/codec.ts src/renderer/src/net/contracts.ts src/renderer/src/render/duel/consoleModel.ts src/renderer/src/render/duel/situationModel.ts src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/render/tactical/weaponsModel.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tuning.ts src/renderer/src/ui/duel/WeaponsStation.tsx tests/duelCheckpoint.test.ts tests/duelModules.test.ts tests/duelSnapshot.test.ts tests/fixtures/determinism-v2.json tests/ftlTargeting.test.ts tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/manualLaserBeam.test.ts tests/manualLaserCommands.test.ts tests/manualLaserInput.test.ts tests/manualLaserMode.test.ts tests/manualLaserScene.test.ts tests/manualLaserUi.test.tsx tests/manualLaserViews.test.ts tests/onlineDuelSession.test.ts tests/rockLock.test.ts tests/settingsAndControls.test.ts tests/tacticalDeterminism.test.ts` (impl). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing df499d9c, effort high, 369 s, 3470525 in / 3310342 cached / 29747 out)

Verdict: ready

## Findings

### [P3] R1-F1 The snapshot validator lets a non-crew slot hold a MANUAL burst aim, which would make the Hunter fire a MANUAL beam
validateTacticalValues refuses `laserManual` on any slot but the crew's. It checks `laserAim` only against that slot's `laserBurst`. So a Hunter record with `laserBurst` 1 and `laserAim` ≥ 0 passes: `laserBurst` is bounded by the largest burst of any class, not by the slot's own class. stepBurst then fires that slot's pending shot through `shootAlong` instead of `shoot`, a state no real run reaches. · diff L1303-1304 (hash.ts: the crew-only check covers laserManual only; laserAim is checked only against burstOf); diff L1244 (laserBurst: within(0, most(c => c.slots.laser?.shots) - 1), the largest across classes); diff L1658 (weapons.ts stepBurst: `if (s.laserAim >= 0) shootAlong(...)` for any slot i); plan L39 (Decision 8: the Hunter is always AUTO) · This is a small hole in the guarantee that the Hunter is always AUTO. Only the crew slot ever writes laserAim (fireLaserAlong runs only under `crew && s.laserManual`), so a valid authority never produces this state. It matters only for a corrupt or hostile snapshot. · In validateTacticalValues add `if (ship[1] === 'systems' && key === 'laserAim' && i !== CREW_SLOT && slice[0] !== -1) bad('only the crew laser has a manual aim')`, and add one `bad('systems.1.laserAim', 7, …)` case with `systems.1.laserBurst` 1 to tests/manualLaserMode.test.ts.

### [P3] R1-F2 Online gap events read the laser mode once, at the end of the gap, for every shot in it
gapEvents takes `manual` from the replica's current `laserManual` and uses it for every shot in the gap. That mislabels two cases. (1) A shot fired in the other mode before a Z toggle inside the same gap: an AUTO hit gets the 'room that rose' rule, or a MANUAL hit gets the lock room. (2) A MANUAL hit on a room already at level 2: the level did not rise, so `rose.findIndex(r > 0)` returns −1 and the hit is drawn with no room callout. · diff L474 (`manual = t.systems[i]!.laserManual`, read once per gap); diff L486 (`room = hit && !stripped ? (manual ? rose.findIndex((r) => r > 0) : lock) : -1`); plan L44 (Decision 13) · This only affects how the online peer draws the hit. The sim is unaffected and there is no desync, but a callout can name the wrong room or none for the shots around a toggle. · Accept it as part of Decision 13's approximation, or keep the lock room when no room rose: `manual ? (rose.findIndex(r => r > 0) >= 0 ? rose.findIndex(r => r > 0) : -1) : lock`. Either way, write the limitation in the gapEvents doc comment.

### [P3] R1-F3 No test for a mode change mid-burst or for the per-round reset of the aim
Two of the plan's decisions have no test. Decision 5: a burst fired MANUAL finishes MANUAL after a toggle to AUTO, and an AUTO burst finishes AUTO after a toggle to MANUAL. Decision 10: a new round clears the aim through the scene's epoch reset. tests/manualLaserScene.test.ts only tests resetLaserAim on a bare MapRequests, and the burst test never toggles the mode. · diff L1658 (stepBurst branches on laserAim, not on laserManual); diff L625 (scene.ts: `options.requests?.resetLaserAim()` on epoch change); tests/manualLaserScene.test.ts:L58-L86; diff L2020-L2036 (the burst test, mode fixed); plan L36, L41 · Both are paths the spec and plan promise, and a refactor could break either silently. The mid-burst toggle is the one place where MANUAL and AUTO meet inside the sim. · In manualLaserBeam.test.ts, fire a MANUAL burst, set `laserManual = false`, step the burst gap and expect the second beam along the stored aim; the mirror case is an AUTO fireLaser, then `laserManual = true`, expecting the second shot at the lock room. In manualLaserScene.test.ts, set an aim, rematch (or bump the epoch) and draw, then expect `requests.laserAim()` to be null.

## Verified
- The shared laserStrike refactor (diff L1532-L1566) moves AUTO shoot's strip, room and hull code unchanged: laserHits++ first, the weak frequency's min(2, shields), shieldClock and gunWear zeroed, layersStripped, the room capped at 2, the hull at least 0. The returned stripped and room match the old local variables, so the AUTO events are identical.
- The AUTO gates (diff L1689, L1700): the crew press needs `!s.laserManual` and so does auto-fire. In MANUAL the beam fires only through `input.laserFire >= 0 && manualLaserReady && !laserFrozen` (L1703). The Hunter's input has laserFire −1 (L1331) and `crew` is false for slot 1, so the Hunter is never MANUAL.
- The step admission (diff L1095, L1129-L1165): laserMode is first in WEAPON_ORDER and is set during admission (noop when the value is the same, malformed when not a boolean). laserCharge in MANUAL answers unavailable. laserFire checks, in order: validAim, then AUTO (unavailable), then a second shot this tick (noop), then canCharge (missile-in-flight), then manualLaserReady (unavailable). A class without a laser answers unavailable for both commands. DUEL_KINDS and shipModule.commands list both commands (L1098, L1232).
- An admitted laserFire always fires. Nothing between admission and applyWeaponsInput changes the charge, the Weapons level or the torpedo, and stepBurst can only lower laserBurst. So the result 'applied' always matches what happens.
- The beam (diff L1585-L1610): it starts at the ship's centre and runs laser.range along clampAim(heading, aim, LASER_ARC_STEPS). firstBlocker supplies the rock or planet (the planet wins ties; a rock born this tick is skipped, rocks.ts:L99-L101). A ship is hit only if the beam enters its circle strictly before that body (`t < best`). Torpedoes are never tested. The struck room comes from roomAtImpact at the entry point (geometry.ts:L35-L41). A rock gets laserStrikesRock, the same as master's laser does. All of it uses + − × ÷ and sqrt only (rocks.ts:L80-L90) and the aimDir/heading tables (pew.ts:L42-L44).
- Bursts (diff L1636-L1661): fireLaserAlong stores the clamped aim only while a burst is pending. stepBurst re-clamps it about the heading at its own tick and re-checks what it hits. laserAim clears with the burst's last shot and when Weapons goes offline, in stepBurst L1655 and tickWeapons (weapons.ts:L319). These are the only places that zero laserBurst (grep), so laserAim ≥ 0 always implies laserBurst > 0.
- State and determinism: laserManual is in FLAGS and laserAim in SYSTEMS_TAIL (diff L1206-L1209), so both are hashed, cloned and validated through the field lists. The rules are flagBit and within(−1, AIM_STEPS − 1) (L1257). laserManual is refused on non-crew slots (L1303). systemsFor starts every round AUTO with −1 (L1385). Aims are integers end to end: fineHeadingOf rounds and wraps (tacticalModel.ts:L172-L175), and the wire takes floor(aim/256) and aim % 256.
- The additive oracle proof (scripts/golden/duelOracle.ts:L125-L128, L260-L277): ADDITIONS[56] matches `ship.systems.N.laserManual|laserAim`, the same naming as the 53 entry. The added fields are taken out of the comparison and must keep their first value at every tick (frozen), and every other field is compared per tick against the baseline at 56. The proof cannot pass vacuously: any new field the regex does not match fails the 'added' check.
- Online (diff L310-L311, L333-L334, L379-L396): laserModeSent dedupes Z against the mode in flight and is cleared on its result, on sit, stand, re-attach and a new round. The laserSent set is separate from W-1's pewSent and is cleared on attach. Only an 'unavailable' answer to this seat's own laserFire shows NO CHARGE. NO GUNNER, TORPEDO FLYING and WEAPONS OFFLINE refuse locally; NO CHARGE never blocks the send (the always-send rule).
- Input: Z is handled only in the Weapons branch in Single player (runtime.ts:L483-L484). The standing, Flight, Helm and Science branches return earlier (L405-L458). Online, standing, Helm and Science return earlier (onlineDuel.ts:L204-L236). The toggle needs a laser class. Space in MANUAL uses the kept aim, else heading × 256. AUTO Space and its refusal words are unchanged (refusal(d, 'fire', false) matches the old refusal(d, 'fire') when the mode is AUTO).
- The scene tracks the aim only at the Weapons station and view, while the round is running and not paused, with a laser class, and while onWeaponsMap says the pointer is on the open map (diff L650-L655). Otherwise the last aim stands, and the aim resets on an epoch change (L625). The left click stays the pew's.
- The AUTO/MAN tag is a Button rendered after the LASER card, with its own onPointerDown that calls press('laserMode') (WeaponsStation.tsx:L91-L93; Button.tsx:L43-L57). In MANUAL, manualCardReason replaces FIRING and PICK A ROOM TO FIRE with MANUAL: SPACE FIRES, and the goal glow is off (diff L836, L889-L891).
- The dashed aim line (diff L1049-L1056, L951-L953) shows only on the Weapons console, in MANUAL, with manualLaserReady and no own torpedo in flight. It uses the same clampAim about the integer heading as the sim, runs LASER_RANGE × zoom from the drawn marker, and is drawn dashed in CRT.main.
- Every consumer of the laser event reads its room or hit fields and handles a MANUAL event: telemetry.ts:L108-L110, hitModel.ts:L52-L55 and L74, fire.ts:L25, health.ts:L36, duelRules.ts:L54-L56.

## Not verified
- Whether the Valkyrn (Flight seat) is ever played online. onlineDuel.ts `play` has no 'flight' branch, so an online Flight seat would fall through to the Weapons code, including Z and laserFire on the laser fit. Plan Decision 14 says the Flight seat sends neither; I did not trace whether the online lobby can pick the Valkyrn.
- That the tag's pointer events never reach the LASER card's pick-up handler or the canvas pew in a real browser. This depends on DOM stacking; I read only the component order and the Button handler.
- That the oracle's baseline at 56 really comes from Task 1 in this checkout, and that the 21-run / 229672-tick and duel-gate numbers in docs/gates.md are real. I did not run any script or test.
- tsc --noEmit: not run (the implementer reports `npx tsc -b` clean).
- The test files manualLaserCommands, manualLaserInput, manualLaserUi, manualLaserViews and the onlineDuelSession changes: I read only their test names in the diff, not their bodies.

---

# Round 1 response (implementation revised, commit 22d23bdb)

Reviewed `round-1.json` against the subject at the brief commit. 3 accepted, 0 rejected, 0 deferred.

## R1-F1 [P3]: The snapshot validator lets a non-crew slot hold a MANUAL burst aim, which would make the Hunter fire a MANUAL beam

Confirmed: hash.ts checked `laserAim` only against `laserBurst`. validateTacticalValues now rejects `laserAim` != -1 on any slot but CREW_SLOT ("only the crew laser has a manual aim"). New case in tests/manualLaserMode.test.ts: a Hunter slot with `laserBurst` 1 and `laserAim` 7. It was RED before the fix ("expected [Function] to throw"). A crew-slot case keeps the "no burst pending" bound covered.

## R1-F2 [P3]: Online gap events read the laser mode once, at the end of the gap, for every shot in it

Accepted as Decision 13's approximation, with no behaviour change. It affects only how a replica labels a hit; the sim is unaffected. The limitation is now written in gapEvents' doc comment in app/duel/onlineSource.ts: the mode is read once per gap, and a MANUAL hit on a room already at level 2 draws with no room callout.

## R1-F3 [P3]: No test for a mode change mid-burst or for the per-round reset of the aim

Confirmed. tests/manualLaserBeam.test.ts now has two mid-burst toggle tests:
- a MANUAL burst toggled to AUTO follows the stored aim;
- an AUTO burst toggled to MANUAL hits the lock room.

tests/manualLaserScene.test.ts bumps the scene epoch and expects the laser aim cleared. All three pass; no bug found.

## Also changed

- (nothing)

## Files changed

- src/renderer/src/sim/tactical/hash.ts
- src/renderer/src/app/duel/onlineSource.ts
- tests/manualLaserMode.test.ts
- tests/manualLaserBeam.test.ts
- tests/manualLaserScene.test.ts

<!-- end -->

---

