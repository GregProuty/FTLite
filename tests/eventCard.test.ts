import { describe, it, expect } from 'vitest';
import { TICK_HZ, VOTE_SECONDS, VOTE_SETTLE } from '../src/renderer/src/sim/tuning';
import { EVENTS, EVENT_DEFS } from '../src/renderer/src/sim/events';
import { NodeType, jumpShip } from '../src/renderer/src/sim/run';
import { downCrew } from '../src/renderer/src/sim/crew';
import { buildHudModel, eventCard, runNotice } from '../src/renderer/src/render/hudModel';
import { makeState, quiet, intents, run, mapM, setEvent, seatNavigator, setNodeTypes, chargeJump } from './helpers/sim';

const at = (s: ReturnType<typeof makeState>, column: number, node: number) => { s.run.column = column; s.run.node = node; s.run.nodesReached = column; };

const T = TICK_HZ;
const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ status: 'active' as const, key: i === 0 ? 'kb:0' : 'kb:1' }));
const open = (id = 4, players = 2) => { const s = makeState(players, 1); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; mapM(s); at(s, 1, 2); setEvent(s, id); return s; };
const press = (...pids: number[]) => () => intents(...[0, 1, 2, 3].map((p) => ({ confirmPressed: pids.includes(p) })));

describe('events wait for the crew (spec Demo-x-b section 2)', () => {
  it('an event with no vote stays open: no timer runs, the notice and the card say it waits', () => {
    const s = open(0, 2);
    run(s, 60 * T);
    expect(s.run.eventChoice).toBe(-1); expect(s.run.eventOpenTick).toBe(-1);
    expect(runNotice(s)[0]).toBe(`EVENT: ${EVENTS[0]!.title}   waiting for a vote`);
    expect(eventCard(s)!.status).toBe('Waiting for the first vote');
  });
  it('the 15 s limit starts at the first vote: P1 votes after 40 s, P2 never; it resolves 15 s after the vote', () => {
    const s = open(0, 2); run(s, 40 * T);
    const first = s.tick; run(s, 1, press(0)); run(s, 1, press(0));   // P1: Leave it (option 2)
    expect(s.run.eventOpenTick).toBe(first);
    expect(eventCard(s)!.status).toBe(`Deciding in ${VOTE_SECONDS}s`);
    run(s, VOTE_SECONDS * T - 3); expect(s.run.eventChoice).toBe(-1);
    run(s, 2); expect(s.run.eventChoice).toBe(1);
  });
  it('the settle starts at the vote too: both vote after 20 s and it resolves VOTE_SETTLE later', () => {
    const s = open(4, 2); run(s, 20 * T); run(s, 1, press(0, 1));
    run(s, VOTE_SETTLE * T - 1); expect(s.run.eventChoice).toBe(-1);
    run(s, 2); expect(s.run.eventChoice).toBe(0);
  });
  it('the seated officer’s row vote starts the limit', () => {
    const s = open(4, 2); const n = seatNavigator(s, 0); run(s, 30 * T); s.stations.cursor[n] = 3;
    const first = s.tick; run(s, 1, press(0)); expect(s.run.vote[0]).toBe(1); expect(s.run.eventOpenTick).toBe(first);
  });
  it('arrival at an Event beacon opens the event without starting the limit', () => {
    const s = makeState(2, 1); quiet(s); mapM(s); setNodeTypes(s, { '1:0': NodeType.Event }); chargeJump(s);
    jumpShip(s, { column: 1, node: 0 });
    expect(s.run.event).toBeGreaterThanOrEqual(0); expect(s.run.eventOpenTick).toBe(-1);
  });
});

describe('the event card (spec Demo-x-b section 2)', () => {
  it('none without an open event; the title, the text rows and the numbered choices', () => {
    const s = open(4, 2);
    const card = eventCard(s)!, def = EVENT_DEFS[4]!;
    expect(card.title).toBe(def.title); expect(card.text).toEqual([...def.text]);
    expect(card.choices.map((c) => c.number)).toEqual(def.choices.map((_, k) => `${k + 1}.`));
    expect(card.choices.map((c) => c.votes)).toEqual(def.choices.map(() => []));
    expect(card.help).toBe('Confirm to vote   Navigation officer: pick a row');   // spec Demo-xi section 2: seated players vote too
    expect(buildHudModel(s, slots(2), 'running', '').eventCard).toEqual(card);
    expect(buildHudModel(s, slots(2), 'paused', '').eventCard).toBeNull();
    const none = makeState(2, 1); expect(eventCard(none)).toBeNull(); expect(buildHudModel(none, slots(2), 'running', '').eventCard).toBeNull();
  });
  it('each player’s vote is marked beside the choice; a downed player’s vote goes', () => {
    const s = open(4, 2); run(s, 1, press(0, 1)); run(s, 1, press(1));   // P1 option 1, P2 option 2
    let card = eventCard(s)!;
    expect(card.choices[0]!.votes).toEqual(['P1']); expect(card.choices[1]!.votes).toEqual(['P2']);
    run(s, 1, press(0)); card = eventCard(s)!;   // P1 to option 2 too
    expect(card.choices[1]!.votes).toEqual(['P1', 'P2']); expect(card.choices[0]!.votes).toEqual([]);
    downCrew(s, 1); run(s, 1); expect(eventCard(s)!.choices[1]!.votes).toEqual(['P1']);
  });
  it('a blue option is flagged, a disabled one is not enabled; the card closes when the event resolves', () => {
    const id = EVENT_DEFS.findIndex((d) => d.choices.some((c) => c.req?.some((q) => q.kind === 'skill' || q.kind === 'station')));
    const s = open(id, 2), card = eventCard(s)!;
    const k = EVENT_DEFS[id]!.choices.findIndex((c) => c.req?.some((q) => q.kind === 'skill' || q.kind === 'station'));
    expect(card.choices[k]!.blue).toBe(true);
    expect(card.choices.some((c) => !c.blue)).toBe(true);
    run(s, 1, press(0, 1)); run(s, VOTE_SECONDS * T + 1);
    expect(s.run.eventChoice).toBeGreaterThanOrEqual(0); expect(eventCard(s)).toBeNull();
  });
});
