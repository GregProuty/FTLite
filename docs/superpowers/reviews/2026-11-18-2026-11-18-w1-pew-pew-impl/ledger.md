# Ledger: 2026-11-18-w1-pew-pew-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P2 | onWeaponsMap's status-table rect is one PAD (8 px) shorter than the drawn panel, so its bottom strip fires the pew | fixed:R1 | 0 | one statusPanelHeight helper in readoutModel used by ReadoutPanel and onWeaponsMap; edge test |
| R1-F2 | P2 | Online, the pew is gated by the lagging replica's charge: valid clicks just after a recharge are dropped, and the fourth fast click gets no NO CHARGE | fixed:R1 | 0 | online always sends pewFire; unavailable result -> NO CHARGE; online play-path tests |
| R1-F3 | P2 | The Valkyrn gate passes but swung from 9 crew wins to 3, with a median 3.1 s above the 180 s floor | fixed:R1 | 0 | Valkyrn gate gains >=1 crew win floor; swing reported to owner |
| R1-F4 | P3 | A click over a console block at Weapons still goes to contact.click (it can open or close the contact window) | fixed:R1 | 0 | Weapons map: contact.click only with a card picked or inside CONTACT |
| R1-F5 | P3 | The pew cone is drawn at PEW_HALF while the clamp uses pewDef.arcSteps | fixed:R1 | 0 | cone half from pewDef.arcSteps |
| R1-F6 | P3 | Online, a torpedo the pew shoots down is reported as 'expired', so it plays no explosion sound (Single player does) | deferred | 0 | online shot-down torpedo sound is cosmetic; needs replica-side cause inference, later pass |
