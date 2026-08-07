import type { RectLike } from '../content/selection';
import type { ImageRef } from '../content/imageScan';
import type { ImageInput } from '../shared/types';

const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.8;
const MAX_IMAGES = 3;

export interface CropBox { sx: number; sy: number; sw: number; sh: number }

/** captureVisibleTab returns device pixels; selection rects are CSS pixels. */
export function cropBox(bounds: RectLike, dpr: number): CropBox {
  return { sx: Math.round(bounds.x * dpr), sy: Math.round(bounds.y * dpr), sw: Math.round(bounds.width * dpr), sh: Math.round(bounds.height * dpr) };
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

/** Decoded here rather than fetched: a data URI carries its own bytes. */
function dataUriToBlob(src: string): Blob | null {
  const comma = src.indexOf(',');
  if (comma === -1) return null;

  const meta = src.slice('data:'.length, comma);
  const body = src.slice(comma + 1);
  const mime = meta.replace(/;base64$/i, '').split(';')[0] || 'application/octet-stream';

  try {
    if (!/;base64$/i.test(meta)) return new Blob([decodeURIComponent(body)], { type: mime });
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

export async function fetchImageBlob(src: string): Promise<Blob | null> {
  if (src.startsWith('data:')) return dataUriToBlob(src);
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

/** Downscale and re-encode so a screenshot does not blow the token budget. */
export async function normaliseImage(blob: Blob): Promise<ImageInput> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);

  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  return { mime: 'image/jpeg', dataBase64: await blobToBase64(out) };
}

export async function resolveImageRefs(refs: ImageRef[]): Promise<ImageInput[]> {
  const images: ImageInput[] = [];
  for (const ref of refs.slice(0, MAX_IMAGES)) {
    const blob = await fetchImageBlob(ref.src);
    if (!blob) continue;
    try {
      images.push(await normaliseImage(blob));
    } catch {
      // Undecodable (SVG without intrinsic size, corrupt bytes). Skip it —
      // the screenshot fallback covers the case where nothing resolves.
    }
  }
  return images;
}

export async function captureRegion(tabId: number, bounds: RectLike, dpr: number): Promise<ImageInput | null> {
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
