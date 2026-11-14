import type { LegacyInputEnvelope } from '../net/contracts';
import type { Ledger } from './ledger';

/** The one temporary ingress bridge for all as-yet unmigrated press/card families. */
export function admitLegacyCardInput(ledger: Ledger, envelope: LegacyInputEnvelope, tick: number) {
  return ledger.admit(envelope, tick);
}
