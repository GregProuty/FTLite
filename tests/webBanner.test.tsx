// @vitest-environment jsdom
// The update banner (web build spec §5.4): "New version: reload" with a reload button, never during a match.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { idle } from './helpers/uiStore';
import { renderUi } from './helpers/uiRender';

afterEach(() => { cleanup(); });
describe('the update banner', () => {
  it('reads New version: reload and reloads', () => {
    const reload = vi.fn(), { actions } = renderUi({ deps: { reload } });
    expect(screen.queryByTestId('update-banner')).toBeNull();
    act(() => actions.updateAvailable());
    expect(screen.getByTestId('update-banner').textContent).toBe('New version: reload');
    fireEvent.click(screen.getByTestId('reload')); expect(reload).toHaveBeenCalledOnce();
  });
  it('never shows during a match', () => {
    const { actions } = renderUi(); act(() => actions.updateAvailable());
    act(() => actions.setStatus({ ...idle, phase: 'running', role: 'host', attachmentEpoch: 1, actions: ['leave'] }));
    expect(screen.queryByTestId('update-banner')).toBeNull();
    act(() => { actions.openShips(); actions.single('hound'); }); expect(screen.queryByTestId('update-banner')).toBeNull();
  });
});
