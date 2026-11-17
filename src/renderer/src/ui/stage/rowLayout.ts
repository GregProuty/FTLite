// hud.ts's fillRow as data (React UI spec §4): each part's key glyph, icon and text left to right, an image only when the
// cache has it, text advanced by ceil(textPx) and ROW_GAP between parts; empty parts (no text, no glyph) are skipped.
import { ROW_GAP, ROW_GLYPH, TEXT, textPx } from '../../render/theme';

export interface RowPart { glyph?: string | null; icon?: string | null; text: string; tint?: number }
export interface RowItem { glyph?: { name: string; x: number }; icon?: { name: string; x: number }; text: { text: string; x: number; tint: number } }
export function rowLayout(parts: readonly RowPart[], has: (name: string) => boolean, gap = ROW_GAP): { items: RowItem[]; width: number } {
  const items: RowItem[] = []; let x = 0, end = 0;
  for (const p of parts) {
    if (!p.text && !p.glyph) continue;
    const item: RowItem = { text: { text: '', x: 0, tint: p.tint ?? TEXT } };
    if (p.glyph && has(p.glyph)) { item.glyph = { name: p.glyph, x }; x += ROW_GLYPH; }
    if (p.icon && has(p.icon)) { item.icon = { name: p.icon, x }; x += ROW_GLYPH; }
    item.text = { text: p.text, x, tint: p.tint ?? TEXT };
    end = x + Math.ceil(textPx(p.text)); x = end + gap;
    items.push(item);
  }
  return { items, width: end };
}
