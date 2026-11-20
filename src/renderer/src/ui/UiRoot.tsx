// The UI tree (React UI spec §1): the Menu (in the app), and the sector HUD, duel and flight regions while their slices are set,
// each in its own boundary. The regions' reset keys are their sinks' epochs.
import { DuelUi } from './duel/DuelUi';
import { FlightUi } from './duel/FlightUi';
import { FpsCounter } from './FpsCounter';
import { Hud } from './hud/Hud';
import { useUi } from './context';
import { Menu, MenuFallback } from './menu/Menu';
import { RegionBoundary } from './RegionBoundary';

export function UiRoot(props: { menu?: boolean }) {
  const page = useUi((s) => s.menu.page), phase = useUi((s) => s.online.status?.phase ?? 'none'), resetEpoch = useUi((s) => s.menu.resetEpoch);
  const hasHud = useUi((s) => s.hud !== null), hudEpoch = useUi((s) => s.epochs.hud);
  const hasDuel = useUi((s) => s.duel !== null), hasFlight = useUi((s) => s.flight !== null);
  const duelEpoch = useUi((s) => s.epochs.duel), flightEpoch = useUi((s) => s.epochs.flight);
  return (
    <>
      {hasHud && <RegionBoundary name="hud" resetKey={String(hudEpoch)} fallback={null}><Hud /></RegionBoundary>}
      {hasDuel && <RegionBoundary name="duel" resetKey={String(duelEpoch)} fallback={null}><DuelUi /></RegionBoundary>}
      {hasFlight && <RegionBoundary name="flight" resetKey={String(flightEpoch)} fallback={null}><FlightUi /></RegionBoundary>}
      {(props.menu ?? true) && <RegionBoundary name="menu" resetKey={`${page}|${phase}|${resetEpoch}`} fallback={<MenuFallback />}><Menu /></RegionBoundary>}
      <FpsCounter />
    </>
  );
}
