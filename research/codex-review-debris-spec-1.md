`D` = `docs/superpowers/specs/2026-11-10-debris-loop-design.md`; `P` = `docs/superpowers/specs/2026-11-10-power-and-consoles-design.md`; source paths below are relative to `src/renderer/src/`.

1. **High — Cursor identity:** Removal clears the StableId needed by next-tick `nextTarget(afterStableId)`, so removing target 20 from `[10,20,30]` cannot reliably select 30; evidence: `D:73–80`; fix: retarget before clearing identity, or store and hash the cursor’s StableId alongside its slot.

2. **High — Damage lifecycle:** An impact victim at zero health remains Conscious until `crewSystem`, allowing the intervening Medbay step to heal them and contradict “downs them this tick”; evidence: `D:37–38,70`, `P:104`; fix: resolve the Downed transition and forced stand immediately on lethal impact, including before subsequent impacts.

3. **Medium — Simultaneous impacts:** Multiple impacts overwrite the single `lastImpact`, so only the final room flashes despite every impact requiring a flash; evidence: `D:36,54,71,112`; fix: retain and hash per-room impact ticks, or explicitly specify that only the final impact is visualized.

4. **Medium — Warning boundary:** “Never warned on its spawn tick unless lead exceeds flight” contradicts `remaining <= lead`, because minimum flight and maximum current Science lead both equal 24 seconds; evidence: `D:40,64,77,94–95`; fix: say “equals or exceeds” and test flights shorter than, equal to, and longer than the lead.

5. **Medium — Cursor initialization:** Weapons requires cursor `-1` when no target exists, but construction and every sit initialize it to `0`, while newly seated players skip console dispatch; evidence: `D:57,80`, `sim/state.ts:65`, `sim/stations.ts:32`, `sim/console.ts:48`; fix: initialize Weapons explicitly and validate its cursor on seating and independently of seated dispatch.

6. **Medium — Charge test and tuning:** “Hold for the charge time” is insufficient at starter Weapons level 1, and the “about 12 s at level 3” example is wrong: output is respectively 0.25 and 0.75, giving 24 s and 8 s; evidence: `D:96,121`, `sim/stations.ts:16–17`, `sim/tuning.ts:46–48`; fix: correct the example and wait until full charge, with a bounded tick allowance.

7. **Medium — Science gate timing:** The scripted Science test expects warning on the next tick, but seating occurs before detection and therefore warns an object 16 seconds out during the seating tick; evidence: `D:30–36,121`; fix: assert warning after the seating step, or explicitly defer newly seated Science effects.

8. **Medium — Flash model:** The renderer cannot derive tick-resolution flash age from the proposed model, whose existing time field is whole `simSeconds`; evidence: `D:110–112`, `render/hudModel.ts:27,102`; fix: expose current simulation tick alongside `lastImpact`.

9. **Low — API assumptions:** The spec references `roomAt` and a HUD “ship block,” while the named code uses `conditionRoomAt` and top-level `HudModel` fields; evidence: `D:70,110`, `render/hudModel.ts:4,26–29,51`; fix: name the intended room lookup precisely and add Weapons/impact fields to the actual model shape.

10. **Low — Probabilistic acceptance:** Comparing empirical hit rates over 400 seeded rolls and requiring an evasion during an unspecified manual run gives seed-dependent acceptance; evidence: `D:119,132`; fix: test fixed roll thresholds and use a known combat state for the manual evasion scenario.

Clean — No-site rooms: fallback to fire, or no effect when both are impossible, is explicitly defined (`D:69`).
Clean — Failed Weapons: charge retention and halted progress are explicit (`D:79,84`).
Clean — Mid-fire ordering: shots precede hazards and impacts, so subsequent damage does not retroactively cancel a shot (`D:31–38`).
Clean — Replay/hash: all declared new fields must be hashed, and gameplay draws use simulation RNG streams; no independent live/replay divergence is established (`D:57,63–81`; `sim/flatten.ts:25,53`).
