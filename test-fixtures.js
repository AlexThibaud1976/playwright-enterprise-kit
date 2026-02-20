/**
 * Playwright Enterprise Kit - Sélecteur de fixtures
 *
 * Sélectionne automatiquement les fixtures en fonction de l'environnement :
 * - Si BROWSERSTACK_USERNAME et BROWSERSTACK_ACCESS_KEY sont définis → fixtures BrowserStack
 * - Sinon → fixtures Playwright standard
 *
 * Usage dans vos tests :
 *   const { test, expect } = require('../../test-fixtures');
 */

const base = require('@playwright/test');
const bsFixtures = require('./browserstack-fixtures');

if (process.env.BROWSERSTACK_USERNAME && process.env.BROWSERSTACK_ACCESS_KEY) {
  module.exports = bsFixtures;
} else {
  module.exports = { test: base.test, expect: base.expect };
}
