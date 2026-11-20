import { Container, Graphics, BitmapText, Sprite } from 'pixi.js';
import { INTERNAL_W } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import type { GameAssets } from './assets';
import { bubbleAnchor, CALLOUT_LIFT_PUNY, type Bubble } from './calloutModel';
import { CREW_COLORS } from './crewSprites';
import { CALLOUT_LIFT_DOWN_LIMEZU, CALLOUT_LIFT_LIMEZU } from './crewArt';
import { CALLOUT_LIFT_3D, CALLOUT_LIFT_DOWN_3D } from './crew3dModel';
import { featureReady } from './fallback';
import { Life, LifeState } from '../sim/components';

const PAD = 4, ICON = 16, MAX_BUBBLES = 4, TAIL = 5, BG = 0x10131a, TEXT = 0xffffff;

/** Callout bubbles (spec Coop-i section 3): one per player over the crew member's head, in internal pixels, drawn between the world and the HUD. Display objects are made once and reused. */
export function createCalloutLayer(assets: GameAssets, crew3d: () => boolean = () => true) {
  const container = new Container();
  const missing = new Set(assets.missing);
  const limezu = featureReady(missing, 'crew') && featureReady(missing, 'crewArt');   // over the taller bought crew (Art-ii spec section 1)
  /** A standing LimeZu head is 50 units up; a downed one lies across its tile (top about 16 up), so its bubble sits lower (plan review R1-F1). */
  const use3d = featureReady(missing, 'crew3d');   // Crew3D spec section 4: over the rendered figures, on every ship
  const liftFor = (state: SimState, pid: number): number => {
    const eid = state.crew[pid];
    if (use3d && crew3d()) return eid !== undefined && Life.state[eid] !== LifeState.Conscious ? CALLOUT_LIFT_DOWN_3D : CALLOUT_LIFT_3D;
    if (!limezu) return CALLOUT_LIFT_PUNY;
    return eid !== undefined && Life.state[eid] !== LifeState.Conscious ? CALLOUT_LIFT_DOWN_LIMEZU : CALLOUT_LIFT_LIMEZU;
  };
  const pool = Array.from({ length: MAX_BUBBLES }, () => {
    const root = new Container(); root.visible = false;
    const g = new Graphics();
    const label = new BitmapText({ text: '', style: { fontFamily: assets.fontFamily, fontSize: 16 } }); label.tint = TEXT; label.roundPixels = true;
    const icon = new Sprite(); icon.visible = false;
    root.addChild(g, icon, label); container.addChild(root);
    return { root, g, label, icon, key: '', w: 0 };
  });
  return {
    container,
    draw(state: SimState, list: readonly Bubble[], fit: { scale: number; x: number; y: number }): void {
      const placed: { x: number; y: number; w: number }[] = [];
      pool.forEach((b, k) => {
        const item = list[k];
        b.root.visible = !!item;
        if (!item) return;
        const iconOk = !!item.icon && assets.has(item.icon);
        const key = `${item.pid}|${item.text}|${iconOk ? item.icon : ''}`;
        if (key !== b.key) {
          b.key = key; b.label.text = item.text;
          if (iconOk) { b.icon.texture = assets.texture(item.icon!); b.icon.width = ICON; b.icon.height = ICON; }
          b.icon.visible = iconOk;
          const w = Math.ceil(b.label.width) + PAD * 2 + (iconOk ? ICON + 3 : 0), h = 20; b.w = w;
          b.icon.position.set(PAD, 2); b.label.position.set(PAD + (iconOk ? ICON + 3 : 0), 2);
          const edge = CREW_COLORS[item.pid % CREW_COLORS.length]!;
          b.g.clear().roundRect(0, 0, w, h, 4).fill({ color: BG, alpha: 0.92 }).stroke({ width: 2, color: edge })
            .poly([w / 2 - TAIL, h, w / 2 + TAIL, h, w / 2, h + TAIL]).fill({ color: edge });
        }
        const a = bubbleAnchor(state, item.pid, fit, liftFor(state, item.pid)), w = b.w;
        let x = Math.round(Math.max(4, Math.min(INTERNAL_W - w - 4, a.x - w / 2))), y = Math.round(a.y - 20 - TAIL);
        const hits = (): boolean => placed.some((p) => x < p.x + p.w + 2 && p.x < x + w + 2 && y < p.y + 22 && p.y < y + 22);
        while (hits()) y -= 23;                                  // crew close together: stack the later bubble above the earlier one
        placed.push({ x, y, w }); b.root.position.set(x, y);
      });
    }
  };
}
