import { expect, it } from 'vitest';
import { sceneUi, type SceneOverlay } from '../src/renderer/src/app/duel/scene';
import type { MapOverlayView } from '../src/renderer/src/ui/views';

const map = { zoomText: 'x', scaleBar: null, snapHint: null } as unknown as MapOverlayView;
const ov = (p: Partial<SceneOverlay> = {}): SceneOverlay => ({ banner: null, layerPaused: false, end: null, ...p });

it('the interior view shows the pause banner on the interior line only, and never the map overlay', () => {
  expect(sceneUi('interior', ov({ banner: 'PAUSED', layerPaused: true }), 'PAUSED', map)).toEqual({ banners: { interior: 'PAUSED', tactical: null, notice: null }, overlay: null });
  expect(sceneUi('interior', ov(), 'PAUSED', null)).toEqual({ banners: { interior: null, tactical: null, notice: null }, overlay: null });
});
it('a paused map view shows the tactical banner, not the interior one', () => {
  expect(sceneUi('helm', ov({ banner: 'PAUSED', layerPaused: true }), 'PAUSED', map)).toEqual({ banners: { interior: null, tactical: 'PAUSED', notice: null }, overlay: map });
});
it('an online map view with a banner and the layer running keeps the interior-line banner', () => {
  expect(sceneUi('weapons', ov({ banner: 'CONNECTION LOST' }), 'PAUSED', map)).toEqual({ banners: { interior: 'CONNECTION LOST', tactical: null, notice: null }, overlay: map });
});
it('the notice passes through when set and is null when absent or empty', () => {
  expect(sceneUi('helm', ov({ notice: 'YOU: HELM' }), 'P', map).banners.notice).toBe('YOU: HELM');
  expect(sceneUi('helm', ov(), 'P', map).banners.notice).toBeNull();
  expect(sceneUi('helm', ov({ notice: '' }), 'P', map).banners.notice).toBeNull();
});
