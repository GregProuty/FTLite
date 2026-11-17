// The menu's one button: a data-testid, the label, enabled or dimmed; a submit button takes no click handler.
import { BUTTON, BUTTON_OFF } from './styles';

export function MenuButton(props: { id: string; text: string; onClick?: () => void; enabled?: boolean; type?: 'button' | 'submit' }) {
  const enabled = props.enabled ?? true, type = props.type ?? 'button';
  return <button type={type} data-testid={props.id} disabled={!enabled} style={enabled ? BUTTON : BUTTON_OFF} onClick={type === 'button' ? props.onClick : undefined}>{props.text}</button>;
}
