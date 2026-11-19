// @vitest-environment jsdom
// The start-up texts on the menu (web build spec §7.5, §7.7): the unsupported text in place of Multiplayer (Single
// player still runs), the one-tab text on the Multiplayer screen, and the Safari note.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { ONE_TAB_TEXT, SAFARI_NOTE, UNSUPPORTED_TEXT } from '../src/renderer/src/app/web/browserSupport';
import { buttonIds, renderUi } from './helpers/uiRender';

afterEach(() => { cleanup(); });
describe('browser start-up texts', () => {
  it('shows the unsupported text in place of Multiplayer and keeps Single player', () => {
    const { store, view, deps } = renderUi();
    act(() => store.setState((s) => ({ browser: { ...s.browser, unsupported: UNSUPPORTED_TEXT } })));
    expect(buttonIds(view.container)).toEqual(['single-player', 'settings', 'quit']);
    expect(screen.getByTestId('online-unsupported').textContent).toBe(UNSUPPORTED_TEXT);
    fireEvent.click(screen.getByTestId('single-player')); fireEvent.click(screen.getByTestId('ship-hound')); expect(deps.single).toHaveBeenCalledOnce();
  });
  it('shows the one-tab text on the Multiplayer screen', () => {
    const { store } = renderUi({ api: null });
    act(() => store.setState((s) => ({ browser: { ...s.browser, onlineBlocked: ONE_TAB_TEXT } })));
    fireEvent.click(screen.getByTestId('multiplayer'));
    expect(screen.getByTestId('online-availability').textContent).toBe(ONE_TAB_TEXT);
  });
  it('shows the Safari note on the menu', () => {
    const { store } = renderUi(); expect(screen.queryByTestId('browser-note')).toBeNull();
    act(() => store.setState((s) => ({ browser: { ...s.browser, note: SAFARI_NOTE } })));
    expect(screen.getByTestId('browser-note').textContent).toBe(SAFARI_NOTE);
  });
});
