/** Diagnostics may identify a fixed failure category, never an exception payload. */
const failures = new Set([
  'injected guest process death', 'injected transport death', 'launcher timeout',
  'application IPC disconnected', 'application process error', 'application exited',
  'app-driver-command-failed', 'missing or invalid actual online application evidence',
]);
export function onlineAppFailureCode(error: unknown): string {
  return error instanceof Error && failures.has(error.message) ? error.message : 'online-application-gate-failed';
}
export function onlineAppStderrDiagnostic(profile: unknown) {
  return { code: 'APP_NATIVE_STDERR', role: typeof profile === 'string' && ['host','guest','filler','incompatible'].includes(profile) ? profile : 'unknown' };
}
export function onlineAppWaitDiagnostic(label: unknown, actual: unknown) {
  const phases = ['idle','creating','joining','lobby','connecting','syncing','running','paused','reconnecting','ended','error'];
  const [role, expected, extra] = typeof label === 'string' ? label.split(' ') : [];
  const known = !extra && ['host','guest','filler','incompatible'].includes(role ?? '') && phases.includes(expected ?? '');
  return { code: 'APP_WAIT_TIMEOUT', role: known ? role : 'unknown', expected: known ? expected : 'unknown',
    actual: typeof actual === 'string' && phases.includes(actual) ? actual : 'unknown' };
}
