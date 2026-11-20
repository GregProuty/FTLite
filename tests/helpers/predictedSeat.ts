// Net-4a §6: a predicting seat on the headless online duel. Each step() is one local tick, run right after the
// authority's tick (both at 60 Hz on the world's clock): confirm any new publication (reading the hash P recorded at its
// tick first), then this seat's input for the local tick goes out (a held frame, then its commands) and into the predictor.
// The predictor steps through the real stepDuelTick, wrapped to record what the step tick() takes uses (`used`: the tick
// it produced and this seat's held input in it), so a gate reads the input from P's own step, not from what was sent.
import { createDuelPredictor, heldKey, type DuelPredictor } from '../../src/renderer/src/clientControl/duelPredictor';
import type { CommandEnvelope, DuelCommand, HeldInput } from '../../src/renderer/src/net/contracts';
import type { DuelState } from '../../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../../src/renderer/src/sim/duel/step';
import { resolveCutter } from './duelAuthority';
import type { onlineDuel } from './onlineDuel';

export interface Confirm { result: 'verified' | 'resimulated' | 'reset'; tick: number; hashBefore: string | null; hash: string; standing: number; measured: number; correction: { ship: number; heading: number; character: number; reseated: boolean } | null }
/** One step P took in tick(): the tick it produced and this seat's held input in it (by heldKey). */
export interface Used { tick: number; own: string }
export function predictedSeat(world: ReturnType<typeof onlineDuel>, seat: number, input: (local: number, view: DuelState) => { held: HeldInput; commands: DuelCommand[] }) {
  let used: Used | null = null;
  const s = world.seats[seat]!, predictor: DuelPredictor = createDuelPredictor({ seat, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: resolveCutter,
    step(d, input) { stepDuelTick(d, input); used = { tick: d.interior.tick, own: heldKey(input.held[seat]!) }; } });
  let seen = 0, local = 0;
  const results: Confirm[] = [];
  return { predictor, results, local: () => local,
    step(): { stepped: boolean; confirms: Confirm[]; used: Used | null } {
      const confirms: Confirm[] = [], p = s.client.publication(), c = s.client.state();
      if (p && c && p.publicationSequence !== seen) {
        seen = p.publicationSequence;
        const hashBefore = predictor.hashAt(p.tick), result = predictor.confirm(p, c), st = predictor.stats();
        const r: Confirm = { result, tick: p.tick, hashBefore, hash: p.hash, standing: st.standing, measured: st.measured, correction: st.correction };
        confirms.push(r); results.push(r);
      }
      local++;
      const view = predictor.state() ?? c;
      if (!view || s.client.commandStatus(seat).state === 'waiting-state') return { stepped: false, confirms, used: null };
      const want = input(local, view), heldSequence = s.client.held(seat, want.held), commands: CommandEnvelope<DuelCommand>[] = [];
      for (const command of want.commands) { const id = s.client.command(seat, command); if (id) commands.push({ runId: world.runId, id, requestedTick: 0, command }); }
      used = null;
      const stepped = predictor.tick({ heldSequence, held: heldSequence === null ? { moveX: 0, moveY: 0, interactHeld: false } : want.held, commands });
      return { stepped, confirms, used: stepped ? used : null };
    },
    dispose() { predictor.dispose(); } };
}
