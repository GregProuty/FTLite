import { Fragment } from 'react';
import { FULLSCREEN_KEY } from '../../../../shared/onlineSession';
import { THROTTLE_TAP_STEPS, VOLUME_CHANNELS, VOLUME_LABELS, VOLUME_STEPS } from '../../app/settingsStore';
import { SHAKE_LABELS, SHAKE_SETTINGS, validShake } from '../../render/shake';
import { MAP_GRID_LABELS, MAP_GRID_SETTINGS, validMapGrid } from '../../render/tactical/mapGrid';
import { useActions, useUi } from '../context';
import { BROWSER_F11_TEXT } from '../menuState';
import { MenuButton } from './MenuButton';
import { ACTION, KEYS, TABLE, VOLUME } from './styles';

/** The Master, Music and Effects volumes (Audio-i spec section 6), the screen shake (Feel-i), the map grid, the throttle tap, the live fullscreen toggle
 *  and the read-only controls list (main menu spec decision 4). */
export function Settings() {
  const settings = useUi((s) => s.settings), fullscreen = useUi((s) => s.menu.fullscreen), browser = useUi((s) => s.browser), actions = useActions();
  return (
    <>
      {VOLUME_CHANNELS.map((ch) => (
        <label key={ch}>{VOLUME_LABELS[ch]}
          <select data-testid={`volume-${ch}`} aria-label={VOLUME_LABELS[ch]} style={VOLUME} value={String(settings[ch])} disabled={!settings.available}
            onChange={(e) => actions.setVolume(ch, Number(e.target.value))}>
            {VOLUME_STEPS.map((step) => <option key={step} value={String(step)}>{step === 0 ? 'Off' : `${Math.round(step * 100)}%`}</option>)}
          </select>
        </label>
      ))}
      <label>Screen shake
        <select data-testid="shake" aria-label="Screen shake" style={VOLUME} value={settings.shake} disabled={!settings.available}
          onChange={(e) => { if (validShake(e.target.value)) actions.setShake(e.target.value); }}>
          {SHAKE_SETTINGS.map((s) => <option key={s} value={s}>{SHAKE_LABELS[s]}</option>)}
        </select>
      </label>
      <label>Map grid
        <select data-testid="map-grid" aria-label="Map grid" style={VOLUME} value={settings.mapGrid} disabled={!settings.available}
          onChange={(e) => { if (validMapGrid(e.target.value)) actions.setMapGrid(e.target.value); }}>
          {MAP_GRID_SETTINGS.map((s) => <option key={s} value={s}>{MAP_GRID_LABELS[s]}</option>)}
        </select>
      </label>
      <label>Throttle tap
        <select data-testid="throttle-tap" aria-label="Throttle tap" style={VOLUME} value={String(settings.throttleTapMs)} disabled={!settings.available}
          onChange={(e) => { const ms = Number(e.target.value); if (THROTTLE_TAP_STEPS.includes(ms)) actions.setThrottleTap(ms); }}>
          {THROTTLE_TAP_STEPS.map((ms) => <option key={ms} value={String(ms)}>{`${ms} ms`}</option>)}
        </select>
      </label>
      <label>
        <input type="checkbox" data-testid="valkyrn-laser-fit" aria-label="Valkyrn: fit laser instead of gun" checked={settings.valkyrnLaserFit} disabled={!settings.available}
          onChange={(e) => actions.setLaserFit(e.target.checked)} />
        Valkyrn: fit laser instead of gun
      </label>
      <label>
        <input type="checkbox" data-testid="fps-counter" aria-label="FPS counter" checked={settings.fpsCounter} disabled={!settings.available}
          onChange={(e) => actions.setFpsCounter(e.target.checked)} />
        FPS counter
      </label>
      <MenuButton id="fullscreen" text={`Fullscreen: ${fullscreen === null ? '…' : fullscreen ? 'On' : 'Off'}`} onClick={actions.toggleFullscreen}
        enabled={settings.fullscreenAvailable && fullscreen !== null} />
      <p data-testid="fullscreen-note">{browser.web ? BROWSER_F11_TEXT : `${FULLSCREEN_KEY} also toggles fullscreen.`}</p>
      {browser.playtestLog && <>
        <MenuButton id="download-playtest-log" text="Download playtest log" onClick={actions.downloadPlaytestLog} />
        {browser.playtestLogText && <p data-testid="playtest-log-status">{browser.playtestLogText}</p>}
      </>}
      <div data-testid="controls">
        <h3>Controls</h3>
        {settings.controls.map((section) => (
          <Fragment key={section.title}>
            <h4>{section.title}</h4>
            <table style={TABLE}><tbody>
              {section.rows.map((row, k) => <tr key={k}><td style={KEYS}>{row.keys}</td><td style={ACTION}>{row.action}</td></tr>)}
            </tbody></table>
          </Fragment>
        ))}
      </div>
      <MenuButton id="back" text="Back" onClick={actions.back} />
    </>
  );
}
