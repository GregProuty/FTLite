// The sector HUD region (UI-iii): hud.ts's layers in hud.ts's order on the pixel stage, from the hud slice.
import { useUi } from '../context';
import { Stage } from '../stage/Stage';
import { Credits } from './Credits';
import { EventCardView } from './EventCardView';
import { Headline } from './Headline';
import { MapPanel } from './MapPanel';
import { PlayerBlock } from './PlayerBlock';
import { SidePanels } from './SidePanels';
import { SummaryBack, SummaryRows } from './SummaryCard';

const NO_FLASH: readonly number[] = [];

export function Hud() {
  const m = useUi((s) => s.hud); if (!m) return null;
  const flash = Math.floor(m.tick / 10) % 2 === 0 && m.calloutFlash.length ? m.calloutFlash : NO_FLASH;   // a Power callout's rows blink at about 3 Hz
  const deviceKind = m.players.find((p) => p.status === 'active')?.deviceKind ?? null;   // the banner glyphs follow the first joined player's device
  const summary = { phase: m.phase, lobbyShip: m.lobbyShip, lobbyLines: m.lobbyLines, summary: m.summary };
  return (
    <Stage>
      {m.phase !== 'lobby' && m.phase !== 'gameover' && <SidePanels m={m} flash={flash} />}
      {m.phase === 'running' && m.map && <MapPanel map={m.map} />}
      <SummaryBack {...summary} />
      <Headline phase={m.phase} message={m.message} progressLine={m.progressLine} notice={m.notice} deviceKind={deviceKind} />
      <SummaryRows {...summary} />
      {m.players.map((p, i) => <PlayerBlock key={i} i={i} p={p} phase={m.phase} flash={flash} />)}
      {m.eventCard && <EventCardView card={m.eventCard} />}
      {m.credits && <Credits lines={m.credits} scroll={m.creditsScroll} />}
    </Stage>
  );
}
