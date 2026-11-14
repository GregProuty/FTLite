# Direction Spec: Outlaw Crew (working title)

Status: direction captured 2026-11-13 from the owner. **The gospel is `docs/vision/napkin.md`**; where this spec and the napkin disagree, the napkin wins. This document sets the game's new direction; it is not a feature spec or a plan. Each milestone in section 9 gets its own spec, review and plan. Decisions marked **(rec.)** are Claude's recommendations, taken under the standing order ("take the recommendation and move on"); the owner can overturn any of them.

## 1. The owner's words

> "What if the game play loop was 'Play these mini games to operate a space ship in a pirates gameplay open world, together with friends'. In a Firefly setting like ex rebel in an Alliance controlled star system. Choose to be a smuggler, pirate, merchant, or terrorist."

The owner's clarification the same day:

> "it's going to be among us style game play loop now, but keeping the FTL dual tetris combat. Plus story events with FTL/Stardew style dialogue options, with Blue Options based on crew skill and abilities"

So the game has three layers, each from one inspiration: **the moment-to-moment loop is Among Us-style tasks around the ship map; combat is FTL's two-ship systems battle; the story is FTL/Stardew dialogue events with blue options.** The open world (Pirates!) and the careers sit around them.

The owner's reference image is a deduction game's ship map (`c:\Users\djuar\Downloads\Screenshot_(496).webp`): about fourteen rooms joined by corridors, where every room holds something to interact with or a unique mini game. Earlier the same day: "someday i want to be able to have 16 players operating a single battle star, or multiple ships" (roadmap, Someday maybe).

## 2. The pitch

**A crew of friends runs a battered freighter on the wrong side of the law in a star system ruled by the regime that won the war. Every station on the ship is a short hands-on mini game. Between ports, the crew chooses what kind of outlaws they are.**

The inspirations and what each contributes:

| Source | What we take | What we never take |
|---|---|---|
| FTL (today's FTLite) | **The combat**: two ships side by side, each juggling reactor power, shields, weapons and damaged rooms while picking the other apart ("dual Tetris"); real-time crises (fire, breaches, oxygen, boarders); **story events with blue options** | Its art, names and ships (foundation §12) |
| The deduction game in the screenshot | **The core loop**: a personal task list spread across a map of rooms, each task a short mini game on your own screen; a shared progress bar; urgent crises that need people in two rooms at once; a crew gathering to decide | Its map layout, art, characters and specific tasks. The hidden-traitor mechanic is not in the core game (section 11) |
| Stardew Valley | **Dialogue**: characters with portraits and a voice, short lines, choices that change how a recurring contact feels about the crew | Its characters, art and writing |
| Sid Meier's Pirates! | An **open world** of ports, trade, contracts, rumours, factions, reputation and a wanted level; you choose your career by what you do | Its names, setting and content |
| Firefly (tone only) | Ex-rebels scraping by on the frontier under a victorious central government; a found-family crew; a ship that is home | Every name, ship design, character, species and line (no "Alliance", "Browncoats", "Serenity", "Reavers", no Firefly-class silhouettes) |

## 3. Pillars

1. **The loop is tasks around the ship (Among Us-style).** Each player has a task list spread across the ship's rooms. Every task, and every console, is a short, readable, skill-based mini game on your own screen (3 to 12 s per action). Finishing tasks fills the crew's shared bar toward the current goal. Crises pull you away, and some need two people in two rooms at once. FTLite's crew walking, oxygen, fire, breach and boarder simulation stays.
2. **Combat is FTL's dual Tetris.** Ship-to-ship fights keep FTLite's FTL model: both ships have rooms, systems, reactor power, shield layers, weapon charge and crews. You juggle your own ship's power and damage while picking the enemy's rooms apart. The mini games are how stations act in the fight; the rules underneath stay FTL's.
3. **An open world, Pirates!-style.** One star system per campaign (procedurally arranged planets, moons, stations, belts and lanes). Sail anywhere; trade, take contracts, chase rumours, dodge patrols.
4. **Choose your life.** Smuggler, pirate, merchant or insurgent. These are reputations you earn by what you do, not locked classes.
5. **Together with friends.** 1 to 16 players, one per machine (Net-0 decision); bots fill empty seats and dropped players. Bigger crews fly bigger ships.
6. **Stories with blue options (FTL and Stardew).** Story events are conversations with characters: a portrait, short lines, and two to four choices. **Blue options** appear when someone aboard has the skill, ability, gear or standing for them, and name who makes them possible.

## 3a. The core loop in detail (Among Us-style)

- **Phases.** A session alternates three phases: **in port** (trade, contracts, talk, refit), **underway** (travel with tasks and encounters), and **in combat** (the FTL battle). Tasks exist in all three; combat replaces routine tasks with battle stations.
- **Task lists.** On every leg, each player receives 3 to 6 tasks spread across the ship's rooms: routine upkeep (clear the scrubbers, recalibrate the sensors, balance the reactor) and **job tasks** from the current contract (pack the contraband before the customs cordon, prime the cargo lock before boarding, plot the blockade run). The list is on your own screen; the target rooms show on your map.
- **The shared bar.** Every finished task fills the crew's bar for the leg's goal: drive spooled, cargo ready, the hidden compartments sealed before inspection. Unfinished upkeep has consequences (systems drift, oxygen falls, the drive spools slower), so there is always something to do.
- **Crises are the urgent tasks.** Fires, breaches, boarders and enemy hits (today's hazards) interrupt the list. The worst need **two people in two rooms at once** (a reactor surge held at two panels, a hull seal from both sides of a door), which is the reason a crew must talk.
- **The ship map.** A console on the bridge (and a small map on everyone's screen) shows each crew member's room, the open tasks and the crises: the crew's shared picture.
- **Gathering to decide.** Story events and big choices call the crew together. Everyone sees the conversation; choices are made with today's vote (majority, the captain breaks ties).
- **Bots** take a task list like a player and resolve mini games with a skill-based quality model.

## 4. The setting (original; names are placeholders)

- **The Accord** (placeholder): the central government that won the unification war a decade ago. It rules the system from its core worlds: patrols, customs cordons, warships, informers. Lawful and prosperous at the centre, indifferent at the edge.
- **The Free Worlds remnant** (placeholder): what is left of the losing side. Some fight on in cells; most just survive. The captain fought for them.
- **The syndicates** (placeholder): crime families who run the black markets, the smuggling routes and the debts.
- **The frontier**: mining moons, ranch worlds, derelict stations, belts and wrecks. Poor, independent, wary of everyone.
- Tone: dusty, warm, funny, sometimes grim. Episodes, not epics: each job is a story the crew retells.

## 5. Careers

A career is a **starting background** chosen in the lobby (ship, cargo, contacts, debt and starting standing) plus the **reputation** the crew earns afterwards. A crew can drift between careers; the world reacts to the reputation, not the label.

| Career | Core activity | Signature mini games and moments | World reaction |
|---|---|---|---|
| **Smuggler** | Move contraband past Accord customs | Packing contraband into hidden compartments; bluffing an inspection over Comms; running a blockade at the Helm | Syndicate trust; Accord heat when caught |
| **Pirate** | Disable ships, board them, take the cargo or the ship | Precision fire at engines and weapons; boarding on foot; cracking the cargo lock | Merchants flee or surrender; bounty hunters; Accord heat |
| **Merchant** | Buy low, sell high, carry legal freight, escort convoys | Haggling at port; loading cargo; holding convoy formation at the Helm | Lawful standing; cheaper permits; pirates target you |
| **Insurgent** (rec. label) | Fight the Accord for the remnant: sabotage depots and warships, steal intel, free prisoners | Slicing a station's security; planting charges on a military target; evading pursuit | Remnant rewards and safe houses; maximum Accord heat |

**(rec.)** The owner wrote "terrorist". The recommended in-game label is **Insurgent** (or Rebel). The career's missions target the Accord's military, infrastructure and officials, never civilians. This keeps the found-family outlaw tone of the inspiration. The owner can overrule this.

## 6. The ship: rooms and their mini games

Each room has one station. Sitting there opens its mini game; standing up closes it. Results go to the authority as one semantic command (section 8). All designs below are meant to be original; amendment A10 checks the prototypes.

| Room | Station mini game (original) | Drives |
|---|---|---|
| Bridge: Helm | **Steer the lane**: keep the ship's marker inside a drifting safe lane; a dodge window opens on incoming fire | Evasion, blockade runs, docking, convoy formation |
| Bridge: Navigation | **Plot the course**: link waypoints on a system chart around hazards and patrol zones before the drive spools | Route, travel time, jump |
| Weapons | **Charge and release**: release a charging bar inside a moving sweet spot; pick the enemy room in the enemy window | Damage and accuracy; system targeting |
| Sensors (today's Science) | **Tune the band**: turn a dial until your trace matches the enemy shield's waveform (today's frequency rule) | Shield stripping, scans, finding hidden ships and cargo |
| Engineering | **Balance the reactor**: keep a pressure needle in band while moving power bars between systems | Power distribution, upgrades |
| Engine room | **Spool the drive**: feed fuel in rhythm to bring the drive to full without flooding it | Jump charge, burn speed |
| Life support | **Clear the scrubbers**: open and close valves in the right order as pressure warnings light | Oxygen, venting |
| Doors and security | **Seal the ship**: a deck plan; tap doors and airlocks to seal, open or vent (today's Doors card) | Containment; venting boarders and fires |
| Comms | **Talk your way out**: choose replies under a timer with a tell meter; decode intercepted traffic | Customs bluffs, hails, surrender talks, rumours |
| Cargo hold | **Pack the hold**: fit crates into the hold and contraband into hidden compartments | Capacity, smuggling, inspections |
| Medbay | **Keep them steady**: hold a downed crew member's vitals in rhythm | Revives and healing |
| Repairs (any broken system) | **Reroute the conduit**: rotate tiles to reconnect a broken circuit; harder the worse the damage | Restoring failed systems and breaches |

Rules for every mini game:
- **Short.** 3 to 12 s per action and interruptible; standing up abandons it with no penalty beyond lost time.
- **Readable on your own screen**, with the ship still visible around it; playable with gamepad, keyboard and mouse.
- **Skill shows.** Existing skills and XP make mini games easier (wider sweet spots, slower drift) instead of changing outcomes invisibly.
- **Pressure scales difficulty.** Damage, heat, fire in the room and boarders make the mini game harder.
- **Failing costs time, never locks you out.** A bad result is a weaker effect or a retry, never a dead station.
- **Bots** resolve mini games with a skill-based quality model, so solo play and dropped seats still work.

## 6a. Combat: FTL's dual Tetris, kept

Combat keeps today's model and grows it; nothing is simplified for the mini games.
- **Two ships.** Our ship is fully simulated today: rooms, systems, a reactor with power bars, shields with frequencies, weapon charge, hull, oxygen, doors, fire, breaches and a crew. **The enemy is not yet symmetric** (amendment A3): it has four system HP/ion entries and five rooms (`sim/enemy.ts:24`), timer repairs (`sim/enemy.ts:181`), damage-timer fires and breaches (`sim/enemy.ts:145`) and render-only crew (`render/enemyWindowModel.ts:74`). A full enemy simulation (its own oxygen, doors, reactor and crew) and outbound boarding are new work with their own milestone (CB-1).
- **Your half of the puzzle:** Engineering moves power between systems as damage takes bars away; Repairs and the crew restore broken rooms; the Helm evades.
- **Their half:** Sensors reads and tunes their shields; Weapons times its volleys and picks the room to hit (shields first, then weapons or engines); boarders can be sent across.
- **The mini games are the input, FTL's rules are the result.** A good release is more damage or accuracy within today's formulas; a bad one is weaker, never a different game. Bots fight through the same rules.
- **Victory conditions grow with the careers:** destroy, disable and board (pirate), outrun (smuggler), make them surrender (merchant), or reach the target system and plant the charge (insurgent).

## 6b. Story events and dialogue

Today's events-as-data (Loop-v: data-driven events with blue options tagged with a console or skill, a safe choice for bots, weights and depth gates) grow into conversations.
- **Characters.** Each event has a speaker with a portrait and a name: a customs officer, a syndicate fixer, a desperate colonist, an old comrade from the war. Short lines, Stardew-style, one beat at a time.
- **Choices.** Two to four per beat, with the effect or odds stated where today's events state them.
- **Blue options.** A choice appears in blue when someone aboard qualifies, and it names them: `[Engineering 3 · Mara] Offer to fix their reactor`. Qualifiers: a skill level, a character's ability or complication, a species ability (later), carried gear or cargo, faction standing or a career reputation. Bots count, so a solo player still sees them. A blue option is reliably good, as in FTL.
- **Recurring contacts (Stardew).** Contacts at ports remember the crew: a relationship level changes their lines, prices, contracts and rumours, and unlocks their own story arcs.
- **Who chooses.** The whole crew sees every line; choices use today's vote (majority, captain breaks ties, a time limit).

## 7. The open-world loop

- **Travel.** Navigation plots a course on the system map; the voyage plays in real time with encounters on the way: Accord patrols and customs, pirates, merchants, distress calls, derelicts, belts. Today's encounter, event and enemy-ship systems become these.
- **Ports.** A market (prices differ by port and shift with events), a contracts board (freight, smuggling jobs, bounties, insurgent operations), a shipyard (repairs, upgrades, new ships) and a bar (rumours, hiring crew).
- **Factions and heat.** Standing with the Accord, the remnant, the syndicates and the frontier towns; a wanted level with the Accord that brings more patrols and inspections and closes core ports.
- **Rumours and changing places.** Tips mark targets on the map for a while; ports and beacons change while you are away (from Someday maybe).
- **Capture by boarding.** Disable a ship, board it on foot, take its cargo, ransom it or take the ship (from Someday maybe).
- **The ship's log.** Every session ends with the crew's story so far (from Someday maybe).
- **Campaign shape (rec.).** A persistent campaign per crew, saved between sessions of 30 to 90 minutes, with a career goal (clear the debt, retire rich, become a syndicate power, win the remnant's war) and an ending. Losing the ship is a heavy setback (ship and cargo lost, crew escape in a pod with debt), not the end. An optional one-life mode keeps roguelike permadeath. Each new campaign generates a new system.

## 8. What stays, what changes, what goes

**Stays (the engine of the new game):** crew walking and rooms; oxygen, fire, breaches, boarders, doors and airlocks; power, shields, frequencies and the enemy ship window; weapons and loot; skills, XP and characters; votes; bots; the director's pacing (now for voyages and fights); events as data (now encounters, port events and contracts); determinism, replays and saves; the whole networking decision (Net-0) and Net-1.

**Changes:**
- **Console cards become mini games.** Net-1 already makes console UI client-owned state that emits semantic commands. A mini game is exactly that: it runs on the player's machine and sends one result command, for example `fire(weapon, target, quality)` or `repair(system, quality)`. The authority validates the seat, timing and bounds, then applies the effect deterministically. **Net-1a continues unchanged as a pure extraction; it is the foundation the mini games plug into.** The quality-bearing result commands and the attempt lifecycle are a separate, explicit command extension (MG-X, amendments A1 and A2), because Net-1's `fire` carries no quality and repair is held input today.
- **Net-2 (FTL-style keyboard and mouse with clickable cards) becomes the mini-game consoles**, for keyboard, mouse and gamepad. Net-2's other deliverables (click-to-move with pathfinding as `moveTo`, the per-player screen layout) move into MG-1 (amendment A6).
- **Scrap becomes credits**; shops become ports; Engineering upgrades become the shipyard and refits.
- **The per-player screen** (your mini game large, the ship around it, the others as status) becomes the main way to play. Couch play stays for 2 to 4 players with one mini-game panel per player **(rec.)**.
- **Ship classes scale with the crew:** the Skiff (1 to 2), a freighter (3 to 6), then a capital ship (up to 16) with 12 to 16 rooms. Several ships per crew come after that. Net-1 amendment 8 already keeps room for both.

**Goes or is reworked:** the three-sector FTL run with the Pursuit and the Warden as the main structure. The Warden can return as an Accord dreadnought; the Pursuit's pressure returns as the wanted level.

## 9. Milestones (recommended order)

| # | Milestone | Proves | Notes |
|---|---|---|---|
| D-0 | This direction | An agreed vision | Roadmap item 35 |
| Net-1a | The offline authority boundary (planned) | Client UI sends commands | Unchanged pure extraction |
| MG-0 | **Mini-game prototype** (disposable) | Are the mini games fun to operate? | Three mini games (Weapons charge and release, Sensors tune the band, Repairs reroute the conduit) in a standalone renderer page with no sim; runs beside Net-1a. A prototype, not a playable-game milestone. Also tests two- and four-player panel layouts at 1280 x 720 with gamepad and keyboard (A9) |
| MG-X | The mini-game command extension | Results enter the sim safely | Authority-owned attempts (identity, eligibility tick, minimum duration, one completion, invalidation), bounded quality in a defined numeric form, a deterministic outcome formula, replay and checkpoint records; replaces held repair with one path (A1, A2) |
| MG-1a | One integrated encounter | Mini games under combat pressure | Weapons, Sensors and Repair as mini games in a real Skiff fight on today's sector run; defined quality effects, charge overlap, passive output while unoccupied, XP and skill effects; gates on combat throughput, crisis response and repeated-play fatigue (A5) |
| MG-1b | The task loop on the Skiff | The Among Us-style loop | The task model (A4), task lists, the shared bar, every Skiff console as a mini game, one two-room crisis with solo and downed-crew fallback, bots on tasks (A7), click-to-move and the per-player layout from Net-2 (A6); the sector run stays as the harness |
| EV-0 | One branching conversation | The dialogue model | Beats, per-beat votes, named blue options, revalidation at resolution, captain rule (A8) |
| EV-1 | Dialogue events with blue options | FTL/Stardew stories | Today's 28 events rewritten as conversations |
| CB-1 | The symmetric enemy ship | Combat both ways | Enemy oxygen, doors, reactor and simulated crew; outbound boarding; capture (A3) |
| Net-1b | Durability (as decided) | Long runs and recovery | Required before Net-3 and before campaign saves (A6) |
| OW-0 | Port-to-port contract slice | The open world, small | Replaces the sector run with a bounded slice: a few ports, travel with encounters, one contract type, Merchant background; campaign save rules defined first (A9) |
| Net-3 to Net-6 | Online play (as decided) | Friends over the internet | Order unchanged; can interleave with OW work |
| OW-1 | The open world | Pirates!-style travel and trade | One full system, markets, the contracts board, Smuggler background with customs inspections (Comms and Cargo mini games), contacts and relationships |
| OW-2 | Outlaw careers | Choosing your life | Factions and heat, Pirate (needs CB-1), Insurgent operations, rumours, the ship's log |
| SHIP-1 | A freighter for 3 to 6 | Bigger crews | Raise `MAX_PLAYERS`; task occupancy, votes, bots and network cost validated at 6 |
| SHIP-2 | A capital ship for up to 16 | The owner's big-crew goal | Departments, a captain role, majority votes, a dedicated server; validated at 16 |
| SHIP-3 | Several ships per crew | Fleet play | Separate from SHIP-2 |

**Why this order (rec.):** the riskiest assumption is that mini games make running the ship fun, so MG-0 tests the controls cheaply and MG-1a tests them under combat pressure before every console is converted. Net-1a still goes first, because mini games are client UI that sends commands, and building them on today's raw-press cards would be thrown away. The sector run stays as the playable harness until OW-0 replaces it.

## 10. Risks

- **Mini games pull eyes off the ship.** The reference game's tasks are calm; FTLite is crisis-driven. Mitigation: short tasks, the ship stays visible around the panel, alerts break through, standing up is instant. MG-0 tests this.
- **Scope.** An open world plus mini games plus networking is three games. Mitigation: the playable slices above, one star system, and reuse of every existing system.
- **Couch play.** Several players' mini games may not fit one shared screen. Mitigation: per-player panels for up to 4; online is the main mode.
- **Imitation.** Never copy the inspirations' names, maps, tasks or look (section 2, foundation §12).
- **The insurgent career's tone.** Mitigation: the section 5 rule (Accord military and infrastructure targets only).

## 11. Open questions for the owner (recommendations taken meanwhile)

1. The career label "Insurgent" for the owner's "terrorist" (rec.: yes, section 5).
2. A persistent campaign with an optional one-life mode, instead of short roguelike runs (rec.: yes, section 7).
3. Couch play stays for 2 to 4 players with per-player panels, with online as the main mode (rec.: yes).
4. The game's name and the factions' names (placeholders until the owner names them).
5. A hidden-traitor mode (an Accord informant aboard, the deduction game's signature) (rec.: not in the core co-op game; park it in Someday maybe as an optional mode).

## Change log

- 2026-11-13, owner clarification: the moment-to-moment loop is Among Us-style tasks (section 3a), FTL's dual-Tetris combat is kept whole (section 6a), and story events become FTL/Stardew dialogue with blue options from crew skills and abilities (section 6b). EV-1 added; MG-1 became the task loop.

## Amendments

From Codex's review (`2026-11-13-outlaw-crew-review.md`), all accepted; the milestone table above already reflects them.

- **A1. Mini-game commands are an explicit extension (MG-X).** Net-1a stays a pure extraction. MG-X adds typed task and attempt identities, target identities, a bounded quality value, its execution phase, completion effects, cancellation and duplicate handling. Held repair is replaced or kept on purpose; the two paths never both pay out.
- **A2. Attempts have an authority-owned lifecycle.** An attempt gets an identity and an eligibility (start) tick from the authority, a minimum duration and exactly one completion. Standing up, switching tabs, going down, the target being repaired or destroyed, pause, reconnect and host recovery invalidate it by stated rules. Difficulty and skill are pinned at the start tick. Replays record the canonical quality and accepted tick; checkpoints hold active attempts and the bots' timing and random state. Quality is a defined number (for example an integer 0 to 100) fed to a deterministic formula. Friends-only trust is accepted: bounds cannot prove honest dexterity. Tests cover duplicate, stale, interrupted, restored and late completions.
- **A3. The enemy is not yet symmetric.** Section 6a now states what exists. Full enemy simulation, outbound boarding and capture are milestone CB-1, which must land before OW-2's Pirate career.
- **A4. A task model.** Each task instance has a stable identity, a leg and goal, a room, an assignee or claim, prerequisites, progress, a reward and a lifecycle. Specify reassignment, partial completion, suspension and resumption around combat, and bar scaling with the number of active crew. The Skiff's grouped seats (`sim/ship/skiff.json:46`) are a stated exception to one station per room; roaming tasks live in rooms without a console. Paired two-room crises have a solo, bot and downed-crew fallback so a lone survivor never deadlocks. Upkeep decay pauses in port and during dialogue.
- **A5. Prove the loop under pressure before converting everything.** MG-0 is a disposable controls prototype. MG-1a is one integrated encounter. Its spec must define quality effects, how a 3 to 12 s action overlaps weapon charge (so it never lengthens every weapon cycle), passive output while a station is unoccupied, XP, teamwork, and whether today's skill multipliers (`sim/stations.ts:13`, `sim/skills.ts:22`) are kept, replaced or both. Gates: combat throughput, crisis response time and repeated-play fatigue.
- **A6. No lost dependencies.** Net-1b stays before Net-3 and before campaign saves. Net-2's click-to-move with pathfinding and per-player layout move into MG-1b. The sector run stays as the playable harness through MG-1 and EV-1, until OW-0 replaces it with a bounded port-to-port slice.
- **A7. Bots do tasks like players.** Bots walk to tasks, reserve them, take the attempt's duration, can be interrupted, pair for crises, and draw quality deterministically through the same validation as humans, with no free completions. Gates: solo with bots, a lone survivor, mixed human and bot crews, and a disconnect then reclaim mid-task. The Net-1 bot baseline holds until MG deliberately changes it.
- **A8. Dialogue state and votes.** Votes reference an event beat and reset each beat; blue-option qualifiers are revalidated at resolution; eligibility for conscious and away crew is stated. The captain is chosen in the lobby (fallback: the lowest-numbered conscious player); today's tie-break by Navigation (`sim/run.ts:326`) becomes the captain. The timer and combat-pause policy are specified. One branching conversation (EV-0) comes before rewriting all 28 events; contacts and relationships persist from OW-1.
- **A9. Couch and campaign scale are gated early.** MG-0 tests two- and four-player panel layouts at the target resolution with controllers and keyboard, including alerts and accessible timing. Before OW-0: campaign save ownership, reserved seats and roster changes, loss recovery, economy bounds and voyage pacing (today's director is beacon-gated, `sim/director.ts:26`). SHIP-1 and SHIP-2 validate task occupancy, votes, bots and measured network and state costs at 6 and 16 players.
- **A10. Originality is shown, not claimed.** Each content gate compares the actual prototypes (interaction sketches, room layout, terms, silhouettes, portraits) with the inspirations. Setting names stay provisional; this is a content review, not trademark clearance.
