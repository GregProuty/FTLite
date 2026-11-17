// hud.ts's player block (UI-iii, updatePlayer): the panel, the oxygen icon, the name, the health bar, lines 2-4 and
// the progress strip, then the seated player's console card above it.
import { memo } from 'react';
import { glyphName, seatedName, skillsLine, type HudModel, type HudPlayer } from '../../render/hudModel';
import { BLOCK_HP_W, BLOCK_HP_X, BLOCK_O2_X, blockRect } from '../../render/hudLayout';
import { AMBER, BAR_ON, DIM, FONT_SIZE, LINE, PAD, WARN } from '../../render/theme';
import { Bar } from '../stage/Bar';
import { Icon } from '../stage/Icon';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';
import { Row } from '../stage/Row';
import type { RowPart } from '../stage/rowLayout';
import { ConsoleCard } from './ConsoleCard';

/** Lines 2 and 3 (hud.ts lines 180-189). */
function middle(p: HudPlayer): [RowPart[], RowPart[]] {
  if (p.lifeText) return [[{ text: p.lifeText, tint: WARN }], []];
  if (p.seated !== null) return [[{ text: seatedName(p), tint: DIM }], [{ glyph: glyphName('cancel', p.deviceKind), text: p.cancelPrompt }]];
  if (p.status === 'bot') return [[{ text: p.character.name, tint: DIM }], []];
  return [
    p.interactPrompt || !p.carrying ? [{ glyph: p.interactPrompt ? glyphName('interact', p.deviceKind) : null, icon: p.interactIcon, text: p.interactPrompt }] : [{ text: 'Carrying a torpedo', tint: DIM }],
    [{ glyph: p.confirmPrompt ? glyphName('confirm', p.deviceKind) : null, icon: p.confirmIcon, text: p.confirmPrompt }]
  ];
}

export const PlayerBlock = memo(function PlayerBlock({ i, p, phase, flash }: { i: number; p: HudPlayer; phase: HudModel['phase']; flash: readonly number[] }) {
  const b = blockRect(i), X = b.x + PAD, Y = b.y;
  const name = (text: string, tint: number) => <PixelText text={text} x={X} y={Y} size={FONT_SIZE} tint={tint} />;
  if (p.status === 'empty') return <><Panel {...b} />{name(`P${i + 1}: press Interact to join`, DIM)}</>;
  if (p.status === 'reconnect') return <><Panel {...b} />{name(`P${i + 1}: RECONNECT`, WARN)}</>;
  if (phase === 'lobby') return (
    <>
      <Panel {...b} />
      {name(`P${i + 1}  ${p.character.name}`, AMBER)}
      <Row x={X} y={Y + LINE} parts={[{ text: p.character.asset && p.character.complication ? `${p.character.asset} / ${p.character.complication}` : '', tint: DIM }]} />
    </>
  );
  const [line2, line3] = middle(p);
  return (
    <>
      <Panel {...b} />
      {p.lowOxygen && <Icon name="icon.oxygen" x={X + BLOCK_O2_X} y={Y + 7} />}
      {name(`P${i + 1} ${p.status === 'bot' ? 'BOT' : p.character.name}`, AMBER)}
      <Bar x={X + BLOCK_HP_X} y={Y + 10} w={BLOCK_HP_W} h={10} fill={p.health / 100} colour={p.health > 50 ? BAR_ON : p.health > 25 ? AMBER : WARN} />
      <Row x={X} y={Y + LINE} parts={line2} />
      <Row x={X} y={Y + 2 * LINE} parts={line3} />
      <Row x={X} y={Y + 3 * LINE} parts={p.vote ? [{ text: p.vote, tint: AMBER }] : [{ text: skillsLine(p.skills), tint: DIM }]} />
      {p.progress > 0 && <Bar x={X} y={Y + LINE * 4 - 3} w={b.w - 2 * PAD} h={3} fill={p.progress} colour={AMBER} />}
      {p.console && <ConsoleCard i={i} p={p} flash={flash} />}
    </>
  );
});
