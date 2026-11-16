// The read-only controls list on the Settings page (main menu spec, 2026-11-16). Built from the input code's own tables
// (the duel's PRESS_CODES and held keys, the sector's one keyboard cluster), so the list cannot drift from the bindings.
import { FIRE_HELD, INTERACT_HELD, MOVE_CODES, PRESS_CODES, type KeyAction } from './duel/input';
import { SECTOR_KEYS } from '../input/sources';

export interface ControlRow { keys: string; action: string }
export interface ControlSection { title: string; rows: ControlRow[] }

const NAMED: Readonly<Record<string, string>> = {
  Space: 'Space', Tab: 'Tab', Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Num Enter', Equal: '=', Minus: '-', NumpadAdd: 'Num +', NumpadSubtract: 'Num -'
};
/** A KeyboardEvent.code as the key cap reads: KeyE → E, Equal → =, NumpadAdd → Num +. */
export function keyLabel(code: string): string {
  return NAMED[code] ?? (code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : code);
}

/** What each single-player press action does. `fireUp` is the Space release, listed with the held Space. */
const DUEL_ACTION: Readonly<Record<Exclude<KeyAction, 'fireUp'>, string>> = {
  interact: 'Sit at a console; at Weapons, lock the next target',
  prevLock: 'At Weapons, lock the previous target',
  fireDown: 'At Weapons, hold to charge, release to fire',
  launch: 'At Weapons, launch a missile',
  stand: 'Stand up from a console',
  switch: 'Switch between the Helm and Weapons characters',
  pause: 'Pause and resume',
  camera: 'Snap the camera back (at Weapons, change camera)',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  confirm: 'Start a new duel (end screen)',
  menu: 'Return to the main menu (paused or end screen)'
};

/** The codes bound to one press action, in table order. */
function codesFor(action: KeyAction): string[] {
  return Object.entries(PRESS_CODES).filter(([, a]) => a === action).map(([code]) => code);
}

export function controlSections(): ControlSection[] {
  const move = [MOVE_CODES.up, MOVE_CODES.left, MOVE_CODES.down, MOVE_CODES.right].map(keyLabel).join(' ');
  const duel: ControlRow[] = [{ keys: move, action: 'Walk; at the Helm, thrust and turn; at Weapons, steer the missile' }];
  for (const action of Object.keys(DUEL_ACTION) as (keyof typeof DUEL_ACTION)[]) {
    const keys = codesFor(action).map(keyLabel).join(' / ');
    duel.push({ keys, action: DUEL_ACTION[action] });
    if (action === 'interact') duel.push({ keys: `Hold ${keyLabel(INTERACT_HELD)}`, action: 'Repair the damaged system you stand at' });
  }
  duel.find((r) => r.keys === keyLabel(FIRE_HELD))!.keys = `Hold ${keyLabel(FIRE_HELD)}`;
  duel.push({ keys: 'Mouse wheel', action: 'Zoom' }, { keys: 'Right or middle drag', action: 'Pan the camera' });
  const k = SECTOR_KEYS;
  const sector: ControlRow[] = [
    { keys: [k.up, k.left, k.down, k.right].map(keyLabel).join(' '), action: 'Walk' },
    { keys: keyLabel(k.interact), action: 'Interact; hold to work a station' },
    { keys: keyLabel(k.confirm), action: 'Confirm' },
    { keys: keyLabel(k.cancel), action: 'Cancel' },
    { keys: keyLabel(k.callout), action: 'Call out to the crew' }
  ];
  return [{ title: 'Single player', rows: duel }, { title: 'Multiplayer', rows: sector }, { title: 'Anywhere', rows: [{ keys: 'F11', action: 'Toggle fullscreen' }] }];
}
