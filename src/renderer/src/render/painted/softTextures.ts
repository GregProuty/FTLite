// Small white textures for the painted particles (art spike), drawn once on a canvas the first time a painted ship shows:
// a fully soft glow dot (sparks, embers), a soft-edged puff (smoke, steam, foam) and an ink-edged shard (debris).
// White so each sprite's tint carries its colour. Lazy, so nothing here runs on a ship without a painting (or in node).
import { DOMAdapter, Texture } from 'pixi.js';

export interface SoftTextures { glow: Texture; puff: Texture; shard: Texture; streak: Texture }
let made: SoftTextures | null = null;

function canvasTexture(size: number, paint: (c: CanvasRenderingContext2D, s: number) => void): Texture {
  const canvas = DOMAdapter.get().createCanvas(size, size), ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  paint(ctx, size);
  return Texture.from(canvas as HTMLCanvasElement);
}

function radial(c: CanvasRenderingContext2D, s: number, stops: readonly [number, number][]): void {
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  for (const [at, a] of stops) g.addColorStop(at, `rgba(255,255,255,${a})`);
  c.fillStyle = g; c.fillRect(0, 0, s, s);
}

export function softTextures(): SoftTextures {
  if (made) return made;
  made = {
    glow: canvasTexture(32, (c, s) => radial(c, s, [[0, 1], [0.35, 0.8], [1, 0]])),
    puff: canvasTexture(48, (c, s) => radial(c, s, [[0, 0.85], [0.35, 0.65], [0.7, 0.22], [1, 0]])),
    streak: canvasTexture(32, (c) => {   // an ink-edged capsule: the tint colours the core, the edge stays dark
      const cap = (w: number, h: number): void => { c.beginPath(); c.roundRect(16 - w / 2, 16 - h / 2, w, h, h / 2); };
      cap(30, 12); c.fillStyle = 'rgba(30,24,20,0.9)'; c.fill();
      cap(25, 6); c.fillStyle = '#ffffff'; c.fill();
    }),
    shard: canvasTexture(16, (c) => {
      c.beginPath(); c.moveTo(2, 13); c.lineTo(14, 9); c.lineTo(6, 2); c.closePath();
      c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 2; c.lineJoin = 'round'; c.strokeStyle = 'rgba(30,24,20,1)'; c.stroke();
    })
  };
  return made;
}
