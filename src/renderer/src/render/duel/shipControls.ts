// Engineering spike §5-§7: the ship view's four commands and the interior hit-test. A left click on a door or an
// airlock in the interior toggles it (anyone, from anywhere); the HUD's columns and pips send power and coolant. Pure:
// no Pixi, no DOM. The hit-test works on the interior's placement (the world's scale and where ship-local (0,0) lands,
// before the shake), as InteriorView.placement() reports it.
import type { DuelCommand } from '../../net/contracts';
import type { DuelState } from '../../sim/duel/state';
import { TILE_PX } from '../../../../shared/resolution';
import type { Placement } from './interiorCamera';
import { INTERIOR_BAND } from './interiorModel';
import type { Band } from '../worldFit';

/** The ship view's commands (Part i's shipPower, shipCoolant, shipDoor and shipAirlock) and the Weapons block's
 *  weaponPower (spec §10.3), which ride the same keyboard queue; the sim refuses weaponPower off the Weapons seat. */
export type ShipCommand = Extract<DuelCommand, { kind: 'shipPower' | 'shipCoolant' | 'shipDoor' | 'shipAirlock' | 'weaponPower' | 'sciencePower' | 'hack' }>;   // the hacking spike's two ride the same queue; the sim refuses them off the Science seat
/** A clickable thing on the interior, with its tile index (for the hover highlight). */
export type ShipControl = { kind: 'door'; edge: number; tile: number } | { kind: 'airlock'; index: number; tile: number };

/** The door or airlock under internal point (x, y), or null: off the band, off the ship or on any other tile. `band`: the
 *  interior band the placement was fitted in (UI round 2b: the current stage's; defaults to the reference band). */
export function shipControlAt(d: DuelState, p: Placement, x: number, y: number, band: Band = INTERIOR_BAND): ShipControl | null {
  const der = d.interior.derived, size = p.scale * TILE_PX;
  if (!(size > 0)) return null;
  if (x < band.x || x >= band.x + band.w || y < band.y || y >= band.y + band.h) return null;
  const tx = Math.floor((x - p.x) / size), ty = Math.floor((y - p.y) / size);
  if (tx < 0 || ty < 0 || tx >= der.width || ty >= der.height) return null;
  const tile = ty * der.width + tx, edge = der.doorTileToEdge[tile]!, lock = der.airlockOfTile[tile]!;
  if (edge >= 0) return { kind: 'door', edge, tile };
  if (lock >= 0) return { kind: 'airlock', index: lock, tile };
  return null;
}

/** The command a click on `c` sends. */
export function shipCommandOf(c: ShipControl): ShipCommand {
  return c.kind === 'door' ? { kind: 'shipDoor', edge: c.edge } : { kind: 'shipAirlock', index: c.index };
}
