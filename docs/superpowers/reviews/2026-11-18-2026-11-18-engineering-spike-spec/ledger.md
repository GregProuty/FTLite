# Ledger: 2026-11-18-engineering-spike-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | No step order or hazard cadence for the new phases in the duel tick | resolved | 1 | §7 step 8 restores today's firePhase order: damage cadence, then hit fire roll, then breach roll; confirmed R3 |
| R1-F2 | P1 | Duel fire and the sector fireStep double-grow the repair rooms; the spread test contradicts the code | resolved | 0 | §4: fireStep sole growth/shrink/spread; firePhase drops DUEL_FIRE_GROW; 10/20% hysteresis; closed-door 0.05x spread test reworded; confirmed R2 |
| R1-F3 | P1 | Fires that spread to non-repair rooms cannot be put out by hand | resolved | 0 | §4: non-point rooms fought at breach-site tile; seated take fire/air damage; confirmed R2 |
| R1-F4 | P1 | Damage-to-bars rule contradicts itself and leaves today's 'level 2 = off' gates in place | resolved | 0 | §2: capacity = max(0, slots - damage*ceil(slots/2)); excess returns overdrive first; ship-0 gates read bars; Hunter lock unchanged; confirmed R2 |
| R1-F5 | P1 | Shield layer cap at round start halves today's shields and has no rule for shields above the cap | resolved | 0 | §2: round-start 1 layer stated as deliberate; layers above cap drop at once, clock resets; test; confirmed R2 |
| R1-F6 | P1 | 'Today's level-0 value, +25 % per bar, interpolated toward off' is undefined for several tables | resolved | 0 | §2: explicit integer rate tables per bar for every system incl. magazine units clock, scans, oxygen factor; confirmed R2 |
| R1-F7 | P1 | Life Support reuse is false: lifeSupportInjection reads the sector LS station, not duel bars, and fills every room | resolved | 0 | §4: duel injection INJECT_FRAC*V*HAZARD_DT*OXY_FACTOR, bypasses lifeSupportInjection; confirmed R2 |
| R1-F8 | P1 | The duel interior draws a seeded run quirk that the reused hazard code obeys | resolved | 0 | §4: createDuel passes quirk 3 (Lucky Hull, debris only); neutral-hook test; confirmed R2 |
| R1-F9 | P2 | Heat port quietly changes heat.ts rules and leaves fire heat, coolant wrap and Sensors' room open | resolved | 0 | §3: explicit heat rules per hazard tick, failed cooling, fire heat out, coolant wrap, rooms per system; confirmed R2 |
| R1-F10 | P2 | Ship-view authority is a UI rule written as a sim rule; power and coolant authority unstated | resolved | 0 | §6 UI rule vs §7 sim rule; four kinds in DUEL_KINDS; reason order; confirmed R2 |
| R1-F11 | P2 | Breach patching: work precedence, storage and roll order undefined | resolved | 0 | §4: breaches.repair fraction storage, precedence fire>breach>repair, fire roll then breach roll, single site; confirmed R2 |
| R1-F12 | P3 | Door and airlock reuse silently depends on the sector Doors station staying online | resolved | 0 | §5: Doors station kept online, fail-safe never fires; airlock-open 600-tick test; confirmed R2 |
| R2-F1 | P1 | Bars live in a DuelState module, but every gate that must read them takes only TacticalState and indexes by rooms | resolved | 0 | §2: bars in ShipSystems.bars (ship module); list of ship-0 readers incl. predictFlight/predictPath and scans; step-1 admission reads start-of-tick bars; confirmed R3 |
| R2-F2 | P1 | The capacity update runs before fire damage, contradicting 'excess bars return at once' | resolved | 0 | §7: clampToCapacity after firePhase cadence (step 8) and inline at overheat; confirmed R3 |
| R2-F3 | P2 | The scan rate per Sensors bar is fixed when the scan starts; the spec doesn't say when the table is read or what 0 bars does to a scan | resolved | 0 | §2 Scans: progress reads table each tick at current bars; pause at 0; contactScan at 0 bars unavailable; confirmed R3 |
| R2-F4 | P2 | Fires in non-point rooms, spread ignitions and breaches have no event shape | resolved | 0 | §4 Events: HUD reads state; no new events except crewHurt 'air'; confirmed R3 |
| R2-F5 | P3 | The overheat draw's consumption when the room is already burning, and the order across systems, are unstated | resolved | 0 | §3: draw always consumed, ascending system index; confirmed R3 |
| R3-F1 | P2 | Missile hits raise ship 0's Room damage inside stepDuel, before its tickWeapons reads bars that step 8 only clamps later | fixed:R3 | 0 | §2 effectiveBars = min(bars, damage capacity) read by ship-0 gates; §7 clamp wording |
| R3-F2 | P3 | 'scan.rate only records which row' clashes with the row chosen by `by` and with scanCommand's faster-station takeover | fixed:R3 | 0 | §2 scan.rate keeps base rate for takeover; progress from table |
