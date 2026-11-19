/** Admission boundary for the native gate's independently observed evidence. */
export function validateRoomServiceReport(value: unknown): void {
  const r = value as Record<string, any> | null;
  const fail = () => { throw Error('missing or invalid actual room-service evidence'); };
  if (!r || r.electron !== '37.10.3' || r.workerd !== '1.20261023.1'
    || ['composition', 'order', 'gameplay', 'cleanup', 'runtime'].some(k => !r[k] || typeof r[k] !== 'object' || Array.isArray(r[k]))) fail();
  const { composition: c, order: o, gameplay: g, cleanup: x, runtime: t } = r!;
  const positive = (n: unknown) => Number.isSafeInteger(n) && (n as number) > 0;
  if (c.pairs !== 3 || c.hostSeatGeneration !== 2 || c.guestSeatGeneration !== 1 || c.pairSeatGeneration !== 1
    || c.delayedOffer !== true || c.staleSignalRejected !== true || c.crossSeatRejected !== true || c.staleTicketCloseCode !== 1008) fail();
  if (!['hostNativeReady', 'guestNativeReady', 'serviceReady', 'committed', 'authorityCreated', 'attached'].every(k => positive(o[k]))
    || Math.max(o.hostNativeReady, o.guestNativeReady) >= o.serviceReady || o.serviceReady >= o.committed
    || o.committed >= o.authorityCreated || o.authorityCreated >= o.attached) fail();
  if (!Array.isArray(r!.replacements) || r!.replacements.length !== 2) fail();
  for (const [index, seat, from, to] of [[0, 'guest', 1, 2], [1, 'host', 2, 3]] as const) {
    const p = r!.replacements[index];
    if (!p || p.seat !== seat || p.from !== from || p.to !== to || p.closedPcs !== 2 || p.ready !== true) fail();
  }
  if (!['fullReceipts', 'validatedAcks', 'appliedCommands', 'matchedPublications'].every(k => positive(g[k]))
    || g.runIdentity !== true || g.direct !== true || x.pcs !== 6 || x.closedPcs !== 6 || x.workers !== 1 || x.workerExits !== 1 || !positive(x.portsCreated)
    || ['timers', 'listeners', 'windows', 'ports'].some(k => x[k] !== 0)
    || ['sqlite', 'hibernated', 'workerExit', 'electronExit', 'temporaryRemoved'].some(k => t[k] !== true)) fail();
}
