/**
 * Playwright Enterprise Kit - integration selection (optional file).
 *
 * Every value can also be set with an environment variable, which WINS over
 * this file: PEK_GRID, PEK_TEST_MANAGEMENT, PEK_PUBLISHERS, PEK_PLUGINS.
 *
 *   'auto'  every provider whose credentials are present (default, = historical behaviour)
 *   'none'  disable the kind entirely
 *   [...]   explicit list of provider names
 *
 * Built-in providers (see docs/integrations.md, or run `npm run pek:doctor`):
 *   grid             local, browserstack, lambdatest, remote
 *   testManagement   xray, zephyr-scale, testrail, qase
 *   publishers       github-summary, confluence, slack, teams, webhook
 */
module.exports = {
  grid: 'auto',
  testManagement: 'auto',
  publishers: 'auto',

  // Your own providers (paths relative to the kit root). Template:
  // integrations/_template/custom-publisher.js
  plugins: [],
};
