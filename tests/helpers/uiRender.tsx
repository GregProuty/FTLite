// Renders the UI tree over a fixture store (React UI spec §8). Use only from `// @vitest-environment jsdom` files.
import { render } from '@testing-library/react';
import { UiContext } from '../../src/renderer/src/ui/context';
import { UiRoot } from '../../src/renderer/src/ui/UiRoot';
import { makeUi, type FixtureOptions } from './uiStore';

export function renderUi(o: FixtureOptions = {}) {
  const ui = makeUi(o);
  const view = render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot /></UiContext.Provider>);
  return { ...ui, view };
}
/** The data-testids of every button, in document order. */
export const buttonIds = (root: ParentNode): string[] => Array.from(root.querySelectorAll('button')).map((b) => b.getAttribute('data-testid') ?? '');
