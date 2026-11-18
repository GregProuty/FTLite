# Ledger: 2026-11-18-engineering-spike-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | No step order or hazard cadence for the new phases in the duel tick | fixed:R1 | 0 | §7 numbered step order with hazard cadence and rng.hazards draw order |
| R1-F2 | P1 | Duel fire and the sector fireStep double-grow the repair rooms; the spread test contradicts the code | fixed:R1 | 0 | §4: fireStep sole growth/shrink/spread; firePhase drops DUEL_FIRE_GROW; 10/20% hysteresis; closed-door 0.05x spread test reworded |
| R1-F3 | P1 | Fires that spread to non-repair rooms cannot be put out by hand | fixed:R1 | 0 | §4: non-point rooms fought at breach-site tile; seated take fire/air damage |
| R1-F4 | P1 | Damage-to-bars rule contradicts itself and leaves today's 'level 2 = off' gates in place | fixed:R1 | 0 | §2: capacity = max(0, slots - damage*ceil(slots/2)); excess returns overdrive first; ship-0 gates read bars; Hunter lock unchanged |
| R1-F5 | P1 | Shield layer cap at round start halves today's shields and has no rule for shields above the cap | fixed:R1 | 0 | §2: round-start 1 layer stated as deliberate; layers above cap drop at once, clock resets; test |
| R1-F6 | P1 | 'Today's level-0 value, +25 % per bar, interpolated toward off' is undefined for several tables | fixed:R1 | 0 | §2: explicit integer rate tables per bar for every system incl. magazine units clock, scans, oxygen factor |
| R1-F7 | P1 | Life Support reuse is false: lifeSupportInjection reads the sector LS station, not duel bars, and fills every room | fixed:R1 | 0 | §4: duel injection INJECT_FRAC*V*HAZARD_DT*OXY_FACTOR, bypasses lifeSupportInjection |
| R1-F8 | P1 | The duel interior draws a seeded run quirk that the reused hazard code obeys | fixed:R1 | 0 | §4: createDuel passes quirk 3 (Lucky Hull, debris only); neutral-hook test |
| R1-F9 | P2 | Heat port quietly changes heat.ts rules and leaves fire heat, coolant wrap and Sensors' room open | fixed:R1 | 0 | §3: explicit heat rules per hazard tick, failed cooling, fire heat out, coolant wrap, rooms per system |
| R1-F10 | P2 | Ship-view authority is a UI rule written as a sim rule; power and coolant authority unstated | fixed:R1 | 0 | §6 UI rule vs §7 sim rule; four kinds in DUEL_KINDS; reason order |
| R1-F11 | P2 | Breach patching: work precedence, storage and roll order undefined | fixed:R1 | 0 | §4: breaches.repair fraction storage, precedence fire>breach>repair, fire roll then breach roll, single site |
| R1-F12 | P3 | Door and airlock reuse silently depends on the sector Doors station staying online | fixed:R1 | 0 | §5: Doors station kept online, fail-safe never fires; airlock-open 600-tick test |
