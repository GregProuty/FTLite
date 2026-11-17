import { useActions, useUi } from '../context';
import { availabilityText, can } from '../menuState';
import { MenuButton } from './MenuButton';

/** Host, Join, the saved-seat actions when offered, the availability note and Back (main menu spec decision 3). */
export function Multiplayer() {
  const menu = useUi((s) => s.menu), online = useUi((s) => s.online), actions = useActions();
  const v = { menu, online }, offered = online.status?.actions ?? [];
  return (
    <>
      <MenuButton id="host" text="Host" onClick={actions.openHost} enabled={can(v, 'host')} />
      <MenuButton id="join" text="Join" onClick={actions.openJoin} enabled={can(v, 'join')} />
      {offered.includes('reconnect') && <MenuButton id="reconnect" text="Reconnect saved seat" onClick={actions.reconnect} enabled={can(v, 'reconnect')} />}
      {offered.includes('forget-seat') && <MenuButton id="forget-seat" text="Forget saved seat" onClick={actions.forgetSavedSeat} enabled={can(v, 'forget-seat')} />}
      <p data-testid="online-availability">{availabilityText(v)}</p>
      <MenuButton id="back" text="Back" onClick={actions.back} enabled={!menu.pending} />
    </>
  );
}
