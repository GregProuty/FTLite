// The duel playtest report's model (H-2 spec §8, §9): pure functions over playtest records and the owner's checklist.
// Records from the host and guest files are merged into rooms (a room's rounds chain by round index, the following
// seed and a later base tick); each round takes its summary from the host's record and the room's transport from
// the guest's. The §16 rule is evaluated from the checklist; the live targets, the planet extra, the latency table and
// the H-2c fallback checks from the records. Solo records are reported apart (Helm §11a).
import { z } from 'zod';
import { validateDuelRecord, type DuelPlaytestRecord, type LatencyFigure } from '../src/renderer/src/net/duelRecord';
import { followingSeed } from '../src/renderer/src/sim/duel/seeds';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { TICK_HZ } from '../src/renderer/src/sim/tuning';

/** Helm spec §16, verbatim (its line 320, without the markdown emphasis). */
export const DEMO_RULE = 'The demo is done when 4 of 5 are yes across 3 sessions, at least one with a pair other than the owner, and the live telemetry targets hold (3 to 5 minutes; wins and losses both happen across sessions; both weapons used in every duel).';
/** Helm spec §16's playtest checklist, asked after each session. */
export const CHECKLIST_QUESTIONS = [
  "Did the Helm use the planet's gravity on purpose at least once (a slingshot or a bait)?",
  'Did the two players talk to coordinate ("bring the nose round", "missile away")?',
  'Did either player run from their console to repair at a moment that mattered?',
  'Can each player retell one fight moment?',
  'Did they want to play again straight away?'
] as const;
/** The live targets: the median round length in seconds, and the H-0 planet extra's limit. */
export const ROUND_SECONDS = { min: 180, max: 300 } as const, PLANET_LOSS_SECONDS = 30;
/** Fallback criterion 1 (spec §9): the Helm's held-delay p95 limit over a whole round, by the session's network. */
export const HELM_P95_LIMIT_MS = { lan: 150, internet: 250 } as const;

export type Transport = DuelPlaytestRecord['transport'];
export interface RoomRound { round: number; seed: number; baseTick: number; summary: DuelPlaytestRecord['summary']; host: DuelPlaytestRecord | null; guest: DuelPlaytestRecord | null }
/** One room: its rounds in order; `key` names it by its first round's seed (and that round when it is not round 0). */
export interface Room { key: string; rounds: RoomRound[]; transport: Transport }

/** The valid records in a JSONL text; `invalid` counts the lines that failed the record schema. */
export function parseRecords(text: string): { records: DuelPlaytestRecord[]; invalid: number } {
  const records: DuelPlaytestRecord[] = []; let invalid = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { records.push(validateDuelRecord(JSON.parse(line))); } catch { invalid++; }
  }
  return { records, invalid };
}

const roundKey = (r: DuelPlaytestRecord): string => `${r.round}:${r.seed}:${r.summary.baseTick}`;
const follows = (a: RoomRound, b: RoomRound): boolean => b.round === a.round + 1 && b.seed === followingSeed(a.seed) && b.baseTick >= a.baseTick + a.summary.ticks;
/** The most common non-null value, or null. */
function mode<T>(values: readonly (T | null)[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null, n = 0;
  for (const [v, c] of counts) if (c > n) { best = v; n = c; }
  return best;
}
/** Merge online records into rooms; solo records are returned apart. Duplicate records of one round and role keep the first. */
export function groupRooms(records: readonly DuelPlaytestRecord[]): { rooms: Room[]; solo: DuelPlaytestRecord[] } {
  const solo = records.filter((r) => r.session === 'solo'), rounds = new Map<string, RoomRound>();
  for (const r of records) {
    if (r.session !== 'online') continue;
    const key = roundKey(r), entry = rounds.get(key) ?? { round: r.round, seed: r.seed, baseTick: r.summary.baseTick, summary: r.summary, host: null, guest: null };
    if (r.role === 'host' && !entry.host) { entry.host = r; entry.summary = r.summary; }   // the host's record is authoritative for summaries
    if (r.role === 'guest' && !entry.guest) entry.guest = r;
    rounds.set(key, entry);
  }
  // Round index first, so every round k - 1 is placed before round k whichever machine's clock wrote it; then by time.
  const started = (e: RoomRound): string => (e.host ?? e.guest)!.startedAtIso;
  const ordered = [...rounds.values()].sort((a, b) => a.round - b.round || started(a).localeCompare(started(b)));
  const rooms: Room[] = [];
  for (const e of ordered) {
    const open = e.round === 0 ? undefined : rooms.find((room) => follows(room.rounds.at(-1)!, e));
    if (open) open.rounds.push(e);
    else rooms.push({ key: e.round === 0 ? `seed-${e.seed}` : `seed-${e.seed}-r${e.round}`, rounds: [e], transport: null });
  }
  for (const room of rooms) room.transport = mode(room.rounds.map((e) => e.guest?.transport ?? null));
  return { rooms, solo };
}

export interface ChecklistSession {
  id: string; rooms: string[]; pair: 'owner' | 'non-owner' | null;
  answers: (boolean | null)[]; guestHelmQ1: boolean | null; helmLaggy: boolean | null; note: string;
}
export interface Checklist { version: 1; sessions: ChecklistSession[] }
const answer = z.boolean().nullable();
const checklistSchema = z.object({ version: z.literal(1), sessions: z.array(z.object({
  id: z.string().max(64), rooms: z.array(z.string().max(64)).max(32), pair: z.enum(['owner', 'non-owner']).nullable(),
  answers: z.array(answer).length(5), guestHelmQ1: answer, helmLaggy: answer, note: z.string().max(2000)
}).strict()).max(64) }).strict();
export function validateChecklist(value: unknown): Checklist { return checklistSchema.parse(value) as Checklist; }
/** The blank checklist: one session per room found, every answer null, for the owner to fill in and merge. */
export function blankChecklist(rooms: readonly Room[]): Checklist {
  return { version: 1, sessions: rooms.map((room, i) => ({ id: `session-${i + 1}`, rooms: [room.key], pair: null, answers: [null, null, null, null, null], guestHelmQ1: null, helmLaggy: null, note: '' })) };
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
export interface RuleEvaluation { passing: string[]; nonOwnerPassing: boolean; holds: boolean }
/** §16's checklist half as the spec reads it (§8): three sessions each with at least 4 of 5 yes, one of them a non-owner pair. */
export function evaluateRule(checklist: Checklist | null): RuleEvaluation {
  const passing = (checklist?.sessions ?? []).filter((s) => s.answers.filter((a) => a === true).length >= 4);
  const nonOwnerPassing = passing.some((s) => s.pair === 'non-owner');
  return { passing: passing.map((s) => s.id), nonOwnerPassing, holds: passing.length >= 3 && nonOwnerPassing };
}
export interface TargetEvaluation {
  rounds: number; medianSeconds: number | null; lengthHolds: boolean;
  crewWins: number; enemyWins: number; draws: number; bothOutcomes: boolean;
  weaponsMissing: string[]; weaponsHold: boolean;
  planetLosses: string[]; planetHolds: boolean;
}
const label = (room: string, e: { round: number }): string => `${room} round ${e.round}`;
/** The live targets over rounds (summary plus a label): the median length, both outcomes, both crew weapons in every
 *  round (the crew ship's laser releases and missiles launched above zero), and no round lost to the planet in 30 s. */
export function evaluateTargets(rounds: readonly { label: string; summary: DuelPlaytestRecord['summary'] }[]): TargetEvaluation {
  const seconds = rounds.map((r) => r.summary.ticks / TICK_HZ), med = median(seconds);
  const count = (o: number) => rounds.filter((r) => r.summary.outcome === o).length;
  const weaponsMissing = rounds.filter((r) => !(r.summary.laserReleases[0] > 0 && r.summary.missilesLaunched[0] > 0)).map((r) => r.label);
  const planetLosses = rounds.filter((r) => r.summary.outcome === Outcome.EnemyWins && r.summary.terminal[0].includes('planet') && r.summary.ticks < PLANET_LOSS_SECONDS * TICK_HZ).map((r) => r.label);
  const crewWins = count(Outcome.CrewWins), enemyWins = count(Outcome.EnemyWins);
  return { rounds: rounds.length, medianSeconds: med, lengthHolds: med !== null && med >= ROUND_SECONDS.min && med <= ROUND_SECONDS.max,
    crewWins, enemyWins, draws: count(Outcome.Draw), bothOutcomes: crewWins > 0 && enemyWins > 0,
    weaponsMissing, weaponsHold: rounds.length > 0 && weaponsMissing.length === 0, planetLosses, planetHolds: planetLosses.length === 0 };
}
export const roomRounds = (rooms: readonly Room[]) => rooms.flatMap((room) => room.rounds.map((e) => ({ label: label(room.key, e), summary: e.summary })));

export interface LatencyRow { room: string; round: number; role: 'host' | 'guest'; console: 'Helm' | 'Weapons'; transport: Transport; held: LatencyFigure; command: LatencyFigure; rttMs: number | null; jitterMs: number | null }
/** One row per online record, in room and round order: the §9 figures as the record keeps them. */
export function latencyRows(rooms: readonly Room[]): LatencyRow[] {
  return rooms.flatMap((room) => room.rounds.flatMap((e) => [e.host, e.guest].flatMap((r) => r ? [{ room: room.key, round: e.round, role: r.role, console: r.seat === r.helmPlayer ? 'Helm' as const : 'Weapons' as const,
    transport: r.transport, held: r.latency.held, command: r.latency.command, rttMs: r.latency.rttMs, jitterMs: r.jitter.stdMs }] : [])));
}
export interface FallbackEvaluation { helmDelay: string[]; laggy: string[]; guestHelm: string[]; trips: boolean }
/** Spec §9's H-2c criteria: (1) the Helm machine's held p95 over the session network's limit in a round (an unknown
 *  network uses the LAN limit); (2) "the Helm felt laggy" in two sessions; (3) a session on one known network (lan or
 *  internet) whose question 1 is yes with the host at the Helm but no with the guest at the Helm. */
export function evaluateFallbacks(rooms: readonly Room[], checklist: Checklist | null): FallbackEvaluation {
  const helmDelay = latencyRows(rooms).filter((row) => {
    const room = rooms.find((r) => r.key === row.room)!, limit = room.transport === 'internet' ? HELM_P95_LIMIT_MS.internet : HELM_P95_LIMIT_MS.lan;
    return row.console === 'Helm' && row.held.p95 !== null && row.held.p95 > limit;
  }).map((row) => `${row.room} round ${row.round} (${row.role} Helm p95 ${row.held.p95} ms)`);
  const sessions = checklist?.sessions ?? [];
  const laggy = sessions.filter((s) => s.helmLaggy === true).map((s) => s.id);
  const oneNetwork = (s: ChecklistSession): boolean => {
    const nets = new Set(s.rooms.map((key) => rooms.find((r) => r.key === key)?.transport ?? null)), [only] = [...nets];
    return nets.size === 1 && (only === 'lan' || only === 'internet');
  };
  const guestHelm = sessions.filter((s) => oneNetwork(s) && s.answers[0] === true && s.guestHelmQ1 === false).map((s) => s.id);
  return { helmDelay, laggy, guestHelm, trips: helmDelay.length > 0 || laggy.length >= 2 || guestHelm.length > 0 };
}

const fig = (f: LatencyFigure): string => (f.count ? `${f.count} / ${f.median} / ${f.p95} / ${f.max}` : '0 / - / - / -');
const yes = (b: boolean): string => (b ? 'yes' : 'NO');
/** The whole report as text: the rule verbatim and its evaluation, the live targets and the planet extra, the rooms,
 *  the latency table, the fallback checks, the solo rounds apart, then the blank checklist JSON. */
export function formatReport(input: { records: readonly DuelPlaytestRecord[]; invalid: number; checklist: Checklist | null; files: number }): string {
  const { rooms, solo } = groupRooms(input.records), out: string[] = [];
  // With a checklist, the live targets and the planet extra cover only the rooms its sessions list: the LAN and internet
  // checklist runs share the day's files with the §16 sessions.
  const claimed = new Set(input.checklist?.sessions.flatMap((s) => s.rooms) ?? []);
  const judged = input.checklist ? rooms.filter((room) => claimed.has(room.key)) : rooms;
  const unclaimed = rooms.filter((room) => !claimed.has(room.key)).map((room) => room.key), missing = [...claimed].filter((key) => !rooms.some((room) => room.key === key));
  const rule = evaluateRule(input.checklist), online = evaluateTargets(roomRounds(judged)), fallback = evaluateFallbacks(rooms, input.checklist);
  out.push('# Helm demo playtest report', '', `${input.files} file(s), ${input.records.length} valid record(s), ${input.invalid} invalid line(s) skipped.`, '');
  out.push('## The §16 rule', '', `> ${DEMO_RULE}`, '');
  out.push(`Checklist: ${input.checklist ? `${input.checklist.sessions.length} session(s)` : 'none given (the blank one is printed below)'}; sessions with at least 4 of 5 yes: ${rule.passing.join(', ') || 'none'}; a non-owner pair among them: ${yes(rule.nonOwnerPassing)}; three such sessions with one non-owner pair: ${yes(rule.holds)}.`);
  out.push(`Live targets (${online.rounds} online round(s)${input.checklist ? ' in the rooms the checklist lists' : ''}): median length ${online.medianSeconds === null ? '-' : online.medianSeconds.toFixed(1)} s within 3 to 5 minutes: ${yes(online.lengthHolds)}; both outcomes (crew wins ${online.crewWins}, enemy wins ${online.enemyWins}, draws ${online.draws}): ${yes(online.bothOutcomes)}; both weapons used in every round: ${yes(online.weaponsHold)}${online.weaponsMissing.length ? ` (not in ${online.weaponsMissing.join(', ')})` : ''}.`);
  out.push(`H-0 extra, no round lost to the planet in under 30 s: ${yes(online.planetHolds)}${online.planetLosses.length ? ` (${online.planetLosses.join(', ')})` : ''}.`);
  out.push(input.checklist ? `Rooms no checklist session lists (left out of the live targets): ${unclaimed.join(', ') || 'none'}. Rooms a session lists that no record has: ${missing.join(', ') || 'none'}.`
    : '**Warning: no checklist given, so the live targets cover every online round in the files, including any LAN or internet checklist runs.**');
  out.push(`**The demo is done: ${yes(rule.holds && online.lengthHolds && online.bothOutcomes && online.weaponsHold)}.**`, '');
  out.push('## Rooms', '', '| Room | Transport | Rounds | Host records | Guest records |', '|---|---|---|---|---|');
  for (const room of rooms) out.push(`| ${room.key} | ${room.transport ?? 'unknown'} | ${room.rounds.map((e) => e.round).join(', ')} | ${room.rounds.filter((e) => e.host).length} | ${room.rounds.filter((e) => e.guest).length} |`);
  out.push('', '## Latency (spec §9)', '', 'Held and command delay: count / median / p95 / max in ms; RTT is the round median; jitter is the publication inter-arrival standard deviation against 50 ms.', '');
  out.push('| Room | Round | Machine | Console | Transport | Held | Command | RTT ms | Jitter ms |', '|---|---|---|---|---|---|---|---|---|');
  for (const row of latencyRows(rooms)) out.push(`| ${row.room} | ${row.round} | ${row.role} | ${row.console} | ${row.transport ?? 'unknown'} | ${fig(row.held)} | ${fig(row.command)} | ${row.rttMs ?? '-'} | ${row.jitterMs ?? '-'} |`);
  out.push('', '## Fallback checks (spec §9; any one starts H-2c)', '');
  out.push(`1. Helm held p95 over ${HELM_P95_LIMIT_MS.lan} ms (LAN) or ${HELM_P95_LIMIT_MS.internet} ms (internet) in a round: ${fallback.helmDelay.length ? fallback.helmDelay.join('; ') : 'none'}.`);
  out.push(`2. "The Helm felt laggy" in two sessions: ${fallback.laggy.length >= 2 ? 'yes' : 'no'} (${fallback.laggy.join(', ') || 'none'}).`);
  out.push(`3. Question 1 yes with the host at the Helm, no with the guest at the Helm (a session on one known network): ${fallback.guestHelm.join(', ') || 'none'}.`);
  out.push(`**H-2c starts: ${fallback.trips ? 'yes' : 'no'}.**`, '');
  const soloTargets = evaluateTargets(solo.map((r) => ({ label: `solo seed ${r.seed} round ${r.round}`, summary: r.summary })));
  out.push('## Solo rounds (Helm §11a, judged separately)', '');
  out.push(`${soloTargets.rounds} round(s); median length ${soloTargets.medianSeconds === null ? '-' : soloTargets.medianSeconds.toFixed(1)} s; crew wins ${soloTargets.crewWins}, enemy wins ${soloTargets.enemyWins}, draws ${soloTargets.draws}; both weapons in every round: ${yes(soloTargets.weaponsHold)}; no planet loss under 30 s: ${yes(soloTargets.planetHolds)}.`, '');
  out.push('## Checklist', '', 'Questions (answer true or false per session; `guestHelmQ1` is question 1 for the guest-Helm round; `helmLaggy` is the post-session note "the Helm felt laggy"; `pair` is owner or non-owner; merge rooms of one sitting into one session):', '');
  CHECKLIST_QUESTIONS.forEach((q, i) => out.push(`${i + 1}. ${q}`));
  out.push('', 'Blank checklist:', '', '```json', JSON.stringify(blankChecklist(rooms), null, 2), '```');
  return out.join('\n') + '\n';
}
