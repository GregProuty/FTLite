import { RoomServiceClientError, type RoomServiceClient } from '../../network/session/serviceClient';
import { validateRoomConnectionIdentity, validateServiceError, validateTurnCredentials, type RoomConnectionIdentity, type TurnCredentials } from '../../shared/roomSession';
import type { SessionClock } from '../../shared/sessionLease';
import { onlineFault } from './onlineRetry';

export type IceOwner = RoomConnectionIdentity;
export interface OnlineIce {
  get(owner: IceOwner, signal: AbortSignal): Promise<TurnCredentials>;
  invalidate(): void;
  dispose(): void;
}
export const sameIceOwner = (a: IceOwner, b: IceOwner): boolean => a.roomId === b.roomId && a.hostGeneration === b.hostGeneration
  && a.seatId === b.seatId && a.seatGeneration === b.seatGeneration && a.connectionId === b.connectionId;
const limited = (ms: number) => new RoomServiceClientError({ code: 'rate-limited', retryable: true, retryAfterMs: Math.ceil(ms) });

/** One bounded acquisition and private cache per authenticated service owner. */
export function createOnlineIce({ service, clock, mode }: { service: Pick<RoomServiceClient, 'getTurn'>; clock: SessionClock; mode: 'loopback' | 'turn' }): OnlineIce {
  let disposed = false, owner: IceOwner | undefined, cached: TurnCredentials | undefined, nextRequest = -Infinity;
  let generation = new AbortController();
  let pending: { signal: AbortSignal; value: Promise<TurnCredentials> } | undefined;
  function invalidate() { cached = undefined; owner = undefined; generation.abort(onlineFault('stale-connection')); generation = new AbortController(); }
  function wait(value: Promise<TurnCredentials>, signal: AbortSignal, binding: AbortSignal): Promise<TurnCredentials> {
    return new Promise((resolve, reject) => {
      const clean = () => { signal.removeEventListener('abort', cancel); binding.removeEventListener('abort', stale); };
      const cancel = () => { clean(); reject(onlineFault('cancelled')); };
      const stale = () => { clean(); reject(onlineFault('stale-connection')); };
      signal.addEventListener('abort', cancel, { once: true }); binding.addEventListener('abort', stale, { once: true });
      value.then(result => { clean(); if (signal.aborted) cancel(); else if (binding.aborted) stale(); else resolve(structuredClone(result)); }, error => { clean(); reject(error); });
    });
  }
  return {
    async get(requested, signal) {
      if (disposed || signal.aborted) throw onlineFault('cancelled');
      if (!validateRoomConnectionIdentity(requested)) throw onlineFault('invalid-state');
      if (owner && !sameIceOwner(owner, requested)) invalidate();
      owner = structuredClone(requested);
      if (mode === 'loopback') return { iceServers: [], expiresAtEpochMs: clock.epochMs() + 3600000 };
      if (cached && cached.expiresAtEpochMs - clock.epochMs() > 300000) return structuredClone(cached);
      cached = undefined;
      const binding = generation.signal;
      if (pending?.signal === binding) return wait(pending.value, signal, binding);
      if (clock.nowMs() < nextRequest) throw limited(nextRequest - clock.nowMs());
      if (pending) throw new RoomServiceClientError({ code: 'capacity', retryable: true });
      nextRequest = clock.nowMs() + 60000;
      const work = { signal: binding, value: undefined as unknown as Promise<TurnCredentials> };
      pending = work;
      // Invoke synchronously against the authenticated service connection captured by this call.
      try { work.value = Promise.resolve(service.getTurn()); } catch (error) { work.value = Promise.reject(error); }
      work.value = work.value.then(value => {
        if (disposed || binding.aborted) throw onlineFault('stale-connection');
        if (!validateTurnCredentials(value) || value.expiresAtEpochMs - clock.epochMs() <= 300000) throw new RoomServiceClientError({ code: 'turn-unavailable', retryable: true });
        cached = structuredClone(value); return cached;
      }).catch(error => {
        const safe = validateServiceError({ code: error?.code, retryable: error?.retryable, ...(error?.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs }) })
          ? new RoomServiceClientError(error) : new RoomServiceClientError({ code: 'turn-unavailable', retryable: true });
        nextRequest = Math.max(nextRequest, clock.nowMs() + (safe.retryAfterMs ?? 0));
        if (binding.aborted) throw onlineFault('stale-connection');
        throw new RoomServiceClientError({ code: safe.code, retryable: safe.retryable, ...(safe.retryable ? { retryAfterMs: Math.ceil(nextRequest - clock.nowMs()) } : {}) });
      }).finally(() => { if (pending === work) pending = undefined; });
      return wait(work.value, signal, binding);
    },
    invalidate,
    dispose() { if (disposed) return; disposed = true; invalidate(); }
  };
}
