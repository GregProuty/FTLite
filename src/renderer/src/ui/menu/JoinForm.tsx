import { useEffect, useRef, useState } from 'react';
import { useActions, useUi } from '../context';
import { can } from '../menuState';
import { MenuButton } from './MenuButton';
import { CONTROL } from './styles';

/** The eight-character room code and Join room. */
export function JoinForm() {
  const menu = useUi((s) => s.menu), online = useUi((s) => s.online), actions = useActions();
  const [code, setCode] = useState(''), ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <>
      <form data-testid="join-form" onSubmit={(e) => { e.preventDefault(); actions.join(code); }}>
        <label>Room code
          <input ref={ref} data-testid="join-code" aria-label="Room code" style={CONTROL} value={code} maxLength={32} autoComplete="off" spellCheck={false}
            onChange={(e) => setCode(e.target.value)} />
        </label>
        <MenuButton id="join-room" text="Join room" type="submit" enabled={can({ menu, online }, 'join')} />
      </form>
      <MenuButton id="back" text="Back" onClick={actions.back} enabled={!menu.pending} />
    </>
  );
}
