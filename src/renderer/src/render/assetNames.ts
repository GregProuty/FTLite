/** Every asset name the renderer uses (spec §3 name contract). required = must be bound in the manifest; optional = may be unbound (in-house piece, Graphics fallback). */
export const FACINGS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type Facing8 = (typeof FACINGS)[number];

type Kind = 'required' | 'optional';
const names: Record<string, Kind> = {};
const add = (kind: Kind, ...ns: string[]): void => { for (const n of ns) names[n] = kind; };

// tiles (Cozy Space Interiors)
add('required', 'floor.0', 'floor.1', 'floor.2', 'floor.3', 'wall.flat', 'wall.plain', 'wall.vent', 'wall.pipes', 'wall.screen', 'door.closed', 'door.sealed', 'door.open');
// hazards
add('required', 'fire.loop');                                                  // Reactorcore
add('optional', 'breach.h', 'breach.v', 'floor.damaged.0', 'floor.damaged.1', 'vent.puff', 'fx.arc');   // in-house
// crew (Puny Characters, later the owner's body_base export)
for (const f of FACINGS) add('required', `crew.idle.${f}`, `crew.walk.${f}`);
add('required', 'crew.down');
add('optional', 'crew.sit');
// icons (in-house)
add('optional', 'icon.fire', 'icon.oxygen', 'icon.breach', 'icon.door', 'icon.repair', 'icon.medical', 'icon.power', 'icon.sensors', 'icon.weapons', 'icon.navigation');
// ui (Kenney Pixel UI, Kenney 1-Bit Input Prompts)
add('required', 'ui.panel', 'ui.bar.bg', 'ui.bar.fill',
  'prompt.kb.E', 'prompt.kb.F', 'prompt.kb.Q', 'prompt.kb.Enter', 'prompt.kb.ShiftRight', 'prompt.kb.Backspace', 'prompt.pad.A', 'prompt.pad.X', 'prompt.pad.B');
// font (m5x7)
add('required', 'font.m5x7');

export const ASSET_NAMES: Readonly<Record<string, Kind>> = names;
export function requiredNames(): string[] { return Object.keys(names).filter((n) => names[n] === 'required'); }
export function isKnownName(n: string): boolean { return n in names; }
