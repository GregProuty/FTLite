# Roadmap: the next ten features

Written 2026-11-10 when the owner asked for an autonomous run through the feature list ("take the recommendation and move on"). Each feature goes through the same loop: brainstorm (decisions taken on the recommended option and recorded in the spec), spec, Codex spec review, plan, Codex plan review, subagent-driven execution with per-task reviews, Opus final review, fast-forward merge, Codex implementation review. The foundation spec's build order (`docs/superpowers/specs/2026-11-09-foundation-design.md` §11) covers the first four; the sub-projects in §1 and the open items in §14 give the rest, decomposed so each is playable on its own.

| # | Feature | Source | Status |
|---|---|---|---|
| 1 | **3-i Skills and XP:** six skills with XP and levels from a threshold table, productive predicates per station, XP from repairs, skill effects on every station formula, repair speed, cooling per unit and sealed doors, Engineering bonus bars with power shedding | foundation §5 Skill model, §11 item 3 | merged 2026-11-10 |
| 2 | **3-ii Characters:** the four pre-made characters with an Asset, a Complication and a skill head start; lobby character display; game-over skill gains | foundation §5 Crew, §7 session flow, §11 item 3 | merged 2026-11-10 |
| 3 | **4-i Director:** stress and pacing phase machine, elapsed-time escalation, concurrency cap, routing hazards to idle consoles, player-count scaling, replacing the timer spawner | foundation §5 Director, §11 item 4 | merged 2026-11-10 |
| 4 | **4-ii Telemetry and acceptance:** session telemetry log (time to first death, stations never manned, longest idle per player, how the run ended), game-over summary, long headless soak test for the director | foundation §10, §11 item 4 | merged 2026-11-11 |
| 5 | **Combat-i Enemy ship:** an abstract enemy ship with hull and weapons that fires at our rooms on the director's cadence; our beams and torpedoes can target it; the encounter ends when it is destroyed or withdraws | sub-project 2 | merged 2026-11-11 |
| 6 | **Combat-ii Enemy systems and shields:** enemy subsystems to target (weapons, engines, shields) with effects on its fire and escape, enemy shields that beams must pierce by frequency and torpedoes bypass | sub-project 2 | merged 2026-11-11 |
| 7 | **Boarders-i:** boarding parties that arrive in a room, crew-vs-boarder melee using the Combat skill, Doors sealing as a containment tool, Medbay recovery | sub-project 3 | in review |
| 8 | **Run-i Sector map and jumps:** a run becomes a sequence of encounters joined by jumps from a node map; hull and crew persist; survival time becomes nodes reached | sub-project 4 | next |
| 9 | **Run-ii Events and shops:** text events with choices at nodes, scrap as a resource, repairs and upgrades (station max levels, torpedo stock, hull) at shops | sub-project 4 | |
| 10 | **Run-iii Progression and permadeath:** run end and scoring, unlocks across runs kept on disk, a ship quirk per run ("the ship as a character"), restart flow | sub-project 4, §14 | |

Deferred beyond this list: networking (sub-project 5), audio, a solo drone, the shared luck resource, procedural ships.

Each feature's spec and plan live in `docs/superpowers/specs/` and `docs/superpowers/plans/` with the date prefix; gates are appended to `docs/gates.md`; the execution ledger is `.superpowers/sdd/progress.md`.
