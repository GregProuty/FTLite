// Light and feel for one ship interior (Art-i spec sections 5-8), shared by the sector view (renderer.ts) and the duel
// interior (duel/interiorView.ts): the grade, the lights, the particles, the impact flash, shake and hitstop, the
// fixtures (console screen blink, room lamps) and the starfield, all on one presentation clock. The views add the
// containers in the spec's order and pass each frame's signals; this module never reads input or the sim RNG.
import { AlphaFilter, AnimatedSprite, Container, Graphics, GraphicsContext, Sprite } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { FIRE_CAP, TICK_HZ } from '../sim/tuning';
import { consoles } from './consoleModel';
import type { DoorRect } from './doorModel';
import { feelScale, type FeelSetting } from './feel';
import { alertStrength, gradeCover, gradeModel, lampPoints, type GradeInput } from './gradeModel';
import { fireTiles } from './hazardTiles';
import { createShake, DUEL_FLASH_SHARE, FLASH_TICKS, flashAlpha, HITSTOP_SECONDS, kickShake, shakeOffset, SMOKE_SECONDS, stepShake } from './impactModel';
import { consoleGlow, fireGlow, glowRuns, lampLight, lampLit, screenCursor, screenPhase, stars } from './lightsModel';
import { RAMP, ROLE } from './palette';
import { createPresentClock } from './presentClock';
import { createEmitter, type Emitter } from './particles/emitter';
import { createParticleLayer } from './particles/particleLayer';
import { hashString } from './particles/random';
import {
  bobOffset, breachOpenings, debrisBurst, fireSources, hitSmokeSources, sparkSources, stepVents, ventingSources, wallVents, workSources, type HitSmoke, type WallVent, type Working
} from './particles/sources';
import type { Band } from './worldFit';
import type { GameAnimation } from './assets';
import { createBackdropLayer, type BackdropOption } from './twinkleLayer';
import { addBlast, BLAST_CAP, BLAST_SCALE, blastFrame, liveBlasts, roomCentroid, tileCentre, type Blast, type BlastKind, type BlastTimings } from './blastModel';
import { createPaintedFire } from './painted/fireLayer';
import { drawPaintedBlast } from './painted/blastDraw';
import { PAINTED_TIMING } from './painted/blastShapes';

/** This frame's hit: the sector's hit rooms, or the duel's whole interior (its hits carry no room). */
export type FeelHit = { rooms: readonly number[] } | { whole: true } | null;

export interface FeelFrame {
  /** The interior's sim state (the sector state, or the duel's d.interior). */
  state: SimState;
  grade: GradeInput;
  hit: FeelHit;
  /** Spark points: failed stations (sector) or damaged repair rooms (duel). */
  sparks: readonly { key: string; x: number; y: number }[];
  working: readonly Working[];
  /** One art pixel in the shaken container's parent units: 2 x the world scale. */
  artPx: number;
}

export interface InteriorFeel {
  /** Under the world: the painted backdrop over the whole stage with its twinkling stars (Art-v), or without it the
   *  procedural starfield filling the band (internal pixels). Sits at the stage origin in both views. */
  starfield: Container;
  /** Right above the tiles (multiply; its vacuum child is normal blend). */
  grade: Container;
  /** Into the console desks container: the screen blink and the lamp fixtures. */
  fixtures: Graphics;
  /** Into effects.above: the normal particles, the blasts (when given, Art-ii spec section 3), then the white flash. */
  above: Container;
  /** Above everything that shows the ship, under any text (additive). */
  lights: Container;
  /** Into effects.below (the art spike): the painted fire on a painted ship, empty elsewhere. */
  paintedBelow: Container;
  /** Into effects.above after `above` (the art spike): the painted blasts on a painted ship, empty elsewhere. */
  paintedAbove: Container;
  /** Presentation seconds (frozen by the hitstop). */
  time(): number;
  /** Returns the shake offset for the world (and, in the sector, the projectiles and callouts), and each player's bob.
   *  `dt` is the presentation dt: the views pass 0 while the game is paused, so everything here holds, except that
   *  the shake, a running hitstop and the flash drain on `realDt` (the frame's real seconds, default `dt`): a pause
   *  leaves no shake offset, no stopped clock and no lit flash. */
  draw(frame: FeelFrame, dt: number, realDt?: number): { shake: { x: number; y: number }; bob: number[] };
  reset(): void;
  /** Destroys this feel's Graphics and its shared GraphicsContexts; call it before destroying the view's containers. */
  destroy(): void;
}

const GLOW = { console: 5, fire: 8, lamp: 4 } as const;
const LAMP_SIZE = 4;

function glowContext(radius: number): GraphicsContext {
  const c = new GraphicsContext();
  for (const r of glowRuns(radius)) c.rect(r.x, r.y, r.w, r.h).fill({ color: 0xffffff, alpha: r.alpha });   // white: each glow's tint carries its palette colour
  return c;
}

/** Stop every playing AnimatedSprite under `root` (the hitstop), or start again the ones it stopped. */
function freezeAnimations(root: Container, held: Set<AnimatedSprite>, frozen: boolean): void {
  if (!frozen) { for (const s of held) if (!s.destroyed) s.play(); held.clear(); return; }
  const walk = (c: Container): void => { for (const k of c.children) { if (k instanceof AnimatedSprite && k.playing) { k.stop(); held.add(k); } walk(k); } };
  walk(root);
}

/** `world`: the ship's world container (its animations freeze in a hitstop). `band`: the starfield's band, internal pixels.
 *  `consoleArt`: the consoles are the bought sprites (Art-ii spec section 2), so no screen cursor blinks on them.
 *  `blasts`: the bought explosions (Art-ii spec section 3), played on hits and breach openings; absent, none draw.
 *  `backdrop`: the painted Deep Space (Red) and its star list (Art-v spec sections 1 and 2); absent, the procedural starfield draws.
 *  `painted`: the layout is drawn on a painted battlemap (the art spike): the fire, the blasts and the particles take the
 *  painted look there (code-drawn, so blasts show even without the bought explosions). */
export interface InteriorFeelOptions { world: Container; band: Band; feel: () => FeelSetting; consoleArt?: boolean; blasts?: Readonly<Record<BlastKind, GameAnimation>>; backdrop?: BackdropOption; painted?: (layoutId: string) => boolean }
export function createInteriorFeel(opts: InteriorFeelOptions): InteriorFeel {
  const starfield = new Container(), starG = new Graphics();
  const backdrop = opts.backdrop ? createBackdropLayer(opts.backdrop) : null;   // Art-v: replaces the procedural starfield
  starfield.addChild(...(backdrop ? [backdrop.container] : []), starG);
  const grade = new Container(); grade.blendMode = 'multiply';
  const coverCtx = new GraphicsContext(), ambient = new Graphics(coverCtx), alert = new Graphics(coverCtx), vacuum = new Graphics();
  ambient.tint = ROLE.ambient; alert.tint = ROLE.alert; vacuum.blendMode = 'normal';
  grade.addChild(ambient, alert, vacuum);
  const fixtures = new Graphics();
  const particles = createParticleLayer();
  const flash = new Graphics(); flash.visible = false;
  // The blasts: a pool of BLAST_CAP plain Sprites framed from the presentation clock, under the flash (Art-ii spec section 3).
  const blastLayer = new Container(), blastSprites: Sprite[] = [];
  const timing: BlastTimings | null = opts.blasts ? { room: { frames: opts.blasts.room.textures.length, fps: opts.blasts.room.fps }, hit: { frames: opts.blasts.hit.textures.length, fps: opts.blasts.hit.fps } } : null;
  if (opts.blasts) for (let k = 0; k < BLAST_CAP; k++) { const b = new Sprite(opts.blasts.room.textures[0]); b.anchor.set(0.5); b.scale.set(BLAST_SCALE); b.visible = false; blastLayer.addChild(b); blastSprites.push(b); }
  const paintSmokes = Array.from({ length: BLAST_CAP }, () => new Graphics()), paintBlasts = Array.from({ length: BLAST_CAP }, () => new Graphics()), paintBlastLayer = new Container(); paintBlastLayer.addChild(...paintSmokes, ...paintBlasts);
  const smokeFade: AlphaFilter[] = [];   // made on a painted ship's first blast (a filter needs a browser); attached only while its cloud shows
  const above = new Container(); above.addChild(particles.normal, ...(opts.blasts ? [blastLayer] : []), flash);
  const lights = new Container(); lights.blendMode = 'add';
  const paintedFire = createPaintedFire();
  const glowLayer = new Container(); lights.addChild(glowLayer, particles.add, paintedFire.glow);
  let painted = false;
  const ctx = { console: glowContext(GLOW.console), fire: glowContext(GLOW.fire), lamp: glowContext(GLOW.lamp) };
  const fireGlows = new Map<number, Graphics>(), held = new Set<AnimatedSprite>();
  let consoleGlows: Graphics[] = [], lampGlows: Graphics[] = [];

  const clock = createPresentClock(), shake = createShake();
  let builtFor = '', seed = 0, emitter: Emitter = createEmitter(0), vents: WallVent[] = [], puffs: number[] = [];
  let lamps: { room: number; x: number; y: number }[] = [], cover: DoorRect[] = [];
  let blasts: Blast[] = [];
  const blast = (kind: BlastKind, at: { x: number; y: number }, start: number): void => { if (opts.blasts || painted) blasts = addBlast(blasts, { kind, x: at.x, y: at.y, start }); };
  const clearBlasts = (): void => { blasts = []; for (const b of blastSprites) b.visible = false; for (const g of [...paintSmokes, ...paintBlasts]) g.clear(); };
  let smokes: HitSmoke[] = [], breachSeen: Uint8Array | null = null, flashTick = Number.NEGATIVE_INFINITY, flashShare = 1, flashLeft = 0, wasStopped = false;

  function build(state: SimState): void {
    const d = state.derived;
    builtFor = d.layoutHash; seed = hashString(d.layoutHash); emitter = createEmitter(seed);
    cover = gradeCover(state.layout.rows, d.width, d.height);
    coverCtx.clear(); for (const r of cover) coverCtx.rect(r.x, r.y, r.w, r.h); coverCtx.fill(0xffffff);
    vents = wallVents(state.layout.rows, d.width, d.height, d.layoutHash); puffs = [];
    lamps = lampPoints(d.roomTiles, d.width);
    for (const g of [...consoleGlows, ...lampGlows, ...fireGlows.values()]) g.destroy();
    fireGlows.clear();
    consoleGlows = consoles(state).map(() => { const g = new Graphics(ctx.console); g.tint = ROLE.screenA; glowLayer.addChild(g); return g; });
    lampGlows = lamps.map(() => { const g = new Graphics(ctx.lamp); glowLayer.addChild(g); return g; });
    smokes = []; breachSeen = null; flashTick = Number.NEGATIVE_INFINITY; flashLeft = 0; flash.visible = false; clearBlasts();
  }

  function onHit(frame: FeelFrame): void {
    const { state, hit } = frame, d = state.derived, f = feelScale(opts.feel());
    if (!hit || ('rooms' in hit && hit.rooms.length === 0)) return;
    kickShake(shake, f); clock.hitstop(HITSTOP_SECONDS * f.hitstop);
    flashTick = state.tick; flashLeft = FLASH_TICKS / TICK_HZ; flash.clear();
    const t = clock.t;
    if ('whole' in hit) {
      flashShare = DUEL_FLASH_SHARE;
      for (const r of cover) flash.rect(r.x, r.y, r.w, r.h);
      const floor = d.roomTiles.flat();
      if (floor.length) {
        const tile = floor[emitter.random.int(floor.length)]!;
        smokes.push({ key: `duel:${flashTick}`, tiles: [tile], until: t + SMOKE_SECONDS });
        blast('room', tileCentre(tile, d.width), t);   // the duel's one room blast, on the smoke's tile
      }
    } else {
      flashShare = 1;
      for (const room of hit.rooms) {
        for (const tile of d.roomTiles[room]!) { const tx = tile % d.width; flash.rect(tx * TILE_PX, ((tile - tx) / d.width) * TILE_PX, TILE_PX, TILE_PX); }
        smokes = smokes.filter((s) => s.key !== `room:${room}`);
        smokes.push({ key: `room:${room}`, tiles: d.roomTiles[room]!, until: t + SMOKE_SECONDS });
        blast('room', roomCentroid(d.roomTiles[room]!, d.width), t);
      }
    }
    flash.fill(ROLE.flash);
  }

  return {
    starfield, grade, fixtures, above, lights, paintedBelow: paintedFire.below, paintedAbove: paintBlastLayer,
    time: () => clock.t,
    draw(frame, dt, realDt = dt) {
      const { state } = frame, d = state.derived;
      if (builtFor !== d.layoutHash) build(state);
      painted = opts.painted?.(state.layout.id) ?? false;
      onHit(frame);
      const paused = dt === 0 && realDt > 0;
      const pdt = clock.advance(dt), t = clock.t;
      if (paused) clock.drain(realDt);   // a pause lets a running hitstop drain on real time; the rest of the clock stays held
      if (clock.stopped !== wasStopped) { wasStopped = clock.stopped; freezeAnimations(opts.world, held, wasStopped); }

      // Grade (section 5): ambient always, the alert pulse while on, vacuum per room (normal blend).
      const g = gradeModel(frame.grade, t);
      ambient.alpha = g.ambient; alert.visible = g.alert; alert.alpha = alertStrength(g);
      vacuum.clear();
      for (const v of g.vacuum) for (const tile of d.roomTiles[v.room]!) { const tx = tile % d.width; vacuum.rect(tx * TILE_PX, ((tile - tx) / d.width) * TILE_PX, TILE_PX, TILE_PX).fill({ color: ROLE.vacuum, alpha: v.strength }); }

      // Particles (section 6) and steam (section 8), on the presentation clock.
      const opened = breachOpenings(state.breaches.active, breachSeen); breachSeen = opened.seen;
      for (const s of opened.opened) {
        debrisBurst(emitter, state, s);   // even at pdt 0: the hit that opens a breach starts the hitstop this frame, and a 0 step holds the debris until the clock runs
        blast('hit', tileCentre(d.siteTile[s]!, d.width), t);   // and a hit spark on the opening
      }
      smokes = smokes.filter((s) => t < s.until);
      if (pdt > 0) stepVents(emitter, vents, puffs, t);
      emitter.step(pdt, [...fireSources(state), ...sparkSources(frame.sparks), ...ventingSources(state), ...workSources(frame.working), ...hitSmokeSources(smokes, t, d.width)]);
      particles.draw(emitter.particles, painted);
      if (painted) {   // the art spike: code-drawn blasts on the same live list, cap and clock (held in a hitstop and a pause)
        blasts = liveBlasts(blasts, t, PAINTED_TIMING);
        for (const b of blastSprites) b.visible = false;
        paintBlasts.forEach((g, k) => {
          const smoke = paintSmokes[k]!, live = blasts[k];
          g.clear(); smoke.clear();
          const fade = live ? drawPaintedBlast(smoke, g, live, t) : 0;
          if (fade > 0) { const f = smokeFade[k] ?? (smokeFade[k] = new AlphaFilter()); f.alpha = fade; }
          smoke.visible = fade > 0; smoke.filters = fade > 0 && fade < 1 ? [smokeFade[k]!] : [];
        });
      } else if (timing && opts.blasts) {
        const anims = opts.blasts;
        blasts = liveBlasts(blasts, t, timing);   // each removed after its last frame; held while the clock holds (hitstop, pause)
        blastSprites.forEach((b, k) => { const live = blasts[k]; b.visible = live !== undefined; if (live) { b.texture = anims[live.kind].textures[blastFrame(live, t, timing)]!; b.position.set(live.x, live.y); } });
      }

      // Lights (section 5) and fixtures (section 8).
      fixtures.clear();
      consoles(state).forEach((c, k) => {
        const glow = consoleGlows[k];
        if (glow) { glow.position.set(c.x + TILE_PX / 2, c.y + TILE_PX / 2); glow.alpha = consoleGlow(c.look); }
        if (c.look === 'down' || opts.consoleArt) return;   // the bought console art has no procedural screen to blink on (Art-ii spec section 2)
        const r = screenCursor(c.x, c.y, c.picture.screen);
        fixtures.rect(r.x, r.y, r.w, r.h).fill(screenPhase(seed, c.members[0]!, t) === 'A' ? ROLE.screenA : ROLE.screenB);
      });
      lamps.forEach((l, k) => {
        const light = lampLight(g.alert, lampLit(seed, l.room, t)), glow = lampGlows[k]!;
        glow.position.set(l.x + LAMP_SIZE / 2, l.y + LAMP_SIZE / 2); glow.tint = light.on ? ROLE.lampOn : ROLE.lampOff; glow.alpha = light.alpha;
        fixtures.rect(l.x, l.y, LAMP_SIZE, LAMP_SIZE).fill(light.alpha === 0 ? ROLE.wallShadow : light.on ? ROLE.lampOn : ROLE.lampOff);   // a flickered-off lamp goes dark
      });
      paintedFire.draw(painted ? state : null, t);
      const burning: number[] = [];   // the pixel glow; a painted ship's fire brings its own
      if (!painted) for (let r = 0; r < d.volume.length; r++) if (state.rooms.fire[r]! > 0) burning.push(...fireTiles(d.roomTiles[r]!, state.rooms.fire[r]!, FIRE_CAP));
      for (const [tile, glow] of fireGlows) if (!burning.includes(tile)) { glow.destroy(); fireGlows.delete(tile); }
      for (const tile of burning) {
        let glow = fireGlows.get(tile);
        if (!glow) { glow = new Graphics(ctx.fire); glow.tint = RAMP.fire[2]!; glowLayer.addChild(glow); fireGlows.set(tile, glow); }
        const tx = tile % d.width; glow.position.set(tx * TILE_PX + TILE_PX / 2, ((tile - tx) / d.width) * TILE_PX + TILE_PX / 2); glow.alpha = fireGlow(seed, tile, t);
      }

      // The white flash (section 7): 2 sim ticks from the tick the hit was seen.
      // Bounded by real time too (flashLeft), so a stopped sim tick (pause, ended duel) cannot leave it lit.
      const ticksSince = state.tick - flashTick, fa = flashLeft > 0 ? flashAlpha(ticksSince, feelScale(opts.feel()), flashShare) : 0;
      flash.visible = fa > 0; flash.alpha = fa; flashLeft = Math.max(0, flashLeft - realDt);

      // The starfield (section 8), or the painted backdrop's twinkle on the same clock, scaled by the feel's flash (Art-v).
      starG.clear();
      if (backdrop) backdrop.draw(t, feelScale(opts.feel()).flash);
      else for (const s of stars(seed, opts.band, t, frame.artPx)) starG.rect(s.x, s.y, frame.artPx, frame.artPx).fill(s.layer === 0 ? RAMP.vent[3]! : RAMP.vent[1]!);   // one art pixel at this world scale

      stepShake(shake, paused ? realDt : pdt);   // a pause drains the shake on real time and shows none
      const bob: number[] = [];
      for (const w of frame.working) bob[w.pid] = bobOffset(t);
      return { shake: paused ? { x: 0, y: 0 } : shakeOffset(shake, frame.artPx), bob };
    },
    reset() {
      clock.reset(); Object.assign(shake, createShake()); emitter.clear(); smokes = []; breachSeen = null; puffs = []; clearBlasts();
      flashTick = Number.NEGATIVE_INFINITY; flashLeft = 0; flash.visible = false;
      if (wasStopped) { wasStopped = false; freezeAnimations(opts.world, held, false); }
    },
    destroy() {
      // Every Graphics first, with no options so each owned context goes too (a parent's destroy({ children: true })
      // passes options, which leaves owned contexts), and a Graphics never destroys a context it was given; then the
      // shared contexts. The duel builds a new interior on every restart, and these would otherwise outlive it.
      for (const g of [ambient, alert, vacuum, fixtures, flash, starG, ...paintSmokes, ...paintBlasts, ...consoleGlows, ...lampGlows, ...fireGlows.values()]) g.destroy();
      paintedFire.destroy(); for (const f of smokeFade) f.destroy();
      consoleGlows = []; lampGlows = []; fireGlows.clear(); held.clear();
      coverCtx.destroy(); ctx.console.destroy(); ctx.fire.destroy(); ctx.lamp.destroy();
    }
  };
}
