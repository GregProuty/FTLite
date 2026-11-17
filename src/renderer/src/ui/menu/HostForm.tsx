import { useEffect, useRef } from 'react';
import { useActions, useUi } from '../context';
import { can } from '../menuState';
import { MenuButton } from './MenuButton';

/** Multiplayer is the two-player duel (H-2 spec §2): Host creates a two-seat duel room, so the form is a note and Create room. */
export function HostForm() {
  const menu = useUi((s) => s.menu), online = useUi((s) => s.online), actions = useActions();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { ref.current?.querySelector('button')?.focus(); }, []);
  return (
    <>
      <form ref={ref} data-testid="host-form" onSubmit={(e) => { e.preventDefault(); actions.host(); }}>
        <p data-testid="host-note">A duel for two: one of you flies the Helm, the other mans Weapons.</p>
        <MenuButton id="create-room" text="Create room" type="submit" enabled={can({ menu, online }, 'host')} />
      </form>
      <MenuButton id="back" text="Back" onClick={actions.back} enabled={!menu.pending} />
    </>
  );
}
