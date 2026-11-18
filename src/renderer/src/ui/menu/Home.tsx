import { useActions } from '../context';
import { MenuButton } from './MenuButton';
import { NAV } from './styles';

/** Single player, Multiplayer, Settings (main menu spec decision 1) and Quit (owner 2026-11-17). */
export function Home() {
  const actions = useActions();
  return (
    <nav style={NAV}>
      <MenuButton id="single-player" text="Single player" onClick={actions.openShips} />
      <MenuButton id="multiplayer" text="Multiplayer" onClick={actions.openMultiplayer} />
      <MenuButton id="settings" text="Settings" onClick={actions.openSettings} />
      <MenuButton id="quit" text="Quit" onClick={actions.quit} />
    </nav>
  );
}
