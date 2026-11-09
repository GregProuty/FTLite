# FTLite TypeScript stack patterns (bitECS 0.4, PixiJS v8, tile collision, Gamepad, testing, Electron)

Note on coverage: roughly 15 tool calls. Several fetches returned partial pages. Anything not in a fetched source is listed under Gaps or flagged "unverified".

## bitECS 0.4: components, relations, queries, observers, recycling, serialization, non-numeric data

### Takeaway
bitECS 0.4 is a function-first API in which components are plain objects holding SoA typed arrays or plain arrays, and the world is created with `createWorld`. Observers, relations and a `bitecs/serialization` module are built in. Snapshot serialization fits save games and replay. Strings and graphs have no special support, so keep them in plain arrays or in side tables keyed by eid.

### Cited Findings
- Components are plain JS references, and SoA is recommended: `{ x: [], y: [] }` or `{ x: new Float64Array(10000) }`. Usage is `addComponent(world, eid, Position)` and `Position.x[eid] = 0`. Queries are `query(world, [Position, Or(Health, Shield), Not(Stunned)])`, with `And`/`All`, `Or`/`Any`, `Not`/`None`. The `isNested` query modifier avoids removals during nested iteration, and `Hierarchy(ChildOf)` returns entities parents-first. — [bitECS docs/Intro.md](https://github.com/NateTheGreatt/bitECS/blob/main/docs/Intro.md)
- The 0.4 README shows `createWorld({ components: {...}, time: {...} })`, with components read back via `world.components`. A component can be AoS, for example `Player: [] as {level:number; experience:number; name:string}[]`, which is the documented way to hold a string. `removeEntity(world, eid)` is used inside systems. — [bitecs@0.4.0 README](https://cdn.jsdelivr.net/npm/bitecs@0.4.0/README.md)
- Observers: `observe(world, onAdd(Position, Not(Velocity)), eid => ...)`, with `onAdd`, `onRemove`, `onSet` and `onGet`. `observe` returns an unsubscribe function. `addComponent(world, eid, set(Position, {x:10, y:20}))` goes through `onSet`. — [Intro.md](https://github.com/NateTheGreatt/bitECS/blob/main/docs/Intro.md), [API.md](https://github.com/NateTheGreatt/bitECS/blob/main/docs/API.md)
- Relations: `createRelation(withAutoRemoveSubject)`, `createRelation({exclusive:true})`, `createRelation(withStore(() => ({amount: []})))`, `Pair(rel, target)` or `rel(target)`, `Wildcard`, `IsA`, `getRelationTargets(world, eid, rel)`, and `withOnTargetRemoved(cb)`. — [Intro.md](https://github.com/NateTheGreatt/bitECS/blob/main/docs/Intro.md), [API.md](https://github.com/NateTheGreatt/bitECS/blob/main/docs/API.md)
- Entity index: `createEntityIndex(withVersioning(8))`, and a world can be created with a shared index, `createWorld(entityIndex)`. Removed ids are recycled immediately by default. Versioning gives recycled ids a new version, which cuts the maximum entity count, so be careful using ids to index sparse typed arrays. The docs recommend manual recycling: tag an entity with a marker component, then remove tagged entities in a batch. — [Intro.md](https://github.com/NateTheGreatt/bitECS/blob/main/docs/Intro.md)
- Serialization lives in `bitecs/serialization`: `createSoASerializer/Deserializer`, AoS variants, `createObserverSerializer`, and `createSnapshotSerializer(world, components, buffer?)` / `createSnapshotDeserializer(world, components)` for full-state save and replay. Options are `diff`, `buffer` (default 100MB, so set a smaller one) and `epsilon`. Plain arrays need type tags (`f32`, `u8`, `str`, ...) or default to f64. ID maps are needed when loading into different eids. — [docs/Serialization.md](https://raw.githubusercontent.com/NateTheGreatt/bitECS/main/docs/Serialization.md)
- Example games: the closest found are a Phaser 3 + bitECS tutorial repo (older, likely pre-0.4) and kadajett/sdr "example-game" skill (Phaser 3 + bitECS 0.4). No open-source bitECS 0.4 + PixiJS game surfaced. — [search results via awesome.ecosyste.ms](https://awesome.ecosyste.ms/projects/github.com%2Fourcade%2Fphaser3-bitecs-getting-started), [skills.sh example-game](https://www.skills.sh/kadajett/sdr/example-game)

### Inferences
- Keep the sim pure by exporting the world and component stores from a `sim/` package that never imports pixi. The renderer holds a read-only view, plus a `prevX/prevY` pair for interpolation. Use a `Renderable` marker and an observer (`onAdd`/`onRemove`) in the renderer layer to create and destroy sprites.
- For room adjacency and strings, use a typed array of room ids plus a `Map`/array side table keyed by room id outside the ECS. Alternatively use a relation such as `AdjacentTo(roomEid)`. This is an inference, not documented.
- A snapshot serializer that skips side tables would not restore strings or graphs. Static graphs should be rebuilt from data on load.
- Because id recycling is immediate by default, the renderer must not hold eids across ticks without checking liveness (or using versioned ids).

### Gaps
- The official 0.3 to 0.4 migration guide at docs/MigrationGuide.md returned 404. Pitfalls and migration notes are unverified apart from the API shape above (the search snippet said `addComponent(world, eid, Component)` argument order changed).
- No source confirmed whether `createSnapshotSerializer` handles AoS or string stores. Verify against 0.4.0 source before relying on it.
- Observer docs for `onGet`/`onSet` semantics are thin. Test in vitest first.

## PixiJS v8: tilemaps, scaling, interpolation, overlays

### Takeaway
Use `await app.init()`, `@pixi/tilemap` 5.x with `CompositeTilemap`, a Render Group for the world and one for the HUD, and an explicit Culler call if culling is needed. Interpolate sprite positions from the Gaffer-style accumulator alpha.

### Cited Findings
- v8 changes: async `app.init`, new Graphics API (`.rect().fill()`), `GraphicsContext`, `Particle`/`ParticleContainer` (flat `particleChildren`, needs `boundsArea`), culling no longer automatic (`Culler.shared.cull(container, view)` or `CullerPlugin`), `BaseTexture` removed, scale modes as strings (`'nearest'`), ticker callback receives the `Ticker` (use `ticker.deltaTime`), leaf nodes cannot have children, and `pixi-filters` replaces `@pixi/filter-*`. — [Pixi v8 migration guide](https://pixijs.com/8.x/guides/migrations/v8)
- `@pixi/tilemap` README: version table appears to map Pixi v8.x to tilemap v5.x (table garbled in fetch). `CompositeTilemap` lazily layers multiple `Tilemap`s to hide the per-tilemap texture limit. Usage: `tilemap.tile('grass.png', x, y)` after loading an atlas via `Assets`. 16k tiles per tilemap by default, lifted by `settings.use32bitIndex`. — [pixijs-userland/tilemap](https://github.com/pixijs-userland/tilemap)
- Render Groups: `new Container({ isRenderGroup: true })`. They put transform, tint and alpha on the GPU and suit static structure and separate scene parts such as world vs HUD. Do not overuse; profile. — [Render Groups guide](https://pixijs.com/8.x/guides/concepts/render-groups)
- Fixed timestep with accumulator: cap frame time at 0.25 s, step in fixed dt, then render with `alpha = accumulator / dt`, blending previous and current state. — [Gaffer on Games, Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/)

### Inferences
- A ship interior is small and static, so one CompositeTilemap per ship (rebuilt only on tile change) inside the world render group is likely enough. Culling is probably unnecessary at this scale.
- For integer scaling at a fixed internal resolution: render the world to a fixed-size container, set the stage scale to `floor(min(w/W, h/H))`, center it, and use `'nearest'` scale mode. This is the standard approach but no source was fetched for it (unverified).
- Fire/oxygen/vision overlays can be a per-room tinted Sprite or a low-resolution RenderTexture with alpha driven from sim values. Not sourced.

### Gaps
- No verified source on @pixi/tilemap's exact v8 compatibility (garbled table), `tileAnimX`, or CompositeTilemap partial-update patterns.
- No source on lighting or vision techniques in v8, nor on ParticleContainer for tiles.
- Integer scaling and letterboxing: no source found.

## Free movement with collision on tile grids, door handling, pathfinding

### Takeaway
The standard approach is to move per axis, with AABB vs solid tile checks, resolving each axis separately (the Celeste/TowerFall method). At max speeds below one tile per tick, tunnelling is not a concern. For crew AI, use BFS/Dijkstra flow fields or A* on a room graph.

### Cited Findings
- Red Blob Games: BFS produces a `came_from` flow field. Dijkstra handles varying costs. A* adds a heuristic and is recommended for a single goal. Stop when the goal is taken off the frontier. BFS/Dijkstra suit paths to many locations. — [Red Blob Games A* intro](https://www.redblobgames.com/pathfinding/a-star/introduction.html)
- Maddy Thorson's "Celeste and TowerFall Physics" is the canonical source for per-axis integer-pixel movement with float remainder accumulation, solids/actors, riding, and squish. I could not fetch it (Medium 403, archive blocked), so the details below are from memory and unverified. — [Medium article](https://maddythorson.medium.com/celeste-and-towerfall-physics-d24bd2ae0fc5)

### Inferences
- Unverified from memory of the Thorson article: keep positions as float plus an accumulated remainder, round to integer pixels, and move one pixel at a time per axis, checking the AABB against solids. This gives sliding along walls for free and is deterministic, which suits a fixed 60 Hz sim and golden tests.
- Doors can be a tile whose solidity is a function of door state (open/closed/locked). Collision queries read a `solid(tx, ty)` lookup, not tile ids directly.
- A spatial hash is only needed for entity-vs-entity collisions, which at a few dozen crew is likely unnecessary.
- For analog stick input, normalize and clamp the vector so diagonals are not faster.

### Gaps
- No sourced treatment of swept collision, circle vs tile, or spatial hash. No door-specific examples found.
- No flow-field-on-room-graph implementation found.

## Local multiplayer input: Gamepad API in Electron/Chromium

### Takeaway
Poll `navigator.getGamepads()` every sim or frame tick, treat `index` as ephemeral, keep your own device-to-PlayerId map, and tolerate nulls. Electron-specific behavior is unconfirmed, so test in a built Electron app with real controllers.

### Cited Findings
- `gamepadconnected` fires when a gamepad is connected. If a pad was connected before page load, the event fires only after a button press or axis move. `gamepaddisconnected` fires only if the page previously received data. `index` is unique per connected device, and a new device may reuse a previous index after disconnect. The `id` string format is not strictly specified (Firefox form shown: vendor/product/driver). `mapping === "standard"` indicates the remapped standard layout. Re-read `getGamepads()` each frame rather than holding a Gamepad object, and check for null entries. — [MDN Using the Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API)
- Chromium `id` strings commonly look like "... (STANDARD GAMEPAD Vendor: 045e Product: 02ea)", per a secondary source. Do not parse strictly. — [DEV Community Gamepad guide](https://dev.to/trkb/the-javascript-gamepad-api-a-practical-guide-to-reading-controller-input-2lmc) (non-authoritative)
- An older devlog reported Chrome not firing `gamepadconnected` reliably, so keep polling as the source of truth. — [itch.io devlog](https://theedgeofthought.itch.io/eelemental/devlog/797/chrome-has-no-gamepadconnected-event) (old; not re-verified)

### Inferences
- Design: a `DeviceManager` that each tick scans `getGamepads()`, assigns new devices to press-to-join lobby slots (`PlayerId`), and on disconnect marks the slot "disconnected, awaiting rebind" and pauses or holds input at neutral. Reconnect is matched by `id` plus `index` heuristics, or by any-press-to-reclaim since ids of identical pads collide.
- Keyboard sharing: split into fixed key clusters (WASD, arrows, numpad/IJKL), each treated as a virtual device with a `PlayerId` mapping.
- Deadzone: apply a radial deadzone (about 0.15 to 0.25) with rescaling, not per-axis. This is conventional practice, not sourced.
- The sim should consume a per-tick `InputFrame` per PlayerId (move vector, buttons), which also makes headless tests and replays trivial.

### Gaps
- No source on Xbox/PS/Switch button-mapping differences in Chromium (non-standard mapping fallbacks, Switch Pro quirks, PS touchpad button).
- No Electron-specific confirmation of gamepad behavior, secure-context behavior under `file://`, or background-window polling.
- No press-to-join lobby open-source example found.

## Testing: vitest for ECS sims and headless runs

### Takeaway
Not researched with sources. The architecture (pure sim, input frames in, state out, fixed dt) is the main enabler.

### Cited Findings
- None fetched for this question.

### Inferences
- Run the sim headlessly in vitest with scripted `InputFrame` sequences, and assert on component arrays after N ticks. Golden tests can compare snapshots from `createSnapshotSerializer` (bytes) or a JSON dump of selected stores. Seed all RNG. This is unsourced.

### Gaps
- No vitest or ECS testing articles or example repos were reviewed.

## Electron specifics for a fullscreen couch game

### Takeaway
Use steamworks.js (not the maintenance-mode Greenworks) with the overlay hook, set Chromium switches before `ready`, and disable background throttling if needed. Frame-limit and vsync flags are not documented in the official switches page.

### Cited Findings
- Switches are set with `app.commandLine.appendSwitch(...)` before the app's `ready` event. Documented related switches: `--force_high_performance_gpu`, `--disable-renderer-backgrounding`. Flags can be explored through `about://flags` and `about://version`. The page does not document `disable-frame-rate-limit`, `disable-gpu-vsync`, `ignore-gpu-blocklist` or `autoplay-policy`. — [Electron command-line switches](https://www.electronjs.org/docs/latest/api/command-line-switches)
- steamworks.js is the recommended modern Steam binding. Greenworks is described as best-effort maintenance. It is a native module needing `main.js` configuration to be used in the renderer, and the overlay is enabled with `require('steamworks.js').electronEnableSteamOverlay()` at the end of main.js. Steam redistributable files must be copied into the build root. — [search summary of steamworks.js sources](https://awesome.ecosyste.ms/projects/github.com%2Fceifa%2Fsteamworks.js) (secondary), [steamworks.js issue 102](https://www.Github.com/ceifa/steamworks.js/issues/102)
- `backgroundThrottling` defaults to true. Set it to false (or pause on blur yourself) if the sim must keep running unfocused. — secondary source in the same search results (not primary)

### Inferences
- Because the sim uses its own fixed 60 Hz accumulator, vsync via the default `requestAnimationFrame` is usually adequate. Frame-rate-limit flags are probably unneeded.

### Gaps
- No electron-builder configuration guidance was found. No source on Steam Deck/Big Picture controller handling in Electron.
- Flag behavior for `disable-frame-rate-limit` unverified.
