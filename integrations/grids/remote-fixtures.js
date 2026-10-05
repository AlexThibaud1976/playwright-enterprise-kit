/**
 * Generic "one remote session per test" fixtures, shared by cloud grids that
 * need per-test capabilities (test name, build...) in the connection URL.
 * Same lifecycle as browserstack-fixtures.js, but vendor-neutral: the grid
 * provider supplies wsEndpoint(), browserType() and markStatus().
 *
 * Provider contract used here:
 *   wsEndpoint({ env, testInfo, testName, buildName }) -> string   (required)
 *   browserType(env) -> 'chromium' | 'firefox' | 'webkit'           (optional, default chromium)
 *   buildName(env) -> string                                        (optional)
 *   markStatus(page, { status, reason })                            (optional)
 */
const base = require('@playwright/test');

function createRemoteFixtures(provider) {
  const env = process.env;
  const buildName = typeof provider.buildName === 'function' ? provider.buildName(env) : 'Playwright Enterprise Kit';
  let sessionCounter = 0;
  const tag = `[${provider.label || provider.name}]`;

  const test = base.test.extend({
    context: async ({}, use, testInfo) => {
      const playwright = require('playwright');
      const typeName = typeof provider.browserType === 'function' ? provider.browserType(env) : 'chromium';
      const browserType = playwright[typeName] || playwright.chromium;
      const sessionId = `S${++sessionCounter}`;
      const testName = `[${sessionId}] ${testInfo.titlePath.slice(1).join(' > ')}`;
      const wsEndpoint = provider.wsEndpoint({ env, testInfo, testName, buildName });

      let browser;
      let context;
      try {
        console.log(`${tag} Connecting session ${sessionId} for: ${testInfo.title}`);
        browser = await browserType.connect({ wsEndpoint });
        context = browser.contexts()[0] || (await browser.newContext(testInfo.project.use || {}));

        await use(context);

        const page = context.pages()[0];
        if (page && !page.isClosed() && typeof provider.markStatus === 'function') {
          const ok = testInfo.status === 'passed' || testInfo.status === testInfo.expectedStatus;
          const reason =
            testInfo.error?.message?.slice(0, 250) || (ok ? 'Test passed successfully' : `Test ${testInfo.status}`);
          try {
            await provider.markStatus(page, { status: ok ? 'passed' : 'failed', reason });
          } catch (e) {
            console.warn(`${tag} markStatus failed: ${e.message}`);
          }
        }
      } catch (error) {
        throw new Error(`${tag} connection failed: ${error.message}`);
      } finally {
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
      }
    },

    page: async ({ context }, use) => {
      const page = context.pages()[0] || (await context.newPage());
      await use(page);
    },
  });

  return { test, expect: base.expect };
}

module.exports = { createRemoteFixtures };
