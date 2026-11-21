// UI round Part 3: feComponentTransfer tables mapping luminance onto the CRT ramp, so a pre-rendered ship reads as
// phosphor on the amber terminals.
import { CRT } from './tactical/crtTheme';

const RAMP = [CRT.glass, CRT.faint, CRT.dim, CRT.mid, CRT.main, CRT.hot];

/** feComponentTransfer tableValues (space-separated, 0..1) per channel that map luminance 0..1 onto the CRT ramp
 *  [glass, faint, dim, mid, main, hot] evenly spaced. */
export function amberTables(): { r: string; g: string; b: string } {
  const t = (shift: number): string => RAMP.map((c) => (Math.round((((c >> shift) & 255) / 255) * 1000) / 1000).toString()).join(' ');
  return { r: t(16), g: t(8), b: t(0) };
}
