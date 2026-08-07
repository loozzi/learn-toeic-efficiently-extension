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
    expect(createShadowHost().shadow).toBeInstanceOf(ShadowRoot);
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
    mountTrigger(shadow, vi.fn()).show({ x: 120, y: 340 });
    const button = shadow.querySelector('button')!;
    expect(button).toBeTruthy();
    expect((button.parentElement as HTMLElement).style.left).toBe('120px');
    expect((button.parentElement as HTMLElement).style.top).toBe('344px');
  });

  it('invokes the callback on click', () => {
    const { shadow } = createShadowHost();
    const onClick = vi.fn();
    mountTrigger(shadow, onClick).show({ x: 0, y: 0 });
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
    mountTrigger(shadow, vi.fn()).show({ x: 0, y: 0 });
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
