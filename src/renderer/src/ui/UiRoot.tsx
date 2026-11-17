// The UI tree (React UI spec §1): in UI-i, the Menu region alone. UI-ii and UI-iii add the Hud, DuelUi and FlightUi
// regions beside it, each in its own boundary.
import { useUi } from './context';
import { Menu, MenuFallback } from './menu/Menu';
import { RegionBoundary } from './RegionBoundary';

export function UiRoot() {
  const page = useUi((s) => s.menu.page), phase = useUi((s) => s.online.status?.phase ?? 'none');
  return <RegionBoundary name="menu" resetKey={`${page}|${phase}`} fallback={<MenuFallback />}><Menu /></RegionBoundary>;
}
