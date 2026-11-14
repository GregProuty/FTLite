import { applyConsoleCommand, commandResult, legacyCardReason, type MigrationTickInput } from './commands';
import type { SimState } from './state';
import { toggleSeal, cycleDoor } from './doors';

import { chargeBeam } from './weapons';
import { scanStep, systemScanStep } from './science';
import { regenTorpedo, loadTorpedo } from './torpedoes';

export { Dir } from './dir';

/** Step 2: seated players' input, then the tick's door commands once each, ascending: local toggles, remote cycles, airlocks (spec sections 4, 6; Demo-vii amendment 2). */
export function consoleSystem(state: SimState, input: MigrationTickInput): void {
  chargeBeam(state);
  regenTorpedo(state);
  loadTorpedo(state);
  scanStep(state);
  systemScanStep(state);   // the system scan (spec Demo-x-b section 3)
  const resolved = new Set(state.scratch.commandResults.map(r => `${r.id.player}:${r.id.sequence}`));
  for (let pid = 0; pid < state.playerCount; pid++) {
    let consumed = false;
    const entries = [...input.commands, ...input.legacyCardInput].filter(e => e.id.player === pid).sort((a,b) => a.id.sequence-b.id.sequence);
    for (const envelope of entries) {
      if (resolved.has(`${pid}:${envelope.id.sequence}`)) continue;
      if (consumed) { state.scratch.commandResults.push(commandResult(state, envelope, 'invalid-seat')); continue; }
      if (!('kind' in envelope)) {
        const result = applyConsoleCommand(state, envelope); state.scratch.commandResults.push(result);
        if (result.status === 'applied' && (envelope.command.kind === 'stand' || envelope.command.kind === 'tab')) consumed = true;
        continue;
      }
      const reason = legacyCardReason(state, envelope, true);
      state.scratch.commandResults.push(commandResult(state, envelope, reason));

    }
  }
  const asc = (set: Set<number>): number[] => [...set].sort((a, b) => a - b);
  for (const e of asc(state.scratch.doorToggles)) toggleSeal(state, e);          // local Interact and offline console presses
  for (const e of asc(state.scratch.doorCycles)) cycleDoor(state, e);
  for (const a of asc(state.scratch.airlockToggles)) state.airlocks.open[a] = state.airlocks.open[a] ? 0 : 1;
}
