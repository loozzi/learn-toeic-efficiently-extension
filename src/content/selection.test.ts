import { describe, expect, it } from 'vitest';
import { anchorFromRects, boundsFromRects, isEligible } from './selection';
const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('isEligible', () => {
  it('accepts text at or above the threshold', () => {
    expect(isEligible('a'.repeat(15), 15)).toBe(true);
    expect(isEligible('a'.repeat(14), 15)).toBe(false);
  });

  it('ignores surrounding whitespace when measuring', () => {
    expect(isEligible(`   ${'a'.repeat(15)}   `, 15)).toBe(true);
    expect(isEligible('   \n\t  ', 1)).toBe(false);
  });
});

describe('anchorFromRects', () => {
  it('anchors under the bottom-left of the LAST rect, not the first', () => {
    expect(anchorFromRects([r(10, 10, 100, 20), r(10, 40, 60, 20)])).toEqual({ x: 10, y: 60 });
  });

  it('returns null for an empty selection', () => { expect(anchorFromRects([])).toBeNull(); });

  it('skips zero-area rects that browsers emit at line breaks', () => {
    expect(anchorFromRects([r(10, 10, 100, 20), r(0, 0, 0, 0)])).toEqual({ x: 10, y: 30 });
  });
});

describe('boundsFromRects', () => {
  it('unions every rect', () => {
    expect(boundsFromRects([r(10, 50, 100, 20), r(30, 80, 200, 20)], 0)).toEqual({ x: 10, y: 50, width: 220, height: 50 });
  });

  it('extends upward to reach an image sitting above the text', () => {
    expect(boundsFromRects([r(10, 300, 100, 20)], 200)).toEqual({ x: 10, y: 100, width: 100, height: 220 });
  });

  it('clamps the upward extension at the viewport top', () => {
    expect(boundsFromRects([r(10, 50, 100, 20)], 200)).toEqual({ x: 10, y: 0, width: 100, height: 70 });
  });

  it('returns null when there is nothing to bound', () => { expect(boundsFromRects([], 200)).toBeNull(); });
});
