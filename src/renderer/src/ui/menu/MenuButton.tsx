// The menu's one button: a data-testid, the label, enabled or dimmed, and optionally pressed (one option of a choice);
// a submit button takes no click handler.
import { BUTTON, BUTTON_OFF, BUTTON_ON } from './styles';

export function MenuButton(props: { id: string; text: string; onClick?: () => void; enabled?: boolean; type?: 'button' | 'submit'; pressed?: boolean }) {
  const enabled = props.enabled ?? true, type = props.type ?? 'button';
  const style = !enabled ? BUTTON_OFF : props.pressed ? BUTTON_ON : BUTTON;
  return <button type={type} data-testid={props.id} disabled={!enabled} aria-pressed={props.pressed === undefined ? undefined : props.pressed} style={style} onClick={type === 'button' ? props.onClick : undefined}>{props.text}</button>;
}
