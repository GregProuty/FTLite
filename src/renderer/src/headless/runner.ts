import type { ShipLayout } from '../sim/ship/schema';
import { deriveLayout } from '../sim/ship/derived';
import { DEFAULT_CHARACTERS } from '../sim/characters';
import { SIM_VERSION, TICK_HZ } from '../sim/tuning';
import { createLoopbackHarness } from '../net/loopback';
import { createAuthority, type Authority1a, type AuthorityDeps, type CrashRecord } from '../authority/authority';
import { createClientRun } from '../clientControl/clientRun';
import { translateTick } from '../clientControl/cardController';
import type { InputFrame } from '../clientControl/inputFrame';

export interface HeadlessInit {
  layout: ShipLayout; playerCount: number; seed: number; contentDigest: string;
  runId?: string; characters?: readonly number[]; unlocked?: readonly string[]; quirk?: number;
  onCrash?(record: CrashRecord): void;
}
/** Synchronous orchestration using the same byte transport, controller and public authority as the app. */
export function createHeadlessRunner(init: HeadlessInit, authorityFactory: (deps: AuthorityDeps) => Authority1a = createAuthority) {
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: init.contentDigest });
  const pair = transport.connectLocal(), owned = Array.from({ length: init.playerCount }, (_, p) => p), runId = init.runId ?? 'headless-1';
  const client = createClientRun(pair.clientLink, owned, { runId, resolveLayout: () => init.layout });
  let now = 0, deadlineOrdinal = 0, frames: readonly InputFrame[] = [], fault: CrashRecord | null = null;
  const authority = authorityFactory({
    contentDigest: init.contentDigest, clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, resolveLayout: () => init.layout,
    onCrash(record) { fault = record; init.onCrash?.(record); },
    beforeControls() { transport.drain(); },
    beforeTick(tick) {
      transport.drain(); const view = client.state();
      if (view) client.send(translateTick(view, client.ui, frames, tick));
      transport.drain();
    }
  });
  authority.attach(pair.authorityLink, owned);
  authority.start({ runId, layoutId: init.layout.id, layoutHash: deriveLayout(init.layout).layoutHash, simVersion: SIM_VERSION, contentDigest: init.contentDigest,
    seed: init.seed, playerCount: init.playerCount, characters: init.characters ?? DEFAULT_CHARACTERS, unlocked: init.unlocked ?? [], quirk: init.quirk });
  transport.drain();
  return {
    advance(nextFrames: readonly InputFrame[]): void {
      frames = nextFrames; now = ++deadlineOrdinal * 1000 / TICK_HZ; authority.pump(); transport.drain();
      if (fault && !init.onCrash) throw new Error(`headless authority fault: ${(fault as CrashRecord).error}`);
    },
    view() { const view = client.state(); if (!view) throw new Error('missing initial publication'); return view; },
    ui: client.ui,
    drain() { transport.drain(); },
    dispose() { authority.dispose(); client.dispose(); pair.host.close('disposed'); pair.client.close('disposed'); }
  };
}
