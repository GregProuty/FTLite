# Teamwork, Communication, Solo Play, Difficulty and Pacing in Bridge Sims (Artemis, EmptyEpsilon, Starship Horizons, Star Trek Bridge Crew, Spaceteam) and Transfer to FTLite

Scope note: sourced facts are under "Cited Findings". Everything under "Inferences" is my own reasoning. Several primary sources were unreachable (Tom's Guide, PC Gamer, Co-Optimus returned truncated text or 403). The Thomas Robertson interviews (Rock Paper Shotgun 2010, Space Game Junkie podcasts #28 and #429) exist but I could not read their content, so no developer quotes from them are used.

## 1. How does information asymmetry (separate screens) create communication, and what substitutes on a shared screen?

### Takeaway
In every game surveyed, forced talking comes from splitting information or control across screens, so no one station can see or do enough alone. Spaceteam states this most directly; Artemis and Bridge Crew show it in practice. FTLite's shared screen removes the screen split, so the asymmetry has to come from somewhere else (physical location, console-only data and actions, time pressure).

### Cited Findings
- Spaceteam's creator Henry Smith traced the game to a dream of "having something on one screen that you had to react to on another screen". The Game Developer series notes the mechanic forces communication between people, not just devices. [Game Developer, Making of Spaceteam ch. 1](https://www.gamedeveloper.com/design/everybody-shake-the-making-of-spaceteam-chapter-1-of-3)
- In Spaceteam, instructions shown to you are usually for other players' panels, so you must shout them. [Spaceteam site](https://www.majorfun.com/spaceteam/)
- Smith on shared stakes: if one person doesn't get it they slow everyone, so players naturally help each other. He also says "We teach people what to do way more than we should", and uses the lobby as a place where players must coordinate. [Episodic Content, Making of Spaceteam ch. 2](https://episodiccontentmag.com/2016/01/29/everybodyshake2/)
- Spaceteam card game (Smith's team): the timer was the only way to ensure all players got on board with the extreme urgency; without it, outcomes depended on group personality. Per a search-result summary of [Kill Screen](https://www.killscreen.com/turning-spaceteam-card-game-doesnt-suck/) (I did not open the article; treat as secondhand).
- Artemis review (Fistful of Wits, 2013): no console has enough data or control to operate alone; e.g. Science must tell Weapons about enemy shield weaknesses; crews must learn that their readouts are useful to others; the game is "generally helped by having a good captain". [Fistful of Wits](https://fistfulofwits.com/2013/07/10/artemis-bridge-simulator-offers-arch-entertainment/)
- BoardGameQuest: the Science player was pulled into constant questions from others which kept them engaged; the Captain's job was "a lot of talking and ordering" with no station of their own; Communications used a fixed list of scripted options. [BoardGameQuest](https://www.boardgamequest.com/artemis-spaceship-bridge-simulator-review/)
- Bridge Crew review (Road to VR): effective communication is the core of the game; the Captain tracks objectives and assigns/monitors the crew. [Road to VR](https://www.roadtovr.com/star-trek-bridge-crew-review/)
- EmptyEpsilon: the Captain's role is keeping crew focused, planning, coordinating tactics and setting priorities; the Captain can optionally drive the main shared screen. [EmptyEpsilon site](https://daid.github.io/EmptyEpsilon/)

### Inferences
- On a one-screen game the "separate screens" asymmetry is gone; what replaces it must be (a) role-exclusive actions (only the Weapons console can fire), (b) role-exclusive information shown only when seated at a console or in a room (e.g. Science scan results visible only at Science), and (c) physical separation, since a crew member in Medbay cannot be at Navigation. Spaceteam-style "instruction for someone else" prompts could be reproduced by showing an alert on the shared screen that names a station.
- Couch co-op players sit together, so talking is cheap. The risk is the opposite of the networked games: players can see everything and simply act without asking. Information gating by seat or room is the lever.
- A fixed, shared timer (Spaceteam card game lesson) likely matters more than any rule for getting groups to talk urgently.

### Gaps
- No direct developer statements from Thomas Robertson on why stations are split (interviews not readable).
- No source found directly analysing shared-screen versions of bridge-sim design.

## 2. Documented minimum crew; how players handle too few or too many

### Takeaway
Artemis requires three stations (Captain, Helm, Weapons) and supports up to eight; EmptyEpsilon targets about 6 with combined stations for 3-4 and a multi-role switch for solo; Bridge Crew uses AI stand-ins that reviewers found weak; Starship Horizons has historically required groups. Too-few-players is handled by merging or switching stations, not by AI competence.

### Cited Findings
- Artemis: three required stations (Captain, Helm, Weapons), four optional (Engineering, Science, Communications, Fighter), up to eight players; a crew can also man a single ship alone (multiple ships co-op or PvP are possible). [Wikipedia](https://en.wikipedia.org/wiki/Artemis:_Spaceship_Bridge_Simulator). The Wikipedia statement that "a crew" can run one ship should not be read as one-person play; a Steam page translation says single-player is not supported ([Steam, Artemis](https://store.steampowered.com/app/247350/Artemis_Spaceship_Bridge_Simulator?l=dutch), per search summary, not directly read). BoardGameGeek lists min 1 which conflicts (search summary only).
- Artemis with fewer people: BoardGameQuest says a group with fewer players could rotate between stations and named Communications and Science as easy to pick up. [BoardGameQuest](https://www.boardgamequest.com/artemis-spaceship-bridge-simulator-review/). Fistful of Wits says the game works best with a full crew. [Fistful of Wits](https://fistfulofwits.com/2013/07/10/artemis-bridge-simulator-offers-arch-entertainment/)
- Artemis at a con: the set was built for six officers, six touchscreens, 30-minute sessions, with long queues. [Daily Lobo](https://www.dailylobo.com/article/2013/07/ace-simulating-the-final-frontier)
- EmptyEpsilon: Captain plus five officers (Helms, Weapons, Relay, Science, Engineering); "the best experience involves 6 players"; for 3-4 players there are combined stations: Tactical (Helms+Weapons), Engineering+ (Engineering+shield activation), Operations (Science+comms); one person can select multiple roles on one machine and switch with a button at top right. [EmptyEpsilon site](https://daid.github.io/EmptyEpsilon/). Steam lists "a crew of 3 to 6 players" and up to 32 player ships. [Steam, EmptyEpsilon](https://store.steampowered.com/app/1907040)
- Starship Horizons: Steam lists 2-6 players; a 2020 dev reply said groups were required then and solo was planned; a user flew solo via multiple monitors opening all stations (search summary of [Steam thread](https://steamcommunity.com/app/1024950/discussions/0/2260186882358090253); not read directly). Current AI-station status unverified.
- Bridge Crew: AI fills empty stations but cannot follow detailed multi-part orders, so solo players often take over stations; solo micromanagement "drained the fun" and campaign is noticeably harder alone. [Road to VR](https://www.roadtovr.com/star-trek-bridge-crew-review/). A later update added AI-assisted voice commands for solo (headline only: [Attack of the Fanboy](https://attackofthefanboy.com/news/star-trek-bridge-crew-gets-ai-assisted-voice-commands-for-solo-players/)).
- Spaceteam: 2-8 players per a search summary; official FAQ says two is technically possible but not much fun. For the card game: 3-6 players, up to 9 with expansion, and 12+ becomes "a frantic mess" unless everyone knows the game. [Spaceteam FAQ](https://www.playspaceteam.com/faq) (the card game FAQ; the 2-8 mobile figure is secondary and conflicts with majorfun.com's 2-4: [Spaceteam page](https://www.majorfun.com/spaceteam/))

### Inferences
- Pattern: the games that handle solo/small crews well do it by letting one human drive several stations with a quick switcher (EmptyEpsilon), or by merging stations (EmptyEpsilon combined stations). The game that leaned on AI crew (Bridge Crew) drew the most complaints about it.
- For FTLite with 1-4 players and 7 consoles (Nav, Weapons, Engineering, Science, Life Support, Medbay, Doors), the console count exceeds the crew count even at 4. This is closer to EmptyEpsilon's "multi-role" reality than Artemis's one-station-per-person.
- "Too many" is a non-issue at a hard cap of 4, but a Captain-only role (no station) would leave a player with no verb in a 4-player game; FTLite already avoids this since every player is a walking crew member.

### Gaps
- No documented guidance found on how groups handle more than six players on Artemis (multiple ships is the implied answer).
- Starship Horizons current solo/AI features unconfirmed.

## 3. How scenarios pace and scale difficulty; what players find punishing or boring

### Takeaway
Reviewers repeatedly report uneven workload: some stations (Helm, Weapons) are busy while Engineering, Science or Communications idle, and late-game lulls when enemy behaviour is predictable. Difficulty is usually scaled by enemy stats/counts or event rate rather than smarter AI; the Spaceteam model of ramping instruction rate is the cleanest example of pressure scaling.

### Cited Findings
- Artemis difficulty is a configurable scenario option; higher difficulty makes enemies tougher rather than smarter; enemy AI is weak (ships do not avoid mines); scalable "all the way up to 11". [Fistful of Wits](https://fistfulofwits.com/2013/07/10/artemis-bridge-simulator-offers-arch-entertainment/); [Wikipedia](https://en.wikipedia.org/wiki/Artemis:_Spaceship_Bridge_Simulator)
- Artemis modes: baseline "destroy all enemies" modes plus script-driven missions that control terrain, ships and NPC behaviour, written by users. [Wikipedia](https://en.wikipedia.org/wiki/Artemis:_Spaceship_Bridge_Simulator)
- BoardGameQuest session report: Engineering called a "secondary need" station (power left at 100% for most of the mission); Science had downtime without scans or battles; Helm most active, two hours passed quickly; Communications became mundane and the reviewer suggested more varied, faster enemy behaviour to avoid a mid-to-late lull; Helm wanted more up-front instructions; Weapons understood weapon choice after a few battles; an experienced Engineering officer might manage power more actively in critical moments. [BoardGameQuest](https://www.boardgamequest.com/artemis-spaceship-bridge-simulator-review/)
- EmptyEpsilon: recommends "Waves" or "Basic" scenarios for first games; scenarios are Lua scripts; a Game Master can add/remove ships, place hazards and trigger events live. [EmptyEpsilon site](https://daid.github.io/EmptyEpsilon/)
- Bridge Crew: five campaign episodes of about 20-30 minutes, difficulty spikes sharply in the last two; one failed repair under heavy fire can scrap a session; campaign "on rails"; procedural ongoing missions for solo or co-op. [Road to VR](https://www.roadtovr.com/star-trek-bridge-crew-review/)
- Spaceteam: escalates by raising rate of instructions/events and stacking hazards (asteroid plus wormhole forcing shaking and flipping), randomising component names; hazards persist until the team responds. [Episodic Content ch. 2](https://episodiccontentmag.com/2016/01/29/everybodyshake2/). Early prototype showing four instructions at once overwhelmed playtesters (search-result summary of the Everybody Shake series; unverified). Card game timers: 3, 5 (normal) or 7 minutes as difficulty levels. [Spaceteam FAQ](https://www.playspaceteam.com/faq)
- Spaceteam design: simple core kept it accessible; players learn by doing rather than through tutorials. [Episodic Content ch. 2](https://episodiccontentmag.com/2016/01/29/everybodyshake2/)

### Inferences
- The idle-station problem is a pacing/scripting problem: events that only tax Helm/Weapons leave others idle. Scenario design must route events to every console over time (e.g. fire needs Life Support/Doors, boarding needs Doors/Medbay, anomalies need Science).
- Raising enemy stats alone (Artemis style) scales damage but not coordination demand; raising concurrent demands per minute (Spaceteam style) scales coordination. FTLite should likely scale the number of simultaneous crises and shorten their timers per player count, not just enemy hull values.
- Predictable AI breeds boredom (Comms lull). Varied encounter types and occasional surprise events are cheap mitigations.

### Gaps
- No quantified data (play-time heatmaps, station utilisation) from any developer.
- Artemis wiki's difficulty-level details and mission-script pacing patterns were not retrieved.
- Reddit/forum threads about boredom or punishment were not found directly (search returned only generic pages).

## 4. Developer commentary, postmortems and player/reviewer opinion

### Takeaway
Robertson's own interviews exist but I could not access them. Usable developer commentary comes from Henry Smith (Spaceteam) and from the Starship Horizons developer reply; the rest is reviewer opinion.

### Cited Findings
- Robertson interviews exist: Rock Paper Shotgun, "Boldly Going: Artemis' Thomas Robertson" (Alec Meer, 1 Nov 2010, cited on Wikipedia; content not read); Space Game Junkie podcast #28 (1h25m audio, no transcript) and #429 (Artemis Cosmos). [SGJ #28](https://spacegamejunkie.com/featured/sgj-podcast-28-treasure-trove-thomas-robertson-i-e-kinda-talk-artemis/amp); [SGJ #429](https://www.spacegamejunkie.com/podcasts/sgj-podcast-429-artemis-cosmos/)
- Artemis Cosmos (successor) lists 2-11 players per search summary (unverified); [itch page](https://techbear.itch.io/artemis-cosmos).
- Smith (Spaceteam): restraint and simplicity kept it accessible; teach by doing; shared stakes drive helping. [Episodic Content ch. 2](https://episodiccontentmag.com/2016/01/29/everybodyshake2/)
- Bridge Crew reviewers: AI crew "a bit dim", requires babysitting; solo feels hollow. (search summary of reviews: [Road to VR](https://www.roadtovr.com/star-trek-bridge-crew-review/), others unopened)

### Inferences
- A report writer should not attribute design intent quotes to Robertson from this note; listening to SGJ #28/#429 or reading the RPS piece is required.

### Gaps
- Robertson's views on crew size, captain role, difficulty: unavailable.
- No Reddit/forum quotes verified. r/Artemis and r/BridgeSims exist but were not read.
- Tom's Guide, PC Gamer and Co-Optimus pieces could not be retrieved.

## 5. Concrete ideas that transfer to FTLite, and ideas that do not

### Takeaway
Transfer: role-exclusive console actions/info, escalating simultaneous demand, multi-console switching for small crews (here: walking), staggered event routing, short timers, learn-by-doing onboarding. Do not transfer: separate-screen secrecy, Captain-as-talker-only role, AI crew as primary solo fix, heavy GM scripting.

### Cited Findings (basis for the inferences below)
- See sections 1-4; all cited facts there. No source addresses FTLite directly.

### Inferences (my own)
Transferable:
1. Role-gated information: show detailed readouts (enemy shield weakness, system health numbers, fire locations) only at the relevant console or room; others see coarse icons. Recreates the Science-tells-Weapons chain (Fistful of Wits, BoardGameQuest) on one screen.
2. Walking replaces EmptyEpsilon's station-switch button. A solo player is the "one player switching consoles" model; make the walk cost the balancing knob. Offer auto-mode/slow AI for unmanned consoles at a visible penalty (efficiency cap), not full competence, since Bridge Crew's AI drew complaints when it forced micromanagement.
3. Difficulty by concurrent-demand scaling (Spaceteam): scale crisis frequency, overlap and timer length by player count, and give solo/duo a lower ceiling or generous timers so it is not "noticeably harder alone" (Bridge Crew).
4. Combined-station analogue: allow one console action to cover two systems for a small crew (like Tactical, Engineering+, Operations), or let Doors/Life Support be partly automated at low player counts.
5. Event routing so every console matters in a rotation: include events that need Engineering, Medbay, Life Support and Doors regularly; avoid Engineering as a "secondary need" console (BoardGameQuest). Give each station a "peak" moment per encounter.
6. Mixed encounter types and non-predictable scripts to prevent lulls (BoardGameQuest Comms lull); cheap randomisation like Spaceteam's random names.
7. Short, legible countdowns on crises to force urgency (Spaceteam card game timer lesson); difficulty tiers as timer length (3/5/7 min analogue).
8. Teach by doing: first encounter is a low-stakes forced two-station task, not a tutorial wall (Smith; Helm's complaint about unclear start).
9. Shared-fail stakes so idle players have reason to help: let any player assist at an adjacent console at partial effect.

Not transferable or weak:
- Separate-screen secrecy and shouting across devices (Spaceteam) is impossible on one shared screen with couch players seeing each other; replace with room/console gating.
- Dedicated Captain with no station (Artemis/EmptyEpsilon): in a 1-4 player walking-crew game this would leave a player with no verbs; keep every player operational and let leadership emerge.
- GM role and Lua mission scripting (Artemis, EmptyEpsilon): high setup burden, not suited to casual couch play; use authored encounter sets plus a director that adapts.
- 6+ crew assumptions and multiple ships: out of scope at 4 players.
- Full AI crew that follows orders: expensive, and evidence says it disappoints.

### Gaps
- No playtest data for FTLite; all above is design hypothesis to validate by playtesting at 1, 2, 3 and 4 players, tracking per-console idle time.
