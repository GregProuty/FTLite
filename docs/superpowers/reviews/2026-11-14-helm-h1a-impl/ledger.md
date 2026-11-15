# Ledger: helm-h1a-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Escape can advance due ticks before pausing | fixed:R1 | 0 | runtime.frame applies Escape edges and syncs pause before driver.pump(); test: late frame with Escape stays at tick 0 |
| R1-F2 | P2 | Wheel remainder survives an idle gap without render frames | fixed:R1 | 0 | idle gap checked and wheelAcc cleared before lastWheelAt is updated; test: first wheel frame after a 300 ms gap with no frames |
