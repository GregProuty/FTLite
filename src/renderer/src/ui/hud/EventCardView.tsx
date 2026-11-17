// hud.ts's event card (UI-iii): the title, up to two text lines, up to three choices with right-anchored votes, the
// status and the help, over a dark backdrop; y advances exactly as updateCard's.
import { memo, type ReactNode } from 'react';
import type { EventCard } from '../../render/hudModel';
import { EVENT_CARD } from '../../render/hudLayout';
import { AMBER, BACKDROP, BLUE, DIM, FONT_SIZE, LINE, TEXT } from '../../render/theme';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

const CX = EVENT_CARD.x + 16, CW = EVENT_CARD.w - 32;
const t = (key: string, text: string, x: number, y: number, tint: number, anchorX?: number): ReactNode =>
  text ? <PixelText key={key} text={text} x={x} y={y} size={FONT_SIZE} tint={tint} anchorX={anchorX} /> : null;

export const EventCardView = memo(function EventCardView({ card }: { card: EventCard }) {
  const out: ReactNode[] = [t('title', card.title, CX, EVENT_CARD.y + 6, AMBER)];
  let y = EVENT_CARD.y + 6 + LINE + 6;
  for (let k = 0; k < 2; k++) { const line = card.text[k]; if (line) { out.push(t(`t${k}`, line, CX, y, TEXT)); y += LINE; } }
  y += 10;
  for (let k = 0; k < 3; k++) {
    const ch = card.choices[k]; if (!ch) continue;
    const tint = !ch.enabled ? DIM : ch.blue ? BLUE : TEXT;
    out.push(t(`n${k}`, ch.number, CX, y, tint), t(`l${k}`, ch.text, CX + 28, y, tint), t(`v${k}`, ch.votes.length ? `< ${ch.votes.join(' ')}` : '', CX + CW, y, AMBER, 1));
    y += LINE + 4;
  }
  y += 6;
  out.push(t('status', card.status, CX, y, AMBER)); y += LINE;
  out.push(t('help', card.help, CX, y, DIM)); y += LINE + 6;
  return (
    <>
      <Box x={EVENT_CARD.x - 6} y={EVENT_CARD.y - 6} w={EVENT_CARD.w + 12} h={y - EVENT_CARD.y + 12} style={{ background: hex(BACKDROP, 0.6) }} />
      <Panel x={EVENT_CARD.x} y={EVENT_CARD.y} w={EVENT_CARD.w} h={y - EVENT_CARD.y} />
      {out}
    </>
  );
});
