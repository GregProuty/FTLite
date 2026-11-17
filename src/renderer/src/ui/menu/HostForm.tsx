import { useEffect, useRef, useState } from 'react';
import { useActions, useUi } from '../context';
import { can } from '../menuState';
import { MenuButton } from './MenuButton';
import { CONTROL } from './styles';

/** The crew capacity (1–4; two or fewer fly the Skiff) and Create room. */
export function HostForm() {
  const menu = useUi((s) => s.menu), online = useUi((s) => s.online), actions = useActions();
  const [capacity, setCapacity] = useState('2'), ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <>
      <form data-testid="host-form" onSubmit={(e) => { e.preventDefault(); actions.host(Number(capacity)); }}>
        <label>Crew capacity
          <select ref={ref} data-testid="capacity" aria-label="Crew capacity" style={CONTROL} value={capacity} onChange={(e) => setCapacity(e.target.value)}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={String(n)}>{`${n} crew — ${n <= 2 ? 'Skiff' : 'Cutter'}`}</option>)}
          </select>
        </label>
        <MenuButton id="create-room" text="Create room" type="submit" enabled={can({ menu, online }, 'host')} />
      </form>
      <MenuButton id="back" text="Back" onClick={actions.back} enabled={!menu.pending} />
    </>
  );
}
