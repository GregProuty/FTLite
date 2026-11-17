// The duel region (spec §6): the map overlay under the readout, then the banners and the end card on top (scene.ts's order),
// and the online duel's F3 latency overlay (H-2b) last.
import { useUi } from '../context';
import { Stage } from '../stage/Stage';
import { Banners } from './Banners';
import { EndCard } from './EndCard';
import { LatencyOverlay } from './LatencyOverlay';
import { MapOverlay } from './MapOverlay';
import { ReadoutPanel } from './ReadoutPanel';

export function DuelUi() {
  const duel = useUi((s) => s.duel), latency = useUi((s) => s.latency);
  if (!duel) return null;
  return (
    <Stage>
      {duel.overlay && <MapOverlay overlay={duel.overlay} />}
      <ReadoutPanel rows={duel.readout.rows} help={duel.readout.help} />
      <Banners banners={duel.banners} />
      {duel.end && <EndCard end={duel.end} />}
      {latency && <LatencyOverlay lines={latency} />}
    </Stage>
  );
}
