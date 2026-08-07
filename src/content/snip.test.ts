import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createShadowHost } from './trigger';
import { rectFromDrag, startSnip } from './snip';
beforeEach(() => { document.body.innerHTML = ''; });

describe('rectFromDrag', () => {
  it('normalises a top-left to bottom-right drag', () => { expect(rectFromDrag({ x: 10, y: 20 }, { x: 110, y: 220 })).toEqual({ x: 10, y: 20, width: 100, height: 200 }); });
  it('normalises a drag made in reverse', () => { expect(rectFromDrag({ x: 110, y: 220 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 100, height: 200 }); });
  it('yields a zero rect for a click without movement', () => { expect(rectFromDrag({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5, width: 0, height: 0 }); });
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
