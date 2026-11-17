import { useUi } from '../context';
import { CrtGlow, CrtProvider } from '../stage/CrtContext';
import { CrtScreen } from '../stage/CrtScreen';
import { Stage } from '../stage/Stage';
import { Banners } from './Banners';
import { FeelPanel } from './FeelPanel';
import { MapOverlay } from './MapOverlay';

/** The flight dev view's region: the map overlay, the feel panel and the pause banner, as a CRT screen (CRT map spec section 1). */
export function FlightUi() {
  const flight = useUi((s) => s.flight);
  if (!flight) return null;
  return (
    <Stage>
      <CrtProvider crt={flight.crt}>
        <CrtGlow>{flight.overlay && <MapOverlay overlay={flight.overlay} />}<FeelPanel rows={flight.feel} /><Banners banners={flight.banners} /></CrtGlow>
        <CrtScreen />
      </CrtProvider>
    </Stage>
  );
}
