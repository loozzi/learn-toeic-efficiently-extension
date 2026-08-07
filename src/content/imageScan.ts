import type { RectLike } from './selection';

export type ImageKind = 'img' | 'canvas' | 'background';

/** What crosses to the service worker. Never raw bytes. */
export interface ImageRef {
  kind: ImageKind;
  src: string; // absolute URL, or a data: URI for canvases
}

export interface ImageCandidate extends ImageRef {
  rect: RectLike;
}

export function intersects(a: RectLike, b: RectLike): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function rankCandidates(bounds: RectLike, candidates: ImageCandidate[], options: { minEdge: number; max: number }): ImageCandidate[] {
  const seen = new Set<string>();

  return candidates
    .filter((entry) => entry.src !== '')
    .filter((entry) => entry.rect.width >= options.minEdge && entry.rect.height >= options.minEdge)
    .filter((entry) => intersects(bounds, entry.rect))
    .filter((entry) => {
      if (seen.has(entry.src)) return false;
      seen.add(entry.src);
      return true;
    })
    .sort((left, right) => right.rect.width * right.rect.height - left.rect.width * left.rect.height)
    .slice(0, options.max);
}

/* ---- DOM adapter. Not unit-tested; covered by the manual checklist. ---- */

const BACKGROUND_URL = /url\(["']?(.+?)["']?\)/;

function backgroundSrc(element: Element): string {
  return BACKGROUND_URL.exec(getComputedStyle(element).backgroundImage)?.[1] ?? '';
}

function canvasSrc(element: HTMLCanvasElement): string {
  try {
    return element.toDataURL('image/png');
  } catch {
    return ''; // tainted canvas — the screenshot fallback handles it
  }
}

export function scanImages(bounds: RectLike, options = { minEdge: 40, max: 3 }): ImageCandidate[] {
  const nodes = document.querySelectorAll<HTMLElement>('img, canvas, [style*="background-image"]');
  const candidates: ImageCandidate[] = [];

  for (const element of Array.from(nodes)) {
    const box = element.getBoundingClientRect();
    const rect: RectLike = { x: box.x, y: box.y, width: box.width, height: box.height };

    if (element instanceof HTMLImageElement) candidates.push({ kind: 'img', src: element.currentSrc || element.src, rect });
    else if (element instanceof HTMLCanvasElement) candidates.push({ kind: 'canvas', src: canvasSrc(element), rect });
    else candidates.push({ kind: 'background', src: backgroundSrc(element), rect });
  }

  return rankCandidates(bounds, candidates, options);
}
