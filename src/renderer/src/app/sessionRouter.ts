interface Session { frame(): void; dispose(): void }
interface Online extends Session { setFocused(value: boolean): void }
/** Factories ensure that an inactive mode owns no input or simulation timers. Single player (the solo duel) owns its own
 *  focus and lifecycle pauses; online only learns focus (main menu spec, 2026-11-16). */
export function createSessionRouter<S extends Session, O extends Online>(deps: { single(): S; online(): O; resetInput(): void }) {
  let active: S | O | null = null, mode: 'home' | 'single' | 'online' = 'home', focused = true, disposed = false;
  function clear() { const was = active; active = null; was?.dispose(); deps.resetInput(); }
  return {
    get mode() { return mode; },
    selectSingle(): S { if (disposed) throw Error('session-disposed'); if (mode !== 'single') { clear(); mode = 'single'; active = deps.single(); } return active as S; },
    selectOnline(): O { if (disposed) throw Error('session-disposed'); if (mode !== 'online') { clear(); mode = 'online'; active = deps.online(); (active as O).setFocused(focused); } return active as O; },
    home() { if (!disposed) { clear(); mode = 'home'; } },
    pause() { focused = false; if (mode === 'online') (active as O)?.setFocused(false); },
    resume() { focused = true; if (mode === 'online') (active as O)?.setFocused(true); },
    frame() { if (!disposed) active?.frame(); },
    dispose() { if (!disposed) { disposed = true; clear(); mode = 'home'; } }
  };
}
