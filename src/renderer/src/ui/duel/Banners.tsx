// UI round §2.4a: the ship view's TORPEDO INBOUND.
// The pause line and the online notice. UI round spec §1.5: one pause line (the local pause, the online pause reasons,
// the flight view's pause) at top centre, native size, on a panel from y 66 to 90: under the map's headline (y 12) and
// info line (y 44), clear of the tab strip, the hull bar and the side panels. The notice keeps its place.
import { memo } from 'react';
import { INTERNAL_W } from '../../../../shared/resolution';
import { FONT_NATIVE, FONT_SIZE, TEXT, textPx, WARN } from '../../render/theme';
import { ALERT_BLINK_HZ, blink, CRT } from '../../render/tactical/crtTheme';
import { useCrt } from '../stage/CrtContext';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';
import type { Banners as BannerLines } from '../views';

const SIZE = FONT_SIZE * 1.5, PLAY_CX = INTERNAL_W / 2;
export const PAUSE_Y = 66, PAUSE_H = 24, PAUSE_PAD = 12;
/** The pause line's panel for `text`, centred on the screen (its width rounded up to even, so it centres on whole px). */
export function pauseLineBox(text: string): { x: number; y: number; w: number; h: number } {
  const w = 2 * Math.ceil(textPx(text, 1) / 2) + 2 * PAUSE_PAD;
  return { x: Math.round(INTERNAL_W / 2 - w / 2), y: PAUSE_Y, w, h: PAUSE_H };
}

/** On a CRT screen the text is `hot`. */
export const Banners = memo(function Banners({ banners, cx = PLAY_CX }: { banners: BannerLines; cx?: number }) {
  const { crt, now } = useCrt(), TEXT_TINT = crt ? CRT.hot : TEXT;
  const alertTint = crt ? (blink(now, ALERT_BLINK_HZ) ? CRT.hot : CRT.main) : blink(now, ALERT_BLINK_HZ) ? WARN : TEXT;
  const pause = banners.tactical ?? banners.interior, box = pause !== null ? pauseLineBox(pause) : null;
  return (
    <>
      {pause !== null && box && <>
        <Panel x={box.x} y={box.y} w={box.w} h={box.h} />
        <PixelText text={pause} x={INTERNAL_W / 2} y={box.y + box.h / 2} size={FONT_NATIVE} tint={TEXT_TINT} anchorX={0.5} anchorY={0.5} />
      </>}
      {banners.alert !== null && <div data-ui-alert="" style={{ display: 'contents' }}><PixelText text={banners.alert} x={INTERNAL_W / 2} y={100} size={FONT_SIZE} tint={alertTint} anchorX={0.5} anchorY={0.5} /></div>}
      {banners.notice !== null && <PixelText text={banners.notice} x={cx} y={130} size={SIZE} tint={TEXT_TINT} anchorX={0.5} anchorY={0.5} />}
    </>
  );
});
