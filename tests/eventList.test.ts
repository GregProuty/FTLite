import { describe, it, expect } from 'vitest';
import { nextFloat } from '../src/shared/rng';
import { step } from './helpers/rawInput';
import { botIntent } from './helpers/bot';
import { EVENT_DEFS, choiceEnabled, choiceLabel, isBlue, pickEvent, eventEligible, noticeChoices, resolveEvent } from '../src/renderer/src/sim/events';
import type { Effect, Outcome } from '../src/renderer/src/sim/eventDefs';
import type { SimState } from '../src/renderer/src/sim/state';
import { NAV_TEXT_MAX, NodeType, navRows, sectorJump, jumpShip, tallyVotes } from '../src/renderer/src/sim/run';
import { buildHudModel, runNotice, type NavigationPanel } from '../src/renderer/src/render/hudModel';
import { textPx } from '../src/renderer/src/render/theme';
import { NOTICE } from '../src/renderer/src/render/hudLayout';
import { saveSnapshot, loadSnapshot } from './helpers/simLifetime';
import { hashState } from '../src/renderer/src/sim/hash';
import { Encounter } from '../src/renderer/src/sim/enemy';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { NOTICE_LINE_MAX, SECTOR_COLUMNS, TICK_HZ, VOTE_SETTLE, TORP_CAP } from '../src/renderer/src/sim/tuning';
import { makeState, quiet, mapM, setEvent, setNodeTypes, grantScrap, chargeJump, seatNavigator, intents, run, ahead, LAYOUT } from './helpers/sim';

const calm = (players = 2): SimState => { const s = makeState(players, 1); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; mapM(s); s.run.column = 1; s.run.node = 2; return s; };
const deep = (): SimState => { const s = calm(); s.run.sector = 2; s.run.column = 5; return s; };   // depth 17
const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ status: 'active' as const, key: i === 0 ? 'kb:0' : 'kb:1' }));
const effectsOf = (o: Outcome): readonly Effect[] => ('chance' in o ? [...o.success, ...o.failure] : o);
const has = (o: Outcome, kind: Effect['kind'], pred: (e: Effect) => boolean = () => true): boolean => effectsOf(o).some((e) => e.kind === kind && pred(e));
const anyChoice = (pred: (o: Outcome) => boolean) => EVENT_DEFS.filter((d) => d.choices.some((c) => pred(c.outcome))).length;

describe('the event list (spec Loop-v section 2)', () => {
  it('24 or more events with unique ids, two or three choices each, fitting the seen mask; the first six are the Run-ii events', () => {
    expect(EVENT_DEFS.length).toBeGreaterThanOrEqual(24); expect(EVENT_DEFS.length).toBeLessThanOrEqual(31);
    expect(new Set(EVENT_DEFS.map((d) => d.id)).size).toBe(EVENT_DEFS.length);
    expect(EVENT_DEFS.slice(0, 6).map((d) => d.id)).toEqual(['derelictHulk', 'distressCall', 'smugglers', 'micrometeoroids', 'supplyCache', 'medicalFreighter']);
    for (const d of EVENT_DEFS) { expect(d.choices.length).toBeGreaterThanOrEqual(2); expect(d.choices.length).toBeLessThanOrEqual(3); expect(d.weight).toBeGreaterThan(0); expect(d.safeChoice).toBeLessThan(d.choices.length); }
  });
  it('the mix: 6 with a blue option, 4 that can start a fight (one elite), 4 with a stated chance, 3 that give fuel, 2 a weapon, 2 that move the Pursuit both ways', () => {
    expect(EVENT_DEFS.filter((d, id) => d.choices.some((_, k) => isBlue(id, k))).length).toBeGreaterThanOrEqual(6);
    expect(anyChoice((o) => has(o, 'fight'))).toBeGreaterThanOrEqual(4);
    expect(anyChoice((o) => has(o, 'fight', (e) => e.kind === 'fight' && e.elite))).toBeGreaterThanOrEqual(1);
    expect(anyChoice((o) => 'chance' in o)).toBeGreaterThanOrEqual(4);
    expect(anyChoice((o) => has(o, 'fuel', (e) => e.kind === 'fuel' && e.n > 0))).toBeGreaterThanOrEqual(3);
    expect(anyChoice((o) => has(o, 'weapon'))).toBeGreaterThanOrEqual(2);
    expect(anyChoice((o) => has(o, 'pursuit', (e) => e.kind === 'pursuit' && e.n < 0))).toBeGreaterThanOrEqual(1);
    expect(anyChoice((o) => has(o, 'pursuit', (e) => e.kind === 'pursuit' && e.n > 0))).toBeGreaterThanOrEqual(1);
  });
  it('text: one or two ASCII rows within NAV_TEXT_MAX, two sentences at most; titles fit too', () => {
    for (const d of EVENT_DEFS) {
      expect(d.text.length).toBeGreaterThanOrEqual(1); expect(d.text.length).toBeLessThanOrEqual(2);
      for (const t of [d.title, ...d.text]) { expect(t.length, t).toBeLessThanOrEqual(NAV_TEXT_MAX); expect(/^[\x20-\x7e]+$/.test(t), t).toBe(true); }
      expect((d.text.join(' ').match(/[.!?](\s|$)/g) ?? []).length, d.id).toBeLessThanOrEqual(2);
    }
  });
  it('labels fit NAV_TEXT_MAX at depth 0 and 17, every chance label states its percentage, and each effect is named in its label', () => {
    const words: Partial<Record<Effect['kind'], RegExp>> = { fight: /fight/, fire: /fire/, breach: /breach/, failStation: /station fails/, weapon: /weapon|gun/, pursuit: /Pursuit/, fuel: /fuel/, hull: /hull|plate/i, crewDamage: /crew/, heal: /heal|Treat/, torpedoes: /torp/, driveReset: /drive/ };
    for (let id = 0; id < EVENT_DEFS.length; id++) EVENT_DEFS[id]!.choices.forEach((c, k) => {
      const label = choiceLabel(calm(), id, k);
      for (const s of [calm(), deep()]) expect(choiceLabel(s, id, k).length, choiceLabel(s, id, k)).toBeLessThanOrEqual(NAV_TEXT_MAX);
      if ('chance' in c.outcome) expect(label, label).toContain(`${Math.round(c.outcome.chance * 100)}%`);
      for (const e of effectsOf(c.outcome)) if (words[e.kind]) expect(label, `${label}: ${e.kind}`).toMatch(words[e.kind]!);
    });
  });
  it('every scrap amount of a scaled event is a {n} in its label, and every {n} is one of its amounts', () => {
    for (const d of EVENT_DEFS) if (d.scaled !== false) for (const c of d.choices) {
      const tokens = [...c.label.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1])).sort();
      const amounts = [...effectsOf(c.outcome).flatMap((e) => (e.kind === 'scrap' ? [Math.abs(e.n)] : [])), ...(c.req ?? []).flatMap((q) => (q.kind === 'scrap' ? [q.n] : []))];
      for (const t of tokens) expect(amounts, c.label).toContain(t);
      for (const a of amounts) expect(tokens, c.label).toContain(a);
    }
  });
  it('the notice lines are ASCII and fit NOTICE_LINE_MAX for every event at depth 0 and 17', () => {
    for (let id = 0; id < EVENT_DEFS.length; id++) for (const s of [calm(), deep()]) {
      setEvent(s, id); const lines = runNotice(s);
      expect(lines).toHaveLength(2); expect(lines[1]).toBe(noticeChoices(s, id, (l) => textPx(l) <= NOTICE.w));   // the HUD measures the line at the larger font (spec Demo-x-c section 1)
      for (const l of lines) { expect(l.length, l).toBeLessThanOrEqual(NOTICE_LINE_MAX); expect(/^[\x20-\x7e]+$/.test(l)).toBe(true); }
    }
    const s = calm(); setEvent(s, EVENT_DEFS.findIndex((d) => d.id === 'pirateToll')); s.run.sector = 0; s.run.column = 2;
    expect(runNotice(s)[1]).toBe('1 Pay 33  /  2 Fight  /  3 Run, hull -10');   // too long in full: the numbered short labels, scaled at depth 2
  });
  it('the safe choice has no requirement, never starts a fight or calls the Pursuit, and every choice can be taken somewhere', () => {
    for (const d of EVENT_DEFS) {
      const safe = d.choices[d.safeChoice]!;
      expect(safe.req ?? [], d.id).toEqual([]);
      expect(has(safe.outcome, 'fight'), d.id).toBe(false); expect(has(safe.outcome, 'pursuit', (e) => e.kind === 'pursuit' && e.n > 0), d.id).toBe(false);
    }
    const rich = calm(); grantScrap(rich, 999); rich.run.fuel = 9; rich.weapons.torpedoStock = 3; for (let k = 0; k < rich.run.upgrades.length; k++) rich.run.upgrades[k] = 3;
    for (let i = 0; i < 6; i++) rich.skills.xp[i] = 1e6; for (let i = 6; i < 12; i++) rich.skills.xp[i] = 1e6;
    for (let id = 0; id < EVENT_DEFS.length; id++) EVENT_DEFS[id]!.choices.forEach((_, k) => expect(choiceEnabled(rich, id, k), `${id}:${k}`).toBe(true));
    expect(rich.weapons.torpedoStock).toBeLessThan(TORP_CAP);
  });
});

describe('selection on arrival (spec Loop-v section 2)', () => {
  const walk = (s: SimState): number => {
    const ids = EVENT_DEFS.map((_, i) => i).filter((i) => eventEligible(s, i));
    let u = nextFloat({ s: s.rng.loot.s }) * ids.reduce((a, i) => a + EVENT_DEFS[i]!.weight, 0);
    for (const i of ids) { u -= EVENT_DEFS[i]!.weight; if (u < 0) return i; }
    return ids[ids.length - 1]!;
  };
  it('one loot draw by weight over the eligible events, marking the event seen', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = makeState(2, seed); s.run.column = 2; const want = walk(s), after = (() => { const r = { s: s.rng.loot.s }; nextFloat(r); return r.s; })();
      expect(pickEvent(s)).toBe(want); expect(s.rng.loot.s).toBe(after); expect((s.run.eventsSeen >>> want) & 1).toBe(1);
    }
  });
  it('the depth gate: an event is never drawn before its minDepth; all can be drawn at depth 17', () => {
    const early = new Set<number>(), late = new Set<number>();
    for (let seed = 1; seed <= 300; seed++) { const a = makeState(1, seed); a.run.column = 1; early.add(pickEvent(a)); const b = makeState(1, seed); b.run.sector = 2; b.run.column = 5; late.add(pickEvent(b)); }
    for (const id of early) expect(EVENT_DEFS[id]!.minDepth ?? 0).toBeLessThanOrEqual(1);
    expect(late.size).toBe(EVENT_DEFS.length);
    expect([...early].some((id) => (EVENT_DEFS[id]!.minDepth ?? 0) > 0)).toBe(false);
  });
  it('no event twice in a sector until every eligible one has been seen; a sector jump clears the marks', () => {
    const s = makeState(2, 4); s.run.sector = 1; s.run.column = 4;
    const n = EVENT_DEFS.filter((_, i) => eventEligible(s, i)).length, got = new Set<number>();
    for (let k = 0; k < n; k++) got.add(pickEvent(s));
    expect(got.size).toBe(n);
    const again = pickEvent(s); expect(got.has(again)).toBe(true);   // all seen: the seen ones count again
    s.run.column = SECTOR_COLUMNS - 1; s.run.node = 0; s.run.fuel = 3; sectorJump(s); expect([s.run.sector, s.run.eventsSeen]).toEqual([2, 0]);
  });
  it('an Event arrival marks its event seen; eventsSeen round-trips and changes the hash', () => {
    const e = calm(); e.run.column = 0; e.run.node = 0; setNodeTypes(e, { '1:2': NodeType.Event }); jumpShip(e, ahead(e, 2));
    expect(e.run.eventsSeen).toBe(1 << e.run.event);
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(e)))); expect(t.run.eventsSeen).toBe(e.run.eventsSeen);
    const h = hashState(e); e.run.eventsSeen |= 1 << 27; expect(hashState(e)).not.toBe(h);
  });
});

describe('blue options, dim choices and three-way votes on the HUD (spec Loop-v section 1)', () => {
  const idOf = (key: string) => EVENT_DEFS.findIndex((d) => d.id === key);
  it('Navigation lists the title, the text rows and the choices; a blue option carries its station name and the blue flag; an unmet one is disabled', () => {
    const s = calm(); const id = idOf('weaponsLocker'); setEvent(s, id); seatNavigator(s, 0); run(s, 1);
    const p = buildHudModel(s, slots(2), 'running', '').players[0]!.console as NavigationPanel;
    expect(p.rows.map((r) => [r.text, r.selectable, r.enabled, r.blue])).toEqual([
      ['Weapons locker', false, false, false], ['A sealed military locker tumbles', false, false, false], ['past, its lock still blinking.', false, false, false],
      ['Crack it (60%: a weapon, or a fire)', true, true, false], ['[Science 3] Read the lock (a weapon)', true, false, true], ['Leave it spinning', true, true, false]]);   // no evade row at a calm event (spec Demo-xii section 4)
    s.run.upgrades[StationKind.Science] = 1; expect(navRows(s)[4]!.enabled).toBe(true);
    expect(navRows(s).every((r) => r.text.length <= NAV_TEXT_MAX)).toBe(true);
  });
  it('a standing Confirm rounds three options; the prompt names the next one; a three-way tie goes to the officer', () => {
    const s = calm(3); const id = idOf('pirateToll'); setEvent(s, id); const press = (...pids: number[]) => () => intents(...[0, 1, 2].map((p) => (pids.includes(p) ? { confirmPressed: true } : {})));
    const prompt = () => buildHudModel(s, slots(3), 'running', '').players[1]!.confirmPrompt;
    expect(prompt()).toBe('Vote 1'); run(s, 1, press(1)); expect([s.run.vote[1], prompt()]).toEqual([0, 'Vote 2']);
    run(s, 1); run(s, 1, press(1)); expect([s.run.vote[1], prompt()]).toEqual([1, 'Vote 3']);
    run(s, 1); run(s, 1, press(1)); expect([s.run.vote[1], prompt()]).toEqual([2, 'Vote 1']);
    run(s, 1); run(s, 1, press(1)); expect(s.run.vote[1]).toBe(0);
    s.run.vote.set([0, 2, 2]); expect(tallyVotes(s)).toEqual({ choice: 2, voters: 2, unanimous: true });   // a vote for option 1 (the toll, unaffordable here) is discarded; two for option 3
    grantScrap(s, 99); s.run.vote.set([0, 1, 2]); expect(tallyVotes(s).choice).toBe(0);                       // a three-way tie, no officer: the lowest option
    seatNavigator(s, 2); expect(tallyVotes(s).choice).toBe(2);                                                    // the seated officer breaks it
  });
  it('an event fight is announced as an elite contact, not the Pursuit', () => {
    const s = calm(); setEvent(s, idOf('champion')); s.run.sector = 1; s.run.column = 2; resolveEvent(s, 0);
    expect([s.run.encounter, s.run.pursuitFought]).toEqual([Encounter.Pending, 1]);
    expect(runNotice(s)).toEqual(['Contact: elite ship approaching']);
  });
});

describe('the bots and the new events (spec Loop-v section 3)', () => {
  it('bots resolve every event with its safe choice and never start a fight', () => {
    for (let id = 0; id < EVENT_DEFS.length; id++) {
      const s = calm(); s.run.column = 0; s.run.node = 0; setNodeTypes(s, { '1:0': NodeType.Event }); chargeJump(s);
      let armed = false;
      for (let t = 0; t < 2400 && s.run.eventChoice < 0; t++) {
        step(s, [botIntent(s, 0), botIntent(s, 1)]);
        if (!armed && s.telemetry.jumps === 1) { armed = true; setEvent(s, id); }
      }
      expect([id, s.run.eventChoice]).toEqual([id, EVENT_DEFS[id]!.safeChoice]);
      expect([id, s.run.encounter, s.enemy.nextArrivalTick > s.tick + 1e6, s.run.pursuitFought]).toEqual([id, Encounter.None, true, 0]);
      run(s, VOTE_SETTLE * TICK_HZ);
    }
  });
});
