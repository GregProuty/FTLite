// The duel playtest report (H-2 spec §8, §9, §10 "Telemetry"): the §16 rule printed verbatim, its arithmetic on a
// checklist fixture, the host-authoritative merge of host and guest records into rooms (a round the guest missed still
// listed from the host's record), the live targets and the planet extra, the latency rows and the H-2c fallback checks,
// solo rounds apart, the blank checklist, and the script itself on a directory of record files.
import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blankChecklist, DEMO_RULE, evaluateFallbacks, evaluateRule, evaluateTargets, formatReport, groupRooms, latencyRows, parseRecords, roomRounds, validateChecklist,
  type Checklist, type ChecklistSession } from '../scripts/duel-playtest-model';
import { latencyFigure, validateDuelRecord, type DuelPlaytestRecord } from '../src/renderer/src/net/duelRecord';
import { nextValidSeed, roundSeed } from '../src/renderer/src/sim/duel/seeds';

const losses = { planet: 0, asteroid: 0, edge: 0, expired: 0, own: 0, missile: 0 };
function summary(round: number, seed: number, baseTick: number, over: object = {}) {
  return { outcome: 1, ticks: 14400, terminal: [[], ['laser']], laserReleases: [3, 4], laserHits: [2, 1], missilesLaunched: [1, 1], missileHits: [1, 0], repairsFinished: [0, 1],
    laserMisses: [1, 3], layersStripped: [1, 0], missileLosses: [losses, losses], planetContacts: [0, 1], asteroidContacts: [2, 0], baits: 1, consoleSwaps: 0,
    helmEmptyTicks: 0, weaponsEmptyTicks: 10, enemyInArcTicks: 900, weaponsIdleTicks: 30, repairsStarted: [0, 1], walkingTicks: [0, 200], repairingTicks: [0, 96], round, seed, baseTick, ...over };
}
function record(role: 'host' | 'guest', round: number, seed: number, baseTick: number, o: { helm?: 0 | 1; transport?: DuelPlaytestRecord['transport']; held?: number[]; summary?: object; at?: string; session?: 'solo' } = {}): DuelPlaytestRecord {
  return validateDuelRecord({ version: 1, session: o.session ?? 'online', role, transport: o.transport ?? (role === 'host' ? 'loopback' : null), seat: role === 'host' ? 0 : 1, helmPlayer: o.helm ?? 0,
    seed, round, startedAtIso: o.at ?? `2026-11-16T12:0${round}:00.000Z`, summary: summary(round, seed, baseTick, o.summary), latency: { held: latencyFigure(o.held ?? [40, 50, 60]), command: latencyFigure([70]), rttMs: 4 },
    jitter: { count: 100, stdMs: 3.2 }, disconnects: 0, pauses: 0 });
}
// Room A on a LAN: rounds 0 to 2, the host at the Helm; the guest missed round 2. Room B over the internet: one round
// with the guest at the Helm and a slow held delay, which the crew lost. One solo round.
const a = nextValidSeed(100), b = nextValidSeed(5000);
const A = [0, 1, 2].map((r) => ({ round: r, seed: roundSeed(a, r), base: r * 15000 }));
const records = [
  ...A.map((e) => record('host', e.round, e.seed, e.base)),
  ...A.slice(0, 2).map((e) => record('guest', e.round, e.seed, e.base, { transport: 'lan', summary: { ticks: 14000 } })),   // the guest's summaries differ: the host's win
  record('host', 0, b, 0, { helm: 1, at: '2026-11-16T13:00:00.000Z', summary: { outcome: 2, ticks: 9000, terminal: [['missile'], []] } }),
  record('guest', 0, b, 0, { helm: 1, transport: 'internet', held: [100, 200, 300], at: '2026-11-16T13:00:00.000Z', summary: { outcome: 2, ticks: 9000, terminal: [['missile'], []] } }),
  record('host', 0, 77, 0, { session: 'solo', summary: { ticks: 30000 } })
];
const session = (id: string, rooms: string[], pair: ChecklistSession['pair'], answers: boolean[], over: Partial<ChecklistSession> = {}): ChecklistSession =>
  ({ id, rooms, pair, answers, guestHelmQ1: null, helmLaggy: false, note: '', ...over });

describe('the duel playtest report (spec §8, §9)', () => {
  it('prints the Helm §16 rule verbatim', () => {
    const line = readFileSync('docs/superpowers/specs/2026-11-14-helm-demo-design.md', 'utf8').split('\n').find((l) => l.startsWith('**The demo is done**'))!;
    expect(line.replaceAll('**', '').startsWith(DEMO_RULE)).toBe(true);
    const report = formatReport({ records, invalid: 0, checklist: null, files: 2 });
    expect(report).toContain(`> ${DEMO_RULE}\n`);
    expect(report).toContain('Live targets (4 online round(s)): ');   // no checklist: every online round, with a warning
    expect(report).toContain('**Warning: no checklist given, so the live targets cover every online round in the files');
  });
  it('merges host and guest files into rooms: summaries from the host, transport from the guest, a missed round kept', () => {
    const { rooms, solo } = groupRooms([...records].reverse());
    expect(rooms.map((r) => [r.key, r.transport, r.rounds.map((e) => e.round)])).toEqual([[`seed-${a}`, 'lan', [0, 1, 2]], [`seed-${b}`, 'internet', [0]]]);
    expect(rooms[0]!.rounds.map((e) => [e.summary.ticks, !!e.host, !!e.guest])).toEqual([[14400, true, true], [14400, true, true], [14400, true, false]]);
    expect(solo.map((r) => r.seed)).toEqual([77]);
    // A room whose round 0 record is missing starts at the first round seen.
    expect(groupRooms(records.filter((r) => r.round !== 0)).rooms.map((r) => r.key)).toEqual([`seed-${A[1]!.seed}-r1`]);
    // Invalid lines are counted, not fatal.
    expect(parseRecords(`${JSON.stringify(records[0])}\nnot json\n{"version":1}\n\n`)).toMatchObject({ invalid: 2, records: [records[0]] });
  });
  it('counts the records dropped as duplicates (a replayed seed) and warns in the header line', () => {
    // A second room from room A's seed on another day: its round 0 host and guest records collide with room A's.
    const replay = [record('host', 0, A[0]!.seed, 0, { at: '2026-11-17T12:00:00.000Z' }), record('guest', 0, A[0]!.seed, 0, { transport: 'lan', at: '2026-11-17T12:00:00.000Z' })];
    expect(groupRooms([...records, ...replay]).duplicates).toBe(2);
    expect(groupRooms([...records, records[0]!]).duplicates).toBe(0);   // the same record read twice is not a second room
    expect(groupRooms(records).duplicates).toBe(0);
    const header = formatReport({ records: [...records, ...replay], invalid: 0, checklist: null, files: 2 }).split('\n')[2]!;
    expect(header).toContain('**Warning: 2 duplicate record(s) dropped');
    expect(formatReport({ records, invalid: 0, checklist: null, files: 2 })).not.toContain('duplicate');
  });
  it('reads §16 as three sessions with at least 4 of 5 yes, one with a non-owner pair', () => {
    const owner4 = session('s1', [], 'owner', [true, true, true, true, false]), other5 = session('s2', [], 'non-owner', [true, true, true, true, true]);
    const owner3 = session('s3', [], 'owner', [true, true, true, false, false]), owner5 = session('s4', [], 'owner', [true, true, true, true, true]);
    expect(evaluateRule({ version: 1, sessions: [owner4, other5, owner3] })).toEqual({ passing: ['s1', 's2'], nonOwnerPassing: true, holds: false });
    expect(evaluateRule({ version: 1, sessions: [owner4, other5, owner3, owner5] }).holds).toBe(true);
    expect(evaluateRule({ version: 1, sessions: [owner4, owner5, { ...owner4, id: 's5' }] })).toEqual({ passing: ['s1', 's4', 's5'], nonOwnerPassing: false, holds: false });
    expect(evaluateRule(null).holds).toBe(false);
  });
  it('checks the live targets and the planet extra', () => {
    const t = evaluateTargets(roomRounds(groupRooms(records).rooms));
    expect(t).toMatchObject({ rounds: 4, medianSeconds: 240, lengthHolds: true, crewWins: 3, enemyWins: 1, bothOutcomes: true, weaponsHold: true, planetHolds: true });
    const quick = { label: 'q', summary: { ...records[0]!.summary, outcome: 2, ticks: 1500, terminal: [['planet'], []] as [('planet')[], never[]], missilesLaunched: [0, 1] as [number, number] } };
    expect(evaluateTargets([quick])).toMatchObject({ medianSeconds: 25, lengthHolds: false, bothOutcomes: false, weaponsMissing: ['q'], weaponsHold: false, planetLosses: ['q'], planetHolds: false });
    expect(evaluateTargets([])).toMatchObject({ medianSeconds: null, lengthHolds: false, weaponsHold: false });
  });
  it('lists one latency row per record and runs the H-2c fallback checks', () => {
    const { rooms } = groupRooms(records);
    expect(latencyRows(rooms).map((r) => [r.room, r.round, r.role, r.console, r.held.p95])).toEqual([
      [`seed-${a}`, 0, 'host', 'Helm', 60], [`seed-${a}`, 0, 'guest', 'Weapons', 60], [`seed-${a}`, 1, 'host', 'Helm', 60], [`seed-${a}`, 1, 'guest', 'Weapons', 60],
      [`seed-${a}`, 2, 'host', 'Helm', 60], [`seed-${b}`, 0, 'host', 'Weapons', 60], [`seed-${b}`, 0, 'guest', 'Helm', 300]]);
    // Check 3 judges a session on one known network, LAN (s1) or internet (s2); mixed (s3) or unknown (s4) rooms are not judged.
    const checklist: Checklist = { version: 1, sessions: [session('s1', [`seed-${a}`], 'owner', [true, true, true, true, true], { guestHelmQ1: false, helmLaggy: true }),
      session('s2', [`seed-${b}`], 'non-owner', [true, true, true, true, true], { guestHelmQ1: false, helmLaggy: true }),
      session('s3', [`seed-${a}`, `seed-${b}`], 'owner', [true, true, true, true, true], { guestHelmQ1: false }), session('s4', ['seed-1'], 'owner', [true, true, true, true, true], { guestHelmQ1: false })] };
    expect(evaluateFallbacks(rooms, checklist)).toEqual({ helmDelay: [`seed-${b} round 0 (guest Helm p95 300 ms)`], laggy: ['s1', 's2'], guestHelm: ['s1', 's2'], trips: true });
    const calm = groupRooms(records.filter((r) => r.seed !== b)).rooms;
    expect(evaluateFallbacks(calm, { version: 1, sessions: [session('s1', [`seed-${a}`], 'owner', [true, true, true, true, true], { guestHelmQ1: true })] }).trips).toBe(false);
  });
  it('prints a blank checklist, one session per room, that its own schema accepts', () => {
    const blank = blankChecklist(groupRooms(records).rooms);
    expect(validateChecklist(blank)).toEqual(blank);
    expect(blank.sessions.map((s) => [s.rooms, s.answers])).toEqual([[[`seed-${a}`], [null, null, null, null, null]], [[`seed-${b}`], [null, null, null, null, null]]]);
    expect(() => validateChecklist({ ...blank, sessions: [{ ...blank.sessions[0], answers: [true] }] })).toThrow();
  });
  it('the script reads a directory of host and guest files and its checklist, and prints the report', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ftlite-duel-report-'));
    try {
      writeFileSync(join(dir, 'duel-2026-11-16.jsonl'), records.filter((r) => r.role === 'host').map((r) => JSON.stringify(r)).join('\n') + '\n');
      writeFileSync(join(dir, 'guest.jsonl'), records.filter((r) => r.role === 'guest').map((r) => JSON.stringify(r)).join('\n') + '\nbroken\n');
      writeFileSync(join(dir, 'checklist.json'), JSON.stringify({ version: 1, sessions: [session('s1', [`seed-${a}`, 'seed-1'], 'owner', [true, true, true, true, true])] }));
      const run = (args: string[]) => new Promise<{ code: number | null; out: string }>((done) => {
        const child = spawn(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/duel-playtest-report.ts', ...args], { windowsHide: true });
        let out = ''; child.stdout.on('data', (c: Buffer) => { out += c.toString(); }); child.stderr.resume(); child.once('exit', (code) => done({ code, out }));
      });
      const report = await run([dir, join(dir, 'guest.jsonl')]);
      expect(report.code).toBe(0);
      expect(report.out).toContain(`> ${DEMO_RULE}`);
      expect(report.out).toContain('2 file(s), 8 valid record(s), 1 invalid line(s) skipped.');
      expect(report.out).toContain('Checklist: 1 session(s)');
      // The live targets cover the checklist's rooms only; room B is reported unclaimed, seed-1 as listed but missing.
      expect(report.out).toContain('Live targets (3 online round(s) in the rooms the checklist lists): ');
      expect(report.out).toContain(`Rooms no checklist session lists (left out of the live targets): seed-${b}. Rooms a session lists that no record has: seed-1.`);
      expect(report.out).toContain('**H-2c starts: yes.**');
      expect(report.out).toContain('## Solo rounds');
      expect(report.out).toContain('"session-2"');
      expect((await run([join(dir, 'checklist.json')])).code).toBe(1);   // not a record file
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 30000);
});
