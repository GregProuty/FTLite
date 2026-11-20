// @vitest-environment jsdom
// Settings' Download playtest log (web build spec §7.4, W-6): browser only; says what it saved, or that there is nothing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { flush } from './helpers/uiStore';
import { renderUi } from './helpers/uiRender';
import { BROWSER_F11_TEXT } from '../src/renderer/src/ui/menuState';

afterEach(() => { cleanup(); });
describe('Download playtest log', () => {
  it('is absent unless the browser offers it', () => {
    renderUi(); fireEvent.click(screen.getByTestId('settings')); expect(screen.queryByTestId('download-playtest-log')).toBeNull();
    expect(screen.getByTestId('fullscreen-note').textContent).toBe('F11 also toggles fullscreen.');
  });
  it('in a browser, says F11 also toggles fullscreen (UI round §1.6)', () => {
    const { store } = renderUi(); act(() => store.setState((s) => ({ browser: { ...s.browser, web: true } }))); fireEvent.click(screen.getByTestId('settings'));
    expect(screen.getByTestId('fullscreen-note').textContent).toBe(BROWSER_F11_TEXT);
  });
  it('saves the log and reports the file, or says there are no records', async () => {
    const run = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce('ftlite-playtest-2026-11-16-to-2026-11-17.jsonl').mockResolvedValueOnce(null).mockRejectedValueOnce(Error('x'));
    const { store } = renderUi({ deps: { downloadPlaytestLog: run } });
    act(() => store.setState((s) => ({ browser: { ...s.browser, playtestLog: true } }))); fireEvent.click(screen.getByTestId('settings'));
    expect(screen.getByTestId('download-playtest-log').textContent).toBe('Download playtest log');
    fireEvent.click(screen.getByTestId('download-playtest-log')); await act(flush);
    expect(screen.getByTestId('playtest-log-status').textContent).toBe('Saved ftlite-playtest-2026-11-16-to-2026-11-17.jsonl.');
    fireEvent.click(screen.getByTestId('download-playtest-log')); await act(flush);
    expect(screen.getByTestId('playtest-log-status').textContent).toBe('No playtest records yet.');
    fireEvent.click(screen.getByTestId('download-playtest-log')); await act(flush);
    expect(screen.getByTestId('playtest-log-status').textContent).toBe('The playtest log could not be read.');
  });
});
