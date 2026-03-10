import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Enterprise Kit - Main configuration
 *
 * Available environment variables:
 *   BASE_URL       - Application URL to test (required in production)
 *   HEADLESS       - Headless mode (true/false, default: true in CI)
 *   TEST_TIMEOUT   - Global test timeout in ms (default: 60000)
 *   CI             - Automatically detected by GitHub Actions
 */
export default defineConfig({
  testDir: './tests',

  /* Execution order */
  testOrder: 'file',

  /* Disable parallelism by default (enable as needed) */
  fullyParallel: false,

  /* Forbid .only() in CI */
  forbidOnly: !!process.env.CI,

  /* Retries automatiques en CI */
  retries: process.env.CI ? 2 : 0,

  /* Number of workers */
  workers: process.env.CI ? 4 : 2,

  /* Reporters */
  reporter: [
    ['html'],
    ['list'],
    ['@xray-app/playwright-junit-reporter', {
      outputFile: 'xray-report.xml',
      embedAnnotationsAsProperties: true,
      embedTestrunAnnotationsAsItemProperties: true,
      embedAttachmentsAsProperty: 'testrun_evidence',
      textContentAnnotations: ['test_description', 'testrun_comment'],
      // Exclude test_key to avoid errors when tests do not yet exist in Jira
      annotationsToExclude: ['test_key'],
    }],
    // GitHub Actions visual summary (auto-enabled in CI)
    ...(process.env.GITHUB_ACTIONS
      ? [['@estruyf/github-actions-reporter', {
          title: 'Playwright Test Results',
          useDetails: true,
          showError: true,
          showTags: true,
        }] as const]
      : []),
  ],

  use: {
    /* Base URL - configurable via environment variable */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    /* Traces, screenshots, videos */
    trace: 'on-first-retry',
    screenshot: {
      mode: 'only-on-failure',
      fullPage: true,
    },
    video: 'retain-on-failure',

    /* Mode headless */
    headless: process.env.HEADLESS !== 'false',
  },

  /* Timeouts */
  timeout: Number(process.env.TEST_TIMEOUT) || 60000,
  expect: {
    timeout: 10000,
  },

  /* Projets (navigateurs) */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
