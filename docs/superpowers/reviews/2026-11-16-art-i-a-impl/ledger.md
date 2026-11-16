# Ledger: art-i-a-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P2 | art:import: a corrupt pack PNG crashes instead of being listed, and duplicate output paths silently overwrite each other | fixed:R1 | 0 | 16d4add importCore: readPng try/catch -> problem line; duplicate resolved output paths -> problem line; tests for both |
| R1-F2 | P2 | artImport tests: the tie-break assertion cannot fail, and the packing test checks only the sheet size | fixed:R1 | 0 | 16d4add nearestIndex extracted and tie tested with hand-built Lab triples both orders; packing test asserts cell top-left pixels |
| R1-F3 | P3 | Floor-art sub-textures are not destroyed on a rebuild, and the door-floor skip has no test | fixed:R1 | 0 | 16d4add floorArt children destroyed with texture true, source kept; exact sprite count and door-floor skip tested |
| R1-F4 | P3 | The shadowing test's title claims a paid-over-free case that it never builds | fixed:R1 | 0 | 16d4add paid-over-free shadow case added to paidManifest.test |
