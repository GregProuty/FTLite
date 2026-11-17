// The duel region (spec §6): the map overlay under the readout, then the banners and the end card on top (scene.ts's order).
import { useUi } from '../context';
import { Stage } from '../stage/Stage';
import { Banners } from './Banners';
import { EndCard } from './EndCard';
import { MapOverlay } from './MapOverlay';
import { ReadoutPanel } from './ReadoutPanel';

export function DuelUi() {
  const duel = useUi((s) => s.duel);
  if (!duel) return null;
  return (
    <Stage>
      {duel.overlay && <MapOverlay overlay={duel.overlay} />}
      <ReadoutPanel rows={duel.readout.rows} help={duel.readout.help} />
      <Banners banners={duel.banners} />
      {duel.end && <EndCard end={duel.end} />}
    </Stage>
  );
}
