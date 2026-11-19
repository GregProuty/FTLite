// The duel region (spec §6): the map overlay under the readout, then the banners and the end card on top (scene.ts's order),
// and the online duel's F3 latency overlay (H-2b) last. CRT map spec sections 1 and 3: the console overlays sit in the CRT
// context and one glow wrapper, the CRT screen and bezel follow the banners, and the end card and the latency overlay stay
// outside, never covered and never amber. With a console view (Artemis spec 2026-11-17-artemis-consoles §2) the readout moves
// to the status table at the left, and the tab strip, side column and the Helm or Weapons block draw over the map.
// The contact window (enemy ship window spec §6.6) follows the station blocks while the frame carries one (Sci-1 adds the
// Science block), and the ship HUD (duel polish i spec §E) draws on the SHIP view, under the banners, with the interior's
// (non-CRT) theme colours. FTL targeting spec §1: the Weapons cards light the weapon picked up, and its targeting line
// draws over the contact window.
import { useUi } from '../context';
import { CrtGlow, CrtProvider } from '../stage/CrtContext';
import { CrtScreen } from '../stage/CrtScreen';
import { Stage } from '../stage/Stage';
import { Banners } from './Banners';
import { EndCard } from './EndCard';
import { LatencyOverlay } from './LatencyOverlay';
import { MapOverlay } from './MapOverlay';
import { HelmStation } from './HelmStation';
import { INTERNAL_W } from '../../../../shared/resolution';
import { CONSOLE_RESERVE, flightCard } from '../../render/duel/consoleLayout';
import { ReadoutPanel } from './ReadoutPanel';
import { SideColumn } from './SideColumn';
import { TabStrip } from './TabStrip';
import { ScienceStation } from './ScienceStation';
import { WeaponsStation } from './WeaponsStation';
import { FlightStation } from './FlightStation';
import { ContactWindow } from './ContactWindow';
import { TargetingLine } from './TargetingLine';
import { ShipHud } from './ShipHud';
import { SitCard } from './SitCard';

export function DuelUi() {
  const duel = useUi((s) => s.duel), latency = useUi((s) => s.latency);
  if (!duel) return null;
  return (
    <Stage>
      <CrtProvider crt={duel.crt}>
        <CrtGlow>
          {duel.overlay && <MapOverlay overlay={duel.overlay} placement={duel.console && duel.console.station !== 'ship' ? 'console' : 'column'} />}
          <ReadoutPanel rows={duel.readout.rows} help={duel.readout.help} placement={duel.console && duel.console.station !== 'ship' ? 'status' : 'column'} />
          {duel.console && <TabStrip tabs={duel.console.tabs} tabActions={duel.console.tabActions} />}
          {duel.console?.side && <SideColumn side={duel.console.side} />}
          {duel.console?.helm && <HelmStation helm={duel.console.helm} />}
          {duel.console?.weapons && <WeaponsStation weapons={duel.console.weapons} aim={duel.contact?.aimWeapon ?? null} />}
          {duel.console?.flight && <FlightStation flight={duel.console.flight} aim={duel.contact?.aimWeapon ?? null} />}
          {duel.console?.science && <ScienceStation science={duel.console.science} />}
          {duel.contact && <ContactWindow contact={duel.contact} />}
          {duel.contact?.aimWeapon && (duel.console?.weapons || duel.console?.flight) && <TargetingLine contact={duel.contact} seed={duel.pointer ?? null}
            from={duel.console?.flight ? flightCard(duel.contact.aimWeapon === 'torpedo' ? 1 : 0).anchor : undefined} />}
          {duel.hud && <ShipHud hud={duel.hud} />}
          {duel.sitCard && <SitCard card={duel.sitCard} />}
          <Banners banners={duel.banners} cx={duel.console && duel.console.station !== 'ship' ? (CONSOLE_RESERVE.left + INTERNAL_W - CONSOLE_RESERVE.right) / 2 : undefined} />
        </CrtGlow>
        <CrtScreen />
      </CrtProvider>
      {duel.end && <EndCard end={duel.end} />}
      {latency && <LatencyOverlay lines={latency} />}
    </Stage>
  );
}
