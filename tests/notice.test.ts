import { describe, it, expect } from 'vitest';
import { buildHudModel, runNotice } from '../src/renderer/src/render/hudModel';
import { EVENTS, resolveEvent } from '../src/renderer/src/sim/events';
import { NodeType } from '../src/renderer/src/sim/run';
import { NOTICE_LINE_MAX, SCRAP_SURRENDER, ENCOUNTER_NOTICE_SECONDS, ENCOUNTER_START, NEVER } from '../src/renderer/src/sim/tuning';
import { Encounter } from '../src/renderer/src/sim/enemy';
import { makeState, quiet, mapM, setEvent, setNodeTypes, grantScrap, chargeJump, seatNavigator, placeEnemy } from './helpers/sim';

// Spec Demo-i sections 4, 8 and 11.4 rule 1b: the two-line run notice both players read.
const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ status: 'active' as const, key: i === 0 ? 'kb:0' : 'kb:1' }));
const SHOP = ['SHOP at Node 2a   scrap 45', 'Hull +25 (30)   Torpedoes +2 (20)   Upgrade +1 bar (50)'];
const fresh = (players = 2) => { const s = makeState(players); quiet(s); mapM(s); return s; };
const shopAt = (s: ReturnType<typeof makeState>) => { s.run.column = 1; s.run.node = 0; setNodeTypes(s, { '1:0': NodeType.Shop }); grantScrap(s, 45); };
const surrender = (s: ReturnType<typeof makeState>, secs = 8) => { placeEnemy(s); s.enemy.fleeing = 1; s.enemy.surrenderIntact = 1; s.enemy.departTick = s.tick + secs * 60; };

describe('runNotice', () => {
  it('an event pending: its title and both choices, exactly', () => {
    const s = fresh(); setEvent(s, 4);
    expect(runNotice(s)).toEqual(['EVENT: Supply cache', 'Take the scrap (+40)  /  Strip it bare (+60, a station fails)']);
  });
  it('after the choice at a shop node: the shop location cue and price list, exactly', () => {
    const s = fresh(); s.run.column = 1; s.run.node = 0; setNodeTypes(s, { '1:0': NodeType.Shop }); setEvent(s, 4); resolveEvent(s, 0); grantScrap(s, 45);
    expect(runNotice(s)).toEqual(SHOP);
    expect(SHOP[1]!.length).toBe(55);
  });
  it('the ready drive: someone take Navigation, or just JUMP READY when seated; a quiet state is empty', () => {
    const s = fresh(); expect(runNotice(s)).toEqual([]);
    chargeJump(s); expect(runNotice(s)).toEqual(['JUMP READY   someone take Navigation']);
    seatNavigator(s, 0); expect(runNotice(s)).toEqual(['JUMP READY']);
  });
  it('priority: event, surrender, shop, ready-unseated, ready-seated', () => {
    const s = fresh(); shopAt(s); chargeJump(s); surrender(s); setEvent(s, 4);
    expect(runNotice(s)[0]).toBe('EVENT: Supply cache');
    s.run.eventChoice = 0; expect(runNotice(s)).toEqual([`ENEMY SURRENDERS   hold fire 8s for +${SCRAP_SURRENDER} scrap`]);   // beats the shop and the ready drive
    s.enemy.surrenderIntact = 0; expect(runNotice(s)).toEqual(SHOP);                                                           // a voided surrender shows nothing from rule 1b
    s.enemy.present = 0; expect(runNotice(s)).toEqual(SHOP);
    setNodeTypes(s, {}); expect(runNotice(s)).toEqual(['JUMP READY   someone take Navigation']);
  });
  it('the surrender line: exact string at 8 s, within NOTICE_LINE_MAX, counting down; not without a flee', () => {
    const s = fresh(); surrender(s);
    const line = 'ENEMY SURRENDERS   hold fire 8s for +20 scrap';
    expect(runNotice(s)).toEqual([line]); expect(line.length).toBe(45); expect(line.length).toBeLessThanOrEqual(NOTICE_LINE_MAX);
    s.enemy.departTick = s.tick + 7 * 60; expect(runNotice(s)).toEqual(['ENEMY SURRENDERS   hold fire 7s for +20 scrap']);
    s.enemy.fleeing = 0; expect(runNotice(s)).toEqual([]);
  });
  it('the model: the notice is [] outside running, even with a ready drive', () => {
    const s = fresh(); chargeJump(s);
    expect(buildHudModel(s, slots(2), 'running', '').notice).toEqual(['JUMP READY   someone take Navigation']);
    for (const phase of ['lobby', 'paused', 'gameover', 'error'] as const) expect(buildHudModel(s, slots(2), phase, '').notice).toEqual([]);
    expect(buildHudModel(null, slots(2), 'lobby', '').notice).toEqual([]);
  });
  it('every possible notice line is ASCII and within NOTICE_LINE_MAX characters', () => {
    const lines: string[] = [];
    for (let id = 0; id < EVENTS.length; id++) { const s = fresh(); setEvent(s, id); lines.push(...runNotice(s)); }
    const s = fresh(); shopAt(s); lines.push(...runNotice(s));
    for (const col of [0, 1, 6]) for (const node of [0, 1, 2]) { const t = fresh(); t.run.column = col; t.run.node = node; setNodeTypes(t, { [`${col}:${node}`]: NodeType.Shop }); grantScrap(t, 999); lines.push(...runNotice(t)); }
    const r = fresh(); chargeJump(r); lines.push(...runNotice(r)); seatNavigator(r, 0); lines.push(...runNotice(r));
    const f = fresh(); surrender(f); lines.push(...runNotice(f));
    expect(lines.length).toBeGreaterThanOrEqual(12 + 2 + 2 + 1);
    for (const l of lines) { expect(l.length).toBeLessThanOrEqual(NOTICE_LINE_MAX); expect(/^[\x20-\x7e]+$/.test(l)).toBe(true); }
  });
});

describe('runNotice: encounters (spec Demo-vi section 2)', () => {
  const WON = ['ENEMY DEFEATED   +8 hull', 'Drive charging fast'];
  const ended = (enc: number) => { const s = fresh(); s.tick = 3000; s.run.encounter = enc; s.run.encounterTick = s.tick; return s; };
  it('won: the defeat line and the fast drive for ENCOUNTER_NOTICE_SECONDS after the end; over: Enemy gone; then nothing', () => {
    expect(ENCOUNTER_NOTICE_SECONDS).toBe(8);
    const w = ended(Encounter.Won); expect(runNotice(w)).toEqual(WON);
    w.tick += ENCOUNTER_NOTICE_SECONDS * 60 - 1; expect(runNotice(w)).toEqual(WON);
    w.tick += 1; expect(runNotice(w)).toEqual([]);
    const o = ended(Encounter.Over); expect(runNotice(o)).toEqual(['Enemy gone']);
    o.tick += ENCOUNTER_NOTICE_SECONDS * 60; expect(runNotice(o)).toEqual([]);
  });
  it('contact: while pending and the arrival is due within 8 s', () => {
    const s = fresh(); s.tick = 3000; s.run.encounter = Encounter.Pending; s.enemy.nextArrivalTick = s.tick + 8 * 60 + 1; expect(runNotice(s)).toEqual([]);
    s.enemy.nextArrivalTick = s.tick + 8 * 60; expect(runNotice(s)).toEqual(['Contact: enemy ship approaching']);
    s.enemy.nextArrivalTick = s.tick + 1; expect(runNotice(s)).toEqual(['Contact: enemy ship approaching']);
    s.run.encounter = Encounter.None; expect(runNotice(s)).toEqual([]);
    s.run.encounter = Encounter.Fighting; expect(runNotice(s)).toEqual([]);
  });
  it('priority: the pending event first, then the encounter rule, then the surrender, the shop and the ready drive', () => {
    const s = ended(Encounter.Won); shopAt(s); chargeJump(s); setEvent(s, 4);
    expect(runNotice(s)[0]).toBe('EVENT: Supply cache');
    s.run.eventChoice = 0; expect(runNotice(s)).toEqual(WON);
    surrender(s); expect(runNotice(s)).toEqual(WON);                                                       // the rule sits before the surrender line
    s.run.encounter = Encounter.Fighting; expect(runNotice(s)[0]).toMatch(/^ENEMY SURRENDERS/);
    s.enemy.present = 0; expect(runNotice(s)).toEqual(SHOP);
    const r = ended(Encounter.Over); chargeJump(r); expect(runNotice(r)).toEqual(['Enemy gone']);
  });
  it('every encounter line is ASCII and within NOTICE_LINE_MAX', () => {
    const lines = [...WON, 'Enemy gone', 'Contact: enemy ship approaching'];
    for (const l of lines) { expect(l.length).toBeLessThanOrEqual(NOTICE_LINE_MAX); expect(/^[ -~]+$/.test(l)).toBe(true); }
    const c = fresh(); c.enemy.nextArrivalTick = c.tick + 60; expect(runNotice(c)).toEqual([lines[3]]);
  });
});

describe('runNotice: asteroid fields (spec Demo-viii section 1)', () => {
  const field = (enc: number) => { const s = fresh(); s.run.column = 1; s.run.node = 0; setNodeTypes(s, { '1:0': NodeType.Asteroid }); s.tick = 3000; s.run.encounter = enc; s.run.encounterTick = s.tick; s.enemy.nextArrivalTick = NEVER; return s; };
  it('pending: Asteroid field ahead for the 8 s before the start', () => {
    const s = field(Encounter.Pending); expect(runNotice(s)).toEqual(['Asteroid field ahead']);
    s.tick += ENCOUNTER_START * 60 - 1; expect(runNotice(s)).toEqual(['Asteroid field ahead']);
  });
  it('fighting: nothing extra', () => { expect(runNotice(field(Encounter.Fighting))).toEqual([]); });
  it('won: FIELD CLEARED with the scrap and the fast drive for 8 s; over: no line (amendment A3: the jump re-arms the encounter at once)', () => {
    const w = field(Encounter.Won); expect(runNotice(w)).toEqual(['FIELD CLEARED   +20 scrap', 'Drive charging fast']);
    w.tick += ENCOUNTER_NOTICE_SECONDS * 60; expect(runNotice(w)).toEqual([]);
    const o = field(Encounter.Over); expect(runNotice(o)).toEqual([]);
    for (const l of ['Asteroid field ahead', 'FIELD CLEARED   +20 scrap']) { expect(l.length).toBeLessThanOrEqual(NOTICE_LINE_MAX); expect(/^[ -~]+$/.test(l)).toBe(true); }
  });
});
