# Artemis Spaceship Bridge Simulator: Engineering Station Mechanics

Source key. Manual = official Artemis Manual v1.70 rev5 (Steam manual PDF, text extracted locally): https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376 . Wiki-Eng = community Artemis Wiki (pbworks) Engineering page: http://artemiswiki.pbworks.com/w/page/39352367/Engineering . Wiki-Energy = same wiki Energy page: http://artemiswiki.pbworks.com/w/page/43660763/Energy . Version note: the wiki pages are community-edited, undated beyond "last edited about 2 years ago" at fetch time, and mix versions (roughly 1.6x to 2.x). Where a number may differ by version it is flagged. Mechanics only; no proprietary assets.

## 1. What do power and coolant levels do per system, and what are the failure modes?

### Takeaway
Engineering has 8 system sliders (Warp and Jump are mutually exclusive, so 8 per ship). 100% is neutral and needs no coolant. Above 100% (up to 300%) the system performs better but drains energy faster and builds heat. Heat that is not countered with the 8 shared coolant units eventually destroys a node of that system, which then needs repair. Below 100% saves energy and sheds heat. At 0% the system stops working.

### Cited Findings
- Systems are normally powered at 100% and "overcharged" by moving sliders up. Systems at 100% hold a steady temperature with no coolant. Systems below 100% gradually dissipate heat without coolant. — [Manual p.34-35](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376)
- Overcharged systems "drain the ship's energy at a tremendous rate" and produce excessive heat. If allowed to overheat, a subsystem node is destroyed, "possibly injuring crew members in the vicinity". A destroyed node must be repaired by DamCon. — [Manual p.35](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376)
- Coolant: "Standard TSN space ships have eight coolant units shared by all systems." Coolant is never depleted or destroyed and can be redistributed at any time. If all 8 go to warp, none are left for others. UI: yellow dots = available coolant, white = in use, gray = empty slots that cannot be filled without diverting coolant from another system. Heat is shown as a bar by each slider. — [Manual p.34-35](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376); [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering) (adds: up to 8 dots per system, set by clicking the yellow pips)
- Overcharge benefits per manual: Beam raises rate of fire and damage; Torpedo shortens tube load/unload time; Tactical (sensors) speeds Science scans and counteracts damage; Maneuvering raises turn rate; Impulse and Warp raise speed and efficiency; Jump shortens spin-up; Front/Rear shields absorb more damage and recover faster. — [Manual p.35](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376)
- Per-system "no power" effect: Beams will not fire; Torpedo tubes cannot be loaded, fired or unloaded; Sensors: long range sensor screens unavailable; Maneuver: ship cannot turn; Impulse/Warp: ship cannot use that drive; Front/Rear shield cannot be raised; Jump drive: a jump needs 30 s warm-up. — [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering)
- Energy drain factors per system (multiplied by a difficulty base and ship efficiency): beams x3, tubes x1, sensors x1, maneuver x2, impulse x4, warp x6, jump x6, front shield x5, rear shield x5. Defaults are configurable between x1 and x10 in artemis.ini. — [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering); [Wiki-Energy](http://artemiswiki.pbworks.com/w/page/43660763/Energy)
- Drain scales "by the square of the multiplier" (300% would be x9). Coolant placement does not affect energy drain. — [Wiki-Energy](http://artemiswiki.pbworks.com/w/page/43660763/Energy)
- Rough coolant-to-sustainable-overpower table (community): 0 / 2 / 4 / 6 / 8 coolant units sustain about 100 / 150 / 190 / 220 / 250%. A finer "safe level" table: coolant 0..10 maps to 100, 128, 151, 171, 189, 206, 221, 235, 248, 261, 273%. The 9-10 columns exceed the 8-unit standard, so they likely reflect a spreadsheet or a variant (unverified). — [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering) (which cites a forum post and a Google Sheets calculator)
- System display: each of the 8 systems shows an efficiency percent (100% normal, 0% offline until repaired). — [Manual p.34](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376)
- Timing-sensitive effect (community-derived "advanced" tip): beam power matters while firing/recharging; torpedo power only while loading/unloading; shield power is evaluated at the moment the hit lands (the damage deducted is computed then); jump power matters when initiating (warm-up) and when completing (console recovery). So power can be spiked briefly (the page suggests 300% with 8 coolant) and reset. — [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering) (community claim, not verified against the manual)
- Warp is described as "much more efficient at high power levels", i.e. faster with no extra energy cost. — [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering) (community claim)
- Example community presets with numbers: Fore Shield focus 245% fore shields, 100% aft, 150-200% beams, all coolant to fore; Warp preset 245% warp, 0% shields and weapons, all coolant to warp; Dogfight 200% beams, shields, maneuver with 2 coolant each; Torpedo barrage 200% torps/shields/maneuver; Resting 100% impulse/maneuver/sensors, 0% elsewhere. — [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering) (attributed to forum user Varos, source link dead; the 245% figure is consistent with 8 coolant giving about 250%)
- Failure modes summarized: (a) overheating destroys a node and can injure DamCons; (b) damage reduces node/system efficiency, and all nodes at 100% damage means the system is offline; (c) energy runs out and "some systems become inactive". — [Manual p.34-36](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376); [Wiki-Energy](http://artemiswiki.pbworks.com/w/page/43660763/Energy)
- Slider range appears to be 0-300% (wiki tips refer to "300%/8"). The manual text I extracted does not state the maximum. — [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering)

### Inferences
- The core design is a heat-versus-power tradeoff with one scarce, fully reallocatable resource (coolant). Coolant is a constant-sum allocation (8 pips) rather than depleting, so the decision is "where do the 8 pips go this minute".
- The effective "power bar" is a dial, not an on/off toggle: 0 = off, 100 = neutral, up to 300 = boosted. This is structurally different from FTL's discrete bars, but a coarse mapping (0 / 1x / 2x / 3x) is plausible.
- Because several systems only matter at an instant (shield on hit, beams while firing), the skilled play is short boosts timed to events. This rewards a player who reads the fight and is a good fit for real-time coordination.

### Gaps
- Exact heat accumulation rate and exact overheat threshold per power level were not found in primary text. The coolant tables above are community approximations.
- Per-system numeric multipliers (e.g. exactly how much faster beams fire at 200%) were not found. Wiki claims shields at 300% lose "three times less" per hit, which is community-stated.
- Whether heat is per system or per node, and how often an overheat destroys a node, are not documented in sources found.

## 2. How do damage control teams work (counts, travel, repair, orders) and what decisions do they create?

### Takeaway
Damage control is a graph (nodes on a 3D ship schematic joined by corridor lines). Teams (6 crew each) path along undamaged nodes to a damaged node and repair it. Teams run autonomously by default, but Engineering can switch to manual and click a team then a destination. Teams die from damage in their location and are replenished only by docking.

### Cited Findings
- Each of the 8 systems is spread across 4-6 nodes. Each node has damage 0-100%, shown blue when undamaged and red when damaged. A damaged node performs with reduced effectiveness in proportion to its damage. If all of a system's nodes are at 100%, that system is offline. — [Manual p.36](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376)
- Each DamCon team has six crew. If the area is damaged while a team is present, it may suffer casualties, reducing effectiveness. If all six are lost the team disappears from the schematic. Fresh teams come from docking at a friendly station. — [Manual p.37](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376)
- Orders: click a team icon (blue outline appears; count of able-bodied members shown), then click a destination node. The team moves through the ship and starts repairs. "DamCon teams cannot move through damaged nodes. To reach a remote section of the ship they must create a path of undamaged nodes." — [Manual p.37](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376)
- Autonomous mode: teams look for damaged systems themselves but lack the big picture. The manual's joke: an autonomous team may repair the bowling alley before the warp drive. A toggle on the console switches autonomous or directed deployment. — [Manual p.33, p.37](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376)
- Advice: when the ship is undamaged, station teams near the center of the ship to protect them. — [Manual p.37](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376)
- Turning autonomy off stops automatic repair moves. This is useful to keep teams out of harm when under fire or when a system is intentionally being overheated. — [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering)
- Teams show as white diamonds moving along lines representing corridors. Damage from enemy fire or overload both injure or kill teams in the affected location. — [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering) (official in-game F1 help text transcribed there)
- Open question in the community: "It's not currently known whether multiple teams results in faster repair of a single node." — [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering)
- Fan advice: learn which nodes support which systems before combat, because hovering each node mid-fight is too slow. Node layout differs by vessel class. — [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering)
- Wikipedia summary: non-player repair teams move through the ship and fix damaged systems, the engineer manages them, and lost teams are replaced only by docking. — [Wikipedia](https://en.wikipedia.org/wiki/Artemis:_Spaceship_Bridge_Simulator)
- Manual quote on intent: a great engineer can "repair damage in half the estimated time". — [Manual p.32-33](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376) (flavor quote, not a rule)

### Inferences
- Decisions this creates: which node first (prioritize the nodes of the system the crew needs now, e.g. warp to escape); route planning (a damaged node blocks the path, so repair order matters for reachability); risk (send teams into a firefight or hold them back; manual mode to stop auto-walking into fire); and team positioning in peacetime.
- Teams as a depleting resource (casualties, only restored at docking) gives long-term stakes beyond the current fight.
- Number of teams per ship was not found in the sources (see Gaps).

### Gaps
- Number of DamCon teams per ship class not found in the manual or wiki text I read (Wikipedia says "several").
- Travel speed and per-node repair rate not found in sources.
- Whether crew casualties scale repair speed linearly, and whether teams repair while the node's system is under heat stress, not found.
- The Artemis Fandom wiki (artemissbs.fandom.com) returned HTTP 402 and the cattail Rigbook only covers presets, so no extra DamCon numbers from those.

## 3. Energy and reserve use, presets, and hotkeys

### Takeaway
Energy is one shared pool (about 999-1000 at start) drained by every powered system. It is refilled by docking, anomalies, torpedo conversion, or by zeroing all sliders. Presets (Shift+number to save, number to recall) let the engineer swap whole power/coolant configurations in one keypress.

### Cited Findings
- Start energy 999 (wiki text also says "starting energy of 1000"); the ship runs systems down and "some systems become inactive" at zero. Level is displayed on helm, tactical and engineering screens. — [Wiki-Energy](http://artemiswiki.pbworks.com/w/page/43660763/Energy) (minor internal inconsistency, 999 vs 1000)
- Docking restores energy to full; docking resupply time is halved if Comms warns the station "Stand by for docking"; docking allowed within 600 m. — [Wiki-Energy](http://artemiswiki.pbworks.com/w/page/43660763/Energy); [Manual p.28-29](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376)
- Setting all systems to 0% lets the Auxiliary Power Unit replenish energy slowly, about 0.8 energy per second (any difficulty). — [Manual p.35](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376); [Wiki-Energy](http://artemiswiki.pbworks.com/w/page/43660763/Energy)
- Other energy sources: anomalies (can push above start value), converting an unloaded homing torpedo to 100 energy (Weapons "Torp to Ene"), some side-mission rewards. Making a torpedo costs 150 energy. — [Wiki-Energy](http://artemiswiki.pbworks.com/w/page/43660763/Energy); [Manual p.18-19, 49](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376)
- Energy above a threshold (default 4000, "overloadThreshold" in Artemis.ini) can cause thermal runaway that destroys the ship. — [Wiki-Energy](http://artemiswiki.pbworks.com/w/page/43660763/Energy)
- Every powered system drains energy even when idle. Displayed drain "100 equates to roughly 2 energy per second". Base drain by difficulty 1-11: 0.6, 0.9, 1.3, 1.7, 2.1, 2.6, 3.2, 3.8, 4.4, 5.1, 5.9. Ship efficiency: Scout 0.7, Light Cruiser 1.0, Dreadnought 1.2. Extra drain from shields up, warp speed, beam shots (2 energy each), jump (all spent at start, distance-based). — [Wiki-Energy](http://artemiswiki.pbworks.com/w/page/43660763/Energy)
- Hotkeys: Shift+(1-0) save energy+coolant preset; 1-0 recall; Space reset energy to 100%; Space twice resets coolant too; Enter resets coolant; E coolant up; C coolant down. — [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering) (hotkey list from fan wiki; in-game F1 help confirms the Shift+number save and number recall)
- Presets are stored in engineeringSettings.dat in the Artemis folder. The Engineer's Rigbook (community web tool, "Edition Beta", data dated 15 Mar 2017, for Artemis 1.5.101 per search summary) lets engineers browse, edit and download preset sets of 1-10, and has a "match" feature to set energy to match a coolant level and vice versa. — [Rigbook about page](https://cattail.nu/artemis/engineersRigbook/about.php)
- Power-saving tips: shields drain while up and two shields is double the drain, so drop unneeded shield; warp is especially power-hungry. — [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering)

### Inferences
- Energy is a campaign-level clock: the sim runs out unless the crew docks, farms anomalies, or throttles down. Engineering's "shed to survive" choices (kill unused shield, zero warp) mirror FTL-style shedding but are continuous rather than slot-based.
- Presets exist because the engineer has too many sliders to move individually during action. This is evidence that full reconfiguration by sliders is too slow in real time, which supports having few discrete power states in a couch game.

### Gaps
- Exact starting energy by ship class and difficulty not confirmed beyond the wiki's 999/1000.
- Default preset contents not documented; the F1 text only says the number keys save and restore.

## 4. The Engineer's experience, interactions, and community advice

### Takeaway
Engineering is the optional, "behind the scenes" station. The Engineer watches a schematic, bar and pip UI, makes requests-driven changes (the Captain, Helm and Weapons ask for power), and juggles damage routing. It is learnable but rewards memorization (node-to-system mapping, presets).

### Cited Findings
- Engineering is "somewhat optional": a good engineer "can double or even triple the speed and firepower"; with no one at the station it runs autonomously and the main screen status display can be used to monitor damage. — [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering)
- Interaction examples: Helm "must be prepared to ask for the Engineer's cooperation" (full power to maneuvering or warp). Weapons must coordinate with Helm to keep beams in arc and "with the engineer to keep them recharging quickly". Captain's example order: "Engineering! More power to shields!". Comms can halve docking resupply time. — [Manual p.16-27](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/247350/manuals/Artemis_Manual_1.70-rev5.pdf?t=1518791376)
- Engineering also coordinates energy-saving with the Captain/Helm/Weapons (e.g. dropping the unused shield). — [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering)
- Self-destruct trick in co-op: engineer reduces all power to zero then raises warp to cause an overload (community tip, version dependent). — [Wiki-Eng](http://artemiswiki.pbworks.com/w/page/39352367/Engineering)
- Wikipedia describes Engineering as managing power to 8 systems, cooling as a limited resource, and damage control. — [Wikipedia](https://en.wikipedia.org/wiki/Artemis:_Spaceship_Bridge_Simulator)
- A reviewer noted that in a demonstration the damage control crews were set to automatic. — [search result summary of Board Game Quest review](https://boardgamequest.com/artemis-spaceship-bridge-simulator-review) (not fetched in full; weak)

### Inferences
- Moment-to-moment loop (synthesized, not stated in one source): (1) watch heat bars, energy, and node damage; (2) respond to calls from Captain/Helm/Weapons by recalling a preset or spiking a slider; (3) move coolant pips to hot systems; (4) direct teams to damaged nodes in priority order; (5) reset to 100% with Space when overheating; (6) when idle, shed power to conserve energy.
- Learning curve centers on memorizing node/system relationships and building presets; the Rigbook's existence shows engineers invest in preparation.
- The Engineer is lower-profile and gets requests rather than creating objectives, so it can feel reactive. The sources do not discuss satisfaction or stress directly.

### Gaps
- No primary community first-person accounts (forum threads, reviews) of workload or difficulty were retrieved in full. Several fetches failed (Fandom wiki 402; Google Sites login redirect; Steam guide 429). Treat the "experience" notes as inference.

## 5. What transfers to a one-screen couch game, and what depends on separate screens?

### Takeaway
Transferable: the power/heat tradeoff concept, shared finite coolant, damage as a node graph with blocking, crew casualties, energy as a global budget, and request-driven teamwork. Not directly transferable: dense slider UI, hotkey presets, hidden-information asymmetry between stations, and 3D schematic click-to-order.

### Cited Findings
- None of the following are Artemis claims; they rest on the cited mechanics above.

### Inferences
- Transferable and easy: (a) neutral baseline plus boost/shed per system; (b) overheating as a cost for boosting, with a shared cooling resource; (c) systems consisting of multiple nodes/rooms, each with damage state, with partial effectiveness; (d) damaged rooms blocking paths (matches FTLite's walk-to-hazard repair); (e) crew injured when a room they stand in is hit; (f) energy as a ship-wide budget with docking as a refill; (g) "ask Engineering for power" callouts.
- Format-dependent: Artemis relies on each player having a private full-screen console with fine controls, and on one player holding the global view of damage. In a one-screen couch game the damage graph is visible to everyone, so the "only the Chief Engineer has the big picture" tension (bowling alley joke) disappears. DamCon NPC teams replace player movement; FTLite replaces them with players physically walking, which changes the decision from "which team to dispatch" to "who leaves their console".
- Preset hotkeys are a keyboard workaround for slider overload. In FTLite, a small number of discrete levels and a shedding order would replace them.
- A useful lift: manual versus autonomous toggle as a design pattern. Autonomous repair is the safe but unintelligent default, and manual control is higher skill and higher reward. A couch version could use AI helper repair of low priority.

### Gaps
- No source on how Artemis variants (e.g. Thom Robertson's later versions, 2.x) changed Engineering; version differences between 1.7 manual and the wiki are not systematically documented here.
