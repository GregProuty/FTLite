import { describe, expect, it } from 'vitest';
import { requiredRtcChecks, validateRtcReport } from '../scripts/network/rtc-smoke-report';

// Report-contract tests complement the actual native normal/negative CLI runs.
// These objects are not used as RTC or canonical-state evidence.
function report() {
  const details: Record<string, any> = Object.fromEntries(requiredRtcChecks.map(check => [check, 'observed']));
  Object.assign(details, {
    topology: { distinctProcesses: 6, guestAuthorities: 0, liveUtilities: 1 },
    'stall-watchdog-command': { busyMs: 500, hiddenRtcContinued: true },
    'canonical-presentation': { matchedPublications: 32, interpolationSeparate: true },
    'harness-latest-loss-reorder': { dropped: 1, reversedPairs: 1 },
    'harness-base-eviction-refresh': { suppressed: 64, canonicalRecovered: true },
    'cadence-byte-caps': { deltas: 80, maxImageBytes: 131072, maxInputBytes: 4096 },
    'pause-full-checkpoint': { canonicalCheckpointExact: true, sameTickControlFull: true, pauseFromInterpolation: true,
      presentationSnapped: true, sameTickNotificationWithheld: true, notificationFloorsChecked: true },
    'two-peer-isolation-disconnect': { activeInterpolationAtDisconnect: true, frozenAtConfirmedPositions: true },
    'native-channels-route': { nativePcs: 4, selectedRoute: 'direct' },
    'native-resource-cleanup': { productionTimers: 0, productionListeners: 0 },
    'owner-cleanup': { utilities: 3, actualExits: 3, windows: 0, listeners: 0, relayPorts: 0 }
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
  it.each([
    ['stall-watchdog-command', 'busyMs', undefined], ['stall-watchdog-command', 'busyMs', 499.99],
    ['stall-watchdog-command', 'busyMs', NaN], ['canonical-presentation', 'matchedPublications', undefined],
    ['harness-base-eviction-refresh', 'suppressed', 63], ['cadence-byte-caps', 'maxImageBytes', 131073],
    ['cadence-byte-caps', 'maxImageBytes', '12'], ['cadence-byte-caps', 'maxInputBytes', '12'],
    ['cadence-byte-caps', 'maxInputBytes', 4097], ['native-channels-route', 'selectedRoute', 'unknown'],
    ['pause-full-checkpoint', 'sameTickControlFull', false],
    ['pause-full-checkpoint', 'pauseFromInterpolation', false], ['pause-full-checkpoint', 'presentationSnapped', false],
    ['pause-full-checkpoint', 'sameTickNotificationWithheld', false], ['pause-full-checkpoint', 'notificationFloorsChecked', false],
    ['two-peer-isolation-disconnect', 'activeInterpolationAtDisconnect', false], ['two-peer-isolation-disconnect', 'frozenAtConfirmedPositions', false],
    ['native-resource-cleanup', 'productionTimers', 1], ['native-resource-cleanup', 'productionListeners', 1],
    ['owner-cleanup', 'actualExits', 2], ['owner-cleanup', 'windows', 1], ['owner-cleanup', 'relayPorts', 1]
  ])('rejects invalid %s.%s', (check, key, invalid) => {
    const value = report(); value.details[check as string][key as string] = invalid;
    expect(() => validateRtcReport(value)).toThrow('invalid actual RTC evidence');
  });
});
