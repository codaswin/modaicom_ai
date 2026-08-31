import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // The inline trigger ships its stylesheet as a `?raw` string applied via
    // adoptedStyleSheets; let that one file through instead of the default CSS
    // stub so tests can assert on it. popup.css / options.css stay stubbed.
    css: { include: [/inlineTrigger\.css/] },
  },
})
