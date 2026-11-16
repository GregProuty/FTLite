import { describe, expect, it } from 'vitest';
import { createOnlineInput } from '../src/renderer/src/input/onlineInput';
import type { SourceSample } from '../src/renderer/src/input/deviceManager';
import { createKeyboardSources } from '../src/renderer/src/input/sources';
const sample = (key: string, extra: Partial<SourceSample> = {}): SourceSample => ({ key, moveX: 0, moveY: 0, interact: false, confirm: false, cancel: false, any: false, ...extra });
describe('one online physical device', () => {
  it('ignores the second keyboard and keeps the first selected controller exclusive', () => {
    const input = createOnlineInput();
    expect(input.sample([sample('kb:1', { moveX: 1, interact: true, any: true })]).moveX).toBe(0);
    input.sample([sample('gp:0', { any: true }), sample('gp:1', { any: true })]);
    expect(input.sample([sample('gp:0', { moveX: -1 }), sample('gp:1', { moveX: 1 }), sample('kb:0', { moveY: 1 })])).toMatchObject({ moveX: -1, moveY: 0 });
  });
  it('emits neutral on device replacement and suppresses held button edges until release', () => {
    const input = createOnlineInput(); input.sample([sample('gp:0', { any: true })]);
    expect(input.sample([sample('gp:1', { any: true, interact: true, moveX: 1 })])).toMatchObject({ moveX: 0, interactPresses: 0 });
    expect(input.changed).toBe(true);
    expect(input.sample([sample('gp:1', { any: true, interact: true })]).interactPresses).toBe(0);
    input.sample([sample('gp:1')]);
    expect(input.sample([sample('gp:1', { interact: true })]).interactPresses).toBe(1);
    input.reset(); expect(input.key).toBe(null);
  });
});
it('clears held keys and counted presses, ignores form controls, and preserves couch body keys', () => {
  const callbacks = new Map<string, (event: any) => void>();
  const keyboard = createKeyboardSources({ addEventListener(type: string, cb: (e: any) => void) { callbacks.set(type, cb); }, removeEventListener(type: string) { callbacks.delete(type); } } as unknown as Window);
  const down = (code: string, tagName = 'BODY') => callbacks.get('keydown')!({ code, target: { tagName, closest: () => tagName === 'BODY' ? null : {} }, preventDefault() {}, repeat: false });
  down('KeyE'); down('KeyD'); expect(keyboard.sample()[0]).toMatchObject({ interact: true, moveX: 1, presses: { interact: 1 } });
  down('KeyF'); keyboard.reset(); expect(keyboard.sample()[0]).toMatchObject({ interact: false, moveX: 0, presses: { confirm: 0 } });
  for (const code of ['KeyF', 'KeyE', 'KeyQ', 'KeyR']) down(code, 'INPUT'); down('Enter', 'BUTTON');
  expect(keyboard.sample().every(s => !s.any && s.presses!.any === 0)).toBe(true);
  down('Enter'); expect(keyboard.sample()[1]!.presses!.interact).toBe(1);
  callbacks.get('blur')!({}); expect(keyboard.sample()[1]!.interact).toBe(false); keyboard.destroy(); expect(callbacks.size).toBe(0);
});
