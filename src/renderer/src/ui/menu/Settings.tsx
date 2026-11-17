import { Fragment } from 'react';
import { FULLSCREEN_KEY } from '../../../../shared/onlineSession';
import { VOLUME_CHANNELS, VOLUME_LABELS, VOLUME_STEPS } from '../../app/settingsStore';
import { useActions, useUi } from '../context';
import { MenuButton } from './MenuButton';
import { ACTION, KEYS, TABLE, VOLUME } from './styles';

/** The Master, Music and Effects volumes (Audio-i spec section 6), the live fullscreen toggle and the read-only controls
 *  list (main menu spec decision 4). */
export function Settings() {
  const settings = useUi((s) => s.settings), fullscreen = useUi((s) => s.menu.fullscreen), actions = useActions();
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
