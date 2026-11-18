import { STATION_IDS } from '../sim/stationKinds';
import { CREW_ART_NAMES } from './crewArt';
import { AUDIO_ASSET_NAMES } from '../audio/soundBank';

/** Every asset name the renderer uses (spec §3 name contract). required = must be bound in the manifest; optional = may be unbound (in-house piece, Graphics fallback). */
export const FACINGS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type Facing8 = (typeof FACINGS)[number];
/** Art-ii (spec section 2): one console sprite per station kind, by its ship-data id. */
export const CONSOLE_ART_NAMES: readonly string[] = STATION_IDS.map((id) => `console.${id}`);
/** Art-ii (spec section 3): the two blast animations. */
export const BLAST_NAMES: readonly string[] = ['fx.blast.room', 'fx.blast.hit'];
/** Art-iii (spec section 1): the seven set-dressing sprites. */
export const PROP_ART_NAMES = ['prop.bunk.a', 'prop.bunk.b', 'prop.seats', 'prop.couch', 'prop.locker.a', 'prop.locker.b', 'prop.crate'] as const;
export type PropName = (typeof PROP_ART_NAMES)[number];

type Kind = 'required' | 'optional';
const names: Record<string, Kind> = {};
const add = (kind: Kind, ...ns: string[]): void => { for (const n of ns) names[n] = kind; };

// tiles (Cozy Space Interiors)
add('required', 'floor.0', 'floor.1', 'floor.2', 'floor.3', 'wall.flat', 'wall.plain', 'wall.vent', 'wall.pipes', 'wall.screen', 'door.closed', 'door.sealed', 'door.open');
// house floor art (Art-i spec section 2): a paid pack, absent on a fresh clone, so the procedural plating draws instead
add('optional', 'house.floor.0', 'house.floor.1', 'house.floor.2', 'house.floor.3');
// hazards
add('required', 'fire.loop');                                                  // Reactorcore
add('optional', 'breach.h', 'breach.v', 'floor.damaged.0', 'floor.damaged.1', 'vent.puff', 'fx.arc');   // in-house
// crew (Puny Characters, later the owner's body_base export)
for (const f of FACINGS) add('required', `crew.idle.${f}`, `crew.walk.${f}`);
add('required', 'crew.down');
add('optional', 'crew.sit');
// Art-ii (spec section 1): the bought crew, a paid pack absent on a fresh clone; the Puny crew then draw as before
add('optional', ...CREW_ART_NAMES);
add('optional', ...CONSOLE_ART_NAMES);   // Art-ii spec section 2: the bought consoles; the procedural desks without them
add('optional', 'ship.hound.map');   // Art-iv: the 2-Minute Tabletop Hound battlemap, a paid painting
add('optional', 'ship.valkyrn.map');   // Valkyrn spec §4.1: the 2-Minute Tabletop Valkyrn battlemap, a paid painting
add('optional', 'space.backdrop');   // Art-v: the 2-Minute Tabletop Deep Space (Red) backdrop; the procedural starfield without it
add('optional', ...BLAST_NAMES);         // Art-ii spec section 3: the bought blasts; none without them
add('optional', ...PROP_ART_NAMES);      // Art-iii spec section 1: the set dressing; bare floor without it
add('optional', ...AUDIO_ASSET_NAMES);   // Audio-i spec section 2: the Kenney effects and the two tracks; synth tones or silence without them
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
