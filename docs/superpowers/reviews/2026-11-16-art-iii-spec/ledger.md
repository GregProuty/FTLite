# Ledger: art-iii-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The palette plan contradicts itself, misstates which frames are new, and regenerating it would change how a fresh clone looks | fixed:R1 | 0 | s1 only already-counted frames (no new crate rects); palette.json byte-identical, countColours-unchanged test |
| R1-F2 | P1 | prop.seats and prop.couch are side-facing sprites, but the spec says every sprite faces south | fixed:R1 | 0 | s1 seats 16,88,25,15 and couch 88,88,23,15 (backs at top); back noted per sprite |
| R1-F3 | P1 | Excluding breach sites and airlock tiles does nothing: both are always wall tiles, so props can back straight onto a breach or an airlock | fixed:R1 | 0 | s3 exclude floor 4-neighbours of breach sites and airlocks (wall tiles) |
| R1-F4 | P1 | The torpedo magazine tile is not excluded, and the Cutter's Lower Hold has a 50% chance of putting a crate pile on it | fixed:R1 | 0 | s3 exclude magazine tile and its neighbours; Lower Hold undressed, accepted and stated |
| R1-F5 | P1 | In the console layer, props draw above the grade and above fire and breach effects, which contradicts L57 and hides fires | fixed:R1 | 0 | s4 own prop layer directly after tiles in both views; rebuild on key; independent of consoleArt |
| R1-F6 | P2 | The propSlots interface is underspecified: unclear whether it returns candidates or placements, and the sort order and return type are unstated | fixed:R1 | 0 | s3 propSlots return type, ascending hash order, names in take order; propCandidates for tests |
| R1-F7 | P2 | The room lamp fixture draws on top of a prop wherever a prop takes a room's top-left tile, and in the Aft Store that always happens | fixed:R1 | 0 | s3 exclude the room's lamp tile; Aft Store undressed, stated |
| R1-F8 | P3 | The starter ship gets dressed too, but the spec never mentions it | fixed:R1 | 0 | s3 starter dressed (Crew Quarters, Medbay); roomKind test covers starter |
| R1-F9 | P3 | Keying the cache on layoutHash ignores room names and systems, which roomKind depends on | fixed:R1 | 0 | s3 cache key = layoutHash + joined room names and systems |
