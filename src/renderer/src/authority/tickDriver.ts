import type { MonotonicClock, Scheduler, Unsubscribe } from '../net/contracts';
import { TICK_HZ } from '../sim/tuning';

/** A range keeps its original wall deadlines even when a later epoch is paused. */
interface DeadlineRange { epoch: number; first: number; last: number }
export function createTickDriver(clock: MonotonicClock, scheduler: Scheduler, onTick: (nextTick: number, tickTimeMs: number) => void,
  beforeTick?: (nextTick: number, tickTimeMs: number) => boolean) {
  let sampled = clock.nowMs();
  if (!Number.isFinite(sampled) || sampled < 0) throw new Error('invalid initial clock');
  let epoch = sampled, ordinal = 1, nextTick = 0, debt = 0, pausedAt = sampled;
  let paused = false, disposed = false, pumping = false, cancel: Unsubscribe | null = null;
  const ranges: DeadlineRange[] = [];
  function accrue(): number {
    const now = clock.nowMs();
    // Reject backward/nonfinite readings without moving the accepted boundary.
    if (Number.isFinite(now) && now >= sampled) sampled = now;
    if (!paused) {
      const last = Math.floor((sampled - epoch + 1e-7) * TICK_HZ / 1000);
      if (last >= ordinal) {
        const tail = ranges.at(-1);
        if (tail && tail.epoch === epoch && tail.last + 1 === ordinal) tail.last = last;
        else ranges.push({ epoch, first: ordinal, last });
        debt += last - ordinal + 1; ordinal = last + 1;
      }
    }
    return sampled;
  }
  function schedule(): void {
    cancel?.(); cancel = null;
    if (!disposed) cancel = scheduler.schedule(!paused && debt > 0 ? 0 : 1000 / 120, pump);
  }
  function pump(): void {
    if (disposed || pumping) return;
    pumping = true;
    try {
      accrue();
      for (let count = 0; !disposed && !paused && debt > 0 && count < 120; count++) {
        const range = ranges[0]!, deadline = range.epoch + range.first * 1000 / TICK_HZ;
        if (beforeTick && !beforeTick(nextTick, deadline)) break;
        if (disposed || paused) break;
        range.first++; debt--;
        if (range.first > range.last) ranges.shift();
        onTick(nextTick++, deadline);
      }
    } finally { pumping = false; schedule(); }
  }
  schedule();
  return {
    pump,
    setPaused(value: boolean): void {
      if (disposed) return;
      const boundary = accrue();
      if (value === paused) return;
      if (value) pausedAt = boundary;
      else epoch += boundary - pausedAt;
      paused = value;
      if (!pumping) schedule();
    },
    lagTicks: () => debt,
    resetPausedEpoch(): void {
      if (disposed) return;
      const now = clock.nowMs();
      if (!Number.isFinite(now) || now < 0) throw Error('invalid clock epoch');
      sampled = epoch = pausedAt = now; ordinal = 1; debt = 0; ranges.length = 0; paused = true;
      if (!pumping) schedule();
    },
    dispose(): void { disposed = true; cancel?.(); cancel = null; ranges.length = 0; }
  };
}
