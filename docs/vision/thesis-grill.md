# Thesis Grill (owner's answers)

Claude questions the owner on the game thesis, one question at a time, starting 2026-11-13. The answers are the owner's and bind the specs, second only to `napkin.md`. Specs are amended to match once the grill ends.

## Q1. Why mini games, instead of a single button press?

**Answer (from the napkin):** operating the ship through mini games *is* the game: "Play these mini games to operate a space ship". Mini games are the point, not a replacement for some other mechanic.

Still open: the moment players retell after a session.

## Q2. How much of a session is calm, and how much is crisis?

**Answer: B, about even (50/50).** Travel and tasks build tension, then a fight.

Implications for the specs:
- FTLite's current near-constant pressure (hazards every jump, overlapping crises) has to slow down: the director's pacing targets about half the time calm.
- Calm time is real game time (tasks, travel, port, talk), not dead time between fights; the mini games have to carry it.
- Not yet answered: whether the balance changes by career.

## Q3. What makes the calm half tense, without an impostor?

**Answer: B, choices.** The crew cannot do every task, so it decides together what matters (hide the contraband or fix the scanner?), and a wrong call shows up later.

Implications for the specs:
- Each leg offers more tasks than the crew can finish; task value differs and is visible enough to argue about.
- A choice needs scarcity to bite. The scarce resource is crew time per leg: the leg ends on arrival, and whatever is unfinished has consequences. This is a soft limit set by the travel itself, not a countdown timer (Claude's reading; the owner can correct it).
- Consequences are delayed and traceable: the skipped scanner fails at the customs checkpoint, and the crew can see why.

## Q4. What is at stake when it goes wrong?

**Answer: all three as modes of one saved campaign, tuned for Standard.** The owner is "in between A and B" and can see all three, even C. Q4b settled the default: B.

- **The structure is a saved campaign:** careers, contacts, reputation and the open world persist across sessions.
- **How bad losing the ship is is a setting chosen when the campaign starts:**
  - **One life (FTL):** losing the ship ends the campaign.
  - **Standard (Pirates!), the default and the tuning target:** ship and cargo lost, the crew escapes in a pod with debt and claws back.
  - **Relaxed (Stardew):** a repair bill and lost time, never the ship.
- One code path. The modes differ only in loss rules and a few tuning knobs; all balance and playtesting targets Standard.
- Still open: whether a campaign has an ending (retire, clear the debt) or runs forever, and how Standard avoids a debt spiral.

## Q5. How many friends is the game designed for?

**Answer: A, 2 to 4 players.** A small crew on a small ship, closest to FTLite today.

Implications for the specs:
- Ships, task lists, choices, crises and votes are designed and tuned for 2 to 4. Larger crews (6, 16, several ships) stay supported by the architecture but are later, secondary modes.
- Ships stay small: fewer rooms than the reference map (on the order of 6 to 10), so every room matters and a crew of 2 still feels stretched.
- Scarcity of crew time (Q3) is tuned for 2 to 4; bots fill seats up to the ship's crew size.
- Milestones SHIP-1 to SHIP-3 drop in priority.

## Q6. Who chooses the career, and when?

**Answer: B, the crew drifts by what it does.** "They have choices to make at each place they jump to. They level up their individual characters with what they do."

Implications for the specs:
- No career pick in the lobby. The crew's reputation (smuggler, pirate, merchant, insurgent) grows from the jobs and choices it takes, and the world reacts to the reputation.
- Direction on session one comes from the choices at every place the crew jumps to (jobs, events, encounters), not from a starting label.
- Each player's character levels up individually from what they do: today's per-skill XP from use (skills and XP, roadmap item 1) is the model, extended to the new tasks, mini games and dialogue.
- Blue options (spec section 6b) come from these individually earned skills.

## Q7. How does the crew travel?

**Answer: a randomly generated graph of star systems.** The crew jumps along the graph's links from system to system (FTL-style jumps, not free sailing).

Implications for the specs:
- Each campaign generates its own graph; nodes are star systems, edges are jump routes.
- The napkin's "Alliance controlled star system" becomes a region of many systems under the regime's control (Claude's reading; the owner can correct it).
- The direction spec's "one star system per campaign" (sections 3 and 7) changes to this graph.
- FTLite's sector map and jumps are the starting point for the code.

### Q7b. What happens when you arrive in a system?

**Answer: C. Most systems are one beat; a few hub systems hold several places.** Most systems give one thing on arrival (a port, a job, an event, a fight or a patrol). Hubs (for example a capital world, a frontier port, a remnant hideout) hold several places to visit and are where the crew returns to trade and pick up jobs.

- Revisitable: the graph is open and remembers what the crew did. The owner answered C to an option recommended as "C, fully revisitable"; Claude records it that way, and the owner can correct it.
- Hubs carry the Pirates! and Stardew layers (markets, contacts, relationships); the one-beat systems carry the FTL layer.

## Q8. Does a campaign end?

**Answer: several endings, one per path.** "Merchants retire rich, renegade/terrorist takes down the alliance, ect."

Implications for the specs:
- Each reputation path has its own ending: the merchant retires rich; the renegade (the owner's word here; the spec's placeholder label was "Insurgent") takes down the regime; smuggler and pirate endings are still to be written.
- The ending the crew reaches follows from the reputation it drifted into (Q6), so how they played chooses how it ends.
- Still open: whether a crew can retire early, how a crew with a mixed reputation ends, and what the smuggler and pirate endings are.

## Q9. What happens when your character dies?

**Answer: A for now, downed but never dead.** A crew member drops and a teammate revives them, as FTLite does today; the risk is the ship, not your character. "Eventually cloning / DNA storage": a later in-world system that brings real death back with a way to return (Claude's reading: death costs something, and a clone or stored DNA restores the character, perhaps with a price or skill loss; to be designed).

## Q10. What story do friends tell afterwards?

**Answer: all four, with the fight (B) and the choice (C) made really good.**
- A. The close call (mini games under pressure as a choice comes due).
- **B. The fight:** FTL's dual-Tetris combat played with your hands. Must be excellent.
- **C. The choice:** story choices with consequences that come back jumps later. Must be excellent.
- D. The drift (the career formed from the crew's deeds).

Implications for the specs: every milestone's playtest asks whether the session produced a fight story and a choice story. Combat (MG-1a, CB-1) and dialogue with consequences (EV-0, EV-1, delayed callbacks) get the most polish.

## Owner direction, 2026-11-14: the core demo is the Helm

> "core demo i want to build will be around the helm mini game. This is sid meiers pirates inspired navigation around a gravity well in a tactical top down view. Helm will manage the thrust, velocity and turning of the ship to navigate through obsticals, and around enemies. weapons will share that view to target weapons"

- The demo is built around the **Helm mini game**: a top-down tactical view of space around a **gravity well**, inspired by the ship-to-ship sailing of Sid Meier's Pirates!.
- The Helm controls **thrust, velocity and turning**: steering through obstacles and around enemies.
- **Weapons shares the same view** to aim its weapons.

Technical note (Claude): the sim bans `Math.sin`, `Math.cos` and similar for cross-engine determinism (Net-1 AST guard). Headings and gravity must use exact arithmetic: a fixed table of heading vectors, and `sqrt`, which is allowed.

## Q11. How does the gravity-well view relate to FTL's inside-the-ship combat?

**Answer: Claude's recommendation.** Design for **both at once**: the Helm steers and Weapons aims in the tactical view, hits land in FTL-style rooms, and the inside crew runs power, fires and repairs, linked by damage. **The demo is the tactical view with a thin link to the inside:** damage to the Engines room cuts the Helm's thrust and turning; damage to the Weapons room slows Weapons' charge. The full interior link comes after the demo proves gravity-well piloting is fun.

## Q12. How should the ship feel to fly?

**Answer: B tuned toward A.** Arcade with real momentum and real gravity: thrust changes velocity and the well's pull bends the path, so slingshots around the planet work. Mild drag and a "stabilise" assist that kills drift when the Helm lets go keep it flyable for beginners; experts whip around the well.
