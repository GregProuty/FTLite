interface Session { frame(): void; dispose(): void }
interface Couch extends Session { pause(reason?: string): void; resume(reason?: string): void }
interface Online extends Session { setFocused(value: boolean): void }
/** Factories ensure that an inactive mode owns no input or simulation timers. */
export function createSessionRouter<C extends Couch, O extends Online>(deps: { couch(): C; online(): O; resetInput(): void }) {
  let active: C | O | null = null, mode: 'home' | 'couch' | 'online' = 'home', focused = true, disposed = false;
  function clear() { active?.dispose(); active = null; deps.resetInput(); }
  return {
    get mode() { return mode; },
    selectCouch(): C { if (disposed) throw Error('session-disposed'); if (mode !== 'couch') { clear(); mode = 'couch'; active = deps.couch(); } return active as C; },
    selectOnline(): O { if (disposed) throw Error('session-disposed'); if (mode !== 'online') { clear(); mode = 'online'; active = deps.online(); (active as O).setFocused(focused); } return active as O; },
    home() { if (!disposed) { clear(); mode = 'home'; } },
    pause(reason = 'blur') { focused = false; if (mode === 'online') (active as O)?.setFocused(false); else (active as C)?.pause(reason); },
    resume(reason = 'focus') { focused = true; if (mode === 'online') (active as O)?.setFocused(true); else (active as C)?.resume(reason); },
    frame() { if (!disposed) active?.frame(); },
    dispose() { if (!disposed) { disposed = true; clear(); mode = 'home'; } }
  };
}
