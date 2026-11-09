# Co-op crew/station design, skill-scaled stations, and hazard directors: prior art for FTLite

Method note: primary sources read directly where possible (Valve L4D slides as PDFs converted with pdftotext; Barotrauma source files via raw GitHub). Several wikis (Barotrauma wiki, FTL wiki) returned 401/402/403 and were not read; FTL numbers are therefore weak. Secondary summaries from search are labelled. Items marked [UNVERIFIED] have no primary support.

## 1. What makes crew-station co-op fun and frustrating; scaling 1-4 players incl. solo

### Takeaway
Games in this genre work when there are more simultaneous tasks than hands (panic and prioritisation), tasks are readable, and information or capability is split so one player cannot run everything. The quarterback/alpha problem is mainly addressed by real-time pressure and by per-player unique capability or information. Solo play is usually handled by a companion/bot or by lowering workload. I found no primary postmortem on idle-player or 1-4 scaling for FTL, Artemis, or Barotrauma.

### Cited Findings
- Overcooked postmortem: the team wanted everyone acting simultaneously so players are not competing with the game; many simultaneous timers and more tasks than players can handle produce the intended panic; visible panic at conventions was read as a success signal. [Develop post-mortem: Overcooked](https://mcvuk.com/the-develop-post-mortem-overcooked/)
- Overcooked: players found a solution and repeated it, so levels moved elements to force players out of routine. A lives-based survival mode "bogged players down" and was replaced by a timer; unrestricted ingredient handling confused players so restrictions were added. Levels stayed compact so the camera did not zoom out. [same](https://mcvuk.com/the-develop-post-mortem-overcooked/)
- Overcooked designers say many games treat co-op as an afterthought (two avatars, twice the enemies, race for loot), and they wanted to avoid competitive pull; communication was the mechanic. (Search-engine summary of interviews, not read in full.) [Road to the IGF: Overcooked](https://gamedeveloper.com/design/road-to-the-igf-ghost-town-games-i-overcooked-i-)
- Keep Talking and Nobody Explodes: asymmetric information (only the defuser sees the bomb, only experts have the manual) so "the fun really lives between players"; a hidden system tracks how well the defuser is doing and fires disruptions (alarm, lights out) when they do well, aiming for last-second finishes without a death spiral. Ambiguous rules (capital O vs 0, unclear "second wire") made players feel cheated; players rarely reported these, devs found them by eavesdropping on sessions. [Game Developer: Finding the fun in bomb defusal](https://gamedeveloper.com/design/finding-the-fun-in-bomb-defusal-with-i-keep-talking-and-nobody-explodes-i-)
- Spaceteam: shouting was not planned, it emerged as the only way to get attention; an early panel with four instructions at once overwhelmed playtesters; the card-game adaptation scales difficulty by number of malfunction/anomaly cards chosen by player count and difficulty, and its designers found a timer was the only way to get everyone onto the urgency. Henry Smith cites Space Alert as main inspiration. (Search-summary level; full articles not retrieved.) [Episodic Content: Making of Spaceteam ch.3](https://episodiccontentmag.com/2016/02/05/everybodyshake3/), [Wikipedia: Spaceteam](https://en.wikipedia.org/wiki/Spaceteam)
- Quarterbacking: blog consensus lists remedies as hidden information, real-time/time pressure (one source calls real-time "the only surefire solution"), role differentiation/unique powers, traitor mechanics, rotating leader, simultaneous action selection; sources disagree on whether it is a design or a people problem and call hidden info/time pressure "band-aids". [Mitigating quarterbacking](https://donteatthemeeples.substack.com/p/mitigating-quarterbacking-cooperative-games), [Meeple Mountain](https://www.meeplemountain.com/articles/benching-the-quarterback-how-to-deal-with-alpha-players-in-co-op-games/), [Erik Twice: alpha player is a symptom](https://eriktwice.com/en/2021/03/12/alpha-player-cooperative-games-symptom/), [Coop Gestalt](https://coopgestalt.com/2016/06/07/the-alpha-player-problem/)
- Lovers in a Dangerous Spacetime: began as 2P, 4P co-op added later (by 2016); playable fully solo, with a pet companion filling the second seat per the devs' own interview; reviewers say the real strategy is deciding who covers which stations. Devs said a fun 2P co-op powerup system was a big challenge and a combo system worked better than more gem variety. [Wikipedia](https://en.wikipedia.org/wiki/Lovers_in_a_Dangerous_Spacetime), [Nerdist interview](https://nerdist.com/article/interview-asteroid-base-talks-lovers-in-a-dangerous-spacetime/), [Asteroid Base devlog](https://www.asteroidbase.com/devlog/gamasutra-deep-dive-powerups), [Game Informer review](https://gameinformer.com/games/lovers_in_a_dangerous_spacetime/b/xboxone/archive/2015/09/15/lovers-in-a-dangerous-spacetime-game-informer-review)
- L4D: when a human is absent the game fills with Survivor Bots that prioritise human teammates and the game "cheats" to guarantee some undesirable events cannot occur; rescuing incapacitated humans was called a "difficult issue" for bots. [Booth, AI Systems of L4D (AIIDE 2009)](https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf)

### Inferences
- FTLite's "more hazards than hands" ratio is the key tuning dial; for N players, scale hazard concurrency, not hazard strength (Overcooked/Spaceteam pattern), and make solo a lower concurrency cap plus a slower director.
- Walking between rooms is itself the anti-quarterback device (a player cannot be in two places) plus real-time pressure; add per-room/station information only that the person standing there sees (hazard severity, timers) to reinforce it.
- Solo: Lovers' companion and L4D bots suggest an automatic low-skill helper (e.g., a drone that operates one idle station at a fixed weak skill) is a precedent; no source gives numbers.
- Readability bugs (KTANE) matter more than expected: playtest by watching silently.

### Gaps
- No primary postmortem found on idle players/bottlenecks for FTL, Artemis, Barotrauma, or Space Team; Artemis was not researched at all.
- No data on how FTL (single-player) maps to 1-4 players; no source on Lovers' 4P rebalancing.
- Overcooked 1-4 player scaling: no source found (levels reportedly tuned per player count, unverified).

## 2. Station interaction: hold-to-operate, range, multi-operator, skill scaling

### Takeaway
Barotrauma's source gives reusable concrete formulas: skill gain with a diminishing-returns divisor, and a lerp from skill to duration. FTL skill data could not be verified from primary sources. No source found on hold-to-operate/range/multi-operator rules.

### Cited Findings (Barotrauma source code, read directly)
- Skill gain: `skillDivider = pow(max(skillLevel, 15), SkillIncreaseExponent)`; gain = `min(baseGain / skillDivider, maxGain)` with default maxGain 2; comment in code: formula "too generous on low skill levels, hence the minimum divider." [CharacterInfo.cs](https://github.com/FakeFishGames/Barotrauma/blob/master/Barotrauma/BarotraumaShared/SharedSource/Characters/CharacterInfo.cs)
- Defaults: SkillIncreaseExponent 1.5, SkillIncreasePerRepair 5.0, SkillIncreasePerSabotage 3.0, AssistantSkillIncreaseMultiplier 1.1, SingleRoundSkillGainMultiplier 4.0 (non-campaign), SkillIncreasePerSecondWhenSteering 0.005, per second operating turret 0.001, per hostile damage 0.01, per friendly healed 0.001, per CPR revive 0.5, MaximumSkillWithTalents 200. [SkillSettings.cs](https://github.com/FakeFishGames/Barotrauma/blob/master/Barotrauma/BarotraumaShared/SharedSource/Characters/SkillSettings.cs)
- Repair: `successFactor = ((avg(characterLevel - requiredLevel*mult) + 100)/2)/100`; `fixDuration = lerp(100, 10, successFactor)` seconds (defaults FixDurationLowSkill 100, High 10); condition per second = Health / fixDuration. Skill gain on repair is a discrete event (completion), not per second. Source may contain an operator-precedence bug in repair-speed divisor (flagged by the fetch tool, unverified). [Repairable.cs](https://github.com/FakeFishGames/Barotrauma/blob/master/Barotrauma/BarotraumaShared/SharedSource/Items/Components/Repairable.cs)
- Barotrauma continuous-use skill gain exists (steering 0.005/s, turret 0.001/s), i.e., XP-by-use is per-second at low rates and diminishing with level.
- Character XP (not skills): `450 + 500*level` per level. Same CharacterInfo.cs source.
- FTL (unreliable secondary): piloting/engines earn 1 XP per dodged shot while manned; a table lists 15 XP for first rank (13 for humans?); evasion bonuses conflict between sources (+2%/+3% vs +5/+7/+10). [ludo.guide](https://www.ludo.guide/guide/ftl-faster-than-light/skills), [Vigaro blog](https://vigaroeentertainment.blogspot.com/2022/10/ftl-analysis-crew-overview-and.html) [UNVERIFIED, conflicting]

### Inferences
- Reusable skill model for FTLite: `gain = min(base / max(level,15)^1.5, cap)`; works with a 0-100 skill. Output via `lerp(slow, fast, (level+100)/200)`-style mapping keeps an unskilled operator at ~half of max rather than useless, which helps new/solo players. (My extrapolation from Barotrauma's mapping, not a stated design rationale.)
- Per-second XP with low constants (0.001-0.005 skill/s) implies hundreds of seconds per level at mid skill; tune so a 20-min session moves a player a few levels.

### Gaps
- Hold-to-operate, interaction range, multi-operator rules: no source found. Barotrauma wiki, FTL wiki fetches failed (401/402/403).
- Barotrauma skill cap default (100) not confirmed from Job.cs.
- Artemis station design not researched.

## 3. Hazard/AI directors: algorithms, seeding, escalation, player-count scaling

### Takeaway
Valve's L4D and Barotrauma's source give two complementary, fully concrete directors: L4D's 4-state intensity cycle with specific timings, and Barotrauma's intensity-gated, threshold-rising event starter with seeded Mersenne Twister selection. Both are small enough to port.

### Cited Findings
**Left 4 Dead (primary slides)**
- Survivor Intensity is one float per survivor: increases on damage taken (proportional), on incapacitation, on being pulled off a ledge, and when nearby Infected die (inversely proportional to distance); decays toward zero over time; does NOT decay while Infected are actively engaging the survivor. [Booth AIIDE](https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf), also [GDC 2009 slides](https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf)
- States: Build Up (full threat population until intensity crosses peak threshold); Sustain Peak (continue full threat 3-5 s after peak); Peak Fade (minimal population, wait until intensity decays out of peak range, so Relax is not consumed by the ongoing fight; Relax won't start until a natural break); Relax (minimal threat 30-45 s, or until survivors travelled far enough toward the next safe room), then Build Up again. Boss encounters are not affected by adaptive pacing. Same source.
- "Algorithm adjusts pacing, not difficulty"; "Simple algorithms can generate compelling pacing schedules." Same source.
- Mob (horde) intervals 90-180 s on Normal; spawn resets a random interval; minimum just after a spawn rising to max after a duration, to balance frequent mobs. (Slide text partially stripped; exact wording of the ramp is my reading.) Same source.
- Ancillary reports: director adapts to performance (more items when struggling) [secondary, unverified]. [TechRaptor](https://techraptor.net/content/10-years-of-left-4-dead)

**Barotrauma EventManager (source read via fetch tool summary; verify against file)** [EventManager.cs](https://github.com/FakeFishGames/Barotrauma/blob/master/Barotrauma/BarotraumaShared/SharedSource/Events/EventManager.cs)
- Intensity recomputed every 5 s. Inputs: crew vitality average (unconscious count half; default 0.5), enemy strength (/500 onboard, /5000 outside, 0.2 per human enemy on sonar), hull breaches (integrity = 1 - holes/10), fire (sum of fire widths /1000, floor 0.2 if any), flooding (volume ratio, ignored under 0.1, ×1.5 above). Target = `((1-crew)+(1-hull)+flooding)/3 + fire*0.5 + enemies`, clamped 0-1.
- Smoothing is asymmetric: rises 0.04 per second (about 25 s 0 to 1) but falls 0.0025 per second (about 400 s), so intensity lingers.
- Event gate: an event set may start only if current intensity <= threshold; threshold starts at 0.2 and rises over time to cap 1.0, resets to default when an event starts (a time-since-last-event relaxation so director eventually fires even in a messy state). Per-set MinIntensity/MaxIntensity; cooldown after events flagged TriggerEventCooldown; cooldown pauses while crew is away (CrewAwayResetDelay 60 s).
- Difficulty: level difficulty + extra, clamped 0-100, selects event settings whose range contains it.
- Seeding: `MTRandom(StringToInt(level.Seed) XOR eventHistoryIds)`; weighted commonness; recently used events weighted ×0.1; history 20.

**RimWorld storytellers (fan wiki/forum; unverified specifics)**
- Event strength from wealth, colonist count, recent colonist loss, time since last major event; Randy random with ×0.5-×1.5 multiplier; adaptation factor escalates over time and resets on colonist loss; Cassandra described as danger then breathing room cycles. Numeric caps (10,000 raid points, colonist 18/50) are conflicting [UNVERIFIED]. [RimWorld wiki](https://rimworldwiki.com/wiki/Storyteller), [Steam thread](https://steamcommunity.com/app/294100/discussions/0/2150972948826716628)

**Open source / libraries**
- No TypeScript L4D-style director found. Seeded PRNG libs in TS: [Prando](https://github.com/zeh/prando), [@zakkster/lite-random (Mulberry32)](https://www.pkgstats.com/pkg:@zakkster/lite-random), [@manticorp/gamerng](https://npmjs.com/package/@manticorp/gamerng), [seedrandom](https://github.com/davidbau/seedrandom). Unity Runtime Spawner has stepped intensity profiles (C#). [Megacrush Spawn Director](https://megacrush.gitbook.io/megacrush-unity-assets/runtime-spawner/runtime-spawner-user-manual/components/spawn-director)
- Barotrauma is the best open reference implementation (C#, repo available).

### Inferences
- Proposed FTLite director sketch: single float `stress` computed from hazard state (fire/breach/power, crew downed ratio, unattended hazards), asymmetric smoothing (fast up, slow down like Barotrauma), L4D 4-state machine (BuildUp / SustainPeak 3-5 s / PeakFade / Relax 30-45 s) over it, plus a Barotrauma rising threshold so spawns eventually resume. Scale per-player by running spawn budgets as `base * (0.6 + 0.4*N)`-style concurrency caps (my suggestion; no source gives the constants) and escalate with a time-driven difficulty value separate from the pacing cycle (L4D separates pacing from difficulty).
- Determinism: use one seeded PRNG stream for the director, separate from cosmetic RNG, and draw spawn locations/types only inside director ticks so replays match; keep a history ring to down-weight repeats (Barotrauma ×0.1).
- Do not let intensity decay while a hazard is actively unattended (L4D rule).

### Gaps
- Booth GDC talk video not watched; PDF text lacks slide numerics beyond those listed (several bullets stripped by extraction).
- No source on exact player-count scaling in L4D (4 fixed) or Barotrauma beyond difficulty/crew health.
- RimWorld numbers unverified; no primary source (Tynan Sylvester talks not retrieved).
- FTL event pacing, Darkest Dungeon escalation not researched.

## 4. Revive/downed mechanics in co-op roguelikes

### Takeaway
Reviving by contact encourages cohesion but is tedious if teammates are far; designs trade risk against idle time. Helldivers 2 reportedly removed direct revives (reinforcement instead) because it undercut tension. Little primary data found.

### Cited Findings
- 2011 design blog: contact-range channeled revive rewards staying together and adds risk; penalties shouldn't rely on annoyance; options include remote revive skills, life-cost revives, consumables, and automatic timed revives with a per-downed-teammate-not-nearby morale debuff (needs a harsh wipe penalty). [Game Developer: Co-op Revive mechanics](https://www.gamedeveloper.com/design/co-op-revive-mechanics)
- Headline of a Videogamer article claims original Helldivers 2 allowed reviving downed teammates but it "ruined the stress"; I could not read the article (404) [UNVERIFIED]. [VideoGamer](https://www.videogamer.com/news/og-helldivers-2-allowed-players-revive-downed-teammates-ruined-stress-of-the-game)
- Bleed-out timers commonly pause during revive (mod docs) — weak source. [BleedOut mod](https://minecraftbible.com/mods/project/bleedout)
- Barotrauma awards 0.5 skill for a CPR revive (see section 2), a precedent for rewarding rescue with XP. [SkillSettings.cs](https://github.com/FakeFishGames/Barotrauma/blob/master/Barotrauma/BarotraumaShared/SharedSource/Characters/SkillSettings.cs)

### Inferences
- For FTLite a downed crew member could be teleported to a medbay/respawn pod after timer (avoid long idle), with revive by hold-Interact speeding it; downed time should be short (tens of seconds) because the game has no spectate content. Pure design judgement.

### Gaps
- Nothing found on Risk of Rain, Isaac revive design, or idle/spectator time data; Helldivers detail not verified.
