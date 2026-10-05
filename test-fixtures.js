/**
 * Playwright Enterprise Kit - Fixture selector
 *
 * Picks the fixtures of the active execution grid (see integrations/index.js):
 * - PEK_GRID / pek.config.js `grid` when set explicitly
 * - otherwise 'auto': BrowserStack if BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY
 *   are defined, then LambdaTest (LT_USERNAME / LT_ACCESS_KEY), then a remote
 *   Playwright server (PEK_WS_ENDPOINT), else standard local Playwright fixtures.
 *
 * Without any of these variables the behaviour is exactly the historical one:
 * BrowserStack credentials -> BrowserStack fixtures, none -> @playwright/test.
 *
 * Usage in your tests:
 *   import { test, expect } from '../../test-fixtures';        // TypeScript
 *   const { test, expect } = require('../../test-fixtures');   // JavaScript
 */

const { resolveGrid } = require('./integrations');

const grid = resolveGrid();
module.exports = grid.createFixtures();
