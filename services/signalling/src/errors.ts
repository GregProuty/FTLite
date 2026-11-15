import { SERVICE_ERROR_RETRYABLE, type ServiceError, type ServiceErrorCode } from '../../../src/shared/roomSession';

export function serviceError(code: ServiceErrorCode, status: number, retryAfterMs?: number): Response {
  // Runtime callers can be JavaScript or catch clauses. Never reflect an unknown code.
  if (!Object.hasOwn(SERVICE_ERROR_RETRYABLE, code)) { code = 'internal'; status = 500; }
  const error: ServiceError = { code, retryable: SERVICE_ERROR_RETRYABLE[code] };
  if (Number.isSafeInteger(retryAfterMs) && retryAfterMs! >= 0) error.retryAfterMs = retryAfterMs;
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}
