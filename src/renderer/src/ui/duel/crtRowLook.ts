// How a readout row draws on the CRT screen (CRT map spec section 2), moved out of the deleted ReadoutPanel (UI round
// §2.2): labels mid, values main, headings main, `good` and `warn` hot, `alert` an inverse bar blinking main/hot,
// `enemy` an inverse bar. The Weapons cards use it for their bars.
import type { ReadoutRow } from '../../render/duel/readoutModel';
import { ALERT_BLINK_HZ, blink, CRT } from '../../render/tactical/crtTheme';

/** An inverse bar behind a row's text: from 5 below the row's top to 27 (the caps at +8, descenders to +26). */
export const INVERSE_TOP = 5, INVERSE_H = 22, INVERSE_PAD = 4;

/** How a row draws on the CRT screen: its label and value tones, which part (if any) sits on an inverse bar of `block`, and its bar's fill. */
export interface CrtRowLook { label: number; value: number; inverse: 'label' | 'value' | null; block: number; bar: number }
export function crtRowLook(r: ReadoutRow, t: number): CrtRowLook {
  const heading = r.value === '' && !r.pips && r.label !== '';
  const look: CrtRowLook = { label: heading ? CRT.main : CRT.mid, value: CRT.main, inverse: null, block: CRT.main, bar: CRT.main };
  switch (r.emphasis) {
    case 'good': look.value = CRT.hot; look.bar = CRT.hot; break;
    case 'warn': look.value = CRT.hot; look.bar = CRT.hot; break;   // the bar under a damaged room is its repair progress
    case 'alert': look.inverse = heading ? 'label' : 'value'; look.block = blink(t, ALERT_BLINK_HZ) ? CRT.hot : CRT.main; break;
    case 'enemy': if (!r.pips) look.inverse = heading ? 'label' : 'value'; break;
    default: break;
  }
  if (look.inverse === 'label') look.label = CRT.glass;
  if (look.inverse === 'value') look.value = CRT.glass;
  return look;
}
