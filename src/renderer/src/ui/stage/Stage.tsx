// The stage (React UI spec §4): the window below the session strip, no pointer events, under the menu (z 20).
import type { ReactNode } from 'react';
import { useUi } from '../context';

export function Stage(props: { children: ReactNode }) {
  const top = useUi((s) => s.layout.stripHeight), dpr = useUi((s) => s.layout.dpr);
  return <div data-ui-stage="" style={{ position: 'fixed', left: 0, right: 0, top: Math.round(top * dpr) / dpr, bottom: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 10 }}>{props.children}</div>;
}
