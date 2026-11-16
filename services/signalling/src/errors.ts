import { SERVICE_ERROR_RETRYABLE, type ServiceError, type ServiceErrorCode } from '../../../src/shared/roomSession';

export function serviceError(code: ServiceErrorCode, status: number, retryAfterMs?: number): Response {
  // Runtime callers can be JavaScript or catch clauses. Never reflect an unknown code.
  if (!Object.hasOwn(SERVICE_ERROR_RETRYABLE, code)) { code = 'internal'; status = 500; }
  const error: ServiceError = { code, retryable: SERVICE_ERROR_RETRYABLE[code] };
  if (Number.isSafeInteger(retryAfterMs) && retryAfterMs! >= 0) error.retryAfterMs = retryAfterMs;
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

const STATUS: Partial<Record<ServiceErrorCode, number>> = {
  'invalid-request': 400, unauthorized: 401, forbidden: 403, 'not-found': 404,
  conflict: 409, incompatible: 409, 'invalid-state': 409, 'stale-generation': 409,
  'stale-connection': 409, 'ticket-used': 409, 'ticket-expired': 409,
  'hash-mismatch': 400, 'lease-expired': 409, 'no-checkpoint': 409,
  capacity: 429, 'rate-limited': 429, unavailable: 503, 'turn-unavailable': 503, 'too-large': 413, timeout: 408,
};
class DomainFailure extends Error {
  constructor(readonly code: ServiceErrorCode) { super(code); }
}
export type DomainResult<T> = { ok: true; value: T } | { ok: false; error: ServiceError };
export function failure(code: ServiceErrorCode): never { throw new DomainFailure(code); }
export async function wrapDomain<T>(operation: () => T | Promise<T>): Promise<DomainResult<T>> {
  try { return { ok: true, value: await operation() }; }
  catch (error) {
    if (!(error instanceof DomainFailure)) throw error;
    return { ok: false, error: { code: error.code, retryable: SERVICE_ERROR_RETRYABLE[error.code] } };
  }
}
export function unwrapDomain<T>(result: DomainResult<T>): T {
  if (!result.ok) failure(result.error.code);
  return result.value;
}
export function errorResponse(error: unknown): Response {
  const code = error instanceof Error ? error.message as ServiceErrorCode : 'internal';
  return Object.hasOwn(STATUS, code) ? serviceError(code, STATUS[code]!) : serviceError('unavailable', 503);
}
