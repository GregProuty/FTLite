// @vitest-environment jsdom
// The React UI toolchain (React UI spec, decision 1): TSX compiles under Vitest, jsdom renders it, and a vanilla zustand
// store written from outside React re-renders a subscribed component.
import { afterEach, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

afterEach(cleanup);

it('renders TSX in jsdom and re-renders from a vanilla zustand store', () => {
  const store = createStore<{ n: number }>()(() => ({ n: 1 }));
  function Count() { return <p data-testid="n">{useStore(store, (s) => s.n)}</p>; }
  render(<Count />);
  expect(screen.getByTestId('n').textContent).toBe('1');
  act(() => store.setState({ n: 2 }));
  expect(screen.getByTestId('n').textContent).toBe('2');
});
