# IMEN Plan 2 — Selection Capture & Images

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select a block of questions on any practice site, click a floating button, and land in the same Review screen Plan 1 built — with any images from the question attached.

**Architecture:** The content script owns selection tracking, the Shadow-DOM floating button, image discovery and the snip overlay. It never fetches an image or talks to a provider; it hands the service worker a list of image *references* and lets the worker resolve them (host permissions bypass CORS). Because the side panel is a separate context that may not be mounted when a capture happens, the worker holds one `pendingCapture` which the panel claims on mount, and pushes later arrivals over a long-lived panel port.

**Tech Stack:** Same as Plan 1. Adds `OffscreenCanvas` + `createImageBitmap` in the service worker for screenshot cropping.

**Prerequisite:** Plan 1 complete, including the recorded `sidePanel.open()` spike result in `docs/superpowers/plans/spike-sidepanel-result.md`. **Read that file before starting Task 6** — it decides whether the floating button opens the panel directly or falls back to a toast.

**Source spec:** `docs/superpowers/specs/2026-08-07-imen-ext-design.md` §6, §7.1, §8.

---

## Global Constraints

Plan 1's Global Constraints all still apply. Additions:

- **The content script never fetches an image and never holds the API key.** It reports image *references* (`src` strings and rects); the service worker resolves them.
- **All injected UI lives in a closed Shadow DOM** under one `position: fixed` host element with `z-index: 2147483647`. No style may leak either direction.
- **Image budget:** at most 3 images per capture, longest edge ≤ 1024px, JPEG quality 0.8. Enforced in the service worker, not in the UI.
- **Pure logic and DOM access stay in separate functions.** jsdom does not implement `getClientRects` usefully, so geometry functions take rect arrays as arguments and thin adapters read them from the DOM. Only the pure half is unit-tested; the adapters are covered by the manual checklist.
- **Never run on `chrome://`, the Web Store, or the built-in PDF viewer.** The content script bails out early; the paste flow remains the escape route.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/content/selection.ts` | Pure geometry: is this selection eligible, where does the button go, what region does it cover |
| `src/content/imageScan.ts` | Pure ranking of image candidates against a region + a thin DOM adapter |
| `src/content/trigger.ts` | The floating button and the in-page toast, in a closed Shadow DOM |
| `src/content/snip.ts` | Drag-select overlay |
| `src/content/index.ts` | `shouldRunHere` and `bootstrap` — exported, never self-executing |
| `src/content/main.ts` | The manifest entry point: the two lines that actually run |
| `src/background/capture.ts` | Image fetch, normalisation, `captureVisibleTab` + crop |
| `src/background/pending.ts` | The `pendingCapture` slot and the panel port registry |
| `src/shared/messages.ts` | Extended with the capture messages and `PORT_PANEL` |
| `src/sidepanel/App.tsx` | Claims a pending capture on mount; adds the snip button |

---

## Task 1: Selection geometry

**Files:**
- Create: `src/content/selection.ts`
- Test: `src/content/selection.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RectLike`, `TriggerAnchor`, `isEligible(text, minChars)`, `anchorFromRects(rects)`, `boundsFromRects(rects, expandTop)`, `rectsOfSelection(sel)` (DOM adapter), `selectionTextOf(sel)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { anchorFromRects, boundsFromRects, isEligible } from './selection';

const r = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h });

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

  it('returns null for an empty selection', () => {
    expect(anchorFromRects([])).toBeNull();
  });

  it('skips zero-area rects that browsers emit at line breaks', () => {
    expect(anchorFromRects([r(10, 10, 100, 20), r(0, 0, 0, 0)])).toEqual({ x: 10, y: 30 });
  });
});

describe('boundsFromRects', () => {
  it('unions every rect', () => {
    expect(boundsFromRects([r(10, 50, 100, 20), r(30, 80, 200, 20)], 0))
      .toEqual({ x: 10, y: 50, width: 220, height: 50 });
  });

  it('extends upward to reach an image sitting above the text', () => {
    expect(boundsFromRects([r(10, 300, 100, 20)], 200))
      .toEqual({ x: 10, y: 100, width: 100, height: 220 });
  });

  it('clamps the upward extension at the viewport top', () => {
    expect(boundsFromRects([r(10, 50, 100, 20)], 200))
      .toEqual({ x: 10, y: 0, width: 100, height: 70 });
  });

  it('returns null when there is nothing to bound', () => {
    expect(boundsFromRects([], 200)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/content/selection.test.ts`
Expected: FAIL — `Cannot find module './selection'`

- [ ] **Step 3: Implement**

```ts
export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TriggerAnchor {
  x: number;
  y: number;
}

export function isEligible(text: string, minChars: number): boolean {
  return text.trim().length >= minChars;
}

function nonEmpty(rects: RectLike[]): RectLike[] {
  return rects.filter((r) => r.width > 0 && r.height > 0);
}

/** The button belongs under the end of the selection, which is the last rect. */
export function anchorFromRects(rects: RectLike[]): TriggerAnchor | null {
  const usable = nonEmpty(rects);
  const last = usable.at(-1);
  return last ? { x: last.x, y: last.y + last.height } : null;
}

/**
 * The region an image must intersect to count as part of this question.
 * `expandTop` reaches upward because TOEIC Part 1 images sit above the text.
 */
export function boundsFromRects(rects: RectLike[], expandTop: number): RectLike | null {
  const usable = nonEmpty(rects);
  if (usable.length === 0) return null;

  const left = Math.min(...usable.map((r) => r.x));
  const right = Math.max(...usable.map((r) => r.x + r.width));
  const top = Math.min(...usable.map((r) => r.y));
  const bottom = Math.max(...usable.map((r) => r.y + r.height));
  const expandedTop = Math.max(0, top - expandTop);

  return { x: left, y: expandedTop, width: right - left, height: bottom - expandedTop };
}

/* ---- DOM adapters. Not unit-tested; covered by the manual checklist. ---- */

export function selectionTextOf(sel: Selection | null): string {
  return sel?.toString() ?? '';
}

export function rectsOfSelection(sel: Selection | null): RectLike[] {
  if (!sel || sel.rangeCount === 0) return [];
  const out: RectLike[] = [];
  for (let i = 0; i < sel.rangeCount; i++) {
    for (const rect of Array.from(sel.getRangeAt(i).getClientRects())) {
      out.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/content/selection.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add src/content/selection.ts src/content/selection.test.ts
git commit -m "feat: add pure selection geometry for the capture trigger"
```

---

## Task 2: Image candidate scanning

**Files:**
- Create: `src/content/imageScan.ts`
- Test: `src/content/imageScan.test.ts`

**Interfaces:**
- Consumes: `RectLike` from `selection.ts`.
- Produces: `ImageRef`, `ImageCandidate`, `intersects(a, b)`, `rankCandidates(bounds, candidates, opts)`, `scanImages(bounds)` (DOM adapter).

`ImageRef` is what crosses to the service worker — a `src` string or a canvas data URI, never a fetched byte.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { intersects, rankCandidates } from './imageScan';

const r = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h });

const candidate = (rect: ReturnType<typeof r>, src = 'https://x/a.png') => ({
  kind: 'img' as const, src, rect,
});

describe('intersects', () => {
  it('detects overlap', () => {
    expect(intersects(r(0, 0, 100, 100), r(50, 50, 100, 100))).toBe(true);
  });

  it('rejects rects that only touch edges', () => {
    expect(intersects(r(0, 0, 100, 100), r(100, 0, 50, 50))).toBe(false);
  });

  it('rejects disjoint rects', () => {
    expect(intersects(r(0, 0, 10, 10), r(500, 500, 10, 10))).toBe(false);
  });
});

describe('rankCandidates', () => {
  const bounds = r(0, 0, 500, 500);

  it('keeps only candidates intersecting the region', () => {
    const out = rankCandidates(bounds, [
      candidate(r(10, 10, 100, 100), 'in.png'),
      candidate(r(900, 900, 100, 100), 'out.png'),
    ], { minEdge: 40, max: 3 });
    expect(out.map((c) => c.src)).toEqual(['in.png']);
  });

  it('drops anything smaller than minEdge on either axis', () => {
    const out = rankCandidates(bounds, [
      candidate(r(0, 0, 39, 200), 'thin.png'),
      candidate(r(0, 0, 200, 39), 'short.png'),
      candidate(r(0, 0, 40, 40), 'ok.png'),
    ], { minEdge: 40, max: 3 });
    expect(out.map((c) => c.src)).toEqual(['ok.png']);
  });

  it('returns the largest first and caps the count', () => {
    const out = rankCandidates(bounds, [
      candidate(r(0, 0, 50, 50), 'small.png'),
      candidate(r(0, 0, 300, 300), 'big.png'),
      candidate(r(0, 0, 150, 150), 'mid.png'),
      candidate(r(0, 0, 100, 100), 'extra.png'),
    ], { minEdge: 40, max: 3 });
    expect(out.map((c) => c.src)).toEqual(['big.png', 'mid.png', 'extra.png']);
  });

  it('deduplicates repeats of the same src', () => {
    const out = rankCandidates(bounds, [
      candidate(r(0, 0, 100, 100), 'same.png'),
      candidate(r(200, 200, 100, 100), 'same.png'),
    ], { minEdge: 40, max: 3 });
    expect(out).toHaveLength(1);
  });

  it('drops candidates with no usable source', () => {
    const out = rankCandidates(bounds, [
      { kind: 'img', src: '', rect: r(0, 0, 100, 100) },
    ], { minEdge: 40, max: 3 });
    expect(out).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/content/imageScan.test.ts`
Expected: FAIL — `Cannot find module './imageScan'`

- [ ] **Step 3: Implement**

```ts
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
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

export function rankCandidates(
  bounds: RectLike,
  candidates: ImageCandidate[],
  opts: { minEdge: number; max: number },
): ImageCandidate[] {
  const seen = new Set<string>();

  return candidates
    .filter((c) => c.src !== '')
    .filter((c) => c.rect.width >= opts.minEdge && c.rect.height >= opts.minEdge)
    .filter((c) => intersects(bounds, c.rect))
    .filter((c) => {
      if (seen.has(c.src)) return false;
      seen.add(c.src);
      return true;
    })
    .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)
    .slice(0, opts.max);
}

/* ---- DOM adapter. Not unit-tested; covered by the manual checklist. ---- */

const BACKGROUND_URL = /url\(["']?(.+?)["']?\)/;

function backgroundSrc(el: Element): string {
  const value = getComputedStyle(el).backgroundImage;
  return BACKGROUND_URL.exec(value)?.[1] ?? '';
}

function canvasSrc(el: HTMLCanvasElement): string {
  try {
    return el.toDataURL('image/png');
  } catch {
    return ''; // tainted canvas — the screenshot fallback handles it
  }
}

export function scanImages(bounds: RectLike, opts = { minEdge: 40, max: 3 }): ImageCandidate[] {
  const nodes = document.querySelectorAll<HTMLElement>('img, canvas, [style*="background-image"]');
  const candidates: ImageCandidate[] = [];

  for (const el of Array.from(nodes)) {
    const box = el.getBoundingClientRect();
    const rect: RectLike = { x: box.x, y: box.y, width: box.width, height: box.height };

    if (el instanceof HTMLImageElement) {
      candidates.push({ kind: 'img', src: el.currentSrc || el.src, rect });
    } else if (el instanceof HTMLCanvasElement) {
      candidates.push({ kind: 'canvas', src: canvasSrc(el), rect });
    } else {
      candidates.push({ kind: 'background', src: backgroundSrc(el), rect });
    }
  }

  return rankCandidates(bounds, candidates, opts);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/content/imageScan.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add src/content/imageScan.ts src/content/imageScan.test.ts
git commit -m "feat: add image candidate scanning against the selection region"
```

---

## Task 3: Service-worker image capture

**Files:**
- Create: `src/background/capture.ts`
- Test: `src/background/capture.test.ts`

**Interfaces:**
- Consumes: `ImageRef` from `imageScan.ts`; `RectLike` from `selection.ts`; `ImageInput` from shared types.
- Produces: `blobToBase64(blob)`, `cropBox(bounds, dpr)`, `fitWithin(w, h, maxEdge)`, `fetchImageBlob(src)`, `normaliseImage(blob, opts)`, `resolveImageRefs(refs)`, `captureRegion(tabId, bounds, dpr)`.

- [ ] **Step 1: Write the failing test**

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { blobToBase64, cropBox, fetchImageBlob, fitWithin } from './capture';

const server = setupServer(
  http.get('https://site.test/photo.jpg', () =>
    HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3]).buffer, {
      headers: { 'Content-Type': 'image/jpeg' },
    })),
  http.get('https://site.test/missing.jpg', () => HttpResponse.text('gone', { status: 404 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('cropBox', () => {
  it('scales CSS pixels to device pixels', () => {
    expect(cropBox({ x: 10, y: 20, width: 100, height: 50 }, 2))
      .toEqual({ sx: 20, sy: 40, sw: 200, sh: 100 });
  });

  it('is a no-op at dpr 1', () => {
    expect(cropBox({ x: 10, y: 20, width: 100, height: 50 }, 1))
      .toEqual({ sx: 10, sy: 20, sw: 100, sh: 50 });
  });

  it('rounds to whole device pixels', () => {
    expect(cropBox({ x: 10.4, y: 20.6, width: 100.5, height: 50.5 }, 1.5))
      .toEqual({ sx: 16, sy: 31, sw: 151, sh: 76 });
  });
});

describe('fitWithin', () => {
  it('leaves an already-small image alone', () => {
    expect(fitWithin(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });

  it('scales the long edge down and keeps the aspect ratio', () => {
    expect(fitWithin(2048, 1024, 1024)).toEqual({ width: 1024, height: 512 });
    expect(fitWithin(1024, 2048, 1024)).toEqual({ width: 512, height: 1024 });
  });
});

describe('blobToBase64', () => {
  it('encodes bytes without a data-URI prefix', async () => {
    const out = await blobToBase64(new Blob([new Uint8Array([65, 66, 67])]));
    expect(out).toBe('QUJD');
  });
});

describe('fetchImageBlob', () => {
  it('fetches a cross-origin image and preserves its type', async () => {
    const blob = await fetchImageBlob('https://site.test/photo.jpg');
    expect(blob?.type).toBe('image/jpeg');
  });

  it('returns null on a failed fetch instead of throwing', async () => {
    expect(await fetchImageBlob('https://site.test/missing.jpg')).toBeNull();
  });

  it('decodes a data URI without any network call', async () => {
    const blob = await fetchImageBlob('data:image/png;base64,QUJD');
    expect(blob?.type).toBe('image/png');
    expect(await blobToBase64(blob!)).toBe('QUJD');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/background/capture.test.ts`
Expected: FAIL — `Cannot find module './capture'`

- [ ] **Step 3: Implement**

```ts
import type { RectLike } from '../content/selection';
import type { ImageRef } from '../content/imageScan';
import type { ImageInput } from '../shared/types';

const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.8;
const MAX_IMAGES = 3;

export interface CropBox {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** captureVisibleTab returns device pixels; selection rects are CSS pixels. */
export function cropBox(bounds: RectLike, dpr: number): CropBox {
  return {
    sx: Math.round(bounds.x * dpr),
    sy: Math.round(bounds.y * dpr),
    sw: Math.round(bounds.width * dpr),
    sh: Math.round(bounds.height * dpr),
  };
}

export function fitWithin(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function fetchImageBlob(src: string): Promise<Blob | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/** Downscale and re-encode so a screenshot does not blow the token budget. */
export async function normaliseImage(blob: Blob): Promise<ImageInput> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  return { mime: 'image/jpeg', dataBase64: await blobToBase64(out) };
}

export async function resolveImageRefs(refs: ImageRef[]): Promise<ImageInput[]> {
  const out: ImageInput[] = [];
  for (const ref of refs.slice(0, MAX_IMAGES)) {
    const blob = await fetchImageBlob(ref.src);
    if (!blob) continue;
    try {
      out.push(await normaliseImage(blob));
    } catch {
      // Undecodable (SVG without intrinsic size, corrupt bytes). Skip it —
      // the screenshot fallback covers the case where nothing resolves.
    }
  }
  return out;
}

export async function captureRegion(
  tabId: number,
  bounds: RectLike,
  dpr: number,
): Promise<ImageInput | null> {
  const tab = await chrome.tabs.get(tabId);
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const shot = await fetchImageBlob(dataUrl);
  if (!shot) return null;

  const bitmap = await createImageBitmap(shot);
  const { sx, sy, sw, sh } = cropBox(bounds, dpr);
  if (sw <= 0 || sh <= 0) {
    bitmap.close();
    return null;
  }

  const cropped = new OffscreenCanvas(sw, sh);
  cropped.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();

  return normaliseImage(await cropped.convertToBlob({ type: 'image/png' }));
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/background/capture.test.ts`
Expected: PASS, 9 tests

`normaliseImage` and `captureRegion` are not unit-tested — they need real `createImageBitmap` and `OffscreenCanvas`, which jsdom does not provide. Their pure halves (`cropBox`, `fitWithin`, `blobToBase64`, `fetchImageBlob`) are covered above; the composed behaviour is on the manual checklist in Task 9.

- [ ] **Step 5: Commit**

```bash
git add src/background/capture.ts src/background/capture.test.ts
git commit -m "feat: add service-worker image fetching, normalisation and region cropping"
```

---

## Task 4: Capture messages and the pending-capture handoff

**Files:**
- Modify: `src/shared/messages.ts`
- Create: `src/background/pending.ts`
- Test: `src/background/pending.test.ts`

**Interfaces:**
- Consumes: `ImageInput`, `ImageRef`, `RectLike`.
- Produces: `PendingCapture`; `setPending(c)`, `claimPending()`, `registerPanelPort(port)`, `pushToPanel(event)`; `PORT_PANEL`, `PanelEvent`; new `RequestMap` entries `CAPTURE_SELECTION`, `CLAIM_PENDING_CAPTURE`, `START_SNIP`, `SNIP_RESULT`.

The handoff is the tricky part and the test pins the race down: a capture can arrive before the panel exists, so it is stored and claimed exactly once.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimPending, pushToPanel, registerPanelPort, setPending } from './pending';

const capture = { rawText: 'raw', images: [], sourceUrl: 'https://x', sourceTitle: 'T' };

function fakePort() {
  const listeners: (() => void)[] = [];
  return {
    postMessage: vi.fn(),
    onDisconnect: { addListener: (fn: () => void) => listeners.push(fn) },
    disconnect: () => listeners.forEach((fn) => fn()),
  };
}

beforeEach(() => { claimPending(); registerPanelPort(null as never); });

describe('pending capture', () => {
  it('hands the stored capture over exactly once', () => {
    setPending(capture);
    expect(claimPending()).toEqual(capture);
    expect(claimPending()).toBeNull();
  });

  it('returns null when nothing was captured', () => {
    expect(claimPending()).toBeNull();
  });

  it('replaces an unclaimed capture rather than queueing', () => {
    setPending(capture);
    setPending({ ...capture, rawText: 'newer' });
    expect(claimPending()?.rawText).toBe('newer');
  });

  it('notifies an already-open panel when a capture arrives', () => {
    const port = fakePort();
    registerPanelPort(port as never);
    setPending(capture);
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'pendingCapture' });
  });

  it('stops pushing to a disconnected panel', () => {
    const port = fakePort();
    registerPanelPort(port as never);
    port.disconnect();
    pushToPanel({ type: 'pendingCapture' });
    expect(port.postMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/background/pending.test.ts`
Expected: FAIL — `Cannot find module './pending'`

- [ ] **Step 3: Extend `src/shared/messages.ts`**

Add to `RequestMap`:

```ts
  CAPTURE_SELECTION: {
    req: {
      rawText: string;
      imageRefs: ImageRef[];
      bounds: RectLike | null;
      dpr: number;
      sourceUrl: string;
      sourceTitle: string;
    };
    res: { panelOpened: boolean };
  };
  CLAIM_PENDING_CAPTURE: {
    req: Record<string, never>;
    res: { capture: PendingCapture | null };
  };
  START_SNIP: {
    req: Record<string, never>;
    res: { started: boolean };
  };
  SNIP_RESULT: {
    req: { bounds: RectLike; dpr: number };
    res: { ok: boolean };
  };
```

Add the imports and the port contract:

```ts
import type { ImageRef } from '../content/imageScan';
import type { RectLike } from '../content/selection';

export interface PendingCapture {
  rawText: string;
  images: ImageInput[];
  sourceUrl: string;
  sourceTitle: string;
}

export const PORT_PANEL = 'panel';

export type PanelEvent =
  | { type: 'pendingCapture' }
  | { type: 'snipImage'; image: ImageInput }
  | { type: 'snipFailed' };
```

Also add one content-script-directed message, sent with `chrome.tabs.sendMessage` rather than through `RequestMap` because it travels the other way:

```ts
export const CONTENT_COMMAND = 'imen:content-command';

export type ContentCommand =
  | { type: 'startSnip' }
  | { type: 'toast'; message: string };
```

- [ ] **Step 4: Implement `src/background/pending.ts`**

```ts
import type { PanelEvent, PendingCapture } from '../shared/messages';

let pending: PendingCapture | null = null;
let panelPort: chrome.runtime.Port | null = null;

export function setPending(capture: PendingCapture): void {
  // A newer selection supersedes an unclaimed one; the user only ever wants
  // the thing they just clicked on.
  pending = capture;
  pushToPanel({ type: 'pendingCapture' });
}

export function claimPending(): PendingCapture | null {
  const claimed = pending;
  pending = null;
  return claimed;
}

export function registerPanelPort(port: chrome.runtime.Port | null): void {
  panelPort = port;
  port?.onDisconnect.addListener(() => {
    if (panelPort === port) panelPort = null;
  });
}

export function pushToPanel(event: PanelEvent): void {
  if (!panelPort) return;
  try {
    panelPort.postMessage(event);
  } catch {
    panelPort = null; // the panel closed between the check and the post
  }
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/background/pending.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 6: Commit**

```bash
git add src/shared/messages.ts src/background/pending.ts src/background/pending.test.ts
git commit -m "feat: add capture messages and the pending-capture handoff slot"
```

---

## Task 5: Background capture handlers

**Files:**
- Modify: `src/background/index.ts`
- Test: `src/background/captureHandlers.test.ts`

**Interfaces:**
- Consumes: `resolveImageRefs`, `captureRegion` from capture; `setPending`, `claimPending`, `registerPanelPort`, `pushToPanel` from pending.
- Produces: `handleCaptureSelection(req, tabId)`, `handleSnipResult(req, tabId)`, `openPanelFor(tabId)` — exported from a new `src/background/captureHandlers.ts` so they are testable without loading the whole worker.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveImageRefs = vi.fn();
const captureRegion = vi.fn();
vi.mock('./capture', () => ({
  resolveImageRefs: (...a: unknown[]) => resolveImageRefs(...a),
  captureRegion: (...a: unknown[]) => captureRegion(...a),
}));

const { handleCaptureSelection, handleSnipResult, openPanelFor } =
  await import('./captureHandlers');
const { claimPending } = await import('./pending');

const open = vi.fn();
const setBadgeText = vi.fn();

beforeEach(() => {
  claimPending();
  resolveImageRefs.mockReset().mockResolvedValue([]);
  captureRegion.mockReset();
  open.mockReset().mockResolvedValue(undefined);
  setBadgeText.mockReset();
  (globalThis as any).chrome = {
    sidePanel: { open },
    action: { setBadgeText, setBadgeBackgroundColor: vi.fn() },
    tabs: { sendMessage: vi.fn() },
  };
});

const req = {
  rawText: 'raw', imageRefs: [{ kind: 'img' as const, src: 'https://x/a.png' }],
  bounds: { x: 0, y: 0, width: 100, height: 100 }, dpr: 2,
  sourceUrl: 'https://site', sourceTitle: 'Site',
};

describe('handleCaptureSelection', () => {
  it('stores the resolved capture and opens the panel', async () => {
    resolveImageRefs.mockResolvedValue([{ mime: 'image/jpeg', dataBase64: 'QQ' }]);
    const res = await handleCaptureSelection(req, 7);
    expect(res.panelOpened).toBe(true);
    expect(open).toHaveBeenCalledWith({ tabId: 7 });
    const pending = claimPending();
    expect(pending?.rawText).toBe('raw');
    expect(pending?.images).toHaveLength(1);
  });

  it('falls back to a screenshot crop when no reference resolves', async () => {
    resolveImageRefs.mockResolvedValue([]);
    captureRegion.mockResolvedValue({ mime: 'image/jpeg', dataBase64: 'SHOT' });
    await handleCaptureSelection(req, 7);
    expect(captureRegion).toHaveBeenCalledWith(7, req.bounds, 2);
    expect(claimPending()?.images[0].dataBase64).toBe('SHOT');
  });

  it('does not attempt a screenshot when there were no image refs at all', async () => {
    await handleCaptureSelection({ ...req, imageRefs: [] }, 7);
    expect(captureRegion).not.toHaveBeenCalled();
    expect(claimPending()?.images).toEqual([]);
  });

  it('still stores the capture and flags a badge when the panel refuses to open', async () => {
    open.mockRejectedValue(new Error('user gesture required'));
    const res = await handleCaptureSelection(req, 7);
    expect(res.panelOpened).toBe(false);
    expect(setBadgeText).toHaveBeenCalledWith({ text: '•', tabId: 7 });
    expect(claimPending()).not.toBeNull();
  });
});

describe('openPanelFor', () => {
  it('reports success and failure without throwing', async () => {
    expect(await openPanelFor(1)).toBe(true);
    open.mockRejectedValue(new Error('nope'));
    expect(await openPanelFor(1)).toBe(false);
  });
});

describe('handleSnipResult', () => {
  it('crops the region and pushes the image to the panel', async () => {
    captureRegion.mockResolvedValue({ mime: 'image/jpeg', dataBase64: 'SNIP' });
    const res = await handleSnipResult({ bounds: req.bounds, dpr: 2 }, 7);
    expect(res.ok).toBe(true);
  });

  it('reports failure when the crop yields nothing', async () => {
    captureRegion.mockResolvedValue(null);
    expect((await handleSnipResult({ bounds: req.bounds, dpr: 2 }, 7)).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/background/captureHandlers.test.ts`
Expected: FAIL — `Cannot find module './captureHandlers'`

- [ ] **Step 3: Implement `src/background/captureHandlers.ts`**

```ts
import type { RequestMap } from '../shared/messages';
import { captureRegion, resolveImageRefs } from './capture';
import { pushToPanel, setPending } from './pending';

export async function openPanelFor(tabId: number): Promise<boolean> {
  try {
    await chrome.sidePanel.open({ tabId });
    return true;
  } catch {
    // Chrome rejects this when it does not consider the call to be inside a
    // user gesture. The capture is already stored, so the user can still get
    // to it by clicking the toolbar icon.
    return false;
  }
}

async function flagBadge(tabId: number): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  await chrome.action.setBadgeText({ text: '•', tabId });
}

export async function handleCaptureSelection(
  req: RequestMap['CAPTURE_SELECTION']['req'],
  tabId: number,
): Promise<RequestMap['CAPTURE_SELECTION']['res']> {
  let images = await resolveImageRefs(req.imageRefs);

  // Rung 4 of the spec's ladder: references existed but none decoded, so fall
  // back to a screenshot of the region.
  if (images.length === 0 && req.imageRefs.length > 0 && req.bounds) {
    const shot = await captureRegion(tabId, req.bounds, req.dpr);
    if (shot) images = [shot];
  }

  setPending({
    rawText: req.rawText,
    images,
    sourceUrl: req.sourceUrl,
    sourceTitle: req.sourceTitle,
  });

  const panelOpened = await openPanelFor(tabId);
  if (!panelOpened) await flagBadge(tabId);

  return { panelOpened };
}

export async function handleSnipResult(
  req: RequestMap['SNIP_RESULT']['req'],
  tabId: number,
): Promise<RequestMap['SNIP_RESULT']['res']> {
  const image = await captureRegion(tabId, req.bounds, req.dpr);
  if (!image) {
    pushToPanel({ type: 'snipFailed' });
    return { ok: false };
  }
  pushToPanel({ type: 'snipImage', image });
  return { ok: true };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/background/captureHandlers.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Wire them into `src/background/index.ts`**

Replace the `registerHandlers` call and add the panel port. `registerHandlers` from Plan 1 does not pass the sender, so widen it first — in `src/shared/messages.ts` change the handler signature to receive the sender:

```ts
export type Handlers = {
  [T in RequestType]?: (
    req: RequestMap[T]['req'],
    sender: chrome.runtime.MessageSender,
  ) => Promise<RequestMap[T]['res']>;
};
```

and inside `registerHandlers` pass it through:

```ts
    (handler as (r: unknown, s: unknown) => Promise<unknown>)(msg, _sender)
```

renaming `_sender` to `sender`. Plan 1's existing handlers ignore the extra argument, so nothing else changes.

Then in `src/background/index.ts`:

```ts
import { CONTENT_COMMAND, PORT_ERROR_PSYCH, PORT_PANEL, registerHandlers } from '../shared/messages';
import { runAnalyze, runErrorPsych, runParse, runTestConnection } from './aiRunner';
import { handleCaptureSelection, handleSnipResult } from './captureHandlers';
import { claimPending, registerPanelPort } from './pending';

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error('[imen] setPanelBehavior failed', e));

registerHandlers({
  PARSE_TEXT: (req) => runParse(req),
  ANALYZE: (req) => runAnalyze(req),
  TEST_CONNECTION: (req) => runTestConnection(req.config),

  CAPTURE_SELECTION: async (req, sender) => {
    const tabId = sender.tab?.id;
    if (tabId == null) return { panelOpened: false };
    return handleCaptureSelection(req, tabId);
  },

  CLAIM_PENDING_CAPTURE: async () => ({ capture: claimPending() }),

  START_SNIP: async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id == null) return { started: false };
    await chrome.tabs.sendMessage(tab.id, { [CONTENT_COMMAND]: { type: 'startSnip' } });
    return { started: true };
  },

  SNIP_RESULT: async (req, sender) => {
    const tabId = sender.tab?.id;
    if (tabId == null) return { ok: false };
    return handleSnipResult(req, tabId);
  },
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === PORT_PANEL) {
    registerPanelPort(port);
    return;
  }
  if (port.name !== PORT_ERROR_PSYCH) return;

  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());

  port.onMessage.addListener(async (req) => {
    for await (const event of runErrorPsych(req, controller.signal)) {
      try {
        port.postMessage(event);
      } catch {
        return;
      }
    }
  });
});

// Clear the fallback badge once the user actually opens the panel.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id != null) void chrome.action.setBadgeText({ text: '', tabId: tab.id });
});
```

- [ ] **Step 6: Run the whole suite**

Run: `npx vitest run`
Expected: PASS, every suite green

- [ ] **Step 7: Commit**

```bash
git add src/background src/shared/messages.ts
git commit -m "feat: wire capture handlers and the panel port into the service worker"
```

---

## Task 6: The floating trigger button

**Read `docs/superpowers/plans/spike-sidepanel-result.md` before starting.** If the spike failed, the button still works — `handleCaptureSelection` already stores the capture and flags the badge — but the manual checklist in Task 9 expects the toast path rather than the panel opening directly.

**Files:**
- Create: `src/content/trigger.ts`
- Modify: `src/shared/strings.ts`
- Test: `src/content/trigger.test.ts`

`showToast` lives in `trigger.ts` beside the shadow host that owns its styles — a separate `toast.ts` would have to reach back into those styles for nothing.

**Interfaces:**
- Consumes: `TriggerAnchor` from selection; `S`.
- Produces: `mountTrigger(root)` returning `{ show(anchor), hide(), destroy() }`; `showToast(root, message)`; `createShadowHost()`.

- [ ] **Step 1: Add the strings**

In `src/shared/strings.ts`, add:

```ts
  content: {
    triggerLabel: 'Phân tích',
    triggerAria: 'Phân tích phần đã bôi đen bằng IMEN',
    openPanelManually: 'Bấm vào biểu tượng IMEN trên thanh công cụ để mở bảng phân tích.',
    snipHint: 'Kéo chuột để khoanh vùng cần chụp. Nhấn Esc để huỷ.',
    snipFailed: 'Không chụp được vùng này.',
  },
```

- [ ] **Step 2: Write the failing test**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createShadowHost, mountTrigger, showToast } from './trigger';
import { S } from '../shared/strings';

beforeEach(() => { document.body.innerHTML = ''; });

describe('createShadowHost', () => {
  it('pins a fixed host at the maximum stacking order', () => {
    const { host } = createShadowHost();
    expect(host.style.position).toBe('fixed');
    expect(host.style.zIndex).toBe('2147483647');
    expect(document.body.contains(host)).toBe(true);
  });

  it('isolates content in a shadow root so page CSS cannot reach it', () => {
    const { shadow } = createShadowHost();
    expect(shadow).toBeInstanceOf(ShadowRoot);
  });
});

describe('mountTrigger', () => {
  it('stays hidden until shown', () => {
    const { shadow } = createShadowHost();
    mountTrigger(shadow, vi.fn());
    expect(shadow.querySelector('button')).toBeNull();
  });

  it('positions itself at the anchor when shown', () => {
    const { shadow } = createShadowHost();
    const trigger = mountTrigger(shadow, vi.fn());
    trigger.show({ x: 120, y: 340 });
    const button = shadow.querySelector('button')!;
    expect(button).toBeTruthy();
    expect((button.parentElement as HTMLElement).style.left).toBe('120px');
    expect((button.parentElement as HTMLElement).style.top).toBe('344px');
  });

  it('invokes the callback on click', () => {
    const { shadow } = createShadowHost();
    const onClick = vi.fn();
    const trigger = mountTrigger(shadow, onClick);
    trigger.show({ x: 0, y: 0 });
    shadow.querySelector('button')!.click();
    expect(onClick).toHaveBeenCalled();
  });

  it('disappears when hidden', () => {
    const { shadow } = createShadowHost();
    const trigger = mountTrigger(shadow, vi.fn());
    trigger.show({ x: 0, y: 0 });
    trigger.hide();
    expect(shadow.querySelector('button')).toBeNull();
  });

  it('carries an accessible label rather than a bare icon', () => {
    const { shadow } = createShadowHost();
    const trigger = mountTrigger(shadow, vi.fn());
    trigger.show({ x: 0, y: 0 });
    expect(shadow.querySelector('button')!.getAttribute('aria-label')).toBe(S.content.triggerAria);
  });
});

describe('showToast', () => {
  it('renders a message and removes it after the timeout', () => {
    vi.useFakeTimers();
    const { shadow } = createShadowHost();
    showToast(shadow, 'xin chào');
    expect(shadow.textContent).toContain('xin chào');
    vi.advanceTimersByTime(6000);
    expect(shadow.textContent).not.toContain('xin chào');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/content/trigger.test.ts`
Expected: FAIL — `Cannot find module './trigger'`

- [ ] **Step 4: Implement `src/content/trigger.ts`**

Plain DOM rather than React: this runs on every page load, and a React root per tab is weight the button does not need.

```tsx
import { S } from '../shared/strings';
import type { TriggerAnchor } from './selection';

const GAP = 4;

export interface ShadowHost {
  host: HTMLDivElement;
  shadow: ShadowRoot;
}

export function createShadowHost(): ShadowHost {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '0';
  host.style.width = '0';
  host.style.height = '0';
  host.style.zIndex = '2147483647';
  host.setAttribute('data-imen', 'root');

  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host, * { all: initial; box-sizing: border-box; font-family: system-ui, sans-serif; }
    .anchor { position: fixed; }
    button {
      cursor: pointer; border: 1px solid #1d4ed8; background: #2563eb; color: #fff;
      border-radius: 6px; padding: 4px 10px; font-size: 12px; line-height: 1.4;
      box-shadow: 0 2px 8px rgba(0,0,0,.25);
    }
    .toast {
      position: fixed; right: 16px; bottom: 16px; max-width: 280px;
      background: #111827; color: #fff; border-radius: 8px; padding: 10px 12px;
      font-size: 12px; line-height: 1.5; box-shadow: 0 4px 16px rgba(0,0,0,.3);
    }
  `;
  shadow.appendChild(style);
  document.body.appendChild(host);

  return { host, shadow };
}

export interface Trigger {
  show(anchor: TriggerAnchor): void;
  hide(): void;
  destroy(): void;
}

export function mountTrigger(shadow: ShadowRoot, onClick: () => void): Trigger {
  const anchorEl = document.createElement('div');
  anchorEl.className = 'anchor';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = S.content.triggerLabel;
  button.setAttribute('aria-label', S.content.triggerAria);
  // mousedown would clear the selection before the click handler reads it.
  button.addEventListener('mousedown', (e) => e.preventDefault());
  button.addEventListener('click', onClick);

  return {
    show(anchor) {
      anchorEl.style.left = `${anchor.x}px`;
      anchorEl.style.top = `${anchor.y + GAP}px`;
      anchorEl.appendChild(button);
      shadow.appendChild(anchorEl);
    },
    hide() {
      anchorEl.remove();
      button.remove();
    },
    destroy() {
      this.hide();
      button.removeEventListener('click', onClick);
    },
  };
}

export function showToast(shadow: ShadowRoot, message: string, ms = 5000): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  shadow.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/content/trigger.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 6: Commit**

```bash
git add src/content/trigger.ts src/content/trigger.test.ts src/shared/strings.ts
git commit -m "feat: add the shadow-DOM floating trigger button and in-page toast"
```

---

## Task 7: Snip overlay

**Files:**
- Create: `src/content/snip.ts`
- Test: `src/content/snip.test.ts`

**Interfaces:**
- Consumes: `RectLike`; `S`.
- Produces: `rectFromDrag(start, end)`, `startSnip(shadow, onDone)` returning a cancel function.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createShadowHost } from './trigger';
import { rectFromDrag, startSnip } from './snip';

beforeEach(() => { document.body.innerHTML = ''; });

describe('rectFromDrag', () => {
  it('normalises a top-left to bottom-right drag', () => {
    expect(rectFromDrag({ x: 10, y: 20 }, { x: 110, y: 220 }))
      .toEqual({ x: 10, y: 20, width: 100, height: 200 });
  });

  it('normalises a drag made in reverse', () => {
    expect(rectFromDrag({ x: 110, y: 220 }, { x: 10, y: 20 }))
      .toEqual({ x: 10, y: 20, width: 100, height: 200 });
  });

  it('yields a zero rect for a click without movement', () => {
    expect(rectFromDrag({ x: 5, y: 5 }, { x: 5, y: 5 }))
      .toEqual({ x: 5, y: 5, width: 0, height: 0 });
  });
});

describe('startSnip', () => {
  function drag(from: [number, number], to: [number, number]) {
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: from[0], clientY: from[1] }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: to[0], clientY: to[1] }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: to[0], clientY: to[1] }));
  }

  it('reports the dragged region', () => {
    const { shadow } = createShadowHost();
    const onDone = vi.fn();
    startSnip(shadow, onDone);
    drag([20, 30], [140, 130]);
    expect(onDone).toHaveBeenCalledWith({ x: 20, y: 30, width: 120, height: 100 });
  });

  it('ignores a drag too small to be intentional', () => {
    const { shadow } = createShadowHost();
    const onDone = vi.fn();
    startSnip(shadow, onDone);
    drag([20, 30], [24, 33]);
    expect(onDone).toHaveBeenCalledWith(null);
  });

  it('cancels on Escape without reporting a region', () => {
    const { shadow } = createShadowHost();
    const onDone = vi.fn();
    startSnip(shadow, onDone);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onDone).toHaveBeenCalledWith(null);
  });

  it('tears its overlay down once finished', () => {
    const { shadow } = createShadowHost();
    startSnip(shadow, vi.fn());
    expect(shadow.querySelector('.snip-overlay')).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(shadow.querySelector('.snip-overlay')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/content/snip.test.ts`
Expected: FAIL — `Cannot find module './snip'`

- [ ] **Step 3: Implement**

```ts
import { S } from '../shared/strings';
import type { RectLike } from './selection';

const MIN_EDGE = 8;

interface Point {
  x: number;
  y: number;
}

export function rectFromDrag(start: Point, end: Point): RectLike {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function startSnip(
  shadow: ShadowRoot,
  onDone: (rect: RectLike | null) => void,
): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'snip-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;cursor:crosshair;background:rgba(17,24,39,.25);';

  const hint = document.createElement('div');
  hint.className = 'toast';
  hint.textContent = S.content.snipHint;

  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;border:2px solid #2563eb;background:rgba(37,99,235,.15);display:none;';

  overlay.append(box);
  shadow.append(overlay, hint);

  let start: Point | null = null;

  function paint(rect: RectLike) {
    box.style.display = 'block';
    box.style.left = `${rect.x}px`;
    box.style.top = `${rect.y}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }

  function finish(rect: RectLike | null) {
    cleanup();
    onDone(rect);
  }

  function onMouseDown(e: MouseEvent) {
    start = { x: e.clientX, y: e.clientY };
  }

  function onMouseMove(e: MouseEvent) {
    if (start) paint(rectFromDrag(start, { x: e.clientX, y: e.clientY }));
  }

  function onMouseUp(e: MouseEvent) {
    if (!start) return;
    const rect = rectFromDrag(start, { x: e.clientX, y: e.clientY });
    finish(rect.width >= MIN_EDGE && rect.height >= MIN_EDGE ? rect : null);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') finish(null);
  }

  function cleanup() {
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseup', onMouseUp, true);
    document.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
    hint.remove();
  }

  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('mouseup', onMouseUp, true);
  document.addEventListener('keydown', onKeyDown, true);

  return () => finish(null);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/content/snip.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/content/snip.ts src/content/snip.test.ts
git commit -m "feat: add drag-select snip overlay for canvas and PDF pages"
```

---

## Task 8: Content script bootstrap

**Files:**
- Modify: `src/content/index.ts` (replaces the Plan 1 spike entirely)
- Create: `src/content/main.ts`
- Modify: `src/manifest.config.ts` (point the content script at `main.ts`)
- Test: `src/content/index.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1, 2, 6, 7; `sendRequest`, `CONTENT_COMMAND`.
- Produces: `shouldRunHere(url)`, `bootstrap()` — both exported, neither self-executing.

`index.ts` exports only. A separate two-line `main.ts` is the manifest entry that actually runs, so importing `index.ts` in a test can never boot a live content script into jsdom. That is cheaper and more honest than guarding on a test-environment flag.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { shouldRunHere } from './index';

describe('shouldRunHere', () => {
  it('runs on ordinary pages', () => {
    expect(shouldRunHere('https://study4.com/tests/1/')).toBe(true);
    expect(shouldRunHere('http://localhost:3000/x')).toBe(true);
  });

  it('refuses browser-internal pages', () => {
    expect(shouldRunHere('chrome://extensions')).toBe(false);
    expect(shouldRunHere('chrome-extension://abc/panel.html')).toBe(false);
    expect(shouldRunHere('about:blank')).toBe(false);
    expect(shouldRunHere('devtools://devtools/bundled/x.html')).toBe(false);
  });

  it('refuses the Chrome Web Store, where extensions cannot inject', () => {
    expect(shouldRunHere('https://chromewebstore.google.com/detail/x')).toBe(false);
    expect(shouldRunHere('https://chrome.google.com/webstore/detail/x')).toBe(false);
  });

  it('refuses the built-in PDF viewer', () => {
    expect(shouldRunHere('https://site.test/paper.pdf')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/content/index.test.ts`
Expected: FAIL — `shouldRunHere is not exported`

- [ ] **Step 3: Implement**

```ts
import { CONTENT_COMMAND, type ContentCommand, sendRequest } from '../shared/messages';
import { getSettings } from '../shared/storage/settings';
import { S } from '../shared/strings';
import { scanImages } from './imageScan';
import {
  anchorFromRects, boundsFromRects, isEligible, rectsOfSelection, selectionTextOf,
} from './selection';
import { startSnip } from './snip';
import { createShadowHost, mountTrigger, showToast } from './trigger';

const EXPAND_TOP = 200;

const BLOCKED_SCHEMES = ['chrome:', 'chrome-extension:', 'about:', 'devtools:', 'view-source:'];

export function shouldRunHere(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (BLOCKED_SCHEMES.includes(url.protocol)) return false;

  // Chrome blocks extension injection on both Web Store hostnames.
  if (url.hostname === 'chromewebstore.google.com') return false;
  if (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore')) return false;

  // The built-in PDF viewer is its own plugin document; the paste flow covers it.
  if (url.pathname.toLowerCase().endsWith('.pdf')) return false;

  return true;
}

export function bootstrap(): void {
  const { shadow } = createShadowHost();
  let minChars = 15;
  let captureImages = true;

  void getSettings().then((s) => {
    minChars = s.minSelectionChars;
    captureImages = s.captureImages;
  });

  const trigger = mountTrigger(shadow, () => {
    void capture();
    trigger.hide();
  });

  function currentSelectionState() {
    const sel = document.getSelection();
    const text = selectionTextOf(sel);
    return { text, rects: rectsOfSelection(sel) };
  }

  async function capture(): Promise<void> {
    const { text, rects } = currentSelectionState();
    if (!isEligible(text, minChars)) return;

    const bounds = boundsFromRects(rects, EXPAND_TOP);
    const imageRefs =
      captureImages && bounds
        ? scanImages(bounds).map(({ kind, src }) => ({ kind, src }))
        : [];

    const res = await sendRequest('CAPTURE_SELECTION', {
      rawText: text.trim(),
      imageRefs,
      bounds,
      dpr: window.devicePixelRatio || 1,
      sourceUrl: location.href,
      sourceTitle: document.title,
    });

    if (!res.ok || !res.data.panelOpened) {
      showToast(shadow, S.content.openPanelManually);
    }
  }

  function refresh(): void {
    const { text, rects } = currentSelectionState();
    if (!isEligible(text, minChars)) {
      trigger.hide();
      return;
    }
    const anchor = anchorFromRects(rects);
    if (anchor) trigger.show(anchor);
    else trigger.hide();
  }

  document.addEventListener('mouseup', () => setTimeout(refresh, 0));
  document.addEventListener('scroll', () => trigger.hide(), true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') trigger.hide();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    const command = (msg as Record<string, ContentCommand>)?.[CONTENT_COMMAND];
    if (command?.type !== 'startSnip') return;

    startSnip(shadow, (rect) => {
      if (!rect) return;
      void sendRequest('SNIP_RESULT', { bounds: rect, dpr: window.devicePixelRatio || 1 });
    });
  });
}
```

Note there is **no** call to `bootstrap()` in this file. That is deliberate — see the next step.

- [ ] **Step 4: Create the entry point `src/content/main.ts`**

```ts
import { bootstrap, shouldRunHere } from './index';

if (shouldRunHere(location.href)) bootstrap();
```

- [ ] **Step 5: Point the manifest at it**

In `src/manifest.config.ts`, change the content script entry:

```ts
  content_scripts: [
    { matches: ['<all_urls>'], js: ['src/content/main.ts'], run_at: 'document_idle' },
  ],
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `npx vitest run src/content/index.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 7: Commit**

```bash
git add src/content/index.ts src/content/main.ts src/content/index.test.ts src/manifest.config.ts
git commit -m "feat: wire the content script bootstrap for selection capture and snipping

index.ts exports only; main.ts is the manifest entry that runs, so importing
the module in a test cannot boot a live content script."
```

---

## Task 9: Side panel handoff and the manual acceptance run

**Files:**
- Modify: `src/sidepanel/App.tsx`
- Modify: `src/sidepanel/views/Paste.tsx` (snip button)
- Modify: `src/shared/strings.ts`
- Test: `src/sidepanel/App.capture.test.tsx`
- Create: `docs/superpowers/plans/plan-2-acceptance.md`

**Interfaces:**
- Consumes: `CLAIM_PENDING_CAPTURE`, `START_SNIP`, `PORT_PANEL`, `PanelEvent`.
- Produces: the completed selection flow.

- [ ] **Step 1: Add the strings**

```ts
  paste: {
    // …existing keys…
    snip: 'Chụp vùng',
    sniping: 'Đang chờ khoanh vùng…',
  },
```

- [ ] **Step 2: Write the failing test**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { installChromeMock } from '../test/chromeMock';
import { DEFAULT_SETTINGS, saveSettings } from '../shared/storage/settings';
import { S } from '../shared/strings';

const sendRequest = vi.fn();
vi.mock('../shared/messages', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sendRequest: (...a: unknown[]) => sendRequest(...a),
}));

const { App } = await import('./App');
const mock = installChromeMock();

let emit: (e: unknown) => void = () => {};

beforeEach(async () => {
  mock.reset();
  sendRequest.mockReset();
  await saveSettings({ ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k', model: 'm' } });
  (globalThis as any).chrome.runtime.connect = () => ({
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: (fn: (e: unknown) => void) => { emit = fn; } },
    onDisconnect: { addListener: vi.fn() },
  });
});

const questions = [{ id: 'q1', sessionId: 's1', order: 1, stem: 'Q', choices: [], imageIds: [] }];

describe('side panel capture handoff', () => {
  it('claims a pending capture on mount and parses it straight away', async () => {
    sendRequest.mockImplementation(async (type: string) => {
      if (type === 'CLAIM_PENDING_CAPTURE') {
        return { ok: true, data: { capture: {
          rawText: '101. The manager ___', images: [],
          sourceUrl: 'https://site', sourceTitle: 'Site',
        } } };
      }
      return { ok: true, data: { sessionId: 's1', questions, visionSkipped: false } };
    });

    render(<App />);

    await waitFor(() =>
      expect(sendRequest).toHaveBeenCalledWith('PARSE_TEXT', expect.objectContaining({
        rawText: '101. The manager ___',
        origin: 'selection',
        sourceUrl: 'https://site',
      })));
    expect(await screen.findByText(S.review.title)).toBeInTheDocument();
  });

  it('shows the paste view when there is nothing pending', async () => {
    sendRequest.mockResolvedValue({ ok: true, data: { capture: null } });
    render(<App />);
    expect(await screen.findByPlaceholderText(S.paste.placeholder)).toBeInTheDocument();
  });

  it('reacts to a capture that arrives while the panel is already open', async () => {
    sendRequest.mockResolvedValue({ ok: true, data: { capture: null } });
    render(<App />);
    await screen.findByPlaceholderText(S.paste.placeholder);

    sendRequest.mockImplementation(async (type: string) =>
      type === 'CLAIM_PENDING_CAPTURE'
        ? { ok: true, data: { capture: { rawText: 'later', images: [], sourceUrl: '', sourceTitle: '' } } }
        : { ok: true, data: { sessionId: 's1', questions, visionSkipped: false } });

    emit({ type: 'pendingCapture' });

    await waitFor(() =>
      expect(sendRequest).toHaveBeenCalledWith('PARSE_TEXT', expect.objectContaining({ rawText: 'later' })));
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/sidepanel/App.capture.test.tsx`
Expected: FAIL — no `CLAIM_PENDING_CAPTURE` call is made

- [ ] **Step 4: Extend `src/sidepanel/App.tsx`**

Replace the `useEffect` and add capture handling. The rest of the state machine from Plan 1 is unchanged:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { PORT_PANEL, type PanelEvent, sendRequest } from '../shared/messages';
import { getSettings, isConfigured } from '../shared/storage/settings';
import type { ImageInput, Question, QuestionAnalysis } from '../shared/types';
// …the imports from Plan 1 stay as they are…

export function App() {
  const [state, setState] = useState<PanelState>({ view: 'loading' });
  const [snipped, setSnipped] = useState<ImageInput[]>([]);

  const parseCapture = useCallback(async (capture: {
    rawText: string; images: ImageInput[]; sourceUrl: string; sourceTitle: string;
  }) => {
    setState({ view: 'loading' });
    const res = await sendRequest('PARSE_TEXT', {
      rawText: capture.rawText,
      images: capture.images,
      origin: 'selection',
      sourceUrl: capture.sourceUrl,
      sourceTitle: capture.sourceTitle,
    });
    setState(res.ok ? { view: 'review', ...res.data } : { view: 'paste' });
  }, []);

  const claim = useCallback(async () => {
    const res = await sendRequest('CLAIM_PENDING_CAPTURE', {});
    if (res.ok && res.data.capture) {
      await parseCapture(res.data.capture);
      return true;
    }
    return false;
  }, [parseCapture]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const settings = await getSettings();
      if (cancelled) return;
      if (!isConfigured(settings)) {
        setState({ view: 'onboarding' });
        return;
      }
      const claimed = await claim();
      if (!cancelled && !claimed) setState({ view: 'paste' });
    })();

    const port = chrome.runtime.connect({ name: PORT_PANEL });
    port.onMessage.addListener((event: PanelEvent) => {
      if (event.type === 'pendingCapture') void claim();
      if (event.type === 'snipImage') setSnipped((s) => [...s, event.image]);
    });

    return () => {
      cancelled = true;
      port.disconnect();
    };
  }, [claim]);

  switch (state.view) {
    case 'loading':
      return null;
    case 'onboarding':
      return <Onboarding />;
    case 'paste':
      return <Paste snipped={snipped} onParsed={(p) => setState({ view: 'review', ...p })} />;
    case 'review':
      return (
        <Review
          sessionId={state.sessionId}
          questions={state.questions}
          visionSkipped={state.visionSkipped}
          onAnalyzed={(p) => setState({ view: 'result', ...p })}
        />
      );
    case 'result':
      return (
        <Result
          questions={state.questions}
          analyses={state.analyses}
          answers={state.answers}
          attemptIdByQuestionId={state.attemptIdByQuestionId}
          renderErrorPanel={(questionId, attemptId) => (
            <ErrorPanel questionId={questionId} attemptId={attemptId} />
          )}
          onRestart={() => setState({ view: 'paste' })}
        />
      );
  }
}
```

The only change to the switch is `snipped={snipped}` on the paste branch; everything else is Plan 1's code unchanged.

A parse failure on a claimed capture drops to the paste view rather than a dead end — the raw text is still in the user's clipboard, and Plan 1's `ErrorBanner` already covers the retry path for pastes.

- [ ] **Step 5: Add the snip button to `Paste`**

Add an optional `snipped` prop and a button:

```tsx
export function Paste({
  onParsed, snipped = [],
}: {
  onParsed: (p: ParsedPayload) => void;
  snipped?: ImageInput[];
}) {
  // …existing state…
  const [sniping, setSniping] = useState(false);

  const allImages = [...images, ...snipped];

  async function snip() {
    setSniping(true);
    await sendRequest('START_SNIP', {});
    setSniping(false);
  }
  // …in submit(), send `allImages` instead of `images`…
  // …in the JSX, next to the parse button:
  //   <button className="w-full rounded border px-3 py-2" onClick={() => void snip()}>
  //     {sniping ? S.paste.sniping : S.paste.snip}
  //   </button>
  // …and use allImages.length for the image counter…
}
```

- [ ] **Step 6: Run the whole suite and the type check**

```bash
npm test
npx tsc --noEmit
```

Expected: every suite passes, zero type errors.

- [ ] **Step 7: Build, load and run the manual acceptance checklist**

```bash
npm run build
```

Record results in `docs/superpowers/plans/plan-2-acceptance.md`:

1. Open a real TOEIC practice site. Select a two-question block → the floating button appears just below the end of the selection, not at the start.
2. Scroll → the button disappears. Press Esc → it disappears. Click elsewhere → it disappears.
3. Select a 5-character fragment → no button (below `minSelectionChars`).
4. Click the button → the side panel opens directly (spike PASS) **or** the toast appears and the toolbar icon shows a red dot (spike FAIL). Either way, opening the panel shows the Review screen with the captured questions.
5. Select a Part 1 question whose photo sits **above** the text → the photo reaches the model. Confirm by asking a vision model something only the image answers.
6. Select on a site that renders questions into a `<canvas>` → the screenshot fallback produces a usable image.
7. In the Paste tab, click "Chụp vùng", drag a box → the region is attached; drag a 3-pixel box → nothing is attached; press Esc mid-drag → nothing is attached.
8. On a HiDPI display (or with Chrome zoom at 150%), repeat step 7 → the cropped image matches the region you drew, not an offset or half-size slice. **This is the `devicePixelRatio` check and the most likely thing to be wrong.**
9. Open `chrome://extensions` → no floating button, no console errors.
10. Open a `.pdf` URL → no floating button; the Paste tab plus snip still works.
11. Select a block of 25 questions → the `TOO_MANY` message appears in Vietnamese, and nothing was charged beyond the parse call.
12. In DevTools, inspect the page's network tab → **no image fetch originated from the page context.** All image traffic belongs to the service worker.

Item 8 and item 12 are the two that must not be waved through.

- [ ] **Step 8: Commit**

```bash
git add src/sidepanel src/shared/strings.ts docs/superpowers/plans/plan-2-acceptance.md
git commit -m "feat: complete the selection capture flow end to end

Adds the pending-capture handoff, the snip button and the recorded
acceptance run."
```

---

## What Plan 3 picks up

Plan 3 builds the dashboard: `shared/storage/stats.ts`, `shared/storage/queries.ts`, `ai/prompts/weakness.ts`, the three-tab options shell, History and Stats views, "Retry this question", and JSON export/import. Every store it reads is already populated by Plans 1 and 2.
