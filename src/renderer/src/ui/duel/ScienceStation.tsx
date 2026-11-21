// The Science station block (Sci-1 spec 2026-11-17-science-scans §7.3): the map and the contact window are the Science
// console's controls, so the block holds the hover readout (bearing and range from the crew ship to the cursor) and the
// key help. UI round §2.4: the sensor range (the gone power strip's RANGE) on the top row. Hacking spike (spec
// 2026-11-20-science-hacking-design §3.1): the SCAN and HACK modules' bar pips (Science splits its Sensors bars between
// them as Weapons splits its own: a left click on HACK's pips adds a bar, a right click removes one; SCAN shows the rest),
// the three room buttons (a click hacks that enemy room, a click on the running one cancels), the hold's bar and the
// status line. Both commands ride the console's ship queue.
import { memo, useRef, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';
import type { SciencePanel } from '../../render/duel/consoleModel';
import type { HackPanel } from '../../render/duel/scienceModel';
import { STATION } from '../../render/duel/consoleLayout';
import { AMBER, DIM, FONT_NATIVE, FONT_SIZE, TEXT } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useActions } from '../context';
import { Bar } from '../stage/Bar';
import { Box } from '../stage/Box';
import { Button } from '../stage/Button';
import { hex } from '../stage/color';
import { useCrt } from '../stage/CrtContext';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';
import { useConsoleLayout } from '../stage/useStage';
import { PIP_GAP, PIP_H, PIP_W } from './WeaponsStation';

const stop = (e: SyntheticEvent): void => e.preventDefault();
/** The rows' offsets from the block's top (internal px). */
export const SCIENCE_ROWS = { pips: 64, rooms: 86, bar: 116, status: 124, help: 152 } as const;
/** HACK's label and pips start this far right of the block's left edge (SCAN's at 0). */
export const HACK_COLUMN_X = 142;
export const SCIENCE_HELP = 'CLICK: SELECT   S: SCAN   T: NEXT';
/** Code review 2: a refused click's reason shows on the status line this long (ms). Code review 3: a press on the running
 *  room within this long of starting it (a double click) does not cancel it (ms). */
export const REFUSAL_SHOW_MS = 1500, CANCEL_GUARD_MS = 500;
const clock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** One module's pips; `onPower` (HACK only) takes a left click as +1 and a right click as −1. */
function ModulePips({ name, x, y, bars, pips, crt, onPower }: { name: 'scan' | 'hack'; x: number; y: number; bars: number; pips: number; crt: boolean; onPower?: (delta: 1 | -1) => void }) {
  const down = (e: ReactPointerEvent<HTMLDivElement>): void => { e.preventDefault(); if (e.button === 0) onPower?.(1); else if (e.button === 2) onPower?.(-1); };
  return (
    <>
      {Array.from({ length: pips }, (_, k) => {
        const lit = k < bars, od = k === pips - 1;
        return <Box key={k} x={x + k * (PIP_W + PIP_GAP)} y={y} w={PIP_W} h={PIP_H} attrs={{ 'data-ui-science-pip': `${name}:${k}:${lit ? 'on' : 'off'}` }}
          style={{ background: lit ? hex(crt ? (od ? CRT.hot : CRT.main) : AMBER) : 'transparent', border: `1px ${od ? 'dashed' : 'solid'} ${hex(crt ? CRT.mid : DIM)}` }} />;
      })}
      {onPower && (
        <div data-testid={`console-science-pips-${name}`} role="button" onPointerDown={down} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop}>
          <Box x={x} y={y} w={pips * (PIP_W + PIP_GAP) - PIP_GAP} h={PIP_H} style={{ pointerEvents: 'auto', cursor: 'pointer' }} />
        </div>
      )}
    </>
  );
}

function HackRows({ hack, top }: { hack: HackPanel; top: number }) {
  const actions = useActions(), { crt } = useCrt(), x0 = STATION.x + 8, right = STATION.x + STATION.w - 8;
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT, hot = crt ? CRT.hot : AMBER;
  const [note, setNote] = useState<{ text: string; at: number } | null>(null), started = useRef(-Infinity);
  const refuse = (text: string): void => setNote({ text, at: clock() });
  const power = (delta: 1 | -1): void => {   // code review 2: a refused click says why instead of doing nothing
    const why = delta === 1 ? hack.addRefusal : hack.removeRefusal;
    if (why !== null) { refuse(`HACK: ${why}`); return; }
    actions.console.ship?.({ kind: 'sciencePower', delta });
  };
  const room = (k: number): void => {
    const r = hack.rooms[k]!;
    if (r.state === 'running') { if (clock() - started.current >= CANCEL_GUARD_MS) actions.console.ship?.({ kind: 'hack', room: -1 }); return; }   // code review 3: no double-click cancel
    if (r.state === 'down' || r.state === 'dim') { refuse(r.refusal ?? hack.status); return; }
    started.current = clock();
    actions.console.ship?.({ kind: 'hack', room: k });
  };
  const shown = note !== null && clock() - note.at < REFUSAL_SHOW_MS ? note.text : null;
  const bw = Math.floor((right - x0 - 2 * 6) / 3);
  return (
    <>
      <PixelText text="SCAN" x={x0} y={top + SCIENCE_ROWS.pips - 3} size={FONT_NATIVE} tint={main} />
      <ModulePips name="scan" x={x0 + 44} y={top + SCIENCE_ROWS.pips} bars={hack.scan} pips={hack.pips} crt={crt} />
      <PixelText text="HACK" x={x0 + HACK_COLUMN_X} y={top + SCIENCE_ROWS.pips - 3} size={FONT_NATIVE} tint={hack.online ? hot : main} />
      <ModulePips name="hack" x={x0 + HACK_COLUMN_X + 44} y={top + SCIENCE_ROWS.pips} bars={hack.hack} pips={hack.pips} crt={crt} onPower={power} />
      {hack.rooms.map((r, k) => (
        <Button key={k} name={`hack-${k}`} label={r.label} x={x0 + k * (bw + 6)} y={top + SCIENCE_ROWS.rooms} w={bw} h={24}
          lit={r.state === 'running'} dim={r.state === 'dim'}
          onPress={() => room(k)} />
      ))}
      <Bar x={x0} y={top + SCIENCE_ROWS.bar} w={right - x0} h={3} fill={hack.progress ?? 0} colour={hot} />
      <PixelText text={shown ?? hack.status} x={x0} y={top + SCIENCE_ROWS.status} size={FONT_NATIVE} tint={shown !== null || hack.alert ? hot : dim} />
    </>
  );
}

export const ScienceStation = memo(function ScienceStation({ science }: { science: SciencePanel }) {
  const { crt } = useCrt(), top = useConsoleLayout().stationTop('science'), x0 = STATION.x + 8, dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT;
  return (
    <>
      <Panel x={STATION.x} y={top} w={STATION.w} h={STATION.h.science} />
      <PixelText text="SCIENCE" x={x0} y={top + 6} size={FONT_NATIVE} tint={dim} />
      <PixelText text={`SENSOR RANGE ${science.range}`} x={STATION.x + STATION.w - 8} y={top + 6} size={FONT_NATIVE} tint={dim} anchorX={1} />
      <PixelText text={science.hover ?? 'BRG --- RNG ---'} x={x0} y={top + 24} size={FONT_SIZE} tint={main} />
      {science.hack && <HackRows hack={science.hack} top={top} />}
      <PixelText text={SCIENCE_HELP} x={x0} y={top + (science.hack ? SCIENCE_ROWS.help : 66)} size={FONT_NATIVE} tint={dim} />
    </>
  );
});
