/**
 * Playwright Enterprise Kit - BrowserStack configuration
 *
 * Uses browserstack-fixtures.js to create one session per test.
 * Inherits capabilities and credentials from browserstack.config.js.
 */

const { defineConfig } = require('@playwright/test');
const bsConfig = require('./browserstack.config');

module.exports = defineConfig({
  testDir: './tests',
  testOrder: 'file',
  fullyParallel: !bsConfig.runInOrder,
  forbidOnly: !!process.env.CI,
  retries: bsConfig.retries,
  workers: bsConfig.workers,

  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
    ['./browserstack-reporter.js'],
    ['@xray-app/playwright-junit-reporter', {
      outputFile: 'xray-report.xml',
      embedAnnotationsAsProperties: true,
      embedTestrunAnnotationsAsItemProperties: true,
      embedAttachmentsAsProperty: 'testrun_evidence',
      textContentAnnotations: ['test_description', 'testrun_comment'],
    }],
    ...(process.env.GITHUB_ACTIONS
      ? [['@estruyf/github-actions-reporter', {
          title: 'Playwright Test Results - BrowserStack',
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
    // null = full-screen viewport on BrowserStack
    viewport: null,
  },

  timeout: bsConfig.timeout,
  expect: {
    timeout: 10000,
  },
});
