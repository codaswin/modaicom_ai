import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'modaicom',
  version: '1.1.0',
  description: 'AI-assisted LinkedIn responses with the user in control.',
  permissions: ['activeTab', 'storage'],
  host_permissions: ['https://linkedin.com/*', 'https://www.linkedin.com/*'],
  // Requested at runtime from the options page, one host at a time, for the
  // provider being configured (ADR-0008 / ADR-0012). Users who never use AI hold
  // zero provider access. No wildcards; nothing added to host_permissions.
  optional_host_permissions: [
    'https://api.openai.com/*',
    'https://api.groq.com/*',
    'https://api.x.ai/*',
    'https://api.anthropic.com/*',
    'https://generativelanguage.googleapis.com/*',
  ],
  options_ui: { page: 'src/options/index.html', open_in_tab: true },
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
