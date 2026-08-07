export interface RectLike { x: number; y: number; width: number; height: number }
export interface TriggerAnchor { x: number; y: number }

export function isEligible(text: string, minChars: number): boolean {
  return text.trim().length >= minChars;
}

function nonEmpty(rects: RectLike[]): RectLike[] {
  return rects.filter((rect) => rect.width > 0 && rect.height > 0);
}

/** The button belongs under the end of the selection, which is the last rect. */
export function anchorFromRects(rects: RectLike[]): TriggerAnchor | null {
  const last = nonEmpty(rects).at(-1);
  return last ? { x: last.x, y: last.y + last.height } : null;
}

/**
 * The region an image must intersect to count as part of this question.
 * `expandTop` reaches upward because TOEIC Part 1 images sit above the text.
 */
export function boundsFromRects(rects: RectLike[], expandTop: number): RectLike | null {
  const usable = nonEmpty(rects);
  if (usable.length === 0) return null;

  const left = Math.min(...usable.map((rect) => rect.x));
  const right = Math.max(...usable.map((rect) => rect.x + rect.width));
  const top = Math.min(...usable.map((rect) => rect.y));
  const bottom = Math.max(...usable.map((rect) => rect.y + rect.height));
  const expandedTop = Math.max(0, top - expandTop);

  return { x: left, y: expandedTop, width: right - left, height: bottom - expandedTop };
}

/* ---- DOM adapters. Not unit-tested; covered by the manual checklist. ---- */

export function selectionTextOf(selection: Selection | null): string {
  return selection?.toString() ?? '';
}

export function rectsOfSelection(selection: Selection | null): RectLike[] {
  if (!selection || selection.rangeCount === 0) return [];
  const rects: RectLike[] = [];
  for (let index = 0; index < selection.rangeCount; index++) {
    for (const rect of Array.from(selection.getRangeAt(index).getClientRects())) {
      rects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    }
  }
  return rects;
}
