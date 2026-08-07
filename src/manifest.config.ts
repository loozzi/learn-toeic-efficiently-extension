import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'IMEN — TOEIC practice assistant',
  version: '0.1.0',
  minimum_chrome_version: '116',
  action: { default_title: 'IMEN' },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  side_panel: { default_path: 'src/sidepanel/index.html' },
  options_page: 'src/app/index.html',
  content_scripts: [
    { matches: ['<all_urls>'], js: ['src/content/index.ts'], run_at: 'document_idle' },
  ],
  permissions: ['storage', 'sidePanel', 'activeTab', 'scripting', 'unlimitedStorage'],
  host_permissions: ['<all_urls>'],
  icons: { 128: 'public/icon-128.png' },
});
