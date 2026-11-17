// The UI tree (React UI spec §1): the Menu (in the app), and the duel and flight regions while their slices are set,
// each in its own boundary. The regions' reset keys are their sinks' epochs.
import { DuelUi } from './duel/DuelUi';
import { FlightUi } from './duel/FlightUi';
import { useUi } from './context';
import { Menu, MenuFallback } from './menu/Menu';
import { RegionBoundary } from './RegionBoundary';

export function UiRoot(props: { menu?: boolean }) {
  const page = useUi((s) => s.menu.page), phase = useUi((s) => s.online.status?.phase ?? 'none'), resetEpoch = useUi((s) => s.menu.resetEpoch);
  const hasDuel = useUi((s) => s.duel !== null), hasFlight = useUi((s) => s.flight !== null);
  const duelEpoch = useUi((s) => s.epochs.duel), flightEpoch = useUi((s) => s.epochs.flight);
  return (
    <>
      {hasDuel && <RegionBoundary name="duel" resetKey={String(duelEpoch)} fallback={null}><DuelUi /></RegionBoundary>}
      {hasFlight && <RegionBoundary name="flight" resetKey={String(flightEpoch)} fallback={null}><FlightUi /></RegionBoundary>}
      {(props.menu ?? true) && <RegionBoundary name="menu" resetKey={`${page}|${phase}|${resetEpoch}`} fallback={<MenuFallback />}><Menu /></RegionBoundary>}
    </>
  );
}
