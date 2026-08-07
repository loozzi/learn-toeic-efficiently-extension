import { describe, expect, it } from 'vitest';
import defined from './manifest.config';

// defineManifest widens to ManifestV3Export, a union that also allows a function
// or a promise. This project always passes a plain object, so narrow once here.
const manifest = defined as Extract<typeof defined, { manifest_version: unknown }>;

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
