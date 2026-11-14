# Ledger: helm-demo-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The orbit acceptance test conflicts with mandatory drag | fixed:R1 | 0 | §4 tests split into a gravity-only config (drag, stabilise off; 2% orbit, 1% energy over 5 min) and a flight config (terminal speed, skid stop) |
| R1-F2 | P1 | Solo Tab has no authoritative representation of an idle seated player | fixed:R1 | 0 | §8 present/away flag, presence command, disconnect; empty console = unseated or away; §11a Tab sends presence; held cleared |
| R1-F3 | P1 | Define the duel's actual interaction and command phases | fixed:R1 | 0 | §13 duel phase list (scratch, sit/stand via extracted handler, presence, tactical cmds, interact on interactHeld, movement, tactical, hand-over, tick), allowlist, ordering; §8 inputs corrected |
| R1-F4 | P1 | Complete the collision and boundary rules | fixed:R1 | 0 | §3 edge spring law K_EDGE, asteroid restitution and grace; §4 collision matrix incl. ship-ship, missile radius 4, multi-contact order |
| R1-F5 | P1 | Specify laser and missile transitions when control is interrupted | fixed:R1 | 0 | §7 weapons state transition table; unattended missiles keep thrust and clocks, steering zero; unattended clears fireHeld without firing |
| R1-F6 | P1 | The hunter's repair and timing state machine is incomplete | fixed:R1 | 0 | §9 repair priority, walk 6 s then work 4 s/level, one level per visit, disabled actions, hits don't interrupt; jitter uniform 0-12 ticks per in-arc entry; 18-tick ring buffer lag |
| R1-F7 | P1 | Repair-point geometry does not yet enforce repair inside the room | fixed:R1 | 0 | §8 repair tiles fixed now (E 2,6; W 8,7; R 16,8) with walk table; same-room requirement; nearest-then-index tie rule; Weapons short walk stated |
| R1-F8 | P1 | Specify whether duel movement and repairs retain character modifiers | fixed:R1 | 0 | §8 both crew are trait-free Recruit CHARACTERS[4], no head starts, no XP in duel |
| R1-F9 | P1 | Define shield recharge progress and interruption semantics | fixed:R1 | 0 | §5 shield recharge clock: rate 1/s / factor, 5 s per layer, reset on strip, held at level 2, resumes on repair |
| R1-F10 | P1 | A global SIM_VERSION bump cannot preserve sector hash goldens | fixed:R1 | 0 | §13 versioning: sector goldens re-blessed for version number only, traces unchanged; tactical state and rng.tactical only in duel flatten |
