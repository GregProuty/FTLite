import { shipForCrew } from '../../src/renderer/src/sim/ship/fleet';
/** PASS requires independently observed application evidence, never just exit zero. */
export const ONLINE_APP_ARTIFACTS = ['out/main/index.js','out/preload/index.js','out/renderer/index.html','out/renderer/assets/authorityWorker.js',
  'scripts/network/online-app-smoke.ts','scripts/network/online-app-smoke.cjs','scripts/network/online-app-click.cjs','scripts/network/online-app-observer.ts','scripts/network/page-probe.ts','scripts/network/online-app-probe-preload.cjs','scripts/network/online-app-runtime.ts','scripts/network/online-app-runtime-worker.ts',
  'src/main/index.ts','src/main/appExit.ts','src/network/online/onlineSession.ts','src/network/online/onlineMirrors.ts','src/network/online/mirrorStore.ts','src/network/online/pagePlatform.ts','src/network/online/onlineSector.ts',
  'src/network/host/workerHost.ts','src/renderer/src/app/online/pageSession.ts','src/shared/onlineSession.ts','src/network/session/serviceClient.ts','src/network/utilityHost.ts','src/network/modes/sector.ts'];
export function validateOnlineAppReport(value: unknown): void {
  const r = value as any;
  const fail = () => { throw Error('missing or invalid actual online application evidence'); };
  const positive = (n: unknown) => Number.isSafeInteger(n) && (n as number) > 0;
  const artifacts = ONLINE_APP_ARTIFACTS;
  if (!r || r.failure != null || artifacts.some(k => !/^[a-f0-9]{64}$/.test(r.source?.artifactHashes?.[k] ?? '')) || r.version !== 1 || !/^[a-f0-9]{40}$/.test(r.source?.revision ?? '') || !r.source?.digest
    || typeof r.source.dirty !== 'boolean' || r.runtime?.electron !== '37.10.3' || r.runtime?.workerd !== '1.20261023.1'
    || r.runtime.workerExit !== true || r.runtime.temporaryRemoved !== true || !positive(r.elapsedMs) || r.elapsedMs > 90000) fail();
  if (!Array.isArray(r.processes) || r.processes.length < 3 || new Set(r.processes.map((p: any) => p.pid)).size !== r.processes.length
    || r.processes.some((p: any) => !positive(p.pid) || p.exited !== true || !['host', 'guest', 'filler', 'incompatible'].includes(p.profile)
      || p.termination==='shutdown' && (p.exitCode!==0||!p.cleanup)
      || p.termination==='restart' && !p.resourcesBeforeForcedExit
      || !['shutdown','restart'].includes(p.termination))) fail();
  const c = r.cleanup;
  if (!c || !positive(c.workers) || c.workers !== c.workerExits || ['windows', 'ports', 'listeners', 'peers'].some(k => c[k] !== 0)) fail();
  if (!positive(c.nativePeersObserved) || c.nativePeerCloses + c.nativePeersEndedWithPage !== c.nativePeersObserved || !positive(c.observedPagePorts)) fail();
  if (!Array.isArray(r.scenarios) || r.scenarios.length !== 2) fail();
  // The layout each capacity flies is the production fleet's (the Hound at every crew size since Art-iv-b).
  for (const [index, capacity, seat] of [[0, 2, 1], [1, 4, 2]] as const) {
    const s = r.scenarios[index], layout = shipForCrew(capacity);
    if (!s || s.capacity !== capacity || s.seat !== seat || s.layout !== layout
      || ['acks', 'commands', 'matched', 'fullReceipts'].some(k => !positive(s[k]))
      || ['ownership', 'ackBeforeInput', 'botTakeover', 'pausedReconnect', 'blurNeutral'].some(k => s[k] !== true)
      || !positive(s.generationBefore) || !positive(s.generationAfter) || s.generationAfter <= s.generationBefore) fail();
    if (s.mirrors?.initialCommittedTick !== 0 || s.mirrors?.initialBeforeBootstrap !== true
      || s.mirrors?.periodicCapturedTick !== 300 || s.mirrors?.periodicCommittedTick !== 300 || s.mirrors?.guestReceived !== true) fail();
  }
  if (!['bad-code', 'incompatible', 'cancel-single'].every(k => r.checks?.includes(k))
    || !['loopback-only', 'no-TURN', 'no-rehost', 'no-WAN', 'no-two-machine'].every(k => r.limits?.includes(k))) fail();
}

