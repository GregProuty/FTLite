// The bought crew (Art-ii spec section 1): one LimeZu Modern Interiors character per player, four facings, standing,
// idle and walk. Pure: the names, the pose per crew state and the offsets above the head. No Pixi.
import type { Facing8 } from './assetNames';
import type { Side } from './consoleModel';

export type Facing4 = 'n' | 'e' | 's' | 'w';
/** LimeZu's direction order inside each group of the sheet (right, up, left, down). */
export const LIMEZU_DIRS: readonly Facing4[] = ['e', 'n', 'w', 's'];
/** The premade characters, by slot (Owner.pid % 4): sheet crew_04, 07, 13, 19. */
export const CREW_SHEETS = ['04', '07', '13', '19'] as const;
export const CREW_SLOTS = CREW_SHEETS.length;
/** Frame layout of each imported sheet (art/import.json): 0-3 standing, 4-27 idle, 28-51 walk; 6 frames per direction. */
export const LIMEZU_STAND = 0, LIMEZU_IDLE = 4, LIMEZU_WALK = 28, LIMEZU_RUN = 6;
export const LIMEZU_IDLE_FPS = 6, LIMEZU_WALK_FPS = 10;
/** A frame is 16 x 32 art pixels. Measured offline (Art-ii planning, 2026-11-16) over the standing frames 0-3 of all four
 *  imported sheets: the lowest opaque row is 31 in every sheet; the highest is 8 in crew_04, 07 and 13 and 7 in crew_19
 *  (7 is used, the tallest head). */
export const LIMEZU_FRAME_H = 32, LIMEZU_FOOT_ROW = 31, LIMEZU_HEAD_ROW = 7;

/** Anchor y that puts a frame's foot row on the sprite position. */
export const footAnchorY = (footRow: number, frameH: number): number => (footRow + 1) / frameH;
export const LIMEZU_ANCHOR_Y = footAnchorY(LIMEZU_FOOT_ROW, LIMEZU_FRAME_H);   // 1
/** World units above the crew position: the carried torpedo (30 over Puny), and the callout bubble's tail. */
export const CARRY_LIFT_PUNY = 30;
export const CARRY_LIFT_LIMEZU = (LIMEZU_FOOT_ROW - LIMEZU_HEAD_ROW) * 2 + 6;   // 54: 6 units over the head
export const CALLOUT_LIFT_LIMEZU = CARRY_LIFT_LIMEZU + 10;                      // 64: clears a carried torpedo (7 high, fins 10.5)
export const CALLOUT_LIFT_DOWN_LIMEZU = 16 + 10;                                 // 26: a downed body lies across its tile (half height 16) plus the same clearance

/** Slot k of a player: pid % 4 picks sheet k. */
export const crewSlot = (pid: number): number => ((pid % CREW_SLOTS) + CREW_SLOTS) % CREW_SLOTS;

/** Eight facings folded to LimeZu's four: n and s stay, every east-ish facing is e, every west-ish one w. */
export function facing4(f: Facing8): Facing4 {
  if (f === 'n' || f === 's') return f;
  return f === 'e' || f === 'ne' || f === 'se' ? 'e' : 'w';
}

export const crewStandName = (slot: number, d: Facing4): string => `crew.p${slot}.stand.${d}`;
export const crewIdleName = (slot: number, d: Facing4): string => `crew.p${slot}.idle.${d}`;
export const crewWalkName = (slot: number, d: Facing4): string => `crew.p${slot}.walk.${d}`;
/** Every crewArt name (48): stand, idle and walk for 4 slots and 4 facings. */
export const CREW_ART_NAMES: readonly string[] = Array.from({ length: CREW_SLOTS }, (_, k) => LIMEZU_DIRS.flatMap((d) => [crewStandName(k, d), crewIdleName(k, d), crewWalkName(k, d)])).flat();

/** The manifest sheet block for one LimeZu sheet: frame indices per spec section 1. */
export function limezuSheet(slot: number): { frameW: 16; frameH: 32; frames: Record<string, number>; animations: Record<string, { frames: number[]; fps: number; loop: true }> } {
  const frames: Record<string, number> = {}, animations: Record<string, { frames: number[]; fps: number; loop: true }> = {};
  const run = (start: number, i: number): number[] => Array.from({ length: LIMEZU_RUN }, (_, j) => start + i * LIMEZU_RUN + j);
  LIMEZU_DIRS.forEach((d, i) => { frames[crewStandName(slot, d)] = LIMEZU_STAND + i; });
  LIMEZU_DIRS.forEach((d, i) => { animations[crewIdleName(slot, d)] = { frames: run(LIMEZU_IDLE, i), fps: LIMEZU_IDLE_FPS, loop: true }; });
  LIMEZU_DIRS.forEach((d, i) => { animations[crewWalkName(slot, d)] = { frames: run(LIMEZU_WALK, i), fps: LIMEZU_WALK_FPS, loop: true }; });
  return { frameW: 16, frameH: 32, frames, animations };
}

export type CrewPoseState = 'down' | 'seated' | 'idle' | 'walk';
/** What a LimeZu crew member shows: a frame or an animation by name, the anchor, the rotation. Down (downed or dead):
 *  the standing s frame turned +90 degrees (clockwise) about the body's centre, so it lies across its own tile; seated:
 *  the standing frame facing the console's wall side; idle and walk: their animation for the 4-way facing. */
export interface CrewPose { name: string; animated: boolean; anchorY: number; rotation: number }
export function crewPose(slot: number, state: CrewPoseState, facing: Facing8, seatSide: Side | null): CrewPose {
  if (state === 'down') return { name: crewStandName(slot, 's'), animated: false, anchorY: 0.5, rotation: Math.PI / 2 };
  if (state === 'seated') return { name: crewStandName(slot, seatSide ?? facing4(facing)), animated: false, anchorY: LIMEZU_ANCHOR_Y, rotation: 0 };
  const d = facing4(facing);
  return state === 'idle' ? { name: crewIdleName(slot, d), animated: true, anchorY: LIMEZU_ANCHOR_Y, rotation: 0 } : { name: crewWalkName(slot, d), animated: true, anchorY: LIMEZU_ANCHOR_Y, rotation: 0 };
}
