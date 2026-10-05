/**
 * Grid: LambdaTest (TestMu AI) - Playwright over CDP.
 *
 * Reference: https://www.lambdatest.com/support/docs/playwright-testing/
 *   wss://cdp.lambdatest.com/playwright?capabilities=<url-encoded JSON>
 *   status: page.evaluate(() => {}, 'lambdatest_action: {"action":"setTestStatus",...}')
 *
 * Run with: npm run test:grid  (PEK_GRID=lambdatest is auto-selected when
 * LT_USERNAME / LT_ACCESS_KEY are set and BrowserStack is not).
 */
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');

function target(env) {
  return {
    platform: env.LT_PLATFORM || 'Windows 11',
    browserName: env.LT_BROWSER || 'Chrome',
    browserVersion: env.LT_BROWSER_VERSION || 'latest',
  };
}

module.exports = {
  kind: 'grid',
  name: 'lambdatest',
  label: 'LambdaTest',
  description: 'Remote browsers on LambdaTest via its Playwright CDP endpoint.',
  docs: 'https://www.lambdatest.com/support/docs/playwright-testing/',
  env: {
    required: ['LT_USERNAME', 'LT_ACCESS_KEY'],
    optional: ['LT_PLATFORM', 'LT_BROWSER', 'LT_BROWSER_VERSION', 'LT_BUILD_NAME', 'LT_PROJECT_NAME'],
  },
  playwrightConfig: 'playwright.config.grid.js',
  // Browsers accepted by LambdaTest: Chrome, MicrosoftEdge, pw-chromium, pw-firefox, pw-webkit
  browserType: (env) => {
    const b = (env.LT_BROWSER || 'Chrome').toLowerCase();
    if (b === 'pw-firefox') return 'firefox';
    if (b === 'pw-webkit') return 'webkit';
    return 'chromium';
  },
  wsEndpoint({ env, testName, buildName }) {
    const t = target(env);
    const capabilities = {
      browserName: t.browserName,
      browserVersion: t.browserVersion,
      'LT:Options': {
        platform: t.platform,
        build: buildName,
        project: env.LT_PROJECT_NAME || 'Playwright Enterprise Kit',
        name: testName,
        user: env.LT_USERNAME,
        accessKey: env.LT_ACCESS_KEY,
        network: true,
        video: true,
        console: true,
      },
    };
    return `wss://cdp.lambdatest.com/playwright?capabilities=${encodeURIComponent(JSON.stringify(capabilities))}`;
  },
  buildName(env) {
    const now = new Date();
    return env.LT_BUILD_NAME || `Enterprise Kit - ${now.toISOString().split('T')[0]} ${now.toTimeString().slice(0, 5)}`;
  },
  async markStatus(page, { status, reason }) {
    const payload = `lambdatest_action: ${JSON.stringify({ action: 'setTestStatus', arguments: { status, remark: reason } })}`;
    await page.evaluate(() => {}, payload);
  },
  dashboardUrl: () => 'https://automation.lambdatest.com/build',
  createFixtures() {
    return require('./remote-fixtures').createRemoteFixtures(module.exports);
  },
  describeTarget(env) {
    const t = target(env);
    return {
      os: t.platform,
      osVersion: null,
      browser: t.browserName,
      browserVersion: t.browserVersion,
      deviceName: slug(`${t.platform}-${t.browserName}-${t.browserVersion}`),
    };
  },
};
