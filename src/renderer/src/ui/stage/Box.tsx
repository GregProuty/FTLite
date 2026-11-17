import { memo, type CSSProperties, type ReactNode } from 'react';
import { useUi } from '../context';
import { boxCss } from './geometry';

/** A rectangle in internal pixels, placed on whole device pixels. */
export const Box = memo(function Box(props: { x: number; y: number; w: number; h: number; style?: CSSProperties; testId?: string; children?: ReactNode; attrs?: Record<string, string> }) {
  const l = useUi((s) => s.layout);
  return <div data-testid={props.testId} {...props.attrs} style={{ position: 'absolute', boxSizing: 'border-box', ...boxCss(props.x, props.y, props.w, props.h, l), ...props.style }}>{props.children}</div>;
});
