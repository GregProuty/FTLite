// The house palette (Art-i spec section 4): one JSON file read by the renderer and by scripts/art-import.ts.
// Changing palette.json means a rebuild (it is imported statically). Pure: no Pixi.
import data from './palette.json';

export const ROLES = [
  'background', 'floor', 'floorSeam', 'wall', 'wallLight', 'wallShadow', 'doorFill', 'doorOutline', 'space', 'ambient', 'alert', 'vacuum',
  'flash', 'lampOn', 'lampOff', 'screenA', 'screenB', 'lowO2', 'impact', 'doorSealed', 'heldTick', 'spaceGap', 'fireFallback', 'breach',
  'airlockOutline', 'ventSpeck', 'failed'
] as const;
export type Role = (typeof ROLES)[number];
export const RAMPS = ['fire', 'plasma', 'electric', 'vent'] as const;
export type RampName = (typeof RAMPS)[number];

export interface PaletteFile { colours: string[]; roles: Record<string, string>; ramps: Record<string, string[]> }
export interface Palette { colours: number[]; roles: Record<Role, number>; ramps: Record<RampName, number[]> }

/** '#rrggbb' to the number rrggbb; throws on anything else. */
export function hexToNumber(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`palette: "${hex}" is not #rrggbb`);
  return parseInt(hex.slice(1), 16);
}

/** Checks the file and converts it: every role and ramp present, no unknown role, every role and ramp colour one of `colours`, ramps 5 to 8 long. */
export function parsePalette(file: PaletteFile): Palette {
  const problems: string[] = [];
  const colours = file.colours.map(hexToNumber);
  const inPalette = new Set(colours);
  const pick = (where: string, hex: string | undefined): number => {
    if (hex === undefined) { problems.push(`${where} is missing`); return 0; }
    const n = hexToNumber(hex);
    if (!inPalette.has(n)) problems.push(`${where} ${hex} is not in colours`);
    return n;
  };
  const roles = Object.fromEntries(ROLES.map((r) => [r, pick(`role ${r}`, file.roles[r])])) as Record<Role, number>;
  const ramps = Object.fromEntries(RAMPS.map((name) => {
    const list = file.ramps[name] ?? [];
    if (list.length < 5 || list.length > 8) problems.push(`ramp ${name} has ${list.length} colours (5 to 8)`);
    return [name, list.map((h, i) => pick(`ramp ${name}[${i}]`, h))];
  })) as Record<RampName, number[]>;
  for (const r of Object.keys(file.roles)) if (!(ROLES as readonly string[]).includes(r)) problems.push(`unknown role ${r}`);
  if (problems.length) throw new Error(`Invalid palette: ${problems.join('; ')}`);
  return { colours, roles, ramps };
}

export const PALETTE: Palette = parsePalette(data);
/** The role colours as numbers, ready for Pixi fills. */
export const ROLE: Readonly<Record<Role, number>> = PALETTE.roles;
export const RAMP: Readonly<Record<RampName, readonly number[]>> = PALETTE.ramps;
