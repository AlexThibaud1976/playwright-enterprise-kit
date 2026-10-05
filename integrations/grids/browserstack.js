/**
 * Grid: BrowserStack Automate - thin adapter around the historical kit files.
 *
 * Nothing BrowserStack-specific lives here: the real logic stays in
 * browserstack-fixtures.js, browserstack.config.js, playwright.config.browserstack.js
 * and scripts/*browserstack*.js, which are unchanged. This adapter only tells the
 * registry when BrowserStack is available and how to describe the target.
 */
module.exports = {
  kind: 'grid',
  name: 'browserstack',
  label: 'BrowserStack Automate',
  description: 'Remote desktop/mobile browsers on BrowserStack (one session per test).',
  docs: 'https://www.browserstack.com/docs/automate/playwright',
  env: {
    required: ['BROWSERSTACK_USERNAME', 'BROWSERSTACK_ACCESS_KEY'],
    optional: ['BS_OS', 'BS_OS_VERSION', 'BS_BROWSER', 'BS_BROWSER_VERSION', 'BS_DEVICE', 'BS_WORKERS', 'BROWSERSTACK_BUILD_NAME', 'BS_PROJECT_NAME'],
  },
  playwrightConfig: 'playwright.config.browserstack.js',
  createFixtures() {
    return require('../../browserstack-fixtures');
  },
  describeTarget(env) {
    return {
      os: env.BS_DEVICE ? env.BS_DEVICE : env.BS_OS || 'Windows',
      osVersion: env.BS_OS_VERSION || '11',
      browser: env.BS_BROWSER || 'chrome',
      browserVersion: env.BS_BROWSER_VERSION || 'latest',
      deviceName: env.DEVICE_NAME || null,
    };
  },
};
