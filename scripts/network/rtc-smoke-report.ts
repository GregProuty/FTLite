export const requiredRtcChecks = ['early-cleanup', 'topology', 'first-full-ack', 'stall-watchdog-command', 'canonical-presentation',
  'harness-latest-loss-reorder', 'harness-base-eviction-refresh', 'cadence-byte-caps', 'pause-full-checkpoint', 'native-channels-route',
  'two-peer-isolation-disconnect', 'wrong-ticket', 'stale-generation', 'cancel-attempt', 'mid-transfer-close', 'native-resource-cleanup', 'owner-cleanup'] as const;

/** Fail closed even if a successful child forgets one part of its evidence. */
export function validateRtcReport(value: unknown): void {
  const report = value as { electron?: string; checks?: unknown[]; details?: Record<string, any> } | null;
  if (!report || report.electron !== '37.10.3' || !Array.isArray(report.checks) || !report.details
    || requiredRtcChecks.some(check => !report.checks!.includes(check) || !Object.hasOwn(report.details!, check))) throw Error('missing actual RTC evidence');
  const d = report.details;
  const atLeast = (value: unknown, minimum: number) => typeof value === 'number' && Number.isFinite(value) && value >= minimum;
  const bytesWithin = (value: unknown, maximum: number) => atLeast(value, 1) && Number.isSafeInteger(value) && (value as number) <= maximum;
  const statuses = ['early-cleanup', 'wrong-ticket', 'stale-generation', 'cancel-attempt', 'mid-transfer-close'];
  if (statuses.some(check => typeof d[check] !== 'string' || d[check].trim().length === 0)
    || requiredRtcChecks.some(check => !statuses.includes(check) && (!d[check] || typeof d[check] !== 'object' || Array.isArray(d[check]))))
    throw Error('invalid actual RTC evidence');
  const acknowledged = (peer: any) => peer && ['ack', 'full-received'].every(key => atLeast(peer[key], 1) && Number.isSafeInteger(peer[key]));
  if (!acknowledged(d['first-full-ack'].first) || !acknowledged(d['first-full-ack'].second)
    || d.topology.pages !== 3 || d.topology.distinctRenderers !== 3 || d.topology.guestAuthorities !== 0 || d.topology.liveWorkers !== 1
    || !atLeast(d['stall-watchdog-command'].busyMs, 500) || d['stall-watchdog-command'].hostContinued !== true || d['stall-watchdog-command'].otherGuestRtcContinued !== true
    || !atLeast(d['canonical-presentation'].matchedPublications, 32) || d['canonical-presentation'].interpolationSeparate !== true
    || d['harness-latest-loss-reorder'].dropped !== 1 || d['harness-latest-loss-reorder'].reversedPairs !== 1
    || !atLeast(d['harness-base-eviction-refresh'].suppressed, 64) || d['harness-base-eviction-refresh'].canonicalRecovered !== true
    || !atLeast(d['cadence-byte-caps'].deltas, 80) || !bytesWithin(d['cadence-byte-caps'].maxImageBytes, 131072)
    || !bytesWithin(d['cadence-byte-caps'].maxInputBytes, 4096)
    || d['pause-full-checkpoint'].canonicalCheckpointExact !== true || d['pause-full-checkpoint'].sameTickControlFull !== true || d['native-channels-route'].nativePcs !== 4
    || d['pause-full-checkpoint'].pauseFromInterpolation !== true || d['pause-full-checkpoint'].presentationSnapped !== true
    || d['pause-full-checkpoint'].sameTickNotificationWithheld !== true || d['pause-full-checkpoint'].notificationFloorsChecked !== true
    || d['two-peer-isolation-disconnect'].activeInterpolationAtDisconnect !== true || d['two-peer-isolation-disconnect'].frozenAtConfirmedPositions !== true
    || d['native-channels-route'].selectedRoute !== 'direct' || d['native-resource-cleanup'].hostPcsClosed !== 6 || d['native-resource-cleanup'].productionTimers !== 0
    || d['native-resource-cleanup'].productionListeners !== 0 || d['owner-cleanup'].workers !== 3
    || d['owner-cleanup'].workerExits !== 3 || d['owner-cleanup'].ports !== 0 || !atLeast(d['owner-cleanup'].portsCreated, 1) || d['owner-cleanup'].windows !== 0 || d['owner-cleanup'].listeners !== 0 || d['owner-cleanup'].relayPorts !== 0)
    throw Error('invalid actual RTC evidence');
}
