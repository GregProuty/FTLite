// A crew member on a painted ship (art spike): a soft drop shadow and a top-down inked figure (backpack, arms, shoulders
// in the player's colour, head with hair over the back to show the facing), with no base, rim or ring under it (owner
// 2026-11-17: no circles around the characters). Walking sways the figure and swings the arms; seated, the arms reach
// forward; downed, the body lies muted grey with a red cross badge; dead, all grey and faded. Drawn into one Graphics
// at the token's centre, in world units.
import type { Graphics } from 'pixi.js';
import type { TokenLook } from '../tokenModel';
import { BODY_GREY, HAIR, INK, mix, shade, SKIN } from './ink';

/** `stride`: the walk phase in radians (advances with distance walked); `moving`: walking this frame. */
export interface TokenMotion { stride: number; moving: boolean }

const LINE = { color: INK, join: 'round', cap: 'round' } as const;
/** The figure's size against the base's radius. */
const FIG = 0.8;

/** Clears `g` and draws the token for `look` (the player's facing is look.angle). */
export function drawPaintedToken(g: Graphics, look: TokenLook, motion: TokenMotion): void {
  const R = look.radius, up = look.tick !== null, dead = !up && !look.cross;
  const tone = up ? look.colour : mix(look.colour, BODY_GREY, dead ? 1 : 0.6);
  g.clear();
  g.alpha = look.fillAlpha;
  g.ellipse(R * 0.12, R * 0.16, R * 0.62, R * 0.7).fill({ color: INK, alpha: 0.22 });   // a soft drop shadow under the figure, lit from the top left
  if (!up) { drawLying(g, look, tone, dead); return; }
  const c = look.colour, skin = SKIN[look.slot]!, hair = HAIR[look.slot]!, F = R * FIG;
  const swing = motion.moving ? Math.sin(motion.stride) : 0, seated = look.ring !== null;
  g.save();
  g.rotateTransform(look.angle + swing * 0.12);
  const bob = motion.moving ? 1 + 0.06 * Math.abs(swing) : 1;
  g.scaleTransform(bob, bob);
  g.roundRect(-F * 0.84, -F * 0.44, F * 0.46, F * 0.88, F * 0.16).fill(shade(c, 0.5)).stroke({ width: 2, ...LINE });   // the backpack
  for (const s of [-1, 1]) {   // arms: walking, they swing opposite; seated, both reach forward to the console
    const hx = seated ? F * 0.7 : F * 0.14 + s * swing * F * 0.42, hy = s * (seated ? F * 0.44 : F * 0.82);
    g.moveTo(-F * 0.05, s * F * 0.62).lineTo(hx, hy).stroke({ width: F * 0.36, ...LINE });
    g.moveTo(-F * 0.05, s * F * 0.62).lineTo(hx, hy).stroke({ width: F * 0.2, color: shade(c, 0.8), cap: 'round' });
    g.circle(hx, hy, F * 0.16).fill(skin).stroke({ width: 1.6, ...LINE });
  }
  g.ellipse(-F * 0.04, 0, F * 0.46, F * 0.82).fill(c).stroke({ width: 2.6, ...LINE });                   // the shoulders
  g.ellipse(-F * 0.24, 0, F * 0.18, F * 0.64).fill({ color: shade(c, 0.7), alpha: 0.85 });
  g.ellipse(F * 0.08, -F * 0.32, F * 0.15, F * 0.26).fill({ color: mix(c, 0xffffff, 0.5), alpha: 0.75 });
  const hx = F * 0.16, hr = F * 0.38;                                                                    // the head: hair over the back
  g.circle(hx, 0, hr).fill(skin);
  g.moveTo(hx, 0).arc(hx, 0, hr, -Math.PI * 0.62, Math.PI * 0.62, true).closePath().fill(hair);
  g.circle(hx, 0, hr).stroke({ width: 2.6, ...LINE });
  g.restore();
}

/** Downed or dead: the body lies along the facing (a little off it, so it reads as fallen), muted grey. */
function drawLying(g: Graphics, look: TokenLook, tone: number, dead: boolean): void {
  const F = look.radius * FIG, skin = mix(SKIN[look.slot]!, BODY_GREY, dead ? 0.8 : 0.35);
  g.save();
  g.rotateTransform(look.angle + Math.PI / 5);
  for (const s of [-1, 1]) {
    g.moveTo(-F * 0.1, s * F * 0.3).lineTo(F * 0.2, s * F * 0.82).stroke({ width: F * 0.32, ...LINE });
    g.moveTo(-F * 0.1, s * F * 0.3).lineTo(F * 0.2, s * F * 0.82).stroke({ width: F * 0.17, color: shade(tone, 0.85), cap: 'round' });
  }
  g.roundRect(-F * 1.0, -F * 0.38, F * 1.5, F * 0.76, F * 0.36).fill(tone).stroke({ width: 2.6, ...LINE });
  g.ellipse(-F * 0.3, -F * 0.13, F * 0.5, F * 0.12).fill({ color: mix(tone, 0xffffff, 0.4), alpha: 0.6 });
  g.circle(F * 0.78, 0, F * 0.32).fill(skin).stroke({ width: 2.6, ...LINE });
  g.restore();
  if (look.cross) {   // a red cross badge at the top right of the base
    const R = look.radius, x = R * 0.72, y = -R * 0.72, k = R * 0.26;
    g.circle(x, y, k * 1.5).fill(0xf4efe6).stroke({ width: 2, ...LINE });
    g.moveTo(x - k, y).lineTo(x + k, y).moveTo(x, y - k).lineTo(x, y + k).stroke({ width: 3, color: look.crossColor });
  }
}
