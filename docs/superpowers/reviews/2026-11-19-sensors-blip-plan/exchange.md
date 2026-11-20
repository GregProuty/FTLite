# Codex review exchange: sensors-blip-plan

Subject: `docs/superpowers/plans/2026-11-19-sensors-blip.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing d2eb6377, effort high, 630 s, 7205735 in / 6995395 cached / 57770 out)

Verdict: ready

## Findings

### [P3] R1-F1 Task 1's anchor pre-check covers 8 of the plan's ~27 quoted anchors, though the constraints say it checks every one
Global Constraints say 'Task 1 checks that every source anchor is still there', but Task 1 Step 2 greps only eight lines. Many anchors that later tasks match on are not pre-checked. In tacticalModel.ts: the `const distance = ...` line, the `arrows.push({ target, ...` prefix, `planet: 'PLANET', missile: 'TORPEDO' };`, the `GhostDraw` line, `  sensor?: CircleDraw | null; ghosts?: GhostDraw[];`, the enemy-arrow line and the `/** Enemy ship window spec §3: a map click's hit radius` doc line. In fogModel.ts: `// always shown (Decision 15).`, `    seen[kind] = k.seen;` and `  return { range, seen, ghosts };`. In tacticalLayer.ts: the import line, the two pool comments, the `else if (target === 'enemy')` branch and the `d.arrows.forEach(... arrowGlyph ...)` call. In readoutModel.ts: the `bearingDeg` import and `  console?: boolean;`. In scene.ts: the fogModel import and `export interface DuelSceneOptions {`. · plan L34 ('Task 1 checks that every source anchor is still there'); plan L88-L97 (eight greps); unchecked anchors at plan L349, L360, L404, L410, L417, L654-L657, L667, L675, L684, L698, L707, L713-L716, L744-L748, L900, L902, L909, L938, L945, L1110, L1117, L1143, L1149. All are present on master today, each once: fogModel.ts:L7, L11, L34, L43; tacticalModel.ts:L113, L133, L423, L583, L584, L588, L671; tacticalLayer.ts:L14, L29, L35, L184, L505; readoutModel.ts:L17, L60; scene.ts:L57, L173. · The plan notes that W-4b's map task edits the same two map files. If W-4b lands first, a drifted anchor surfaces in the middle of Task 3 or 4 instead of at the pre-flight check that is meant to catch it. The Edit tool still fails loudly, so this is early warning only, not a correctness risk. · Add a `grep -cF` line for each anchor listed above to Task 1 Step 2, with the expected count of lines raised to match. Or change L34 to say Task 1 spot-checks one anchor per file.

### [P3] R1-F2 The scene's sit-card wiring is checked only by grep, not by behaviour
Spec §4 asks for a test that, with the enemy unseen, the sit card's place follows the ping's centre. The plan unit-tests the pure `sitCardBelow` and checks the scene call only with `grep -c "sitCardBelow(d.tactical, fogView)"`. A wrong argument order or the wrong fog object would still pass that grep. · plan L1059-L1073 (helper test), L1170 (scene edit), L1177-L1180 (grep check); scene.ts:L446 (the sitCard call); spec L149. · It is a small gap: the helper is fully pinned, and the only scene risk is wiring that a reviewer can see in the diff. · Optional: in the scene case at plan L1076-L1097, seat the crew (`seatDuelCrew`, as tests/engineeringFog.test.ts:L137 does) with the enemy unseen and above the crew ship. Then assert `store.getState().duel?.sitCard?.top` against `sitCardBelow(rt.duel.tactical, ...)`. Or accept the grep and note it in the Decision list.

## Verified
- The hash: I computed blipHash(0, 0) by hand with the spec's 32-bit imul and xor-shift steps (spec L61-L64, plan L395-L399). It gives h = 0x29072201, so u = 8705/65536 and v = 10503/65536, matching the pin at plan L177. The pinned centre (2962.328, 2098.574) for an enemy at (2900, 2000) with r 400 agrees with my hand cos/sin to about 1e-3 (plan L185).
- blipHash(0, 2), which the 'circle holds' test uses: u = 5637/65536 and v = 41519/65536, an offset of about (-94, -105). After the enemy moves 595 u east the distance is about 697 > 600, so plan L209 passes.
- The age formula at plan L435 gives exactly k/120, 50/110, 21/42 = 0.5, 41/42 and 0 at the boundaries, as the tests at plan L203-L238 expect. Clamping to 0 for a tick behind madeAt is correct. Decision 5 (age never reads 1 from stepFog) is stated and justified against spec L70-L72.
- The radius: beyond = sqrt(dx²+dy²) - range is exact for an enemy due east, so 150.25, 400 and 600 come out exact. At beyond 0 the enemy is seen because pointSeen uses <= (science.ts:L47-L50).
- contactSeen(t, Contact.Enemy) is shipSeen(t, systems[0].target), which checks active and pointSeen (science.ts:L52-L62). fogModel's present/seen facts (fogModel.ts:L27) match spec §2.1.
- No enemy ghost: the `continue` after `seen[kind] = k.seen` keeps the enemy out of `tracks`, so `f.tracks.has('enemy')` is false (plan L259). The only readers of ghosts are tacticalModel.ts:L655 and tacticalLayer.ts:L254, and neither branches on kind 'enemy' except for the chevron size. No other test reads ghosts.
- tests/engineeringFog.test.ts holds 22 cases (3+2+4+6+4+3). The two rewritten blocks' first lines are at L49 and L61, and the header, import and hand-built ghost anchors are at L3, L7, L91 and L93. The rewritten cases' assertions hold against the new stepFog (r/2 seen, r*2 and r*3 unseen, epoch 1 changes the hash).
- TacticalState.tick is a plain number field (state.ts:L175, initialised 0 at L284); tests set it by hand. derelictPos depends on the tick (science.ts:L90-L95), but the ghost test keeps the tick at 0.
- tacticalModel: ARROW_NAMES is the only Record<ArrowTarget,…> (tacticalModel.ts:L423), and there is no switch over ArrowTarget in src. The new identifiers (blip, ping, len, name, fade) do not collide with anything in tacticalModel's scope. toS, onScreen, z, vp, own, ringCrossesRect and edgePoint/aroundAvoid exist with the shapes the plan assumes (L266-L271, L394-L421, L469-L473, L524, L578-L592).
- The map-model test numbers hold: zoom 0.5 about (1000, 2000) gives the screen points and radii pinned at plan L552, L564, L579. The edge arrow lands at x 1252 (ARROW_MARGIN 28, tacticalModel.ts:L40) and at 1016 with reserveRight 236. The rounded labels 1500, 5000, 1100, 1800, 1700, 1700 and 2000 are right, and ringCrossesRect is true or false as each test expects.
- The goal glow needs input.enemyArrow (weaponsModel.ts:L212-L213), and the scene picks only the 'enemy' arrow (scene.ts:L422), so neither the glow nor the FIRING SOLUTION can attach to a 'blip' arrow. CombatModelInput accepts t, enemyArrow (a Point), goal, missilePrev and fx (weaponsModel.ts:L96-L120).
- Layer: arrowGlyph, segments, dashCircle, the words/notes pool (NOTES 13; position rounded; tint and alpha set at tacticalLayer.ts:L418-L422), textPx('?', 1) = 6 and CRT_RAMP all exist as the plan uses them. Existing layer tests read context.instructions the same way (tests/crtColours.test.ts:L64-L68). The expected stroke and fill sets and the ? position (397, 292) follow from the code.
- Readout: the anchor at readoutModel.ts:L158 matches character for character, the `else {` follows the new block, and `crew` is in scope (L116). 'ENEMY' + 6 + 'BLIP ~1800' is 184 px, within READOUT_W - 2*PAD = 188 (theme.ts:L28-L42, interiorModel READOUT_COLUMN 220). readoutRows is called only from scene.ts, at L267, L290, L310 and L437, so Step 5's counts of 4, 1 and 1 are right.
- Scene: fogView is computed at scene.ts:L244 and is in scope at L437 and L446. enemySlot is still used at L369-L382 after the edit. TacticalState, targetOf and CREW_SLOT are already imported (L46). The runtime has view() and epoch() (runtime.ts:L210-L213, L567-L569). The scene test's harness copies tests/engineeringFog.test.ts:L127-L140.
- sitCard(seat, age, acted, enemyBelow, notice) returns `top: enemyBelow` (sitModel.ts:L43-L45). lockRefusal(d) returns 'NO CONTACT' while the enemy is unseen (situationModel.ts:L214-L216).
- Drawing only: no step edits src/renderer/src/sim, net, authority, a golden or the fixture. blipHash is pure integer arithmetic with no Math.random and no use of t.rng. Task 6 Step 5's diff guard and its ten-path list are right, since gates.md is committed after Step 5 and Task 1's commit is empty.
- Task 1's commands match the W-4a 'Worktree setup (controller)' block (w4a plan L26-L35), including the four junctions and the smoke. Using `git merge-base master HEAD` for BASE holds up even if master gains refine commits while the plan runs. The package.json scripts build, test, typecheck, test:duel-app-runtime and bless exist (L10, L15, L24, L34, L35).
- Tests are typechecked (tsconfig.web.json includes tests/**/*; strict, noUncheckedIndexedAccess, no exactOptionalPropertyTypes). The new test code's types line up with the exported shapes (TacticalModelInput, TacticalDraw, ArrowDraw, FogView, pickContact's Pick<…>).
- The plan's declared case counts are right: 11 cases in sensorsBlipFog, 11 in sensorsBlipMap, 4 in sensorsBlipLayer, 4 in sensorsBlipReadout. Every test file named in the targeted runs exists.
- The gates.md entry follows the W-2/W-3 format (gates.md:L1012-L1035). The last line of the file (L1047) is unique, so the Edit-tool append works.
- The spec departures in Decisions 1-15 are each stated and justified. None contradicts the fixed §7 judgement calls.

## Not verified
- The pinned hash values for blipHash(3, 17) and blipHash(12345, 4) (plan L178-L179). I hand-computed only the (0,0) and (0,2) pairs.
- The pinned centre to 5 decimals (plan L185). My hand trigonometry agrees to about 1e-3 only.
- Whether any scene-level test elsewhere in tests/ counts visible '?' texts or arrow labels on a live duel map, where a new blip ? or BLIP arrow could appear. I grepped for ghosts, arrow-label and readout ENEMY assertions and found none, but did not read every scene test.
- That createTacticalState(5) gives sensorRange 900 at the start and systems[0].target = 1. The plan's tests and the existing engineeringFog tests assume both; I did not read systemsFor or SENSOR_RANGE_BY_BARS.
- The exact Pixi 8 shapes of ConvertedStrokeStyle and ConvertedFillStyle (alpha and width fields, and alpha as given times the colour's alpha). Inferred from the existing crtColours test, which reads `.data.style.color`; node_modules was not read.
- That the duel runtime starts in the 'interior' view with both crew standing (plan L1089). Inferred from engineeringFog's seatDuelCrew usage, not read in runtime.ts.

---

# Round 1 response (plan revised: L34)

Reviewed `round-1.json` against the subject at `d2eb6377`. Verdict ready; 1 accepted, 0 rejected, 1 deferred. The controller also confirmed two of the reviewer's not-verified items in node: the pinned hash values for (0,0), (3,17) and (12345,4) (8705/10503, 18494/40792, 40159/61642) and the pinned centre (2962.328351, 2098.573521).

## R1-F1 [P3]: Task 1's anchor pre-check covers 8 of the plan's ~27 quoted anchors, though the constraints say it checks every one

Confirmed. Plan L34 claimed Task 1 checks every source anchor, but Step 2 (L88-L97) has eight greps. Changed L34 to say what is true: Task 1 spot-checks at least one anchor in each of the five source files. Every other anchor was confirmed present exactly once on master in this review (the reviewer's list, and the controller grepped the three fogModel.ts anchors). An Edit whose quoted text is missing fails loudly, and the executor then stops and reports. No new greps were added, so no new quoting risk.

## R1-F2 [P3]: The scene's sit-card wiring is checked only by grep, not by behaviour

Deferred. `sitCardBelow` is unit-tested (plan L1059-L1073). The scene call `sitCardBelow(d.tactical, fogView)` takes two arguments of distinct types (`TacticalState`, `FogView`), so swapping them fails `npx tsc -b`, and `fogView` is the only fog value in scope at scene.ts:L446. A seated-crew scene test would add runtime assumptions (seating, the card's timing) that the plan does not need to prove this rule.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-19-sensors-blip.md

<!-- end -->

---

