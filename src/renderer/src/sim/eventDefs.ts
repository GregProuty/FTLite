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

const NOTHING: readonly Effect[] = [{ kind: 'nothing' }];

/** The event list. The order is stable: the run stores an event as its index here, and the first six are the Run-ii events (spec Loop-v section 2). */
export const EVENT_DEFS: readonly EventDef[] = [
  { id: 'derelictHulk', title: 'Derelict hulk', text: ['A drifting hulk, still warm inside.'], safeChoice: 1, weight: 1, scaled: false, choices: [
    { label: 'Salvage it (+25 scrap, fire risk)', outcome: [{ kind: 'scrap', n: 25 }, { kind: 'fire' }] },
    { label: 'Leave it', outcome: NOTHING }] },
  { id: 'distressCall', title: 'Distress call', text: ['A venting freighter offers a reward.'], safeChoice: 1, weight: 1, scaled: false, choices: [
    { label: 'Help them (hull -10, +30 scrap)', req: [{ kind: 'hull', n: 10 }], outcome: [{ kind: 'hull', n: -10 }, { kind: 'scrap', n: 30 }] },
    { label: 'Ignore it', outcome: NOTHING }] },
  { id: 'smugglers', title: 'Smugglers', text: ['Smugglers offer cheap torpedoes.'], safeChoice: 1, weight: 1, scaled: false, choices: [
    { label: 'Buy 2 torpedoes (20 scrap)', req: [{ kind: 'scrap', n: 20 }, { kind: 'torpedoRoom' }], outcome: [{ kind: 'scrap', n: -20 }, { kind: 'torpedoes', n: 2 }] },
    { label: 'Refuse', outcome: NOTHING }] },
  { id: 'micrometeoroids', title: 'Micrometeoroid field', text: ['A debris field lies across the lane.'], safeChoice: 1, weight: 1, scaled: false, choices: [
    { label: 'Push through (+20, breach risk)', outcome: [{ kind: 'scrap', n: 20 }, { kind: 'breach' }] },
    { label: 'Go around (drive recharges)', outcome: [{ kind: 'driveReset' }] }] },
  { id: 'supplyCache', title: 'Supply cache', text: ['A cache, hard-wired to something.'], safeChoice: 0, weight: 1, scaled: false, choices: [
    { label: 'Take the scrap (+40)', outcome: [{ kind: 'scrap', n: 40 }] },
    { label: 'Strip it bare (+60, a station fails)', outcome: [{ kind: 'scrap', n: 60 }, { kind: 'failStation' }] }] },
  { id: 'medicalFreighter', title: 'Medical freighter', text: ['A hospital ship offers treatment.'], safeChoice: 1, weight: 1, scaled: false, choices: [
    { label: 'Treat the crew (15 scrap)', req: [{ kind: 'scrap', n: 15 }], outcome: [{ kind: 'scrap', n: -15 }, { kind: 'heal' }] },
    { label: 'Decline', outcome: NOTHING }] },
];
