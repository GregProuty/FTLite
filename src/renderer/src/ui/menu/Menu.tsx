// The menu region (React UI spec §5): the full-screen overlay, or exactly the strip over a game the session has shown.
// The root carries data-testid="session-menu" (the smokes measure it) and, while it is the strip, writes its height
// into layout.stripHeight so main.ts moves the canvas below it; 0 when the strip goes.
import { useLayoutEffect, useMemo, useRef } from 'react';
import { crtScale } from '../../render/crt';
import { useActions, useUi } from '../context';
import { isPlaying, menuMessage } from '../menuState';
import { Home } from './Home';
import { HostForm } from './HostForm';
import { JoinForm } from './JoinForm';
import { Multiplayer } from './Multiplayer';
import { SessionPage } from './SessionPage';
import { Settings } from './Settings';
import { ShipPicker } from './ShipPicker';
import { BUTTON, MENU_CLASS, menuCss, PANEL_OVERLAY, PANEL_STRIP, ROOT_OVERLAY, ROOT_STRIP, SCREEN_CLASS, VERSION } from './styles';
import { versionText } from '../version';

export function Menu() {
  const menu = useUi((s) => s.menu), online = useUi((s) => s.online), actions = useActions();
  const ref = useRef<HTMLDivElement>(null), playing = isPlaying(menu);
  useLayoutEffect(() => {
    const el = ref.current; if (!playing || !el) return;
    const write = (): void => actions.setStripHeight(el.offsetHeight);
    write();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(write);   // a wrapped strip (status, roster) grows without a window resize
    observer?.observe(el);
    return () => { observer?.disconnect(); actions.setStripHeight(0); };
  }, [playing, actions]);
  // The duel owns the screen. The root stays, empty and display:none as the DOM menu's did, because the smokes measure it.
  if (menu.page === 'single') return <div data-testid="session-menu" aria-hidden="true" data-layout="hidden" style={{ display: 'none' }} />;
  const page = menu.page;
  return (
    <div ref={ref} data-testid="session-menu" aria-label="FTLite session menu" data-layout={playing ? 'strip' : 'overlay'} className={MENU_CLASS} style={playing ? ROOT_STRIP : ROOT_OVERLAY}>
      <MenuStyle />
      <section className={playing ? undefined : SCREEN_CLASS} style={playing ? PANEL_STRIP : PANEL_OVERLAY}>
        {!playing && <><h1>FTLite</h1><p>Crew together. Keep the ship flying.</p></>}
        {(page === 'multiplayer' || page === 'settings' || page === 'ship') && <h2 data-testid="page-title">{page === 'multiplayer' ? 'Multiplayer' : page === 'ship' ? 'Single player' : 'Settings'}</h2>}
        <p data-testid="status" role="status" aria-live="polite">{menuMessage({ menu, online })}</p>
        {page === 'home' ? <Home /> : page === 'multiplayer' ? <Multiplayer /> : page === 'settings' ? <Settings /> : page === 'ship' ? <ShipPicker />
          : page === 'host' ? <HostForm /> : page === 'join' ? <JoinForm /> : <SessionPage playing={playing} />}
        {!playing && <p data-testid="version" style={VERSION}>{versionText()}</p>}
      </section>
    </div>
  );
}

/** The menu's amber CRT stylesheet (Menu CRT), its screen effects at the CRT setting's strength. */
function MenuStyle() {
  const setting = useUi((s) => s.crt), css = useMemo(() => menuCss(crtScale(setting)), [setting]);
  return <style data-testid="menu-style">{css}</style>;
}

/** What the menu region shows after a render error until its reset key changes (spec §2): a way out stays. */
export function MenuFallback() {
  const offered = useUi((s) => s.online.status?.actions), actions = useActions(), leave = !!offered?.includes('leave');
  return (
    <div data-testid="session-menu" aria-label="FTLite session menu" data-layout="overlay" className={MENU_CLASS} style={ROOT_OVERLAY}>
      <MenuStyle />
      <section className={SCREEN_CLASS} style={PANEL_OVERLAY}>
        <p>Menu error</p>
        <button type="button" style={BUTTON} onClick={leave ? actions.leave : actions.returnHome}>{leave ? 'Leave' : 'Return to menu'}</button>
      </section>
    </div>
  );
}
