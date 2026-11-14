import type { LegacyInputEnvelope } from '../net/contracts';
import type { SimState } from '../sim/state';
import { legacyCardReason, commandResult } from '../sim/commands';
import type { Ledger } from './ledger';

/** The one temporary ingress bridge for Navigation and Science only. */
export function admitLegacyCardInput(ledger: Ledger, envelope: LegacyInputEnvelope, tick: number, state: SimState) {
  const admission = ledger.admit(envelope, tick);
  if (admission.status !== 'queued') return admission;
  const reason = legacyCardReason(state, envelope);
  if (!reason) return admission;
  const result = commandResult(state, envelope, reason); ledger.finish(result);
  return { status: 'rejected' as const, result };
}
