// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Icon } from '../src/renderer/src/ui/stage/Icon';
import { ImagesProvider } from '../src/renderer/src/ui/stage/ImagesProvider';
import { UiContext } from '../src/renderer/src/ui/context';
import type { UiImages } from '../src/renderer/src/ui/images';
import { makeUi } from './helpers/uiStore';

afterEach(cleanup);
const ui = (src: Promise<UiImages>) => { const { store, actions } = makeUi(); return render(<UiContext.Provider value={{ store, actions }}><ImagesProvider source={src}><Icon name="icon.x" x={0} y={0} /></ImagesProvider></UiContext.Provider>); };

describe('ImagesProvider', () => {
  it('shows no image while pending, then the image when the promise resolves', async () => {
    let res!: (m: UiImages) => void; ui(new Promise<UiImages>((r) => { res = r; }));
    expect(document.querySelector('[data-ui-image]')).toBeNull();
    await act(async () => { res(new Map([['icon.x', { url: 'data:image/png;base64,AA', w: 4, h: 4 }]])); });
    expect(document.querySelector('[data-ui-image]')).not.toBeNull();
  });
  it('warns once and keeps the empty map on rejection', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let rej!: (e: unknown) => void; ui(new Promise<UiImages>((_, r) => { rej = r; }));
    await act(async () => { rej(new Error('x')); });
    expect(document.querySelector('[data-ui-image]')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1); warn.mockRestore();
  });
});
