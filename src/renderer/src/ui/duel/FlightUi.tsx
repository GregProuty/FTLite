import { useUi } from '../context';
import { Stage } from '../stage/Stage';
import { Banners } from './Banners';
import { FeelPanel } from './FeelPanel';
import { MapOverlay } from './MapOverlay';

/** The flight dev view's region: the map overlay, the feel panel and the pause banner. */
export function FlightUi() {
  const flight = useUi((s) => s.flight);
  if (!flight) return null;
  return <Stage>{flight.overlay && <MapOverlay overlay={flight.overlay} />}<FeelPanel rows={flight.feel} /><Banners banners={flight.banners} /></Stage>;
}
