import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { blobToBase64, cropBox, fetchImageBlob, fitWithin } from './capture';
const server = setupServer(
  http.get('https://site.test/photo.jpg', () => HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3]).buffer, { headers: { 'Content-Type': 'image/jpeg' } })),
  http.get('https://site.test/missing.jpg', () => HttpResponse.text('gone', { status: 404 })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('cropBox', () => {
  it('scales CSS pixels to device pixels', () => { expect(cropBox({ x: 10, y: 20, width: 100, height: 50 }, 2)).toEqual({ sx: 20, sy: 40, sw: 200, sh: 100 }); });
  it('is a no-op at dpr 1', () => { expect(cropBox({ x: 10, y: 20, width: 100, height: 50 }, 1)).toEqual({ sx: 10, sy: 20, sw: 100, sh: 50 }); });
  it('rounds to whole device pixels', () => { expect(cropBox({ x: 10.4, y: 20.6, width: 100.5, height: 50.5 }, 1.5)).toEqual({ sx: 16, sy: 31, sw: 151, sh: 76 }); });
});

describe('fitWithin', () => {
  it('leaves an already-small image alone', () => { expect(fitWithin(800, 600, 1024)).toEqual({ width: 800, height: 600 }); });
  it('scales the long edge down and keeps the aspect ratio', () => {
    expect(fitWithin(2048, 1024, 1024)).toEqual({ width: 1024, height: 512 });
    expect(fitWithin(1024, 2048, 1024)).toEqual({ width: 512, height: 1024 });
  });
});

describe('blobToBase64', () => {
  it('encodes bytes without a data-URI prefix', async () => { expect(await blobToBase64(new Blob([new Uint8Array([65, 66, 67])]))).toBe('QUJD'); });
});

describe('fetchImageBlob', () => {
  it('fetches a cross-origin image and preserves its type', async () => { expect((await fetchImageBlob('https://site.test/photo.jpg'))?.type).toBe('image/jpeg'); });
  it('returns null on a failed fetch instead of throwing', async () => { expect(await fetchImageBlob('https://site.test/missing.jpg')).toBeNull(); });
  it('decodes a data URI without any network call', async () => {
    const blob = await fetchImageBlob('data:image/png;base64,QUJD');
    expect(blob?.type).toBe('image/png');
    expect(await blobToBase64(blob!)).toBe('QUJD');
  });
});
