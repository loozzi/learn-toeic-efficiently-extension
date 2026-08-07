import { describe, expect, it } from 'vitest';
import manifest from './manifest.config';

describe('manifest', () => {
  it('targets MV3 on Chrome 116+', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe('116');
  });

  it('declares exactly the permissions the spec allows', () => {
    expect(new Set(manifest.permissions)).toEqual(
      new Set(['storage', 'sidePanel', 'activeTab', 'scripting', 'unlimitedStorage']),
    );
    expect(manifest.host_permissions).toEqual(['<all_urls>']);
  });

  it('has no action popup and configures the side panel', () => {
    expect(manifest.action?.default_popup).toBeUndefined();
    expect(manifest.side_panel?.default_path).toBe('src/sidepanel/index.html');
  });
});
