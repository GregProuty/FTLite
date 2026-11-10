import { FACINGS } from './assetNames';

/** Features that switch as a whole between art and the Graphics placeholder (spec §4 Placeholders). */
export type Feature = 'crew' | 'breach' | 'vent' | 'damagedFloor' | 'fire' | 'icons' | 'glyphs' | 'arc' | 'sit';

export const FEATURE_NAMES: Readonly<Record<Feature, string[]>> = {
  crew: [...FACINGS.flatMap((f) => [`crew.idle.${f}`, `crew.walk.${f}`]), 'crew.down'],
  breach: ['breach.h', 'breach.v'],
  vent: ['vent.puff'],
  damagedFloor: ['floor.damaged.0', 'floor.damaged.1'],
  fire: ['fire.loop'],
  icons: ['icon.fire', 'icon.oxygen', 'icon.breach', 'icon.door', 'icon.repair', 'icon.power'],
  arc: ['fx.arc'],
  sit: ['crew.sit'],
  glyphs: ['prompt.kb.E', 'prompt.kb.F', 'prompt.kb.Q', 'prompt.kb.Enter', 'prompt.kb.ShiftRight', 'prompt.kb.Backspace', 'prompt.pad.A', 'prompt.pad.X', 'prompt.pad.B']
};

export function featureReady(missing: ReadonlySet<string>, feature: Feature): boolean {
  return FEATURE_NAMES[feature].every((n) => !missing.has(n));
}
