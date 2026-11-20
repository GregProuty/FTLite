// Crew3D (spec 2026-11-20-crew3d-prerendered-sprites-design.md, section 4): the pre-rendered 3D crew and boarder
// sprites. Pure: names, the manifest sheet blocks, the pose per crew state, anchors and lifts. No Pixi, no DOM.
// The layout numbers come from crew3d.generated.json, which tools/sprite-render/render.py writes beside the sheets.
import { TILE_PX } from '../../../shared/resolution';
import type { Facing8 } from './assetNames';
import type { Side } from './consoleModel';
import type { FeelStorage } from './feel';
import { CREW_COLORS } from './tokenModel';
import meta from './crew3d.generated.json';

export interface Crew3dAnimation { name: string; frames: number; fps: number; loop: boolean; start: number; originRow: number }
export interface Crew3dCharacter { mask: boolean; headRow: number; cells: number; animations: Crew3dAnimation[] }
export interface Crew3dMeta { frame: number; columns: number; directions: string[]; characters: Record<string, Crew3dCharacter> }
export const CREW3D_META: Crew3dMeta = meta;

/** The two crew bodies (player slots alternate them) and the boarder. */
export const CREW3D_BODIES = ['crewA', 'crewB'] as const;
export const CREW3D_BOARDER = 'boarder';
export type Crew3dAnim = 'idle' | 'walk' | 'work' | 'repair' | 'firefight' | 'down';
export type BoarderAnim = 'idle' | 'walk' | 'attack';

/** The sheet's direction rows, in the game's facing order. */
export const CREW3D_DIRECTIONS = meta.directions as Facing8[];
/** A frame covers 2 x 2 tiles: world units per art pixel (the look gate tunes this one constant). */
export const CREW3D_SCALE = (2 * TILE_PX) / meta.frame;
export const CREW3D_ANCHOR_X = 0.5;
const DEAD_TINT = 0x777777;

export const crew3dName = (char: string, anim: string, dir: Facing8): string => `crew3d.${char}.${anim}.${dir}`;
/** The team-colour layer of a frame: the same cell of the character's mask sheet. */
export const crew3dMaskName = (char: string, anim: string, dir: Facing8): string => `${crew3dName(char, anim, dir)}.mask`;

const character = (char: string): Crew3dCharacter => {
  const c = CREW3D_META.characters[char];
  if (!c) throw new Error(`crew3d: no character ${char}`);
  return c;
};
const animation = (char: string, anim: string): Crew3dAnimation => {
  const a = character(char).animations.find((x) => x.name === anim);
  if (!a) throw new Error(`crew3d: ${char} has no animation ${anim}`);
  return a;
};

/** The manifest sheet block of one sheet: every animation in every direction. Cell index = start + direction * frames + frame. */
export function crew3dSheet(char: string, mask: boolean): { frameW: number; frameH: number; frames: Record<string, number>; animations: Record<string, { frames: number[]; fps: number; loop: boolean }> } {
  const animations: Record<string, { frames: number[]; fps: number; loop: boolean }> = {};
  for (const a of character(char).animations) CREW3D_DIRECTIONS.forEach((dir, d) => {
    animations[mask ? crew3dMaskName(char, a.name, dir) : crew3dName(char, a.name, dir)] = { frames: Array.from({ length: a.frames }, (_, i) => a.start + d * a.frames + i), fps: a.fps, loop: a.loop };
  });
  return { frameW: CREW3D_META.frame, frameH: CREW3D_META.frame, frames: {}, animations };
}

/** The sheet files under public/assets, with what each binds. */
export const CREW3D_SHEETS: readonly { file: string; char: string; mask: boolean }[] = Object.entries(CREW3D_META.characters).flatMap(([char, c]) => [
  { file: `art/crew3d/${char}.png`, char, mask: false }, ...(c.mask ? [{ file: `art/crew3d/${char}.mask.png`, char, mask: true }] : [])
]);
/** Every crew3d name: the feature draws only when all are bound. */
export const CREW3D_NAMES: readonly string[] = CREW3D_SHEETS.flatMap((s) => Object.keys(crew3dSheet(s.char, s.mask).animations));

/** Body and colour are a pure function of the player: slots alternate the two bodies, the mask takes the player colour. */
export const crew3dBody = (pid: number): string => CREW3D_BODIES[((pid % 2) + 2) % 2]!;

/** Sprite anchor y that puts the figure's ground point on the sprite position. */
export const crew3dAnchorY = (char: string, anim: string): number => animation(char, anim).originRow / CREW3D_META.frame;
/** World units from the crew position up to the top of a standing head. */
export const crew3dHeadLift = (char: string): number => (animation(char, 'idle').originRow - character(char).headRow) * CREW3D_SCALE;
/** World units above the crew position: the carried torpedo (6 over the tallest head), and the callout bubble's tail
 *  (10 more, as over the bought crew); a downed body lies on the deck, so its bubble sits low. */
export const CARRY_LIFT_3D = Math.max(...CREW3D_BODIES.map(crew3dHeadLift)) + 6;
export const CALLOUT_LIFT_3D = CARRY_LIFT_3D + 10;
export const CALLOUT_LIFT_DOWN_3D = 26;

/** What a crew member works on (particles/sources.ts WorkKind): a fire, a breach, a station's power, or a duel repair. */
export type Crew3dWork = 'fire' | 'breach' | 'power' | 'repair';
export interface Crew3dPoseInput {
  pid: number; life: 'conscious' | 'downed' | 'dead'; seated: boolean; seatSide: Side | null;
  /** What the crew member is working on this frame, and the facing toward it; null when not working. */
  working: { kind: Crew3dWork; facing: Facing8 } | null;
  facing: Facing8; moving: boolean;
}
/** `clock`: the body and animation without the direction; a turn keeps the frame while the clock stays the same. */
export interface Crew3dPose { char: string; anim: Crew3dAnim; clock: string; name: string; mask: string; facing: Facing8; anchorY: number; tint: number; maskTint: number; alpha: number }

const WORK_ANIM: Readonly<Record<Crew3dWork, Crew3dAnim>> = { fire: 'firefight', breach: 'repair', power: 'work', repair: 'repair' };

/** What a crew member shows. Priority: down, then walk (a planted work pose would slide), then working (aimed at the
 *  target), then seated (working, facing the console), then idle. A dead body keeps the grey tint, on the base and on
 *  the colour layer. */
export function crew3dPose(i: Crew3dPoseInput): Crew3dPose {
  const char = crew3dBody(i.pid);
  let anim: Crew3dAnim, facing = i.facing;
  if (i.life !== 'conscious') anim = 'down';
  else if (i.moving && !i.seated) anim = 'walk';
  else if (i.working) { anim = WORK_ANIM[i.working.kind]; facing = i.working.facing; }
  else if (i.seated) { anim = 'work'; facing = i.seatSide ?? i.facing; }
  else anim = 'idle';
  const dead = i.life === 'dead';
  return {
    char, anim, facing, clock: `${char}.${anim}`, name: crew3dName(char, anim, facing), mask: crew3dMaskName(char, anim, facing), anchorY: crew3dAnchorY(char, anim),
    tint: dead ? DEAD_TINT : 0xffffff, maskTint: dead ? DEAD_TINT : CREW_COLORS[((i.pid % 4) + 4) % 4]!, alpha: i.life === 'downed' ? 0.85 : 1
  };
}

/** A work target nearer than this (tiles) does not turn the figure: it is underfoot, and its direction is noise. */
export const WORK_AIM_MIN_TILES = 0.75;
/** World units a lying body is sorted behind its position: it is anchored at its middle and reaches 0.6 tile up. */
export const DOWN_SORT_LIFT = 0.6;

/** A boarder: attack while it fights, else walk or idle. Untinted (its own red armour), no colour layer. */
export function boarderPose(fighting: boolean, moving: boolean, facing: Facing8): { anim: BoarderAnim; name: string; anchorY: number } {
  const anim: BoarderAnim = moving ? 'walk' : fighting ? 'attack' : 'idle';
  return { anim, name: crew3dName(CREW3D_BOARDER, anim, facing), anchorY: crew3dAnchorY(CREW3D_BOARDER, anim) };
}
/** World units from a boarder's position up to its health bar: 5 over the head. */
export const BOARDER_BAR_LIFT_3D = crew3dHeadLift(CREW3D_BOARDER) + 5;

// The dev toggle (spec section 4): F8 switches between the 3D art and the old art, stored like the feel setting.
export type Crew3dSetting = 'on' | 'off';
export const DEFAULT_CREW3D: Crew3dSetting = 'on';
export const CREW3D_KEY = 'ftlite-crew3d';
export const nextCrew3d = (s: Crew3dSetting): Crew3dSetting => (s === 'on' ? 'off' : 'on');
/** A denied or empty storage gives the default. */
export function loadCrew3d(storage: () => FeelStorage): Crew3dSetting {
  try { const v = storage().getItem(CREW3D_KEY); return v === 'on' || v === 'off' ? v : DEFAULT_CREW3D; } catch { return DEFAULT_CREW3D; }
}
export function saveCrew3d(storage: () => FeelStorage, s: Crew3dSetting): void {
  try { storage().setItem(CREW3D_KEY, s); } catch { /* a denied storage keeps the setting for this session only */ }
}
