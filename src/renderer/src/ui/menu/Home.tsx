import { useActions } from '../context';
import { MenuButton } from './MenuButton';
import { NAV } from './styles';

/** Exactly Single player, Multiplayer and Settings (main menu spec decision 1). */
export function Home() {
  const actions = useActions();
  return (
    <nav style={NAV}>
      <MenuButton id="single-player" text="Single player" onClick={actions.single} />
      <MenuButton id="multiplayer" text="Multiplayer" onClick={actions.openMultiplayer} />
      <MenuButton id="settings" text="Settings" onClick={actions.openSettings} />
    </nav>
  );
}
