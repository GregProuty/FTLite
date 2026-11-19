// Valkyrn spec §9: Single player's ship choice. The ships come through the settings slice (main.ts fills it from the fleet's
// solo list), so the UI imports no sim values; the remembered choice is marked.
import { useActions, useUi } from '../context';
import { MenuButton } from './MenuButton';
import { NAV } from './styles';

export function ShipPicker() {
  const ships = useUi((s) => s.settings.ships), chosen = useUi((s) => s.settings.soloShip), actions = useActions();
  return (
    <nav style={NAV}>
      {ships.map((s) => <MenuButton key={s.id} id={`ship-${s.id}`} text={`${s.name}: ${s.line}${s.id === chosen ? '  (last flown)' : ''}`} onClick={() => actions.single(s.id)} />)}
      <MenuButton id="back" text="Back" onClick={actions.back} />
    </nav>
  );
}
