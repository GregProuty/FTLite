import { describe, expect, it } from 'vitest';
import { requiredRtcChecks, validateRtcReport } from '../scripts/network/rtc-smoke-report';

// Report-contract tests complement the actual native normal/negative CLI runs.
// These objects are not used as RTC or canonical-state evidence.
function report() {
  const details: Record<string, any> = {
    'early-cleanup': 'two real pre-spawn kill=false/retry=true exits',
    'wrong-ticket': 'native rejected/cancelled; survivor canonical; native resources closed',
    'stale-generation': 'native rejected/cancelled; survivor canonical; native resources closed',
    'cancel-attempt': 'native rejected/cancelled; survivor canonical; native resources closed',
    'mid-transfer-close': 'actual production framing, first fragment sent, native PC closed, survivor canonical'
  };
  Object.assign(details, {
    'first-full-ack': { first: { ack: 1, 'full-received': 1, refresh: 0 }, second: { ack: 1, 'full-received': 1, refresh: 0 } },
    topology: { pages: 3, distinctRenderers: 3, liveWorkers: 1, guestAuthorities: 0 },
    'stall-watchdog-command': { busyMs: 500, hostContinued: true, otherGuestRtcContinued: true },
    'canonical-presentation': { matchedPublications: 32, interpolationSeparate: true },
    'harness-latest-loss-reorder': { dropped: 1, reversedPairs: 1 },
    'harness-base-eviction-refresh': { suppressed: 64, canonicalRecovered: true },
    'cadence-byte-caps': { deltas: 80, maxImageBytes: 131072, maxInputBytes: 4096 },
    'pause-full-checkpoint': { canonicalCheckpointExact: true, sameTickControlFull: true, pauseFromInterpolation: true,
      presentationSnapped: true, sameTickNotificationWithheld: true, notificationFloorsChecked: true },
    'two-peer-isolation-disconnect': { activeInterpolationAtDisconnect: true, frozenAtConfirmedPositions: true },
    'native-channels-route': { nativePcs: 4, selectedRoute: 'direct' },
    'native-resource-cleanup': { hostPcsClosed: 6, productionTimers: 0, productionListeners: 0 },
    'owner-cleanup': { workers: 3, workerExits: 3, windows: 0, listeners: 0, relayPorts: 0, ports: 0, portsCreated: 12 }
  });
  return { electron: '37.10.3', checks: [...requiredRtcChecks], details };
}
describe('actual RTC gate evidence admission', () => {
  it('admits complete bounded evidence', () => expect(() => validateRtcReport(report())).not.toThrow());
  it.each(requiredRtcChecks)('fails closed when %s evidence is missing', check => {
    const value = report(); value.checks = value.checks.filter(item => item !== check);
    expect(() => validateRtcReport(value)).toThrow('missing actual RTC evidence');
    const detailMissing = report(); delete detailMissing.details[check];
    expect(() => validateRtcReport(detailMissing)).toThrow('missing actual RTC evidence');
  });
  it.each([null, {}, { checks: requiredRtcChecks }, { electron: '37.10.3', checks: [] }])('rejects malformed reports: %j', value => {
    expect(() => validateRtcReport(value)).toThrow();
  });
  it.each(['early-cleanup', 'first-full-ack', 'wrong-ticket', 'stale-generation', 'cancel-attempt', 'mid-transfer-close'])('rejects empty/null/false %s details', check => {
    for (const invalid of [null, false, '', ' ', {}]) {
      const value = report(); value.details[check] = invalid;
      expect(() => validateRtcReport(value)).toThrow('invalid actual RTC evidence');
    }
  });
  it.each(['first', 'second'])('requires separate receipt and validated ACK counts for %s', peer => {
    for (const invalid of [undefined, null, false, 0, -1, 1.5]) {
      for (const key of ['ack', 'full-received']) {
        const value = report();
        if (invalid === undefined) delete value.details['first-full-ack'][peer][key];
        else value.details['first-full-ack'][peer][key] = invalid;
        expect(() => validateRtcReport(value)).toThrow('invalid actual RTC evidence');
      }
    }
    const value = report(); delete value.details['first-full-ack'][peer];
    expect(() => validateRtcReport(value)).toThrow('invalid actual RTC evidence');
  });
  it('requires the native closed-PC count even when cleanup has no timers/listeners', () => {
    for (const invalid of [undefined, null, false, 0, 5, 6.5]) {
      const value = report();
      if (invalid === undefined) delete value.details['native-resource-cleanup'].hostPcsClosed;
      else value.details['native-resource-cleanup'].hostPcsClosed = invalid;
      expect(() => validateRtcReport(value)).toThrow('invalid actual RTC evidence');
    }
  });
  it.each([
    ['stall-watchdog-command', 'busyMs', undefined], ['stall-watchdog-command', 'busyMs', 499.99],
    ['stall-watchdog-command', 'busyMs', NaN], ['stall-watchdog-command', 'hostContinued', false], ['stall-watchdog-command', 'otherGuestRtcContinued', false],
    ['topology', 'pages', 2], ['topology', 'distinctRenderers', 2], ['topology', 'liveWorkers', 2], ['canonical-presentation', 'matchedPublications', undefined],
    ['harness-base-eviction-refresh', 'suppressed', 63], ['cadence-byte-caps', 'maxImageBytes', 131073],
    ['cadence-byte-caps', 'maxImageBytes', '12'], ['cadence-byte-caps', 'maxInputBytes', '12'],
    ['cadence-byte-caps', 'maxInputBytes', 4097], ['native-channels-route', 'selectedRoute', 'unknown'],
    ['pause-full-checkpoint', 'sameTickControlFull', false],
    ['pause-full-checkpoint', 'pauseFromInterpolation', false], ['pause-full-checkpoint', 'presentationSnapped', false],
    ['pause-full-checkpoint', 'sameTickNotificationWithheld', false], ['pause-full-checkpoint', 'notificationFloorsChecked', false],
    ['two-peer-isolation-disconnect', 'activeInterpolationAtDisconnect', false], ['two-peer-isolation-disconnect', 'frozenAtConfirmedPositions', false],
    ['native-resource-cleanup', 'productionTimers', 1], ['native-resource-cleanup', 'productionListeners', 1],
    ['owner-cleanup', 'workerExits', 2], ['owner-cleanup', 'ports', 1], ['owner-cleanup', 'portsCreated', 0], ['owner-cleanup', 'windows', 1], ['owner-cleanup', 'relayPorts', 1]
  ])('rejects invalid %s.%s', (check, key, invalid) => {
    const value = report(); value.details[check as string][key as string] = invalid;
    expect(() => validateRtcReport(value)).toThrow('invalid actual RTC evidence');
  });
});
