import { createPortLink } from '../../src/network/portLink';
import { createClientRun, type ClientRun } from '../../src/renderer/src/clientControl/clientRun';
import { translateTick, pauseActions } from '../../src/renderer/src/clientControl/cardController';
import { NEUTRAL_FRAME } from '../../src/renderer/src/clientControl/inputFrame';
import { Position } from '../../src/renderer/src/sim/components';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import starter from '../../src/renderer/src/sim/ship/starter.json';
import type { Link } from '../../src/renderer/src/net/contracts';

declare global { interface Window { hostSmokeReport(value: unknown): void; hostSmoke: typeof api } }
let client: ClientRun | undefined, link: Link | undefined, ready = false, lastCallback = 0, largestGap = 0;
let producer: ReturnType<typeof setInterval> | undefined;
const report = (value: unknown) => window.hostSmokeReport(value);
window.addEventListener('error', event => report({ kind: 'page-error', message: event.message }));
window.addEventListener('unhandledrejection', event => report({ kind: 'page-error', message: String(event.reason?.stack ?? event.reason) }));
function view() { const state = client?.state(); if (!state) throw Error('producer has no validated full state'); return state; }
function send(moveX = 0, confirmPresses = 0) {
  const state = view();
  const actions = translateTick(state, client!.ui, [{ ...NEUTRAL_FRAME, moveX, confirmPresses }], state.tick, [0], client!.commandBudget);
  client!.send(actions); return actions;
}
function stopProducer() { clearInterval(producer); producer = undefined; }
const api = {
  status() {
    return { ready, tick: client?.state()?.tick, phase: client?.publication()?.phase, largestGap,
      command: client?.ui.players[0]?.nextSequence, held: client?.ui.players[0]?.heldSequence,
      commandStatus: client?.commandStatus(0), x: client?.state() ? Position.x[view().crew[0]!] : null,
      results: client?.takeResults() ?? [] };
  },
  resume() { const state = view(); const actions = pauseActions(client!.ui, 0, state.tick, false, client!.commandBudget); client!.send(actions); return actions.commands[0]; },
  primeHeld() { stopProducer(); return send(1).held[0]; },
  stall() {
    stopProducer();
    // Translate at the last observed authority tick, then deliver the original
    // envelopes after a real visible-renderer busy loop. Never rewrite sender ticks.
    const state = view(), actions = translateTick(state, client!.ui,
      [{ ...NEUTRAL_FRAME, moveX: -1, confirmPresses: 1 }], state.tick, [0], client!.commandBudget);
    if (actions.commands.length !== 1 || actions.commands[0]!.command.kind !== 'vote') throw Error('fixture failed to translate a real semantic vote');
    const start = performance.now();
    report({ kind: 'stall-start', tick: state.tick, command: actions.commands[0], held: actions.held[0] });
    while (performance.now() - start < 500) { /* deliberately stall only this visible renderer */ }
    client!.send(actions);
    report({ kind: 'stall-end', milliseconds: performance.now() - start, observedTick: view().tick });
    return { requestedTick: actions.commands[0]!.requestedTick, sequence: actions.commands[0]!.id.sequence };
  },
  neutralProducer() {
    stopProducer(); send(); lastCallback = performance.now();
    producer = setInterval(() => {
      const now = performance.now(); largestGap = Math.max(largestGap, now - lastCallback); lastCallback = now; send();
    }, 1000 / 60);
  },
  detach() { stopProducer(); ready = false; client?.dispose(); client = undefined; link?.close('smoke-detach'); link = undefined; },
  injectPageFailure() { setTimeout(() => { throw Error('injected host smoke page exception'); }); }
};
window.hostSmoke = api;
window.addEventListener('message', event => {
  if (event.source !== window || event.data?.kind !== 'host-smoke-port' || event.ports.length !== 1) return;
  api.detach();
  const port = event.ports[0]!;
  link = createPortLink({ postMessage: value => port.postMessage(value), start: () => port.start(), close: () => port.close(),
    onMessage(cb) { const listener = (e: MessageEvent) => cb(e.data); port.addEventListener('message', listener); return () => port.removeEventListener('message', listener); },
    onClose(cb) { const listener = () => cb(); port.addEventListener('messageerror', listener); return () => port.removeEventListener('messageerror', listener); }
  }, 'host-human');
  client = createClientRun(link, [0], { runId: 'host-smoke', contentDigest: __GAMEPLAY_CONTENT_DIGEST__,
    resolveLayout: () => parseShip(starter), admissionPolicy: 'receive-time' });
  link.onMessage(() => {
    if (client?.state()) ready = true;
    const now = performance.now(); if (lastCallback) largestGap = Math.max(largestGap, now - lastCallback); lastCallback = now;
  });
});
