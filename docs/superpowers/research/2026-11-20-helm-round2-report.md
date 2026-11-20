# Helm round 2: build report

Spec `docs/superpowers/specs/2026-11-19-helm-round2-design.md`; plan `docs/superpowers/plans/2026-11-20-helm-round2.md`.

## Base

- `HR2_BASE` = e65d84fe, SIM_VERSION 63, branch `helm-round2`.
- Full suite at the base: 516 files, 6194 tests passed, 2 skipped (typecheck clean, electron-vite build ok).
- Canonical trace baseline: baseline at sim version 63: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs; written to C:\Users\djuar\AppData\Local\Temp\ftlite-canonical-trace-84f46ab3\trace.json
- Scripted gates at the base (the ten scripted seeds already fail the median gate at the base; recorded as-is):

```
median length 147.0 s (gate 180 to 300)
crew wins 0, crew losses 10, draws 0, at the cap 0 (gate: a win and a loss, none at the cap)
every duel with a crew pew or gun round and a missile launch: true
planet-contact ends under 30 s: 0 (gate 0)

passive crew (nobody at either console), not gated: seed 1 153.3 s crew loss; seed 2 152.8 s crew loss; seed 3 98.3 s crew loss; seed 4 153.5 s crew loss; seed 5 154.8 s crew loss; seed 6 120.2 s crew loss; seed 7 93.7 s crew loss; seed 8 112.1 s crew loss; seed 9 133.6 s crew loss; seed 10 152.3 s crew loss
passive median 143.0 s, shortest 93.7 s
```

- Valkyrn gate at the base (Tasks 6 and 14 must print these exactly):

```
seed 1: 148.5 s, crew loss, hull crew 0/53 enemy 69/123, terminal crew [planet] enemy [], PLANET END
  gun 366 shots, 319 hits (87.2%); missiles 4 launched, hits W/S/E 0/3/0; enemy laser 6 released, 6 hit, missiles 4; repairs 1/2, away walking/repairing 5.9/10.8 s; contacts planet 8, asteroid 1
seed 2: 121.2 s, crew loss, hull crew 13/53 enemy 101/123, terminal crew [downed] enemy []
  gun 199 shots, 176 hits (88.4%); missiles 2 launched, hits W/S/E 0/1/0; enemy laser 12 released, 12 hit, missiles 3; repairs 2/7, away walking/repairing 8.9/30.2 s; contacts planet 0, asteroid 0
seed 3: 159.6 s, crew loss, hull crew 15/53 enemy 86/123, terminal crew [downed] enemy []
  gun 239 shots, 201 hits (84.1%); missiles 3 launched, hits W/S/E 0/2/0; enemy laser 10 released, 10 hit, missiles 4; repairs 5/8, away walking/repairing 19.2/33.1 s; contacts planet 0, asteroid 0
seed 4: 128.1 s, crew loss, hull crew 0/53 enemy 56/123, terminal crew [planet] enemy [], PLANET END
  gun 211 shots, 168 hits (79.6%); missiles 3 launched, hits W/S/E 0/1/0; enemy laser 6 released, 6 hit, missiles 3; repairs 2/6, away walking/repairing 9.1/24.0 s; contacts planet 8, asteroid 1
seed 5: 156.3 s, crew loss, hull crew 13/53 enemy 99/123, terminal crew [downed] enemy []
  gun 327 shots, 269 hits (82.3%); missiles 3 launched, hits W/S/E 0/1/0; enemy laser 13 released, 13 hit, missiles 4; repairs 3/7, away walking/repairing 8.9/29.0 s; contacts planet 0, asteroid 0
seed 6: 99.1 s, crew loss, hull crew 34/53 enemy 107/123, terminal crew [downed] enemy []
  gun 139 shots, 119 hits (85.6%); missiles 2 launched, hits W/S/E 0/1/0; enemy laser 7 released, 7 hit, missiles 2; repairs 4/3, away walking/repairing 14.9/13.9 s; contacts planet 0, asteroid 0
seed 7: 245.8 s, crew loss, hull crew 9/53 enemy 70/123, terminal crew [downed] enemy []
  gun 615 shots, 530 hits (86.2%); missiles 7 launched, hits W/S/E 0/3/0; enemy laser 15 released, 15 hit, missiles 6; repairs 6/9, away walking/repairing 23.5/37.5 s; contacts planet 0, asteroid 1
seed 8: 262.5 s, crew loss, hull crew 24/53 enemy 65/123, terminal crew [downed] enemy []
  gun 664 shots, 564 hits (84.9%); missiles 8 launched, hits W/S/E 0/5/0; enemy laser 14 released, 14 hit, missiles 7; repairs 3/6, away walking/repairing 9.6/25.8 s; contacts planet 0, asteroid 1
seed 9: 127.3 s, crew loss, hull crew 29/53 enemy 97/123, terminal crew [downed] enemy []
  gun 177 shots, 156 hits (88.1%); missiles 2 launched, hits W/S/E 0/1/0; enemy laser 9 released, 9 hit, missiles 3; repairs 2/7, away walking/repairing 8.9/28.9 s; contacts planet 0, asteroid 2
seed 10: 131.7 s, crew win, hull crew 34/53 enemy 0/123, terminal crew [] enemy [planet], PLANET END
  gun 313 shots, 256 hits (81.8%); missiles 4 launched, hits W/S/E 0/2/0; enemy laser 3 released, 3 hit, missiles 3; repairs 0/0, away walking/repairing 0.5/0.0 s; contacts planet 4, asteroid 1

valkyrn median length 140.1 s (gate 180 to 300)
crew wins 1, hunter wins 9 (gate ≥ 1), draws 0, at the cap 0 (gate 0)
gun 3250 shots, 2758 hits (84.9%) over 10 duels; cap 900 s
FAIL: median 140.1 s < 180
```

## Task 14 re-picks (kind b)

- Task 2: `tests/duelGolden.test.ts` and `tests/duelRematchGolden.test.ts` (the duel hash holds three more values); the known-red window opens. Re-bless in Task 14.
- Task 3: `tests/tacticalSlots.test.ts:162` (seed 1's whole scripted duel length, `expected 10125 to be 7796`; the property `wrong === 0` still passes).
- Task 3: `tests/duelSnapshot.test.ts` fixture tick (seed 1, tick 6465, picked by "the crew pew turret is slewed there"): its `systems.0.cls = 1` case now reaches `duel slot identity` instead of `pewTurret: out of range`. Re-pick the tick in Task 14 (log `systems.0.pewTurret` to confirm).
- Task 4: `tests/duelScripted.test.ts:86` ('plays a whole duel with every command admitted'; seed 1 stops sending `sit` once the Hound flies with drag): `expected [ 'shipPower', 'stand', 'torpLock', 'weaponPower' ] to deeply equal [ 'shipPower', 'sit', 'stand', 'torpLock', 'weaponPower' ]`. Re-pick the seed in Task 14 (the lowest seed whose duel uses every kind).

## Kind (a) rewrites

- Task 4 (the turn boost, the free-flight CREW_FLIGHT and the boosted vent fields are replaced rules): `tests/crewFlight.test.ts` (NO_GRAVITY is the drag-0 branch, DRAG0, CREW_FLIGHT literal, boost-band test deleted because no class keeps a boost, the boost describe is now the fixed turn), `tests/crewSteering.test.ts` (helmBoost reads removed, the gas boost describe is the fixed turn, crewAxes expectations without turnBoost), `tests/crewHelmFx.test.ts` (no boosted-turn puffs), `tests/crewThrusters.test.ts` (the push is flown before drag: × KEEP; helmVent without boosted/turn), `tests/duelAudio.test.ts` (no boosted-turn hiss), `tests/crewHelmOnline.test.ts`, `tests/onlineDuelSession.test.ts`, `tests/helmModule.test.ts` (helmVent literals), `tests/duelScripted.test.ts` (the hazard prediction describe), `tests/crewTelemetry.test.ts` (a comment).

- Task 5 (the free cold gas is replaced by the charge): `tests/crewThrusters.test.ts` (the describe renamed, the 3000-tick free-gas test deleted because no class keeps free gas, the header line), covered instead by `tests/helmGas.test.ts`. No kind (b) failures in the Task 5 targeted run.

## Scripted Helm tuning (spec §5's gate rule)

