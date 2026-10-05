const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { createRegistry } = require('..');

const ROOT = path.resolve(__dirname, '..', '..');
const reg = (env, config = {}) => createRegistry({ env, rootDir: ROOT, config });

test('no credentials -> local grid, no integration (standalone mode)', () => {
  const r = reg({});
  assert.strictEqual(r.resolveGrid().name, 'local');
  assert.deepStrictEqual(r.resolveList('test-management'), []);
  assert.deepStrictEqual(r.resolveList('publisher'), []);
});

test('backward compatibility: BrowserStack credentials -> browserstack grid + historical fixtures', () => {
  const grid = reg({ BROWSERSTACK_USERNAME: 'u', BROWSERSTACK_ACCESS_KEY: 'k' }).resolveGrid();
  assert.strictEqual(grid.name, 'browserstack');
  assert.strictEqual(grid.createFixtures(), require('../../browserstack-fixtures'));
});

test('auto grid priority: browserstack > lambdatest > remote > local', () => {
  assert.strictEqual(reg({ LT_USERNAME: 'u', LT_ACCESS_KEY: 'k', PEK_WS_ENDPOINT: 'ws://x' }).resolveGrid().name, 'lambdatest');
  assert.strictEqual(reg({ PEK_WS_ENDPOINT: 'ws://x' }).resolveGrid().name, 'remote');
});

test('PEK_GRID wins over credentials and config', () => {
  const env = { PEK_GRID: 'local', BROWSERSTACK_USERNAME: 'u', BROWSERSTACK_ACCESS_KEY: 'k' };
  assert.strictEqual(reg(env, { grid: 'browserstack' }).resolveGrid().name, 'local');
  assert.strictEqual(reg({ PEK_WS_ENDPOINT: 'ws://x' }, { grid: 'remote' }).resolveGrid().name, 'remote');
});

test('explicit grid without its credentials fails with the missing variables', () => {
  assert.throws(() => reg({ PEK_GRID: 'remote' }).resolveGrid(), /missing PEK_WS_ENDPOINT/);
  assert.throws(() => reg({ PEK_GRID: 'lambdatest', LT_USERNAME: 'u' }).resolveGrid(), /missing LT_ACCESS_KEY/);
  assert.match(reg({ PEK_GRID: 'remote' }).describe().gridError, /PEK_WS_ENDPOINT/);
  // publication only describes the grid: CI publish steps don't get grid credentials
  assert.strictEqual(reg({ PEK_GRID: 'browserstack' }).resolveGrid({ requireConfigured: false }).name, 'browserstack');
});

test('unknown grid fails with the list of available grids', () => {
  assert.throws(() => reg({ PEK_GRID: 'nope' }).resolveGrid(), /Available: local, browserstack, lambdatest, remote/);
});

test('auto lists only configured providers', () => {
  const r = reg({ SLACK_WEBHOOK_URL: 'https://hooks.slack.com/x', XRAY_CLIENT_ID: 'a', XRAY_CLIENT_SECRET: 'b', JIRA_PROJECT_KEY: 'P' });
  assert.deepStrictEqual(r.resolveList('test-management').map((p) => p.name), ['xray']);
  assert.deepStrictEqual(r.resolveList('publisher').map((p) => p.name), ['slack']);
});

test('explicit lists, none and exclude', () => {
  const r = reg({ PEK_PUBLISHERS: 'teams,webhook', PEK_TEST_MANAGEMENT: 'none', SLACK_WEBHOOK_URL: 'x' });
  assert.deepStrictEqual(r.resolveList('publisher').map((p) => p.name), ['teams', 'webhook']);
  assert.deepStrictEqual(r.resolveList('test-management'), []);
  assert.deepStrictEqual(r.resolveList('publisher', { exclude: ['teams'] }).map((p) => p.name), ['webhook']);
  assert.throws(() => reg({ PEK_PUBLISHERS: 'carrier-pigeon' }).resolveList('publisher'), /Unknown publisher/);
});

test('plugins are loaded and can be selected', () => {
  const r = reg({ PEK_PUBLISHERS: 'my-tool' }, { plugins: ['./integrations/_template/custom-publisher.js'] });
  assert.deepStrictEqual(r.resolveList('publisher').map((p) => p.name), ['my-tool']);
  assert.ok(r.describe().providers.some((p) => p.name === 'my-tool' && !p.configured));
});

test('invalid plugin is rejected with a clear message', () => {
  assert.throws(
    () => reg({}, { plugins: ['./integrations/__tests__/fixture-junit.xml'] }),
    /./
  );
});
