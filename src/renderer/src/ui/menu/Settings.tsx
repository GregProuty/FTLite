import { Fragment } from 'react';
import { FULLSCREEN_KEY } from '../../../../shared/onlineSession';
import { VOLUME_STEPS } from '../../app/settingsStore';
import { useActions, useUi } from '../context';
import { MenuButton } from './MenuButton';
import { ACTION, KEYS, TABLE, VOLUME } from './styles';

/** The sound volume, the live fullscreen toggle and the read-only controls list (main menu spec decision 4). */
export function Settings() {
  const settings = useUi((s) => s.settings), fullscreen = useUi((s) => s.menu.fullscreen), actions = useActions();
  return (
    <>
      <label>Sound volume
        <select data-testid="volume" aria-label="Sound volume" style={VOLUME} value={String(settings.volume)} disabled={!settings.available}
          onChange={(e) => actions.setVolume(Number(e.target.value))}>
          {VOLUME_STEPS.map((step) => <option key={step} value={String(step)}>{step === 0 ? 'Off' : `${Math.round(step * 100)}%`}</option>)}
        </select>
      </label>
      <MenuButton id="fullscreen" text={`Fullscreen: ${fullscreen === null ? '…' : fullscreen ? 'On' : 'Off'}`} onClick={actions.toggleFullscreen}
        enabled={settings.fullscreenAvailable && fullscreen !== null} />
      <p data-testid="fullscreen-note">{`${FULLSCREEN_KEY} also toggles fullscreen.`}</p>
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
