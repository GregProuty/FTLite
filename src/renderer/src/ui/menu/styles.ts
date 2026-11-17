// The menu's look (React UI spec §5), the values of sessionMenu's inline styles: a dark panel, #52718d borders, monospace.
import type { CSSProperties } from 'react';

export const ROOT_OVERLAY: CSSProperties = { position: 'fixed', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#05060af2', color: '#d7e4f0', font: '16px monospace' };
export const ROOT_STRIP: CSSProperties = { position: 'fixed', left: 0, right: 0, top: 0, zIndex: 20, color: '#d7e4f0', background: '#0b111be8', font: '14px monospace', padding: '6px 12px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' };
export const PANEL_OVERLAY: CSSProperties = { width: 'min(620px,88vw)', maxHeight: '88vh', overflow: 'auto', scrollbarColor: '#52718d #0b111b', boxSizing: 'border-box', padding: 30, border: '1px solid #52718d', background: '#0b111b', boxShadow: '0 12px 70px #000' };
export const PANEL_STRIP: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
/** The version line at the foot of the menu panel (owner 2026-11-17): small and dim. */
export const VERSION: CSSProperties = { margin: '18px 0 0', font: '12px monospace', color: '#6f8aa3' };
export const BUTTON: CSSProperties = { font: 'inherit', color: '#d7e4f0', background: '#172333', border: '1px solid #52718d', padding: '9px 14px', margin: 4, cursor: 'pointer' };
export const BUTTON_OFF: CSSProperties = { ...BUTTON, cursor: 'default', opacity: 0.45 };
export const NAV: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 2, maxWidth: 280 };
export const CONTROL: CSSProperties = { display: 'block', margin: '10px 0', padding: 10, background: '#172333', color: '#d7e4f0', border: '1px solid #52718d', font: 'inherit' };
export const VOLUME: CSSProperties = { ...CONTROL, margin: '8px 0 14px', padding: 8 };
export const TABLE: CSSProperties = { borderCollapse: 'collapse', fontSize: 13, marginBottom: 8 };
export const KEYS: CSSProperties = { padding: '2px 14px 2px 0', color: '#f0c674', whiteSpace: 'nowrap', verticalAlign: 'top' };
export const ACTION: CSSProperties = { padding: '2px 0' };
