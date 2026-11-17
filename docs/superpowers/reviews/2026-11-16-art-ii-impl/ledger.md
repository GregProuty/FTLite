# Ledger: art-ii-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P3 | The art bible's palette text no longer matches the regenerated palette | fixed:R1 | 0 | 95e275e bible: floor role light, Maru plating dark; ramp rows match palette.json |
| R1-F2 | P3 | The callout lift per player (liftFor) has no test | fixed:R1 | 0 | 95e275e crewArt.test drives createCalloutLayer with/without crewArt, conscious and downed, against bubbleAnchor lifts |
| R1-F3 | P3 | The palette builder reads frames without the importer's bounds check | fixed:R1 | 0 | 95e275e countColours bounds check, index override past ramp length rejected, tidyRamp empty throws; out-of-bounds test |
