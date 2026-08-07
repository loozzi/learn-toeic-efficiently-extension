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
