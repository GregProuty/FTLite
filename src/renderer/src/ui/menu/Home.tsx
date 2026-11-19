import { useActions, useUi } from '../context';
import { MenuButton } from './MenuButton';
import { NAV } from './styles';

/** Single player, Multiplayer, Settings (main menu spec decision 1) and Quit (owner 2026-11-17). In a browser without the
 *  online APIs, the unsupported text takes Multiplayer's place (web build spec §7.7). */
export function Home() {
  const actions = useActions(), unsupported = useUi((s) => s.browser.unsupported);
  return (
    <nav style={NAV}>
      <MenuButton id="single-player" text="Single player" onClick={actions.openShips} />
      {unsupported ? <p data-testid="online-unsupported">{unsupported}</p> : <MenuButton id="multiplayer" text="Multiplayer" onClick={actions.openMultiplayer} />}
      <MenuButton id="settings" text="Settings" onClick={actions.openSettings} />
      <MenuButton id="quit" text="Quit" onClick={actions.quit} />
    </nav>
  );
}
