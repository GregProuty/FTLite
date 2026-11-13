# Events as Data, and Two Dozen of Them (Loop-v) Design

Status: 2026-11-12. FTL-loop item 4 of the user's direction ("match their game loop as closely as possible before play testing", and "I do want this to feel like you're a crew member in star trek or firefly"). FTL's events carry its Star Trek feeling; its creators found that 15,000 words was not enough variety. FTLite has six hard-coded events. The crew already votes on them (Coop-ii).

## 1. Events become data

- `sim/eventDefs.ts` holds every event as data: `{ id, title, text, choices: Choice[], safeChoice, weight, minDepth? }`, 2 or 3 choices each.
- A **Choice** has `label`, an optional **requirement**, and an **outcome**: either a list of effects, or `{ chance, success: Effect[], failure: Effect[] }` resolved with one `rng.loot` draw.
- **Requirements** (a choice is disabled, and shown dim, when unmet): `scrap ≥ n`, `fuel ≥ n`, `hull > n`, `torpedoes ≥ n`, `stationLevel(kind) ≥ n` (FTL's blue options: shown with the station's name, e.g. `[Science 2] Scan the anomaly`), `crewSkill(skill) ≥ n` for any conscious crew member.
- **Effects** (applied in list order): `scrap ±n`, `fuel ±n`, `hull ±n` (capped at `HULL_MAX`, never below 1 from an event), `torpedoes ±n` (capped), `heal` (conscious crew to full), `crewDamage n` (each conscious crew member), `fire` (a random room), `breach` (a random free site), `failStation` (a random station), `weapon` (a random loot weapon, through the Loop-iii grant rules), `fight` (`normal` or `elite`: an enemy arrives `ENCOUNTER_START` later at this beacon), `pursuit ±x` (moves the Pursuit), `driveReset` (the drive starts charging again), `nothing`. Every random pick uses `rng.loot`, in list order.
- **Scaling.** Scrap amounts in events are written for depth 0 and multiplied by `1 + 0.15 × depth`, rounded, so later events stay worth it.
- `resolveEvent` becomes a small interpreter over this data; the vote flow (Coop-ii) is unchanged. The text the Navigation card and the vote show reads from the data, and choice labels state their effect honestly (no hidden odds, the FTL lesson): `Board her (60%: +40 scrap, else a fight)`.

## 2. The events

- The six existing events become data with their current effects and draws (their tests keep passing).
- At least 18 new ones, for **24 or more** in total, original text, two sentences at most, in the voice of a ship's crew in a lived-in sci-fi universe (Star Trek's and Firefly's tone, none of their names). The mix:
  - at least 6 with a blue option (a station level or a crew skill);
  - at least 4 that can start a fight (a pirate ambush, a bounty hunter, an elite hunter that comes with a big reward);
  - at least 4 with a chance outcome stated in the label;
  - at least 3 that give fuel, 2 that give a weapon, 2 that touch the Pursuit (a shortcut that slows it, a beacon that summons it);
  - some quiet ones with an honest trade-off (pay hull for scrap, scrap for fuel, risk a breach for torpedoes).
- Event selection on arrival: weighted by `weight`, one `rng.loot` draw as today, excluding events above their `minDepth` gate. The same event may not appear twice in one sector.

## 3. State and tests

- New run field: a per-sector bitmask of events already seen. Flattened. `SIM_VERSION` 28; the golden re-blessed once.
- Tests: the interpreter (each effect, each requirement, chance outcomes with their draw, scaling, the hull floor of 1, caps); every event's text within `NAV_TEXT_MAX` and the notice widths; every label of a chance outcome shows its percentage; selection by weight and depth gate; no repeat within a sector; the six old events unchanged in effect; the bots' safe choices still never start a fight; gates re-recorded with causes; no floor lowered.

## 4. Gate

- [x] Section 3 tests; golden re-blessed once; gates recorded.
- [x] Visual check by Claude: an event with a blue option, a chance label, a vote, and an event-started fight.
- [ ] Manual, the user: do the events feel like an episode of a crew's life?

## 5. Amendments

Made during implementation (2026-11-12):

- **E1 The six Run-ii events stay unscaled.** Section 2 keeps their effects and tests, which pin `+25` and `+40` at depth 1, so an event carries `scaled: false` and the depth multiplier applies to the 22 new events only. Their labels are unchanged too.
- **E2 Text is one or two Navigation rows.** 36 glyphs leave no room for a voice, so `text` is one or two rows, each within `NAV_TEXT_MAX`, two sentences at most. Title, two text rows, three choices and the evade row are exactly the card's seven-row window.
- **E3 A seventh requirement, `torpedoRoom`** (stock below `TORP_CAP`), keeps the Smugglers' rule as data.
- **E4 Event harm is bounded.** `crewDamage` never takes anyone below 1 health (an event never downs a crew member); a scrap cost without a requirement spends at most the balance and its label says `up to`.
- **E5 The elite fight is the Pursuit's elite** (`pursuitFought`: 1.5 x hull, faster fire, no kill reward), so the champion pays its purse up front: `Accept (+70 now, an elite fight)`. While an event is the cause (an event at this beacon, the beacon not overrun) the contact line reads `Contact: elite ship approaching`, not `The Pursuit has caught up`.
- **E6 Votes round two or three options.** A standing Confirm votes option 1, then 2, then 3, then 1 again; the prompt names the option the next press gives (`Vote 3`). The tally takes the most votes; a tie goes to the seated officer's vote when it is among the tied, else the lowest tied option. With two options every rule is as before.
- **E7 The notice's choice line.** The full labels joined by ` / ` when they fit `NOTICE_LINE_MAX`, else numbered short labels from the data (`1 Pay 29  /  2 Fight  /  3 Run, hull -10`).
- **E8 Blue options.** A station requirement is the ship's base level with its upgrades, the console present; tagged `[Science 2]`. Skill requirements use Repair and Combat only, whose names are not console names, so a tag is never ambiguous. Met blue options are drawn light blue (brighter under the cursor); an unmet choice, blue or not, is faint like every disabled row.
- **E9 Selection** walks the eligible events in list order against one `nextFloat(rng.loot)` x total weight. If every eligible event has been seen in the sector, the seen ones count again (unreachable in practice: 23 events are open at depth 1 and a sector has at most 16 middle beacons). The seen mask is `run.eventsSeen`, one bit per event (31 at most), cleared by the sector jump. `EVENT_COUNT` is gone.
- **E10 Tests changed outside the new files:** the arrival draw (now by weight), the Navigation text budget (every row of every event, labels at depth 0 and 17) and the bot test that lists safe choices (now the first six). The six events' own tests are untouched and pass.
- **E11 Found, not changed:** two Run-ii labels say `fire risk` and `breach risk` for effects that always happen (the breach only when a site is free). Section 2 keeps them as they were; rewording them is a one-line data change if wanted.
- **E12 The mix as built** (28 events, 6 + 22): 9 events with a blue option (Science 2 x2, Science 3, Navigation 3 x2, Medbay 2, Engineering 2, Repair 2, Combat 1); 6 that can start a fight (Pirate toll, Bounty hunter, The champion (elite), Ghost signal, Sensor ghost, Too clean a call); 5 with a stated chance (Ghost signal 50 %, Weapons locker 60 %, Quarantine flag 70 %, Sensor ghost 50 %, Too clean a call 40 %); 5 that give fuel (Fuel depot, Tanker, Mining colony, Free trader, Listening post); 2 that give a weapon; 2 that move the Pursuit (Smugglers' run slows it, Loud buoy calls it); quiet trade-offs (Fuel depot, Ordnance dump, Salvage tug, Refugees, Field hospital, Old debt, Listening post). Minimum depths: Pirate toll, Arms dealer, Sensor ghost 2; Bounty hunter 3; The champion 6 (weight 0.5).

### The events, as written

Scrap amounts are shown at depth 0; the new events multiply them by 1 + 0.15 x depth (x 3.55 at depth 17). The bots' safe choice never fights or calls the Pursuit.

1. **Derelict hulk** (Run-ii, unscaled): A drifting hulk, still warm inside.
   - `Salvage it (+25 scrap, fire risk)`
   - `Leave it` (the bots' safe choice)
2. **Distress call** (Run-ii, unscaled): A venting freighter offers a reward.
   - `Help them (hull -10, +30 scrap)`
   - `Ignore it` (the bots' safe choice)
3. **Smugglers** (Run-ii, unscaled): Smugglers offer cheap torpedoes.
   - `Buy 2 torpedoes (20 scrap)`
   - `Refuse` (the bots' safe choice)
4. **Micrometeoroid field** (Run-ii, unscaled): A debris field lies across the lane.
   - `Push through (+20, breach risk)`
   - `Go around (drive recharges)` (the bots' safe choice)
5. **Supply cache** (Run-ii, unscaled): A cache, hard-wired to something.
   - `Take the scrap (+40)` (the bots' safe choice)
   - `Strip it bare (+60, a station fails)`
6. **Medical freighter** (Run-ii, unscaled): A hospital ship offers treatment.
   - `Treat the crew (15 scrap)`
   - `Decline` (the bots' safe choice)
7. **Ghost signal**: A buoy loops a dead captain's log. The coordinates are still good.
   - `Follow it (50%: +45, or a fight)`
   - `[Science 2] Trace the log (+30)`
   - `Let the dead rest` (the bots' safe choice)
8. **Pirate toll** (from depth 2): Three gunboats block the lane. Their leader wants a toll.
   - `Pay the toll (25 scrap)`
   - `Refuse them (a fight)`
   - `Burn past them (hull -10)` (the bots' safe choice)
9. **Bounty hunter** (from depth 3): A hunter says your hull matches a warrant. She will take a fine.
   - `Pay her (up to 30 scrap)` (the bots' safe choice)
   - `Tell her where to go (a fight)`
   - `[Navigation 3] Forged papers (free)`
10. **The champion** (from depth 6, weight 0.5): A decorated duelist offers a purse to any crew who can beat her.
   - `Accept (+70 now, an elite fight)`
   - `Decline politely` (the bots' safe choice)
11. **Fuel depot**: An automated depot, its owners long gone. The pumps still work.
   - `Fill the tanks (+2 fuel)` (the bots' safe choice)
   - `Drain it dry (+4 fuel, a fire)`
12. **Tanker**: A tanker captain with a full belly and an empty wallet.
   - `Buy 3 fuel (20 scrap)`
   - `Wave her on` (the bots' safe choice)
13. **Mining colony**: Miners on a cold rock, their reactor jammed. They have fuel to spare.
   - `[Repair 2] Fix it (+3 fuel, +20)`
   - `Lend hands (crew -15 hp, +2 fuel)`
   - `Wish them well` (the bots' safe choice)
14. **Weapons locker**: A sealed military locker tumbles past, its lock still blinking.
   - `Crack it (60%: a weapon, or a fire)`
   - `[Science 3] Read the lock (a weapon)`
   - `Leave it spinning` (the bots' safe choice)
15. **Arms dealer** (from depth 2): A dealer opens a crate of salvaged guns. No refunds, no questions.
   - `Buy one (45 scrap, a random gun)`
   - `No questions, no sale` (the bots' safe choice)
16. **Smugglers' run**: An old smuggling lane cuts through the nebula. Tight, but fast.
   - `Take it (hull -10, Pursuit back)`
   - `[Navigation 3] Fly it (Pursuit back)`
   - `Stay on the charts` (the bots' safe choice)
17. **Loud buoy**: A nav buoy shouting on every band. Its casing is full of parts.
   - `Strip it (+35, Pursuit closes in)`
   - `Leave it shouting` (the bots' safe choice)
18. **Refugees**: A lifeboat of farmers begs a tow to the next port. They can pay.
   - `Tow them (-1 fuel, +30 scrap)`
   - `Wish them luck` (the bots' safe choice)
19. **Quarantine flag**: A liner flies the yellow flag. Someone aboard is still answering.
   - `[Medbay 2] Send medicine (+40)`
   - `Board her (70%: +30, or crew -20)`
   - `Keep well clear` (the bots' safe choice)
20. **Ion storm**: An ion storm crawls across the lane, thick with charged salvage.
   - `Skim it (+30, a station fails)`
   - `[Engineering 2] Ground it (+30)`
   - `Wait it out (drive recharges)` (the bots' safe choice)
21. **Salvage tug**: A tug with spare hull plate and a mechanic who likes to talk.
   - `Buy plate (+20 hull, 25 scrap)`
   - `Just trade stories` (the bots' safe choice)
22. **Old debt**: A trader swears your ship owes him. His crew have brought wrenches.
   - `[Combat 1] Settle it by hand (+25)`
   - `Pay him (up to 15 scrap)` (the bots' safe choice)
   - `Hold the airlock (crew -10 hp)`
23. **Ordnance dump**: Somebody buried torpedoes in this rock and never came back.
   - `Dig them out (+3 torps, a breach)`
   - `Leave the rock be` (the bots' safe choice)
24. **Sensor ghost** (from depth 2): Something large moves in the dust. It has not seen us yet.
   - `Hunt it (50%: +50, or a fight)`
   - `Run silent (drive recharges)` (the bots' safe choice)
25. **Too clean a call**: A distress call read off a manual. Nobody talks like that.
   - `Answer (40%: +40, or a fight)`
   - `[Science 2] Scan the wreck (+20)`
   - `Not our problem` (the bots' safe choice)
26. **Free trader**: A trader with fuel to swap and a cat asleep on the console.
   - `Trade 2 torps for 3 fuel`
   - `Buy 2 fuel (12 scrap)`
   - `Pet the cat, move on` (the bots' safe choice)
27. **Listening post**: A dead listening post, its dish still turning.
   - `Pull its logs (+1 fuel, +15)`
   - `Leave it listening` (the bots' safe choice)
28. **Field hospital**: A field hospital trades care for parts. The surgeon looks tired.
   - `Treat the crew (20 scrap)`
   - `Give hull plate (hull -10, heal)`
   - `Thank them, no` (the bots' safe choice)
