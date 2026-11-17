// The contact window's state (enemy ship window spec §3, §5, §6.1): which map contact the window shows (a ship slot) and
// whether the laser aim is armed. Pure and local to one player's screen: never sent, never in the sim. One controller per
// duel mode, beside the keyboard; the scene drives `click` and `sync` each frame, the UI actions drive the rest, and
// `intercept` is the keyboard's hook for Esc and T (spec §6.2), reading what the last `sync` recorded.
import type { ConsoleStation } from '../../render/duel/consoleModel';

export interface ContactState { ship: number; aim: boolean }
/** One frame's facts for the closing rules: `shown` is the console shown at Helm or Weapons; `station` the console's
 *  station, null while it is hidden; `target` the crew laser's target slot; `active` whether a slot's ship is active;
 *  `epoch` the round. */
export interface ContactSync { shown: boolean; station: ConsoleStation | null; target: number; active: (slot: number) => boolean; epoch: number }
export interface ContactController {
  state(): ContactState | null;
  /** A map click (spec §3): open on the slot, switch to it (disarmed), or close when it is the shown ship; null does nothing. */
  click(slot: number | null): void;
  /** T: open on the laser target slot, or close. */
  toggle(targetSlot: number): void;
  close(): void;
  /** LASER: toggles the aim while the window is open. */
  arm(): void;
  cancelAim(): void;
  /** Esc: disarms if armed, else closes; true when it took something, false when nothing is open. */
  escape(): boolean;
  /** The closing rules, once per frame: clears when not shown, on an inactive ship or a new epoch, and disarms on a
   *  station change. Records `shown`, `station` and `target` for `intercept`. Returns whether the window is shown. */
  sync(s: ContactSync): boolean;
  /** A room click while armed: `lock(room)` (the console lock path), then disarm; the window stays open. */
  pick(room: number, lock: (room: number) => void): void;
  /** The keyboard's intercept: true takes the key. Escape only while shown; KeyT while shown (close) or on a Helm or
   *  Weapons console (toggle on the target slot); everything else false. */
  intercept(code: string): boolean;
}
/** What the UI's actions forward to (ui/actions.ts setContact). */
export type ContactActions = Pick<ContactController, 'close' | 'arm' | 'cancelAim' | 'pick'>;

export function createContactController(): ContactController {
  let st: ContactState | null = null;
  // What the last sync recorded (the last drawn frame).
  let allowed = false, station: ConsoleStation | null = null, target = -1, epoch: number | null = null;
  const c: ContactController = {
    state: () => st,
    click(slot) {
      if (slot === null) return;
      st = st && st.ship === slot ? null : { ship: slot, aim: false };
    },
    toggle(targetSlot) { st = st ? null : { ship: targetSlot, aim: false }; },
    close() { st = null; },
    arm() { if (st) st = { ...st, aim: !st.aim }; },
    cancelAim() { if (st?.aim) st = { ...st, aim: false }; },
    escape() {
      if (!st) return false;
      st = st.aim ? { ...st, aim: false } : null;
      return true;
    },
    sync(s) {
      if (epoch !== null && s.epoch !== epoch) st = null;            // a new round
      if (st && (!s.shown || !s.active(st.ship))) st = null;          // hidden, SHIP, paused, decided, or the ship is gone
      if (st?.aim && station !== null && s.station !== station) st = { ...st, aim: false };   // a station change disarms
      allowed = s.shown; station = s.station; target = s.target; epoch = s.epoch;
      return allowed && st !== null;
    },
    pick(room, lock) {
      if (!st?.aim) return;
      lock(room);
      st = { ...st, aim: false };
    },
    intercept(code) {
      if (code === 'Escape') return allowed && st !== null ? c.escape() : false;
      if (code === 'KeyT') {
        if (allowed && st !== null) { c.close(); return true; }
        if (station === 'helm' || station === 'weapons') { c.toggle(target); return true; }
      }
      return false;
    }
  };
  return c;
}
