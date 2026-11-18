import { expect, it } from 'vitest';
import { validateRoomServiceReport } from '../scripts/network/room-service-report';

// Contract examples only: these are never used as actual runtime evidence.
function report(): any {
  return { electron: '37.10.3', workerd: '1.20261023.1',
    composition: { pairs: 3, hostSeatGeneration: 2, guestSeatGeneration: 1, pairSeatGeneration: 1,
      delayedOffer: true, staleSignalRejected: true, crossSeatRejected: true, staleTicketCloseCode: 1008 },
    order: { hostNativeReady: 1, guestNativeReady: 2, serviceReady: 3, committed: 4, authorityCreated: 5, attached: 6 },
    replacements: [{ seat: 'guest', from: 1, to: 2, closedPcs: 2, ready: true }, { seat: 'host', from: 2, to: 3, closedPcs: 2, ready: true }],
    gameplay: { fullReceipts: 1, validatedAcks: 1, appliedCommands: 1, matchedPublications: 1, runIdentity: true, direct: true },
    cleanup: { pcs: 6, closedPcs: 6, timers: 0, listeners: 0, workers: 1, workerExits: 1, windows: 0, ports: 0, portsCreated: 10 },
    runtime: { sqlite: true, hibernated: true, workerExit: true, electronExit: true, temporaryRemoved: true } };
}
it('admits complete native/service evidence', () => expect(() => validateRoomServiceReport(report())).not.toThrow());
it.each(['composition', 'order', 'replacements', 'gameplay', 'cleanup', 'runtime'])('rejects missing %s evidence', field => {
  const value = report(); delete value[field]; expect(() => validateRoomServiceReport(value)).toThrow();
});
it.each([
  ['composition', 'pairSeatGeneration', 2], ['composition', 'hostSeatGeneration', 1], ['composition', 'pairs', 2],
  ['composition', 'delayedOffer', false], ['composition', 'staleSignalRejected', false], ['composition', 'crossSeatRejected', false],
  ['composition', 'staleTicketCloseCode', 1000], ['order', 'serviceReady', 2], ['order', 'committed', 3],
  ['order', 'authorityCreated', 3], ['order', 'attached', 5], ['gameplay', 'fullReceipts', 0], ['gameplay', 'validatedAcks', 0],
  ['gameplay', 'appliedCommands', 0], ['gameplay', 'matchedPublications', 0], ['gameplay', 'runIdentity', false], ['gameplay', 'direct', false],
  ['cleanup', 'closedPcs', 5], ['cleanup', 'workerExits', 0], ['cleanup', 'windows', 1], ['cleanup', 'ports', 1], ['cleanup', 'portsCreated', 0],
  ['cleanup', 'timers', 1], ['cleanup', 'listeners', 1], ['runtime', 'sqlite', false], ['runtime', 'hibernated', false],
  ['runtime', 'workerExit', false], ['runtime', 'electronExit', false], ['runtime', 'temporaryRemoved', false],
])('rejects incomplete or out-of-order %s.%s evidence', (field, key, invalid) => {
  const value = report(); value[field][key] = invalid; expect(() => validateRoomServiceReport(value)).toThrow();
});
it('requires independent host and guest replacement and actual old PC closure', () => {
  for (const replacement of [[], [report().replacements[0]], [{ seat: 'guest', from: 1, to: 2, closedPcs: 0, ready: true }, report().replacements[1]]]) {
    const value = report(); value.replacements = replacement; expect(() => validateRoomServiceReport(value)).toThrow();
  }
});
it.each([null, {}, [], false, { electron: '37.10.3' }])('rejects malformed evidence %j', value => expect(() => validateRoomServiceReport(value)).toThrow());
