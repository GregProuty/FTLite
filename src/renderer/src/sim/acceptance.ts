import starter from './ship/starter.json';
import { parseShip } from './ship/schema';
import { createSimState } from './state';
import { step } from './step';
import { botIntent } from './bot';
import { DEFAULT_CHARACTERS } from './characters';
import { telemetryRecord, type TelemetryRecord } from './telemetry';
import { TICK_HZ, ACCEPTANCE_MINUTES } from './tuning';

export interface AcceptanceArgs { players: number; seed: number; minutes: number; characters?: readonly number[] }

/** Headless soak: the bot crew on the starter ship until the tick budget or the run end, with no survival cheat (spec 4-ii section 8). */
export function runAcceptance({ players, seed, minutes, characters = DEFAULT_CHARACTERS }: AcceptanceArgs): TelemetryRecord {
  const state = createSimState(parseShip(starter), players, seed, characters);
  const budget = Math.round(minutes * 60 * TICK_HZ);
  while (state.tick < budget && !state.ended) step(state, state.crew.map((_, pid) => botIntent(state, pid)));
  return telemetryRecord(state, seed);
}

const COLUMNS = ['players', 'seed', 'ended-at', 'reason', 'first-down', 'first-death', 'never-manned', 'longest-idle', 'spawns', 'impacts', 'hits/shots'];

function clock(seconds: number): string {
  const t = Math.round(seconds * 10), whole = Math.floor(t / 10), frac = t % 10, m = Math.floor(whole / 60), s = whole % 60;
  return `${m}:${String(s).padStart(2, '0')}${frac ? `.${frac}` : ''}`;
}
const who = (e: { who: string; seconds: number } | null): string => (e ? `${e.who} ${clock(e.seconds)}` : '-');

function row(r: TelemetryRecord): string[] {
  return [String(r.playerCount), String(r.seed), clock(r.durationSeconds), r.endReason, who(r.firstDown), who(r.firstDeath),
    r.stationsNeverManned.length ? r.stationsNeverManned.join(',') : 'none', r.longestIdleSeconds.join('/'),
    `${r.spawns.fire}/${r.spawns.breach}/${r.spawns.power}/${r.spawns.debris}`, String(r.impacts), `${r.hits}/${r.shots}`];
}

/** One header line and one line per record, columns padded to the widest cell (spec 4-ii section 8). */
export function acceptanceTable(records: readonly TelemetryRecord[]): string {
  const rows = [COLUMNS, ...records.map(row)];
  const widths = COLUMNS.map((_, c) => Math.max(...rows.map((r) => r[c]!.length)));
  return rows.map((r) => r.map((cell, c) => (c === r.length - 1 ? cell : cell.padEnd(widths[c]! + 2))).join('').trimEnd()).join('\n');
}

const PLAYER_COUNTS = [1, 2, 4] as const;
const DEFAULT_SEEDS = [1, 2, 3] as const;
const USAGE = 'usage: npm run acceptance [minutes] [seeds...] [--json]   (defaults: 20 minutes, seeds 1 2 3; players 1, 2 and 4)';

/** Argument parsing and orchestration with injected runner and printer so a test can drive it (spec 4-ii section 8). */
export function runAcceptanceCli(argv: readonly string[], run: (a: AcceptanceArgs) => TelemetryRecord = runAcceptance, print: (line: string) => void = console.log): void {
  const json = argv.includes('--json'), nums = argv.filter((a) => a !== '--json');
  const minutes = nums.length ? Number(nums[0]) : ACCEPTANCE_MINUTES;
  const seeds = nums.length > 1 ? [...new Set(nums.slice(1).map(Number))] : [...DEFAULT_SEEDS];   // no duplicate combinations (spec section 8)
  if (!Number.isFinite(minutes) || minutes <= 0 || seeds.some((s) => !Number.isInteger(s))) { print(USAGE); return; }
  const records: TelemetryRecord[] = [];
  for (const players of PLAYER_COUNTS) for (const seed of seeds) records.push(run({ players, seed, minutes }));
  print(acceptanceTable(records));
  if (json) for (const r of records) print(JSON.stringify(r));
}
