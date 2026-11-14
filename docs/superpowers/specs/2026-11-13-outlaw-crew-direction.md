# Direction Spec: Outlaw Crew (working title)

Status: direction captured 2026-11-13 from the owner. This document sets the game's new direction; it is not a feature spec or a plan. Each milestone in section 9 gets its own spec, review and plan. Decisions marked **(rec.)** are Claude's recommendations, taken under the standing order ("take the recommendation and move on"); the owner can overturn any of them.

## 1. The owner's words

> "What if the game play loop was 'Play these mini games to operate a space ship in a pirates gameplay open world, together with friends'. In a Firefly setting like ex rebel in an Alliance controlled star system. Choose to be a smuggler, pirate, merchant, or terrorist."

The owner's reference image is a deduction game's ship map (`c:\Users\djuar\Downloads\Screenshot_(496).webp`): about fourteen rooms joined by corridors, where every room holds something to interact with or a unique mini game. Earlier the same day: "someday i want to be able to have 16 players operating a single battle star, or multiple ships" (roadmap, Someday maybe).

## 2. The pitch

**A crew of friends runs a battered freighter on the wrong side of the law in a star system ruled by the regime that won the war. Every station on the ship is a short hands-on mini game. Between ports, the crew chooses what kind of outlaws they are.**

The inspirations and what each contributes:

| Source | What we take | What we never take |
|---|---|---|
| FTL (today's FTLite) | Real-time ship crises: fire, breaches, oxygen, boarders, power, shields and frequencies, enemy ships with rooms | Its art, names and ships (foundation §12) |
| The deduction game in the screenshot | A ship that is a **map of rooms you run between**, each room with its own **task mini game** on your own screen | Its map layout, art, characters, specific tasks and impostor mechanic |
| Sid Meier's Pirates! | An **open world** of ports, trade, contracts, rumours, factions, reputation and a wanted level; you choose your career by what you do | Its names, setting and content |
| Firefly (tone only) | Ex-rebels scraping by on the frontier under a victorious central government; a found-family crew; a ship that is home | Every name, ship design, character, species and line (no "Alliance", "Browncoats", "Serenity", "Reavers", no Firefly-class silhouettes) |

## 3. Pillars

1. **Every console is a mini game.** Sitting at a station opens a short, readable, skill-based task on your own screen (3 to 12 s per action). The quality of the result drives the ship: a better weapons release hits harder, a cleaner frequency tune strips shields, a faster repair restores the system sooner.
2. **The ship is a map you run.** Rooms joined by corridors and doors; crises pull you from your station; you are needed in two places at once. FTLite's crew walking, oxygen, fire, breach and boarder simulation stays.
3. **An open world, Pirates!-style.** One star system per campaign (procedurally arranged planets, moons, stations, belts and lanes). Sail anywhere; trade, take contracts, chase rumours, dodge patrols.
4. **Choose your life.** Smuggler, pirate, merchant or insurgent. These are reputations you earn by what you do, not locked classes.
5. **Together with friends.** 1 to 16 players, one per machine (Net-0 decision); bots fill empty seats and dropped players. Bigger crews fly bigger ships.

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

**(rec.)** The owner wrote "terrorist". The recommended in-game label is **Insurgent** (or Rebel). The career's missions target the Accord's military, infrastructure and officials, never civilians. This keeps the found-family outlaw tone of the inspiration and avoids storefront and rating trouble. The owner can overrule this.

## 6. The ship: rooms and their mini games

Each room has one station. Sitting there opens its mini game; standing up closes it. Results go to the authority as one semantic command (section 8). All designs below are original; none copies a task from the reference game.

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
- **Console cards become mini games.** Net-1 already makes console UI client-owned state that emits semantic commands. A mini game is exactly that: it runs on the player's machine and sends one result command, for example `fire(weapon, target, quality)` or `repair(system, quality)`. The authority validates the seat, timing and bounds, then applies the effect deterministically. **Net-1a continues unchanged; it is the foundation the mini games plug into.**
- **Net-2 (FTL-style keyboard and mouse with clickable cards) becomes the mini-game consoles**, for keyboard, mouse and gamepad.
- **Scrap becomes credits**; shops become ports; Engineering upgrades become the shipyard and refits.
- **The per-player screen** (your mini game large, the ship around it, the others as status) becomes the main way to play. Couch play stays for 2 to 4 players with one mini-game panel per player **(rec.)**.
- **Ship classes scale with the crew:** the Skiff (1 to 2), a freighter (3 to 6), then a capital ship (up to 16) with 12 to 16 rooms. Several ships per crew come after that. Net-1 amendment 8 already keeps room for both.

**Goes or is reworked:** the three-sector FTL run with the Pursuit and the Warden as the main structure. The Warden can return as an Accord dreadnought; the Pursuit's pressure returns as the wanted level.

## 9. Milestones (recommended order)

| # | Milestone | Proves | Notes |
|---|---|---|---|
| D-0 | This direction | An agreed vision | Roadmap item 35 |
| Net-1a | The offline authority boundary (planned) | Client UI sends commands | Unchanged; mini games need it |
| MG-0 | **Mini-game sandbox** | Are the mini games fun? | Three mini games (Weapons charge and release, Sensors tune the band, Repairs reroute the conduit) in a standalone renderer page with no sim; can run beside Net-1a because it touches no sim code |
| MG-1 | Mini games at the Skiff's consoles | The ship loop with mini games | Replaces the Skiff's cards; result commands through the Net-1a boundary; the bots' quality model; takes Net-2's place |
| OW-1 | The open-world slice | Pirates!-style travel and trade | One system, travel with encounters, ports with market and contracts; Merchant and Smuggler backgrounds; customs inspections with the Comms and Cargo mini games; campaign save |
| Net-3 to Net-6 | Online play (as decided) | Friends over the internet | Order unchanged; can interleave with OW work |
| OW-2 | Outlaw careers | Choosing your life | Factions and heat, Pirate (boarding and capture), Insurgent operations, rumours, the ship's log |
| SHIP-1 | A freighter for 3 to 6 | Bigger crews | Raise `MAX_PLAYERS`; more rooms and mini games |
| SHIP-2 | A capital ship for up to 16, then several ships | The owner's big-crew goal | Departments, a captain role, majority votes, a dedicated server as host |

**Why this order (rec.):** the riskiest assumption is that mini games make running the ship fun, so MG-0 tests it cheaply before anything is rebuilt. Net-1a still goes first, because mini games are client UI that sends commands, and building them on today's raw-press cards would be thrown away.

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

## Amendments

(none yet)
