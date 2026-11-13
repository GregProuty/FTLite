/** Events as data (spec Loop-v section 1). Every event is a title, one or two lines of text, two or three choices, the bots' safe choice, a selection weight and an optional depth gate. sim/events.ts interprets this data; nothing here runs. */

/** A choice's requirement (spec Loop-v section 1): unmet, the choice is disabled and shown dim. A station or crew skill requirement is a blue option, shown with its name. */
export type Req =
  | { kind: 'scrap'; n: number }                     // scrap >= n (scaled with the event)
  | { kind: 'fuel'; n: number }                      // fuel >= n
  | { kind: 'hull'; n: number }                      // hull > n
  | { kind: 'torpedoes'; n: number }                 // torpedo stock >= n
  | { kind: 'torpedoRoom' }                          // torpedo stock below TORP_CAP (the Smugglers' rule)
  | { kind: 'station'; station: number; n: number }  // the ship has the station, at a base level >= n (StationKind)
  | { kind: 'skill'; skill: number; n: number };     // a conscious crew member's skill level >= n (Skill)

/** A choice's effects, applied in list order (spec Loop-v section 1). Every random pick draws rng.loot in list order. */
export type Effect =
  | { kind: 'scrap'; n: number }        // scaled with the event; a cost spends at most the balance
  | { kind: 'fuel'; n: number }         // never below 0
  | { kind: 'hull'; n: number }         // capped at HULL_MAX, never below 1 from an event
  | { kind: 'torpedoes'; n: number }    // within 0..TORP_CAP
  | { kind: 'heal' }                    // conscious crew to full health
  | { kind: 'crewDamage'; n: number }   // each conscious crew member, never below 1 health
  | { kind: 'fire' }                    // a random room (one draw)
  | { kind: 'breach' }                  // a random free site (one draw, none without a free site)
  | { kind: 'failStation' }             // a random station (one draw; an already failed one is skipped)
  | { kind: 'weapon' }                  // a random loot weapon through the Loop-iii grant rules (one draw)
  | { kind: 'fight'; elite: boolean }   // an enemy arrives ENCOUNTER_START seconds later at this beacon; elite: the Pursuit's elite, no kill reward
  | { kind: 'pursuit'; n: number }      // moves the Pursuit's front by n columns
  | { kind: 'driveReset' }              // the drive starts charging again
  | { kind: 'nothing' };

/** An outcome: effects, or a chance resolved with one rng.loot draw (success below chance). */
export type Outcome = readonly Effect[] | { chance: number; success: readonly Effect[]; failure: readonly Effect[] };
/** A choice. The label states the real effect and odds; `{n}` in a label is the scrap amount n, scaled like the effects. `short` is the label in the top-centre notice when the full labels do not fit there. */
export interface Choice { label: string; short?: string; req?: readonly Req[]; outcome: Outcome }
/** An event. text: one or two Navigation rows. scaled: false for the six Run-ii events, whose amounts stay as they were (spec Loop-v amendment E1). */
export interface EventDef { id: string; title: string; text: readonly string[]; choices: readonly Choice[]; safeChoice: number; weight: number; minDepth?: number; scaled?: boolean }

import { StationKind } from './stationKinds';
import { Skill } from './skillIds';
import { PURSUIT_STEP } from './tuning';

const NOTHING: readonly Effect[] = [{ kind: 'nothing' }];

/** The event list. The order is stable: the run stores an event as its index here, and the first six are the Run-ii events (spec Loop-v section 2). */
export const EVENT_DEFS: readonly EventDef[] = [
  { id: 'derelictHulk', title: 'Derelict hulk', text: ['A drifting hulk, still warm inside.'], safeChoice: 1, weight: 1, scaled: false, choices: [
    { label: 'Salvage it (+25 scrap, a fire)', outcome: [{ kind: 'scrap', n: 25 }, { kind: 'fire' }] },
    { label: 'Leave it', outcome: NOTHING }] },
  { id: 'distressCall', title: 'Distress call', text: ['A venting freighter offers a reward.'], safeChoice: 1, weight: 1, scaled: false, choices: [
    { label: 'Help them (hull -10, +30 scrap)', req: [{ kind: 'hull', n: 10 }], outcome: [{ kind: 'hull', n: -10 }, { kind: 'scrap', n: 30 }] },
    { label: 'Ignore it', outcome: NOTHING }] },
  { id: 'smugglers', title: 'Smugglers', text: ['Smugglers offer cheap torpedoes.'], safeChoice: 1, weight: 1, scaled: false, choices: [
    { label: 'Buy 2 torpedoes (20 scrap)', req: [{ kind: 'scrap', n: 20 }, { kind: 'torpedoRoom' }], outcome: [{ kind: 'scrap', n: -20 }, { kind: 'torpedoes', n: 2 }] },
    { label: 'Refuse', outcome: NOTHING }] },
  { id: 'micrometeoroids', title: 'Micrometeoroid field', text: ['A debris field lies across the lane.'], safeChoice: 1, weight: 1, scaled: false, choices: [
    { label: 'Push through (+20, a breach)', short: 'Push through (+20)', outcome: [{ kind: 'scrap', n: 20 }, { kind: 'breach' }] },
    { label: 'Go around (drive recharges)', short: 'Go around', outcome: [{ kind: 'driveReset' }] }] },
  { id: 'supplyCache', title: 'Supply cache', text: ['A cache, hard-wired to something.'], safeChoice: 0, weight: 1, scaled: false, choices: [
    { label: 'Take the scrap (+40)', short: 'Take it (+40)', outcome: [{ kind: 'scrap', n: 40 }] },
    { label: 'Strip it bare (+60, a station fails)', short: 'Strip it (+60)', outcome: [{ kind: 'scrap', n: 60 }, { kind: 'failStation' }] }] },
  { id: 'medicalFreighter', title: 'Medical freighter', text: ['A hospital ship offers treatment.'], safeChoice: 1, weight: 1, scaled: false, choices: [
    { label: 'Treat the crew (15 scrap)', req: [{ kind: 'scrap', n: 15 }], outcome: [{ kind: 'scrap', n: -15 }, { kind: 'heal' }] },
    { label: 'Decline', outcome: NOTHING }] },
  // Loop-v: the new events (spec Loop-v section 2). Scrap amounts are for depth 0 and scale with depth.
  { id: 'ghostSignal', title: 'Ghost signal', text: ['A buoy loops a dead captain\'s log.', 'The coordinates are still good.'], safeChoice: 2, weight: 1, choices: [
    { label: 'Follow it (50%: +{45}, or a fight)', short: 'Follow it', outcome: { chance: 0.5, success: [{ kind: 'scrap', n: 45 }], failure: [{ kind: 'fight', elite: false }] } },
    { label: 'Trace the log (+{30})', short: 'Trace it', req: [{ kind: 'station', station: StationKind.Science, n: 2 }], outcome: [{ kind: 'scrap', n: 30 }] },
    { label: 'Let the dead rest', short: 'Leave it', outcome: NOTHING }] },
  { id: 'pirateToll', title: 'Pirate toll', text: ['Three gunboats block the lane.', 'Their leader wants a toll.'], safeChoice: 2, weight: 1, minDepth: 2, choices: [
    { label: 'Pay the toll ({25} scrap)', short: 'Pay {25}', req: [{ kind: 'scrap', n: 25 }], outcome: [{ kind: 'scrap', n: -25 }] },
    { label: 'Refuse them (a fight)', short: 'Fight', outcome: [{ kind: 'fight', elite: false }] },
    { label: 'Burn past them (hull -10)', short: 'Run, hull -10', outcome: [{ kind: 'hull', n: -10 }] }] },
  { id: 'bountyHunter', title: 'Bounty hunter', text: ['A hunter says your hull matches a', 'warrant. She will take a fine.'], safeChoice: 0, weight: 1, minDepth: 3, choices: [
    { label: 'Pay her (up to {30} scrap)', short: 'Pay', outcome: [{ kind: 'scrap', n: -30 }] },
    { label: 'Tell her where to go (a fight)', short: 'Fight', outcome: [{ kind: 'fight', elite: false }] },
    { label: 'Forged papers (free)', short: 'Papers', req: [{ kind: 'station', station: StationKind.Navigation, n: 3 }], outcome: NOTHING }] },
  { id: 'champion', title: 'The champion', text: ['A decorated duelist offers a purse', 'to any crew who can beat her.'], safeChoice: 1, weight: 0.5, minDepth: 6, choices: [
    { label: 'Accept (+{70} now, an elite fight)', outcome: [{ kind: 'scrap', n: 70 }, { kind: 'fight', elite: true }] },
    { label: 'Decline politely', outcome: NOTHING }] },
  { id: 'fuelDepot', title: 'Fuel depot', text: ['An automated depot, its owners long', 'gone. The pumps still work.'], safeChoice: 0, weight: 1, choices: [
    { label: 'Fill the tanks (+2 fuel)', outcome: [{ kind: 'fuel', n: 2 }] },
    { label: 'Drain it dry (+4 fuel, a fire)', outcome: [{ kind: 'fuel', n: 4 }, { kind: 'fire' }] }] },
  { id: 'tanker', title: 'Tanker', text: ['A tanker captain with a full belly', 'and an empty wallet.'], safeChoice: 1, weight: 1, choices: [
    { label: 'Buy 3 fuel ({20} scrap)', req: [{ kind: 'scrap', n: 20 }], outcome: [{ kind: 'scrap', n: -20 }, { kind: 'fuel', n: 3 }] },
    { label: 'Wave her on', outcome: NOTHING }] },
  { id: 'miningColony', title: 'Mining colony', text: ['Miners on a cold rock, their reactor', 'jammed. They have fuel to spare.'], safeChoice: 2, weight: 1, choices: [
    { label: 'Fix it (+3 fuel, +{20})', short: 'Fix it', req: [{ kind: 'skill', skill: Skill.Repair, n: 2 }], outcome: [{ kind: 'fuel', n: 3 }, { kind: 'scrap', n: 20 }] },
    { label: 'Lend hands (crew -15 hp, +2 fuel)', short: 'Lend hands', outcome: [{ kind: 'crewDamage', n: 15 }, { kind: 'fuel', n: 2 }] },
    { label: 'Wish them well', short: 'Move on', outcome: NOTHING }] },
  { id: 'weaponsLocker', title: 'Weapons locker', text: ['A sealed military locker tumbles', 'past, its lock still blinking.'], safeChoice: 2, weight: 1, choices: [
    { label: 'Crack it (60%: a weapon, or a fire)', short: 'Crack it', outcome: { chance: 0.6, success: [{ kind: 'weapon' }], failure: [{ kind: 'fire' }] } },
    { label: 'Read the lock (a weapon)', short: 'Read the lock', req: [{ kind: 'station', station: StationKind.Science, n: 3 }], outcome: [{ kind: 'weapon' }] },
    { label: 'Leave it spinning', short: 'Leave it', outcome: NOTHING }] },
  { id: 'armsDealer', title: 'Arms dealer', text: ['A dealer opens a crate of salvaged', 'guns. No refunds, no questions.'], safeChoice: 1, weight: 1, minDepth: 2, choices: [
    { label: 'Buy one ({45} scrap, a random gun)', short: 'Buy one ({45})', req: [{ kind: 'scrap', n: 45 }], outcome: [{ kind: 'scrap', n: -45 }, { kind: 'weapon' }] },
    { label: 'No questions, no sale', short: 'No sale', outcome: NOTHING }] },
  { id: 'smugglersRun', title: 'Smugglers\' run', text: ['An old smuggling lane cuts through', 'the nebula. Tight, but fast.'], safeChoice: 2, weight: 1, choices: [
    { label: 'Take it (hull -10, Pursuit back)', short: 'Take it', outcome: [{ kind: 'hull', n: -10 }, { kind: 'pursuit', n: -PURSUIT_STEP }] },
    { label: 'Fly it (Pursuit back)', short: 'Fly it', req: [{ kind: 'station', station: StationKind.Navigation, n: 3 }], outcome: [{ kind: 'pursuit', n: -PURSUIT_STEP }] },
    { label: 'Stay on the charts', short: 'Stay', outcome: NOTHING }] },
  { id: 'loudBuoy', title: 'Loud buoy', text: ['A nav buoy shouting on every band.', 'Its casing is full of parts.'], safeChoice: 1, weight: 1, choices: [
    { label: 'Strip it (+{35}, Pursuit closes in)', outcome: [{ kind: 'scrap', n: 35 }, { kind: 'pursuit', n: PURSUIT_STEP }] },
    { label: 'Leave it shouting', outcome: NOTHING }] },
  { id: 'refugees', title: 'Refugees', text: ['A lifeboat of farmers begs a tow', 'to the next port. They can pay.'], safeChoice: 1, weight: 1, choices: [
    { label: 'Tow them (-1 fuel, +{30} scrap)', req: [{ kind: 'fuel', n: 2 }], outcome: [{ kind: 'fuel', n: -1 }, { kind: 'scrap', n: 30 }] },
    { label: 'Wish them luck', outcome: NOTHING }] },
  { id: 'quarantine', title: 'Quarantine flag', text: ['A liner flies the yellow flag.', 'Someone aboard is still answering.'], safeChoice: 2, weight: 1, choices: [
    { label: 'Send medicine (+{40})', short: 'Medicine', req: [{ kind: 'station', station: StationKind.Medbay, n: 2 }], outcome: [{ kind: 'scrap', n: 40 }] },
    { label: 'Board her (70%: +{30}, or crew -20)', short: 'Board her', outcome: { chance: 0.7, success: [{ kind: 'scrap', n: 30 }], failure: [{ kind: 'crewDamage', n: 20 }] } },
    { label: 'Keep well clear', short: 'Keep clear', outcome: NOTHING }] },
  { id: 'ionStorm', title: 'Ion storm', text: ['An ion storm crawls across the lane,', 'thick with charged salvage.'], safeChoice: 2, weight: 1, choices: [
    { label: 'Skim it (+{30}, a station fails)', short: 'Skim it', outcome: [{ kind: 'scrap', n: 30 }, { kind: 'failStation' }] },
    { label: 'Ground it (+{30})', short: 'Ground it', req: [{ kind: 'station', station: StationKind.Engineering, n: 2 }], outcome: [{ kind: 'scrap', n: 30 }] },
    { label: 'Wait it out (drive recharges)', short: 'Wait', outcome: [{ kind: 'driveReset' }] }] },
  { id: 'salvageTug', title: 'Salvage tug', text: ['A tug with spare hull plate and', 'a mechanic who likes to talk.'], safeChoice: 1, weight: 1, choices: [
    { label: 'Buy plate (+20 hull, {25} scrap)', req: [{ kind: 'scrap', n: 25 }], outcome: [{ kind: 'scrap', n: -25 }, { kind: 'hull', n: 20 }] },
    { label: 'Just trade stories', outcome: NOTHING }] },
  { id: 'oldDebt', title: 'Old debt', text: ['A trader swears your ship owes him.', 'His crew have brought wrenches.'], safeChoice: 1, weight: 1, choices: [
    { label: 'Settle it by hand (+{25})', short: 'Brawl', req: [{ kind: 'skill', skill: Skill.Combat, n: 1 }], outcome: [{ kind: 'scrap', n: 25 }] },
    { label: 'Pay him (up to {15} scrap)', short: 'Pay', outcome: [{ kind: 'scrap', n: -15 }] },
    { label: 'Hold the airlock (crew -10 hp)', short: 'Hold, crew -10', outcome: [{ kind: 'crewDamage', n: 10 }] }] },
  { id: 'ordnanceRock', title: 'Ordnance dump', text: ['Somebody buried torpedoes in this', 'rock and never came back.'], safeChoice: 1, weight: 1, choices: [
    { label: 'Dig them out (+3 torps, a breach)', outcome: [{ kind: 'torpedoes', n: 3 }, { kind: 'breach' }] },
    { label: 'Leave the rock be', outcome: NOTHING }] },
  { id: 'sensorGhost', title: 'Sensor ghost', text: ['Something large moves in the dust.', 'It has not seen us yet.'], safeChoice: 1, weight: 1, minDepth: 2, choices: [
    { label: 'Hunt it (50%: +{50}, or a fight)', short: 'Hunt it (50%)', outcome: { chance: 0.5, success: [{ kind: 'scrap', n: 50 }], failure: [{ kind: 'fight', elite: false }] } },
    { label: 'Run silent (drive recharges)', short: 'Run silent', outcome: [{ kind: 'driveReset' }] }] },
  { id: 'cleanCall', title: 'Too clean a call', text: ['A distress call read off a manual.', 'Nobody talks like that.'], safeChoice: 2, weight: 1, choices: [
    { label: 'Answer (40%: +{40}, or a fight)', short: 'Answer', outcome: { chance: 0.4, success: [{ kind: 'scrap', n: 40 }], failure: [{ kind: 'fight', elite: false }] } },
    { label: 'Scan the wreck (+{20})', short: 'Scan it', req: [{ kind: 'station', station: StationKind.Science, n: 2 }], outcome: [{ kind: 'scrap', n: 20 }] },
    { label: 'Not our problem', short: 'Ignore', outcome: NOTHING }] },
  { id: 'freeTrader', title: 'Free trader', text: ['A trader with fuel to swap and', 'a cat asleep on the console.'], safeChoice: 2, weight: 1, choices: [
    { label: 'Trade 2 torps for 3 fuel', short: '2 torps for 3 fuel', req: [{ kind: 'torpedoes', n: 2 }], outcome: [{ kind: 'torpedoes', n: -2 }, { kind: 'fuel', n: 3 }] },
    { label: 'Buy 2 fuel ({12} scrap)', short: 'Buy 2 fuel', req: [{ kind: 'scrap', n: 12 }], outcome: [{ kind: 'scrap', n: -12 }, { kind: 'fuel', n: 2 }] },
    { label: 'Pet the cat, move on', short: 'Move on', outcome: NOTHING }] },
  { id: 'listeningPost', title: 'Listening post', text: ['A dead listening post, its dish', 'still turning.'], safeChoice: 1, weight: 1, choices: [
    { label: 'Pull its logs (+1 fuel, +{15})', outcome: [{ kind: 'fuel', n: 1 }, { kind: 'scrap', n: 15 }] },
    { label: 'Leave it listening', outcome: NOTHING }] },
  { id: 'fieldHospital', title: 'Field hospital', text: ['A field hospital trades care for', 'parts. The surgeon looks tired.'], safeChoice: 2, weight: 1, choices: [
    { label: 'Treat the crew ({20} scrap)', short: 'Treat', req: [{ kind: 'scrap', n: 20 }], outcome: [{ kind: 'scrap', n: -20 }, { kind: 'heal' }] },
    { label: 'Give hull plate (hull -10, heal)', short: 'Plate for care', req: [{ kind: 'hull', n: 10 }], outcome: [{ kind: 'hull', n: -10 }, { kind: 'heal' }] },
    { label: 'Thank them, no', short: 'Decline', outcome: NOTHING }] },
];
