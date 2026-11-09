# EmptyEpsilon crew station mechanics (design inspiration for FTLite)

Method note: sources are the official site and the GitHub wiki (read through the github-wiki-see.page mirror; canonical pages are https://github.com/daid/EmptyEpsilon/wiki/<Page>). No specific game version is named on the site; the Main Screen page mentions version 2020.04.09 for split screen, and the Operations and Engineering (plus) pages show "last modified 2020-03-23". Wiki prose only; no source code was read or copied. Fetch summaries were produced by a small model, so exact numbers should be re-checked against the pages before being relied on.

## 1. Station roster and combined stations

### Takeaway
Full crew is 6 positions (Captain/Main Screen, Helms, Weapons, Engineering, Science, Relay). Smaller crews merge stations: Tactical (Helms+Weapons), Engineering+ (Engineering+shields), Operations (Science+Relay), Single Pilot (one person).

### Cited Findings
- Captain/Main Screen: keeps the crew focused and makes combat tactical decisions, and does not operate a ship system directly. Helms: impulse, warp or jump, heading, docking, supply drops. Weapons: beams, missiles, targeting, shields and shield frequency. Engineering: power, coolant, repair crews. Science: long-range radar, scans and deep scans, database. Relay: sector map, probes, waypoints, comms with allies and stations. — [Site](https://daid.github.io/EmptyEpsilon/)
- Combined stations for 3-4 officers: Tactical = Helms + Weapons; Engineering+ = Engineering plus shield activation taken from Weapons; Operations = Science plus communications. — [Site](https://daid.github.io/EmptyEpsilon/)
- Tactical lacks shield activation and frequency controls; those move to Engineering+. — [Tactical](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Tactical), [Engineering+](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Engineering-(plus))
- Operations combines scanning, waypoints, comms and database. It cannot launch or link probes and cannot hack. — [Operations](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Operations)
- Single Pilot merges parts of Helms, Weapons, Relay and Main Screen. It loses beam target and beam frequency setting, shield frequency change, probes, waypoints, comm history and reputation view, hacking, and the wide stellar-phenomena view. The Main Screen shows only when the window is about twice as wide as tall. — [Single Pilot](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Single-Pilot)
- Weapons, Engineering and Relay pages say they are designed for 5-6 officers per bridge. — [Weapons](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Weapons), [Engineering](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Engineering), [Relay](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Relay)
- One machine can run several stations by selecting multiple roles and switching with a top-right button (secondary source, unverified against docs). — [search summary](https://daid.github.io/EmptyEpsilon)
- Any station can show the main screen alongside its own controls (split screen, from 2020.04.09); it shows forward view only and ignores keyboard. — [Main Screen](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Main-Screen)

### Inferences
- The merge pattern is the key lesson for FTLite: split stations by information flow, not by ship system, so shrinking the crew just merges consoles.

### Gaps
- Exact per-version differences, and the Cinematic/Spectator/Ship Window screens, were not read.

## 2. Per-station controls, information, loop, dependencies

### Takeaway
Each station owns one decision loop and depends on others for information (Science gives shield frequencies to Weapons; Engineering gives power/heat to everyone; Relay gives map/waypoints to Helms).

### Cited Findings
**Captain / Main Screen**
- Views: ship, short and long radar, four directional views, first person. The Captain cycles views and can rotate the screen. Role tasks: plan actions, prioritize goals, coordinate combat tactics, control main screen, "prevent mutiny" (humorous). — [Main Screen](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Main-Screen)

**Helms**
- Impulse slider -100% to 100%; unpowered or disabled impulse while moving stops the ship immediately (no coasting). Overpowering raises top speed. — [Helms](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Helms)
- Warp slider 0-4, no reverse, sets impulse to 0, consumes energy and heats even without overpower. Short-range radar is much less useful at warp. — [Helms](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Helms)
- Jump: slider sets distance in U, 10 s delay at standard energy (shorter if overpowered, longer if damaged or underpowered). Jumps along facing at jump time. Longer jumps use more energy and recharge time. Jumps over 5U land outside radar view. Jumping while overheating can damage the drive. — [Helms](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Helms)
- Combat maneuver: 2D slider for lateral strafe and forward boost from a separate regenerating reserve; strafe heats Maneuvering, boost heats Impulse. — [Helms](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Helms)
- Docking: Request Dock active within 1U of friendly or neutral station. Docked ship cannot move, turn, jump, warp or fire. Docking fails if impulse or maneuvering is unpowered. Docking does not restock; Relay negotiates with the station. Short-range radar 5U, max energy 1000 (as listed on the page). — [Helms](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Helms)
- Helm sees waypoints set by Relay, and firing arcs of deep-scanned enemies. — [Relay](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Relay), [Science](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Science)

**Weapons**
- Beams auto-fire at the selected target inside arc and range, single burst then short pause, perfectly accurate, can target a specific subsystem (hull by default), weaker than missiles. Each shot generates heat and uses energy. Turreted beams rotate slowly. — [Weapons](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Weapons), [Weapon Types](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Weapon-Types)
- Beam frequency selectors remodulate beams instantly; a beam tuned to match target shield frequency does more damage (exact multiplier not on the page). Science supplies the target's shield frequency (needs deep scan). — [Weapon Types](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Weapon-Types), [Science](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Science)
- Shields: toggle on/off; active shields drain much more power. Calibrating shield frequency takes time, requires lowering shields, leaves ship vulnerable. Front and rear shield status 100% to 0%. — [Weapons](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Weapons)
- Missile tubes: sizes S, M, L (fast to slow loading), load/unload take time with progress bar, overpowering speeds loading. — [Weapon Types](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Weapon-Types)
- Missile types: Homing (fast, small warhead), Nuke (slow, big, hits everything within 1U including allies), EMP (damages shields only within 1U), Mine (stationary, triggers within 1U, arms after a few seconds), HVLI (five unguided slugs per burst). — [Weapon Types](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Weapon-Types)
- Guided missiles need a target; can also fire straight or on a chosen bearing. — [Weapons](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Weapons)

**Science**
- Long-range radar 30U by default (older tutorial text says 25U). Signal-interference bands at the edge hint at objects beyond range. Nebulae block long-range scanning; black holes do not block but distort and crush ships. — [Science](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Science)
- Scan: align two of the ship's scanning frequencies with a target (a minigame). Unknown ships are gray; scan reveals friend (green), foe (red), neutral (blue) and ship type. Deep scan: harder, requires aligning frequency and modulation of each scan type; reveals shield and beam frequencies and individual system status. — [Science](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Science)
- Database lists ships, weapons, hazards. — [Science](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Science)

**Relay**
- Sector map shows hazards and ships within short-range scanner range (5U) around friendly ships and stations; Relay cannot scan. — [Relay](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Relay)
- Probes: fly straight to a chosen point, send short-range sensor data for 10 minutes, can scan inside nebulae, can be linked to Science, cannot be retrieved, can be shot, restocked by docking. — [Relay](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Relay)
- Waypoints appear on Helm radar and are required when requesting aid (reinforcements, supply drops). — [Relay](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Relay)
- Comms: hail stations/ships, order friendly ships, request backup, request missile and mine rearm while docked, some requests cost reputation (tracked by Relay); ship's log tab. — [Relay](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Relay)
- Hacking: temporarily degrades an enemy ship's systems. Two minigames. Lights (turn all lights ON, Lights-Out style): 3x3 simple, 5x5 normal, 7x7 difficult, 9x9 fiendish. Mines (Minesweeper, one mistake allowed, reset button): 6x6, 8x8, 10x10, 12x12. Grid size follows the server difficulty setting. — [Relay](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Relay)

**Engineering**
- See section 3.

**Game Master (non-crew)**
- Pause, intercept comms, hail players, spawn objects, issue CPU ship orders (move, attack, defend, dock), tweak any object including each system's health (+100% to -100%) and heat, and scenario-defined buttons. — [Game Master](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Game-Master)

### Inferences
- Dependency chain: Science deep scan -> Weapons beam/shield frequency; Relay waypoint/probe -> Helm/Science; Engineering heat/power -> every active action (beam fire, jump, boost); Helm docking <-> Relay supply request.
- Positive design: every station both consumes and supplies information, forcing verbal communication.

### Gaps
- Numeric frequency counts, damage values and scan timings were not on the wiki pages read.

## 3. Engineering: power, coolant, damage, repair

### Takeaway
Engineering is a budget-allocation job: per-system power sliders (above or below 100%), a limited coolant share to spread across heating systems, and repair crews dispatched to rooms with damaged systems.

### Cited Findings
- Each system has a power slider. Above 100%: more output (reactor more energy, shields absorb more and regen faster, impulse faster), more heat, and more energy draw except for the reactor. Below 100%: less heat and energy draw. — [Engineering](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Engineering), [Power Management](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Power-Management)
- Coolant: unlimited reserve but only a limited percentage can be applied at once; it lowers temperature and prevents heat damage. Temperature trend arrows (brighter = faster change). — [Engineering](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Engineering)
- System state ranges -100% to 100%. Below 100% works suboptimally (like underpowered); at or below 0% stops working until repaired. Damage sources: being shot, hazards, overheating. — [Damage Control](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Damage-Control)
- Repair crews are sent by Engineering to the room containing the damaged system. Hull damage is ship-wide; crews can always work on it but progress is very slow unless docked. — [Engineering](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Engineering)
- Self-destruct requires every officer to enter their command code and share codes. — [Engineering](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Engineering)
- Engineering+ adds shield toggle and frequency calibration. — [Engineering+](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Engineering-(plus))
- Overpowering also speeds missile loading and beam fire rate and damage. — [Weapon Types](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Weapon-Types)

### Inferences
- Rooms in EE are a spatial map of systems with crews as movable tokens; FTLite makes the player the repair crew, which fits the same "go to the room" rule.

### Gaps
- Default numbers (coolant cap percentage, heat rates, repair rate, crew count per team, default energy use per system) were NOT in the wiki pages read. They live in the source and script reference (script_reference.html) and the Damage Control/Power Management pages are short. Not verified. Helms page cites energy max 1000 only.

## 4. Difficulty, scenario structure, differences from Artemis, design rationale

### Takeaway
Scenarios are Lua scripts; difficulty is a server setting that scales minigame grids; the GM can alter play live. EE was started because Artemis is closed source.

### Cited Findings
- Scenario scripting: copy terrain built in the Empty Space scenario with "Copy Scenario" to see the Lua; study Waves and Birth of Atlantis; the full API is in script_reference.html shipped with the game. — [Scenario Scripting](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Scenario-Scripting)
- Difficulty levels named Simple, Normal, Difficult, Fiendish (server setting) scale the hacking grids. — [Relay](https://github-wiki-see.page/m/daid/EmptyEpsilon/wiki/Relay)
- Reduced-crew station options (Tactical, Engineering+, Operations, Single Pilot) are the main scaling for crew size. — [Site](https://daid.github.io/EmptyEpsilon/)
- Differences from Artemis per a community comparison sheet: Artemis has a Fighter pilot station and interactive beam targeting; EE has minigames for Science and Relay, directional missile tubes, and reduced-player station options. Artemis is proprietary; EE's author says they started over because of issues they wanted to fix and Artemis is not open source. EE's GM screen was designed because Artemis's did not do everything they wanted. — [Comparison sheet](https://docs.google.com/spreadsheets/d/1L2eCCefJwOUbXCDRmPdmQHE0GeP4Fp3cg63b-TAPrc4/edit), [GamingOnLinux](https://www.gamingonlinux.com/2018/12/emptyepsilon-a-free-and-open-source-spaceship-bridge-sim/) (sheet not opened directly; claim via search summary, partially unverified)
- All players must use the same game version. — [Site](https://daid.github.io/EmptyEpsilon/)

### Inferences
- Difficulty in EE is mostly the GM/scenario and minigame size, not a global enemy multiplier (not confirmed).

### Gaps
- No maintainer (daid) design-rationale essay found; no documentation of enemy scaling, scenario variation settings, or per-scenario difficulty parameters was fetched. Unread: Frigates, Ship classes, Comms, Strategic Map, Cinematic View pages, and the source/script reference (would hold exact defaults).
