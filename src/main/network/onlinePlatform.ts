import type { BrowserWindow } from 'electron';
import { copyOnlinePortDescriptor, ONLINE_PORT_CHANNEL } from '../../shared/onlineSession';
import { startHostProcess } from './hostProcess';
import { createHostPlatform } from './transportWindow';
import type { OnlinePlatform } from './onlineSession';

/** Own the native window as well as its controller, including death after readiness. */
export function createOnlinePlatform(win: BrowserWindow): OnlinePlatform {
  const native = createHostPlatform();
  let lastEpoch = 0;
  return {
    async createTransport(identity) {
      const raw = native.createTransport(identity), exits = new Set<() => void>();
      let stopped = false, ready = false, exitWasLost = false, offReady = () => {}, offExit = () => {};
      let resolve!: () => void, reject!: (reason: Error) => void;
      const starting = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
      const timer = setTimeout(() => stop(true), 5000);
      function stop(lost: boolean): void {
        if (stopped) return; stopped = true; exitWasLost = lost; clearTimeout(timer); offReady(); offExit();
        try { raw.dispose(); } catch { /* release observers even after native teardown failure */ }
        if (!ready) reject(Error('transport-lost'));
        if (lost) for (const cb of [...exits]) { try { cb(); } catch {} }
        exits.clear();
      }
      offExit = raw.onExit(() => stop(true));
      offReady = raw.onReady(() => {
        if (stopped || ready) return; ready = true; clearTimeout(timer); offReady(); resolve();
      });
      if (ready || stopped) offReady();
      if (stopped) offExit();
      if (!stopped) { try { void raw.load().catch(() => stop(true)); } catch { stop(true); } }
      await starting;
      if (stopped) throw Error('transport-lost');
      return {
        controller: raw.controller,
        onExit(cb) {
          if (stopped) { if (exitWasLost) cb(); return () => {}; }
          if (exits.size >= 64) throw Error('transport-lost');
          exits.add(cb); return () => { exits.delete(cb); };
        },
        async dispose() { stop(false); }
      };
    },
    startHost: (identity, signal) => startHostProcess({ ...identity, signal }, native),
    channel: () => native.createChannel(),
    publishPort(descriptor, port) {
      try {
        const copy = copyOnlinePortDescriptor(descriptor);
        if (copy.epoch <= lastEpoch || win.isDestroyed() || win.webContents.isDestroyed() || !win.isVisible()) throw Error('invalid-port');
        win.webContents.mainFrame.postMessage(ONLINE_PORT_CHANNEL, { version: 1, descriptor: copy }, [port]);
        lastEpoch = copy.epoch;
      } catch {
        try { port.close(); } catch {} throw Error('invalid-port');
      }
    },
    onVisibleGone(callback) {
      let done = false;
      const contents = win.webContents;
      const off = () => { win.off('closed', gone); contents.off('render-process-gone', gone); };
      const gone = () => { if (!done) { done = true; off(); callback(); } };
      win.on('closed', gone); win.webContents.on('render-process-gone', gone);
      if (win.isDestroyed() || win.webContents.isDestroyed()) gone();
      return off;
    }
  };
}
