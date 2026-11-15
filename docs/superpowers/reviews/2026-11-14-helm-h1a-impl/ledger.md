# Ledger: helm-h1a-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Escape can advance due ticks before pausing | resolved | 0 | runtime.frame applies Escape edges and syncs pause before driver.pump(); test: late frame with Escape stays at tick 0; confirmed R2 |
| R1-F2 | P2 | Wheel remainder survives an idle gap without render frames | resolved | 0 | idle gap checked and wheelAcc cleared before lastWheelAt is updated; test: first wheel frame after a 300 ms gap with no frames; confirmed R2 |
| R2-F1 | P1 | Late Escape frame catches up all queued ticks on resume | resolved | 0 | runtime disposes the tick driver when any pause reason is set and creates a fresh one on resume (authority untouched); test: delayed Escape, long pause, resume runs no burst and steps from the resume time; confirmed R3 |
