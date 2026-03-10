/**
 * Playwright Enterprise Kit - Fixture selector
 *
 * Automatically selects fixtures based on the environment:
 * - If BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY are defined → BrowserStack fixtures
 * - Otherwise → standard Playwright fixtures
 *
 * Usage in your tests:
 *   const { test, expect } = require('../../test-fixtures');
 */

const base = require('@playwright/test');
const bsFixtures = require('./browserstack-fixtures');

if (process.env.BROWSERSTACK_USERNAME && process.env.BROWSERSTACK_ACCESS_KEY) {
  module.exports = bsFixtures;
} else {
  module.exports = { test: base.test, expect: base.expect };
}
