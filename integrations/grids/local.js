/**
 * Grid: local - browsers launched on the current machine by Playwright itself.
 * Default when no remote grid is configured. Uses the stock @playwright/test
 * fixtures, so every project of playwright.config.ts (chromium, firefox,
 * webkit) behaves exactly as in a vanilla Playwright project.
 */
module.exports = {
  kind: 'grid',
  name: 'local',
  label: 'Local browsers',
  description: 'Runs the browsers installed by `npx playwright install` on this machine (default).',
  docs: 'https://playwright.dev/docs/browsers',
  env: { required: [], optional: ['BASE_URL', 'HEADLESS'] },
  playwrightConfig: 'playwright.config.ts',
  isConfigured: () => true,
  createFixtures() {
    const base = require('@playwright/test');
    return { test: base.test, expect: base.expect };
  },
  describeTarget() {
    return {};
  },
};
