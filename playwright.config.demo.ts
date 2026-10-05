import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Playwright Enterprise Kit - Demo configuration (zero third-party mode)
 *
 * Same settings as playwright.config.ts, but starts the bundled demo app
 * (demo-site/ served by scripts/demo-server.js) and targets it. Used by
 * `npm run test:demo` and by the "Standalone smoke" CI job to prove the kit
 * works without Jira, Confluence, BrowserStack or any other integration.
 */
const PORT = process.env.DEMO_PORT || '4173';

export default defineConfig({
  ...baseConfig,
  webServer: {
    command: 'node scripts/demo-server.js',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  use: { ...baseConfig.use, baseURL: `http://localhost:${PORT}` },
  // Replaces (does not merge with) the base projects: chromium only
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
