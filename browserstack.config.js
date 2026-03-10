/**
 * Playwright Enterprise Kit - Centralized BrowserStack configuration
 *
 * All parameters are injected via environment variables.
 * Locally, copy .env.browserstack.example → .env.browserstack and fill in the values.
 * In CI, configure the corresponding GitHub Actions secrets.
 *
 * Environment variables:
 *   BROWSERSTACK_USERNAME    - BrowserStack username (required)
 *   BROWSERSTACK_ACCESS_KEY  - BrowserStack access key (required)
 *   BS_OS                    - Operating system (e.g. Windows, OS X)
 *   BS_OS_VERSION            - OS version (e.g. 11, Monterey, Sonoma)
 *   BS_BROWSER               - Browser (e.g. chrome, firefox, safari, edge)
 *   BS_BROWSER_VERSION       - Browser version (e.g. latest, 131)
 *   BS_DEVICE                - Mobile device name (leave empty for desktop)
 *   BS_WORKERS               - Number of parallel workers (default: 5)
 *   BS_RUN_IN_ORDER          - Sequential execution (default: true)
 *   BROWSERSTACK_BUILD_NAME  - Build name (auto-generated if not set)
 */

const runInOrder = process.env.BS_RUN_IN_ORDER !== 'false';
const requestedWorkers = parseInt(process.env.BS_WORKERS || '5', 10);
const now = new Date();

const isMobile = Boolean(process.env.BS_DEVICE);

const capabilities = isMobile
  ? {
      // Mobile (ex: iPhone 15 Pro Max, Samsung Galaxy S23)
      device: process.env.BS_DEVICE,
      osVersion: process.env.BS_OS_VERSION || '17',
      browser: process.env.BS_BROWSER || 'safari',
      'browserstack.console': 'info',
      'browserstack.networkLogs': 'true',
      'browserstack.debug': 'true',
      'browserstack.video': 'true',
    }
  : {
      // Desktop
      os: process.env.BS_OS || 'Windows',
      osVersion: process.env.BS_OS_VERSION || '11',
      browser: process.env.BS_BROWSER || 'chrome',
      browserVersion: process.env.BS_BROWSER_VERSION || 'latest',
      'browserstack.console': 'info',
      'browserstack.networkLogs': 'true',
      'browserstack.debug': 'true',
      'browserstack.video': 'true',
    };

module.exports = {
  username: process.env.BROWSERSTACK_USERNAME,
  accessKey: process.env.BROWSERSTACK_ACCESS_KEY,
  runInOrder,
  buildName:
    process.env.BROWSERSTACK_BUILD_NAME ||
    `Enterprise Kit - ${now.toISOString().split('T')[0]} ${now.toTimeString().slice(0, 5)}`,
  // Project name displayed in the BrowserStack dashboard - customize as needed
  projectName: process.env.BS_PROJECT_NAME || 'Playwright Enterprise Kit',
  testObservability: true,
  capabilities,
  workers: runInOrder ? 5 : requestedWorkers,
  timeout: 90000,
  retries: 0,
};
