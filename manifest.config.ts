import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'modaicom',
  version: '0.1.0',
  description: 'AI-assisted LinkedIn responses with the user in control.',
  permissions: ['activeTab', 'scripting', 'storage'],
  host_permissions: ['https://linkedin.com/*', 'https://www.linkedin.com/*'],
  background: { service_worker: 'src/background/serviceWorker.ts', type: 'module' },
  content_scripts: [
    {
      matches: ['https://linkedin.com/*', 'https://www.linkedin.com/*'],
      js: ['src/content/inlineTrigger.ts'],
      run_at: 'document_idle',
    },
  ],
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_title: 'modaicom',
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
    },
  },
})
