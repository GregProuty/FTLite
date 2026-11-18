import { useEffect, useRef } from 'react';
import type { DuelCrewSize } from '../../../../shared/onlineSession';
import { useActions, useUi } from '../context';
import { can } from '../menuState';
import { MenuButton } from './MenuButton';

const CREWS: readonly DuelCrewSize[] = [2, 3, 4];

/** Multiplayer is the duel (H-2 spec §2): Host creates a duel room for the crew picked here (Sci-2 spec §5.3: CREW 2 3 4,
 *  default 3), so the form is a note, the choice and Create room. */
export function HostForm() {
  const menu = useUi((s) => s.menu), online = useUi((s) => s.online), actions = useActions();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('[data-testid="create-room"]')?.focus(); }, []);
  return (
    <>
      <form ref={ref} data-testid="host-form" onSubmit={(e) => { e.preventDefault(); actions.host(menu.crew); }}>
        <p data-testid="host-note">A crew of two, three or four: Helm, Weapons and Science; a fourth works on foot. Empty seats stand idle aboard.</p>
        <div data-testid="crew-choice" role="group" aria-label="Crew">
          <span>CREW </span>
          {CREWS.map((n) => <MenuButton key={n} id={`crew-${n}`} text={String(n)} pressed={menu.crew === n} onClick={() => actions.setCrew(n)} enabled={!menu.pending} />)}
        </div>
        <MenuButton id="create-room" text="Create room" type="submit" enabled={can({ menu, online }, 'host')} />
      </form>
      <MenuButton id="back" text="Back" onClick={actions.back} enabled={!menu.pending} />
    </>
  );
}
