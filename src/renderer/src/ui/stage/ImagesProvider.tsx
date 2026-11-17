// Provides the HUD image map; the cache may still be building at mount (the menu must not wait for it), so the map
// starts empty and fills when the promise resolves. A rejection warns once and keeps the empty map; a late resolution
// after unmount is ignored.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { UiImages } from '../images';
import { ImagesContext } from './ImagesContext';

const EMPTY: UiImages = new Map();
export function ImagesProvider(p: { source?: UiImages | Promise<UiImages>; children: ReactNode }): React.ReactElement {
  const [images, setImages] = useState<UiImages>(() => (p.source && !(p.source instanceof Promise) ? p.source : EMPTY));
  useEffect(() => {
    const src = p.source; if (!(src instanceof Promise)) return;
    let live = true;
    src.then((m) => { if (live) setImages(m); }, () => { if (live) console.warn('[ui] image cache failed; icons will not draw'); });
    return () => { live = false; };
  }, [p.source]);
  return <ImagesContext.Provider value={images}>{p.children}</ImagesContext.Provider>;
}
