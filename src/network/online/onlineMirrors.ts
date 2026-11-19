import { sha256Hex } from '../../shared/sha256';
import { bytesEqual } from '../../shared/bytes';
import type { RoomServiceClient } from '../session/serviceClient';
import type { RoomCompatibility, SessionCheckpointMetadata } from '../../shared/roomSession';
import { copyCheckpoint, isCheckpointCandidate, type CheckpointCandidate } from '../../shared/sessionCheckpoint';
import type { SessionClock } from '../../shared/sessionLease';
import type { MirrorStatus } from '../../shared/onlineSession';
import { validateMirror, type MirrorStore, type SessionMirror } from './mirrorStore';
import { onlineFault } from './onlineRetry';

export interface OnlineMirrorsDeps {
  service: Pick<RoomServiceClient, 'putCheckpoint' | 'getCheckpoint'>; store: MirrorStore;
  serviceOrigin: string; roomId: string; runId: string; hostGeneration: number; compatibility: RoomCompatibility;
  clock: SessionClock; signal: AbortSignal; validatePayload: (m: SessionMirror) => void; onChange: (s: MirrorStatus) => void;
}
export interface OnlineMirrors {
  adopt(candidate: CheckpointCandidate): Promise<void>; refresh(): Promise<void>; flush(timeoutMs: number): Promise<boolean>; status(): MirrorStatus; dispose(): void;
}
const rank = (a: SessionCheckpointMetadata, b: SessionCheckpointMetadata) => a.hostGeneration - b.hostGeneration || a.checkpointSequence - b.checkpointSequence;
const exactMetadata = (a: SessionCheckpointMetadata, b: SessionCheckpointMetadata) => rank(a, b) === 0 && a.payloadSha256 === b.payloadSha256 && a.capturedTick === b.capturedTick;
const exact = (a: SessionMirror, b: SessionMirror) => exactMetadata(a.metadata, b.metadata) && bytesEqual(a.bytes, b.bytes);
const diagnosis = (e: unknown): MirrorStatus['error'] => {
  const code = (e as { code?: string })?.code;
  return code === 'save-too-large' || code === 'save-invalid' ? code : 'save-unavailable';
};
/** One current upload, one newest pending candidate, and one serialized coalescing disk writer. */
export function createOnlineMirrors(deps: OnlineMirrorsDeps): OnlineMirrors {
  let disposed = false, committed: SessionMirror | null = null, pending: SessionMirror | null = null;
  let receipt: number | null = null, persistent = true, error: MirrorStatus['error'] = null, highWater = 0, captureId = 0;
  let revision = 0, savedRevision = 0, writing: Promise<void> | undefined, uploading: Promise<void> | undefined, refreshing: Promise<void> | undefined, refreshAgain = false, reconciled = false;
  const abort = new AbortController(), changed = new Set<() => void>();
  const active = () => !disposed && !abort.signal.aborted;
  function check() { if (!active()) throw onlineFault('cancelled'); }
  function status(): MirrorStatus { return { committed: committed ? structuredClone(committed.metadata) : null, receivedAgeMs: receipt === null ? null : Math.max(0, deps.clock.nowMs() - receipt), localPending: pending !== null, persistent, error }; }
  function emit() { if (!active()) return; try { deps.onChange(status()); } catch {} for (const callback of [...changed]) callback(); }
  function validate(value: SessionMirror): SessionMirror {
    validateMirror(value, deps.validatePayload);
    const m = value.metadata;
    if (m.roomId !== deps.roomId || m.runId !== deps.runId || m.hostGeneration > deps.hostGeneration || Object.entries(deps.compatibility).some(([k, v]) => m.compatibility[k as keyof RoomCompatibility] !== v)) throw onlineFault('save-invalid');
    return { metadata: structuredClone(m), bytes: new Uint8Array(value.bytes) };
  }
  function observe(m: SessionMirror) { if (m.metadata.hostGeneration === deps.hostGeneration) highWater = Math.max(highWater, m.metadata.checkpointSequence); }
  const loaded = (async () => {
    try {
      const value = await bounded(deps.store.load(), 1000); check();
      if (value === undefined) { persistent = false; error = 'save-unavailable'; emit(); return; }
      if (!value) return;
      if (value.serviceOrigin !== deps.serviceOrigin || value.roomId !== deps.roomId) return;
      const c = value.committed && validate(value.committed), p = value.pending && validate(value.pending);
      committed = c; pending = p; if (c) observe(c); if (p) observe(p); emit();
    } catch (e) { if (!active()) return; persistent = false; error = diagnosis(e); emit(); }
  })();
  function persist(): Promise<void> {
    revision++;
    if (writing) return writing;
    const work = (async () => {
      while (active() && savedRevision < revision) {
        const target = revision;
        try { await deps.store.save({ version: 1, serviceOrigin: deps.serviceOrigin, roomId: deps.roomId, committed, pending }); if (active()) { persistent = true; if (error === 'save-unavailable') error = null; } }
        catch { if (active()) { persistent = false; error = 'save-unavailable'; } }
        savedRevision = target; emit();
      }
    })();
    writing = work; void work.finally(() => { if (writing === work) writing = undefined; }); return work;
  }
  async function bounded<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined, off = () => {};
    try { return await Promise.race([promise, new Promise<undefined>(resolve => {
      const done = () => resolve(undefined); timer = setTimeout(done, Math.max(0, ms)); abort.signal.addEventListener('abort', done, { once: true }); off = () => abort.signal.removeEventListener('abort', done); if (!active()) done();
    })]); } finally { clearTimeout(timer); off(); }
  }
  async function persistBounded(): Promise<void> {
    const work = persist(), target = revision;
    await bounded(work, 1000);
    if (active() && savedRevision < target) { persistent = false; error = 'save-unavailable'; emit(); }
  }
  function accept(value: SessionMirror) {
    const next = validate(value); observe(next);
    if (committed && rank(next.metadata, committed.metadata) < 0) return;
    if (committed && rank(next.metadata, committed.metadata) === 0 && !exact(next, committed)) throw onlineFault('save-invalid');
    committed = next; receipt = deps.clock.nowMs();
    if (pending && exact(pending, next)) pending = null;
    else if (pending && rank(next.metadata, pending.metadata) >= 0) {
      if (captureId === 0 || next.metadata.hostGeneration > pending.metadata.hostGeneration) pending = null;
      else {
        if (!Number.isSafeInteger(highWater + 1)) throw onlineFault('save-invalid');
        pending = { ...pending, metadata: { ...pending.metadata, checkpointSequence: ++highWater } };
      }
    }
    error = persistent ? null : 'save-unavailable'; emit();
  }
  async function fetchLatest() {
    try { const next = await deps.service.getCheckpoint({ signal: abort.signal }); check(); accept(next); await persistBounded(); }
    catch (e) { check(); if ((e as { code?: string })?.code === 'no-checkpoint') return; error = diagnosis(e); emit(); throw onlineFault(error!); }
  }
  function refresh(): Promise<void> {
    if (!active()) return Promise.reject(onlineFault('cancelled'));
    if (refreshing) { refreshAgain = true; return refreshing; }
    const work = (async () => { await loaded; do { refreshAgain = false; check(); await fetchLatest(); reconciled = true; } while (refreshAgain && active()); })();
    refreshing = work; void work.then(() => { if (refreshing === work) refreshing = undefined; }, () => { if (refreshing === work) refreshing = undefined; }); return work;
  }
  function pump() {
    if (uploading || !pending || !active()) return;
    const work = (async () => {
      while (active() && pending) {
        await persistBounded(); if (!active() || !pending) return;
        const candidate: SessionMirror = pending;
        try {
          await deps.service.putCheckpoint(candidate.metadata, candidate.bytes, { signal: abort.signal }); check(); accept(candidate); await persistBounded();
        } catch {
          if (!active()) return;
          try { await refresh(); } catch { /* Preserve the last validated receipt and current pending candidate. */ }
          if (!active()) return;
          if (committed && exact(committed, candidate)) continue;
          error = 'save-unavailable'; emit();
          if (pending === candidate) return;
        }
      }
    })();
    uploading = work; void work.finally(() => { if (uploading === work) uploading = undefined; });
  }
  async function adoptCandidate(candidate: CheckpointCandidate) {
    check(); const byteLength = candidate?.bytes?.length; if (!isCheckpointCandidate(candidate)) throw onlineFault(byteLength > 262144 ? 'save-too-large' : 'save-invalid');
    candidate = copyCheckpoint(candidate);
    await loaded; check(); if (!reconciled) await refresh(); check();
    if (candidate.captureId <= captureId) return;
    if (!Number.isSafeInteger(highWater + 1)) throw onlineFault('save-invalid');
    const next = validate({ metadata: { version: 1, protocolVersion: 2, roomId: deps.roomId, runId: deps.runId, hostGeneration: deps.hostGeneration,
      compatibility: deps.compatibility, checkpointSequence: highWater + 1, capturedTick: candidate.capturedTick, payloadSha256: sha256Hex(candidate.bytes) }, bytes: candidate.bytes });
    captureId = candidate.captureId; observe(next); pending = next; emit();
    await persistBounded(); check(); pump();
  }
  async function adopt(candidate: CheckpointCandidate): Promise<void> {
    try { await adoptCandidate(candidate); }
    catch (e) {
      check(); const code = (e as { code?: string })?.code;
      error = code === 'save-too-large' ? 'save-too-large' : code === 'save-unavailable' ? 'save-unavailable' : 'save-invalid';
      emit(); throw onlineFault(error);
    }
  }
  async function flush(timeoutMs: number): Promise<boolean> {
    if (!active() || !Number.isFinite(timeoutMs) || timeoutMs < 0) return false;
    // Waiting must not retain superseded payloads. All accepted receipts already passed exact-byte hashing.
    const target = pending?.metadata ?? committed?.metadata; if (!target || changed.size >= 64) return false;
    const done = () => !!committed && (rank(committed.metadata, target) > 0 || exactMetadata(committed.metadata, target));
    if (done()) return true;
    pump(); let off = () => {};
    try {
      await bounded(new Promise<void>(resolve => { const callback = () => { if (done() || !active()) resolve(); }; changed.add(callback); off = () => changed.delete(callback); callback(); }), timeoutMs);
      return active() && done();
    } finally { off(); }
  }
  function dispose() { if (disposed) return; disposed = true; abort.abort(); deps.signal.removeEventListener('abort', dispose); for (const callback of [...changed]) callback(); changed.clear(); }
  deps.signal.addEventListener('abort', dispose, { once: true }); if (deps.signal.aborted) dispose();
  return { adopt, refresh, flush, status, dispose };
}
