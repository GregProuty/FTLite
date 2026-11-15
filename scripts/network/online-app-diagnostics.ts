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
