// Net-4a (spec 2026-11-19-net-4a-duel-prediction-design §3.1, §3.3, §3.4): the duel client's predicted state P. P is the
// confirmed replica stepped ahead with the real stepDuelTick: every other player's held input carried forward from the
// latest publication, this seat's from its input log. Each publication either verifies P (the hash P recorded at the
// confirmed tick equals the publication's, the inputs P used after it equal the ones the log now maps there, and P stands
// on the target) or restores P from the snapshot and re-steps it to the target. Headless and clock-free: it is inside
// the deterministic module graph (tests/boundary.test.ts); the session times its calls.
import type { CommandEnvelope, DuelCommand, HeldInput } from '../net/contracts';
import type { ResolveLayout } from '../authority/rules';
import type { DuelPublication } from './duelClient';
import { Position, Seated } from '../sim/components';
import { flattenDuel } from '../sim/duel/hash';
import { loadDuelSnapshot, restoreDuelSnapshot } from '../sim/duel/snapshot';
import { disposeDuel, type DuelState } from '../sim/duel/state';
import { stepDuelTick, type DuelInput } from '../sim/duel/step';
import { CREW_SLOT, missileOf, Outcome } from '../sim/tactical/state';
import { HEADING_COUNT } from '../sim/tactical/tuning';
import { hashF64 } from '../../../shared/hash';

/** §3.4: the most ticks P stands past the confirmed tick (500 ms, the old cap on unacknowledged held frames). */
export const PREDICT_MAX_TICKS = 30;
/** §3.4 step 3: within this many ticks of the measured target, P's own tick is the target (one tick of jitter moves no clock). */
export const PREDICT_SLACK_TICKS = 2;
/** P's hash is recorded on ticks a cadence publication can fall on: STATE_CADENCE_TICKS (pinned by tests/duelPredictor.test.ts). */
export const PREDICT_HASH_EVERY = 3;
/** Bounds while publications stop: the log keeps at most 10 s of local ticks, and at most this many commands wait. */
export const PREDICT_LOG_MAX = 600, PREDICT_WAITING_MAX = 64;

export interface LocalInput { heldSequence: number | null; held: HeldInput; commands: readonly CommandEnvelope<DuelCommand>[] }
export interface PredictedBody { x: number; y: number; h: number }
export interface PredictedBodies { ships: PredictedBody[]; missiles: (PredictedBody | null)[]; crew: { x: number; y: number }[] }
export interface PredictionStats {
  verified: number; resimulated: number; resets: number; lead: number; measured: number; standing: number;
  /** Fable #2: the non-reset confirms whose target was not where P stood (the whole predicted world jumps), and the last one's signed size in ticks. */
  retargets: number; lastRetarget: number;
  /** Plan deviation 3: `reseated` when this seat's seated station differs across the re-simulation (a refused or moved sit or stand taken back, §3.7).
   *  Fable #1: `heading`, the own ship's heading change in heading steps (wrap-aware, sub-steps included). */
  correction: { ship: number; heading: number; character: number; reseated: boolean } | null;
}
export interface DuelPredictorOptions { seat: number; contentDigest: string; resolveLayout: ResolveLayout; step?(d: DuelState, input: DuelInput): void }
export interface DuelPredictor {
  confirm(publication: DuelPublication, confirmed: DuelState): 'verified' | 'resimulated' | 'reset';
  tick(entry: LocalInput): boolean;
  state(): DuelState | null;
  active(): boolean;
  before(): PredictedBodies | null;
  hashAt(tick: number): string | null;
  stats(): PredictionStats;
  dispose(): void;
}

type Command = CommandEnvelope<DuelCommand>;
interface Entry { local: number; heldSequence: number | null; held: HeldInput; commands: Command[] }
/** One step P took: the inputs it used (by content) and, on a cadence tick, its hash after. Keyed by the tick it produced. */
interface Step { key: string; hash: string | null }
const neutral = (): HeldInput => ({ moveX: 0, moveY: 0, interactHeld: false });
/** Every HeldInput field (W-4's weaponSel and turretAim included); the check below fails to compile if one is missing. */
const HELD_KEYS = ['moveX', 'moveY', 'interactHeld', 'face', 'aim', 'gunHeld', 'torpHeading', 'weaponSel', 'turretAim', 'throttleHeld', 'rcsX', 'rcsY'] as const;
type MissingHeldKey = Exclude<keyof HeldInput, (typeof HELD_KEYS)[number]>;
const heldKeysComplete: [MissingHeldKey] extends [never] ? true : never = true;
void heldKeysComplete;
/** Fable #1: the unsigned turn between two continuous headings (heading + headingAcc), in heading steps, the short way round. */
export const headingSteps = (a: number, b: number): number => { const d = b - a; return Math.abs(d - Math.round(d / HEADING_COUNT) * HEADING_COUNT); };
export const heldKey = (h: HeldInput): string => HELD_KEYS.map((k) => (h[k] === undefined ? '' : String(h[k]))).join(',');
/** The inputs of one step by content: every player's held input and the commands' ids and bodies (not their stamped tick). */
const inputKey = (held: readonly HeldInput[], commands: readonly Command[]): string =>
  `${held.map(heldKey).join('|')}#${commands.map((c) => `${c.id.player}:${c.id.sequence}:${JSON.stringify(c.command)}`).join(';')}`;
/** P's drawn bodies: ships and missiles (by owner) as {x, y, h} with h = heading + headingAcc in steps, and the crew.
 *  Exported for the session's correction smoothing (§3.8), which compares them across a re-simulation. */
export function predictedBodiesOf(d: DuelState): PredictedBodies {
  const t = d.tactical;
  return { ships: t.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc })),
    missiles: t.ships.map((_, i) => { const m = missileOf(t, i); return m ? { x: m.x, y: m.y, h: m.heading + m.headingAcc } : null; }),
    crew: d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! })) };
}

export function createDuelPredictor(options: DuelPredictorOptions): DuelPredictor {
  const { seat } = options, step = options.step ?? ((d: DuelState, input: DuelInput) => { stepDuelTick(d, input); });
  let p: DuelState | null = null, predicting = false, local = 0, offset = 0, confirmedTick = 0, revision = -1;
  let held: HeldInput[] = [], log: Entry[] = [], waiting: Command[] = [], prior: PredictedBodies | null = null;
  /** Fable #3: the newest held sequence an anchor used and its local tick. An entry kept past its acknowledgement never
   *  anchors again (only a newer sequence does), and an entry leaves the log at or before both it and the confirmed tick. */
  let ackedSequence = 0, ackedLocal = -Infinity;
  /** I1 (§3.5): true once a capped tick has set `prior` to P's own bodies, so the view holds at P and nothing is rebuilt per tick. */
  let holding = false;
  const steps = new Map<number, Step>();
  const stats: PredictionStats = { verified: 0, resimulated: 0, resets: 0, lead: 0, measured: 0, standing: 0, retargets: 0, lastRetarget: 0, correction: null };
  const withOwn = (own: HeldInput): HeldInput[] => held.map((h, k) => (k === seat ? own : h));
  /** One step of P from its tick with `own` in this seat's slot (§3.3); requestedTick is P's tick, as the authority restamps. */
  function advance(own: HeldInput, commands: readonly Command[]): void {
    const d = p!, at = d.interior.tick, input = withOwn(own), stamped = commands.map((c) => ({ ...c, requestedTick: at }));
    prior = predictedBodiesOf(d); holding = false;
    step(d, { held: input, commands: stamped });
    const tick = d.interior.tick;
    steps.set(tick, { key: inputKey(input, stamped), hash: tick % PREDICT_HASH_EVERY === 0 ? hashF64(flattenDuel(d)) : null });
  }
  /** §3.4 step 2: what tick k (the step that produces k) uses: the entry of local tick k − offset; past the newest, its held input and no commands. */
  function planned(k: number): { own: HeldInput; commands: Command[] } {
    const first = log[0], e = first ? log[k - offset - first.local] : undefined;
    if (e && e.local === k - offset) return { own: e.held, commands: e.commands };
    const newest = log[log.length - 1];
    return { own: newest ? newest.held : held[seat] ?? neutral(), commands: [] };
  }
  function reset(publication: DuelPublication, decided: boolean): 'reset' {
    const h = publication.snapshot.header;
    const matches = !!p && h.layoutId === p.interior.layout.id && h.layoutHash === p.interior.derived.layoutHash && h.seed === p.tactical.seed && h.playerCount === p.interior.playerCount && h.crewClass === p.crewClass;
    if (p && matches) restoreDuelSnapshot(p, publication.snapshot, options.contentDigest);
    else { if (p) disposeDuel(p); p = null; p = loadDuelSnapshot(options.resolveLayout(h.layoutId), publication.snapshot, options.contentDigest); }
    log = []; waiting = []; ackedSequence = 0; ackedLocal = -Infinity; steps.clear(); steps.set(publication.tick, { key: '', hash: publication.hash });
    prior = predictedBodiesOf(p); holding = false; revision = publication.controlRevision; offset = publication.tick - local;
    predicting = publication.phase === 'running' && !decided;
    stats.resets++; stats.correction = null; stats.lead = 0; stats.measured = stats.standing = publication.tick;
    return 'reset';
  }
  return {
    confirm(publication, confirmed) {
      const T = publication.tick, h = publication.snapshot.header;
      confirmedTick = T; held = publication.held.map((x) => ({ ...x }));
      const decided = confirmed.tactical.outcome !== Outcome.Running;
      const replaced = !p || h.seed !== p.tactical.seed || h.layoutId !== p.interior.layout.id || h.layoutHash !== p.interior.derived.layoutHash || h.playerCount !== p.interior.playerCount || h.crewClass !== p.crewClass;
      if (replaced || !predicting || decided || publication.phase !== 'running' || publication.controlRevision !== revision) return reset(publication, decided);
      const d = p!;
      // Step 1: the anchor (the newest entry whose held frame the authority has latched) gives the measured offset;
      // with none, or none newer than the last anchor's (Fable #3: an entry kept past its acknowledgement), the last
      // mapping is kept. Commands leave the log only by the command watermark.
      const hw = publication.heldHighWater[seat] ?? 0, cw = publication.commandHighWater[seat] ?? 0;
      let anchored = offset;
      for (let i = log.length - 1; i >= 0; i--) {
        const s = log[i]!.heldSequence;
        if (s !== null && s <= hw) { if (s > ackedSequence) { anchored = T - log[i]!.local; ackedSequence = s; ackedLocal = log[i]!.local; } break; }
      }
      for (const e of log) e.commands = e.commands.filter((c) => c.id.sequence > cw);
      waiting = waiting.filter((c) => c.id.sequence > cw);
      // Step 3: the target: T plus the local ticks after the anchor's; P's own tick when within the slack; clamped.
      const measured = T + Math.max(0, local - (T - anchored)), standing = d.interior.tick;
      let target = Math.abs(standing - measured) <= PREDICT_SLACK_TICKS ? standing : measured;
      target = Math.max(T, Math.min(T + PREDICT_MAX_TICKS, target));
      stats.measured = measured; stats.standing = standing;
      if (target !== standing) { stats.retargets++; stats.lastRetarget = target - standing; }   // Fable #2
      // The mapping from now on: the newest local tick is the target (plan deviation 1). It is the anchor's offset unless
      // the slack or the cap applied; tick() steps entry L to L + offset, so verify and tick() always agree.
      offset = target - local;
      // Plan deviation 2, Fable #3: an entry leaves the log only once acknowledged (at or before the last anchor) and
      // mapped at or before T: P standing ahead of the measured target inside the slack still steps the acknowledged
      // entries after T, so they stay for planned(). Unacknowledged entries the mapping puts at or before T stay with their
      // command lists emptied. Either way their commands not yet run move to the first entry after T, or wait for the next one.
      const cut = T - offset, drop = Math.min(ackedLocal, cut), carried: Command[] = [];
      let n = 0; while (n < log.length && log[n]!.local <= drop) n++;
      for (const e of log.splice(0, n)) carried.push(...e.commands);
      for (const e of log) if (e.local <= cut) { carried.push(...e.commands); e.commands = []; }
      if (carried.length) {
        const next = log.find((e) => e.local > cut);
        if (next) next.commands = [...carried, ...next.commands]; else waiting = [...waiting, ...carried].slice(-PREDICT_WAITING_MAX);
      }
      for (const k of [...steps.keys()]) if (k < T) steps.delete(k);
      // Step 4: verified when P passed through T with the authority's hash, used the planned inputs since, and stands on the target.
      const at = steps.get(T);
      let ok = !!at && at.hash === publication.hash && standing === target;
      for (let k = T + 1; ok && k <= target; k++) { const s = steps.get(k), plan = planned(k); ok = !!s && s.key === inputKey(withOwn(plan.own), plan.commands); }
      if (ok) { stats.verified++; stats.correction = null; stats.lead = standing - T; return 'verified'; }
      // Step 5: restore and step to the target with the planned inputs.
      const ship = d.tactical.ships[CREW_SLOT]!, sx = ship.x, sy = ship.y, sh = ship.heading + ship.headingAcc, eid = d.interior.crew[seat], cx = eid === undefined ? 0 : Position.x[eid]!, cy = eid === undefined ? 0 : Position.y[eid]!, seated = eid === undefined ? -1 : Seated.station[eid]!;
      restoreDuelSnapshot(d, publication.snapshot, options.contentDigest);
      steps.clear(); steps.set(T, { key: '', hash: publication.hash });
      prior = predictedBodiesOf(d); holding = false;
      for (let k = T + 1; k <= target; k++) { const plan = planned(k); advance(plan.own, plan.commands); }
      const after = d.tactical.ships[CREW_SLOT]!, dx = after.x - sx, dy = after.y - sy;
      const ex = eid === undefined ? 0 : Position.x[eid]! - cx, ey = eid === undefined ? 0 : Position.y[eid]! - cy;
      stats.correction = target === standing ? { ship: Math.sqrt(dx * dx + dy * dy), heading: headingSteps(sh, after.heading + after.headingAcc), character: Math.sqrt(ex * ex + ey * ey), reseated: (eid === undefined ? -1 : Seated.station[eid]!) !== seated } : null;
      stats.resimulated++; stats.lead = target - T;
      return 'resimulated';
    },
    tick(input) {
      if (!p || !predicting) return false;
      const e: Entry = { local: ++local, heldSequence: input.heldSequence, held: { ...input.held }, commands: [...waiting.splice(0), ...input.commands] };
      log.push(e);
      if (log.length > PREDICT_LOG_MAX) { const old = log.shift()!; log[0]!.commands = [...old.commands, ...log[0]!.commands]; }
      if (p.interior.tick >= confirmedTick + PREDICT_MAX_TICKS) {
        // I1 (§3.5): P does not move, so the view holds at P: the blend from `prior` would otherwise replay the last step.
        if (!holding) { prior = predictedBodiesOf(p); holding = true; }
        return false;
      }
      advance(e.held, e.commands);
      stats.lead = p.interior.tick - confirmedTick;
      return true;
    },
    state: () => p,
    active: () => !!p && predicting,
    before: () => (p ? prior : null),
    hashAt: (tick) => steps.get(tick)?.hash ?? null,
    stats: () => ({ ...stats, correction: stats.correction ? { ...stats.correction } : null }),
    dispose() { if (p) disposeDuel(p); p = null; predicting = false; log = []; waiting = []; steps.clear(); prior = null; holding = false; }
  };
}
