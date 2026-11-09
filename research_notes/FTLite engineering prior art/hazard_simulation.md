# Ship-internal hazard simulation (fire, atmosphere, breaches, flooding, power) and ship layout formats: prior art for FTLite

Scope note: primary-source code was fetched for SS14 and Barotrauma. FTL rules come from secondary search snippets because the FTL fandom wiki returned HTTP 402 to the fetch tool. No sources were obtained for SS13 LINDA internals, Space Haven, RimWorld, Dwarf Fortress, Oxygen Not Included internals, power networks, FTL ship file formats, SS14 map YAML, or Red Blob Games. These are listed under Gaps. The SS14 files are the LINDA/Monstermos lineage via SS14's port.

## 1. How do SS14 / SS13, Barotrauma, FTL and others simulate this? (update rules, tick rates, performance tricks)

### Takeaway
SS14 runs a tile-based gas solver (LINDA-style sharing plus Monstermos equalization) at 15 Hz, with an active-tile set, "excited groups" that sleep and dismantle, and a ms time budget per tick. Barotrauma uses a much simpler per-hull model: oxygen is a scalar per hull, equalised across gaps proportionally to volume, and fire is a few "fire source" objects per hull with probabilistic spread to neighbouring hulls. For ~8-30 rooms, Barotrauma's room-graph model is the better template, with SS14's constants, sleep and conservation ideas borrowed.

### Cited Findings

**SS14 atmos structure and tick rate**
- Tick rate: `atmos.tickrate` default 15 TPS; `atmos.max_process_time` default 3 ms; Monstermos equalization, depressurization and excited groups are on by default; superconduction off by default. — [CCVars.Atmos.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Shared/CCVar/CCVars.Atmos.cs)
- Spacing CVars: `mmos_spacing_speed` = 0.15 (fraction of air escaping per tick), `mmos_min_gas` = 2.0 (kPa, below which the tile resets to 0), `mmos_max_wind` = 500. — [CCVars.Atmos.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Shared/CCVar/CCVars.Atmos.cs)
- Per-grid state machine in `AtmosphereSystem.Processing.cs`. Stage order: Revalidate, TileEqualize (if Monstermos), ActiveTiles (ProcessCell), ExcitedGroups, HighPressureDelta, DeltaPressure, Hotspots, Superconductivity, PipeNet, AtmosDevices. — [AtmosphereSystem.Processing.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Server/Atmos/EntitySystems/AtmosphereSystem.Processing.cs)
- Time gating: each grid accumulates `Timer += frameTime` and runs only when it reaches `AtmosTime`, then subtracts `AtmosTime` so lost time carries over. Stages check a stopwatch every 30 items and pause/resume across ticks when the ms budget is hit (`ProcessingPaused`). — same file.
- Constants (Atmospherics.cs): `MinimumAirRatioToSuspend` = 0.1, `MinimumAirRatioToMove` = 0.001 (a tile pair is ignored below this delta), `MinimumTemperatureDeltaToSuspend` = 4 K, `ExcitedGroupBreakdownCycles` = 4, `ExcitedGroupsDismantleCycles` = 16, `MonstermosTileLimit` = 200, `MonstermosHardTileLimit` = 2000, `GasMinMoles` = 5e-8, `Epsilon` = 0.5. `AdjustedNumberOfGases` is rounded to a multiple of 4 "for SIMD reasons." — [Atmospherics.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Shared/Atmos/Atmospherics.cs)

**SS14 LINDA-style sharing (`ProcessCell`, `Share`)**
- Each active tile is "archived" once per cycle so neighbours read start-of-cycle values; this removes order dependence. — [AtmosphereSystem.LINDA.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Server/Atmos/EntitySystems/AtmosphereSystem.LINDA.cs)
- Transfer rule per gas: `delta = (receiver - sharer) / (adjacentTurfs + 1)`, skipped below `GasMinMoles`; thermal energy is moved via heat capacities so energy is conserved. — same file.
- Excited groups: connected active tiles are grouped; a group with no significant sharing eventually equalises its tiles to the average (`ExcitedGroupSelfBreakdown`: combine all gas, divide by tile count, copy to every tile) and then all tiles leave the active set. If movement is tiny, the group is dismantled without equalising (`DeactivateGroupTiles`). Any add or merge resets both cooldowns. — [LINDA.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Server/Atmos/EntitySystems/AtmosphereSystem.LINDA.cs), [ExcitedGroup.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Server/Atmos/EntitySystems/AtmosphereSystem.ExcitedGroup.cs)
- Option `excited_groups_space_is_all_consuming`: if a space tile is in the group, the combined mixture is cleared so the whole group becomes vacuum. — ExcitedGroup.cs above.

**SS14 Monstermos (equalisation and spacing)**
- `EqualizePressureInZone`: BFS-gathers connected tiles up to a hard limit (2000; trimmed to 200), computes the average, classifies tiles as givers or takers, moves gas via sorted fast path or BFS slow path, then `FinalizeEq` applies the recorded transfers. The author notes the slow path is O(n^2) and the fast path can strand tiles ("painted ourselves into a corner"). — [AtmosphereSystem.Monstermos.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Server/Atmos/EntitySystems/AtmosphereSystem.Monstermos.cs)
- `ExplosivelyDepressurize`: flood-fill collects non-space tiles and space tiles; BFS from space assigns each tile a direction toward the breach; tiles are processed far edge inward, pushing gas along limited by `SpacingEscapeRatio`, `SpacingMinGas`, `SpacingMaxWind`. Part of the vented gas is deleted to model loss to space. Firelocks can seal mid-fill so airtightness is rechecked. — same file.

**SS14 fire (hotspot) model**
- Fire is a `Hotspot` struct on a tile: `Valid, Volume, Temperature, State, SkippedFirstProcess, Bypassing`. Ignition needs oxidizer + fuel + `temperature > PlasmaMinimumBurnTemperature`. A new hotspot starts at volume = exposedVolume * 25. — [AtmosphereSystem.Hotspot.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Server/Atmos/EntitySystems/AtmosphereSystem.Hotspot.cs)
- Per cycle the fire is extinguished if temperature < `FireMinimumTemperatureToExist` (373.15 K), volume <= 1, air is null, or the mixture is no longer ignitable. The first cycle after creation is skipped. — same file.
- Spread: only when fully covering the tile ("Bypassing") and tile temperature > `FireMinimumTemperatureToSpread` (423.15 K); each neighbour without a hotspot is exposed at temperature * `FireSpreadRadiosityScale` (0.85), volume `CellVolume/4`. Oxygen and fuel consumption happens in the gas reaction code (`React`), which was not retrieved. — Hotspot.cs and Atmospherics.cs above.
- Fire constants `FireGrowthRate` = 40000, `FirePlasmaEnergyReleased` = 160e3. — [Atmospherics.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Shared/Atmos/Atmospherics.cs)

**SS14 tile air-blocking**
- `TileAtmosphere` holds a tile's mixture; a null mixture means the tile is completely air-blocked. Adjacency is refreshed when airtight blockers change (Revalidate stage). — [API: TileAtmosphere](https://spacestation14.com/space-station-14/api/Content.Server/Content.Server.Atmos.TileAtmosphere.html)

**Barotrauma (hull graph, not tiles)**
- Oxygen is a per-hull scalar clamped to `[0, Volume]`; `OxygenDeteriorationSpeed = 0.3` is subtracted every frame; `OxygenPercentage` = oxygen / volume. — [Hull.cs](https://raw.githubusercontent.com/Regalis11/Barotrauma/master/Barotrauma/BarotraumaShared/SharedSource/Map/Hull.cs)
- A `Gap` connects two hulls (or one hull and outside). `UpdateOxygen` equalises proportional to volume: `deltaOxygen = (totalOxygen * hull1.Volume / totalVolume) - hull1.Oxygen`, with the change capped by `OxygenDistributionSpeed (30000) * deltaTime`. Horizontal gaps do not exchange oxygen when water is above the gap. — [Gap.cs](https://raw.githubusercontent.com/Regalis11/Barotrauma/master/Barotrauma/BarotraumaShared/SharedSource/Map/Gap.cs)
- Gap throttling: `updateInterval` = 1 when the two hulls' pressure states differ, 8 when flow is near zero; a closed gap (`open == 0`) returns early. `open` is a continuous 0..1 value that scales flow, so doors are just a variable-conductance edge. — Gap.cs
- Water: gap flow direction from pressure comparison (`hull1.Pressure > hull2.Pressure`); transfer scales with pressure difference, gap size and openness, capped by source water and target capacity (`Volume * MaxCompress`, MaxCompress = 1.05). Flow force is lerped (`deltaTime * 5`) for smoothing. — Gap.cs; Hull.cs
- Hull sleeping: a hull sets `update = false` once water is zero and surface/waves settled. — Hull.cs
- Fire: `MaxFireSources = 16` per hull. Growth `growModifier = min(OxygenPercentage/10 - 1, 1)` (fire grows above 10% O2, shrinks below); consumption `hull.Oxygen -= size.X * deltaTime * OxygenConsumption (50)`; every 5 s (`SpreadToOtherHullsInterval`) each open room-to-room gap touched by the flame has a 15% chance (`SpreadToOtherHullsProbability`) to start a fire in the adjacent hull; standing water extinguishes the fire and is consumed from `WaterVolume`. — [FireSource.cs](https://raw.githubusercontent.com/Regalis11/Barotrauma/master/Barotrauma/BarotraumaShared/SharedSource/Map/FireSource.cs)
- Network sync for fires sends each fire's normalised position and size clamped to the hull (small snapshot). — Hull.cs
- The file noted `OxygenConsumptionSpeed` and `PressureBuildUpSpeed` constants are declared but unused in Hull.cs. — Hull.cs

**FTL (secondary/community sources; not developer documentation)**
- Breach: removes O2 from the room and must be sealed before the room's system can be manned or repaired; oxygen also drains out of rooms linked to an open airlock via open doors. — [FTL wiki search snippet, Door System](https://ftl.fandom.com/wiki/Door_System) (page itself not fetchable; paraphrase from search summary)
- Doors: closed doors slow fire spread by 1.75x, closed blast doors by 10x versus open/hacked doors. — same search summary (unverified; could not open page)
- Fire needs oxygen; fires die only when the room's oxygen is fully drained; fires keep spreading into rooms with oxygen. — [Steam discussion](https://steamcommunity.com/app/212680/discussions/0/828937979393888229) and [GOG forum](https://gog.com/forum/ftl_advanced_edition/oxygen_bug) (player claims)
- Weapon rolls: for heavy lasers, a 30% fire chance is rolled first, then (if no fire) a 30% breach chance; a shot cannot cause both. — [FTL wiki Laser](https://ftl.fandom.com/wiki/Laser_(Weapons)) via search summary
- "Systems cannot be repaired if they are on fire, and fires cannot be put out if your crew is there" (sic; likely meaning crew in a room not repairing) and "every time a system breaks the ship will take 1 hull damage." — [Old FTL wiki strats archive](https://mikehopley.github.io/old-ftl-wiki-strats)

**Oxygen Not Included (surface only)**
- Gas is cell-based, spreads to adjacent vacuum, is layered by density, and is deleted when exposed to space; masses under 1 microgram are deleted. Pressure and flow rules and tick rate were not on the page. — [ONI wiki Gas](https://oxygennotincluded.wiki.gg/wiki/Gas)

### Inferences
- With only 8-30 rooms, SS14's active-tile/excited-group machinery is overkill; the equivalent is a per-room "settled" flag and a per-edge "no-flow" flag (Barotrauma's `updateInterval = 8` for zero-flow gaps is the same idea).
- Barotrauma's design shows that doors can be a scalar `open` in [0,1] multiplying conductance instead of a boolean, which makes door animation, partial breach and "damaged door" free.
- SS14's "archive then share" pattern maps to: compute all edge flows from a start-of-step snapshot, then apply, which gives order independence and exact conservation.
- Recommended deterministic formulation (my synthesis; not a quoted source): per room store `O2` (mass) and `volume`; per edge store `conductance` (door open * width) and compute `flow = k * conductance * (O2_a/V_a - O2_b/V_b) * dt` with `k*conductance*dt*(1/V_a + 1/V_b) <= 1` clamped for stability; apply `O2_a -= flow; O2_b += flow` from the snapshot. Space is a node with fixed concentration 0 and infinite volume; a breach is an edge room-to-space with its own conductance; venting then decays O2 exponentially. Fire: per-room intensity `f`, grows if `O2/V > 0.10`, shrinks otherwise (Barotrauma rule), consumes `c * f * dt` O2; spread rolls use a seeded PRNG per edge per interval.

### Gaps
- No primary source was obtained for SS13 LINDA/Monstermos original code (tgstation), only SS14's port; the SS14 file comments reference both but I did not verify SS13 behaviour.
- Space Haven, RimWorld, Dwarf Fortress: no sources fetched; no claims made.
- ONI flow rules and tick rate: not found in this session.
- FTL exact numeric rates (O2 loss per second, fire spread chance per tick): fandom pages blocked (HTTP 402). Numbers above are from search summaries or player posts. Datamined values (e.g. community modding wiki, Hyperspace) would be the next place.
- SS14 gas reaction (`React`) code that consumes oxygen for fire was not fetched.
- Power networks: not researched (no source on SS13/SS14 power nets, Space Haven or Barotrauma wiring). Natural option from first principles: connected components of a power graph recomputed only when topology/status changes, but this is unsourced.
- Licensing: not verified in this session. My recollection (unverified) is that SS14 content is MIT and RobustToolbox is MIT, while Barotrauma's public source is "source available" under a restrictive license, so treat Barotrauma as read-only reference and do not copy code. Check the repo LICENSE files before reuse.

## 2. Simple, robust, deterministic formulations for rooms-as-nodes graphs

### Takeaway
Use start-of-step snapshots, edge-based flux with conductance clamps, and explicit thresholds below which values snap to equal or zero. SS14 and Barotrauma both converge on the same patterns: archive-then-share, proportional-to-volume equalisation, per-step caps, and minimum-delta cutoffs to let things go to sleep.

### Cited Findings
- Archive-then-share (all neighbours read start-of-cycle values) to avoid order bias. — [LINDA.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Server/Atmos/EntitySystems/AtmosphereSystem.LINDA.cs)
- Divide transfer by `(neighbours + 1)` so a node cannot give away more than its share across multiple edges (stability trick). — same file.
- Volume-proportional equalisation across an edge with per-step cap (Barotrauma `UpdateOxygen`). — [Gap.cs](https://raw.githubusercontent.com/Regalis11/Barotrauma/master/Barotrauma/BarotraumaShared/SharedSource/Map/Gap.cs)
- Minimum-delta cutoffs: `MinimumAirRatioToMove` 0.001, `MinimumTemperatureToMove` 5 K, snap-equal threshold `MinimumTemperatureDeltaToConsider` 0.01 K. — [Atmospherics.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Shared/Atmos/Atmospherics.cs)
- Spacing: venting multiplies by an escape ratio per tick (0.15 default) and snaps tiles below a minimum gas to 0 so the sim settles instead of asymptoting. — [CCVars.Atmos.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Shared/CCVar/CCVars.Atmos.cs)
- Fire growth/decay driven by a single oxygen-percentage threshold with a linear modifier, plus a per-room fire cap (16) and interval-based spread rolls (every 5 s, 15%). — [FireSource.cs](https://raw.githubusercontent.com/Regalis11/Barotrauma/master/Barotrauma/BarotraumaShared/SharedSource/Map/FireSource.cs), [Hull.cs](https://raw.githubusercontent.com/Regalis11/Barotrauma/master/Barotrauma/BarotraumaShared/SharedSource/Map/Hull.cs)

### Inferences
- Tick the hazard sim slower than 60 Hz (e.g. 10-15 Hz, same as SS14's 15, via accumulator with carry-over like SS14's `Timer -= AtmosTime`); at 8-30 rooms it costs microseconds either way, but fewer ticks make flow-rate tuning simpler and make network snapshots less chatty.
- Deterministic seeds: use a seeded PRNG (e.g. mulberry32) stored in state, never `Math.random`; Barotrauma uses `Rand.RandSync.Unsynced` for the spread roll (a sync hazard in multiplayer that FTLite should avoid).
- Use fixed-point integers (e.g. O2 in 1/1000 units, Int32) or Float32 typed arrays with explicit rounding if you need lockstep determinism across machines; for couch co-op (single authoritative sim) plain Float32 is adequate.
- Power on a room/edge graph: treat as connected components or per-room supply/demand with priority shedding, recomputed only on dirty events (generator destroyed, door/conduit changed). Unsourced design suggestion.

### Gaps
- No source for tuning values that fit a 5-minute-per-sector FTL-like pace; FTL numeric rates unverified.

## 3. Ship/room data formats (FTL layout, Tiled, SS14 YAML, custom JSON) and recommendation

### Takeaway
Tiled's JSON map format is a mature, tooling-backed option but carries pitfalls (type/class rename, infinite-map chunks, GID mapping). A custom JSON with a tile grid plus an explicit room list and door/edge list, validated by zod, is likely simpler and safer for FTLite. The FTL and SS14 format details could not be fetched.

### Cited Findings
- Tiled JSON: layers of type `tilelayer`, `objectgroup`, `imagelayer`, `group`; tile data is a flat GID array or base64 (optionally zlib/gzip/zstd compressed); objects carry `properties` arrays of `{name,type,value}`. — [Tiled JSON map format](https://doc.mapeditor.org/en/stable/reference/json-map-format/)
- Tiled pitfalls: GID to tileset needs `firstgid`; `type` renamed to `class` in 1.9 then partly reverted in 1.10; tile definitions saved in display order since 1.7; `version` number before 1.6, string afterwards; infinite maps store tiles in `chunks` (possibly negative coords) so reading only `data` misses tiles; polygon/point objects report width/height 0 and polygon points are relative to the object position. — same page.
- SS14 treats each tile's air as null when airtight/blocked and recomputes adjacency when airtight entities change; i.e. adjacency is derived from blockers, not authored. — [TileAtmosphere API](https://spacestation14.com/space-station-14/api/Content.Server/Content.Server.Atmos.TileAtmosphere.html); [Processing.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Server/Atmos/EntitySystems/AtmosphereSystem.Processing.cs)
- Barotrauma authors hulls (rectangles with volume) and gaps (connections between hulls, with a linked door) as separate map entities, and the sim runs on that hull/gap graph rather than on tiles. — [Hull.cs](https://raw.githubusercontent.com/Regalis11/Barotrauma/master/Barotrauma/BarotraumaShared/SharedSource/Map/Hull.cs), [Gap.cs](https://raw.githubusercontent.com/Regalis11/Barotrauma/master/Barotrauma/BarotraumaShared/SharedSource/Map/Gap.cs)

### Inferences
- Recommended format (my recommendation): single JSON per ship with `version`, `tiles` (width, height, and one or more flat arrays such as `floor`, `wall`, `roomId` as Uint8/Uint16), `rooms[]` (`id`, `name`, `volume`, `system?`, `slots`), `edges[]` (`a`, `b` or `"space"`, `kind: door|opening|airlock|breachable-hull-tile`, `tile:{x,y}`, `width`, `defaultOpen`), `crewSpawns`, `modules`. Derive per-room volume from `roomId` tile counts at load, and derive edges from door tiles as a cross-check against authored `edges`.
- Authoring in Tiled then converting at build time (script reads Tiled JSON with `layers` + object layer for doors/rooms, emits the custom JSON) keeps editor tooling without runtime Tiled pitfalls. Disable infinite maps, use CSV/uncompressed layers, ignore `class`/`type` distinction by reading only `properties`.
- Validation: zod schema for the runtime format with `.superRefine` checks: every `roomId` in tiles exists in `rooms`; every edge references existing rooms and its tile lies on the boundary between exactly those two rooms; the room graph is connected; no door on a wall-surrounded tile; ids unique; array lengths = w*h. Run at build time (fails CI) and at load. Provide `z.infer` types so the loader and tests share them. Use a `version` field plus migrations.
- For serializable state, keep ship static data (layout) immutable and separate from dynamic hazard state, which can be flat typed arrays indexed by roomId/edgeId (e.g. `Float32Array o2`, `Uint8Array fire`, `Float32Array doorOpen`, `Uint8Array breach`), snapshot = those arrays plus a PRNG state; this fits bitECS-style storage and compact network snapshots.

### Gaps
- FTL `.txt`/`.xml` ship layout format (rooms, doors, slots): the modding wiki page returned HTTP 402, so format details are not sourced here.
- SS14 map/grid YAML and prototype format: fetch returned 404; not sourced.
- Other open formats (RimWorld XML, Space Haven) not researched.
- No cited zod-specific references; validation advice is my own design suggestion.

## 4. Known bugs and pitfalls (oscillation, conservation, performance cliffs) and fixes

### Takeaway
The code comments in SS14's Monstermos and the structure of both games reveal the recurring issues: order dependence, non-conservation when clamping, O(n^2) equalisation worst cases, tiles that never settle, and stale adjacency when blockers change. Fixes used: snapshots, caps, snap-to-equal thresholds, sleeping, time budgets, and revalidation stages.

### Cited Findings
- Order dependence avoided by archiving state per cycle. — [LINDA.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Server/Atmos/EntitySystems/AtmosphereSystem.LINDA.cs)
- Monstermos performance cliff: BFS limited by tile limits (200 soft, 2000 hard); slow path described as the part "that can become O(n^2)"; comment about keeping it O(n^2) rather than O(n^3). — [Monstermos.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Server/Atmos/EntitySystems/AtmosphereSystem.Monstermos.cs)
- Monstermos fast path can strand tiles ("Oof we've painted ourselves into a corner. Bad luck. Next part will handle this."); `AdjustEqMovement` has temporary debug checks for null-tile callers; `FinalizeEq` recursively finalises neighbours first when a source lacks gas (a guard against negative moles). — same file.
- Ordering dependency: airtight data must be refreshed before adjacency updates so flood fills see dropped firelocks. — same file.
- Spacing is not conservative on purpose: part of vented gas is deleted and space tiles are set to `TCMB`; there is a wind limit (`MaxWind`) to stop depressurisation. — same file; [CCVars.Atmos.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Shared/CCVar/CCVars.Atmos.cs)
- Long-tail convergence: LINDA never reaches exact equality, so SS14 adds excited-group breakdown (force equalise) and dismantle (drop from active set), plus `GasMinMoles` floor. — [ExcitedGroup.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Server/Atmos/EntitySystems/AtmosphereSystem.ExcitedGroup.cs)
- Barotrauma smooths visual/physics flow force with lerp (rate 5) to avoid jitter and handles freshly opened gaps with an immediate larger force via `openedTimer`; clamps flow force to +-500. — [Gap.cs](https://raw.githubusercontent.com/Regalis11/Barotrauma/master/Barotrauma/BarotraumaShared/SharedSource/Map/Gap.cs)
- SS14's time-budget approach (3 ms, pause/resume, carry over lost time) addresses frame-time cliffs. — [Processing.cs](https://raw.githubusercontent.com/space-wizards/space-station-14/master/Content.Server/Atmos/EntitySystems/AtmosphereSystem.Processing.cs)
- FTL community note: fire requires oxygen so a room with a breach lets fire die out, but fire spreading into oxygen-rich neighbours during a slow drain keeps it going; players exploit door timing. — [Steam discussion](https://steamcommunity.com/app/212680/discussions/0/882960308780051350) (player report; unverified)

### Inferences
- Oscillation risk for explicit edge diffusion: if `k * conductance * dt * (1/V_a + 1/V_b) > 1` the flow overshoots and rooms ping-pong. Clamp as in the formulation above or use implicit/relaxation "move to the volume-weighted mean" like Barotrauma's `UpdateOxygen`, which cannot overshoot.
- Conservation: compute all flows from a snapshot, clamp each flow by the source's available amount, and apply symmetrically; deliberately lose mass only through an explicit space edge. Add a vitest property test: sum of O2 over rooms + vented total is constant to epsilon, and no value is negative or exceeds volume.
- Sleep: skip edges whose concentration difference is below epsilon and rooms with no fire/no breach; wake neighbours when a door toggles, a breach opens, or a fire starts (dirty flags). At <= 30 rooms this is optional, but the snap-to-equal/snap-to-zero thresholds matter for determinism and cheap snapshots (stable values compress/delta well).
- Dead-zone hysteresis on thresholds (fire shrinks at <10% O2, suffocation damage at a lower threshold) prevents flicker.
- Avoid unsynced RNG in sim paths (see Barotrauma's `RandSync.Unsynced` roll) because it breaks snapshot replay and determinism tests.

### Gaps
- No bug trackers or devlogs were located for oscillation issues; points above come from code comments and my reasoning.
- No performance figures (ms per tick) found for SS14 atmos beyond the 3 ms budget default.
- Flooding for a top-down ship (water as a second scalar per room with the same edge formulation, rising pressure, fire extinguish by water as in Barotrauma) is derived from Barotrauma code only; no top-down reference game was examined.
