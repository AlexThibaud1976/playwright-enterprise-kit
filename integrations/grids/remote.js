/**
 * Grid: remote - any Playwright-compatible WebSocket endpoint.
 *
 * Covers every grid that exposes a `browserType.connect()` endpoint without
 * vendor-specific capabilities: a self-hosted `npx playwright run-server`
 * (or the official mcr.microsoft.com/playwright Docker image), Browserless,
 * Moon, Kubernetes grids, etc.
 *
 * It relies on Playwright's NATIVE `use.connectOptions` (wired in
 * playwright.config.ts), so all projects keep working unchanged.
 *   PEK_WS_ENDPOINT  ws(s)://host:port/...  (required)
 *   PEK_WS_HEADERS   optional JSON object of headers (e.g. auth)
 *
 * Reference: https://playwright.dev/docs/api/class-testoptions#test-options-connect-options
 */
function parseHeaders(raw) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    throw new Error('PEK_WS_HEADERS must be a JSON object, e.g. {"Authorization":"Bearer xxx"}');
  }
}

module.exports = {
  kind: 'grid',
  name: 'remote',
  label: 'Remote Playwright server',
  description: 'Any Playwright WebSocket endpoint (playwright run-server, Docker image, Browserless, Moon...).',
  docs: 'https://playwright.dev/docs/api/class-testoptions#test-options-connect-options',
  env: { required: ['PEK_WS_ENDPOINT'], optional: ['PEK_WS_HEADERS'] },
  playwrightConfig: 'playwright.config.ts',
  connectOptions(env) {
    return { wsEndpoint: env.PEK_WS_ENDPOINT, headers: parseHeaders(env.PEK_WS_HEADERS) };
  },
  createFixtures() {
    const base = require('@playwright/test');
    return { test: base.test, expect: base.expect };
  },
  describeTarget(env) {
    let host = null;
    try {
      host = new URL(env.PEK_WS_ENDPOINT).host;
    } catch {
      /* ignore */
    }
    return { os: null, osVersion: null, browser: null, browserVersion: null, deviceName: host ? `remote-${host}` : 'remote' };
  },
};
