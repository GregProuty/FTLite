# Artemis SBS officer stations (Helm, Weapons, Science, Comms, Captain/Main Screen)

Source quality note: the official manual (v1.70 rev5, hosted on Steam CDN) was fully read and is the backbone of this file. It is a 1.x manual, so details may have changed in 2.x (2.0 released Aug 2013; latest stable 2.8.0, Dec 2021). The Fandom wiki (402 blocked), pbworks wiki (redirect loop), artemis.eochu.com (domain now serves an unrelated news/casino site) and several press pages could not be fetched. Anything 2.x-specific below comes only from Wikipedia and search snippets and is flagged.

Manual URL: https://cdn.akamai.steamstatic.com/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf
Abbreviation: [M1.70] = that manual.

## Per-station controls, exclusive information, and core loop

### Takeaway
Each station owns a distinct slice of information and control: Science alone has the sensor scan data (class, shield frequency weakness), Weapons alone can fire and lock, Helm alone steers, Comms alone talks to stations/ships, and the Captain has no controls and exists to coordinate by voice. Because info is siloed, the game is driven by verbal relay.

### Cited Findings

**Captain / Main Screen**
- The Captain has no controls; the wiki-level summary says the role sets strategy and relays bearings and shield frequencies, and other stations pick what the main screen shows on the captain's orders — [Wikipedia](https://en.wikipedia.org/wiki/Artemis:_Spaceship_Bridge_Simulator)
- The manual describes the captain as decision-maker, coach and mentor who keeps harmony; "not necessary to know all of the jobs" — [M1.70]
- Optional "Captain's Map" console exists (map with LRS long-range scan, VIS visual toggles; selected target shows race, class, designation, bearing, range; green friendly, red enemy, yellow surrendered, white unknown). The manual notes many captains skip it and use the forward view screen — [M1.70]
- Main Screen default is an external aft view of the ship; only Helm and Weapons can change its view (e.g. forward, status, tactical) — [M1.70]
- Manual's example commands show the intended loop: "Helm, set course two-seven-zero", "ask DS4 to build a Type Six mine", "what is that Skaraan's weakest shield frequency?" — [M1.70]
- Server machine doubles as the main view screen; a full crew is 6 players on 6-7 computers; one server supports up to 36 officers on 6 ships; a single computer can host multiple consoles if the crew is small — [M1.70]
- Red Alert is toggled by Comms (not the captain): klaxon, crew to battle stations, tactical display turns red — [M1.70]
- Review view: Captain "mostly talking and giving orders", moves between stations — [Board Game Quest](https://www.boardgamequest.com/artemis-spaceship-bridge-simulator-review/)

**Helm**
- Controls: warp slider (max Warp 4) and impulse slider (0-100%); rudder/maneuver slider (must be re-centred or the ship keeps turning), also arrow keys/joystick, or click the map to set a heading; reverse toggle (new in 1.70, warp cannot engage in reverse); shields up/down (shared with Weapons); main-screen view selection; 4 map zoom levels; docking button usable within 600 units of a station; ship subsystem and damage readouts — [M1.70]
- Jump drive option (selected at setup, Ximni-style): set distance slider and direction slider, Initiate, Confirm; countdown cannot be cancelled once begun and its length depends on Engineering power — [M1.70]
- Warp factor vs efficiency: higher warp factor is faster but less efficient; most efficient is Warp 1 at max power; least efficient Warp 4 at minimum power — [M1.70]
- Nebulae cap FTL at Warp 1 and impair sensors; asteroids block beams and detonate any torpedo (even nukes); singularities and mines can kill the ship; Helm can use an asteroid to destroy pursuing Torgoth drones — [M1.70]
- Docking: all USFP stations allow docking if no hostiles nearby; docking refills energy, torpedo stock and replacement damage-control teams; if Comms says "Stand by for docking" the resupply time is halved; undock by engaging warp or impulse — [M1.70]
- Ship stats (1.70): Light Cruiser impulse 0.6 LS, 2 forward beams, 2 tubes, 80/80 shields; Scout impulse 0.8, 1 beam, 1 tube, 60/60; Missile Cruiser 4 tubes, no beams, 110 front/80 rear; Battleship 4 forward beams, 250/150 shields; Dreadnought 200/200, 2 fwd + 1 rear standard beams plus 1 heavy beam, 3 tubes — [M1.70]
- Helm depends on Engineering: full maneuvering power lets even a Dreadnought "spin nimbly"; full warp power makes Warp 1 fast — [M1.70]
- Helm "can kill a whole crew in an instant" by steering into a mine or warping through a black hole (flavor quote by the manual's "Admiral") — [M1.70]
- Reviewer rated Helm one of the better roles, most active during battles (staying in range while avoiding enemy shields/lasers), but initial instructions were thin — [Board Game Quest](https://www.boardgamequest.com/artemis-spaceship-bridge-simulator-review/)

**Weapons**
- Controls: shield raise/lower (shared with Helm); torpedo/mine tubes (load, unload, fire; each tube holds one item); beam frequency selector (5 frequencies); Auto Beams toggle; target lock by clicking an enemy symbol; manual targeting scope; convert homing torpedo to energy and vice versa; view-screen selection; ship system status and ordnance counts — [M1.70]
- Information shown: enemy symbol shows bearing, range, shield status and beam arcs; stored munitions by type — [M1.70]
- Targeting: click target symbol for a lock (spinning blue reticle, mirrored on main screen). Without a lock auto beams do not fire and torpedoes do not track. Unlocked torpedoes are "dumb": fly straight and hit the first target they meet, friendly included; auto-detonate after 6,000 units — [M1.70]
- Beams: instantaneous short-range damage, unlimited ammunition; only hit inside the firing arc. Light Cruiser example: two emitters, port beam bears 9 to 2 o'clock, starboard 10 to 3 o'clock, overlap 10 to 2 (forward). Rear beams exist only on a few ships (Dreadnought) — [M1.70]
- Manual targeting (deselect Auto Beams, click a point on the enemy): beams use a narrow focus that can deal damage through strong shields and disable specific enemy systems; requires Helm to keep the arc on target and Engineering to keep beams charged — [M1.70]
- Beam frequency: Science scans find the target's most vulnerable beam frequency (example: Kralien Cruiser weakest at "B"); Weapons retunes beams to match — [M1.70]
- Ordnance types: Type 1 Homing (cheap, fabricated aboard with ship energy; can be drained back into energy); Type 4 LR Nuclear ("nuke", blast radius 1,000 units, severe damage); Type 6 Mine (warhead equal to a nuke, dropped behind the ship, proximity fuse, harmless to Deep Space Stations; manual says detonates on any vessel, so friendly fire possible); Type 9 ECM (any ship/station within 1,000 units has shields cut to half of maximum and becomes very vulnerable to beams) — [M1.70]
- Munitions caps (1.70): Light Cruiser 8 homing/2 nukes/6 mines/4 ECM; Scout 6/0/2/2; Missile Cruiser 20 homing/8 nukes/14 mines/12 ECM; Battleship 8/2/6/4; Dreadnought 10/4/8/5 — [M1.70]
- Loading takes time and ship energy; Engineering's Torpedo power setting reduces load/unload time; Beam power raises rate of fire and damage — [M1.70]
- Community figures from a search summary of the Artemis wiki/FAQ (not directly verified): beam range about 1000 units, torpedo range about 5000 units; remodulating shield frequency briefly drops shields; beam frequency can be changed instantly — [Artemis Wiki FAQ (pbworks)](http://artemiswiki.pbworks.com/w/page/39352331/FAQs) (page not fetched; claims came via search-engine summary, treat as unverified and possibly version-dependent)
- Manual's flavor advice: track ordnance, know when to use manual targeting, avoid firing on surrendered vessels, never fire a nuke near a friendly — [M1.70]
- Reviewer: four weapon types via two tubes, touchscreen layout intuitive but a few battles needed to learn when each weapon works — [Board Game Quest](https://www.boardgamequest.com/artemis-spaceship-bridge-simulator-review/)

**Science**
- Controls/info: long-range sensor map; select a contact and press Scan. First scan is level 1 (class, strength, designation made visible); second scan is level 2 (shield frequency strengths, so the weakest beam frequency is revealed). Unscanned contacts show grey/unknown until the sweep completes or they come within a ship or station's proximity scanners — [M1.70]
- Science is the only station that sees anomalies, space monsters, whales, nebulae, singularities, and unidentified readings that "do not appear on the long range or tactical scans"; wiki-level summary says it has the only long-range map — [M1.70], [Wikipedia](https://en.wikipedia.org/wiki/Artemis:_Spaceship_Bridge_Simulator)
- Scan speed is boosted by Engineering overcharging Tactical (sensors) power — [M1.70]
- Core loop: sweep for contacts, scan new ones, call out designation, bearing, range, class/strength and weakest frequency; warn Captain about friendlies drifting toward singularities so Comms can redirect them — [M1.70]
- Anomalies can recharge a depleted ship; Torgoths and Arvonians react oppositely to whales (Arvonians fight to the death if you harm one; Torgoths chase whales; Arvonians withdraw if a Torgoth kills one) — [M1.70]
- Reviewer found Science highly interactive and the best fit, but noted scan lulls leave nothing to do — [Board Game Quest](https://www.boardgamequest.com/artemis-spaceship-bridge-simulator-review/)
- Setup option "Sensors" lets crews simulate different eras of sensor technology; sensor range setting is a server setting (numeric ranges not given in the manual text) — [M1.70]

**Communications**
- Controls: Transmit button opens a recipient category: Station, Enemy, Other Ship (friendlies); then pick a message from a fixed menu. Enemies listed sorted by distance (closest first). Red Alert toggle lives here — [M1.70]
- Station commands: "Stand by for docking" halves resupply and doubles weapon load/refuel rate for the next 30 seconds; request a station to build a specific torpedo/mine type (e.g. build a Type 6 mine); status report requests — [M1.70]
- Enemy commands: 3 taunts; each enemy can hear each taunt once; a successful taunt enrages the enemy (and its squadron) so it blindly chases your ship for 3 minutes, otherwise it ignores it. Different races respond differently (some surrender to peaceful messages, others attack unless strength is shown) — [M1.70], [Wikipedia](https://en.wikipedia.org/wiki/Artemis:_Spaceship_Bridge_Simulator)
- Friendly ships: ask for status, and order Destroyers/Transports (limited sensors) to change course to avoid minefields, monsters, enemies and hazards — [M1.70]
- Comms also monitors incoming messages and sensitive info from stations that the Captain needs to hear — [M1.70]
- Reviewer: options are predetermined menus, enemy replies predictable, role becomes repetitive mid-to-late game — [Board Game Quest](https://www.boardgamequest.com/artemis-spaceship-bridge-simulator-review/)

### Inferences
- Core loop shape by station: Helm = continuous analog steering with positioning intent; Weapons = discrete queue management (load, lock, fire, frequency) with a decision about ordnance type; Science = bursts of scan activity then idle watch; Comms = infrequent, high-leverage menu actions; Captain = pure voice coordination.
- Role "feel" depends on information asymmetry created by the game design (Helm cannot see Comms, Science sees what others cannot), forcing talk rather than UI sharing.

### Gaps
- Official 2.x manual not obtained; 1.70 values may differ from 2.x (e.g. 2.x added Ximni and Fighter station; Comms fleet commands, Fighter, Engineering changes not verified).
- Exact load/unload seconds for torpedoes, beam charge/cooldown times, beam damage numbers, scan durations, and sensor range numbers were not found in any fetched source.
- Fandom (artemissbs.fandom.com) and pbworks wiki could not be read.

## Cross-station dependencies

### Takeaway
Nearly every combat action requires a handoff: Science to Weapons (frequency), Helm to Weapons (arc), Engineering to everything (power/heat), Comms to Weapons/Engineering via stations (ordnance builds, docking resupply), and Comms to the Captain via friendly ship routing.

### Cited Findings
- Science scan (level 2) reveals the target's shield frequency weakness; Weapons sets beam frequency accordingly — [M1.70]
- Beams only hit inside their arc, so Weapons needs Helm to bring the bearing onto the target; manual beams also require Engineering to keep beam power charged — [M1.70]
- Helm and Weapons share main-screen view control and shield toggles; manual says "Be sure to coordinate who's doing what" — [M1.70]
- Comms "Stand by for docking" accelerates station resupply (doubles load/refuel for 30 s, halves resupply time); Helm performs the actual docking within 600 units — [M1.70]
- Comms asks stations to build specific ordnance types that Weapons then loads — [M1.70]
- Science spots hazards for friendly sublight ships; Comms redirects them — [M1.70]
- Engineering overcharge effects: Beam (rate of fire and damage), Torpedo (load/unload time), Tactical (scan speed), Maneuvering (turn rate), Impulse/Warp (speed, efficiency), Jump (spin-up), Shields (capacity and recovery); 8 shared coolant units; systems at 100% hold steady temperature, overcharged systems heat up and can destroy nodes — [M1.70]
- Taunts from Comms can pull enemies (and their squadron) off a target for 3 minutes, which creates tactical opportunities for Helm/Weapons — [M1.70]
- Skaraan have cloak (60 s), warp bursts (5 s), jump (6,000 units), invisible to tactical or main screen; Science's special sensors are the counter — [M1.70] (interpretation of counter is inference)

### Inferences
- Pattern for FTLite: tie each ranged decision to an information gift from another station (scan data, arc positioning, ordnance supply) so players physically hand off or call out.

### Gaps
- No source on how 2.x extends fleet/base interaction beyond station ordnance.

## Numbers snapshot (version-tagged)

### Takeaway
All verified numbers are from manual 1.70; they give scale (ranges in "units", shield strength in "TRs") but not time values.

### Cited Findings
- Max warp factor 4; impulse speeds 0.3 to 0.8 LS by ship; reverse added 1.70; docking range 600; torpedo auto-detonate 6,000 units; nuke/ECM blast radius 1,000 units; 8 coolant units; 8 critical systems with 4-6 nodes each; DamCon team of 6 — [M1.70]
- Enemy shields (front/rear TRs): Kralien Cruiser 40/40, Kralien Battleship 80/80, Kralien Dreadnought 120/120, Arvonian Fighter 15/15, Light Carrier 120/120, Carrier 200/200, Torgoth Goliath 350/350, Leviathan 400/400, Behemoth 600/600, Skaraan Defiler 250/100, Enforcer 300/150, Executor 350/300 — [M1.70]
- Player ship shields: Scout 60/60, Light Cruiser 80/80, Missile Cruiser 110/80, Battleship 250/150, Dreadnought 200/200 — [M1.70]
- Setup: 20-500 ms network speed, difficulty 1-? (rookies start at 1; Elite Co-op example sets level 6, enemy speed double, enemy beam range/damage double); drives (warp or jump), sensor era, modes Invasion / Elite Co-op / Mission / Game Master — [M1.70]
- Version history: Windows Oct 2010; iOS Dec 2012; 2.0 Aug 2013; Fighter station added 2.3.0; multiple fighter types 2.6; 2.8.0 Dec 30, 2021 — [Wikipedia](https://en.wikipedia.org/wiki/Artemis:_Spaceship_Bridge_Simulator)

### Gaps
- No weapon damage numbers, beam cooldowns, scan durations, sensor ranges.

## Design criticisms and community advice

### Takeaway
Praise: roles feel distinct and sociable. Criticisms: onboarding is thin, Engineering and Science have idle stretches, Comms is menu-limited and repetitive, enemy AI is predictable.

### Cited Findings
- Little instruction, learn by trial and error; Engineering and Science idle stretches; predictable enemies and mundane Comms cause mid-to-late-game lull — [Board Game Quest](https://www.boardgamequest.com/artemis-spaceship-bridge-simulator-review/)
- Role also noted as a social design: helm cannot see Comms, so crew must talk — [Search snippet from a review](https://www.boardgamequest.com/artemis-spaceship-bridge-simulator-review/) (not verified in fetched text)
- Manual stresses that good Captains name who they address, ask clear questions and give unambiguous orders; good Science anticipates what each officer needs — [M1.70]
- Manual cautions that unlocked torpedoes and mines can hit friendlies and that surrendered ships should not be fired on — [M1.70]
- Community Engineering guide on Steam ("Bone White's Engineering for Dummies") exists but was not read — [Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=180045219)

### Inferences
- Frustration risk for FTLite: stations with burst-only activity (Science, Comms) need continuous side tasks or reactive events; coordination-by-voice works best when info is really siloed.
- A Captain with zero controls works in Artemis because of the six-person room dynamic; in a couch game the equivalent is a role with decisions but no console.

### Gaps
- No developer interview (Space Game Junkie etc.) or forum thread was successfully retrieved; community tactical advice per role is thin.
