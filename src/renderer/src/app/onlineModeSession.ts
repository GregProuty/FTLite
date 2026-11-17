// The renderer's online session wrapper (H-2 spec §3): the router builds it before any port exists, and it builds the
// mode's own session on the first attach, from the descriptor's compatibility: the online duel or today's sector
// session. A later descriptor of another mode replaces the inner session (and its frozen view). The latest status,
// focus and input-block values are replayed into each new inner session.
import type { OnlinePortDescriptor, OnlineStatus } from '../../../shared/onlineSession';

export interface InnerOnlineSession {
  attach(descriptor: OnlinePortDescriptor, port: MessagePort): void;
  setStatus(status: OnlineStatus): void; setFocused(value: boolean): void; setInputBlocked(value: boolean): void;
  pause(): void; frame(): void; dispose(): void;
}
export function createOnlineModeSession(factories: { duel(): InnerOnlineSession; sector(): InnerOnlineSession }) {
  let inner: InnerOnlineSession | null = null, mode: string | null = null, status: OnlineStatus | null = null;
  let focused = true, blocked = false, disposed = false;
  return {
    get mode() { return mode; },
    attach(descriptor: OnlinePortDescriptor, port: MessagePort): void {
      if (disposed) { port.close(); return; }
      const next = descriptor.compatibility.modeId;
      if (next !== mode || !inner) {
        inner?.dispose(); inner = null; mode = null;
        if (next !== 'duel' && next !== 'sector') { port.close(); return; }
        inner = next === 'duel' ? factories.duel() : factories.sector(); mode = next;
        if (status) inner.setStatus(status);
        inner.setFocused(focused); inner.setInputBlocked(blocked);
      }
      inner.attach(descriptor, port);
    },
    setStatus(next: OnlineStatus): void { status = next; inner?.setStatus(next); },
    setFocused(value: boolean): void { focused = value; inner?.setFocused(value); },
    setInputBlocked(value: boolean): void { blocked = value; inner?.setInputBlocked(value); },
    pause(): void { inner?.pause(); },
    frame(): void { inner?.frame(); },
    dispose(): void { if (disposed) return; disposed = true; inner?.dispose(); inner = null; mode = null; }
  };
}
