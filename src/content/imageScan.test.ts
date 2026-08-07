import { describe, expect, it } from 'vitest';
import { intersects, rankCandidates } from './imageScan';
const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const candidate = (rect: ReturnType<typeof r>, src = 'https://x/a.png') => ({ kind: 'img' as const, src, rect });

describe('intersects', () => {
  it('detects overlap', () => { expect(intersects(r(0, 0, 100, 100), r(50, 50, 100, 100))).toBe(true); });
  it('rejects rects that only touch edges', () => { expect(intersects(r(0, 0, 100, 100), r(100, 0, 50, 50))).toBe(false); });
  it('rejects disjoint rects', () => { expect(intersects(r(0, 0, 10, 10), r(500, 500, 10, 10))).toBe(false); });
});

describe('rankCandidates', () => {
  const bounds = r(0, 0, 500, 500);

  it('keeps only candidates intersecting the region', () => {
    const out = rankCandidates(bounds, [candidate(r(10, 10, 100, 100), 'in.png'), candidate(r(900, 900, 100, 100), 'out.png')], { minEdge: 40, max: 3 });
    expect(out.map((entry) => entry.src)).toEqual(['in.png']);
  });

  it('drops anything smaller than minEdge on either axis', () => {
    const out = rankCandidates(bounds, [candidate(r(0, 0, 39, 200), 'thin.png'), candidate(r(0, 0, 200, 39), 'short.png'), candidate(r(0, 0, 40, 40), 'ok.png')], { minEdge: 40, max: 3 });
    expect(out.map((entry) => entry.src)).toEqual(['ok.png']);
  });

  it('returns the largest first and caps the count', () => {
    const out = rankCandidates(bounds, [candidate(r(0, 0, 50, 50), 'small.png'), candidate(r(0, 0, 300, 300), 'big.png'), candidate(r(0, 0, 150, 150), 'mid.png'), candidate(r(0, 0, 100, 100), 'extra.png')], { minEdge: 40, max: 3 });
    expect(out.map((entry) => entry.src)).toEqual(['big.png', 'mid.png', 'extra.png']);
  });

  it('deduplicates repeats of the same src', () => {
    const out = rankCandidates(bounds, [candidate(r(0, 0, 100, 100), 'same.png'), candidate(r(200, 200, 100, 100), 'same.png')], { minEdge: 40, max: 3 });
    expect(out).toHaveLength(1);
  });

  it('drops candidates with no usable source', () => {
    expect(rankCandidates(bounds, [{ kind: 'img', src: '', rect: r(0, 0, 100, 100) }], { minEdge: 40, max: 3 })).toHaveLength(0);
  });
});
