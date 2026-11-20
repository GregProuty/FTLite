// The duel playtest record (H-2 spec §8): one line per decided round, written by each renderer through the preload's
// recordDuel and appended by main to userData/playtest/duel-YYYY-MM-DD.jsonl. Strict and size-capped: it never carries a
// token, code, address or candidate. `round`, `seed` and `helmPlayer` come from the replica's hashed round state, so a
// client that reconnected mid-round still labels its round. The latency figures are filled in here; H-2b reports them.
import { z } from 'zod';
import { MISSILE_LOSSES, TERMINAL_CAUSES, type DuelRoundRecord } from '../sim/duel/summary';

export const DUEL_RECORD_MAX_BYTES = 8192;
/** A day's log stops growing here, so a renderer bug looping on round events cannot fill the disk or the browser's storage. */
export const DUEL_RECORD_DAY_MAX_BYTES = 16 * 1024 * 1024;
/** The local date a record is filed under, YYYY-MM-DD (Electron's file name, the browser's duelRecords key). Typed by
 *  shape, not as the platform date class, because this module is in the deterministic module graph (tests/boundary). */
export function duelRecordDay(now: { getFullYear(): number; getMonth(): number; getDate(): number }): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
/** The largest millisecond figure a record holds; the helpers drop larger samples so the record is never lost. */
export const DUEL_RECORD_MAX_MS = 3_600_000;
/** count, median, 95th percentile and maximum, in milliseconds (null with no samples). */
export interface LatencyFigure { count: number; median: number | null; p95: number | null; max: number | null }
export interface DuelPlaytestRecord {
  version: 1; session: 'solo' | 'online'; role: 'host' | 'guest'; transport: 'loopback' | 'lan' | 'internet' | null;
  /** `seat` and `helmPlayer` are player ids 0..3 (Sci-2 spec §4.3). */
  seat: number; helmPlayer: number; seed: number; round: number; startedAtIso: string;
  summary: DuelRoundRecord;
  latency: { held: LatencyFigure; command: LatencyFigure; rttMs: number | null };
  /** Publication inter-arrival: the standard deviation against the expected 50 ms, over `count` gaps. */
  jitter: { count: number; stdMs: number | null };
  disconnects: number; pauses: number;
  /** Net-4a §3.10: the round's prediction: the lead (ticks), the verified share, the own-ship corrections (u) and the re-simulation p99. */
  prediction?: { lead: LatencyFigure; verifiedShare: number | null; correction: LatencyFigure; resimP99Ms: number | null };
}

const uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), ms = z.number().finite().min(0).max(DUEL_RECORD_MAX_MS);
const pair = z.tuple([uint, uint]);
const crew = z.array(uint).min(1).max(4);   // Valkyrn spec §4.4: Single player's crew of one; Sci-2 spec §4.3: one per player, n long
const causes = z.array(z.enum(TERMINAL_CAUSES)).max(TERMINAL_CAUSES.length);
const losses = z.object(Object.fromEntries(MISSILE_LOSSES.map((k) => [k, uint])) as Record<(typeof MISSILE_LOSSES)[number], typeof uint>).strict();
const figure = z.object({ count: uint, median: ms.nullable(), p95: ms.nullable(), max: ms.nullable() }).strict();
const summary = z.object({
  outcome: z.number().int().min(1).max(3), ticks: uint, terminal: z.tuple([causes, causes]),
  laserReleases: pair, laserHits: pair, missilesLaunched: pair, missileHits: pair, repairsFinished: crew, laserMisses: pair, layersStripped: pair,
  missileLosses: z.tuple([losses, losses]), planetContacts: pair, asteroidContacts: pair, baits: uint, consoleSwaps: uint,
  helmEmptyTicks: uint, weaponsEmptyTicks: uint, enemyInArcTicks: uint, weaponsIdleTicks: uint, repairsStarted: crew, walkingTicks: crew, repairingTicks: crew,
  round: uint, seed: z.number().int().min(0).max(0xffffffff), baseTick: uint
}).strict();
export const duelRecordSchema = z.object({
  version: z.literal(1), session: z.enum(['solo', 'online']), role: z.enum(['host', 'guest']), transport: z.enum(['loopback', 'lan', 'internet']).nullable(),
  seat: z.number().int().min(0).max(3), helmPlayer: z.number().int().min(0).max(3), seed: z.number().int().min(0).max(0xffffffff), round: uint,
  startedAtIso: z.string().max(32).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/),
  summary, latency: z.object({ held: figure, command: figure, rttMs: ms.nullable() }).strict(),
  jitter: z.object({ count: uint, stdMs: ms.nullable() }).strict(), disconnects: uint, pauses: uint,
  prediction: z.object({ lead: figure, verifiedShare: z.number().min(0).max(1).nullable(), correction: figure, resimP99Ms: ms.nullable() }).strict().optional()
}).strict();

/** The record, validated and within its byte cap; throws otherwise. */
export function validateDuelRecord(value: unknown): DuelPlaytestRecord {
  const record = duelRecordSchema.parse(value) as DuelPlaytestRecord;
  if (record.round !== record.summary.round || record.seed !== record.summary.seed) throw new Error('duel record round does not match its summary');
  if (new TextEncoder().encode(JSON.stringify(record)).byteLength > DUEL_RECORD_MAX_BYTES) throw new Error('duel record exceeds its size cap');
  return record;
}

/** As latencyFigure, rounded to 0.001: the corrections are fractions of a unit. */
export function fineFigure(samples: readonly number[]): LatencyFigure {
  const s = samples.filter((v) => v >= 0 && v <= DUEL_RECORD_MAX_MS).sort((a, b) => a - b);
  if (!s.length) return { count: 0, median: null, p95: null, max: null };
  const rank = (q: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]!, round = (v: number) => Math.round(v * 1000) / 1000;
  return { count: s.length, median: round(rank(0.5)), p95: round(rank(0.95)), max: round(s[s.length - 1]!) };
}

/** count, median, p95 and max of a list of milliseconds (nearest-rank percentiles); samples outside 0 to the cap are dropped. */
export function latencyFigure(samples: readonly number[]): LatencyFigure {
  const s = samples.filter((v) => v >= 0 && v <= DUEL_RECORD_MAX_MS).sort((a, b) => a - b);
  if (!s.length) return { count: 0, median: null, p95: null, max: null };
  const rank = (q: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]!;
  const round = (v: number) => Math.round(v * 10) / 10;
  return { count: s.length, median: round(rank(0.5)), p95: round(rank(0.95)), max: round(s[s.length - 1]!) };
}
/** Single player's record of a decided round (H-2 spec §8, Helm §11a): the same record with session 'solo'. One machine
 *  and no link: role 'host', no transport, no latency samples, no jitter and no disconnects. */
export function soloDuelRecord(summary: DuelRoundRecord, at: { seat: number; helmPlayer: number; startedAtIso: string; pauses: number }): DuelPlaytestRecord {
  return { version: 1, session: 'solo', role: 'host', transport: null, seat: at.seat, helmPlayer: at.helmPlayer, seed: summary.seed, round: summary.round,
    startedAtIso: at.startedAtIso, summary, latency: { held: latencyFigure([]), command: latencyFigure([]), rttMs: null }, jitter: arrivalJitter([]), disconnects: 0, pauses: at.pauses };
}
/** The standard deviation of publication inter-arrival gaps against the expected 50 ms; gaps outside 0 to the cap are dropped. */
export function arrivalJitter(samples: readonly number[]): { count: number; stdMs: number | null } {
  const gaps = samples.filter((g) => g >= 0 && g <= DUEL_RECORD_MAX_MS);
  if (!gaps.length) return { count: 0, stdMs: null };
  let sum = 0; for (const g of gaps) sum += (g - 50) * (g - 50);
  return { count: gaps.length, stdMs: Math.round(Math.sqrt(sum / gaps.length) * 10) / 10 };
}
