/**
 * Playwright Enterprise Kit - Fixtures BrowserStack
 *
 * Gère deux modes d'exécution :
 * - Mode local    : si aucun credential BrowserStack, on exécute en Chromium local.
 * - Mode BS       : une session BrowserStack est créée par test (desktop ou mobile).
 *
 * Usage dans un test :
 *   const { test, expect } = require('../fixtures/test-fixtures');
 *   // ou si vous importez directement depuis la racine :
 *   const { test, expect } = require('../test-fixtures');
 */

const base = require('@playwright/test');
const { chromium } = require('playwright');
const bsConfig = require('./browserstack.config');
const cp = require('child_process');

let sessionCounter = 0;

const isBrowserStackRun = () =>
  Boolean(bsConfig.username && bsConfig.accessKey);

const formatTestName = (testInfo, sessionId) => {
  const titlePath = Array.isArray(testInfo.titlePath)
    ? testInfo.titlePath
    : typeof testInfo.titlePath === 'function'
    ? testInfo.titlePath()
    : [testInfo.title || 'Unknown Test'];

  const testName = titlePath.slice(1).join(' > ');
  return `[${sessionId}] ${testName}`;
};

const sendBrowserStackCommand = async (page, action, args) => {
  const payload = `browserstack_executor: ${JSON.stringify({ action, arguments: args })}`;
  try {
    await page.evaluate(() => {}, payload);
    console.log(`[BrowserStack] ${action} executed`);
  } catch (error) {
    console.warn(`[BrowserStack] ${action} failed: ${error.message}`);
  }
};

const test = base.test.extend({
  /**
   * Override du contexte Playwright.
   * En mode BrowserStack : crée une session distante par test.
   * En mode local : lance Chromium en headless (CI) ou headed.
   */
  context: async ({}, use, testInfo) => {
    if (!isBrowserStackRun()) {
      const isCI = `${process.env.CI}` === 'true';
      console.log('[BrowserStack] No credentials → running locally');
      const browser = await chromium.launch({ headless: isCI });
      const context = await browser.newContext();
      await use(context);
      await context.close();
      await browser.close();
      return;
    }

    const clientPlaywrightVersion = cp
      .execSync('npx playwright --version')
      .toString()
      .trim()
      .split(' ')[1];

    const sessionId = `S${++sessionCounter}`;
    const testName = formatTestName(testInfo, sessionId);

    const baseCaps = {
      project: bsConfig.projectName,
      build: bsConfig.buildName,
      name: testName,
      'browserstack.username': bsConfig.username,
      'browserstack.accessKey': bsConfig.accessKey,
      'browserstack.console': bsConfig.capabilities['browserstack.console'],
      'browserstack.networkLogs': bsConfig.capabilities['browserstack.networkLogs'],
      'browserstack.debug': bsConfig.capabilities['browserstack.debug'],
      'browserstack.video': bsConfig.capabilities['browserstack.video'],
      'browserstack.playwrightVersion': '1.latest',
      'client.playwrightVersion': clientPlaywrightVersion,
    };

    const isMobile = Boolean(bsConfig.capabilities.device);

    const caps = isMobile
      ? {
          ...baseCaps,
          device: bsConfig.capabilities.device,
          os_version: bsConfig.capabilities.osVersion,
          browser: bsConfig.capabilities.browser,
        }
      : {
          ...baseCaps,
          os: bsConfig.capabilities.os,
          os_version: bsConfig.capabilities.osVersion,
          browser: bsConfig.capabilities.browser,
          browser_version: bsConfig.capabilities.browserVersion,
        };

    const wsEndpoint = `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(
      JSON.stringify(caps)
    )}`;

    let browser;
    let context;

    try {
      console.log(`[BrowserStack] Connecting session ${sessionId} for: ${testInfo.title}`);
      browser = await chromium.connect({ wsEndpoint });

      const contexts = browser.contexts();
      const contextOptions = testInfo.project.use || {};
      context =
        contexts.length > 0
          ? contexts[0]
          : await browser.newContext(contextOptions);

      await use(context);

      // Mise à jour du statut dans le dashboard BrowserStack
      console.log(`[BrowserStack] Session ${sessionId} finished: ${testInfo.status}`);
      const pages = context.pages();
      if (pages.length > 0 && !pages[0].isClosed()) {
        const page = pages[0];
        const isExpected =
          testInfo.status === 'passed' || testInfo.status === testInfo.expectedStatus;
        const status = isExpected ? 'passed' : 'failed';
        const reason =
          testInfo.error?.message?.slice(0, 250) ||
          (status === 'passed' ? 'Test passed successfully' : `Test ${testInfo.status}`);

        await sendBrowserStackCommand(page, 'setSessionStatus', { status, reason });
        await page.waitForTimeout(500);
      }
    } catch (error) {
      console.error(`[BrowserStack] Error in session ${sessionId}: ${error.message}`);
      throw new Error(`BrowserStack connection failed: ${error.message}`);
    } finally {
      if (context) {
        try { await context.close(); } catch (e) { console.warn(`Context close error: ${e.message}`); }
      }
      if (browser) {
        try { await browser.close(); } catch (e) { console.warn(`Browser close error: ${e.message}`); }
      }
    }
  },

  /* Override de page : utilise la première page du contexte */
  page: async ({ context }, use) => {
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();
    await use(page);
  },
});

module.exports = { test, expect: base.expect };
