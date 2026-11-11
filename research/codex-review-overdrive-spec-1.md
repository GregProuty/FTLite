# Codex review: 2b-i spec (2026-11-10)

All references are to the [2b-i spec](/C:/Users/djuar/FTLite/docs/superpowers/specs/2026-11-10-overdrive-heat-coolant-design.md).

1. **Important — line 117:** The scripted gate never overdrives Weapons: its normal maximum is **3**, so `2 → 3` generates no heat and never overheats. **Fix:** withdraw one bar elsewhere, then raise Weapons `2 → 3 → 4`; assert level 4 throughout the cooled phase. Disable the spawner during this fixture so an unrelated failure cannot invalidate it. Clarify line 57: the initial spare alone only permits an immediate Doors overdrive.

2. **Important — lines 114–118:** The tests omit same-tick conflicts introduced by inserting `heatStep`. **Fix:** add integration cases proving that dropping below overdrive or assigning sufficient coolant prevents that tick’s overheat; Weapons can fire before overheating; Navigation overheating prevents that tick’s evasion; and Life Support injects before its overheat while Medbay cannot heal afterward. Verify forced stands clear both seat references and stick state.

3. **Important — lines 75, 114:** A single-station RNG test does not protect the specified ascending-index order or shared hazards-stream sequencing. **Fix:** overheat two stations simultaneously using distinct pinned draws; assert their respective fire outcomes and exactly two draws. Add a same-tick spawner case proving it observes the new failures/fires, including when overheat pushes the count above `SPAWN_CAP`.

4. **Important — line 119:** Round-trip equality and two identical runs do not establish correct replay continuation or independently prove both arrays affect hashing. **Fix:** save with nonzero heat and assigned coolant just before overheating, restore, continue through failure/fire, and compare against uninterrupted execution. Separately mutate only heat, then only coolant, and assert each changes the hash.

5. **Minor — lines 69, 77, 114–116:** Failed Engineering and coolant persistence lack explicit coverage. **Fix:** specify and test that Engineering failure preserves assignments, blocks coolant edits, and leaves other stations heating/cooling at baseline; repairing either Engineering or the target preserves coolant and residual heat. Also test unattended overdrive, which line 56 explicitly requires.

6. **Minor — line 31:** “An overheat fire therefore burns from the next hazard tick” is misleading: existing `crewSystem` damages crew from that fire later in the **same sim tick**. **Fix:** say that oxygen consumption, growth and spread begin next hazard tick, while environmental crew damage begins this tick; add an assertion for that distinction.

7. **Minor — line 129:** Requiring ignition within two attempts creates a **25% random gate failure** at probability 0.5. **Fix:** use a documented seed/input sequence that guarantees ignition, or make the random manual observation non-blocking and rely on the pinned automated ignition test.

8. **Minor — line 54:** “A failed station has level 0” contradicts merged 2a-i behavior: failed Engineering retains its reserved level 1. **Fix:** qualify this as “a failed non-Engineering station”; Engineering remains excluded from overdrive by its ceiling.
