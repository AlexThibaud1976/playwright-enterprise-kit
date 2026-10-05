/**
 * Playwright Enterprise Kit - Generic cloud grid configuration
 *
 * For grids that open one remote session per test with vendor capabilities
 * (LambdaTest today, any grid added through integrations/ tomorrow).
 * The browser/OS is chosen by the grid's own variables (e.g. LT_BROWSER,
 * LT_PLATFORM), so a single project is declared here.
 *
 * BrowserStack keeps its dedicated playwright.config.browserstack.js.
 *
 * Usage: PEK_GRID=lambdatest npx playwright test --config=playwright.config.grid.js
 *        (or npm run test:grid)
 */

const { defineConfig } = require('@playwright/test');
const { resolveGrid } = require('./integrations');

const grid = resolveGrid();
const workers = parseInt(process.env.PEK_GRID_WORKERS || '2', 10);

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: workers > 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers,

  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
    ['@xray-app/playwright-junit-reporter', {
      outputFile: 'xray-report.xml',
      embedAnnotationsAsProperties: true,
      embedTestrunAnnotationsAsItemProperties: true,
      embedAttachmentsAsProperty: 'testrun_evidence',
      textContentAnnotations: ['test_description', 'testrun_comment'],
    }],
    ...(process.env.GITHUB_ACTIONS
      ? [['@estruyf/github-actions-reporter', {
          title: `Playwright Test Results - ${grid.label || grid.name}`,
          useDetails: true,
          showError: true,
          showTags: true,
        }]]
      : []),
  ],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: null,
  },

  timeout: 90000,
  expect: { timeout: 10000 },

  projects: [{ name: grid.name }],
});
