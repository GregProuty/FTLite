# FTL clones, FTL-like and ship-management games: code/architecture prior art for FTLite

Research date 2026-11-09. About 15 tool calls. Items I could not verify are in the Gaps sections.

## Which open-source FTL clones / ship-sim projects exist (license, activity, quality)?

### Takeaway
There are few usable open-source FTL clones. The best are XFTL / Project Wormhole (Kotlin, GPL, full engine reimplementation) and its co-op fork Tachyon (GPL-2.0-or-later, 8-player host-authoritative). Hyperspace (GPL-3.0, C++, active) is a binary mod framework, not a clone. Barotrauma is source-available only, not open source. The GDQuest Godot demo (MIT) is a small combat sandbox. Nothing found is TypeScript, ECS-based or web-based.

### Cited Findings
- XFTL / "Project Wormhole" (by Campbell Suter / ZNix) is a clean-sheet FTL engine in Kotlin/LWJGL, hosted on GitLab. Its upstream is named in the Tachyon README. — [Tachyon README](https://github.com/sp00nznet/Tachyon), [upstream](https://gitlab.com/znixian/xftl). I did not open the GitLab repo, so its license and last commit are unverified. Tachyon says it is GPL-2.0-or-later "matching upstream".
- Tachyon (sp00nznet) is a fork of that engine. It adds up to 8-player co-op and an in-game dev menu, and loads art, audio and ship data at runtime from the user's own retail `ftl.dat`. License is GPL-2.0-or-later. GitHub API: created 2026-05-20, last push 2026-09-24. — [repo](https://github.com/sp00nznet/Tachyon), [GitHub API](https://api.github.com/repos/sp00nznet/Tachyon)
- Tachyon states that "all the hard engine work is upstream's": engine, asset loading, AI, ship systems, sectors, events and endgame. Tachyon adds only the UI and multiplayer layer. — [README](https://github.com/sp00nznet/Tachyon)
- FTL-Hyperspace is GPL-3.0 and last pushed 2026-11-04, with 156 stars and 2,632 commits. It is a binary-patching mod framework for the original game (custom races, systems, augments, drones, Lua scripting, `hyperspace.xml` config). FTL: Multiverse and Insurrection+ are built on it. — [repo](https://github.com/FTL-Hyperspace/FTL-Hyperspace), [GitHub API](https://api.github.com/repos/FTL-Hyperspace/FTL-Hyperspace)
- Hyperspace source layout: `src/game/` mirrors FTL's own class and folder layout, `src/features/` holds self-contained new features, `src/overrides/` holds replacement hooks, and `src/zhl/` is the hooking engine that finds functions by signature. Also `lua/` (scripting runtime) and `tests/` (built into debug builds). — [wiki Source Structure](https://github.com/FTL-Hyperspace/FTL-Hyperspace/wiki/Source-Structure)
- gdquest-demos/godot-2d-tactical-space-combat is MIT-licensed, 114 stars, GDScript, last pushed 2022-05-24 (stale). It is an FTL-inspired demo. — [GitHub API](https://api.github.com/repos/gdquest-demos/godot-2d-tactical-space-combat), [NOTES.md](https://raw.githubusercontent.com/gdquest-demos/godot-2d-tactical-space-combat/master/NOTES.md)
- Other GitHub "FTL clone" hits are small or abandoned, with no license and 1-7 stars. These are vastsuperking/openftl (C, 2015), localhorse/openftl (pygame, 2013, needs FTL data files) and luketaylor-dev/FasterThanLight (Unity portfolio clone of ship combat, pushed 2025-11-16, 1 star). — [GitHub search API](https://api.github.com/search/repositories?q=FTL+faster+than+light+clone&sort=stars)
- Barotrauma (C#, FakeFish) has public source with 2,291 stars and was last pushed 2026-10-27. There is no OSS license: the README points to an EULA.txt and shows "Copyright © FakeFish Ltd 2017-2026". So it is source-available and fine to study, but do not copy. — [repo](https://github.com/FakeFishGames/Barotrauma), [GitHub API](https://api.github.com/repos/FakeFishGames/Barotrauma)
- Barotrauma repo layout: `BarotraumaClient`, `BarotraumaServer` and `BarotraumaShared` (the `SharedSource` folder contains `Characters`, `Items`, `Map`, `Events`, `Networking`, `Prefabs`, `ProcGen` and `StatusEffects`). — [GitHub API contents](https://api.github.com/repos/FakeFishGames/Barotrauma/contents/Barotrauma/BarotraumaShared/SharedSource)
- Starsector is closed source, but its Java modding API is documented by the community: [CommunityApiDocs](https://github.com/StarsectorCommunityApiDocs/CommunityApiDocs) (pushed 2026-09-07). The map blog says mods can add fixed star systems while procedural generation fills the rest, and generation is controlled by a random seed. — [Fractal Softworks "cartography"](https://fractalsoftworks.com/2016/11/25/cartography)
- Space Haven (Bugbyte, closed) reached v1.0 on 2026-05-13 after about 10 years in early access. — [MCV](https://mcvuk.com/?p=229763), [Techraptor](https://Techraptor.net/gaming/news/space-haven-update-welcomes-players-back-with-huge-changes)
- Other FTL-adjacent games found by search (no source code inspected): Tachyon the standalone game, Undercrewed (co-op, early access) and FTL: Supremacy / FTL Multiplayer threads on the Subset forum. — [search results](https://subsetgames.com/forum/viewtopic.php?p=70879), [Co-Optimus Undercrewed](https://www.co-optimus.com/related-news/undercrewed)
- A Subset forum post says one FTL multiplayer project was a rewrite rather than a mod. FTLAPI (C++ API) was started alongside a multiplayer mod, and its completion is unknown. — [forum](https://www.subsetgames.com/forum/viewtopic.php?p=66133)

### Inferences
- The only open-source FTL engine with co-op is Kotlin/GPL, so it is read-only reference for FTLite, not reusable code. Copying GPL code into FTLite would force GPL. Use the ideas and numbers only. The numbers are reverse-engineered facts, but check this with a lawyer if the exact tables matter.
- No OSS TypeScript/bitECS FTL-like was found, so FTLite's stack has no direct prior art.

### Gaps
- XFTL's own license, last commit and code structure (GitLab not fetched).
- Pulsar: Lost Colony, Duskers, FTL Multiverse internals: no sources fetched, so nothing is claimed.
- Space Haven devlogs on pathfinding or job AI: not found. One search hit about an "Experimental Crew" update looked auto-generated and misattributed, so I discarded it.
- GitHub search for TypeScript/JS/Rust FTL-likes returned nothing relevant. This is a weak negative, since only a few queries were run.

## How do they model ship layout, crew pathfinding, systems/power, and sector/event generation?

### Takeaway
FTL uses a tile grid for rooms, with doors as edges between rooms or tiles. System placement and crew station slots are kept in blueprint data, not in the layout file. Oxygen, fire and crew AI are simple rate-based simulations over a room graph. Sector maps are generated by a small set of layered rules.

### Cited Findings
- FTL ship layout: `shipname.txt` lists rooms (id, tile position, width, height) and doors (tile position, the two room IDs, orientation flag). A paired `shipname.xml` has weapon mount and explosion data, and `blueprints.xml` holds game data. Tiles are 35 px. The door orientation convention is conflicting across community sources (0 = vertical in one, 0 = horizontal in another). — [FTL modding forum findings](https://www.subsetgames.com/forum/viewtopic.php?p=8135), [Superluminal guides](https://subsetgames.com/forum/viewtopic.php?p=44801). I did not open these pages.
- Station slots: each system's starting power, room ID and operator slot are in the blueprint XML. Slot positions are numbered 0 to 3 from the room corners. — [search summary of ftlwiki / forum](https://subsetgames.com/forum/viewtopic.php?p=33754). Unverified beyond snippets.
- Editor failure mode: a room ID that is not referenced makes the game create its own room in a corner and skew the whole ship. This is a lesson about validating layout data. — [same forum search](https://subsetgames.com/forum/viewtopic.php?p=33754)
- Crew pathing in the GDQuest demo: units go to the "closest available positions". The author notes FTL uses a simpler model where units move only to predefined tile positions. Listed problems: a Godot NavigationPolygon bug, grid movement on large grids, fire spread on a grid ("not fun"), and door timing edge cases when several units pass through one door. None were solved. — [NOTES.md](https://raw.githubusercontent.com/gdquest-demos/godot-2d-tactical-space-combat/master/NOTES.md)
- Crew AI (decompilation-derived notes in the Tachyon repo). Task enum: manning, repair, fight fire, repair breach, idle, dying, healing, combat, teleporting. Priorities are a numeric table, where lower is more urgent. Examples: manning piloting 64, shields 65 or 67 depending on difficulty, weapons 66, oxygen 68; repair is `PrioritizeSystem + 48`; healing 0; anything in a dangerous room is forced to 100. — [doc/crew-ai](https://raw.githubusercontent.com/sp00nznet/Tachyon/master/doc/crew-ai)
- Crew AI bug noted by the author: if every room is rated dangerous, all tasks tie at priority 100 and the AI locks up. Also, idle crew (priority 1000) will happily stand in a dangerous room. — [doc/crew-ai](https://raw.githubusercontent.com/sp00nznet/Tachyon/master/doc/crew-ai)
- Danger rating: an open airlock door, low health with oxygen below 10%, fire with low health, 4 or more fires, or a hacked medbay. — [doc/crew-ai](https://raw.githubusercontent.com/sp00nznet/Tachyon/master/doc/crew-ai)
- Oxygen: drains 1.2% per second with the system off, and refill is 1.2% times 1/4/7 per level (the UI says 1/3/6). Open airlock loss is 16% per second per door, and a hull breach is 8% per second. Loss falls off by 0.75^distance across the room graph. Redistribution groups rooms into chunks joined by open doors and moves each room 8% of the way toward the chunk average per second, ignoring distance. — [doc/oxygen](https://raw.githubusercontent.com/sp00nznet/Tachyon/master/doc/oxygen)
- Fire: each fire burns out on a random 5-14 counter once oxygen is below 10%. The counter ticks down faster with more adjacent fires. Spread is a random 10-49 counter reduced per adjacent fire, with the rate depending on the door level between them. Systems take 8% damage per second from fire, and crew take about 2.1% per fire per second. Adjacency counts a shared room or a door connection, not a wall. — [doc/fires](https://raw.githubusercontent.com/sp00nznet/Tachyon/master/doc/fires)
- Time: FTL's game speed factor is delta-time times 16, and timers multiply by 1/16. — [doc/reveng-general.md](https://raw.githubusercontent.com/sp00nznet/Tachyon/master/doc/reveng-general.md)
- Sector map: types are 20% nebula, otherwise 60% friendly and 40% hostile. Each column has 2-4 sectors, and a column never repeats the previous count. Links between columns are built so edges do not overlap. — [doc/sector-map](https://raw.githubusercontent.com/sp00nznet/Tachyon/master/doc/sector-map)
- Beacon map: a 6x4 grid, scanned x-outer and y-inner. Each cell has a 20% chance of being empty, capped so that empty cells stay under 20% of those filled. The exit beacon is in the two rightmost columns and at least 5 jumps from the start. It retries up to 16 times, then gives up. The rebel fleet "danger zone" is a circle of radius 767 that advances 64 px per normal jump. — [doc/sector-map](https://raw.githubusercontent.com/sp00nznet/Tachyon/master/doc/sector-map)
- Starsector: procedural generation is driven by a single random seed, and mods can add fixed systems that generation fills around. — [Fractal Softworks](https://fractalsoftworks.com/2016/11/25/cartography)
- Hyperspace config is data-driven through `data/hyperspace.xml`, and mods patch it with `hyperspace.xml.append`. — [README](https://raw.githubusercontent.com/FTL-Hyperspace/FTL-Hyperspace/master/README.md)
- Barotrauma has separate `Map`, `Events`, `ProcGen` and `Prefabs` folders, which fits a data-prefab approach. — [GitHub API](https://api.github.com/repos/FakeFishGames/Barotrauma/contents/Barotrauma/BarotraumaShared/SharedSource). I read only folder names and no code.

### Inferences
- For FTLite, a "crew member is a player" design drops most of FTL's crew AI. The AI's priority table is still useful for NPC/enemy boarders and for deciding what an unattended station does.
- Station slots should be part of ship or system data (room, slot tile, facing), validated at load time. FTL's tolerance of unreferenced rooms caused real bugs.
- Rates-per-second simulation over a room graph (oxygen chunks, fire adjacency) is cheap, deterministic, and fits bitECS well: components such as `Oxygen` and `Fire` per room or tile, one system per rule.
- All FTL timing is expressed in per-second rates multiplied by a speed factor. A fixed-step simulation with a speed multiplier maps onto this directly.
- Seeded generation with retry limits, as in beacon placement, is well suited to networked clients regenerating the same map from a seed.

### Gaps
- No primary source for the exact FTL layout `.txt` grammar. I only have forum search snippets, with a conflicting door orientation flag.
- No FTL event XML (`events.xml`, `sector_data.xml`) schema was fetched, so event-structure claims are omitted.
- The Tachyon `doc/` notes are decompilation-derived by the author. They look careful but were not cross-checked against the game, and the numbers apply to the original FTL version they studied.
- XFTL's own data model, such as how it loads ship layouts and whether it uses ECS, is unexamined.

## What problems did authors report, and how did they solve them (networking, postmortems)?

### Takeaway
The clearest solved multiplayer pattern is Tachyon's host-authoritative Command model, where clients send commands and render streamed snapshots. Barotrauma is server-authoritative with versioned incompatible protocols. The FTL GDC postmortem is about design process, not architecture. Pathfinding and door edge cases recur as pain points.

### Cited Findings
- Tachyon: every player action becomes a `Command` run on the host, and clients render streamed state snapshots. It uses TCP port 7777, a host plus up to 7 clients, and join/leave during play. Doors, crew, power, weapons, events, upgrades, jumps and equipment all sync. Each player gets a coloured named cursor, and crew selections are outlined in the owner's colour. — [README](https://github.com/sp00nznet/Tachyon)
- Tachyon avoided shipping copyrighted assets by loading from the user's own game files. It credits building on an existing engine for letting the author focus on multiplayer. — [README](https://github.com/sp00nznet/Tachyon)
- Barotrauma: the server hosts and syncs game state to clients. A dedicated and a player-hosted server differ only in using Steam networking for the latter. — [LuaCs networking manual](https://evilfactory.github.io/LuaCsForBarotrauma/lua-docs/manual/networking)
- Barotrauma networking folder includes `EntitySpawner.cs`, `NetEntityEvent/`, `INetSerializableStruct.cs`, `NetIdUtils.cs`, `FileTransfer/`, `Voting.cs`, `ServerSettings.cs`. This suggests entity events, struct-based serialization and network IDs. — [GitHub API](https://api.github.com/repos/FakeFishGames/Barotrauma/contents/Barotrauma/BarotraumaShared/SharedSource/Networking). The file names are a hint only, and I did not read the code.
- A 2020s paper in Ukrainian says Barotrauma uses the Lidgren network library, last released in 2020 and unmaintained. — [paper](https://zcit.kubg.edu.ua/index.php/journal/article/download/94/114/360). This is a single secondary source, not confirmed in code.
- Barotrauma patch notes say networking changes made old and new versions incompatible. A lag-fix test build credits Glenn Fiedler's networking articles. — [steamdb patch notes](https://steamdb.info/patchnotes/4717779), [Barotrauma test build post](https://barotraumagame.com/uncategorized/test-build-with-an-attempt-to-fix-the-lag)
- FTL postmortem (GDC 2013, Matthew Davis and Justin Ma): no design document, a single focused goal, many features dropped, and competition deadlines drove progress. Only summaries are available, with no transcript or slides found. — [Game Developer](https://gamedeveloper.com/design/designing-without-a-pitch---an-em-ftl-em-postmortem), [GDC Vault](https://gdcvault.com/play/1018034/Designing-Without-a-Pitch-FTL), [MCV](https://mcvuk.com/?p=89349)
- Space Haven: crew sometimes drifted out into space, attributed by a developer to a pathfinding bug. Civilians are limited to logistics jobs. Players complain about poor task prioritization. — [Steam thread](https://steamcommunity.com/app/979110/discussions/0/2790494800095171444), [BackerKit update](https://space-haven.backerkit.com/hosted_preorders/project_updates?page=2), [GamePressure summary](https://www.gamepressure.com/games/space-haven/z0573a) (the last is low-authority)
- Hyperspace's build rule is that headers under `src/game` must have unique names, and every `.cpp` auto-compiles. — [wiki](https://github.com/FTL-Hyperspace/FTL-Hyperspace/wiki/Source-Structure)

### Inferences
- Host-authoritative commands plus snapshots is a proven fit for FTL-style ship state, and it matches FTLite's "networking-ready" goal. For couch co-op, run the same Command pipeline locally, so each local player's input becomes a Command and online play later only swaps the transport.
- Tachyon's per-player cursor colour and selection outline is a UI convention to copy. FTLite's one-body-per-player model needs a per-player colour on the crew sprite instead.
- Pathfinding failures (units escaping the map, door timing) mostly come from continuous navigation. A tile or room graph with doors as explicit edges and one-at-a-time door occupancy avoids them.
- Version the protocol and sim rules from day one, since Barotrauma shows incompatibility is an accepted cost.

### Gaps
- No Barotrauma devlog or postmortem about desync, and no read of its actual `NetEntityEvent` code.
- No full FTL postmortem transcript, so no technical details from the authors.
- No Starsector devlog on its architecture beyond the map post.
- Tachyon's problems or lessons logged in issues were not inspected.

## What is worth copying vs avoiding for FTLite?

### Takeaway
Copy data-driven rooms/doors/slots, rate-based room-graph simulation, seeded generation with retry caps, and host-authoritative Commands. Avoid continuous-space navigation and grid-based fire, hard-coded tie-breaking priorities, binary hooking, and any GPL code.

### Cited Findings
Everything below is a summary of facts cited in the sections above. No new claims.
- Keep ship data and station slots in validated data files, because an FTL layout with an unreferenced room breaks the ship. — see layout findings above
- Model oxygen and fire per room with per-second rates and a door-connected "chunk" averaging step. — [doc/oxygen](https://raw.githubusercontent.com/sp00nznet/Tachyon/master/doc/oxygen), [doc/fires](https://raw.githubusercontent.com/sp00nznet/Tachyon/master/doc/fires)
- Generate maps from a seed with explicit constraints and a bounded retry count (16 in FTL). — [doc/sector-map](https://raw.githubusercontent.com/sp00nznet/Tachyon/master/doc/sector-map)
- Use a Command layer with host authority, since Tachyon shows it covers doors, crew, power and weapons. — [Tachyon README](https://github.com/sp00nznet/Tachyon)
- Keep game assets out of the repo, or use only original assets. — [Tachyon README](https://github.com/sp00nznet/Tachyon)
- Mirror a clear source layout of core vs features vs overrides, with tests alongside. — [Hyperspace wiki](https://github.com/FTL-Hyperspace/FTL-Hyperspace/wiki/Source-Structure)
- Share a `Shared` code module between client and server, as Barotrauma does with `BarotraumaShared`. — [GitHub API](https://api.github.com/repos/FakeFishGames/Barotrauma/contents/Barotrauma)

### Inferences
- Concrete recommendations:
  1. Authoring format: JSON ship definition with `rooms[]` (id, x, y, w, h), `doors[]` (a, b, tile, orientation) and `stations[]` (system, room, slot tile, facing). Use a zod-style validator and fail loudly on unreferenced room IDs. A vitest test can load every shipped ship.
  2. Navigation: tile grid with room tags, A* over tiles, doors as toggling edges. Keep doors simple and per-door occupancy explicit.
  3. Simulation: fixed-step bitECS systems with per-second rates and one `speedFactor` multiplier. Systems: power, oxygen, fire, damage, weapons, boarding.
  4. Station ownership: a player stands at a station tile to operate it. Give an NPC priority table (adapting FTL's) for unattended or enemy crew, and break priority ties explicitly so the AI cannot lock up.
  5. Network readiness: serializable `Command` objects processed by a deterministic sim tick, with the local couch players using the same path. Send snapshots at a lower rate. Version the protocol.
  6. Map and events: seed-driven, with `generate(seed)` returning plain data, tested in vitest for constraint satisfaction and retry caps.
  7. Licensing: do not copy any GPL (XFTL, Tachyon, Hyperspace) or Barotrauma EULA code. Original assets only.
- Avoid: continuous-space navmesh (the Godot demo hit unsolved bugs), grid fire spread as a core game-feel feature (its author called it not fun), and heavy dependence on a single decompiled-number table.

### Gaps
- None of this was tested. The recommendations are inferences from reading other projects and are not validated against FTLite.
- Whether bitECS fits snapshot serialization well was not researched here.
