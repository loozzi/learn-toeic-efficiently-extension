import { S } from '../shared/strings';
import type { RectLike } from './selection';
import { getSurface } from './trigger';

const MIN_EDGE = 8;

interface Point { x: number; y: number }

export function rectFromDrag(start: Point, end: Point): RectLike {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}

export function startSnip(shadow: ShadowRoot, onDone: (rect: RectLike | null) => void): () => void {
  const surface = getSurface(shadow);
  const overlay = document.createElement('div');
  overlay.className = 'snip-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;cursor:crosshair;background:rgba(17,24,39,.25);';

  const hint = document.createElement('div');
  hint.className = 'toast';
  hint.textContent = S.content.snipHint;

  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;border:2px solid #2563eb;background:rgba(37,99,235,.15);display:none;';

  overlay.append(box);
  surface.append(overlay, hint);

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

  function onMouseDown(event: MouseEvent) { start = { x: event.clientX, y: event.clientY }; }

  function onMouseMove(event: MouseEvent) {
    if (start) paint(rectFromDrag(start, { x: event.clientX, y: event.clientY }));
  }

  function onMouseUp(event: MouseEvent) {
    if (!start) return;
    const rect = rectFromDrag(start, { x: event.clientX, y: event.clientY });
    finish(rect.width >= MIN_EDGE && rect.height >= MIN_EDGE ? rect : null);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') finish(null);
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
